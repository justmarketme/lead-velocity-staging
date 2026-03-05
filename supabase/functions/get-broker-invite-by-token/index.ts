import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
    "https://www.leadvelocity.co.za",
    "https://leadvelocity.co.za",
    "http://localhost:5173",
    "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get("origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
}

const handler = async (req: Request): Promise<Response> => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    try {
        const body = await req.json().catch(() => ({}));
        const token = typeof body?.token === "string" ? body.token.trim() : null;
        if (!token) {
            return new Response(
                JSON.stringify({ error: "Missing token" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const url = Deno.env.get("SUPABASE_URL");
        if (!serviceRoleKey || !url) {
            console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL");
            return new Response(
                JSON.stringify({ error: "Server configuration error" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
        const { data, error } = await client
            .from("broker_invites")
            .select("*")
            .eq("token", token)
            .is("used_at", null)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();

        if (error) {
            console.error("Broker invite lookup error:", error);
            return new Response(
                JSON.stringify({ error: "Lookup failed" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!data) {
            return new Response(
                JSON.stringify({ error: "Invalid or expired link" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("get-broker-invite-by-token error:", e);
        return new Response(
            JSON.stringify({ error: "Server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
};

serve(handler);
