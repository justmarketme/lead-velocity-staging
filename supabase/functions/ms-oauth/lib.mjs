// supabase/functions/ms-oauth/lib.mjs - pure logic for "Connect my Outlook calendar" (authorization code + PKCE).
// Imported by index.ts (Deno, node: builtins) and by automation/tests/ms-oauth.test.mjs (Node). No network, no database.
//
// Flow: portal -> POST ms-oauth {action:'start'} (broker JWT) -> authorize_url -> Microsoft sign-in + Accept ->
//       GET ms-oauth/callback?code&state -> token exchange (client secret lives only in the function secrets) ->
//       refresh token ONLY through smc_vault_store_ms_refresh() (Supabase Vault) -> 302 back to /broker/calendar.
// This is the same vault + status contract W20 uses (migration 20261002_smc_13), so W04/W05 read the token unchanged
// (smc_vault_ms_refresh while calendar_status = 'ok').
//
// PKCE without a table: code_verifier = HMAC(MS_OAUTH_STATE_SECRET, 'ms-pkce|' + nonce). The nonce travels in the signed
// state; the verifier itself never leaves the server, so an intercepted code is useless without the secret.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const LOGIN_HOST = 'https://login.microsoftonline.com';
export const GRAPH = 'https://graph.microsoft.com/';
// Delegated only. No Mail.* (the consent copy promises "we never read your emails").
export const SCOPES = ['openid', 'offline_access', 'User.Read', 'Calendars.ReadWrite', 'OnlineMeetings.ReadWrite'];
export const REQUIRED_SCOPES = ['Calendars.ReadWrite', 'OnlineMeetings.ReadWrite'];
export const STATE_TTL_SEC = 600;
export const STATE_VERSION = 'v2'; // v1 is W20's n8n state; the two can never validate each other
export const PORTAL_CALENDAR_PATH = '/broker/calendar';
export const TENANT = 'organizations'; // any work/school tenant (multi-tenant app); a personal account has no Teams/OnlineMeetings

// Parity with automation/lib/w20-ms.mjs (a test asserts the two classify identically).
export const CONSENT_CODES = ['AADSTS65001', 'AADSTS90094', 'AADSTS90095', 'AADSTS900941', 'AADSTS90099'];
export const USER_CANCEL_CODES = ['AADSTS65004'];
export const SECRET_CODES = ['AADSTS7000215', 'AADSTS7000222', 'AADSTS700016'];

const MIN_SECRET_LEN = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

function needSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LEN) throw new Error('MS_OAUTH_STATE_SECRET missing or shorter than 32 chars');
}
const mac = (secret, brokerId, nonce, exp) => b64url(createHmac('sha256', secret).update(`ms-oauth|${STATE_VERSION}|${brokerId}|${nonce}|${exp}`).digest());

/** state = v2.<broker_id>.<nonce>.<exp>.<HMAC>: binds the callback to the broker who started it, 10-minute TTL. */
export function mintState({ brokerId, secret, nowMs = Date.now(), nonce = b64url(randomBytes(16)), ttlSec = STATE_TTL_SEC } = {}) {
  needSecret(secret);
  if (!UUID.test(String(brokerId || ''))) throw new Error('broker_id must be a uuid');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) throw new Error('nonce must be base64url, 16-64 chars');
  const id = brokerId.toLowerCase();
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  return `${STATE_VERSION}.${id}.${nonce}.${exp}.${mac(secret, id, nonce, exp)}`;
}

export function verifyState(state, { secret, previousSecret, nowMs = Date.now() } = {}) {
  needSecret(secret);
  if (typeof state !== 'string' || !state || state.length > 300) return { ok: false, reason: 'missing' };
  const p = state.split('.');
  if (p.length !== 5 || p[0] !== STATE_VERSION) return { ok: false, reason: 'malformed' };
  const [, brokerId, nonce, expS, given] = p;
  if (!UUID.test(brokerId) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^\d{9,11}$/.test(expS)) return { ok: false, reason: 'malformed' };
  const exp = Number(expS);
  const secrets = [secret].concat(typeof previousSecret === 'string' && previousSecret.length >= MIN_SECRET_LEN ? [previousSecret] : []);
  let usedSecret = null;
  for (const s of secrets) if (eq(mac(s, brokerId, nonce, exp), given) && !usedSecret) usedSecret = s; // no early exit
  if (!usedSecret) return { ok: false, reason: 'bad_signature' };
  const now = Math.floor(nowMs / 1000);
  if (exp <= now) return { ok: false, reason: 'expired' };
  if (exp - now > STATE_TTL_SEC + 60) return { ok: false, reason: 'exp_too_far' };
  return { ok: true, broker_id: brokerId, nonce, exp, secret: usedSecret };
}

/** PKCE verifier derived from the server secret + the state nonce (43 chars, RFC 7636 charset). */
export function deriveVerifier(secret, nonce) {
  needSecret(secret);
  return b64url(createHmac('sha256', secret).update(`ms-pkce|${nonce}`).digest());
}
export const codeChallenge = (verifier) => b64url(createHash('sha256').update(verifier).digest());

/** Authorize URL. `state` must come from mintState; the challenge is derived from the same nonce. */
export function authorizeUrl({ clientId, redirectUri, state, secret, loginHint, scopes = SCOPES, nowMs = Date.now() } = {}) {
  if (!clientId || !redirectUri || !state) throw new Error('clientId, redirectUri and state are required');
  const v = verifyState(state, { secret, nowMs });
  if (!v.ok) throw new Error(`cannot build authorize url: state ${v.reason}`);
  const q = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query',
    scope: scopes.join(' '), state, prompt: 'select_account',
    code_challenge: codeChallenge(deriveVerifier(secret, v.nonce)), code_challenge_method: 'S256',
  });
  if (loginHint) q.set('login_hint', String(loginHint));
  return `${LOGIN_HOST}/${TENANT}/oauth2/v2.0/authorize?${q.toString()}`;
}

export const tokenUrl = () => `${LOGIN_HOST}/${TENANT}/oauth2/v2.0/token`;

/** Form body for the code exchange (includes the client secret: only ever built inside the edge function). */
export function tokenForm({ clientId, clientSecret, redirectUri, code, state, secret, nowMs = Date.now() } = {}) {
  if (!clientId || !clientSecret || !redirectUri || !code) throw new Error('clientId, clientSecret, redirectUri and code are required');
  const v = verifyState(state, { secret, nowMs });
  if (!v.ok) throw new Error(`state ${v.reason}`);
  return new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: String(code),
    redirect_uri: redirectUri, scope: SCOPES.join(' '), code_verifier: deriveVerifier(v.secret, v.nonce),
  });
}

/** The link the broker forwards to his IT admin. Static (/.default) = the permissions set on the app registration. */
export function adminConsentUrl({ clientId, redirectUri, tenant } = {}) {
  if (!clientId) return '';
  const t = tenant && /^[A-Za-z0-9.-]{1,100}$/.test(tenant) ? tenant : TENANT;
  const q = new URLSearchParams({ client_id: clientId, scope: `${GRAPH}.default` });
  if (redirectUri) q.set('redirect_uri', redirectUri);
  return `${LOGIN_HOST}/${t}/v2.0/adminconsent?${q.toString()}`;
}

export function aadstsCodes(...texts) {
  const out = new Set();
  for (const t of texts) {
    if (Array.isArray(t)) { for (const c of t) out.add(`AADSTS${String(c).replace(/^AADSTS/, '')}`); continue; }
    for (const m of String(t || '').matchAll(/AADSTS\d{5,7}/g)) out.add(m[0]);
  }
  return [...out];
}

/** Classify a Microsoft error (authorize redirect query or token-endpoint JSON). Same table as w20-ms.mjs mapError. */
export function mapError({ error, error_description, error_codes } = {}) {
  const codes = aadstsCodes(error_description, error_codes);
  const has = (list) => codes.some((c) => list.includes(c));
  const e = String(error || '');
  if (has(CONSENT_CODES) || e === 'consent_required' || /admin (approval|consent|permission)/i.test(String(error_description || ''))) {
    return { kind: 'consent', status: 'consent_pending', reason: 'admin_consent_required', codes };
  }
  if (has(USER_CANCEL_CODES) || (e === 'access_denied' && !codes.length)) return { kind: 'cancelled', status: null, reason: 'user_cancelled', codes };
  if (has(SECRET_CODES) || e === 'invalid_client' || e === 'unauthorized_client') return { kind: 'app', status: 'error', reason: 'app_credentials', codes, alert: true };
  if (e === 'invalid_grant') return { kind: 'grant', status: 'error', reason: 'code_expired_or_used', codes };
  return { kind: 'other', status: 'error', reason: e || 'unknown', codes };
}

export function normaliseScopes(scope) {
  return [...new Set(String(scope || '').split(/\s+/).filter(Boolean).map((s) => (s.startsWith(GRAPH) ? s.slice(GRAPH.length) : s)))].sort();
}

function decodeJwtPayload(jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
}

const SECRET_FIELD = 'refresh_' + 'token';

/**
 * Decide what the callback does. Pure.
 *   state        verifyState() result            query     the callback's query params
 *   token        { statusCode, body } from the token endpoint, or null if it was never called
 *   currentStatus  brokers.calendar_status now ('ok' | 'needs_reconnect' | 'blocked_admin_consent' | null)
 *   cfg          { portalUrl, clientId, nowMs }
 * Returns { action: 'store' | 'status' | 'none', status?, detail, redirect, refresh_token?, tenant_id?, scopes?, account?, alert? }.
 * The refresh token appears ONLY on action 'store'; it is never in detail or redirect.
 */
export function planCallback({ state, query = {}, token = null, currentStatus = null, cfg = {} } = {}) {
  const portal = String(cfg.portalUrl || '').replace(/\/+$/, '') + PORTAL_CALENDAR_PATH;
  const go = (params) => `${portal}?${new URLSearchParams(params).toString()}`;
  const at = new Date(cfg.nowMs ?? Date.now()).toISOString();
  if (!state || !state.ok) return { action: 'none', detail: null, redirect: go({ error: 'calendar', reason: 'link_expired' }) };
  const fail = (m) => {
    const detail = { reason: m.reason, codes: m.codes || [], at };
    if (m.kind === 'consent') detail.admin_consent_url = adminConsentUrl({ clientId: cfg.clientId, redirectUri: String(cfg.portalUrl || '').replace(/\/+$/, '') + PORTAL_CALENDAR_PATH });
    const redirect = m.kind === 'consent' ? go({ error: 'admin_consent' }) : m.kind === 'cancelled' ? go({ calendar: 'cancelled' }) : go({ error: 'calendar', reason: m.reason });
    const wasOk = currentStatus === 'ok';
    // A cancelled attempt changes nothing; a failed RE-connect never downgrades a broker whose calendar works.
    if (!m.status || wasOk) return { action: 'none', detail, redirect, alert: !!m.alert, kept_ok: wasOk && !!m.status };
    return { action: 'status', status: m.status, detail, redirect, alert: !!m.alert };
  };
  if (query.error) return fail(mapError(query));
  if (!query.code) return fail({ kind: 'other', status: 'error', reason: 'no_code', codes: [] });
  if (!token) return fail({ kind: 'other', status: 'error', reason: 'token_exchange_failed', codes: [] });
  const body = token.body && typeof token.body === 'object' ? token.body : {};
  if (Number(token.statusCode || 200) >= 400 || body.error) return fail(mapError(body));
  if (!body[SECRET_FIELD]) return fail({ kind: 'other', status: 'error', reason: 'no_refresh_token', codes: [] });
  const scopes = normaliseScopes(body.scope);
  const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  if (missing.length) return fail({ kind: 'other', status: 'error', reason: 'scope_missing', codes: [] });
  const idt = decodeJwtPayload(body.id_token) || {}; // straight from the token endpoint over TLS; used for display only
  const tenant = /^[0-9a-f-]{36}$/i.test(String(idt.tid || '')) ? idt.tid : null;
  const account = String(idt.preferred_username || idt.email || '').slice(0, 200) || null;
  return {
    action: 'store', status: 'connected', [SECRET_FIELD]: body[SECRET_FIELD], tenant_id: tenant, scopes: scopes.join(' '), account,
    detail: { account, name: idt.name ? String(idt.name).slice(0, 120) : null, tenant_id: tenant, scopes, at },
    redirect: go({ calendar: 'connected' }),
  };
}

/** The plan with the token removed: what may be logged. */
export function publicPlan(plan = {}) {
  const out = { ...plan };
  delete out[SECRET_FIELD];
  return out;
}

/** Signed calendar.connected for W20's broker-event lane: W20 verifies a real free slot, then marks the calendar step done. */
export function connectedEvent({ brokerId, tokenRef, secret, nowMs = Date.now() } = {}) {
  const raw = JSON.stringify({ event_id: `ms-connected:${brokerId}:${tokenRef}`, type: 'calendar.connected', broker_id: brokerId, occurred_at: new Date(nowMs).toISOString(), source: 'ms_oauth_edge' });
  return { raw, signature: `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` };
}
