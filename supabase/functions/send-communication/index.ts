import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CommunicationPayload {
  channel: 'email' | 'sms' | 'whatsapp' | 'call';
  recipient_contact: string;
  recipient_type: 'lead' | 'referral' | 'broker';
  content?: string;
  subject?: string;
  lead_id?: string;
  referral_id?: string;
  broker_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const payload: CommunicationPayload = await req.json();
    const { channel, recipient_contact, recipient_type, content, subject, lead_id, referral_id, broker_id } = payload;

    // Find the most recent unanswered inbound communication for response time tracking
    let responseTimeSeconds: number | null = null;
    let respondedToId: string | null = null;

    // Build query to find last inbound message from this recipient
    let inboundQuery = supabase
      .from('communications')
      .select('id, created_at')
      .eq('direction', 'inbound')
      .eq('recipient_type', recipient_type)
      .is('responded_to_id', null) // Only get unanswered messages
      .order('created_at', { ascending: false })
      .limit(1);

    // Filter by the appropriate ID field
    if (lead_id) {
      inboundQuery = inboundQuery.eq('lead_id', lead_id);
    } else if (referral_id) {
      inboundQuery = inboundQuery.eq('referral_id', referral_id);
    } else if (broker_id) {
      inboundQuery = inboundQuery.eq('broker_id', broker_id);
    }

    const { data: lastInbound } = await inboundQuery.maybeSingle();

    if (lastInbound) {
      const inboundTime = new Date(lastInbound.created_at).getTime();
      const now = Date.now();
      responseTimeSeconds = Math.floor((now - inboundTime) / 1000);
      respondedToId = lastInbound.id;
    }

    let result: { success: boolean; external_id?: string; error?: string } = { success: false };

    switch (channel) {
      case 'email':
        result = await sendEmail(recipient_contact, subject || 'Message from Lead Velocity', content || '');
        break;
      case 'sms':
        result = await sendSMS(recipient_contact, content || '');
        break;
      case 'whatsapp':
        result = await sendWhatsApp(recipient_contact, content || '');
        break;
      case 'call':
        // Call logging only - actual call happens via browser
        result = { success: true };
        break;
    }

    // Log the communication with response time
    const { data: newComm, error: insertError } = await supabase.from('communications').insert({
      channel,
      direction: 'outbound',
      sender_id: user.id,
      sender_type: 'admin',
      recipient_type,
      recipient_contact,
      content,
      subject,
      lead_id,
      referral_id,
      broker_id,
      status: result.success ? 'sent' : 'failed',
      external_id: result.external_id,
      response_time_seconds: responseTimeSeconds,
      responded_to_id: respondedToId,
    }).select('id').single();

    if (insertError) {
      console.error('Error logging communication:', insertError);
    }

    // If we responded to an inbound message, mark it as responded
    if (respondedToId && newComm) {
      await supabase
        .from('communications')
        .update({ 
          metadata: { 
            responded_at: new Date().toISOString(),
            response_comm_id: newComm.id 
          } 
        })
        .eq('id', respondedToId);
    }

    console.log('Communication sent with response time:', responseTimeSeconds, 'seconds');

    // Check SLA thresholds and send alerts if exceeded
    if (responseTimeSeconds && responseTimeSeconds > 0 && newComm) {
      try {
        const { data: threshold } = await supabase
          .from('sla_thresholds')
          .select('*')
          .eq('channel', channel)
          .eq('enabled', true)
          .maybeSingle();

        if (threshold) {
          let severity: 'warning' | 'critical' | null = null;
          let thresholdSeconds = 0;

          if (responseTimeSeconds >= threshold.critical_seconds) {
            severity = 'critical';
            thresholdSeconds = threshold.critical_seconds;
          } else if (responseTimeSeconds >= threshold.warning_seconds) {
            severity = 'warning';
            thresholdSeconds = threshold.warning_seconds;
          }

          if (severity) {
            // Trigger SLA alert
            const alertPayload = {
              communication_id: newComm.id,
              channel,
              severity,
              response_time_seconds: responseTimeSeconds,
              threshold_seconds: thresholdSeconds,
              recipient_type,
              recipient_id: lead_id || referral_id || broker_id,
            };

            // Call the SLA alert function
            await fetch(`${supabaseUrl}/functions/v1/send-sla-alert`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(alertPayload),
            });

            console.log(`SLA ${severity} alert triggered for ${channel}`);
          }
        }
      } catch (slaError) {
        console.error('Error checking SLA thresholds:', slaError);
      }
    }

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-communication:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendEmail(to: string, subject: string, content: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lead Velocity <noreply@resend.dev>',
        to: [to],
        subject,
        html: content,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, external_id: data.id };
    }
    return { success: false, error: data.message };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function sendSMS(to: string, content: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio credentials not configured' };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: content,
        }),
      }
    );

    const data = await response.json();
    if (response.ok) {
      return { success: true, external_id: data.sid };
    }
    return { success: false, error: data.message };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function sendWhatsApp(to: string, content: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio credentials not configured' };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: `whatsapp:${to}`,
          From: `whatsapp:${fromNumber}`,
          Body: content,
        }),
      }
    );

    const data = await response.json();
    if (response.ok) {
      return { success: true, external_id: data.sid };
    }
    return { success: false, error: data.message };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}
