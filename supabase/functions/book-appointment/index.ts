import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { smcLeadIds } from "../_shared/smc_email.ts";
import { formatBookingTime, planBookingEmails } from "../_shared/booking_emails.ts";

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

    const isSmc = (await smcLeadIds(supabase, [leadId])).has(leadId);
    const leadName = lead ? `${lead.first_name} ${lead.last_name}`.trim() : 'Unknown Lead';
    const brokerName = broker?.contact_person || 'Your Broker';

    const formattedTime = formatBookingTime(appointmentTime);

    // 2. Update lead status to Booked
    await supabase
      .from('leads')
      .update({ current_status: 'Booked' })
      .eq('id', leadId);

    // 3. Send emails via Resend: the client gets a confirmation only; the broker/internal address gets the call notes.
    if (RESEND_API_KEY) {
      const emails = planBookingEmails({
        lead, isSmc, broker, appointmentTime, notes,
        adminEmail: Deno.env.get('ADMIN_EMAIL') || 'admin@leadvelocity.co.za',
      });
      for (const mail of emails) {
        const sent = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: mail.from, to: mail.to, reply_to: mail.reply_to, subject: mail.subject, html: mail.html, text: mail.text }),
        });
        if (!sent.ok) console.error(`book-appointment: Resend error (${mail.audience})`, sent.status, await sent.text());
      }
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
