// appointment-allocation: manual appointment capture + admin allocation for SortMyCover (Jono, 13 Oct 2026).
// One function, routed by body.action. State changes run in SQL (migration 20261013210000); this function does the side
// effects. Pure logic (ICS, Graph body, texts, lead token): ../_shared/appointment_alloc.ts (node test next to it).
//
//   {action:'request',  windows?, method?, source?, note?}  X-Lead-Token (website) | service role (voice, n8n; body.lead_id)
//        -> appointment_request_upsert(): one open 'requested' appointment per lead, waiting in the CRM queue.
//   {action:'allocate', appointment_id, broker_id, start, duration_minutes?, method, broker_email?, invite_client?}  admin JWT
//        -> appointment_allocate() as the admin (status 'booked', audit_log + timeline), then:
//           broker Outlook connected (calendar_status 'ok') -> Graph event in his calendar (Teams link for Teams calls);
//           otherwise / Graph failed -> .ics invite (METHOD:REQUEST, stable UID) emailed to the confirmed broker email;
//           client -> WhatsApp booking_confirmed (approved template) + optional email with .ics.
//           Re-allocation removes the previous delivery (Graph delete / METHOD:CANCEL to the old address).
//   {action:'cancel',   appointment_id, reason?, notify_client?}  admin JWT -> appointment_cancel() + calendar cancel.
//
// Safety: client sends for leads.is_synthetic are dry runs (recorded, never sent). Broker invites always go to the address the
// admin confirmed. Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, SMC_LEAD_TOKEN_SECRET,
// MS_CLIENT_ID, MS_CLIENT_SECRET, SMC_TWILIO_ACCOUNT_SID, SMC_TWILIO_AUTH_TOKEN.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  brokerInvite, cleanWindows, clientConfirmation, CONFIRM_LABEL, graphEventBody, leadSummary, sastDay, sastTime, verifyLeadToken,
  type InviteContext,
} from "../_shared/appointment_alloc.ts";

const SMC_NUMBER = "+27600156480";
const BOOKING_CONFIRMED_SID = "HXea3cd0796b41eab3c0442a816b0ed435"; // smc_booking_confirmed (UTILITY, approved)
const FROM = "SortMyCover <howzit@leadvelocity.co.za>";
const WORKFLOW = "appointment-allocation";
const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "offline_access User.Read Calendars.ReadWrite OnlineMeetings.ReadWrite";
const METHODS = new Set(["teams", "zoom", "meet", "whatsapp_call", "phone"]);
const INVITE_METHODS = new Set(["teams", "zoom", "meet"]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lead-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (k: string) => Deno.env.get(k) ?? "";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const bad = (status: number, error: string, message: string) => json({ ok: false, error, message }, status);
const service = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}
function isServiceRole(req: Request): boolean {
  const t = bearer(req);
  if (!t) return false;
  if (t === env("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}
/** A client that runs as the caller (auth.uid() in SQL = the admin), so the SQL admin check and the audit see the person. */
function asCaller(req: Request): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer(req)}` } },
  });
}
/** SQL exception -> HTTP answer. */
function sqlError(e: { code?: string; message?: string } | null) {
  const msg = String(e?.message ?? "error").replace(/^appointment_(allocate|cancel|request_upsert):\s*/, "");
  if (e?.code === "42501") return bad(403, "admins_only", "Only admins can do this.");
  if (e?.code === "23P01") return bad(409, "slot_taken", msg);
  if (e?.code === "P0002") return bad(404, "not_found", msg);
  if (e?.code === "22023") return bad(400, "invalid", msg);
  console.error("sql error:", e?.code, msg);
  return bad(500, "server_error", "Something went wrong on our side.");
}

// ------------------------------------------------------------------------------------------- email (Resend)
async function sendEmail(to: string[], subject: string, html: string, text: string, ics?: { content: string; method: "REQUEST" | "CANCEL" }) {
  const key = env("RESEND_API_KEY");
  if (!key) return { ok: false as const, error: "RESEND_API_KEY not set" };
  const body: Record<string, unknown> = { from: FROM, to, subject, html, text, reply_to: "howzit@leadvelocity.co.za" };
  if (ics) {
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(ics.content)));
    body.attachments = [{ filename: ics.method === "CANCEL" ? "cancel.ics" : "invite.ics", content: b64, content_type: `text/calendar; charset=utf-8; method=${ics.method}` }];
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.id) return { ok: true as const, id: String(j.id) };
    return { ok: false as const, error: `resend ${res.status}: ${String(j.message ?? j.name ?? "").slice(0, 200)}` };
  } catch (e) {
    return { ok: false as const, error: `resend unreachable: ${(e as Error).message}` };
  }
}

// ------------------------------------------------------------------------------------------- Microsoft Graph (broker's Outlook)
async function graphToken(db: SupabaseClient, broker: Record<string, any>): Promise<string | null> {
  const { data: rt, error } = await db.rpc("smc_vault_ms_refresh", { p_broker_id: broker.id });
  if (error || !rt) { console.warn("graph: no refresh token", error?.code); return null; }
  const tenant = /^[A-Za-z0-9.-]{1,100}$/.test(String(broker.ms_tenant_id ?? "")) ? broker.ms_tenant_id : "organizations";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: String(rt), scope: GRAPH_SCOPE }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) { console.warn("graph: refresh failed", res.status, j.error); return null; }
  if (j.refresh_token && j.refresh_token !== rt) {
    const { error: e2 } = await db.rpc("smc_vault_store_ms_refresh", { p_broker_id: broker.id, p_refresh_token: j.refresh_token, p_tenant_id: null, p_scopes: null });
    if (e2) console.warn("graph: rotated refresh token not stored", e2.code);
  }
  return String(j.access_token);
}
async function graphCreate(db: SupabaseClient, broker: Record<string, any>, ctx: InviteContext, inviteClient: boolean) {
  const token = await graphToken(db, broker);
  if (!token) return { ok: false as const, error: "calendar token unavailable" };
  const res = await fetch(`${GRAPH}/me/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="South Africa Standard Time"' },
    body: JSON.stringify(graphEventBody(ctx, { inviteClient })),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) return { ok: false as const, error: `graph ${res.status}: ${String(j?.error?.code ?? "")}` };
  return { ok: true as const, id: String(j.id), ical_uid: j.iCalUId ? String(j.iCalUId) : null, join_url: j.onlineMeeting?.joinUrl ? String(j.onlineMeeting.joinUrl) : null };
}
async function graphDelete(db: SupabaseClient, broker: Record<string, any>, eventId: string) {
  const token = await graphToken(db, broker);
  if (!token) return false;
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  return res.ok || res.status === 404;
}

// ------------------------------------------------------------------------------------------- WhatsApp (Twilio SMC sender)
async function whatsappConfirm(lead: Record<string, any>, ctx: InviteContext) {
  const phone = String(lead.phone ?? "");
  if (!/^\+27[6-8]\d{8}$/.test(phone)) return { status: "skipped" as const, detail: "no SA mobile" };
  const vars = {
    "1": (lead.first_name || "there").split(/\s+/)[0].slice(0, 40), "2": ctx.brokerName, "3": sastDay(ctx.start), "4": sastTime(ctx.start),
    "5": CONFIRM_LABEL[ctx.method] ?? ctx.method, "6": ctx.appointmentId,
    "7": `confirm:${ctx.appointmentId}`, "8": `reschedule:${ctx.appointmentId}`, "9": `cancel:${ctx.appointmentId}`,
  };
  if (lead.is_synthetic === true) return { status: "dry_run" as const, detail: "synthetic lead: not sent", vars, phone };
  const acct = env("SMC_TWILIO_ACCOUNT_SID");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${acct}:${env("SMC_TWILIO_AUTH_TOKEN")}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: `whatsapp:${phone}`, From: `whatsapp:${SMC_NUMBER}`, ContentSid: BOOKING_CONFIRMED_SID, ContentVariables: JSON.stringify(vars) }),
  });
  const j = await res.json().catch(() => ({}));
  if (res.ok && j.sid) return { status: "sent" as const, sid: String(j.sid), vars, phone };
  return { status: "failed" as const, detail: String(j.message ?? res.status).slice(0, 200), vars, phone };
}

// ------------------------------------------------------------------------------------------- records
async function logComm(db: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await db.from("communications").insert({ direction: "outbound", workflow: WORKFLOW, sender_type: "system", author: "system", ...row });
  if (error) console.warn("communications insert:", error.message);
}
async function activity(db: SupabaseClient, a: Record<string, any>, type: string, notes: string, payload: Record<string, unknown>) {
  const { error } = await db.from("lead_activities").insert({
    lead_id: a.client_id, brand_id: a.brand_id, broker_id: a.broker_id, actor_type: "system", workflow: "console", activity_type: type, notes,
    payload: { appointment_id: a.id, ...payload }, occurred_at: new Date().toISOString(),
    idempotency_key: `appt:${type}:${a.id}:${a.invite_sequence}:${crypto.randomUUID().slice(0, 8)}`,
  });
  if (error) console.warn("activity insert:", error.message);
}
const domainOf = (e: string | null | undefined) => (e && e.includes("@") ? e.split("@")[1] : null);

function inviteContext(a: Record<string, any>, lead: Record<string, any>, broker: Record<string, any>, brokerEmail: string, joinUrl: string | null): InviteContext {
  return {
    appointmentId: a.id, start: a.appointment_date, end: a.ends_at, method: a.method, sequence: a.invite_sequence,
    clientFirst: lead.first_name ?? "", clientLast: lead.last_name ?? null, clientPhone: lead.phone ?? null,
    clientEmail: lead.email && lead.email_status !== "bounced" ? lead.email : null,
    brokerName: broker.adviser_name || broker.contact_person || broker.firm_name || "your adviser", brokerEmail, joinUrl,
    leadSummary: leadSummary(lead),
  };
}
const LEAD_COLS = "id, first_name, last_name, phone, email, email_status, is_synthetic, opted_out_at, age_band, budget_band, reasons, lead_tier, broker_id";
const BROKER_COLS = "id, contact_person, adviser_name, firm_name, email, calendar_email, calendar_status, calendar_mode, ms_tenant_id, add_client_as_attendee";

/** Removes what the previous allocation put in a calendar (re-allocation / cancel). */
async function retractPrevious(db: SupabaseClient, a: Record<string, any>, prev: Record<string, any>, lead: Record<string, any>, keep: { brokerId?: string; email?: string } = {}) {
  if (!prev || prev.status === "requested" || !prev.appointment_date) return { retracted: "none" };
  if (prev.calendar_provider === "outlook" && prev.graph_event_id) {
    const { data: pb } = await db.from("brokers").select(BROKER_COLS).eq("id", prev.broker_id).maybeSingle();
    const done = pb ? await graphDelete(db, pb, prev.graph_event_id) : false;
    return { retracted: done ? "graph_deleted" : "graph_delete_failed" };
  }
  if (prev.calendar_email && (prev.broker_id !== keep.brokerId || prev.calendar_email !== keep.email)) {
    const { data: pb } = await db.from("brokers").select(BROKER_COLS).eq("id", prev.broker_id).maybeSingle();
    const ctx = inviteContext({ ...a, appointment_date: prev.appointment_date, ends_at: prev.ends_at, method: prev.method ?? a.method }, lead, pb ?? {}, prev.calendar_email, null);
    const inv = brokerInvite(ctx, { inviteClient: false, cancel: true });
    const r = await sendEmail([prev.calendar_email], inv.subject, inv.html, inv.text, { content: inv.ics, method: "CANCEL" });
    await logComm(db, { channel: "email", recipient_type: "broker", recipient_id: prev.broker_id, broker_id: prev.broker_id, lead_id: a.client_id, brand_id: a.brand_id,
      recipient_contact: prev.calendar_email, subject: inv.subject, content: "Calendar cancellation (.ics METHOD:CANCEL)", status: r.ok ? "sent" : "failed",
      external_id: r.ok ? r.id : null, failed_reason: r.ok ? null : r.error, metadata: { appointment_id: a.id, kind: "ics_cancel", sequence: a.invite_sequence } });
    return { retracted: r.ok ? "ics_cancel_sent" : "ics_cancel_failed" };
  }
  return { retracted: "superseded_by_update" }; // same broker + same address: the new REQUEST (same UID, higher SEQUENCE) updates it
}

// ------------------------------------------------------------------------------------------- actions
async function request(req: Request, body: Record<string, any>) {
  const db = service();
  let leadId: string | null = null;
  let source = "page";
  const lt = req.headers.get("x-lead-token");
  if (lt) {
    leadId = await verifyLeadToken(lt, [env("SMC_LEAD_TOKEN_SECRET"), env("SMC_LEAD_TOKEN_SECRET_PREVIOUS")]);
    if (!leadId) return bad(401, "try_again", "Your session expired. Please reply on WhatsApp and we'll book you in.");
  } else if (isServiceRole(req)) {
    leadId = typeof body.lead_id === "string" ? body.lead_id : null;
    source = ["page", "whatsapp", "voice", "console", "flow"].includes(body.source) ? body.source : "whatsapp";
    if (!leadId) return bad(400, "lead_required", "lead_id is required");
  } else return bad(401, "unauthorised", "unauthorised");
  const method = typeof body.method === "string" && METHODS.has(body.method.toLowerCase()) ? body.method.toLowerCase() : null;
  const windows = cleanWindows(body.windows);
  const note = typeof body.note === "string" ? body.note.replace(/[\r\n\t]+/g, " ").slice(0, 300) : null;
  const { data, error } = await db.rpc("appointment_request_upsert", {
    p_lead_id: leadId, p_windows: windows.length ? windows : null, p_method: method, p_source: source, p_consent_ref: null, p_note: note,
  });
  if (error) return sqlError(error);
  return json({ ...(data as Record<string, unknown>) });
}

async function allocate(req: Request, body: Record<string, any>) {
  if (!bearer(req)) return bad(401, "unauthorised", "Sign in first.");
  const start = typeof body.start === "string" && !Number.isNaN(Date.parse(body.start)) ? new Date(body.start).toISOString() : null;
  if (!start) return bad(400, "invalid", "Pick a date and time.");
  const method = String(body.method ?? "teams").toLowerCase();
  const minutes = Number(body.duration_minutes ?? 30);
  const { data, error } = await asCaller(req).rpc("appointment_allocate", {
    p_appointment_id: body.appointment_id, p_broker_id: body.broker_id, p_start: start, p_minutes: minutes, p_method: method,
    p_calendar_email: typeof body.broker_email === "string" ? body.broker_email : null,
  });
  if (error) return sqlError(error);
  const out = data as { appointment: Record<string, any>; previous: Record<string, any>; reallocated: boolean; allocated_by_email: string | null };
  const a = out.appointment;
  const db = service();
  const [{ data: lead }, { data: broker }] = await Promise.all([
    db.from("leads").select(LEAD_COLS).eq("id", a.client_id).single(),
    db.from("brokers").select(BROKER_COLS).eq("id", a.broker_id).single(),
  ]);
  if (!lead || !broker) return bad(500, "server_error", "Allocated, but the lead or broker could not be loaded for the invite.");
  const inviteClient = body.invite_client !== false;

  const retract = out.reallocated ? await retractPrevious(db, a, out.previous, lead, { brokerId: a.broker_id, email: a.calendar_email }) : { retracted: "none" };

  // 1. broker calendar
  let delivery: Record<string, unknown> = { calendar: "failed" };
  let joinUrl: string | null = null;
  const update: Record<string, unknown> = {};
  if (broker.calendar_status === "ok") {
    const ctx = inviteContext(a, lead, broker, a.calendar_email, null);
    const g = await graphCreate(db, broker, ctx, inviteClient && broker.add_client_as_attendee !== false);
    if (g.ok) {
      joinUrl = g.join_url;
      Object.assign(update, { calendar_provider: "outlook", graph_event_id: g.id, ical_uid: g.ical_uid, join_url: g.join_url });
      delivery = { calendar: "graph", to: broker.calendar_email ?? a.calendar_email, join_url: g.join_url };
    } else delivery = { calendar: "failed", graph_error: g.error };
  }
  if (delivery.calendar !== "graph") {
    const ctx = inviteContext(a, lead, broker, a.calendar_email, null);
    const inv = brokerInvite(ctx, { inviteClient: false });
    const r = await sendEmail([a.calendar_email], inv.subject, inv.html, inv.text, { content: inv.ics, method: "REQUEST" });
    await logComm(db, { channel: "email", recipient_type: "broker", recipient_id: a.broker_id, broker_id: a.broker_id, lead_id: a.client_id, brand_id: a.brand_id,
      recipient_contact: a.calendar_email, subject: inv.subject, content: "Calendar invite (.ics METHOD:REQUEST)", status: r.ok ? "sent" : "failed",
      external_id: r.ok ? r.id : null, failed_reason: r.ok ? null : r.error, metadata: { appointment_id: a.id, kind: "ics_invite", sequence: a.invite_sequence } });
    // On a failed send the admin still gets the invite: the CRM offers it as a download to forward by hand.
    delivery = r.ok ? { calendar: "ics_email", to: a.calendar_email, ...(delivery.graph_error ? { graph_error: delivery.graph_error } : {}) }
      : { calendar: "failed", to: a.calendar_email, error: r.error, invite_ics: inv.ics, ...(delivery.graph_error ? { graph_error: delivery.graph_error } : {}) };
  }
  if (INVITE_METHODS.has(a.method)) update.invite_email_status = delivery.calendar === "failed" ? null : "sent";
  if (Object.keys(update).length) {
    const { error: ue } = await db.from("appointments").update(update).eq("id", a.id);
    if (ue) console.warn("appointment delivery update:", ue.message);
  }

  // 2. client confirmation
  const ctx = inviteContext({ ...a, join_url: joinUrl }, lead, broker, a.calendar_email, joinUrl);
  let client: Record<string, unknown> = { channel: "none", status: "skipped", detail: "no contact" };
  if (lead.opted_out_at) client = { channel: "none", status: "skipped", detail: "client opted out" };
  else {
    const wa = await whatsappConfirm(lead, ctx);
    if (wa.status !== "skipped") {
      await logComm(db, { channel: "whatsapp", recipient_type: "client", lead_id: a.client_id, brand_id: a.brand_id, broker_id: a.broker_id, author: "bot",
        recipient_contact: wa.phone, template_name: "booking_confirmed", template_category: "utility",
        content: `Template smc_booking_confirmed (manual allocation): ${ctx.brokerName}, ${sastDay(ctx.start)} ${sastTime(ctx.start)}`,
        status: wa.status === "sent" ? "sent" : wa.status === "dry_run" ? "pending" : "failed", external_id: "sid" in wa ? wa.sid : null,
        failed_reason: wa.status === "dry_run" ? "dry_run (synthetic lead, not sent)" : wa.status === "failed" ? wa.detail : null,
        metadata: { appointment_id: a.id, content_sid: BOOKING_CONFIRMED_SID, variables: wa.vars, dry_run: wa.status === "dry_run" } });
      client = { channel: "whatsapp", status: wa.status, detail: "detail" in wa ? wa.detail : undefined };
    }
    if (inviteClient && ctx.clientEmail) {
      const conf = clientConfirmation(ctx);
      let er: { ok: boolean; id?: string; error?: string };
      if (lead.is_synthetic === true) er = { ok: false, error: "dry_run (synthetic lead, not sent)" };
      else er = await sendEmail([ctx.clientEmail], conf.subject, conf.html, conf.text, { content: conf.ics, method: "REQUEST" });
      await logComm(db, { channel: "email", recipient_type: "client", lead_id: a.client_id, brand_id: a.brand_id, broker_id: a.broker_id,
        recipient_contact: ctx.clientEmail, subject: conf.subject, content: "Booking confirmation + calendar invite (.ics)",
        status: er.ok ? "sent" : lead.is_synthetic ? "pending" : "failed", external_id: er.ok ? er.id : null, failed_reason: er.ok ? null : er.error,
        metadata: { appointment_id: a.id, kind: "client_confirmation", dry_run: lead.is_synthetic === true } });
      const est = er.ok ? "sent" : lead.is_synthetic ? "dry_run" : "failed";
      if (client.channel === "none" || client.status === "failed") client = { channel: "email", status: est, detail: er.ok ? undefined : er.error };
      else client = { ...client, email: est };
    }
  }

  await activity(db, a, "appointment_calendar_delivery",
    `${delivery.calendar === "graph" ? "Event created in the broker's Outlook" : delivery.calendar === "ics_email" ? `Calendar invite emailed to the broker (${domainOf(a.calendar_email)})` : "Broker calendar invite FAILED"}; client confirmation: ${client.channel} ${client.status}.`,
    { delivery: { ...delivery, invite_ics: undefined, to: domainOf(String(delivery.to ?? "")) }, client, retract, allocated_by_email: out.allocated_by_email });

  const { data: fresh } = await db.from("appointments").select("*").eq("id", a.id).single();
  return json({ ok: true, appointment: fresh ?? a, reallocated: out.reallocated, delivery, client_confirmation: client, retract });
}

async function cancel(req: Request, body: Record<string, any>) {
  if (!bearer(req)) return bad(401, "unauthorised", "Sign in first.");
  const { data, error } = await asCaller(req).rpc("appointment_cancel", {
    p_appointment_id: body.appointment_id, p_reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
  });
  if (error) return sqlError(error);
  const out = data as { appointment: Record<string, any>; previous: Record<string, any> };
  const a = out.appointment;
  const db = service();
  const { data: lead } = await db.from("leads").select(LEAD_COLS).eq("id", a.client_id).single();
  const retract = lead ? await retractPrevious(db, a, out.previous, lead) : { retracted: "none" };
  let client: Record<string, unknown> = { channel: "none", status: "skipped" };
  if (body.notify_client !== false && lead && out.previous.status !== "requested" && out.previous.appointment_date && !lead.opted_out_at) {
    const email = lead.email && lead.email_status !== "bounced" ? lead.email : null;
    if (email) {
      const { data: broker } = await db.from("brokers").select(BROKER_COLS).eq("id", out.previous.broker_id).maybeSingle();
      const ctx = inviteContext({ ...a, appointment_date: out.previous.appointment_date, ends_at: out.previous.ends_at, method: out.previous.method }, lead, broker ?? {}, out.previous.calendar_email ?? "", null);
      const conf = clientConfirmation(ctx, { cancel: true });
      const er = lead.is_synthetic === true ? { ok: false, error: "dry_run (synthetic lead, not sent)" } as const
        : await sendEmail([email], conf.subject, conf.html, conf.text, { content: conf.ics, method: "CANCEL" });
      await logComm(db, { channel: "email", recipient_type: "client", lead_id: a.client_id, brand_id: a.brand_id, broker_id: a.broker_id, recipient_contact: email,
        subject: conf.subject, content: "Cancellation + calendar cancel (.ics)", status: er.ok ? "sent" : lead.is_synthetic ? "pending" : "failed",
        external_id: er.ok ? (er as { id: string }).id : null, failed_reason: er.ok ? null : (er as { error: string }).error, metadata: { appointment_id: a.id, kind: "client_cancel" } });
      client = { channel: "email", status: er.ok ? "sent" : lead.is_synthetic ? "dry_run" : "failed" };
    } else client = { channel: "none", status: "skipped", detail: "no client email; tell the client on WhatsApp" };
  }
  await activity(db, a, "appointment_cancel_sent", `Cancellation: calendar ${retract.retracted}; client ${client.channel} ${client.status}.`, { retract, client });
  return json({ ok: true, appointment: a, retract, client_confirmation: client });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return bad(405, "method_not_allowed", "POST only");
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "request") return await request(req, body);
    if (body.action === "allocate") return await allocate(req, body);
    if (body.action === "cancel") return await cancel(req, body);
    return bad(404, "unknown_action", "unknown action");
  } catch (e) {
    console.error("appointment-allocation:", (e as Error).message);
    return bad(500, "server_error", "Something went wrong on our side.");
  }
});
