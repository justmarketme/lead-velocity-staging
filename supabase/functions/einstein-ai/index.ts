import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WEBSITE_KNOWLEDGE, EINSTEIN_PERSONALITY } from "../_shared/knowledge.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { query, history } = await req.json();
        const authHeader = req.headers.get('Authorization')!;

        // 1. Initialize Supabase
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 2. Identify User & Role
        const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

        let role = "public";
        let brokerData = null;
        let adminStats = null;

        if (user) {
            // Check for admin role
            const { data: isAdmin } = await supabase.rpc('has_role', {
                _user_id: user.id,
                _role: 'admin'
            });

            if (isAdmin) {
                role = "admin";
                // Fetch Global Admin Stats
                const { count: leadCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
                const { count: brokerCount } = await supabase.from('brokers').select('*', { count: 'exact', head: true });
                const today = new Date().toISOString().split('T')[0];
                const { count: leadsToday } = await supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', today);

                adminStats = { leadCount, brokerCount, leadsToday };
            } else {
                // Check for broker data
                const { data: broker } = await supabase
                    .from('brokers')
                    .select('*, profiles(full_name)')
                    .eq('user_id', user.id)
                    .single();

                if (broker) {
                    role = "broker";
                    // Fetch Broker Specific Stats
                    const { count: totalLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('broker_id', broker.id);
                    const today = new Date().toISOString().split('T')[0];
                    const { count: leadsToday } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('broker_id', broker.id).gte('created_at', today);
                    const { data: recentAppointments } = await supabase.from('appointments').select('*, leads(first_name, last_name)').eq('broker_id', broker.id).order('appointment_date', { ascending: false }).limit(5);

                    brokerData = {
                        name: broker.profiles?.full_name || broker.contact_person,
                        tier: broker.tier,
                        stats: { totalLeads, leadsToday, recentAppointments }
                    };
                }
            }
        }

        // 3. Construct System Prompt based on Role
        let systemPrompt = `${EINSTEIN_PERSONALITY}\n\n${WEBSITE_KNOWLEDGE}`;

        if (role === "admin") {
            systemPrompt += `\n\nADMIN MODE: You have full access to business intelligence.
        Global Stats:
        - Total Leads: ${adminStats.leadCount}
        - Total Brokers: ${adminStats.brokerCount}
        - New Leads Today: ${adminStats.leadsToday}`;
        } else if (role === "broker") {
            systemPrompt += `\n\nBROKER MODE: You are assisting ${brokerData.name}.
        Your Profile:
        - Tier: ${brokerData.tier}
        - Your Total Leads: ${brokerData.stats.totalLeads}
        - Your Leads Today: ${brokerData.stats.leadsToday}
        - Your Recent Appointments: ${JSON.stringify(brokerData.stats.recentAppointments)}`;
        } else {
            systemPrompt += `\n\nPUBLIC MODE: You ONLY provide information from the knowledge base. Do NOT reveal specific data or stats. If asked for leads or stats, politely explain that they must log in as a broker to see their dashboard.`;
        }

        // 4. Call Gemini
        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: "user", parts: [{ text: systemPrompt }] },
                    ...(history || []).map((m: any) => ({
                        role: m.role === "user" ? "user" : "model",
                        parts: [{ text: m.content }]
                    })),
                    { role: "user", parts: [{ text: query }] }
                ],
                generationConfig: { temperature: 0.7 }
            })
        });

        const geminiData = await res.json();
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Static interference detected...";

        return new Response(JSON.stringify({ text: responseText, role }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("AI Query Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
