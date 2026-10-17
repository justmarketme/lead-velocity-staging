// smc-client-email request handler, with its outside world passed in (relay-token lookup, Resend key, fetch) so the
// tests run it without Supabase, Resend or Deno. index.ts wires the real ones.
import { resendBody, validate } from "./render.ts";

export const RESEND_URL = "https://api.resend.com/emails";

export interface Deps {
  /** public.relay_tokens.sha256 for name 'n8n-internal' (null when the row is missing). */
  relayTokenSha256: () => Promise<string | null>;
  /** Supabase function secret RESEND_API_KEY. */
  resendKey: () => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    // Auth (same as smc-admin-media-upload): SHA-256 of x-api-key must equal relay_tokens.sha256 for 'n8n-internal'.
    const got = req.headers.get("x-api-key") ?? "";
    const want = await deps.relayTokenSha256();
    if (!want || !got || (await sha256Hex(got)) !== want) return json({ error: "unauthorised" }, 401);

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "body must be JSON" }, 400); }
    const v = validate(body);
    if (!v.ok) return json({ error: "invalid", fields: v.errors }, 400);

    const key = deps.resendKey();
    if (!key) return json({ error: "RESEND_API_KEY not configured" }, 500);
    const payload = resendBody(v.input, (deps.now ?? Date.now)());
    let res: Response;
    try {
      res = await deps.fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`, "Content-Type": "application/json",
          ...(v.input.idempotency_key ? { "Idempotency-Key": v.input.idempotency_key } : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json({ error: "resend_unreachable", detail: String((e as Error)?.message ?? e).slice(0, 200) }, 502);
    }
    const out = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    // Never echo the recipient or the body back: n8n stores this response in its execution log.
    if (!res.ok || !out.id) return json({ error: "resend", status: res.status, detail: String(out.message ?? out.name ?? "").slice(0, 200) }, 502);
    return json({ id: out.id });
  };
}
