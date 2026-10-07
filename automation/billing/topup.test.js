'use strict';
// Top-ups (agreement 9). Offline. Run: node --test automation/billing/topup.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const seed = require('./pricing.seed.json');
const tu = require('./topup');
const ref = require('./reference');
const inv = require('./invoice');
const rec = require('./reconcile');
const W16 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'W16.json'), 'utf8'));
const TOPUP = seed.topup;
const rows = seed.rows;
const cycle = { cycle_id: '11111111-1111-1111-1111-111111111111', status: 'active', committed: 20, verified: 20, tier_code: 'SMC_BRONZE' };
const broker = { id: '22222222-2222-2222-2222-222222222222', billing_ref: '7' };
const at = new Date('2026-10-15T10:00:00Z');

test('price, minimum and notice come from the seed', () => {
  assert.deepEqual(TOPUP, { price_per_lead_zar: 850, min_leads: 10, notice_days: 7 });
  const c = tu.checkTopup({ qty: 12, cycle, topup: TOPUP, now: at });
  assert.equal(c.ok, true);
  assert.equal(c.amount_cents, 12 * 85000);
  assert.equal(c.earliest_start, '2026-10-22T10:00:00.000Z');
});

test('refuses below minimum, non-integer, undelivered or inactive cycles', () => {
  assert.equal(tu.checkTopup({ qty: 9, cycle, topup: TOPUP }).reason, 'bad_qty');
  assert.equal(tu.checkTopup({ qty: 10.5, cycle, topup: TOPUP }).reason, 'bad_qty');
  assert.equal(tu.checkTopup({ qty: 10, cycle: { ...cycle, verified: 19 }, topup: TOPUP }).reason, 'not_delivered');
  assert.equal(tu.checkTopup({ qty: 10, cycle: { ...cycle, status: 'closed' }, topup: TOPUP }).reason, 'cycle_not_active');
  assert.equal(tu.checkTopup({ qty: 10, cycle: null, topup: TOPUP }).reason, 'no_cycle');
});

test('add_on invoice: unique T reference, amounts, parseable, <= 20 chars', () => {
  const a = tu.buildTopupInvoice({ broker, cycle, qty: 10, topup: TOPUP, existingReferences: ['LV-0007-B-202610'], pricingRows: rows, issuedAt: at });
  assert.equal(a.reference, 'LV-0007-T-202610');
  assert.equal(a.kind, 'add_on');
  assert.equal(a.topup_leads, 10);
  assert.equal(a.total_zar, 8500);
  assert.equal(a.vat_zar, null);
  assert.equal(a.method, 'manual_eft');
  const b = tu.buildTopupInvoice({ broker, cycle, qty: 10, topup: TOPUP, existingReferences: ['LV-0007-B-202610', a.reference], pricingRows: rows, issuedAt: at });
  assert.equal(b.reference, 'LV-0007-TB-202610');
  assert.ok(b.reference.length <= ref.MAX_BANK_REF);
  assert.equal(ref.parseReference(b.reference).tier_token, 'TB');
  assert.ok(tu.isTopupReference(b.reference) && !tu.isTopupReference('LV-0007-B-202610'));
});

test('a top-up in the month never pushes the next cycle invoice to another period', () => {
  const next = inv.buildInvoice({ broker, pricingRow: rows[0], cycleStart: at, existingReferences: ['LV-0007-T-202610'] });
  assert.equal(next.reference, 'LV-0007-B-202610');
});

test('EFT reconcile: top-up and cycle invoice in the same month each match their own payment', () => {
  const invoices = [
    { id: 'c', reference: 'LV-0007-B-202610', status: 'issued', tier_code: 'SMC_BRONZE', total_zar: 16500 },
    { id: 't', reference: 'LV-0007-T-202610', status: 'issued', tier_code: 'SMC_BRONZE', total_zar: 8500 },
  ];
  const credit = (r, amt) => ({ id: 'x' + r, source: 'incontact', amount_zar: amt, reference_raw: r, received_at: at.toISOString(), external_id: 'e' + r });
  const t = rec.matchCredit(credit('LV 0007 T 202610', 8500), { invoices, credits: [], pricingRows: rows });
  assert.equal(t.action, 'mark_paid'); assert.equal(t.invoice_id, 't');
  const c = rec.matchCredit(credit('LV-0007-B-202610', 16500), { invoices, credits: [], pricingRows: rows });
  assert.equal(c.action, 'mark_paid'); assert.equal(c.invoice_id, 'c');
});

test('broker request needs a valid Supabase JWT; method defaults to manual EFT', () => {
  const secret = 'x'.repeat(40);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub: broker.id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  const jwt = `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
  assert.equal(tu.parseTopupRequest({ headers: {}, body: { qty: 10 } }, { jwtSecret: secret }).status, 401);
  const ok = tu.parseTopupRequest({ headers: { Authorization: 'Bearer ' + jwt }, body: { qty: 10 } }, { jwtSecret: secret });
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(ok.method, 'manual_eft'); assert.equal(ok.qty, 10);
});

test('W16: POST /billing/topup exists, Mark paid adds top-ups to the cycle instead of creating one', () => {
  const names = W16.nodes.map((n) => n.name);
  assert.ok(W16.nodes.some((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters.path === 'billing/topup'));
  for (const n of ['Top-up: issue add_on invoice (idempotent)', 'Top-up: respond EFT invoice', 'Top-up: Paystack initialize transaction']) assert.ok(names.includes(n), n);
  const mark = W16.nodes.find((n) => n.name === 'Mark invoice paid + create cycle').parameters.query;
  assert.match(mark, /committed_leads = c\.committed_leads \+ inv\.topup_leads/);
  assert.match(mark, /where inv\.kind <> 'add_on'/);
  const plan = W16.nodes.find((n) => n.name === 'Top-up: check rules, build invoice (+ Paystack request)').parameters.jsCode;
  assert.ok(plan.includes(JSON.stringify(TOPUP)), 'TOPUP inlined from the seed');
});
