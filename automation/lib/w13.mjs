// automation/lib/w13.mjs  -  W13 no-show & replacement, inside the Lead Velocity CRM (crm-nurture chain, 2026-10-11).
// Imported by automation/W13.json and automation/tests/W13.test.mjs. Pure, no I/O.
//
// The agreed rule (agreement clause 7 / Schedule 3): a replacement is GOODWILL, opened only for a lead NO-SHOW (confirmed by
// both sides, W12) or a lead the broker could not reach (UNREACHABLE: disposition unreachable, a verified lead silent
// through the whole W08 sequence, or W10 C1A cancel_no_rebook). Never for a broker no-show (Schedule D), never because
// nobody bought, never for "outside criteria" / "no call". At most 3 requests per broker per Calendar Week (Mon 00:00 -
// Sun 23:59 SAST, counted by the date of the missed appointment), no-shows and unreachable together, every request row
// counts (the portal RPC smc_request_replacement applies the same rule with the same advisory-lock key). There are no
// cycles and no per-plan caps: capacity is the CRM's lead_orders, and an APPROVED replacement adds one lead of capacity to
// the order the missed lead was delivered on (public.smc_order_capacity), so the broker simply receives one more lead.
//
// ONE writer: only W13 (and the broker's own portal RPC) writes public.replacements. W10 (C1A), W29 (dispositions) and W12
// (lead no-show) CALL W13. One live replacement per lead, whoever asks first; a rejected one (withdrawn or upheld) frees the lead.
// No-show path: W12 confirms it -> missed_you with 3 new times (ONE offer) -> no rebook and no reply within 48 h, or a
// second no-show -> replacement_due -> 48-h dispute window for Lead Velocity -> approved.
import { pick3, slotLabel } from './w10.mjs';
import { H, D, ms, iso, firstAndInitial, templateMessage, nowFrom, touchesLastContact } from './wa.mjs';
export { H, D, iso, nowFrom, touchesLastContact };

export const REBOOK_WAIT = 48 * H; // missed_you -> no reply in 48 h -> replacement_due
export const DISPUTE_WINDOW = 48 * H; // Schedule C
export const WEEKLY_MAX = 3; // requests per broker per Calendar Week (clause 7.2), no-shows and unreachable together
export const COUNTED = new Set(['due', 'disputed', 'approved', 'fulfilled']); // live requests ('rejected' = refused / withdrawn)
export const REASONS = new Set(['no_show', 'uncontactable']); // replacements.reason CHECK
export const C1A_CODES = { cancel_no_rebook: 'uncontactable', no_call: 'disqualified' }; // W10 sends both; only the first is replaceable
const SAST = 2 * H; // Africa/Johannesburg, no daylight saving

/** Monday 00:00 SAST of the Calendar Week that contains t (ms), as an ISO string in UTC (= public.smc_week_start). */
export function weekStart(t) {
  const local = new Date(ms(t) + SAST);
  const day = (local.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - day * D - SAST).toISOString();
}
/** The advisory-lock key shared with smc_request_replacement: 'w13:week:' || broker || ':' || to_char(week start in UTC, 'YYYY-MM-DD"T"HH24:MI'). */
export const weekLockKey = (brokerId, t) => `w13:week:${brokerId}:${weekStart(t).slice(0, 16)}`;

/** Does this event open a replacement? Returns {due:false, why} or {due:true, reason, reason_code, due_at}. */
export function replacementTrigger(ev) {
  switch (ev.kind) {
    case 'no_show': // lead no-show, already confirmed by W12 (both sides)
      if (ev.second_no_show) return { due: true, reason: 'no_show', reason_code: 'second_no_show', due_at: ev.confirmed_at };
      if (ev.rebooked_at && ms(ev.rebooked_at) < ms(ev.confirmed_at) + REBOOK_WAIT) return { due: false, why: 'rebooked' };
      if (ev.replied_at && ms(ev.replied_at) < ms(ev.confirmed_at) + REBOOK_WAIT) return { due: false, why: 'engaged_in_chat' };
      return { due: true, reason: 'no_show', reason_code: 'no_show', due_at: iso(ms(ev.confirmed_at) + REBOOK_WAIT) };
    case 'disposition':
      if (ev.code === 'unreachable') return { due: true, reason: 'uncontactable', reason_code: 'unreachable', due_at: ev.at };
      if (ev.code === 'nofit_criteria') return { due: false, why: 'not_replaceable' }; // agreed rule: no-shows and unreachable only
      return { due: false, why: 'counts_as_delivered' };
    case 'uncontactable': // system-determined: verified, then silent through the full W08 sequence
      return ev.verified ? { due: true, reason: 'uncontactable', reason_code: 'system_uncontactable', due_at: ev.at } : { due: false, why: 'never_verified_never_counted' };
    case 'c1a': // W10 already decided C1A; W13 checks the shape, and only the could-not-reach branch is replaceable
      if (!(C1A_CODES[ev.reason_code] && C1A_CODES[ev.reason_code] === ev.reason)) return { due: false, why: 'c1a_shape_invalid' };
      if (ev.reason !== 'uncontactable') return { due: false, why: 'not_replaceable' };
      return { due: true, reason: ev.reason, reason_code: ev.reason_code, due_at: ev.at };
    case 'broker_no_show':
      return { due: false, why: 'schedule_d_broker_no_show' };
    default:
      return { due: false, why: 'not_a_trigger' };
  }
}

/** A row that still blocks a new claim for its lead: any live request (same rule as the replacements_one_per_lead index and the portal RPC; a rejected one, withdrawn or dispute-upheld, frees the lead). */
export const blocksLead = (r) => r.status !== 'rejected';

/**
 * Open the replacement row (idempotent per lead), enforcing the weekly maximum. In-memory model of W13.json's SQL.
 * ctx = { broker_id, lead_order_id, missed_start_at? }. Over the maximum nothing is written: { row: null, refused: 'weekly_max' }.
 */
export function claim(ctx, rows, leadId, trig) {
  const existing = rows.find((r) => r.lead_id === leadId && blocksLead(r));
  if (existing) return { row: existing, alerts: [] };
  const counted = ctx.missed_start_at || trig.due_at;
  const week = weekStart(counted);
  const used = rows.filter((r) => r.broker_id === ctx.broker_id && weekStart(r.missed_start_at || r.claimed_at) === week).length;
  if (used >= WEEKLY_MAX) return { row: null, refused: 'weekly_max', used, alerts: ['Jonathan: weekly replacement maximum reached'] };
  const row = { lead_id: leadId, lead_order_id: ctx.lead_order_id ?? null, broker_id: ctx.broker_id, reason: trig.reason, reason_code: trig.reason_code,
    claimed_at: trig.due_at, missed_start_at: ctx.missed_start_at ?? null, status: 'due', cap_position: used + 1, over_cap: false,
    dispute_window_ends_at: iso(ms(trig.due_at) + DISPUTE_WINDOW) };
  rows.push(row);
  return { row, alerts: ['Jonathan: replacement_due'] };
}

export function dispute(row, now) {
  if (row.status !== 'due') throw new Error(`cannot dispute a ${row.status} row`);
  if (now > ms(row.dispute_window_ends_at)) throw new Error('dispute window closed');
  row.status = 'disputed';
}
export function settle(row, now) {
  if (row.status === 'due' && now >= ms(row.dispute_window_ends_at)) row.status = 'approved';
  return row.status;
}
export const decide = (row, lvUpheld) => { row.status = lvUpheld ? 'rejected' : 'approved'; if (lvUpheld) row.note = 'dispute_upheld'; return row.status; };
/** W29 correction away from unreachable: only a 'due' row, only inside the window. */
export function withdraw(row, now) {
  if (!row || row.status !== 'due' || now >= ms(row.dispute_window_ends_at)) return false;
  row.status = 'rejected'; row.note = 'withdrawn';
  return true;
}

/** Capacity effect of approved replacements on one order (same rule as public.smc_order_capacity). */
export function orderCapacity(order, rows) {
  const approved = rows.filter((r) => r.lead_order_id === order.lead_order_id && (r.status === 'approved' || r.status === 'fulfilled')).length;
  const capacity = Number(order.lead_count || 0) + approved;
  const attached = Number(order.attached || 0);
  return { capacity, remaining: Math.max(0, capacity - attached), counted_toward_order: Math.max(0, attached - approved), open: order.status === 'paid' && capacity > attached };
}

// ---------------------------------------------------------------------------------------------------------------
// Entries (CONTRACTS.md "Sub-workflow interfaces", "W10 -> W13 Schedule C1A claims")
// ---------------------------------------------------------------------------------------------------------------
/**
 * normaliseInput(j) -> { op, lead_id, booking_id, outcome_id, ev, idempotency_key, replacement_id, upheld }
 *  W10 C1A : { op:'claim', lead_id, booking_id, outcome_id:null, reason, code, reason_code, at, idempotency_key }
 *  W29     : { d: { w13: { op:'claim'|'withdraw', reason, reason_code } }, o: { id, lead_id, ... } }
 *  W12     : { op:'no_show', outcome_id, booking_id, lead_id, confirmed_at, idempotency_key }
 *  generic : { op:'claim'|'withdraw', outcome_id, reason, reason_code }   (outcome row supplies the lead)
 *  system  : { op:'claim', kind:'uncontactable', lead_id, verified, at }
 *  console : { op:'dispute'|'decide', replacement_id, upheld? }
 */
export function normaliseInput(j = {}, now = Date.now()) {
  const at = j.at || iso(now);
  if (j.d?.w13 && j.o) {
    const w = j.d.w13;
    return { op: w.op, lead_id: j.o.lead_id, outcome_id: j.o.id, booking_id: j.o.booking_id || null, ev: { kind: 'disposition', code: w.reason_code, at }, idempotency_key: `w29:${w.op}:${j.o.id}:${w.reason_code}`, source: 'W29' };
  }
  const base = { op: j.op, lead_id: j.lead_id || null, booking_id: j.booking_id || null, outcome_id: j.outcome_id || null, idempotency_key: j.idempotency_key || null, replacement_id: j.replacement_id || null, upheld: j.upheld, source: j.source || null };
  if (j.op === 'no_show') return { ...base, confirmed_at: j.confirmed_at || at };
  if (j.op === 'claim' && j.kind === 'uncontactable') return { ...base, ev: { kind: 'uncontactable', verified: Boolean(j.verified), at } };
  if (j.op === 'claim' && C1A_CODES[j.reason_code]) return { ...base, ev: { kind: 'c1a', reason: j.reason, reason_code: j.reason_code, at }, source: 'W10' };
  if (j.op === 'claim' || j.op === 'withdraw') return { ...base, ev: { kind: 'disposition', code: j.reason_code || j.code, at } };
  return base;
}

export function validateInput(n = {}) {
  const missing = [];
  if (!['claim', 'withdraw', 'no_show', 'dispute', 'decide'].includes(n.op)) missing.push('op');
  if (['claim', 'withdraw'].includes(n.op) && !n.lead_id && !n.outcome_id) missing.push('lead_id or outcome_id');
  if (n.op === 'no_show' && (!n.outcome_id || !n.booking_id)) missing.push('outcome_id, booking_id');
  if (['dispute', 'decide'].includes(n.op) && !n.replacement_id) missing.push('replacement_id');
  if (n.op === 'decide' && typeof n.upheld !== 'boolean') missing.push('upheld');
  return missing.length ? { ok: false, missing } : { ok: true };
}

/** missed_you: 1 first_name · 2 adviser_name · 3-5 slot labels; QR Time 1-3 (slot_{ISO}:resched:{booking}) · Other times. */
export function missedYouMessage(booking, lead, broker, slots = []) {
  const three = pick3(slots);
  if (three.length < 3) return { to: 'lead', template: 'missed_you', wa: null, why: 'fewer_than_3_slots' };
  return { to: 'lead', template: 'missed_you', slots: three, wa: templateMessage(lead.phone, 'missed_you', {
    body: [String(lead.first_name || '').trim() || 'there', broker.adviser_name || broker.contact_person, ...three.map((s) => slotLabel(s.start))],
    buttons: [...three.map((s) => ({ quick_reply: `slot_${s.start}:resched:${booking.id}` })), { quick_reply: `other_times:${booking.id}` }]
  }) };
}

/** Console/ops alert text. Goodwill wording only (no promise words; W13.test.mjs checks the text). */
export function alertNote(kind, { lead = {}, used, max = WEEKLY_MAX, reason_code, window_ends_at } = {}) {
  if (kind === 'weekly_max') return `esc_kind=replacement_weekly_max; ${firstAndInitial(lead)} (${reason_code}): this broker already has ${used} of ${max} goodwill replacement requests this Calendar Week. Not opened; nothing is owed. An exception is Jonathan's call.`;
  return `esc_kind=replacement_due; ${firstAndInitial(lead)} (${reason_code}): goodwill replacement request ${used} of ${max} this week. Once approved the broker's lead order gets one more lead. Lead Velocity can dispute until ${window_ends_at}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Row adapters for automation/W13.json. Tested in W13.test.mjs.
// ---------------------------------------------------------------------------------------------------------------
/** noShowClock(row) -> replacementTrigger() for one 48-h no-show clock (W13.json hourly tick). */
export function noShowClock(r = {}) {
  const rebooked = [r.rebooked_at, r.rebooked_activity_at].filter(Boolean).map(ms);
  return replacementTrigger({
    kind: 'no_show', confirmed_at: iso(r.confirmed_at),
    rebooked_at: rebooked.length ? iso(Math.min(...rebooked)) : null,
    replied_at: r.replied_at ? iso(r.replied_at) : null
  });
}

/**
 * claimDecision(n, ctx) -> { claim: true, trig } | { claim: false, why }. n = normaliseInput() (or an item carrying
 * `trig` from the no-show path); ctx = W13.json "Claim context" row (broker_id, lead_order_id, verified_at).
 * The weekly maximum itself is applied in SQL (advisory lock + count, same rule as claim() above).
 */
export function claimDecision(n = {}, ctx = {}) {
  if (!ctx.broker_id) return { claim: false, why: 'not_routed' };
  if (!ctx.lead_order_id) return { claim: false, why: 'not_delivered_on_a_lead_order' };
  const ev = n.ev?.kind === 'uncontactable' ? { ...n.ev, verified: Boolean(ctx.verified_at) || Boolean(n.ev.verified) } : n.ev;
  const trig = n.trig || replacementTrigger(ev || {});
  return trig.due ? { claim: true, trig } : { claim: false, why: trig.why };
}

/** missed_you as a uniform send item for the shared send chain (key w13:missed_you:{booking_id}). */
export function missedYouItem(row = {}, slots = []) {
  const m = missedYouMessage({ id: row.booking_id }, { first_name: row.first_name, phone: row.phone }, { adviser_name: row.adviser_name, contact_person: row.contact_person }, slots);
  if (!m.wa) return { send: null, why: m.why };
  return { send: { to: 'lead', wa: m.wa, lead_id: row.lead_id, brand_id: row.brand_id, broker_id: row.broker_id, template: 'missed_you', category: 'utility', key: `w13:missed_you:${row.booking_id}`, workflow: 'W13' }, slots: m.slots };
}
