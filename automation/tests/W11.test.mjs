// W11 Broker reminders - synthetic tests (fixtures only). DRAFT for Jonathan (4C.2). Run: node --test automation/tests/W11.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lead, broker, ms, iso, MIN, H, at, renderBody } from './_harness.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as K from '../lib/w11.mjs';
import { briefCheck, BRIEF_HEALTH_LINE } from '../../conversation/guardrail.mjs';

const WF = JSON.parse(readFileSync(new URL('../W11.json', import.meta.url), 'utf8'));
const B = broker();
const BR = { id: B.broker_id, contact_person: B.adviser_name };
const mk = (fx, last, extra = {}) => {
  const r = fx.booking_request;
  return { id: 'bk_' + fx.fixture_id, client_id: fx.lead_id, broker_id: B.broker_id, brand_id: 'smc', cycle_id: 'cyc_test_001', appointment_date: r.slot_start, ends_at: iso(ms(r.slot_start) + 30 * MIN), method: r.method, status: 'booked', reschedule_count: 0, join_url: r.method === 'teams' ? 'https://teams.microsoft.com/l/meetup-join/test' : null, lead: { first_name: fx.submission.first_name || fx.submission.profile_name || 'Anele', last_name: last }, ...extra };
};
const L01 = lead('L01'); const L02 = lead('L02'); const L03 = lead('L03'); const L04 = lead('L04');
const BOOKINGS = [mk(L01, 'Mokoena'), mk(L04, 'van Wyk'), mk(L02, 'Dlamini'), mk(L03, 'Khumalo')];

test('07:30 digest on Thu 15 Oct: L01 (Teams 10:00) + L04 (phone 14:00), first name + initial only, real template text', () => {
  const d = K.digest(BR, BOOKINGS, at('2026-10-15', '07:30'));
  assert.deepEqual(d.vars, ['Mark', '2', '10:00 Lerato M. (Teams); 14:00 Pieter V. (phone call)']);
  assert.equal(d.idempotency_key, `w11:digest:${B.broker_id}:2026-10-15`);
  const body = renderBody('broker_daily_digest', d.vars);
  assert.match(body, /^Good morning Mark\. You have 2 SortMyCover calls today: 10:00 Lerato M\. \(Teams\); 14:00 Pieter V\. \(phone call\)\./);
  assert.ok(!/Mokoena|van Wyk/.test(body), 'no surnames to the broker');
});

test('digest: no meetings -> nothing; cancelled meetings are not listed; other brokers excluded', () => {
  assert.equal(K.digest(BR, BOOKINGS, at('2026-10-17', '07:30')), null);
  const d = K.digest(BR, [mk(L01, 'M', { status: 'cancelled' }), mk(L04, 'V'), mk(L01, 'X', { broker_id: 'other' })], at('2026-10-15', '07:30'));
  assert.equal(d.vars[1], '1');
});

test('T-15 brief due window: 09:45 for L01, late bookings inside 15 min still get it, never after start, once only', () => {
  const b = mk(L01, 'Mokoena');
  assert.equal(K.briefDue(b, at('2026-10-15', '09:44')), false);
  assert.equal(K.briefDue(b, at('2026-10-15', '09:45')), true);
  assert.equal(K.briefDue(b, at('2026-10-15', '09:58')), true);
  assert.equal(K.briefDue(b, at('2026-10-15', '10:00')), false);
  assert.equal(K.briefDue(b, at('2026-10-15', '09:50'), new Set([K.briefKey(b)])), false);
  assert.equal(K.briefDue({ ...b, status: 'cancelled' }, at('2026-10-15', '09:50')), false);
  assert.equal(K.briefKey(b), `w11:brief:bk_L01:${ms(b.appointment_date) / 1000}`);
});

test('brief input: bands in words, Teams link not a number, lead_theme words, health only as a flag (2.1.7)', () => {
  const ld = { first_name: 'Lerato', last_name: 'Mokoena', phone: '+27600000001', age_band: '35_44', budget_band: '750_1250', bond: true, dependants: true, work_cover: true, best_time: 'afternoons', language: 'en' };
  const themes = [{ theme: 'sales_pressure', words: 'Will he try sell me something though?', deferred: false }, { theme: 'premium', words: 'roughly what would cover cost?', deferred: true }, { theme: 'health', words: null, deferred: true }];
  const b = mk(L01, 'Mokoena');
  const input = K.briefInput(ld, b, themes, { confirmed_t24: true }, ['Asked about the bond first']);
  assert.equal(input.lead.age_band, '35-44'); assert.equal(input.lead.budget_band, 'R750 to R1,250 a month');
  assert.equal(input.booking.link, b.join_url); assert.equal(input.contact.call_number, null);
  assert.equal(input.signals.health_question, true);
  assert.equal(input.asked.length, 2);
  assert.ok(!JSON.stringify(input).includes('Mokoena'), 'surname reduced to an initial');
  const fb = K.fallbackBrief(ld, b, input);
  assert.equal(fb.template_vars[1], 'Lerato M.'); assert.equal(fb.template_vars[4], 'Teams link in the event');
  assert.ok(fb.template_vars[8].includes(BRIEF_HEALTH_LINE)); assert.ok(fb.template_vars[8].includes('(deferred to you)'));
  assert.equal(briefCheck(fb, { last_name: 'Mokoena' }).pass, true, JSON.stringify(briefCheck(fb, { last_name: 'Mokoena' }).issues));
  assert.match(renderBody('precall_brief', K.briefVarsArray(fb)), /^Your next call: \*Lerato M\.\* at 10:00 by Teams\. Number to call: Teams link in the event\. Best time: afternoons\./);
});

test('brief for a phone call on a different number (L04): "(not the WhatsApp number)"; nothing asked -> "nothing yet"', () => {
  const ld = { first_name: 'Pieter', last_name: 'van Wyk', phone: '+27600000004', call_number: '+27600000099', age_band: '45_50', budget_band: '1250plus', language: 'af' };
  const b = mk(L04, 'van Wyk');
  const input = K.briefInput(ld, b, [], {}, []);
  const fb = K.fallbackBrief(ld, b, input);
  assert.equal(fb.template_vars[4], '+27600000099 (not the WhatsApp number)');
  assert.equal(fb.template_vars[8], 'nothing yet'); assert.equal(fb.template_vars[9], 'Afrikaans'); assert.equal(fb.template_vars[5], 'not given');
});

test('model brief is used only if briefCheck passes; otherwise the fallback goes (never skipped)', () => {
  const ld = { first_name: 'Lerato', last_name: 'Mokoena', phone: '+27600000001', age_band: '35_44', budget_band: '750_1250' };
  const b = mk(L01, 'Mokoena'); const input = K.briefInput(ld, b, [], {}, []); const fb = K.fallbackBrief(ld, b, input);
  const good = JSON.parse(JSON.stringify(fb)); good.portal.mattered = 'Wants to understand the call first.';
  assert.equal(K.chooseBrief(good, fb).used, 'llm');
  const bad = JSON.parse(JSON.stringify(fb)); bad.template_vars[8] = 'she has diabetes and HIV';
  const c = K.chooseBrief(bad, fb);
  assert.equal(c.used, 'fallback'); assert.ok(c.issues.length > 0);
  assert.equal(K.chooseBrief(null, fb).used, 'fallback');
  const surname = JSON.parse(JSON.stringify(fb)); surname.portal.who = 'Lerato Mokoena, 35-44';
  assert.equal(K.chooseBrief(surname, fb, { last_name: 'Mokoena' }).used, 'fallback');
});

test('unmarked backstop: L01 at slot end + 24 h -> attended, auto_marked, unconfirmed; earlier -> nothing', () => {
  const b = { ...mk(L01, 'M') };
  const end = ms(b.ends_at);
  assert.equal(K.unmarkedSweep(b, { outcome_exists: false, reach: 'yes' }, end + 24 * H - 1).action, 'none');
  const d = K.unmarkedSweep(b, { outcome_exists: false, reach: 'yes' }, end + 24 * H);
  assert.equal(d.action, 'auto_attend');
  assert.deepEqual([d.insert.outcome, d.insert.auto_marked, d.insert.unconfirmed, d.insert.marked_via, d.insert.lead_reach_check], ['attended', true, true, 'auto', 'yes']);
  assert.equal(d.appointment_status, 'attended');
  assert.equal(K.unmarkedSweep(b, { outcome_exists: true }, end + 30 * H).action, 'none', 'W12 already recorded it');
});

test('L03 (broker silent, lead said "No, not yet"): backstop does NOT auto-attend; queued for W12 / Schedule D', () => {
  assert.equal(L03.expected.W12.lead_reach_check, 'no');
  const b = { ...mk(L03, 'K'), appointment_date: '2026-10-14T14:00:00+02:00', ends_at: '2026-10-14T14:30:00+02:00' };
  const d = K.unmarkedSweep(b, { outcome_exists: false, reach: 'no' }, ms(b.ends_at) + 25 * H);
  assert.equal(d.action, 'queue'); assert.equal(d.escalation.kind, 'outcome_unmarked');
});

test('two unconfirmed in a cycle -> Jonathan calls the broker (4.12a)', () => {
  assert.equal(K.unconfirmedCall(1), false); assert.equal(K.unconfirmedCall(2), true);
});

test('W11.json: physical columns only; outcome insert cannot override W12; brief claim before send; schedules', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const ins = WF.nodes.find((n) => n.name.startsWith('Insert auto-attended outcome')).parameters.query;
  assert.match(ins, /ON CONFLICT \(booking_id\) DO NOTHING/);
  const crons = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.scheduleTrigger').map((n) => n.parameters.rule.interval[0].expression);
  assert.deepEqual(crons, ['30 7 * * *', '* * * * *', '5 * * * *']);
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  const guard = WF.nodes.find((n) => n.name === 'Meetings starting within 15 min, not yet briefed').parameters.query;
  assert.match(guard, /extract\(epoch FROM a\.appointment_date\)::bigint/);
});
