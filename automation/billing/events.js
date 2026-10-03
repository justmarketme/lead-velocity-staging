'use strict';
/* The one "payment received" event W16 consumes, whichever rail the money came by (6.5 item 2:
 * "fire the same 'payment received' event as a card payment"). Also the other billing events. */

const EVENT_TYPES = Object.freeze([
  'payment.received',       // money in: Paystack charge.success, matched bank credit, console one-tap
  'payment.failed',         // card auto-renew charge failed (W19 retry day 1 and 3, then pay link)
  'card_autorenew.enabled', // broker opted in (Paystack subscription.create or saved authorisation)
  'card_autorenew.disabled',
  'ignored',
]);

const METHODS = Object.freeze(['instant_eft', 'manual_eft', 'card']);
const SOURCES = Object.freeze(['paystack', 'incontact', 'statement', 'manual']);

/**
 * @returns {{event:'payment.received', idempotency_key:string, source:string, method:string,
 *   invoice_reference:string|null, broker_ref:string|null, tier_code:string|null, period:string|null,
 *   amount_cents:number, currency:'ZAR', paid_at:string, external_id:string,
 *   bank_credit_id:string|null, paystack:object|null}}
 */
function paymentReceived(o) {
  if (!SOURCES.includes(o.source)) throw new TypeError('bad source ' + o.source);
  if (!METHODS.includes(o.method)) throw new TypeError('bad method ' + o.method);
  if (!Number.isSafeInteger(o.amount_cents) || o.amount_cents <= 0) throw new TypeError('amount_cents must be a positive integer');
  if (!o.external_id) throw new TypeError('external_id required (idempotency)');
  return {
    event: 'payment.received',
    idempotency_key: `payment.received:${o.source}:${o.external_id}`,
    source: o.source,
    method: o.method,
    invoice_reference: o.invoice_reference || null,
    broker_ref: o.broker_ref || null,
    tier_code: o.tier_code || null,
    period: o.period || null,
    amount_cents: o.amount_cents,
    currency: 'ZAR',
    paid_at: new Date(o.paid_at || Date.now()).toISOString(),
    external_id: String(o.external_id),
    bank_credit_id: o.bank_credit_id || null,
    paystack: o.paystack || null,
  };
}

module.exports = { EVENT_TYPES, METHODS, SOURCES, paymentReceived };
