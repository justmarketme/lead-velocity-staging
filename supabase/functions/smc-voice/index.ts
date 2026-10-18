// SortMyCover voice receptionist (Lindi) on +27 60 015 6480. One function, routed
// by the path segment after /smc-voice/:
//
//   POST /twiml          Twilio voice webhook (inbound, and our own callback legs via ?cb=<id>)
//                        -> ElevenLabs register-call TwiML. Auth: X-Twilio-Signature (subaccount token).
//   POST /status         Twilio status callback (number-level for inbound; per call for callbacks).
//                        Records the call; a missed / abandoned inbound call schedules ONE callback.
//   POST /tools/<name>   ElevenLabs webhook tools. Auth: the live conversation must belong to the SMC agent.
//   POST /post-call      ElevenLabs post-call webhook (HMAC). Transcript + summary + notes + tags -> CRM.
//   POST /tick           pg_cron every 5 min (x-cron-secret): dial due callbacks inside CPA s12 hours.
//   GET  /recording?conversation_id=conv_...   Call audio (mp3), streamed from ElevenLabs. Service-role key only;
//                        there is no public audio URL. The CRM call record carries audio_available + conversation_id.
//
// Test mode (service-role JWT + header x-smc-test: 1) on /tools and /tick: no conversation lookup,
// leads are is_synthetic, and nothing is sent or dialled.
//
// Records: one communications row per call (channel 'call', workflow 'smc-voice'); scheduled callbacks are
// communications rows with metadata.kind 'smc_voice_callback'; the lead timeline gets lead_activities rows.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { localZaFormat, normalizeEmail, normalizeZaPhone } from "../_shared/spoken.ts";
import { SMC_WHATSAPP_CONSENT_ASK, smcCallbackFirstMessage, smcConsentRecord } from "../_shared/smc_receptionist_persona.ts";
import {
  ageBand, budgetBand, callbackDueAt, classifyOutcome, elevenSignatureOk, helpTopics, inCallWindow, IN_CRITERIA,
  leadInterest, MAX_AUTO_CALLBACKS_PER_24H, mintLeadToken, MISSED_MAX_SECS, nextCallWindow, sastIso, spokenSast,
  transcriptText, twilioSignature, twilioSignatureOk, userTurns,
} from "../_shared/smc_voice_lib.ts";

const BASE = "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/smc-voice";
const SMC_BRAND_ID = "6e532b05-984f-4906-90a0-a5257cde328c";
const SMC_BROKER_ID = "306062a1-c271-4ae1-8b1e-bb9aed10a5f6"; // Mark Weston, Oracle Private Wealth
const SMC_NUMBER = "+27600156480";
const N8N = "https://n8n.sortmycover.co.za/webhook";
const QUALIFY_BUDGET_SID = "HX5a0030506140a58a86e8611f15a5af64"; // smc_qualify_budget (approved UTILITY)
const BUDGET_TAP_IDS = ["budget_under_500", "budget_500_750", "budget_750_1250", "budget_1250_1499", "budget_1500_plus"];
const WORKFLOW = "smc-voice";

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (error: string, say: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, say, ...extra });
const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { "Content-Type": "text/xml" } });
const SORRY = "<Response><Say>Sorry, SortMyCover can't take your call right now. We'll call you back shortly, or you can WhatsApp us on this number.</Say><Hangup/></Response>";

// This function is deployed with verify_jwt = false (Twilio and ElevenLabs can't send a Supabase JWT), so the
// gateway never checks a signature, and reading "role" out of an unverified JWT payload is forgeable. Admin
// routes therefore ask Supabase itself: only a genuine service-role key can call the auth admin API.
const verifiedAdminTokens = new Map<string, number>(); // token -> verified until (ms)
async function isServiceRole(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if ((verifiedAdminTokens.get(token) ?? 0) > Date.now()) return true;
  try {
    const res = await fetch(`${env("SUPABASE_URL")}/auth/v1/admin/users?page=1&per_page=1`, { headers: { apikey: token, Authorization: `Bearer ${token}` } });
    await res.body?.cancel();
    if (!res.ok) return false;
    verifiedAdminTokens.set(token, Date.now() + 60_000);
    return true;
  } catch {
    return false;
  }
}
const testMode = async (req: Request) => req.headers.get("x-smc-test") === "1" && await isServiceRole(req);

const twilioAuth = () => "Basic " + btoa(`${env("SMC_TWILIO_ACCOUNT_SID")}:${env("SMC_TWILIO_AUTH_TOKEN")}`);

async function twilioForm(req: Request, sub: string): Promise<Record<string, string> | null> {
  const params: Record<string, string> = {};
  for (const [k, v] of (await req.formData()).entries()) params[k] = String(v);
  const url = `${BASE}/${sub}${new URL(req.url).search}`;
  const ok = await twilioSignatureOk(env("SMC_TWILIO_AUTH_TOKEN"), url, params, req.headers.get("X-Twilio-Signature") ?? "");
  if (!ok) {
    console.warn(`smc-voice ${sub}: bad Twilio signature`, { url, sid: params.CallSid });
    return null;
  }
  return params;
}

// ------------------------------------------------------------------------------------------- CRM helpers

async function findLeadByPhone(db: SupabaseClient, phone: string | null) {
  if (!phone) return null;
  const local = "0" + phone.slice(3);
  const { data } = await db.from("leads")
    .select("id, first_name, phone, opted_out_at, broker_id, is_synthetic, conv_state")
    .eq("brand_id", SMC_BRAND_ID).in("phone", [phone, local, phone.slice(1)])
    .order("created_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

async function leadForConversation(db: SupabaseClient, conversationId: string): Promise<string | null> {
  const { data } = await db.from("lead_activities").select("lead_id")
    .eq("idempotency_key", `smcvoice:details:${conversationId}`).maybeSingle();
  return data?.lead_id ?? null;
}

async function activity(db: SupabaseClient, leadId: string, type: string, notes: string, payload: Record<string, unknown>, key: string) {
  const { error } = await db.from("lead_activities").upsert({
    lead_id: leadId, brand_id: SMC_BRAND_ID, actor_type: "system", activity_type: type, notes,
    payload: { brand: "sortmycover", source: "voice", ...payload }, occurred_at: new Date().toISOString(), idempotency_key: key,
  }, { onConflict: "idempotency_key" });
  if (error) console.error(`lead_activities ${type}:`, error.message);
}

/** The single communications row for a call, keyed by CallSid (or conversation id when there is none). */
async function upsertCallRecord(db: SupabaseClient, key: string, row: Record<string, unknown>, meta: Record<string, unknown>) {
  const { data: existing } = await db.from("communications").select("id, metadata, lead_id")
    .eq("channel", "call").eq("workflow", WORKFLOW).eq("external_id", key).maybeSingle();
  const metadata = { ...(existing?.metadata ?? {}), ...meta, kind: "smc_voice_call" };
  if (existing) {
    const { error } = await db.from("communications").update({ ...row, lead_id: row.lead_id ?? existing.lead_id, metadata }).eq("id", existing.id);
    if (error) console.error("call record update:", error.message);
    return existing.id as string;
  }
  const { data, error } = await db.from("communications").insert({
    channel: "call", workflow: WORKFLOW, brand_id: SMC_BRAND_ID, external_id: key, metadata, ...row,
  }).select("id").single();
  if (error) console.error("call record insert:", error.message);
  return data?.id as string | undefined;
}

// ------------------------------------------------------------------------------------------- callbacks

/**
 * Schedules ONE automatic callback for a missed inbound call. Skips withheld numbers, our own numbers,
 * opted-out leads, and anyone who already had an automatic callback in the last 24 h.
 */
async function scheduleCallback(db: SupabaseClient, caller: string | null, missedCallKey: string, reason: string, synthetic = false) {
  const phone = normalizeZaPhone(caller);
  if (!phone || phone === SMC_NUMBER || !/^\+27[6-8]\d{8}$|^\+27[1-5]\d{8}$/.test(phone)) return { scheduled: false, why: "no_callable_number" };
  const lead = await findLeadByPhone(db, phone);
  if (lead?.opted_out_at) return { scheduled: false, why: "opted_out" };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: recent } = await db.from("communications").select("id, metadata")
    .eq("channel", "call").eq("workflow", WORKFLOW).eq("recipient_contact", phone).gte("created_at", since)
    .contains("metadata", { kind: "smc_voice_callback" });
  if ((recent ?? []).some((r: any) => r.metadata?.for_call === missedCallKey)) return { scheduled: false, why: "already_scheduled" };
  if ((recent ?? []).length >= MAX_AUTO_CALLBACKS_PER_24H) return { scheduled: false, why: "callback_cap_24h" };
  const due = callbackDueAt(Date.now());
  const { data, error } = await db.from("communications").insert({
    channel: "call", direction: "outbound", workflow: WORKFLOW, brand_id: SMC_BRAND_ID, lead_id: lead?.id ?? null,
    sender_type: "system", recipient_type: "client", author: "bot", recipient_contact: phone, status: "pending",
    content: `Automatic callback for a missed call (${reason}).`,
    metadata: {
      kind: "smc_voice_callback", state: "scheduled", for_call: missedCallKey, reason, scheduled_for: new Date(due).toISOString(),
      scheduled_for_sast: sastIso(due), attempts: 0, synthetic, tags: { brand: "sortmycover", source: "voice" },
    },
  }).select("id").single();
  if (error) {
    console.error("schedule callback:", error.message);
    return { scheduled: false, why: "db_error" };
  }
  if (lead) await activity(db, lead.id, "voice_callback_scheduled", `Missed call; automatic callback set for ${spokenSast(due)}.`, { callback_id: data.id }, `smcvoice:cbsched:${missedCallKey}`);
  return { scheduled: true, callback_id: data.id, due: sastIso(due) };
}

async function cancelCallbacksFor(db: SupabaseClient, missedCallKey: string, why: string) {
  const { data } = await db.from("communications").select("id, metadata").eq("channel", "call").eq("workflow", WORKFLOW)
    .eq("status", "pending").contains("metadata", { kind: "smc_voice_callback", for_call: missedCallKey });
  for (const r of data ?? []) {
    await db.from("communications").update({ status: "failed", failed_reason: why, metadata: { ...r.metadata, state: "cancelled" } }).eq("id", r.id);
  }
}

async function tick(db: SupabaseClient, dry: boolean) {
  const now = Date.now();
  const { data: rows } = await db.from("communications").select("id, recipient_contact, lead_id, metadata, created_at")
    .eq("channel", "call").eq("workflow", WORKFLOW).eq("status", "pending").contains("metadata", { kind: "smc_voice_callback" })
    .order("created_at").limit(20);
  const report: any[] = [];
  for (const r of rows ?? []) {
    const m = r.metadata ?? {};
    const due = Date.parse(m.scheduled_for);
    if (m.state !== "scheduled") continue;
    if (due > now) { report.push({ id: r.id, action: "wait", due: m.scheduled_for_sast }); continue; }
    if (!inCallWindow(now)) {
      const next = nextCallWindow(now);
      if (!dry) await db.from("communications").update({ metadata: { ...m, scheduled_for: new Date(next).toISOString(), scheduled_for_sast: sastIso(next) } }).eq("id", r.id);
      report.push({ id: r.id, action: "moved_to_window", due: sastIso(next) });
      continue;
    }
    // Cancel if they reached us since (a later inbound call where they actually spoke), or opted out.
    const lead = r.lead_id ? (await db.from("leads").select("first_name, opted_out_at").eq("id", r.lead_id).maybeSingle()).data : null;
    const { data: later } = await db.from("communications").select("id, metadata").eq("channel", "call").eq("workflow", WORKFLOW)
      .eq("recipient_contact", r.recipient_contact).gt("created_at", r.created_at).contains("metadata", { kind: "smc_voice_call" });
    const { data: origin } = await db.from("communications").select("metadata").eq("channel", "call").eq("workflow", WORKFLOW)
      .eq("external_id", m.for_call).maybeSingle();
    const reached = (later ?? []).some((c: any) => (c.metadata?.user_turns ?? 0) > 0) || (origin?.metadata?.user_turns ?? 0) > 1;
    if (lead?.opted_out_at || reached) {
      if (!dry) await db.from("communications").update({ status: "failed", failed_reason: reached ? "caller_reached_us" : "opted_out", metadata: { ...m, state: "cancelled" } }).eq("id", r.id);
      report.push({ id: r.id, action: "cancelled", why: reached ? "caller_reached_us" : "opted_out" });
      continue;
    }
    if (dry || m.synthetic) { report.push({ id: r.id, action: "would_dial", to: r.recipient_contact, dry: true }); continue; }
    if (env("SMC_CALLBACKS_ENABLED") !== "true") { report.push({ id: r.id, action: "skipped", why: "SMC_CALLBACKS_ENABLED is not true" }); continue; }
    // Claim first (a crash after this never re-dials: max 1 automatic callback).
    const { data: claimed } = await db.from("communications").update({ metadata: { ...m, state: "dialing", attempts: (m.attempts ?? 0) + 1, dialed_at: new Date().toISOString() } })
      .eq("id", r.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    const sid = env("SMC_TWILIO_ACCOUNT_SID");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        To: r.recipient_contact, From: SMC_NUMBER, Url: `${BASE}/twiml?cb=${r.id}`, Method: "POST",
        StatusCallback: `${BASE}/status?cb=${r.id}`, StatusCallbackMethod: "POST", Timeout: "25", MachineDetection: "Enable",
      }),
    });
    const body = await res.json().catch(() => ({}));
    await db.from("communications").update({
      status: res.ok ? "sent" : "failed", external_id: body.sid ?? null, failed_reason: res.ok ? null : String(body.message ?? res.status).slice(0, 300),
      metadata: { ...m, state: res.ok ? "dialed" : "dial_failed", attempts: (m.attempts ?? 0) + 1, call_sid: body.sid ?? null, first_name: lead?.first_name ?? null },
    }).eq("id", r.id);
    report.push({ id: r.id, action: res.ok ? "dialed" : "dial_failed", call_sid: body.sid ?? null });
  }
  return { now_sast: sastIso(now), in_window: inCallWindow(now), next_window: sastIso(nextCallWindow(now)), items: report };
}

// ------------------------------------------------------------------------------------------- Twilio routes

const INBOUND_RING_MS = 5500;

async function twiml(req: Request, db: SupabaseClient) {
  const p = await twilioForm(req, "twiml");
  if (!p) return new Response("forbidden", { status: 403 });
  const cbId = new URL(req.url).searchParams.get("cb");
  const isCallback = !!cbId;
  if (isCallback && /machine|fax/.test(p.AnsweredBy ?? "")) return xml("<Response><Hangup/></Response>"); // voicemail: never talk to it
  const caller = isCallback ? p.To : p.From;
  let firstName = "";
  if (isCallback) {
    const { data } = await db.from("communications").select("metadata").eq("id", cbId).maybeSingle();
    firstName = data?.metadata?.first_name ?? "";
  }
  // Ring before answering: Twilio leaves an inbound call unanswered (caller hears carrier ringback,
  // not billed) until this TwiML returns, so inbound calls hold it ~2 SA rings while register-call
  // runs in parallel. Never on callback (outbound) legs.
  const ring = isCallback ? Promise.resolve() : new Promise((r) => setTimeout(r, INBOUND_RING_MS));
  try {
    const register = fetch("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": env("ELEVENLABS_API_KEY") },
      body: JSON.stringify({
        agent_id: env("SMC_ELEVENLABS_AGENT_ID"), from_number: p.From, to_number: p.To, direction: isCallback ? "outbound" : "inbound",
        conversation_initiation_client_data: {
          dynamic_variables: { caller_number: caller, call_type: isCallback ? "callback" : "inbound", first_name: firstName, callback_id: cbId ?? "" },
          ...(isCallback ? { conversation_config_override: { agent: { first_message: smcCallbackFirstMessage(firstName) } } } : {}),
        },
      }),
      signal: AbortSignal.timeout(11000),
    });
    const [res] = await Promise.all([register, ring]);
    const body = await res.text();
    if (!res.ok || !body.includes("<Response")) throw new Error(`register-call ${res.status}: ${body.slice(0, 300)}`);
    console.log("smc-voice: bridged to Lindi", { sid: p.CallSid, callback: isCallback });
    return new Response(body, { headers: { "Content-Type": "text/xml" } });
  } catch (e) {
    console.error("smc-voice twiml:", e);
    if (!isCallback) {
      const phone = normalizeZaPhone(caller);
      await upsertCallRecord(db, p.CallSid, {
        direction: "inbound", sender_type: "client", recipient_type: "system", author: "lead", recipient_contact: phone ?? caller ?? "unknown",
        status: "failed", failed_reason: String(e).slice(0, 300), content: "Call could not be connected to the voice agent.",
      }, { call_sid: p.CallSid, missed: true, outcome: "missed", tags: { brand: "sortmycover", source: "voice", outcome: "missed" }, started_at: new Date().toISOString() });
      await scheduleCallback(db, caller, p.CallSid, "agent_unavailable");
    }
    return xml(SORRY);
  }
}

async function status(req: Request, db: SupabaseClient) {
  const p = await twilioForm(req, "status");
  if (!p) return new Response("forbidden", { status: 403 });
  const cbId = new URL(req.url).searchParams.get("cb");
  const duration = Number(p.CallDuration ?? 0);
  if (cbId) {
    // Our callback leg finished. no-answer / busy / failed / voicemail -> no_answer; otherwise the post-call webhook adds the transcript.
    const { data } = await db.from("communications").select("metadata, status").eq("id", cbId).maybeSingle();
    const answered = p.CallStatus === "completed" && !/machine|fax/.test(p.AnsweredBy ?? "");
    const outcome = answered ? "answered" : "no_answer";
    await db.from("communications").update({
      status: answered ? "delivered" : "failed", call_duration: duration, failed_reason: answered ? null : `${p.CallStatus}${p.AnsweredBy ? ` (${p.AnsweredBy})` : ""}`,
      metadata: { ...(data?.metadata ?? {}), state: "done", outcome, call_status: p.CallStatus, answered_by: p.AnsweredBy ?? null, ended_at: new Date().toISOString() },
    }).eq("id", cbId);
    if (!answered) {
      const phone = normalizeZaPhone(p.To);
      await upsertCallRecord(db, p.CallSid, {
        direction: "outbound", sender_type: "system", recipient_type: "client", author: "bot", recipient_contact: phone ?? p.To,
        status: "failed", call_duration: duration, content: "Automatic callback: no answer.",
      }, { call_sid: p.CallSid, call_type: "callback", callback_id: cbId, outcome: "no_answer", tags: { brand: "sortmycover", source: "voice", outcome: "no_answer" }, ended_at: new Date().toISOString() });
    }
    return new Response("ok");
  }
  // Inbound call ended.
  const phone = normalizeZaPhone(p.From);
  const missed = p.CallStatus !== "completed" || duration <= MISSED_MAX_SECS;
  await upsertCallRecord(db, p.CallSid, {
    direction: "inbound", sender_type: "client", recipient_type: "system", author: "lead", recipient_contact: phone ?? p.From ?? "unknown",
    call_duration: duration, status: "received",
  }, { call_sid: p.CallSid, call_type: "inbound", call_status: p.CallStatus, twilio_duration_secs: duration, ended_at: new Date().toISOString(), ...(missed ? { missed_candidate: true } : {}) });
  if (missed) {
    // The post-call webhook may already have shown a real conversation (user spoke): then no callback.
    const { data } = await db.from("communications").select("metadata").eq("channel", "call").eq("workflow", WORKFLOW).eq("external_id", p.CallSid).maybeSingle();
    if ((data?.metadata?.user_turns ?? 0) <= 1) await scheduleCallback(db, p.From, p.CallSid, p.CallStatus === "completed" ? "hung_up_early" : p.CallStatus);
  }
  return new Response("ok");
}

// ------------------------------------------------------------------------------------------- tools

async function verifyConversation(conversationId: unknown): Promise<string | null> {
  if (typeof conversationId !== "string" || !/^conv_[a-z0-9]+$/i.test(conversationId)) return "missing conversation_id";
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, { headers: { "xi-api-key": env("ELEVENLABS_API_KEY") } });
  if (!res.ok) return `conversation lookup ${res.status}`;
  const conv = await res.json();
  if (conv.agent_id !== env("SMC_ELEVENLABS_AGENT_ID")) return "conversation belongs to another agent";
  if (!["initiated", "in-progress"].includes(conv.status)) return `conversation is ${conv.status}`;
  return null;
}

async function saveCallerDetails(p: Record<string, unknown>, db: SupabaseClient, test: boolean) {
  const conv = String(p.conversation_id);
  const age = ageBand(p.age_band);
  if (!age) return fail("missing_age", "Ask which age group they're in: under 35, 35 to 44, 45 to 50, or over 50.");
  if (!IN_CRITERIA.has(age)) {
    // Outside 35-50: nothing is stored on a lead (POPIA minimality). The call record notes the outcome.
    return json({ ok: true, out_of_criteria: true, say: "Explain kindly that SortMyCover's advisers only take people aged 35 to 50 at the moment, suggest they speak to any FSCA-authorised adviser directly, thank them and close. Do not collect anything else." });
  }
  if (String(p.consent ?? "").toLowerCase() !== "yes") return fail("no_consent", "Nothing was saved. Read the consent line and only call this tool once they clearly say yes.");
  const firstName = String(p.first_name ?? "").trim().split(/\s+/)[0]?.slice(0, 40);
  if (!firstName) return fail("missing_name", "Ask for their first name.");
  const phone = normalizeZaPhone(p.mobile) ?? normalizeZaPhone(p.caller_id);
  if (!phone || !/^\+27[6-8]\d{8}$/.test(phone)) return fail("missing_mobile", "Ask for their South African mobile number (it starts with 06, 07 or 08) and read it back.");
  const topics = helpTopics(p.help_with);
  const { reasons, product_interest } = leadInterest(topics);
  const wills = product_interest === "wills";
  const budget = budgetBand(p.budget_band);
  const now = new Date().toISOString();
  const voice = { channel: "voice", conversation_id: conv, help_with: topics, help_with_said: String(p.help_with ?? "").slice(0, 200), budget_said: String(p.budget_band ?? "").slice(0, 60), captured_at: now };

  const existing = await findLeadByPhone(db, phone);
  let leadId: string;
  let created = false;
  if (existing && !existing.opted_out_at) {
    leadId = existing.id;
    const { error } = await db.from("leads").update({
      first_name: existing.first_name || firstName, age_band: age, ...(budget ? { budget_band: budget } : {}),
      reasons: reasons.length ? reasons : null, conv_state: { ...(existing.conv_state ?? {}), voice },
      last_contact_at: now,
    }).eq("id", leadId);
    if (error) console.error("lead update:", error.message);
  } else {
    if (existing?.opted_out_at) return fail("opted_out", "This number asked SortMyCover not to contact it. Don't book; thank them and say they can book on sortmycover.co.za if they change their mind.");
    const { data, error } = await db.from("leads").insert({
      // Test leads are never routed (routing would reserve a slot on the adviser's paid order).
      brand_id: SMC_BRAND_ID, broker_id: wills || test ? null : SMC_BROKER_ID, routed_at: wills || test ? null : now,
      routing_reason: wills || test ? null : "voice_named_consent",
      origin: "manual", source: "other", current_status: "New", is_synthetic: test,
      first_name: firstName, phone, age_band: age, budget_band: budget, reasons: reasons.length ? reasons : null, product_interest,
      consent_text: smcConsentRecord(wills ? "wills" : "cover"), consent_text_version: "smc-voice-v1", consent_mode: "named",
      consent_at: now, consent_source: "voice_call", line_type: "mobile", language: "en",
      conv_state: { voice, help_with: topics.join(",") }, notes: `Voice call (SortMyCover, Lindi). Wants help with: ${topics.join(", ")}.`,
    }).select("id, broker_id, routing_reason").single();
    if (error || !data) {
      console.error("lead insert:", error?.message);
      return fail("save_failed", "Don't mention any problem. Carry on: ask permission to WhatsApp them, then use send_whatsapp_followup (or request_callback if they prefer a call).");
    }
    leadId = data.id;
    created = true;
  }
  await activity(db, leadId, "voice_details_captured",
    `Lindi captured details on a call: ${firstName}, age ${age}, help with ${topics.join(", ")}, budget ${budget ?? "not sure"}; consent read and agreed.`,
    { conversation_id: conv, age_band: age, budget_band: budget, help_with: topics, consent: "yes", created }, `smcvoice:details:${conv}`);
  return json({ ok: true, saved: true, next: "whatsapp_consent", phone_spoken: localZaFormat(phone),
    say: "Saved. Now explain the appointment is set up on WhatsApp and ask permission to WhatsApp them on this number. Only after a clear yes, confirm the number and call send_whatsapp_followup with whatsapp_consent 'yes'. If they say no, offer an adviser call-back (request_callback)." });
}

async function leadTokenFor(db: SupabaseClient, conv: string) {
  const leadId = await leadForConversation(db, conv);
  if (!leadId) return { leadId: null, token: null };
  const secret = env("SMC_LEAD_TOKEN_SECRET");
  return { leadId, token: secret ? await mintLeadToken(leadId, secret) : null };
}

const WHATSAPP_FALLBACK = { fallback: "whatsapp", say: "Online booking isn't available for this adviser right now. Do the WhatsApp handoff: use send_whatsapp_followup." };

async function checkAvailability(p: Record<string, unknown>, db: SupabaseClient) {
  const conv = String(p.conversation_id);
  const { leadId, token } = await leadTokenFor(db, conv);
  if (!leadId) return fail("no_details", "Call save_caller_details first (after consent).");
  // W04's own rule: no readable calendar -> fallback whatsapp. Checked here first so we don't call n8n for nothing.
  const { data: lead } = await db.from("leads").select("broker_id").eq("id", leadId).maybeSingle();
  if (!lead?.broker_id) return json({ ok: false, ...WHATSAPP_FALLBACK, why: "lead_not_routed" });
  const { data: broker } = await db.from("brokers").select("calendar_status, calendar_mode, bookings_paused").eq("id", lead.broker_id).maybeSingle();
  const calendarUsable = broker && !broker.bookings_paused &&
    (broker.calendar_status === "ok" || broker.calendar_status === "blocked_admin_consent" || broker.calendar_mode === "shared_fallback");
  if (!calendarUsable || !token) return json({ ok: false, ...WHATSAPP_FALLBACK, why: !token ? "no_lead_token_secret" : "calendar_not_connected" });
  const q = typeof p.preferred_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.preferred_date) ? `date=${p.preferred_date}` : "offer=4";
  const res = await fetch(`${N8N}/slots?${q}`, { headers: { "X-Lead-Token": token } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.fallback || !Array.isArray(body.slots) || !body.slots.length) {
    console.warn("smc-voice slots:", res.status, JSON.stringify(body).slice(0, 200));
    return json({ ok: false, ...WHATSAPP_FALLBACK, why: `slots_${res.status}` });
  }
  return json({
    ok: true, timezone: "South Africa (SAST)", adviser_first_name: body.adviser_first_name ?? null, methods: body.methods ?? ["teams", "phone"],
    slots: body.slots.slice(0, 4).map((s: any) => ({ start: s.start, spoken: spokenSast(Date.parse(s.start)) })),
  });
}

async function bookAppointment(p: Record<string, unknown>, db: SupabaseClient) {
  const conv = String(p.conversation_id);
  const { leadId, token } = await leadTokenFor(db, conv);
  if (!leadId || !token) return json({ ok: false, ...WHATSAPP_FALLBACK, why: "no_lead_or_token" });
  const method = String(p.method ?? "").toLowerCase().includes("team") ? "teams" : "phone";
  const email = normalizeEmail(p.email);
  if (!email) return fail("invalid_email", "That email didn't come through as a valid address. Ask them to say it again slowly, then read it back.");
  const start = typeof p.start === "string" ? p.start : "";
  const res = await fetch(`${N8N}/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lead-Token": token },
    body: JSON.stringify({ slot_start: start, method, email, request_id: conv.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64), idempotency_key: `voice:${conv}:${start}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 201 && (body.booked || body.held)) {
    await db.from("leads").update({ email, method_pref: method }).eq("id", leadId);
    await activity(db, leadId, "voice_booked", `Lindi booked a ${method} call for ${spokenSast(Date.parse(body.start ?? start))}${body.held ? " (held until the email is confirmed)" : ""}.`,
      { conversation_id: conv, booking_id: body.booking_id, held: !!body.held, method }, `smcvoice:booked:${conv}`);
    const when = spokenSast(Date.parse(body.start ?? start));
    return json({ ok: true, held: !!body.held, booked_for: when,
      say: body.held ? `Held ${when} for them. They must tap the link in the email SortMyCover sends to ${email} to confirm it.` : `Booked for ${when}. The confirmation goes to ${email}.` });
  }
  if (res.status === 409 && Array.isArray(body.next) && body.next.length) {
    return fail("slot_taken", "That time was just taken. Offer two of these instead.", { slots: body.next.slice(0, 3).map((s: any) => ({ start: s.start, spoken: spokenSast(Date.parse(s.start)) })) });
  }
  if (res.status === 422 && /email/.test(String(body.error_code))) {
    return fail(String(body.error_code), body.suggestion ? `Check the email: did they mean ${body.suggestion}?` : "The email didn't work. Ask them to say it again and read it back.");
  }
  console.warn("smc-voice book:", res.status, JSON.stringify(body).slice(0, 300));
  return json({ ok: false, ...WHATSAPP_FALLBACK, why: `book_${res.status}` });
}

async function sendWhatsappFollowup(p: Record<string, unknown>, db: SupabaseClient, test: boolean) {
  const conv = String(p.conversation_id);
  // POPIA: an explicit yes to "may we WhatsApp you on this number" before anything is sent.
  if (String(p.whatsapp_consent ?? "").toLowerCase() !== "yes") {
    return fail("no_whatsapp_consent", "Nothing was sent. Ask: 'Do I have your permission to contact you on WhatsApp on this number?' and only call this again after a clear yes, with whatsapp_consent 'yes'. If they say no, offer an adviser call-back.");
  }
  const consentAt = new Date().toISOString();
  const leadId = await leadForConversation(db, conv);
  const lead = leadId ? (await db.from("leads").select("id, first_name, phone, opted_out_at").eq("id", leadId).maybeSingle()).data : null;
  const phone = normalizeZaPhone(lead?.phone) ?? normalizeZaPhone(p.mobile) ?? normalizeZaPhone(p.caller_id);
  if (!phone) return fail("missing_mobile", "Ask for their mobile number for the WhatsApp.");
  if (lead?.opted_out_at) return fail("opted_out", "This number opted out. Don't send anything; close kindly.");
  const { count } = await db.from("communications").select("id", { count: "exact", head: true })
    .eq("channel", "whatsapp").eq("workflow", WORKFLOW).contains("metadata", { conversation_id: conv });
  if ((count ?? 0) > 0) return json({ ok: true, already_sent: true, say: "The WhatsApp was already sent on this call." });
  const name = (lead?.first_name || String(p.first_name ?? "").trim().split(/\s+/)[0] || "there").slice(0, 40);
  const variables: Record<string, string> = { "1": name };
  BUDGET_TAP_IDS.forEach((id, i) => (variables[String(i + 2)] = id));

  let sid: string | null = null;
  let sendError: string | null = null;
  if (test) {
    sid = "SM_dry_run";
  } else {
    const acct = env("SMC_TWILIO_ACCOUNT_SID");
    const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/Messages.json`, {
      method: "POST",
      headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: `whatsapp:${phone}`, From: `whatsapp:${SMC_NUMBER}`, ContentSid: QUALIFY_BUDGET_SID, ContentVariables: JSON.stringify(variables) }),
    });
    const twBody = await tw.json().catch(() => ({}));
    if (tw.ok) sid = twBody.sid;
    else sendError = String(twBody.message ?? tw.status).slice(0, 300);
  }
  await db.from("communications").insert({
    channel: "whatsapp", direction: "outbound", workflow: WORKFLOW, brand_id: SMC_BRAND_ID, lead_id: lead?.id ?? null,
    sender_type: "system", recipient_type: "client", author: "bot", recipient_contact: phone,
    template_name: "qualify_budget", template_category: "utility", content: `Template smc_qualify_budget to ${name} (voice handoff).`,
    status: test ? "pending" : sid ? "sent" : "failed", external_id: test ? null : sid, failed_reason: test ? "dry_run (test mode, not sent)" : sendError,
    metadata: { conversation_id: conv, tool: "send_whatsapp_followup", dry_run: test, content_sid: QUALIFY_BUDGET_SID, reason: String(p.reason ?? "").slice(0, 200),
      whatsapp_consent: { given: true, at: consentAt, source: "voice_call", wording: SMC_WHATSAPP_CONSENT_ASK } },
  });
  if (lead) {
    await db.from("leads").update({ conv_state: { ...(await convState(db, lead.id)), whatsapp_consent: { given: true, at: consentAt, source: "voice_call", conversation_id: conv } } }).eq("id", lead.id);
    await activity(db, lead.id, "voice_whatsapp_handoff", `Caller agreed to WhatsApp contact (${consentAt}); Lindi handed the conversation to WhatsApp (smc_qualify_budget ${sid ? "sent" : "FAILED"}).`,
      { conversation_id: conv, message_sid: sid, error: sendError, dry_run: test, whatsapp_consent_at: consentAt }, `smcvoice:wa:${conv}`);
  }
  if (!sid) return fail("send_failed", "Don't mention any failure. Say the adviser's office will be in touch on this number during office hours to set up the appointment, and close warmly.");
  return json({ ok: true, sent_to: localZaFormat(phone), say: "WhatsApp sent from SortMyCover." });
}

async function convState(db: SupabaseClient, leadId: string): Promise<Record<string, unknown>> {
  return (await db.from("leads").select("conv_state").eq("id", leadId).maybeSingle()).data?.conv_state ?? {};
}

// Caller declined WhatsApp: the adviser's office calls them back instead (with their consent).
async function requestCallback(p: Record<string, unknown>, db: SupabaseClient, test: boolean) {
  const conv = String(p.conversation_id);
  if (String(p.callback_consent ?? "").toLowerCase() !== "yes") {
    return fail("no_callback_consent", "Ask whether they're happy for the adviser's office to call them back on this number, and only call this after a clear yes.");
  }
  const leadId = await leadForConversation(db, conv);
  if (!leadId) return fail("no_details", "Call save_caller_details first (after the consent line).");
  const at = new Date().toISOString();
  const preferred = String(p.preferred_time ?? "").slice(0, 120);
  const cs = await convState(db, leadId);
  await db.from("leads").update({
    conv_state: { ...cs, callback_request: { consent: true, at, preferred_time: preferred || null, conversation_id: conv, source: "voice_call", test } },
    last_contact_at: at,
  }).eq("id", leadId);
  await activity(db, leadId, "voice_callback_requested",
    `Caller declined WhatsApp and agreed to a call-back from the adviser's office (${at})${preferred ? `; prefers ${preferred}` : ""}.`,
    { conversation_id: conv, callback_consent_at: at, preferred_time: preferred || null, dry_run: test }, `smcvoice:cbreq:${conv}`);
  return json({ ok: true, say: "Call-back noted. Tell them the adviser's office will call them on this number to set up the appointment, then close warmly." });
}

// ------------------------------------------------------------------------------------------- recordings

const EL_CONVAI = "https://api.elevenlabs.io/v1/convai";

/** True/false once ElevenLabs reports whether the call has audio; null if it can't be confirmed. */
async function audioAvailable(conv: string): Promise<boolean | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${EL_CONVAI}/conversations/${conv}`, { headers: { "xi-api-key": env("ELEVENLABS_API_KEY") } });
      if (res.ok) {
        const c = await res.json();
        if (c.has_audio === true) return true;
        if (attempt === 2) return c.has_audio === false ? false : null;
      }
    } catch (e) {
      console.warn("audioAvailable:", e instanceof Error ? e.message : e);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 2000)); // audio can lag the webhook by a moment
  }
  return null;
}

/** Admin playback. Audio is stored only at ElevenLabs; this streams it to a service-role caller. Never public. */
async function recording(req: Request) {
  if (!(await isServiceRole(req))) return new Response("forbidden", { status: 403 });
  let id = new URL(req.url).searchParams.get("conversation_id");
  if (!id && req.method === "POST") id = (await req.json().catch(() => ({})))?.conversation_id ?? null;
  if (typeof id !== "string" || !/^conv_[a-z0-9]+$/i.test(id)) return json({ error: "conversation_id required" }, 400);
  const headers = { "xi-api-key": env("ELEVENLABS_API_KEY") };
  const meta = await fetch(`${EL_CONVAI}/conversations/${id}`, { headers });
  if (!meta.ok) return json({ error: `conversation lookup ${meta.status}` }, 404);
  const conv = await meta.json();
  if (conv.agent_id !== env("SMC_ELEVENLABS_AGENT_ID")) return json({ error: "not a SortMyCover conversation" }, 404);
  if (conv.has_audio === false) return json({ error: "no audio for this conversation", has_audio: false }, 404);
  const audio = await fetch(`${EL_CONVAI}/conversations/${id}/audio`, { headers });
  if (!audio.ok || !audio.body) return json({ error: `audio ${audio.status}` }, 502);
  console.log(`smc-voice recording played: ${id}`); // access trail (Supabase function logs)
  return new Response(audio.body, {
    headers: {
      "Content-Type": audio.headers.get("Content-Type") ?? "audio/mpeg",
      "Content-Disposition": `inline; filename="${id}.mp3"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// ------------------------------------------------------------------------------------------- post-call

async function postCall(req: Request, db: SupabaseClient) {
  const raw = await req.text();
  if (!(await elevenSignatureOk(env("SMC_VOICE_WEBHOOK_SECRET"), req.headers.get("ElevenLabs-Signature") ?? "", raw))) {
    return new Response("bad signature", { status: 401 });
  }
  const evt = JSON.parse(raw);
  if (evt.type !== "post_call_transcription") return new Response("ignored");
  const d = evt.data ?? {};
  if (d.agent_id !== env("SMC_ELEVENLABS_AGENT_ID")) return new Response("other agent");
  const conv: string = d.conversation_id;
  const md = d.metadata ?? {};
  const pc = md.phone_call ?? {};
  const dyn = d.conversation_initiation_client_data?.dynamic_variables ?? {};
  const callType = String(dyn.call_type ?? (pc.direction === "outbound" ? "callback" : "inbound"));
  const transcript = d.transcript ?? [];
  const collected: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d.analysis?.data_collection_results ?? {})) collected[k] = (v as any)?.value ?? null;
  const duration = Number(md.call_duration_secs ?? 0);
  const outcome = classifyOutcome(transcript, collected, callType, duration);
  const turns = userTurns(transcript);
  const phone = normalizeZaPhone(dyn.caller_number) ?? normalizeZaPhone(pc.external_number);
  const leadId = (await leadForConversation(db, conv)) ?? (outcome === "out_of_criteria" ? null : (await findLeadByPhone(db, phone))?.id ?? null);
  const startedMs = Number(md.start_time_unix_secs ?? 0) * 1000;
  const summary = String(d.analysis?.transcript_summary ?? "").trim();
  const notes = String(collected.call_notes ?? "").trim();
  const key = pc.call_sid || conv;
  // POPIA minimality: out of criteria keeps only the outcome and the age band, nothing else collected.
  const kept = outcome === "out_of_criteria" ? { outcome: collected.outcome ?? "out_of_criteria", age_band: collected.age_band ?? null } : collected;
  const inbound = callType !== "callback";
  const tags = { brand: "sortmycover", source: "voice", outcome, call_type: callType };
  const audio = d.has_audio === true ? true : await audioAvailable(conv);

  await upsertCallRecord(db, key, {
    direction: inbound ? "inbound" : "outbound", sender_type: inbound ? "client" : "system", recipient_type: inbound ? "system" : "client",
    author: inbound ? "lead" : "bot", recipient_contact: phone ?? "unknown", lead_id: leadId,
    content: transcriptText(transcript) || "(no speech)", call_duration: duration, status: inbound ? "received" : turns > 0 ? "delivered" : "failed",
    subject: `SortMyCover voice call: ${outcome}`,
  }, {
    conversation_id: conv, call_sid: pc.call_sid ?? null, agent: "smc_receptionist", agent_id: d.agent_id, call_type: callType,
    callback_id: dyn.callback_id || null, started_at: startedMs ? new Date(startedMs).toISOString() : null,
    ended_at: startedMs ? new Date(startedMs + duration * 1000).toISOString() : null, duration_secs: duration,
    summary, call_notes: outcome === "out_of_criteria" ? "Out of criteria (age). No details kept." : notes, data_collection: kept, evaluation: d.analysis?.evaluation_criteria_results ?? {},
    call_successful: d.analysis?.call_successful ?? null, termination_reason: md.termination_reason ?? null,
    user_turns: turns, outcome, tags, missed: outcome === "missed",
    // The recording lives at ElevenLabs (no audio URL is stored). Admins play it via GET /smc-voice/recording.
    audio_available: audio, audio_conversation_id: conv, audio_source: "elevenlabs",
  });
  if (leadId) {
    await activity(db, leadId, "voice_call", summary || `Voice call (${outcome}).`,
      { conversation_id: conv, call_sid: pc.call_sid ?? null, outcome, call_type: callType, duration_secs: duration, call_notes: notes },
      `smcvoice:call:${conv}`);
  }
  if (outcome === "missed" && inbound) await scheduleCallback(db, phone, key, "hung_up_before_talking");
  else await cancelCallbacksFor(db, key, "caller_spoke"); // the status callback may have scheduled one before this arrived
  return json({ ok: true, outcome, lead_id: leadId });
}

// ------------------------------------------------------------------------------------------- router

Deno.serve(async (req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const at = parts.indexOf("smc-voice");
  const route = parts.slice(at + 1);
  if (route[0] !== "recording" && req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  try {
    switch (route[0]) {
      case "recording": return await recording(req);
      case "twiml": return await twiml(req, db);
      case "status": return await status(req, db);
      case "post-call": return await postCall(req, db);
      case "tick": {
        const test = await testMode(req);
        if (!test && req.headers.get("x-cron-secret") !== env("SMC_VOICE_CRON_SECRET")) return new Response("forbidden", { status: 403 });
        const url = new URL(req.url);
        if (test && url.searchParams.get("simulate_missed")) {
          // Dry-run of the missed-call path: schedules (synthetic, never dialled) and reports.
          const key = `test_${Date.now()}`;
          const r = await scheduleCallback(db, url.searchParams.get("simulate_missed"), key, "test_missed", true);
          const report = await tick(db, true);
          await cancelCallbacksFor(db, key, "test_dry_run");
          return json({ schedule: r, tick: report });
        }
        return json(await tick(db, test || url.searchParams.get("dry") === "1"));
      }
      case "selftest": {
        // Service-role + x-smc-test only. Confirms the number still points here and that a Twilio-signed
        // inbound request gets valid TwiML (and how long Twilio would ring first). Places no call; the
        // ElevenLabs registration it creates is never connected.
        if (!(await testMode(req))) return new Response("forbidden", { status: 403 });
        const acct = env("SMC_TWILIO_ACCOUNT_SID");
        const nums = await (await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(SMC_NUMBER)}`,
          { headers: { Authorization: twilioAuth() } })).json();
        const num = nums.incoming_phone_numbers?.[0] ?? {};
        const params = { AccountSid: acct, CallSid: `CAselftest${Date.now()}`, From: "+27825550000", To: SMC_NUMBER, Direction: "inbound", CallStatus: "ringing" };
        const signature = await twilioSignature(env("SMC_TWILIO_AUTH_TOKEN"), `${BASE}/twiml`, params);
        const t0 = Date.now();
        const res = await fetch(`${BASE}/twiml`, { method: "POST", headers: { "X-Twilio-Signature": signature, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
        const body = await res.text();
        const unsigned = await fetch(`${BASE}/twiml`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
        await unsigned.text();
        return json({
          number: { phone: num.phone_number, voice_url: num.voice_url, voice_method: num.voice_method, status_callback: num.status_callback },
          signed_twiml: { status: res.status, ms: Date.now() - t0, connect_stream: /<Connect>\s*<Stream/.test(body), head: body.slice(0, 160) },
          unsigned_status: unsigned.status,
        });
      }
      case "tools": {
        const tool = route[1];
        const p = await req.json().catch(() => null);
        if (!p) return json({ error: "invalid json" }, 400);
        const test = await testMode(req);
        if (!test) {
          const denied = await verifyConversation(p.conversation_id);
          if (denied) {
            console.warn(`smc-voice tools ${tool}: rejected (${denied})`);
            return json({ error: "unauthorized" }, 401);
          }
        }
        if (tool === "save_caller_details") return await saveCallerDetails(p, db, test);
        if (tool === "check_availability") return await checkAvailability(p, db);
        if (tool === "book_appointment") return await bookAppointment(p, db);
        if (tool === "send_whatsapp_followup") return await sendWhatsappFollowup(p, db, test);
        if (tool === "request_callback") return await requestCallback(p, db, test);
        return json({ error: `unknown tool ${tool}` }, 404);
      }
      default: return json({ error: "not found" }, 404);
    }
  } catch (e) {
    console.error(`smc-voice ${route.join("/")}:`, e);
    if (route[0] === "twiml") return xml(SORRY);
    if (route[0] === "tools") return fail("internal", "Don't mention any problem. Tell them the adviser's office will be in touch on this number to set up the appointment.");
    return json({ error: "internal" }, 500);
  }
});
