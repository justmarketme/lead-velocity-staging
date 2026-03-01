import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AICallRequest {
  recipient_type: 'lead' | 'referral' | 'broker';
  recipient_id: string;
  recipient_name: string;
  recipient_phone: string;
  call_purpose: string;
  call_purpose_details?: string;
}

const CALL_SCRIPTS: Record<string, string> = {
  "appointment_scheduling": `Hello {name}, this is an automated call from Lead Velocity on behalf of {broker}. I'm calling to schedule an appointment with you. Would you have time available this week? Please let me know your preferred date and time.`,
  "appointment_rescheduling": `Hello {name}, this is an automated call from Lead Velocity. I'm calling regarding your upcoming appointment with {broker}. We need to reschedule. What alternative date and time would work best for you?`,
  "follow_up": `Hello {name}, this is an automated call from Lead Velocity. I'm following up on your recent interaction with {broker}. I wanted to check in and see if you have any questions or if there's anything we can help you with.`,
  "voice_note": `Hello, this is an automated message from Lead Velocity on behalf of {broker}. We wanted to reach out and let you know that we're here to assist you. Please call us back at your earliest convenience.`,
  "general_inquiry": `Hello {name}, this is an automated call from Lead Velocity. We're reaching out on behalf of {broker} to learn more about your needs and how we can assist you. Do you have a few minutes to chat?`,
  "reminder": `Hello {name}, this is a friendly reminder from Lead Velocity about your upcoming appointment with {broker}. Please confirm your attendance or contact us if you need to make any changes.`,
  "referral_generation": `Hello {name}, this is an automated call from Lead Velocity on behalf of {broker}. We recently helped you with your policy, and we'd love to help your friends or family too. If you have 5 people in mind who could benefit from our service, please stay on the line to provide their details or leave a message after the beep.`,
  "policy_review": `Hello {name}, this is a courtesy call from Lead Velocity for {broker}. We're conducting annual policy reviews to ensure your coverage is still the best fit for your needs. Would you like to schedule a 5-minute review call this week?`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user - ALWAYS require authentication, no test mode bypass
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: AICallRequest = await req.json();
    const { recipient_type, recipient_id, recipient_name, recipient_phone, call_purpose, call_purpose_details } = payload;

    // Get Twilio credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create AI call request record
    const { data: callRequest, error: insertError } = await supabase
      .from('ai_call_requests')
      .insert({
        recipient_type,
        recipient_id,
        recipient_name,
        recipient_phone,
        call_purpose,
        call_purpose_details,
        requested_by: user.id,
        call_status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating call request:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create call request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let referralReason = "";
    let referrerName = "";

    if (recipient_type === 'referral') {
      const { data: referral } = await supabase
        .from('referrals')
        .select(`
          will_status,
          lead:leads!parent_lead_id(first_name, last_name)
        `)
        .eq('id', recipient_id)
        .single();

      if (referral) {
        if (referral.will_status?.includes('|')) {
          const reasonKey = referral.will_status.split('|')[0];
          referralReason = reasonKey === 'estate_planning' ? 'Estate Planning' : 'Financial Advice';
        }
        if (referral.lead) {
          referrerName = `${referral.lead.first_name || ''} ${referral.lead.last_name || ''}`.trim();
        }
      }
    }

    // Get the appropriate script
    let script = CALL_SCRIPTS[call_purpose] || CALL_SCRIPTS.general_inquiry;

    // Customize script for referrals
    if (recipient_type === 'referral' && (call_purpose === 'appointment_scheduling' || call_purpose === 'general_inquiry')) {
      const serviceContext = referralReason ? ` regarding your ${referralReason}` : "";
      const connectionContext = referrerName ? ` as you were referred by ${referrerName}` : "";

      script = `Hello {name}, this is an automated call from Lead Velocity on behalf of {broker}. I'm reaching out${connectionContext}${serviceContext}. We'd like to schedule a brief discovery call to see how we can assist you. Would you have time this week?`;
    }

    // Extract broker name from details or default to Lead Velocity
    const brokerName = call_purpose_details?.includes('Broker:')
      ? call_purpose_details.split('Broker:')[1].trim()
      : 'Lead Velocity';

    const personalizedScript = script
      .replace(/\{name\}/g, recipient_name || 'there')
      .replace(/\{broker\}/g, brokerName);

    // Create TwiML for the call with text-to-speech
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Ayanda" language="en-ZA">${personalizedScript}</Say>
  <Pause length="2"/>
  <Say voice="Polly.Ayanda" language="en-ZA">Please leave a message after the beep, or press any key to speak with a representative.</Say>
  <Record maxLength="120" action="${supabaseUrl}/functions/v1/handle-ai-call-recording?callRequestId=${callRequest.id}" transcribe="true" transcribeCallback="${supabaseUrl}/functions/v1/handle-ai-call-transcription?callRequestId=${callRequest.id}"/>
</Response>`;

    // Initiate the call via Twilio
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: recipient_phone,
          From: fromNumber,
          Twiml: twiml,
          StatusCallback: `${supabaseUrl}/functions/v1/handle-ai-call-status?callRequestId=${callRequest.id}`,
          StatusCallbackEvent: 'initiated ringing answered completed',
          StatusCallbackMethod: 'POST',
        }),
      }
    );

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      // Update call request as failed
      await supabase
        .from('ai_call_requests')
        .update({ call_status: 'failed', admin_notes: twilioData.message })
        .eq('id', callRequest.id);

      return new Response(JSON.stringify({ error: twilioData.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update call request with Twilio SID
    await supabase
      .from('ai_call_requests')
      .update({
        call_sid: twilioData.sid,
        call_status: 'in_progress'
      })
      .eq('id', callRequest.id);

    return new Response(JSON.stringify({
      success: true,
      call_request_id: callRequest.id,
      call_sid: twilioData.sid,
      message: 'AI call initiated successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in initiate-ai-call:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
