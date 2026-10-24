// W07 routing for the W10 cancel card and the W15 STOP card (19 Oct 2026; lib/w07.mjs routeInbound +
// patch-w07-cancel-stop.mjs). Offline, synthetic data only. Run: node --test automation/tests/w07-cancel-stop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCode } from './_n8ncode.mjs';
import { routeInbound } from '../lib/w07.mjs';
import { classifyOp, CANCEL_REASONS } from '../lib/w10.mjs';
import { entryFrom } from '../lib/w15.mjs';
import { headerUrl, HEADERS } from '../lib/wa-provider.mjs';

const W07 = JSON.parse(readFileSync(new URL('../W07.json', import.meta.url), 'utf8'));
const BK = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const NOW = Date.parse('2026-10-19T10:00:00Z');
const lead = (over = {}) => ({ id: 'l1', phone: '+27820000001', stage: 'booked', conv_state: { state: 'booked' }, email_verified: true, ...over });
const ctx = (over = {}) => ({ lead: lead(), broker_numbers: new Set(), ops_numbers: new Set(), has_live_booking: true, now_ms: NOW, ...over });
const msg = (over = {}) => ({ from: '+27820000001', type: 'text', text: '', payload: null, list_id: null, ...over });

test('wa-banner: cancel and leaving cards exist (reschedule too)', () => {
  for (const h of ['reschedule', 'cancel', 'leaving']) assert.ok(HEADERS.includes(h));
  assert.equal(headerUrl('cancel'), 'https://n8n.sortmycover.co.za/media/whatsapp/headers/header-cancel.png');
  assert.equal(headerUrl('leaving'), 'https://n8n.sortmycover.co.za/media/whatsapp/headers/header-leaving.png');
});

test('cancel card: a reason row (list_id cancel_reason:<code>:<booking>) routes to W10, which reads the code', () => {
  for (const code of Object.keys(CANCEL_REASONS).filter((c) => c !== 'different_time')) {
    const m = msg({ type: 'interactive', list_id: `cancel_reason:${code}:${BK}`, text: CANCEL_REASONS[code].title });
    assert.equal(routeInbound(m, ctx()).route, 'W10', code);
    assert.equal(classifyOp({ msg: m }), CANCEL_REASONS[code].action, code);
  }
  // the "different time" row is reschedule:<booking> -> W10 (and the reschedule card check before it)
  assert.equal(routeInbound(msg({ type: 'interactive', list_id: `reschedule:${BK}` }), ctx()).route, 'W10');
  // the same id as a button payload still routes
  assert.equal(routeInbound(msg({ type: 'button', payload: `cancel_reason:not_ready:${BK}` }), ctx()).route, 'W10');
});

test('cancel card "Another reason": free text while the wait is open -> W10 cancel_reason_text; otherwise the normal path', () => {
  const pending = { booking_id: BK, until: new Date(NOW + 10 * 60_000).toISOString() };
  const c = ctx({ lead: lead({ conv_state: { state: 'booked', cancel_reason_pending: pending } }) });
  const r = routeInbound(msg({ text: 'My husband already sorted it' }), c);
  assert.equal(r.route, 'W10');
  assert.deepEqual(r.delegate, { to: 'W10', action: 'cancel_reason_text', actions: ['cancel_reason_text'], booking_id: BK });
  assert.equal(classifyOp({ msg: { text: 'My husband already sorted it' }, delegate: r.delegate }), 'cancel');
  // expired, no live booking, or a tap: not a reason
  const expired = ctx({ lead: lead({ conv_state: { cancel_reason_pending: { ...pending, until: new Date(NOW - 1000).toISOString() } } }) });
  assert.equal(routeInbound(msg({ text: 'whatever' }), expired).route, 'nlu');
  assert.equal(routeInbound(msg({ text: 'whatever' }), { ...c, has_live_booking: false }).route, 'nlu');
  assert.equal(routeInbound(msg({ type: 'button', payload: `keep_it:${BK}` }), c).reason, 'tap keep_it');
  // STOP still wins
  assert.equal(routeInbound(msg({ text: 'STOP' }), c).route, 'W15');
});

test('W07 Route node carries the delegate onto the routed item (W10 reads it like a Lindi delegation)', async () => {
  const pending = { booking_id: BK, until: new Date(Date.now() + 10 * 60_000).toISOString() };
  const row = { id: 'l1', phone: '+27820000001', brand_id: 'b1', stage: 'booked', conv_state: { state: 'booked', cancel_reason_pending: pending }, email_verified: true, booking_id: BK, appointment_date: '2026-10-21T08:00:00Z', method: 'teams', booking_status: 'booked', contact_person: 'Mark Smith' };
  const out = await runCode(W07, 'Route (deterministic) + prefilter', { json: row, refs: { 'Verify signature + normalise': { msg: msg({ text: 'Too busy this month', wamid: 'SM1' }) } } });
  assert.equal(out.json.route, 'W10'); assert.equal(out.json.delegate.action, 'cancel_reason_text');
  const plain = await runCode(W07, 'Route (deterministic) + prefilter', { json: { ...row, conv_state: { state: 'booked' } }, refs: { 'Verify signature + normalise': { msg: msg({ text: 'hello there', wamid: 'SM2' }) } } });
  assert.equal(plain.json.route, 'nlu'); assert.equal('delegate' in plain.json, false);
});

test('opted out: EVERY message goes to W15 (stop_followup) and only W15 decides', () => {
  const out = ctx({ lead: lead({ opted_out_at: '2026-10-18T10:00:00Z', conv_state: { state: 'booked', cancel_reason_pending: { booking_id: BK, until: new Date(NOW + 60_000).toISOString() } } }) });
  const msgs = [
    msg({ text: 'Why did you stop?' }), msg({ text: 'CANCEL' }), msg({ text: 'I changed my mind' }),
    msg({ type: 'interactive', list_id: 'stop_why:too_many' }), msg({ type: 'interactive', list_id: 'stop_undo:changed_mind' }),
    msg({ type: 'button', payload: `reschedule:${BK}` }), msg({ type: 'button', payload: `cancel:${BK}` }), msg({ type: 'interactive', list_id: `cancel_reason:other:${BK}` }),
    msg({ type: 'interactive', list_id: `slot_2026-10-21T08:00:00Z:${BK}` }), msg({ type: 'button', payload: 'consent_yes' }), msg({ text: 'me@example.test' }),
    msg({ type: 'image', media: 'image', media_id: 'twilio:x' }), msg({ text: 'STOP' }),
  ];
  for (const m of msgs) assert.equal(routeInbound(m, out).route, 'W15', JSON.stringify(m));
  assert.equal(routeInbound(msgs[0], out).reason, 'stop_followup');
  // W15's own entry reads the W07 item: a reason, the undo and CANCEL are follow-ups; other text is nothing
  const item = (m) => ({ route: 'W15', reason: 'stop_followup', msg: m, lead: out.lead });
  assert.deepEqual(entryFrom(item(msg({ type: 'interactive', list_id: 'stop_undo:changed_mind' }))).followup, { type: 'undo' });
  assert.deepEqual(entryFrom(item(msg({ text: 'CANCEL' }))).followup, { type: 'cancel' });
  assert.equal(entryFrom(item(msg({ text: 'Why did you stop?' }))).followup, null);
  assert.equal(entryFrom(item(msg({ text: 'Why did you stop?' }))).force, false, 'never a second opt-out confirmation');
});

test('W07 graph: the W15 route reaches -> W15 only (no Lindi, no sender, no never-silent guard)', () => {
  const route = W07.nodes.find((n) => n.name === 'Route');
  const keys = route.parameters.rules.values.map((v) => v.outputKey);
  const start = W07.connections.Route.main[keys.indexOf('W15')].map((t) => t.node);
  const seen = new Set(); const stack = [...start];
  while (stack.length) {
    const n = stack.pop(); if (seen.has(n)) continue; seen.add(n);
    for (const outs of ((W07.connections[n] || {}).main || [])) for (const t of outs || []) stack.push(t.node);
  }
  assert.deepEqual([...seen], ['-> W15']);
  const w15 = W07.nodes.find((n) => n.name === '-> W15');
  assert.equal(w15.parameters.workflowId.value, 'smc-w15');
});

test('a question with a side "reschedule" label never moves a booked call (KG, 20 Oct 2026)', async () => {
  const { decide } = await import('../../conversation/logic.mjs');
  const booking = { status: 'booked', day: 'Friday', date: '23 October', time: '09:00', method: 'phone' };
  // what the ElevenLabs agent returned for "so what do i need to prepare for the call?"
  const nlu = { intent: 'question', secondary_intents: ['reschedule'], topics: ['call_content', 'documents', 'cancel_move'], slots: {}, sentiment: 'neutral', confidence: 0.9 };
  const d = decide('booked', nlu, {}, { booking });
  assert.ok(!d.actions.some((a) => /reschedule|cancel_confirm/.test(a)), JSON.stringify(d.actions));
  assert.equal(d.next_state, 'booked');
  // a side "cancel" is ignored too; the same labels as the MAIN intent still act
  assert.ok(!decide('booked', { ...nlu, secondary_intents: ['cancel'] }, {}, { booking }).actions.includes('cancel_confirm'));
  assert.ok(decide('booked', { ...nlu, intent: 'reschedule', secondary_intents: [] }, {}, { booking }).actions.includes('reschedule'));
  assert.ok(decide('booked', { ...nlu, intent: 'cancel', secondary_intents: [] }, {}, { booking }).actions.includes('cancel_confirm'));
  // before a booking, a side "book" still offers times (harmless)
  assert.ok(decide('booking', { intent: 'question', secondary_intents: ['book'], topics: [], slots: {}, confidence: 0.9 }, {}, {}).actions.some((a) => /slots/.test(a)));
});
