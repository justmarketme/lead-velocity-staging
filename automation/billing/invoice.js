'use strict';
/* Invoice records (3.6 consumer 5). Amount, tier and period come from the `pricing` row; the PDF
 * still comes from the existing InvoiceGenerator once it is rewired to read these fields. */
const { cycleAmounts, effectiveLeadPriceZar } = require('./pricing');
const { formatReference, period: periodOf, parseReference } = require('./reference');

function addMonths(yyyymm, n) {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4)) - 1 + n;
  return String(y + Math.floor(m / 12)) + String((m % 12) + 1).padStart(2, '0');
}

/**
 * @param o.broker        { id, billing_ref }
 * @param o.pricingRow    the tier for THIS cycle (tier changes apply at cycle boundaries)
 * @param o.cycleStart    Date/ISO the cycle starts (renewal: previous ends_at); sets the period
 * @param o.dueAt         renewal: the current cycle's end (no grace, 0.1); first cycle: term-sheet date
 * @param o.existingReferences references already issued to this broker (non-void), to avoid a clash
 *                        when two 30-day cycles start in the same calendar month
 * @param o.creditCents   shortfall credit carried from the last cycle (0.1), never below zero
 */
function buildInvoice({ broker, pricingRow, cycleStart, dueAt, method = 'instant_eft', existingReferences = [], creditCents = 0, invoiceNo = null, issuedAt = new Date(), cycleId = null }) {
  if (!broker || broker.billing_ref === undefined || broker.billing_ref === null) throw new TypeError('broker.billing_ref required');
  // Top-up references (LV-xxxx-T-YYYYMM, topup.js) share the month but are a different family: they never push a cycle invoice on.
  const taken = new Set(existingReferences.map((r) => { const p = parseReference(r); return p && !/^T[A-Z]?$/.test(p.tier_token || '') ? p.period : null; }).filter(Boolean));
  let per = periodOf(cycleStart || issuedAt);
  let guard = 0;
  while (taken.has(per)) { per = addMonths(per, 1); if (++guard > 24) throw new Error('no free reference period'); }
  const reference = formatReference({ brokerRef: broker.billing_ref, pricingRow, at: per });
  const a = cycleAmounts(pricingRow);
  const credit = Math.max(0, Math.min(Math.round(creditCents || 0), a.excl_vat_cents));
  const exclAfterCredit = a.excl_vat_cents - credit;
  const vat = a.vat_rate ? Math.round(exclAfterCredit * a.vat_rate) : null;
  const total = exclAfterCredit + (vat || 0);
  return {
    invoice_no: invoiceNo,
    broker_id: broker.id || null,
    broker_ref: reference.split('-')[1],
    cycle_id: cycleId,
    tier_code: pricingRow.tier_code,
    period: per,
    reference,
    price_cents: a.excl_vat_cents,
    credit_cents: credit,
    amount_excl_vat: exclAfterCredit / 100,
    vat_zar: vat === null ? null : vat / 100,
    total_zar: total / 100,
    total_cents: total,
    method,
    status: total === 0 ? 'credited' : 'issued',
    issued_at: new Date(issuedAt).toISOString(),
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
  };
}

/**
 * Shortfall credit / refund (0.1; agreement 6.2, 6.5, 11.6), after the 14-day extension: every undelivered Qualified Lead is
 * credited at the plan's Effective Lead Price (pricing.effectiveLeadPriceZar), whether it was one of the plan's own leads or a
 * top-up lead. A top-up lead is never credited at the top-up price (Jonathan 2026-10-10).
 *
 * @param cycle     a `cycles` snapshot { price_zar, committed_leads, topup_leads? }. committed_leads INCLUDES paid top-ups
 *                  (W16 adds them), so the rate comes from the plan's own commitment (committed_leads - topup_leads); dividing
 *                  the plan price by the total would spread the top-up leads into the plan price and under-credit every lead.
 * @param delivered effective delivered leads (verified qualified less approved replacements outstanding)
 * @returns cents, capped at what the broker paid toward the leads of this cycle: the plan price plus the top-up leads at the
 *          Effective Lead Price (the cap that used to be the plan price alone could not cover undelivered top-up leads).
 */
function shortfallCreditCents(cycle, delivered) {
  const topup = Math.max(0, Math.trunc(Number(cycle.topup_leads) || 0));
  const committed = Number(cycle.committed_leads);
  const missing = Math.min(committed, Math.max(0, committed - Number(delivered)));
  const rateCents = effectiveLeadPriceZar(cycle) * 100;
  const paidCents = Math.round(Number(cycle.price_zar) * 100) + topup * rateCents;
  return Math.min(missing * rateCents, paidCents);
}

module.exports = { buildInvoice, shortfallCreditCents, addMonths };
