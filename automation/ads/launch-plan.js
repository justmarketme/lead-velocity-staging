'use strict';
/* Launch plan + budget maths for SortMyCover ads. Pure functions, no network, no dependencies.
 * Source of the defaults: deliverables/media-buyer/campaign-spec.md sections 6, 11, 12 and setup-checklist G8.
 * Every rand figure is EXCL. VAT (the number typed into Meta). Meta bills 15% on top (NH-22 a).
 * `media_share_zar` in the pricing table is VAT-INCLUSIVE: daily budget entered in Meta = share / 1.15 / 30.
 * The console mirrors DEFAULT_LAUNCH_PLAN in src/lib/smcAdsPlan.ts; automation/ads/launch-plan.test.js asserts the two are identical.
 * The live plan is a jsonb row in public.ads_launch_plan (editable in the console); these defaults seed it. */

const VAT_RATE = 0.15;
const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const floor2 = (x) => Math.floor(Number(x) * 100 + 1e-6) / 100;

/** Daily budget ENTERED in Meta (excl. VAT) for a VAT-inclusive media share. */
const dailyFromShare = (shareZar) => floor2(Number(shareZar) / (1 + VAT_RATE) / 30); // floored so daily x 30 never exceeds the monthly cap
/** Monthly cap ENTERED in Meta (excl. VAT) for a VAT-inclusive media share (or sum of shares). */
const monthlyFromShare = (shareZar) => r2(Number(shareZar) / (1 + VAT_RATE));

const DEFAULT_LAUNCH_PLAN = {
  version: 1,
  currency: 'ZAR',
  vat_basis: 'excl_vat',
  note: 'All amounts excl. VAT, as typed into Meta. Defaults from campaign-spec 12; Jonathan confirms. Source of truth for caps is pricing.media_share_zar.',
  bronze_media_share_zar: 8492, // sanity reference only (VAT-inclusive); the pricing table is the source
  campaigns: [
    { key: 'W', name: 'SMC_W_REACH_ZA_warmup', objective: 'OUTCOME_AWARENESS', role: 'Page warm-up (Reach, never a Boost)',
      daily_budget_zar: 50, duration_days: 7, monthly_cap_zar: 350, share_pct_all_on: null,
      starts: 'after_first_payment', human_gate: 'NH-31 a: Jonathan publishes. Organic posts first; paid Reach only after first payment.',
      notes: '7 days with an end date. South Africa 18+, Advantage+ placements without Audience Network, "Use existing post".' },
    { key: 'A', name: 'SMC_A_LEADS-IF_ZA_c1', objective: 'OUTCOME_LEADS', role: 'Primary: instant form leads',
      daily_budget_zar: 246, duration_days: null, monthly_cap_zar: 7384, share_pct_all_on: 60,
      starts: 'go_live', human_gate: 'R0 until Approve & go live; then sum(active media_share_zar) / 1.15 / 30.',
      notes: 'Cycle 1 = Bronze share. Monthly cap = Bronze R8,492 / 1.15. Changes in <= 20% steps once per 48 h after go-live.' },
    { key: 'B', name: 'SMC_B_LEADS-WEB_ZA_c1', objective: 'OUTCOME_LEADS', role: 'Website conversions (quiz page)',
      daily_budget_zar: null, duration_days: null, monthly_cap_zar: null, share_pct_all_on: 30,
      starts: 'trigger', human_gate: 'Switch on at monthly media >= R20,000 or A qualify rate < 50% (11.2). Built paused.',
      notes: 'Budget at switch-on = 30% of total daily media.' },
    { key: 'C', name: 'SMC_C_LEADS-CTWA_ZA_c1', objective: 'OUTCOME_LEADS', role: 'Click-to-WhatsApp test',
      daily_budget_zar: null, duration_days: null, monthly_cap_zar: null, share_pct_all_on: 10,
      starts: 'trigger', human_gate: 'Same switch-on trigger as B. Built paused.',
      notes: 'Budget at switch-on = 10% of total daily media. Judged on reply rate until >= 30 leads.' },
  ],
  guardrails: {
    daily_cap_multiplier: 1.2,   // daily cap per campaign = monthly cap / 30 x 1.2 (CONSOLE-ADS-API s1)
    max_step_pct: 20,            // campaign-spec 12: <= 20% increase per step
    step_cooldown_hours: 48,     // once per 48 h
    alert_pct: 80,               // alert at 80% of the monthly cap
    day_over_ratio: 1.5,         // alert if a single day > 1.5x daily budget
    min_daily_budget_zar: 20,    // ASSUMPTION (Meta minimum for ZAR leads); confirm in Ads Manager
  },
  rules: {                       // campaign-spec 11.1 / 11.1b (proposals only, Jonathan confirms)
    spend_gate_zar: 3000, cpl_max_zar: 250, qualify_min_pct: 60, cost_per_qualified_target_zar: 250,
    stop_day: 14, stop_cost_per_qualified_zar: 400, min_dispositions: 5, quality_pause_below: 2.5, quality_scale_at_least: 4,
    scale_step_pct: 20, hook_min_reels_pct: 30, hook_min_feed_pct: 25, hold_min_pct: 35, hook_min_impressions: 2000,
    good_fit_target_zar: 1300, good_fit_escalate_multiple: 1.5, // seed values; source = ops.watchlist_targets
  },
};

/** Merge a stored plan (jsonb) over the defaults so a half-filled or older row never breaks a caller. Mirrors mergePlan in smcAdsPlan.ts. */
function mergePlan(stored) {
  const base = JSON.parse(JSON.stringify(DEFAULT_LAUNCH_PLAN));
  if (!stored || typeof stored !== 'object') return base;
  const campaigns = Array.isArray(stored.campaigns) && stored.campaigns.length
    ? base.campaigns.map((d) => ({ ...d, ...(stored.campaigns.find((c) => c && c.key === d.key) || {}) })) : base.campaigns;
  return { ...base, ...stored, campaigns, guardrails: { ...base.guardrails, ...(stored.guardrails || {}) }, rules: { ...base.rules, ...(stored.rules || {}) } };
}

/* ---------------------------------------------------------------- validation (console edits) */
/** Returns { ok, errors[] }. Never throws. */
function validateLaunchPlan(plan) {
  const errors = [];
  const E = (m) => errors.push(m);
  if (!plan || !Array.isArray(plan.campaigns) || !plan.campaigns.length) return { ok: false, errors: ['plan.campaigns missing'] };
  const g = plan.guardrails || {};
  const min = Number(g.min_daily_budget_zar);
  if (!(min > 0)) E('guardrails.min_daily_budget_zar must be > 0');
  if (!(g.max_step_pct > 0 && g.max_step_pct <= 100)) E('guardrails.max_step_pct must be 1-100');
  if (!(g.daily_cap_multiplier >= 1 && g.daily_cap_multiplier <= 3)) E('guardrails.daily_cap_multiplier must be 1-3');
  if (!(g.alert_pct > 0 && g.alert_pct <= 100)) E('guardrails.alert_pct must be 1-100');
  const seen = new Set();
  let shares = 0;
  for (const c of plan.campaigns) {
    const k = c && c.key;
    if (!k || !/^[A-Z]$/.test(k)) { E('campaign.key must be a single capital letter'); continue; }
    if (seen.has(k)) E(`duplicate campaign ${k}`); seen.add(k);
    if (!/^SMC_[A-Z]_[A-Z-]+_ZA_[A-Za-z0-9]+$/.test(String(c.name || ''))) E(`${k}: name must look like SMC_${k}_OBJECTIVE_ZA_c1`);
    const d = c.daily_budget_zar;
    if (d != null) {
      if (!(Number(d) >= min)) E(`${k}: daily budget below the Meta minimum R${min}`);
      if (c.monthly_cap_zar != null && Number(d) * 30 > Number(c.monthly_cap_zar) * 1.0001 && !c.duration_days) E(`${k}: daily x 30 exceeds the monthly cap`);
      if (c.duration_days && c.monthly_cap_zar != null && Number(d) * c.duration_days > Number(c.monthly_cap_zar) * 1.0001) E(`${k}: daily x ${c.duration_days} days exceeds the cap`);
    }
    if (c.monthly_cap_zar != null && !(Number(c.monthly_cap_zar) > 0)) E(`${k}: monthly cap must be > 0`);
    if (c.duration_days != null && !(Number.isInteger(c.duration_days) && c.duration_days >= 1 && c.duration_days <= 31)) E(`${k}: duration_days must be 1-31`);
    if (c.share_pct_all_on != null) { if (!(c.share_pct_all_on >= 0 && c.share_pct_all_on <= 100)) E(`${k}: share must be 0-100`); shares += Number(c.share_pct_all_on); }
  }
  const sharing = plan.campaigns.filter((c) => c.share_pct_all_on != null);
  if (sharing.length && Math.abs(shares - 100) > 1e-9) E(`shares when all campaigns are on must add to 100 (got ${shares})`);
  return { ok: errors.length === 0, errors };
}

/* ---------------------------------------------------------------- caps for the guarded write */
/** Caps object for setCampaignBudget / checkBudget.
 *  - lead campaigns (A/B/C): monthly cap = sum of ACTIVE brokers' media_share_zar / 1.15 (never typed);
 *    daily cap = monthly / 30 x multiplier (or an explicit admin override).
 *  - warm-up (W): its own plan cap (daily x days) because it is Lead Velocity's money, not a broker share.
 *  Returns { dailyCapZar, monthlyCapZar, maxStepPct } or null monthly when there are no active shares (spend must be paused). */
function capsFor({ plan = DEFAULT_LAUNCH_PLAN, key, activeSharesZar = [], dailyCapOverrideZar = null }) {
  const g = plan.guardrails;
  const c = plan.campaigns.find((x) => x.key === key);
  if (!c) throw Object.assign(new Error(`unknown campaign ${key}`), { code: 'BAD_INPUT' });
  if (key === 'W') {
    const monthly = c.monthly_cap_zar != null ? Number(c.monthly_cap_zar) : Number(c.daily_budget_zar) * Number(c.duration_days || 7);
    const daily = dailyCapOverrideZar != null ? Number(dailyCapOverrideZar) : r2(Number(c.daily_budget_zar) * g.daily_cap_multiplier);
    return { dailyCapZar: daily, monthlyCapZar: monthly, maxStepPct: g.max_step_pct };
  }
  const total = activeSharesZar.reduce((s, x) => s + Number(x || 0), 0);
  // A is capped by the whole pool (it is the only lead campaign until B / C switch on); B and C by their share of it (campaign-spec 11.2).
  const pct = key === 'B' || key === 'C' ? Number(c.share_pct_all_on || 0) / 100 : 1;
  const monthly = r2(monthlyFromShare(total) * pct);
  const daily = dailyCapOverrideZar != null ? Number(dailyCapOverrideZar) : r2(monthly / 30 * g.daily_cap_multiplier);
  return { dailyCapZar: daily, monthlyCapZar: monthly, maxStepPct: g.max_step_pct };
}

/* ---------------------------------------------------------------- go-live raise and cycle-end lower (6.1 steps 5 and 7) */
/** After Jonathan taps Approve & go live: Campaign A daily budget = sum(active shares incl. this broker) / 1.15 / 30.
 *  `goLiveShareZar` binds the raise to this broker's own share so a go-live flag cannot lift the step limit for anything else. */
function goLiveBudgetPlan({ activeSharesZar, brokerShareZar, brokerId, plan = DEFAULT_LAUNCH_PLAN }) {
  const total = (activeSharesZar || []).reduce((s, x) => s + Number(x || 0), 0);
  if (!(Number(brokerShareZar) > 0)) throw Object.assign(new Error('brokerShareZar must be > 0'), { code: 'BAD_INPUT' });
  if (!(total >= Number(brokerShareZar) - 1e-9)) throw Object.assign(new Error('activeSharesZar must include the going-live broker'), { code: 'BAD_INPUT' });
  const caps = capsFor({ plan, key: 'A', activeSharesZar });
  return {
    action: 'set_campaign_budget', campaignKey: 'A',
    params: { dailyBudgetZar: dailyFromShare(total), setSpendCap: true, monthlyCapZar: caps.monthlyCapZar, goLive: true, goLiveShareZar: Number(brokerShareZar) },
    goLive: true, goLiveShareZar: Number(brokerShareZar), caps, reason: `go-live broker ${brokerId || '?'}`,
  };
}
/** Cycle end without payment: lower by the broker's share, or pause the campaign when no active share remains (budget cannot go to R0). */
function cycleEndPlan({ remainingSharesZar, brokerId, plan = DEFAULT_LAUNCH_PLAN }) {
  const total = (remainingSharesZar || []).reduce((s, x) => s + Number(x || 0), 0);
  if (total <= 0) return { action: 'pause_campaign', campaignKey: 'A', params: { status: 'PAUSED' }, reason: `cycle ended, broker ${brokerId || '?'} not renewed, no active share left` };
  const caps = capsFor({ plan, key: 'A', activeSharesZar: remainingSharesZar });
  return { action: 'set_campaign_budget', campaignKey: 'A', params: { dailyBudgetZar: dailyFromShare(total), setSpendCap: true, monthlyCapZar: caps.monthlyCapZar },
    caps, reason: `cycle ended, broker ${brokerId || '?'} not renewed` };
}

/** B/C budgets at switch-on: share of TOTAL daily media (campaign-spec 11.2). */
function splitDaily({ totalDailyZar, plan = DEFAULT_LAUNCH_PLAN }) {
  const out = {};
  for (const c of plan.campaigns) if (c.share_pct_all_on != null) out[c.key] = r2(Number(totalDailyZar) * c.share_pct_all_on / 100);
  return out;
}

/** Largest allowed single increase from `current` (floored to the cent so the step check never trips on rounding). */
const maxStepUp = (current, stepPct = 20) => floor2(Number(current) * (1 + stepPct / 100));

module.exports = { mergePlan, VAT_RATE, DEFAULT_LAUNCH_PLAN, dailyFromShare, monthlyFromShare, validateLaunchPlan, capsFor, goLiveBudgetPlan, cycleEndPlan, splitDaily, maxStepUp, r2 };
