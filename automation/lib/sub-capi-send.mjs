// smc-capi-send (LOCAL-STAGING §7, I-48f). Pure functions; automation/SUB-capi-send.json does SQL + HTTP.
// Code node form: const L = require('lv-automation').subCapiSend;
// Accepts the CONTRACTS row (ids only: { event_name, event_id, action_source, lead_id, brand_id, ctwa_clid?, value?,
// event_time? }) and the decided shape ({ event_name, event_id, lead_id?, user: { phone, fn?, ln?, external_id?, ip?,
// ua?, fbc?, fbp? }, custom_data? }). User data from the lead row wins; email is never sent (no `em`, ever).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const capi = require('../capi/capi.js');

const EVENTS = ['Lead', 'Schedule', 'Qualified', 'Attended', 'GoodFit'];
const SOURCES = ['website', 'business_messaging', 'system_generated'];

export function normalise(input = {}) {
  const i = input || {};
  const offline = ['Qualified', 'Attended', 'GoodFit'].includes(i.event_name);
  const out = {
    event_name: i.event_name || null,
    event_id: i.event_id || null,
    action_source: i.action_source || (i.ctwa_clid ? 'business_messaging' : offline ? 'system_generated' : 'website'),
    lead_id: i.lead_id || null,
    brand_id: i.brand_id || null,
    ctwa_clid: i.ctwa_clid || null,
    value: i.value ?? null,
    event_time: i.event_time || null,
    user: i.user && typeof i.user === 'object' ? i.user : null,
    custom_data: i.custom_data && typeof i.custom_data === 'object' ? i.custom_data : null,
    consent_ads: i.consent_ads === true,
  };
  const missing = [];
  if (!EVENTS.includes(out.event_name)) missing.push('event_name');
  if (!out.event_id) missing.push('event_id');
  if (!SOURCES.includes(out.action_source)) missing.push('action_source');
  if (!out.lead_id && !out.user) missing.push('lead_id|user');
  if (out.action_source === 'business_messaging' && !out.ctwa_clid) missing.push('ctwa_clid');
  return { ...out, valid: missing.length === 0, missing };
}

/** Meta user data source: the lead row (preferred), else the caller's user block. Email is dropped here too. */
export function userFrom(n, lead) {
  const u = n.user || {};
  const l = lead || {};
  return {
    phone: l.phone || u.phone,
    fn: l.first_name || u.fn,
    ln: l.last_name || u.ln,
    external_id: n.lead_id || u.external_id,
    fbc: l.fbc || u.fbc,
    fbp: l.fbp || u.fbp,
    client_ip: l.client_ip || u.ip,
    client_user_agent: l.client_user_agent || u.ua,
  };
}

/**
 * build(n, ctx, env, nowMs) -> { action: 'skip'|'duplicate'|'dry'|'send', reason?, url?, body?, log? }
 *   ctx: "Load lead" row { found, consent_ads_at, phone, first_name, last_name, fbc, fbp, client_ip, client_user_agent,
 *        lead_brand_id, pixel_id, dataset_id, waba_id, duplicate }
 * Consent gate first (event-spec "Consent gate"), then dedupe (capi_log), then DRY_RUN (nothing written), then send.
 */
export function build(n, ctx = {}, env = {}, nowMs = Date.now()) {
  const brand_id = n.brand_id || ctx.lead_brand_id || null;
  const log = { lead_id: n.lead_id, brand_id, event_name: n.event_name, event_id: n.event_id, action_source: n.action_source };
  if (!n.valid) return { action: 'skip', reason: 'invalid_input', missing: n.missing, log };
  const consent = n.lead_id ? !!ctx.consent_ads_at : n.consent_ads;
  if (!consent) return { action: 'skip', reason: 'capi_skipped_no_consent', log };
  if (ctx.duplicate === true || ctx.duplicate === 't') return { action: 'duplicate', reason: 'already_sent', log };
  const pixel = n.action_source === 'website' ? (ctx.pixel_id || env.PIXEL_ID) : (ctx.dataset_id || env.DATASET_ID || ctx.pixel_id || env.PIXEL_ID);
  if (!pixel) return { action: 'skip', reason: 'no_dataset_id', log };
  const user = userFrom(n, n.lead_id ? ctx : null);
  if (n.action_source === 'business_messaging') { user.ctwa_clid = n.ctwa_clid; user.whatsapp_business_account_id = ctx.waba_id || env.WABA_ID || undefined; }
  const custom = { ...(n.custom_data || {}) };
  if (n.action_source === 'system_generated') { custom.event_source = 'crm'; custom.lead_event_source = 'SortMyCover'; }
  if (n.value != null && n.value !== '') { custom.value = Number(n.value); custom.currency = custom.currency || 'ZAR'; }
  const ev = capi.buildEvent({
    eventName: n.event_name,
    eventId: n.event_id,
    eventTime: n.event_time ? Math.floor(Date.parse(n.event_time) / 1000) || Number(n.event_time) : Math.floor(nowMs / 1000),
    actionSource: n.action_source,
    messagingChannel: n.action_source === 'business_messaging' ? 'whatsapp' : undefined,
    user,
    custom,
  });
  const body = { data: [ev] };
  if (env.CAPI_TEST_EVENT_CODE) body.test_event_code = env.CAPI_TEST_EVENT_CODE;
  const version = env.META_GRAPH_VERSION || 'v21.0';
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(pixel)}/events`;
  if (String(env.DRY_RUN_SENDS || '').toLowerCase() === 'true') return { action: 'dry', reason: 'dry_run', log, test_event_code: env.CAPI_TEST_EVENT_CODE || null };
  return { action: 'send', url, body, log, test_event_code: env.CAPI_TEST_EVENT_CODE || null };
}

/** Highest percentage in Meta's usage headers (x-app-usage / x-business-use-case-usage / x-ad-account-usage). */
export function usagePct(headers = {}) {
  let max = 0;
  for (const k of ['x-app-usage', 'x-business-use-case-usage', 'x-ad-account-usage']) {
    const raw = headers[k] || headers[k.toUpperCase()];
    if (!raw) continue;
    let j; try { j = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { continue; }
    const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) { if (typeof v === 'number' && /count|time|util|pct/i.test(kk)) max = Math.max(max, v); else walk(v); } };
    walk(j);
  }
  return max;
}

/** HTTP node output (fullResponse) -> capi_log update fields. */
export function interpret(res = {}) {
  const body = res.body !== undefined ? res.body : res;
  const status = Number(res.statusCode || (body && body.error ? 400 : 200));
  const ok = status >= 200 && status < 300 && !(body && body.error);
  return {
    ok,
    status: ok ? 'sent' : 'failed',
    events_received: ok ? Number(body.events_received || 0) : null,
    fbtrace_id: (body && (body.fbtrace_id || (body.error && body.error.fbtrace_id))) || null,
    error: ok ? null : String((body && body.error && body.error.message) || res.error || `http_${status}`).slice(0, 300),
    usage_pct: usagePct(res.headers || {}),
  };
}

/** One JSONL evidence line for S7-11/S7-14 (no identifiers). */
export const evidenceLine = (log, testEventCode, nowMs = Date.now()) =>
  JSON.stringify({ ts: new Date(nowMs).toISOString(), event_name: log.event_name, event_id: log.event_id, test_event_code: testEventCode }) + '\n';
