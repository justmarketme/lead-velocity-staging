import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AYANDA_PERSONALITY } from "../_shared/ayanda_persona.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AICallRequest {
  recipient_type: 'lead' | 'referral' | 'broker';
  recipient_id: string;
  recipient_name: string;
  recipient_phone: string;
  call_purpose: string;
  call_purpose_details?: string;
}

const CALL_OPENERS = [
  "Hi {customer_name}, this is Ayanda — calling on behalf of {broker_name} from {firm_name}. Quick question — did I catch you at a bad time?",
  "Hi {customer_name}, Ayanda here on behalf of {broker_name} from {firm_name}. We're running a short financial awareness push for folks like you — got 20 seconds?",
  "Hi {customer_name}, Ayanda from {broker_name} at {firm_name}. Ever feel like your cover's just... not quite enough these days?",
  "Hi {customer_name}, Ayanda calling on behalf of {broker_name} from {firm_name}. Just reaching out regarding the inquiry you made — how's your day going?",
  "Hi {customer_name}, this is Ayanda. I help {broker_name} from {firm_name} with their scheduling. Following up on your interest in insurance options — do you have a quick minute?"
];

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
    console.log('Received AI call request:', payload);
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

    // --- Dynamic Broker Pull ---
    let brokerName = "Independent Financial Advisor";
    let firmName = "the brokerage";

    try {
      if (recipient_type === 'lead' || recipient_type === 'referral') {
        const table = recipient_type === 'lead' ? 'leads' : 'referrals';
        const { data: record } = await supabase
          .from(table)
          .select('broker_id')
          .eq('id', recipient_id)
          .single();

        if (record?.broker_id) {
          // Check Onboarding Responses first (more detailed info)
          const { data: onboarding } = await supabase
            .from('broker_onboarding_responses')
            .select('full_name, firm_name')
            .eq('broker_id', record.broker_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (onboarding) {
            brokerName = onboarding.full_name?.split(' ')[0] || "your advisor";
            firmName = onboarding.firm_name || firmName;
          } else {
            // Fallback to brokers table
            const { data: broker } = await supabase
              .from('brokers')
              .select('contact_person, firm_name')
              .eq('id', record.broker_id)
              .single();

            if (broker) {
              brokerName = broker.contact_person?.split(' ')[0] || "your advisor";
              firmName = broker.firm_name || firmName;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error fetching broker details:', e);
    }

    // Select opener
    let openerIndex = Math.floor(Math.random() * CALL_OPENERS.length);

    // For cold calls, we prefer the direct insurance interest opener (index 4)
    if (call_purpose === 'cold_call') {
      openerIndex = 4;
    }

    const openerTemplate = CALL_OPENERS[openerIndex];
    const personalizedScript = openerTemplate
      .replace(/{customer_name}/g, recipient_name || 'there')
      .replace(/{broker_name}/g, brokerName)
      .replace(/{firm_name}/g, firmName);

    // Update the call request with the selected opener
    await supabase
      .from('ai_call_requests')
      .update({ opener_index: openerIndex })
      .eq('id', callRequest.id);

    // Store full persona in metadata for reference by any downstream agents/handlers
    const fullPersona = AYANDA_PERSONALITY
      .replace(/{broker_name}/g, brokerName)
      .replace(/{firm_name}/g, firmName)
      .replace(/{customer_name}/g, recipient_name || 'there');

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
        metadata: {
          ai_call_request_id: callRequest.id,
          script: personalizedScript,
          persona: fullPersona,
          broker_name: brokerName,
          firm_name: firmName,
          opener_index: openerIndex
        }
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
  <Say voice="Polly.Ayanda" language="en-ZA">Thank you. Please leave a message after the beep.</Say>
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
