/**
 * SortMyCover ads: launch plan, budget maths and kill/scale proposals for the console Ads screen.
 * Pure, no imports, no network (so node can load it for tests: automation/ads/launch-plan.parity.test.js).
 *
 * Mirror of automation/ads/launch-plan.js (the server side that meta-ads.js and n8n use). The parity test fails if
 * DEFAULT_LAUNCH_PLAN or the maths drift apart. Every rand figure is EXCL. VAT, the number typed into Meta (NH-22 a:
 * `pricing.media_share_zar` is VAT-inclusive, daily budget entered = share / 1.15 / 30).
 * Kill/scale rules are campaign-spec 11.1 / 11.1b. They only PROPOSE: a human taps, the two-step confirm runs, nothing here applies.
 */

export interface LaunchCampaign {
  key: string; name: string; objective: string; role: string;
  daily_budget_zar: number | null; duration_days: number | null; monthly_cap_zar: number | null; share_pct_all_on: number | null;
  starts: "after_first_payment" | "go_live" | "trigger"; human_gate: string; notes: string;
}
export interface LaunchGuardrails {
  daily_cap_multiplier: number; max_step_pct: number; step_cooldown_hours: number; alert_pct: number; day_over_ratio: number; min_daily_budget_zar: number;
}
export interface LaunchRules {
  spend_gate_zar: number; cpl_max_zar: number; qualify_min_pct: number; cost_per_qualified_target_zar: number;
  stop_day: number; stop_cost_per_qualified_zar: number; min_dispositions: number; quality_pause_below: number; quality_scale_at_least: number;
  scale_step_pct: number; hook_min_reels_pct: number; hook_min_feed_pct: number; hold_min_pct: number; hook_min_impressions: number;
  good_fit_target_zar: number; good_fit_escalate_multiple: number;
}
export interface LaunchPlan {
  version: number; currency: "ZAR"; vat_basis: "excl_vat"; note: string; bronze_media_share_zar: number;
  campaigns: LaunchCampaign[]; guardrails: LaunchGuardrails; rules: LaunchRules;
}

export const VAT_RATE = 0.15;
const r2 = (x: number) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const floor2 = (x: number) => Math.floor(Number(x) * 100 + 1e-6) / 100;

/** Daily budget ENTERED in Meta (excl. VAT) for a VAT-inclusive media share. Floored so daily x 30 never exceeds the monthly cap. */
export const dailyFromShare = (shareZar: number) => floor2(Number(shareZar) / (1 + VAT_RATE) / 30);
/** Monthly cap ENTERED in Meta (excl. VAT) for a VAT-inclusive media share (or the sum of active shares). */
export const monthlyFromShare = (shareZar: number) => r2(Number(shareZar) / (1 + VAT_RATE));
/** Largest single increase from `current` (floored to the cent so the 20% step check never trips on rounding). */
export const maxStepUp = (current: number, stepPct = 20) => floor2(Number(current) * (1 + stepPct / 100));
/** What Meta bills for an entered (excl. VAT) amount. Display only. */
export const incVat = (exVatZar: number) => r2(Number(exVatZar) * (1 + VAT_RATE));

export const DEFAULT_LAUNCH_PLAN: LaunchPlan = {
  version: 1,
  currency: "ZAR",
  vat_basis: "excl_vat",
  note: "All amounts excl. VAT, as typed into Meta. Defaults from campaign-spec 12; Jonathan confirms. Source of truth for caps is pricing.media_share_zar.",
  bronze_media_share_zar: 8492,
  campaigns: [
    { key: "W", name: "SMC_W_REACH_ZA_warmup", objective: "OUTCOME_AWARENESS", role: "Page warm-up (Reach, never a Boost)",
      daily_budget_zar: 50, duration_days: 7, monthly_cap_zar: 350, share_pct_all_on: null,
      starts: "after_first_payment", human_gate: "NH-31 a: Jonathan publishes. Organic posts first; paid Reach only after first payment.",
      notes: "7 days with an end date. South Africa 18+, Advantage+ placements without Audience Network, \"Use existing post\"." },
    { key: "A", name: "SMC_A_LEADS-IF_ZA_c1", objective: "OUTCOME_LEADS", role: "Primary: instant form leads",
      daily_budget_zar: 246, duration_days: null, monthly_cap_zar: 7384, share_pct_all_on: 60,
      starts: "go_live", human_gate: "R0 until Approve & go live; then sum(active media_share_zar) / 1.15 / 30.",
      notes: "Cycle 1 = Bronze share. Monthly cap = Bronze R8,492 / 1.15. Changes in <= 20% steps once per 48 h after go-live." },
    { key: "B", name: "SMC_B_LEADS-WEB_ZA_c1", objective: "OUTCOME_LEADS", role: "Website conversions (quiz page)",
      daily_budget_zar: null, duration_days: null, monthly_cap_zar: null, share_pct_all_on: 30,
      starts: "trigger", human_gate: "Switch on at monthly media >= R20,000 or A qualify rate < 50% (11.2). Built paused.",
      notes: "Budget at switch-on = 30% of total daily media." },
    { key: "C", name: "SMC_C_LEADS-CTWA_ZA_c1", objective: "OUTCOME_LEADS", role: "Click-to-WhatsApp test",
      daily_budget_zar: null, duration_days: null, monthly_cap_zar: null, share_pct_all_on: 10,
      starts: "trigger", human_gate: "Same switch-on trigger as B. Built paused.",
      notes: "Budget at switch-on = 10% of total daily media. Judged on reply rate until >= 30 leads." },
  ],
  guardrails: { daily_cap_multiplier: 1.2, max_step_pct: 20, step_cooldown_hours: 48, alert_pct: 80, day_over_ratio: 1.5, min_daily_budget_zar: 20 },
  rules: {
    spend_gate_zar: 3000, cpl_max_zar: 250, qualify_min_pct: 60, cost_per_qualified_target_zar: 250,
    stop_day: 14, stop_cost_per_qualified_zar: 400, min_dispositions: 5, quality_pause_below: 2.5, quality_scale_at_least: 4,
    scale_step_pct: 20, hook_min_reels_pct: 30, hook_min_feed_pct: 25, hold_min_pct: 35, hook_min_impressions: 2000,
    good_fit_target_zar: 1300, good_fit_escalate_multiple: 1.5,
  },
};

/** Merge a stored plan (jsonb) over the defaults so a half-filled or older row never breaks the screen. */
export function mergePlan(stored: Partial<LaunchPlan> | null | undefined): LaunchPlan {
  const base = JSON.parse(JSON.stringify(DEFAULT_LAUNCH_PLAN)) as LaunchPlan;
  if (!stored || typeof stored !== "object") return base;
  const campaigns = Array.isArray(stored.campaigns) && stored.campaigns.length
    ? base.campaigns.map((d) => ({ ...d, ...(stored.campaigns!.find((c) => c && c.key === d.key) || {}) }))
    : base.campaigns;
  return { ...base, ...stored, campaigns, guardrails: { ...base.guardrails, ...(stored.guardrails || {}) }, rules: { ...base.rules, ...(stored.rules || {}) } } as LaunchPlan;
}

/** Console edits: returns messages, empty when valid. Mirrors validateLaunchPlan in launch-plan.js. */
export function validateLaunchPlan(plan: LaunchPlan | null | undefined): string[] {
  const errors: string[] = [];
  if (!plan || !Array.isArray(plan.campaigns) || !plan.campaigns.length) return ["plan.campaigns missing"];
  const g = plan.guardrails || ({} as LaunchGuardrails);
  const min = Number(g.min_daily_budget_zar);
  if (!(min > 0)) errors.push("guardrails.min_daily_budget_zar must be > 0");
  if (!(g.max_step_pct > 0 && g.max_step_pct <= 100)) errors.push("guardrails.max_step_pct must be 1-100");
  if (!(g.daily_cap_multiplier >= 1 && g.daily_cap_multiplier <= 3)) errors.push("guardrails.daily_cap_multiplier must be 1-3");
  if (!(g.alert_pct > 0 && g.alert_pct <= 100)) errors.push("guardrails.alert_pct must be 1-100");
  const seen = new Set<string>();
  let shares = 0;
  for (const c of plan.campaigns) {
    const k = c && c.key;
    if (!k || !/^[A-Z]$/.test(k)) { errors.push("campaign.key must be a single capital letter"); continue; }
    if (seen.has(k)) errors.push(`duplicate campaign ${k}`);
    seen.add(k);
    if (!/^SMC_[A-Z]_[A-Z-]+_ZA_[A-Za-z0-9]+$/.test(String(c.name || ""))) errors.push(`${k}: name must look like SMC_${k}_OBJECTIVE_ZA_c1`);
    const d = c.daily_budget_zar;
    if (d != null) {
      if (!(Number(d) >= min)) errors.push(`${k}: daily budget below the Meta minimum R${min}`);
      if (c.monthly_cap_zar != null && Number(d) * 30 > Number(c.monthly_cap_zar) * 1.0001 && !c.duration_days) errors.push(`${k}: daily x 30 exceeds the monthly cap`);
      if (c.duration_days && c.monthly_cap_zar != null && Number(d) * c.duration_days > Number(c.monthly_cap_zar) * 1.0001) errors.push(`${k}: daily x ${c.duration_days} days exceeds the cap`);
    }
    if (c.monthly_cap_zar != null && !(Number(c.monthly_cap_zar) > 0)) errors.push(`${k}: monthly cap must be > 0`);
    if (c.duration_days != null && !(Number.isInteger(c.duration_days) && c.duration_days >= 1 && c.duration_days <= 31)) errors.push(`${k}: duration_days must be 1-31`);
    if (c.share_pct_all_on != null) { if (!(c.share_pct_all_on >= 0 && c.share_pct_all_on <= 100)) errors.push(`${k}: share must be 0-100`); shares += Number(c.share_pct_all_on); }
  }
  if (plan.campaigns.some((c) => c.share_pct_all_on != null) && Math.abs(shares - 100) > 1e-9) errors.push(`shares when all campaigns are on must add to 100 (got ${shares})`);
  return errors;
}

export interface Caps { dailyCapZar: number; monthlyCapZar: number; maxStepPct: number }
/** Caps shown on the screen. The edge function recomputes them server-side; the browser never sends caps. */
export function capsFor(plan: LaunchPlan, key: string, activeSharesZar: number[] = [], dailyCapOverrideZar: number | null = null): Caps {
  const g = plan.guardrails;
  const c = plan.campaigns.find((x) => x.key === key);
  if (!c) throw new Error(`unknown campaign ${key}`);
  if (key === "W") {
    const monthly = c.monthly_cap_zar != null ? Number(c.monthly_cap_zar) : Number(c.daily_budget_zar) * Number(c.duration_days || 7);
    return { dailyCapZar: dailyCapOverrideZar != null ? Number(dailyCapOverrideZar) : r2(Number(c.daily_budget_zar) * g.daily_cap_multiplier), monthlyCapZar: monthly, maxStepPct: g.max_step_pct };
  }
  // A is capped by the whole pool; B and C by their share of it (campaign-spec 11.2).
  const pct = key === "B" || key === "C" ? Number(c.share_pct_all_on || 0) / 100 : 1;
  const monthly = r2(monthlyFromShare(activeSharesZar.reduce((s, x) => s + Number(x || 0), 0)) * pct);
  return { dailyCapZar: dailyCapOverrideZar != null ? Number(dailyCapOverrideZar) : r2(monthly / 30 * g.daily_cap_multiplier), monthlyCapZar: monthly, maxStepPct: g.max_step_pct };
}

export interface GoLivePlan {
  action: "set_campaign_budget"; dailyBudgetZar: number; setSpendCap: true; monthlyCapZar: number; goLive: true; goLiveShareZar: number; reason: string;
}
/** Approve & go live: A daily budget = sum(active shares incl. this broker) / 1.15 / 30, the raise bound to this broker's share. */
export function goLiveBudgetPlan(activeSharesZar: number[], brokerShareZar: number, brokerId: string): GoLivePlan {
  const total = activeSharesZar.reduce((s, x) => s + Number(x || 0), 0);
  if (!(Number(brokerShareZar) > 0)) throw new Error("brokerShareZar must be > 0");
  if (!(total >= Number(brokerShareZar) - 1e-9)) throw new Error("activeSharesZar must include the going-live broker");
  return { action: "set_campaign_budget", dailyBudgetZar: dailyFromShare(total), setSpendCap: true, monthlyCapZar: monthlyFromShare(total), goLive: true, goLiveShareZar: Number(brokerShareZar), reason: `go-live broker ${brokerId}` };
}

// ---------------------------------------------------------------- guardrail status (what the screen shows)
export interface GuardrailStatus { monthSpendZar: number; monthlyCapZar: number | null; pctOfCap: number | null; alert: boolean; projectedZar: number | null; dayOverRatio: number | null; dayOver: boolean }
export function guardrailStatus(o: { plan: LaunchPlan; monthSpendZar: number; monthlyCapZar: number | null; dailyBudgetZar: number | null; daysRemaining: number; todaySpendZar: number }): GuardrailStatus {
  const cap = o.monthlyCapZar != null && o.monthlyCapZar > 0 ? o.monthlyCapZar : null;
  const pct = cap ? (o.monthSpendZar / cap) * 100 : null;
  const ratio = o.dailyBudgetZar && o.dailyBudgetZar > 0 ? o.todaySpendZar / o.dailyBudgetZar : null;
  return {
    monthSpendZar: o.monthSpendZar, monthlyCapZar: cap, pctOfCap: pct, alert: pct != null && pct >= o.plan.guardrails.alert_pct,
    projectedZar: o.dailyBudgetZar != null ? o.monthSpendZar + o.dailyBudgetZar * o.daysRemaining : null,
    dayOverRatio: ratio, dayOver: ratio != null && ratio > o.plan.guardrails.day_over_ratio,
  };
}

// ---------------------------------------------------------------- kill / scale proposals (11.1, 11.1b)
export interface AdFacts {
  adId: string; name: string; status: string | null; effectiveStatus: string | null;
  spend: number; leads: number; qualified: number; goodFit: number; impressions: number;
  qualityIndex: number | null; qualityN: number; hookRatePct: number | null; holdRatePct: number | null; isReels: boolean;
}
export interface CampaignFacts {
  campaignId: string; name: string; status: string | null; dailyBudgetZar: number | null; lastBudgetChangeAt: string | null;
  spendSinceChange: number; day: number; leads: number; qualified: number; goodFit: number; ratedMeetings: number; ads: AdFacts[];
}
export type ProposalAction =
  | { kind: "pause_ad"; target: string }
  | { kind: "pause_campaign"; target: string }
  | { kind: "set_campaign_budget"; target: string; dailyBudgetZar: number }
  | { kind: "info" };
export interface KillScaleProposal { id: string; rule: string; severity: "act" | "watch" | "info"; title: string; why: string; action: ProposalAction }

const active = (s: string | null) => (s || "").toUpperCase() === "ACTIVE";
const costPer = (spend: number, n: number) => (n > 0 ? spend / n : null);

/** Proposals only. Nothing here changes Meta; the screen turns an "act" row into the two-step confirm dialog. */
export function killScaleProposals(plan: LaunchPlan, c: CampaignFacts, now: number = Date.now()): KillScaleProposal[] {
  const R = plan.rules;
  const out: KillScaleProposal[] = [];
  const cpl = costPer(c.spendSinceChange, c.leads);
  const cpq = costPer(c.spendSinceChange, c.qualified);
  const qualifyPct = c.leads > 0 ? (c.qualified / c.leads) * 100 : null;

  // Policy disapproval: any time (the one exception to "no changes before day 14").
  for (const a of c.ads) {
    if ((a.effectiveStatus || "").toUpperCase() === "DISAPPROVED" && active(a.status)) {
      out.push({ id: `policy:${a.adId}`, rule: "11.1 policy", severity: "act", title: `Pause ${a.name}`, why: "Meta disapproved this ad. Pause it, fix per campaign-spec 10.7, resubmit.", action: { kind: "pause_ad", target: a.adId } });
    }
  }

  // Broker dispositions: quality index below the line with enough ratings.
  for (const a of c.ads) {
    if (active(a.status) && a.qualityIndex != null && a.qualityN >= R.min_dispositions && a.qualityIndex < R.quality_pause_below) {
      out.push({ id: `quality:${a.adId}`, rule: "11.1 quality", severity: "act", title: `Pause ${a.name}`, why: `Broker rating ${a.qualityIndex.toFixed(1)}/5 over ${a.qualityN} meetings (pause below ${R.quality_pause_below}), regardless of CPL.`, action: { kind: "pause_ad", target: a.adId } });
    }
  }

  // Day-14 verdicts on cost per qualified lead.
  if (c.day >= R.stop_day && cpq != null) {
    if (cpq > R.stop_cost_per_qualified_zar) {
      out.push({ id: `stop:${c.campaignId}`, rule: "11.1 day 14", severity: "act", title: `Stop ${c.name} and escalate`, why: `Cost per qualified lead R${Math.round(cpq)} is above R${R.stop_cost_per_qualified_zar} at day ${c.day}. All spend pauses until Jonathan decides.`, action: { kind: "pause_campaign", target: c.campaignId } });
    } else if (cpq > R.cost_per_qualified_target_zar) {
      out.push({ id: `hold:${c.campaignId}`, rule: "11.1 day 14", severity: "watch", title: "Hold budget, no scale", why: `Cost per qualified lead R${Math.round(cpq)} is between R${R.cost_per_qualified_target_zar} and R${R.stop_cost_per_qualified_zar}. Tighten the questions, queue a new batch.`, action: { kind: "info" } });
    }
  }

  // Spend gate: bottom 50% of creatives by cost per qualified lead.
  if (c.spendSinceChange >= R.spend_gate_zar && ((cpl != null && cpl > R.cpl_max_zar) || (qualifyPct != null && qualifyPct < R.qualify_min_pct))) {
    const live = c.ads.filter((a) => active(a.status) && a.spend > 0);
    const ranked = [...live].sort((a, b) => {
      const ca = costPer(a.spend, a.qualified), cb = costPer(b.spend, b.qualified);
      if (ca == null && cb == null) return b.spend - a.spend;
      if (ca == null) return -1;
      if (cb == null) return 1;
      return cb - ca;
    });
    const n = Math.floor(live.length / 2);
    for (const a of ranked.slice(0, n)) {
      const q = costPer(a.spend, a.qualified);
      out.push({ id: `bottom50:${a.adId}`, rule: "11.1 spend gate", severity: "act", title: `Pause ${a.name}`, why: `Campaign spent R${Math.round(c.spendSinceChange)} (gate R${R.spend_gate_zar}) and CPL/qualify is off target. This ad is in the bottom 50% by cost per qualified lead (${q == null ? "no qualified leads" : "R" + Math.round(q)}).`, action: { kind: "pause_ad", target: a.adId } });
    }
  }

  // Good-fit layer (11.1b): only once >= 5 rated meetings exist.
  if (c.ratedMeetings >= R.min_dispositions && c.goodFit > 0) {
    const cpg = c.spendSinceChange / c.goodFit;
    if (cpg > R.good_fit_target_zar * R.good_fit_escalate_multiple) {
      out.push({ id: `gf-stop:${c.campaignId}`, rule: "11.1b good fit", severity: "act", title: `Pause ${c.name} and escalate`, why: `Cost per good-fit meeting R${Math.round(cpg)} is above ${R.good_fit_escalate_multiple}x the R${R.good_fit_target_zar} target (seed value; source is ops.watchlist_targets).`, action: { kind: "pause_campaign", target: c.campaignId } });
    } else if (cpg > R.good_fit_target_zar && cpq != null && cpq <= R.cost_per_qualified_target_zar) {
      out.push({ id: `gf-quality:${c.campaignId}`, rule: "11.1b good fit", severity: "watch", title: "Quality problem, not a price problem", why: `Cost per good-fit meeting R${Math.round(cpg)} is above target while cost per qualified lead is on target. Do not cut budget: tighten the questions or the budget band.`, action: { kind: "info" } });
    }
  }

  // Scale: one ad with quality >= 4 and CPL / cost per qualified within threshold, +20% once per 48 h.
  const winner = c.ads.find((a) => active(a.status) && a.qualityIndex != null && a.qualityN >= R.min_dispositions && a.qualityIndex >= R.quality_scale_at_least
    && (costPer(a.spend, a.leads) ?? Infinity) <= R.cpl_max_zar && (costPer(a.spend, a.qualified) ?? Infinity) <= R.cost_per_qualified_target_zar);
  if (winner && c.dailyBudgetZar && c.dailyBudgetZar > 0) {
    const cool = c.lastBudgetChangeAt ? now - new Date(c.lastBudgetChangeAt).getTime() < plan.guardrails.step_cooldown_hours * 3600 * 1000 : false;
    const target = maxStepUp(c.dailyBudgetZar, Math.min(R.scale_step_pct, plan.guardrails.max_step_pct));
    out.push({ id: `scale:${c.campaignId}`, rule: "11.1 scale", severity: cool ? "watch" : "act", title: `Raise ${c.name} to R${target}/day (+${R.scale_step_pct}%)`,
      why: `${winner.name} rates ${winner.qualityIndex!.toFixed(1)}/5 with CPL and cost per qualified within threshold.${cool ? ` Budget changed less than ${plan.guardrails.step_cooldown_hours} h ago; wait.` : ""} Caps still apply at confirm.`,
      action: cool ? { kind: "info" } : { kind: "set_campaign_budget", target: c.campaignId, dailyBudgetZar: target } });
  }

  // Creative fatigue / hook-hold: mark for the next batch, never a pause.
  for (const a of c.ads) {
    if (a.impressions >= R.hook_min_impressions) {
      const hookMin = a.isReels ? R.hook_min_reels_pct : R.hook_min_feed_pct;
      if ((a.hookRatePct != null && a.hookRatePct < hookMin) || (a.holdRatePct != null && a.holdRatePct < R.hold_min_pct)) {
        out.push({ id: `replace:${a.adId}`, rule: "11.1 hook/hold", severity: "info", title: `Replace ${a.name} in the next creative batch`, why: `Hook ${a.hookRatePct == null ? "n/a" : a.hookRatePct.toFixed(0) + "%"} (min ${hookMin}%), hold ${a.holdRatePct == null ? "n/a" : a.holdRatePct.toFixed(0) + "%"} (min ${R.hold_min_pct}%) after ${a.impressions} impressions. Not paused mid-flight.`, action: { kind: "info" } });
      }
    }
  }
  return out;
}
