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

test('cancel: a Cancel tap and a typed cancel both open the cancel card; Yes cancels; Graph delete, W09 cancel, ONE rebooking offer, no replacement', () => {
  assert.equal(R.classifyOp({ msg: { payload: 'cancel:bk_L03' } }), 'cancel_ask', 'cancel card (Jono, 2026-10-19; was: cancel at once)');
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

// ---- Schedule C1A (I-37l): default pending NH-42 = options (a) + (b) ----
const CANCELLED_AT = '2026-10-12T10:00:00+02:00';
const vLead = (over = {}) => ({ id: L03.lead_id, verified_at: '2026-10-08T09:05:00+02:00', first_message_at: '2026-10-08T09:00:40+02:00', opted_out_at: null, conv_state: { rebook_offered: true }, ...over });
const cBk = (over = {}) => bk({ status: 'cancelled', cancelled_at: CANCELLED_AT, brand_id: 'brand_smc', ...over });
const c1a = (over = {}) => R.c1aDecision({ lead: vLead(), booking: cBk(), cancelled_by: 'lead', rebooked: false, rebook_offered: true, inbound_after_cancel: [], already_claimed: false, now_ms: ms(CANCELLED_AT) + R.C1A_SEQUENCE_MS + MIN, ...over });

test('C1A default is a+b (pending NH-42)', () => {
  assert.equal(R.C1A_DEFAULT_MODE, 'a+b');
  assert.equal(R.C1A_SEQUENCE_MS, 96 * H, 'rebooking offer + W08 +2/+24/+72 h + close 24 h after the last nudge');
});

test('C1A point 3: verified lead cancels, goes quiet after the one offer + sequence -> W13 claim unreachable / cancel_no_rebook', () => {
  const d = c1a();
  assert.equal(d.claim, true); assert.equal(d.stop_messaging, false);
  assert.deepEqual({ op: d.w13.op, reason: d.w13.reason, code: d.w13.code, reason_code: d.w13.reason_code, outcome_id: d.w13.outcome_id }, { op: 'claim', reason: 'uncontactable', code: 'unreachable', reason_code: 'cancel_no_rebook', outcome_id: null });
  assert.equal(d.w13.idempotency_key, 'w10:c1a:bk_L03'); assert.equal(d.w13.lead_id, L03.lead_id); assert.equal(d.activity, 'c1a_cancel_no_rebook');
  assert.equal(c1a({ now_ms: ms(CANCELLED_AT) + 95 * H }).why, 'sequence_running', 'not before the sequence ends');
  assert.equal(c1a({ rebook_offered: false }).why, 'rebook_offer_not_sent_yet');
  assert.equal(c1a({ inbound_after_cancel: [{ content: 'Maybe next week' }] }).w13.reason_code, 'cancel_no_rebook', 'a reply that is not a plain "no call" is still no rebook');
});

test('C1A point 2: plain "I don\'t want a call" / "No thanks" -> stop at once + W13 claim nofit_criteria / no_call (no wait for the sequence)', () => {
  for (const m of [{ content: "I don't want a call" }, { content: 'No thanks' }, { content: 'no thank you.' }, { payload: 'no_thanks' }]) {
    const d = c1a({ inbound_after_cancel: [m], now_ms: ms(CANCELLED_AT) + H });
    assert.equal(d.claim, true, JSON.stringify(m)); assert.equal(d.stop_messaging, true);
    assert.deepEqual([d.w13.reason, d.w13.code, d.w13.reason_code], ['disqualified', 'nofit_criteria', 'no_call']);
  }
  assert.equal(c1a({ lead: vLead({ conv_state: { declined_call: true } }), now_ms: ms(CANCELLED_AT) + H }).w13.reason_code, 'no_call', 'W10 op no_call flag');
  assert.equal(R.isNoCall({ text: 'no thanks, maybe Friday works' }), false, 'not plain: no claim on that line');
  assert.equal(R.isNoCall({ text: 'Can you call me tomorrow?' }), false);
  assert.equal(R.classifyOp({ delegate: { action: 'no_call' } }), 'no_call');
  assert.equal(R.classifyOp({ msg: { payload: `no_call:bk_L03` } }), 'no_call');
  const stop = R.applyNoCall(cBk(), ld());
  assert.equal(stop.action, 'stop'); assert.equal(stop.lead_stage, 'unbooked_closed'); assert.equal(stop.w09, 'cancel_all');
  assert.equal(stop.conv_state_patch.declined_call, true); assert.equal(stop.conv_state_patch.declined_nurture, true, 'W08 stops on it');
  const live = R.applyNoCall(bk(), ld());
  assert.equal(live.action, 'confirm_cancel_first'); assert.equal(live.lead_stage, null);
  assert.equal(R.applyCancel(bk(), ld({ conv_state: { declined_call: true } }), { now_ms: RESCHED_TAP }).rebook_offer, false, 'no rebooking offer after a plain no');
});

test('R5-01: plain "no call" = objection -> suppression record (W08 style) on both branches; W10.json writes suppression via smc_hash_contact in the same statement', () => {
  for (const b of [cBk(), bk()]) {
    const nc = R.applyNoCall(b, ld());
    assert.deepEqual(nc.suppress, { source: 'objection', note: 'no_call_c1a' });
    assert.equal(nc.w09, 'cancel_all'); assert.equal(nc.conv_state_patch.declined_call, true); // C1A (a)+(b) default unchanged
  }
  const node = WF.nodes.find((x) => x.name === 'Stop messaging (no call)');
  const q = node.parameters.query;
  assert.match(q, /INSERT INTO public\.suppression \(mobile_hash, source, brand_id, lead_id, note\)/);
  assert.match(q, /public\.smc_hash_contact\(upd\.phone\)/);
  assert.match(q, /ON CONFLICT DO NOTHING/);
  assert.match(q, /WITH upd AS \(UPDATE public\.leads/, 'close + suppress in ONE statement');
  const rep = node.parameters.options.queryReplacement;
  assert.match(rep, /\$json\.nc\.suppress\.source/); assert.match(rep, /\$json\.nc\.suppress\.note/);
  // the W10.json node is fed by "Decide no-call", which carries applyNoCall's output as $json.nc
  assert.ok(WF.connections['Decide no-call (C1A point 2)'].main[0].some((c) => c.node === 'Stop messaging (no call)'));
  assert.deepEqual(checkSql(workflowSql(WF)), []);
});

test('R5-11: no-call with a live booking asks the cancel confirm and does NOT run W09 cancel_all or cancel the booking first', () => {
  const live = R.applyNoCall(bk(), ld());
  assert.equal(live.action, 'confirm_cancel_first'); assert.equal(live.send_to_lead, 'cancel_confirm');
  const ifn = WF.connections['Booking still live? (confirm cancel first)'].main;
  assert.deepEqual(ifn[0].map((c) => c.node), ['Cancel confirm buttons'], 'true branch: only the question');
  assert.deepEqual(ifn[1].map((c) => c.node), ['W09 cancel all (no call)'], 'false branch: no live booking -> stop reminders');
  assert.ok(!WF.connections['Decide no-call (C1A point 2)'].main[0].some((c) => c.node === 'W09 cancel all (no call)'));
  assert.ok(!/status\s*=\s*'cancelled'/.test(WF.nodes.find((x) => x.name === 'Stop messaging (no call)').parameters.query), 'no-call never cancels the booking itself');
});

test('C1A point 1 and exclusions: rebook, broker cancel, unverified, STOP, already claimed -> nothing claimed', () => {
  assert.equal(c1a({ rebooked: true }).claim, false); assert.equal(c1a({ rebooked: true }).why, 'rebooked_new_call_judged_as_usual');
  assert.equal(c1a({ rebooked: true, inbound_after_cancel: [{ content: 'No thanks' }] }).claim, false, 'a later booking wins');
  assert.equal(c1a({ cancelled_by: 'broker' }).why, 'schedule_d_broker_cancel');
  assert.equal(c1a({ lead: vLead({ verified_at: null }) }).why, 'never_verified_never_counted');
  assert.equal(c1a({ lead: vLead({ verified_at: '2026-10-12T09:01:00+02:00' }) }).why, 'never_verified_never_counted', 'verified after 72 h does not count');
  assert.equal(c1a({ lead: vLead({ opted_out_at: '2026-10-12T11:00:00+02:00' }) }).why, 'opted_out_not_covered_by_c1a');
  assert.equal(c1a({ already_claimed: true }).claim, false);
  assert.equal(c1a({ booking: bk() }).why, 'booking_not_cancelled');
});

test('C1A options: (a) only, (b) only, off', () => {
  const no = [{ content: 'No thanks' }];
  assert.equal(c1a({ mode: 'a' }).w13.reason_code, 'cancel_no_rebook');
  assert.deepEqual([c1a({ mode: 'a', inbound_after_cancel: no }).claim, c1a({ mode: 'a', inbound_after_cancel: no }).stop_messaging], [false, true]);
  assert.equal(c1a({ mode: 'b' }).claim, false); assert.equal(c1a({ mode: 'b', inbound_after_cancel: no }).w13.reason_code, 'no_call');
  assert.equal(c1a({ mode: 'off', inbound_after_cancel: no }).claim, false);
});

test('W10.json C1A wiring + last_contact_at: no_call op, hourly sweep, one decision row per booking, W13 claim, lead sends touch last_contact_at', () => {
  const byName = (n) => WF.nodes.find((x) => x.name === n);
  const op = byName('Op').parameters.rules.values.map((v) => v.outputKey);
  assert.ok(op.includes('no_call'));
  assert.equal(WF.connections.Op.main[op.indexOf('no_call')][0].node, 'Decide no-call (C1A point 2)');
  const sweep = byName('C1A candidates (latest booking cancelled, not yet decided)').parameters.query;
  assert.match(sweep, /NH-42/); assert.match(sweep, /'w10:c1a:' \|\| t\.id::text/); assert.match(sweep, /'w10:cancelled:'/);
  assert.match(byName('C1A decision row (idempotency + evidence)').parameters.query, /ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING id/);
  assert.equal(byName('-> W13 claim (C1A)').parameters.workflowId.cachedResultName, 'W13 No-show & replacement');
  assert.match(byName('C1A decide (w10.c1aDecision)').parameters.jsCode, /W10_C1A_MODE \|\| L\.C1A_DEFAULT_MODE/);
  assert.equal(WF.connections['Send WhatsApp'].main[0][0].node, 'Touch leads.last_contact_at (lead outbound)');
  assert.match(byName('Touch leads.last_contact_at (lead outbound)').parameters.query, /SET last_contact_at = now\(\)/);
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  assert.equal(R.leadOutbound({ to: 'lead', ld: { id: 'L' } }, 'wamid.1'), 'L');
  assert.equal(R.leadOutbound({ to: 'broker', ld: { id: 'L' } }, 'wamid.1'), null);
  assert.equal(R.leadOutbound({ wa: { to: '+27820000000' }, br: { whatsapp_number: '+27820000000' }, ld: { id: 'L' } }, 'wamid.1'), null);
  assert.equal(R.leadOutbound({ to: 'lead', ld: { id: 'L' } }, ''), null, 'not sent (dry run / rejected)');
});

// ---- I-39a: one message, never two (W07 delegate.body) ----
const DLG = (action, extra = {}) => ({ to: 'W10', action, lead_lines: ['Just so you know, I am the SortMyCover assistant.'], intro_line: 'X', body: 'Just so you know, I am the SortMyCover assistant. W07 body for ' + action + '.', lang: 'en', ...extra });

test('I-39a reschedule offer: list body = delegate.body when present; else RESCHED_INTRO + SAME_METHOD from lines.mjs (en / af)', () => {
  const slots = slotsAt(RESCHED_TAP);
  const base = { booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'list' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP };
  assert.equal(R.offerMessage({ ...base, delegate: DLG('reschedule') }).body, DLG('reschedule').body);
  assert.equal(R.offerMessage(base).body, 'No problem, here are some other times. Same as before, by WhatsApp call?');
  assert.equal(R.offerMessage({ ...base, lead: ld({ language: 'af' }) }).body, "Geen probleem nie, hier is 'n paar ander tye. Dieselfde as voorheen, per WhatsApp-oproep?");
  assert.equal(R.offerMessage({ ...base, delegate: { to: 'W10', action: 'reschedule', lang: 'af' } }).body.startsWith('Geen probleem'), true, 'delegate without body: own body in delegate.lang');
  const long = R.offerMessage({ ...base, delegate: DLG('reschedule', { body: 'x'.repeat(1500) }) }).body;
  assert.equal(long.length, 1024, 'never over the Cloud API body limit');
});

test('I-39a reschedule Flow: flow body = delegate.body when present; else RESCHED_INTRO', () => {
  const slots = slotsAt(RESCHED_TAP);
  const base = { booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'flow' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP };
  assert.equal(R.offerMessage({ ...base, delegate: DLG('reschedule_slots') }).body, DLG('reschedule_slots').body);
  assert.match(R.offerMessage(base).body, /^No problem, here are some other times\./);
});

test('I-39a cancel_confirm: ONE button message; body = delegate.body when present; else CANCEL_CONFIRM_Q with the booking date/time', () => {
  const withD = R.cancelConfirmMessage(bk(), ld(), BR, DLG('cancel_confirm'));
  assert.equal(withD.body, DLG('cancel_confirm').body);
  assert.deepEqual(withD.buttons.map((b) => b[0]), ['cancel_yes:bk_L03', 'keep_it:bk_L03']);
  assert.equal(R.cancelConfirmMessage(bk(), ld(), BR).body, 'Do you want me to cancel your call on Tue 13 Oct at 11:30?');
  assert.match(R.cancelConfirmMessage(bk(), ld({ language: 'af' }), BR).body, /^Wil jy hê ek moet jou oproep op Tue 13 Oct om 11:30 kanselleer\?$/);
  const wa = R.toWa('+27600000003', withD);
  assert.equal(wa.type, 'interactive'); assert.equal(wa.interactive.body.text, withD.body);
});

test('I-39a change_method: change -> one text (delegate.body or METHOD_CHANGED); reject -> lead_lines + SAME_METHOD + method buttons; ask_email -> W05 sends', () => {
  const ch = R.changeMethod(bk(), ld(), BR, 'phone');
  assert.equal(R.methodMessage(ch, bk(), ld(), BR, DLG('change_method'), 'phone').body, DLG('change_method').body);
  assert.equal(R.methodMessage(ch, bk(), ld(), BR, null, 'phone').body, "I'll change it to phone.");
  assert.equal(R.methodMessage(ch, bk(), ld({ language: 'af' }), BR, null, 'phone').body, 'Ek sal dit na telefoon verander.');
  const rej = R.changeMethod(bk(), ld(), BR, 'zoom');
  const withD = R.methodMessage(rej, bk(), ld(), BR, DLG('change_method', { method: 'zoom' }), 'zoom');
  assert.equal(withD.body, 'Just so you know, I am the SortMyCover assistant. Same as before, by WhatsApp call?', 'never "I\'ll change it to Zoom" when Zoom is not offered');
  assert.ok(withD.buttons.every(([id]) => /^(keep_it|change_method:(teams|phone)):bk_L03$|^change_method:(teams|phone):bk_L03$/.test(id)));
  assert.equal(R.methodMessage(rej, bk(), ld(), BR, null, 'zoom').body, 'Same as before, by WhatsApp call?');
  assert.equal(R.classifyOp({ msg: { payload: 'change_method:phone:bk_L03' } }), 'change_method');
  assert.equal(R.methodMessage(R.changeMethod(bk(), ld(), BR, 'teams'), bk(), ld(), BR, DLG('change_method')), null, 'ask_email: the email step sends the one message');
});

test('I-39a W10.json: builders pass the delegate; no hard-coded English bodies left; change_method sends one lead message', () => {
  const s = JSON.stringify(WF);
  for (const t of ['No problem, here are some other times.', 'Here are the next open times.', 'Do you want me to cancel your call on', 'No problem. Pick a new time below.']) assert.ok(!s.includes(t), t);
  assert.match(WF.nodes.find((n) => n.name === 'Build offer (Flow / list / template)').parameters.jsCode, /delegate: j\.delegate \|\| null/);
  assert.match(WF.nodes.find((n) => n.name === 'Cancel confirm buttons').parameters.jsCode, /cancelConfirmMessage\(j\.bk, j\.ld, j\.br, j\.delegate \|\| null\)/);
  const mr = WF.connections['Method result'].main;
  assert.equal(mr[0].filter((c) => c.node === 'Method lead message (one message)').length, 1);
  assert.equal(mr[2].filter((c) => c.node === 'Method lead message (one message)').length, 1);
  assert.equal(mr[1].some((c) => c.node === 'Method lead message (one message)'), false);
});

test('I-45e: every W04 sub-call (list, is_free, graph_token) waits for its answer (CONTRACTS "Sub-workflow interfaces")', () => {
  const w04 = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters.workflowId.value === 'smc-w04');
  assert.equal(w04.length, 4);
  for (const n of w04) assert.equal(n.parameters.options.waitForSubWorkflow, true, n.name);
});

// ============================================================================================
// Verify gate (2026-10-11): a HELD slot (pending_verification) can be moved; it stays held with the same deadline rule
// ============================================================================================
test('W10 held slot: move in place, stays held, verify_by = min(booked_at + 24 h, new start - 2 h); no Graph, no broker notice, no reminders', async () => {
  const now = Date.parse('2026-10-13T09:00:00+02:00');
  const held = { id: 'bk_h', status: 'pending_verification', appointment_date: '2026-10-15T10:00:00+02:00', ends_at: '2026-10-15T10:30:00+02:00', booked_at: '2026-10-13T08:00:00+02:00', verify_by: '2026-10-14T08:00:00+02:00', reschedule_count: 0, method: 'phone' };
  const far = R.applyReschedule(held, { start: '2026-10-16T11:00:00+02:00', end: '2026-10-16T11:30:00+02:00' }, { now_ms: now, free: true, idempotency_key: 'k', seen_keys: new Set() });
  assert.equal(far.action, 'move_held');
  assert.equal(far.update.status, 'pending_verification');
  assert.equal(far.update.verify_by, new Date(Date.parse('2026-10-14T08:00:00+02:00')).toISOString(), 'moving never buys more time');
  assert.equal(far.graph, null); assert.equal(far.broker_notice, null); assert.equal(far.w09, null);
  const near = R.applyReschedule(held, { start: '2026-10-13T14:00:00+02:00', end: '2026-10-13T14:30:00+02:00' }, { now_ms: now, free: true, idempotency_key: 'k', seen_keys: new Set() });
  assert.equal(near.update.verify_by, new Date(Date.parse('2026-10-13T12:00:00+02:00')).toISOString(), 'start - 2 h when sooner');
  const tooSoon = R.applyReschedule(held, { start: '2026-10-13T11:10:00+02:00', end: '2026-10-13T11:40:00+02:00' }, { now_ms: now, free: true, next_slots: [], idempotency_key: 'k', seen_keys: new Set() });
  assert.deepEqual([tooSoon.action, tooSoon.reason], ['slot_taken', 'too_soon_to_verify']);
  assert.equal(R.applyReschedule(held, { start: '2026-10-16T11:00:00+02:00', end: '2026-10-16T11:30:00+02:00' }, { now_ms: now, free: false, next_slots: [], idempotency_key: 'k', seen_keys: new Set() }).action, 'slot_taken');
  // the workflow: Move result -> held move SQL (stays pending_verification, re-checks held slots too) -> lead-only reply
  const nd = (n) => WF.nodes.find((x) => x.name === n);
  const mr = nd('Move result');
  const i = mr.parameters.rules.values.findIndex((v) => v.outputKey === 'move_held');
  assert.deepEqual(WF.connections['Move result'].main[i].map((c) => c.node), ['Move held slot (stays held, deadline kept)']);
  const q = nd('Move held slot (stays held, deadline kept)').parameters.query;
  assert.match(q, /a\.status = 'pending_verification' AND a\.verify_by > now\(\)/);
  assert.match(q, /x\.status IN \('pending_verification','booked','confirmed'\)/);
  assert.ok(!/status = 'booked'/.test(q), 'never turns into a booking here');
  assert.deepEqual(WF.connections['Held move reply (lead only)'].main[0].map((c) => c.node), ['Has WhatsApp payload + live?']);
  assert.match(nd('Move booking in place (re-check overlap + buffer)').parameters.query, /x\.status IN \('pending_verification','booked','confirmed'\)/, 'a live move cannot land on a held slot');
  assert.match(nd('Load booking, lead, broker, brand').parameters.query, /a\.booked_at, a\.verify_by/);
  const { runCode } = await import('./_n8ncode.mjs');
  const out = await runCode(WF, 'Held move reply (lead only)', { items: [{ lead_id: 'l1' }], refs: { 'Decide move (w10.applyReschedule)': { d: far, new_start: '2026-10-16T11:00:00+02:00', ld: { phone: '+27600000310' } } } });
  assert.equal(out.length, 1); assert.equal(out[0].json.to, 'lead'); assert.match(out[0].json.wa.text.body, /holding .* confirm your email/);
});

// x14 (17 Oct 2026): a second slot tap whose re-check finds no alternatives must still get a reply.
test('slotTakenWa: with offer slots it sends the open-times list (unchanged)', () => {
  const offer = [{ start: '2026-10-20T07:00:00.000Z' }, { start: '2026-10-20T08:00:00.000Z' }];
  const wa = R.slotTakenWa({ phone: '+27600000003', offer, booking: bk(), lead: ld(), broker: BR });
  assert.equal(wa.interactive.type, 'list');
  assert.equal(wa.interactive.action.sections[0].rows.length, 2);
  assert.match(wa.interactive.action.sections[0].rows[0].id, /^slot_2026-10-20T07:00:00.000Z:resched:bk_L03$/);
});
test('slotTakenWa: with no offer slots it sends one "See open times" button, never silence or a calendar error', () => {
  const wa = R.slotTakenWa({ phone: '+27600000003', offer: [], booking: bk(), lead: ld(), broker: BR });
  assert.ok(wa, 'a payload is always returned');
  assert.equal(wa.interactive.type, 'button');
  assert.deepEqual(wa.interactive.action.buttons.map((b) => b.reply.id), ['see_open_times']);
  assert.match(wa.interactive.body.text, /^Sorry, that time was just taken\. Tap below/);
  assert.doesNotMatch(wa.interactive.body.text, /calendar|error|system|problem/i);
  const af = R.slotTakenWa({ phone: '+27600000003', offer: null, booking: bk(), lead: ld({ language: 'af' }), broker: BR });
  assert.equal(af.interactive.action.buttons[0].reply.title, 'Sien oop tye');
});
test('W10 "Slot taken: next 3" node uses slotTakenWa', () => {
  const n = WF.nodes.find((x) => x.name === 'Slot taken: next 3');
  assert.match(n.parameters.jsCode, /L\.slotTakenWa\(/);
});

// 17 Oct 2026 live cancel test (booking 997c6752): W04 rejected every W10 call, the client heard nothing after "Yes, cancel".
test('offerMessage after a cancel: confirms in words, with times as a list or alone as text', () => {
  const slots = slotsAt(RESCHED_TAP, [bk()]);
  const withTimes = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'list' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP, reason: 'rebook_after_cancel' });
  assert.equal(withTimes.kind, 'list_session');
  assert.match(withTimes.body, /^Done, your call is cancelled\. If you'd like another time, pick one below/);
  assert.ok(withTimes.rows.length > 0, 'times offered');
  for (const r of withTimes.rows) assert.equal(r.id, `slot_${slots.find((s) => r.id === `slot_${s.start}`)?.start}`, 'a pick after a cancel is a new booking (W05), never a move of the cancelled one');
  const tpl = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP - 30 * H, reason: 'rebook_after_cancel' });
  assert.ok(tpl.buttons.slice(0, 3).every((b) => /^slot_/.test(b) && !b.includes(':resched:')));
  const none = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'list' }, slots: [], now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP, reason: 'rebook_after_cancel' });
  assert.deepEqual(none, { kind: 'text_session', body: "Done, your call is cancelled. If you'd like another time later, just say." });
  const af = R.offerMessage({ booking: bk(), lead: ld({ language: 'af' }), broker: BR, slots: [], now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP, reason: 'rebook_after_cancel' });
  assert.match(af.body, /^Klaar, jou oproep is gekanselleer/);
  // a lead reschedule with no times still escalates (unchanged); outside the window a cancel never sends free text
  assert.equal(R.offerMessage({ booking: bk(), lead: ld(), broker: BR, slots: [], now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP }).kind, 'no_slots');
  assert.equal(R.offerMessage({ booking: bk(), lead: ld(), broker: BR, slots: [], now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP - 30 * H, reason: 'rebook_after_cancel' }).kind, 'no_slots');
});

test('W10 sends W04 its documented request at every W04 call (never W10\'s own item)', () => {
  const into = (name) => Object.entries(WF.connections).filter(([, o]) => (o.main || []).some((l) => (l || []).some((t) => t.node === name))).map(([s]) => s);
  const calls = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters.workflowId.value === 'smc-w04');
  assert.equal(calls.length, 4);
  for (const n of calls) {
    const src = into(n.name);
    assert.equal(src.length, 1, `${n.name} has one input`);
    assert.match(src[0], /^W04 request \(/, `${n.name} is fed by a W04 request node`);
    const req = WF.nodes.find((x) => x.name === src[0]).parameters.jsCode;
    assert.match(req, /op: '(list|is_free|graph_token)', broker_id: /);
  }
});

test('W10 build offer sends the text confirmation; Merge context carries the brand code and verified email', () => {
  const offer = WF.nodes.find((x) => x.name === 'Build offer (Flow / list / template)').parameters.jsCode;
  assert.match(offer, /o\.kind === 'text_session'\) wa = \{ type: 'text', text: \{ body: o\.body \} \}/);
  const merge = WF.nodes.find((x) => x.name === 'Merge context').parameters.jsCode;
  assert.match(merge, /code: r\.brand_code/);
  assert.match(merge, /email_verified: r\.email_verified === true/);
  const q = WF.nodes.find((x) => x.name === 'Load booking, lead, broker, brand').parameters.query;
  assert.match(q, /br\.code AS brand_code/);
  assert.match(q, /b\.fsp_number, b\.practice_name, b\.firm_name/);
});

test('SortMyCover W10 emails: adviser notice via smc-email-send, client cancel / move via smc-client-email', () => {
  const brand = { code: 'SMC' };
  const relay = R.smcBrokerRelay({ brand, bk_id: 'bk_L03', email_kind: 'cancelled', email: { to: 'adviser@example.co.za', subject: 'SortMyCover booking cancelled', body: 'Anele K. cancelled.' } }, 120_000);
  assert.equal(relay.body.from, 'SortMyCover <hello@sortmycover.co.za>');
  assert.deepEqual(relay.body.to, ['adviser@example.co.za']);
  assert.equal(relay.body.text, 'Anele K. cancelled.');
  assert.deepEqual(relay.body.tags, [{ name: 'kind', value: 'broker_booking_changed' }]);
  assert.equal(relay.idempotency_key, 'w10:broker:bk_L03:cancelled:2');
  assert.equal(R.smcBrokerRelay({ brand: { code: 'LV' }, email: { to: 'a@b.co' } }), null);
  assert.equal(R.smcBrokerRelay({ brand, email: { to: null } }), null);

  const j = { brand, bk: bk({ calendar_provider: null }), ld: ld({ email: 'anele@example.co.za', email_verified: true }), br: { ...BR, fsp_number: '12345', practice_name: 'Test Practice' } };
  const cancel = R.smcClientChangeEmail(j, 'booking_cancelled', 0);
  assert.equal(cancel.kind, 'booking_cancelled');
  assert.equal(cancel.to, 'anele@example.co.za');
  assert.equal(cancel.booking_id, 'bk_L03');
  assert.equal(Date.parse(cancel.slot_start), ms(start0));
  const moved = R.smcClientChangeEmail(j, 'booking_updated', 0, { start: iso(ms(start0) + 24 * H), end: iso(ms(start0) + 24 * H + 30 * MIN) });
  assert.equal(moved.kind, 'booking_updated');
  assert.equal(Date.parse(moved.slot_start), ms(start0) + 24 * H);
  assert.equal(R.smcClientChangeEmail({ ...j, ld: ld({ email: 'anele@example.co.za', email_verified: false }) }, 'booking_cancelled', 0), null, 'never to an unverified email');
  assert.equal(R.smcClientChangeEmail({ ...j, brand: { code: 'LV' } }, 'booking_cancelled', 0), null);
});

test('W10 email wiring: SMC adviser relay before howzit@, client email gated by DRY_RUN, both never stop the flow', () => {
  const C = WF.connections;
  const outs = (n, i = 0) => ((C[n] && C[n].main[i]) || []).map((t) => t.node);
  assert.deepEqual(outs('Email to broker?'), ['Adviser email route (w10.smcBrokerRelay)']);
  assert.deepEqual(outs('SortMyCover adviser email?', 0), ['Email adviser from SortMyCover (smc-email-send)']);
  assert.deepEqual(outs('SortMyCover adviser email?', 1), ['Email broker from howzit@ (Graph sendMail)']);
  const howzit = WF.nodes.find((x) => x.name === 'Email broker from howzit@ (Graph sendMail)');
  assert.equal(howzit.parameters.authentication, 'genericCredentialType');
  assert.ok(!JSON.stringify(howzit.parameters).includes('howzit_token'));
  for (const name of ['Email adviser from SortMyCover (smc-email-send)', 'Email client from SortMyCover (smc-client-email)', 'Email broker from howzit@ (Graph sendMail)']) {
    assert.equal(WF.nodes.find((x) => x.name === name).onError, 'continueRegularOutput', name);
  }
  assert.match(WF.nodes.find((x) => x.name === 'SortMyCover client email + live?').parameters.conditions.conditions[0].leftValue, /DRY_RUN_SENDS !== 'true'/);
  assert.ok(outs('Broker notice (cancelled) + rebook once?').includes('SMC client email (cancelled)'));
  assert.ok(outs('Lead + broker messages (moved)').includes('SMC client email (moved)'));
});

test('cancelDoneWa: a cancel with no rebooking offer is still confirmed (in window, not opted out)', () => {
  const wa = R.cancelDoneWa({ booking: bk(), lead: ld(), broker: BR, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP });
  assert.deepEqual(wa, { messaging_product: 'whatsapp', to: '+27600000003', type: 'text', text: { body: "Done, your call is cancelled. If you'd like another time later, just say." } });
  assert.equal(R.cancelDoneWa({ booking: bk(), lead: ld({ opted_out_at: '2026-10-13T08:00:00Z' }), broker: BR, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP }), null, 'W15 owns the STOP confirmation');
  assert.equal(R.cancelDoneWa({ booking: bk(), lead: ld(), broker: BR, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP - 30 * H }), null, 'never free text outside the window');
  const C = WF.connections['Offer rebooking once?'].main;
  assert.deepEqual(C[1].map((t) => t.node), ['Cancel confirmation (no rebook offer)']);
  assert.deepEqual(WF.connections['Cancel confirmation (no rebook offer)'].main[0].map((t) => t.node), ['Has WhatsApp payload + live?']);
});

test('Build offer passes W10\'s op: a cancel tap (op "cancel") gets the cancel confirmation, not the reschedule intro', () => {
  assert.equal(R.classifyOp({ msg: { payload: 'cancel_yes:bk_L03' } }), 'cancel');
  const slots = slotsAt(RESCHED_TAP, [bk()]);
  const o = R.offerMessage({ booking: bk(), lead: ld(), broker: BR, brand: { booking_ui: 'list' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP, reason: 'cancel' });
  assert.match(o.body, /^Done, your call is cancelled\./);
  assert.doesNotMatch(o.body, /other times|Same as before/);
  assert.match(WF.nodes.find((x) => x.name === 'Build offer (Flow / list / template)').parameters.jsCode, /reason: j\.op/);
});

// /start/ v4 (Jono, 2026-10-19): the optional Teams guest gets the change / cancel emails; a W39 page move sends no "slot taken" WhatsApp
test('W10 guest: a Teams booking with a guest -> the cancel and the move email go to the guest too (smc-client-email guest_email)', () => {
  const brand = { code: 'SMC' };
  const j = { brand, bk: bk({ method: 'teams', calendar_provider: null, guest_email: 'thabo@gmail.com' }), ld: ld({ email: 'anele@example.co.za', email_verified: true }), br: { ...BR, fsp_number: '12345', practice_name: 'Test Practice' } };
  const cancel = R.smcClientChangeEmail(j, 'booking_cancelled', 0);
  assert.deepEqual([cancel.to, cancel.guest_email], ['anele@example.co.za', 'thabo@gmail.com']);
  const moved = R.smcClientChangeEmail(j, 'booking_updated', 0, { start: iso(ms(start0) + 24 * H), end: iso(ms(start0) + 24 * H + 30 * MIN) });
  assert.equal(moved.guest_email, 'thabo@gmail.com');
  assert.equal(R.smcClientChangeEmail({ ...j, bk: bk({ method: 'teams', guest_email: null }) }, 'booking_cancelled', 0).guest_email, undefined, 'no guest -> client only');
  assert.equal(R.smcClientChangeEmail({ ...j, bk: bk({ method: 'phone', guest_email: 'thabo@gmail.com' }) }, 'booking_cancelled', 0).guest_email, undefined, 'Teams only');
  const q = WF.nodes.find((x) => x.name === 'Load booking, lead, broker, brand').parameters.query;
  assert.match(q, /'w05:guest:' \|\| a\.id::text LIMIT 1\) AS guest_email/);
  assert.match(WF.nodes.find((x) => x.name === 'Merge context').parameters.jsCode, /guest_email: r\.guest_email \|\| null/);
});

test('W10 W39 move: source W39 -> no "slot taken" WhatsApp (the page re-fetches /slots); every other source unchanged', () => {
  assert.equal(R.pageOwnsSlotTaken('W39'), true);
  for (const s of [undefined, null, 'W07', 'W05', 'W12']) assert.equal(R.pageOwnsSlotTaken(s), false, String(s));
  const code = WF.nodes.find((x) => x.name === 'Slot taken: next 3').parameters.jsCode;
  assert.match(code, /wa: L\.pageOwnsSlotTaken\(j\.source\) \? null : L\.slotTakenWa\(/);
  // wa null never reaches the sender
  assert.match(JSON.stringify(WF.nodes.find((x) => x.name === 'Has WhatsApp payload + live?').parameters), /!!\$json\.wa/);
});

// ============================================================================================
// The cancel card (Jono, 2026-10-19, mockup frames 15-16): banner image first, then "Choose a reason"
// ============================================================================================
const cBkLive = (over = {}) => bk({ id: 'bk_C1', appointment_date: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T08:30:00Z', status: 'booked', brand_id: 'brand_smc', ...over });
const NO_SALES = /\bfree\b|licensed|\bAI\b|artificial|assistant|bot\b|Lead Velocity/i;

test('cancel card: the list (body, "Choose a reason", six reasons + Keep my call as the last row) within WhatsApp limits; copy rules', () => {
  const l = R.cancelCardList(cBkLive(), ld());
  const i = l.interactive;
  assert.equal(i.type, 'list'); assert.equal(i.header, undefined, 'a list takes no image header');
  assert.equal(i.body.text, "We understand, Anele, plans change. Before I cancel your call on Wed 21 Oct at 10:00, can you tell me why? If it's something we can sort out, we'd love to help.");
  assert.equal(i.action.button, 'Choose a reason');
  const rows = i.action.sections[0].rows;
  assert.deepEqual(rows.map((r) => r.id), ['reschedule:bk_C1', 'cancel_reason:not_ready:bk_C1', 'cancel_reason:sorted_cover:bk_C1', 'cancel_reason:not_expected:bk_C1', 'cancel_reason:went_wrong:bk_C1', 'cancel_reason:other:bk_C1', 'keep_it:bk_C1']);
  assert.deepEqual(rows.map((r) => r.title), ['I need a different time', "I'm not ready yet", "I've sorted my cover", "I didn't expect a call", 'Something went wrong', 'Another reason', 'Keep my call']);
  for (const r of rows) { assert.ok(r.title.length <= 24, r.title); assert.ok(!r.description || r.description.length <= 72); assert.ok(r.id.length <= 200); }
  assert.ok(i.action.button.length <= 20 && i.body.text.length <= 1024 && i.action.sections[0].title.length <= 24);
  assert.equal(R.cancelCardList(cBkLive(), ld({ first_name: '' })).interactive.body.text.slice(0, 33), 'We understand, plans change. Befo', 'no name -> no dangling comma');
  for (const k of Object.keys(R.CANCEL_COPY)) assert.doesNotMatch(R.cancelLine(k, ld(), cBkLive()), NO_SALES, k);
  for (const r of rows) assert.doesNotMatch(r.title + (r.description || ''), NO_SALES);
});

test('cancel card: the header-cancel image goes FIRST (WA_SESSION_BANNERS=on, both providers); off -> the list alone', () => {
  for (const WHATSAPP_PROVIDER of ['meta', 'twilio']) {
    const c = R.cancelCard(cBkLive(), ld(), { WA_SESSION_BANNERS: 'on', WHATSAPP_PROVIDER });
    assert.deepEqual(c.banner, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '+27600000003', type: 'image', image: { link: 'https://n8n.sortmycover.co.za/media/whatsapp/headers/header-cancel.png' } });
    assert.equal(c.wa.interactive.type, 'list');
  }
  const off = R.cancelCard(cBkLive(), ld(), {});
  assert.equal(off.banner, null); assert.equal(off.wa.interactive.type, 'list');
  // W10.json: card -> (banner, gated by DRY_RUN_SENDS) -> done -> the list through the normal live gate
  const C = WF.connections; const outs = (n, i = 0) => ((C[n] && C[n].main[i]) || []).map((t) => t.node);
  const op = WF.nodes.find((x) => x.name === 'Op'); const ix = (k) => op.parameters.rules.values.findIndex((r) => r.outputKey === k);
  assert.deepEqual(outs('Op', ix('cancel_ask')), ['Cancel card (w10.cancelCard)']);
  assert.deepEqual(outs('Cancel card (w10.cancelCard)'), ['Cancel banner first? (live)']);
  assert.deepEqual(outs('Cancel banner first? (live)', 0), ['SUB input (Send cancel banner)']);
  assert.deepEqual(outs('Cancel banner first? (live)', 1), ['Has WhatsApp payload + live?']);
  assert.deepEqual(outs('SUB input (Send cancel banner)'), ['Send cancel banner']);
  assert.deepEqual(outs('Send cancel banner'), ['Cancel banner done'], 'the list waits for the image');
  assert.deepEqual(outs('Cancel banner done'), ['Has WhatsApp payload + live?']);
  assert.match(WF.nodes.find((x) => x.name === 'Cancel banner first? (live)').parameters.conditions.conditions[0].leftValue, /DRY_RUN_SENDS !== 'true'/);
  assert.match(WF.nodes.find((x) => x.name === 'Has WhatsApp payload + live?').parameters.conditions.conditions[0].leftValue, /DRY_RUN_SENDS !== 'true'/);
  assert.equal(WF.nodes.find((x) => x.name === 'Send cancel banner').onError, 'continueRegularOutput', 'a failed image never blocks the list');
  assert.equal(WF.nodes.find((x) => x.name === 'Send cancel banner').parameters.options.waitForSubWorkflow, true);
  // the no-call confirm (C1A b with a live booking) keeps the plain Yes / Keep question
  assert.deepEqual(outs('Booking still live? (confirm cancel first)', 0), ['Cancel confirm buttons']);
});

test('cancel card: each reason -> its action (offer / cancel / problem / other / keep); a cancel reason closes with its own line through the existing cancel', () => {
  assert.equal(R.classifyOp({ delegate: { action: 'cancel_confirm' } }), 'cancel_ask', 'typed "cancel"');
  assert.equal(R.classifyOp({ msg: { payload: 'cancel:bk_C1' } }), 'cancel_ask', 'Cancel tap');
  const tap = (id) => ({ msg: { list_id: id } });
  assert.equal(R.classifyOp(tap('reschedule:bk_C1')), 'offer', 'I need a different time -> the reschedule card (W07) / W10 offer');
  for (const c of ['not_ready', 'sorted_cover', 'not_expected']) { assert.equal(R.classifyOp(tap(`cancel_reason:${c}:bk_C1`)), 'cancel', c); assert.deepEqual(R.cancelReasonOf(tap(`cancel_reason:${c}:bk_C1`)), { code: c }); }
  assert.equal(R.classifyOp(tap('cancel_reason:went_wrong:bk_C1')), 'cancel_problem');
  assert.equal(R.classifyOp(tap('cancel_reason:other:bk_C1')), 'cancel_other');
  assert.equal(R.classifyOp(tap('keep_it:bk_C1')), 'keep', 'Keep my call -> no change');
  assert.equal(R.classifyOp(tap('cancel_reason:bogus:bk_C1')), 'cancel_ask', 'unknown reason -> the card again');
  assert.deepEqual(R.parseCancelReason('cancel_reason:other:bk_C1'), { code: 'other', booking_id: 'bk_C1' });
  // closing lines ride the delegate body the cancel path already uses (cancelDoneWa / Build offer)
  const lines = { not_ready: "No problem, Anele. Your call on Wed 21 Oct at 10:00 is cancelled. Say hi here any time and we'll find a new time.",
    sorted_cover: 'Thanks for letting us know, Anele, and well done on sorting your cover. Your call on Wed 21 Oct at 10:00 is cancelled.',
    not_expected: 'Thanks for telling us, Anele. Your call on Wed 21 Oct at 10:00 is cancelled. If you would like one later, just say hi here.' };
  for (const [code, line] of Object.entries(lines)) {
    const del = R.reasonDelegate({ code }, ld(), cBkLive());
    assert.equal(del.body, line, code);
    const done = R.cancelDoneWa({ booking: cBkLive(), lead: ld(), broker: BR, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP, delegate: del });
    assert.equal(done.text.body, line);
    const o = R.offerMessage({ booking: cBkLive(), lead: ld(), broker: BR, brand: { booking_ui: 'list' }, slots: slotsAt(RESCHED_TAP, []), now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP, reason: 'cancel', delegate: del });
    assert.equal(o.body, line, 'the one rebooking offer carries the same line');
  }
  assert.equal(R.reasonDelegate(null, ld(), cBkLive(), null), null, 'no reason -> the existing copy');
  // C1A unchanged: the same applyCancel whatever the reason; "I didn't expect a call" is not a C1A (b) no-call
  const a = R.applyCancel(cBkLive(), ld(), { now_ms: RESCHED_TAP });
  assert.deepEqual([a.action, a.rebook_offer, a.replacement, a.w09], ['cancel', true, 'none', 'cancel_all']);
  assert.equal(R.isNoCall({ list_id: 'cancel_reason:not_expected:bk_C1', text: "I didn't expect a call" }), false);
  assert.equal(R.classifyOp(tap('cancel_reason:not_expected:bk_C1')), 'cancel', 'not no_call');
});

test('cancel card: Something went wrong -> hello@ + Keep my call / Cancel it; Another reason -> type it (30-min wait for this booking) -> cancel with the text', () => {
  const p = R.cancelProblemWa(cBkLive(), ld());
  assert.equal(p.interactive.body.text, "I'm sorry to hear that. Please email hello@sortmycover.co.za and a person from our team will reply within 48 hours.");
  assert.deepEqual(p.interactive.action.buttons.map((b) => [b.reply.id, b.reply.title]), [['keep_it:bk_C1', 'Keep my call'], ['cancel_yes:bk_C1', 'Cancel it']]);
  assert.equal(R.classifyOp({ msg: { payload: 'cancel_yes:bk_C1' } }), 'cancel', 'Cancel it = the existing cancel');
  const o = R.cancelOtherWa(cBkLive(), ld());
  assert.deepEqual(o.interactive.action.buttons.map((b) => b.reply.id), ['cancel_yes:bk_C1', 'keep_it:bk_C1']);
  const now = Date.parse('2026-10-19T10:00:00Z');
  const wait = R.cancelReasonPending(cBkLive(), now);
  assert.deepEqual(wait, { booking_id: 'bk_C1', until: '2026-10-19T10:30:00.000Z' });
  const typed = { delegate: { action: 'cancel_reason_text' }, msg: { text: 'My husband   handles it' } };
  assert.equal(R.classifyOp(typed), 'cancel');
  assert.deepEqual(R.cancelReasonOf(typed), { code: 'other', text: 'My husband   handles it', typed: true });
  assert.deepEqual(R.reasonParams(R.cancelReasonOf(typed)), ['other', 'My husband handles it']);
  assert.equal(R.reasonDelegate({ code: 'other' }, ld(), cBkLive()).body, "Thank you, I've passed that on to the team. Your call on Wed 21 Oct at 10:00 is cancelled.");
  const lw = ld({ conv_state: { cancel_reason_pending: wait } });
  assert.equal(R.typedReasonValid(lw, cBkLive(), now + 60_000), true);
  assert.equal(R.typedReasonValid(lw, cBkLive(), now + 31 * 60_000), false, 'the wait expired');
  assert.equal(R.typedReasonValid(lw, cBkLive({ id: 'bk_other' }), now), false, 'another booking');
  assert.equal(R.typedReasonValid(lw, cBkLive({ status: 'cancelled' }), now), false, 'already cancelled');
  assert.equal(R.typedReasonValid(ld(), cBkLive(), now), false, 'no wait');
  const merge = WF.nodes.find((x) => x.name === 'Merge context').parameters.jsCode;
  assert.match(merge, /!W\.typedReasonValid\(__o\.ld, __o\.bk, Date\.now\(\)\)\) __o\.op = 'cancel_reason_stale'/);
  assert.match(merge, /__o\.delegate = W\.reasonDelegate\(__o\.op === 'cancel'/);
});

test('cancel card: the reason is stored (lead_activities cancel_reason, one row per booking); Keep ends the typed-reason wait; SQL columns exist', () => {
  const q = (n) => WF.nodes.find((x) => x.name === n).parameters.query;
  for (const n of ['Save cancel reason (+ typed-reason wait)', 'Timeline: cancelled']) {
    assert.match(q(n), /'cancel_reason', jsonb_build_object\('booking_id', \$4::text, 'reason', \$\d::text\), NULLIF\(\$\d, ''\), now\(\), 'w10:cancel_reason:' \|\| \$4 WHERE \$\d <> ''/, n);
    assert.match(q(n), /ON CONFLICT \(idempotency_key\) DO UPDATE SET payload = EXCLUDED\.payload/, n);
  }
  assert.match(q('Timeline: cancelled'), /conv_state - 'cancel_reason_pending'/);
  assert.match(WF.nodes.find((x) => x.name === 'Timeline: cancelled').parameters.options.queryReplacement, /\(j\.reason_params \|\| \['', ''\]\)\[0\]/);
  assert.match(q('Keep: clear the typed-reason wait'), /conv_state - 'cancel_reason_pending'/);
  const C = WF.connections; const op = WF.nodes.find((x) => x.name === 'Op'); const ix = (k) => op.parameters.rules.values.findIndex((r) => r.outputKey === k);
  assert.deepEqual(C.Op.main[ix('keep')].map((t) => t.node), ['Keep it', 'Keep: clear the typed-reason wait']);
  for (const k of ['cancel_problem', 'cancel_other']) assert.deepEqual(C.Op.main[ix(k)].map((t) => t.node), ['Save cancel reason (+ typed-reason wait)'], k);
  assert.deepEqual(C['Save cancel reason (+ typed-reason wait)'].main[0].map((t) => t.node), ['Cancel reason reply (w10.cancelProblemWa / cancelOtherWa)']);
  assert.deepEqual(C['Cancel reason reply (w10.cancelProblemWa / cancelOtherWa)'].main[0].map((t) => t.node), ['Has WhatsApp payload + live?']);
  assert.deepEqual(checkSql(workflowSql(WF).filter((x) => /cancel reason|Timeline: cancelled|typed-reason/.test(x.node))), []);
});

test('reschedule_card: out of the 24-h window a start-page brand lead with a live booking gets the reschedule_card template; anything missing -> reschedule_offer as before', async () => {
  const LT = (await import('node:module')).createRequire(import.meta.url)('../security/lead-token.js');
  const token = LT.mintLeadToken('lead_L03', { secret: 'w10-test-lead-token-secret-0123456789abcdef', nowMs: RESCHED_TAP }).token;
  const env = { WHATSAPP_PROVIDER: 'twilio', TWILIO_CONTENT_SIDS: JSON.stringify({ reschedule_card: 'HXtest' }) };
  const slots = slotsAt(RESCHED_TAP, []);
  const live = bk({ appointment_date: '2026-10-21T08:00:00Z', status: 'booked' });
  const out = (over = {}) => R.offerMessage({ booking: live, lead: ld({ phone: '+27600000003' }), broker: BR, brand: { booking_ui: 'list' }, slots, now_ms: RESCHED_TAP, last_inbound_ms: RESCHED_TAP - 30 * H, reason: 'broker_rescheduled', card: { start_page: true, token, env }, ...over });
  const o = out();
  assert.equal(o.kind, 'prebuilt'); assert.equal(o.template, 'reschedule_card');
  const t = o.wa.template;
  assert.equal(t.name, 'reschedule_card');
  assert.deepEqual(t.components[0].parameters.map((p) => p.text), ['Anele', String(BR.contact_person).split(' ')[0], 'Wed 21 Oct', '10:00'], 'first name, adviser, date, time');
  assert.deepEqual(t.components[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] }, 'the token is the URL suffix');
  assert.deepEqual(t.components[2].parameters, [{ type: 'payload', payload: `keep_it:${live.id}` }]);
  // unchanged: in the window, start_page off, no token, no SID, Meta provider, a cancelled / held booking, a cancel rebook offer
  assert.equal(out({ last_inbound_ms: RESCHED_TAP }).kind, 'list_session', 'in the window: as before (W07 sends the card there)');
  for (const [why, over] of [['start_page off', { card: { start_page: false, token, env } }], ['no token', { card: { start_page: true, token: null, env } }],
    ['no SID', { card: { start_page: true, token, env: { WHATSAPP_PROVIDER: 'twilio' } } }], ['meta', { card: { start_page: true, token, env: { ...env, WHATSAPP_PROVIDER: 'meta' } } }],
    ['no card', { card: null }], ['booking not live', { booking: bk({ status: 'no_show' }) }], ['cancel', { reason: 'cancel' }]]) {
    const r = out(over);
    assert.equal(r.kind === 'template' ? r.template : r.kind, why === 'cancel' ? 'reschedule_offer' : 'reschedule_offer', why);
  }
  assert.equal(out({ brand: { booking_ui: 'flow' }, card: null }).template, 'reschedule_offer_v2', 'Flow brand without the card: unchanged');
  assert.equal(out({ brand: { booking_ui: 'flow' } }).template, 'reschedule_card', 'Flow brand with the card');
  // W10.json: the load reads brands.start_page (to_jsonb, no column dependency); Merge carries it; Build offer mints + sends
  assert.match(WF.nodes.find((x) => x.name === 'Load booking, lead, broker, brand').parameters.query, /to_jsonb\(br\)->>'start_page' AS brand_start_page/);
  assert.match(WF.nodes.find((x) => x.name === 'Merge context').parameters.jsCode, /start_page: r\.brand_start_page === 'on'/);
  const b = WF.nodes.find((x) => x.name === 'Build offer (Flow / list / template)').parameters.jsCode;
  assert.match(b, /leadToken\.mintLeadToken\(j\.ld\.id, \{ secret: \$env\.LEAD_TOKEN_SECRET \}\)\.token/);
  assert.match(b, /else if \(o\.kind === 'prebuilt'\) wa = o\.wa;/);
  assert.match(b, /TWILIO_CONTENT_SIDS: \$env\.TWILIO_CONTENT_SIDS/);
});
