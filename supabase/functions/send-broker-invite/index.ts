import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brokerInviteEmail } from "../_shared/lv_emails.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const ALLOWED_ORIGINS = [
    'https://www.leadvelocity.co.za',
    'https://leadvelocity.co.za',
    'http://localhost:5173',
    'http://localhost:8080',
];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

interface BrokerInviteRequest {
    email: string;
    brokerName: string;
    inviteLink: string;
    expiresAt: string;
    portalType?: 'referral' | 'marketing';
}

const handler = async (req: Request): Promise<Response> => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            console.error("No authorization header provided");
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
            console.error("Authentication failed:", authError?.message);
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { data: roleData, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .single();

        if (roleError || !roleData) {
            console.error("Admin role check failed:", roleError?.message);
            return new Response(
                JSON.stringify({ success: false, error: 'Forbidden - Admin access required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { email, brokerName, inviteLink, expiresAt, portalType }: BrokerInviteRequest = await req.json();

        if (!email || !inviteLink || !expiresAt) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields (email, inviteLink, expiresAt)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const toAddress = email.trim().toLowerCase();
        const FROM_ADDRESS = "Lead Velocity <howzit@leadvelocity.co.za>";
        console.log("Sending broker invite from", FROM_ADDRESS, "to:", toAddress, "portal type:", portalType);

        const mail = brokerInviteEmail({ brokerName, inviteLink, expiresAt, portalType });

        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: FROM_ADDRESS,
                to: [toAddress],
                reply_to: "howzit@leadvelocity.co.za",
                subject: mail.subject,
                html: mail.html,
                text: mail.text,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("Resend API error:", data);
            throw new Error(data.message || "Failed to send email");
        }

        console.log("Broker invite email sent successfully to:", toAddress);

        return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    } catch (error: any) {
        console.error("Error sending broker invite email:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            }
        );
    }
};

serve(handler);
