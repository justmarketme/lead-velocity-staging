'use strict';
/* Credit -> invoice matching and the daily reconciliation report (6.5 items 2 and 4; W16/W18).
 *
 * Rule (6.5 item 2): reference contains LV-{broker_ref} AND amount within +/-R1 of the invoice ->
 * mark paid and fire the same payment.received event as a card payment. Everything else goes to
 * the console queue for Jonathan with one-tap assign, with suggestions where we can make them.
 * Money bugs are trust bugs, so when in doubt this module queues; it never guesses.
 *
 * Inputs are plain rows (shapes of bank_credits / invoices_smc), so W16 loads them with a Postgres
 * node and passes them in; the decision is pure and unit-tested.
 */
const { parseReference, amountMatches } = require('./reference');
const { TOLERANCE_CENTS } = require('./money');
const { tierRefCode } = require('./pricing');
const { paymentReceived } = require('./events');
const { isTopupToken } = require('./topup');

const SETTLEMENT_RE = /\bPAYSTACK\b|\bPSTK\b/i;
const RESEND_WINDOW_MS = 60 * 1000; // a re-sent alert carries the same transaction minute; two real payments do not

const centsOf = (row) => (Number.isSafeInteger(row.amount_cents) ? row.amount_cents : Math.round(Number(row.amount_zar) * 100));
const invTotal = (inv) => (Number.isSafeInteger(inv.total_cents) ? inv.total_cents : Math.round(Number(inv.total_zar) * 100));
const sastDate = (iso) => new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);

function queue(reason, extra = {}) { return { action: 'queue', reason, invoice_id: null, suggestions: [], ...extra }; }

function suggestByAmount(cents, invoices) {
  return invoices.filter((i) => i.status === 'issued' && amountMatches(invTotal(i), cents)).map((i) => i.id);
}

/**
 * Decide what to do with one bank credit (source incontact | statement | manual).
 * @param credit   { id, source, amount_cents|amount_zar, reference_raw, parsed_reference, received_at, graph_message_id?, external_id? }
 * @param ctx.invoices  invoices_smc rows (any status) for the brokers concerned; or all open ones
 * @param ctx.credits   bank_credits already stored (for duplicate detection)
 * @param ctx.pricingRows pricing rows (tier token check)
 * @returns { action: 'mark_paid'|'queue'|'duplicate'|'settlement'|'ignore', reason, invoice_id, suggestions, event? }
 */
function matchCredit(credit, { invoices = [], credits = [], pricingRows } = {}) {
  const cents = centsOf(credit);
  if (!(cents > 0)) return { action: 'ignore', reason: 'not_a_credit', invoice_id: null, suggestions: [] };

  const parsed = credit.parsed_reference ? parseReference(credit.parsed_reference, pricingRows) : parseReference(credit.reference_raw, pricingRows);

  // Paystack payouts land in FNB too. They settle money already counted by the Paystack webhook,
  // so they are reconciled against Paystack, never against an invoice (6.5 Paystack step 7).
  if (!parsed && SETTLEMENT_RE.test(String(credit.reference_raw || ''))) return { action: 'settlement', reason: 'paystack_settlement', invoice_id: null, suggestions: [] };

  // Duplicate: the same alert re-sent (same source, amount, reference and transaction minute), or a credit
  // already counted from the other feed on the same day (statement vs inContact): never count twice.
  const refKey = parsed ? parsed.canonical : String(credit.reference_raw || '').trim().toUpperCase();
  const dup = credits.find((c) => {
    if (c.id === credit.id) return false;
    if (c.match_status === 'duplicate') return false;
    if (centsOf(c) !== cents) return false;
    const cp = c.parsed_reference ? c.parsed_reference : (parseReference(c.reference_raw) || {}).canonical || String(c.reference_raw || '').trim().toUpperCase();
    if (cp !== refKey) return false;
    if (c.source === credit.source) return Math.abs(new Date(c.received_at) - new Date(credit.received_at)) <= RESEND_WINDOW_MS;
    return sastDate(c.received_at) === sastDate(credit.received_at);
  });
  if (dup) return { action: 'duplicate', reason: dup.source === credit.source ? 'resent_alert' : 'already_counted_other_feed', invoice_id: dup.matched_invoice_id || null, duplicate_of: dup.id, suggestions: [] };

  if (!parsed) return queue('no_reference', { suggestions: suggestByAmount(cents, invoices), ask_pop: true });

  const mine = invoices.filter((i) => {
    const p = parseReference(i.reference);
    return p && p.broker_ref === parsed.broker_ref;
  });
  if (!mine.length) return queue('unknown_broker_ref', { suggestions: suggestByAmount(cents, invoices) });

  const samePeriod = mine.filter((i) => parseReference(i.reference).period === parsed.period && i.status !== 'void');
  const open = mine.filter((i) => i.status === 'issued');
  // A cycle invoice and a top-up (LV-0007-B-202610 / LV-0007-T-202610) share a period: keep the payer's family apart.
  const tokOf = (i) => parseReference(i.reference).tier_token;
  const family = samePeriod.filter((i) => isTopupToken(tokOf(i)) === isTopupToken(parsed.tier_token));
  const exact = family.filter((i) => tokOf(i) === parsed.tier_token);
  const cands = exact.length ? exact : family;
  if (!cands.length) return queue('period_mismatch', { suggestions: open.filter((i) => amountMatches(invTotal(i), cents)).map((i) => i.id) });

  const inv = cands.find((i) => i.status === 'issued') || cands[0];
  if (inv.status !== 'issued') {
    // Already paid (or credited): a second payment, or a reused old reference for a new invoice.
    return queue('invoice_already_' + inv.status, { invoice_id: inv.id, suggestions: open.filter((i) => amountMatches(invTotal(i), cents)).map((i) => i.id) });
  }

  if (parsed.tier_token && pricingRows && !isTopupToken(parsed.tier_token)) {
    const row = pricingRows.find((r) => r.tier_code === inv.tier_code);
    if (row && tierRefCode(row) !== parsed.tier_token) return queue('tier_mismatch', { invoice_id: inv.id, suggestions: [inv.id] });
  }

  const total = invTotal(inv);
  if (amountMatches(total, cents, TOLERANCE_CENTS)) {
    return {
      action: 'mark_paid', reason: 'reference_and_amount', invoice_id: inv.id, suggestions: [],
      event: paymentReceived({
        source: credit.source === 'statement' ? 'statement' : credit.source === 'manual' ? 'manual' : 'incontact',
        method: 'manual_eft',
        invoice_reference: inv.reference,
        broker_ref: parsed.broker_ref,
        tier_code: inv.tier_code,
        period: parsed.period,
        amount_cents: cents,
        paid_at: credit.received_at,
        external_id: credit.external_id || credit.graph_message_id || credit.id,
        bank_credit_id: credit.id || null,
      }),
    };
  }
  if (cents < total) {
    const earlier = credits.filter((c) => c.id !== credit.id && c.match_status !== 'duplicate' && (c.parsed_reference === parsed.canonical || c.parsed_reference === inv.reference)).reduce((s, c) => s + centsOf(c), 0);
    return queue('partial', { invoice_id: inv.id, suggestions: [inv.id], short_by_cents: total - cents, partials_total_cents: earlier + cents, partials_cover_invoice: amountMatches(total, earlier + cents) || earlier + cents > total });
  }
  return queue('overpaid', { invoice_id: inv.id, suggestions: [inv.id], over_by_cents: cents - total });
}

/**
 * W18: statement lines vs stored bank_credits. Each credit line either confirms an inContact credit
 * (same amount, same date, compatible reference) or is new (the parser missed it -> matchCredit).
 * inContact credits with no statement line after `graceDays` business days are gaps (alert).
 */
function reconcileStatement(lines, credits, { asOf = new Date(), gapDays = 2 } = {}) {
  const used = new Set();
  const confirmations = [];
  const fresh = [];
  for (const l of lines.filter((x) => x.direction === 'credit')) {
    const lref = l.parsed_reference;
    const hit = credits.find((c) => !used.has(c.id) && c.source === 'incontact' && c.match_status !== 'duplicate' && centsOf(c) === l.amount_cents &&
      sastDate(c.received_at) === l.posted_on && (!lref || !c.parsed_reference || lref === c.parsed_reference));
    if (hit) { used.add(hit.id); confirmations.push({ bank_credit_id: hit.id, statement_external_id: l.external_id }); continue; }
    const already = credits.find((c) => c.source === 'statement' && c.external_id === l.external_id);
    if (already) continue;
    fresh.push({ source: 'statement', external_id: l.external_id, received_at: l.posted_on + 'T10:00:00.000Z', amount_cents: l.amount_cents, amount_zar: l.amount_cents / 100,
      reference_raw: l.reference_raw, parsed_reference: l.parsed_reference, match_status: 'unmatched' });
  }
  const cutoff = new Date(asOf).getTime() - gapDays * 86400000;
  const gaps = credits.filter((c) => c.source === 'incontact' && c.match_status !== 'duplicate' && !c.statement_confirmed_at && !used.has(c.id) && new Date(c.received_at).getTime() < cutoff)
    .map((c) => ({ bank_credit_id: c.id, amount_cents: centsOf(c), received_at: c.received_at, parsed_reference: c.parsed_reference || null }));
  return { confirmations, new_credits: fresh, gaps };
}

/** Daily reconciliation report (6.5 item 4): expected vs received, unmatched, overdue. Plain words for the pulse. */
function dailyReport({ invoices = [], credits = [], asOf = new Date(), day } = {}) {
  const d = day || sastDate(asOf);
  const inDay = (iso) => iso && sastDate(iso) === d;
  const expected = invoices.filter((i) => i.status === 'issued' && i.due_at && sastDate(i.due_at) <= d);
  const paidToday = invoices.filter((i) => i.status === 'paid' && inDay(i.paid_at));
  const creditsToday = credits.filter((c) => inDay(c.received_at) && c.match_status !== 'duplicate' && c.source !== 'paystack_settlement');
  const unmatched = credits.filter((c) => c.match_status === 'unmatched');
  const overdue = invoices.filter((i) => i.status === 'issued' && i.due_at && new Date(i.due_at) < new Date(asOf));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const r = {
    day: d,
    expected: { count: expected.length, cents: sum(expected, invTotal) },
    received: { count: creditsToday.length, cents: sum(creditsToday, centsOf) },
    paid_today: { count: paidToday.length, cents: sum(paidToday, invTotal) },
    unmatched: unmatched.map((c) => ({ bank_credit_id: c.id, amount_cents: centsOf(c), reference_raw: c.reference_raw || null, received_at: c.received_at })),
    overdue: overdue.map((i) => ({ invoice_id: i.id, reference: i.reference, total_cents: invTotal(i), due_at: i.due_at })),
    unconfirmed_incontact: credits.filter((c) => c.source === 'incontact' && c.match_status === 'auto' && !c.statement_confirmed_at).map((c) => c.id),
  };
  const zar = (c) => 'R' + (c / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  r.lines = [
    `Payments ${d}: ${r.paid_today.count} invoice(s) paid, ${zar(r.paid_today.cents)}.`,
    `Bank credits received: ${r.received.count}, ${zar(r.received.cents)}.`,
    r.unmatched.length ? `${r.unmatched.length} payment(s) need you to assign them (console > Billing).` : 'Every credit is matched.',
    r.overdue.length ? `${r.overdue.length} invoice(s) past due. Those cycles are not renewed (no grace).` : 'Nothing past due.',
  ];
  r.status = r.unmatched.length ? 'amber' : 'green';
  return r;
}

module.exports = { matchCredit, reconcileStatement, dailyReport, SETTLEMENT_RE };
