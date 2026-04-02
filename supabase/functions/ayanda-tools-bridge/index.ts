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
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { toolName, parameters, leadId, brokerId } = await req.json();

        // 1. Handle Appointment Booking (Forward to n8n Webhook)
        if (toolName === "book_appointment") {
            const N8N_WEBHOOK_URL = Deno.env.get("N8N_CALENDAR_WEBHOOK_URL");
            
            if (!N8N_WEBHOOK_URL) throw new Error("N8N_CALENDAR_WEBHOOK_URL not configured.");

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    leadId, 
                    brokerId, 
                    appointmentTime: parameters.appointment_time, 
                    notes: parameters.notes 
                }),
            });

            if (!response.ok) throw new Error(`n8n booking error: ${response.statusText}`);

            // Log activity in Supabase
            await supabase.from('appointments').insert({
                lead_id: leadId,
                broker_id: brokerId,
                appointment_time: parameters.appointment_time,
                notes: parameters.notes,
                status: 'scheduled'
            });

            return new Response(JSON.stringify({ success: true, message: "Appointment forwarded to n8n." }), { status: 200, headers: corsHeaders });
        }

        // 2. Handle WhatsApp Confirmation (Direct Twilio Bridge)
        if (toolName === "send_whatsapp_confirmation") {
            const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
            const TWILIO_AUTH = Deno.env.get("TWILIO_AUTH_TOKEN");
            const TWILIO_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");

            if (!TWILIO_SID || !TWILIO_AUTH) throw new Error("Twilio credentials missing.");

            const { data: lead } = await supabase.from('leads').select('phone').eq('id', leadId).single();

            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
                method: "POST",
                headers: {
                    "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_AUTH}`),
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    To: `whatsapp:${lead.phone}`,
                    From: `whatsapp:${TWILIO_FROM}`,
                    Body: parameters.message
                }).toString()
            });

            if (!response.ok) throw new Error(`Twilio WhatsApp error: ${response.statusText}`);

            await supabase.from('ai_call_requests').update({ whatsapp_sent_at: new Date().toISOString() }).eq('recipient_id', leadId);

            return new Response(JSON.stringify({ success: true, message: "WhatsApp sent via Twilio." }), { status: 200, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: "Unknown tool call." }), { status: 400, headers: corsHeaders });

    } catch (error: any) {
        console.error('Tool Bridge Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});
