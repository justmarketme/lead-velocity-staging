// DRAFT for GATE-TEST-W09 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W09 Reminder sequence (client) — canonical sequence 4.12, minimum set 4.6 item 6
// Money rule protected: show rate. Multiple reminders beat one (Cochrane / BMJ Open); every touch is useful,
// lands at the right moment, is sent exactly once, and stops the instant the lead says STOP or the booking moves.
//   T0 + 10 min  what_to_expect
//   T-48 h       intro_media (video; voice if no video) — if booked >= 3 days out, else straight after booking
//   T-24 h       reminder_24h (Confirm / Reschedule) + prep_nudge
//   T-2 h        reminder_2h
//   T-10 min     reminder_10m
//   Booked < 24 h ahead -> compressed: no T-24 h touches.
//
// Run:  node --test automation/tests/W09.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, clone, ms, iso, MIN, H, D, renderBody, template, online } from './_harness.mjs';

// ============================================================================================
// Reference implementation
// ============================================================================================
const ONCE_PER_LINEAGE = new Set(['what_to_expect', 'intro_media', 'intro_media_voice']);
export const MAX_LEAD_MESSAGES = 12; // 4.6 cost design: ~12 messages per lead

/** @returns {compressed, jobs:[{touch, template, at, key}]} */
export function reminderPlan({ bookingId, start, bookedAt, lead: l, broker: b, alreadySent = [] }) {
  if (l.opted_out_at) return { compressed: false, jobs: [] };
  const T0 = ms(bookedAt);
  const M = ms(start);
  const lt = M - T0;
  const lang = l.language ?? 'en';
  const mediaTpl = b.intro_video_url?.[lang] ? 'intro_media' : b.intro_voice_url?.[lang] ? 'intro_media_voice' : null;
  const raw = [
    ['what_to_expect', 'what_to_expect', T0 + 10 * MIN],
    mediaTpl ? ['intro_media', mediaTpl, lt >= 72 * H ? M - 48 * H : T0 + 15 * MIN] : null,
    lt >= 24 * H ? ['reminder_24h', 'reminder_24h', M - 24 * H] : null,
    lt >= 24 * H ? ['prep_nudge', 'prep_nudge', M - 24 * H] : null,
    ['reminder_2h', 'reminder_2h', M - 2 * H],
    ['reminder_10m', 'reminder_10m', M - 10 * MIN],
  ].filter(Boolean);
  const jobs = raw
    .filter(([touch, , t]) => t > T0 && t < M)
    .filter(([touch, , t]) => !(touch === 'reminder_2h' && t <= T0 + 15 * MIN)) // booked ~2 h ahead: the confirmation is the reminder
    .filter(([touch]) => !(ONCE_PER_LINEAGE.has(touch) && alreadySent.includes(touch)))
    .map(([touch, tpl, t]) => ({ touch, template: tpl, at: iso(t), key: `${bookingId}:${touch}:${iso(t)}` }))
    .sort((a, b) => ms(a.at) - ms(b.at));
  return { compressed: lt < 24 * H, jobs };
}

/** Minimal scheduler: one row per job, unique key, sent at most once, cancellable. */
export class Scheduler {
  constructor() { this.rows = new Map(); this.sent = []; }
  add(leadId, bookingId, jobs) { for (const j of jobs) if (!this.rows.has(j.key)) this.rows.set(j.key, { ...j, lead_id: leadId, booking_id: bookingId, status: 'pending' }); }
  cancel(pred) { const out = []; for (const r of this.rows.values()) if (r.status === 'pending' && pred(r)) { r.status = 'cancelled'; out.push(r); } return out; }
  tick(now) {
    const due = [...this.rows.values()].filter((r) => r.status === 'pending' && ms(r.at) <= now);
    for (const r of due) { r.status = 'sent'; this.sent.push({ key: r.key, touch: r.touch, template: r.template, lead_id: r.lead_id, at: r.at }); }
    return due.length;
  }
  pending(leadId) { return [...this.rows.values()].filter((r) => r.lead_id === leadId && r.status === 'pending'); }
}

export function onConfirmTap(bk, now) { bk.status = 'confirmed'; bk.confirmed_at = iso(now); }

export function onReschedule(sched, bk, l, b, newStart, now) {
  const lineage = sched.sent.filter((s) => s.lead_id === l.id).map((s) => s.touch);
  const cancelled = sched.cancel((r) => r.booking_id === bk.id);
  Object.assign(bk, { start: newStart, reschedule_count: (bk.reschedule_count ?? 0) + 1, status: 'booked' }); // same row, same Graph event (moved, not duplicated)
  const plan = reminderPlan({ bookingId: bk.id, start: newStart, bookedAt: iso(now), lead: l, broker: b, alreadySent: lineage });
  sched.add(l.id, bk.id, plan.jobs);
  return { cancelled, plan };
}

// ============================================================================================
// Adapters
// ============================================================================================
const B = broker();
const leadOf = (fx) => ({ id: fx.lead_id, language: 'en', mobile: fx.expected.W01?.mobile });
const planFor = (fx, over = {}) =>
  reminderPlan({ bookingId: `bkg_${fx.fixture_id}`, start: fx.booking_request.slot_start, bookedAt: fx.booking_request.requested_at, lead: leadOf(fx), broker: B, ...over });

const offlineSys = { plan: async (fx) => planFor(fx) };
const onlineSys = {
  plan: async (fx) => {
    await online.post('/test/reset', { broker_id: B.broker_id, keep_calendar_busy: true });
    const r = fx.origin === 'page' ? await online.post('/lead', fx.submission, { now: fx.submission.submitted_at }) : await online.post('/test/seed-lead', fx);
    await online.post('/book', { ...fx.booking_request, lead_id: r.body.lead_id }, { now: fx.booking_request.requested_at });
    const s = await online.state(r.body.lead_id);
    const jobs = (s.scheduled ?? []).filter((j) => j.workflow === 'W09' && j.status === 'pending').map((j) => ({ touch: j.touch, at: j.at, template: j.template, key: j.key }));
    return { compressed: s.booking?.compressed ?? null, jobs };
  },
};
const sys = MODE === 'online' ? onlineSys : offlineSys;
const simple = (jobs) => jobs.map((j) => ({ touch: j.touch, at: j.at }));

// ============================================================================================
// Tests
// ============================================================================================
for (const id of ['L01', 'L04', 'L10']) {
  test(`W09 [${MODE}] ${id}: booked >= 24 h ahead -> full sequence at the hand-computed times`, async () => {
    const fx = lead(id);
    const p = await sys.plan(fx);
    assert.deepEqual(simple(p.jobs), fx.expected.W09.schedule);
    if (p.compressed !== null) assert.equal(p.compressed, false);
  });
}

for (const id of ['L02', 'L03']) {
  test(`W09 [${MODE}] ${id}: booked < 24 h ahead -> compressed (no T-24 h reminder or prep nudge)`, async () => {
    const fx = lead(id);
    const p = await sys.plan(fx);
    assert.deepEqual(simple(p.jobs), fx.expected.W09.schedule);
    assert.ok(!p.jobs.some((j) => ['reminder_24h', 'prep_nudge'].includes(j.touch)));
    if (p.compressed !== null) assert.equal(p.compressed, true);
  });
}

test(`W09 [${MODE}] intro media: T-48 h only when booked >= 3 days out (L01), else 15 min after booking (L04)`, async () => {
  const a = (await sys.plan(lead('L01'))).jobs.find((j) => j.touch === 'intro_media');
  assert.equal(a.at, iso(ms(lead('L01').booking_request.slot_start) - 48 * H));
  const b = (await sys.plan(lead('L04'))).jobs.find((j) => j.touch === 'intro_media');
  assert.equal(b.at, iso(ms(lead('L04').booking_request.requested_at) + 15 * MIN));
});

test(`W09 [${MODE}] every touch falls strictly between booking and meeting, in time order`, async () => {
  for (const fx of FIX.leads.filter((l) => l.expected.W09)) {
    const p = await sys.plan(fx);
    const T0 = ms(fx.booking_request.requested_at);
    const M = ms(fx.booking_request.slot_start);
    let prev = 0;
    for (const j of p.jobs) {
      assert.ok(ms(j.at) > T0 && ms(j.at) < M, `${fx.fixture_id} ${j.touch}`);
      assert.ok(ms(j.at) >= prev, `${fx.fixture_id} order`);
      prev = ms(j.at);
    }
  }
});

test(`W09 [${MODE}] booked exactly 2 h ahead (minimum notice): no separate T-2 h, T-10 min still goes`, (t) => {
  if (MODE === 'online') return t.skip('edge case of the pure rule');
  const fx = clone(lead('L02'));
  fx.booking_request.slot_start = '2026-10-12T13:40:00+02:00';
  const p = planFor(fx);
  assert.deepEqual(p.jobs.map((j) => j.touch), ['what_to_expect', 'intro_media', 'reminder_10m']);
});

test(`W09 [${MODE}] voice note replaces video when the broker has no approved video; nothing if neither`, (t) => {
  if (MODE === 'online') return t.skip('broker media is seeded per broker in W23 tests');
  const noVideo = { ...clone(B), intro_video_url: {} };
  const p = reminderPlan({ bookingId: 'b', start: lead('L01').booking_request.slot_start, bookedAt: lead('L01').booking_request.requested_at, lead: leadOf(lead('L01')), broker: noVideo });
  assert.equal(p.jobs.find((j) => j.touch === 'intro_media').template, 'intro_media_voice');
  const none = { ...noVideo, intro_voice_url: {} };
  const q = reminderPlan({ bookingId: 'b', start: lead('L01').booking_request.slot_start, bookedAt: lead('L01').booking_request.requested_at, lead: leadOf(lead('L01')), broker: none });
  assert.ok(!q.jobs.some((j) => j.touch === 'intro_media'));
});

test(`W09 [${MODE}] T-24 h "Confirm" tap -> booking status confirmed (L01)`, async (t) => {
  if (MODE === 'online') {
    const fx = lead('L01');
    const tap = fx.timeline.find((e) => e.data?.button === 'Confirm');
    await online.waInbound({ from: fx.expected.W01.mobile, buttonPayload: `confirm:bkg_${fx.fixture_id}`, now: ms(tap.at) });
    return t.diagnostic('online: confirm asserted via /test/state in the rehearsal script');
  }
  const bk = { id: 'bkg_L01', status: 'booked' };
  onConfirmTap(bk, ms(lead('L01').timeline.find((e) => e.data?.button === 'Confirm').at));
  assert.equal(bk.status, lead('L01').expected.W09.after_confirm_tap.booking_status);
});

test(`W09 [${MODE}] reschedule (L03): old reminders cancelled, new ones for the new time, intro not resent, same booking row`, (t) => {
  if (MODE === 'online') return t.skip('online reschedule is part of the W10 suite and the rehearsal');
  const fx = lead('L03');
  const exp = fx.expected.W09.after_reschedule;
  const sched = new Scheduler();
  const l = leadOf(fx);
  const bk = { id: 'bkg_L03', start: fx.booking_request.slot_start, status: 'booked', graph_event_id: 'AAMkTEST_L03' };
  sched.add(l.id, bk.id, planFor(fx).jobs);
  const resAt = ms(fx.reschedule_request.requested_at);
  sched.tick(resAt); // what_to_expect, intro_media, reminder_2h already went out
  const { cancelled, plan } = onReschedule(sched, bk, l, B, fx.reschedule_request.new_slot_start, resAt);
  assert.deepEqual(cancelled.map((c) => `${c.touch}@${c.at}`), exp.cancelled);
  assert.deepEqual(simple(plan.jobs), exp.schedule);
  for (const touch of exp.not_resent) assert.ok(!plan.jobs.some((j) => j.touch === touch), touch);
  assert.equal(bk.graph_event_id, 'AAMkTEST_L03', 'event moved, not duplicated');
  assert.equal(bk.reschedule_count, exp.reschedule_count);
});

test(`W09 [${MODE}] STOP (L10) cancels every pending reminder; an opted-out lead gets no plan at all`, (t) => {
  if (MODE === 'online') return t.skip('asserted in W15.test.mjs online');
  const fx = lead('L10');
  const sched = new Scheduler();
  const l = leadOf(fx);
  sched.add(l.id, 'bkg_L10', planFor(fx).jobs);
  const stopAt = ms(fx.stop_message.at);
  sched.tick(stopAt);
  const cancelled = sched.cancel((r) => r.lead_id === l.id);
  assert.deepEqual(cancelled.map((c) => c.touch), ['reminder_2h', 'reminder_10m']);
  sched.tick(ms(fx.booking_request.slot_start));
  assert.ok(sched.sent.every((s) => ms(s.at) <= stopAt), 'nothing sent after STOP');
  assert.equal(planFor(fx, { lead: { ...l, opted_out_at: fx.stop_message.at } }).jobs.length, 0);
});

test(`W09 [${MODE}] scheduler sends each reminder exactly once even if ticks overlap or repeat (no retry storm)`, (t) => {
  if (MODE === 'online') return t.skip('idempotency keys asserted on the scheduler table in staging');
  const sched = new Scheduler();
  const fx = lead('L01');
  const jobs = planFor(fx).jobs;
  sched.add(fx.lead_id, 'bkg_L01', jobs);
  sched.add(fx.lead_id, 'bkg_L01', jobs); // workflow re-run: same keys, no duplicates
  const end = ms(fx.booking_request.slot_start);
  for (let now = ms(fx.booking_request.requested_at); now <= end; now += 30 * MIN) { sched.tick(now); sched.tick(now); }
  sched.tick(end); sched.tick(end);
  assert.equal(sched.sent.length, jobs.length);
  assert.equal(new Set(sched.sent.map((s) => s.key)).size, jobs.length);
});

test(`W09 [${MODE}] message budget: first touch + reminders + post-call touches <= ${MAX_LEAD_MESSAGES} per booked lead`, async () => {
  const POST_CALL = ['reach_check', 'attended_thanks', 'lead_pulse'];
  for (const fx of FIX.leads.filter((l) => l.expected.W09)) {
    const n = 1 + (await sys.plan(fx)).jobs.length + POST_CALL.length;
    assert.ok(n <= MAX_LEAD_MESSAGES, `${fx.fixture_id}: ${n}`);
  }
});

test(`W09 [${MODE}] reminder copy comes from the real templates (positive norm, Confirm/Reschedule, STOP line)`, () => {
  const t24 = renderBody('reminder_24h', ['Lerato', 'Microsoft Teams', 'Mark Smith', '10:00']);
  assert.ok(t24.includes('Most people find 30 minutes is all it takes'));
  assert.ok(t24.includes('Reply STOP to opt out.'));
  const btns = template('reminder_24h').components.find((c) => c.type === 'BUTTONS').buttons.map((b) => b.text);
  assert.deepEqual(btns, ['Confirm', 'Reschedule']);
  for (const name of ['what_to_expect', 'reminder_2h', 'reminder_10m', 'prep_nudge', 'intro_media', 'intro_media_voice'])
    assert.equal(template(name).category, 'UTILITY', name);
});
