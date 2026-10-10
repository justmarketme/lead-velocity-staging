// smc-ads-budget (LOCAL-STAGING §7, NH-57 default (a), I-48i). Pure functions; automation/SUB-ads-budget.json writes.
// Code node form: const L = require('lv-automation').subAdsBudget;
// Every raise / lower becomes an ops.proposals row (faculty media, source ads_budget) plus one ops.notifications
// approval row for Jonathan. Nothing calls meta-ads.js write paths: meta-ads.js refuses a write without a human
// confirmToken (6.2 confirm-to-apply), so the change is applied by ads-api-engineer after the Approve tap.
// Input: { op: 'raise'|'lower', broker_id, cycle_id, amount_zar, reason }; the §7 shape { action, broker_id,
// media_share_zar } is accepted as well.
// I-49f "lower" definition: W19 sends amount_zar 0 + media_share_zar at cycle end. amount_zar 0 is the TARGET for this
// broker's share (pause spend), media_share_zar is the amount removed. normalise() therefore returns
// { amount_zar: media_share_zar, target_zar: 0, mode: 'pause' } for that call; a lower with its own amount_zar > 0 is a
// plain reduction ({ target_zar: null, mode: 'reduce' }). Raise is unchanged ({ mode: 'raise' }).
// NH-22(a), confirmed 2026-10-03: media_share_zar is VAT-inclusive; Meta bills ex-VAT. The only place this rate lives.
export const VAT_RATE = 0.15;
const r2c = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Daily budget ENTERED in Meta (ex-VAT) for a VAT-inclusive media share: share / (1 + VAT_RATE) / 30. */
export function dailyBudgetExVat(shareZar) { return r2c(Number(shareZar) / (1 + VAT_RATE) / 30); }

export function normalise(input = {}) {
  const i = input || {};
  const op = i.op || i.action || null;
  const r2 = (x) => Math.round(x * 100) / 100;
  const raw = i.amount_zar === undefined || i.amount_zar === null ? NaN : Number(i.amount_zar);
  const share = i.media_share_zar === undefined || i.media_share_zar === null ? NaN : Number(i.media_share_zar);
  let amount, target_zar = null, mode = op === 'raise' ? 'raise' : op === 'lower' ? 'reduce' : null;
  if (op === 'lower' && (!(raw > 0)) && share > 0) { amount = share; target_zar = 0; mode = 'pause'; } // W19 cycle-end shape (I-49f)
  else amount = Number.isFinite(raw) ? raw : share;
  const out = { op, broker_id: i.broker_id ? String(i.broker_id) : null, cycle_id: i.cycle_id ? String(i.cycle_id) : null, amount_zar: Number.isFinite(amount) ? r2(amount) : null, target_zar, mode, reason: String(i.reason || (op === 'raise' ? 'cycle resumed after payment' : op === 'lower' ? 'cycle ended, not renewed' : '')).slice(0, 300) };
  const missing = [];
  if (!['raise', 'lower'].includes(op)) missing.push('op');
  if (!out.broker_id) missing.push('broker_id');
  if (!(out.amount_zar > 0)) missing.push('amount_zar');
  return { ...out, valid: missing.length === 0, missing };
}

/** The proposal + approval-outbox rows (W32-outbox shape; source is never 'console', so W32 never reads it as a decision). */
export function proposal(n) {
  const daily = dailyBudgetExVat(n.amount_zar);
  const verb = n.op === 'raise' ? 'Raise' : 'Lower';
  const title = n.mode === 'pause'
    ? `Pause the Meta spend for broker ${n.broker_id}: remove its R${n.amount_zar} media share (about R${daily}/day entered in Meta, excl. VAT), target R0 until a new cycle is paid`
    : `${verb} the Meta budget for broker ${n.broker_id} by R${n.amount_zar} media share (about R${daily}/day entered in Meta, excl. VAT)`;
  return {
    proposal: {
      source: 'ads_budget',
      faculty: 'media',
      title,
      metric: 'media_share_zar',
      number_at_decision: n.amount_zar,
      cost_zar: n.op === 'raise' ? n.amount_zar : 0,
      owner_agent: 'ads-api-engineer',
      mechanism: 'confirm-to-apply (6.2): nothing is spent or changed until Jonathan approves; ads-api-engineer applies it with meta-ads.js setCampaignBudget (Meta minimum, <= 20% step, 48 h spacing, monthly cap)',
      evidence: n.reason,
    },
    notification: {
      kind: 'approval', recipient: 'jonathan', channel: 'console', source: 'ads_budget', status: 'queued', ref_table: 'proposals',
      dedupe_key: `ads_budget:${n.broker_id}:${n.cycle_id || '-'}:${n.op}`,
      payload: { op: n.op, mode: n.mode || null, broker_id: n.broker_id, cycle_id: n.cycle_id, amount_zar: n.amount_zar, target_zar: n.target_zar ?? null, daily_budget_zar: daily, daily_budget_basis: 'ex_vat', vat_rate: VAT_RATE, reason: n.reason, via: 'ads_budget' },
    },
  };
}
