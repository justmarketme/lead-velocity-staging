// smc-email-send: n8n's way to send a prebuilt SortMyCover email through Resend without the Resend key living on the
// n8n server (17 Oct 2026). Used by smc-email-verify (the booking email-verification link) when RESEND_API_KEY is not
// in the VPS .env; the key stays a Supabase function secret (RESEND_API_KEY), same as smc-client-email.
//
// POST <Resend /emails body>  header Authorization: Bearer <n8n relay token>  (or x-api-key: <token>)
//   optional header Idempotency-Key (passed through to Resend)
//   -> Resend's status and JSON ({ id } on success). Only "SortMyCover <hello@sortmycover.co.za>" may be the sender,
//      one recipient, subject + text/html required, no attachments.
// Auth: SHA-256 of the token must equal public.relay_tokens.sha256 for name 'n8n-internal' (token only on the n8n server).
import { createClient } from "jsr:@supabase/supabase-js@2";

const FROM = "SortMyCover <hello@sortmycover.co.za>";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const auth = req.headers.get("authorization") ?? "";
  const got = (auth.match(/^Bearer\s+(.+)$/i)?.[1] ?? req.headers.get("x-api-key") ?? "").trim();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: tok } = await db.from("relay_tokens").select("sha256").eq("name", "n8n-internal").maybeSingle();
  if (!tok?.sha256 || !got || (await sha256Hex(got)) !== tok.sha256) return json({ error: "unauthorised" }, 401);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "body must be JSON" }, 400); }
  const to = Array.isArray(b.to) ? b.to : [b.to];
  const bad = [
    b.from !== FROM && "from",
    (to.length !== 1 || typeof to[0] !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to[0] as string)) && "to",
    (typeof b.subject !== "string" || !b.subject.trim() || (b.subject as string).length > 200) && "subject",
    (typeof b.text !== "string" && typeof b.html !== "string") && "text",
    b.attachments !== undefined && "attachments",
  ].filter(Boolean);
  if (bad.length) return json({ error: "invalid", fields: bad }, 400);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "RESEND_API_KEY not configured" }, 500);
  const idem = req.headers.get("idempotency-key");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(idem ? { "Idempotency-Key": idem.slice(0, 200) } : {}) },
    body: JSON.stringify({ ...b, to }),
  }).catch((e) => e as Error);
  if (res instanceof Error) return json({ error: "resend_unreachable" }, 502);
  const out = await res.json().catch(() => ({}));
  // Never echo the recipient or the body back: n8n keeps this response in its execution log.
  return json(res.ok && (out as { id?: string }).id ? { id: (out as { id: string }).id } : { error: "resend", status: res.status, message: String((out as { message?: string }).message ?? "").slice(0, 200) }, res.ok ? 200 : 502);
});
