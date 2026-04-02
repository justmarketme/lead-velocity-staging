import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const brokerEmail = broker?.calendar_email || 'admin@leadvelocity.co.za';

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

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Ayanda <appointments@leadvelocity.co.za>',
          to: recipients,
          subject: `📅 Appointment Booked: ${leadName} — ${formattedTime}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #7c3aed, #ec4899); padding: 24px;">
                <h1 style="margin: 0; color: white; font-size: 20px;">🤖 Ayanda Booked an Appointment</h1>
                <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">Lead Velocity · AI Voice Agent</p>
              </div>
              <div style="padding: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">Lead</td><td style="padding: 10px 0; color: #f1f5f9; font-weight: bold;">${leadName}</td></tr>
                  <tr><td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">Phone</td><td style="padding: 10px 0; color: #f1f5f9;">${lead?.phone || 'N/A'}</td></tr>
                  <tr><td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">Broker</td><td style="padding: 10px 0; color: #f1f5f9;">${brokerName} · ${firmName}</td></tr>
                  <tr><td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">Date &amp; Time</td><td style="padding: 10px 0; color: #a78bfa; font-weight: bold;">${formattedTime} (SAST)</td></tr>
                  <tr><td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">Call Notes</td><td style="padding: 10px 0; color: #f1f5f9;">${notes || 'No notes provided.'}</td></tr>
                </table>
                <div style="margin-top: 20px; padding: 16px; background: rgba(124,58,237,0.15); border-left: 3px solid #7c3aed; border-radius: 8px;">
                  <p style="margin: 0; color: #c4b5fd; font-size: 13px;">Lead status has been updated to <strong>Booked</strong> in the Lead Velocity dashboard.</p>
                </div>
              </div>
            </div>
          `
        })
      });
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

  } catch (error: any) {
    console.error('book-appointment error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
