import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// South African accent keywords to flag voices
const SA_VOICE_KEYWORDS = ["south african", "african", "callum", "ayanda", "ze", "zulu", "afrikaans", "en-za"];

function isSAVoice(voice: any): boolean {
    const labels = Object.values(voice.labels || {}).join(" ").toLowerCase();
    const name = (voice.name || "").toLowerCase();
    return SA_VOICE_KEYWORDS.some(k => labels.includes(k) || name.includes(k));
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload } = await req.json();

        const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
        const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
        const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
        const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // ----------------------------------------------------------------
        // ACTION: get-voices
        // Returns ElevenLabs voice list, flagging SA-relevant voices
        // ----------------------------------------------------------------
        if (action === "get-voices") {
            if (!ELEVENLABS_API_KEY) {
                return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const res = await fetch("https://api.elevenlabs.io/v1/voices", {
                headers: { "xi-api-key": ELEVENLABS_API_KEY },
            });

            if (!res.ok) {
                const errText = await res.text();
                return new Response(JSON.stringify({ error: `ElevenLabs API error: ${errText}` }), {
                    status: res.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const { voices } = await res.json();
            const formatted = (voices || []).map((v: any) => ({
                voice_id: v.voice_id,
                name: v.name,
                category: v.category,
                labels: v.labels || {},
                preview_url: v.preview_url,
                is_sa_voice: isSAVoice(v),
            }));

            // Sort SA voices to top
            formatted.sort((a: any, b: any) => (b.is_sa_voice ? 1 : 0) - (a.is_sa_voice ? 1 : 0));

            return new Response(JSON.stringify({ voices: formatted }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // ----------------------------------------------------------------
        // ACTION: launch-campaign
        // Creates an ElevenLabs conversational AI agent and dials each lead
        // via Twilio, bridging to the ElevenLabs WebSocket conversation
        // ----------------------------------------------------------------
        if (action === "launch-campaign") {
            const { campaign_id, leads, voice_config, knowledge_base, objective } = payload;

            if (!ELEVENLABS_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
                return new Response(JSON.stringify({
                    error: "Missing required environment variables: ELEVENLABS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER"
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // Map objective to a call script prompt
            const objectivePrompts: Record<string, string> = {
                cold_call: "You are making a cold call. Introduce yourself, build rapport, and find out if the prospect has any interest in financial protection products.",
                appointment_scheduling: "You are calling to schedule a 15-minute consultation appointment with a financial advisor.",
                follow_up: "You are following up on a previous interaction. Reconnect warmly and move the conversation toward a next step.",
                product_pitch: "You are presenting a tailored financial product solution. Focus on the key benefit most relevant to the prospect.",
            };

            const systemPrompt = `${objectivePrompts[objective] || objectivePrompts.cold_call}

Knowledge Base:
${knowledge_base || "You represent Lead Velocity, a South African financial services company. Be professional, warm, and FSCA compliant. Never give specific financial advice or guarantee returns."}

Guidelines:
- Speak naturally in a South African context
- Be conversational and empathetic
- Respect FSCA compliance — do not guarantee returns or give specific financial advice
- If the lead is interested, offer to schedule a follow-up appointment
- Keep calls concise — under 3 minutes`;

            // Create ElevenLabs Conversational AI agent
            let agentId: string | null = null;
            try {
                const agentRes = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
                    method: "POST",
                    headers: {
                        "xi-api-key": ELEVENLABS_API_KEY,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: `Campaign ${campaign_id} Agent`,
                        conversation_config: {
                            agent: {
                                prompt: { prompt: systemPrompt },
                                first_message: "Hello, this is Ayanda calling from Lead Velocity. Is this a good time to speak for just a moment?",
                                language: "en",
                            },
                            tts: {
                                voice_id: voice_config?.voice_id || "pNInz6obpgDQGcFmaJgB",
                                stability: voice_config?.stability ?? 0.5,
                                similarity_boost: voice_config?.similarity_boost ?? 0.75,
                                style: voice_config?.style ?? 0.3,
                                use_speaker_boost: voice_config?.use_speaker_boost ?? true,
                            },
                        },
                    }),
                });

                if (agentRes.ok) {
                    const agentData = await agentRes.json();
                    agentId = agentData.agent_id;
                } else {
                    console.error("ElevenLabs agent creation failed:", await agentRes.text());
                }
            } catch (err) {
                console.error("ElevenLabs agent creation error:", err);
            }

            // Update campaign status to running
            await supabase
                .from("voice_campaigns")
                .update({ status: "running", launched_at: new Date().toISOString(), total_leads: leads.length })
                .eq("id", campaign_id);

            const callResults = [];

            for (const lead of leads) {
                const phone = lead.phone;

                // Insert call record with queued status
                const { data: callRecord } = await supabase
                    .from("voice_campaign_calls")
                    .insert({
                        campaign_id,
                        lead_id: lead.id,
                        call_status: "queued",
                        elevenlabs_agent_id: agentId,
                    })
                    .select()
                    .single();

                // If no phone number, mark as failed and skip
                if (!phone) {
                    if (callRecord) {
                        await supabase
                            .from("voice_campaign_calls")
                            .update({ call_status: "failed", outcome: "no_phone" })
                            .eq("id", callRecord.id);
                    }
                    callResults.push({ lead_id: lead.id, status: "failed", reason: "no_phone" });
                    continue;
                }

                // Build TwiML that bridges the Twilio call to ElevenLabs WebSocket
                const twimlUrl = agentId
                    ? `${SUPABASE_URL}/functions/v1/elevenlabs-twiml?agent_id=${agentId}&call_record_id=${callRecord?.id || ""}`
                    : null;

                try {
                    // If we have an ElevenLabs agent, use the TwiML bridge; otherwise use Polly fallback
                    const twiml = twimlUrl
                        ? `<Response><Connect><Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}"/></Connect></Response>`
                        : `<Response><Say voice="Polly.Ayanda" language="en-ZA">Hello, this is Ayanda calling from Lead Velocity. Please hold while we connect you with a consultant.</Say></Response>`;

                    const twilioCredentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
                    const twilioRes = await fetch(
                        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
                        {
                            method: "POST",
                            headers: {
                                "Authorization": `Basic ${twilioCredentials}`,
                                "Content-Type": "application/x-www-form-urlencoded",
                            },
                            body: new URLSearchParams({
                                To: phone,
                                From: TWILIO_PHONE_NUMBER,
                                Twiml: twiml,
                                StatusCallback: `${SUPABASE_URL}/functions/v1/handle-ai-call-status?callRecordId=${callRecord?.id || ""}`,
                                StatusCallbackMethod: "POST",
                            }),
                        }
                    );

                    if (twilioRes.ok) {
                        const twilioData = await twilioRes.json();
                        if (callRecord) {
                            await supabase
                                .from("voice_campaign_calls")
                                .update({ call_status: "initiated", call_sid: twilioData.sid })
                                .eq("id", callRecord.id);
                        }
                        await supabase
                            .from("scraped_leads")
                            .update({ status: "contacted" })
                            .eq("id", lead.id);
                        callResults.push({ lead_id: lead.id, status: "initiated", call_sid: twilioData.sid });
                    } else {
                        const errText = await twilioRes.text();
                        console.error("Twilio call failed:", errText);
                        if (callRecord) {
                            await supabase
                                .from("voice_campaign_calls")
                                .update({ call_status: "failed" })
                                .eq("id", callRecord.id);
                        }
                        callResults.push({ lead_id: lead.id, status: "failed", reason: errText });
                    }
                } catch (callErr) {
                    console.error("Call initiation error:", callErr);
                    callResults.push({ lead_id: lead.id, status: "error", reason: String(callErr) });
                }

                // Small delay between calls to avoid overwhelming Twilio
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Update campaign contacted count
            const contactedCount = callResults.filter(r => r.status === "initiated").length;
            await supabase
                .from("voice_campaigns")
                .update({ contacted: contactedCount })
                .eq("id", campaign_id);

            return new Response(JSON.stringify({
                success: true,
                campaign_id,
                agent_id: agentId,
                results: callResults,
                initiated: contactedCount,
                total: leads.length,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("ElevenLabs Campaign Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
