import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Bridges Twilio Media Stream (mulaw 8kHz) <-> ElevenLabs ConvAI WebSocket
serve(async (req) => {
    const upgrade = req.headers.get('upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        return new Response('WebSocket upgrade required', { status: 426 });
    }

    const url = new URL(req.url);
    const requestId = url.searchParams.get('requestId');

    if (!requestId) {
        return new Response('requestId required', { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch ElevenLabs signed URL + config overrides stored during call creation
    const { data: callRecord } = await supabase
        .from('ai_call_requests')
        .select('metadata, call_sid')
        .eq('id', requestId)
        .single();

    const elevenLabsSignedUrl = callRecord?.metadata?.elevenLabsSignedUrl;
    const systemPrompt = callRecord?.metadata?.systemPrompt || '';
    const firstMessage = callRecord?.metadata?.firstMessage || '';
    const voiceId = callRecord?.metadata?.voiceId || 'EXAVITQu4vr4xnSDxMaL';

    if (!elevenLabsSignedUrl) {
        return new Response('ElevenLabs URL not found for this call', { status: 404 });
    }

    // Upgrade Twilio connection to WebSocket
    const { socket: twilioWs, response } = Deno.upgradeWebSocket(req);

    let streamSid = '';
    let elevenLabsWs: WebSocket | null = null;
    let elevenLabsReady = false;

    // Open ElevenLabs WebSocket immediately
    elevenLabsWs = new WebSocket(elevenLabsSignedUrl);

    elevenLabsWs.onopen = () => {
        elevenLabsReady = true;
        // Send config overrides + instruct ElevenLabs to output mulaw 8kHz for Twilio
        elevenLabsWs!.send(JSON.stringify({
            type: 'conversation_initiation_client_data',
            conversation_config_override: {
                agent: {
                    prompt: { prompt: systemPrompt },
                    first_message: firstMessage,
                },
                tts: {
                    voice_id: voiceId,
                    output_format: 'ulaw_8000',
                },
            },
        }));
    };

    elevenLabsWs.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);

            // Forward audio from ElevenLabs → Twilio
            if (msg.type === 'audio' && msg.audio_event?.audio_base_64) {
                if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
                    twilioWs.send(JSON.stringify({
                        event: 'media',
                        streamSid,
                        media: { payload: msg.audio_event.audio_base_64 },
                    }));
                }
            }

            // ElevenLabs interruption — clear Twilio audio buffer
            if (msg.type === 'interruption') {
                if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
                    twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
                }
            }

            // Log call end
            if (msg.type === 'conversation_ended' || msg.type === 'agent_hang_up') {
                twilioWs.close();
            }
        } catch (e) {
            console.error('ElevenLabs message parse error:', e);
        }
    };

    elevenLabsWs.onerror = (e) => console.error('ElevenLabs WS error:', e);
    elevenLabsWs.onclose = () => {
        if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    };

    twilioWs.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);

            if (msg.event === 'start') {
                streamSid = msg.start?.streamSid || msg.streamSid || '';
                console.log('Twilio stream started, streamSid:', streamSid);
            }

            // Forward audio from Twilio → ElevenLabs
            if (msg.event === 'media' && elevenLabsWs?.readyState === WebSocket.OPEN && elevenLabsReady) {
                elevenLabsWs.send(JSON.stringify({
                    user_audio_chunk: msg.media.payload,
                }));
            }

            if (msg.event === 'stop') {
                console.log('Twilio stream stopped');
                elevenLabsWs?.close();
            }
        } catch (e) {
            console.error('Twilio message parse error:', e);
        }
    };

    twilioWs.onerror = (e) => console.error('Twilio WS error:', e);
    twilioWs.onclose = () => {
        elevenLabsWs?.close();
        // Mark call completed
        supabase.from('ai_call_requests')
            .update({ call_status: 'completed' })
            .eq('id', requestId)
            .then(() => {});
    };

    return response;
});
