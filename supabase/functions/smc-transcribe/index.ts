// smc-transcribe: ElevenLabs Speech-to-Text for SortMyCover voice notes (W29 broker voice notes, n8n on the EMMA VPS).
// Why a proxy (Jono, 20 Oct 2026): transcription runs on ElevenLabs, which we already pay for, and the ElevenLabs key
// stays in Supabase secrets instead of being copied to the VPS.
//
// Auth: a shared secret, SMC_TRANSCRIBE_SECRET (Supabase secret; the same value is TRANSCRIBE_API_KEY in the n8n env),
// sent as header `x-smc-transcribe-secret`, `xi-api-key` (ElevenLabs-shaped client) or `Authorization: Bearer` (the
// OpenAI/Whisper-shaped W29 "Transcribe" node, so it works unchanged: file + language, reads .text). Compared
// in constant time. Deployed with --no-verify-jwt because n8n holds no Supabase JWT; without the secret every call is a 401.
//
// Input (POST only):
//   multipart/form-data: file (audio, <= 25 MB), optional model_id (default scribe_v1), optional language_code
//   application/json:    { audio_url, language_code? }  https only, host in SMC_TRANSCRIBE_URL_HOSTS
//                        (comma list, default n8n.sortmycover.co.za), so the endpoint can't be pointed at arbitrary URLs
// Output: 200 { text, language, language_code }, or 4xx/5xx { error }. Audio is never stored or logged.

const env = (k: string) => Deno.env.get(k) ?? "";
const STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MAX_BYTES = 25 * 1024 * 1024;
const MODELS = new Set(["scribe_v1", "scribe_v1_experimental"]);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
/** Constant-time compare of two strings (via their SHA-256, so length differences leak nothing). */
export async function secretOk(given: string, expected: string): Promise<boolean> {
  if (!expected || !given) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function allowedUrl(raw: string, hostsCsv: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const hosts = (hostsCsv || "n8n.sortmycover.co.za").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return hosts.includes(u.hostname.toLowerCase()) ? u : null;
}

async function readAudio(req: Request): Promise<{ blob: Blob; model: string; language?: string } | { error: string; status: number }> {
  const type = req.headers.get("content-type") || "";
  if (type.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) return { error: "file missing", status: 400 };
    if (file.size > MAX_BYTES) return { error: "file too large", status: 413 };
    const model = String(form.get("model_id") || "scribe_v1");
    const lang = form.get("language_code") ?? form.get("language"); // W29 (Whisper shape) sends `language`
    const language = lang ? String(lang) : undefined;
    return { blob: file, model: MODELS.has(model) ? model : "scribe_v1", language };
  }
  if (type.startsWith("application/json")) {
    let body: { audio_url?: string; language_code?: string };
    try { body = await req.json(); } catch { return { error: "invalid json", status: 400 }; }
    const u = allowedUrl(String(body.audio_url || ""), env("SMC_TRANSCRIBE_URL_HOSTS"));
    if (!u) return { error: "audio_url not allowed", status: 400 };
    const r = await fetch(u, { redirect: "error" });
    if (!r.ok) return { error: `audio fetch ${r.status}`, status: 502 };
    const blob = await r.blob();
    if (blob.size === 0) return { error: "empty audio", status: 400 };
    if (blob.size > MAX_BYTES) return { error: "file too large", status: 413 };
    return { blob, model: "scribe_v1", language: body.language_code };
  }
  return { error: "send multipart/form-data (file) or application/json (audio_url)", status: 415 };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const given = req.headers.get("x-smc-transcribe-secret") || req.headers.get("xi-api-key") || bearer;
  if (!(await secretOk(given, env("SMC_TRANSCRIBE_SECRET")))) return json(401, { error: "unauthorised" });
  const key = env("ELEVENLABS_API_KEY");
  if (!key) return json(503, { error: "transcription not configured" });

  const audio = await readAudio(req);
  if ("error" in audio) return json(audio.status, { error: audio.error });

  const fd = new FormData();
  fd.append("file", audio.blob, "voice-note");
  fd.append("model_id", audio.model);
  if (audio.language) fd.append("language_code", audio.language);
  const res = await fetch(STT_URL, { method: "POST", headers: { "xi-api-key": key }, body: fd });
  if (!res.ok) {
    console.log(JSON.stringify({ fn: "smc-transcribe", upstream: res.status })); // status only, never audio or text
    return json(502, { error: `elevenlabs ${res.status}` });
  }
  const out = await res.json();
  const text = String(out.text || "").trim();
  return json(200, { text, language: out.language_code || null, language_code: out.language_code || null });
});
