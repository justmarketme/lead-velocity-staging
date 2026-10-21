// smc-lindi-chat handler: relay auth, request validation, the ElevenLabs text-only session and the reply shape W07 reads.
// Synthetic data only; fetch and WebSocket are fakes (no ElevenLabs, no Supabase). Smoke test 21 Oct 2026 #26.
//   npx deno test --allow-env supabase/functions/smc-lindi-chat/smc_lindi_chat.test.ts
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { fakeFetch, isRest, post, rest, served, sha256Hex, testEnv, type Call } from "../_shared/test_handler_harness.ts";
import "./index.ts";

const URL_ = "https://fn.test/functions/v1/smc-lindi-chat/v1/messages";
const TOKEN = "relay-token-for-tests";
const AGENT = "agent_8201m54p8d5red0t08t1kgxv5b0m";
// The 1.5 s "no initiation metadata" fallback timer in askLindi is never cleared by design; skip the timer sanitizer.
const opts = { sanitizeOps: false, sanitizeResources: false };

// deno-lint-ignore no-explicit-any
type Sent = any;
class FakeWS {
  static last: FakeWS | null = null;
  static script: "normal" | "silent" | "error" = "normal";
  sent: Sent[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.last = this;
    setTimeout(() => (FakeWS.script === "error" ? this.onerror?.() : this.onopen?.()), 0);
  }
  emit(m: unknown) { setTimeout(() => this.onmessage?.({ data: JSON.stringify(m) }), 0); }
  send(s: string) {
    const m = JSON.parse(s);
    this.sent.push(m);
    if (FakeWS.script !== "normal") return;
    if (m.type === "conversation_initiation_client_data") {
      this.emit({ type: "ping", ping_event: { event_id: 7 } });
      this.emit({ type: "conversation_initiation_metadata" });
    }
    if (m.type === "user_message") {
      this.emit({ type: "agent_response", agent_response_event: { agent_response: "Hi Thandi, " } });
      this.emit({ type: "agent_response", agent_response_event: { agent_response: "I can help with that. " } });
    }
  }
  close() { this.closed = true; }
}
// deno-lint-ignore no-explicit-any
(globalThis as any).WebSocket = FakeWS;

let signedUrlStatus = 200;
async function setup(env: Record<string, string> = { ELEVENLABS_API_KEY: "xi-test-key" }): Promise<Call[]> {
  testEnv(env);
  const hash = await sha256Hex(TOKEN);
  return fakeFetch([
    (c) => (isRest(c, "relay_tokens") ? rest(c, { sha256: hash }) : undefined),
    (c) => c.url.startsWith("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url")
      ? (signedUrlStatus === 200 ? { signed_url: "wss://xi.test/convai?token=signed" } : new Response("no", { status: signedUrlStatus }))
      : undefined,
  ]);
}
const call = (body: unknown, key = TOKEN) => served()(post(URL_, body, key ? { "x-api-key": key } : {}));

Deno.test({ name: "smc-lindi-chat: POST only", ...opts, fn: async () => {
  await setup();
  const r = await served()(new Request(URL_, { method: "GET" }));
  assertEquals(r.status, 405);
  assertEquals(await r.json(), { type: "error", error: { type: "invalid_request_error", message: "POST only" } });
} });

Deno.test({ name: "smc-lindi-chat: refuses a missing or wrong relay token (hash checked against relay_tokens 'lindi-whatsapp')", ...opts, fn: async () => {
  const calls = await setup();
  for (const key of ["", "wrong-token"]) {
    const r = await call({ messages: [{ role: "user", content: "hi" }] }, key);
    assertEquals(r.status, 401);
    assertEquals((await r.json()).error.type, "authentication_error");
  }
  const tok = calls.find((c) => c.url.includes("/rest/v1/relay_tokens"));
  assert(tok, "looked the token hash up");
  assertMatch(tok!.url, /name=eq\.lindi-whatsapp/);
  assertEquals(tok!.headers.get("apikey"), "service-role-test-key");
  assert(!calls.some((c) => c.url.includes("elevenlabs")), "no model call without auth");
} });

Deno.test({ name: "smc-lindi-chat: body must be JSON with at least one message", ...opts, fn: async () => {
  await setup();
  const notJson = await call("{not json");
  assertEquals(notJson.status, 400);
  assertEquals((await notJson.json()).error.message, "body must be JSON");
  const empty = await call({ system: "x", messages: [] });
  assertEquals(empty.status, 400);
  assertEquals((await empty.json()).error.message, "messages required");
} });

Deno.test({ name: "smc-lindi-chat: one turn = text-only session with the system prompt as override; streamed parts joined", ...opts, fn: async () => {
  signedUrlStatus = 200; FakeWS.script = "normal";
  const calls = await setup();
  const r = await call({ model: "ignored", system: [{ type: "text", text: "You are Lindi." }], messages: [{ role: "user", content: [{ type: "text", text: "Can you help?" }] }] });
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.type, "message");
  assertEquals(j.role, "assistant");
  assertEquals(j.model, `elevenlabs:${AGENT}`);
  assertEquals(j.stop_reason, "end_turn");
  assertEquals(j.content, [{ type: "text", text: "Hi Thandi, I can help with that." }]);
  const su = calls.find((c) => c.url.includes("get-signed-url"))!;
  assertEquals(new URL(su.url).searchParams.get("agent_id"), AGENT);
  assertEquals(su.headers.get("xi-api-key"), "xi-test-key");
  const ws = FakeWS.last!;
  assertEquals(ws.url, "wss://xi.test/convai?token=signed");
  assertEquals(ws.sent[0], {
    type: "conversation_initiation_client_data",
    conversation_config_override: { agent: { prompt: { prompt: "You are Lindi." }, first_message: "" }, conversation: { text_only: true } },
  });
  assertEquals(ws.sent.find((m: Sent) => m.type === "pong"), { type: "pong", event_id: 7 });
  assertEquals(ws.sent.filter((m: Sent) => m.type === "user_message"), [{ type: "user_message", text: "Can you help?" }]);
  assert(ws.closed, "socket closed after the reply");
} });

Deno.test({ name: "smc-lindi-chat: several messages become one transcript turn (ROLE: text)", ...opts, fn: async () => {
  signedUrlStatus = 200; FakeWS.script = "normal";
  await setup();
  const r = await call({ system: "S", messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }, { content: "Cover for my family" }] });
  assertEquals(r.status, 200);
  assertEquals(FakeWS.last!.sent.find((m: Sent) => m.type === "user_message").text, "USER: Hi\n\nASSISTANT: Hello\n\nUSER: Cover for my family");
} });

Deno.test({ name: "smc-lindi-chat: ElevenLabs failures fail closed as 502 api_error (W07 then sends its holding line)", ...opts, fn: async () => {
  FakeWS.script = "normal";
  signedUrlStatus = 500;
  await setup();
  let r = await call({ messages: [{ role: "user", content: "hi" }] });
  assertEquals(r.status, 502);
  assertEquals(await r.json(), { type: "error", error: { type: "api_error", message: "lindi: signed url 500" } });

  signedUrlStatus = 200;
  await setup({ ELEVENLABS_API_KEY: "" });
  r = await call({ messages: [{ role: "user", content: "hi" }] });
  assertEquals(r.status, 502);
  assertEquals((await r.json()).error.message, "lindi: ELEVENLABS_API_KEY missing");

  FakeWS.script = "error";
  await setup();
  r = await call({ messages: [{ role: "user", content: "hi" }] });
  assertEquals(r.status, 502);
  assertEquals((await r.json()).error.message, "lindi: websocket error");
  FakeWS.script = "normal";
} });
