// Ayanda's server tools (ElevenLabs webhook tools). One function, routed by the
// last path segment: /ayanda-tools-bridge/{check_availability|book_appointment|send_whatsapp_link}.
//
// Auth: verify_jwt is off (ElevenLabs can't mint Supabase JWTs), so every call
// must carry the live ElevenLabs conversation_id ({{system__conversation_id}}),
// which we look up with our own API key and require to belong to Ayanda's agent.
//
// Tool failures return HTTP 200 with { ok:false, say } so the agent can recover
// mid-call instead of hearing a generic error.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeEmail, normalizeUrl, normalizeZaPhone, localZaFormat } from "../_shared/spoken.ts";

const TZ = "Africa/Johannesburg";
const CAL = "https://api.cal.com/v2";
const LV_WHATSAPP = "+27737651664";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (error: string, say: string) => json({ ok: false, error, say });

const env = (k: string) => Deno.env.get(k) ?? "";

async function verifyConversation(conversationId: unknown): Promise<string | null> {
  if (typeof conversationId !== "string" || !/^conv_[a-z0-9]+$/i.test(conversationId)) return "missing conversation_id";
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": env("ELEVENLABS_API_KEY") },
  });
  if (!res.ok) return `conversation lookup ${res.status}`;
  const conv = await res.json();
  if (conv.agent_id !== env("ELEVENLABS_AGENT_ID")) return "conversation belongs to another agent";
  if (!["initiated", "in-progress"].includes(conv.status)) return `conversation is ${conv.status}`;
  return null;
}

function spokenSlot(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)).replace(",", ""); // "Wednesday 14 October at 10:00"
}

async function calSlots(fromISO: string, toISO: string): Promise<string[]> {
  const url = `${CAL}/slots?eventTypeId=${env("CALCOM_EVENT_TYPE_ID")}&start=${encodeURIComponent(fromISO)}` +
    `&end=${encodeURIComponent(toISO)}&timeZone=${TZ}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env("CALCOM_API_KEY")}`, "cal-api-version": "2024-09-04" } });
  if (!res.ok) throw new Error(`cal slots ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: Record<string, Array<{ start: string }>> = (await res.json()).data ?? {};
  return Object.values(data).flat().map((s) => s.start).sort();
}

/** A short, spread-out menu: earliest slot, then a morning and an afternoon per day. */
function pickSlots(all: string[], max = 6): string[] {
  const hour = (iso: string) => Number(new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso)));
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const iso of all) {
    const key = `${day(iso)}-${hour(iso) < 12 ? "am" : "pm"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(iso);
    if (picked.length >= max) break;
  }
  return picked;
}

async function checkAvailability(p: Record<string, unknown>) {
  const now = Date.now();
  let from = new Date(now + 2 * 3600_000); // Cal.com enforces 2h notice anyway
  let to = new Date(now + 10 * 86400_000);
  if (typeof p.preferred_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.preferred_date)) {
    const dayStart = new Date(`${p.preferred_date}T00:00:00+02:00`);
    if (dayStart.getTime() + 86400_000 > now) {
      from = new Date(Math.max(dayStart.getTime(), from.getTime()));
      to = new Date(dayStart.getTime() + 86400_000);
    }
  }
  let slots = await calSlots(from.toISOString(), to.toISOString());
  if (p.time_of_day === "morning" || p.time_of_day === "afternoon") {
    const wantAm = p.time_of_day === "morning";
    const h = (iso: string) => Number(new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso)));
    const filtered = slots.filter((s) => (h(s) < 12) === wantAm);
    if (filtered.length) slots = filtered;
  }
  const menu = p.preferred_date ? slots.slice(0, 6) : pickSlots(slots);
  if (!menu.length) return fail("no_slots", "There are no open slots that day — offer the next available day instead, or the WhatsApp option.");
  return json({ ok: true, timezone: "South Africa (SAST)", slots: menu.map((start) => ({ start, spoken: spokenSlot(start) })) });
}

async function upsertEnquiry(
  db: SupabaseClient,
  conversationId: string,
  row: { name: string; email?: string | null; phone?: string | null; company?: string | null; message: string },
) {
  const ref = `ElevenLabs ${conversationId}`;
  const { data: existing } = await db.from("contact_submissions").select("id, message").eq("source", "ayanda_call")
    .eq("admin_notes", ref).maybeSingle();
  if (existing) {
    await db.from("contact_submissions").update({
      ...row, message: `${existing.message}\n${row.message}`, updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await db.from("contact_submissions")
    .insert({ ...row, source: "ayanda_call", status: "new", admin_notes: ref }).select("id").single();
  if (error) console.error("contact_submissions insert failed:", error.message);
  return data?.id;
}

async function bookAppointment(p: Record<string, unknown>, db: SupabaseClient) {
  const conversationId = p.conversation_id as string;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (!name) return fail("missing_name", "Ask for their name before booking.");
  const email = normalizeEmail(p.email);
  if (!email) return fail("invalid_email", "That email didn't come through as a valid address. Ask them to say it again slowly, then read it back.");
  const phone = normalizeZaPhone(p.phone) ?? normalizeZaPhone(p.caller_id);
  if (!phone) return fail("missing_phone", "Ask for the best number for the team to call them on.");
  const start = typeof p.start === "string" ? new Date(p.start) : null;
  if (!start || Number.isNaN(start.getTime())) return fail("invalid_start", "Use one of the exact slot times from check_availability.");
  const website = normalizeUrl(p.website);
  const company = typeof p.company === "string" && p.company.trim() ? p.company.trim() : null;
  const notes = typeof p.notes === "string" ? p.notes.trim().slice(0, 400) : "";

  const res = await fetch(`${CAL}/bookings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("CALCOM_API_KEY")}`, "cal-api-version": "2024-08-13", "Content-Type": "application/json" },
    body: JSON.stringify({
      start: start.toISOString(),
      eventTypeId: Number(env("CALCOM_EVENT_TYPE_ID")),
      attendee: { name, email, timeZone: TZ, phoneNumber: phone, language: "en" },
      location: { type: "attendeePhone", phone },
      bookingFieldsResponses: notes ? { notes } : undefined,
      metadata: { source: "ayanda", conversation_id: conversationId },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === "error") {
    const msg = String(body?.error?.message ?? res.status);
    console.error("cal booking failed:", msg);
    if (/available|slot|busy|booked/i.test(msg)) {
      return fail("slot_taken", "That slot was just taken. Call check_availability again and offer two new times.");
    }
    return fail("booking_failed", "The calendar didn't accept the booking. Apologise, and offer to WhatsApp them the booking link instead.");
  }
  const booking = Array.isArray(body.data) ? body.data[0] : body.data;
  const spoken = spokenSlot(booking?.start ?? start.toISOString());

  await upsertEnquiry(db, conversationId, {
    name, email, phone, company,
    message: [
      `Ayanda booked a 15-min Lead Velocity Discovery Call for ${spoken} (Cal.com ${booking?.uid ?? "?"}).`,
      website ? `Website: ${website}.` : "",
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean).join(" "),
  });

  return json({
    ok: true,
    booked_for: spoken,
    email,
    phone_spoken: localZaFormat(phone),
    say: `Booked for ${spoken}. A calendar invite is on its way to ${email}, and the team will call them on ${localZaFormat(phone)}.`,
  });
}

async function sendWhatsappLink(p: Record<string, unknown>, db: SupabaseClient) {
  const conversationId = p.conversation_id as string;
  const phone = normalizeZaPhone(p.phone) ?? normalizeZaPhone(p.caller_id);
  if (!phone) return fail("missing_phone", "Ask which mobile number to send the WhatsApp link to.");

  const { count } = await db.from("communications").select("id", { count: "exact", head: true })
    .eq("channel", "sms").contains("metadata", { conversation_id: conversationId });
  if ((count ?? 0) > 0) return json({ ok: true, already_sent: true, say: "The link was already sent on this call." });

  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().split(/\s+/)[0] : "";
  const topic = typeof p.topic === "string" && p.topic.trim() ? p.topic.trim().slice(0, 80) : "how Lead Velocity works";
  const prefill = encodeURIComponent(`Hi Lead Velocity, Ayanda said I should message you. I'd like to know more about ${topic}.`);
  const text = `Hi${name ? ` ${name}` : ""}, it's Ayanda from Lead Velocity. Tap to chat to us on WhatsApp: https://wa.me/${LV_WHATSAPP.slice(1)}?text=${prefill}`;

  const sid = env("TWILIO_ACCOUNT_SID");
  const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${env("TWILIO_AUTH_TOKEN")}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: phone, From: env("TWILIO_PHONE_NUMBER"), Body: text }),
  });
  const twBody = await tw.json().catch(() => ({}));

  await db.from("communications").insert({
    channel: "sms", direction: "outbound", sender_type: "system", recipient_type: "client", author: "bot",
    recipient_contact: phone, content: text, status: tw.ok ? "sent" : "failed", external_id: twBody.sid ?? null,
    failed_reason: tw.ok ? null : String(twBody.message ?? tw.status).slice(0, 300),
    metadata: { conversation_id: conversationId, tool: "send_whatsapp_link", agent: "ayanda" },
  });
  await upsertEnquiry(db, conversationId, {
    name: name || "Ayanda caller", phone,
    message: `Asked to continue on WhatsApp about ${topic}; tap-to-chat link ${tw.ok ? "sent" : "FAILED"} by SMS.`,
  });

  if (!tw.ok) {
    console.error("twilio sms failed:", twBody);
    return fail("sms_failed", `The text didn't go through. Give them the WhatsApp number to save instead: ${localZaFormat(LV_WHATSAPP)}.`);
  }
  return json({ ok: true, sent_to: localZaFormat(phone), whatsapp_number: localZaFormat(LV_WHATSAPP), say: "Text sent with the WhatsApp link." });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const tool = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const denied = await verifyConversation(p.conversation_id);
  if (denied) {
    console.warn(`ayanda-tools-bridge ${tool}: rejected (${denied})`);
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  try {
    if (tool === "check_availability") return await checkAvailability(p);
    if (tool === "book_appointment") return await bookAppointment(p, db);
    if (tool === "send_whatsapp_link") return await sendWhatsappLink(p, db);
    return json({ error: `unknown tool ${tool}` }, 404);
  } catch (e) {
    console.error(`ayanda-tools-bridge ${tool} error:`, e);
    return fail("internal", "Something went wrong on our side. Apologise briefly and offer the WhatsApp option.");
  }
});
