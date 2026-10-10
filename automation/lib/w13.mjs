// automation/lib/w13.mjs  -  W13 no-show & replacement. 0.1 (per-cycle cap, "committed", shortfall), 4.6 item 11,
// 4.12a, Schedule C (C1A from W10) / D. Imported by automation/W13.json and automation/tests/W13.test.mjs. Pure, no I/O.
//
// ONE counter, ONE owner. `public.replacements` is the replacement counter for a cycle: rows whose status is not
// 'rejected' count against cycles.replacement_cap (snapshotted from pricing.replacement_cap_cycle when the cycle is
// created: Bronze 4 / Silver 6 / Gold 9; no weekly cap). Only W13 writes it. W10 (Schedule C1A: cancel_no_rebook /
// no_call), W29 (dispositions unreachable / nofit_criteria) and W12 (lead no-show) all CALL W13; none of them counts.
// The cap is enforced in the database: a per-cycle advisory lock in the claim statement serialises claims, and the
// smc_replacements_cap trigger (migration 02) counts with a fresh snapshot and sets cap_position / over_cap.
// One replacement per lead, whichever workflow asks first: lead_activities key w13:claim:{lead_id} + the partial
// unique index replacements_one_per_lead. A withdrawn claim (W29 correction) frees the lead and its place.
//
// No-show path: W12 confirms a lead no-show (both sides) -> W13 sends missed_you with 3 new times (ONE offer, 4.12:
// "zero guilt, one offer") -> no rebook and no reply within 48 h, or a second no-show -> replacement_due ->
// 48-h dispute window for Lead Velocity -> approved. Never for a broker no-show (Schedule D), never for "didn't buy".
// Shortfall / extension / pro-rata credit are W19's (billing): W13 only emits replacement_approved events;
// cycleState() below is the shared reference of the 0.1 rule and uses billing's shortfallCreditCents for the money.
import { createRequire } from 'node:module';
import { pick3, slotLabel } from './w10.mjs';
import { H, D, ms, iso, firstAndInitial, templateMessage, nowFrom, touchesLastContact } from './wa.mjs';
export { H, D, iso, nowFrom, touchesLastContact };
const require = createRequire(import.meta.url);
const { shortfallCreditCents } = require('../billing/invoice.js');

export const REBOOK_WAIT = 48 * H; // missed_you -> no reply in 48 h -> replacement_due (4.6 item 11)
export const DISPUTE_WINDOW = 48 * H; // Schedule C
export const MAX_EXTENSION = 14 * D; // 0.1 shortfall
export const COUNTED = new Set(['due', 'disputed', 'approved', 'fulfilled']); // 'rejected' frees the slot
export const REASONS = new Set(['no_show', 'uncontactable', 'disqualified']); // replacements.reason CHECK
export const C1A_CODES = { cancel_no_rebook: 'uncontactable', no_call: 'disqualified' };

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
      if (ev.code === 'nofit_criteria') return { due: true, reason: 'disqualified', reason_code: 'nofit_criteria', due_at: ev.at };
      return { due: false, why: 'counts_as_delivered' };
    case 'uncontactable': // system-determined: verified, then silent through the full W08 sequence
      return ev.verified ? { due: true, reason: 'uncontactable', reason_code: 'system_uncontactable', due_at: ev.at } : { due: false, why: 'never_verified_never_counted' };
    case 'c1a': // W10 already decided C1A (verified lead, NH-42 mode); W13 checks the shape only
      if (C1A_CODES[ev.reason_code] && C1A_CODES[ev.reason_code] === ev.reason) return { due: true, reason: ev.reason, reason_code: ev.reason_code, due_at: ev.at };
      return { due: false, why: 'c1a_shape_invalid' };
    case 'broker_no_show':
      return { due: false, why: 'schedule_d_broker_no_show' };
    default:
      return { due: false, why: 'not_a_trigger' };
  }
}

/** A row that still blocks a new claim for its lead: anything except a withdrawn one (W29 correction). */
export const blocksLead = (r) => !(r.status === 'rejected' && r.note === 'withdrawn');

/** Open the replacement row (idempotent per lead), enforcing the per-cycle cap. In-memory model of W13.json's SQL. */
export function claim(cyc, rows, leadId, trig) {
  const existing = rows.find((r) => r.lead_id === leadId && blocksLead(r));
  if (existing) return { row: existing, alerts: [] };
  const used = rows.filter((r) => r.cycle_id === cyc.cycle_id && COUNTED.has(r.status)).length;
  const base = { lead_id: leadId, cycle_id: cyc.cycle_id, broker_id: cyc.broker_id, reason: trig.reason, reason_code: trig.reason_code, claimed_at: trig.due_at };
  if (used >= cyc.replacement_cap) {
    const row = { ...base, status: 'rejected', note: 'cap_reached', decided_by: 'system', cap_position: used + 1, over_cap: true };
    rows.push(row);
    return { row, alerts: ['Jonathan: replacement cap reached'] };
  }
  const row = { ...base, status: 'due', cap_position: used + 1, over_cap: false, dispute_window_ends_at: iso(ms(trig.due_at) + DISPUTE_WINDOW) };
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
/** W29 correction away from unreachable / nofit_criteria: only a 'due' row, only inside the window. */
export function withdraw(row, now) {
  if (!row || row.status !== 'due' || now >= ms(row.dispute_window_ends_at)) return false;
  row.status = 'rejected'; row.note = 'withdrawn';
  return true;
}

/**
 * Cycle close / extension / credit (0.1 Shortfall). effective = verified qualified - approved replacements outstanding.
 * Reference only: W19 (billing) applies it; W13 never writes cycles or credits. Money via billing/invoice.js.
 */
export function cycleState(cyc, { verified, approvedReplacements }, now, price) {
  const effective = verified - approvedReplacements;
  const ends = ms(cyc.ends_at);
  const extendedUntil = ends + MAX_EXTENSION;
  if (now < ends) return { status: 'active', effective };
  if (effective >= cyc.committed_leads) return { status: 'closed', effective, shortfall: 0, credit_zar: 0 };
  if (now < extendedUntil) return { status: 'extended', effective, extended_until: iso(extendedUntil) };
  const shortfall = cyc.committed_leads - effective;
  // committed_leads includes paid top-ups (W16); every undelivered lead, top-up or not, is credited at the plan's Effective Lead Price
  // and the cap is what the broker paid for the cycle's leads (plan price + top-up leads at that rate), not the plan price alone.
  const credit = shortfallCreditCents({ price_zar: price, committed_leads: cyc.committed_leads, topup_leads: cyc.topup_leads || 0 }, effective) / 100;
  return { status: 'closed', effective, shortfall, credit_zar: credit, credit_as: cyc.renewing ? 'credit_next_cycle' : 'refund' };
}

// ---------------------------------------------------------------------------------------------------------------
// Entries (CONTRACTS.md "Sub-workflow interfaces", "W10 -> W13 Schedule C1A claims")
// ---------------------------------------------------------------------------------------------------------------
/**
 * normaliseInput(j) -> { op, lead_id, booking_id, outcome_id, cycle_id, ev, idempotency_key, replacement_id, upheld }
 *  W10 C1A : { op:'claim', lead_id, booking_id, outcome_id:null, cycle_id, reason, code, reason_code, at, idempotency_key }
 *  W29     : { d: { w13: { op:'claim'|'withdraw', reason, reason_code } }, o: { id, lead_id, cycle_id, ... } }
 *  W12     : { op:'no_show', outcome_id, booking_id, lead_id, confirmed_at, idempotency_key }
 *  generic : { op:'claim'|'withdraw', outcome_id, reason, reason_code }   (outcome row supplies lead / cycle)
 *  system  : { op:'claim', kind:'uncontactable', lead_id, verified, at }
 *  console : { op:'dispute'|'decide', replacement_id, upheld? }
 */
export function normaliseInput(j = {}, now = Date.now()) {
  const at = j.at || iso(now);
  if (j.d?.w13 && j.o) {
    const w = j.d.w13;
    return { op: w.op, lead_id: j.o.lead_id, outcome_id: j.o.id, cycle_id: j.o.cycle_id, booking_id: j.o.booking_id || null, ev: { kind: 'disposition', code: w.reason_code, at }, idempotency_key: `w29:${w.op}:${j.o.id}:${w.reason_code}`, source: 'W29' };
  }
  const base = { op: j.op, lead_id: j.lead_id || null, booking_id: j.booking_id || null, outcome_id: j.outcome_id || null, cycle_id: j.cycle_id || null, idempotency_key: j.idempotency_key || null, replacement_id: j.replacement_id || null, upheld: j.upheld, source: j.source || null };
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

/** Console/ops alert text. The word is "committed" (0.1; the banned alternative never appears in W13). */
export function alertNote(kind, { lead = {}, used, cap, reason_code, window_ends_at } = {}) {
  if (kind === 'cap_reached') return `esc_kind=replacement_cap_reached; ${firstAndInitial(lead)} (${reason_code}): cap of ${cap} replacements this cycle already used. Claim recorded as rejected (cap_reached); the committed number is unchanged. Add-on or override is Jonathan's call.`;
  return `esc_kind=replacement_due; ${firstAndInitial(lead)} (${reason_code}): replacement ${used} of ${cap} this cycle. Lead Velocity can dispute until ${window_ends_at}.`;
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
 * `trig` from the no-show path); ctx = W13.json "Claim context" row (cycle_id, replacement_cap, verified_at).
 * The cap itself is applied in SQL (advisory lock + count, same rule as claim() above).
 */
export function claimDecision(n = {}, ctx = {}) {
  if (!ctx.cycle_id) return { claim: false, why: 'no_cycle' };
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
