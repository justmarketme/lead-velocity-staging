import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReferralNotificationRequest {
  referralName: string;
  referralPhone: string;
  leadName: string;
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
      referralPhone,
      leadName,
      brokerName,
      brokerFirm,
    }: ReferralNotificationRequest = await req.json();

    // Validate required fields
    if (!referralName || !leadName || !brokerName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Send notification to admin email
    const adminEmail = "howzit@leadvelocity.co.za";

    const emailResponse = await resend.emails.send({
      from: "Lead Velocity <howzit@leadvelocity.co.za>",
      to: [adminEmail],
      subject: `New Referral Added by ${brokerFirm}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">New Client Referral</h1>
          </div>
          
          <div style="padding: 30px; background: #f9fafb;">
            <p style="font-size: 16px; color: #374151;">A new referral has been added to the system:</p>
            
            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h3 style="color: #4f46e5; margin-top: 0;">Referral Details</h3>
              <p style="margin: 8px 0;"><strong>Name:</strong> ${referralName}</p>
              <p style="margin: 8px 0;"><strong>Phone:</strong> ${referralPhone}</p>
            </div>
            
            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h3 style="color: #4f46e5; margin-top: 0;">Source Information</h3>
              <p style="margin: 8px 0;"><strong>Referred by Client:</strong> ${leadName}</p>
              <p style="margin: 8px 0;"><strong>Broker:</strong> ${brokerName}</p>
              <p style="margin: 8px 0;"><strong>Firm:</strong> ${brokerFirm}</p>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
              Log in to your Lead Velocity dashboard to view and manage this referral.
            </p>
          </div>
          
          <div style="background: #1f2937; padding: 20px; text-align: center;">
            <p style="color: #9ca3af; margin: 0; font-size: 12px;">
              This is an automated notification from Lead Velocity
            </p>
          </div>
        </div>
      `,
    });

    console.log("Referral notification email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-referral-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);