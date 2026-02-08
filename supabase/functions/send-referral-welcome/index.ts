import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WelcomeNotificationRequest {
  referralName: string;
  referralEmail: string;
  referralReason: 'estate_planning' | 'financial_advice';
  originClientName: string;
  brokerName: string;
  brokerFirm: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      referralName,
      referralEmail,
      referralReason,
      originClientName,
      brokerName,
      brokerFirm,
    }: WelcomeNotificationRequest = await req.json();

    if (!referralEmail) {
      throw new Error("Referral email is required");
    }

    const serviceLabel = referralReason === 'estate_planning'
      ? 'Estate Planning Professional'
      : 'Professional Financial Advisor';

    const serviceDescription = referralReason === 'estate_planning'
      ? 'who specializes in Wills, Trusts, and ensuring your legacy is protected for your loved ones.'
      : 'who specializes in wealth management, investments, and long-term financial planning.';

    const emailResponse = await resend.emails.send({
      from: "Lead Velocity <howzit@leadvelocity.co.za>",
      to: [referralEmail],
      subject: `👋 Excited to help! Connecting you with your ${serviceLabel}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; color: white;">
            <div style="font-size: 48px; margin-bottom: 20px;">👋</div>
            <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Hi ${referralName},</h1>
            <p style="font-size: 18px; margin-top: 10px; opacity: 0.9;">I trust you are well!</p>
          </div>
          
          <div style="padding: 40px; background: white; line-height: 1.8; color: #374151;">
            <p style="font-size: 16px;">
              We recently received your details from <strong>${originClientName}</strong>, who spoke very highly of you.
            </p>
            
            <p style="font-size: 16px;">
              Based on their recommendation, we are connecting you with a <strong>${serviceLabel}</strong> ${serviceDescription}
            </p>
            
            <div style="background: #f8fafc; border-radius: 12px; padding: 25px; margin: 30px 0; border: 1px solid #e2e8f0; text-align: center;">
              <h3 style="margin-top: 0; color: #0f172a; font-size: 18px;">Your Assigned Specialist</h3>
              <p style="margin: 5px 0; font-size: 20px; font-weight: 700; color: #10b981;">${brokerName}</p>
              <p style="margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">${brokerFirm}</p>
            </div>
            
            <div style="text-align: center; margin-top: 40px;">
              <p style="font-size: 15px; margin-bottom: 20px; color: #475569;">Would you prefer a virtual session or a face-to-face meeting?</p>
              <a href="https://leadvelocity.co.za/contact#calendar" style="display: inline-block; background-color: #10b981; color: white; padding: 16px 32px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3);">
                📅 Book Your Appointment
              </a>
              <p style="font-size: 12px; margin-top: 15px; color: #94a3b8;">Select your preferred meeting type during checkout.</p>
            </div>
            
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 40px 0;" />
            
            <p style="font-size: 15px; color: #475569;">
              We look forward to helping you secure your financial future.
            </p>
            
            <p style="font-size: 16px; color: #1e293b; margin-top: 20px;">
              Best regards,<br>
              <strong style="color: #10b981;">The Lead Velocity Team</strong>
            </p>
          </div>
          
          <div style="background: #0f172a; padding: 30px; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px; letter-spacing: 0.025em;">
              © 2026 Lead Velocity • Global Financial Standards
            </p>
          </div>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
