// 21 Oct 2026 (late, deploy of the smoke fixes): a wa-smoke inbound from a SYNTHETIC_TEST_NUMBERS number reached W07's
// "Send ops alert" and WhatsApped Jono (escalation f836afd1, +27600000921, esc_kind=unanswered; sender execution 12261).
// Rule: an ops alert CAUSED by a number on SYNTHETIC_TEST_NUMBERS (exact numbers only, lib/wa.mjs isSyntheticNumber) never
// WhatsApps Jono or KG. It is logged (the console escalation row, marked synthetic) and W22 sends it by email only.
// Runs the real Code nodes of W07 / W10 / W03 / W06 (tests/_n8ncode.mjs) and lib/w22.mjs.
// Run: node --test automation/tests/synthetic-ops-alerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCode } from './_n8ncode.mjs';
import * as W7 from '../lib/w07.mjs';
import * as W22 from '../lib/w22.mjs';

const wf = (n) => JSON.parse(readFileSync(new URL(`../${n}.json`, import.meta.url), 'utf8'));
const W07 = wf('W07'), W10 = wf('W10'), W03 = wf('W03'), W06 = wf('W06');
const SYN = '+27600000921';
const REAL = '+27725548057';
const ENV = { OPS_WHATSAPP_JONATHAN: '+27820000001', OPS_WHATSAPP_KG: '+27820000002', SYNTHETIC_TEST_NUMBERS: '+27600000912, +27600000921 +27600000951' };
const LEAD = (phone) => ({ id: '3f0c2a9e-0000-4000-8000-0000000000a1', first_name: 'Thandi', last_name: 'Nkosi', phone, brand_id: '00000000-0000-4000-8000-0000000000b1', broker_id: null, conv_state: { state: 'unbooked' }, language: 'en' });

/** The live path: "Parse NLU -> decide() -> plan" (distress) -> Insert escalation -> "Alert ops (first name + initial, redacted)". */
async function escalationPath(phone) {
  const msg = { from: phone, text: 'My husband passed away last week and I dont know what to do', wamid: 'SMsyn1', type: 'text' };
  const lead = LEAD(phone);
  const j = { msg, lead, state: 'unbooked', pre: W7.preStep(msg, lead).pre, booking: null, adviser_first: 'Mark', broker: null, text_store: 'x', t0: Date.now() };
  const turn = JSON.stringify({ intent: 'other', topics: ['distress'], slots: {}, confidence: 0.9, language: 'en', reply: '' });
  const [planned] = [await runCode(W07, 'Parse NLU -> decide() -> plan', { json: { content: [{ text: turn }] }, env: ENV, refs: { 'Build labels request (ElevenLabs)': j } })];
  const alerts = await runCode(W07, 'Alert ops (first name + initial, redacted)', { items: [{ id: 'esc-1' }], env: ENV, refs: { 'Carry plan': planned.json } });
  return { esc: planned.json.plan.escalation, alerts };
}

test('W07 escalation (distress): a real number alerts Jono + KG; a synthetic number logs the escalation (marked) and alerts nobody', async () => {
  const real = await escalationPath(REAL);
  assert.equal(real.esc.kind, 'human_handoff');
  assert.deepEqual(real.alerts.map((a) => a.json.wa.to), [ENV.OPS_WHATSAPP_JONATHAN, ENV.OPS_WHATSAPP_KG]);
  assert.doesNotMatch(real.esc.note, /synthetic/);
  const syn = await escalationPath(SYN);
  assert.equal(syn.esc.kind, 'human_handoff', 'the console escalation row is still written');
  assert.equal(syn.esc.severity, 'red');
  assert.match(syn.esc.note, /^esc_kind=sensitive; synthetic test number/, 'the row says it is a test');
  assert.deepEqual(syn.alerts, [], 'no ops WhatsApp for a synthetic number');
});

test('W07 escalation: the synthetic check is the exact list only (unset = none, a neighbouring 060 000 number is real)', async () => {
  const near = await escalationPath('+27600000920');
  assert.equal(near.alerts.length, 2);
  const unset = await runCode(W07, 'Parse NLU -> decide() -> plan', { json: { content: [{ text: '{"intent":"other","topics":["distress"]}' }] }, env: { ...ENV, SYNTHETIC_TEST_NUMBERS: '' },
    refs: { 'Build labels request (ElevenLabs)': { msg: { from: SYN, text: 'my mother died', wamid: 'w' }, lead: LEAD(SYN), state: 'unbooked', pre: W7.preStep({ text: 'my mother died' }, {}).pre, booking: null, t0: Date.now() } } });
  assert.deepEqual(unset.json.plan.escalation.notify, ['Jonathan', 'KG']);
});

test('W07 pre-consent handoff (distress / "a person", no lead yet): synthetic -> no ops alert; real -> both ops numbers', async () => {
  const run = (from) => runCode(W07, 'Pre-consent handoff: alert ops (nothing to the person)', { items: [{ route: 'handoff_pre_consent', reason: 'distress', msg: { from } }], env: ENV });
  assert.deepEqual((await run(REAL)).map((x) => x.json.wa.to), [ENV.OPS_WHATSAPP_JONATHAN, ENV.OPS_WHATSAPP_KG]);
  assert.deepEqual(await run(SYN), []);
});

test('W07 never-silent owner alert (EMMA notify) and W10 rebook-failed alert: none for a synthetic number', async () => {
  const ns = (from) => runCode(W07, 'Never silent: owner alert (lib w07.neverSilentAlert)', { items: [{ id: 'esc-2' }], env: ENV,
    refs: { 'Never silent: wait 25 s': { route: 'W04', msg: { from, profile_name: 'Thandi' }, lead: LEAD(from) } } });
  const real = await ns(REAL);
  assert.equal(real.length, 1);
  assert.match(real[0].json.request.message, /Thandi is waiting on open times/);
  assert.deepEqual(await ns(SYN), []);
  const rb = (phone) => runCode(W10, 'Rebook failed: owner alert (w07.neverSilentAlert)', { items: [{}], env: ENV,
    refs: { 'Decide move (w10.applyReschedule)': { ld: LEAD(phone) } } });
  assert.equal((await rb(REAL)).length, 1);
  assert.deepEqual(await rb(SYN), []);
  // the lib keeps its old one-argument form for callers without env
  assert.ok(W7.neverSilentAlert({ route: 'W04', msg: { from: SYN }, lead: LEAD(SYN) }));
  assert.equal(W7.neverSilentAlert({ route: 'W04', msg: { from: SYN }, lead: LEAD(SYN) }, ENV), null);
});

test('W22: a synthetic signal is emailed (marked) and never WhatsApped; it never dedupes a real alert of the same key', () => {
  const env = { OPS_ALERT_EMAIL: 'ops@example.co.za', OPS_WHATSAPP_JONATHAN: '+27820000001', OPS_WHATSAPP_KG: '+27820000002', TWILIO_CONTENT_SIDS: JSON.stringify({ ops_alert: 'HX1' }) };
  const now = Date.parse('2026-10-21T20:00:00Z');
  const real = W22.normalise({ signal_key: 'ctwa_no_broker', scope: 'brand:smc', severity: 'red', to: 'both' });
  const syn = W22.normalise({ signal_key: 'ctwa_no_broker', scope: 'brand:smc', severity: 'red', to: 'both', synthetic: true });
  assert.equal(real.synthetic, false);
  assert.equal(syn.synthetic, true);
  assert.deepEqual(W22.plan(real, env, now).map((x) => x.channel), ['email', 'whatsapp', 'whatsapp']);
  const p = W22.plan(syn, env, now);
  assert.deepEqual(p.map((x) => x.channel), ['email']);
  assert.match(p[0].relay.body.subject, /^\[synthetic test\] SortMyCover red alert/);
  assert.match(p[0].relay.body.text, /synthetic test number .*no WhatsApp/i);
  assert.notEqual(W22.dedupeKey(syn), W22.dedupeKey(real));
  // the Error Trigger and producers that know no number are unchanged
  assert.equal(W22.normalise({ execution: { id: '1' }, workflow: { id: 'smc-w07', name: 'W07 x' } }).synthetic, false);
});

test('W03: an alert action from a synthetic number carries synthetic:true to W22 (other actions untouched)', async () => {
  const deleg = { source: 'W07', route: 'W03', lead: { id: 'lead_s1' }, delegate: { to: 'W03', action: 'record_answer', actions: ['record_answer'], slots: {} },
    msg: { wamid: 'wamid.SYN', from: SYN, at_ms: Date.parse('2026-10-21T19:00:00Z'), type: 'text', text: 'hi', phone_number_id: '999', hops: 1 } };
  const [ad] = await runCode(W03, 'W07 hand-off -> Cloud API message', { items: [deleg] });
  const step = async (mobileEnv) => (await runCode(W03, 'W03 step', { items: [{ brand_id: null, broker: null, existing_open_lead_id: null, lead: null, suppressed: false, thread: null, new_lead_id: 'n1' }],
    env: { SYNTHETIC_TEST_NUMBERS: mobileEnv }, refs: { 'W07 hand-off -> Cloud API message': ad.json } }))[0].json.actions;
  const syn = await step(ENV.SYNTHETIC_TEST_NUMBERS);
  assert.equal(syn.find((a) => a.kind === 'alert').synthetic, true);
  assert.equal(syn.find((a) => a.kind === 'log_no_brand').synthetic, undefined);
  assert.equal((await step('')).find((a) => a.kind === 'alert').synthetic, undefined);
  const fan = await runCode(W03, 'Fan out actions', { items: [{ actions: syn, brand_id: null }] });
  assert.equal(W22.normalise(fan.find((x) => x.json.kind === 'alert').json).synthetic, true);
});

test('W06: first_touch_slow for a synthetic lead goes to W22 marked synthetic', async () => {
  const sig = async (phone) => (await runCode(W06, 'W22 signal', { items: [{ slow: true, l: { id: 'l1', phone } }], env: ENV }))[0].json;
  assert.equal((await sig(SYN)).synthetic, true);
  assert.equal((await sig(REAL)).synthetic, false);
  assert.equal(W22.plan(W22.normalise(await sig(SYN)), { OPS_WHATSAPP_JONATHAN: '+27820000001', TWILIO_CONTENT_SIDS: '{"ops_alert":"HX1"}' }).length, 0);
});

test('W05: a calendar-event failure on a synthetic lead booking goes to W22 marked synthetic (email only)', async () => {
  const W5 = await import('../lib/w05.mjs');
  const { broker, ms } = await import('./_harness.mjs');
  const b = { ...broker(), calendar_status: 'ok', calendar_mode: 'oauth' };
  const ctx = (is_synthetic) => ({ lane: 'http', mode: 'lead', lead: { id: 'lead_s', broker_id: b.broker_id, first_name: 'Sipho', phone: SYN, origin: 'page', budget_band: '1500_plus', is_synthetic }, broker: b, now: ms('2026-10-12T11:40:00+02:00') });
  const p = { start: '2026-10-13T10:30:00+02:00', end: '2026-10-13T11:00:00+02:00', method: 'teams', email: 'client@gmail.com', idempotency_key: 'k-syn', booked_via: 'page', context: {}, route: 'graph' };
  const bk = { id: 'b1', broker_id: b.broker_id, appointment_date: p.start, ends_at: p.end, method: 'teams', status: 'booked' };
  const fail = { ok: false, reason: 'http_500' };
  assert.equal(W5.finish(ctx(true), p, bk, fail).alert.synthetic, true);
  assert.equal(W5.finish(ctx(false), p, bk, fail).alert.synthetic, undefined);
  assert.equal(W22.normalise(W5.finish(ctx(true), p, bk, fail).alert).synthetic, true);
});
