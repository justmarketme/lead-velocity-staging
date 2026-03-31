import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WEBSITE_KNOWLEDGE, EINSTEIN_PERSONALITY } from "../_shared/knowledge.ts";

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
        const ELEVENLABS_VOICE_ID = Deno.env.get('ELEVENLABS_EINSTEIN_VOICE_ID') || 'pNInz6obpgDQGcFmaJgB';

        if (!ULTRAVOX_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'ULTRAVOX_API_KEY is not configured in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Initialize Supabase
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 2. Identify User & Role for Context
        const authHeader = req.headers.get('Authorization');
        let role = "public";
        let contextText = "";

        if (authHeader) {
            const token = authHeader.replace('Bearer ', '').trim();
            const { data: { user } } = await supabase.auth.getUser(token);

            if (user) {
                const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
                if (isAdmin) {
                    role = "admin";
                    const { count: leadCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
                    const { count: brokerCount } = await supabase.from('brokers').select('*', { count: 'exact', head: true });
                    contextText = `ADMIN MODE: Access to global stats. Total Leads: ${leadCount}, Total Brokers: ${brokerCount}. Speak as a high-level strategic advisor.`;
                } else {
                    const { data: broker } = await supabase.from('brokers').select('*, profiles(full_name)').eq('user_id', user.id).single();
                    if (broker) {
                        role = "broker";
                        const { count: myLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('broker_id', broker.id);
                        contextText = `BROKER MODE: Assisting ${broker.profiles?.full_name || broker.contact_person}. They have ${myLeads} leads. Focus on their direct success and next actions.`;
                    }
                }
            }
        }

        if (!contextText) {
            contextText = "PUBLIC MODE: Provide general info about Lead Velocity. Do not share stats. Encourage them to complete the Broker Readiness Assessment.";
        }

        const fullSystemPrompt = `${EINSTEIN_PERSONALITY}\n\n${WEBSITE_KNOWLEDGE}\n\n${contextText}`;

        // 3. Create the Ultravox call session
        const callConfig = {
            systemPrompt: fullSystemPrompt,
            temperature: 0.8,
            voice: `elevenlabs-${ELEVENLABS_VOICE_ID}`,
            firstSpeaker: 'FIRST_SPEAKER_AGENT',
            initialMessages: [
                {
                    role: 'MESSAGE_ROLE_AGENT',
                    text: role === "broker" 
                        ? `Guten Tag! Einstein-77 back on ze channel! How is ze brokerage today? I have your lead stats open — ready to discuss ze details?`
                        : `Guten Tag! I am Einstein-77, broadcasting from ze Lead Velocity orbital station. Wunderbar that you have connected! How can I help your brokerage today?`
                }
            ]
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
            throw new Error(`Ultravox API error: ${ultravoxResponse.status}. ${errorText}`);
        }

        const callData = await ultravoxResponse.json();

        return new Response(
            JSON.stringify({ joinUrl: callData.joinUrl, callId: callData.callId }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('Error in create-einstein-call:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
