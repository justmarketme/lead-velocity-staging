// W08 Unbooked nurture - synthetic tests (fixtures only). DRAFT for Jonathan (4C.2). Run: node --test automation/tests/W08.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lead, broker, ms, iso, H, renderBody } from './_harness.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as N from '../lib/w08.mjs';
import * as P from '../lib/wa-provider.mjs';
import * as S from '../lib/sub-whatsapp-send.mjs';

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
  assert.match(renderBody(d.template, d.vars), /^Hi Sipho, following up on your insurance and financial planning enquiry\. A call with Mark takes about 30 minutes.*Reply STOP to opt out\.$/);
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

// fix wave 4 (compliance-qa review 4 §1 #28, §2c): No thanks suppresses; W03 owns pre-routing CTWA stall nudges.
test('No thanks carries an objection suppression, written in the same statement as the close', async () => {
  const r = N.onTap({ id: 'lead_x', stage: 'disclosed', conv_state: {} }, 'no_thanks:lead_x');
  assert.equal(r.stage, 'unbooked_closed');
  assert.deepEqual(r.suppress, { source: 'objection', note: 'no_thanks_nurture' });
  assert.equal(N.onTap({ id: 'lead_x' }, 'not_now:lead_x').suppress, undefined);
  const { readFile } = await import('node:fs/promises');
  const wf = JSON.parse(await readFile(new URL('../W08.json', import.meta.url), 'utf8'));
  const q = wf.nodes.find((n) => n.name === 'Save tap result').parameters.query;
  assert.match(q, /UPDATE public\.leads[\s\S]*INSERT INTO public\.suppression[\s\S]*smc_hash_contact/);
  const cand = wf.nodes.find((n) => /^Candidates/.test(n.name)).parameters.query;
  assert.match(cand, /smc_hash_contact\(l\.phone\)/, 'suppression lookup uses the same hash as every writer');
});

test('pre-routing CTWA lead (no broker_id) is never nudged by W08 (W03 owns stall nudges)', () => {
  const lead = { id: 'lead_c', origin: 'ctwa', stage: 'verified', conv_state: { state: 'q_age' }, first_message_at: '2026-10-05T08:00:00Z', broker_id: null };
  assert.equal(N.stopReason(lead, {}), 'ctwa_pre_routing_w03');
  assert.equal(N.due(lead, { sent: new Set() }, Date.parse('2026-10-05T10:00:00Z')).action, 'stop');
});

test('w07-alignment #11: session words come from sessionWords(); English = template text; Afrikaans lead gets AF only when lines.mjs has it', () => {
  const en = N.sessionWords('unbooked_nudge_2h', ['Lerato', 'Mark'], 'en');
  assert.match(en.body, /^Hi Lerato, following up on your insurance and financial planning enquiry\. A call with Mark/); assert.match(en.body, /Reply STOP to opt out\.$/);
  const af = N.sessionWords('unbooked_nudge_72h', ['Pieter', 'Mark'], 'af');
  assert.ok(['af', 'en'].includes(af.lang) && af.body.length > 20);
  const now = Date.parse('2026-10-05T10:00:00Z');
  const m = N.message({ id: 'l1', first_name: 'Pieter', language: 'af' }, { broker: { contact_person: 'Mark K' }, last_inbound_ms: now - 3600_000 }, 'unbooked_nudge_2h', now);
  assert.equal(m.channel, 'session'); assert.equal(m.template_lang, 'en'); assert.equal(m.lang, 'af'); assert.ok(m.session.body.includes('Pieter'));
  const wf = JSON.parse(readFileSync(new URL('../W08.json', import.meta.url), 'utf8'));
  assert.ok(!/nothing to buy/.test(JSON.stringify(wf)), 'no hard-coded copy left in W08.json');
});

test('I-39c: cancelled booking restarts +2/+24/+72 h from cancelled_at with new keys; no close (W10 sweep at 96 h); last_contact_at after Meta accepts', () => {
  const first = '2026-10-01T08:00:00Z'; const cx = '2026-10-05T08:00:00Z';
  const ld = { id: 'lead_cx', first_name: 'Pieter', origin: 'web', stage: 'booked', conv_state: { state: 'unbooked' }, first_message_at: first, cancelled_at: cx, broker_id: 'b1' };
  const p = N.nurturePlan(ld);
  assert.equal(p.restart_ms, Date.parse(cx)); assert.equal(p.track, 'unbooked');
  assert.equal(p.steps[0].due_ms, Date.parse(cx) + 2 * N.H);
  const d = N.due(ld, { sent: new Set(), broker: { contact_person: 'Mark K' }, outbound_count: 3 }, Date.parse(cx) + 2 * N.H + 60_000);
  assert.equal(d.action, 'send'); assert.equal(d.touch, 'unbooked_nudge_2h'); assert.equal(d.idempotency_key, `w08:lead_cx:unbooked_nudge_2h:r${Date.parse(cx)}`);
  const done = N.due(ld, { sent: new Set(['unbooked_nudge_2h', 'unbooked_nudge_24h', 'unbooked_nudge_72h']), outbound_count: 6 }, Date.parse(cx) + 200 * N.H);
  assert.equal(done.action, 'stop'); assert.match(done.reason, /w10_sweep/);
  assert.match(N.sessionWords('unbooked_nudge_2h', ['A', 'Mark'], 'en').body, /there's no obligation to buy anything/);
  assert.doesNotMatch(N.sessionWords('unbooked_nudge_72h', ['A', 'Mark'], 'en').body, /we will not message again/);
  const wf = JSON.parse(readFileSync(new URL('../W08.json', import.meta.url), 'utf8'));
  assert.ok(wf.connections['Send WhatsApp'].main[0].some((c) => c.node === 'Accepted by Meta? (wamid)'));
  assert.match(wf.nodes.find((n) => n.name === 'Touch leads.last_contact_at (lead outbound)').parameters.query, /last_contact_at = now\(\)/);
  assert.match(wf.nodes.find((n) => /^Candidates/.test(n.name)).parameters.query, /cancelled_at/);
});

// ---------- Start track (19 Oct 2026): Start here sent, nothing booked -> start_nudge_2h / _24h / _final ----------
const startLead = (over = {}) => ({ id: 'lead_start', first_name: 'Naledi', language: 'en', origin: 'ctwa', stage: 'verified', conv_state: { state: 'start_page' }, opted_out_at: null, first_message_at: null, broker_id: null, created_at: '2026-10-20T08:00:00+02:00', ...over });
const SAST_ISO = (t) => new Date(t + 2 * N.H).toISOString().slice(0, 16);

test('start track: a lead sent Start here (never routed, or routed on the page) is nudged, not stopped as pre-routing', () => {
  assert.equal(N.isStartPending(startLead()), true);
  assert.equal(N.isStartPending(startLead({ conv_state: { state: 'unbooked', via: 'start_page' }, broker_id: 'b1' })), true, 'left the page after the adviser card');
  assert.equal(N.isStartPending(startLead({ first_message_at: '2026-10-20T08:05:00+02:00', broker_id: 'b1' })), false, 'W06 intro sent -> classic track');
  assert.equal(N.isStartPending(startLead({ conv_state: { state: 'handoff', via: 'start_page' } })), false);
  assert.equal(N.stopReason(startLead(), ctx({ broker: {} })), null);
  assert.equal(N.track(startLead()), 'start_ctwa');
  assert.equal(N.track(startLead({ origin: 'lead_ad' })), 'start');
});

test('start track timing: +2 h, +24 h, last inside the 72-h free window for CTWA (+72 h for form leads), close 24 h after', () => {
  const p = N.nurturePlan(startLead());
  assert.deepEqual(p.steps.map((s) => [s.touch, SAST_ISO(s.due_ms)]), [['start_nudge_2h', '2026-10-20T10:00'], ['start_nudge_24h', '2026-10-21T08:00'], ['start_nudge_final', '2026-10-22T19:30']]);
  assert.ok(p.steps.every((s) => s.due_ms < Date.parse('2026-10-20T08:00:00+02:00') + N.CTWA_WINDOW), 'all inside the free entry window');
  assert.equal(SAST_ISO(p.close_ms), '2026-10-23T19:30');
  const f = N.nurturePlan(startLead({ origin: 'lead_ad', created_at: '2026-10-20T13:00:00+02:00' }));
  assert.deepEqual(f.steps.map((s) => SAST_ISO(s.due_ms)), ['2026-10-20T15:00', '2026-10-21T13:00', '2026-10-23T13:00']);
  const night = N.nurturePlan(startLead({ created_at: '2026-10-20T19:50:00+02:00' }));
  assert.equal(SAST_ISO(night.steps[0].due_ms), '2026-10-21T08:00', 'quiet hours push the first nudge to 08:00');
});

test('start track stops: booked, opted out, suppressed, No thanks, message cap', () => {
  const at = Date.parse('2026-10-20T10:01:00+02:00');
  assert.equal(N.due(startLead(), ctx({ has_live_booking: true, broker: {} }), at).reason, 'booked');
  assert.equal(N.due(startLead({ opted_out_at: '2026-10-20T09:00:00+02:00' }), ctx(), at).reason, 'opted_out');
  assert.equal(N.due(startLead(), ctx({ suppressed: true }), at).reason, 'suppressed');
  assert.equal(N.due(startLead({ conv_state: { state: 'start_page', declined_nurture: true } }), ctx(), at).reason, 'no_thanks');
  assert.equal(N.due(startLead(), ctx({ outbound_count: 12 }), at).reason, 'message_cap');
});

test('start nudge messages: banner per touch, adviser named or "an adviser", template outside the window, session card inside it', () => {
  const at = Date.parse('2026-10-20T10:01:00+02:00');
  const d = N.due(startLead(), ctx({ broker: {} }), at);
  assert.equal(d.action, 'send'); assert.equal(d.touch, 'start_nudge_2h'); assert.equal(d.kind, 'start'); assert.equal(d.channel, 'template');
  assert.equal(d.idempotency_key, 'w08:lead_start:start_nudge_2h'); assert.equal(d.banner, 'welcome');
  assert.deepEqual(d.vars, ['Naledi', 'an adviser']);
  assert.match(d.header.link, /headers\/header-welcome\.png$/);
  assert.deepEqual(d.buttons, [['not_now', 'Not now']]);
  const s = N.due(startLead({ broker_id: 'b1' }), ctx({ broker: { contact_person: 'Mark Weston' }, last_inbound_ms: at - N.H }), at);
  assert.equal(s.channel, 'session'); assert.deepEqual(s.vars, ['Naledi', 'Mark']);
  assert.match(s.session.body, /^Hi Naledi, your 30-minute call with Mark is one tap away\..*It takes about a minute\.$/);
  assert.doesNotMatch(s.session.body, /STOP/, 'only the W03 consent carries the STOP line (20 Oct 2026)');
  const m24 = N.startMessage(startLead(), ctx({ broker: { contact_person: 'Mark Weston' } }), 'start_nudge_24h', at);
  assert.equal(m24.banner, 'video');
  const fin = N.startMessage(startLead(), ctx({ broker: { contact_person: 'Mark Weston' } }), 'start_nudge_final', at);
  assert.equal(fin.banner, 'adviser'); assert.deepEqual(fin.buttons, [['no_thanks', 'No thanks']]);
  assert.match(N.startWords('start_nudge_final', ['Naledi', 'Mark']), /we won't message again\.$/);
  for (const t of ['start_nudge_2h', 'start_nudge_24h', 'start_nudge_final']) assert.doesNotMatch(N.startWords(t, ['A', 'Mark']), /\bfree\b|\bAI\b|Lead Velocity|licensed/i, 'client wording rules');
});

test('startPayload: template = image header, 2 body vars, URL token button, quick reply with lead id; session = cta_url; bad token -> null', () => {
  const d = { ...N.startMessage(startLead(), ctx({ broker: { contact_person: 'Mark Weston' } }), 'start_nudge_24h', Date.parse('2026-10-21T08:01:00+02:00')), phone: '+27 82 123 4567' };
  const tok = 'lt1.abcdefghijklmnop.qrstuvwxyz0123';
  const t = N.startPayload(d, tok);
  assert.equal(t.type, 'template'); assert.equal(t.template.name, 'start_nudge_24h'); assert.equal(t.to, '27821234567');
  const [h, b, u, q] = t.template.components;
  assert.match(h.parameters[0].image.link, /header-video\.png$/);
  assert.deepEqual(b.parameters.map((p) => p.text), ['Naledi', 'Mark']);
  assert.equal(u.sub_type, 'url'); assert.equal(u.parameters[0].text, tok);
  assert.equal(q.sub_type, 'quick_reply'); assert.equal(q.parameters[0].payload, 'not_now:lead_start');
  const s = N.startPayload({ ...d, channel: 'session' }, tok);
  assert.equal(s.interactive.type, 'cta_url'); assert.equal(s.interactive.action.parameters.url, N.START_LINK + tok);
  assert.equal(N.startPayload(d, null), null); assert.equal(N.startPayload(d, 'not-a-token'), null); assert.equal(N.startPayload({ ...d, phone: '' }, tok), null);
});

test('W08.json: candidates include Start here leads (LEFT JOIN brokers, created_at clock); Build mints a fresh lead token', () => {
  const wf = JSON.parse(readFileSync(new URL('../W08.json', import.meta.url), 'utf8'));
  const q = wf.nodes.find((n) => /^Candidates/.test(n.name)).parameters.query;
  assert.match(q, /LEFT JOIN public\.brokers b/); assert.match(q, /conv_state->>'state' = 'start_page'/); assert.match(q, /COALESCE\(l\.first_message_at, l\.created_at\)/);
  assert.match(wf.nodes.find((n) => n.name === 'Decide (w08.due)').parameters.jsCode, /created_at: r\.created_at/);
  const b = wf.nodes.find((n) => n.name === 'Build message (template or session)').parameters.jsCode;
  assert.match(b, /mintLeadToken\(d\.lead_id, \{ secret: \$env\.LEAD_TOKEN_SECRET \}\)/); assert.match(b, /startPayload\(d, token\)/);
  assert.deepEqual(checkSql(workflowSql(wf)), []);
});

test('start nudge Twilio Content files: sender numbering (body 1-2, URL 3, quick reply 4), banner, body = session words', () => {
  for (const [t, banner, reply] of [['start_nudge_2h', 'welcome', 'Not now'], ['start_nudge_24h', 'video', 'Not now'], ['start_nudge_final', 'adviser', 'No thanks']]) {
    const c = JSON.parse(readFileSync(new URL(`../templates/twilio/content/${t}.json`, import.meta.url), 'utf8'));
    const card = c.content.types['twilio/card'];
    assert.equal(c._meta.key, t); assert.equal(c._meta.approval.category, 'UTILITY');
    assert.match(card.media[0], new RegExp(`header-${banner}\\.png$`));
    assert.equal(card.actions[0].type, 'URL'); assert.equal(card.actions[0].url, 'https://sortmycover.co.za/start/#lt={{3}}');
    assert.equal(card.actions[1].type, 'QUICK_REPLY'); assert.equal(card.actions[1].title, reply); assert.equal(card.actions[1].id, '{{4}}');
    assert.equal(card.title, N.startWords(t, ['{{1}}', '{{2}}']) + ' Reply STOP to opt out.', 'the 19 Oct submission, unchanged');
    // v2 (20 Oct 2026): own key + approval, same banner and buttons, no STOP line, body = the session words, ends on fixed text
    const v2 = JSON.parse(readFileSync(new URL(`../templates/twilio/content/${t}_v2.json`, import.meta.url), 'utf8'));
    const c2 = v2.content.types['twilio/card'];
    assert.deepEqual([v2._meta.key, v2._meta.base, v2._meta.approval.name, v2._meta.approval.category], [`${t}_v2`, t, `smc_${t}_v2`, 'UTILITY']);
    assert.deepEqual(c2.media, card.media); assert.deepEqual(c2.actions, card.actions); assert.deepEqual(v2._meta.var_plan, c._meta.var_plan);
    assert.equal(c2.title, N.startWords(t, ['{{1}}', '{{2}}']), 'v2 body = the session words');
    assert.doesNotMatch(c2.title, /\bSTOP\b|\bfree\b|\blicensed\b|\bAI\b/i);
    assert.doesNotMatch(c2.title.replace(/[\s.]+$/, ''), /\{\{\d+\}\}$/, 'body does not end on a variable');
  }
});

test('start nudge under Twilio: v2 Content wins once its SID is set, v1 until then; banner is static (body 1-2, token 3, quick reply 4)', () => {
  const env = (o) => ({ WHATSAPP_PROVIDER: 'twilio', TWILIO_WHATSAPP_FROM: '+27600000000', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_CONTENT_SIDS: JSON.stringify(o) });
  const d = { ...N.startMessage(startLead(), ctx({ broker: { contact_person: 'Mark Weston' } }), 'start_nudge_24h', Date.parse('2026-10-21T08:01:00+02:00')), phone: '+27 82 123 4567' };
  const tok = 'lt1.abcdefghijklmnop.qrstuvwxyz0123';
  const p = N.startPayload(d, tok);
  const send = (o) => { const r = S.twilioRequest({ payload: p }, env(o)); if (r.twilio_skip) return { skip: r.twilio_skip }; const f = Object.fromEntries(new URLSearchParams(r.body)); return { sid: f.ContentSid, vars: JSON.parse(f.ContentVariables) }; };
  const vars = { 1: 'Naledi', 2: 'Mark', 3: tok, 4: 'not_now:lead_start' };
  assert.deepEqual(send({ start_nudge_24h: 'HXv1' }), { sid: 'HXv1', vars });
  assert.deepEqual(send({ start_nudge_24h: 'HXv1', start_nudge_24h_v2: 'HXv2' }), { sid: 'HXv2', vars });
  assert.deepEqual(send({ start_nudge_24h_v2: 'HXv2' }), { sid: 'HXv2', vars });
  assert.equal(send({}).skip, 'twilio_content_sid_missing');
  assert.deepEqual(P.START_NUDGE_KEYS.start_nudge_final, ['start_nudge_final_v2', 'start_nudge_final']);
});

// Smoke test #13 (21 Oct 2026): nudges are direct marketing -> CPA contact hours (lib/contact-hours.mjs), not just 20:00-08:00.
test('CPA hours: no nudge on a Sunday, a Saturday afternoon or a public holiday; it moves to the next allowed time', () => {
  // start track, consent Sat 24 Oct 10:00 (form lead): +2 h = Sat 12:00 (inside), +24 h = Sun 10:00 -> Mon 08:00, +72 h = Tue 10:00
  const sat = N.nurturePlan(startLead({ origin: 'lead_ad', created_at: '2026-10-24T10:00:00+02:00' }));
  assert.deepEqual(sat.steps.map((s) => [s.touch, SAST_ISO(s.due_ms)]), [['start_nudge_2h', '2026-10-24T12:00'], ['start_nudge_24h', '2026-10-26T08:00'], ['start_nudge_final', '2026-10-27T10:00']]);
  assert.equal(N.due(startLead({ origin: 'lead_ad', created_at: '2026-10-24T10:00:00+02:00' }), ctx({ sent: new Set(['start_nudge_2h']) }), Date.parse('2026-10-25T10:05:00+02:00')).action, 'wait', 'Sunday: wait');
  // unbooked track, first message Sat 14:00: +2 h = Sat 16:00 -> Mon 08:00
  const p = N.nurturePlan(l02({ first_message_at: '2026-10-24T14:00:00+02:00' }));
  assert.equal(SAST_ISO(p.steps[0].due_ms), '2026-10-26T08:00', 'Saturday afternoon -> Monday 08:00');
  // +24 h = Sun 14:00 would also land on Mon 08:00: two nudges never go together (at least MIN_NUDGE_GAP apart)
  assert.deepEqual(p.steps.map((s) => SAST_ISO(s.due_ms)), ['2026-10-26T08:00', '2026-10-26T14:00', '2026-10-27T14:00']);
  // a nudge that fell due before the window closed but was not sent in time waits for the next window, then sends
  const late = l02({ first_message_at: '2026-10-24T09:30:00+02:00' }); // +2 h = Sat 11:30
  assert.equal(N.due(late, ctx(), Date.parse('2026-10-24T13:05:00+02:00')).action, 'wait', 'Saturday 13:05: wait');
  assert.equal(N.due(late, ctx(), Date.parse('2026-10-25T12:00:00+02:00')).action, 'wait', 'Sunday: wait');
  assert.equal(N.due(late, ctx(), Date.parse('2026-10-26T08:00:00+02:00')).action, 'send', 'Monday 08:00: sent, not dropped');
  // municipal election day Wed 4 Nov 2026 is a public holiday
  const hol = N.nurturePlan(l02({ first_message_at: '2026-11-03T10:00:00+02:00' }));
  assert.equal(SAST_ISO(hol.steps[1].due_ms), '2026-11-05T08:00', '+24 h on 4 Nov -> Thu 08:00');
  assert.equal(N.due(l02({ first_message_at: '2026-11-03T10:00:00+02:00' }), ctx({ sent: new Set(['unbooked_nudge_2h']) }), Date.parse('2026-11-04T10:00:00+02:00')).action, 'wait');
});

test('CPA hours, CTWA Start here: the last nudge stays inside the 72-h free window at the latest allowed moment', () => {
  // consent Thu 22 Oct 10:00 (CTWA): +68 h = Sun 06:00 -> past the window if moved to Mon -> latest allowed before Sun 09:30 = Sat 12:30
  const p = N.nurturePlan(startLead({ created_at: '2026-10-22T10:00:00+02:00' }));
  assert.deepEqual(p.steps.map((s) => [s.touch, SAST_ISO(s.due_ms)]), [['start_nudge_2h', '2026-10-22T12:00'], ['start_nudge_24h', '2026-10-23T10:00'], ['start_nudge_final', '2026-10-24T12:30']]);
  assert.ok(p.steps.every((s) => s.due_ms < Date.parse('2026-10-22T10:00:00+02:00') + N.CTWA_WINDOW));
});

// Review 21 Oct 2026 (#13 follow-up): with the CPA contact hours, the restarted +72 h nudge can move past Saturday 13:00 / a
// Sunday / a holiday to +113 h, after W10's 96 h C1A sweep has claimed the replacement. The last restarted nudge is pulled back
// to the latest contact-hours moment before that sweep (as start_ctwa does for its free window). Over a long holiday weekend with
// no contact-hours room 6 h after the +24 h nudge, the +72 h one is not sent at all rather than after the replacement claim.
test('review #13: a restarted sequence\'s nudges all land before W10\'s 96 h C1A decision, inside the contact hours', async () => {
  const { C1A_SEQUENCE_MS } = await import('../lib/w10.mjs');
  const { inMarketingHours } = await import('../lib/contact-hours.mjs');
  for (const cx of ['2026-10-21T13:00:00Z', '2026-12-23T13:00:00Z', '2027-03-25T13:00:00Z', '2026-10-24T11:00:00Z', '2026-10-30T17:30:00Z', '2026-11-03T10:00:00Z']) {
    const p = N.nurturePlan({ id: 'l', origin: 'web', stage: 'booked', conv_state: { state: 'unbooked' }, first_message_at: '2026-10-01T08:00:00Z', cancelled_at: cx });
    const holidayWeekend = ['2026-12-23T13:00:00Z', '2027-03-25T13:00:00Z'].includes(cx);
    assert.deepEqual(p.steps.map((s) => s.touch), ['unbooked_nudge_2h', 'unbooked_nudge_24h', ...(holidayWeekend ? [] : ['unbooked_nudge_72h'])], cx);
    for (const s of p.steps) {
      assert.ok(s.due_ms < Date.parse(cx) + C1A_SEQUENCE_MS - N.H, `${cx} ${s.touch} at +${((s.due_ms - Date.parse(cx)) / N.H).toFixed(1)} h: before the 96 h sweep`);
      assert.equal(inMarketingHours(s.due_ms), true, `${cx} ${s.touch}: inside the contact hours`);
    }
    for (let i = 1; i < p.steps.length; i++) assert.ok(p.steps[i].due_ms > p.steps[i - 1].due_ms, `${cx}: in order`);
  }
  // Wednesday 15:00 cancel: +72 h is Saturday afternoon (closed) -> Saturday 12:30, before the sweep (was Monday, +113 h)
  const wed = N.nurturePlan({ id: 'l', origin: 'web', conv_state: { state: 'unbooked' }, first_message_at: '2026-10-01T08:00:00Z', cancelled_at: '2026-10-21T13:00:00Z' });
  assert.equal(wed.steps[2].due_ms, Date.parse('2026-10-24T10:30:00Z'));
  // an ordinary weekday cancel keeps +2 / +24 / +72 exactly
  const plain = N.nurturePlan({ id: 'l', origin: 'web', conv_state: { state: 'unbooked' }, first_message_at: '2026-10-01T08:00:00Z', cancelled_at: '2026-10-19T08:00:00Z' });
  assert.deepEqual(plain.steps.map((s) => (s.due_ms - Date.parse('2026-10-19T08:00:00Z')) / N.H), [2, 24, 72]);
});
