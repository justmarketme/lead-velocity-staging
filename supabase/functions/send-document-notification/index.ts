import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  documentName: string;
  documentCategory: string;
  recipientEmail: string;
  recipientName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentName, documentCategory, recipientEmail, recipientName }: NotificationPayload = await req.json();

    if (!recipientEmail || !documentName) {
      console.log("Missing required fields, skipping notification");
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending document share notification to: ${recipientEmail} for document: ${documentName}`);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Lead Velocity <howzit@leadvelocity.co.za>",
        to: [recipientEmail],
        subject: `New Document Shared: ${documentName}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">📄 New Document Shared</h1>
            </div>
            
            <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; margin-bottom: 20px;">Hi ${recipientName || 'there'},</p>
              
              <p style="font-size: 16px; margin-bottom: 20px;">
                A new document has been shared with you in your broker portal.
              </p>
              
              <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <p style="margin: 0 0 10px 0; color: #6366f1; font-weight: 600;">Document Details:</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; width: 100px;">Name:</td>
                    <td style="padding: 8px 0; font-weight: 500;">${documentName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Category:</td>
                    <td style="padding: 8px 0; font-weight: 500; text-transform: capitalize;">${documentCategory}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://www.leadvelocity.co.za/broker/documents" 
                   style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); 
                          color: white; 
                          padding: 14px 32px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: 600;
                          font-size: 16px;
                          display: inline-block;">
                  View Document
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
              
              <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
                This is an automated notification from Lead Velocity.
              </p>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      throw new Error(data.message || "Failed to send email");
    }

    console.log("Document notification email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending document notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
