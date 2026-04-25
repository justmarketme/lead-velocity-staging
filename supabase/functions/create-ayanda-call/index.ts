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
        const EXA_API_KEY = Deno.env.get('EXA_API_KEY');

        if (!ELEVENLABS_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'ELEVENLABS_API_KEY is not configured in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!ELEVENLABS_AGENT_ID) {
            return new Response(
                JSON.stringify({ error: 'ELEVENLABS_AGENT_ID is not configured in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { leadId, brokerId, isRoleplay = false, systemPrompt: systemPromptOverride, phone: phoneOverride, recipientName } = await req.json();

        // 1. Fetch Lead & Broker Context (optional if phone override provided)
        let lead: any = null;
        if (leadId) {
            const { data: leadData, error: leadError } = await supabase
                .from('leads')
                .select('first_name, last_name, phone, source, notes')
                .eq('id', leadId)
                .single();
            if (leadError || !leadData) throw new Error(`Lead not found: ${leadError?.message}`);
            lead = leadData;
        } else if (phoneOverride) {
            const nameParts = (recipientName || 'there').split(' ');
            lead = { first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') || '', phone: phoneOverride, source: 'direct', notes: '' };
        } else {
            throw new Error('Either leadId or phone must be provided.');
        }

        const { data: broker } = await supabase
            .from('brokers')
            .select('contact_person, firm_name, calendar_email, firm_address')
            .eq('id', brokerId)
            .single();

        const brokerName = broker?.contact_person || "Your Broker";
        const firmName = broker?.firm_name || "Lead Velocity";
        const firmAddress = broker?.firm_address || "TBA";

        // 2. "Warm Lead" Research via Exa.ai
        let researchContext = "No recent specific updates found.";
        if (EXA_API_KEY && !isRoleplay) {
            try {
                const query = `Latest news and business updates for ${lead.notes || lead.first_name + ' ' + lead.last_name}`;
                const exaResponse = await fetch('https://api.exa.ai/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': EXA_API_KEY,
                    },
                    body: JSON.stringify({
                        query,
                        type: "auto",
                        numResults: 2,
                        contents: { highlights: { maxCharacters: 400 } }
                    }),
                });

                if (exaResponse.ok) {
                    const exaData = await exaResponse.json();
                    researchContext = exaData.results
                        .map((r: any) => `Source: ${r.title}\nUpdate: ${r.highlights?.[0] || 'N/A'}`)
                        .join("\n---\n");
                }
            } catch (err) {
                console.error("Exa research failed:", err);
            }
        }

        // 3. Log Call Request
        const { data: callRequest } = await supabase
            .from('ai_call_requests')
            .insert({
                recipient_id: leadId,
                recipient_name: `${lead.first_name} ${lead.last_name}`,
                recipient_phone: lead.phone,
                call_purpose: 'appointment_scheduling',
                call_status: 'pending',
                is_roleplay: isRoleplay,
                call_goal: lead.source || 'General Engagement',
            })
            .select()
            .single();

        // 4. Construct System Prompt with Research Context (or use override)
        const fullSystemPrompt = systemPromptOverride || AYANDA_PERSONALITY
            .replace(/{broker_name}/g, brokerName)
            .replace(/{firm_name}/g, firmName)
            .replace(/{firm_address}/g, firmAddress)
            .replace(/{customer_name}/g, lead.first_name || "there")
            .replace(/{research_context}/g, researchContext);

        const firstMessage = systemPromptOverride
            ? `Hi, is this ${lead.first_name || "there"}? I'm Ayanda, calling from Vantage Stack — do you have two minutes?`
            : `Hi ${lead.first_name || "there"}, Ayanda here — calling on behalf of ${brokerName}'s office at ${firmName}. I'm actually not calling for a sales pitch. I had one quick clarifying question for you — do you have a quick 20 seconds?`;

        // 5. Get Twilio TwiML from ElevenLabs
        const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || '+27600185071';

        const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                agent_id: ELEVENLABS_AGENT_ID,
                from_number: fromNumber,
                to_number: normalizePhoneNumber(lead.phone),
                conversation_config_override: {
                    agent: {
                        prompt: {
                            prompt: fullSystemPrompt,
                        },
                        first_message: firstMessage,
                    },
                },
            }),
        });

        if (!elevenLabsResponse.ok) {
            const errorText = await elevenLabsResponse.text();
            throw new Error(`ElevenLabs error: ${elevenLabsResponse.status}. ${errorText}`);
        }

        const twiml = await elevenLabsResponse.text();
        const conversationId = crypto.randomUUID();

        // 6. Initiate Twilio outbound call

        if (!twilioAccountSid || !twilioAuthToken) {
            throw new Error("Twilio credentials not found in environment.");
        }

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;

        const twilioResponse = await fetch(twilioUrl, {
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

        if (!twilioResponse.ok) {
            const errorText = await twilioResponse.text();
            throw new Error(`Twilio error: ${twilioResponse.status}. ${errorText}`);
        }

        const twilioData = await twilioResponse.json();

        // 7. Update call request with Sid
        if (callRequest) {
            await supabase
                .from('ai_call_requests')
                .update({
                    call_sid: twilioData.sid || conversationId,
                    call_status: 'in_progress',
                    join_url: '',
                })
                .eq('id', callRequest.id);
        }

        return new Response(
            JSON.stringify({
                joinUrl: '',
                callId: conversationId,
                twilioCallSid: twilioData.sid,
                callRequestId: callRequest?.id,
            }),
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
