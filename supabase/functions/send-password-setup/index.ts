// Admin-only: email a broker a "create your password" link.
//
// Triggers Supabase's own recovery email (auth /recover). The project's auth mailer sends through
// Resend SMTP as "Lead Velocity" <howzit@leadvelocity.co.za>, using the branded "Reset password"
// template (source: deliverables/emails/create-password.html in the dashboard). That template links
// to our own page (/broker/set-password?token_hash=...) rather than Supabase's /verify URL, so mail
// scanners that pre-fetch links (Microsoft Safe Links, Defender) can't burn the one-time token: it is
// only redeemed when the broker submits the form (verifyOtp on the page). The token never reaches
// the browser that pressed the button.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://leadvelocity.co.za";
const ALLOWED_ORIGINS = [SITE, "https://www.leadvelocity.co.za", "http://localhost:5173", "http://localhost:8080"];

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : SITE,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. Caller must be an admin.
  const authHeader = req.headers.get("Authorization") || "";
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: caller } } = await asCaller.auth.getUser();
  if (!caller) return reply(401, { error: "Unauthorized" });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (isAdmin !== true) return reply(403, { error: "Admin access required" });

  // 2. Resolve the target's auth email (the login identity, not the CRM contact field).
  //    { broker_id } → that broker. { self: true } → the calling admin (a safe test send).
  let body: { broker_id?: string; self?: boolean } = {};
  try { body = (await req.json()) || {}; } catch { /* empty body */ }
  let broker: { id: string; user_id: string | null } | null = null;
  let userId = caller.id;
  if (body.self !== true) {
    if (!body.broker_id) return reply(400, { error: "broker_id required" });
    const { data } = await admin.from("brokers").select("id, user_id").eq("id", String(body.broker_id)).maybeSingle();
    broker = data;
    if (!broker) return reply(404, { error: "Broker not found" });
    if (!broker.user_id) return reply(409, { error: "This broker has no portal login yet" });
    userId = broker.user_id;
  }
  const { data: au, error: auErr } = await admin.auth.admin.getUserById(userId);
  const email = au?.user?.email;
  if (auErr || !email) return reply(409, { error: "Couldn't find the login email" });

  // 3. Send it (Supabase mints the token and mails the branded template over SMTP).
  const { error: sendErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${SITE}/broker/set-password` });
  if (sendErr) {
    console.error("recovery email failed", sendErr.status, sendErr.message);
    return reply(502, { error: `The email couldn't be sent: ${sendErr.message}` });
  }
  console.log("password setup email sent", { broker_id: broker?.id ?? "self" });
  if (!broker) return reply(200, { sent: true, email });

  // 4. Log it on the broker's timeline.
  const { data: activity } = await admin.from("broker_activities").insert({
    broker_id: broker.id,
    activity_type: "email",
    outcome: "n/a",
    body: `"Create your password" email sent to ${email}`,
    created_by: caller.id,
  }).select().single();

  return reply(200, { sent: true, email, activity });
});
