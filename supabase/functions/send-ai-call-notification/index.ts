import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  call_request_id: string;
  recipient_name: string;
  call_purpose: string;
  call_summary: string;
  proposed_changes: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: NotificationPayload = await req.json();
    const { call_request_id, recipient_name, call_purpose, call_summary, proposed_changes } = payload;

    // Get all admin users to notify
    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (rolesError) {
      console.error('Error fetching admin roles:', rolesError);
      throw new Error('Failed to fetch admin users');
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log('No admin users found to notify');
      return new Response(JSON.stringify({ success: true, message: 'No admins to notify' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get admin emails from auth.users
    const adminUserIds = adminRoles.map(r => r.user_id);
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw new Error('Failed to fetch user emails');
    }

    // Get notification preferences for admins who have email enabled
    const { data: preferences, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('user_id, ai_call_email')
      .in('user_id', adminUserIds);

    if (prefsError) {
      console.error('Error fetching notification preferences:', prefsError);
    }

    // Build a map of user preferences (default to true if no preference set)
    const emailPrefs = new Map<string, boolean>();
    if (preferences) {
      preferences.forEach(p => emailPrefs.set(p.user_id, p.ai_call_email));
    }

    // Filter admins who have email notifications enabled (or no preference set = default true)
    const adminEmails = users
      .filter(u => {
        if (!adminUserIds.includes(u.id) || !u.email) return false;
        const emailEnabled = emailPrefs.get(u.id);
        return emailEnabled === undefined || emailEnabled === true;
      })
      .map(u => u.email!);

    if (adminEmails.length === 0) {
      console.log('No admin emails to send (all disabled or no admins found)');
      return new Response(JSON.stringify({ success: true, message: 'No admin emails to send' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format proposed changes for email
    const changesHtml = Object.entries(proposed_changes)
      .map(([key, value]) => `<li><strong>${key.replace(/_/g, ' ')}:</strong> ${value}</li>`)
      .join('');

    const purposeLabel = call_purpose.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Send email to all admins
    const emailPromises = adminEmails.map(email =>
      resend.emails.send({
        from: 'Lead Velocity <noreply@resend.dev>',
        to: [email],
        subject: `🤖 AI Call Completed - Action Required: ${recipient_name}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
              .changes-box { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin: 15px 0; }
              .summary-box { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 15px 0; }
              .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
              .footer { text-align: center; padding: 15px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🤖 AI Call Completed</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Action Required - Proposed Changes Detected</p>
              </div>
              <div class="content">
                <h2 style="margin-top: 0;">Call Details</h2>
                <p><strong>Recipient:</strong> ${recipient_name}</p>
                <p><strong>Purpose:</strong> ${purposeLabel}</p>
                
                <div class="changes-box">
                  <h3 style="margin-top: 0; color: #856404;">⚠️ Proposed Changes</h3>
                  <p>The AI agent detected the following changes that require your approval:</p>
                  <ul>${changesHtml}</ul>
                </div>
                
                <div class="summary-box">
                  <h3 style="margin-top: 0;">📝 Call Summary</h3>
                  <p style="white-space: pre-wrap;">${call_summary}</p>
                </div>
                
                <p>Please review these changes and approve or reject them in the dashboard.</p>
                <a href="https://velocity.leadvelocity.co.za/dashboard" class="button">
                  Review in Dashboard
                </a>
              </div>
              <div class="footer">
                <p>This is an automated notification from Lead Velocity AI Call System</p>
              </div>
            </div>
          </body>
          </html>
        `,
      })
    );

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Sent ${successful} emails, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      emails_sent: successful,
      emails_failed: failed
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending AI call notification:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
