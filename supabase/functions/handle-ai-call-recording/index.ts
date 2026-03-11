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
        const url = new URL(req.url);
        const callRequestId = url.searchParams.get('callRequestId');
        const communicationId = url.searchParams.get('communicationId');

        if (!callRequestId) {
            return new Response(JSON.stringify({ error: 'callRequestId is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const formData = await req.formData();
        const recordingUrl = formData.get('RecordingUrl');
        const recordingDuration = formData.get('RecordingDuration');

        console.log(`Handling recording for callRequestId: ${callRequestId}, communicationId: ${communicationId}`);
        console.log(`Recording URL: ${recordingUrl}, Duration: ${recordingDuration}`);

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { error: updateError } = await supabase
            .from('ai_call_requests')
            .update({
                call_recording_url: recordingUrl,
                call_duration: recordingDuration ? parseInt(recordingDuration.toString()) : null,
                call_status: 'completed' // Record action usually signifies the end of our scripted AI flow
            })
            .eq('id', callRequestId);

        if (updateError) {
            console.error('Error updating call request with recording:', updateError);
            return new Response(JSON.stringify({ error: 'Failed to update record' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Sync to communications table if ID provided
        if (communicationId) {
            await supabase
                .from('communications')
                .update({
                    call_recording_url: recordingUrl,
                    call_duration: recordingDuration ? parseInt(recordingDuration.toString()) : null,
                    status: 'completed'
                })
                .eq('id', communicationId);
        }

        // --- Trigger Sales Coach (Einstein AI Layer) ---
        // We run this in the background to avoid blocking the Twilio response
        (async () => {
            try {
                const coachResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-call-coach`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${supabaseServiceKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        recordingUrl,
                        callRequestId,
                        communicationId
                    }),
                });

                if (!coachResponse.ok) {
                    console.error('Failed to trigger sales coach:', await coachResponse.text());
                } else {
                    console.log('Sales coach triggered successfully');
                }
            } catch (coachError) {
                console.error('Error triggering sales coach:', coachError);
            }
        })();

        // TwiML response to hang up after recording
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;

        return new Response(twiml, {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error in handle-ai-call-recording:', error);
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
