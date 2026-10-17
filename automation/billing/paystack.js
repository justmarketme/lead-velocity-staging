'use strict';
/* Paystack for SortMyCover billing (6.5). Node 18+, no deps (crypto + global fetch).
 *
 * Two layers:
 *  1. Pure request builders (`build.*`) -> { method, path, body }. n8n HTTP Request nodes send these
 *     with the "Paystack secret key" credential, so the key never sits in a Code node.
 *  2. `createClient({ secretKey })` sends the same specs with fetch (local scripts, R1 test).
 *     It refuses sk_live_ keys unless allowLive: true (GATE-R1-LIVE). No Paystack account exists
 *     yet, so nothing here has been called live.
 *
 * Amounts: Paystack takes the currency subunit (cents for ZAR). Prices come only from `pricing` rows.
 * Paystack signs webhooks with the account SECRET KEY (HMAC-SHA512 hex of the raw body in
 * `x-paystack-signature`); there is no separate webhook secret (the 6.5 step 3 ".env webhook secret"
 * is the same value; see RUNBOOK). Verification reuses automation/security/verify-webhooks.js.
 *
 * ASSUMPTIONS (re-check on the dashboard at GATE-PAYSTACK-KYC; not researched, 0.1):
 *  - SA Pay-with-Bank channel names are 'eft' (Instant EFT) and 'capitec_pay'; override with
 *    PAYSTACK_EFT_CHANNELS (comma list).
 *  - Plans support interval 'monthly' (calendar month), not a 30-day cycle, so card auto-renew
 *    defaults to mode 'authorization': W19 charges the saved authorisation on our cycle end and
 *    runs the day-1/day-3 retry itself (Stripe pattern). Plans are still created per tier
 *    (6.5 step 4) for mode 'plan' (NH-BA-04).
 */
const { verifyPaystackSignature, headerValue } = require('../security/verify-webhooks');
const { parseReference, paystackReference } = require('./reference');
const { cycleAmounts } = require('./pricing');
const { withinTolerance } = require('./money');
const { paymentReceived } = require('./events');

const BASE_URL = 'https://api.paystack.co';
const DEFAULT_EFT_CHANNELS = ['eft', 'capitec_pay'];

function eftChannels(env = (typeof process !== 'undefined' && process.env) || {}) {
  const v = env.PAYSTACK_EFT_CHANNELS;
  return v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_EFT_CHANNELS.slice();
}

/* ------------------------------------------------------------ request builders (pure) */

const build = {
  /** One single-cycle payment page per tier (6.5 step 4). Update when the code already exists. */
  paymentPage(row, { redirectUrl } = {}) {
    const { total_cents } = cycleAmounts(row);
    const body = {
      name: `SortMyCover leads: ${row.name}, one 30-day cycle`,
      description: `${row.committed_leads} verified qualified leads in one 30-day cycle. One payment, one cycle. No lock-in; card auto-renew only if you opt in. Prices excl. VAT.`,
      amount: total_cents,
      currency: 'ZAR',
      metadata: {
        tier_code: row.tier_code,
        custom_fields: [{ display_name: 'Invoice reference (LV-...)', variable_name: 'invoice_reference', required: true }],
      },
    };
    if (redirectUrl) body.redirect_url = redirectUrl;
    if (row.paystack_page_code) return { method: 'PUT', path: `/page/${encodeURIComponent(row.paystack_page_code)}`, body };
    return { method: 'POST', path: '/page', body: { ...body, slug: `sortmycover-${row.tier_code.replace(/^SMC_/, '').toLowerCase().replace(/_/g, '-')}-cycle` } };
  },

  /** Optional card auto-renew Plan per tier (opt-in only; never the default). */
  plan(row) {
    const { total_cents } = cycleAmounts(row);
    const body = {
      name: `SortMyCover ${row.name} card auto-renew (optional)`,
      description: `Optional card auto-renew for ${row.name}. Cancel any time in the portal.`,
      amount: total_cents,
      interval: 'monthly',
      currency: 'ZAR',
      send_invoices: false, // we send our own invoice with the bold reference
      send_sms: false,
    };
    if (row.paystack_plan_code) return { method: 'PUT', path: `/plan/${encodeURIComponent(row.paystack_plan_code)}`, body: { ...body, update_existing_subscriptions: false } };
    return { method: 'POST', path: '/plan', body };
  },

  /**
   * Checkout for one invoice. method 'instant_eft' (default rail) or 'card'.
   * autorenewOptIn only matters for card; it is false unless the broker ticked the box.
   */
  initialize({ invoice, email, method = 'instant_eft', attempt = 1, callbackUrl, autorenewOptIn = false, mode = 'authorization', planCode, env }) {
    if (!invoice || !invoice.reference || !Number.isSafeInteger(invoice.total_cents)) throw new TypeError('invoice {reference,total_cents} required');
    if (!email) throw new TypeError('email required by Paystack');
    if (!['instant_eft', 'card'].includes(method)) throw new TypeError('method must be instant_eft or card');
    const optIn = method === 'card' && autorenewOptIn === true;
    const body = {
      email,
      amount: invoice.total_cents,
      currency: 'ZAR',
      reference: paystackReference(invoice.reference, attempt),
      channels: method === 'card' ? ['card'] : eftChannels(env),
      metadata: {
        invoice_reference: invoice.reference,
        broker_ref: invoice.broker_ref || null,
        tier_code: invoice.tier_code || null,
        method,
        autorenew_opt_in: optIn,
        cancel_action: callbackUrl || undefined,
      },
    };
    if (callbackUrl) body.callback_url = callbackUrl;
    if (optIn && mode === 'plan') {
      if (!planCode) throw new TypeError('planCode required for plan mode');
      body.plan = planCode;
    }
    return { method: 'POST', path: '/transaction/initialize', body };
  },

  verify(reference) {
    if (!reference) throw new TypeError('reference required');
    return { method: 'GET', path: `/transaction/verify/${encodeURIComponent(reference)}` };
  },

  /** Full refund unless amount_cents is given (the R1 live test refunds in full). */
  refund({ transaction, amount_cents, reason }) {
    if (!transaction) throw new TypeError('transaction id or reference required');
    const body = { transaction: String(transaction) };
    if (amount_cents !== undefined) body.amount = amount_cents;
    if (reason) body.merchant_note = reason;
    return { method: 'POST', path: '/refund', body };
  },

  /** Card auto-renew charge at cycle end (mode 'authorization'). attempt 1 = cycle end, 2 = day 1, 3 = day 3. */
  chargeAuthorization({ invoice, email, authorization_code, attempt = 1 }) {
    if (!authorization_code) throw new TypeError('authorization_code required');
    return {
      method: 'POST', path: '/transaction/charge_authorization',
      body: { email, amount: invoice.total_cents, currency: 'ZAR', authorization_code, reference: paystackReference(invoice.reference, attempt),
        metadata: { invoice_reference: invoice.reference, broker_ref: invoice.broker_ref || null, tier_code: invoice.tier_code || null, method: 'card', autorenew: true, attempt } },
    };
  },

  /** Hosted link where a broker updates the card on a Paystack subscription (mode 'plan'). */
  cardUpdateLink(subscription_code) { return { method: 'GET', path: `/subscription/${encodeURIComponent(subscription_code)}/manage/link` }; },
  disableSubscription({ code, token }) { return { method: 'POST', path: '/subscription/disable', body: { code, token } }; },
};

/* ------------------------------------------------------------ client */

class PaystackError extends Error {
  constructor(message, extra = {}) { super(message); this.name = 'PaystackError'; Object.assign(this, extra); }
}

function createClient({ secretKey, fetchImpl = (typeof fetch === 'function' ? fetch : null), baseUrl = BASE_URL, allowLive = false, env } = {}) {
  if (!secretKey) throw new PaystackError('PAYSTACK_SECRET_KEY missing (put it in .env, never in chat)', { code: 'NO_KEY' });
  if (/^sk_live_/.test(secretKey) && allowLive !== true) throw new PaystackError('live key refused: pass allowLive only at GATE-R1-LIVE / after KYC', { code: 'LIVE_REFUSED' });
  if (!fetchImpl) throw new PaystackError('fetch not available (Node 18+)', { code: 'NO_FETCH' });

  async function request(spec) {
    const res = await fetchImpl(baseUrl + spec.path, {
      method: spec.method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: spec.body ? JSON.stringify(spec.body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* non-JSON */ }
    if (!res.ok || !json || json.status !== true) {
      throw new PaystackError(`Paystack ${spec.method} ${spec.path} failed: ${(json && json.message) || res.status}`, { code: 'API', http: res.status, body: json });
    }
    return json.data;
  }

  return {
    request,
    createPaymentPage: (row, o) => request(build.paymentPage(row, o)),
    createPlan: (row) => request(build.plan(row)),
    initializeTransaction: (o) => request(build.initialize({ env, ...o })),
    verifyTransaction: (ref) => request(build.verify(ref)),
    refund: (o) => request(build.refund(o)),
    chargeAuthorization: (o) => request(build.chargeAuthorization(o)),
    cardUpdateLink: (code) => request(build.cardUpdateLink(code)),
    disableSubscription: (o) => request(build.disableSubscription(o)),
  };
}

/** The codes to write back to pricing.paystack_* after create (6.5 step 4). */
function codesFromResponses({ page, plan }) {
  return { paystack_page_code: page ? page.slug || page.id || null : null, paystack_plan_code: plan ? plan.plan_code || null : null };
}

/* ------------------------------------------------------------ webhooks */

/** Verify first, parse second. headers as received; rawBody Buffer/string. */
function verifyWebhook(rawBody, headers, secretKey) {
  return verifyPaystackSignature(rawBody, headerValue(headers, 'x-paystack-signature'), secretKey);
}

const methodFromChannel = (ch) => (ch === 'card' ? 'card' : 'instant_eft');

/**
 * Map a verified Paystack event to the billing event W16 consumes.
 * Handles the four subscribed events (6.5 step 5); everything else -> { event: 'ignored' }.
 */
function mapWebhookEvent(payload, { pricingRows } = {}) {
  const p = payload || {};
  const d = p.data || {};
  const md = (d.metadata && typeof d.metadata === 'object') ? d.metadata : {};
  const customer = d.customer || {};
  const planCode = typeof d.plan === 'string' ? d.plan : (d.plan && d.plan.plan_code) || null;
  switch (p.event) {
    case 'charge.success': {
      if (d.status && d.status !== 'success') return { event: 'ignored', reason: 'status_' + d.status };
      if (d.currency && d.currency !== 'ZAR') return { event: 'ignored', reason: 'currency_' + d.currency };
      const invRef = md.invoice_reference || pickCustomField(md, 'invoice_reference') || null;
      const parsed = parseReference(invRef || d.reference, pricingRows);
      const auth = d.authorization || {};
      const keepToken = methodFromChannel(d.channel) === 'card' && (md.autorenew_opt_in === true || md.autorenew_opt_in === 'true' || Boolean(planCode)) && auth.reusable === true;
      return paymentReceived({
        source: 'paystack',
        method: methodFromChannel(d.channel),
        invoice_reference: parsed ? parsed.canonical : null,
        broker_ref: parsed ? parsed.broker_ref : (md.broker_ref || null),
        tier_code: md.tier_code || (parsed && parsed.tier_code) || null,
        period: parsed ? parsed.period : null,
        amount_cents: Number(d.amount),
        paid_at: d.paid_at || d.paidAt || d.transaction_date || p.created_at,
        external_id: d.id !== undefined ? `txn:${d.id}` : `ref:${d.reference}`,
        paystack: {
          reference: d.reference || null,
          transaction_id: d.id !== undefined ? d.id : null,
          channel: d.channel || null,
          customer_code: customer.customer_code || null,
          plan_code: planCode,
          // Token only, and only when the broker opted in. Never card numbers, never expiry (6.4a).
          authorization_code: keepToken ? auth.authorization_code || null : null,
          fees_cents: d.fees !== undefined && d.fees !== null ? Number(d.fees) : null,
        },
      });
    }
    case 'subscription.create':
      return { event: 'card_autorenew.enabled', idempotency_key: `paystack:subscription.create:${d.subscription_code}`, source: 'paystack', mode: 'plan',
        subscription_code: d.subscription_code || null, email_token: d.email_token || null, plan_code: planCode, customer_code: customer.customer_code || null,
        next_payment_date: d.next_payment_date || null };
    case 'subscription.disable':
      return { event: 'card_autorenew.disabled', idempotency_key: `paystack:subscription.disable:${d.subscription_code}`, source: 'paystack',
        subscription_code: d.subscription_code || null, customer_code: customer.customer_code || null, status: d.status || null };
    case 'invoice.payment_failed': {
      const sub = d.subscription || {};
      return { event: 'payment.failed', idempotency_key: `paystack:invoice.payment_failed:${d.invoice_code || d.id}`, source: 'paystack', method: 'card',
        subscription_code: sub.subscription_code || null, customer_code: customer.customer_code || null, amount_cents: d.amount !== undefined ? Number(d.amount) : null,
        reason: (d.transaction && d.transaction.gateway_response) || d.description || null };
    }
    default:
      return { event: 'ignored', reason: 'unsubscribed_event_' + (p.event || 'none') };
  }
}

function pickCustomField(md, name) {
  const f = Array.isArray(md.custom_fields) ? md.custom_fields.find((x) => x && x.variable_name === name) : null;
  return f ? f.value : null;
}

/** Defence in depth before marking paid: re-verify the transaction and compare with the invoice. */
function checkVerifiedTransaction(verified, invoice) {
  const v = verified || {};
  if (v.status !== 'success') return { ok: false, reason: 'not_success' };
  if (v.currency !== 'ZAR') return { ok: false, reason: 'currency' };
  if (!withinTolerance(invoice.total_cents, Number(v.amount))) return { ok: false, reason: 'amount_mismatch', expected: invoice.total_cents, got: Number(v.amount) };
  const ref = (v.metadata && v.metadata.invoice_reference) || v.reference;
  const p = parseReference(ref);
  const q = parseReference(invoice.reference);
  if (!p || !q || p.broker_ref !== q.broker_ref || p.period !== q.period) return { ok: false, reason: 'reference_mismatch' };
  return { ok: true, reason: 'ok' };
}

module.exports = { BASE_URL, build, createClient, PaystackError, codesFromResponses, verifyWebhook, mapWebhookEvent, checkVerifiedTransaction, eftChannels };
