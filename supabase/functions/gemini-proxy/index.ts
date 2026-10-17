// gemini-proxy (I-32c): the ONLY place the legacy CRM's browser code reaches Gemini. GEMINI_API_KEY lives in the
// function's secrets, never in the client bundle. Auth required (valid Supabase user JWT). NOT deployed.
//   { action: 'generate', model, version?, contents, generationConfig?, systemInstruction? }
//        -> { upstream_status, data }   (HTTP 200 always, so the client can fall back on 429/404 like before)
//   { action: 'live-token' }
//        -> { token, expires_at }       (single-use ephemeral token for the Gemini Live websocket; the real key
//                                        never leaves the server. v1alpha auth_tokens: validate against the
//                                        current API before deploy.)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MODELS = new Set(['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']);
const VERSIONS = new Set(['v1', 'v1beta']);
const LIVE_MODEL = 'gemini-2.0-flash-exp';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Auth required: a real signed-in user, not just the anon key.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'unauthorized' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'GEMINI_API_KEY is not configured in Edge Function secrets.' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  if (body.action === 'generate') {
    const model = String(body.model ?? 'gemini-2.0-flash');
    const version = String(body.version ?? 'v1beta');
    if (!MODELS.has(model) || !VERSIONS.has(version)) return json({ error: 'model_not_allowed' }, 400);
    if (!Array.isArray(body.contents)) return json({ error: 'contents_required' }, 400);
    const payload: Record<string, unknown> = { contents: body.contents };
    if (body.generationConfig) payload.generationConfig = body.generationConfig;
    if (body.systemInstruction) payload.systemInstruction = body.systemInstruction;
    const res = await fetch(`https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* upstream error text */ }
    return json({ upstream_status: res.status, data });
  }

  if (body.action === 'live-token') {
    const now = Date.now();
    const expires_at = new Date(now + 30 * 60_000).toISOString();
    const res = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ uses: 1, expireTime: expires_at, newSessionExpireTime: new Date(now + 60_000).toISOString() }),
    });
    if (!res.ok) return json({ error: 'token_failed', upstream_status: res.status }, 502);
    const t = await res.json();
    return json({ token: t.name, expires_at, model: LIVE_MODEL });
  }

  return json({ error: 'unknown_action' }, 400);
});
