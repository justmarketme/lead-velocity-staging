// Pure helpers for manual appointment allocation (edge function appointment-allocation). No network, no Deno APIs,
// so Node (>= 23, type stripping) runs the tests: node supabase/functions/_shared/appointment_alloc.test.ts
//
// iCalendar (RFC 5545) + iTIP (RFC 5546): METHOD:REQUEST invites the attendees; METHOD:CANCEL with the SAME UID and a
// higher SEQUENCE removes it from their calendars. SortMyCover is in South Africa (Africa/Johannesburg, UTC+2, no DST since
// 1944), so local times carry TZID=Africa/Johannesburg with a fixed VTIMEZONE block.

export const TZID = "Africa/Johannesburg";
export const SAST_OFFSET_MS = 2 * 3600_000;
export const ORGANIZER = { name: "SortMyCover (Lead Velocity)", email: "howzit@leadvelocity.co.za" };
export const METHODS = ["teams", "zoom", "meet", "whatsapp_call", "phone"] as const;
export const METHOD_LABEL: Record<string, string> = {
  teams: "Microsoft Teams", zoom: "Zoom", meet: "Google Meet", whatsapp_call: "WhatsApp call", phone: "Phone call",
};
/** booking_confirmed {{5}} ("by phone call", template example) */
export const CONFIRM_LABEL: Record<string, string> = {
  teams: "Microsoft Teams", zoom: "Zoom", meet: "Google Meet", whatsapp_call: "WhatsApp call", phone: "phone call",
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Stable per appointment: re-allocation and cancel reuse it, so calendars update the same event instead of adding one. */
export const appointmentUid = (appointmentId: string) => `${appointmentId}@leadvelocity.co.za`;

/** SAST wall clock of an instant. */
function sastParts(t: string | number | Date) {
  const d = new Date(new Date(t).getTime() + SAST_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() };
}
/** 20261015T100000 (local SAST, for DTSTART;TZID=Africa/Johannesburg) */
export function icsLocal(t: string | number | Date): string {
  const p = sastParts(t);
  return `${p.y}${pad(p.mo + 1)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}${pad(p.s)}`;
}
/** 20261015T080000Z (UTC, for DTSTAMP) */
export function icsUtc(t: string | number | Date): string {
  return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
/** "Wed 15 Oct" in SAST */
export function sastDay(t: string | number | Date): string {
  const p = sastParts(t);
  return `${DOW[p.dow]} ${p.d} ${MON[p.mo]}`;
}
/** "10:00" in SAST */
export function sastTime(t: string | number | Date): string {
  const p = sastParts(t);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** RFC 5545 TEXT escaping. */
export function icsEscape(s: string): string {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** RFC 5545 3.1: lines longer than 75 octets are folded (CRLF + one space), never inside a UTF-8 sequence. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curLen + n > limit) { out.push(cur); cur = ""; curLen = 0; }
    cur += ch; curLen += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const cn = (name: string) => `"${String(name || "").replace(/["\r\n]/g, "").slice(0, 80)}"`;

export interface IcsAttendee { name?: string; email: string; required?: boolean }
export interface IcsInput {
  appointmentId: string;
  method: "REQUEST" | "CANCEL";
  sequence: number;
  start: string;
  end: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  attendees: IcsAttendee[];
  organizer?: { name: string; email: string };
  stamp?: string | number | Date;
}

/** A complete VCALENDAR (CRLF line endings, folded), ready to attach as text/calendar; method=REQUEST|CANCEL. */
export function buildIcs(i: IcsInput): string {
  const org = i.organizer ?? ORGANIZER;
  const cancel = i.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Lead Velocity//SortMyCover allocation//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0200",
    "TZNAME:SAST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${appointmentUid(i.appointmentId)}`,
    `SEQUENCE:${Math.max(0, Math.floor(i.sequence || 0))}`,
    `DTSTAMP:${icsUtc(i.stamp ?? Date.now())}`,
    `DTSTART;TZID=${TZID}:${icsLocal(i.start)}`,
    `DTEND;TZID=${TZID}:${icsLocal(i.end)}`,
    `SUMMARY:${icsEscape((cancel ? "Cancelled: " : "") + i.summary)}`,
    i.description ? `DESCRIPTION:${icsEscape(i.description)}` : null,
    i.location ? `LOCATION:${icsEscape(i.location)}` : null,
    i.url ? `URL:${i.url}` : null,
    `ORGANIZER;CN=${cn(org.name)}:mailto:${org.email}`,
    ...i.attendees.map((a) =>
      `ATTENDEE;CN=${cn(a.name || a.email)};CUTYPE=INDIVIDUAL;ROLE=${a.required === false ? "OPT-PARTICIPANT" : "REQ-PARTICIPANT"};PARTSTAT=NEEDS-ACTION;RSVP=${cancel ? "FALSE" : "TRUE"}:mailto:${a.email}`),
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(cancel ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "TRIGGER:-PT15M", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------------------- requested windows
export interface RequestWindow { date?: string; part?: string; label?: string }
const PART: Record<string, string> = {
  morning: "morning", mornings: "morning", lunchtime: "lunchtime", afternoon: "afternoon", afternoons: "afternoon",
  evening: "evening", evenings: "evening", any: "any time",
};
/** Sanitised windows from untrusted input (page, voice tool): at most 6, date YYYY-MM-DD within ~60 days, known part. */
export function cleanWindows(raw: unknown, nowMs = Date.now()): RequestWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: RequestWindow[] = [];
  for (const w of raw.slice(0, 6)) {
    if (!w || typeof w !== "object") continue;
    const o = w as Record<string, unknown>;
    const part = typeof o.part === "string" && PART[o.part.toLowerCase()] ? o.part.toLowerCase().replace(/s$/, "") : "any";
    let date: string | undefined;
    if (typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) {
      const t = Date.parse(`${o.date}T12:00:00+02:00`);
      if (!Number.isNaN(t) && t > nowMs - 86400_000 && t < nowMs + 60 * 86400_000) date = o.date;
    }
    const label = typeof o.label === "string" ? o.label.replace(/[\r\n\t<>]+/g, " ").trim().slice(0, 60) : "";
    out.push({ ...(date ? { date } : {}), part: part === "any" ? "any" : part, ...(label ? { label } : {}) });
  }
  return out;
}
/** "Wed 15 Oct morning; any day afternoon" */
export function windowsText(ws: RequestWindow[] | null | undefined): string {
  if (!ws || !ws.length) return "any time";
  return ws.map((w) => {
    const day = w.date ? sastDay(`${w.date}T12:00:00+02:00`) : "any weekday";
    const part = PART[String(w.part || "any")] ?? "any time";
    return w.label ? `${w.label}` : `${day} ${part}`;
  }).join("; ");
}

// ---------------------------------------------------------------------------------------- invite content
export interface InviteContext {
  appointmentId: string;
  start: string;
  end: string;
  method: string;
  sequence: number;
  clientFirst: string;
  clientLast?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  brokerName: string;
  brokerEmail: string;
  joinUrl?: string | null;
  leadSummary?: string;
}

/** The broker's invite (email + .ics). The broker needs the client's number for a phone / WhatsApp call. */
export function brokerInvite(c: InviteContext, opts: { inviteClient: boolean; cancel?: boolean }) {
  const label = METHOD_LABEL[c.method] ?? c.method;
  const client = [c.clientFirst, c.clientLast].filter(Boolean).join(" ") || "SortMyCover client";
  const when = `${sastDay(c.start)} at ${sastTime(c.start)} (South African time)`;
  const how = c.method === "phone" ? `Call ${client} on ${c.clientPhone ?? "the number in the CRM"}.`
    : c.method === "whatsapp_call" ? `WhatsApp-call ${client} on ${c.clientPhone ?? "the number in the CRM"}.`
    : c.joinUrl ? `Join: ${c.joinUrl}`
    : `${label}: please send ${client} the meeting link${c.clientEmail ? ` (${c.clientEmail})` : ""}, or turn on "${label} meeting" in this invite and send the update.`;
  const summary = `SortMyCover call – ${c.clientFirst || "client"} – ${label}`;
  const description = [
    opts.cancel ? "This SortMyCover appointment has been cancelled." : "SortMyCover appointment allocated to you by Lead Velocity.",
    `Client: ${client}`,
    c.clientPhone ? `Mobile: ${c.clientPhone}` : null,
    c.clientEmail ? `Email: ${c.clientEmail}` : null,
    `When: ${when}`,
    `How: ${label}`,
    opts.cancel ? null : how,
    c.leadSummary ? `About the client: ${c.leadSummary}` : null,
    "The client's details are shared under their consent to be contacted by a SortMyCover adviser. Full record: https://leadvelocity.co.za/broker",
  ].filter(Boolean).join("\n");
  const attendees: IcsAttendee[] = [{ name: c.brokerName, email: c.brokerEmail }];
  if (opts.inviteClient && c.clientEmail) attendees.push({ name: client, email: c.clientEmail });
  const ics = buildIcs({
    appointmentId: c.appointmentId, method: opts.cancel ? "CANCEL" : "REQUEST", sequence: c.sequence, start: c.start, end: c.end,
    summary, description, location: c.joinUrl || label, url: c.joinUrl || undefined, attendees,
  });
  const subject = opts.cancel ? `Cancelled: ${summary} – ${sastDay(c.start)} ${sastTime(c.start)}` : `Invitation: ${summary} – ${when}`;
  const html = emailHtml(opts.cancel ? "Appointment cancelled" : "New SortMyCover appointment", description.split("\n"));
  return { ics, subject, html, text: description, summary };
}

/** The client's confirmation email (also carries the .ics so it lands in their calendar). */
export function clientConfirmation(c: InviteContext, opts: { cancel?: boolean } = {}) {
  const label = METHOD_LABEL[c.method] ?? c.method;
  const when = `${sastDay(c.start)} at ${sastTime(c.start)}`;
  const how = c.method === "phone" ? `${c.brokerName} will phone you on ${c.clientPhone ?? "your mobile"}.`
    : c.method === "whatsapp_call" ? `${c.brokerName} will WhatsApp-call you on ${c.clientPhone ?? "your mobile"}.`
    : c.joinUrl ? `Join the ${label} call here: ${c.joinUrl}` : `${c.brokerName} will send you the ${label} link before the call.`;
  const lines = opts.cancel
    ? [`Hi ${c.clientFirst || "there"},`, `Your SortMyCover call with ${c.brokerName} on ${when} has been cancelled.`, "Reply on WhatsApp if you'd like a new time."]
    : [`Hi ${c.clientFirst || "there"},`, `You're booked: ${c.brokerName} will meet you on ${when} (South African time) by ${label}.`, how, "Need to change it? Reply on WhatsApp and we'll sort it out."];
  const subject = opts.cancel ? `Cancelled: your SortMyCover call on ${when}` : `Booked: your SortMyCover call on ${when}`;
  const ics = buildIcs({
    appointmentId: c.appointmentId, method: opts.cancel ? "CANCEL" : "REQUEST", sequence: c.sequence, start: c.start, end: c.end,
    summary: `Your call with ${c.brokerName} (SortMyCover)`, description: lines.slice(1).join("\n"), location: c.joinUrl || label,
    url: c.joinUrl || undefined,
    attendees: c.clientEmail ? [{ name: c.clientFirst || c.clientEmail, email: c.clientEmail }] : [],
  });
  return { subject, html: emailHtml(opts.cancel ? "Call cancelled" : "Your call is booked", lines), text: lines.join("\n\n"), ics };
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function emailHtml(title: string, lines: string[]): string {
  const body = lines.map((l) => {
    const linked = esc(l).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#ff7a45">$1</a>');
    return `<p style="margin:0 0 12px;line-height:1.5">${linked}</p>`;
  }).join("");
  return `<!doctype html><html><body style="margin:0;background:#120c1f;font-family:Arial,Helvetica,sans-serif;color:#f4f1fa">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#120c1f;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1b1330;border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:linear-gradient(90deg,#ff3d8b,#ff7a45)"></td></tr>
<tr><td style="padding:24px 24px 8px"><h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:8px 24px 24px;font-size:12px;color:#a99cc4">SortMyCover · Lead Velocity · howzit@leadvelocity.co.za</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------------------- Microsoft Graph
/** POST /me/events body for a connected broker. Teams link generated by Graph (isOnlineMeeting) for Teams calls. */
export function graphEventBody(c: InviteContext, opts: { inviteClient: boolean }) {
  const inv = brokerInvite(c, { inviteClient: false });
  const attendees = opts.inviteClient && c.clientEmail && ["teams", "zoom", "meet"].includes(c.method)
    ? [{ emailAddress: { address: c.clientEmail, name: [c.clientFirst, c.clientLast].filter(Boolean).join(" ") || c.clientEmail }, type: "required" }]
    : [];
  return {
    subject: inv.summary,
    body: { contentType: "text", content: inv.text },
    start: { dateTime: `${icsLocalIso(c.start)}`, timeZone: "South Africa Standard Time" },
    end: { dateTime: `${icsLocalIso(c.end)}`, timeZone: "South Africa Standard Time" },
    attendees,
    isOnlineMeeting: c.method === "teams",
    ...(c.method === "teams" ? { onlineMeetingProvider: "teamsForBusiness" } : {}),
    transactionId: `lv-alloc-${c.appointmentId}-${c.sequence}`.slice(0, 64),
    reminderMinutesBeforeStart: 15,
    isReminderOn: true,
    location: { displayName: METHOD_LABEL[c.method] ?? c.method },
  };
}
/** 2026-10-15T10:00:00 (SAST wall clock, no offset: Graph pairs it with timeZone) */
export function icsLocalIso(t: string | number | Date): string {
  const p = sastParts(t);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
}

/** Lead summary line for the broker (no budget amounts beyond the band labels the broker already sees in the portal). */
export function leadSummary(l: Record<string, unknown> | null | undefined): string {
  if (!l) return "";
  const AGE: Record<string, string> = { lt35: "under 35", "35_44": "35-44", "45_50": "45-50", "51plus": "51+" };
  const BUD: Record<string, string> = { lt750: "under R750", "750_1499": "R750-R1,499", "1500_plus": "R1,500+", "750_1250": "R750-R1,250", "1250plus": "R1,250+", "1250_1499": "R1,250-R1,499" };
  const parts = [
    l.age_band ? `age ${AGE[String(l.age_band)] ?? l.age_band}` : null,
    l.budget_band ? `budget ${BUD[String(l.budget_band)] ?? l.budget_band}/month` : null,
    Array.isArray(l.reasons) && l.reasons.length ? `interested in ${(l.reasons as string[]).join(", ").replace(/_/g, " ")}` : null,
    l.lead_tier ? `${l.lead_tier}-tier` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

/** Bearer token from "lt1.<lead>.<exp>.<sig>" (automation/security/lead-token.js): HMAC-SHA256(secret, "<lead>|<exp>"), base64url. */
export async function verifyLeadToken(token: string, secrets: string[], nowMs = Date.now()): Promise<string | null> {
  const m = /^lt1\.([A-Za-z0-9_-]{1,64})\.(\d{9,11})\.([A-Za-z0-9_-]{20,100})$/.exec(String(token || ""));
  if (!m) return null;
  const [, lead, exp, sig] = m;
  if (Number(exp) * 1000 < nowMs) return null;
  for (const secret of secrets) {
    if (!secret || secret.length < 32) continue;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${lead}|${exp}`)));
    let b = "";
    for (const x of mac) b += String.fromCharCode(x);
    const want = btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (want.length === sig.length) {
      let r = 0;
      for (let k = 0; k < want.length; k++) r |= want.charCodeAt(k) ^ sig.charCodeAt(k);
      if (r === 0) return lead;
    }
  }
  return null;
}
