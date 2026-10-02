// DRAFT for GATE-TEST-W12 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W12 Outcome, disposition & feedback (two-sided) — 4.6 W12 row, 4.12a, Schedule C/D
// Money rule protected: a no-show is only a no-show when the LEAD's side agrees. The broker's tap alone never
// creates a replacement: a lead no-show needs the lead to also stay silent on the reach-check; if the lead says
// the adviser didn't call, it is a broker no-show (no replacement, we apologise and rebook). Unmarked meetings
// become "attended" at 24 h, flagged "unconfirmed", so nothing sits in limbo.
//
// Run:  node --test automation/tests/W12.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, clone, ms, iso, MIN, H, D, template, online } from './_harness.mjs';

// ============================================================================================
// Reference implementation
// ============================================================================================
export const OUTCOME_CHECK_AFTER_END = 15 * MIN; // broker
export const REACH_CHECK_AFTER_END = 30 * MIN; // lead (ASSUMPTION: anchored on slot end, like the broker's)
export const BROKER_NUDGE_AFTER = 3 * H; // one nudge
export const AUTO_ATTEND_AFTER_END = 24 * H;
export const REACH_WINDOW = 2 * H; // ASSUMPTION (fixtures _meta)
export const FIT_FOLLOWUP_AFTER = 7 * D;
export const CODES = FIX._meta.disposition_codes;
export const REPLACEMENT_CODES = new Set(['unreachable', 'nofit_criteria']); // 4.12a: "nothing else does"
// Template button text (<= 25 chars, see templates README) -> code. Same order as broker_disposition.json.
export const BUTTON_TO_CODE = {
  'Good fit – proceeding': 'fit_proceeding',
  'Good fit – follow-up': 'fit_followup',
  'Not a fit – budget': 'nofit_budget',
  'Not a fit – covered': 'nofit_covered',
  'Not a fit – criteria': 'nofit_criteria',
  'Unreachable / wrong no.': 'unreachable',
};

export function postCallPlan(slotEnd) {
  const e = ms(slotEnd);
  return {
    outcome_check_at: iso(e + OUTCOME_CHECK_AFTER_END),
    broker_nudge_at: iso(e + OUTCOME_CHECK_AFTER_END + BROKER_NUDGE_AFTER),
    reach_check_at: iso(e + REACH_CHECK_AFTER_END),
    auto_attend_at: iso(e + AUTO_ATTEND_AFTER_END),
  };
}

/**
 * Resolve the outcome from both sides at time `now`.
 * @param m { slotEnd, brokerMark: 'attended'|'no_show'|'rescheduled'|null, reach: 'yes'|'no'|null, consentAds, optedOut, leadId }
 */
export function resolveOutcome(m, now) {
  const p = postCallPlan(m.slotEnd);
  const r = { outcome: 'pending', auto_marked: false, unconfirmed: false, lead_reach_check: m.reach ?? 'none', dispute_status: null, lead_message: null, capi: [], alerts: [], next: null };
  const attended = (extra = {}) => {
    Object.assign(r, { outcome: 'attended', ...extra });
    if (!m.optedOut) r.lead_message = 'attended_thanks';
    if (m.consentAds !== false) r.capi.push({ event_name: 'Attended', event_id: `evt_${m.leadId}_attended` });
    r.next = 'W12_disposition';
    return r;
  };
  if (m.brokerMark === 'rescheduled') return Object.assign(r, { outcome: 'rescheduled', next: 'W10' });
  if (m.reach === 'no') {
    if (m.brokerMark === 'attended') return attended({ dispute_status: 'open', next: 'console_queue' }); // two sides disagree
    Object.assign(r, { outcome: 'broker_no_show', lead_message: m.optedOut ? null : 'broker_no_show_apology', next: 'rebook_at_our_cost' });
    r.alerts.push('KG');
    return r;
  }
  if (m.brokerMark === 'attended') return attended();
  if (m.brokerMark === 'no_show') {
    if (m.reach === 'yes') return Object.assign(r, { outcome: 'disputed', dispute_status: 'open', next: 'console_queue' });
    const confirmAt = ms(p.reach_check_at) + REACH_WINDOW;
    if (now >= confirmAt) return Object.assign(r, { outcome: 'no_show', no_show_confirmed_at: iso(confirmAt), lead_message: m.optedOut ? null : 'missed_you', next: 'W13' });
    return r; // waiting for the lead's side
  }
  if (now >= ms(p.auto_attend_at)) return attended({ auto_marked: true, unconfirmed: true });
  return r;
}

/** Broker's disposition + quality (only after attended). */
export function recordDisposition(outcome, { code, quality, at }) {
  if (outcome.outcome !== 'attended') throw new Error('disposition only after attended');
  if (!CODES.includes(code)) throw new Error(`unknown code ${code}`);
  if (quality !== undefined && !(Number.isInteger(quality) && quality >= 1 && quality <= 5)) throw new Error('quality must be 1-5');
  return {
    disposition_code: code,
    quality_score: quality ?? null,
    counts_as_delivered: true,
    replacement_eligible: REPLACEMENT_CODES.has(code),
    broker_fit_followup_at: code === 'fit_followup' ? iso(ms(at) + FIT_FOLLOWUP_AFTER) : null,
  };
}

/** 4.12a friction rule: two unconfirmed in a cycle -> Jonathan calls the broker. */
export const unconfirmedAlert = (outcomesInCycle) => (outcomesInCycle.filter((o) => o.unconfirmed).length >= 2 ? ['Jonathan: call broker'] : []);

// ============================================================================================
// Adapters
// ============================================================================================
const endOf = (fx) => {
  const start = fx.reschedule_request?.new_slot_start ?? fx.booking_request.slot_start;
  return iso(ms(start) + broker().slot_minutes * MIN);
};
function sidesFrom(fx) {
  const bTap = fx.timeline.filter((e) => e.actor === 'broker' && e.data?.template === 'broker_outcome_check').at(-1);
  const lTap = fx.timeline.filter((e) => e.actor === 'lead' && e.data?.template === 'reach_check').at(-1);
  const map = { Attended: 'attended', 'No-show': 'no_show', Rescheduled: 'rescheduled' };
  return { brokerMark: bTap ? map[bTap.data.button] : null, reach: lTap ? (lTap.data.button.startsWith('Yes') ? 'yes' : 'no') : null };
}
const offlineSys = {
  resolve: async (fx, now, over = {}) => resolveOutcome({ slotEnd: endOf(fx), leadId: fx.lead_id, consentAds: true, ...sidesFrom(fx), ...over }, ms(now)),
};
// Online: the booking is seeded, both sides' taps are replayed as signed WhatsApp webhooks, then the virtual clock is ticked.
const onlineSys = {
  resolve: async (fx, now, over = {}) => {
    const seeded = (await online.post('/test/seed-booking', { fixture: fx, slot_end: endOf(fx) })).body;
    const s = { ...sidesFrom(fx), ...over };
    const end = ms(endOf(fx));
    if (s.brokerMark) await online.waInbound({ from: broker().adviser_whatsapp, buttonPayload: `outcome:${seeded.booking_id}:${s.brokerMark}`, now: end + 20 * MIN });
    if (s.reach) await online.waInbound({ from: seeded.mobile, buttonPayload: `reach:${seeded.booking_id}:${s.reach}`, now: end + 40 * MIN });
    await online.tick(ms(now));
    const st = await online.state(seeded.lead_id);
    return { ...st.outcome, capi: st.capi?.filter((c) => c.event_name === 'Attended') ?? [] };
  },
};
const sys = MODE === 'online' ? onlineSys : offlineSys;

// ============================================================================================
// Tests
// ============================================================================================
test(`W12 [${MODE}] post-call timing: broker T+15 after the slot ends, lead reach-check T+30, one nudge at +3 h`, () => {
  for (const id of ['L01', 'L02', 'L03', 'L04']) {
    const fx = lead(id);
    const p = postCallPlan(endOf(fx));
    assert.equal(p.outcome_check_at, fx.expected.W12.outcome_check_at, id);
    if (fx.expected.W12.reach_check_at) assert.equal(p.reach_check_at, fx.expected.W12.reach_check_at, id);
    if (fx.expected.W12.broker_nudge_at) assert.equal(p.broker_nudge_at, fx.expected.W12.broker_nudge_at, id);
  }
});

test(`W12 [${MODE}] L01: Attended + lead "Yes" -> attended, CAPI Attended, thank-you; fit_followup q4 -> broker nudge in 7 d`, async () => {
  const fx = lead('L01');
  const e = fx.expected.W12;
  const o = await sys.resolve(fx, '2026-10-15T11:05:00+02:00');
  assert.equal(o.outcome, e.outcome);
  assert.equal(o.auto_marked, e.auto_marked);
  assert.equal(o.unconfirmed, e.unconfirmed);
  assert.equal(o.lead_reach_check, e.lead_reach_check);
  assert.deepEqual(o.capi.map((c) => c.event_id), [e.capi_attended_event_id]);
  if (MODE === 'offline') {
    assert.equal(o.lead_message, e.lead_message);
    const tapD = fx.timeline.find((x) => x.data?.template === 'broker_disposition');
    const tapQ = fx.timeline.find((x) => x.data?.template === 'broker_quality');
    const d = recordDisposition(o, { code: tapD.data.payload, quality: Number(tapQ.data.payload), at: tapD.at });
    assert.equal(d.disposition_code, e.disposition_code);
    assert.equal(d.quality_score, e.quality_score);
    assert.equal(d.broker_fit_followup_at, e.broker_fit_followup_at);
    assert.equal(d.replacement_eligible, false);
  }
});

test(`W12 [${MODE}] L02: broker taps No-show but the lead says "No, not yet" -> BROKER no-show (Schedule D), no lead no-show`, async () => {
  const fx = lead('L02');
  const o = await sys.resolve(fx, '2026-10-13T11:45:00+02:00');
  assert.equal(o.outcome, 'broker_no_show');
  assert.equal(o.lead_reach_check, 'no');
  assert.equal(o.capi.length, 0, 'no Attended event');
  if (MODE === 'offline') {
    assert.equal(o.lead_message, fx.expected.W12.lead_message);
    assert.deepEqual(o.alerts, ['KG']);
    assert.equal(o.next, 'rebook_at_our_cost');
  }
});

test(`W12 [${MODE}] L03: broker never marks and the lead says the adviser didn't call -> broker no-show, NOT auto-attended at 24 h`, async () => {
  const fx = lead('L03');
  const o = await sys.resolve(fx, iso(ms(endOf(fx)) + 25 * H));
  assert.equal(o.outcome, 'broker_no_show');
  assert.equal(o.auto_marked, false);
});

test(`W12 [${MODE}] L04: broker No-show + lead silent -> pending until the 2-h reach window closes, then a lead no-show`, async () => {
  const fx = lead('L04');
  const e = fx.expected.W12;
  const early = await sys.resolve(fx, '2026-10-15T16:59:00+02:00');
  assert.equal(early.outcome, 'pending', 'no no-show while the lead can still answer');
  const late = await sys.resolve(fx, '2026-10-15T17:00:00+02:00');
  assert.equal(late.outcome, e.outcome);
  assert.equal(late.lead_reach_check, e.lead_reach_check);
  if (MODE === 'offline') {
    assert.equal(late.no_show_confirmed_at, e.no_show_confirmed_at);
    assert.equal(late.lead_message, e.lead_message);
    assert.equal(late.next, 'W13');
  }
});

test(`W12 [${MODE}] nobody marks anything -> at 24 h: attended, auto_marked, unconfirmed (and CAPI Attended)`, async () => {
  const fx = clone(lead('L01'));
  fx.timeline = fx.timeline.filter((x) => !['broker_outcome_check', 'reach_check'].includes(x.data?.template));
  const before = await sys.resolve(fx, iso(ms(endOf(fx)) + 24 * H - MIN));
  assert.equal(before.outcome, 'pending');
  const after = await sys.resolve(fx, iso(ms(endOf(fx)) + 24 * H));
  assert.equal(after.outcome, 'attended');
  assert.equal(after.auto_marked, true);
  assert.equal(after.unconfirmed, true);
  assert.equal(after.capi.length, 1);
});

test(`W12 [${MODE}] sides disagree -> console queue, never an automatic replacement`, (t) => {
  if (MODE === 'online') return t.skip('dispute queue is asserted in the console E2E test');
  const base = { slotEnd: '2026-10-15T10:30:00+02:00', leadId: 'x', consentAds: true };
  const a = resolveOutcome({ ...base, brokerMark: 'no_show', reach: 'yes' }, ms('2026-10-15T12:00:00+02:00'));
  assert.equal(a.outcome, 'disputed');
  assert.equal(a.next, 'console_queue');
  const b = resolveOutcome({ ...base, brokerMark: 'attended', reach: 'no' }, ms('2026-10-15T12:00:00+02:00'));
  assert.equal(b.outcome, 'attended');
  assert.equal(b.dispute_status, 'open');
});

test(`W12 [${MODE}] Rescheduled -> hands over to W10; opted-out lead gets no thank-you`, (t) => {
  if (MODE === 'online') return t.skip('W10 suite');
  const base = { slotEnd: '2026-10-15T10:30:00+02:00', leadId: 'x', consentAds: true };
  assert.equal(resolveOutcome({ ...base, brokerMark: 'rescheduled', reach: null }, ms('2026-10-15T11:00:00+02:00')).next, 'W10');
  assert.equal(resolveOutcome({ ...base, brokerMark: 'attended', reach: null, optedOut: true }, ms('2026-10-15T11:00:00+02:00')).lead_message, null);
});

test(`W12 [${MODE}] disposition buttons map 1:1 onto the six 4.12a codes; only unreachable + nofit_criteria open a replacement`, () => {
  const btns = template('broker_disposition').components.find((c) => c.type === 'BUTTONS').buttons.map((b) => b.text);
  assert.deepEqual(btns.map((b) => BUTTON_TO_CODE[b]), CODES);
  const att = { outcome: 'attended' };
  const eligible = CODES.filter((c) => recordDisposition(att, { code: c, at: '2026-10-15T11:00:00+02:00' }).replacement_eligible);
  assert.deepEqual(eligible.sort(), ['nofit_criteria', 'unreachable']);
  assert.ok(CODES.every((c) => recordDisposition(att, { code: c, at: '2026-10-15T11:00:00+02:00' }).counts_as_delivered));
});

test(`W12 [${MODE}] quality must be 1-5; no disposition on a no-show`, () => {
  const att = { outcome: 'attended' };
  for (const q of [0, 6, 2.5]) assert.throws(() => recordDisposition(att, { code: 'fit_proceeding', quality: q, at: '2026-10-15T11:00:00+02:00' }));
  assert.throws(() => recordDisposition({ outcome: 'no_show' }, { code: 'unreachable', at: '2026-10-15T11:00:00+02:00' }));
});

test(`W12 [${MODE}] two unconfirmed outcomes in one cycle -> Jonathan calls the broker`, () => {
  assert.deepEqual(unconfirmedAlert([{ unconfirmed: true }]), []);
  assert.deepEqual(unconfirmedAlert([{ unconfirmed: true }, { unconfirmed: false }, { unconfirmed: true }]), ['Jonathan: call broker']);
});
