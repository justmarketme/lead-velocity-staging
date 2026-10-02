// automation/lib/w20-ms.mjs  -  W20 Microsoft Graph connect for the broker calendar (I-40c, GAPS G-06, 0.3 #4).
// Imported by the W20 Code nodes ("MS connect: ...", "MS callback: ...", "MS disconnect: ...") and by
// automation/tests/W20.test.mjs. Pure functions, Node 18+, zero dependencies besides security/lead-token.js.
//
//  GET  /ms/connect     broker JWT -> state = HMAC(broker_id, nonce, exp) -> 302 (or JSON {authorize_url}) to Microsoft
//  GET  /ms/callback    state check -> code exchange (client secret only in the n8n credential) -> refresh token ONLY
//                       through smc_vault_store_ms_refresh(), then smc_set_calendar_status(..., 'connected', detail);
//                       AADSTS admin-consent errors -> 'consent_pending' with admin_consent_url in detail (0.3 #4);
//                       anything else -> 'error'. A failed RE-connect never downgrades a working connection.
//  POST /ms/disconnect  broker JWT -> smc_set_calendar_status(..., 'disconnected')
//
// Scopes follow portal/spec/05 Part A: Calendars.ReadWrite, OnlineMeetings.ReadWrite, User.Read, offline_access.
// NO Mail.* for the broker: the consent copy promises "we never read your emails" and invites go from howzit@ (4.6).
// ASSUMPTION (not checked against Microsoft docs, no web research): the exact scope strings below, the v2.0
// authorize/token endpoint shape, the v1 /adminconsent URL shape, and the AADSTS codes in CONSENT_CODES.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');

export const LOGIN_HOST = 'https://login.microsoftonline.com';
export const GRAPH = 'https://graph.microsoft.com/';
export const SCOPES = ['openid', 'offline_access', 'User.Read', 'Calendars.ReadWrite', 'OnlineMeetings.ReadWrite'];
export const REQUIRED_SCOPES = ['Calendars.ReadWrite', 'OnlineMeetings.ReadWrite'];
export const STATE_TTL_SEC = 600;
export const STATE_VERSION = 'v1';
export const PORTAL_CALENDAR_PATH = '/broker/calendar';
// AADSTS65001 consent not granted · AADSTS90094 admin permission required · AADSTS90095 admin consent workflow
// (request sent to admin) · AADSTS900941 / AADSTS90099 tenant-level admin approval variants. ASSUMPTION.
export const CONSENT_CODES = ['AADSTS65001', 'AADSTS90094', 'AADSTS90095', 'AADSTS900941', 'AADSTS90099'];
export const USER_CANCEL_CODES = ['AADSTS65004'];
export const SECRET_CODES = ['AADSTS7000215', 'AADSTS7000222', 'AADSTS700016']; // bad / expired secret, unknown app
const MIN_SECRET_LEN = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function mac(secret, brokerId, nonce, exp) {
  return b64url(createHmac('sha256', secret).update(`ms-connect|${STATE_VERSION}|${brokerId}|${nonce}|${exp}`).digest());
}
function eq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }

/** state = v1.<broker_id>.<nonce>.<exp>.<HMAC>; binds the callback to the broker who started it, 10-min TTL. */
export function mintState({ brokerId, secret, nowMs = Date.now(), nonce = b64url(randomBytes(16)), ttlSec = STATE_TTL_SEC } = {}) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LEN) throw new Error('state secret missing (MS_OAUTH_STATE_SECRET or INTERNAL_HMAC_SECRET)');
  if (!UUID.test(String(brokerId || ''))) throw new Error('broker_id must be a uuid');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) throw new Error('nonce must be base64url, 16-64 chars');
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  return `${STATE_VERSION}.${brokerId.toLowerCase()}.${nonce}.${exp}.${mac(secret, brokerId.toLowerCase(), nonce, exp)}`;
}

export function verifyState(state, { secret, previousSecret, nowMs = Date.now() } = {}) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LEN) throw new Error('state secret missing (MS_OAUTH_STATE_SECRET or INTERNAL_HMAC_SECRET)');
  if (typeof state !== 'string' || !state || state.length > 300) return { ok: false, reason: 'missing' };
  const p = state.split('.');
  if (p.length !== 5 || p[0] !== STATE_VERSION) return { ok: false, reason: 'malformed' };
  const [, brokerId, nonce, expS, given] = p;
  if (!UUID.test(brokerId) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^\d{9,11}$/.test(expS)) return { ok: false, reason: 'malformed' };
  const exp = Number(expS);
  const secrets = [secret].concat(typeof previousSecret === 'string' && previousSecret.length >= MIN_SECRET_LEN ? [previousSecret] : []);
  let match = false;
  for (const s of secrets) if (eq(mac(s, brokerId, nonce, exp), given)) match = true; // no early exit
  if (!match) return { ok: false, reason: 'bad_signature' };
  const now = Math.floor(nowMs / 1000);
  if (exp <= now) return { ok: false, reason: 'expired' };
  if (exp - now > STATE_TTL_SEC + 60) return { ok: false, reason: 'exp_too_far' };
  return { ok: true, broker_id: brokerId, nonce, exp };
}

const tenantOf = (t) => (/^[A-Za-z0-9.-]{1,100}$/.test(String(t || '')) ? String(t) : 'organizations');

export function authorizeUrl({ clientId, redirectUri, state, tenant, scopes = SCOPES, loginHint } = {}) {
  if (!clientId || !redirectUri || !state) throw new Error('clientId, redirectUri and state are required');
  const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: scopes.join(' '), state, prompt: 'select_account' });
  if (loginHint) q.set('login_hint', String(loginHint));
  return `${LOGIN_HOST}/${tenantOf(tenant)}/oauth2/v2.0/authorize?${q.toString()}`;
}

/** Token request WITHOUT the client secret: the n8n credential adds client_secret to the form body. */
export function tokenRequest({ clientId, redirectUri, code, tenant, scopes = SCOPES } = {}) {
  if (!clientId || !redirectUri || !code) throw new Error('clientId, redirectUri and code are required');
  return {
    url: `${LOGIN_HOST}/${tenantOf(tenant)}/oauth2/v2.0/token`,
    form: { client_id: clientId, grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri, scope: scopes.join(' ') },
  };
}

/** The link the broker forwards to his IT admin (portal/spec/05 "Admin-consent fallback"). Tenant if known. */
export function adminConsentUrl({ clientId, redirectUri, tenant } = {}) {
  if (!clientId) return '';
  const q = new URLSearchParams({ client_id: clientId });
  if (redirectUri) q.set('redirect_uri', redirectUri);
  return `${LOGIN_HOST}/${tenant && tenantOf(tenant) !== 'organizations' ? tenantOf(tenant) : 'common'}/adminconsent?${q.toString()}`;
}

export function aadstsCodes(...texts) {
  const out = new Set();
  for (const t of texts) {
    if (Array.isArray(t)) { for (const c of t) out.add(`AADSTS${String(c).replace(/^AADSTS/, '')}`); continue; }
    for (const m of String(t || '').matchAll(/AADSTS\d{5,7}/g)) out.add(m[0]);
  }
  return [...out];
}

/** Classify a Microsoft error (authorize redirect query or token-endpoint JSON). */
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

function decodeJwtPayload(jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
}
/** Scopes as granted (token `scope` may use the https://graph.microsoft.com/ prefix). */
export function normaliseScopes(scope) {
  return [...new Set(String(scope || '').split(/\s+/).filter(Boolean).map((s) => (s.startsWith(GRAPH) ? s.slice(GRAPH.length) : s)))].sort();
}

/**
 * Decide what /ms/callback does. Inputs: state result, the callback query, the token-endpoint result (or null),
 * the broker's current calendar_status, config. Returns
 *   { action: 'store' | 'status' | 'none', status?, detail, refresh_token?, tenant_id?, scopes?, redirect, alert? }
 * The refresh token only ever appears on action 'store' and is never placed in detail or redirect.
 */
export function planCallback({ state, query = {}, token = null, currentStatus = null, cfg = {} } = {}) {
  const portal = String(cfg.portalUrl || '').replace(/\/+$/, '') + PORTAL_CALENDAR_PATH;
  const go = (params) => `${portal}?${new URLSearchParams(params).toString()}`;
  if (!state || !state.ok) return { action: 'none', detail: null, redirect: go({ error: 'calendar', reason: 'link_expired' }) };
  const wasOk = currentStatus === 'ok';
  const fail = (m) => {
    const detail = { reason: m.reason, codes: m.codes, at: new Date(cfg.nowMs ?? Date.now()).toISOString() };
    if (m.kind === 'consent') detail.admin_consent_url = adminConsentUrl({ clientId: cfg.clientId, redirectUri: cfg.adminConsentRedirectUri, tenant: cfg.tenantHint });
    const redirect = m.kind === 'consent' ? go({ error: 'admin_consent' }) : m.kind === 'cancelled' ? go({ calendar: 'cancelled' }) : go({ error: 'calendar', reason: m.reason });
    // A cancelled attempt changes nothing; a failed RE-connect never downgrades a broker whose calendar works.
    if (!m.status || wasOk) return { action: 'none', detail, redirect, alert: !!m.alert, kept_ok: wasOk && !!m.status };
    return { action: 'status', status: m.status, detail, redirect, alert: !!m.alert };
  };
  if (query.error) return fail(mapError(query));
  if (!query.code) return fail({ kind: 'other', status: 'error', reason: 'no_code', codes: [] });
  if (!token) return fail({ kind: 'other', status: 'error', reason: 'token_exchange_failed', codes: [] });
  const body = token.body && typeof token.body === 'object' ? token.body : token;
  const code = Number(token.statusCode || 200);
  if (code >= 400 || body.error) return fail(mapError(body));
  if (!body.refresh_token) return fail({ kind: 'other', status: 'error', reason: 'no_refresh_token', codes: [] });
  const scopes = normaliseScopes(body.scope);
  const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  if (missing.length) return fail({ kind: 'other', status: 'error', reason: 'scope_missing', codes: [], missing });
  const idt = decodeJwtPayload(body.id_token) || {}; // received directly from the token endpoint over TLS
  const tenant = /^[0-9a-f-]{36}$/i.test(String(idt.tid || '')) ? idt.tid : null;
  return {
    action: 'store', status: 'connected', refresh_token: body.refresh_token, tenant_id: tenant, scopes: scopes.join(' '),
    detail: { scopes, tenant_id: tenant, account: idt.preferred_username ? String(idt.preferred_username).slice(0, 200) : null, at: new Date(cfg.nowMs ?? Date.now()).toISOString() },
    redirect: go({ calendar: 'connected' }),
  };
}

/** Broker-authenticated entry (connect / disconnect): Supabase access token per automation/CONTRACTS.md. */
export function brokerCaller(headers = {}, { jwtSecret, nowMs = Date.now() } = {}) {
  const k = Object.keys(headers || {}).find((h) => h.toLowerCase() === 'authorization');
  const m = /^Bearer\s+(\S+)$/i.exec(String(k ? headers[k] : ''));
  if (!m) return { ok: false, status: 401, reason: 'missing' };
  const v = LT.verifySupabaseJwt(m[1], { secret: jwtSecret, nowMs });
  return v.ok ? { ok: true, user_id: v.user_id } : { ok: false, status: 401, reason: v.reason };
}

export function wantsJson(headers = {}, query = {}) {
  const k = Object.keys(headers || {}).find((h) => h.toLowerCase() === 'accept');
  return query.mode === 'json' || /application\/json/i.test(String(k ? headers[k] : ''));
}

/** /ms/connect after the broker row is loaded. */
export function planConnect({ broker, cfg = {}, json = false, nowMs = Date.now(), nonce } = {}) {
  if (!broker || !broker.broker_id) return { status: 403, body: { ok: false, error: 'not_a_broker' } };
  if (!cfg.clientId || !cfg.redirectUri) return { status: 503, body: { ok: false, error: 'not_configured' } };
  const state = mintState({ brokerId: broker.broker_id, secret: cfg.stateSecret, nowMs, ...(nonce ? { nonce } : {}) });
  const url = authorizeUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, tenant: broker.ms_tenant_id || cfg.tenant });
  return json ? { status: 200, body: { ok: true, authorize_url: url } } : { status: 302, location: url };
}

/** calendar.connected onto W20's own signed broker-event lane (verify slots -> step done -> messages). */
export function connectedEvent({ brokerId, tokenRef, secret, nowMs = Date.now() } = {}) {
  const raw = JSON.stringify({ event_id: `ms-connected:${brokerId}:${tokenRef}`, type: 'calendar.connected', broker_id: brokerId, occurred_at: new Date(nowMs).toISOString(), source: 'w20_ms_callback' });
  return { raw, signature: `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` };
}
