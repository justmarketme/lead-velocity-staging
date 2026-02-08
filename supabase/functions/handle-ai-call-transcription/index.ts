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

    const url = new URL(req.url);
    const callRequestId = url.searchParams.get('callRequestId');

    if (!callRequestId) {
      return new Response('Missing callRequestId', { status: 400 });
    }

    // Parse form data from Twilio webhook
    const formData = await req.formData();
    const transcriptionText = formData.get('TranscriptionText') as string;
    const transcriptionStatus = formData.get('TranscriptionStatus') as string;

    console.log('Transcription received:', { callRequestId, transcriptionStatus, transcriptionText });

    if (transcriptionStatus === 'completed' && transcriptionText) {
      // Get the existing call request
      const { data: callRequest } = await supabase
        .from('ai_call_requests')
        .select('*')
        .eq('id', callRequestId)
        .single();

      if (callRequest) {
        // Analyze the transcription for proposed changes
        const proposedChanges = analyzeTranscription(transcriptionText, callRequest.call_purpose);
        
        // Create a summary
        const summary = generateSummary(transcriptionText, callRequest.call_purpose, proposedChanges);

        const { error } = await supabase
          .from('ai_call_requests')
          .update({
            call_summary: summary,
            proposed_changes: proposedChanges,
            // If there are changes, require admin approval
            changes_approved: proposedChanges ? null : true,
          })
          .eq('id', callRequestId);

        if (error) {
          console.error('Error updating transcription:', error);
        }

        // Send email notification if there are proposed changes
        if (proposedChanges) {
          try {
            const notificationResponse = await fetch(`${supabaseUrl}/functions/v1/send-ai-call-notification`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                call_request_id: callRequestId,
                recipient_name: callRequest.recipient_name,
                call_purpose: callRequest.call_purpose,
                call_summary: summary,
                proposed_changes: proposedChanges,
              }),
            });

            if (!notificationResponse.ok) {
              console.error('Failed to send notification:', await notificationResponse.text());
            } else {
              console.log('Notification sent successfully');
            }
          } catch (notifyError) {
            console.error('Error sending notification:', notifyError);
          }
        }
      }
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Error handling transcription:', error);
    return new Response('Error', { status: 500 });
  }
});

function analyzeTranscription(text: string, purpose: string): Record<string, unknown> | null {
  const lowerText = text.toLowerCase();
  const changes: Record<string, unknown> = {};

  // Look for date/time mentions for appointment purposes
  if (purpose.includes('appointment') || purpose.includes('rescheduling')) {
    // Simple pattern matching for dates
    const datePatterns = [
      /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
      /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi,
      /\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)/gi,
      /tomorrow|next week|next month/gi,
    ];

    const timePatterns = [
      /\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi,
      /(?:morning|afternoon|evening)/gi,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        changes.suggested_date = match[0];
        break;
      }
    }

    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        changes.suggested_time = match[0];
        break;
      }
    }
  }

  // Check for cancellation mentions
  if (lowerText.includes('cancel') || lowerText.includes('not interested') || lowerText.includes('remove')) {
    changes.action = 'cancellation_requested';
  }

  // Check for callback requests
  if (lowerText.includes('call back') || lowerText.includes('callback') || lowerText.includes('call me back')) {
    changes.action = 'callback_requested';
  }

  // Check for confirmation
  if (lowerText.includes('confirm') || lowerText.includes('yes') || lowerText.includes('sounds good')) {
    changes.action = 'confirmed';
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

function generateSummary(text: string, purpose: string, changes: Record<string, unknown> | null): string {
  let summary = `AI Call Summary\n\nPurpose: ${purpose.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n`;
  
  summary += `Transcription:\n"${text}"\n\n`;

  if (changes) {
    summary += `Detected Actions/Changes:\n`;
    
    if (changes.suggested_date) {
      summary += `• Suggested Date: ${changes.suggested_date}\n`;
    }
    if (changes.suggested_time) {
      summary += `• Suggested Time: ${changes.suggested_time}\n`;
    }
    if (changes.action) {
      const actionLabels: Record<string, string> = {
        cancellation_requested: '⚠️ Cancellation Requested',
        callback_requested: '📞 Callback Requested',
        confirmed: '✅ Confirmed',
      };
      summary += `• Action: ${actionLabels[changes.action as string] || changes.action}\n`;
    }
    
    summary += `\n⏳ Admin approval required for any changes.`;
  } else {
    summary += `No specific actions or changes detected.`;
  }

  return summary;
}
