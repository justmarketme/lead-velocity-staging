import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AYANDA_PERSONALITY } from "../_shared/ayanda_persona.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PERSONA = AYANDA_PERSONALITY
  .replace(/{customer_name}/g, "there")
  .replace(/{broker_name}/g, "our team")
  .replace(/{firm_name}/g, "Lead Velocity")
  .replace(/{firm_address}/g, "N/A")
  .replace(/{research_context}/g, "No prior research available.");

const FIRST_MESSAGE = "Hi, thanks for calling Lead Velocity. I'm Ayanda — how can I help you today?";
const VOICE_MODEL = "eleven_v4_turbo";

// One-off/idempotent maintenance endpoint: pushes AYANDA_PERSONALITY and the latest
// ElevenLabs voice model onto the agent's *stored* default config. This matters because
// ElevenLabs agents fall back to their stored config whenever a conversation_config_override
// isn't honored (or isn't sent), so the stored default must never be left pointing at a
// stale/wrong persona.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');
  const ELEVENLABS_EINSTEIN_AGENT_ID = Deno.env.get('ELEVENLABS_EINSTEIN_AGENT_ID');

  const results: Record<string, unknown> = {};

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
    return new Response(JSON.stringify({ error: 'Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID', results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 1. Patch Ayanda's agent: stored persona + first_message + voice model
  try {
    const ayandaRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ELEVENLABS_AGENT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: { prompt: DEFAULT_PERSONA },
            first_message: FIRST_MESSAGE,
          },
          tts: { model_id: VOICE_MODEL },
        },
      }),
    });
    const ayandaData = await ayandaRes.json();
    results.ayanda = {
      status: ayandaRes.status,
      agentId: ELEVENLABS_AGENT_ID,
      name: ayandaData?.name,
      voice_id: ayandaData?.conversation_config?.tts?.voice_id,
      model_id: ayandaData?.conversation_config?.tts?.model_id,
      prompt_preview: (ayandaData?.conversation_config?.agent?.prompt?.prompt || '').slice(0, 160),
      error: ayandaRes.ok ? undefined : ayandaData,
    };
  } catch (e: any) {
    results.ayanda = { error: e.message };
  }

  // 2. Einstein: only touch the voice model, never the persona (create-einstein-call sends its own
  //    per-call prompt override). If Einstein shares the same agent ID as Ayanda, skip entirely —
  //    the patch above already covers it and we must not clobber Ayanda's persona.
  if (ELEVENLABS_EINSTEIN_AGENT_ID && ELEVENLABS_EINSTEIN_AGENT_ID !== ELEVENLABS_AGENT_ID) {
    try {
      const einsteinRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ELEVENLABS_EINSTEIN_AGENT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({
          conversation_config: { tts: { model_id: VOICE_MODEL } },
        }),
      });
      const einsteinData = await einsteinRes.json();
      results.einstein = {
        status: einsteinRes.status,
        agentId: ELEVENLABS_EINSTEIN_AGENT_ID,
        name: einsteinData?.name,
        voice_id: einsteinData?.conversation_config?.tts?.voice_id,
        model_id: einsteinData?.conversation_config?.tts?.model_id,
        error: einsteinRes.ok ? undefined : einsteinData,
      };
    } catch (e: any) {
      results.einstein = { error: e.message };
    }
  } else {
    results.einstein = { note: 'Shares the same agent ID as Ayanda (or not set) — covered by the Ayanda patch above; persona left untouched since create-einstein-call sends its own per-call override.' };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
