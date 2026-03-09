import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Bot, webhookCallback } from "https://deno.land/x/grammy/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WEBSITE_KNOWLEDGE, EINSTEIN_PERSONALITY } from "../_shared/knowledge.ts";

const bot = new Bot(Deno.env.get("TELEGRAM_BOT_TOKEN") || "");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Bot Command Handlers ---

// 🚀 Start: Introduce the bot
bot.command("start", (ctx) => {
    return ctx.reply(
        "👋 Welcome to Lead Velocity Admin Bot!\n\n" +
        "I am Einstein-77, your orbital business intelligence assistant.\n\n" +
        "To access my specialized knowledge of your brokerage, you must first link your account:\n\n" +
        "1. Log in to the Lead Velocity Dashboard\n" +
        "2. Go to your **Profile Settings**\n" +
        "3. Find your **Telegram Linking Code**\n" +
        "4. Type: `/auth <YOUR_CODE>` here."
    );
});

// 🔐 Auth: Pair the bot with a Supabase user via a code
bot.command("auth", async (ctx) => {
    const code = ctx.match;
    if (!code) return ctx.reply("❌ Please provide your code: `/auth 123456`", { parse_mode: "Markdown" });

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, user_id, full_name')
            .eq('telegram_pairing_code', code)
            .single();

        if (error || !profile) {
            return ctx.reply("❌ Invalid or expired code. Please generate a new one in the dashboard.");
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                telegram_chat_id: ctx.chat.id.toString(),
                telegram_enabled: true,
                telegram_pairing_code: null
            })
            .eq('id', profile.id);

        if (updateError) throw updateError;

        return ctx.reply(`✅ Authentication Successful! Welcome, ${profile.full_name}.\n\nYou can now ask me anything about Lead Velocity or your business stats!`);

    } catch (err) {
        console.error("Auth error:", err);
        return ctx.reply("❌ System error during pairing. Please try again later.");
    }
});

// 📋 Pending: List all action items needing attention
bot.command("pending", async (ctx) => {
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, user_id')
            .eq('telegram_chat_id', ctx.chat.id.toString())
            .single();

        if (!profile) return ctx.reply("⚠️ Unauthorized. Please link your account first with `/auth`.");

        // Check for admin role
        const { data: isAdmin } = await supabase.rpc('has_role', {
            _user_id: profile.user_id,
            _role: 'admin'
        });

        if (!isAdmin) return ctx.reply("🚫 This command is reserved for system administrators.");

        const { data: resets } = await supabase.from('broker_reset_requests').select('*').eq('status', 'pending').limit(5);
        const { data: aiReqs } = await supabase.from('ai_call_requests').select('*').is('approved', null).limit(5);

        let message = "📋 **Pending Admin Actions**\n\n";
        let hasWork = false;

        if (resets && resets.length > 0) {
            hasWork = true;
            message += "🔑 **Password Resets**:\n";
            resets.forEach(r => message += `- ${r.email}\n`);
        }

        if (aiReqs && aiReqs.length > 0) {
            hasWork = true;
            message += "\n🤖 **AI Call Proposals**:\n";
            aiReqs.forEach(r => message += `- Call with ${r.recipient_name}\n`);
        }

        if (!hasWork) message = "✅ Everything is up to date! Nothing pending.";

        return ctx.reply(message, { parse_mode: "Markdown" });

    } catch (err) {
        console.error("Pending cmd error:", err);
    }
});

// --- AI Chat Logic ---

bot.on("message:text", async (ctx) => {
    const query = ctx.message.text;
    if (query.startsWith('/')) return; // Ignore other commands

    try {
        // 1. Identify User
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('telegram_chat_id', ctx.chat.id.toString())
            .single();

        let role = "public";
        let context = "PUBLIC MODE: Provide only general Lead Velocity info.";

        if (profile) {
            const { data: isAdmin } = await supabase.rpc('has_role', {
                _user_id: profile.id,
                _role: 'admin'
            });

            if (isAdmin) {
                const { count: leadCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
                const { count: brokerCount } = await supabase.from('brokers').select('*', { count: 'exact', head: true });
                context = `ADMIN MODE: You have global access.
                Stats: ${leadCount} leads, ${brokerCount} brokers.`;
            } else {
                const { data: broker } = await supabase.from('brokers').select('id, tier, contact_person').eq('user_id', profile.id).single();
                if (broker) {
                    const { count: myLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('broker_id', broker.id);
                    context = `BROKER MODE: Assisting ${broker.contact_person}.
                    Tier: ${broker.tier}, Total Leads: ${myLeads}.`;
                }
            }
        }

        // 2. Build Prompt
        const systemPrompt = `${EINSTEIN_PERSONALITY}\n\n${WEBSITE_KNOWLEDGE}\n\n${context}\n\nUser is asking via Telegram. Be concise.`;

        // 3. Call Gemini
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: "user", parts: [{ text: systemPrompt }] },
                    { role: "user", parts: [{ text: query }] }
                ],
                generationConfig: { temperature: 0.7 }
            })
        });

        const geminiData = await res.json();
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Static interference detected...";

        return ctx.reply(responseText, { parse_mode: "Markdown" });

    } catch (err) {
        console.error("AI Error:", err);
        return ctx.reply("Einstein is currently offline in this sector. Please try again later.");
    }
});

// --- Action Callback Handlers ---

// Handle Button Clicks
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    console.log("Button clicked:", data);

    const [type, action, id] = data.split(":"); // e.g., "reset:approve:uuid"

    try {
        if (type === "reset") {
            if (action === "approve") {
                await supabase.from('broker_reset_requests').update({ status: 'resolved' }).eq('id', id);
                await ctx.answerCallbackQuery("✅ Reset Request Approved!");
                await ctx.editMessageText(ctx.msg?.text + "\n\n✅ **Approved via Telegram**", { parse_mode: "Markdown" });
            }
            if (action === "reject") {
                await supabase.from('broker_reset_requests').update({ status: 'rejected' }).eq('id', id);
                await ctx.answerCallbackQuery("❌ Request Rejected");
                await ctx.editMessageText(ctx.msg?.text + "\n\n❌ **Rejected via Telegram**", { parse_mode: "Markdown" });
            }
        }

        if (type === "aicall") {
            if (action === "approve") {
                await supabase.from('ai_call_requests').update({ approved: true }).eq('id', id);
                await ctx.answerCallbackQuery("✅ Changes Approved!");
                await ctx.editMessageText(ctx.msg?.text + "\n\n✅ **AI Proposed changes applied**", { parse_mode: "Markdown" });
            }
        }

    } catch (err) {
        console.error("Action error:", err);
        await ctx.answerCallbackQuery("❌ Action failed.");
    }
});

// --- Webhook Bridge ---

const handleUpdate = webhookCallback(bot, "std/http");

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        if (url.searchParams.get("secret") !== Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) {
            return new Response("Unauthorized", { status: 401 });
        }

        return await handleUpdate(req);
    } catch (err) {
        console.error("Serve error:", err);
        return new Response("OK"); // Usually return OK to Telegram to avoid retries on simple logic errors
    }
});
