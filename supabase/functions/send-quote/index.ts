import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a personalised outbound quote email via Gemini,
// then send it to the lead using Resend.
// Called after a campaign call results in outcome = 'appointment'.

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { lead, campaign, call_outcome } = body;

        // lead:     { id, name, email, company, role }
        // campaign: { id, name, knowledge_base, objective }
        // call_outcome: 'appointment' | 'callback' | etc.

        if (!lead?.email) {
            return new Response(JSON.stringify({ error: "lead.email is required" }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        if (!RESEND_API_KEY) {
            return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // -----------------------------------------------------------------
        // Step 1: Generate personalised quote HTML via Gemini
        // -----------------------------------------------------------------
        const geminiPrompt = `You are a professional South African financial services copywriter.
Write a warm, personalised follow-up email to ${lead.name || "a prospect"} at ${lead.company || "their company"} (role: ${lead.role || "unknown"}).

Context about what was discussed: ${campaign?.knowledge_base || "South African financial protection products — life cover, income protection, disability cover."}

The purpose of this email is to:
1. Thank them for speaking with Ayanda
2. Confirm their upcoming 15-minute consultation appointment
3. Briefly outline 2-3 key value propositions (from the context above) — naturally, not as a sales pitch
4. Give them a warm, confident CTA to confirm or reschedule

Tone: warm, professional South African English. Not corporate. Not pushy. Short sentences.
Length: under 280 words.
Format: return ONLY valid HTML email body (use <p>, <strong>, <ul>, <li> tags). No <html>, <head>, or <body> tags. No markdown.
FSCA compliance: never promise savings, never say "best", never recommend specific products.`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
                    generationConfig: { temperature: 0.6 },
                }),
            }
        );

        const geminiData = await geminiRes.json();
        const quoteHtml = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!quoteHtml) {
            return new Response(JSON.stringify({ error: "Failed to generate quote content" }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // -----------------------------------------------------------------
        // Step 2: Wrap in branded email shell
        // -----------------------------------------------------------------
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 28px 32px; }
    .header h1 { color: #ffffff; font-size: 20px; margin: 0; font-weight: 600; letter-spacing: -0.3px; }
    .header p { color: #a0aec0; font-size: 13px; margin: 4px 0 0; }
    .body { padding: 28px 32px; color: #2d3748; font-size: 15px; line-height: 1.65; }
    .body p { margin: 0 0 14px; }
    .body ul { margin: 0 0 14px; padding-left: 20px; }
    .body li { margin-bottom: 6px; }
    .cta { margin: 24px 0; text-align: center; }
    .cta a { display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; }
    .footer p { color: #718096; font-size: 12px; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Lead Velocity</h1>
      <p>Financial Protection Specialists</p>
    </div>
    <div class="body">
      ${quoteHtml}
      <div class="cta">
        <a href="mailto:hello@leadvelocity.co.za">Confirm Your Appointment</a>
      </div>
    </div>
    <div class="footer">
      <p>This email was sent by Lead Velocity on behalf of your financial advisor.<br>
      Lead Velocity is compliant with POPIA and FSCA regulations.<br>
      To unsubscribe, reply with "REMOVE" in the subject line.</p>
    </div>
  </div>
</body>
</html>`;

        // -----------------------------------------------------------------
        // Step 3: Send via Resend
        // -----------------------------------------------------------------
        const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: "Lead Velocity <noreply@resend.dev>",
                to: [lead.email],
                subject: `Your consultation is confirmed${lead.name ? `, ${lead.name.split(" ")[0]}` : ""} — Lead Velocity`,
                html: emailHtml,
            }),
        });

        const resendData = await resendRes.json();

        if (!resendRes.ok) {
            console.error("Resend error:", resendData);
            return new Response(JSON.stringify({ error: "Email send failed", details: resendData }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // -----------------------------------------------------------------
        // Step 4: Log to communications table
        // -----------------------------------------------------------------
        await supabase.from("communications").insert({
            channel: "email",
            recipient_contact: lead.email,
            recipient_type: "lead",
            lead_id: lead.id || null,
            subject: `Quote sent — ${campaign?.name || "Voice Campaign"}`,
            content: `Post-appointment quote email sent to ${lead.name} (${lead.email})`,
            external_id: resendData.id,
        }).select();

        return new Response(JSON.stringify({
            success: true,
            email_id: resendData.id,
            sent_to: lead.email,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("send-quote error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
