// Run: deno test supabase/functions/_shared/smc_email.test.ts   (synthetic data only; nothing is sent, no network, no database)
import { planBookingEmails } from "./booking_emails.ts";
import { bulkCommunicationEmail, communicationEmail } from "./lv_emails.ts";
import {
  isSmcLead, SMC_BRAND, SMC_FROM, smcBookingConfirmationEmail, smcBulkCommunicationEmail, smcCommunicationEmail, smcLeadIds,
} from "./smc_email.ts";

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

const TOKENS = Object.values(SMC_BRAND).map((h) => h.toLowerCase());
const HOSTILE = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;
const LV_COLOURS = ["#120c1f", "#1b1330", "#231a3d", "#b83df5", "#ff00cc", "#d946ef", "leadvelocity.co.za/email"];
const RULE = "─".repeat(12);

function colours(html: string): string[] { return [...new Set((html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase()))]; }
function assertSmcLook(html: string, label: string) {
  for (const c of colours(html)) assert(TOKENS.includes(c), `${label}: colour ${c} is not a SortMyCover brand token`);
  for (const lv of LV_COLOURS) assert(!html.toLowerCase().includes(lv), `${label}: Lead Velocity styling leaked (${lv})`);
  assert(!/url\(/i.test(html), `${label}: CSS url() found`);
  assert(html.includes("SortMyCover"), `${label}: no SortMyCover wordmark`);
  assert(html.includes("hello@sortmycover.co.za"), `${label}: no SMC contact`);
  assert(!html.includes("howzit@leadvelocity.co.za"), `${label}: LV contact leaked`);
}

Deno.test("sender is hello@sortmycover.co.za", () => {
  assert(SMC_FROM === "SortMyCover <hello@sortmycover.co.za>", SMC_FROM);
});

Deno.test("isSmcLead keys off brand_id", () => {
  assert(isSmcLead({ brand_id: "b1" }), "brand set");
  assert(!isSmcLead({ brand_id: null }) && !isSmcLead({}) && !isSmcLead(null) && !isSmcLead(undefined), "brand unset");
});

Deno.test("SMC communication email: brand tokens only, plain text, LV signature stripped", () => {
  const content = `Hi Lerato,\n\nHere is the link: https://sortmycover.co.za/c/bk_1\n\n${RULE}\nJono\nDirector | Lead Velocity\nT. +27 10 976 5618`;
  const m = smcCommunicationEmail({ content, subject: "Your booking" });
  assertSmcLook(m.html, "communication");
  assert(m.html.includes("https://sortmycover.co.za/c/bk_1"), "link kept");
  assert(!m.html.includes("Director | Lead Velocity") && !m.text.includes("Director | Lead Velocity"), "LV text signature must not reach an SMC client");
  assert(!/<[a-z\/]/i.test(m.text), "text part has no markup");
  assert(m.text.includes("Lerato"), "text carries the body");
});

Deno.test("SMC communication email: HTML content is sanitised and recoloured", () => {
  const m = smcCommunicationEmail({ content: `<p>Hello <strong>there</strong></p><a href="https://sortmycover.co.za">site</a><script>x()</script>`, subject: "S" });
  assertSmcLook(m.html, "communication-html");
  assert(!m.html.includes("<script"), "script dropped");
});

Deno.test("SMC bulk email: personalised message, brand tokens only", () => {
  const m = smcBulkCommunicationEmail({ message: "Hi Sipho,\n\nA quick note.", subject: "Hello" });
  assertSmcLook(m.html, "bulk");
  assert(m.text.includes("Hi Sipho,") && m.subject === "Hello", "content");
});

Deno.test("hostile input is escaped in every SMC email", () => {
  const all = [
    smcCommunicationEmail({ content: HOSTILE, subject: HOSTILE }),
    smcBulkCommunicationEmail({ message: HOSTILE, subject: HOSTILE }),
    smcBookingConfirmationEmail({ firstName: HOSTILE, brokerName: HOSTILE, whenText: HOSTILE }),
  ];
  for (const m of all) {
    assert(!m.html.includes("<script>") && !m.html.includes("<img src=x"), "unescaped markup");
  }
});

Deno.test("SMC booking confirmation holds only client-safe content", () => {
  const m = smcBookingConfirmationEmail({ firstName: "Lerato", brokerName: "Mark Smith", whenText: "Tuesday, 21 October 2026 at 10:00" });
  assertSmcLook(m.html, "booking-confirmation");
  assert(m.html.includes("Lerato") && m.html.includes("Mark Smith") && m.html.includes("21 October 2026"), "who/when present");
  for (const bad of ["Call notes", "SAST", "Ayanda", "Phone", "Lead status"]) assert(!m.html.includes(bad), `internal field ${bad}`);
});

const broker = { contact_person: "Mark Smith", firm_name: "Smith Cover CC", calendar_email: "mark@broker.test" };
const notes = "INTERNAL: client has a R2m bond, nervous about premiums";
const base = { appointmentTime: "2026-10-21T08:00:00Z", notes, adminEmail: "admin@leadvelocity.test", broker };

Deno.test("book-appointment (SortMyCover lead): client and broker get separate emails", () => {
  const plan = planBookingEmails({ ...base, lead: { first_name: "Lerato", last_name: "Dlamini", email: "lerato@client.test", phone: "+27820000000", brand_id: "smc-brand" } });
  assert(plan.length === 2, "two emails");
  const client = plan.find((p) => p.audience === "client")!;
  const internal = plan.find((p) => p.audience === "internal")!;
  assert(client.to.length === 1 && client.to[0] === "lerato@client.test", "client addressed alone");
  assert(internal.to.length === 1 && internal.to[0] === "mark@broker.test", "broker addressed alone");
  assert(client.from === SMC_FROM && client.reply_to === "hello@sortmycover.co.za", "client sent from SMC address");
  assertSmcLook(client.html, "client-confirmation");
  for (const leak of [notes, "R2m bond", "+27820000000", "Smith Cover CC", "mark@broker.test", "Lead status"]) {
    assert(!client.html.includes(leak) && !client.text.includes(leak), `client email leaked: ${leak}`);
  }
  assert(internal.html.includes("R2m bond") && internal.html.includes("+27820000000"), "internal keeps the notes and phone");
  assert(internal.from.includes("leadvelocity.co.za"), "internal stays on the Lead Velocity sender");
});

Deno.test("book-appointment (Lead Velocity lead): no SMC branding, client still not on internal email", () => {
  const plan = planBookingEmails({ ...base, lead: { first_name: "Thabo", last_name: "N", email: "thabo@client.test", phone: "+27830000000", brand_id: null } });
  assert(plan.length === 2, "two emails");
  const client = plan.find((p) => p.audience === "client")!;
  assert(client.from.includes("leadvelocity.co.za") && !client.from.includes("sortmycover"), "LV sender");
  assert(!client.html.includes("SortMyCover") && !client.html.includes("sortmycover.co.za"), "no SMC branding");
  assert(!client.html.includes(notes) && !client.html.includes("+27830000000"), "no internal fields");
  assert(plan.find((p) => p.audience === "internal")!.to.join() === "mark@broker.test", "broker only");
});

Deno.test("book-appointment: no lead email -> internal only; broker missing -> admin fallback; same address not duplicated", () => {
  const noEmail = planBookingEmails({ ...base, lead: { first_name: "A", last_name: "B", email: null, phone: null, brand_id: "x" } });
  assert(noEmail.length === 1 && noEmail[0].audience === "internal", "internal only");
  const noBroker = planBookingEmails({ ...base, broker: null, lead: { first_name: "A", last_name: "B", email: "a@client.test", brand_id: null } });
  assert(noBroker.find((p) => p.audience === "internal")!.to[0] === "admin@leadvelocity.test", "admin fallback");
  const same = planBookingEmails({ ...base, lead: { first_name: "A", last_name: "B", email: "MARK@broker.test", brand_id: "x" } });
  assert(same.length === 1, "client address equal to internal address is not mailed twice");
});

Deno.test("explicit isSmc overrides lead.brand_id (handler passes the looked-up flag)", () => {
  const plan = planBookingEmails({ ...base, isSmc: true, lead: { first_name: "A", last_name: "B", email: "a@client.test" } });
  assert(plan.find((p) => p.audience === "client")!.from === SMC_FROM, "SMC from");
});

Deno.test("smcLeadIds: only branded leads; safe when the column is missing or the query throws", async () => {
  const mk = (res: unknown, boom = false) => ({ from: () => ({ select: () => ({ in: () => boom ? Promise.reject(new Error("x")) : Promise.resolve(res) }) }) });
  const got = await smcLeadIds(mk({ data: [{ id: "1", brand_id: "b" }, { id: "2", brand_id: null }], error: null }), ["1", "2", "2", null]);
  assert(got.has("1") && !got.has("2") && got.size === 1, "only branded lead");
  assert((await smcLeadIds(mk({ data: null, error: { message: "column leads.brand_id does not exist" } }), ["1"])).size === 0, "missing column");
  assert((await smcLeadIds(mk(null, true), ["1"])).size === 0, "throw");
  assert((await smcLeadIds(mk({ data: [], error: null }), [])).size === 0, "empty ids");
});

Deno.test("Lead Velocity behaviour unchanged: LV templates keep their layout and sender text", () => {
  const c = communicationEmail({ content: "Hi there", subject: "Invoice" });
  const b = bulkCommunicationEmail({ message: "Hi there", subject: "Hello" });
  for (const m of [c, b]) {
    assert(m.html.includes("#b83df5") && m.html.includes("Lead Velocity"), "LV layout");
    assert(!m.html.includes("sortmycover"), "no SMC leakage");
  }
});
