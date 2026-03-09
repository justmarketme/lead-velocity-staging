// deno-lint-ignore-file
/// <reference lib="deno.ns" />
// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import nacl from "https://esm.sh/tweetnacl@1.0.3";
import { askBusinessAI, searchLeads, getBusinessStats } from "../_shared/discord.ts";

// @ts-ignore
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// @ts-ignore
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// @ts-ignore
const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// @ts-ignore
serve(async (req: Request) => {
    const signature = req.headers.get("X-Signature-Ed25519")!;
    const timestamp = req.headers.get("X-Signature-Timestamp")!;
    const rawBody = await req.text();

    const isVerified = nacl.sign.detached.verify(
        new TextEncoder().encode(timestamp + rawBody),
        new Uint8Array(signature.match(/.{1,2}/g)!.map((byte: string) => { // @ts-ignore
            return parseInt(byte, 16);
        })),
        new Uint8Array(PUBLIC_KEY.match(/.{1,2}/g)!.map((byte: string) => { // @ts-ignore
            return parseInt(byte, 16);
        }))
    );

    if (!isVerified) return new Response("Invalid signature", { status: 401 });

    const interaction = JSON.parse(rawBody);
    if (interaction.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });

    // Handle Buttons
    if (interaction.type === 3) {
        const { custom_id } = interaction.data;
        const [action, targetType, targetId] = custom_id.split(":");

        try {
            if (targetType === "reset") {
                const status = action === "approve" ? "resolved" : "dismissed";
                await supabase.from("broker_reset_requests").update({ status, resolved_at: new Date().toISOString() }).eq("id", targetId);
                return new Response(JSON.stringify({ type: 4, data: { content: `✅ Reset request ${status}.` } }), { headers: { "Content-Type": "application/json" } });
            }

            if (targetType === "aicall") {
                const approve = action === "approve";
                await supabase.from("ai_call_requests").update({ changes_approved: approve, changes_approved_at: new Date().toISOString() }).eq("id", targetId);
                return new Response(JSON.stringify({ type: 4, data: { content: approve ? "✅ AI Call Changes Approved!" : "❌ Changes ignored." } }), { headers: { "Content-Type": "application/json" } });
            }

            if (targetType === "call") {
                const { data: lead } = await supabase.from("leads").select("*").eq("id", targetId).single();
                if (!lead) return new Response(JSON.stringify({ type: 4, data: { content: "❌ Lead not found." } }), { headers: { "Content-Type": "application/json" } });

                await supabase.functions.invoke("initiate-ai-call", {
                    body: { lead_id: lead.id, phone: lead.phone, recipient_name: lead.first_name, purpose: "general_inquiry" }
                });
                return new Response(JSON.stringify({ type: 4, data: { content: `📞 Initiating AI Call to **${lead.first_name}**...` } }), { headers: { "Content-Type": "application/json" } });
            }

            if (targetType === "email") {
                const { data: lead } = await supabase.from("leads").select("*").eq("id", targetId).single();
                if (!lead) return new Response(JSON.stringify({ type: 4, data: { content: "❌ Lead not found." } }), { headers: { "Content-Type": "application/json" } });

                await supabase.functions.invoke("send-communication", {
                    body: {
                        channel: "email",
                        recipient_contact: lead.email,
                        recipient_type: "lead",
                        lead_id: lead.id,
                        subject: "Follow up from Lead Velocity",
                        content: `Hi ${lead.first_name}, Einstein here! Just checking in on your recent inquiry.`
                    }
                });
                return new Response(JSON.stringify({ type: 4, data: { content: `📧 AI Follow-up Email sent to **${lead.first_name}**!` } }), { headers: { "Content-Type": "application/json" } });
            }
        } catch (err) {
            return new Response(JSON.stringify({ type: 4, data: { content: "❌ Action failed." } }), { headers: { "Content-Type": "application/json" } });
        }
    }

    // Handle Slash Commands
    if (interaction.type === 2) {
        const { name, options } = interaction.data;

        if (name === "auth") {
            const code = options[0].value;
            const { data: profile } = await supabase.from("profiles").update({ discord_user_id: interaction.member?.user?.id || interaction.user?.id, discord_enabled: true }).eq("discord_pairing_code", code).select().single();
            return new Response(JSON.stringify({ type: 4, data: { content: profile ? `✅ Linked as **${profile.full_name}**!` : "❌ Invalid code." } }), { headers: { "Content-Type": "application/json" } });
        }

        if (name === "admin") {
            const query = options[0].value;
            const stats = await getBusinessStats();
            const aiResult = await askBusinessAI(query, { stats });

            if (aiResult.action === "get_stats") {
                const content = `📊 **Einstein's Business Briefing:**\n- Leads: ${stats.leadCount}\n- Today: ${stats.leadsToday}\n- Brokers: ${stats.brokerCount}\n- Pending Resets: ${stats.pendingResets}\n\n${aiResult.response}`;
                return new Response(JSON.stringify({ type: 4, data: { content } }), { headers: { "Content-Type": "application/json" } });
            }

            if (aiResult.action === "get_schedule") {
                const schedule = stats.appointmentsToday?.map((a: any) => `- **${a.leads?.first_name}**: ${a.reason} at ${new Date(a.appointment_date).toLocaleTimeString()}`).join('\n') || "No appointments today.";
                return new Response(JSON.stringify({ type: 4, data: { content: `📅 **Today's Schedule:**\n${schedule}\n\n${aiResult.response}` } }), { headers: { "Content-Type": "application/json" } });
            }

            if (aiResult.action === "search_lead") {
                const { data: leads } = await searchLeads(aiResult.params.query || aiResult.params.name);
                if (!leads?.length) return new Response(JSON.stringify({ type: 4, data: { content: `🔍 No matches for "${aiResult.params.query}"` } }), { headers: { "Content-Type": "application/json" } });

                const list = leads.map((l: any) => `👤 **${l.first_name} ${l.last_name}** (${l.phone})\nStatus: ${l.current_status}`).join('\n\n');
                const buttons = leads.slice(0, 2).flatMap((l: any) => ([
                    { type: 2, style: 1, label: `📞 Call ${l.first_name}`, custom_id: `action:call:${l.id}` },
                    { type: 2, style: 2, label: `📧 Email ${l.first_name}`, custom_id: `action:email:${l.id}` }
                ]));
                return new Response(JSON.stringify({ type: 4, data: { content: `🔎 **Einstein Found:**\n\n${list}`, components: buttons.length ? [{ type: 1, components: buttons }] : [] } }), { headers: { "Content-Type": "application/json" } });
            }

            return new Response(JSON.stringify({ type: 4, data: { content: aiResult.response } }), { headers: { "Content-Type": "application/json" } });
        }
    }

    return new Response("OK", { status: 200 });
});
