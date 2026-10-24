import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { slaAlertEmail } from "../_shared/lv_emails.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SLAAlertPayload {
  communication_id: string;
  channel: string;
  severity: 'warning' | 'critical';
  response_time_seconds: number;
  threshold_seconds: number;
  recipient_type: string;
  recipient_id?: string;
  recipient_name?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload: SLAAlertPayload = await req.json();

    console.log('Processing SLA alert:', payload);

    // Create the SLA alert record
    const { data: alert, error: alertError } = await supabase
      .from('sla_alerts')
      .insert({
        communication_id: payload.communication_id,
        channel: payload.channel,
        severity: payload.severity,
        response_time_seconds: payload.response_time_seconds,
        threshold_seconds: payload.threshold_seconds,
        recipient_type: payload.recipient_type,
        recipient_id: payload.recipient_id,
      })
      .select()
      .single();

    if (alertError) {
      console.error('Error creating SLA alert:', alertError);
      throw alertError;
    }

    console.log('SLA alert created:', alert.id);

    // Get all admin users to notify
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (!adminRoles || adminRoles.length === 0) {
      console.log('No admins to notify');
      return new Response(JSON.stringify({ success: true, alert_id: alert.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get admin emails from auth
    const adminEmails: string[] = [];
    for (const admin of adminRoles) {
      const { data: userData } = await supabase.auth.admin.getUserById(admin.user_id);
      if (userData?.user?.email) {
        adminEmails.push(userData.user.email);
      }
    }


    // Send email notifications if Resend is configured
    if (resendApiKey && adminEmails.length > 0) {
      try {
        const mail = slaAlertEmail({
          channel: payload.channel,
          severity: payload.severity,
          responseSeconds: payload.response_time_seconds,
          thresholdSeconds: payload.threshold_seconds,
          recipientType: payload.recipient_type,
          recipientName: payload.recipient_name,
        });
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Lead Velocity <howzit@leadvelocity.co.za>',
            to: adminEmails,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          }),
        });

        if (emailResponse.ok) {
          console.log('SLA alert emails sent to:', adminEmails);
        } else {
          const errorText = await emailResponse.text();
          console.error('Error sending SLA alert emails:', errorText);
        }
      } catch (emailError) {
        console.error('Error sending SLA alert emails:', emailError);
      }
    }

    return new Response(JSON.stringify({ success: true, alert_id: alert.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-sla-alert:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
