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
    const callStatus = formData.get('CallStatus') as string;
    const callDuration = formData.get('CallDuration') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;

    console.log('Call status update:', { callRequestId, callStatus, callDuration, recordingUrl });

    // Map Twilio status to our status
    let status = 'in_progress';
    if (callStatus === 'completed') {
      status = 'completed';
    } else if (callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'canceled') {
      status = 'failed';
    }

    const updateData: Record<string, unknown> = {
      call_status: status,
    };

    if (callDuration) {
      updateData.call_duration = parseInt(callDuration, 10);
    }

    if (recordingUrl) {
      updateData.call_recording_url = recordingUrl;
    }

    // If call is completed, generate a basic summary
    if (status === 'completed') {
      updateData.call_summary = `Call completed. Duration: ${callDuration || 0} seconds. ${recordingUrl ? 'Recording available.' : 'No recording.'}`;
    } else if (status === 'failed') {
      updateData.call_summary = `Call ${callStatus}. Unable to reach recipient.`;
    }

    const { error } = await supabase
      .from('ai_call_requests')
      .update(updateData)
      .eq('id', callRequestId);

    if (error) {
      console.error('Error updating call status:', error);
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Error handling call status:', error);
    return new Response('Error', { status: 500 });
  }
});
