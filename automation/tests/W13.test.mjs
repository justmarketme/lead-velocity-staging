// DRAFT for GATE-TEST-W13 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W13 No-show & replacement — 0.1 (per-cycle cap, shortfall), 4.12a, Schedule C
// Money rule protected: replacements are what erode margin, so they open ONLY for the contract triggers
// (lead no-show confirmed by both sides, unreachable, outside criteria, verified-then-uncontactable), never for a
// broker no-show and never because nobody bought (FAIS, Raspberry Academy). The cap is per cycle and comes from
// the pricing row (Bronze 4 / Silver 6 / Gold 9). Lead Velocity has 48 h to dispute. A short cycle extends up
// to 14 days; anything still short is credited pro rata, capped at the cycle price.
//
// Run:  node --test automation/tests/W13.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, cycle, pricing, clone, ms, iso, H, D, online } from './_harness.mjs';

// ============================================================================================
// Reference implementation
// ============================================================================================
export const REBOOK_WAIT = 48 * H; // missed_you -> no reply in 48 h -> replacement_due (4.6 item 11)
export const DISPUTE_WINDOW = 48 * H; // Schedule C
export const MAX_EXTENSION = 14 * D; // 0.1 shortfall
const COUNTED = new Set(['due', 'disputed', 'approved', 'fulfilled']); // 'rejected' frees the slot
// SYNTHETIC cycle price for the shortfall maths only. NOT a tier price (W25 forbids hard-coded prices).
export const SYNTHETIC_PRICE = 10000;

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
    case 'broker_no_show':
      return { due: false, why: 'schedule_d_broker_no_show' };
    default:
      return { due: false, why: 'not_a_trigger' };
  }
}

/** Open the replacement row (idempotent per lead), enforcing the per-cycle cap. */
export function claim(cyc, rows, leadId, trig) {
  const existing = rows.find((r) => r.lead_id === leadId);
  if (existing) return { row: existing, alerts: [] };
  const used = rows.filter((r) => r.cycle_id === cyc.cycle_id && COUNTED.has(r.status)).length;
  const base = { lead_id: leadId, cycle_id: cyc.cycle_id, broker_id: cyc.broker_id, reason: trig.reason, reason_code: trig.reason_code, claimed_at: trig.due_at };
  if (used >= cyc.replacement_cap) {
    const row = { ...base, status: 'rejected', note: 'cap_reached', decided_by: 'system' };
    rows.push(row);
    return { row, alerts: ['Jonathan: replacement cap reached'] };
  }
  const row = { ...base, status: 'due', dispute_window_ends_at: iso(ms(trig.due_at) + DISPUTE_WINDOW) };
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
export const decide = (row, lvUpheld) => { row.status = lvUpheld ? 'rejected' : 'approved'; return row.status; };

/** Cycle close / extension / credit (0.1 Shortfall). effective = verified qualified - approved replacements outstanding. */
export function cycleState(cyc, { verified, approvedReplacements }, now, price) {
  const effective = verified - approvedReplacements;
  const ends = ms(cyc.ends_at);
  const extendedUntil = ends + MAX_EXTENSION;
  if (now < ends) return { status: 'active', effective };
  if (effective >= cyc.committed_leads) return { status: 'closed', effective, shortfall: 0, credit_zar: 0 };
  if (now < extendedUntil) return { status: 'extended', effective, extended_until: iso(extendedUntil) };
  const shortfall = cyc.committed_leads - effective;
  const credit = Math.min(price, Math.round((price * shortfall * 100) / cyc.committed_leads) / 100);
  return { status: 'closed', effective, shortfall, credit_zar: credit, credit_as: cyc.renewing ? 'credit_next_cycle' : 'refund' };
}

/** New cycle snapshots its cap from the pricing row (3.6 single source). */
export const newCycle = (tier, id = `cyc_${tier}`) => ({ ...clone(cycle()), cycle_id: id, tier_code: tier, committed_leads: pricing(tier).committed_leads, replacement_cap: pricing(tier).replacement_cap_cycle });

// ============================================================================================
// Tests
// ============================================================================================
test(`W13 [${MODE}] L04: no-show confirmed, no reply to missed_you for 48 h -> replacement_due, 48-h dispute window, then approved`, async () => {
  const fx = lead('L04');
  const e = fx.expected.W13;
  if (MODE === 'online') {
    const seeded = (await online.post('/test/seed-outcome', { fixture: fx, outcome: 'no_show', no_show_confirmed_at: fx.expected.W12.no_show_confirmed_at })).body;
    await online.tick(ms(e.dispute_window_ends_at));
    const st = await online.state(seeded.lead_id);
    const r = st.replacements[0];
    assert.equal(r.reason, e.reason);
    assert.equal(ms(r.claimed_at), ms(e.replacement_due_at));
    assert.equal(ms(r.dispute_window_ends_at), ms(e.dispute_window_ends_at));
    assert.equal(r.status, e.status_after_window);
    return;
  }
  const trig = replacementTrigger({ kind: 'no_show', confirmed_at: fx.expected.W12.no_show_confirmed_at });
  assert.equal(trig.due, true);
  assert.equal(trig.due_at, e.replacement_due_at);
  const rows = [];
  const cyc = clone(cycle());
  const { row, alerts } = claim(cyc, rows, fx.lead_id, trig);
  assert.equal(row.reason, e.reason);
  assert.equal(row.dispute_window_ends_at, e.dispute_window_ends_at);
  assert.deepEqual(alerts, ['Jonathan: replacement_due']);
  assert.equal(settle(row, ms(e.dispute_window_ends_at) - 1), 'due', 'not approved inside the window');
  assert.equal(settle(row, ms(e.dispute_window_ends_at)), e.status_after_window);
  assert.equal(rows.filter((r) => r.cycle_id === cyc.cycle_id && r.status !== 'rejected').length, e.replacements_used_after);
});

test(`W13 [${MODE}] rebooking (or replying) inside 48 h means no replacement; a second no-show is due at once`, () => {
  const confirmed = '2026-10-15T17:00:00+02:00';
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, rebooked_at: '2026-10-16T09:00:00+02:00' }).due, false);
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, replied_at: '2026-10-17T16:59:00+02:00' }).due, false);
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, rebooked_at: '2026-10-17T17:01:00+02:00' }).due, true, 'too late');
  const second = replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, second_no_show: true });
  assert.equal(second.due_at, confirmed);
});

test(`W13 [${MODE}] dispositions: only unreachable and nofit_criteria open a replacement; budget/covered/fit never do`, () => {
  const at = '2026-10-15T11:00:00+02:00';
  const due = FIX._meta.disposition_codes.filter((code) => replacementTrigger({ kind: 'disposition', code, at }).due);
  assert.deepEqual(due.sort(), ['nofit_criteria', 'unreachable']);
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'unreachable', at }).reason, 'uncontactable');
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'nofit_criteria', at }).reason, 'disqualified');
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'did_not_buy', at }).due, false, 'never "didn\'t buy" (FAIS)');
});

test(`W13 [${MODE}] broker no-show (L02, L03) never opens a replacement (Schedule D)`, () => {
  for (const id of ['L02', 'L03']) {
    assert.equal(lead(id).expected.W12.outcome, 'broker_no_show');
    assert.equal(replacementTrigger({ kind: 'broker_no_show' }).due, lead(id).expected.W13.replacement, id);
  }
});

test(`W13 [${MODE}] uncontactable: replaceable only if the lead was verified (an unverified lead never counted)`, () => {
  assert.equal(replacementTrigger({ kind: 'uncontactable', verified: true, at: '2026-10-20T09:00:00+02:00' }).due, true);
  assert.equal(replacementTrigger({ kind: 'uncontactable', verified: false, at: '2026-10-20T09:00:00+02:00' }).due, false);
});

for (const tier of ['SMC_BRONZE', 'SMC_SILVER', 'SMC_GOLD']) {
  test(`W13 [${MODE}] per-cycle cap for ${tier} comes from pricing (${pricing(tier).replacement_cap_cycle}); one more is refused + Jonathan alerted; no weekly cap`, () => {
    const cyc = newCycle(tier);
    const cap = pricing(tier).replacement_cap_cycle;
    assert.equal(cyc.replacement_cap, cap);
    const rows = [];
    const sameWeek = (i) => ({ due: true, reason: 'no_show', reason_code: 'no_show', due_at: iso(ms('2026-10-13T09:00:00+02:00') + i * H) });
    for (let i = 0; i < cap; i++) assert.equal(claim(cyc, rows, `lead_cap_${i}`, sameWeek(i)).row.status, 'due', `#${i + 1} (all in one week)`);
    const over = claim(cyc, rows, 'lead_cap_over', sameWeek(cap));
    assert.equal(over.row.status, 'rejected');
    assert.equal(over.row.note, 'cap_reached');
    assert.deepEqual(over.alerts, ['Jonathan: replacement cap reached']);
  });
}

test(`W13 [${MODE}] a rejected (disputed-and-upheld) claim frees its place under the cap; other cycles don't count`, () => {
  const cyc = newCycle('SMC_BRONZE');
  const rows = [{ lead_id: 'old', cycle_id: 'cyc_previous', status: 'approved' }];
  const t = (i) => ({ due: true, reason: 'no_show', reason_code: 'no_show', due_at: iso(ms('2026-10-13T09:00:00+02:00') + i * H) });
  const first = claim(cyc, rows, 'a', t(0)).row;
  for (const id of ['b', 'c', 'd']) claim(cyc, rows, id, t(1));
  dispute(first, ms(first.claimed_at) + H);
  decide(first, true);
  assert.equal(claim(cyc, rows, 'e', t(2)).row.status, 'due');
});

test(`W13 [${MODE}] 48-h dispute window: Lead Velocity can dispute at 47 h, not at 49 h; one replacement per lead`, () => {
  const rows = [];
  const cyc = clone(cycle());
  const trig = { due: true, reason: 'no_show', reason_code: 'no_show', due_at: '2026-10-17T17:00:00+02:00' };
  const { row } = claim(cyc, rows, 'lead_x', trig);
  const late = { ...row };
  dispute(row, ms(trig.due_at) + 47 * H);
  assert.equal(row.status, 'disputed');
  assert.throws(() => dispute(late, ms(trig.due_at) + 49 * H), /window closed/);
  assert.equal(claim(cyc, rows, 'lead_x', trig).row, row, 'idempotent per lead');
  assert.equal(rows.length, 1);
});

test(`W13 [${MODE}] shortfall: cycle extends up to 14 days; closes early once delivered; remaining shortfall credited pro rata, capped at price`, () => {
  const cyc = { ...clone(cycle()), renewing: true };
  const end = ms(cyc.ends_at);
  assert.equal(cycleState(cyc, { verified: 15, approvedReplacements: 0 }, end - D, SYNTHETIC_PRICE).status, 'active');
  const ext = cycleState(cyc, { verified: 18, approvedReplacements: 1 }, end, SYNTHETIC_PRICE);
  assert.equal(ext.status, 'extended');
  assert.equal(ext.extended_until, '2026-11-25T00:00:00+02:00');
  assert.equal(cycleState(cyc, { verified: 21, approvedReplacements: 1 }, end + 5 * D, SYNTHETIC_PRICE).status, 'closed', 'delivered on day 5 of the extension');
  const short = cycleState(cyc, { verified: 18, approvedReplacements: 0 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.deepEqual([short.status, short.shortfall, short.credit_zar, short.credit_as], ['closed', 2, SYNTHETIC_PRICE * 2 / 20, 'credit_next_cycle']);
  const leaving = cycleState({ ...cyc, renewing: false }, { verified: 18, approvedReplacements: 0 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.equal(leaving.credit_as, 'refund');
  const nothing = cycleState(cyc, { verified: 0, approvedReplacements: 3 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.equal(nothing.credit_zar, SYNTHETIC_PRICE, 'liability capped at the cycle price');
  assert.equal(cycleState(cyc, { verified: 20, approvedReplacements: 0 }, end, SYNTHETIC_PRICE).status, 'closed', 'on target: no extension');
});
