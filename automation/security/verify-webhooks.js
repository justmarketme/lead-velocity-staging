'use strict';
/**
 * verify-webhooks.js — inbound webhook verification for the SortMyCover build.
 * Node 18+, zero dependencies (node:crypto only). CommonJS so it can be inlined into an
 * n8n Code node (see inline-for-n8n.mjs and n8n-webhook-pattern.md).
 *
 * Source of each rule (devops-security's five): Meta / WhatsApp webhook security docs
 * (X-Hub-Signature-256 + hub.verify_token handshake), OWASP ASVS L1 (timing-safe compare,
 * reject before parse, log the reason not the payload). Paystack and Twilio signatures follow
 * their providers' published schemes (HMAC-SHA512 hex; HMAC-SHA1 base64 over URL + sorted params).
 *
 * Every verifier takes the RAW request body (Buffer or string). A parsed-then-re-serialised
 * body will not match the provider's signature, so objects are rejected with 'raw_body_required'.
 * Every verifier returns { ok: boolean, reason: string } and never throws on bad input.
 * Secrets are passed in by the caller (from .env / n8n credentials); nothing here reads env.
 */
const crypto = require('crypto');

const OK = Object.freeze({ ok: true, reason: 'ok' });
const fail = (reason) => ({ ok: false, reason });

/** Constant-time string compare. Hashing both sides first removes the length side channel. */
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

function toRawBuffer(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);
  return null;
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === want) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function hmac(alg, secret, data, enc) {
  return crypto.createHmac(alg, secret).update(data).digest(enc);
}

/* ------------------------------------------------------------------ Meta / WhatsApp */

/**
 * Meta webhooks (WhatsApp Cloud API, Lead Ads `page` object, Page feed, Instagram, Flow endpoint):
 * header `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(rawBody, META_APP_SECRET)>`.
 */
function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return fail('missing_secret');
  const raw = toRawBuffer(rawBody);
  if (!raw) return fail('raw_body_required');
  if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) {
    return fail('missing_or_malformed_signature');
  }
  const got = signatureHeader.slice('sha256='.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return fail('missing_or_malformed_signature');
  const want = hmac('sha256', appSecret, raw, 'hex');
  return timingSafeEqualStr(got, want) ? OK : fail('signature_mismatch');
}

/**
 * GET subscription handshake: Meta calls ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
 * Returns the HTTP response to send: 200 + challenge (plain text) or 403.
 * Accepts n8n's parsed query (keys 'hub.mode' etc.) or a { hub: { mode, … } } nested shape.
 */
function metaVerifyHandshake(query, verifyToken) {
  const q = query || {};
  const pick = (k) => (q['hub.' + k] !== undefined ? q['hub.' + k] : q.hub && q.hub[k]);
  const mode = pick('mode');
  const token = pick('verify_token');
  const challenge = pick('challenge');
  if (!verifyToken) return { ok: false, reason: 'missing_secret', status: 403, body: 'Forbidden' };
  if (mode !== 'subscribe') return { ok: false, reason: 'bad_mode', status: 403, body: 'Forbidden' };
  if (typeof token !== 'string' || !timingSafeEqualStr(token, verifyToken)) {
    return { ok: false, reason: 'verify_token_mismatch', status: 403, body: 'Forbidden' };
  }
  if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(challenge)) {
    return { ok: false, reason: 'bad_challenge', status: 400, body: 'Bad Request' };
  }
  return { ok: true, reason: 'ok', status: 200, body: challenge };
}

/* ------------------------------------------------------------------ Paystack */

/** Paystack: header `x-paystack-signature` = hex HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY). */
function verifyPaystackSignature(rawBody, signatureHeader, secretKey) {
  if (!secretKey) return fail('missing_secret');
  const raw = toRawBuffer(rawBody);
  if (!raw) return fail('raw_body_required');
  if (typeof signatureHeader !== 'string') return fail('missing_or_malformed_signature');
  const got = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(got)) return fail('missing_or_malformed_signature');
  const want = hmac('sha512', secretKey, raw, 'hex');
  return timingSafeEqualStr(got, want) ? OK : fail('signature_mismatch');
}

/* ------------------------------------------------------------------ Twilio */

function twilioUrlVariants(url) {
  // Twilio may sign with or without the default port; accept both (as Twilio's own helpers do).
  const out = new Set([url]);
  try {
    const u = new URL(url);
    const def = u.protocol === 'https:' ? '443' : '80';
    if (u.port) {
      if (u.port === def) { const v = new URL(url); v.port = ''; out.add(v.toString()); }
    } else {
      out.add(url.replace(/^(https?:\/\/[^/?#]+)/, `$1:${def}`));
    }
  } catch (_) { /* malformed URL -> only the literal is tried */ }
  return [...out];
}

function twilioSignedString(url, params) {
  let s = url;
  if (params && typeof params === 'object') {
    for (const key of Object.keys(params).sort()) {
      const v = params[key];
      if (Array.isArray(v)) for (const item of [...v].map(String).sort()) s += key + item;
      else s += key + (v === undefined || v === null ? '' : String(v));
    }
  }
  return s;
}

/**
 * Twilio: header `X-Twilio-Signature` = base64 HMAC-SHA1(url + sorted(key+value), TWILIO_AUTH_TOKEN).
 * - Form-encoded callbacks: pass `params` = the parsed POST fields.
 * - JSON-body callbacks: Twilio adds `bodySHA256` to the URL query; pass `rawBody` and the
 *   signature covers the URL only, while bodySHA256 must equal hex SHA-256 of the raw body.
 * NB: Twilio signs with the account Auth Token, not an API key secret.
 */
function verifyTwilioSignature({ url, params, rawBody, signatureHeader, authToken } = {}) {
  if (!authToken) return fail('missing_secret');
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return fail('bad_url');
  if (typeof signatureHeader !== 'string' || signatureHeader.length < 20) {
    return fail('missing_or_malformed_signature');
  }
  let bodyHash = null;
  try { bodyHash = new URL(url).searchParams.get('bodySHA256'); } catch (_) { /* handled above */ }
  if (bodyHash) {
    const raw = toRawBuffer(rawBody);
    if (!raw) return fail('raw_body_required');
    const want = crypto.createHash('sha256').update(raw).digest('hex');
    if (!timingSafeEqualStr(bodyHash.toLowerCase(), want)) return fail('body_hash_mismatch');
  }
  for (const u of twilioUrlVariants(url)) {
    const expected = hmac('sha1', authToken, Buffer.from(twilioSignedString(u, bodyHash ? null : params), 'utf8'), 'base64');
    if (timingSafeEqualStr(signatureHeader.trim(), expected)) return OK;
  }
  return fail('signature_mismatch');
}

/* ------------------------------------------------------------------ Replay window + idempotency */

/**
 * Generic replay window. `timestamp` may be epoch seconds, epoch ms, or an ISO string.
 * Default tolerance 300 s in the past, 60 s clock skew into the future.
 * Use where the provider sends a timestamp (WhatsApp message `timestamp`, entry `time`,
 * our own X-LV-Timestamp on internal calls). Paystack/Twilio carry none: idempotency is the guard.
 */
function checkReplayWindow(timestamp, { nowMs = Date.now(), toleranceSec = 300, futureSkewSec = 60 } = {}) {
  let ms;
  if (typeof timestamp === 'number' || (typeof timestamp === 'string' && /^\d+$/.test(timestamp))) {
    const n = Number(timestamp);
    ms = n < 1e12 ? n * 1000 : n;
  } else if (typeof timestamp === 'string') {
    ms = Date.parse(timestamp);
  }
  if (!Number.isFinite(ms)) return fail('bad_timestamp');
  if (ms > nowMs + futureSkewSec * 1000) return fail('timestamp_in_future');
  if (nowMs - ms > toleranceSec * 1000) return fail('outside_replay_window');
  return OK;
}

/** Stable key for webhook_events(source, external_id) — unique per provider event. */
function idempotencyKey(source, externalId) {
  if (!source || externalId === undefined || externalId === null || externalId === '') return null;
  return `${String(source).toLowerCase()}:${String(externalId)}`;
}

/**
 * Pull the provider's own event ids out of a parsed payload, so a redelivery maps to the same key.
 * Falls back to a SHA-256 of the raw body when the provider gives no id.
 */
function extractEventIds(source, payload, rawBody) {
  const ids = [];
  const p = payload || {};
  if (source === 'meta' || source === 'whatsapp') {
    for (const entry of p.entry || []) {
      for (const ch of entry.changes || []) {
        const v = ch.value || {};
        for (const m of v.messages || []) if (m.id) ids.push(`msg:${m.id}`);
        for (const s of v.statuses || []) if (s.id) ids.push(`status:${s.id}:${s.status || ''}`);
        if (v.leadgen_id) ids.push(`leadgen:${v.leadgen_id}`);
        if (v.comment_id) ids.push(`comment:${v.comment_id}:${v.verb || ''}`);
        if (ch.field && !v.messages && !v.statuses && !v.leadgen_id && !v.comment_id && v.id) {
          ids.push(`${ch.field}:${v.id}`);
        }
      }
      for (const m of entry.messaging || []) if (m.message && m.message.mid) ids.push(`mid:${m.message.mid}`);
    }
  } else if (source === 'paystack') {
    const d = p.data || {};
    const ref = d.id || d.reference || d.subscription_code || d.invoice_code;
    if (p.event && ref) ids.push(`${p.event}:${ref}`);
  } else if (source === 'twilio') {
    const sid = p.MessageSid || p.CallSid || p.Sid;
    const status = p.MessageStatus || p.CallStatus || '';
    if (sid) ids.push(`${sid}:${status}`);
  }
  if (ids.length === 0) {
    const raw = toRawBuffer(rawBody);
    if (raw) ids.push('sha256:' + crypto.createHash('sha256').update(raw).digest('hex'));
  }
  return ids;
}

/**
 * In-memory idempotency store (tests, and n8n `$getWorkflowStaticData('global')` as a cache).
 * Production truth is Postgres: INSERT INTO webhook_events (source, external_id, …)
 * ON CONFLICT (source, external_id) DO NOTHING RETURNING id  — no row returned = duplicate.
 * `backing` lets the n8n Code node pass its static-data object so state survives executions.
 */
function createIdempotencyStore({ ttlMs = 72 * 3600 * 1000, backing = {}, now = () => Date.now() } = {}) {
  const map = backing;
  return {
    /** true if the key was already seen inside the TTL; records it otherwise. */
    seen(key) {
      const t = now();
      for (const k of Object.keys(map)) if (t - map[k] > ttlMs) delete map[k];
      if (Object.prototype.hasOwnProperty.call(map, key)) return true;
      map[key] = t;
      return false;
    },
    size() { return Object.keys(map).length; },
  };
}

/** SQL used by the n8n Postgres node after verification (parameterised; never string-built). */
const WEBHOOK_EVENTS_INSERT_SQL =
  'INSERT INTO webhook_events (source, external_id, received_at, signature_ok, payload_hash) ' +
  'VALUES ($1, $2, now(), $3, $4) ON CONFLICT (source, external_id) DO NOTHING RETURNING id';

function payloadHash(rawBody) {
  const raw = toRawBuffer(rawBody);
  return raw ? crypto.createHash('sha256').update(raw).digest('hex') : null;
}

module.exports = {
  timingSafeEqualStr,
  headerValue,
  verifyMetaSignature,
  metaVerifyHandshake,
  verifyPaystackSignature,
  verifyTwilioSignature,
  twilioSignedString,
  checkReplayWindow,
  idempotencyKey,
  extractEventIds,
  createIdempotencyStore,
  payloadHash,
  WEBHOOK_EVENTS_INSERT_SQL,
};
