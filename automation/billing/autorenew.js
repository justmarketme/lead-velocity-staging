'use strict';
/* I-30e: the portal's "Switch off" button for card auto-renew (src/pages/portal/Agreement.tsx -> postWebhook
 * "billing-autorenew", body { on: false }, Authorization: Bearer <broker's Supabase access token>).
 * Off only: turning auto-renew ON is an opt-in made by paying by card at checkout (0.1, 6.5), never this path.
 * The broker cannot flip brokers.card_autorenew himself (smc_brokers_guard); W19 does it as n8n_app.
 * JWT rules are the /slots broker path (automation/CONTRACTS.md, I-30a): HS256 with SUPABASE_JWT_SECRET. */
const { verifySupabaseJwt } = require('../security/lead-token');
const { formatZar } = require('./money');

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

/**
 * W19 T-3 / T-1 renewal reminder (compliance-qa review 4 §2g): a recurring card-charge notice states the amount and
 * how to stop it. Amount = the open renewal invoice (issued at T-7 from `pricing`, shortfall credit applied); with no
 * open invoice, the pricing row for the next tier. Excl. VAT everywhere (0.1); the VAT line only when registered.
 * r = { action, open_ref, card_autorenew, open_amount_excl_vat, open_vat_zar, price_zar }
 */
function reminderParts(r) {
  const days = r.action === 'remind_t3' ? 3 : 1;
  const exclZar = r.open_amount_excl_vat != null ? Number(r.open_amount_excl_vat) : (r.price_zar != null ? Number(r.price_zar) : null);
  const amount = Number.isFinite(exclZar) ? formatZar(Math.round(exclZar * 100)) + ' excl. VAT' + (r.open_vat_zar != null && Number(r.open_vat_zar) > 0 ? ' plus VAT of ' + formatZar(Math.round(Number(r.open_vat_zar) * 100), { decimals: true }) : '') : null;
  const card = r.card_autorenew ? 'on: we will charge ' + (amount || 'the amount on your invoice') + ' to your card at cycle end.' : 'off.';
  return { days, amount, card };
}

const REMINDER_TEMPLATE = 'broker_renewal_reminder'; // 1 first name · 2 "3 days"/"1 day" · 3 end date · 4 amount excl. VAT · 5 reference · 6 card line; URL Pay now {{1}} = reference; URL /s/billing static
/** WhatsApp template params for W19 T-3/T-1 (outside the 24-h window). Same facts as renewalReminderText. */
function renewalReminderTemplate(r) {
  const { days, amount, card } = reminderParts(r);
  const end = r.effective_end || r.ends_at;
  const endDay = end ? new Date(end).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' }).replace(/,/g, '') : 'the end date on your invoice';
  const first = clean(r.contact_person).split(' ')[0] || 'there';
  const ref = clean(r.open_ref) || 'on your invoice';
  return { name: REMINDER_TEMPLATE,
    body: [first, days + ' day' + (days > 1 ? 's' : ''), clean(endDay), amount || 'the amount on your invoice', ref, card].map(clean),
    buttons: [clean(r.open_ref)] }; // Pay now URL suffix; the /s/billing button is static
}

function renewalReminderText(r) {
  const { days, card } = reminderParts(r);
  return 'Your cycle ends in ' + days + ' day' + (days > 1 ? 's' : '') + '. Pay for the next one to keep leads coming with no gap. Reference: *' + (r.open_ref || 'on your invoice') + '*. Card auto-renew: ' + card + (r.card_autorenew ? ' You can switch it off any time in the portal: /s/billing.' : '');
}

module.exports = { TEMPLATE, parseAutorenewRequest, confirmMessage, responseBody, renewalReminderText, renewalReminderTemplate, REMINDER_TEMPLATE };
