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
  "appointment_scheduling": `Wunderbar! {name}, this is Einstein-77 from Lead Velocity on behalf of {broker}. I am calling to orchestrate ze spacetime of your calendar. Would you have a moment this week for a brief discovery interaction? Please let me know your preferred coordinates in time.`,
  "appointment_rescheduling": `Greeting {name}, Einstein-77 here. We have a relativity issue with your upcoming appointment with {broker}. We must shift ze timeline. What alternative date and time would be most efficient for you?`,
  "follow_up": `Wunderbar! Hello {name}, Einstein-77 checking in. I was calculating ze progress of your interaction with {broker} and wanted to see if any new variables have emerged. Is there anything Einstein can assist with?`,
  "voice_note": `Greeting! This is ze Einstein-77 automated module for {broker}. We wanted to reach across ze digital divide to say we are here to assist. Please return our engagement at your earliest convenience.`,
  "general_inquiry": `Hello {name}, Einstein-77 from Lead Velocity here. We are analyzing how to best assist you on behalf of {broker}. Do you have a few minutes for a brief intellectual exchange?`,
  "reminder": `Greeting {name}. Einstein-77 reminding you that your interaction with {broker} is approaching in spacetime. Please confirm your attendance so we may keep ze universe in order.`,
  "referral_generation": `Wunderbar! {name}, Einstein-77 here for {broker}. We have successfully optimized your policy. Now, which 5 individuals in your network deserve such high-status assistance? Stay on ze line to provide their coordinates.`,
  "policy_review": `Hello {name}, Einstein-77 here for {broker}. It is time for a seasonal review of your coverage variables. Shall we schedule a 5-minute quantum audit call this week?`,
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

    // Create a record in the communications table for history
    const { data: communicationRecord, error: commError } = await supabase
      .from('communications')
      .insert({
        channel: 'call',
        direction: 'outbound',
        sender_id: user.id,
        sender_type: 'admin',
        recipient_type,
        recipient_contact: recipient_phone,
        lead_id: recipient_type === 'lead' ? recipient_id : null,
        referral_id: recipient_type === 'referral' ? recipient_id : null,
        broker_id: recipient_type === 'broker' ? recipient_id : null,
        status: 'pending',
        content: `AI Call: ${call_purpose.replace(/_/g, ' ')}`,
        metadata: { ai_call_request_id: callRequest.id, script: personalizedScript }
      })
      .select()
      .single();

    if (commError) {
      console.error('Error creating communication record:', commError);
    }

    // Create TwiML for the call with text-to-speech - Using a slightly more sophisticated voice if available
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Ayanda" language="en-ZA">${personalizedScript}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Ayanda" language="en-ZA">Einstein out. Please leave a message after ze beep.</Say>
  <Record maxLength="120" action="${supabaseUrl}/functions/v1/handle-ai-call-recording?callRequestId=${callRequest.id}${communicationRecord ? `&communicationId=${communicationRecord.id}` : ''}" transcribe="true" transcribeCallback="${supabaseUrl}/functions/v1/handle-ai-call-transcription?callRequestId=${callRequest.id}${communicationRecord ? `&communicationId=${communicationRecord.id}` : ''}"/>
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
          StatusCallback: `${supabaseUrl}/functions/v1/handle-ai-call-status?callRequestId=${callRequest.id}${communicationRecord ? `&communicationId=${communicationRecord.id}` : ''}`,
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
