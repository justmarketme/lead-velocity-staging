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
        const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
        const ELEVENLABS_EINSTEIN_AGENT_ID = Deno.env.get('ELEVENLABS_EINSTEIN_AGENT_ID');

        if (!ELEVENLABS_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'ELEVENLABS_API_KEY is not configured in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!ELEVENLABS_EINSTEIN_AGENT_ID) {
            return new Response(
                JSON.stringify({ error: 'ELEVENLABS_EINSTEIN_AGENT_ID is not configured in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Initialize Supabase
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 2. Identify user & role for context-aware prompt
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

        const systemPrompt = `${EINSTEIN_PERSONALITY}\n\n${WEBSITE_KNOWLEDGE}\n\n${contextText}`;
        const firstMessage = role === "broker"
            ? `Guten Tag! Einstein-77 back on ze channel! How is ze brokerage today? I have your lead stats open — ready to discuss ze details?`
            : `Guten Tag! I am Einstein-77, broadcasting from ze Lead Velocity orbital station. Wunderbar that you have connected! How can I help your brokerage today?`;

        // 3. Get ElevenLabs signed URL for browser conversation
        const signedUrlRes = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_EINSTEIN_AGENT_ID}`,
            { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
        );

        if (!signedUrlRes.ok) {
            const err = await signedUrlRes.text();
            throw new Error(`ElevenLabs signed URL error: ${signedUrlRes.status}. ${err}`);
        }

        const { signed_url } = await signedUrlRes.json();

        return new Response(
            JSON.stringify({ signedUrl: signed_url, systemPrompt, firstMessage }),
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
