'use strict';
// The console mirrors launch-plan.js in src/lib/smcAdsPlan.ts (browser code cannot require the CJS file).
// This test fails if the two drift, and exercises the kill/scale proposal rules (campaign-spec 11.1 / 11.1b).
// Needs Node >= 22.18 (built-in TypeScript type stripping; smcAdsPlan.ts uses no enums or aliases).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const LP = require('./launch-plan.js');

let T;
test.before(async () => { T = await import(pathToFileURL(path.join(__dirname, '../../src/lib/smcAdsPlan.ts')).href); });

test('server and console defaults and maths are identical', () => {
  assert.deepEqual(T.DEFAULT_LAUNCH_PLAN, LP.DEFAULT_LAUNCH_PLAN);
  for (const share of [8492, 12738, 19108, 21230, 40338]) {
    assert.equal(T.dailyFromShare(share), LP.dailyFromShare(share));
    assert.equal(T.monthlyFromShare(share), LP.monthlyFromShare(share));
    assert.ok(T.dailyFromShare(share) * 30 <= T.monthlyFromShare(share) + 1e-9, 'daily x 30 never exceeds the monthly cap');
  }
  for (const v of [20, 246, 246.14, 615.36]) assert.equal(T.maxStepUp(v), LP.maxStepUp(v));
  for (const key of ['W', 'A', 'B', 'C']) assert.deepEqual(T.capsFor(T.DEFAULT_LAUNCH_PLAN, key, [8492, 12738]), LP.capsFor({ key, activeSharesZar: [8492, 12738] }));
  const half = { campaigns: [{ key: 'A', daily_budget_zar: 300 }], guardrails: { max_step_pct: 10 } };
  assert.deepEqual(T.mergePlan(half), LP.mergePlan(half));
  const g = LP.goLiveBudgetPlan({ activeSharesZar: [8492], brokerShareZar: 8492, brokerId: 'b1' });
  const t = T.goLiveBudgetPlan([8492], 8492, 'b1');
  assert.deepEqual({ ...g.params, reason: g.reason, action: g.action }, { dailyBudgetZar: t.dailyBudgetZar, setSpendCap: t.setSpendCap, monthlyCapZar: t.monthlyCapZar, goLive: t.goLive, goLiveShareZar: t.goLiveShareZar, reason: t.reason, action: t.action });
  const bad = JSON.parse(JSON.stringify(LP.DEFAULT_LAUNCH_PLAN)); bad.campaigns[1].daily_budget_zar = 5; bad.campaigns[2].share_pct_all_on = 50;
  assert.equal(T.validateLaunchPlan(bad).length, LP.validateLaunchPlan(bad).errors.length);
  assert.deepEqual(T.validateLaunchPlan(T.DEFAULT_LAUNCH_PLAN), []);
});

test('mergePlan keeps a half-filled stored row usable', () => {
  assert.deepEqual(T.mergePlan(null), T.DEFAULT_LAUNCH_PLAN);
  const m = T.mergePlan({ campaigns: [{ key: 'A', daily_budget_zar: 300 }], guardrails: { max_step_pct: 10 } });
  assert.equal(m.campaigns.find((c) => c.key === 'A').daily_budget_zar, 300);
  assert.equal(m.campaigns.find((c) => c.key === 'A').name, 'SMC_A_LEADS-IF_ZA_c1'); // untouched fields keep defaults
  assert.equal(m.campaigns.length, 4); assert.equal(m.guardrails.max_step_pct, 10); assert.equal(m.guardrails.alert_pct, 80);
});

const ad = (o) => ({ adId: 'a', name: 'C01_H1_vid-amb_20261015', status: 'ACTIVE', effectiveStatus: 'ACTIVE', spend: 0, leads: 0, qualified: 0, goodFit: 0, impressions: 0, qualityIndex: null, qualityN: 0, hookRatePct: null, holdRatePct: null, isReels: true, ...o });
const camp = (o) => ({ campaignId: 'CA', name: 'SMC_A_LEADS-IF_ZA_c1', status: 'ACTIVE', dailyBudgetZar: 246, lastBudgetChangeAt: null, spendSinceChange: 0, day: 3, leads: 0, qualified: 0, goodFit: 0, ratedMeetings: 0, ads: [], ...o });
const ids = (ps) => ps.map((p) => p.id);
const P = () => T.DEFAULT_LAUNCH_PLAN;

test('kill/scale: no action before the R3,000 gate, except a policy disapproval', () => {
  assert.deepEqual(T.killScaleProposals(P(), camp({ spendSinceChange: 1500, leads: 20, qualified: 5, ads: [ad({ adId: 'a1', spend: 1500, leads: 20, qualified: 5 })] })), []);
  const p = T.killScaleProposals(P(), camp({ ads: [ad({ adId: 'a1', effectiveStatus: 'DISAPPROVED' })] }));
  assert.deepEqual(ids(p), ['policy:a1']); assert.deepEqual(p[0].action, { kind: 'pause_ad', target: 'a1' });
});

test('kill: spend gate pauses the bottom 50% of creatives by cost per qualified lead', () => {
  const ads = [
    ad({ adId: 'best', spend: 800, leads: 10, qualified: 8 }), ad({ adId: 'good', spend: 900, leads: 10, qualified: 6 }),
    ad({ adId: 'poor', spend: 700, leads: 10, qualified: 2 }), ad({ adId: 'none', spend: 600, leads: 8, qualified: 0 }),
  ];
  const ps = T.killScaleProposals(P(), camp({ spendSinceChange: 3000, leads: 38, qualified: 16, ads }));
  assert.deepEqual(ids(ps).sort(), ['bottom50:none', 'bottom50:poor']);
  assert.ok(ps.every((p) => p.action.kind === 'pause_ad' && p.severity === 'act'));
  // healthy campaign past the gate: nothing
  assert.deepEqual(T.killScaleProposals(P(), camp({ spendSinceChange: 3000, leads: 20, qualified: 15, ads })).filter((p) => p.rule === '11.1 spend gate'), []);
});

test('kill: day 14 cost per qualified lead above R400 stops the campaign; R250-R400 only holds', () => {
  const stop = T.killScaleProposals(P(), camp({ day: 14, spendSinceChange: 4120, leads: 30, qualified: 10 }));
  assert.ok(ids(stop).includes('stop:CA')); assert.deepEqual(stop.find((p) => p.id === 'stop:CA').action, { kind: 'pause_campaign', target: 'CA' });
  const hold = T.killScaleProposals(P(), camp({ day: 14, spendSinceChange: 3300, leads: 30, qualified: 11 })); // R300
  assert.ok(ids(hold).includes('hold:CA')); assert.ok(!ids(hold).includes('stop:CA'));
  assert.deepEqual(ids(T.killScaleProposals(P(), camp({ day: 13, spendSinceChange: 4120, leads: 30, qualified: 10 }))).filter((i) => i.startsWith('stop')), []);
});

test('kill: broker quality below 2.5 with >= 5 ratings pauses the ad whatever its CPL', () => {
  const mk = (n) => T.killScaleProposals(P(), camp({ ads: [ad({ adId: 'q', spend: 400, leads: 5, qualified: 5, qualityIndex: 2.2, qualityN: n })] }));
  assert.deepEqual(ids(mk(5)), ['quality:q']); assert.deepEqual(mk(4), []);
});

test('scale: +20% once per 48 h for quality >= 4 with CPL and cost per qualified in range; blocked inside the cooldown', () => {
  const good = ad({ adId: 'w', spend: 1000, leads: 10, qualified: 8, qualityIndex: 4.3, qualityN: 6 });
  const ps = T.killScaleProposals(P(), camp({ ads: [good] }));
  const s = ps.find((p) => p.id === 'scale:CA');
  assert.equal(s.severity, 'act'); assert.deepEqual(s.action, { kind: 'set_campaign_budget', target: 'CA', dailyBudgetZar: 295.2 });
  const now = Date.now();
  const cool = T.killScaleProposals(P(), camp({ lastBudgetChangeAt: new Date(now - 3600e3).toISOString(), ads: [good] }), now).find((p) => p.id === 'scale:CA');
  assert.equal(cool.severity, 'watch'); assert.equal(cool.action.kind, 'info');
  const pricey = ad({ adId: 'w', spend: 3000, leads: 10, qualified: 8, qualityIndex: 4.3, qualityN: 6 }); // CPL R300
  assert.ok(!ids(T.killScaleProposals(P(), camp({ ads: [pricey] }))).includes('scale:CA'));
});

test('good-fit layer needs >= 5 rated meetings; > 1.5x target escalates, > target with a fine CPQ is a quality note, never a budget cut', () => {
  assert.deepEqual(ids(T.killScaleProposals(P(), camp({ spendSinceChange: 5000, qualified: 25, goodFit: 1, ratedMeetings: 4 }))), []);
  const stop = T.killScaleProposals(P(), camp({ spendSinceChange: 8000, qualified: 40, goodFit: 4, ratedMeetings: 6 })); // R2,000 per good fit
  assert.ok(ids(stop).includes('gf-stop:CA'));
  const note = T.killScaleProposals(P(), camp({ spendSinceChange: 6000, qualified: 30, goodFit: 4, ratedMeetings: 6 })); // R1,500 per good fit, R200 per qualified
  assert.deepEqual(ids(note).filter((i) => i.startsWith('gf')), ['gf-quality:CA']);
  assert.equal(note.find((p) => p.id === 'gf-quality:CA').action.kind, 'info');
});

test('hook / hold below the line marks the ad for replacement, never pauses it', () => {
  const ps = T.killScaleProposals(P(), camp({ ads: [ad({ adId: 'h', impressions: 2500, hookRatePct: 22, holdRatePct: 40 }), ad({ adId: 'ok', impressions: 2500, hookRatePct: 33, holdRatePct: 40 }), ad({ adId: 'few', impressions: 900, hookRatePct: 5, holdRatePct: 5 })] }));
  assert.deepEqual(ids(ps), ['replace:h']); assert.equal(ps[0].action.kind, 'info');
});

test('guardrail status: 80% of the monthly cap and a day above 1.5x the daily budget raise alerts', () => {
  const g = T.guardrailStatus({ plan: P(), monthSpendZar: 5950, monthlyCapZar: 7384.35, dailyBudgetZar: 246, daysRemaining: 6, todaySpendZar: 380 });
  assert.equal(g.alert, true); assert.equal(g.dayOver, true); assert.equal(Math.round(g.pctOfCap), 81); assert.equal(g.projectedZar, 5950 + 246 * 6);
  const ok = T.guardrailStatus({ plan: P(), monthSpendZar: 1000, monthlyCapZar: 7384.35, dailyBudgetZar: 246, daysRemaining: 25, todaySpendZar: 250 });
  assert.equal(ok.alert, false); assert.equal(ok.dayOver, false);
  assert.equal(T.guardrailStatus({ plan: P(), monthSpendZar: 0, monthlyCapZar: null, dailyBudgetZar: null, daysRemaining: 30, todaySpendZar: 0 }).pctOfCap, null);
});
