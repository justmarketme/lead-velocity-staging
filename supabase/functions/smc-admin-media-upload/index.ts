// smc-admin-media-upload: Lead Velocity puts prepared media (ads for approval, intro cards) into a broker's private
// broker-media folder. Brokers can only write their own folder and admins cannot write at all (storage RLS), so this
// runs with the service role inside Supabase; the key never leaves the function.
//
// POST { broker_id, filename, content_type, content_base64 }  header x-api-key = n8n relay token
//   -> { path: "<broker_id>/ads/<filename>" }   (upsert; filename [A-Za-z0-9._-], max 120 chars, images/video only, 15 MB)
// Auth: SHA-256 of x-api-key must equal public.relay_tokens.sha256 for name 'n8n-internal' (token only on the n8n server).
// Added 17 Oct 2026 to put the SortMyCover ads in Mark's portal for his per-ad approval (broker_media kind 'ad').
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4"]);
const MAX_BYTES = 15 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const got = req.headers.get("x-api-key") ?? "";
  const { data: tok } = await db.from("relay_tokens").select("sha256").eq("name", "n8n-internal").maybeSingle();
  if (!tok?.sha256 || !got || (await sha256Hex(got)) !== tok.sha256) return json({ error: "unauthorised" }, 401);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "body must be JSON" }, 400); }
  const brokerId = String(b.broker_id ?? "");
  const filename = String(b.filename ?? "");
  const type = String(b.content_type ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(brokerId)) return json({ error: "broker_id" }, 400);
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(filename)) return json({ error: "filename" }, 400);
  if (!TYPES.has(type)) return json({ error: "content_type" }, 400);
  const { data: broker } = await db.from("brokers").select("id").eq("id", brokerId).not("brand_id", "is", null).maybeSingle();
  if (!broker) return json({ error: "unknown SMC broker" }, 404);

  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(String(b.content_base64 ?? "")), (c) => c.charCodeAt(0)); } catch { return json({ error: "content_base64" }, 400); }
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: "size" }, 400);

  const path = `${brokerId}/ads/${filename}`;
  const { error } = await db.storage.from("broker-media").upload(path, bytes, { contentType: type, upsert: true });
  if (error) return json({ error: `upload: ${error.message}` }, 502);
  return json({ path });
});
