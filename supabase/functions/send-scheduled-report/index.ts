import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scheduledReportEmail, type ReportAnalytics } from "../_shared/lv_emails.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduledReport {
  id: string;
  name: string;
  report_type: 'admin_summary' | 'broker_client_report';
  frequency: string;
  recipient_type: string;
  recipient_ids: string[];
  broker_id: string | null;
  include_sections: string[];
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

    const { report_id, manual } = await req.json();

    let reports: ScheduledReport[] = [];

    if (report_id) {
      // Send specific report
      const { data } = await supabase
        .from('scheduled_reports')
        .select('*')
        .eq('id', report_id)
        .single();
      
      if (data) reports = [data];
    } else {
      // Get all due reports
      const { data } = await supabase
        .from('scheduled_reports')
        .select('*')
        .eq('enabled', true)
        .lte('next_scheduled_at', new Date().toISOString());
      
      if (data) reports = data;
    }

    console.log(`Processing ${reports.length} scheduled reports`);

    const results = [];

    for (const report of reports) {
      try {
        const reportResult = await generateAndSendReport(supabase, report, resendApiKey);
        results.push({ report_id: report.id, ...reportResult });

        // Update last_sent_at (trigger will recalculate next_scheduled_at)
        await supabase
          .from('scheduled_reports')
          .update({ last_sent_at: new Date().toISOString() })
          .eq('id', report.id);

      } catch (error) {
        console.error(`Error processing report ${report.id}:`, error);
        results.push({ 
          report_id: report.id, 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-scheduled-report:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateAndSendReport(
  supabase: SupabaseClient,
  report: ScheduledReport,
  resendApiKey: string | undefined
): Promise<{ status: string; recipients_count?: number; reason?: string; error?: string }> {
  // Get date range based on frequency
  const now = new Date();
  const startDate = new Date();
  
  switch (report.frequency) {
    case 'daily':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'weekly':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'monthly':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  // Build query based on report type
  let query = supabase
    .from('communications')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', now.toISOString());

  // For broker reports, filter by broker's leads
  if (report.report_type === 'broker_client_report' && report.broker_id) {
    const { data: brokerLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('broker_id', report.broker_id);
    
    const leadIds = brokerLeads?.map((l: { id: string }) => l.id) || [];
    query = query.in('lead_id', leadIds);
  }

  const { data: communications } = await query;

  // Calculate analytics
  const analytics = calculateAnalytics(communications || [], report.include_sections);

  // Get recipients
  const recipients = await getRecipients(supabase, report);

  if (recipients.length === 0) {
    console.log('No recipients for report:', report.id);
    return { status: 'skipped', reason: 'no_recipients' };
  }

  // Lead Velocity layout + plain-text part
  const mail = scheduledReportEmail({
    name: report.name, frequency: report.frequency, start: startDate, end: now, generatedAt: new Date(),
    analytics: analytics as unknown as ReportAnalytics,
  });

  // Send email
  if (resendApiKey) {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lead Velocity <howzit@leadvelocity.co.za>',
        to: recipients,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Email send failed: ${errorText}`);
    }
  }

  // Log to history
  await supabase.from('report_history').insert({
    scheduled_report_id: report.id,
    recipients,
    status: 'sent',
    report_data: analytics,
  });

  console.log(`Report ${report.id} sent to ${recipients.length} recipients`);
  return { status: 'sent', recipients_count: recipients.length };
}

async function getRecipients(
  supabase: SupabaseClient,
  report: ScheduledReport
): Promise<string[]> {
  const emails: string[] = [];

  switch (report.recipient_type) {
    case 'all_admins': {
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      
      for (const role of adminRoles || [] as { user_id: string }[]) {
        const { data: userData } = await supabase.auth.admin.getUserById(role.user_id);
        if (userData?.user?.email) {
          emails.push(userData.user.email);
        }
      }
      break;
    }
    case 'specific_admins': {
      for (const userId of report.recipient_ids) {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user?.email) {
          emails.push(userData.user.email);
        }
      }
      break;
    }
    case 'broker': {
      if (report.broker_id) {
        const { data: broker } = await supabase
          .from('brokers')
          .select('email')
          .eq('id', report.broker_id)
          .single();
        
        if (broker?.email) {
          emails.push(broker.email);
        }
      }
      break;
    }
    case 'all_brokers': {
      const { data: brokers } = await supabase
        .from('brokers')
        .select('email')
        .eq('status', 'Active');
      
      for (const broker of brokers || [] as { email: string | null }[]) {
        if (broker.email) {
          emails.push(broker.email);
        }
      }
      break;
    }
  }

  return emails;
}

function calculateAnalytics(communications: unknown[], sections: string[]) {
  const comms = communications as Array<{
    channel: string;
    status: string;
    call_duration: number | null;
    response_time_seconds: number | null;
    direction: string;
  }>;

  const analytics: Record<string, unknown> = {
    total: comms.length,
    period: { start: '', end: '' },
  };

  if (sections.includes('summary')) {
    const outbound = comms.filter(c => c.direction === 'outbound').length;
    const inbound = comms.filter(c => c.direction === 'inbound').length;
    const successful = comms.filter(c => 
      c.status === 'completed' || c.status === 'sent' || c.status === 'delivered'
    ).length;
    
    analytics.summary = {
      total: comms.length,
      outbound,
      inbound,
      successful,
      success_rate: comms.length > 0 ? Math.round((successful / comms.length) * 100) : 0,
    };
  }

  if (sections.includes('channel_breakdown')) {
    const channels: Record<string, { total: number; successful: number }> = {};
    
    comms.forEach(c => {
      if (!channels[c.channel]) {
        channels[c.channel] = { total: 0, successful: 0 };
      }
      channels[c.channel].total++;
      if (c.status === 'completed' || c.status === 'sent' || c.status === 'delivered') {
        channels[c.channel].successful++;
      }
    });
    
    analytics.channels = channels;
  }

  if (sections.includes('response_times')) {
    const responseTimes = comms
      .filter(c => c.response_time_seconds && c.response_time_seconds > 0)
      .map(c => c.response_time_seconds!);
    
    analytics.response_times = {
      count: responseTimes.length,
      average: responseTimes.length > 0 
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0,
      min: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      max: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    };
  }

  return analytics;
}
