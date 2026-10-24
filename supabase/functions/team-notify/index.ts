// team-notify: admin-only. Sends one internal message to the Lead Velocity team through Resend, from
// "Lead Velocity <howzit@leadvelocity.co.za>". Recipients are limited to TEAM below, so this can never reach a
// client or a broker. Used for operational notes between Jono and KG (Jono, 18 Oct 2026: team messages go through
// Resend from howzit@, never from a personal mailbox).
//
//   curl -X POST "$SUPABASE_URL/functions/v1/team-notify" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//        -H "Content-Type: application/json" \
//        -d '{"to":["motsopule@gmail.com"],"cc":["howzit@leadvelocity.co.za"],"subject":"...","text":"...","html":"..."}'
//   ... add "dry_run": true to validate without sending.
//
// Auth: verify_jwt stays ON (config.toml default); we then require role=service_role or an exact match with
// SUPABASE_SERVICE_ROLE_KEY, the same rule as email-preview. Secret: RESEND_API_KEY (leadvelocity.co.za).

/** The only addresses this function will send to. */
export const TEAM = new Set([
  "jono@vantagestack.co.za",
  "jonojettoo@leadvelocity.co.za",
  "howzit@leadvelocity.co.za",
  "motsopule@gmail.com",
  "kgomotsopule@leadvelocity.co.za",
]);
const FROM = "Lead Velocity <howzit@leadvelocity.co.za>";
const REPLY_TO = "howzit@leadvelocity.co.za";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);

/** Validates a request body; returns the Resend payload or an error. Pure, so it is unit-tested. */
export function plan(body: Record<string, unknown>): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const to = list(body.to), cc = list(body.cc);
  if (!to.length) return { ok: false, error: "to required" };
  const outside = [...to, ...cc].filter((a) => !TEAM.has(a));
  if (outside.length) return { ok: false, error: `not a team address: ${outside.join(", ")}` };
  const subject = String(body.subject ?? "").trim().slice(0, 200);
  const text = String(body.text ?? "").slice(0, 20000);
  const html = String(body.html ?? "").slice(0, 50000);
  if (!subject) return { ok: false, error: "subject required" };
  if (!text && !html) return { ok: false, error: "text or html required" };
  const payload: Record<string, unknown> = { from: FROM, to, subject, reply_to: REPLY_TO };
  if (cc.length) payload.cc = cc;
  if (text) payload.text = text;
  if (html) payload.html = html;
  return { ok: true, payload };
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let role = "";
  try { role = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role ?? ""; } catch { /* not a JWT */ }
  if (!token || !((serviceKey && safeEqual(token, serviceKey)) || role === "service_role")) return json({ ok: false, error: "service-role key required" }, 403);

  const body = await req.json().catch(() => ({}));
  const p = plan(body);
  if (!p.ok) return json(p, 400);
  if (body.dry_run === true) return json({ ok: true, dry_run: true, to: p.payload.to, cc: p.payload.cc ?? [] });
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) return json({ ok: false, error: "RESEND_API_KEY not set" }, 500);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(p.payload),
  });
  const j = await res.json().catch(() => ({}));
  if (res.ok && j.id) return json({ ok: true, id: String(j.id), to: p.payload.to, cc: p.payload.cc ?? [] });
  return json({ ok: false, error: `resend ${res.status}: ${String(j.message ?? j.name ?? "").slice(0, 200)}` }, 502);
});
