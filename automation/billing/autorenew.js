'use strict';
/* I-30e: the portal's "Switch off" button for card auto-renew (src/pages/portal/Agreement.tsx -> postWebhook
 * "billing-autorenew", body { on: false }, Authorization: Bearer <broker's Supabase access token>).
 * Off only: turning auto-renew ON is an opt-in made by paying by card at checkout (0.1, 6.5), never this path.
 * The broker cannot flip brokers.card_autorenew himself (smc_brokers_guard); W19 does it as n8n_app.
 * JWT rules are the /slots broker path (automation/CONTRACTS.md, I-30a): HS256 with SUPABASE_JWT_SECRET. */
const { verifySupabaseJwt } = require('../security/lead-token');

const TEMPLATE = 'broker_autorenew_off'; // automation/templates/broker_autorenew_off.json (I-35j): 1 first name; URL button 1 = 'billing' (-> app.leadvelocity.co.za/s/billing)
const MAX_BODY_KEYS = 4;

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name);
  const v = k === undefined ? undefined : headers[k];
  return Array.isArray(v) ? v[0] : v;
}

/** -> { ok:true, user_id } | { ok:false, status, reason }. Never echoes the token. */
function parseAutorenewRequest({ headers = {}, body = {} } = {}, { jwtSecret, nowMs = Date.now() } = {}) {
  const auth = headerValue(headers, 'authorization');
  if (!auth) return { ok: false, status: 401, reason: 'missing' };
  const m = /^Bearer\s+(\S+)$/i.exec(String(auth));
  if (!m) return { ok: false, status: 401, reason: 'malformed' };
  let v;
  try { v = verifySupabaseJwt(m[1], { secret: jwtSecret, nowMs }); } catch { return { ok: false, status: 500, reason: 'not_configured' }; }
  if (!v.ok) return { ok: false, status: 401, reason: v.reason };
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > MAX_BODY_KEYS) return { ok: false, status: 400, reason: 'bad_body' };
  if (body.on === true) return { ok: false, status: 400, reason: 'opt_in_via_checkout' };
  if (body.on !== false) return { ok: false, status: 400, reason: 'bad_body' };
  return { ok: true, user_id: v.user_id };
}

const clean = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, ' ').trim();

/** WhatsApp confirmation (template params only; no amount, no card details). null when there is no number. */
function confirmMessage(broker = {}) {
  const to = clean(broker.whatsapp_number);
  if (!to) return null;
  const first = clean(broker.contact_person).split(' ')[0] || 'there';
  return {
    broker_id: broker.broker_id || broker.id || null,
    to,
    template: {
      name: TEMPLATE,
      body: [first],
      buttons: ['billing'],
    },
  };
}

/** HTTP response body for the portal. */
function responseBody(row) {
  if (!row || !row.broker_id) return { status: 403, body: { ok: false, message: 'no_broker' } };
  return { status: 200, body: { ok: true, card_autorenew: false, changed: !!row.changed } };
}

module.exports = { TEMPLATE, parseAutorenewRequest, confirmMessage, responseBody };
