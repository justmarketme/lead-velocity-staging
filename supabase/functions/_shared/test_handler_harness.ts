// Test-only harness for edge-function handler tests: captures the Deno.serve handler without opening a port and
// answers every outbound fetch from a route table (no network, no Supabase, no ElevenLabs/Twilio/Resend/Graph).
// Import this module BEFORE the function's index.ts (ES modules evaluate in import order), then await served().
//   import { served, fakeFetch } from "../_shared/test_handler_harness.ts";
//   import "./index.ts";
type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler | null = null;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (a: unknown, b?: unknown) => {
  handler = (typeof a === "function" ? a : b) as Handler;
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: { hostname: "test", port: 0 } };
};
export function served(): Handler {
  if (!handler) throw new Error("index.ts did not call Deno.serve");
  return handler;
}

export const SUPABASE = "https://sb.test";
export const SERVICE_KEY = "service-role-test-key";
export function testEnv(extra: Record<string, string> = {}) {
  const all: Record<string, string> = { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: "anon-test-key", ...extra };
  for (const [k, v] of Object.entries(all)) Deno.env.set(k, v);
}

export interface Call { method: string; url: string; headers: Headers; body: string }
export type Route = (c: Call) => Response | unknown | undefined;

/** Installs a fake fetch. The first route that returns something answers (a Response as is, anything else as JSON 200).
 *  A request no route answers fails the test loudly. Returns the call log. */
export function fakeFetch(routes: Route[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const c: Call = { method: req.method, url: req.url, headers: req.headers, body: req.body ? await req.text() : "" };
    calls.push(c);
    for (const r of routes) {
      const out = r(c);
      if (out === undefined) continue;
      return out instanceof Response ? out : jsonResponse(out);
    }
    throw new Error(`unexpected fetch ${c.method} ${c.url}`);
  };
  return calls;
}
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** PostgREST answer shaped for .single() (object) or .maybeSingle()/plain select (array). */
export function rest(c: Call, row: unknown | null) {
  const obj = (c.headers.get("accept") ?? "").includes("vnd.pgrst.object");
  if (obj) return row === null ? jsonResponse({ code: "PGRST116", message: "0 rows" }, 406) : jsonResponse(row);
  return jsonResponse(row === null ? [] : [row]);
}
export const isRest = (c: Call, table: string, method = "GET") =>
  c.method === method && c.url.startsWith(`${SUPABASE}/rest/v1/${table}?`) || (c.method === method && c.url === `${SUPABASE}/rest/v1/${table}`);
export const isRpc = (c: Call, fn: string) => c.method === "POST" && c.url.startsWith(`${SUPABASE}/rest/v1/rpc/${fn}`);

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
