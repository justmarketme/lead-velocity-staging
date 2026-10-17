// ms-oauth: "Connect my Outlook calendar" for SortMyCover brokers. One Lead Velocity multi-tenant Entra app; the broker
// never registers anything. Authorization code + PKCE; delegated Calendars.ReadWrite, OnlineMeetings.ReadWrite,
// offline_access, User.Read. Logic: ./lib.mjs (tested in automation/tests/ms-oauth.test.mjs).
//
//   POST  {action:'start'}       broker JWT -> {ok, authorize_url}
//   GET   /callback?code&state   Microsoft redirect -> token exchange -> Vault -> 302 to {PORTAL_URL}/broker/calendar
//   POST  {action:'disconnect'}  broker JWT -> removes the stored token, status needs_reconnect
//
// Secrets (supabase secrets set ...): MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI, MS_OAUTH_STATE_SECRET,
// PORTAL_URL; optional MS_OAUTH_STATE_SECRET_PREVIOUS, N8N_PUBLIC_URL + INTERNAL_HMAC_SECRET (calendar step -> W20).
// The refresh token is written only through smc_vault_store_ms_refresh() (Supabase Vault). It is never returned to the
// browser, never put in a table column, and never logged.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminConsentUrl, authorizeUrl, connectedEvent, mintState, planCallback, publicPlan, tokenForm, tokenUrl, verifyState } from "./lib.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const redirect = (to: string) =>
  new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

const env = (k: string) => Deno.env.get(k) ?? "";
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

function config() {
  const c = {
    clientId: env("MS_CLIENT_ID"), clientSecret: env("MS_CLIENT_SECRET"), redirectUri: env("MS_REDIRECT_URI"),
    stateSecret: env("MS_OAUTH_STATE_SECRET"), previousStateSecret: env("MS_OAUTH_STATE_SECRET_PREVIOUS"),
    portalUrl: env("PORTAL_URL"),
  };
  return { ...c, ready: !!(c.clientId && c.clientSecret && c.redirectUri && c.stateSecret.length >= 32 && c.portalUrl) };
}

/** The signed-in SMC broker behind the Authorization header, or null. */
async function brokerFrom(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return { ok: false as const, status: 401, error: "unauthorised" };
  const db = admin();
  const { data: u, error } = await db.auth.getUser(m[1]);
  if (error || !u?.user) return { ok: false as const, status: 401, error: "unauthorised" };
  const { data: b } = await db.from("brokers").select("id, contact_person, ms_tenant_id, calendar_status").eq("user_id", u.user.id).not("brand_id", "is", null).maybeSingle();
  if (!b) return { ok: false as const, status: 403, error: "not_a_broker" };
  return { ok: true as const, db, broker: b, email: u.user.email as string | undefined };
}

async function start(req: Request) {
  const cfg = config();
  if (!cfg.ready) return json(503, { ok: false, error: "not_configured" });
  const who = await brokerFrom(req);
  if (!who.ok) return json(who.status, { ok: false, error: who.error });
  const state = mintState({ brokerId: who.broker.id, secret: cfg.stateSecret });
  const url = authorizeUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, secret: cfg.stateSecret, loginHint: who.email });
  return json(200, { ok: true, authorize_url: url, admin_consent_url: adminConsentUrl({ clientId: cfg.clientId, redirectUri: `${cfg.portalUrl.replace(/\/+$/, "")}/broker/calendar` }) });
}

async function disconnect(req: Request) {
  const who = await brokerFrom(req);
  if (!who.ok) return json(who.status, { ok: false, error: who.error });
  const { error } = await who.db.rpc("smc_ms_disconnect", { p_broker_id: who.broker.id });
  if (error) { console.error("ms-oauth disconnect failed:", error.code); return json(500, { ok: false, error: "disconnect_failed" }); }
  return json(200, { ok: true, calendar_status: "needs_reconnect" });
}

async function callback(url: URL) {
  const cfg = config();
  if (!cfg.ready) return json(503, { ok: false, error: "not_configured" });
  const q = Object.fromEntries(url.searchParams.entries());
  const state = (() => { try { return verifyState(q.state, { secret: cfg.stateSecret, previousSecret: cfg.previousStateSecret }); } catch { return { ok: false, reason: "no_secret" }; } })();
  const db = admin();
  const nowMs = Date.now();
  const brokerId = state.ok ? (state as { broker_id: string }).broker_id : null;

  let currentStatus: string | null = null;
  if (brokerId) {
    const { data } = await db.from("brokers").select("calendar_status").eq("id", brokerId).maybeSingle();
    currentStatus = data?.calendar_status ?? null;
  }

  let token: { statusCode: number; body: Record<string, unknown> } | null = null;
  if (state.ok && q.code && !q.error) {
    try {
      const res = await fetch(tokenUrl(), {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenForm({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri, code: q.code, state: q.state, secret: cfg.stateSecret }).toString(),
      });
      token = { statusCode: res.status, body: await res.json().catch(() => ({})) };
    } catch { token = null; }
  }

  const plan = planCallback({ state, query: q, token, currentStatus, cfg: { portalUrl: cfg.portalUrl, clientId: cfg.clientId, nowMs } });
  const out = redirect(plan.redirect);
  if (!brokerId || plan.action === "none") { if (plan.alert) console.error("ms-oauth: Microsoft rejected the app credentials", publicPlan(plan).detail?.codes); return out; }

  if (plan.action === "store") {
    const { data: ref, error } = await db.rpc("smc_vault_store_ms_refresh", {
      p_broker_id: brokerId, p_refresh_token: plan.refresh_token, p_tenant_id: plan.tenant_id, p_scopes: plan.scopes,
    });
    if (error) {
      console.error("ms-oauth vault store failed:", error.code);
      if (currentStatus !== "ok") await db.rpc("smc_set_calendar_status", { p_broker_id: brokerId, p_status: "error", p_detail: { reason: "vault_store_failed", at: new Date(nowMs).toISOString() } });
      return redirect(`${cfg.portalUrl.replace(/\/+$/, "")}/broker/calendar?error=calendar&reason=vault_store_failed`);
    }
    // "Connected as name@domain": status 'ok' again, now with the account in calendar_status_detail (no secret in it).
    await db.rpc("smc_set_calendar_status", { p_broker_id: brokerId, p_status: "connected", p_detail: plan.detail });
    // Calendar step: W20 verifies a real free slot, then marks the step done and sends the WhatsApp. Best effort.
    const n8n = env("N8N_PUBLIC_URL"), hmac = env("INTERNAL_HMAC_SECRET");
    if (n8n && hmac) {
      const e = connectedEvent({ brokerId, tokenRef: String(ref), secret: hmac, nowMs });
      try { await fetch(`${n8n.replace(/\/+$/, "")}/webhook/w20/broker-event`, { method: "POST", headers: { "Content-Type": "application/json", "X-LV-Signature": e.signature }, body: e.raw }); }
      catch { console.error("ms-oauth: W20 broker-event unreachable (calendar step will be picked up by the W20 sweep)"); }
    }
    return out;
  }

  // action 'status': consent_pending (admin approval needed, link stored for the portal) or error
  await db.rpc("smc_set_calendar_status", { p_broker_id: brokerId, p_status: plan.status, p_detail: plan.detail });
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/callback")) return await callback(url);
    if (req.method === "POST") {
      const { action } = await req.json().catch(() => ({ action: "" }));
      if (action === "start") return await start(req);
      if (action === "disconnect") return await disconnect(req);
    }
    return json(404, { ok: false, error: "not_found" });
  } catch (e) {
    console.error("ms-oauth error:", (e as Error).message);
    return json(500, { ok: false, error: "server_error" });
  }
});
