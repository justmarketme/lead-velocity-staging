// deno test --allow-env supabase/functions/smc-voice/smc_voice.test.ts
// Route-level tests for smc-voice with a fake Supabase client and a stubbed fetch: nothing leaves the process.
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle } from "./index.ts";
import { twilioSignature } from "../_shared/smc_voice_lib.ts";
import { SMC_WHATSAPP_CONSENT_ASK } from "../_shared/smc_receptionist_persona.ts";

const BASE = "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/smc-voice";
const TOKEN = "twilio-test-token";
Deno.env.set("SMC_TWILIO_AUTH_TOKEN", TOKEN);
Deno.env.set("SUPABASE_URL", "https://supabase.test");

type Op = { table: string; action: string; payload?: unknown; filters: unknown[][] };

/** Chainable stand-in for supabase-js: records every query; `resolve` gives each one its data; `gate` delays them all. */
function fakeDb(resolve: (op: Op) => unknown = () => null, gate: Promise<void> = Promise.resolve()) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const op: Op = { table, action: "select", filters: [] };
      ops.push(op);
      // deno-lint-ignore no-explicit-any
      const b: any = new Proxy({}, {
        get(_t, k) {
          if (k === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
              gate.then(() => ({ data: resolve(op) ?? null, error: null, count: 0 })).then(ok, ko);
          }
          return (...args: unknown[]) => {
            if (k === "insert" || k === "update" || k === "upsert") { op.action = k; op.payload = args[0]; }
            else if (!(k === "select" && op.action !== "select")) op.filters.push([String(k), ...args]);
            return b;
          };
        },
      });
      return b;
    },
  };
  return { db: db as unknown as SupabaseClient, ops };
}

/** A Twilio-signed form POST to /smc-voice/<sub>. */
async function twilioPost(sub: string, params: Record<string, string>) {
  const url = `${BASE}/${sub}`;
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": await twilioSignature(TOKEN, url, params) },
    body: new URLSearchParams(params),
  });
}

function stubFetch(fn: (url: string, init?: RequestInit) => Promise<Response>) {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => fn(String(input instanceof Request ? input.url : input), init)) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

Deno.test("/amd returns 204 with no body (was 500: a 204 Response cannot carry \"\")", async () => {
  const { db, ops } = fakeDb((op) => op.action === "select" ? { metadata: { kind: "smc_voice_callback" } } : null);
  const res = await handle(await twilioPost("amd?cb=cb-1", { CallSid: "CA1", AnsweredBy: "human", MachineDetectionDuration: "1800" }), db);
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
  const upd = ops.find((o) => o.table === "communications" && o.action === "update");
  assertEquals((upd?.payload as { metadata: Record<string, unknown> }).metadata, { kind: "smc_voice_callback", answered_by: "human", amd_ms: 1800 });
});

Deno.test("/amd with a bad signature is still refused", async () => {
  const req = new Request(`${BASE}/amd`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": "nope" }, body: "CallSid=CA1" });
  assertEquals((await handle(req, fakeDb().db)).status, 403);
});

Deno.test({
  name: "/twiml: when Lindi can't be reached the sorry TwiML returns before the missed-call writes (Twilio's 15 s limit)",
  sanitizeOps: false, sanitizeResources: false, // the inbound ring timer outlives the failed register-call on purpose
  async fn() {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const { db, ops } = fakeDb((op) => op.action === "insert" ? { id: "row-1" } : op.action === "select" && op.filters.some((f) => f[0] === "contains") ? [] : null, gate);
    const restore = stubFetch(() => Promise.reject(new TypeError("register-call down")));
    try {
      const pending = handle(await twilioPost("twiml", { CallSid: "CA2", From: "+27825550000", To: "+27600156480", CallStatus: "ringing" }), db);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const res = await Promise.race([pending, new Promise<null>((r) => (timer = setTimeout(() => r(null), 3000)))]);
      clearTimeout(timer);
      assert(res, "the response waited for the database writes");
      assertEquals(res.status, 200);
      assert((await res.text()).includes("Sorry, SortMyCover can't take your call right now."));
      open();
      for (let i = 0; i < 50 && !ops.some((o) => o.action === "insert" && (o.payload as { metadata?: { kind?: string } }).metadata?.kind === "smc_voice_callback"); i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      const inserts = ops.filter((o) => o.table === "communications" && o.action === "insert").map((o) => (o.payload as { metadata: { kind: string } }).metadata.kind);
      assertEquals(inserts, ["smc_voice_call", "smc_voice_callback"], "the missed call is still recorded and a callback scheduled");
    } finally {
      restore();
    }
  },
});

Deno.test("send_whatsapp_followup: the caller's WhatsApp yes is recorded as a lead_optins row (channel voice_call)", async () => {
  const restore = stubFetch(async (url) => {
    if (url.startsWith("https://supabase.test/auth/v1/admin/users")) return new Response("{}", { status: 200 }); // service-role check
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const { db, ops } = fakeDb((op) => {
      if (op.table === "lead_activities" && op.action === "select") return { lead_id: "lead-1" };
      if (op.table === "leads" && op.action === "select") return { id: "lead-1", first_name: "Thandi", phone: "+27825550000", opted_out_at: null, conv_state: {} };
      if (op.table === "brands") return { start_page: "off" };
      return null;
    });
    const req = new Request(`${BASE}/tools/send_whatsapp_followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer service-role-test", "x-smc-test": "1" },
      body: JSON.stringify({ conversation_id: "conv_test1", whatsapp_consent: "yes" }),
    });
    const res = await handle(req, db);
    assertEquals((await res.json()).ok, true);
    const optins = ops.filter((o) => o.table === "lead_optins");
    assertEquals(optins.length, 1);
    const row = optins[0].payload as Record<string, unknown>;
    assertEquals(optins[0].action, "insert");
    assertEquals(row.lead_id, "lead-1");
    assertEquals(row.brand_id, "6e532b05-984f-4906-90a0-a5257cde328c");
    assertEquals(row.channel, "voice_call");
    assertEquals(row.consent_text, SMC_WHATSAPP_CONSENT_ASK);
    assertEquals(row.recorded_by, "smc-voice");
    assert(typeof row.consent_version === "string" && row.consent_version.length > 0);
    assert(!Number.isNaN(Date.parse(String(row.received_at))));
  } finally {
    restore();
  }
});

Deno.test("send_whatsapp_followup: no yes -> no opt-in row and nothing sent", async () => {
  const { db, ops } = fakeDb();
  const restore = stubFetch(async () => new Response("{}", { status: 200 }));
  try {
    const req = new Request(`${BASE}/tools/send_whatsapp_followup`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer service-role-test", "x-smc-test": "1" },
      body: JSON.stringify({ conversation_id: "conv_test2", whatsapp_consent: "maybe" }),
    });
    assertEquals((await (await handle(req, db)).json()).error, "no_whatsapp_consent");
    assertEquals(ops.length, 0);
  } finally {
    restore();
  }
});
