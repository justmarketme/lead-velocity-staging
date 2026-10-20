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
  return { id: 'bk_' + fx.fixture_id, client_id: fx.lead_id, broker_id: B.broker_id, brand_id: 'smc', appointment_date: r.slot_start, ends_at: iso(ms(r.slot_start) + 30 * MIN), method: r.method, status: 'booked', reschedule_count: 0, join_url: r.method === 'teams' ? 'https://teams.microsoft.com/l/meetup-join/test' : null, lead: { first_name: fx.submission.first_name || fx.submission.profile_name || 'Anele', last_name: last }, ...extra };
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

test('two unconfirmed for one broker within 30 days -> Jonathan calls the broker (4.12a; D7: no cycles)', () => {
  assert.equal(K.unconfirmedCall(1), false); assert.equal(K.unconfirmedCall(2), true);
  const ins = WF.nodes.find((n) => n.name.startsWith('Insert auto-attended outcome')).parameters.query;
  assert.match(ins, /x\.broker_id = o\.broker_id AND x\.unconfirmed AND x\.marked_at > now\(\) - interval '30 days'/);
  assert.doesNotMatch(JSON.stringify(WF.nodes.filter((n) => n.parameters.query)), /cycle_id|in_cycle/);
  const gate = WF.nodes.find((n) => n.name === 'Two unconfirmed in 30 days? (4.12a)');
  assert.match(JSON.stringify(gate.parameters), /\$json\.unconfirmed_30d/);
  assert.ok(WF.connections['Inserted?'].main[0].some((c) => c.node === gate.name));
});

test("pre-call brief corpus = this broker's last 5 outcomes.summary (no insights table)", () => {
  const q = WF.nodes.find((n) => n.name === 'Meetings starting within 15 min, not yet briefed').parameters.query;
  assert.doesNotMatch(q, /public\.insights/);
  assert.match(q, /FROM public\.outcomes o WHERE o\.broker_id = b\.id AND NULLIF\(btrim\(o\.summary\), ''\) IS NOT NULL ORDER BY o\.marked_at DESC LIMIT 5/);
  assert.equal(K.briefInput({ first_name: 'Anele', last_name: 'Dlamini' }, { appointment_date: '2026-10-14T12:00:00Z', method: 'teams' }, [], {}, ['a', 'b', 'c', 'd', 'e', 'f']).adviser_corpus.length, 5);
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

test('I-38d: digest and pre-call brief sends touch leads.last_contact_at (only when Meta accepted the send)', () => {
  const byName = (n) => WF.nodes.find((x) => x.name === n);
  assert.equal(WF.connections['Send digest'].main[0][0].node, 'Touch last_contact_at (digest leads)');
  assert.equal(WF.connections['Send pre-call brief'].main[0][0].node, 'Touch last_contact_at (brief lead)');
  for (const n of ['Touch last_contact_at (digest leads)', 'Touch last_contact_at (brief lead)']) {
    const q = byName(n).parameters.query;
    assert.match(q, /SET last_contact_at = now\(\)/); assert.match(q, /<> ''/, `${n}: guarded by the wamid`);
    assert.match(byName(n).parameters.options.queryReplacement, /messages\[0\]\.id/);
  }
  assert.match(byName('Touch last_contact_at (digest leads)').parameters.query, /status IN \('booked','confirmed'\)/);
  assert.deepEqual(checkSql(workflowSql(WF)), []);
});

// S7-03: the lead's call-number taps (W07 contactStep) land in the broker's pre-call brief (real W07 + W11 node code)
import * as W07 from '../lib/w07.mjs';
test('S7-03 call-number taps (other number, alt number, best time) flow from W07 into the W11 brief; nothing re-asked', () => {
  let ld = { first_name: 'Pieter', last_name: 'van Wyk', phone: '+27600000004', line_type: 'mobile', age_band: '45_50', budget_band: '1250plus', language: 'en', conv_state: {} };
  const apply = (r) => { ld = { ...ld, ...r.update, conv_state: r.conv_state || ld.conv_state }; return r; };
  apply(W07.contactStep(ld, { payload: 'call_number_other' }));
  apply(W07.contactStep(ld, { text: '060 000 0099' }, { line_type: 'mobile' }));
  assert.equal(ld.call_number, '+27600000099');
  ld.conv_state = { contact_step: 'typed_alt' };
  apply(W07.contactStep(ld, { text: '+27 60 000 0098' }, { line_type: 'mobile' }));
  apply(W07.contactStep(ld, { list_id: 'best_afternoons' }));
  assert.equal(ld.conv_state.contact_step, 'done');
  const b = mk(L04, 'van Wyk');
  const fb = K.fallbackBrief(ld, b, K.briefInput(ld, b, [], {}, []));
  assert.match(fb.template_vars[4], /^\+27600000099 \(not the WhatsApp number\)/);
  assert.match(fb.template_vars[4], /\+27600000098/); assert.equal(fb.template_vars[5], 'afternoons');
  assert.equal(briefCheck(fb, { last_name: 'van Wyk' }).pass, true, JSON.stringify(briefCheck(fb, { last_name: 'van Wyk' }).issues));
  // confirm tap ("Yes, this one") -> the WhatsApp number is the call number, not flagged as different
  let l2 = { ...ld, call_number: null, alt_number: null, conv_state: { contact_step: 'call_number' } };
  l2 = { ...l2, ...W07.contactStep(l2, { payload: 'call_number_yes' }).update };
  const f2 = K.fallbackBrief(l2, b, K.briefInput(l2, b, [], {}, []));
  assert.equal(f2.template_vars[4], '+27600000004');
});

test('I-57a: an empty minute (alwaysOutputData -> {skip:true}) stops at an IF and never reaches Claim brief (it threw "Query Parameters must be a string..." every minute)', () => {
  const prev = (to) => Object.entries(WF.connections).filter(([, v]) => (v.main || []).some((o) => o.some((c) => c.node === to))).map(([k]) => k);
  const claim = 'Claim brief (idempotency)';
  const gate = prev(claim);
  assert.equal(gate.length, 1);
  const node = WF.nodes.find((n) => n.name === gate[0]);
  assert.equal(node.type, 'n8n-nodes-base.if', 'Claim brief must sit behind an IF, not directly behind Brief input');
  assert.match(node.parameters.conditions.conditions[0].leftValue, /\$json\.skip !== true/);
  assert.deepEqual(prev(gate[0]), ['Brief input (w11.briefInput)']);
  assert.equal(WF.connections[gate[0]].main.length, 1, 'only the true output is wired');
});

// ---------- /start/ v4 (20 Oct 2026): income band, topics, guest joining, call / alt number in the brief ----------
test('v4 brief: income band + topics replace the missing budget band; Teams guest named as "one guest joining", never the address', async () => {
  const ld = { first_name: 'Naledi', last_name: 'Khumalo', phone: '+27600000011', age_band: '35_44', budget_band: null, income_band: '30k_50k', alt_number: '+27600000012', best_time: 'mornings', language: 'en',
    conv_state: { via: 'start_page', start: { topics: ['life', 'new_bond', 'will'], via: 'start_page' } } };
  const b = { ...mk(L01, 'Khumalo'), guest_email: 'synthetic-guest@example.test' };
  const input = K.briefInput(ld, b, [], {}, []);
  assert.equal(input.lead.income_band, 'R30,000 to R50,000 a month');
  assert.deepEqual(input.lead.topics, ['life cover', 'cover for a new bond', 'a will (passed to a person)']);
  assert.equal(input.contact.guest_joining, true); assert.equal(input.contact.alt_number, '+27600000012');
  assert.ok(!JSON.stringify(input).includes('@'), 'the guest address never reaches the model');
  const fb = K.fallbackBrief(ld, b, input);
  assert.equal(fb.template_vars[3], 'Teams (one guest joining)');
  assert.equal(fb.template_vars[7], 'not asked (income R30,000 to R50,000 a month)');
  assert.match(fb.template_vars[8], /^Wants help with: life cover, cover for a new bond, a will \(passed to a person\)$/);
  assert.match(fb.portal.who, /35-44, income R30,000 to R50,000 a month, Wants help with: life cover/);
  assert.match(fb.portal.practical, /^Teams \(one guest joining\), Teams link in the event, backup number \+27600000012, mornings, English$/);
  const c = briefCheck(fb, { last_name: 'Khumalo' });
  assert.equal(c.pass, true, JSON.stringify(c.issues));
  assert.match(renderBody('precall_brief', K.briefVarsArray(fb)), /by Teams \(one guest joining\)\. Number to call: Teams link in the event\..*budget band not asked \(income R30,000 to R50,000 a month\)\. Asked before the call: Wants help with: life cover/);
  // phone: number + backup in var 4 (unchanged rule); no guest on a phone call; prefer_not / no income -> "not given"
  const ph = { ...mk(L04, 'Khumalo'), guest_email: 'synthetic-guest@example.test' };
  const pi = K.briefInput({ ...ld, income_band: 'prefer_not', call_number: '+27600000013' }, ph, [], {}, []);
  const pf = K.fallbackBrief({ ...ld, call_number: '+27600000013' }, ph, pi);
  assert.equal(pi.contact.guest_joining, false);
  assert.equal(pf.template_vars[4], '+27600000013 (not the WhatsApp number) (if no answer: +27600000012)');
  assert.equal(pf.template_vars[7], 'not given');
  // a chat lead with a budget band keeps it
  assert.equal(K.fallbackBrief({ ...ld, budget_band: '1500_plus' }, b, K.briefInput({ ...ld, budget_band: '1500_plus' }, b, [], {}, [])).template_vars[7], 'R1,500+ a month (priority)');
});

test('v4 brief wiring: W11 reads income_band, conv_state and the guest fact (not the address); Brief input passes them; W11 stays inactive, relay only', async () => {
  const q = WF.nodes.find((n) => n.name === 'Meetings starting within 15 min, not yet briefed').parameters.query;
  assert.match(q, /l\.income_band, l\.conv_state/);
  assert.match(q, /EXISTS \(SELECT 1 FROM public\.lead_activities g WHERE g\.idempotency_key = 'w05:guest:' \|\| a\.id AND g\.activity_type = 'booking_guest' AND g\.payload \? 'guest_email'\) AS guest_joining/);
  assert.doesNotMatch(q, /guest_email'\s*AS|->>'guest_email'/, 'the address is not selected');
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  assert.equal(WF.active, false);
  const { runCode } = await import('./_n8ncode.mjs');
  const row = { id: 'bk_v4', client_id: 'l1', broker_id: 'b', brand_id: 'smc', appointment_date: '2026-10-21T10:00:00+02:00', method: 'teams', status: 'booked', join_url: 'https://teams.microsoft.com/l/meetup-join/test',
    first_name: 'Naledi', last_name: 'Khumalo', phone: '+27600000011', age_band: '35_44', budget_band: null, income_band: '50k_80k', conv_state: { start: { topics: ['disability_income'] } }, guest_joining: true,
    lead_call_number: null, alt_number: null, best_time: null, language: 'en', whatsapp_number: '+27600000099', themes: [], corpus: [] };
  const o = await runCode(WF, 'Brief input (w11.briefInput)', { json: row });
  assert.equal(o.json.input.lead.income_band, 'R50,000 to R80,000 a month');
  assert.deepEqual(o.json.input.lead.topics, ['disability and income protection']);
  assert.equal(o.json.input.contact.guest_joining, true);
  assert.equal(o.json.body.model, 'relay-default');
  assert.match(o.json.body.system, /income_band|Wants help with/, 'the system prompt read from precall-brief.md covers the v4 inputs');
  const relay = WF.nodes.find((n) => n.name === 'Pre-call brief LLM (relay)');
  assert.equal(relay.parameters.url, '={{ $env.LLM_RELAY_URL }}');
  assert.doesNotMatch(JSON.stringify(WF), /anthropic|claude-|x-api-version/i);
});
