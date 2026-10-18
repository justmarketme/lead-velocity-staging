import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appointmentBookedEmail } from "../_shared/lv_emails.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { leadId, brokerId, appointmentTime, notes } = await req.json();

    if (!leadId || !appointmentTime) {
      return new Response(
        JSON.stringify({ error: 'leadId and appointmentTime are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch lead and broker details
    const [{ data: lead }, { data: broker }] = await Promise.all([
      supabase.from('leads').select('first_name, last_name, email, phone').eq('id', leadId).single(),
      brokerId
        ? supabase.from('brokers').select('contact_person, firm_name, calendar_email').eq('id', brokerId).single()
        : Promise.resolve({ data: null })
    ]);

    const leadName = lead ? `${lead.first_name} ${lead.last_name}`.trim() : 'Unknown Lead';
    const brokerName = broker?.contact_person || 'Your Broker';
    const firmName = broker?.firm_name || 'Lead Velocity';
    const brokerEmail = broker?.calendar_email || Deno.env.get('ADMIN_EMAIL') || 'admin@leadvelocity.co.za';

    const formattedTime = new Date(appointmentTime).toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // 2. Update lead status to Booked
    await supabase
      .from('leads')
      .update({ current_status: 'Booked' })
      .eq('id', leadId);

    // 3. Send confirmation email via Resend
    if (RESEND_API_KEY) {
      const recipients = [brokerEmail];
      if (lead?.email) recipients.push(lead.email);
      const mail = appointmentBookedEmail({ leadName, phone: lead?.phone, brokerName, firmName, whenText: formattedTime, notes });

      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Ayanda <appointments@leadvelocity.co.za>',
          to: recipients,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        })
      });
      if (!sent.ok) console.error('book-appointment: Resend error', sent.status, await sent.text());
    }

    console.log(`Appointment booked: ${leadName} at ${formattedTime} — broker: ${brokerName}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Appointment booked for ${leadName} on ${formattedTime}.`,
        leadStatus: 'Booked'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('book-appointment error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
