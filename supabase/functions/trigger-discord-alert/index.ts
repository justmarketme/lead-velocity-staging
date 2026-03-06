import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { notifyAdmins } from "../_shared/discord.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const { type, data } = await req.json();

        if (type === "broker_reset") {
            const { id, email } = data;
            const message = `🔑 **New Password Reset Request**\n` +
                `**User:** ${email}\n` +
                `**Status:** Pending Approval`;

            const components = [{
                type: 1,
                components: [
                    { type: 2, style: 3, label: "✅ Approve", custom_id: `approve:reset:${id}` },
                    { type: 2, style: 4, label: "❌ Reject", custom_id: `reject:reset:${id}` }
                ]
            }];

            await notifyAdmins(message, components);
        }

        if (type === "sla_alert") {
            const { id, severity, channel, recipient_name } = data;
            const emoji = severity === 'critical' ? '🔴' : '⚠️';
            const message = `${emoji} **SLA Alert: ${severity.toUpperCase()}**\n` +
                `**Channel:** ${channel}\n` +
                `**Recipient:** ${recipient_name || 'Unknown'}\n` +
                `**Action:** Please respond immediately.`;

            await notifyAdmins(message);
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Trigger alert error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
