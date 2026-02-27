import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recordingUrl, communicationId } = await req.json();

    if (!recordingUrl) {
      return new Response(
        JSON.stringify({ error: 'Recording URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Fetching audio from:', recordingUrl);

    // Fetch the audio file
    const audioResponse = await fetch(recordingUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
    }

    const audioBlob = await audioResponse.blob();
    const audioBase64 = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/mpeg';

    console.log('Audio fetched, size:', audioBlob.size, 'type:', mimeType);

    // Use Google Gemini directly for transcription
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "You are a professional transcription assistant. Your task is to accurately transcribe audio recordings of phone calls.\n\nInstructions:\n- Transcribe the audio content word-for-word\n- If there are multiple speakers, identify them as 'Speaker 1:', 'Speaker 2:', etc.\n- Include timestamps at natural breaks (e.g., [0:15])\n- Note any unclear audio as [inaudible]\n- Include relevant non-speech sounds in brackets like [phone ringing], [pause], [laughter]\n- Format the transcript with proper punctuation and paragraphs for readability\n- If the audio quality is poor, do your best and note quality issues\n\nReturn ONLY the transcript, no additional commentary.\n\nPlease transcribe this phone call recording accurately:"
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: audioBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 4000
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`AI transcription failed: ${errorText}`);
    }

    const aiResponse = await response.json();
    const transcript = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('Transcription completed, length:', transcript.length);

    // If communicationId provided, update the communication record
    if (communicationId) {
      const { data: existing } = await supabase
        .from('communications')
        .select('metadata')
        .eq('id', communicationId)
        .single();

      const updatedMetadata = {
        ...(existing?.metadata as Record<string, unknown> || {}),
        transcript,
        transcribed_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('communications')
        .update({ metadata: updatedMetadata })
        .eq('id', communicationId);

      if (updateError) {
        console.error('Error updating communication:', updateError);
      } else {
        console.log('Communication updated with transcript');
      }
    }

    return new Response(
      JSON.stringify({ transcript, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
