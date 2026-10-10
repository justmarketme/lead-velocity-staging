'use strict';
// Offline tests for SortMyCover billing. Run: node --test automation/billing/billing.test.js
// No network, no real bank data, no real keys. Prices come from pricing.seed.json (never typed here).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pricing = require('./pricing');
const money = require('./money');
const ref = require('./reference');
const ic = require('./incontact');
const rec = require('./reconcile');
const stmt = require('./statement');
const inv = require('./invoice');
const ps = require('./paystack');
const render = require('./render');

const rows = pricing.loadSeed();
const BRONZE = pricing.byTierCode(rows, 'SMC_BRONZE');
const SILVER = pricing.byTierCode(rows, 'SMC_SILVER');
const { samples } = require('./fixtures/incontact-samples.json');
const FAKE_SECRET = 'test-secret-not-a-real-key-0000';

/* ---------------------------------------------------------------- pricing + money */

test('pricing seed is valid and tier tokens are unique', () => {
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(pricing.tierRefCode), ['B', 'S', 'G']);
  assert.throws(() => pricing.validateRows([{ ...BRONZE }, { ...BRONZE }]), /duplicate/);
  assert.throws(() => pricing.validateRows([{ ...BRONZE, ref_code: null, tier_code: 'SMC_BRONZE' }, { ...SILVER, ref_code: null, tier_code: 'SMC_BASIC' }]), /not unique/);
});

test('unapproved rows (active_from null) render only in staging', () => {
  assert.equal(pricing.activeRows(rows).length, 0);
  assert.equal(pricing.activeRows(rows, { includeUnapproved: true }).length, 3);
  const approved = rows.map((r) => ({ ...r, active_from: '2026-10-01T00:00:00Z' }));
  assert.equal(pricing.activeRows(approved, { at: new Date('2026-10-02') }).length, 3);
  assert.equal(pricing.activeRows(approved, { at: new Date('2026-09-30') }).length, 0);
});

test('cycle amounts are excl. VAT until a vat_rate is set', () => {
  const a = pricing.cycleAmounts(BRONZE);
  assert.equal(a.excl_vat_cents, BRONZE.price_zar * 100);
  assert.equal(a.vat_cents, null);
  assert.equal(a.total_cents, a.excl_vat_cents);
  const v = pricing.cycleAmounts({ ...BRONZE, vat_rate: 0.15 });
  assert.equal(v.total_cents, Math.round(BRONZE.price_zar * 100 * 1.15));
});

test('money parser reads the ways banks write rands', () => {
  const cases = [['R12,345.67', 1234567], ['R 12 345.67', 1234567], ['ZAR12345', 1234500], ['12 345,67', 1234567], ['12.345,67', 1234567], ['R1.00', 100], ['R1,250', 125000], ['-R500.00', -50000], ['R9 876.54', 987654]];
  for (const [t, c] of cases) assert.equal(money.parseRandAmount(t), c, t);
  assert.equal(money.parseRandAmount('no amount'), null);
  assert.equal(money.formatZar(1234567), 'R12,345.67');
  assert.ok(money.withinTolerance(10000, 10100));
  assert.ok(!money.withinTolerance(10000, 10101));
});

/* ---------------------------------------------------------------- reference */

test('reference: 3.6 format is issued, short enough for a bank reference field', () => {
  const r = ref.formatReference({ brokerRef: 7, pricingRow: BRONZE, at: '2026-10-03T08:00:00Z' });
  assert.equal(r, 'LV-0007-B-202610');
  assert.ok(r.length <= ref.MAX_BANK_REF);
  assert.equal(ref.formatReference({ brokerRef: '123456', pricingRow: SILVER, at: '202701' }), 'LV-123456-S-202701');
  assert.throws(() => ref.formatReference({ brokerRef: 'a1b2c3d4-uuid', pricingRow: BRONZE }), /billing_ref/);
  // SAST month boundary: 22:30 UTC on 31 Oct is 1 Nov in Johannesburg.
  assert.equal(ref.period('2026-10-31T22:30:00Z'), '202611');
});

test('reference parser accepts 3.6, 6.5, compact, lower-case and Paystack-suffixed forms', () => {
  const cases = [
    ['LV-0007-B-202610', 'LV-0007-B-202610', '3.6', 'SMC_BRONZE'],
    ['lv 7 b 202610', 'LV-0007-B-202610', '3.6', 'SMC_BRONZE'],
    ['Ref.LV0007B202610 ACME', 'LV-0007-B-202610', '3.6', 'SMC_BRONZE'],
    ['LV-0007-202610', 'LV-0007-202610', '6.5', null],
    ['LV0007202610', 'LV-0007-202610', '6.5', null],
    ['LV-0007-S-202610-P2', 'LV-0007-S-202610', '3.6', 'SMC_SILVER'],
    ['PAYMENT LV_42_G_202701 THANKS', 'LV-0042-G-202701', '3.6', 'SMC_GOLD'],
  ];
  for (const [t, canon, fmt, tier] of cases) {
    const p = ref.parseReference(t, rows);
    assert.ok(p, t);
    assert.equal(p.canonical, canon, t);
    assert.equal(p.format, fmt, t);
    assert.equal(p.tier_code, tier, t);
  }
  assert.equal(ref.parseReference('LV-0007-B-202613', rows), null, 'month 13');
  assert.equal(ref.parseReference('ACME BROKERS OCT', rows), null);
  assert.equal(ref.parseReference('LV-0007-X-202610', rows).tier_known, false);
  assert.ok(ref.sameInvoice(ref.parseReference('LV-0007-202610'), 'LV-0007-B-202610'), 'legacy form matches the issued invoice');
  assert.ok(!ref.sameInvoice(ref.parseReference('LV-0007-S-202610'), 'LV-0007-B-202610'), 'different tier token');
  assert.equal(ref.paystackReference('LV-0007-B-202610', 3), 'LV-0007-B-202610-P3');
});

/* ---------------------------------------------------------------- inContact */

test('inContact: the 20 synthetic alerts parse as expected', () => {
  assert.equal(samples.length, 20);
  for (const s of samples) {
    const r = ic.parseAlert(s, { pricingRows: rows });
    const e = s.expect;
    assert.equal(r.filtered.pass, e.pass, `${s.id} filter (${r.filtered.reason})`);
    if (e.reason) assert.equal(r.filtered.reason, e.reason, s.id);
    for (const k of ['recognised', 'direction', 'amount_cents', 'parsed_reference', 'occurred_at', 'account_tail', 'reference_raw']) {
      if (k in e) assert.equal(r[k], e[k], `${s.id} ${k}`);
    }
  }
});

test('inContact: only recognised credits become bank_credits rows', () => {
  const credits = samples.map((s) => ic.toBankCredit(ic.parseAlert(s, { pricingRows: rows }))).filter(Boolean);
  // 20 samples - 3 filtered out - 1 unrecognised - 2 debits = 14 credits
  assert.equal(credits.length, 14);
  for (const c of credits) {
    assert.equal(c.source, 'incontact');
    assert.ok(c.graph_message_id && c.amount_cents > 0 && c.received_at);
  }
});

test('inContact: format-change detector alerts on an unreadable FNB alert and warns on a new shape', () => {
  const parsed = samples.map((s) => ic.parseAlert(s, { pricingRows: rows }));
  const d = ic.detectFormatChange(parsed, []);
  assert.equal(d.level, 'alert');
  assert.deepEqual(d.unrecognised.map((u) => u.graph_message_id), ['SYNTH-MSG-14']);
  const readable = parsed.filter((p) => p.recognised);
  const learned = ic.detectFormatChange(readable, []);
  assert.equal(learned.level, 'warn');
  const again = ic.detectFormatChange(readable, learned.known_after);
  assert.equal(again.level, 'ok');
  // Same wording, different values -> same fingerprint
  assert.equal(ic.fingerprint('FNB :-) R1.00 paid to cheq a/c..111 @ Eft. Ref.LV-0001-B-202610. 03Oct 09:14'),
    ic.fingerprint('FNB :-) R22,000.00 paid to cheq a/c..999 @ Eft. Ref.LV-0042-G-202701. 28Nov 17:59'));
});

/* ---------------------------------------------------------------- matching */

function invoiceFor(brokerRef, row, total_cents, status = 'issued', period = '202610', extra = {}) {
  const reference = `LV-${String(brokerRef).padStart(4, '0')}-${pricing.tierRefCode(row)}-${period}`;
  return { id: `inv-${reference}`, reference, tier_code: row.tier_code, total_cents, status, due_at: '2026-10-05T22:00:00Z', ...extra };
}
const creditFrom = (sampleNo, id) => {
  const c = ic.toBankCredit(ic.parseAlert(samples[sampleNo - 1], { pricingRows: rows }));
  return { ...c, id: id || `bc-${sampleNo}` };
};

test('match: reference + amount within R1 -> mark paid and fire payment.received', () => {
  const invoices = [invoiceFor(1, BRONZE, 1234500)];
  const d = rec.matchCredit(creditFrom(1), { invoices, credits: [], pricingRows: rows });
  assert.equal(d.action, 'mark_paid');
  assert.equal(d.invoice_id, invoices[0].id);
  assert.equal(d.event.event, 'payment.received');
  assert.equal(d.event.method, 'manual_eft');
  assert.equal(d.event.source, 'incontact');
  assert.equal(d.event.amount_cents, 1234500);
  assert.equal(d.event.idempotency_key, 'payment.received:incontact:SYNTH-MSG-01');
  // +R1 and -R1 still match; R1.01 does not
  for (const [total, act] of [[1234400, 'mark_paid'], [1234600, 'mark_paid'], [1234399, 'queue'], [1234601, 'queue']]) {
    assert.equal(rec.matchCredit(creditFrom(1), { invoices: [invoiceFor(1, BRONZE, total)], pricingRows: rows }).action, act, String(total));
  }
});

test('match: legacy 6.5 reference without tier still matches the invoice', () => {
  const d = rec.matchCredit(creditFrom(4), { invoices: [invoiceFor(4, SILVER, 1000000)], pricingRows: rows });
  assert.equal(d.action, 'mark_paid');
});

test('match: partial payment -> console queue with what is short', () => {
  const invoices = [invoiceFor(1, BRONZE, 1234500)];
  const d = rec.matchCredit(creditFrom(6), { invoices, credits: [], pricingRows: rows });
  assert.equal(d.action, 'queue');
  assert.equal(d.reason, 'partial');
  assert.equal(d.short_by_cents, 1234500 - 500000);
  assert.deepEqual(d.suggestions, [invoices[0].id]);
});

test('match: overpayment -> queue', () => {
  const d = rec.matchCredit(creditFrom(1), { invoices: [invoiceFor(1, BRONZE, 1000000)], pricingRows: rows });
  assert.equal(d.reason, 'overpaid');
  assert.equal(d.over_by_cents, 234500);
});

test('match: a re-sent alert is a duplicate and is never counted twice', () => {
  const first = { ...creditFrom(1), match_status: 'auto', matched_invoice_id: 'inv-x' };
  const d = rec.matchCredit(creditFrom(7), { invoices: [invoiceFor(1, BRONZE, 1234500, 'paid')], credits: [first], pricingRows: rows });
  assert.equal(d.action, 'duplicate');
  assert.equal(d.reason, 'resent_alert');
  assert.equal(d.duplicate_of, first.id);
});

test('match: the same credit from the other feed on the same day is a duplicate; a real second payment is not', () => {
  const first = { ...creditFrom(1), match_status: 'auto' };
  const manual = { ...creditFrom(1, 'bc-manual'), source: 'manual', received_at: '2026-10-03T12:00:00Z' };
  assert.equal(rec.matchCredit(manual, { credits: [first], invoices: [], pricingRows: rows }).reason, 'already_counted_other_feed');
  // A second, genuine payment of the same amount later in the day: not a duplicate -> invoice already paid -> queue
  const second = { ...creditFrom(1, 'bc-second'), graph_message_id: 'SYNTH-MSG-99', received_at: '2026-10-03T13:40:00Z' };
  const d = rec.matchCredit(second, { credits: [first], invoices: [invoiceFor(1, BRONZE, 1234500, 'paid')], pricingRows: rows });
  assert.equal(d.action, 'queue');
  assert.equal(d.reason, 'invoice_already_paid');
});

test('match: no reference -> queue with amount suggestions and a POP request', () => {
  const invoices = [invoiceFor(11, BRONZE, 777700), invoiceFor(12, SILVER, 999900)];
  const d = rec.matchCredit(creditFrom(8), { invoices, pricingRows: rows });
  assert.equal(d.reason, 'no_reference');
  assert.equal(d.ask_pop, true);
  assert.deepEqual(d.suggestions, [invoices[0].id]);
});

test('match: unknown broker, wrong period and wrong tier all queue; settlements never mark paid', () => {
  assert.equal(rec.matchCredit(creditFrom(1), { invoices: [invoiceFor(2, BRONZE, 1234500)], pricingRows: rows }).reason, 'unknown_broker_ref');
  assert.equal(rec.matchCredit(creditFrom(1), { invoices: [invoiceFor(1, BRONZE, 1234500, 'issued', '202611')], pricingRows: rows }).reason, 'period_mismatch');
  assert.equal(rec.matchCredit(creditFrom(1), { invoices: [invoiceFor(1, SILVER, 1234500)], pricingRows: rows }).reason, 'tier_mismatch');
  assert.equal(rec.matchCredit(creditFrom(9), { invoices: [invoiceFor(1, BRONZE, 321050)], pricingRows: rows }).action, 'settlement');
});

/* ---------------------------------------------------------------- statement + report */

const CSV = [
  'Account,987654,Synthetic statement',
  'Date,Amount,Balance,Description',
  '2026/10/03,12345.00,50000.00,"LV-0001-B-202610"',
  '2026/10/03,-2000.00,48000.00,"SUPPLIER"',
  '2026/10/04,2222.22,50222.22,"FNB APP PAYMENT FROM LV0010S202610"',
].join('\n');
const OFX = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261003120000<TRNAMT>12345.00<FITID>SYN0001<NAME>LV-0001-B-202610</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003130000<TRNAMT>-2000.00<FITID>SYN0002<NAME>SUPPLIER</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('statement: CSV and OFX parse to signed lines with stable ids', () => {
  const c = stmt.parseStatement(CSV, { pricingRows: rows });
  assert.equal(c.format, 'csv');
  assert.equal(c.lines.length, 3);
  assert.equal(c.lines[0].amount_cents, 1234500);
  assert.equal(c.lines[0].parsed_reference, 'LV-0001-B-202610');
  assert.equal(c.lines[1].direction, 'debit');
  assert.equal(c.lines[2].parsed_reference, 'LV-0010-S-202610');
  assert.equal(stmt.parseStatement(CSV).lines[0].external_id, c.lines[0].external_id);
  const o = stmt.parseStatement(OFX, { pricingRows: rows });
  assert.equal(o.format, 'ofx');
  assert.equal(o.lines[0].external_id, 'fitid:SYN0001');
  assert.equal(o.lines[0].posted_on, '2026-10-03');
});

test('statement: confirms inContact credits, surfaces missed credits and flags gaps', () => {
  const lines = stmt.parseStatement(CSV, { pricingRows: rows }).lines;
  const seen = { ...creditFrom(1), match_status: 'auto' };
  const lost = { ...creditFrom(3), match_status: 'auto' }; // 4 Oct, never on the statement
  const r = rec.reconcileStatement(lines, [seen, lost], { asOf: new Date('2026-10-08T00:00:00Z') });
  assert.deepEqual(r.confirmations.map((x) => x.bank_credit_id), [seen.id]);
  assert.equal(r.new_credits.length, 1);
  assert.equal(r.new_credits[0].parsed_reference, 'LV-0010-S-202610');
  assert.deepEqual(r.gaps.map((g) => g.bank_credit_id), [lost.id]);
});

test('daily report: expected vs received, unmatched, overdue', () => {
  const invoices = [
    invoiceFor(1, BRONZE, 1234500, 'paid', '202610', { paid_at: '2026-10-03T07:14:00Z' }),
    invoiceFor(2, SILVER, 987654, 'issued', '202610', { due_at: '2026-10-01T22:00:00Z' }),
  ];
  const credits = [{ ...creditFrom(1), match_status: 'auto' }, { ...creditFrom(8), match_status: 'unmatched' }];
  const r = rec.dailyReport({ invoices, credits, asOf: new Date('2026-10-03T18:00:00Z') });
  assert.equal(r.day, '2026-10-03');
  assert.equal(r.paid_today.count, 1);
  assert.equal(r.overdue.length, 1);
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.status, 'amber');
  assert.ok(r.lines.join(' ').includes('no grace'));
});

/* ---------------------------------------------------------------- invoices */

test('invoice: amount, tier and period from pricing; next free period when two cycles start in one month; shortfall credit', () => {
  const a = inv.buildInvoice({ broker: { id: 'b-uuid', billing_ref: 7 }, pricingRow: BRONZE, cycleStart: '2026-10-01T08:00:00Z', dueAt: '2026-09-30T22:00:00Z' });
  assert.equal(a.reference, 'LV-0007-B-202610');
  assert.equal(a.total_cents, BRONZE.price_zar * 100);
  assert.equal(a.vat_zar, null);
  const b = inv.buildInvoice({ broker: { billing_ref: 7 }, pricingRow: BRONZE, cycleStart: '2026-10-31T08:00:00Z', existingReferences: [a.reference] });
  assert.equal(b.reference, 'LV-0007-B-202611');
  // NOTE (Jonathan 2026-10-10): the credit is now missing leads x the plan's Effective Lead Price in whole rand (price / committed
  // as published), no longer an unrounded pro rata of the price. Bronze divides exactly, so its figure is unchanged; Silver does
  // not (the published rate is the rounded one). Top-up cases are in topup.test.js.
  const credit = inv.shortfallCreditCents(BRONZE, BRONZE.committed_leads - 2);
  assert.equal(credit, 2 * Math.round(BRONZE.price_zar / BRONZE.committed_leads) * 100);
  assert.equal(credit, Math.round((BRONZE.price_zar * 100 * 2) / BRONZE.committed_leads), 'Bronze: same as the old pro rata');
  assert.equal(inv.shortfallCreditCents(SILVER, SILVER.committed_leads - 1), Math.round(SILVER.price_zar / SILVER.committed_leads) * 100, 'Silver: the published whole-rand rate');
  const c = inv.buildInvoice({ broker: { billing_ref: 7 }, pricingRow: BRONZE, cycleStart: '2026-12-01T08:00:00Z', creditCents: credit });
  assert.equal(c.total_cents, BRONZE.price_zar * 100 - credit);
});

/* ---------------------------------------------------------------- Paystack */

const sign = (raw, key = FAKE_SECRET) => crypto.createHmac('sha512', key).update(raw).digest('hex');

test('paystack: signature verification (valid, tampered, wrong key, missing)', () => {
  const raw = JSON.stringify({ event: 'charge.success', data: { id: 1 } });
  assert.equal(ps.verifyWebhook(raw, { 'X-Paystack-Signature': sign(raw) }, FAKE_SECRET).ok, true);
  assert.equal(ps.verifyWebhook(Buffer.from(raw), { 'x-paystack-signature': sign(raw) }, FAKE_SECRET).ok, true);
  assert.equal(ps.verifyWebhook(raw.replace('1', '2'), { 'x-paystack-signature': sign(raw) }, FAKE_SECRET).reason, 'signature_mismatch');
  assert.equal(ps.verifyWebhook(raw, { 'x-paystack-signature': sign(raw, 'other-key') }, FAKE_SECRET).ok, false);
  assert.equal(ps.verifyWebhook(raw, {}, FAKE_SECRET).reason, 'missing_or_malformed_signature');
  assert.equal(ps.verifyWebhook(JSON.parse(raw), { 'x-paystack-signature': sign(raw) }, FAKE_SECRET).reason, 'raw_body_required');
});

const invoice = inv.buildInvoice({ broker: { billing_ref: 7 }, pricingRow: BRONZE, cycleStart: '2026-10-01T08:00:00Z' });

test('paystack: map the four subscribed events to the W16 shapes', () => {
  const charge = { event: 'charge.success', data: { id: 9001, status: 'success', reference: ref.paystackReference(invoice.reference, 1), amount: invoice.total_cents, currency: 'ZAR', channel: 'eft', paid_at: '2026-10-01T09:00:00Z',
    metadata: { invoice_reference: invoice.reference, tier_code: 'SMC_BRONZE', autorenew_opt_in: false }, customer: { customer_code: 'CUS_synthetic' }, authorization: { authorization_code: 'AUTH_synthetic', reusable: true } } };
  const e = ps.mapWebhookEvent(charge, { pricingRows: rows });
  assert.equal(e.event, 'payment.received');
  assert.equal(e.method, 'instant_eft');
  assert.equal(e.invoice_reference, invoice.reference);
  assert.equal(e.broker_ref, '0007');
  assert.equal(e.idempotency_key, 'payment.received:paystack:txn:9001');
  assert.equal(e.paystack.authorization_code, null, 'no token kept without opt-in');
  const card = ps.mapWebhookEvent({ ...charge, data: { ...charge.data, channel: 'card', metadata: { ...charge.data.metadata, autorenew_opt_in: true } } }, { pricingRows: rows });
  assert.equal(card.method, 'card');
  assert.equal(card.paystack.authorization_code, 'AUTH_synthetic');
  assert.equal(ps.mapWebhookEvent({ event: 'subscription.create', data: { subscription_code: 'SUB_x', email_token: 't', plan: { plan_code: 'PLN_x' }, customer: { customer_code: 'CUS_x' } } }).event, 'card_autorenew.enabled');
  assert.equal(ps.mapWebhookEvent({ event: 'subscription.disable', data: { subscription_code: 'SUB_x' } }).event, 'card_autorenew.disabled');
  const failed = ps.mapWebhookEvent({ event: 'invoice.payment_failed', data: { invoice_code: 'INV_x', amount: invoice.total_cents, subscription: { subscription_code: 'SUB_x' } } });
  assert.equal(failed.event, 'payment.failed');
  assert.equal(ps.mapWebhookEvent({ event: 'transfer.success', data: {} }).event, 'ignored');
  assert.equal(ps.mapWebhookEvent({ ...charge, data: { ...charge.data, currency: 'NGN' } }).event, 'ignored');
});

test('paystack: request builders take every amount from pricing; Instant EFT is the default rail', () => {
  const page = ps.build.paymentPage(BRONZE);
  assert.equal(page.method, 'POST');
  assert.equal(page.body.amount, BRONZE.price_zar * 100);
  assert.equal(ps.build.paymentPage({ ...BRONZE, paystack_page_code: 'sortmycover-bronze-cycle' }).method, 'PUT');
  const plan = ps.build.plan(SILVER);
  assert.equal(plan.body.amount, SILVER.price_zar * 100);
  assert.equal(plan.body.interval, 'monthly');
  const init = ps.build.initialize({ invoice, email: 'broker@example.test', env: {} });
  assert.deepEqual(init.body.channels, ['eft', 'capitec_pay']);
  assert.equal(init.body.reference, invoice.reference + '-P1');
  assert.equal(init.body.metadata.autorenew_opt_in, false);
  const card = ps.build.initialize({ invoice, email: 'broker@example.test', method: 'card', autorenewOptIn: true });
  assert.deepEqual(card.body.channels, ['card']);
  assert.equal(card.body.metadata.autorenew_opt_in, true);
  assert.equal(ps.build.initialize({ invoice, email: 'b@example.test', method: 'instant_eft', autorenewOptIn: true }).body.metadata.autorenew_opt_in, false, 'auto-renew only on card');
  assert.equal(ps.build.refund({ transaction: 9001 }).path, '/refund');
  assert.equal(ps.build.chargeAuthorization({ invoice, email: 'b@example.test', authorization_code: 'AUTH_x', attempt: 2 }).body.reference, invoice.reference + '-P2');
});

test('paystack: client refuses live keys before GATE-R1-LIVE and sends specs with the secret only in the header', async () => {
  assert.throws(() => ps.createClient({ secretKey: 'sk_' + 'live_' + 'x'.repeat(10) }), /live key refused/);
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ status: true, data: { slug: 'sortmycover-bronze-cycle', plan_code: 'PLN_synthetic' } }) }; };
  const c = ps.createClient({ secretKey: FAKE_SECRET, fetchImpl: fakeFetch });
  const page = await c.createPaymentPage(BRONZE);
  const plan = await c.createPlan(BRONZE);
  await c.verifyTransaction('LV-0007-B-202610-P1');
  await c.refund({ transaction: 9001 });
  assert.deepEqual(ps.codesFromResponses({ page, plan }), { paystack_page_code: 'sortmycover-bronze-cycle', paystack_plan_code: 'PLN_synthetic' });
  assert.equal(calls[0].url, 'https://api.paystack.co/page');
  assert.equal(calls[2].url, 'https://api.paystack.co/transaction/verify/LV-0007-B-202610-P1');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + FAKE_SECRET);
  assert.ok(!calls[0].init.body.includes(FAKE_SECRET));
  const failing = ps.createClient({ secretKey: FAKE_SECRET, fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ status: false, message: 'Invalid' }) }) });
  await assert.rejects(failing.verifyTransaction('x'), /Invalid/);
});

test('paystack: verified transaction must match the invoice before W16 marks it paid', () => {
  const good = { status: 'success', currency: 'ZAR', amount: invoice.total_cents, reference: invoice.reference + '-P1', metadata: { invoice_reference: invoice.reference } };
  assert.equal(ps.checkVerifiedTransaction(good, invoice).ok, true);
  assert.equal(ps.checkVerifiedTransaction({ ...good, amount: 100 }, invoice).reason, 'amount_mismatch');
  assert.equal(ps.checkVerifiedTransaction({ ...good, status: 'abandoned' }, invoice).reason, 'not_success');
  assert.equal(ps.checkVerifiedTransaction({ ...good, metadata: { invoice_reference: 'LV-0008-B-202610' } }, invoice).reason, 'reference_mismatch');
});

/* ---------------------------------------------------------------- W25 renderers + price-diff */

test('render: tier cards and Schedule A come from the rows passed in', () => {
  const changed = rows.map((r) => (r.tier_code === 'SMC_BRONZE' ? { ...r, price_zar: r.price_zar + 1000, active_from: '2026-01-01' } : { ...r, active_from: '2026-01-01' }));
  const html = render.renderTierCards(changed, { at: new Date('2026-10-02') });
  assert.ok(html.includes(money.formatZar((BRONZE.price_zar + 1000) * 100)));
  assert.ok(html.includes('Start on Bronze'));
  assert.ok(html.includes(render.LINE_UNDER_CARDS));
  assert.equal(render.renderTierCards(rows).includes('tier-card"'), false, 'nothing renders before approval');
  const sched = render.merge('R{{price_zar}} / {{committed_leads}} / {{replacement_cap_cycle}} / {{payment_reference}} / {{exclusivity_terms | default: "None."}}',
    render.scheduleAVars(BRONZE, { payment_reference: invoice.reference }));
  assert.equal(sched, `${money.formatZar(BRONZE.price_zar * 100)} / ${BRONZE.committed_leads} / ${BRONZE.replacement_cap_cycle} / ${invoice.reference} / None.`);
  const json = JSON.parse(render.checkoutPricingJson(rows, { includeUnapproved: true }));
  assert.equal(json[0].price_cents, BRONZE.price_zar * 100);
});

test('price-diff: fails on a typed tier price, passes on a clean tree', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-'));
  const script = path.join(__dirname, 'price-diff.mjs');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'ok.ts'), 'export const budgetBand = "R750 to R1,250";\n');
  const run = () => { try { execFileSync(process.execPath, [script, '--json'], { env: { ...process.env, PRICE_DIFF_ROOT: dir } }); return 0; } catch (e) { return e.status; } };
  assert.equal(run(), 0);
  fs.writeFileSync(path.join(dir, 'src', 'bad.ts'), `export const price = "${money.formatZar(SILVER.price_zar * 100)}";\n`);
  assert.equal(run(), 1);
  fs.writeFileSync(path.join(dir, 'src', 'bad.ts'), `export const price = "${money.formatZar(SILVER.price_zar * 100)}"; // price-diff:allow test\n`);
  assert.equal(run(), 0);
});

test('price-diff: generated reports and signed documents are not flagged (NH-18 d), surfaces still are', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-'));
  const script = path.join(__dirname, 'price-diff.mjs');
  const typed = money.formatZar(SILVER.price_zar * 100);
  const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  const run = () => { try { return { code: 0, out: execFileSync(process.execPath, [script, '--json'], { env: { ...process.env, PRICE_DIFF_ROOT: dir }, encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) }; } };
  put('landing/reports/lighthouse-x.report.json', JSON.stringify({ text: `Silver ${typed}` }));
  put('analytics/out/week-2.report.html', `<p>${typed}</p>`);
  put('contracts/signed/term-sheet-acme.md', `Fee ${typed}\n`);
  put('contracts/acme-agreement-signed.md', `Fee ${typed}\n`);
  put('contracts/term-sheet-mark.md', `<!-- price-diff:signed-document 2026-10-02 -->\n# Term sheet\nFee ${typed}\n`);
  let r = run();
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(r.out).signed_skipped, ['contracts/term-sheet-mark.md']);
  // The marker only counts at the top of the file, and a page called "reports" is still a surface.
  put('contracts/draft.md', `# Draft\n\n\n\n\nFee ${typed}\n<!-- price-diff:signed-document -->\n`);
  assert.equal(run().code, 1);
  fs.rmSync(path.join(dir, 'contracts', 'draft.md'));
  put('src/pages/reports.tsx', `export const fee = "${typed}";\n`);
  r = run();
  assert.equal(r.code, 1);
  assert.deepEqual(Object.keys(JSON.parse(r.out).failing_files), ['src/pages/reports.tsx']);
});
