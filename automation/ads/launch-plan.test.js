'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LP = require('./launch-plan.js');
const M = require('./meta-ads.js');

const clone = (o) => JSON.parse(JSON.stringify(o));
const camp = (k) => LP.DEFAULT_LAUNCH_PLAN.campaigns.find((c) => c.key === k);
const client = () => M.createClient({ token: 'T', confirmSecret: 'test-secret-0123456789abcdef', fetchImpl: async () => { throw new Error('no network in tests'); } });

test('defaults are seeded from campaign-spec (warm-up R50 x 7 d, A R246/day, R7,384 cap, B 30 / C 10), all excl. VAT', () => {
  const p = LP.DEFAULT_LAUNCH_PLAN;
  assert.equal(p.vat_basis, 'excl_vat');
  assert.equal(camp('W').name, 'SMC_W_REACH_ZA_warmup');
  assert.equal(camp('W').daily_budget_zar, 50); assert.equal(camp('W').duration_days, 7); assert.equal(camp('W').monthly_cap_zar, 350);
  assert.equal(camp('A').name, 'SMC_A_LEADS-IF_ZA_c1'); assert.equal(camp('A').daily_budget_zar, 246); assert.equal(camp('A').monthly_cap_zar, 7384);
  assert.equal(camp('B').share_pct_all_on, 30); assert.equal(camp('C').share_pct_all_on, 10); assert.equal(camp('A').share_pct_all_on, 60);
  assert.equal(LP.dailyFromShare(p.bronze_media_share_zar), 246.14); // Bronze R8,492 incl. VAT -> about R246 entered
  assert.equal(LP.monthlyFromShare(p.bronze_media_share_zar), 7384.35); // spec: R7,384 entered
  assert.equal(Math.round(LP.dailyFromShare(12738)), 369); assert.equal(Math.round(LP.dailyFromShare(19108)), 554); // Silver / Gold sanity values, campaign-spec 12
  assert.equal(LP.validateLaunchPlan(p).ok, true, LP.validateLaunchPlan(p).errors.join('; '));
});

test('validation: minimum, caps, shares add to 100, duplicate keys, names', () => {
  const bad = (mut) => { const p = clone(LP.DEFAULT_LAUNCH_PLAN); mut(p); return LP.validateLaunchPlan(p); };
  assert.equal(bad((p) => { p.campaigns[0].daily_budget_zar = 5; }).ok, false);   // below the Meta minimum
  assert.equal(bad((p) => { p.campaigns[1].daily_budget_zar = 400; }).ok, false); // 400 x 30 > R7,384 cap
  assert.equal(bad((p) => { p.campaigns[2].share_pct_all_on = 50; }).ok, false);  // shares != 100
  assert.equal(bad((p) => { p.campaigns[3].key = 'B'; }).ok, false);              // duplicate key
  assert.equal(bad((p) => { p.campaigns[1].name = 'my campaign'; }).ok, false);
  assert.equal(bad((p) => { p.campaigns[0].duration_days = 0; }).ok, false);
  assert.equal(bad((p) => { p.guardrails.max_step_pct = 0; }).ok, false);
  assert.equal(LP.validateLaunchPlan(null).ok, false);
});

test('caps come from the active media shares (never typed); warm-up has its own cap', () => {
  const a = LP.capsFor({ key: 'A', activeSharesZar: [8492] });
  assert.equal(a.monthlyCapZar, 7384.35); assert.equal(a.dailyCapZar, 295.37); assert.equal(a.maxStepPct, 20);
  assert.equal(LP.capsFor({ key: 'A', activeSharesZar: [8492, 12738] }).monthlyCapZar, LP.r2(21230 / 1.15));
  assert.equal(LP.capsFor({ key: 'A', activeSharesZar: [] }).monthlyCapZar, 0);
  const w = LP.capsFor({ key: 'W' });
  assert.equal(w.monthlyCapZar, 350); assert.equal(w.dailyCapZar, 60);
  assert.equal(LP.capsFor({ key: 'A', activeSharesZar: [8492], dailyCapOverrideZar: 260 }).dailyCapZar, 260);
});

test('go-live plan: A goes from the minimum to sum(share)/1.15/30 and passes the guarded check', () => {
  const g = LP.goLiveBudgetPlan({ activeSharesZar: [8492], brokerShareZar: 8492, brokerId: 'mark' });
  assert.equal(g.params.dailyBudgetZar, 246.14); assert.equal(g.params.monthlyCapZar, 7384.35); assert.equal(g.params.goLive, true); assert.equal(g.params.goLiveShareZar, 8492);
  assert.equal(g.reason, 'go-live broker mark');
  const c = client();
  assert.doesNotThrow(() => c.checkBudget({ dailyBudgetZar: g.params.dailyBudgetZar, currentDailyBudgetZar: 20, caps: g.caps, goLive: true, goLiveShareZar: g.goLiveShareZar }));
  // second broker: raise by that broker share, from the first broker budget
  const g2 = LP.goLiveBudgetPlan({ activeSharesZar: [8492, 12738], brokerShareZar: 12738, brokerId: 'b2' });
  assert.equal(g2.params.dailyBudgetZar, LP.dailyFromShare(21230));
  assert.doesNotThrow(() => c.checkBudget({ dailyBudgetZar: g2.params.dailyBudgetZar, currentDailyBudgetZar: 246.14, caps: g2.caps, goLive: true, goLiveShareZar: 12738 }));
  assert.throws(() => LP.goLiveBudgetPlan({ activeSharesZar: [8492], brokerShareZar: 12738 }), (e) => e.code === 'BAD_INPUT');
});

test('cycle end: lower by the share, or pause the campaign when nobody is active (a budget cannot be R0)', () => {
  const low = LP.cycleEndPlan({ remainingSharesZar: [8492], brokerId: 'b2' });
  assert.equal(low.action, 'set_campaign_budget'); assert.equal(low.params.dailyBudgetZar, 246.14); assert.equal(low.params.monthlyCapZar, 7384.35);
  const none = LP.cycleEndPlan({ remainingSharesZar: [], brokerId: 'mark' });
  assert.equal(none.action, 'pause_campaign'); assert.deepEqual(none.params, { status: 'PAUSED' });
});

test('B / C switch-on split and the +20% step helper', () => {
  assert.deepEqual(LP.splitDaily({ totalDailyZar: 667 }), { A: 400.2, B: 200.1, C: 66.7 });
  assert.equal(LP.maxStepUp(246), 295.2);
  const caps = { dailyCapZar: 400, monthlyCapZar: 12000 };
  assert.doesNotThrow(() => client().checkBudget({ dailyBudgetZar: LP.maxStepUp(246), currentDailyBudgetZar: 246, caps }));
});

test('B and C are capped at their share of the pool; mergePlan keeps a half-filled row usable', () => {
  assert.equal(LP.capsFor({ key: 'B', activeSharesZar: [21230] }).monthlyCapZar, LP.r2(LP.monthlyFromShare(21230) * 0.3));
  assert.equal(LP.capsFor({ key: 'C', activeSharesZar: [21230] }).monthlyCapZar, LP.r2(LP.monthlyFromShare(21230) * 0.1));
  assert.equal(LP.capsFor({ key: 'A', activeSharesZar: [21230] }).monthlyCapZar, LP.monthlyFromShare(21230));
  assert.deepEqual(LP.mergePlan(null), LP.DEFAULT_LAUNCH_PLAN);
  const m = LP.mergePlan({ campaigns: [{ key: 'A', daily_budget_zar: 300 }], guardrails: { max_step_pct: 10 } });
  assert.equal(m.campaigns.length, 4); assert.equal(m.campaigns[1].daily_budget_zar, 300); assert.equal(m.campaigns[1].name, 'SMC_A_LEADS-IF_ZA_c1'); assert.equal(m.guardrails.alert_pct, 80);
});
