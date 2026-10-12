import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Diagnostic helper: lists voices already in this ElevenLabs account plus German-accented
// voices from the shared library, to pick a voice for a new agent (e.g. Einstein's).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing ELEVENLABS_API_KEY' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Record<string, unknown> = {};

  // 1. Voices already in the account's library
  try {
    const res = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });
    const data = await res.json();
    results.account_voices = (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      accent: v.labels?.accent,
      age: v.labels?.age,
      gender: v.labels?.gender,
      description: v.labels?.description,
      category: v.category,
    }));
  } catch (e: any) {
    results.account_voices = { error: e.message };
  }

  // 2. Shared voice library, filtered for a German-accented voice
  try {
    const params = new URLSearchParams({
      accent: 'german',
      page_size: '20',
    });
    const res = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });
    const data = await res.json();
    results.shared_german_voices = (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      accent: v.accent,
      age: v.age,
      gender: v.gender,
      description: v.description,
      preview_url: v.preview_url,
    }));
  } catch (e: any) {
    results.shared_german_voices = { error: e.message };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
