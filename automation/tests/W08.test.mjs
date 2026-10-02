// W08 Unbooked nurture - synthetic tests (fixtures only). DRAFT for Jonathan (4C.2). Run: node --test automation/tests/W08.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lead, broker, ms, iso, H, renderBody } from './_harness.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as N from '../lib/w08.mjs';

const WF = JSON.parse(readFileSync(new URL('../W08.json', import.meta.url), 'utf8'));
const B = broker();
const BR = { contact_person: B.adviser_name, bio_short: 'Mark has helped families in Gauteng plan their cover for 12 years.', intro_video_url: B.intro_video_url };
const L02 = lead('L02'); const L04 = lead('L04');
// L02: page lead, tapped "I'll pick a time on WhatsApp" -> broker_intro_slots at 09:02:30 (timeline); unbooked until 11:40.
const tl = (fx, ev) => fx.timeline.find((e) => e.event.includes(ev));
const FIRST_L02 = tl(L02, "I'll pick").at;
const l02 = (over = {}) => ({ id: L02.lead_id, first_name: 'Sipho', language: 'en', origin: 'page', stage: 'disclosed', conv_state: { state: 'unbooked' }, opted_out_at: null, first_message_at: FIRST_L02, broker_id: B.broker_id, ...over });
const ctx = (over = {}) => ({ has_live_booking: false, suppressed: false, sent: new Set(), last_inbound_ms: NaN, outbound_count: 1, broker: BR, ...over });

test('L02 plan matches the fixture: +2 h nudge at 11:02:30 (timeline), +24 h, +72 h, close 24 h after the last', () => {
  const p = N.nurturePlan(l02());
  assert.equal(p.track, 'unbooked');
  assert.deepEqual(p.steps.map((s) => [s.touch, iso(s.due_ms)]), [
    ['unbooked_nudge_2h', iso(ms(tl(L02, 'W08 unbooked_nudge_2h').at))],
    ['unbooked_nudge_24h', '2026-10-13T09:02:30+02:00'],
    ['unbooked_nudge_72h', '2026-10-15T09:02:30+02:00']]);
  assert.equal(iso(p.close_ms), '2026-10-16T09:02:30+02:00');
});

test('L02 at +2 h: template outside the window, session inside it; real template text renders', () => {
  const t = ms(tl(L02, 'W08 unbooked_nudge_2h').at);
  const d = N.due(l02(), ctx(), t);
  assert.equal(d.action, 'send'); assert.equal(d.touch, 'unbooked_nudge_2h'); assert.equal(d.channel, 'template');
  assert.equal(d.idempotency_key, `w08:${L02.lead_id}:unbooked_nudge_2h`);
  assert.match(renderBody(d.template, d.vars), /^Hi Sipho, following up on your life cover enquiry\. A call with Mark takes about 30 minutes.*Reply STOP to opt out\.$/);
  assert.deepEqual(d.buttons.map((b) => b[0]), ['see_open_times', 'not_now']);
  const s = N.due(l02(), ctx({ last_inbound_ms: t - 2 * H }), t);
  assert.equal(s.channel, 'session');
});

test('before due -> wait; scheduler firing twice sends once (sent set / idempotency key)', () => {
  const t = ms(FIRST_L02) + 2 * H;
  assert.equal(N.due(l02(), ctx(), t - 60_000).action, 'wait');
  const a = N.due(l02(), ctx(), t);
  const claimed = new Set();
  const claim = (k) => (claimed.has(k) ? false : (claimed.add(k), true));
  assert.equal(claim(a.idempotency_key), true);
  assert.equal(claim(N.due(l02(), ctx(), t + 1000).idempotency_key), false);
  const next = N.due(l02(), ctx({ sent: new Set(['unbooked_nudge_2h']) }), t + 1000);
  assert.equal(next.action, 'wait'); assert.equal(next.touch, 'unbooked_nudge_24h');
});

test('L02 books at 11:40 -> no further nudges (fixture: 24 h and 72 h cancelled on booking)', () => {
  const after = ms('2026-10-13T09:02:30+02:00');
  const d = N.due(l02(), ctx({ has_live_booking: true, sent: new Set(['unbooked_nudge_2h']) }), after);
  assert.deepEqual(d, { action: 'stop', reason: 'booked' });
});

test('+24 h carries the intro video; no approved video -> unbooked_nudge_24h_text with bio_short', () => {
  const t = ms('2026-10-13T09:02:30+02:00');
  const v = N.due(l02(), ctx({ sent: new Set(['unbooked_nudge_2h']) }), t);
  assert.equal(v.template, 'unbooked_nudge_24h'); assert.equal(v.header.type, 'video'); assert.equal(v.header.link, B.intro_video_url.en);
  const tx = N.due(l02(), ctx({ sent: new Set(['unbooked_nudge_2h']), broker: { ...BR, intro_video_url: null } }), t);
  assert.equal(tx.template, 'unbooked_nudge_24h_text');
  assert.equal(renderBody(tx.template, tx.vars), `Hi Sipho, a little about the adviser for your enquiry: ${BR.bio_short} Tap below to see open times. Reply STOP to opt out.`);
});

test('+72 h is the last message (No thanks button) and the lead closes 24 h later', () => {
  const sent = new Set(['unbooked_nudge_2h', 'unbooked_nudge_24h']);
  const last = N.due(l02(), ctx({ sent }), ms('2026-10-15T09:02:30+02:00'));
  assert.equal(last.template, 'unbooked_nudge_72h'); assert.deepEqual(last.buttons.map((b) => b[0]), ['see_open_times', 'no_thanks']);
  assert.match(renderBody(last.template, last.vars), /last message/);
  sent.add('unbooked_nudge_72h');
  assert.equal(N.due(l02(), ctx({ sent }), ms('2026-10-16T09:02:29+02:00')).action, 'wait');
  assert.equal(N.due(l02(), ctx({ sent }), ms('2026-10-16T09:02:30+02:00')).action, 'close');
});

test('quiet hours: a nudge due 21:30 waits to 08:00 (ASSUMPTION)', () => {
  const p = N.nurturePlan(l02({ first_message_at: '2026-10-12T19:30:00+02:00' }));
  assert.equal(iso(p.steps[0].due_ms), '2026-10-13T08:00:00+02:00');
  assert.equal(N.due(l02({ first_message_at: '2026-10-12T19:30:00+02:00' }), ctx(), ms('2026-10-12T21:30:00+02:00')).action, 'wait');
});

test('CTWA stalled mid-qualification (L04-shaped): +1 h / +20 h / +68 h, never past the 72-h free window', () => {
  const first = L04.submission.inbound.find((m) => m.payload === 'consent_yes').at;
  const c = { id: L04.lead_id, first_name: 'Pieter', origin: 'ctwa', stage: 'disclosed', conv_state: { state: 'q_budget' }, first_message_at: first, broker_id: B.broker_id };
  const p = N.nurturePlan(c);
  assert.equal(p.track, 'ctwa_stall');
  assert.deepEqual(p.steps.map((s) => iso(s.due_ms)), ['2026-10-13T08:00:00+02:00', '2026-10-13T15:05:40+02:00', '2026-10-15T15:05:40+02:00']);
  assert.ok(p.steps.every((s) => s.due_ms < ms(first) + N.CTWA_WINDOW));
  const late = N.nurturePlan({ ...c, first_message_at: '2026-10-12T03:00:00+02:00' });
  assert.ok(late.steps.every((s) => s.due_ms < ms('2026-10-12T03:00:00+02:00') + N.CTWA_WINDOW));
  assert.equal(late.steps.length, 2, '+68 h would land at 23:00 -> 08:00 is past 72 h -> skipped');
});

test('stop conditions: opted out, suppressed, handoff, No thanks, closed stage, 12-message cap, not disclosed', () => {
  const t = ms(FIRST_L02) + 3 * H;
  const r = (lo, co) => N.due(l02(lo), ctx(co), t).reason;
  assert.equal(r({ opted_out_at: '2026-10-12T10:00:00+02:00' }), 'opted_out');
  assert.equal(r({}, { suppressed: true }), 'suppressed');
  assert.equal(r({ conv_state: { state: 'handoff' } }), 'handoff');
  assert.equal(r({ conv_state: { declined_nurture: true } }), 'no_thanks');
  assert.equal(r({ stage: 'unbooked_closed' }), 'stage_unbooked_closed');
  assert.equal(r({}, { outbound_count: 12 }), 'message_cap');
  assert.equal(r({ first_message_at: null }), 'not_disclosed');
});

test('taps: No thanks closes (CLOSE_UNBOOKED); Not now keeps the plan and sends nothing', () => {
  const n = N.onTap(l02(), 'no_thanks:lead_test_L02');
  assert.equal(n.stage, 'unbooked_closed'); assert.equal(n.conv_state.declined_nurture, true); assert.equal(n.reply_line, 'CLOSE_UNBOOKED');
  const k = N.onTap(l02(), 'not_now:lead_test_L02');
  assert.equal(k.reply_line, null); assert.equal(k.stage, 'disclosed');
  assert.equal(N.onTap(l02(), 'confirm'), null);
});

test('W08.json: physical columns only; claim before send; DRY_RUN guard; template-or-session builder', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const c = WF.connections;
  assert.equal(c['Claim touch (idempotency)'].main[0][0].node, 'Claimed? (first scheduler run only)');
  assert.equal(c['Claimed? (first scheduler run only)'].main[0][0].node, 'Build message (template or session)');
  assert.ok(JSON.stringify(WF).includes('DRY_RUN_SENDS'));
  assert.ok(JSON.stringify(WF).includes('ON CONFLICT (idempotency_key) DO NOTHING'));
});
