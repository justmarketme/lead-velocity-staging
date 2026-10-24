// Admin-only: email a broker their "Welcome to Lead Velocity: create your password" email.
//
// Triggers Supabase's own recovery email (auth /recover). The project's auth mailer sends through
// Resend SMTP as "Lead Velocity" <howzit@leadvelocity.co.za>, using the branded "Reset password"
// template (source: deliverables/emails/create-password.html). That template links to our own page
// (/broker/set-password?token_hash=...) rather than Supabase's /verify URL, so mail scanners that
// pre-fetch links (Microsoft Safe Links, Defender) can't burn the one-time token: it is only redeemed
// when the broker submits the form. The token never reaches the browser that pressed the button.
//
// The welcome content (greeting, payment receipt, video, first steps, signature) renders only when
// user_metadata.welcome is set. GoTrue reads the user fresh and renders the email synchronously inside
// /recover, so we set `welcome` just before the call and clear it (welcome: null) straight after; a
// later Forgot-password email is the plain variant.
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

const zar = (cents: number) => "R" + Math.round(cents / 100).toLocaleString("en-US");
const sastDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" });

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

  // 2. Who gets it.
  //    { broker_id }              → that broker's login.
  //    { broker_id, self: true }  → preview: that broker's welcome email, sent to the calling admin's own login.
  //    { self: true }             → the calling admin, plain variant.
  let body: { broker_id?: string; self?: boolean } = {};
  try { body = (await req.json()) || {}; } catch { /* empty body */ }
  const preview = body.self === true;
  let broker: { id: string; user_id: string | null; contact_person: string | null; adviser_name: string | null } | null = null;
  if (body.broker_id) {
    const { data } = await admin.from("brokers").select("id, user_id, contact_person, adviser_name").eq("id", String(body.broker_id)).maybeSingle();
    broker = data;
    if (!broker) return reply(404, { error: "Broker not found" });
    if (!preview && !broker.user_id) return reply(409, { error: "This broker has no portal login yet" });
  } else if (!preview) {
    return reply(400, { error: "broker_id required" });
  }
  const userId = preview ? caller.id : broker!.user_id!;
  const { data: au, error: auErr } = await admin.auth.admin.getUserById(userId);
  const email = au?.user?.email;
  if (auErr || !email) return reply(409, { error: "Couldn't find the login email" });

  // 3. Welcome content, from the broker's record and latest paid order. Missing values are left out
  //    and the template skips them.
  let welcome: Record<string, string> | null = null;
  if (broker) {
    const { data: order } = await admin.from("lead_orders")
      .select("amount_zar, paid_at, lead_count, criteria")
      .eq("broker_id", broker.id).eq("status", "paid")
      .order("paid_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const { count: agreements } = await admin.from("admin_documents")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", broker.id).eq("kind", "signed_agreement");
    const first = (broker.contact_person || broker.adviser_name || "").trim().split(/\s+/)[0] || "";
    // Same precedence as the portal's plan card (brokerPlan.ts): what was ordered, then the plan default.
    const leads = Number(order?.lead_count ?? order?.criteria?.committed_leads) || 0;
    welcome = {
      first_name: first,
      ...(order?.amount_zar ? { paid_amount: zar(Number(order.amount_zar)) } : {}),
      ...(order?.paid_at ? { paid_on: sastDate(order.paid_at) } : {}),
      ...(order?.criteria?.plan_name ? { plan: String(order.criteria.plan_name) } : {}),
      ...(leads ? { leads: `${leads} Qualified Leads` } : {}),
      ...(agreements ? { has_agreement: "1" } : {}),
      // Outlook connect needs the Microsoft app (ms-oauth secrets); until then the email says we'll switch it on.
      ...(!Deno.env.get("MS_CLIENT_ID") ? { calendar_soon: "1" } : {}),
    };
  }

  // 4. Send. The template renders from user_metadata at send time; always clear it afterwards.
  let sendErr: { message: string; status?: number } | null = null;
  try {
    if (welcome) {
      const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: { welcome } });
      if (error) return reply(500, { error: `Couldn't prepare the email: ${error.message}` });
    }
    ({ error: sendErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${SITE}/broker/set-password` }));
  } finally {
    if (welcome) {
      const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: { welcome: null } });
      if (error) console.error("couldn't clear welcome metadata", userId, error.message);
    }
  }
  if (sendErr) {
    console.error("recovery email failed", sendErr.status, sendErr.message);
    return reply(502, { error: `The email couldn't be sent: ${sendErr.message}` });
  }
  console.log("password setup email sent", { broker_id: broker?.id ?? null, preview, welcome: !!welcome });
  if (!broker || preview) return reply(200, { sent: true, email, preview });

  // 5. Log it on the broker's timeline.
  const { data: activity } = await admin.from("broker_activities").insert({
    broker_id: broker.id,
    activity_type: "email",
    outcome: "n/a",
    body: `"Welcome to Lead Velocity: create your password" email sent to ${email}`,
    created_by: caller.id,
  }).select().single();

  return reply(200, { sent: true, email, activity });
});
