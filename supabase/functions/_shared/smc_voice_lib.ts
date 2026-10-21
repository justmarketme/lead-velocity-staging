// Pure logic for the SortMyCover voice receptionist (smc-voice). No I/O here,
// so every rule is unit-tested in smc_voice_lib.test.ts.

export const SAST_OFFSET_MS = 2 * 3600_000; // Africa/Johannesburg, no DST

// SA public holidays (Public Holidays Act, Sunday rule applied), copied from
// data/za-public-holidays.json, which W04 also uses. Add new years there and here.
export const ZA_HOLIDAYS = new Set([
  "2026-01-01", "2026-03-21", "2026-04-03", "2026-04-06", "2026-04-27", "2026-05-01", "2026-06-16", "2026-08-09",
  "2026-08-10", "2026-09-24", "2026-12-16", "2026-12-25", "2026-12-26", "2027-01-01", "2027-03-21", "2027-03-22",
  "2027-03-26", "2027-03-29", "2027-04-27", "2027-05-01", "2027-06-16", "2027-08-09", "2027-09-24", "2027-12-16",
  "2027-12-25", "2027-12-26", "2027-12-27",
]);

// Consumer Protection Act s12 / reg 4 (direct marketing contact hours):
// Mon-Fri 08:00-20:00, Sat 09:00-13:00, never Sunday or a public holiday.
// We stop starting calls 15 minutes before the window closes so a call fits.
const WINDOWS: Record<number, [number, number] | null> = {
  0: null, // Sunday
  1: [8 * 60, 20 * 60], 2: [8 * 60, 20 * 60], 3: [8 * 60, 20 * 60], 4: [8 * 60, 20 * 60], 5: [8 * 60, 20 * 60],
  6: [9 * 60, 13 * 60],
};
export const CALL_END_MARGIN_MIN = 15;

function sastParts(ms: number) {
  const d = new Date(ms + SAST_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** True when a call may START at this instant (inside the CPA window, with room to finish). */
export function inCallWindow(ms: number): boolean {
  const { date, dow, minutes } = sastParts(ms);
  const w = WINDOWS[dow];
  if (!w || ZA_HOLIDAYS.has(date)) return false;
  return minutes >= w[0] && minutes <= w[1] - CALL_END_MARGIN_MIN;
}

/** First instant >= fromMs at which a call may start. Scans at most 14 days. */
export function nextCallWindow(fromMs: number): number {
  if (inCallWindow(fromMs)) return fromMs;
  const startOfSastDay = (ms: number) => ms - ((ms + SAST_OFFSET_MS) % 86400_000);
  let day = startOfSastDay(fromMs);
  for (let i = 0; i < 15; i++, day += 86400_000) {
    const { date, dow } = sastParts(day);
    const w = WINDOWS[dow];
    if (!w || ZA_HOLIDAYS.has(date)) continue;
    const open = day + w[0] * 60_000;
    const lastStart = day + (w[1] - CALL_END_MARGIN_MIN) * 60_000;
    if (fromMs <= lastStart) return Math.max(open, fromMs);
  }
  throw new Error("no call window in 14 days");
}

// A missed call is called back no sooner than this (the caller may ring again).
export const CALLBACK_DELAY_MS = 5 * 60_000;
// Inbound calls shorter than this, with no caller speech, count as missed/abandoned.
export const MISSED_MAX_SECS = 20;
export const MAX_AUTO_CALLBACKS_PER_24H = 1;

export function callbackDueAt(missedAtMs: number): number {
  return nextCallWindow(missedAtMs + CALLBACK_DELAY_MS);
}

/**
 * Dial-time cap: true when another automatic callback to this number was dialled in the 24 h before `nowMs`.
 * The schedule-time check alone misses callbacks that were scheduled more than 24 h apart but fall due together.
 */
export function dialedWithin24h(others: { id: string; metadata?: { dialed_at?: string } | null }[], selfId: string, nowMs: number): boolean {
  return others.some((o) => o.id !== selfId && !!o.metadata?.dialed_at && nowMs - Date.parse(o.metadata.dialed_at) < 24 * 3600_000);
}

/**
 * Schedule-time cap: a callback counts towards the 24 h limit unless it was cancelled without ever being dialled
 * (e.g. while SMC_CALLBACKS_ENABLED was off). Without this, a missed call during an "off" spell blocked the next
 * real callback to that number for a day (KG's test, 21 Oct 2026).
 */
export function countsTowardCap(metadata?: { state?: string; dialed_at?: string } | null): boolean {
  return !(metadata?.state === "cancelled" && !metadata?.dialed_at);
}

/** "2026-10-14T10:00:00+02:00"-style SAST string, for logs and CRM notes. */
export function sastIso(ms: number): string {
  return new Date(ms + SAST_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, "+02:00");
}

export function spokenSast(ms: number): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ms)).replace(",", "");
}

// ---------------------------------------------------------------------------- answers -> CRM columns

/** Age band words -> leads.age_band. Only 35_44 and 45_50 are inside SortMyCover's criteria. */
export function ageBand(raw: unknown): "lt35" | "35_44" | "45_50" | "51plus" | null {
  const s = String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/^(lt35|under 35|younger than 35|below 35)/.test(s)) return "lt35";
  if (/^(51plus|over 50|older than 50|above 50|51)/.test(s)) return "51plus";
  if (/^(35_44|35 ?(to|-) ?44)/.test(s)) return "35_44";
  if (/^(45_50|45 ?(to|-) ?50)/.test(s)) return "45_50";
  const n = Number(s.match(/\d{2}/)?.[0]);
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 35 ? "lt35" : n <= 44 ? "35_44" : n <= 50 ? "45_50" : "51plus";
}

// 18 Oct 2026 (Jono): every age group books with the adviser and counts; the age is still asked. Kept as a set so the
// out_of_criteria plumbing (classifyOutcome, POPIA minimality in smc-voice) stays in place should a band ever be closed again.
export const IN_CRITERIA = new Set(["lt35", "35_44", "45_50", "51plus"]);

/** Budget band words -> leads.budget_band (null = "not sure"). */
export function budgetBand(raw: unknown): "lt750" | "750_1499" | "1500_plus" | null {
  const s = String(raw ?? "").toLowerCase().replace(/[\s,]/g, "").replace(/r(?=\d)/g, "");
  if (!s || /notsure|unsure|dontknow|prefer/.test(s)) return null;
  if (/^(lt750|under750|lessthan750|below750)/.test(s)) return "lt750";
  if (/^(750_1499|750(to|-)1499|750(to|-)1500)/.test(s)) return "750_1499";
  if (/^(1500_plus|1500plus|1500ormore|over1500|morethan1500|1500\+)/.test(s)) return "1500_plus";
  return null;
}

const HELP: Array<[RegExp, string]> = [
  [/will|estate/, "wills"],
  [/income/, "income_protection"],
  [/severe|critical|dread|illness/, "severe_illness"],
  [/disab/, "disability"],
  [/funeral/, "funeral"],
  [/life/, "life_cover"],
];

/** Free text "what they want help with" -> canonical topics (first match order kept). */
export function helpTopics(raw: unknown): string[] {
  const s = String(raw ?? "").toLowerCase();
  const out: string[] = [];
  for (const [re, topic] of HELP) if (re.test(s) && !out.includes(topic)) out.push(topic);
  return out.length ? out : ["not_sure"];
}

/** Topics -> leads.reasons (constrained list) and leads.product_interest. */
export function leadInterest(topics: string[]) {
  const reasons = new Set<string>();
  for (const t of topics) {
    if (t === "life_cover") reasons.add("life_cover");
    else if (t === "funeral") reasons.add("funeral_cover");
    else if (t === "disability") reasons.add("disability");
    else if (t !== "wills") reasons.add("other");
  }
  const willsOnly = topics.length > 0 && topics.every((t) => t === "wills");
  return { reasons: [...reasons], product_interest: willsOnly ? "wills" : "life_cover" };
}

// ---------------------------------------------------------------------------- lead token (CONTRACTS.md I-29)

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** lt1.<lead_id>.<exp>.<sig>, identical to automation/security/lead-token.js mintLeadToken. */
export async function mintLeadToken(leadId: string, secret: string, nowMs = Date.now(), ttlSeconds = 14 * 86400): Promise<string> {
  if (!secret || secret.length < 32) throw new Error("lead token secret too short");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) throw new Error("lead_id not token-safe");
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${leadId}|${exp}`));
  return `lt1.${leadId}.${exp}.${b64url(sig)}`;
}

// ---------------------------------------------------------------------------- signatures

async function hmac(alg: "SHA-1" | "SHA-256", secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: alg }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Twilio X-Twilio-Signature: base64(HMAC-SHA1(token, url + sorted key+value pairs)). */
/** X-Twilio-Signature for a form POST: base64 HMAC-SHA1(token, url + sorted key/value pairs). */
export async function twilioSignature(token: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return btoa(String.fromCharCode(...(await hmac("SHA-1", token, data))));
}

export async function twilioSignatureOk(token: string, url: string, params: Record<string, string>, signature: string): Promise<boolean> {
  if (!token || !signature) return false;
  return safeEqual(await twilioSignature(token, url, params), signature);
}

/** ElevenLabs-Signature: "t=<unix>,v0=<hex HMAC-SHA256(secret, `${t}.${body}`)>", 30-minute tolerance. */
export async function elevenSignatureOk(secret: string, header: string, body: string, nowMs = Date.now()): Promise<boolean> {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > 30 * 60 || !parts.v0) return false;
  const mac = await hmac("SHA-256", secret, `${t}.${body}`);
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(hex, parts.v0);
}

// ---------------------------------------------------------------------------- post-call classification

export type Outcome = "booked" | "whatsapp_handoff" | "callback_requested" | "out_of_criteria" | "no_answer" | "missed" | "info_only";

type Turn = { role: string; message?: string | null; tool_calls?: unknown[]; tool_results?: ToolResult[] };
type ToolResult = { tool_name?: string; result_value?: unknown; result?: unknown };
type ToolOut = { ok?: boolean; out_of_criteria?: boolean; [k: string]: unknown };

function toolResults(transcript: Turn[], name: string): ToolOut[] {
  const out: ToolOut[] = [];
  for (const t of transcript ?? []) {
    for (const r of t.tool_results ?? []) {
      if (r?.tool_name !== name) continue;
      let v = r.result_value ?? r.result;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep string */ } }
      out.push(v as ToolOut);
    }
  }
  return out;
}

export function userTurns(transcript: Turn[]): number {
  return (transcript ?? []).filter((t) => t.role === "user" && String(t.message ?? "").trim().length > 1).length;
}

/**
 * Tool results are the truth (a booking only counts when book_appointment said ok);
 * the agent's own data-collection "outcome" fills the gaps.
 */
export function classifyOutcome(
  transcript: Turn[],
  collected: Record<string, unknown>,
  callType: string,
  durationSecs: number,
): Outcome {
  if (toolResults(transcript, "book_appointment").some((r) => r?.ok === true)) return "booked";
  if (toolResults(transcript, "send_whatsapp_followup").some((r) => r?.ok === true)) return "whatsapp_handoff";
  if (toolResults(transcript, "request_callback").some((r) => r?.ok === true)) return "callback_requested";
  if (toolResults(transcript, "save_caller_details").some((r) => r?.out_of_criteria === true)) return "out_of_criteria";
  const said = String(collected.outcome ?? "").toLowerCase();
  if (said === "out_of_criteria") return "out_of_criteria";
  // Nobody spoke: a callback nobody took, or an inbound caller who hung up before talking.
  if (userTurns(transcript) === 0) return callType === "callback" ? "no_answer" : "missed";
  // A caller who said a word and hung up inside the greeting is still a missed call.
  if (callType !== "callback" && durationSecs > 0 && durationSecs <= MISSED_MAX_SECS && userTurns(transcript) <= 1) return "missed";
  return "info_only";
}

export function transcriptText(transcript: Turn[]): string {
  return (transcript ?? [])
    .filter((t) => String(t.message ?? "").trim())
    .map((t) => `${t.role === "agent" ? "Lindi" : "Caller"}: ${String(t.message).trim()}`)
    .join("\n");
}

// ---------------------------------------------------------------------------- lead timeline + contact stamp

/**
 * The lead_activities row for an automatic callback that ended without a conversation (no answer) or was
 * cancelled. Null when the callback has no lead (an unknown caller): lead_activities needs a lead or a broker.
 * One row per callback: the key is per callback id and the insert ignores duplicates.
 */
export function callbackClosedActivity(
  callbackId: string,
  leadId: string | null | undefined,
  result: "no_answer" | "cancelled",
  detail: string | null,
): { type: string; key: string; notes: string; payload: Record<string, unknown> } | null {
  if (!leadId || !callbackId) return null;
  const why = detail ? ` (${detail})` : "";
  return result === "no_answer"
    ? { type: "voice_callback_no_answer", key: `smcvoice:cbna:${callbackId}`, notes: `Automatic callback was not answered${why}.`,
      payload: { callback_id: callbackId, result: detail } }
    : { type: "voice_callback_cancelled", key: `smcvoice:cbcancel:${callbackId}`, notes: `Automatic callback cancelled${why}.`,
      payload: { callback_id: callbackId, reason: detail } };
}

/**
 * leads.last_contact_at for a finished call: the call's end time (so a retried webhook writes the same value),
 * or now when ElevenLabs gave no start time. The caller updates only when this is later than what is stored.
 */
export function callContactAt(startedMs: number, durationSecs: number, nowMs = Date.now()): string {
  const end = startedMs > 0 ? startedMs + Math.max(0, durationSecs) * 1000 : nowMs;
  return new Date(Math.min(end, nowMs)).toISOString();
}

// ---------------------------------------------------------------------------- contact route (WhatsApp or team call-back)

export type ContactRoute = "whatsapp" | "callback";

/**
 * Which consent save_caller_details was given (Jono, 21 Oct 2026): a yes to WhatsApp, or (after a no to WhatsApp) a yes to a
 * call-back from the SortMyCover team. WhatsApp wins if both are 'yes'. Null = no consent, nothing may be saved.
 */
export function voiceContactRoute(p: { whatsapp_consent?: unknown; callback_consent?: unknown }): ContactRoute | null {
  const yes = (v: unknown) => String(v ?? "").trim().toLowerCase() === "yes";
  return yes(p.whatsapp_consent) ? "whatsapp" : yes(p.callback_consent) ? "callback" : null;
}

/** WhatsApp needs an SA mobile (+27 6x/7x/8x); a team call-back takes any SA number, landlines included (+27 1x-8x). */
export function voicePhoneOk(phone: string | null | undefined, route: ContactRoute): boolean {
  if (!phone) return false;
  return route === "whatsapp" ? /^\+27[6-8]\d{8}$/.test(phone) : /^\+27[1-8]\d{8}$/.test(phone);
}

/** leads.line_type for an SA E.164 number: 06x/07x/081-084 mobile, 087 VoIP, 01x-05x landline. */
export function zaLineType(phone: string | null | undefined): "mobile" | "landline" | "voip" | "unknown" {
  if (!phone) return "unknown";
  if (/^\+27(6\d|7\d|8[1-4])\d{7}$/.test(phone)) return "mobile";
  if (/^\+2787\d{7}$/.test(phone)) return "voip";
  if (/^\+27[1-5]\d{8}$/.test(phone)) return "landline";
  return "unknown";
}

/**
 * Who hears about a call-back request: the team inbox plus Jono and KG, through team-notify (Resend, from howzit@).
 * Every address must be in team-notify's TEAM list, or team-notify refuses the send.
 */
export const SMC_CALLBACK_ALERT_TO = ["howzit@leadvelocity.co.za", "jonojettoo@leadvelocity.co.za"];
export const SMC_CALLBACK_ALERT_CC = ["kgomotsopule@leadvelocity.co.za"];

/** The internal email for a call-back request. Team-only, so it carries the number to call; never health, ID or banking details. */
export function callbackAlertEmail(a: {
  firstName: string; phoneSpoken: string; lineType: string; preferredTime: string | null; helpWith: string[];
  conversationId: string; leadId: string; atMs: number; synthetic?: boolean;
}): { subject: string; text: string } {
  const test = a.synthetic ? "[TEST] " : "";
  return {
    subject: `${test}SortMyCover call-back: ${a.firstName} on ${a.phoneSpoken}`.slice(0, 200),
    text: [
      `${a.firstName} called SortMyCover, said no to WhatsApp and asked for a call-back from the SortMyCover team (Lindi, phone).`,
      "",
      `Call: ${a.phoneSpoken} (${a.lineType})`,
      `Best time of day: ${a.preferredTime || "not given"}`,
      `Wants help with: ${a.helpWith.join(", ").replace(/_/g, " ") || "not sure"}`,
      `Asked at: ${spokenSast(a.atMs)} (SAST)`,
      "",
      "This is a SortMyCover team call, not the adviser: the lead is not routed and no adviser details were shared.",
      "Call inside CPA hours (Mon-Fri 08:00-20:00, Sat 09:00-13:00, not Sundays or public holidays). Don't WhatsApp them: they declined it.",
      "",
      `Lead: ${a.leadId}`,
      `Conversation: ${a.conversationId} (transcript on the lead's call record)`,
    ].join("\n"),
  };
}
