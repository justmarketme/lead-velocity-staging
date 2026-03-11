import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FORBIDDEN_WORDS = ["best", "save X%", "recommend", "guarantee", "advice"];

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { recordingUrl, callRequestId, communicationId } = await req.json();

        if (!recordingUrl || !callRequestId) {
            return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Fetch Call & Broker Info
        const { data: callRequest, error: callError } = await supabase
            .from('ai_call_requests')
            .select('*, brokers(*)')
            .eq('id', callRequestId)
            .single();

        if (callError || !callRequest) {
            throw new Error('Call request not found');
        }

        const brokerId = callRequest.brokers?.id;

        // 2. Transcribe & Analyze with Gemini 1.5 Pro/Flash
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

        // We fetch the recording content
        const audioRes = await fetch(recordingUrl);
        const audioBlob = await audioRes.blob();
        const audioBase64 = await blobToBase64(audioBlob);

        const systemPrompt = `You are an elite Sales Coach analyzed calls for 'Ayanda', a freelance appointment setter for insurance brokers.
Analyze the provided audio and return a JSON object with the following structure:
{
  "summary": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"], // client name, pain points, objections, key responses, outcome
  "scorecard": {
    "rapport": 0-25,
    "listening": 0-25,
    "objection_handling": 0-25,
    "close": 0-25,
    "compliance_bonus": 0 or 10,
    "total": 0-110
  },
  "feedback": [
    { "timestamp": "MM:SS", "technique": "Name", "comment": "Why it worked/didn't" }
  ],
  "actionable_suggestion": "One clear suggestion",
  "compliance": {
    "is_compliant": boolean,
    "findings": [ { "word": "forbidden word", "correction": "suggestion" } ],
    "status_text": "Compliant ✓" or "Red Flag 🚩"
  },
  "whatsapp_preview": "Text of the confirmation WhatsApp"
}

Compliance forbidden words: ${FORBIDDEN_WORDS.join(", ")}.
Ayanda's style: Ben Feldman, Jeremy Miner, Zig Ziglar, Joe Girard.
Keep feedback positive, short, and useful.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: systemPrompt },
                        {
                            inline_data: {
                                mime_type: "audio/wav",
                                data: audioBase64
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.2,
                    response_mime_type: "application/json"
                }
            })
        });

        const geminiData = await geminiRes.json();
        const analysis = JSON.parse(geminiData.candidates[0].content.parts[0].text);

        // 3. Save Coaching Data
        const { data: coaching, error: coachingError } = await supabase
            .from('call_coaching')
            .insert({
                call_request_id: callRequestId,
                broker_id: brokerId,
                client_name: callRequest.recipient_name,
                summary_bullets: analysis.summary,
                scorecard: analysis.scorecard,
                total_score: analysis.scorecard.total,
                coach_feedback: {
                    detailed: analysis.feedback,
                    suggestion: analysis.actionable_suggestion
                },
                fsca_compliance: analysis.compliance,
                whatsapp_sent: analysis.whatsapp_preview
            })
            .select()
            .single();

        if (coachingError) throw coachingError;

        // 4. Update Dashboard Flags
        const outcome = analysis.summary[4]?.toLowerCase() || "";
        const isBooked = outcome.includes("booked") || outcome.includes("confirmed") || analysis.appointment_confirmed;

        if (isBooked) {
            // Find if there's an appointment for this lead
            const { data: appointment } = await supabase
                .from('appointments')
                .select('*')
                .match({ broker_id: brokerId, client_id: callRequest.recipient_id })
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Mark as confirmed if we found one (simulating "Calendly slot locked")
            if (appointment) {
                // Check for WhatsApp confirmation (at least one sent)
                const { data: whatsappSent } = await supabase
                    .from('communications')
                    .select('id')
                    .match({
                        channel: 'whatsapp',
                        recipient_contact: callRequest.recipient_phone,
                        direction: 'outbound'
                    })
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (whatsappSent) {
                    await supabase
                        .from('appointments')
                        .update({ status: 'confirmed' })
                        .eq('id', appointment.id);

                    // Trigger Fee Logic: Check for BOTH confirmation AND follow-up WhatsApp
                    const { count: whatsappCount } = await supabase
                        .from('communications')
                        .select('*', { count: 'exact', head: true })
                        .match({
                            channel: 'whatsapp',
                            recipient_contact: callRequest.recipient_phone,
                            direction: 'outbound'
                        });

                    if (whatsappCount && whatsappCount >= 2) {
                        await supabase
                            .from('call_coaching')
                            .update({ fee_triggered: true })
                            .eq('id', coaching.id);

                        await supabase.from('system_logs').insert({
                            level: 'info',
                            module: 'sales-coach',
                            message: `FEE TRIGGERED: Both WhatsApps sent for call ${callRequestId}.`,
                            metadata: { coaching_id: coaching.id, broker_id: brokerId }
                        });
                    }
                }
            }

            // Log in broker's call log
            await supabase.from('system_logs').insert({
                level: 'info',
                module: 'sales-coach',
                message: `Call Analysis: ${callRequest.recipient_name} - ${outcome}`,
                metadata: { coaching_id: coaching.id, broker_id: brokerId }
            });
        }

        // 5. Self-Improvement & Warnings
        // - Voice fatigue warning after 20 calls/day
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const { count: dailyCalls } = await supabase
            .from('ai_call_requests')
            .select('*', { count: 'exact', head: true })
            .eq('requested_by', callRequest.requested_by)
            .gte('created_at', startOfToday.toISOString());

        if (dailyCalls && dailyCalls >= 20) {
            await supabase.from('system_logs').insert({
                level: 'warning',
                module: 'sales-coach',
                message: `VOICE FATIGUE ALERT: Broker ${brokerId} has reached ${dailyCalls} calls today. Suggest rest.`,
                metadata: { broker_id: brokerId, daily_calls: dailyCalls }
            });
        }

        // - A/B Stats every 50 calls
        const { count: totalCallCount } = await supabase
            .from('ai_call_requests')
            .select('*', { count: 'exact', head: true })
            .eq('requested_by', callRequest.requested_by);

        if (totalCallCount && totalCallCount % 50 === 0) {
            const { data: lastCalls } = await supabase
                .from('ai_call_requests')
                .select('opener_index, call_status')
                .eq('requested_by', callRequest.requested_by)
                .order('created_at', { ascending: false })
                .limit(50);

            if (lastCalls) {
                const stats: Record<number, { success: number, total: number }> = {};
                lastCalls.forEach(c => {
                    const idx = c.opener_index ?? 0;
                    if (!stats[idx]) stats[idx] = { success: 0, total: 0 };
                    stats[idx].total++;
                    if (c.call_status === 'completed') stats[idx].success++;
                });

                let bestIdx = 0; let bestRate = -1;
                Object.entries(stats).forEach(([idx, info]) => {
                    const rate = info.success / info.total;
                    if (rate > bestRate) { bestRate = rate; bestIdx = parseInt(idx); }
                });

                await supabase.from('system_logs').insert({
                    level: 'info',
                    module: 'sales-coach',
                    message: `A/B INSIGHT: Opener ${bestIdx} is performing best (${(bestRate * 100).toFixed(1)}% success). Selection optimized.`,
                    metadata: { stats, recommended_opener: bestIdx }
                });
            }
        }

        return new Response(JSON.stringify({ success: true, coaching_id: coaching.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Sales Coach Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
