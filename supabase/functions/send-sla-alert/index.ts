import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Format response time for display
    const formatDuration = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (hours > 0) {
        return `${hours}h ${mins}m`;
      } else if (mins > 0) {
        return `${mins}m ${secs}s`;
      }
      return `${secs}s`;
    };

    const severityColor = payload.severity === 'critical' ? '#dc2626' : '#f59e0b';
    const severityLabel = payload.severity === 'critical' ? '🚨 CRITICAL' : '⚠️ WARNING';

    // Send email notifications if Resend is configured
    if (resendApiKey && adminEmails.length > 0) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: ${severityColor}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">${severityLabel} SLA Alert</h1>
          </div>
          <div style="padding: 20px; background-color: #f9fafb;">
            <h2 style="color: #374151;">Response Time SLA Exceeded</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Channel</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${payload.channel.toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Response Time</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${severityColor};">${formatDuration(payload.response_time_seconds)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">SLA Threshold</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${formatDuration(payload.threshold_seconds)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Recipient Type</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${payload.recipient_type}</td>
              </tr>
              ${payload.recipient_name ? `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Recipient</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${payload.recipient_name}</td>
              </tr>
              ` : ''}
            </table>
            <div style="margin-top: 20px; padding: 15px; background-color: #fef3c7; border-radius: 8px;">
              <p style="margin: 0; color: #92400e;">
                <strong>Action Required:</strong> Please review and respond to this communication as soon as possible.
              </p>
            </div>
          </div>
          <div style="padding: 15px; background-color: #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
            Lead Velocity - Communication Management System
          </div>
        </div>
      `;

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Lead Velocity <noreply@resend.dev>',
            to: adminEmails,
            subject: `${severityLabel} - ${payload.channel.toUpperCase()} Response Time Exceeded SLA`,
            html: emailHtml,
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
