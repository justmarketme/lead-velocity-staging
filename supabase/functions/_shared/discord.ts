import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Fetches high-level business stats for Einstein
 */
export async function getBusinessStats() {
    const { count: leadCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    const { count: brokerCount } = await supabase.from('brokers').select('*', { count: 'exact', head: true });
    const { count: pendingResets } = await supabase.from('broker_reset_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    // Get leads joined today
    const today = new Date().toISOString().split('T')[0];
    const { count: leadsToday } = await supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', today);

    // Get appointments today
    const { data: appointmentsToday } = await supabase.from('appointments').select('*, leads(first_name, last_name)').gte('appointment_date', today).lte('appointment_date', today + 'T23:59:59');

    return { leadCount, brokerCount, pendingResets, leadsToday, appointmentsToday };
}

const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Sends a notification to all Discord-enabled admins
 */
export async function notifyAdmins(message: string, components?: any[]) {
    try {
        // 1. Get all admins who have Discord enabled
        const { data: admins } = await supabase
            .from('profiles')
            .select('discord_user_id')
            .eq('discord_enabled', true)
            .not('discord_user_id', 'is', null);

        if (!admins || admins.length === 0) {
            console.log("No Discord-enabled admins found to notify.");
            return;
        }

        // 2. Send the message to each admin via Discord API
        // Note: We're sending a DM or to a DM channel created for the user id
        for (const admin of admins) {
            // First, we need to create/get a DM channel with this user
            const channelRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${BOT_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ recipient_id: admin.discord_user_id })
            });

            const channel = await channelRes.json();
            if (!channel.id) {
                console.error("Failed to create DM channel for", admin.discord_user_id, channel);
                continue;
            }

            // Now send the message to that channel
            const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${BOT_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: message,
                    components: components || []
                })
            });

            if (!msgRes.ok) {
                console.error("Failed to send Discord message", await msgRes.text());
            }
        }
    } catch (err) {
        console.error("Discord alert failed:", err);
    }
}

/**
 * Uses Gemini to interpret a business management request from Discord
 */
export async function askBusinessAI(query: string, context?: any) {
    const prompt = `You are the Lead Velocity AI Admin Assistant (Einstein). 
    A user is asking: "${query}"
    
    Current System Stats:
    - Total Leads: ${context?.stats?.leadCount || 'Unknown'}
    - Leads Today: ${context?.stats?.leadsToday || '0'}
    - Total Brokers: ${context?.stats?.brokerCount || 'Unknown'}
    - Pending Resets: ${context?.stats?.pendingResets || '0'}
    - Appointments Today: ${context?.stats?.appointmentsToday?.length || '0'}
    
    Actions:
    1. Search for leads/contacts.
    2. Provide business summaries/stats.
    3. Show schedules/appointments.
    
    You can trigger actions by returning a JSON object with:
    - "response": Your verbal reply to the admin.
    - "action": One of ["search_lead", "get_stats", "get_schedule", "none"]
    - "params": The parameters for that action.
    
    Respond ONLY with JSON.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    const data = await res.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
}

/**
 * Searches for a lead by name or phone
 */
export async function searchLeads(query: string) {
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(5);

    return { data, error };
}
