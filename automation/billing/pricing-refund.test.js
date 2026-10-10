'use strict';
// Offline test: refunds of undelivered Top-Up Leads (agreement clauses 6.5 and 11.6, Jonathan 10 Oct 2026).
// An undelivered top-up lead is refunded at the Effective Lead Price of the client's plan at the time,
// NOT at the flat top-up price. Run:  node --test automation/billing/pricing-refund.test.js
// The seed is the only place a price is typed (price-diff.mjs). The decision's rand figures (price-diff:allow on each line):
const DECISION = { SMC_PILOT: 850, SMC_BRONZE: 825, SMC_SILVER: 817, SMC_GOLD: 789 }; // price-diff:allow
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pricing = require('./pricing');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'pricing.seed.json'), 'utf8'));
const rows = pricing.loadSeed();
const effective = (r) => pricing.derived(r).price_per_committed_lead_zar;
const pilotRow = { price_zar: seed.pilot.price_per_lead_zar * seed.pilot.committed_leads, committed_leads: seed.pilot.committed_leads };

test("top-up refund rate = the plan's Effective Lead Price (Pilot, Bronze, Silver, Gold as decided on 10 Oct 2026)", () => {
  assert.equal(effective(pilotRow), DECISION.SMC_PILOT, 'Pilot');
  for (const code of ['SMC_BRONZE', 'SMC_SILVER', 'SMC_GOLD']) assert.equal(effective(pricing.byTierCode(rows, code)), DECISION[code], code);
  // Silver and Gold do not divide evenly: the Effective Lead Price is rounded to the nearest rand
  assert.notEqual(pricing.byTierCode(rows, 'SMC_SILVER').price_zar % pricing.byTierCode(rows, 'SMC_SILVER').committed_leads, 0);
});

test('the seed says top-up leads are bought at the flat top-up price but refunded on the plan price', () => {
  assert.equal(seed.topup.price_per_lead_zar, DECISION.SMC_PILOT, 'the top-up price is the flat figure');
  assert.equal(seed.topup.refund_basis, 'plan_effective_lead_price');
  for (const code of ['SMC_BRONZE', 'SMC_SILVER', 'SMC_GOLD']) {
    assert.ok(effective(pricing.byTierCode(rows, code)) < seed.topup.price_per_lead_zar, `${code}: the refund rate is below the top-up price, so a flat top-up refund would be wrong`);
  }
});

test('the per-cycle replacement cap is data only: the weekly rule is 3 on every plan', () => {
  assert.equal(seed.terms.goodwill_replacements_per_week, 3);
  assert.ok(rows.every((r) => r.replacement_cap_cycle > 0), 'kept in the data (history), drives nothing');
  assert.match(seed._comment_replacements, /DATA ONLY/);
  assert.match(seed._comment_replacements, /unreachable/i);
});
