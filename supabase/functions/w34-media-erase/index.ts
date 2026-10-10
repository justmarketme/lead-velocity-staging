// w34-media-erase — SortMyCover W34 media erasure (I-39j / I-40b). Skeleton: NOT deployed.
// Holds the server key so n8n never does (0.3 #10). n8n calls it with one HMAC secret that can only delete media:
//   POST {SUPABASE_URL}/functions/v1/w34-media-erase
//   headers: X-LV-Timestamp: <unix seconds>, X-LV-Signature: sha256=<hex HMAC-SHA256(W34_MEDIA_ERASE_SECRET, timestamp + "." + rawBody)>
//   body:    { "paths": ["broker-media/<broker uuid>/<file>", ...], "policy": "dsr|retention", "dsr_id": "<uuid>|null", "request_id": "..." }
// Rules: only objects under broker-media/<uuid>/ ; no "..", no "//", no wildcard; 1–50 paths per call; ±300 s clock skew.
// Result: { ok, deleted, not_found, rejected: [{path, reason}], request_id } — counts and paths only, never file contents.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "broker-media";
const MAX_PATHS = 50;
const MAX_SKEW_S = 300;
const PATH_RE = /^broker-media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._\/-]{1,200}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function checkPath(p: unknown): string | null {
  if (typeof p !== "string") return "not a string";
  if (p.includes("..") || p.includes("//") || p.includes("*") || p.endsWith("/")) return "unsafe path";
  if (!PATH_RE.test(p)) return "outside broker-media/<uuid>/";
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const secret = Deno.env.get("W34_MEDIA_ERASE_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceKey) return json(500, { ok: false, error: "not_configured" });

  // 1. Authenticate: timestamp + HMAC over the raw body (replay window ±300 s)
  const raw = await req.text();
  const ts = req.headers.get("x-lv-timestamp") || "";
  const sig = (req.headers.get("x-lv-signature") || "").replace(/^sha256=/, "");
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d{9,11}$/.test(ts) || Math.abs(now - Number(ts)) > MAX_SKEW_S) return json(401, { ok: false, error: "stale_or_missing_timestamp" });
  const expected = await hmacHex(secret, `${ts}.${raw}`);
  if (!sig || !timingSafeEqual(sig, expected)) return json(401, { ok: false, error: "bad_signature" });

  // 2. Validate the request
  let body: { paths?: unknown; policy?: unknown; dsr_id?: unknown; request_id?: unknown };
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: "bad_json" }); }
  const paths = Array.isArray(body.paths) ? body.paths : [];
  if (paths.length < 1 || paths.length > MAX_PATHS) return json(400, { ok: false, error: `paths must hold 1-${MAX_PATHS} items` });
  const policy = typeof body.policy === "string" && /^[a-z_]{1,40}$/.test(body.policy) ? body.policy : "dsr";
  const dsrId = typeof body.dsr_id === "string" && UUID_RE.test(body.dsr_id) ? body.dsr_id : null;
  const requestId = typeof body.request_id === "string" ? body.request_id.slice(0, 100) : null;

  const rejected: { path: unknown; reason: string }[] = [];
  const ok: string[] = [];
  for (const p of paths) {
    const why = checkPath(p);
    if (why) rejected.push({ path: typeof p === "string" ? p.slice(0, 120) : null, reason: why });
    else ok.push((p as string).slice(BUCKET.length + 1)); // object key inside the bucket
  }

  // 3. Delete (server key stays here) and log one retention_log row per object (no PII: paths are broker-scoped ids)
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let deleted: string[] = [];
  if (ok.length) {
    const { data, error } = await supabase.storage.from(BUCKET).remove(ok);
    if (error) return json(502, { ok: false, error: "storage_error", message: error.message, request_id: requestId });
    deleted = (data || []).map((o: { name: string }) => o.name);
    if (deleted.length) {
      const rows = deleted.map((name) => ({ table_name: `storage.objects:${BUCKET}`, row_id: name, action: "delete", policy, dsr_id: dsrId }));
      const { error: logErr } = await supabase.from("retention_log").insert(rows);
      if (logErr) return json(207, { ok: false, error: "deleted_but_not_logged", deleted: deleted.length, request_id: requestId });
    }
  }
  return json(200, { ok: rejected.length === 0, deleted: deleted.length, not_found: ok.length - deleted.length, rejected, request_id: requestId });
});
