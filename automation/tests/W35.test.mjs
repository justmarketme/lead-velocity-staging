// W35 Lead pulse - synthetic tests (fixtures only, zero dependencies). Run: node --test automation/tests/W35.test.mjs
// Logic: conversation/pulse.mjs (owner conversation-designer). Workflow: automation/W35.json (inactive draft).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIX, lead, broker, ms, iso, H, MIN, renderBody, template } from './_harness.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as P from '../../conversation/pulse.mjs';
import { LINES, fill } from '../../conversation/lines.mjs';
import { outputGate, toneCheck, REDACTED_HEALTH } from '../../conversation/guardrail.mjs';
import { routeInbound } from '../lib/w07.mjs';

const WF = JSON.parse(readFileSync(new URL('../W35.json', import.meta.url), 'utf8'));
const B = broker();
const BR = { contact_person: B.adviser_name };
const L01 = lead('L01');
const ev = (fx, tpl, btn) => fx.timeline.find((e) => e.data?.template === tpl && (!btn || e.data.button === btn));
const ATTENDED_AT = ev(L01, 'broker_outcome_check', 'Attended').at; // 10:52
const REACH_YES_AT = ev(L01, 'reach_check', 'Yes, we spoke').at; // 11:04
// L01 from the fixture: attended (broker tap), reach-check answered yes, English, Lerato.
const ctxL01 = (over = {}) => ({
  lead: { id: L01.lead_id, first_name: L01.submission.first_name, language: L01.submission.language, opted_out_at: null, conv_state: { state: 'closed_attended' } },
  outcome: { outcome: L01.expected.W12.outcome, marked_at: ATTENDED_AT, lead_reach_check: L01.expected.W12.lead_reach_check },
  booking: { id: 'bkg_L01' },
  reach: { sent_at: L01.expected.W12.reach_check_at, answered_at: REACH_YES_AT },
  broker: BR, suppressed: false, already_sent: false, last_inbound_at: REACH_YES_AT, outbound_count: 9,
  ...over
});

test('L01 (attended, reach-check yes): pulse due at attended + 30 min, as a session message inside the 24-h window', () => {
  const c = ctxL01();
  assert.equal(iso(P.dueAt(c)), iso(ms(ATTENDED_AT) + 30 * MIN)); // 11:22, after the 11:04 reach-check tap
  assert.equal(P.pulseDue(c, ms(ATTENDED_AT) + 29 * MIN).action, 'wait');
  const d = P.pulseDue(c, ms(ATTENDED_AT) + 30 * MIN);
  assert.equal(d.action, 'send');
  assert.equal(d.channel, 'session');
  assert.equal(d.body, renderBody('lead_pulse', ['Lerato', 'Mark']), 'session words = template words');
  assert.deepEqual(d.buttons, [['pulse_yes:bkg_L01', 'Yes, worth it'], ['pulse_no:bkg_L01', 'Not really']]);
  assert.equal(d.idempotency_key, `w35:${L01.lead_id}:bkg_L01`);
});

test('session words = template lead_pulse words (PULSE_ASK + STOP_HINT); template is UTILITY with the same two buttons', () => {
  const t = renderBody('lead_pulse', ['Lerato', 'Mark']);
  assert.equal(t, fill(LINES.en.PULSE_ASK, { first_name: 'Lerato', adviser_first: 'Mark' }) + ' ' + LINES.en.STOP_HINT);
  const tpl = template('lead_pulse');
  assert.equal(tpl.category, 'UTILITY');
  assert.deepEqual(tpl.components.find((c) => c.type === 'BUTTONS').buttons.map((b) => b.text), [P.BUTTONS.up[1], P.BUTTONS.down[1]]);
});

test('outside the 24-h window: utility template lead_pulse with first name + adviser first name', () => {
  const c = ctxL01({ last_inbound_at: iso(ms(ATTENDED_AT) - 30 * H) });
  const d = P.pulseDue(c, ms(ATTENDED_AT) + 30 * MIN);
  assert.equal(d.channel, 'template');
  assert.equal(d.template, 'lead_pulse');
  assert.deepEqual(d.vars, ['Lerato', 'Mark']);
});

test('Afrikaans lead inside the window gets the Afrikaans words and buttons', () => {
  const c = ctxL01({ lead: { ...ctxL01().lead, language: 'af' } });
  const d = P.pulseDue(c, ms(ATTENDED_AT) + 30 * MIN);
  assert.equal(d.body, fill(LINES.af.PULSE_ASK, { first_name: 'Lerato', adviser_first: 'Mark' }) + ' ' + LINES.af.STOP_HINT);
  assert.equal(d.buttons[0][1], P.BUTTONS_AF.up[1]);
  for (const [, title] of d.buttons) assert.ok(title.length <= 20, `button title over 20 chars: ${title}`);
});

test('no pulse for any fixture lead that did not attend (L02-L10) or said the adviser did not reach them', () => {
  for (const fx of FIX.leads.filter((l) => l.fixture_id !== 'L01')) {
    const o = fx.expected.W12 || {};
    const d = P.pulseDue(ctxL01({ outcome: { outcome: o.outcome || null, marked_at: o.outcome_check_at || ATTENDED_AT, lead_reach_check: o.lead_reach_check || 'none' } }), ms(ATTENDED_AT) + 2 * H);
    assert.equal(d.action, 'skip', fx.fixture_id);
  }
  const no = P.pulseDue(ctxL01({ outcome: { outcome: 'attended', marked_at: ATTENDED_AT, lead_reach_check: 'no' } }), ms(ATTENDED_AT) + 2 * H);
  assert.equal(no.reason, 'lead_said_not_reached');
});

test('stop rules: opted out, suppressed, handoff, already sent, 12-message cap', () => {
  const now = ms(ATTENDED_AT) + H;
  assert.equal(P.pulseDue(ctxL01({ lead: { ...ctxL01().lead, opted_out_at: ATTENDED_AT } }), now).reason, 'opted_out');
  assert.equal(P.pulseDue(ctxL01({ suppressed: true }), now).reason, 'suppressed');
  assert.equal(P.pulseDue(ctxL01({ lead: { ...ctxL01().lead, conv_state: { state: 'handoff' } } }), now).reason, 'handoff');
  assert.equal(P.pulseDue(ctxL01({ already_sent: true }), now).reason, 'already_sent');
  assert.equal(P.pulseDue(ctxL01({ outbound_count: 12 }), now).reason, 'message_cap');
});

test('reach-check unanswered: waits 2 h after it went out; quiet hours shift to 08:00; stale after 48 h', () => {
  const c = ctxL01({ outcome: { outcome: 'attended', marked_at: ATTENDED_AT, lead_reach_check: 'none' }, reach: { sent_at: L01.expected.W12.reach_check_at, answered_at: null } });
  assert.equal(iso(P.dueAt(c)), iso(ms(L01.expected.W12.reach_check_at) + 2 * H)); // 13:00
  const late = ctxL01({ outcome: { outcome: 'attended', marked_at: '2026-10-15T19:45:00+02:00', lead_reach_check: 'yes' }, reach: { answered_at: '2026-10-15T19:50:00+02:00' } });
  assert.equal(iso(P.dueAt(late)), '2026-10-16T08:00:00+02:00');
  assert.equal(P.pulseDue(late, ms('2026-10-15T21:00:00+02:00')).action, 'wait');
  assert.equal(P.pulseDue(ctxL01(), ms(ATTENDED_AT) + 48 * H).reason, 'stale');
});

test('tap: thumbs stored, optional-line invitation once, latest tap wins', () => {
  const now = ms(ATTENDED_AT) + 40 * MIN;
  const up = P.onPulseTap('pulse_yes:bkg_L01', ctxL01(), now);
  assert.equal(up.update.thumbs, 'up');
  assert.equal(up.booking_id, 'bkg_L01');
  assert.equal(up.reply, LINES.en.PULSE_LINE_ASK_UP);
  assert.ok(up.conv_state.pulse_line_open_until);
  const again = P.onPulseTap('pulse_no:bkg_L01', ctxL01({ lead: { ...ctxL01().lead, conv_state: up.conv_state } }), now + MIN);
  assert.equal(again.update.thumbs, 'down');
  assert.equal(again.reply, null, 'no second invitation');
  assert.equal(P.onPulseTap('confirm:bkg_L01', ctxL01(), now).error, 'not a pulse tap');
});

test('optional line: honest feedback is stored (redacted); advice questions, person, STOP and complaints go back to W07', () => {
  const now = ms(ATTENDED_AT) + H;
  const cs = P.onPulseTap('pulse_no:bkg_L01', ctxL01(), now - 10 * MIN).conv_state;
  assert.equal(P.isPulseLine('Not great, he was late and rushed', cs, now), true);
  assert.equal(P.isPulseLine('He explained everything clearly', cs, now), true);
  for (const t of ['So is the R600 policy he showed me a good deal?', 'Was it worth it for me to switch my policy then?', 'can I speak to a person', 'STOP', 'I want to complain about the adviser'])
    assert.equal(P.isPulseLine(t, cs, now), false, t);
  assert.equal(P.isPulseLine('fine', cs, now + 25 * H), false, 'window closed after 24 h');
  const r = P.onPulseLine('Not great, he was late and rushed', ctxL01({ lead: { ...ctxL01().lead, conv_state: cs } }));
  assert.equal(r.update.line, 'Not great, he was late and rushed');
  assert.equal(r.reply, LINES.en.PULSE_LINE_THANKS);
  assert.equal(r.conv_state.pulse_line_done, true);
  assert.equal(P.isPulseLine('one more thing', r.conv_state, now), false, 'one line only');
  assert.equal(P.onPulseLine('my anxiety made it hard to focus', ctxL01()).update.line, REDACTED_HEALTH);
  const masked = P.onPulseLine('call me on 082 123 4567 or ID 8001015009087, mail x@y.co.za', ctxL01()).update.line;
  assert.ok(!/\d{3}/.test(masked) && !masked.includes('@'), masked);
});

test('broker report is aggregate only (>= 5 answers, no lines, no names); W33 gets every thumbs-down', () => {
  const rows = [['up'], ['up'], ['down', 'he was late'], ['up'], ['up'], [null]].map(([thumbs, line], i) => ({ lead_id: `lead_${i}`, booking_id: `b${i}`, thumbs, line: line || null }));
  assert.equal(P.brokerLine(rows.slice(0, 4)), null);
  const b = P.brokerLine(rows);
  assert.deepEqual([b.n, b.up], [5, 4]);
  assert.equal(b.text, '4 of 5 people said the call was worth their time.');
  assert.ok(!/late|lead_/u.test(JSON.stringify(b)));
  assert.deepEqual(P.judgeHints(rows).map((h) => [h.lead_id, h.reason, h.lead_said]), [['lead_2', 'lead_pulse_down', 'he was late']]);
});

test('every lead-facing W35 line passes the output gate and the tone check (en + af)', () => {
  for (const lang of ['en', 'af']) for (const k of ['PULSE_ASK', 'PULSE_LINE_ASK_UP', 'PULSE_LINE_ASK_DOWN', 'PULSE_LINE_THANKS']) {
    const t = fill(LINES[lang][k], { first_name: 'Lerato', adviser_first: 'Mark' });
    assert.ok(outputGate(t, {}).pass, `${lang}.${k}`);
    assert.ok(toneCheck(t, { lang, max_sentences: 3 }).pass, `${lang}.${k}`);
    assert.ok((t.match(/\?/g) || []).length <= 1, `${lang}.${k}: one question per message`);
  }
});

test('W07 already routes pulse taps to W35', () => {
  const r = routeInbound({ from: '+27600000001', payload: 'pulse_yes:bkg_L01', text: 'Yes, worth it' }, { lead: { conv_state: { state: 'closed_attended' } }, broker_numbers: new Set() });
  assert.equal(r.route, 'W35');
  // the optional line: W07 routes it to W35 with { lead, msg }, and W35's handler accepts exactly that item
  const now = ms(ATTENDED_AT) + H;
  const cs = P.onPulseTap('pulse_no:bkg_L01', ctxL01(), now - 5 * MIN).conv_state;
  const leadRow = { id: L01.lead_id, language: 'en', brand_id: 'smc', broker_id: B.broker_id, conv_state: cs };
  const line = { from: '+27600000001', text: 'Not great, he was late and rushed' };
  assert.equal(routeInbound(line, { lead: leadRow, broker_numbers: new Set(), now_ms: now }).route, 'W35');
  assert.equal(routeInbound({ ...line, text: 'So is the R600 policy a good deal?' }, { lead: leadRow, broker_numbers: new Set(), now_ms: now }).route, 'nlu');
  assert.equal(P.isPulseLine(line.text, leadRow.conv_state, now), true);
  assert.equal(leadRow.conv_state.pulse_booking_id, 'bkg_L01', 'W35 reads the booking from lead.conv_state');
});

test('I-39e: W08 session words use the Afrikaans nudge lines (+ STOP_HINT) for an Afrikaans lead', async () => {
  const W8 = await import('../lib/w08.mjs');
  const w = W8.sessionWords('unbooked_nudge_24h_text', ['Lerato', 'Mark help al 15 jaar gesinne.'], 'af');
  assert.equal(w.lang, 'af');
  assert.equal(w.body, fill(LINES.af.NUDGE_24H_TEXT, { first_name: 'Lerato', bio_short: 'Mark help al 15 jaar gesinne.' }) + ' ' + LINES.af.STOP_HINT);
  assert.match(W8.sessionWords('unbooked_nudge_2h', ['Lerato', 'Mark'], 'af').body, /nie verplig om iets te koop nie/u);
});

test('W35.json: inactive, credentials by name only, $env for secrets, SQL matches the schema, idempotent claim before send', () => {
  assert.equal(WF.active, false);
  const raw = JSON.stringify(WF);
  assert.ok(!/EAA[A-Za-z0-9]{20,}|sk-ant-|Bearer [A-Za-z0-9]{20,}/u.test(raw), 'no literal secrets');
  for (const n of WF.nodes) if (n.credentials) for (const v of Object.values(n.credentials)) assert.equal(v.id, '', `${n.name}: credential by name only`);
  assert.ok(raw.includes('$env.META_SYSTEM_USER_TOKEN') && raw.includes('$env.DRY_RUN_SENDS'));
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const claim = WF.nodes.find((n) => n.name === 'Claim pulse row (idempotency)');
  assert.match(claim.parameters.query, /ON CONFLICT \(lead_id, booking_id\) DO NOTHING\s+RETURNING id/u);
  assert.equal(WF.connections['Claim pulse row (idempotency)'].main[0][0].node, 'Claimed? (first scheduler run only)');
  assert.equal(WF.settings.errorWorkflow, 'smc-w22', 'n8n reads errorWorkflow as a workflow id (I-44b)');
});
