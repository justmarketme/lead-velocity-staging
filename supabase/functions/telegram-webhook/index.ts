import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Bot, webhookCallback, InlineKeyboard } from "https://deno.land/x/grammy/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const bot = new Bot(Deno.env.get("TELEGRAM_BOT_TOKEN") || "");
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
        "To manage the system via Telegram, you must first link your admin account.\n\n" +
        "1. Log in to the Lead Velocity Dashboard\n" +
        "2. Go to your **Profile Settings**\n" +
        "3. Find your **Telegram Linking Code**\n" +
        "4. Type: `/auth <YOUR_CODE>` here."
    );
});

// 🔐 Auth: Pair the bot with a Supabase user via a code
// (Assumes you have a pairing table or temp column for code)
bot.command("auth", async (ctx) => {
    const code = ctx.match;
    if (!code) return ctx.reply("❌ Please provide your code: `/auth 123456`", { parse_mode: "Markdown" });

    try {
        // 1. Find the user with this pairing code (I am assuming we'll add this to profiles or a new table)
        // For now, let's use a simple lookup (you can add a pairing_code col in migration if needed)
        // SEARCH: In a real app, you'd store pairing codes with expiry
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, user_id, full_name')
            .eq('telegram_pairing_code', code) // We'll add this column for security
            .single();

        if (error || !profile) {
            return ctx.reply("❌ Invalid or expired code. Please generate a new one in the dashboard.");
        }

        // 2. Pair the Chat ID with the user
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                telegram_chat_id: ctx.chat.id.toString(),
                telegram_enabled: true,
                telegram_pairing_code: null // Clear code after use
            })
            .eq('id', profile.id);

        if (updateError) throw updateError;

        return ctx.reply(`✅ Authentication Successful! Welcome, ${profile.full_name}.\n\nYou can now receive real-time alerts and manage requests here.`);

    } catch (err) {
        console.error("Auth error:", err);
        return ctx.reply("❌ System error during pairing. Please try again later.");
    }
});

// 📋 Pending: List all action items needing attention
bot.command("pending", async (ctx) => {
    try {
        // Check if this chat is authorized
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('telegram_chat_id', ctx.chat.id.toString())
            .single();

        if (!profile) return ctx.reply("⚠️ unauthorized. Please link your account first with `/auth`.");

        // Fetch reset requests
        const { data: resets } = await supabase
            .from('broker_reset_requests')
            .select('*')
            .eq('status', 'pending')
            .limit(5);

        // Fetch AI call changes
        const { data: aiReqs } = await supabase
            .from('ai_call_requests')
            .select('*')
            .is('approved', null)
            .limit(5);

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

// --- Action Callback Handlers ---

// Handle Button Clicks
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    console.log("Button clicked:", data);

    const [type, action, id] = data.split(":"); // e.g., "reset:approve:uuid"

    try {
        if (type === "reset") {
            if (action === "approve") {
                // Resolve reset request
                await supabase.from('broker_reset_requests').update({ status: 'resolved' }).eq('id', id);

                // Actually resend the email via Edge Function
                // In a real flow, you might invoke 'send-broker-invite' here too

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
