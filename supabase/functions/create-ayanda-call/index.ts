import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AYANDA_PERSONALITY } from "../_shared/ayanda_persona.ts";
import { normalizePhoneNumber } from "../_shared/utils.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
        const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');
        const AYANDA_VOICE = Deno.env.get('ELEVENLABS_AYANDA_VOICE_ID') || 'EXAVITQu4vr4xnSDxMaL'; // Sarah
        const EXA_API_KEY = Deno.env.get('EXA_API_KEY');

        if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured.');
        if (!ELEVENLABS_AGENT_ID) throw new Error('ELEVENLABS_AGENT_ID not configured.');

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const {
            leadId,
            brokerId,
            isRoleplay = false,
            systemPrompt: systemPromptOverride,
            phone: phoneOverride,
            recipientName,
        } = await req.json();

        // 1. Resolve lead/contact
        let lead: any = null;
        if (leadId) {
            const { data, error } = await supabase
                .from('leads')
                .select('first_name, last_name, phone, source, notes')
                .eq('id', leadId)
                .single();
            if (error || !data) throw new Error(`Lead not found: ${error?.message}`);
            lead = data;
        } else if (phoneOverride) {
            const parts = (recipientName || 'there').split(' ');
            lead = { first_name: parts[0], last_name: parts.slice(1).join(' ') || '', phone: phoneOverride, source: 'direct', notes: '' };
        } else {
            throw new Error('Either leadId or phone must be provided.');
        }

        // 2. Resolve broker
        const { data: broker } = await supabase
            .from('brokers')
            .select('contact_person, firm_name, calendar_email, firm_address')
            .eq('id', brokerId)
            .single();

        const brokerName = broker?.contact_person || 'Your Broker';
        const firmName = broker?.firm_name || 'Lead Velocity';
        const firmAddress = broker?.firm_address || 'TBA';

        // 3. Exa research (warm lead context)
        let researchContext = 'No recent specific updates found.';
        if (EXA_API_KEY && !isRoleplay) {
            try {
                const q = `Latest news for ${lead.notes || lead.first_name + ' ' + lead.last_name}`;
                const r = await fetch('https://api.exa.ai/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY },
                    body: JSON.stringify({ query: q, type: 'auto', numResults: 2, contents: { highlights: { maxCharacters: 400 } } }),
                });
                if (r.ok) {
                    const d = await r.json();
                    researchContext = d.results.map((x: any) => `Source: ${x.title}\nUpdate: ${x.highlights?.[0] || 'N/A'}`).join('\n---\n');
                }
            } catch (e) { console.error('Exa failed:', e); }
        }

        // 4. Build system prompt + first message
        const fullSystemPrompt = systemPromptOverride || AYANDA_PERSONALITY
            .replace(/{broker_name}/g, brokerName)
            .replace(/{firm_name}/g, firmName)
            .replace(/{firm_address}/g, firmAddress)
            .replace(/{customer_name}/g, lead.first_name || 'there')
            .replace(/{research_context}/g, researchContext);

        const firstMessage = systemPromptOverride
            ? `Hi, is this ${lead.first_name || 'there'}? I'm Ayanda, calling from Vantage Stack — do you have two minutes?`
            : `Hi ${lead.first_name || 'there'}, Ayanda here — calling on behalf of ${brokerName}'s office at ${firmName}. I'm not calling for a sales pitch — I had one quick clarifying question. Do you have 20 seconds?`;

        // 5. Log call request in DB
        const { data: callRequest } = await supabase
            .from('ai_call_requests')
            .insert({
                recipient_id: leadId || null,
                recipient_name: `${lead.first_name} ${lead.last_name}`,
                recipient_phone: lead.phone,
                call_purpose: 'appointment_scheduling',
                call_status: 'pending',
                is_roleplay: isRoleplay,
                call_goal: lead.source || 'General Engagement',
            })
            .select()
            .single();

        // 6. Get ElevenLabs signed WebSocket URL (GET with agent_id query param)
        // Config overrides (system prompt, voice, first message) are sent as the first WS message in the bridge
        const elevenLabsRes = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
            { method: 'GET', headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
        );

        if (!elevenLabsRes.ok) {
            const err = await elevenLabsRes.text();
            throw new Error(`ElevenLabs signed URL error: ${elevenLabsRes.status}. ${err}`);
        }

        const { signed_url: elevenLabsSignedUrl } = await elevenLabsRes.json();

        // 7. Store signed URL in DB so the bridge can fetch it by requestId
        if (callRequest) {
            await supabase.from('ai_call_requests').update({
                metadata: { elevenLabsSignedUrl, systemPrompt: fullSystemPrompt, firstMessage, voiceId: AYANDA_VOICE },
            }).eq('id', callRequest.id);
        }

        // 8. Create Twilio outbound call → bridge WebSocket → ElevenLabs
        const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || '+27600185071';

        if (!twilioAccountSid || !twilioAuthToken) throw new Error('Twilio credentials not configured.');

        // Bridge URL — Twilio streams audio here, we forward to ElevenLabs
        const bridgeUrl = `${supabaseUrl.replace('https://', 'wss://')}/functions/v1/ayanda-phone-bridge?requestId=${callRequest?.id}`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${bridgeUrl}" />
  </Connect>
</Response>`;

        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: normalizePhoneNumber(lead.phone),
                From: fromNumber,
                Twiml: twiml,
            }),
        });

        if (!twilioRes.ok) {
            const err = await twilioRes.text();
            throw new Error(`Twilio error: ${twilioRes.status}. ${err}`);
        }

        const twilioData = await twilioRes.json();

        // 9. Update DB with Twilio SID
        if (callRequest) {
            await supabase.from('ai_call_requests').update({
                call_sid: twilioData.sid,
                call_status: 'in_progress',
                join_url: elevenLabsSignedUrl,
            }).eq('id', callRequest.id);
        }

        return new Response(
            JSON.stringify({ twilioCallSid: twilioData.sid, callRequestId: callRequest?.id }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('Error in create-ayanda-call:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
