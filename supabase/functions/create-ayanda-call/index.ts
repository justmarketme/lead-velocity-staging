import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AYANDA_PERSONALITY } from "../_shared/ayanda_persona.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const ULTRAVOX_API_KEY = Deno.env.get('ULTRAVOX_API_KEY');
        const EXA_API_KEY = Deno.env.get('EXA_API_KEY');
        const AYANDA_VOICE = Deno.env.get('ULTRAVOX_AYANDA_VOICE_ID') || 'a88fb2af-16ec-41a2-b6e9-86ef2f5c9622';

        if (!ULTRAVOX_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'ULTRAVOX_API_KEY is not configured in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { leadId, brokerId, isRoleplay = false } = await req.json();

        // 1. Fetch Lead & Broker Context
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('first_name, last_name, phone, source, notes')
            .eq('id', leadId)
            .single();

        if (leadError || !lead) throw new Error(`Lead not found: ${leadError?.message}`);

        const { data: broker, error: brokerError } = await supabase
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

        // 4. Construct System Prompt with Research Context
        const fullSystemPrompt = AYANDA_PERSONALITY
            .replace(/{broker_name}/g, brokerName)
            .replace(/{firm_name}/g, firmName)
            .replace(/{firm_address}/g, firmAddress)
            .replace(/{customer_name}/g, lead.first_name || "there")
            .replace(/{research_context}/g, researchContext);

        // 5. Create the Ultravox call session
        const callConfig = {
            systemPrompt: fullSystemPrompt,
            temperature: 0.7,
            voice: AYANDA_VOICE,
            firstSpeaker: 'FIRST_SPEAKER_AGENT',
            recordingEnabled: true,
            selectedTools: [
                {
                    temporaryTool: {
                        modelToolName: "book_appointment",
                        description: "Schedules a 15-minute consultation on the broker's calendar. Call this when the lead agrees to a meeting.",
                        staticParameters: [
                            { name: "toolName", location: "PARAMETER_LOCATION_BODY", value: "book_appointment" },
                            { name: "leadId", location: "PARAMETER_LOCATION_BODY", value: leadId },
                            { name: "brokerId", location: "PARAMETER_LOCATION_BODY", value: brokerId ?? "" }
                        ],
                        dynamicParameters: [
                            {
                                name: "appointment_time",
                                location: "PARAMETER_LOCATION_BODY",
                                schema: { type: "string", description: "ISO 8601 datetime string for the appointment" },
                                required: true
                            },
                            {
                                name: "notes",
                                location: "PARAMETER_LOCATION_BODY",
                                schema: { type: "string", description: "Short summary of the call outcome" },
                                required: false
                            }
                        ],
                        http: {
                            baseUrlPattern: `${supabaseUrl}/functions/v1/ayanda-tools-bridge`,
                            httpMethod: "POST"
                        }
                    }
                }
            ],
            initialMessages: [
                {
                    role: 'MESSAGE_ROLE_AGENT',
                    text: `Hi ${lead.first_name || "there"}, Ayanda here — calling on behalf of ${brokerName}'s office at ${firmName}. I'm actually not calling for a sales pitch. I had one quick clarifying question for you — do you have a quick 20 seconds?`
                }
            ],
            medium: { twilio: {} },
            firstSpeakerSettings: { agent: {} },
            voiceOverrides: { speed: 1.15 }
        };

        const ultravoxResponse = await fetch('https://api.ultravox.ai/api/calls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ULTRAVOX_API_KEY,
            },
            body: JSON.stringify(callConfig),
        });

        if (!ultravoxResponse.ok) {
            const errorText = await ultravoxResponse.text();
            throw new Error(`Ultravox error: ${ultravoxResponse.status}. ${errorText}`);
        }

        const callData = await ultravoxResponse.json();

        // 6. Initiate Twilio outbound call
        const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || '+27600185071';

        if (!twilioAccountSid || !twilioAuthToken) {
            throw new Error("Twilio credentials not found in environment.");
        }

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;

        // We construct the TwiML to connect to Ultravox
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${callData.joinUrl}">
      <Parameter name="callId" value="${callData.callId}" />
    </Stream>
  </Connect>
</Response>`;

        const twilioResponse = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: lead.phone,
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
                    call_sid: twilioData.sid || callData.callId,  // Store Twilio Sid
                    call_status: 'in_progress',
                    join_url: callData.joinUrl
                })
                .eq('id', callRequest.id);
        }

        return new Response(
            JSON.stringify({ 
                joinUrl: callData.joinUrl, 
                callId: callData.callId, // Ultravox Call ID
                twilioCallSid: twilioData.sid, // Twilio Call ID
                callRequestId: callRequest?.id 
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

