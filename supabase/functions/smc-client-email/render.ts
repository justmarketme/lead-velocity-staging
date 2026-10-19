// smc-client-email renderer: the SortMyCover booking emails a CLIENT gets (confirmed / updated / cancelled).
// Pure: values in, { subject, html, text, attachments } out. No Deno or Node APIs beyond the web platform (btoa,
// TextEncoder); its one import is the import-free layout, so `deno test` and `node --test` both run smc_client_email.test.ts.
//
// Layout (19 Oct 2026, Jono: match the site "to the T"): _shared/smc_layout.ts, the site's tokens (white base, navy text and
// wordmark band, logo yellow only as the accent, DM Sans + the Instrument Serif headline accent, pill buttons), with a
// footer that never names the operating company (disclosure-wording.md DW-v2: the company appears only on the privacy
// notice and terms). Copy rules (Jono, 17 Oct 2026): no price or "free" language, no AI / assistant / Lead Velocity
// wording, SortMyCover is not an FSP and introduces the client to an authorised adviser (name, practice, FSP number),
// the calendar invite comes from the adviser's own calendar and the client is asked to accept it, time in SAST,
// reschedule by WhatsApp to SortMyCover +27 60 015 6480, privacy notice link and the POPIA line.

import { escHtml, smcButtons, smcHeading, smcP, smcPanel, smcShell, LINK_STYLE, P_STYLE, WORDMARK_URL, type SmcButton } from "../_shared/smc_layout.ts";

export const SMC_FROM = "SortMyCover <hello@sortmycover.co.za>";
export const SMC_REPLY_TO = "hello@sortmycover.co.za";
export const SITE = "https://sortmycover.co.za";
export const PRIVACY_URL = "https://sortmycover.co.za/privacy/";
/** The site wordmark (white, on the navy header band). */
export const LOGO_URL = WORDMARK_URL;
export const WHATSAPP_DISPLAY = "+27 60 015 6480";
export const WHATSAPP_LINK = "https://wa.me/27600156480";

export const KINDS = ["booking_confirmed", "booking_updated", "booking_cancelled"] as const;
export type Kind = typeof KINDS[number];
/** appointments.method values (automation/lib/w05.mjs METHODS). */
export const METHODS = ["teams", "zoom", "meet", "whatsapp_call", "phone"] as const;
export type Method = typeof METHODS[number];
/** Where the calendar entry comes from: the adviser's own Outlook (Exchange meeting request) or a file attached here. */
export const INVITES = ["adviser", "attached"] as const;
export type Invite = typeof INVITES[number];

const ONLINE = new Set<string>(["teams", "zoom", "meet"]);
const METHOD_LABEL: Record<Method, string> = {
  teams: "Microsoft Teams video call", zoom: "Zoom video call", meet: "Google Meet video call", whatsapp_call: "WhatsApp call", phone: "Phone call",
};
const SHORT_LABEL: Record<Method, string> = { teams: "Teams", zoom: "Zoom", meet: "Google Meet", whatsapp_call: "WhatsApp", phone: "phone" };


export interface ClientEmailInput {
  kind: Kind;
  to: string;
  lead_first_name: string;
  slot_start: string;
  slot_end?: string;
  method: Method;
  adviser_name: string;
  practice_name: string;
  fsp_number: string;
  join_url?: string;
  booking_id?: string;
  calendar_invite?: Invite;
  idempotency_key?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; content: string; content_type: string }>;
}

// ------------------------------------------------------------------ validation
const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const FSP_RE = /^[A-Za-z0-9][A-Za-z0-9 /-]{0,19}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[A-Za-z0-9:._-]{1,200}$/;
/** One line of free text: control characters and line breaks out, spaces collapsed, length capped. */
const line = (v: unknown, max = 120) => String(v ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const httpsUrl = (v: string) => { try { const u = new URL(v); return u.protocol === "https:" && !/["'<>\s]/.test(v) && v.length <= 2000; } catch { return false; } };

/** Body JSON -> { ok: true, input } (normalised) | { ok: false, errors: [field, ...] }. Nothing is guessed. */
export function validate(body: unknown): { ok: true; input: ClientEmailInput } | { ok: false; errors: string[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const kind = String(b.kind ?? "");
  if (!(KINDS as readonly string[]).includes(kind)) errors.push("kind");
  const to = String(b.to ?? "").trim().toLowerCase();
  if (to.length > 254 || !EMAIL_RE.test(to)) errors.push("to");
  if (b.lead_first_name !== undefined && b.lead_first_name !== null && typeof b.lead_first_name !== "string") errors.push("lead_first_name");
  const start = String(b.slot_start ?? "");
  if (!ISO_RE.test(start) || Number.isNaN(Date.parse(start))) errors.push("slot_start");
  let end = b.slot_end == null || b.slot_end === "" ? "" : String(b.slot_end);
  if (end && (!ISO_RE.test(end) || Number.isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start))) errors.push("slot_end");
  if (!end && !errors.includes("slot_start")) end = new Date(Date.parse(start) + 30 * 60_000).toISOString();
  const method = String(b.method ?? "");
  if (!(METHODS as readonly string[]).includes(method)) errors.push("method");
  const adviser = line(b.adviser_name, 80);
  if (!adviser) errors.push("adviser_name");
  const practice = line(b.practice_name, 120);
  if (!practice) errors.push("practice_name");
  const fsp = line(b.fsp_number, 20);
  if (!FSP_RE.test(fsp)) errors.push("fsp_number");
  const join = b.join_url == null || b.join_url === "" ? "" : String(b.join_url).trim();
  if (join && !httpsUrl(join)) errors.push("join_url");
  const bookingId = b.booking_id == null || b.booking_id === "" ? "" : String(b.booking_id);
  if (bookingId && !ID_RE.test(bookingId)) errors.push("booking_id");
  const invite = b.calendar_invite == null || b.calendar_invite === "" ? "adviser" : String(b.calendar_invite);
  if (!(INVITES as readonly string[]).includes(invite)) errors.push("calendar_invite");
  const key = b.idempotency_key == null || b.idempotency_key === "" ? "" : String(b.idempotency_key);
  if (key && !KEY_RE.test(key)) errors.push("idempotency_key");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      kind: kind as Kind, to, lead_first_name: line(b.lead_first_name, 60), slot_start: new Date(Date.parse(start)).toISOString(), slot_end: new Date(Date.parse(end)).toISOString(),
      method: method as Method, adviser_name: adviser, practice_name: practice, fsp_number: fsp,
      ...(join ? { join_url: join } : {}), ...(bookingId ? { booking_id: bookingId } : {}), calendar_invite: invite as Invite,
      ...(key ? { idempotency_key: key } : {}),
    },
  };
}

// ------------------------------------------------------------------ time (SAST = UTC+2 all year, no DST)
const SAST_MS = 2 * 3600_000;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const sast = (iso: string) => new Date(Date.parse(iso) + SAST_MS);
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
/** "Tuesday 21 October 2026" */
export const dayText = (iso: string) => { const d = sast(iso); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
/** "10:00 to 10:30 (South African time)" */
export const timeText = (startIso: string, endIso: string) => `${hhmm(sast(startIso))} to ${hhmm(sast(endIso))} (South African time)`;
/** "Tue 21 Oct at 10:00" (subject line) */
export const shortWhen = (iso: string) => { const d = sast(iso); return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} at ${hhmm(d)}`; };

// ------------------------------------------------------------------ .ics (RFC 5545, same UID as W05's /c/{booking_id} file)
const BS = String.fromCharCode(92);
const icsText = (v: string) => v.split(BS).join(BS + BS).replace(/;/g, BS + ";").replace(/,/g, BS + ",").replace(/\r?\n/g, BS + "n");
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Lines over 75 octets are folded (CRLF + space) without splitting a UTF-8 character. */
export function icsFold(s: string): string {
  const enc = new TextEncoder();
  const out: string[] = []; let cur = ""; let bytes = 0;
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
/** FNV-1a, only for a stable UID when no booking id is given (not a security function). */
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
const firstWord = (s: string) => s.trim().split(/\s+/)[0] || s;
/** The end of the call: slot_end, or start + 30 minutes when a caller leaves it out (validate() already fills it in). */
export const endOf = (i: Pick<ClientEmailInput, "slot_start" | "slot_end">) =>
  i.slot_end && !Number.isNaN(Date.parse(i.slot_end)) ? i.slot_end : new Date(Date.parse(i.slot_start) + 30 * 60_000).toISOString();

export function icsFor(i: ClientEmailInput, nowMs: number): string {
  const uid = `${i.booking_id || `smc-${fnv(`${i.to}|${i.slot_start}`)}`}@sortmycover.co.za`;
  const cancelled = i.kind === "booking_cancelled";
  const where = i.join_url || METHOD_LABEL[i.method];
  const desc = [`Your SortMyCover call with ${i.adviser_name} (${i.practice_name}, FSP ${i.fsp_number}).`, ...(i.join_url ? [`Join: ${i.join_url}`] : []),
    `To change the time, reply to SortMyCover on WhatsApp: ${WHATSAPP_DISPLAY}.`].join("\n");
  // SEQUENCE: 0 for the first copy; later copies use minutes since the epoch so each update outranks the one before.
  // DTSTAMP is minute-aligned (the first copy uses the start, as W05's icsFile does) so an n8n retry sends the same bytes
  // under the same Resend Idempotency-Key.
  const minute = Math.floor(nowMs / 60_000);
  const seq = i.kind === "booking_confirmed" ? 0 : minute;
  const stamp = i.kind === "booking_confirmed" ? i.slot_start : new Date(minute * 60_000).toISOString();
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SortMyCover//Client email//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${uid}`, `DTSTAMP:${icsTime(stamp)}`, `DTSTART:${icsTime(i.slot_start)}`, `DTEND:${icsTime(endOf(i))}`,
    `SUMMARY:${icsText(`${cancelled ? "Cancelled: " : ""}Your call with ${firstWord(i.adviser_name)}`)}`, `LOCATION:${icsText(where)}`,
    `DESCRIPTION:${icsText(desc)}`, ...(i.join_url ? [`URL:${i.join_url}`] : []), `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`, `SEQUENCE:${seq}`,
    "END:VEVENT", "END:VCALENDAR"].map(icsFold).join("\r\n") + "\r\n";
}
const b64 = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ""; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin); };

// ------------------------------------------------------------------ copy
export const esc = escHtml;

/** The parts of one email, as plain sentences; html() and text() lay out the same parts, so both always say the same thing. */
export function copyFor(i: ClientEmailInput) {
  const first = i.lead_first_name ? firstWord(i.lead_first_name) : "there";
  const adviserFirst = firstWord(i.adviser_name);
  const how = METHOD_LABEL[i.method];
  const day = dayText(i.slot_start);
  const time = timeText(i.slot_start, endOf(i));
  const who = `${i.adviser_name}, ${i.practice_name} (FSP ${i.fsp_number})`;
  const adviser = i.calendar_invite === "adviser";
  const online = ONLINE.has(i.method);
  const k = i.kind;

  const eyebrow = k === "booking_confirmed" ? "Booking confirmed" : k === "booking_updated" ? "Booking updated" : "Booking cancelled";
  const accent = k === "booking_confirmed" ? "booked" : k === "booking_updated" ? "updated" : "cancelled";
  const title = k === "booking_confirmed" ? "Your call is booked" : k === "booking_updated" ? "Your call has been updated" : "Your call has been cancelled";
  const subject = `${k === "booking_confirmed" ? "Booked" : k === "booking_updated" ? "Updated" : "Cancelled"}: your call with ${adviserFirst} on ${shortWhen(i.slot_start)}`;
  const intro = k === "booking_confirmed"
    ? `SortMyCover has introduced you to ${i.adviser_name} from ${i.practice_name}, an authorised financial services provider (FSP ${i.fsp_number}), and your call is booked.`
    : k === "booking_updated"
      ? `Your call with ${i.adviser_name} from ${i.practice_name}, an authorised financial services provider (FSP ${i.fsp_number}), has changed. These are the details now.`
      : `Your call with ${i.adviser_name} from ${i.practice_name} (FSP ${i.fsp_number}) on ${day}, ${time} has been cancelled.`;

  let calendar: string;
  if (k === "booking_cancelled") calendar = adviser ? `${adviserFirst}'s calendar will send the cancellation. You can remove the invite from your calendar.` : "The attached calendar file marks the call as cancelled in your calendar.";
  else if (adviser) calendar = k === "booking_confirmed"
    ? `A calendar invite is on its way from ${adviserFirst}'s own calendar. Please accept it so the time is held for you.`
    : `An updated calendar invite is on its way from ${adviserFirst}'s own calendar. Please accept it so the new details are held for you.`;
  else calendar = k === "booking_confirmed" ? "The calendar file is attached. Open it to add the call to your calendar." : "An updated calendar file is attached. Open it to update the call in your calendar.";

  let joining: string | null = null;
  if (k !== "booking_cancelled") {
    if (online) joining = i.join_url ? `Join the ${SHORT_LABEL[i.method]} call with this link at the time: ${i.join_url}` : adviser ? "The joining link is in the calendar invite." : `${adviserFirst} will send you the ${SHORT_LABEL[i.method]} link before the call.`;
    else joining = i.method === "phone" ? `${adviserFirst} will phone you at that time on the number you gave us.` : `${adviserFirst} will call you on WhatsApp at that time.`;
  }
  const change = k === "booking_cancelled"
    ? `Would you like another time? Reply to SortMyCover on WhatsApp on ${WHATSAPP_DISPLAY} and we will find one with ${adviserFirst}.`
    : `Need another time? Reply to SortMyCover on WhatsApp on ${WHATSAPP_DISPLAY} and we will move it for you.`;
  const details: Array<[string, string]> = [["When", `${day}, ${time}`], ["How", how], ["Adviser", who]];
  const disclosure = "SortMyCover is not a financial services provider. We introduce you to an authorised financial adviser and give no financial advice, product comparisons or premium quotes. Authorised financial advisers do.";
  const popia = "We handle your personal information under POPIA. It goes only to the adviser you were introduced to and is never sold.";
  const why = "You are getting this email because you booked a call through SortMyCover.";
  const preheader = k === "booking_cancelled" ? `Your call with ${adviserFirst} on ${shortWhen(i.slot_start)} is cancelled.` : `${i.adviser_name}, ${day}, ${time}, ${how}.`;
  return { first, subject, eyebrow, title, accent, intro, calendar, joining, change, details, disclosure, popia, why, preheader, adviserFirst };
}

// ------------------------------------------------------------------ layout
function html(i: ClientEmailInput, c: ReturnType<typeof copyFor>): string {
  const join = i.kind !== "booking_cancelled" && i.join_url && ONLINE.has(i.method) ? i.join_url : null;
  const joiningHtml = c.joining ? (join
    ? `<p style="${P_STYLE}">${esc(`Join the ${SHORT_LABEL[i.method]} call with the button below at the time.`)} Link: <a href="${esc(join)}" style="${LINK_STYLE};word-break:break-all">${esc(join)}</a></p>`
    : smcP(c.joining)) : "";
  const body = [smcP(`Hi ${c.first},`), smcP(c.intro), i.kind === "booking_cancelled" ? "" : smcPanel(c.details), smcP(c.calendar), joiningHtml, smcP(c.change)].join("");
  // the WhatsApp number never breaks across lines
  const bodyHtml = body.split(esc(WHATSAPP_DISPLAY)).join(WHATSAPP_DISPLAY.replace(/ /g, "&nbsp;"));
  const buttons: SmcButton[] = [...(join ? [{ href: join, label: "Join the call" }] : []), { href: WHATSAPP_LINK, label: "Message us on WhatsApp", secondary: !!join }];
  const muted = `color:inherit;text-decoration:underline`;
  return smcShell({
    docTitle: `${c.title} | SortMyCover`, preheader: c.preheader, eyebrow: c.eyebrow, headingHtml: smcHeading(c.title, c.accent),
    bodyHtml, actionsHtml: smcButtons(buttons),
    footerLines: [esc(c.disclosure), `${esc(c.popia)} <a href="${PRIVACY_URL}" style="${muted}">Privacy notice</a>`, esc(c.why),
      `<a href="${SITE}" style="${muted}">sortmycover.co.za</a> &middot; <a href="mailto:${SMC_REPLY_TO}" style="${muted}">${SMC_REPLY_TO}</a> &middot; WhatsApp ${esc(WHATSAPP_DISPLAY)}`],
  });
}

function text(i: ClientEmailInput, c: ReturnType<typeof copyFor>): string {
  const details = i.kind === "booking_cancelled" ? [] : [c.details.map(([k, v]) => `${k}: ${v}`).join("\n")];
  return [c.title, `Hi ${c.first},`, c.intro, ...details, c.calendar, ...(c.joining ? [c.joining] : []), `${c.change}\n${WHATSAPP_LINK}`,
    "Kind regards,\nThe SortMyCover team",
    `${c.disclosure}\n${c.popia}\nPrivacy notice: ${PRIVACY_URL}\n${c.why}\nsortmycover.co.za | ${SMC_REPLY_TO} | WhatsApp ${WHATSAPP_DISPLAY}`].join("\n\n") + "\n";
}

/** The email for a validated input. nowMs only stamps the .ics (DTSTAMP / SEQUENCE). */
export function render(i: ClientEmailInput, nowMs = Date.now()): RenderedEmail {
  const c = copyFor(i);
  const attachments = i.calendar_invite === "attached"
    ? [{ filename: "sortmycover-call.ics", content: b64(icsFor(i, nowMs)), content_type: "text/calendar; charset=utf-8; method=PUBLISH" }] : [];
  return { subject: c.subject, html: html(i, c), text: text(i, c), attachments };
}

/** The Resend POST /emails body. Tags let the Resend log be filtered by kind and booking (no personal data in them). */
export function resendBody(i: ClientEmailInput, nowMs = Date.now()) {
  const m = render(i, nowMs);
  return {
    from: SMC_FROM, to: [i.to], reply_to: SMC_REPLY_TO, subject: m.subject, html: m.html, text: m.text,
    ...(m.attachments.length ? { attachments: m.attachments } : {}),
    tags: [{ name: "kind", value: i.kind }, ...(i.booking_id ? [{ name: "booking_id", value: i.booking_id }] : [])],
  };
}
