import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReminderRequest {
  hoursAhead?: number; // How many hours ahead to look for appointments (default: 24)
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse request body for optional configuration
    let hoursAhead = 24;
    try {
      const body = await req.json();
      if (body.hoursAhead) {
        hoursAhead = body.hoursAhead;
      }
    } catch {
      // Use default if no body provided
    }

    const now = new Date();
    const reminderWindowStart = now.toISOString();
    const reminderWindowEnd = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();

    console.log(`Looking for appointments between ${reminderWindowStart} and ${reminderWindowEnd}`);

    // Fetch upcoming appointments with broker info
    const { data: upcomingAppointments, error: fetchError } = await supabaseClient
      .from("referrals")
      .select(`
        id,
        first_name,
        phone_number,
        appointment_date,
        will_status,
        parent_lead_id,
        leads!parent_lead_id(
          first_name,
          last_name,
          broker_id,
          brokers(
            id,
            firm_name,
            contact_person,
            email
          )
        )
      `)
      .eq("broker_appointment_scheduled", true)
      .gte("appointment_date", reminderWindowStart)
      .lte("appointment_date", reminderWindowEnd)
      .order("appointment_date", { ascending: true });

    if (fetchError) {
      console.error("Error fetching appointments:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${upcomingAppointments?.length || 0} appointments to remind`);

    if (!upcomingAppointments || upcomingAppointments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No upcoming appointments found", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Group appointments by broker to send one email per broker
    const appointmentsByBroker: Record<string, {
      brokerEmail: string;
      brokerName: string;
      firmName: string;
      appointments: typeof upcomingAppointments;
    }> = {};

    for (const apt of upcomingAppointments) {
      const lead = apt.leads as any;
      const broker = lead?.brokers;
      
      if (!broker?.email) {
        console.log(`Skipping appointment ${apt.id} - no broker email`);
        continue;
      }

      if (!appointmentsByBroker[broker.id]) {
        appointmentsByBroker[broker.id] = {
          brokerEmail: broker.email,
          brokerName: broker.contact_person,
          firmName: broker.firm_name,
          appointments: [],
        };
      }
      appointmentsByBroker[broker.id].appointments.push(apt);
    }

    let emailsSent = 0;
    const errors: string[] = [];

    // Send reminder emails to each broker
    for (const [brokerId, data] of Object.entries(appointmentsByBroker)) {
      const appointmentRows = data.appointments
        .map((apt: any) => {
          const appointmentDate = new Date(apt.appointment_date);
          const lead = apt.leads as any;
          return `
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${apt.first_name}</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${apt.phone_number}</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${lead?.first_name || ''} ${lead?.last_name || ''}</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${appointmentDate.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${appointmentDate.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
          `;
        })
        .join("");

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📅 Upcoming Appointments Reminder</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.brokerName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              You have <strong>${data.appointments.length} appointment${data.appointments.length > 1 ? 's' : ''}</strong> scheduled in the next ${hoursAhead} hours.
            </p>
            
            <div style="background: white; border-radius: 8px; overflow: hidden; margin: 25px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #f3f4f6;">
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Referral</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Phone</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">From Lead</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Date</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${appointmentRows}
                </tbody>
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://www.leadvelocity.co.za/broker/calendar" 
                 style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); 
                        color: white; 
                        padding: 14px 32px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: 600;
                        font-size: 16px;
                        display: inline-block;">
                View Calendar
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              This is an automated reminder from Lead Velocity.
            </p>
          </div>
        </body>
        </html>
      `;

      try {
        const emailResponse = await resend.emails.send({
          from: "Lead Velocity <howzit@leadvelocity.co.za>",
          to: [data.brokerEmail],
          subject: `Reminder: ${data.appointments.length} Upcoming Appointment${data.appointments.length > 1 ? 's' : ''} - Lead Velocity`,
          html: emailHtml,
        });

        console.log(`Reminder sent to ${data.brokerEmail}:`, emailResponse);
        emailsSent++;
      } catch (emailError: any) {
        console.error(`Failed to send reminder to ${data.brokerEmail}:`, emailError);
        errors.push(`${data.brokerEmail}: ${emailError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${emailsSent} reminder emails`,
        sent: emailsSent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-appointment-reminders function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
