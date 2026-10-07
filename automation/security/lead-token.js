'use strict';
// lead_token (I-29) + caller resolution for GET /slots (I-30a). Contract: automation/CONTRACTS.md "lead_token".
// Zero dependencies (node:crypto only). CommonJS like verify-webhooks.js so inline-for-n8n.mjs can inline it
// into an n8n Code node (needs NODE_FUNCTION_ALLOW_BUILTIN=crypto). Secrets are passed in by the caller from
// $env.LEAD_TOKEN_SECRET / $env.LEAD_TOKEN_SECRET_PREVIOUS / $env.SUPABASE_JWT_SECRET; nothing is read here.
//
// Token:  lt1.<lead_id>.<exp>.<sig>
//   lead_id  the leads.id as stored (uuid in production; [A-Za-z0-9_-]{1,64})
//   exp      unix seconds, mint time + 14 days
//   sig      base64url( HMAC-SHA256( secret, `${lead_id}|${exp}` ) )
// Stateless: nothing is stored. Revocation = the lead row check the endpoint does after verify
// (row exists, opted_out_at is null, not erased). Rotation: verify accepts LEAD_TOKEN_SECRET_PREVIOUS too.

const crypto = require('crypto');

const VERSION = 'lt1';
const TTL_SECONDS = 14 * 24 * 3600;
const LEAD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TOKEN_LEN = 256;
const MIN_SECRET_LEN = 32;
const HEADER = 'x-lead-token';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(secret, leadId, exp) {
  return crypto.createHmac('sha256', secret).update(`${leadId}|${exp}`).digest();
}

function safeEqual(a, b) {
  // constant-time for equal lengths; a length mismatch still burns one compare so timing does not leak which part failed
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) { crypto.timingSafeEqual(a, a); return false; }
  return crypto.timingSafeEqual(a, b);
}

function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LEN) throw new Error('LEAD_TOKEN_SECRET missing or shorter than 32 chars');
}

/** Mint at lead insert (W01/W02/W03). Returns { token, exp, expires_at }. */
function mintLeadToken(leadId, { secret, nowMs = Date.now(), ttlSeconds = TTL_SECONDS } = {}) {
  assertSecret(secret);
  if (!LEAD_ID_RE.test(String(leadId || ''))) throw new Error('lead_id not token-safe');
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const token = `${VERSION}.${leadId}.${exp}.${b64url(sign(secret, leadId, exp))}`;
  return { token, exp, expires_at: new Date(exp * 1000).toISOString() };
}

/** Verify. Returns { ok:true, lead_id, exp } or { ok:false, reason } (reason is logged, never returned to the browser). */
function verifyLeadToken(token, { secret, previousSecret, nowMs = Date.now() } = {}) {
  assertSecret(secret);
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LEN) return { ok: false, reason: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' };
  const [, leadId, expStr, sigStr] = parts;
  if (!LEAD_ID_RE.test(leadId) || !/^\d{1,12}$/.test(expStr) || !/^[A-Za-z0-9_-]{43}$/.test(sigStr)) return { ok: false, reason: 'malformed' };
  const exp = Number(expStr);
  const given = fromB64url(sigStr);
  const secrets = [secret].concat(typeof previousSecret === 'string' && previousSecret.length >= MIN_SECRET_LEN ? [previousSecret] : []);
  let match = false;
  for (const s of secrets) if (safeEqual(sign(s, leadId, exp), given)) match = true; // no early exit
  if (!match) return { ok: false, reason: 'bad_signature' };
  if (exp * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  if (exp - Math.floor(nowMs / 1000) > TTL_SECONDS + 300) return { ok: false, reason: 'exp_too_far' }; // never longer than the TTL
  return { ok: true, lead_id: leadId, exp };
}

// ---------- broker-authenticated path (I-30a): Supabase access token, HS256 ----------
// ASSUMPTION: the project signs access tokens with the legacy shared secret (HS256, SUPABASE_JWT_SECRET).
// If the live project uses asymmetric signing keys, swap this for a JWKS verify; the caller contract is unchanged.
function verifySupabaseJwt(jwt, { secret, nowMs = Date.now(), leewaySec = 30 } = {}) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LEN) throw new Error('SUPABASE_JWT_SECRET missing');
  if (typeof jwt !== 'string' || jwt.length > 4096) return { ok: false, reason: 'missing' };
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  let header, claims;
  try {
    header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  } catch { return { ok: false, reason: 'malformed' }; }
  if (!header || header.alg !== 'HS256') return { ok: false, reason: 'alg' }; // blocks alg=none and key-confusion
  const expect = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  if (!safeEqual(expect, fromB64url(parts[2]))) return { ok: false, reason: 'bad_signature' };
  const now = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + leewaySec <= now) return { ok: false, reason: 'expired' };
  if (typeof claims.nbf === 'number' && claims.nbf - leewaySec > now) return { ok: false, reason: 'not_yet_valid' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes('authenticated') || claims.role !== 'authenticated') return { ok: false, reason: 'role' };
  if (!/^[0-9a-f-]{36}$/i.test(String(claims.sub || ''))) return { ok: false, reason: 'sub' };
  return { ok: true, user_id: claims.sub, exp: claims.exp };
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name);
  const v = k === undefined ? undefined : headers[k];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Decide who is calling GET /slots. Broker ids in the query are NEVER read (I-29): the lead path takes the broker
 * from leads.broker_id, the broker path from brokers.user_id = jwt.sub. Returns
 *   { ok:true, mode:'lead',   lead_id, limit, date }      -> SELECT broker_id FROM leads WHERE id = lead_id
 *   { ok:true, mode:'broker', user_id, limit }            -> SELECT * FROM brokers WHERE user_id = user_id
 *   { ok:false, status, reason }
 */
function resolveSlotsCaller({ headers = {}, query = {} } = {}, { leadSecret, leadPreviousSecret, jwtSecret, nowMs = Date.now() } = {}) {
  const auth = headerValue(headers, 'authorization');
  const lt = headerValue(headers, HEADER);
  if (auth && lt) return { ok: false, status: 400, reason: 'ambiguous_caller' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || '')) ? query.date : null;
  if (auth) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(auth));
    if (!m) return { ok: false, status: 401, reason: 'malformed' };
    const v = verifySupabaseJwt(m[1], { secret: jwtSecret, nowMs });
    if (!v.ok) return { ok: false, status: 401, reason: v.reason };
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 1, 1), 3); // portal "next free slot": 1 by default, 3 max
    return { ok: true, mode: 'broker', user_id: v.user_id, limit };
  }
  if (lt) {
    const v = verifyLeadToken(String(lt), { secret: leadSecret, previousSecret: leadPreviousSecret, nowMs });
    if (!v.ok) return { ok: false, status: 401, reason: v.reason };
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 3, 1), 20);
    return { ok: true, mode: 'lead', lead_id: v.lead_id, limit, date };
  }
  return { ok: false, status: 401, reason: 'no_credentials' };
}


// ---------- flow_token (W28): same HMAC scheme, so no flow_tokens table is needed ----------
// ft1.<lead_id>.<kind>.<booking_id|->.<exp>.<sig>, sig = HMAC-SHA256(secret, `ft1|lead_id|kind|booking_id|exp`)
// Minted by W06/W10 when they send the Flow template; the W28 endpoint trusts only this mapping (never payload ids).
const FLOW_KINDS = new Set(['book', 'reschedule', 'capture']); // capture = capture Flow v2 (ctwa/capture-v2.js); W28 rejects it
function mintFlowToken(leadId, kind, bookingId, { secret, nowMs = Date.now(), ttlSeconds = TTL_SECONDS } = {}) {
  assertSecret(secret);
  if (!LEAD_ID_RE.test(String(leadId || '')) || !FLOW_KINDS.has(kind)) throw new Error('bad flow token input');
  const b = bookingId ? String(bookingId) : '-';
  if (b !== '-' && !LEAD_ID_RE.test(b)) throw new Error('booking_id not token-safe');
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const sig = b64url(crypto.createHmac('sha256', secret).update(`ft1|${leadId}|${kind}|${b}|${exp}`).digest());
  return `ft1.${leadId}.${kind}.${b}.${exp}.${sig}`;
}
function verifyFlowToken(token, { secret, previousSecret, nowMs = Date.now() } = {}) {
  assertSecret(secret);
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LEN) return { ok: false, reason: 'missing' };
  const p = token.split('.');
  if (p.length !== 6 || p[0] !== 'ft1' || !LEAD_ID_RE.test(p[1]) || !FLOW_KINDS.has(p[2]) || !(p[3] === '-' || LEAD_ID_RE.test(p[3])) || !/^\d{1,12}$/.test(p[4]) || !/^[A-Za-z0-9_-]{43}$/.test(p[5])) return { ok: false, reason: 'malformed' };
  const given = fromB64url(p[5]);
  let match = false;
  for (const s of [secret].concat(previousSecret && previousSecret.length >= MIN_SECRET_LEN ? [previousSecret] : [])) {
    if (safeEqual(crypto.createHmac('sha256', s).update(`ft1|${p[1]}|${p[2]}|${p[3]}|${p[4]}`).digest(), given)) match = true;
  }
  if (!match) return { ok: false, reason: 'bad_signature' };
  if (Number(p[4]) * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, lead_id: p[1], kind: p[2], booking_id: p[3] === '-' ? null : p[3], exp: Number(p[4]) };
}

module.exports = { mintFlowToken, verifyFlowToken, VERSION, TTL_SECONDS, HEADER, mintLeadToken, verifyLeadToken, verifySupabaseJwt, resolveSlotsCaller, safeEqual };
