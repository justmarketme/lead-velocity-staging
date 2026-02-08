import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Recipient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string;
}

interface BulkCommunicationPayload {
  channel: 'email' | 'sms' | 'whatsapp';
  recipients: Recipient[];
  message_template: string;
  subject?: string;
  recipient_type: 'lead' | 'referral' | 'broker';
}

// Input validation
function validatePayload(payload: BulkCommunicationPayload): { valid: boolean; error?: string } {
  if (!payload.channel || !['email', 'sms', 'whatsapp'].includes(payload.channel)) {
    return { valid: false, error: 'Invalid channel. Must be email, sms, or whatsapp' };
  }
  
  if (!Array.isArray(payload.recipients) || payload.recipients.length === 0) {
    return { valid: false, error: 'Recipients array is required and must not be empty' };
  }
  
  if (payload.recipients.length > 100) {
    return { valid: false, error: 'Maximum 100 recipients allowed per batch' };
  }
  
  if (!payload.message_template || typeof payload.message_template !== 'string') {
    return { valid: false, error: 'Message template is required' };
  }
  
  if (payload.message_template.length > 5000) {
    return { valid: false, error: 'Message template must be less than 5000 characters' };
  }
  
  if (payload.channel === 'email' && (!payload.subject || payload.subject.length > 200)) {
    return { valid: false, error: 'Email subject is required and must be less than 200 characters' };
  }
  
  // Validate each recipient
  for (const recipient of payload.recipients) {
    if (!recipient.id || typeof recipient.id !== 'string') {
      return { valid: false, error: 'Each recipient must have a valid id' };
    }
    if (payload.channel === 'email' && !isValidEmail(recipient.email)) {
      return { valid: false, error: `Invalid email for recipient ${recipient.id}` };
    }
    if ((payload.channel === 'sms' || payload.channel === 'whatsapp') && !recipient.phone) {
      return { valid: false, error: `Phone number required for recipient ${recipient.id}` };
    }
  }
  
  return { valid: true };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeHtml(text: string): string {
  // Basic HTML sanitization for email content
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function personalizeMessage(template: string, recipient: Recipient): string {
  const firstName = recipient.first_name || '';
  const lastName = recipient.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'Valued Customer';
  
  return template
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{last_name\}/gi, lastName)
    .replace(/\{name\}/gi, fullName)
    .replace(/\{email\}/gi, recipient.email)
    .replace(/\{phone\}/gi, recipient.phone);
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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: BulkCommunicationPayload = await req.json();
    
    // Validate input
    const validation = validatePayload(payload);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { channel, recipients, message_template, subject, recipient_type } = payload;
    
    const results: { recipient_id: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let failCount = 0;

    // Process each recipient
    for (const recipient of recipients) {
      try {
        const personalizedMessage = personalizeMessage(message_template, recipient);
        const recipientContact = channel === 'email' ? recipient.email : recipient.phone;
        
        let result: { success: boolean; external_id?: string; error?: string };
        
        switch (channel) {
          case 'email':
            // Wrap plain text in HTML for better email rendering
            const htmlContent = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <p>${sanitizeHtml(personalizedMessage)}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">This email was sent from Lead Velocity</p>
              </div>
            `;
            result = await sendEmail(recipient.email, subject!, htmlContent);
            break;
          case 'sms':
            result = await sendSMS(recipient.phone, personalizedMessage);
            break;
          case 'whatsapp':
            result = await sendWhatsApp(recipient.phone, personalizedMessage);
            break;
          default:
            result = { success: false, error: 'Invalid channel' };
        }

        // Log the communication
        const { error: insertError } = await supabase.from('communications').insert({
          channel,
          direction: 'outbound',
          sender_id: user.id,
          sender_type: 'admin',
          recipient_type,
          recipient_id: recipient.id,
          recipient_contact: recipientContact,
          content: personalizedMessage,
          subject: channel === 'email' ? subject : null,
          lead_id: recipient_type === 'lead' ? recipient.id : null,
          status: result.success ? 'sent' : 'failed',
          external_id: result.external_id,
          metadata: { bulk_send: true, template_used: true }
        });

        if (insertError) {
          console.error('Error logging communication:', insertError);
        }

        if (result.success) {
          successCount++;
          results.push({ recipient_id: recipient.id, success: true });
        } else {
          failCount++;
          results.push({ recipient_id: recipient.id, success: false, error: result.error });
        }
      } catch (error: unknown) {
        failCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ recipient_id: recipient.id, success: false, error: errorMessage });
      }
    }

    console.log(`Bulk communication completed: ${successCount} sent, ${failCount} failed`);

    return new Response(JSON.stringify({
      success: failCount === 0,
      total: recipients.length,
      sent: successCount,
      failed: failCount,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-bulk-communication:', error);
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
