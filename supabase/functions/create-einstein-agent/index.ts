import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EINSTEIN_PERSONALITY, WEBSITE_KNOWLEDGE } from "../_shared/knowledge.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// "Gerrit - Friendly German Accent" from ElevenLabs' shared voice library.
const TARGET_VOICE_ID = "k9IoIFgHU1p8OEu6LGem";
const VOICE_MODEL = "eleven_v4_turbo";

// One-off setup script: creates Einstein's own dedicated ElevenLabs agent (separate from
// Ayanda's) with a German-accented voice, so the two personas no longer share one voice.
// Already run once in production — the resulting agent_id is pinned as DEFAULT_EINSTEIN_AGENT_ID
// in create-einstein-call/index.ts. Kept here for reference / in case the agent ever needs recreating.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing ELEVENLABS_API_KEY' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const steps: Record<string, unknown> = {};
  let voiceIdToUse = TARGET_VOICE_ID;

  // 1. Find the shared voice's public_owner_id (needed to import it into this account)
  try {
    const params = new URLSearchParams({ accent: 'german', page_size: '30' });
    const searchRes = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });
    const searchData = await searchRes.json();
    const match = (searchData.voices || []).find((v: any) => v.voice_id === TARGET_VOICE_ID);
    steps.found_shared_voice = !!match;

    if (match?.public_owner_id) {
      // 2. Import it into this account's voice library
      const addRes = await fetch(`https://api.elevenlabs.io/v1/voices/add/${match.public_owner_id}/${TARGET_VOICE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({ new_name: "Einstein - German Accent (Gerrit)" }),
      });
      const addData = await addRes.json();
      steps.add_voice = { status: addRes.status, addData };
      if (addRes.ok && addData.voice_id) {
        voiceIdToUse = addData.voice_id;
      } else if (!addRes.ok && String(addData?.detail?.status || '').includes('already')) {
        voiceIdToUse = TARGET_VOICE_ID;
      }
    }
  } catch (e: any) {
    steps.voice_import_error = e.message;
  }

  const firstMessage = "Guten Tag! I am Einstein-77, broadcasting from ze Lead Velocity orbital station. Wunderbar that you have connected! How can I help your brokerage today?";

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({
        name: "Einstein-77 (Lead Velocity)",
        conversation_config: {
          agent: {
            prompt: { prompt: `${EINSTEIN_PERSONALITY}\n\n${WEBSITE_KNOWLEDGE}` },
            first_message: firstMessage,
          },
          tts: {
            voice_id: voiceIdToUse,
            model_id: VOICE_MODEL,
          },
        },
      }),
    });
    const data = await res.json();
    return new Response(JSON.stringify({ status: res.status, data, voice_id_used: voiceIdToUse, steps }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, steps }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
