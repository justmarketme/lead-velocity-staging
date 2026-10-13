import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { onboardingConfirmationEmail, onboardingInternalEmail } from "../_shared/lv_emails.ts";

// Sends two emails when a broker submits the onboarding form:
//   1. A confirmation to the broker ("we've got your details").
//   2. An internal alert to howzit@leadvelocity.co.za with the full submission.
// Public function: the submitter is anonymous. It never trusts caller-supplied
// contact data — it looks the submission up by id with the service role and
// emails only the stored address, so it can't be used to spam arbitrary people.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "Lead Velocity <howzit@leadvelocity.co.za>";
const INTERNAL_INBOX = "howzit@leadvelocity.co.za";

const ALLOWED_ORIGINS = [
  "https://www.leadvelocity.co.za",
  "https://leadvelocity.co.za",
  "http://localhost:5173",
  "http://localhost:8080",
];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}


async function sendEmail(payload: Record<string, unknown>) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Resend send failed");
  return data;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { responseId } = await req.json();
    if (!responseId) {
      return new Response(JSON.stringify({ success: false, error: "Missing responseId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Service-role read: never trust caller-supplied contact data.
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: r, error } = await admin
      .from("broker_onboarding_responses")
      .select("id, full_name, email, phone_number, whatsapp_number, firm_name, product_focus, geographic_focus_clarity, timeline_to_start, monthly_lead_spend, desired_leads_weekly, preferred_call_time, created_at")
      .eq("id", responseId)
      .single();

    if (error || !r) {
      return new Response(JSON.stringify({ success: false, error: "Submission not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Record<string, unknown> = {};

    // 1. Client confirmation
    if (r.email) {
      try {
        const mail = onboardingConfirmationEmail({ fullName: r.full_name, preferredCallTime: r.preferred_call_time });
        const c = await sendEmail({
          from: FROM_ADDRESS,
          to: [String(r.email).trim().toLowerCase()],
          reply_to: INTERNAL_INBOX,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        results.client = { sent: true, id: c?.id };
      } catch (e) { results.client = { sent: false, error: (e as Error).message }; }
    } else {
      results.client = { sent: false, error: "no email on submission" };
    }

    // 2. Internal alert
    try {
      const internal = onboardingInternalEmail(r);
      const a = await sendEmail({
        from: FROM_ADDRESS,
        to: [INTERNAL_INBOX],
        reply_to: r.email ? String(r.email) : INTERNAL_INBOX,
        subject: internal.subject,
        html: internal.html,
        text: internal.text,
      });
      results.internal = { sent: true, id: a?.id };
    } catch (e) { results.internal = { sent: false, error: (e as Error).message }; }

    return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("send-onboarding-notification error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
};

serve(handler);
