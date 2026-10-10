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
// Amounts come from the seed, never typed here (price-diff, 3.6): one cycle of the first tier, and the minimum top-up.
const CYCLE_ZAR = rows[0].price_zar;
const MIN_TOPUP_ZAR = TOPUP.price_per_lead_zar * TOPUP.min_leads;

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
  assert.equal(a.total_zar, MIN_TOPUP_ZAR);
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
    { id: 'c', reference: 'LV-0007-B-202610', status: 'issued', tier_code: 'SMC_BRONZE', total_zar: CYCLE_ZAR },
    { id: 't', reference: 'LV-0007-T-202610', status: 'issued', tier_code: 'SMC_BRONZE', total_zar: MIN_TOPUP_ZAR },
  ];
  const credit = (r, amt) => ({ id: 'x' + r, source: 'incontact', amount_zar: amt, reference_raw: r, received_at: at.toISOString(), external_id: 'e' + r });
  const t = rec.matchCredit(credit('LV 0007 T 202610', MIN_TOPUP_ZAR), { invoices, credits: [], pricingRows: rows });
  assert.equal(t.action, 'mark_paid'); assert.equal(t.invoice_id, 't');
  const c = rec.matchCredit(credit('LV-0007-B-202610', CYCLE_ZAR), { invoices, credits: [], pricingRows: rows });
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

/* ------------------------------------------------------------------------------------------------------------------
 * Top-up refunds at the tier's Effective Lead Price (Jonathan, 2026-10-10).
 * NOTE for reviewers: before this decision an undelivered top-up lead was (a) credited by spreading the top-up leads into the
 * plan price (cycles.committed_leads includes paid top-ups, so price / committed under-credited every lead) and (b) capped at the
 * plan price alone. Now every undelivered lead, plan or top-up, is credited at the plan's Effective Lead Price, and the cap is
 * what the broker paid for the cycle's leads. Rates come only from pricing.seed.json: price_zar / committed_leads for the monthly
 * ladder, price_per_lead_zar for the Pilot. Nothing here types a price except the four pinned decision figures below.
 * ---------------------------------------------------------------------------------------------------------------- */
const pricing = require('./pricing');
const independentElp = (r) => Math.round(r.price_zar / r.committed_leads); // re-derived here on purpose, to check pricing.js

test("Effective Lead Price per tier is derived from the seed (monthly: price / committed; Pilot: its stated per-lead price)", () => {
  const elp = pricing.effectiveLeadPrices(seed);
  const expected = { [seed.pilot.tier_code]: seed.pilot.price_per_lead_zar };
  for (const r of rows) expected[r.tier_code] = independentElp(r);
  assert.deepEqual(elp, expected);
  // Jonathan's figures of 2026-10-10, pinned so a seed edit that moves a rate is noticed here
  assert.deepEqual(elp, { SMC_PILOT: 850, SMC_BRONZE: 825, SMC_SILVER: 817, SMC_GOLD: 789 });
  // the rate is the plan's: a cycle snapshot with top-ups paid gives the same rate (top-up leads are not spread into the plan price)
  for (const r of rows) assert.equal(pricing.effectiveLeadPriceZar({ price_zar: r.price_zar, committed_leads: r.committed_leads + 25, topup_leads: 25 }), independentElp(r));
  assert.equal(pricing.derived(rows[0]).price_per_committed_lead_zar, independentElp(rows[0]), "derived() uses the same single definition");
  assert.throws(() => pricing.effectiveLeadPriceZar({ price_zar: 1000, committed_leads: 10, topup_leads: 10 }), RangeError, "no plan leads, no rate");
});

test("checkTopup tells the broker what an undelivered top-up lead is refunded at: their tier's rate, not the top-up price", () => {
  for (const r of rows) {
    const c = tu.checkTopup({ qty: TOPUP.min_leads, cycle: { ...cycle, tier_code: r.tier_code, committed: r.committed_leads, verified: r.committed_leads }, topup: TOPUP, now: at, pricingRows: rows });
    assert.equal(c.ok, true, r.tier_code);
    assert.equal(c.refund_per_lead_zar, independentElp(r), r.tier_code);
    assert.notEqual(c.refund_per_lead_zar, TOPUP.price_per_lead_zar, `${r.tier_code}: refund must not be the top-up price`);
    assert.equal(c.amount_cents, TOPUP.min_leads * TOPUP.price_per_lead_zar * 100, "what they pay is still the top-up price");
  }
  // Pilot is not a pricing row: the seed's pilot object supplies it
  const p = tu.checkTopup({ qty: TOPUP.min_leads, cycle: { ...cycle, tier_code: seed.pilot.tier_code }, topup: TOPUP, now: at, pricingRows: rows, pilot: seed.pilot });
  assert.equal(p.refund_per_lead_zar, seed.pilot.price_per_lead_zar);
  // unknown tier: say nothing rather than guess (never fall back to the top-up price)
  assert.equal(tu.checkTopup({ qty: TOPUP.min_leads, cycle: { ...cycle, tier_code: "SMC_NOPE" }, topup: TOPUP, now: at, pricingRows: rows }).refund_per_lead_zar, null);
  assert.equal(tu.checkTopup({ qty: TOPUP.min_leads, cycle, topup: TOPUP, now: at }).refund_per_lead_zar, null, "no pricing rows given");
  assert.match(tu.topupRefundNote(independentElp(rows[0])), /Effective Lead Price \(R\d+ per lead\), not at the top-up price/);
  assert.doesNotMatch(tu.topupRefundNote(null), /R\d/);
  // buildTopupInvoice is unchanged for the broker: same amount, same reference
  assert.equal(tu.buildTopupInvoice({ broker, cycle, qty: 10, topup: TOPUP, pricingRows: rows, issuedAt: at }).total_zar, MIN_TOPUP_ZAR);
});

test("shortfall credit: undelivered top-up leads are credited at the tier rate and are not spread into the plan price", () => {
  for (const r of rows) {
    const elp = independentElp(r);
    const plan = r.committed_leads;
    const cyc = { price_zar: r.price_zar, committed_leads: plan + 10, topup_leads: 10 }; // 10 top-up leads paid and added by W16
    // plan fully delivered, 4 of the 10 top-up leads undelivered -> exactly 4 x the tier rate
    assert.equal(inv.shortfallCreditCents(cyc, plan + 6), 4 * elp * 100, r.tier_code);
    // the previous formula (plan price / TOTAL committed per missing lead) gave less, which is the bug being fixed
    const spreadIntoPlanPrice = Math.round((r.price_zar * 100 * 4) / (plan + 10));
    assert.ok(spreadIntoPlanPrice < 4 * elp * 100, `${r.tier_code}: old spread-in formula under-credited`);
    // a mix of plan and top-up leads short -> the same rate for each (a lead is a lead)
    assert.equal(inv.shortfallCreditCents(cyc, plan + 10 - 5), 5 * elp * 100);
    // nothing delivered at all: all plan leads (capped at the plan price) plus all 10 top-up leads at the tier rate
    const all = inv.shortfallCreditCents(cyc, 0);
    assert.equal(all, Math.min((plan + 10) * elp * 100, r.price_zar * 100 + 10 * elp * 100));
    assert.ok(all > r.price_zar * 100, `${r.tier_code}: the old plan-price cap would have refused to credit the top-up leads`);
    assert.ok(all <= r.price_zar * 100 + 10 * TOPUP.price_per_lead_zar * 100, "never more than the broker paid");
    // no top-ups: the plan alone, never above the plan price (rounding of the whole-rand rate cannot exceed it)
    assert.equal(inv.shortfallCreditCents({ price_zar: r.price_zar, committed_leads: plan }, plan - 2), 2 * elp * 100);
    assert.equal(inv.shortfallCreditCents({ price_zar: r.price_zar, committed_leads: plan }, 0), r.price_zar * 100);
    assert.equal(inv.shortfallCreditCents({ price_zar: r.price_zar, committed_leads: plan }, plan), 0, "delivered in full: no credit");
    assert.equal(inv.shortfallCreditCents(cyc, plan + 10 + 3), 0, "more than committed delivered: no credit");
    assert.equal(inv.shortfallCreditCents(cyc, -3), inv.shortfallCreditCents(cyc, 0), "negative effective (replacements) cannot credit more than the leads committed");
  }
});

test("W16: the top-up reply to the broker states the tier refund rate (generated node runs against the seed pricing rows)", async () => {
  const { runCode } = await import("../tests/_n8ncode.mjs");
  const NODE = "Top-up: check rules, build invoice (+ Paystack request)";
  const code = W16.nodes.find((n) => n.name === NODE).parameters.jsCode;
  assert.match(code, /pricingRows: pricing \|\| \[\]/);
  const bronze = rows.find((r) => r.tier_code === "SMC_BRONZE");
  const ctx = { broker: { id: broker.id, billing_ref: "7", email: "b@example.test" }, cycle: { ...cycle, committed: bronze.committed_leads, verified: bronze.committed_leads }, pricing: rows, taken: [], open_topup: null };
  const out = await runCode(W16, NODE, { json: { ctx }, refs: { "Top-up: verify broker JWT + body": { ok: true, qty: 10, method: "manual_eft" } } });
  const j = Array.isArray(out) ? out[0].json : out.json;
  assert.equal(j.respond, 200, JSON.stringify(j));
  assert.equal(j.total_zar, MIN_TOPUP_ZAR);
  assert.ok(j.message.includes(`(R${independentElp(bronze)} per lead), not at the top-up price`), j.message);
});
