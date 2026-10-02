// W10 Reschedule / cancel - synthetic tests (fixtures only; slots from the shared W04 rules in _slots.mjs).
// DRAFT for Jonathan (4C.2). Run: node --test automation/tests/W10.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lead, broker, ms, iso, H, MIN, renderBody } from './_harness.mjs';
import { generateSlots } from './_slots.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as R from '../lib/w10.mjs';

const WF = JSON.parse(readFileSync(new URL('../W10.json', import.meta.url), 'utf8'));
const B = broker();
const BR = { id: B.broker_id, contact_person: B.adviser_name, methods_supported: B.methods_supported };
const L03 = lead('L03');
const tap = (fx, f) => fx.timeline.find(f);
const RESCHED_TAP = ms(tap(L03, (e) => e.data?.button === 'Reschedule').at);
const start0 = L03.booking_request.slot_start;
const bk = (over = {}) => ({ id: 'bk_L03', client_id: L03.lead_id, broker_id: B.broker_id, appointment_date: start0, ends_at: iso(ms(start0) + 30 * MIN), method: 'whatsapp_call', status: 'booked', graph_event_id: 'AAMk-test-L03', reschedule_count: 0, ...over });
const ld = (over = {}) => ({ id: L03.lead_id, first_name: 'Anele', last_name: 'K', phone: '+27600000003', conv_state: {}, ...over });
const slotsAt = (now, bookings = []) => generateSlots(B, B.calendar_busy, bookings, now).slots;

test('L03 taps Reschedule on reminder_2h (in window): 10-slot list from the W04 rules, ids carry the booking', () => {
  const slots = slotsAt(RESCHED_TAP, [{ start: start0, end: bk().ends_at, status: 'cancelled' }]);
  const o = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'list' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP });
  assert.equal(o.kind, 'list_session');
  assert.ok(o.rows.length > 0 && o.rows.length <= 10);
  assert.ok(o.rows.every((r) => /^slot_.+:resched:bk_L03$/.test(r.id) && r.title.length <= 24));
  assert.ok(slots.some((x) => x.start === L03.reschedule_request.new_slot_start), 'the fixture pick is a free slot under the W04 rules');
  assert.deepEqual(o.rows.map((r) => r.id.slice(5, 30)), slots.slice(0, o.rows.length).map((x) => x.start), 'earliest first');
  assert.ok(slots.every((s) => ms(s.start) >= RESCHED_TAP + 2 * H), 'min notice from W04');
});

test('outside the 24-h window: reschedule_offer template with 3 slots on 3 different days', () => {
  const slots = slotsAt(RESCHED_TAP);
  const o = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, brand: {}, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP - 30 * H });
  assert.equal(o.template, 'reschedule_offer');
  assert.equal(new Set(o.buttons.slice(0, 3).map((p) => R.parseSlotPayload(p).start.slice(0, 10))).size, 3);
  assert.equal(o.buttons[3], 'other_times:bk_L03');
  assert.match(renderBody('reschedule_offer', o.vars), /^Hi Anele, no problem\. Here are new times with Mark:\n1\. \w{3} \d+ \w{3}, \d\d:\d\d/);
});

test('booking_ui = flow: reschedule Flow with the current booking pre-filled; template v2 outside the window; no slots -> escalate', () => {
  const slots = slotsAt(RESCHED_TAP);
  const f = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'flow' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP });
  assert.equal(f.kind, 'flow_session'); assert.equal(f.prefill.booking_id, 'bk_L03'); assert.equal(f.prefill.current_time, '11:30');
  const v2 = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'flow' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: NaN });
  assert.equal(v2.template, 'reschedule_offer_v2'); assert.deepEqual(v2.vars, ['Anele', 'Mark', 'Tue 13 Oct', '11:30']);
  assert.equal(R.offerMessage({ booking: bk(), lead: ld(), broker: BR, slots: [], now_ms: RESCHED_TAP }).kind, 'no_slots');
});

test('L03 picks 14 Oct 14:00: MOVE the same booking + same Graph event, reschedule_count 1, W09 rebuild, no replacement', () => {
  const pick = R.parseSlotPayload(`slot_${L03.reschedule_request.new_slot_start}:resched:bk_L03`);
  assert.deepEqual(pick, { start: L03.reschedule_request.new_slot_start, booking_id: 'bk_L03' });
  const d = R.applyReschedule(bk(), { start: pick.start, end: iso(ms(pick.start) + 30 * MIN) }, { now_ms: RESCHED_TAP + 2 * MIN, free: true, initiated_by: 'lead', idempotency_key: L03.reschedule_request.idempotency_key, seen_keys: new Set() });
  assert.equal(d.action, 'move');
  assert.equal(d.graph.op, 'patch'); assert.equal(d.graph.event_id, 'AAMk-test-L03'); // fixture: same_graph_event_id
  assert.equal(d.update.reschedule_count, L03.expected.W09.after_reschedule.reschedule_count);
  assert.equal(d.update.appointment_date, '2026-10-14T14:00:00+02:00');
  assert.equal(d.w09, 'rebuild'); assert.equal(d.replacement, 'none'); assert.equal(d.flag_second_reschedule, false);
  assert.equal(d.lead_message, 'booking_confirmed');
  assert.match(R.brokerNotice(d.broker_notice, ld()), /^Anele K\. moved their call from Tue 13 Oct, 11:30 to Wed 14 Oct, 14:00\./);
});

test('idempotent replay, slot taken (next 3), not-live booking, second reschedule flagged', () => {
  const s = { start: '2026-10-14T14:00:00+02:00', end: '2026-10-14T14:30:00+02:00' };
  assert.equal(R.applyReschedule(bk(), s, { free: true, idempotency_key: 'k', seen_keys: new Set(['k']) }).action, 'replay');
  const next = slotsAt(RESCHED_TAP);
  const taken = R.applyReschedule(bk(), s, { free: false, next_slots: next, idempotency_key: 'k2', seen_keys: new Set() });
  assert.equal(taken.action, 'slot_taken'); assert.equal(taken.offer.length, 3);
  assert.equal(R.applyReschedule(bk({ status: 'cancelled' }), s, { free: true }).action, 'reject');
  const second = R.applyReschedule(bk({ reschedule_count: 1 }), s, { free: true });
  assert.equal(second.flag_second_reschedule, true); assert.equal(second.update.reschedule_count, 2);
});

test('after the meeting (W12 broker Rescheduled / rebook after no-show): NEW booking linked by previous_booking_id; Schedule D flag', () => {
  const s = { start: '2026-10-16T10:00:00+02:00', end: '2026-10-16T10:30:00+02:00' };
  const d = R.applyReschedule(bk({ status: 'booked' }), s, { free: true, after_meeting: true, initiated_by: 'broker' });
  assert.equal(d.action, 'new_booking'); assert.equal(d.insert.previous_booking_id, 'bk_L03'); assert.equal(d.old_update.status, 'rescheduled');
  assert.equal(d.graph.op, 'create'); assert.equal(d.schedule_d, true); assert.equal(d.replacement, 'none');
  assert.equal(R.replacementEffect('rebooked_after_no_show').w13, 'stop_clock');
});

test('cancel: button cancels at once, typed asks first; Graph delete, W09 cancel, ONE rebooking offer, no replacement', () => {
  assert.equal(R.classifyOp({ msg: { payload: 'cancel:bk_L03' } }), 'cancel');
  assert.equal(R.classifyOp({ delegate: { action: 'cancel_confirm' } }), 'cancel_ask');
  assert.equal(R.classifyOp({ msg: { payload: 'cancel_yes:bk_L03' } }), 'cancel');
  assert.equal(R.classifyOp({ msg: { payload: 'keep_it:bk_L03' } }), 'keep');
  assert.equal(R.cancelNeedsConfirm('text'), true); assert.equal(R.cancelNeedsConfirm('button'), false);
  const c = R.applyCancel(bk(), ld(), { now_ms: RESCHED_TAP });
  assert.equal(c.action, 'cancel'); assert.equal(c.update.status, 'cancelled'); assert.equal(c.graph.op, 'delete');
  assert.equal(c.w09, 'cancel_all'); assert.equal(c.rebook_offer, true); assert.equal(c.replacement, 'none');
  assert.equal(R.applyCancel(bk(), ld({ conv_state: c.conv_state_patch }), { now_ms: RESCHED_TAP }).rebook_offer, false, 'offered once only');
  assert.equal(R.applyCancel(bk(), ld({ opted_out_at: 'x' }), { now_ms: RESCHED_TAP }).rebook_offer, false, 'never after STOP');
  assert.equal(R.applyCancel(bk({ status: 'cancelled' }), ld(), { now_ms: RESCHED_TAP }).action, 'noop');
  assert.match(R.brokerNotice(c.broker_notice, ld()), /cancelled their call on Tue 13 Oct, 11:30/);
});

test('op classification covers every entry', () => {
  assert.equal(R.classifyOp({ msg: { payload: 'reschedule:bk' } }), 'offer');
  assert.equal(R.classifyOp({ msg: { payload: 'other_times:bk' } }), 'offer');
  assert.equal(R.classifyOp({ delegate: { action: 'reschedule_slots' } }), 'offer');
  assert.equal(R.classifyOp({ delegate: { action: 'change_method' } }), 'change_method');
  assert.equal(R.classifyOp({ msg: { list_id: 'slot_2026-10-14T14:00:00+02:00:resched:bk' } }), 'pick');
  assert.equal(R.classifyOp({ source: 'W12', outcome: 'rescheduled' }), 'broker_rescheduled');
});

test('change method: only supported methods; Teams needs an email first; same method is a no-op', () => {
  assert.equal(R.changeMethod(bk(), ld(), BR, 'zoom').action, 'reject');
  assert.equal(R.changeMethod(bk(), ld(), BR, 'teams').action, 'ask_email');
  assert.equal(R.changeMethod(bk(), ld({ email: 'howzit+anele.test@leadvelocity.co.za', email_status: 'mx_ok' }), BR, 'teams').action, 'change');
  assert.equal(R.changeMethod(bk(), ld(), BR, 'phone').action, 'change');
  assert.equal(R.changeMethod(bk(), ld(), BR, 'whatsapp_call').action, 'noop');
});

test('replacement rules: lead or broker reschedule/cancel never opens one', () => {
  for (const e of ['lead_reschedule', 'lead_cancel', 'broker_reschedule', 'broker_cancel']) assert.equal(R.replacementEffect(e).w13, 'none', e);
});

test('W10.json: physical columns only; move re-checks overlap + buffer in SQL; slots via W04; DRY_RUN guard', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const move = WF.nodes.find((n) => n.name === 'Move booking in place (re-check overlap + buffer)').parameters.query;
  assert.match(move, /tstzrange/); assert.match(move, /make_interval\(mins => \$5::int\)/); assert.match(move, /reschedule_count = a\.reschedule_count \+ 1/);
  const execs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => n.parameters.workflowId.cachedResultName);
  assert.ok(execs.includes('W04 Slots API') && execs.includes('W09 Reminder sequence') && execs.includes('W05 Book'));
  assert.ok(!JSON.stringify(WF).includes("INSERT INTO public.replacements"), 'W10 never writes replacements');
  assert.ok(JSON.stringify(WF).includes('DRY_RUN_SENDS'));
});
