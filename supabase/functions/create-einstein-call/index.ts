// Signed URL for a browser voice session with Einstein (public website only).
// Einstein's prompt, first message, voice and knowledge base live on his ElevenLabs
// agent (pushed by einstein-agent /sync, refreshed by /kb-refresh) — this function
// sends no prompt override, so what Jono sees in the ElevenLabs dashboard is what runs.
import { EINSTEIN_AGENT_ID } from "../_shared/einstein_persona.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) return json({ error: "ELEVENLABS_API_KEY is not configured in Supabase secrets." }, 500);
    const agentId = Deno.env.get("ELEVENLABS_EINSTEIN_AGENT_ID") || EINSTEIN_AGENT_ID;
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`ElevenLabs signed URL error: ${res.status}. ${await res.text()}`);
    const { signed_url } = await res.json();
    return json({ signedUrl: signed_url });
  } catch (error) {
    console.error("Error in create-einstein-call:", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
