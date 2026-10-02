'use strict';
/* Meta Conversions API helper. Node 18+, deps: crypto + global fetch only.
 * Works in an n8n Code node (NODE_FUNCTION_ALLOW_BUILTIN=crypto) or as a tiny service.
 * Nothing here is sent unless a caller invokes it with a real pixelId/token. */
const crypto = require('crypto');

// ASSUMPTION: v23.0 is a current Graph API version; override with META_API_VERSION.
const DEFAULT_API_VERSION = 'v23.0';
function apiVersion() {
  const v = String(process.env.META_API_VERSION || process.env.API_VERSION || DEFAULT_API_VERSION).trim();
  return v.startsWith('v') ? v : 'v' + v;
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const isHash = (s) => /^[a-f0-9]{64}$/.test(s);

// --- normalisation (Meta customer-information-parameter rules) ---
const norm = {
  trim: (v) => (v == null ? '' : String(v).trim().toLowerCase()),
  email: (v) => norm.trim(v),
  // E.164 digits without "+". SA default: 0821234567 -> 27821234567; 00-prefix dropped.
  phone: (v, cc = '27') => {
    let d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = cc + d.slice(1);
    return d;
  },
  name: (v) => norm.trim(v).replace(/[0-9!"#$%&()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, ''),
  alnum: (v) => norm.trim(v).replace(/[^\p{L}\p{N}]/gu, ''),
  country: (v) => (norm.trim(v) || 'za').slice(0, 2),
};

function hashed(v, fn) {
  if (v == null || v === '') return null;
  const raw = String(v).trim().toLowerCase();
  if (isHash(raw)) return raw; // already-hashed values pass through untouched
  const n = fn(v);
  if (!n) return null;
  return isHash(n) ? n : sha256(n); // already-hashed values pass through
}

// Build Meta user_data. fbp/fbc/ip/ua are NEVER hashed.
function buildUserData(u = {}) {
  const out = {};
  const put = (k, v) => { if (v) out[k] = [v]; };
  put('em', hashed(u.email, norm.email));
  put('ph', hashed(u.phone, (x) => norm.phone(x)));
  put('fn', hashed(u.fn, norm.name));
  put('ln', hashed(u.ln, norm.name));
  put('ct', hashed(u.ct, norm.alnum));
  put('st', hashed(u.st, norm.alnum));
  put('zp', hashed(u.zp, norm.alnum));
  put('country', hashed(u.country || 'za', norm.country));
  put('external_id', hashed(u.external_id, (x) => String(x).trim()));
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  if (u.client_ip) out.client_ip_address = u.client_ip;
  if (u.client_user_agent) out.client_user_agent = u.client_user_agent;
  if (u.ctwa_clid) out.ctwa_clid = u.ctwa_clid;
  if (u.whatsapp_business_account_id) out.whatsapp_business_account_id = u.whatsapp_business_account_id;
  return out;
}

const stableId = (leadId, stage) => `evt_${leadId}_${stage}`;

function buildEvent(o) {
  if (!o.eventName) throw new Error('eventName required');
  const eventId = o.eventId || (o.leadId && o.stage ? stableId(o.leadId, o.stage) : null);
  if (!eventId) throw new Error('eventId required (or leadId+stage for evt_<lead_id>_<stage>)');
  const ev = {
    event_name: o.eventName,
    event_time: Math.floor(o.eventTime || Date.now() / 1000),
    event_id: eventId,
    action_source: o.actionSource || 'website',
    user_data: buildUserData(o.user),
  };
  if (o.eventSourceUrl) ev.event_source_url = o.eventSourceUrl;
  if (o.messagingChannel) ev.messaging_channel = o.messagingChannel;
  if (o.custom && Object.keys(o.custom).length) ev.custom_data = o.custom;
  return ev;
}

function buildRequest({ pixelId, token, testEventCode }, events) {
  if (!pixelId) throw new Error('pixelId (dataset id) required');
  if (!token) throw new Error('token required');
  const body = { data: events, access_token: token };
  const tec = testEventCode || process.env.META_TEST_EVENT_CODE;
  if (tec) body.test_event_code = tec;
  return { url: `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(pixelId)}/events`, body };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POST with 3 retries (4 attempts) on 5xx/429, exponential backoff.
async function post(opts, events) {
  const { url, body } = buildRequest(opts, events);
  const f = opts.fetchImpl || fetch, sleep = opts.sleep || defaultSleep;
  let last;
  for (let attempt = 0; attempt <= 3; attempt++) {
    let res;
    try {
      res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { last = e; if (attempt < 3) { await sleep(500 * 2 ** attempt); continue; } throw new Error('capi network error: ' + e.message); }
    let j = {};
    try { j = await res.json(); } catch (e) { /* non-JSON */ }
    if (res.ok) return { events_received: j.events_received, fbtrace_id: j.fbtrace_id };
    const retryable = res.status === 429 || res.status >= 500;
    last = new Error(`capi ${res.status}: ${(j.error && j.error.message) || 'error'} (fbtrace_id=${(j.error && j.error.fbtrace_id) || j.fbtrace_id || 'n/a'})`);
    if (!retryable || attempt === 3) throw last;
    await sleep(500 * 2 ** attempt);
  }
  throw last;
}

// Web / website events (Lead, Schedule, ...). eventId must be the one the browser posted.
function sendEvent(o) { return post(o, [buildEvent(o)]); }

const OFFLINE = ['Qualified', 'Attended', 'GoodFit'];
// CRM stage events. value = broker quality score (1-5) when present.
function sendOffline(o) {
  if (!OFFLINE.includes(o.eventName)) throw new Error('offline eventName must be one of ' + OFFLINE.join('/'));
  const custom = Object.assign({ event_source: 'crm', lead_event_source: 'SortMyCover' }, o.custom);
  if (o.value != null && o.value !== '') { custom.value = Number(o.value); custom.currency = o.currency || 'ZAR'; }
  return post(o, [buildEvent(Object.assign({ actionSource: 'system_generated', stage: String(o.eventName).toLowerCase() }, o, { custom }))]);
}

// CTWA lead: action_source business_messaging, ctwa_clid from the referral.
function sendBusinessMessagingLead(o) {
  if (!o.ctwaClid) throw new Error('ctwaClid required');
  const user = Object.assign({}, o.user, { ctwa_clid: o.ctwaClid, whatsapp_business_account_id: o.wabaId || (o.user && o.user.whatsapp_business_account_id) });
  const ev = buildEvent(Object.assign({ eventName: 'Lead', stage: 'ctwa_lead' }, o, { actionSource: 'business_messaging', messagingChannel: 'whatsapp', user }));
  return post(Object.assign({}, o, { pixelId: o.datasetId || o.pixelId }), [ev]);
}

// Hashed customer-list row (nightly exclusions / seeds). Output order follows `schema`.
const AUDIENCE_SCHEMA = ['PHONE', 'EMAIL', 'FN', 'LN', 'COUNTRY', 'EXTID'];
function hashAudienceRow(row = {}, schema = AUDIENCE_SCHEMA) {
  const f = { PHONE: [row.phone, (x) => norm.phone(x)], EMAIL: [row.email, norm.email], FN: [row.fn, norm.name], LN: [row.ln, norm.name],
    COUNTRY: [row.country || 'za', norm.country], EXTID: [row.external_id, (x) => String(x).trim()] };
  return schema.map((k) => { const p = f[k]; if (!p) throw new Error('unknown schema field ' + k); return hashed(p[0], p[1]) || ''; });
}

module.exports = { sendEvent, sendOffline, sendBusinessMessagingLead, hashAudienceRow, AUDIENCE_SCHEMA, buildUserData, buildEvent, buildRequest, normalise: norm, sha256, stableId, apiVersion };
