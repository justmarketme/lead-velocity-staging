'use strict';
/* Top-ups (agreement clause 9; Jonathan 2026-10-05). A broker buys extra Qualified Leads for the CURRENT cycle:
 *   - price per lead, minimum and notice come only from pricing.seed.json `topup` (passed in as `topup`);
 *   - only once the cycle's committed leads are delivered (v_cycle_progress.verified >= committed);
 *   - paid in advance: an invoice (kind 'add_on', topup_leads = qty) is issued; delivery starts on the later of
 *     payment and now + notice_days;
 *   - when W16 marks that invoice paid, the cycle's committed_leads grows by qty (no new cycle row).
 * Reference: LV-{broker_ref}-T-{YYYYMM}; a second top-up in the same month is -TB-, then -TC- ... (still <= 20 chars and
 * parseable by reference.js). Tier ref_codes must therefore never start with T (checked here).
 * Pure: no fs, no network, so it inlines into n8n Code nodes. */
const { formatReference, period: periodOf, parseReference } = require('./reference');
const { tierRefCode } = require('./pricing');
const { verifySupabaseJwt } = require('../security/lead-token');

const DAY_MS = 86400000;

function checkConfig(topup) {
  if (!topup || !(Number(topup.price_per_lead_zar) > 0) || !(Number.isInteger(topup.min_leads) && topup.min_leads > 0) || !(Number(topup.notice_days) >= 0)) {
    throw new TypeError('topup config {price_per_lead_zar, min_leads, notice_days} required (pricing.seed.json)');
  }
  return topup;
}

/** True for a top-up reference token (T, TB, TC ...). */
const isTopupToken = (tok) => /^T[A-Z]?$/.test(String(tok || ''));
const isTopupReference = (ref) => { const p = parseReference(ref); return Boolean(p && isTopupToken(p.tier_token)); };

/** Next free top-up reference for this broker + month, given every reference already issued to the broker. */
function topupReference({ brokerRef, at = new Date(), existingReferences = [], pricingRows = [] }) {
  for (const r of pricingRows) if (tierRefCode(r).startsWith('T')) throw new Error(`pricing ${r.tier_code}: ref_code may not start with T (reserved for top-ups)`);
  const per = periodOf(at);
  const taken = new Set(existingReferences.map((r) => parseReference(r)).filter((p) => p && p.period === per && isTopupToken(p.tier_token)).map((p) => p.tier_token));
  const tokens = ['T', ...'BCDEFGHIJKLMNOPQRSUVWXYZ'.split('').map((c) => 'T' + c)];
  const tok = tokens.find((t) => !taken.has(t));
  if (!tok) throw new Error('no free top-up reference this month');
  return formatReference({ brokerRef, tier: tok, at: per });
}

/**
 * Decide whether a top-up may be bought now. cycle = a v_cycle_progress row { cycle_id, status, committed, verified }.
 * -> { ok:true, qty, amount_cents, earliest_start } | { ok:false, status, reason, message }
 */
function checkTopup({ qty, cycle, topup, now = new Date() }) {
  checkConfig(topup);
  const n = Number(qty);
  if (!Number.isInteger(n) || n < topup.min_leads || n > 500) return { ok: false, status: 400, reason: 'bad_qty', message: `Choose ${topup.min_leads} or more leads.` };
  if (!cycle || !cycle.cycle_id) return { ok: false, status: 409, reason: 'no_cycle', message: 'You need an active cycle to top up.' };
  if (!['active', 'extended'].includes(cycle.status)) return { ok: false, status: 409, reason: 'cycle_not_active', message: 'Top-ups apply to an active cycle.' };
  if (Number(cycle.verified) < Number(cycle.committed)) {
    return { ok: false, status: 409, reason: 'not_delivered', message: `Top-ups open once this cycle's ${cycle.committed} leads are delivered (${cycle.verified} so far).` };
  }
  return {
    ok: true,
    qty: n,
    amount_cents: Math.round(Number(topup.price_per_lead_zar) * 100) * n,
    earliest_start: new Date(new Date(now).getTime() + Number(topup.notice_days) * DAY_MS).toISOString(),
  };
}

/** The add_on invoice row (same shape invoice.buildInvoice returns, plus kind/topup_leads/topup_starts_at). */
function buildTopupInvoice({ broker, cycle, qty, topup, method = 'manual_eft', existingReferences = [], pricingRows = [], vatRate = null, issuedAt = new Date() }) {
  if (!broker || broker.billing_ref === undefined || broker.billing_ref === null) throw new TypeError('broker.billing_ref required');
  const c = checkTopup({ qty, cycle, topup, now: issuedAt });
  if (!c.ok) throw new RangeError(c.reason);
  const reference = topupReference({ brokerRef: broker.billing_ref, at: issuedAt, existingReferences, pricingRows });
  const excl = c.amount_cents;
  const vat = vatRate ? Math.round(excl * Number(vatRate)) : null;
  const total = excl + (vat || 0);
  return {
    kind: 'add_on',
    broker_id: broker.id || null,
    cycle_id: cycle.cycle_id,
    tier_code: cycle.tier_code || null,
    topup_leads: c.qty,
    topup_starts_at: c.earliest_start,
    period: periodOf(issuedAt),
    reference,
    amount_excl_vat: excl / 100,
    vat_zar: vat === null ? null : vat / 100,
    total_zar: total / 100,
    total_cents: total,
    method,
    status: 'issued',
    issued_at: new Date(issuedAt).toISOString(),
    due_at: c.earliest_start, // paid in advance: due before delivery may start
  };
}

/** Broker request: Bearer Supabase JWT + { qty, method? }. -> { ok:true, user_id, qty, method } | { ok:false, status, reason }. */
function parseTopupRequest({ headers = {}, body = {} } = {}, { jwtSecret, nowMs = Date.now() } = {}) {
  const k = Object.keys(headers || {}).find((h) => h.toLowerCase() === 'authorization');
  const auth = k === undefined ? '' : String(Array.isArray(headers[k]) ? headers[k][0] : headers[k]);
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!m) return { ok: false, status: 401, reason: 'missing' };
  let v;
  try { v = verifySupabaseJwt(m[1], { secret: jwtSecret, nowMs }); } catch { return { ok: false, status: 500, reason: 'not_configured' }; }
  if (!v.ok) return { ok: false, status: 401, reason: v.reason };
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 2) return { ok: false, status: 400, reason: 'bad_body' };
  const qty = Number(body.qty);
  if (!Number.isInteger(qty)) return { ok: false, status: 400, reason: 'bad_qty' };
  const method = ['instant_eft', 'manual_eft', 'card'].includes(body.method) ? body.method : 'manual_eft';
  return { ok: true, user_id: v.user_id, qty, method };
}

module.exports = { parseTopupRequest, checkTopup, buildTopupInvoice, topupReference, isTopupToken, isTopupReference };
