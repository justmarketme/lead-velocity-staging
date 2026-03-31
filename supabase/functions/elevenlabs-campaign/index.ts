import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AYANDA_PERSONALITY_CONDENSED } from "../_shared/ayanda_persona.ts";

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

// ----------------------------------------------------------------
// Ultravox: creates a real-time voice AI call using Ultravox LLM
// + ElevenLabs TTS, connected to Twilio via WebSocket stream.
// Achieves ~300-500ms latency vs ~1500ms with naive approaches.
// ----------------------------------------------------------------
async function createUltravoxCall(
    apiKey: string,
    systemPrompt: string,
    voiceId: string,
    firstMessage: string,
    leadName: string,
): Promise<{ callId: string; joinUrl: string } | null> {
    try {
        const res = await fetch("https://api.ultravox.ai/api/calls", {
            method: "POST",
            headers: {
                "X-API-Key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                // Brain: Ultravox base model (fastest — ~80ms STT+inference)
                model: "fixie-ai/ultravox",
                systemPrompt,
                // Voice: ElevenLabs TTS via Ultravox's streaming integration
                voice: `elevenlabs:${voiceId}`,
                // Agent speaks first — eliminates dead air on pickup
                firstSpeaker: "FIRST_SPEAKER_AGENT",
                initialMessages: [
                    { role: "MESSAGE_ROLE_AGENT", text: firstMessage },
                ],
                // Twilio WebSocket medium — returns joinUrl for <Stream>
                medium: { twilio: {} },
                // Natural SA call-enders
                endCallPhrases: [
                    "goodbye", "bye bye", "totsiens", "sala kahle",
                    "not interested bye", "please remove me",
                ],
                // Keep calls focused and Twilio costs bounded
                maxDuration: "240s",
                recordingEnabled: true,
                // Inactivity handling — don't let silences kill the call
                inactivityMessages: [
                    {
                        duration: "8s",
                        message: "Hey, are you still there?",
                        endBehavior: "END_BEHAVIOR_IGNORE",
                    },
                    {
                        duration: "15s",
                        message: "I'll leave it there for now — I hope to connect with you again soon. Take care!",
                        endBehavior: "END_BEHAVIOR_HANG_UP",
                    },
                ],
            }),
        });

        if (!res.ok) {
            console.error("Ultravox call creation failed:", res.status, await res.text());
            return null;
        }

        const data = await res.json();
        return { callId: data.callId, joinUrl: data.joinUrl };
    } catch (err) {
        console.error("Ultravox error:", err);
        return null;
    }
}

// Build the Ayanda system prompt for a specific campaign call
function buildSystemPrompt(knowledgeBase: string, objective: string): string {
    const objectiveContext: Record<string, string> = {
        cold_call: "This is a cold call. Use the Hook → Story → NEPQ sequence to qualify and book.",
        appointment_scheduling: "Focus on booking a 15-minute consultation. Use assumptive close.",
        follow_up: "This is a follow-up call. Reference prior contact warmly, then move toward booking.",
        product_pitch: "Briefly present the key benefit from the knowledge base, then pivot to booking.",
    };

    return AYANDA_PERSONALITY_CONDENSED
        .replace("{{KNOWLEDGE_BASE}}", knowledgeBase || "South African financial protection products — life cover, income protection, disability cover.")
        + `\n\nCall objective: ${objectiveContext[objective] || objectiveContext.cold_call}`;
}

// Build a natural first message for Ayanda based on objective
function buildFirstMessage(objective: string, leadName: string): string {
    const firstName = leadName?.split(" ")[0] || "there";
    if (objective === "follow_up") {
        return `Hey ${firstName}, it's Ayanda — is this a terrible time for literally two minutes?`;
    }
    if (objective === "appointment_scheduling") {
        return `Hey ${firstName}, Ayanda here — did I catch you at a bad time?`;
    }
    return `Hey ${firstName}, it's Ayanda — is this a terrible time for literally two minutes?`;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, payload } = await req.json();

        const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
        const ULTRAVOX_API_KEY = Deno.env.get("ULTRAVOX_API_KEY");
        const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
        const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
        // Prefer the paid SA number for all outbound campaigns
        const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_SA_PHONE_NUMBER") || Deno.env.get("TWILIO_PHONE_NUMBER");
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // ----------------------------------------------------------------
        // ACTION: get-voices
        // Returns ElevenLabs voice list, SA voices sorted to top
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

            formatted.sort((a: any, b: any) => (b.is_sa_voice ? 1 : 0) - (a.is_sa_voice ? 1 : 0));

            return new Response(JSON.stringify({
                voices: formatted,
                ultravox_available: !!ULTRAVOX_API_KEY,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // ----------------------------------------------------------------
        // ACTION: launch-campaign
        // Priority order:
        //   1. Ultravox + ElevenLabs (lowest latency, ~400ms, best quality)
        //   2. ElevenLabs Conversational AI (medium latency, ~600ms)
        //   3. Twilio Polly.Ayanda TTS (fallback, basic)
        // ----------------------------------------------------------------
        if (action === "launch-campaign") {
            const { campaign_id, leads, voice_config, knowledge_base, objective } = payload;

            if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
                return new Response(JSON.stringify({
                    error: "Missing Twilio credentials: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SA_PHONE_NUMBER",
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const systemPrompt = buildSystemPrompt(knowledge_base, objective);
            const useUltravox = !!ULTRAVOX_API_KEY && voice_config?.ai_engine !== "elevenlabs";

            // Attempt to pre-create a single ElevenLabs agent as fallback
            // (only if not using Ultravox, to avoid unnecessary API calls)
            let elevenLabsAgentId: string | null = null;
            if (!useUltravox && ELEVENLABS_API_KEY) {
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
                                    first_message: "Hey, it's Ayanda — is this a terrible time for literally two minutes?",
                                    language: "en",
                                },
                                tts: {
                                    voice_id: voice_config?.voice_id || "pNInz6obpgDQGcFmaJgB",
                                    stability: voice_config?.stability ?? 0.6,
                                    similarity_boost: voice_config?.similarity_boost ?? 0.8,
                                    style: voice_config?.style ?? 0.2,
                                    use_speaker_boost: voice_config?.use_speaker_boost ?? true,
                                },
                            },
                        }),
                    });
                    if (agentRes.ok) {
                        const agentData = await agentRes.json();
                        elevenLabsAgentId = agentData.agent_id;
                    }
                } catch (err) {
                    console.error("ElevenLabs agent creation error:", err);
                }
            }

            // Update campaign status to running
            await supabase
                .from("voice_campaigns")
                .update({ status: "running", launched_at: new Date().toISOString(), total_leads: leads.length })
                .eq("id", campaign_id);

            const callResults = [];

            for (const lead of leads) {
                const phone = lead.phone;

                const firstMessage = buildFirstMessage(objective, lead.name);

                // Insert call record
                const { data: callRecord } = await supabase
                    .from("voice_campaign_calls")
                    .insert({
                        campaign_id,
                        lead_id: lead.id,
                        call_status: "queued",
                        elevenlabs_agent_id: elevenLabsAgentId,
                    })
                    .select()
                    .single();

                if (!phone) {
                    if (callRecord) {
                        await supabase.from("voice_campaign_calls")
                            .update({ call_status: "failed", outcome: "no_phone" })
                            .eq("id", callRecord.id);
                    }
                    callResults.push({ lead_id: lead.id, status: "failed", reason: "no_phone" });
                    continue;
                }

                try {
                    let twiml: string;
                    let agentRef = elevenLabsAgentId;

                    if (useUltravox) {
                        // Path 1: Ultravox + ElevenLabs (preferred — lowest latency)
                        const ultravoxResult = await createUltravoxCall(
                            ULTRAVOX_API_KEY!,
                            systemPrompt,
                            voice_config?.voice_id || "pNInz6obpgDQGcFmaJgB",
                            firstMessage,
                            lead.name,
                        );

                        if (ultravoxResult?.joinUrl) {
                            twiml = `<Response><Connect><Stream url="${ultravoxResult.joinUrl}"/></Connect></Response>`;
                            agentRef = ultravoxResult.callId;
                            // Update the call record with the Ultravox call ID
                            if (callRecord) {
                                await supabase.from("voice_campaign_calls")
                                    .update({ elevenlabs_agent_id: ultravoxResult.callId })
                                    .eq("id", callRecord.id);
                            }
                        } else {
                            // Ultravox failed — fall through to ElevenLabs or Polly
                            console.warn(`Ultravox failed for lead ${lead.id}, falling back`);
                            twiml = elevenLabsAgentId
                                ? `<Response><Connect><Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${elevenLabsAgentId}"/></Connect></Response>`
                                : `<Response><Say voice="Polly.Ayanda" language="en-ZA">${firstMessage}</Say></Response>`;
                        }
                    } else if (elevenLabsAgentId) {
                        // Path 2: ElevenLabs Conversational AI
                        twiml = `<Response><Connect><Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${elevenLabsAgentId}"/></Connect></Response>`;
                    } else {
                        // Path 3: Polly fallback
                        twiml = `<Response><Say voice="Polly.Ayanda" language="en-ZA">${firstMessage}</Say><Pause length="1"/><Say voice="Polly.Ayanda" language="en-ZA">Please call us back to arrange a quick chat. Have a great day!</Say></Response>`;
                    }

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
                            await supabase.from("voice_campaign_calls")
                                .update({ call_status: "initiated", call_sid: twilioData.sid })
                                .eq("id", callRecord.id);
                        }
                        await supabase.from("scraped_leads")
                            .update({ status: "contacted" })
                            .eq("id", lead.id);
                        callResults.push({
                            lead_id: lead.id,
                            status: "initiated",
                            call_sid: twilioData.sid,
                            engine: useUltravox ? "ultravox" : "elevenlabs",
                        });
                    } else {
                        const errText = await twilioRes.text();
                        console.error("Twilio call failed:", errText);
                        if (callRecord) {
                            await supabase.from("voice_campaign_calls")
                                .update({ call_status: "failed" })
                                .eq("id", callRecord.id);
                        }
                        callResults.push({ lead_id: lead.id, status: "failed", reason: errText });
                    }
                } catch (callErr) {
                    console.error("Call initiation error:", callErr);
                    callResults.push({ lead_id: lead.id, status: "error", reason: String(callErr) });
                }

                // 500ms between dials — avoids Twilio rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const contactedCount = callResults.filter(r => r.status === "initiated").length;
            await supabase.from("voice_campaigns")
                .update({ contacted: contactedCount })
                .eq("id", campaign_id);

            return new Response(JSON.stringify({
                success: true,
                campaign_id,
                engine: useUltravox ? "ultravox+elevenlabs" : elevenLabsAgentId ? "elevenlabs" : "polly",
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
        console.error("Campaign Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
