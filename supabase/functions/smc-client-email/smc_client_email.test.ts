// smc-client-email: renderer, copy rules and handler (synthetic data only; no network, no Supabase).
//   npx deno test supabase/functions/smc-client-email/smc_client_email.test.ts
//   node --test supabase/functions/smc-client-email/smc_client_email.test.ts      (same file, Node type stripping)
import test from "node:test";
import assert from "node:assert/strict";
import { copyFor, dayText, icsFold, LOGO_URL, METHODS, KINDS, render, resendBody, shortWhen, SMC_FROM, SMC_REPLY_TO, timeText, validate, type ClientEmailInput } from "./render.ts";
import { makeHandler, RESEND_URL, sha256Hex } from "./handler.ts";

// 21 Oct 2026 08:00Z = 10:00 SAST (Wednesday)
const BASE = {
  kind: "booking_confirmed", to: "Thandi.Test@Example.com", lead_first_name: "Thandi", slot_start: "2026-10-21T08:00:00Z", method: "teams",
  adviser_name: "Sam Adviser", practice_name: "Example Practice Brokers", fsp_number: "99999",
  join_url: "https://teams.microsoft.com/l/meetup-join/TEST_123", booking_id: "00000000-0000-4000-8000-000000000001",
};
const NOW = Date.parse("2026-10-17T12:00:00Z");
const ok = (b: Record<string, unknown>): ClientEmailInput => { const v = validate(b); assert.ok(v.ok, JSON.stringify(v)); return (v as { ok: true; input: ClientEmailInput }).input; };
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

test("validate: normalises a full input (email lower-cased, end = start + 30 min, invite from the adviser's calendar by default)", () => {
  const i = ok(BASE);
  assert.equal(i.to, "thandi.test@example.com");
  assert.equal(i.slot_start, "2026-10-21T08:00:00.000Z");
  assert.equal(i.slot_end, "2026-10-21T08:30:00.000Z");
  assert.equal(i.calendar_invite, "adviser");
  const w05Shape = ok({ ...BASE, slot_start: "2026-10-21T10:00:00+02:00", slot_end: "2026-10-21T10:45:00+02:00" }); // W05 sends SAST offsets
  assert.equal(w05Shape.slot_start, "2026-10-21T08:00:00.000Z");
  assert.equal(w05Shape.slot_end, "2026-10-21T08:45:00.000Z");
  assert.equal(ok({ ...BASE, adviser_name: "Sam\r\nBcc: x@y.z Adviser" }).adviser_name, "Sam Bcc: x@y.z Adviser", "no line breaks survive into a header or the body");
  assert.equal(ok({ ...BASE, lead_first_name: undefined }).lead_first_name, "");
});

test("validate: refuses what it cannot send correctly, naming each field", () => {
  const bad = (patch: Record<string, unknown>) => { const v = validate({ ...BASE, ...patch }); assert.equal(v.ok, false); return (v as { errors: string[] }).errors; };
  assert.deepEqual(bad({ kind: "booking_moved" }), ["kind"]);
  assert.deepEqual(bad({ to: "not-an-email" }), ["to"]);
  assert.deepEqual(bad({ to: "a@b.co\nBcc: c@d.co" }), ["to"]);
  assert.deepEqual(bad({ slot_start: "tomorrow 10am" }), ["slot_start"]);
  assert.deepEqual(bad({ slot_end: "2026-10-21T07:00:00Z" }), ["slot_end"], "end before start");
  assert.deepEqual(bad({ method: "fax" }), ["method"]);
  assert.deepEqual(bad({ adviser_name: "  " }), ["adviser_name"]);
  assert.deepEqual(bad({ practice_name: "" }), ["practice_name"]);
  assert.deepEqual(bad({ fsp_number: "" }), ["fsp_number"], "no email without the FSP number");
  assert.deepEqual(bad({ join_url: "http://insecure.example/x" }), ["join_url"]);
  assert.deepEqual(bad({ join_url: 'https://x.example/"><script>' }), ["join_url"]);
  assert.deepEqual(bad({ calendar_invite: "outlook" }), ["calendar_invite"]);
  assert.deepEqual(bad({ booking_id: "../etc" }), ["booking_id"]);
  assert.deepEqual(validate(null), { ok: false, errors: ["kind", "to", "slot_start", "method", "adviser_name", "practice_name", "fsp_number"] });
});

test("SAST time: 08:00Z is 10:00 South African time, day and month spelled out", () => {
  assert.equal(dayText("2026-10-21T08:00:00Z"), "Wednesday 21 October 2026");
  assert.equal(timeText("2026-10-21T08:00:00Z", "2026-10-21T08:30:00Z"), "10:00 to 10:30 (South African time)");
  assert.equal(shortWhen("2026-10-21T23:30:00Z"), "Thu 22 Oct at 01:30", "late UTC rolls into the next SA day");
});

test("booking_confirmed (Teams, invite from the adviser's calendar): adviser, practice, FSP, SAST time, accept the invite, WhatsApp reschedule, footer", () => {
  const m = render(ok(BASE), NOW);
  assert.equal(m.subject, "Booked: your call with Sam on Wed 21 Oct at 10:00");
  for (const body of [m.html, m.text]) {
    assert.match(body, /Sam Adviser/);
    assert.match(body, /Example Practice Brokers/);
    assert.match(body, /FSP 99999/);
    assert.match(body, /Wednesday 21 October 2026, 10:00 to 10:30 \(South African time\)/);
    assert.match(body, /Microsoft Teams video call/);
    assert.match(body, /calendar invite is on its way from Sam(?:'|&#39;)s own calendar\. Please accept it/);
    assert.match(body, /\+27 60 015 6480/);
    assert.match(body, /https:\/\/sortmycover\.co\.za\/privacy\//);
    assert.match(body, /POPIA/);
    assert.match(body, /SortMyCover is not a financial services provider/);
    assert.match(body, /SortMyCover has introduced you to Sam Adviser from Example Practice Brokers, an authorised financial services provider \(FSP 99999\)/);
  }
  assert.match(m.html, /https:\/\/wa\.me\/27600156480/);
  assert.ok(m.html.includes(`src="${LOGO_URL}"`) && /^https:\/\//.test(LOGO_URL), "absolute https logo");
  assert.match(m.html, /href="https:\/\/teams\.microsoft\.com\/l\/meetup-join\/TEST_123"[^>]*>Join the call</);
  // the site's look (19 Oct 2026): white base, navy text and wordmark band, logo yellow accent; no cream / off-white
  assert.match(m.html, /#F5A623/); assert.match(m.html, /#1F2933/); assert.match(m.html, /background-color:#FFFFFF/);
  assert.doesNotMatch(m.html, /#FBF8F2|#DCD6CB/i, "no cream page or beige rule");
  assert.equal(LOGO_URL, "https://sortmycover.co.za/email/wordmark-white.png", "the site wordmark, not the app-icon tile");
  assert.match(m.html, /alt="SortMyCover"/);
  assert.match(m.html, /font-family:'DM Sans'/);
  assert.match(m.html, /border-radius:999px/, "pill buttons, as on the site");
  assert.match(m.html, /<em [^>]*Instrument Serif[^>]*>booked<\/em>/, "the headline accent word, as on the site's page titles");
  assert.equal(m.attachments.length, 0, "the adviser's calendar sends the invite; no file attached");
});

test("copy rules hold for every kind x method x invite: no price / free / AI / assistant / Lead Velocity wording", () => {
  for (const kind of KINDS) for (const method of METHODS) for (const calendar_invite of ["adviser", "attached"]) for (const join_url of [BASE.join_url, ""]) {
    const m = render(ok({ ...BASE, kind, method, calendar_invite, join_url }), NOW);
    const all = `${m.subject}\n${m.html}\n${m.text}`;
    const tag = `${kind}/${method}/${calendar_invite}/${join_url ? "link" : "nolink"}`;
    assert.doesNotMatch(all, /\bfree\b|costs? nothing|no cost|no charge|premium of|\bR\s?\d/i, `${tag}: price language`);
    assert.doesNotMatch(all, /\bAI\b|artificial intelligence|assistant|chatbot|\bbot\b/i, `${tag}: AI wording`);
    assert.doesNotMatch(all, /lead\s*velocity|leadvelocity|howzit/i, `${tag}: operator name`);
    assert.match(all, /not a financial services provider/, `${tag}: not-an-FSP line`);
    assert.match(all, /FSP 99999/, `${tag}: FSP number`);
    assert.match(all, /\+27 60 015 6480/, `${tag}: WhatsApp reschedule number`);
    assert.match(m.text, /Privacy notice: https:\/\/sortmycover\.co\.za\/privacy\//, `${tag}: privacy link`);
  }
});

test("call methods: the adviser phones / WhatsApp-calls; no join button", () => {
  const ph = render(ok({ ...BASE, method: "phone", join_url: "", calendar_invite: "attached" }), NOW);
  assert.match(ph.text, /Sam will phone you at that time on the number you gave us\./);
  assert.doesNotMatch(ph.html, />Join the call</);
  const wa = render(ok({ ...BASE, method: "whatsapp_call", join_url: "" }), NOW);
  assert.match(wa.text, /Sam will call you on WhatsApp at that time\./);
  assert.match(wa.text, /How: WhatsApp call/);
});

test("Teams without a link: the link is in the adviser's invite, or the adviser sends it (attached file case)", () => {
  assert.match(render(ok({ ...BASE, join_url: "" }), NOW).text, /The joining link is in the calendar invite\./);
  assert.match(render(ok({ ...BASE, join_url: "", calendar_invite: "attached" }), NOW).text, /Sam will send you the Teams link before the call\./);
});

test("attached calendar file: RFC 5545, booking UID, UTC times, folded lines; cancelled marks it CANCELLED", () => {
  const m = render(ok({ ...BASE, calendar_invite: "attached" }), NOW);
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].filename, "sortmycover-call.ics");
  assert.match(m.attachments[0].content_type, /^text\/calendar/);
  const ics = fromB64(m.attachments[0].content);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /METHOD:PUBLISH/);
  assert.match(ics, /UID:00000000-0000-4000-8000-000000000001@sortmycover\.co\.za/, "same UID as W05's /c/{booking_id} file");
  assert.match(ics, /DTSTART:20261021T080000Z/); assert.match(ics, /DTEND:20261021T083000Z/);
  assert.match(ics, /STATUS:CONFIRMED/); assert.match(ics, /SEQUENCE:0/);
  for (const l of ics.split("\r\n")) assert.ok(new TextEncoder().encode(l).length <= 75, `line too long: ${l}`);
  assert.match(m.text, /The calendar file is attached\./);
  const c = fromB64(render(ok({ ...BASE, kind: "booking_cancelled", calendar_invite: "attached" }), NOW).attachments[0].content);
  assert.match(c, /STATUS:CANCELLED/); assert.match(c, /SUMMARY:Cancelled: Your call with Sam/);
  assert.ok(Number(/SEQUENCE:(\d+)/.exec(c)![1]) > 0, "a later copy outranks the first");
  assert.equal(icsFold("x".repeat(80)), `${"x".repeat(75)}\r\n ${"x".repeat(5)}`);
});

test("booking_updated and booking_cancelled wording", () => {
  const u = render(ok({ ...BASE, kind: "booking_updated" }), NOW);
  assert.equal(u.subject, "Updated: your call with Sam on Wed 21 Oct at 10:00");
  assert.match(u.text, /An updated calendar invite is on its way from Sam's own calendar\. Please accept it/);
  const x = render(ok({ ...BASE, kind: "booking_cancelled" }), NOW);
  assert.equal(x.subject, "Cancelled: your call with Sam on Wed 21 Oct at 10:00");
  assert.match(x.text, /on Wednesday 21 October 2026, 10:00 to 10:30 \(South African time\) has been cancelled\./);
  assert.match(x.text, /Would you like another time\? Reply to SortMyCover on WhatsApp/);
  assert.doesNotMatch(x.html, />Join the call</, "no join button on a cancelled call");
});

test("HTML escapes every value it was given", () => {
  const m = render(ok({ ...BASE, lead_first_name: "<b>Thandi</b>", adviser_name: 'Sam "the" <i>Adviser</i>', practice_name: "A & B <Brokers>" }), NOW);
  assert.doesNotMatch(m.html, /<b>Thandi|<i>Adviser|<Brokers>/);
  assert.match(m.html, /&lt;b&gt;Thandi&lt;\/b&gt;/);
  assert.match(m.html, /A &amp; B &lt;Brokers&gt;/);
  assert.equal(copyFor(ok({ ...BASE, lead_first_name: "" })).first, "there");
});

test("Resend body: SortMyCover sender, Reply-To hello@, html + text, tags without personal data", () => {
  const b = resendBody(ok(BASE), NOW);
  assert.equal(b.from, SMC_FROM); assert.equal(SMC_FROM, "SortMyCover <hello@sortmycover.co.za>");
  assert.equal(b.reply_to, SMC_REPLY_TO); assert.equal(SMC_REPLY_TO, "hello@sortmycover.co.za");
  assert.deepEqual(b.to, ["thandi.test@example.com"]);
  assert.ok(b.html && b.text && b.subject);
  assert.deepEqual(b.tags, [{ name: "kind", value: "booking_confirmed" }, { name: "booking_id", value: BASE.booking_id }]);
  assert.equal("attachments" in b, false);
});

// ------------------------------------------------------------------ handler
const TOKEN = "relay-token-for-tests-only";
function harness(over: { sha?: string | null; key?: string; resend?: (init: RequestInit) => Response | Promise<Response> } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const h = makeHandler({
    relayTokenSha256: async () => (over.sha === undefined ? await sha256Hex(TOKEN) : over.sha),
    resendKey: () => ("key" in over ? over.key : "re_test_key"),
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return over.resend ? over.resend(init) : new Response(JSON.stringify({ id: "email_123" }), { status: 200 }); }) as unknown as typeof fetch,
    now: () => NOW,
  });
  const post = (body: unknown, headers: Record<string, string> = { "x-api-key": TOKEN }) =>
    h(new Request("https://fn.example/smc-client-email", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { h, post, calls };
}

test("handler: POST only; relay token must hash to relay_tokens 'n8n-internal'", async () => {
  const { h, post, calls } = harness();
  assert.equal((await h(new Request("https://fn.example/x", { method: "GET" }))).status, 405);
  assert.equal((await post(BASE, {})).status, 401, "no key");
  assert.equal((await post(BASE, { "x-api-key": "wrong" })).status, 401, "wrong key");
  assert.equal((await harness({ sha: null }).post(BASE)).status, 401, "no relay_tokens row -> closed");
  assert.equal(calls.length, 0, "nothing sent without auth");
});

test("handler: bad JSON / invalid fields -> 400 naming the fields; no RESEND_API_KEY -> 500; nothing sent", async () => {
  const { post, calls } = harness();
  assert.equal((await post("{not json")).status, 400);
  const r = await post({ ...BASE, method: "fax", to: "x" });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "invalid", fields: ["to", "method"] });
  const nk = harness({ key: undefined });
  assert.equal((await nk.post(BASE)).status, 500);
  assert.equal(calls.length + nk.calls.length, 0);
});

test("handler: sends one Resend email (Bearer key, Idempotency-Key) and returns its id", async () => {
  const { post, calls } = harness();
  const r = await post({ ...BASE, idempotency_key: "w05:client_email:booking_confirmed:bk1" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { id: "email_123" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RESEND_URL);
  const hd = calls[0].init.headers as Record<string, string>;
  assert.equal(hd.Authorization, "Bearer re_test_key");
  assert.equal(hd["Idempotency-Key"], "w05:client_email:booking_confirmed:bk1");
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(sent.from, "SortMyCover <hello@sortmycover.co.za>");
  assert.equal(sent.reply_to, "hello@sortmycover.co.za");
  assert.equal(sent.subject, "Booked: your call with Sam on Wed 21 Oct at 10:00");
});

test("handler: Resend refusal or outage -> 502 without echoing the recipient", async () => {
  const refused = harness({ resend: () => new Response(JSON.stringify({ name: "validation_error", message: "The sortmycover.co.za domain is not verified" }), { status: 403 }) });
  const r = await refused.post(BASE);
  assert.equal(r.status, 502);
  const j = await r.json();
  assert.equal(j.error, "resend"); assert.equal(j.status, 403);
  assert.doesNotMatch(JSON.stringify(j), /thandi/i);
  const down = harness({ resend: () => { throw new Error("connection reset"); } });
  const d = await down.post(BASE);
  assert.equal(d.status, 502); assert.equal((await d.json()).error, "resend_unreachable");
});

test("render() without slot_end ends the call 30 minutes after the start, never NaN", () => {
  const { slot_end: _drop, ...noEnd } = ok(BASE);
  for (const calendar_invite of ["adviser", "attached"] as const) {
    const m = render({ ...noEnd, calendar_invite }, NOW);
    assert.doesNotMatch(m.html + m.text, /NaN/);
    assert.match(m.text, /10:00 to 10:30 \(South African time\)/);
    if (calendar_invite === "attached") assert.match(fromB64(m.attachments[0].content), /DTEND:20261021T083000Z/);
  }
});

// Optional guest on a Teams call (Jono, 2026-10-19): the guest gets the same email as a second message, own key, own wording.
test("validate: guest_email is Teams only, a real address, never the client's own", () => {
  assert.equal(ok({ ...BASE, guest_email: " Guest.Test@Example.org " }).guest_email, "guest.test@example.org");
  const bad = (patch: Record<string, unknown>) => { const v = validate({ ...BASE, ...patch }); assert.equal(v.ok, false); return (v as { errors: string[] }).errors; };
  assert.deepEqual(bad({ guest_email: "nope" }), ["guest_email"]);
  assert.deepEqual(bad({ guest_email: "thandi.test@example.com" }), ["guest_email"], "same as the client");
  assert.deepEqual(bad({ guest_email: "g@example.org", method: "phone", join_url: undefined }), ["guest_email"], "phone call: no guest");
  assert.equal(ok({ ...BASE, guest_of: "Mallory" }).guest_of, undefined, "guest_of is never read from a request");
});

test("handler: with a guest -> the client's email, then the guest's (to the guest only, key + ':guest', guest wording)", async () => {
  const { post, calls } = harness();
  const r = await post({ ...BASE, kind: "booking_confirmed", calendar_invite: "attached", guest_email: "guest.test@example.org", idempotency_key: "w05:client_email:booking_confirmed:bk1" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { id: "email_123", guest_id: "email_123" });
  assert.equal(calls.length, 2);
  const [c, g] = calls.map((x) => ({ body: JSON.parse(String(x.init.body)), key: (x.init.headers as Record<string, string>)["Idempotency-Key"] }));
  assert.deepEqual(c.body.to, ["thandi.test@example.com"]); assert.deepEqual(g.body.to, ["guest.test@example.org"], "one recipient per message");
  assert.equal(c.key, "w05:client_email:booking_confirmed:bk1"); assert.equal(g.key, "w05:client_email:booking_confirmed:bk1:guest");
  assert.match(g.body.text, /^Your call is booked\n\nHi there,\n\nThandi booked a call through SortMyCover and added you as a guest\./);
  assert.match(g.body.text, /never used for marketing and is deleted with the booking/);
  assert.doesNotMatch(g.body.text, /Hi Thandi/);
  assert.equal(g.body.attachments.length, 1, "the guest gets the .ics too");
  assert.match(c.body.text, /Hi Thandi/); assert.doesNotMatch(c.body.text, /added you as a guest/);
});

test("handler: the guest copy failing never fails the client's email (200 + guest_error, no address echoed)", async () => {
  let n = 0;
  const h = harness({ resend: () => (++n === 1 ? new Response(JSON.stringify({ id: "email_1" }), { status: 200 }) : new Response(JSON.stringify({ name: "x" }), { status: 422 })) });
  const r = await h.post({ ...BASE, guest_email: "guest.test@example.org" });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j, { id: "email_1", guest_error: "resend" });
  assert.doesNotMatch(JSON.stringify(j), /guest\.test/);
});
