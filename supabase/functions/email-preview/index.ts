// email-preview: admin-only. Renders every Lead Velocity email with sample data (same builders and samples the unit tests use)
// and sends each one ONLY to jono@vantagestack.co.za, subject prefixed "[Preview] ". Nothing else can be addressed.
//
//   curl -X POST "$SUPABASE_URL/functions/v1/email-preview" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//        -H "Content-Type: application/json" -d '{}'                       # send all
//   ... -d '{"only":["sla-critical","admin-invite"]}'                       # send a few (ids: see "available" in the answer)
//   ... -d '{"dry_run":true}'                                                # render only, send nothing
//
// Auth: the bearer token must be exactly the project's SUPABASE_SERVICE_ROLE_KEY (checked here, so verify_jwt is off in config.toml).
// Secrets: RESEND_API_KEY (sending-only, restricted to leadvelocity.co.za).
import { buildSamples } from "../_shared/lv_emails.samples.ts";

/** Hard-coded on purpose: a preview can never reach a real recipient. */
const PREVIEW_TO = "jono@vantagestack.co.za";
const FROM = "Lead Velocity <howzit@leadvelocity.co.za>";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function send(key: string, subject: string, html: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [PREVIEW_TO], subject: `[Preview] ${subject}`, html, text }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.id) return { ok: true, id: String(j.id) };
    if (res.status === 429 && attempt < 2) { await sleep(1500); continue; } // Resend allows ~2 requests per second
    return { ok: false, error: `resend ${res.status}: ${String(j.message ?? j.name ?? "").slice(0, 200)}` };
  }
  return { ok: false, error: "resend: gave up after rate limits" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || !serviceKey || !safeEqual(token, serviceKey)) return json({ ok: false, error: "service-role key required" }, 403);

  const body = await req.json().catch(() => ({}));
  const only = Array.isArray(body.only) ? new Set(body.only.map(String)) : null;
  const dry = body.dry_run === true;
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!dry && !resendKey) return json({ ok: false, error: "RESEND_API_KEY not set" }, 500);

  const samples = buildSamples();
  const picked = samples.filter((s) => !only || only.has(s.id));
  const results: Array<Record<string, unknown>> = [];
  for (const s of picked) {
    try {
      const mail = s.build();
      if (dry) { results.push({ id: s.id, label: s.label, subject: mail.subject, html_bytes: mail.html.length, text_bytes: mail.text.length }); continue; }
      const r = await send(resendKey, mail.subject, mail.html, mail.text);
      results.push({ id: s.id, label: s.label, subject: `[Preview] ${mail.subject}`, ...r });
      await sleep(700);
    } catch (e) {
      results.push({ id: s.id, label: s.label, ok: false, error: `render failed: ${(e as Error).message}` });
    }
  }
  const failed = results.filter((r) => r.ok === false).length;
  return json({ ok: failed === 0, to: PREVIEW_TO, dry_run: dry, count: results.length, failed, results, available: samples.map((s) => s.id) }, failed ? 207 : 200);
});
