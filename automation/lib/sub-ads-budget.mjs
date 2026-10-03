// smc-ads-budget (LOCAL-STAGING §7, NH-57 default (a), I-48i). Pure functions; automation/SUB-ads-budget.json writes.
// Code node form: const L = require('lv-automation').subAdsBudget;
// Every raise / lower becomes an ops.proposals row (faculty media, source ads_budget) plus one ops.notifications
// approval row for Jonathan. Nothing calls meta-ads.js write paths: meta-ads.js refuses a write without a human
// confirmToken (6.2 confirm-to-apply), so the change is applied by ads-api-engineer after the Approve tap.
// Input: { op: 'raise'|'lower', broker_id, cycle_id, amount_zar, reason }; the §7 shape { action, broker_id,
// media_share_zar } is accepted as well.
export function normalise(input = {}) {
  const i = input || {};
  const op = i.op || i.action || null;
  const amount = Number(i.amount_zar ?? i.media_share_zar);
  const out = { op, broker_id: i.broker_id ? String(i.broker_id) : null, cycle_id: i.cycle_id ? String(i.cycle_id) : null, amount_zar: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null, reason: String(i.reason || (op === 'raise' ? 'cycle resumed after payment' : op === 'lower' ? 'cycle ended, not renewed' : '')).slice(0, 300) };
  const missing = [];
  if (!['raise', 'lower'].includes(op)) missing.push('op');
  if (!out.broker_id) missing.push('broker_id');
  if (!(out.amount_zar > 0)) missing.push('amount_zar');
  return { ...out, valid: missing.length === 0, missing };
}

/** The proposal + approval-outbox rows (W32-outbox shape; source is never 'console', so W32 never reads it as a decision). */
export function proposal(n) {
  const daily = Math.round((n.amount_zar / 30) * 100) / 100;
  const verb = n.op === 'raise' ? 'Raise' : 'Lower';
  return {
    proposal: {
      source: 'ads_budget',
      faculty: 'media',
      title: `${verb} the Meta budget for broker ${n.broker_id} by R${n.amount_zar} media share (about R${daily}/day)`,
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
      payload: { op: n.op, broker_id: n.broker_id, cycle_id: n.cycle_id, amount_zar: n.amount_zar, daily_budget_zar: daily, reason: n.reason, via: 'ads_budget' },
    },
  };
}
