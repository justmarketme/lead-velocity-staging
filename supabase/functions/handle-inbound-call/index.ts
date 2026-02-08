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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the form data from Twilio webhook
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const callerNumber = formData.get('From') as string;
    const calledNumber = formData.get('To') as string;
    const callStatus = formData.get('CallStatus') as string;
    const direction = formData.get('Direction') as string;
    const callDuration = formData.get('CallDuration') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;

    console.log('Inbound call webhook received:', {
      callSid,
      callerNumber,
      calledNumber,
      callStatus,
      direction,
    });

    // Clean phone number for matching (remove +1 or similar prefixes)
    const cleanCallerNumber = callerNumber?.replace(/^\+\d{1}/, '') || '';
    const searchPhone = cleanCallerNumber.replace(/\D/g, '');

    // Try to identify the caller from leads, referrals, or brokers
    let recipientType = 'unknown';
    let recipientId: string | null = null;
    let recipientName = 'Unknown Caller';
    let leadId: string | null = null;
    let referralId: string | null = null;
    let brokerId: string | null = null;

    // Search in leads
    const { data: leadMatch } = await supabase
      .from('leads')
      .select('id, first_name, last_name, phone')
      .or(`phone.ilike.%${searchPhone}%,phone.ilike.%${callerNumber}%`)
      .limit(1)
      .single();

    if (leadMatch) {
      recipientType = 'lead';
      recipientId = leadMatch.id;
      leadId = leadMatch.id;
      recipientName = `${leadMatch.first_name || ''} ${leadMatch.last_name || ''}`.trim() || 'Lead';
    } else {
      // Search in referrals
      const { data: referralMatch } = await supabase
        .from('referrals')
        .select('id, first_name, phone_number, parent_lead_id')
        .or(`phone_number.ilike.%${searchPhone}%,phone_number.ilike.%${callerNumber}%`)
        .limit(1)
        .single();

      if (referralMatch) {
        recipientType = 'referral';
        recipientId = referralMatch.id;
        referralId = referralMatch.id;
        leadId = referralMatch.parent_lead_id;
        recipientName = referralMatch.first_name || 'Referral';
      } else {
        // Search in brokers
        const { data: brokerMatch } = await supabase
          .from('brokers')
          .select('id, contact_person, phone_number')
          .or(`phone_number.ilike.%${searchPhone}%,phone_number.ilike.%${callerNumber}%`)
          .limit(1)
          .single();

        if (brokerMatch) {
          recipientType = 'broker';
          recipientId = brokerMatch.id;
          brokerId = brokerMatch.id;
          recipientName = brokerMatch.contact_person || 'Broker';
        }
      }
    }

    // Map Twilio call status to our internal status
    const statusMap: Record<string, string> = {
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'missed',
      'failed': 'failed',
      'no-answer': 'missed',
      'canceled': 'canceled',
    };
    const mappedStatus = statusMap[callStatus] || callStatus;

    // Check if we already have a record for this call
    const { data: existingCall } = await supabase
      .from('communications')
      .select('id')
      .eq('external_id', callSid)
      .single();

    if (existingCall) {
      // Update existing call record
      const updateData: Record<string, unknown> = {
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      };

      if (callDuration) {
        updateData.call_duration = parseInt(callDuration);
      }
      if (recordingUrl) {
        updateData.call_recording_url = recordingUrl;
      }

      await supabase
        .from('communications')
        .update(updateData)
        .eq('id', existingCall.id);

      console.log('Updated existing inbound call record:', existingCall.id);
    } else {
      // Create new inbound call record
      const { data: newCall, error: insertError } = await supabase
        .from('communications')
        .insert({
          channel: 'call',
          direction: 'inbound',
          sender_type: recipientType,
          recipient_type: 'admin',
          recipient_contact: calledNumber,
          lead_id: leadId,
          referral_id: referralId,
          broker_id: brokerId,
          recipient_id: recipientId,
          status: mappedStatus,
          external_id: callSid,
          call_duration: callDuration ? parseInt(callDuration) : null,
          call_recording_url: recordingUrl || null,
          content: `Inbound call from ${recipientName} (${callerNumber})`,
          metadata: {
            caller_number: callerNumber,
            called_number: calledNumber,
            caller_name: recipientName,
            caller_type: recipientType,
          },
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating inbound call record:', insertError);
      } else {
        console.log('Created new inbound call record:', newCall?.id);
      }
    }

    // Return TwiML response for the call
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">Thank you for calling Lead Velocity. Please hold while we connect you to a representative.</Say>
  <Play>https://api.twilio.com/cowbell.mp3</Play>
  <Record maxLength="300" transcribe="true" playBeep="true" />
</Response>`;

    return new Response(twimlResponse, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
      },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in handle-inbound-call:', error);
    
    // Return a basic TwiML response even on error
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry, but we are unable to take your call at this time. Please try again later.</Say>
</Response>`;

    return new Response(errorTwiml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
      },
    });
  }
});
