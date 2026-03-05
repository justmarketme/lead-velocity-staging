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

        const payload = await req.json();
        const { to_number, recipient_id, recipient_type, recipient_name, call_record_id } = payload;

        if (!to_number) {
            return new Response(JSON.stringify({ error: 'to_number is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Get Admin's phone number from profiles or fallback
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name') // full_schema says profiles has full_name, not phone. 
            .eq('user_id', user.id)
            .single();

        // Use current user's metadata if available, otherwise we might need a settings table.
        // For now, we'll try to find any phone number associated with the admin.
        // In a real scenario, this would be a verified "Agent phone number".
        const adminPhone = user.user_metadata?.phone || Deno.env.get('TWILIO_PHONE_NUMBER');

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !fromNumber) {
            return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Initiate call to the ADMIN first. 
        // When they answer, we dial the CLIENT.
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to the client.</Say>
  <Dial callerId="${fromNumber}">${to_number}</Dial>
</Response>`;

        const twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
            {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    To: adminPhone, // Call the admin first
                    From: fromNumber,
                    Twiml: twiml,
                }),
            }
        );

        const twilioData = await twilioResponse.json();

        if (!twilioResponse.ok) {
            return new Response(JSON.stringify({ error: twilioData.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Log or update the communication as a call
        if (!call_record_id) {
            await supabase.from('communications').insert({
                channel: 'call',
                direction: 'outbound',
                sender_id: user.id,
                sender_type: 'admin',
                recipient_type: recipient_type || 'client',
                recipient_contact: to_number,
                lead_id: recipient_type === 'lead' ? recipient_id : null,
                referral_id: recipient_type === 'referral' ? recipient_id : null,
                broker_id: recipient_type === 'broker' ? recipient_id : null,
                status: 'pending',
                external_id: twilioData.sid,
            });
        } else {
            await supabase.from('communications').update({
                status: 'in-progress',
                external_id: twilioData.sid,
            })
                .eq('id', call_record_id);
        }

        return new Response(JSON.stringify({
            success: true,
            callSid: twilioData.sid,
            message: 'Calling your phone to connect...'
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error in initiate-browser-call:', error);
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
