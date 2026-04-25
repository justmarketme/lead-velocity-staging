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

        const { toolName, parameters, leadId: rawLeadId, brokerId, callerPhone, callerName, callerEmail, callerWhatsapp } = await req.json();

        // 1. Handle Appointment Booking
        if (toolName === "book_appointment") {
            let leadId = rawLeadId || null;

            // Step 1: Create lead if not in DB (inbound caller)
            if (!leadId) {
                const nameParts = (callerName || '').trim().split(/\s+/);
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                const { data: newLead, error: leadError } = await supabase
                    .from('leads')
                    .insert({
                        first_name: firstName,
                        last_name: lastName,
                        phone: callerPhone || null,
                        email: callerEmail || null,
                        source: 'Ayanda Prospecting',
                        current_status: 'New'
                    })
                    .select('id')
                    .single();

                if (leadError) throw new Error(`Failed to create lead: ${leadError.message}`);
                leadId = newLead.id;
            }

            // Step 2: Insert appointment
            const reasonNotes = [
                'Booked by Ayanda AI.',
                parameters.notes || '',
                `Caller: ${callerName || ''}`,
                `Phone: ${callerPhone || ''}`,
                `Email: ${callerEmail || ''}`,
                `WhatsApp: ${callerWhatsapp || callerPhone || ''}`
            ].join(' ').trim();

            const { data: appointment, error: apptError } = await supabase
                .from('appointments')
                .insert({
                    client_id: leadId,
                    broker_id: brokerId || null,
                    appointment_date: parameters.appointment_time,
                    status: 'scheduled',
                    reason: '15-minute Lead Velocity Discovery Call',
                    reason_notes: reasonNotes
                })
                .select('id')
                .single();

            if (apptError) throw new Error(`Failed to insert appointment: ${apptError.message}`);

            // Step 3: Update lead pipeline status
            await supabase
                .from('leads')
                .update({ current_status: 'Appointment Booked' })
                .eq('id', leadId);

            // Step 4: Update ai_call_requests if one exists for this lead
            const callSummary = `Appointment booked for ${parameters.appointment_time}. Caller: ${callerName || callerPhone}. Notes: ${parameters.notes || 'None.'}`;
            await supabase
                .from('ai_call_requests')
                .update({ call_status: 'completed', call_summary: callSummary })
                .eq('recipient_id', leadId);

            // Step 5: Try N8N webhook if configured (optional)
            try {
                const N8N_WEBHOOK_URL = Deno.env.get("N8N_CALENDAR_WEBHOOK_URL");
                if (N8N_WEBHOOK_URL) {
                    await fetch(N8N_WEBHOOK_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            leadId,
                            brokerId,
                            appointmentTime: parameters.appointment_time,
                            notes: parameters.notes
                        }),
                    });
                }
            } catch (n8nErr) {
                console.warn('N8N webhook failed (non-fatal):', n8nErr);
            }

            return new Response(JSON.stringify({ success: true, appointmentId: appointment.id, leadId }), { status: 200, headers: corsHeaders });
        }

        // 2. Handle SMS Confirmation (Direct Twilio Bridge)
        if (toolName === "send_sms_confirmation") {
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
                    To: lead.phone,
                    From: TWILIO_FROM,
                    Body: parameters.message
                }).toString()
            });

            if (!response.ok) throw new Error(`Twilio SMS error: ${response.statusText}`);

            await supabase.from('ai_call_requests').update({ whatsapp_sent_at: new Date().toISOString() }).eq('recipient_id', leadId);

            return new Response(JSON.stringify({ success: true, message: "SMS sent via Twilio." }), { status: 200, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: "Unknown tool call." }), { status: 400, headers: corsHeaders });

    } catch (error: any) {
        console.error('Tool Bridge Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});
