import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const esc = (v: unknown) => String(v ?? "—").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }); } catch { return String(iso); }
};

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

    const firstName = (r.full_name || "there").split(" ")[0];
    const results: Record<string, unknown> = {};

    // 1. Client confirmation
    if (r.email) {
      try {
        const c = await sendEmail({
          from: FROM_ADDRESS,
          to: [String(r.email).trim().toLowerCase()],
          reply_to: INTERNAL_INBOX,
          subject: "We've received your details — Lead Velocity",
          html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">Thanks, ${esc(firstName)} 👋</h1>
  </div>
  <div style="background:#f9fafb;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;">We've received your details and your strategy snapshot is in.</p>
    <p style="font-size:16px;">A Lead Velocity consultant will review your profile and reach out shortly${r.preferred_call_time ? ` — you told us <strong>${esc(r.preferred_call_time)}</strong> suits you best` : ""}. If anything you submitted needs correcting, just reply to this email and we'll update it.</p>
    <p style="font-size:14px;color:#6b7280;margin-top:24px;">Talk soon,<br/>The Lead Velocity Team</p>
  </div>
</body></html>`,
        });
        results.client = { sent: true, id: c?.id };
      } catch (e) { results.client = { sent: false, error: (e as Error).message }; }
    } else {
      results.client = { sent: false, error: "no email on submission" };
    }

    // 2. Internal alert
    const products = Array.isArray(r.product_focus) ? (r.product_focus as string[]).join(", ") : "—";
    const rows = [
      ["Name", r.full_name], ["Firm", r.firm_name], ["Email", r.email], ["Phone", r.phone_number],
      ["WhatsApp", r.whatsapp_number], ["Preferred call time", r.preferred_call_time],
      ["Products", products], ["Geography", r.geographic_focus_clarity], ["Timeline to start", r.timeline_to_start],
      ["Monthly lead spend", r.monthly_lead_spend], ["Desired leads/week", r.desired_leads_weekly],
      ["Submitted", fmtDateTime(r.created_at as string)],
    ];
    try {
      const a = await sendEmail({
        from: FROM_ADDRESS,
        to: [INTERNAL_INBOX],
        reply_to: r.email ? String(r.email) : INTERNAL_INBOX,
        subject: `New onboarding: ${r.full_name || "Unknown"}${r.firm_name ? ` — ${r.firm_name}` : ""}`,
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#111;max-width:640px;margin:0 auto;padding:20px;">
  <h2 style="margin:0 0 6px;">New broker onboarding submission</h2>
  <p style="color:#6b7280;margin:0 0 16px;">Received ${fmtDateTime(r.created_at as string)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${rows.map(([k, v]) => `<tr><td style="padding:8px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;width:180px;">${esc(k)}</td><td style="padding:8px 10px;border:1px solid #e5e7eb;">${esc(v)}</td></tr>`).join("")}
  </table>
  <p style="font-size:13px;color:#6b7280;margin-top:16px;">Manage this lead in the CRM → Onboarding.</p>
</body></html>`,
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
