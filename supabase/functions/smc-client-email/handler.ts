// smc-client-email request handler, with its outside world passed in (relay-token lookup, Resend key, fetch) so the
// tests run it without Supabase, Resend or Deno. index.ts wires the real ones.
import { guestInput, resendBody, validate, type ClientEmailInput } from "./render.ts";

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
    const now = (deps.now ?? Date.now)();
    const send = async (input: ClientEmailInput): Promise<{ id?: string; error?: unknown }> => {
      let res: Response;
      try {
        res = await deps.fetch(RESEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`, "Content-Type": "application/json",
            ...(input.idempotency_key ? { "Idempotency-Key": input.idempotency_key } : {}),
          },
          body: JSON.stringify(resendBody(input, now)),
        });
      } catch (e) {
        return { error: { error: "resend_unreachable", detail: String((e as Error)?.message ?? e).slice(0, 200) } };
      }
      const out = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
      if (!res.ok || !out.id) return { error: { error: "resend", status: res.status, detail: String(out.message ?? out.name ?? "").slice(0, 200) } };
      return { id: out.id };
    };
    // Never echo the recipient or the body back: n8n stores this response in its execution log.
    const main = await send(v.input);
    if (!main.id) return json(main.error, 502);
    // The optional Teams guest: a separate message (own idempotency key) only after the client's email went.
    const g = guestInput(v.input);
    if (!g) return json({ id: main.id });
    const gs = await send(g);
    return json(gs.id ? { id: main.id, guest_id: gs.id } : { id: main.id, guest_error: (gs.error as { error?: string })?.error ?? "resend" });
  };
}
