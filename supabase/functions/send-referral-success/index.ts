import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

interface CompletionNotificationRequest {
    referralName: string;
    brokerEmail: string;
    brokerName: string;
    brokerFirm: string;
    leadName: string;
}

const handler = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const {
            referralName,
            brokerEmail,
            brokerName,
            brokerFirm,
            leadName,
        }: CompletionNotificationRequest = await req.json();

        const adminEmail = "howzit@leadvelocity.co.za";
        const recipients = [adminEmail];
        if (brokerEmail) recipients.push(brokerEmail);

        const emailResponse = await resend.emails.send({
            from: "Lead Velocity <howzit@leadvelocity.co.za>",
            to: recipients,
            subject: `🎉 Success! Referral for ${referralName} is COMPLETED`,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: #10b981; padding: 30px; text-align: center; color: white;">
            <div style="font-size: 48px; margin-bottom: 10px;">🌟</div>
            <h1 style="margin: 0; font-size: 24px;">Referral Conversion Success!</h1>
          </div>
          
          <div style="padding: 30px; background: white;">
            <p style="font-size: 16px; color: #374151;">Great news! A referral in your pipeline has reached the finish line.</p>
            
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #166534; margin-top: 0;">Referral Details</h3>
              <p style="margin: 8px 0; color: #166534;"><strong>Name:</strong> ${referralName}</p>
              <p style="margin: 8px 0; color: #166534;"><strong>Status:</strong> COMPLETED & CONVERTED</p>
            </div>
            
            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
              <h3 style="margin-top: 0; color: #374151;">Source Data</h3>
              <p style="margin: 8px 0;"><strong>Original Client:</strong> ${leadName}</p>
              <p style="margin: 8px 0;"><strong>Closing Agent:</strong> ${brokerName} (${brokerFirm})</p>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 25px; line-height: 1.5;">
              This milestone has been recorded in the Lead Velocity dashboard. The referral loop is now complete for this client.
            </p>
          </div>
          
          <div style="background: #f3f4f6; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; margin: 0; font-size: 12px;">
              Velocity Neon Engine • Automated Transaction Summary
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
