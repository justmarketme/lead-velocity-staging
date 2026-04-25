import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AYANDA_PERSONALITY } from "../_shared/ayanda_persona.ts";
import { normalizePhoneNumber } from "../_shared/utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gemini-key, X-Gemini-Key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

interface AICallRequest {
  recipient_type: 'lead' | 'referral' | 'broker';
  recipient_id: string;
  recipient_name: string;
  recipient_phone: string;
  call_purpose: string;
  call_purpose_details?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error in initiate-ai-call:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token', details: authError }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: AICallRequest = await req.json();
    const { recipient_type, recipient_id, recipient_name, recipient_phone, call_purpose, call_purpose_details } = payload;

    // Get credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      return new Response(JSON.stringify({ error: 'ElevenLabs credentials not configured' }), {
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

    // Resolve broker context
    let brokerName = "Independent Financial Advisor";
    let firmName = "the brokerage";
    let firmAddress = "TBA";

    try {
      if (recipient_type === 'lead' || recipient_type === 'referral') {
        const table = recipient_type === 'lead' ? 'leads' : 'referrals';
        const { data: record } = await supabase
          .from(table)
          .select('broker_id')
          .eq('id', recipient_id)
          .single();

        if (record?.broker_id) {
          const { data: onboarding } = await supabase
            .from('broker_onboarding_responses')
            .select('full_name, firm_name')
            .eq('broker_id', record.broker_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (onboarding) {
            brokerName = onboarding.full_name?.split(' ')[0] || brokerName;
            firmName = onboarding.firm_name || firmName;
          } else {
            const { data: broker } = await supabase
              .from('brokers')
              .select('contact_person, firm_name, firm_address')
              .eq('id', record.broker_id)
              .single();

            if (broker) {
              brokerName = broker.contact_person?.split(' ')[0] || brokerName;
              firmName = broker.firm_name || firmName;
              firmAddress = broker.firm_address || firmAddress;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error fetching broker details:', e);
    }

    // Optional Exa.ai warm lead research
    let researchContext = call_purpose_details || "No recent specific updates found.";
    const EXA_API_KEY = Deno.env.get('EXA_API_KEY');
    if (EXA_API_KEY) {
      try {
        const exaResponse = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_API_KEY },
          body: JSON.stringify({
            query: `Latest news and business updates for ${recipient_name}`,
            type: "auto",
            numResults: 2,
            contents: { highlights: { maxCharacters: 400 } }
          }),
        });
        if (exaResponse.ok) {
          const exaData = await exaResponse.json();
          const results = exaData.results
            .map((r: any) => `Source: ${r.title}\nUpdate: ${r.highlights?.[0] || 'N/A'}`)
            .join("\n---\n");
          if (results) researchContext = results;
        }
      } catch (err) {
        console.error("Exa research failed:", err);
      }
    }

    // Build dynamic system prompt
    const fullSystemPrompt = AYANDA_PERSONALITY
      .replace(/{broker_name}/g, brokerName)
      .replace(/{firm_name}/g, firmName)
      .replace(/{firm_address}/g, firmAddress)
      .replace(/{customer_name}/g, recipient_name || 'there')
      .replace(/{research_context}/g, researchContext);

    const firstMessage = `Hi ${recipient_name || 'there'}, Ayanda here — calling on behalf of ${brokerName}'s office at ${firmName}. I'm actually not calling for a sales pitch. I had one quick clarifying question for you — do you have a quick 20 seconds?`;

    // Create communications record for history
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
          broker_name: brokerName,
          firm_name: firmName,
        }
      })
      .select()
      .single();

    if (commError) {
      console.error('Error creating communication record:', commError);
    }

    // Get ElevenLabs TwiML for outbound call
    const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        agent_id: ELEVENLABS_AGENT_ID,
        from_number: fromNumber,
        to_number: normalizePhoneNumber(recipient_phone),
        conversation_config_override: {
          agent: {
            prompt: { prompt: fullSystemPrompt },
            first_message: firstMessage,
          },
        },
      }),
    });

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      await supabase.from('ai_call_requests').update({ call_status: 'failed', admin_notes: errorText }).eq('id', callRequest.id);
      throw new Error(`ElevenLabs error: ${elevenLabsResponse.status}. ${errorText}`);
    }

    const twiml = await elevenLabsResponse.text();

    // Initiate Twilio outbound call
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: normalizePhoneNumber(recipient_phone),
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
      .update({ call_sid: twilioData.sid, call_status: 'in_progress' })
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
