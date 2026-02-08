import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// deno-lint-ignore no-explicit-any
async function generateAndSendReport(
  supabase: any,
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
    
    // deno-lint-ignore no-explicit-any
    const leadIds = brokerLeads?.map((l: any) => l.id) || [];
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

  // Generate email HTML
  const emailHtml = generateReportEmail(report, analytics, startDate, now);

  // Send email
  if (resendApiKey) {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lead Velocity <noreply@resend.dev>',
        to: recipients,
        subject: `${report.name} - ${formatDateRange(startDate, now)}`,
        html: emailHtml,
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

// deno-lint-ignore no-explicit-any
async function getRecipients(
  supabase: any,
  report: ScheduledReport
): Promise<string[]> {
  const emails: string[] = [];

  switch (report.recipient_type) {
    case 'all_admins': {
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      
      // deno-lint-ignore no-explicit-any
      for (const role of adminRoles || [] as any[]) {
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
      
      // deno-lint-ignore no-explicit-any
      for (const broker of brokers || [] as any[]) {
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

function formatDateRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function generateReportEmail(
  report: ScheduledReport,
  analytics: Record<string, unknown>,
  startDate: Date,
  endDate: Date
): string {
  const summary = analytics.summary as { total: number; outbound: number; inbound: number; success_rate: number } | undefined;
  const channels = analytics.channels as Record<string, { total: number; successful: number }> | undefined;
  const responseTimes = analytics.response_times as { count: number; average: number; min: number; max: number } | undefined;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #1e293b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">📊 ${report.name}</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">
          ${formatDateRange(startDate, endDate)}
        </p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
        ${summary ? `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #374151; margin: 0 0 15px 0; font-size: 18px;">Summary</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Total Communications</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; text-align: right;">${summary.total}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Outbound</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">${summary.outbound}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Inbound</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">${summary.inbound}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Success Rate</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; text-align: right; color: ${summary.success_rate >= 80 ? '#059669' : summary.success_rate >= 60 ? '#d97706' : '#dc2626'};">${summary.success_rate}%</td>
            </tr>
          </table>
        </div>
        ` : ''}
        
        ${channels ? `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #374151; margin: 0 0 15px 0; font-size: 18px;">Channel Breakdown</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: left;">Channel</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">Total</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">Successful</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">Rate</th>
            </tr>
            ${Object.entries(channels).map(([channel, stats]) => `
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-transform: capitalize;">${channel}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">${stats.total}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">${stats.successful}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">${stats.total > 0 ? Math.round((stats.successful / stats.total) * 100) : 0}%</td>
            </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}
        
        ${responseTimes && responseTimes.count > 0 ? `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #374151; margin: 0 0 15px 0; font-size: 18px;">Response Times</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Average Response Time</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; text-align: right;">${formatDuration(responseTimes.average)}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Fastest Response</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">${formatDuration(responseTimes.min)}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Slowest Response</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">${formatDuration(responseTimes.max)}</td>
            </tr>
          </table>
        </div>
        ` : ''}
        
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>This is an automated report from Lead Velocity.</p>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
