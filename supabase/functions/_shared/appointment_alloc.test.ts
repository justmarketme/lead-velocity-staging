// Run: node supabase/functions/_shared/appointment_alloc.test.ts  (Node >= 23 strips types natively)
import {
  appointmentUid, brokerInvite, buildIcs, cleanWindows, clientConfirmation, graphEventBody, icsFold, icsLocal, verifyLeadToken, windowsText,
} from "./appointment_alloc.ts";
import { mintLeadToken } from "./smc_voice_lib.ts";

let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}`, detail ?? ""); }
};
const unfold = (s: string) => s.replace(/\r\n /g, "");
const prop = (ics: string, name: string) => unfold(ics).split("\r\n").filter((l) => l.startsWith(name));

const ID = "0b3f6a52-7a1e-4c55-9d7e-1a2b3c4d5e6f";
const base = {
  appointmentId: ID, start: "2026-10-15T08:00:00.000Z", end: "2026-10-15T08:30:00.000Z", method: "teams", sequence: 1,
  clientFirst: "Lerato", clientLast: "Mokoena", clientPhone: "+27821234567", clientEmail: "lerato@example.com",
  brokerName: "Mark Weston", brokerEmail: "jono@vantagestack.co.za", leadSummary: "age 35-44",
};

// ---- ICS: structure
const inv = brokerInvite(base, { inviteClient: true });
const ics = inv.ics;
const lines = unfold(ics).split("\r\n");
ok("starts with BEGIN:VCALENDAR", lines[0] === "BEGIN:VCALENDAR");
ok("ends with END:VCALENDAR + CRLF", ics.endsWith("END:VCALENDAR\r\n"));
ok("VERSION 2.0 + PRODID", lines.includes("VERSION:2.0") && lines.some((l) => l.startsWith("PRODID:")));
ok("METHOD:REQUEST", lines.includes("METHOD:REQUEST"));
ok("CRLF line endings only", !/[^\r]\n/.test(ics));
ok("every physical line <= 75 octets", ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), ics.split("\r\n").filter((l) => l.length > 75));
const begins = lines.filter((l) => l.startsWith("BEGIN:")).map((l) => l.slice(6));
const ends = lines.filter((l) => l.startsWith("END:")).map((l) => l.slice(4));
ok("BEGIN/END balanced", JSON.stringify([...begins].sort()) === JSON.stringify([...ends].sort()), { begins, ends });
ok("one VEVENT", begins.filter((b) => b === "VEVENT").length === 1);

// ---- ICS: Africa/Johannesburg time (08:00Z = 10:00 SAST)
ok("DTSTART in SAST with TZID", prop(ics, "DTSTART;")[0] === "DTSTART;TZID=Africa/Johannesburg:20261015T100000", prop(ics, "DTSTART;"));
ok("DTEND in SAST with TZID", prop(ics, "DTEND;")[0] === "DTEND;TZID=Africa/Johannesburg:20261015T103000");
ok("VTIMEZONE Africa/Johannesburg +0200", lines.includes("TZID:Africa/Johannesburg") && lines.includes("TZOFFSETTO:+0200") && lines.includes("TZOFFSETFROM:+0200"));
ok("DTSTAMP is UTC", /^DTSTAMP:\d{8}T\d{6}Z$/.test(prop(ics, "DTSTAMP")[0]));
ok("late-evening UTC rolls to next SAST day", icsLocal("2026-10-15T23:30:00Z") === "20261016T013000");
ok("+02:00 input kept as wall clock", icsLocal("2026-10-15T14:00:00+02:00") === "20261015T140000");

// ---- ICS: organiser / attendees
ok("ORGANIZER howzit@", prop(ics, "ORGANIZER")[0]?.endsWith(":mailto:howzit@leadvelocity.co.za"), prop(ics, "ORGANIZER"));
const att = prop(ics, "ATTENDEE");
ok("broker attendee, required, RSVP", att.some((a) => a.endsWith(":mailto:jono@vantagestack.co.za") && a.includes("ROLE=REQ-PARTICIPANT") && a.includes("RSVP=TRUE") && a.includes('CN="Mark Weston"')), att);
ok("client attendee when invited", att.some((a) => a.endsWith(":mailto:lerato@example.com")));
ok("no client attendee when not invited", !prop(brokerInvite(base, { inviteClient: false }).ics, "ATTENDEE").some((a) => a.includes("lerato")));

// ---- ICS: UID stable per appointment, SEQUENCE carried
const uid = prop(ics, "UID:")[0];
ok("UID = <appointment id>@leadvelocity.co.za", uid === `UID:${appointmentUid(ID)}` && uid === `UID:${ID}@leadvelocity.co.za`);
const again = brokerInvite({ ...base, sequence: 2, start: "2026-10-16T12:00:00Z", end: "2026-10-16T12:30:00Z", brokerEmail: "other@x.co.za" }, { inviteClient: false }).ics;
ok("UID unchanged on re-allocation", prop(again, "UID:")[0] === uid);
ok("SEQUENCE increments", prop(ics, "SEQUENCE:")[0] === "SEQUENCE:1" && prop(again, "SEQUENCE:")[0] === "SEQUENCE:2");
ok("UID differs per appointment", prop(brokerInvite({ ...base, appointmentId: "11111111-2222-3333-4444-555555555555" }, { inviteClient: false }).ics, "UID:")[0] !== uid);

// ---- ICS: cancel
const cancel = brokerInvite({ ...base, sequence: 3 }, { inviteClient: false, cancel: true }).ics;
ok("cancel: METHOD:CANCEL + STATUS:CANCELLED + same UID", unfold(cancel).includes("METHOD:CANCEL") && unfold(cancel).includes("STATUS:CANCELLED") && prop(cancel, "UID:")[0] === uid);

// ---- escaping + folding
const esc = buildIcs({ ...base, method: "REQUEST", summary: "a, b; c\\d", description: "line1\nline2", attendees: [{ email: "a@b.co" }] });
ok("TEXT escaping", prop(esc, "SUMMARY:")[0] === "SUMMARY:a\\, b\\; c\\\\d" && prop(esc, "DESCRIPTION:")[0] === "DESCRIPTION:line1\\nline2");
const long = icsFold("DESCRIPTION:" + "é".repeat(80));
ok("folding never splits a UTF-8 char", long.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75) && unfold(long) === "DESCRIPTION:" + "é".repeat(80));

// ---- content
ok("phone call invite carries the client's number", brokerInvite({ ...base, method: "phone" }, { inviteClient: false }).text.includes("Call Lerato Mokoena on +27821234567"));
ok("subject in SAST", inv.subject.includes("Thu 15 Oct at 10:00"), inv.subject);
const conf = clientConfirmation(base);
ok("client confirmation: SAST + broker", conf.text.includes("Mark Weston will meet you on Thu 15 Oct at 10:00"), conf.text);
ok("client .ics same UID", prop(conf.ics, "UID:")[0] === uid);

// ---- Graph body
const g = graphEventBody(base, { inviteClient: true });
ok("graph: Teams online meeting", g.isOnlineMeeting === true && g.onlineMeetingProvider === "teamsForBusiness");
ok("graph: SAST wall clock + Windows zone", g.start.dateTime === "2026-10-15T10:00:00" && g.start.timeZone === "South Africa Standard Time");
ok("graph: transactionId per sequence", g.transactionId === `lv-alloc-${ID}-1`.slice(0, 64));
ok("graph: phone call has no online meeting / no client attendee", (() => { const p = graphEventBody({ ...base, method: "phone" }, { inviteClient: true }); return p.isOnlineMeeting === false && p.attendees.length === 0; })());

// ---- windows
const now = Date.parse("2026-10-13T10:00:00Z");
const ws = cleanWindows([{ date: "2026-10-15", part: "mornings" }, { part: "afternoon" }, { date: "2030-01-01", part: "evening" }, { part: "<script>" }, "x"], now);
ok("windows cleaned", JSON.stringify(ws) === JSON.stringify([{ date: "2026-10-15", part: "morning" }, { part: "afternoon" }, { part: "evening" }, { part: "any" }]), ws);
ok("windows text", windowsText(ws.slice(0, 2)) === "Thu 15 Oct morning; any weekday afternoon", windowsText(ws.slice(0, 2)));

// ---- lead token (same format as smc-voice / n8n)
const secret = "x".repeat(40);
const tok = await mintLeadToken("8c1d2e3f-0000-4000-8000-123456789abc", secret, now);
ok("lead token verifies", (await verifyLeadToken(tok, [secret], now)) === "8c1d2e3f-0000-4000-8000-123456789abc");
ok("lead token wrong secret rejected", (await verifyLeadToken(tok, ["y".repeat(40)], now)) === null);
ok("lead token expired rejected", (await verifyLeadToken(tok, [secret], now + 15 * 86400_000)) === null);
ok("lead token tampered rejected", (await verifyLeadToken(tok.replace(/.$/, (c) => (c === "A" ? "B" : "A")), [secret], now)) === null);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");
