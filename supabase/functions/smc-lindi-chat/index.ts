// smc-lindi-chat: Lindi's brain on WhatsApp. n8n's W07 sends every model turn here and this function answers with
// "Lindi SortMyCover on WhatsApp", the SortMyCover ElevenLabs agent.
//
// Lindi on WhatsApp = ElevenLabs agent 'Lindi SortMyCover on WhatsApp' via smc-lindi-chat; there is no Anthropic API in
// this system (Jono, 17 Oct 2026; ElevenLabs only, 19 Oct 2026). ElevenLabs Agents only chat over a WebSocket, which an n8n
// HTTP node cannot hold open; Deno can. W07 POSTs to $env.LINDI_BRAIN_URL (this function's URL, no fallback) with
// x-api-key = $env.LINDI_RELAY_TOKEN.
//
// ElevenLabs relay (message shape kept for compatibility): the path after the function name is ignored, so
// <fn> and <fn>/v1/messages both work. No version header is needed or read. `model` is ignored.
// Request : POST <fn>  { system, messages:[{role, content}], max_tokens, ... }  header x-api-key = relay token
// Response: { type:'message', role:'assistant', content:[{ type:'text', text }], stop_reason:'end_turn', ... }
// Error   : { type:'error', error:{ type, message } } (W07 reads only content[0].text; anything else fails closed)
//
// Auth: x-api-key must hash (SHA-256) to public.relay_tokens.sha256 for name 'lindi-whatsapp'. Only the hash is stored in
// the database; the token lives in the n8n server's .env (LINDI_RELAY_TOKEN). Uses the existing ELEVENLABS_API_KEY secret.
// Each request is one short text-only session on the twin agent with the caller's system prompt as an override; the twin
// has no tools and no post-call webhook, so nothing is booked or logged as a phone call from here.
import { createClient } from "jsr:@supabase/supabase-js@2";

const AGENT_ID = "agent_8201m54p8d5red0t08t1kgxv5b0m"; // Lindi SortMyCover on WhatsApp (text-only twin of the call agent)
const XI = "https://api.elevenlabs.io/v1/convai";
const TIMEOUT_MS = 12_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const relayError = (status: number, type: string, message: string) =>
  json({ type: "error", error: { type, message } }, status);

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let cachedHash: { v: string | null; at: number } = { v: null, at: 0 };
async function expectedHash(): Promise<string | null> {
  if (Date.now() - cachedHash.at < 60_000) return cachedHash.v;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data } = await sb.from("relay_tokens").select("sha256").eq("name", "lindi-whatsapp").maybeSingle();
  cachedHash = { v: data?.sha256 ?? null, at: Date.now() };
  return cachedHash.v;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: any) => (c && typeof c.text === "string" ? c.text : "")).join("");
  return "";
}

/** One text-only turn with the twin agent: system prompt override + one user message -> the agent's reply text. */
async function askLindi(system: string, user: string): Promise<string> {
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY missing");
  const r = await fetch(`${XI}/conversation/get-signed-url?agent_id=${AGENT_ID}`, { headers: { "xi-api-key": key } });
  if (!r.ok) throw new Error(`signed url ${r.status}`);
  const { signed_url } = await r.json();

  return await new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(signed_url);
    const parts: string[] = [];
    let sent = false, done = false;
    const finish = (err?: Error) => {
      if (done) return; done = true; clearTimeout(timer); clearTimeout(settle);
      try { ws.close(); } catch { /* already closed */ }
      err ? reject(err) : resolve(parts.join("").trim());
    };
    const timer = setTimeout(() => (parts.length ? finish() : finish(new Error("timeout"))), TIMEOUT_MS);
    let settle: ReturnType<typeof setTimeout> | undefined;
    const sendUser = () => { if (!sent) { sent = true; ws.send(JSON.stringify({ type: "user_message", text: user })); } };

    ws.onopen = () => ws.send(JSON.stringify({
      type: "conversation_initiation_client_data",
      conversation_config_override: { agent: { prompt: { prompt: system }, first_message: "" }, conversation: { text_only: true } },
    }));
    ws.onmessage = (ev) => {
      let m: any; try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.type === "ping") { ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event?.event_id })); return; }
      if (m.type === "conversation_initiation_metadata") { sendUser(); return; }
      if (m.type === "agent_response") {
        const t = m.agent_response_event?.agent_response;
        if (typeof t === "string" && t) parts.push(t);
        // a reply can stream as more than one agent_response; finish shortly after the last one
        clearTimeout(settle); settle = setTimeout(() => finish(), 600);
      }
    };
    ws.onerror = () => finish(parts.length ? undefined : new Error("websocket error"));
    ws.onclose = () => finish(parts.length ? undefined : new Error("closed without a reply"));
    setTimeout(sendUser, 1500); // fallback if no initiation metadata arrives
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return relayError(405, "invalid_request_error", "POST only");
  const want = await expectedHash();
  const got = req.headers.get("x-api-key") || "";
  if (!want || !got || (await sha256Hex(got)) !== want) return relayError(401, "authentication_error", "invalid relay token");

  let body: any;
  try { body = await req.json(); } catch { return relayError(400, "invalid_request_error", "body must be JSON"); }
  const system = typeof body.system === "string" ? body.system : textOf(body.system);
  const msgs: any[] = Array.isArray(body.messages) ? body.messages : [];
  if (!msgs.length) return relayError(400, "invalid_request_error", "messages required");
  const user = msgs.length === 1 ? textOf(msgs[0].content)
    : msgs.map((m) => `${String(m.role || "user").toUpperCase()}: ${textOf(m.content)}`).join("\n\n");

  try {
    const text = await askLindi(system, user);
    return json({
      id: `msg_eleven_${crypto.randomUUID()}`, type: "message", role: "assistant", model: `elevenlabs:${AGENT_ID}`,
      content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 },
    });
  } catch (e) {
    return relayError(502, "api_error", `lindi: ${(e as Error).message}`);
  }
});
