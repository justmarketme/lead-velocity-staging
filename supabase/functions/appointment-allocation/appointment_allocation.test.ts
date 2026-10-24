// appointment-allocation handler: routing, auth per action, SQL error mapping, and the side effects of allocate / cancel.
// Synthetic data only; fetch is a fake (no Supabase, Graph, Resend or Twilio). Pure helpers are covered by
// ../_shared/appointment_alloc.test.ts. Smoke test 21 Oct 2026 #26.
//   npx deno test --allow-env supabase/functions/appointment-allocation/appointment_allocation.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { fakeFetch, isRest, isRpc, jsonResponse, post, rest, served, SERVICE_KEY, testEnv, type Call } from "../_shared/test_handler_harness.ts";
import { mintLeadToken } from "../_shared/smc_voice_lib.ts";
import "./index.ts";

const URL_ = "https://fn.test/functions/v1/appointment-allocation";
const SECRET = "s".repeat(40);
const LEAD = "8c1d2e3f-0000-4000-8000-123456789abc";
const BROKER = "f688380e-0000-4000-8000-000000000001";
const APPT = "a0000000-0000-4000-8000-000000000001";
const ADMIN_JWT = "admin.jwt.test";
const START = "2026-10-22T08:00:00.000Z";

const LEAD_ROW = {
  id: LEAD, first_name: "Thandi Test", last_name: "M", phone: "+27600000951", email: "thandi@example.test", email_status: null,
  is_synthetic: true, opted_out_at: null, age_band: "35-44", budget_band: "R1500+", reasons: ["family"], lead_tier: "A", broker_id: null,
};
const BROKER_ROW = {
  id: BROKER, contact_person: "Sam Adviser", adviser_name: "Sam Adviser", firm_name: "Example Practice", email: "sam@example.test",
  calendar_email: "sam@example.test", calendar_status: "not_connected", calendar_mode: null, ms_tenant_id: null, add_client_as_attendee: true,
};
const APPT_ROW = {
  id: APPT, client_id: LEAD, broker_id: BROKER, brand_id: "b0000000-0000-4000-8000-000000000001", status: "booked", method: "teams",
  appointment_date: START, ends_at: "2026-10-22T08:30:00.000Z", invite_sequence: 0, calendar_email: "sam@example.test",
};

interface Opts { rpcError?: { code: string; message: string }; rpcData?: unknown; resendOk?: boolean }
function setup(o: Opts = {}): Call[] {
  testEnv({
    SMC_LEAD_TOKEN_SECRET: SECRET, SMC_LEAD_TOKEN_SECRET_PREVIOUS: "", RESEND_API_KEY: "re_test",
    SMC_TWILIO_ACCOUNT_SID: "ACtest", SMC_TWILIO_AUTH_TOKEN: "t",
  });
  return fakeFetch([
    (c) => c.url.includes("/rest/v1/rpc/")
      ? (o.rpcError ? jsonResponse({ ...o.rpcError, details: null, hint: null }, 400) : jsonResponse(o.rpcData ?? { ok: true }))
      : undefined,
    (c) => (isRest(c, "leads") ? rest(c, LEAD_ROW) : undefined),
    (c) => (isRest(c, "brokers") ? rest(c, BROKER_ROW) : undefined),
    (c) => (isRest(c, "appointments") ? rest(c, APPT_ROW) : undefined),
    (c) => (isRest(c, "appointments", "PATCH") ? new Response(null, { status: 204 }) : undefined),
    (c) => (isRest(c, "communications", "POST") || isRest(c, "lead_activities", "POST") ? new Response(null, { status: 201 }) : undefined),
    (c) => c.url === "https://api.resend.com/emails"
      ? (o.resendOk === false ? jsonResponse({ message: "domain not verified" }, 403) : { id: "re_1" })
      : undefined,
  ]);
}
const call = (body: unknown, headers: Record<string, string> = {}) => served()(post(URL_, body, headers));
const bodyOf = (c: Call) => JSON.parse(c.body || "null");
const asAdmin = { Authorization: `Bearer ${ADMIN_JWT}` };
const asService = { Authorization: `Bearer ${SERVICE_KEY}` };

Deno.test("appointment-allocation: CORS preflight, POST only, unknown action", async () => {
  setup();
  const pre = await served()(new Request(URL_, { method: "OPTIONS" }));
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get("access-control-allow-headers"), "authorization, x-client-info, apikey, content-type, x-lead-token");
  assertEquals((await served()(new Request(URL_, { method: "GET" }))).status, 405);
  const u = await call({ action: "nope" });
  assertEquals(u.status, 404);
  assertEquals((await u.json()).error, "unknown_action");
});

Deno.test("request: needs a lead token or the service role; a bad token asks the client to use WhatsApp", async () => {
  const calls = setup();
  const anon = await call({ action: "request", lead_id: LEAD });
  assertEquals(anon.status, 401);
  assertEquals((await anon.json()).error, "unauthorised");
  const wrongKey = await call({ action: "request", lead_id: LEAD }, { Authorization: "Bearer not-the-service-key" });
  assertEquals(wrongKey.status, 401);
  const badTok = await call({ action: "request" }, { "x-lead-token": "forged.token" });
  assertEquals(badTok.status, 401);
  assertEquals((await badTok.json()).error, "try_again");
  const noLead = await call({ action: "request" }, asService);
  assertEquals(noLead.status, 400);
  assertEquals((await noLead.json()).error, "lead_required");
  assert(!calls.some((c) => isRpc(c, "appointment_request_upsert")), "no SQL call without auth");
});

Deno.test("request: lead token from the page -> source 'page'; method lower-cased; note flattened", async () => {
  const calls = setup({ rpcData: { appointment_id: APPT, status: "requested" } });
  const tok = await mintLeadToken(LEAD, SECRET);
  const r = await call({ action: "request", method: "TEAMS", note: "after\nfive\tplease", source: "voice" }, { "x-lead-token": tok });
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { appointment_id: APPT, status: "requested" });
  assertEquals(bodyOf(calls.find((c) => isRpc(c, "appointment_request_upsert"))!), {
    p_lead_id: LEAD, p_windows: null, p_method: "teams", p_source: "page", p_consent_ref: null, p_note: "after five please",
  });
});

Deno.test("request: service role (voice / n8n) passes lead_id and a known source; unknown source -> whatsapp", async () => {
  let calls = setup();
  await call({ action: "request", lead_id: LEAD, source: "voice", method: "fax" }, asService);
  let sent = bodyOf(calls.find((c) => isRpc(c, "appointment_request_upsert"))!);
  assertEquals([sent.p_source, sent.p_method], ["voice", null]);
  calls = setup();
  await call({ action: "request", lead_id: LEAD, source: "carrier-pigeon" }, asService);
  sent = bodyOf(calls.find((c) => isRpc(c, "appointment_request_upsert"))!);
  assertEquals(sent.p_source, "whatsapp");
});

Deno.test("allocate / cancel: sign-in required; allocate needs a valid start", async () => {
  const calls = setup();
  for (const action of ["allocate", "cancel"]) {
    const r = await call({ action, appointment_id: APPT });
    assertEquals(r.status, 401, action);
  }
  const noStart = await call({ action: "allocate", appointment_id: APPT, start: "tomorrow" }, asAdmin);
  assertEquals(noStart.status, 400);
  assertEquals((await noStart.json()).message, "Pick a date and time.");
  assertEquals(calls.length, 0, "nothing called");
});

Deno.test("allocate: SQL errors map to clear answers; the SQL runs as the signed-in admin", async () => {
  const cases: [string, number, string][] = [
    ["42501", 403, "admins_only"], ["23P01", 409, "slot_taken"], ["P0002", 404, "not_found"], ["22023", 400, "invalid"], ["XX000", 500, "server_error"],
  ];
  for (const [code, status, error] of cases) {
    const calls = setup({ rpcError: { code, message: "appointment_allocate: that slot is taken" } });
    const r = await call({ action: "allocate", appointment_id: APPT, broker_id: BROKER, start: START, method: "teams" }, asAdmin);
    assertEquals(r.status, status, code);
    const j = await r.json();
    assertEquals(j.error, error);
    if (code === "23P01") assertEquals(j.message, "that slot is taken");
    const rpc = calls.find((c) => isRpc(c, "appointment_allocate"))!;
    assertEquals(rpc.headers.get("authorization"), `Bearer ${ADMIN_JWT}`);
    assertEquals(rpc.headers.get("apikey"), "anon-test-key");
  }
});

Deno.test("allocate: no Outlook -> .ics invite to the broker; synthetic lead -> WhatsApp and email are dry runs", async () => {
  const calls = setup({ rpcData: { appointment: APPT_ROW, previous: { status: "requested" }, reallocated: false, allocated_by_email: "admin@example.test" } });
  const r = await call(
    { action: "allocate", appointment_id: APPT, broker_id: BROKER, start: START, method: "Teams", broker_email: "sam@example.test" }, asAdmin);
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.ok, true);
  assertEquals(j.delivery, { calendar: "ics_email", to: "sam@example.test" });
  assertEquals(j.client_confirmation, { channel: "whatsapp", status: "dry_run", detail: "synthetic lead: not sent", email: "dry_run" });
  assertEquals(bodyOf(calls.find((c) => isRpc(c, "appointment_allocate"))!), {
    p_appointment_id: APPT, p_broker_id: BROKER, p_start: START, p_minutes: 30, p_method: "teams", p_calendar_email: "sam@example.test",
  });
  const resend = calls.filter((c) => c.url === "https://api.resend.com/emails");
  assertEquals(resend.length, 1, "only the broker invite is emailed");
  const mail = bodyOf(resend[0]);
  assertEquals(mail.to, ["sam@example.test"]);
  assertEquals(mail.attachments[0].content_type, "text/calendar; charset=utf-8; method=REQUEST");
  assert(!calls.some((c) => c.url.includes("api.twilio.com")), "no WhatsApp send for a synthetic lead");
  assert(!calls.some((c) => c.url.includes("graph.microsoft.com") || c.url.includes("login.microsoftonline.com")), "no Graph without a connected calendar");
  const comms = calls.filter((c) => isRest(c, "communications", "POST")).map(bodyOf);
  assertEquals(comms.map((m) => [m.recipient_type, m.channel, m.status]), [
    ["broker", "email", "sent"], ["client", "whatsapp", "pending"], ["client", "email", "pending"],
  ]);
  assertEquals(bodyOf(calls.find((c) => isRest(c, "appointments", "PATCH"))!), { invite_email_status: "sent" });
  assertEquals(bodyOf(calls.find((c) => isRest(c, "lead_activities", "POST"))!).activity_type, "appointment_calendar_delivery");
});

Deno.test("allocate: a failed broker invite returns the .ics for the admin to forward", async () => {
  setup({ rpcData: { appointment: APPT_ROW, previous: { status: "requested" }, reallocated: false, allocated_by_email: null }, resendOk: false });
  const r = await call({ action: "allocate", appointment_id: APPT, broker_id: BROKER, start: START, method: "teams" }, asAdmin);
  const j = await r.json();
  assertEquals(j.delivery.calendar, "failed");
  assertEquals(j.delivery.error, "resend 403: domain not verified");
  assert(String(j.delivery.invite_ics).startsWith("BEGIN:VCALENDAR"));
});

Deno.test("cancel: from a request (never booked) -> nothing to retract, client not messaged, reason capped", async () => {
  const calls = setup({ rpcData: { appointment: { ...APPT_ROW, status: "cancelled" }, previous: { status: "requested", appointment_date: null } } });
  const r = await call({ action: "cancel", appointment_id: APPT, reason: "x".repeat(400) }, asAdmin);
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.retract, { retracted: "none" });
  assertEquals(j.client_confirmation, { channel: "none", status: "skipped" });
  assertEquals(bodyOf(calls.find((c) => isRpc(c, "appointment_cancel"))!).p_reason.length, 300);
  assert(!calls.some((c) => c.url === "https://api.resend.com/emails"));
});
