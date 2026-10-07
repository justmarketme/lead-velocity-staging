// Capture Flow v2 (Jonathan, 2026-10-07): every branch of automation/ctwa/capture-v2.js, the Flow JSON, the W03 hook,
// the tier B broker offer, email verification, dispute evidence and the UTM shape fix. Offline, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFlow } from '../flows/build-capture-flow-v2.mjs';
import { normaliseSubmission } from '../lib/w01.mjs';

const require = createRequire(import.meta.url);
const C = require('../ctwa/capture-v2.js');
const W03 = require('../ctwa/w03.js');
const LT = require('../security/lead-token.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const NOW = Date.parse('2026-10-07T09:00:00+02:00'); // Wednesday
const LEAD = { id: '11111111-1111-4111-8111-111111111111', phone: '+27825550101', first_name: 'Lerato', stage: 'verified' };
const BROKER = { broker_id: 'b0000000-0000-4000-8000-000000000001', adviser_name: 'Mark Smith', adviser_first_name: 'Mark', practice_name: 'Mark Smith Financial Services', fsp_number: '12345', methods_supported: ['teams', 'phone'], meeting_hours: { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']] }, min_notice_hours: 2, horizon_days: 14, adviser_whatsapp: '+27825550199' };
const SLOTS = [{ start: '2026-10-08T10:00:00+02:00', end: '2026-10-08T10:30:00+02:00' }, { start: '2026-10-08T11:00:00+02:00', end: '2026-10-08T11:30:00+02:00' }, { start: '2026-10-09T09:00:00+02:00', end: '2026-10-09T09:30:00+02:00' }];

function harness({ broker = BROKER, lead = LEAD, capture = {}, slots = { slots: SLOTS }, book, lookup, mx = ['mx.example'] } = {}) {
  const state = { capture, booked: [] };
  const deps = {
    now: NOW,
    verifyToken: (t) => (t === 'good' ? { ok: true, lead_id: lead.id, kind: 'capture' } : t === 'book' ? { ok: true, lead_id: lead.id, kind: 'book' } : { ok: false, reason: 'bad_signature' }),
    loadContext: async () => ({ lead, broker, capture: state.capture }),
    resolveMx: async (d) => (d === 'nomx.example' ? [] : mx),
    disposable: new Set(['mailinator.com']),
    lookup: lookup || (async (e) => ({ line_type: e.endsWith('0000') ? 'landline' : 'mobile' })),
    slots: async () => slots,
    book: book || (async (p) => { state.booked.push(p); return { ok: true, booking: { id: 'bk_1' } }; }),
  };
  const send = async (data, action = 'data_exchange', token = 'good') => {
    const r = await C.handle({ action, flow_token: token, data }, deps);
    const s = r.effects.find((e) => e.kind === 'save_capture');
    if (s) state.capture = s.capture;
    return r;
  };
  return { send, state, deps };
}
async function through(h, upTo, over = {}) {
  const steps = [
    ['REASONS', { reasons: ['life_cover', 'paying_too_much'] }], ['SPEND', { spend: '1000_1500' }], ['NAME', { first_name: 'Lerato', last_name: 'Mokoena' }],
    ['EMAIL', { email: 'lerato@example.co.za', alt_same: true }], ['NUMBER', { same_number: 'same' }], ['AGE', { age_band: '35_44' }],
    ['BUDGET', { budget_band: '1500_plus' }], ['SMOKER', { smoker: 'no' }], ['INCOME', { income: '40k_60k' }],
    ['DATE', { date: '2026-10-08' }], ['SLOTS', { slot: SLOTS[0].start }], ['CONFIRM', {}],
  ];
  let r;
  for (const [s, d] of steps) { r = await h.send({ screen: s, ...d, ...(over[s] || {}) }); if (s === upTo) break; }
  return r;
}

// ------------------------------------------------------------------------------------------------ Flow JSON
test('Flow JSON is generated from the module copy and is current', () => {
  const file = readFileSync(join(ROOT, 'automation/flows/capture-flow-v2.json'), 'utf8');
  assert.equal(file, JSON.stringify(buildFlow(), null, 2) + '\n', 'run node automation/flows/build-capture-flow-v2.mjs');
});
test('Flow JSON: screen order, routing targets exist, END terminal, every ${data.x} declared', () => {
  const f = buildFlow();
  assert.deepEqual(f.screens.map((s) => s.id), C.SCREENS);
  const ids = new Set(f.screens.map((s) => s.id));
  for (const [from, tos] of Object.entries(f.routing_model)) { assert.ok(ids.has(from)); for (const t of tos) assert.ok(ids.has(t), `${from}->${t}`); }
  const end = f.screens.find((s) => s.id === 'END');
  assert.equal(end.terminal, true);
  for (const s of f.screens) {
    const used = [...JSON.stringify(s.layout).matchAll(/\$\{data\.([a-z_]+)\}/g)].map((m) => m[1]);
    for (const u of used) assert.ok(s.data && u in s.data, `${s.id} uses undeclared data.${u}`);
    if (s.id !== 'END') assert.equal(JSON.stringify(s.layout).includes(`"screen":"${s.id}"`), true, `${s.id} footer posts its screen id`);
  }
  const reasons = f.screens[0].data.reasons_options.__example__.map((o) => o.title);
  assert.deepEqual(reasons, ['Life cover', 'Funeral cover', 'Retirement planning', 'Investments', 'Disability cover', "I feel like I'm paying too much", 'Something else']);
  const cal = JSON.stringify(f.screens.find((s) => s.id === 'DATE').layout);
  assert.match(cal, /"CalendarPicker"/);
  const req = (id, name) => JSON.stringify(f.screens.find((s) => s.id === id).layout).match(new RegExp(`"name":"${name}"[^}]*"required":(true|false)`))[1];
  assert.equal(req('NAME', 'first_name'), 'true'); assert.equal(req('NAME', 'last_name'), 'true'); assert.equal(req('EMAIL', 'email'), 'true');
  assert.equal(req('EMAIL', 'alt_email'), 'false'); assert.equal(req('SPEND', 'spend'), 'false'); assert.equal(req('SMOKER', 'smoker'), 'false');
  assert.equal(req('INCOME', 'income'), 'false'); assert.equal(req('AGE', 'age_band'), 'true'); assert.equal(req('BUDGET', 'budget_band'), 'true');
});
test('spec doc carries every lead-facing line verbatim (explainer video copy)', () => {
  const doc = readFileSync(join(ROOT, 'deliverables/automation-engineer/whatsapp-capture-flow-v2.md'), 'utf8');
  const keys = Object.keys(C.COPY).filter((k) => !/^err_|^verify_body$/.test(k));
  for (const k of keys) assert.ok(doc.includes(C.COPY[k]), `doc is missing COPY.${k}`);
  for (const rows of [C.REASONS, C.SPEND, C.AGE, C.BUDGET, C.SMOKER, C.INCOME]) for (const [, t] of rows) assert.ok(doc.includes(t), t);
});

// ------------------------------------------------------------------------------------------------ tokens + guards
test('ping, bad token, wrong kind, opted-out lead', async () => {
  const h = harness();
  assert.deepEqual((await h.send({}, 'ping')).response, { data: { status: 'active' } });
  assert.match((await h.send({}, 'INIT', 'nope')).effects[0].reason, /bad_signature/);
  assert.equal((await h.send({}, 'INIT', 'book')).effects[0].reason, 'flow_token_wrong_kind');
  const o = harness({ lead: { ...LEAD, opted_out_at: '2026-10-06T00:00:00Z' } });
  assert.equal((await o.send({}, 'INIT')).effects[0].reason, 'flow_token_lead_gone');
});
test('capture tokens mint/verify, and W28 rejects them', async () => {
  const secret = 'x'.repeat(40);
  const t = LT.mintFlowToken(LEAD.id, 'capture', null, { secret, nowMs: NOW });
  assert.equal(LT.verifyFlowToken(t, { secret, nowMs: NOW }).kind, 'capture');
  const W28 = require('../flows/w28-endpoint.js');
  const r = await W28.handle({ action: 'INIT', flow_token: t }, { verifyToken: (x) => LT.verifyFlowToken(x, { secret, nowMs: NOW }) });
  assert.equal(r.effects[0].reason, 'flow_token_wrong_kind');
});

// ------------------------------------------------------------------------------------------------ screens
test('INIT opens REASONS; empty reasons is an error; paying-too-much changes the SPEND heading', async () => {
  const h = harness();
  assert.equal((await h.send({}, 'INIT')).response.screen, 'REASONS');
  const e = await h.send({ screen: 'REASONS', reasons: [] });
  assert.equal(e.response.data.error_message, C.COPY.err_reasons);
  const a = await h.send({ screen: 'REASONS', reasons: ['life_cover', 'paying_too_much', 'hack'] });
  assert.equal(a.response.screen, 'SPEND');
  assert.equal(a.response.data.spend_heading, C.COPY.spend_heading_too_much);
  assert.deepEqual(h.state.capture.reasons, ['life_cover', 'paying_too_much']);
  const b = await harness().send({ screen: 'REASONS', reasons: ['funeral_cover'] });
  assert.equal(b.response.data.spend_heading, C.COPY.spend_heading_default);
});
test('SPEND is optional', async () => {
  const h = harness();
  const r = await h.send({ screen: 'SPEND' });
  assert.equal(r.response.screen, 'NAME');
  assert.equal(h.state.capture.spend_band, null);
});
test('licence: unknown categories -> licence_check_needed; outside -> outside_licence; inside -> no flag', async () => {
  let r = await harness().send({ screen: 'REASONS', reasons: ['investments'] });
  assert.equal(r.effects.find((e) => e.kind === 'flag').flag, 'licence_check_needed');
  r = await harness({ broker: { ...BROKER, licence_categories: ['lt_risk', 'lt_funeral'] } }).send({ screen: 'REASONS', reasons: ['investments', 'life_cover'] });
  const f = r.effects.find((e) => e.kind === 'flag');
  assert.equal(f.flag, 'outside_licence'); assert.deepEqual(f.detail.missing, ['investments']);
  r = await harness({ broker: { ...BROKER, licence_categories: ['lt_risk'] } }).send({ screen: 'REASONS', reasons: ['life_cover', 'paying_too_much'] });
  assert.equal(r.effects.find((e) => e.kind === 'flag'), undefined);
  assert.equal(C.licenceFlags(['other', 'paying_too_much'], {}).flag, null);
});
test('NAME required and validated; three bad submits auto-disqualify (invalid_contact)', async () => {
  const h = harness();
  assert.equal((await h.send({ screen: 'NAME', first_name: 'Lerato', last_name: '' })).response.data.error_message, C.COPY.err_name);
  assert.equal((await h.send({ screen: 'NAME', first_name: 'test', last_name: 'Mokoena' })).response.screen, 'NAME');
  const r = await h.send({ screen: 'NAME', first_name: '12345', last_name: 'x' });
  assert.equal(r.response.screen, 'END');
  assert.equal(r.response.data.body, C.COPY.end_invalid_body);
  assert.equal(r.effects.find((e) => e.kind === 'disqualify').reason, 'invalid_contact');
  assert.equal(r.effects.find((e) => e.kind === 'disqualify').set.counts_toward_cycle, false);
  assert.equal(C.validName("Mary-Jane O'Neil"), "Mary-Jane O'Neil");
  assert.equal(C.validName('Zoë'), 'Zoë');
});
test('EMAIL: typo suggestion (no strike), accepted on resubmit; no MX / disposable strike; alt email + same-as-above', async () => {
  const h = harness();
  let r = await h.send({ screen: 'EMAIL', email: 'lerato@gmial.com' });
  assert.equal(r.response.data.init_email, 'lerato@gmail.com');
  assert.equal(h.state.capture.attempts.email, undefined);
  r = await h.send({ screen: 'EMAIL', email: 'lerato@gmail.com', alt_same: false, alt_email: 'l.work@example.co.za' });
  assert.equal(r.response.screen, 'NUMBER');
  assert.equal(h.state.capture.alt_email, 'l.work@example.co.za');
  assert.equal(r.response.data.number_heading, 'Is 082 555 0101 the number to call you on?');
  const s = harness();
  await s.send({ screen: 'EMAIL', email: 'a@b.com', alt_same: true, alt_email: 'other@example.co.za' });
  assert.equal(s.state.capture.alt_email, null); assert.equal(s.state.capture.alt_email_same, true);
  const bad = harness();
  await bad.send({ screen: 'EMAIL', email: 'x@nomx.example' });
  await bad.send({ screen: 'EMAIL', email: 'x@mailinator.com' });
  r = await bad.send({ screen: 'EMAIL', email: 'not-an-email' });
  assert.equal(r.effects.find((e) => e.kind === 'disqualify').reason, 'invalid_contact');
  const alt = harness();
  r = await alt.send({ screen: 'EMAIL', email: 'a@example.co.za', alt_email: 'broken' });
  assert.equal(r.response.screen, 'EMAIL'); assert.match(r.response.data.error_message, /^Alternative email:/);
});
test('NUMBER: same as WhatsApp = verified; other mobile = Lookup-validated, not verified; landline/invalid strike; missing other = error', async () => {
  let h = harness();
  await h.send({ screen: 'NUMBER', same_number: 'same' });
  assert.equal(h.state.capture.call_number, LEAD.phone); assert.equal(h.state.capture.call_number_verified, true);
  h = harness();
  assert.equal((await h.send({ screen: 'NUMBER', same_number: 'other', other_number: '' })).response.data.error_message, C.COPY.err_other_number_missing);
  const r = await h.send({ screen: 'NUMBER', same_number: 'other', other_number: '083 555 1234' });
  assert.equal(r.response.screen, 'AGE');
  assert.equal(h.state.capture.call_number, '+27835551234'); assert.equal(h.state.capture.call_number_verified, false);
  h = harness();
  assert.equal((await h.send({ screen: 'NUMBER', same_number: 'other', other_number: '021 555 0000' })).response.data.error_message, C.COPY.err_other_number);
  await h.send({ screen: 'NUMBER', same_number: 'other', other_number: '12' });
  const d = await h.send({ screen: 'NUMBER', same_number: 'other', other_number: '12' });
  assert.equal(d.effects.find((e) => e.kind === 'disqualify').reason, 'invalid_contact');
});
test('AGE: required; <35 and 51+ close politely, never delivered', async () => {
  for (const band of ['lt35', '51plus']) {
    const h = harness();
    const r = await through(h, 'AGE', { AGE: { age_band: band } });
    assert.equal(r.response.screen, 'END');
    assert.equal(r.response.data.body, C.fill(C.COPY.end_close_body, { first_name: 'Lerato' }));
    assert.equal(r.effects.find((e) => e.kind === 'disqualify').set.delivered, false);
  }
  assert.equal((await harness().send({ screen: 'AGE' })).response.screen, 'AGE');
});
test('BUDGET: tiers A/B, below R750 closes and is never counted', async () => {
  assert.deepEqual(C.TIER_OF, { '1500_plus': 'A', '1250_1499': 'B', '750_1250': 'B' });
  const h = harness();
  const r = await through(h, 'BUDGET', { BUDGET: { budget_band: 'lt750' } });
  assert.equal(r.response.screen, 'END');
  const d = r.effects.find((e) => e.kind === 'disqualify');
  assert.equal(d.reason, 'budget_band'); assert.equal(d.set.counts_toward_cycle, false);
  // a closed capture stays closed: further screens cannot reopen it
  assert.equal((await h.send({ screen: 'SMOKER', smoker: 'no' })).response.screen, 'END');
  const a = harness();
  const ok = await through(a, 'BUDGET');
  assert.equal(ok.response.screen, 'SMOKER');
  assert.equal(ok.response.data.smoker_heading, 'Do you smoke? (Optional — used only to brief your adviser Mark before the call.)');
});
test('SMOKER: answer stored with exact wording + timestamp; skipped = no evidence fields', async () => {
  let h = harness();
  await through(h, 'SMOKER', { SMOKER: { smoker: 'prefer_not' } });
  assert.equal(h.state.capture.smoker, 'prefer_not');
  assert.equal(h.state.capture.smoker_question_text, 'Do you smoke? (Optional — used only to brief your adviser Mark before the call.)');
  assert.equal(h.state.capture.smoker_answered_at, new Date(NOW).toISOString());
  h = harness();
  await through(h, 'SMOKER', { SMOKER: { smoker: undefined } });
  assert.equal(h.state.capture.smoker, null); assert.equal(h.state.capture.smoker_question_text, null);
});
test('smoker / income / spend / reasons never reach Meta', () => {
  const out = C.capiCustomData({ smoker: 'yes', smoker_question_text: 'x', income_band: '40k_60k', spend_band: 'lt500', reasons: ['x'], email: 'a@b', lead_tier: 'A', content_name: 'booking', value: 0 });
  assert.deepEqual(out, { content_name: 'booking', value: 0 });
});
test('tier A: INCOME -> DATE (CalendarPicker bounds) -> SLOTS -> CONFIRM -> books Teams + intro card + email verification', async () => {
  const h = harness();
  let r = await through(h, 'INCOME');
  assert.equal(r.response.screen, 'DATE');
  assert.equal(r.response.data.min_date, '2026-10-07'); assert.equal(r.response.data.max_date, '2026-10-21');
  assert.deepEqual(r.response.data.include_days, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.ok(r.response.data.unavailable_dates.includes('2026-10-12'));
  const upd = r.effects.find((e) => e.kind === 'update_lead').set;
  assert.equal(upd.lead_tier, 'A'); assert.equal(upd.wa_verified, true); assert.equal(upd.wa_id, '27825550101');
  assert.deepEqual(upd.reasons, ['life_cover', 'paying_too_much']); assert.equal(upd.last_name, 'Mokoena'); assert.equal(upd.income_band, '40k_60k');
  r = await h.send({ screen: 'DATE', date: '2026-10-08' });
  assert.deepEqual(r.response.data.slots.map((s) => s.title), ['10:00', '11:00']);
  r = await h.send({ screen: 'SLOTS', slot: SLOTS[0].start });
  assert.equal(r.response.screen, 'CONFIRM'); assert.match(r.response.data.summary_text, /Microsoft Teams call with Mark from Mark Smith Financial Services \(FSP 12345\)/);
  r = await h.send({ screen: 'CONFIRM' });
  assert.equal(h.state.booked[0].method, 'teams'); assert.equal(h.state.booked[0].email, 'lerato@example.co.za');
  assert.equal(r.response.data.heading, C.COPY.end_booked_heading);
  const card = r.effects.find((e) => e.kind === 'send_template');
  assert.equal(card.template, 'broker_intro_booked');
  assert.deepEqual(card.vars, ['Lerato', 'Mark Smith Financial Services', '12345', 'Mark Smith', 'Microsoft Teams', 'Thu 8 Oct', '10:00']);
  assert.ok(r.effects.some((e) => e.kind === 'send_email_verification'));
});
test('tier A edge cases: day full, slot taken at SLOTS, taken at CONFIRM, calendar down, broker without Teams', async () => {
  let h = harness();
  await through(h, 'INCOME');
  let r = await h.send({ screen: 'DATE', date: '2026-10-13' });
  assert.equal(r.response.data.error_message, C.COPY.err_no_day_slots);
  r = await h.send({ screen: 'SLOTS', slot: '2026-10-08T15:00:00+02:00' });
  assert.equal(r.response.data.body, C.COPY.end_taken_body); assert.equal(r.effects.find((e) => e.kind === 'send_list').reason, 'slot_taken');
  h = harness({ book: async () => ({ taken: true }) });
  r = await through(h, 'CONFIRM');
  assert.equal(r.response.data.body, C.COPY.end_taken_body);
  h = harness({ slots: { fallback: true, slots: [] } });
  r = await through(h, 'INCOME');
  assert.equal(r.effects.find((e) => e.kind === 'send_list').reason, 'calendar_unavailable');
  h = harness({ broker: { ...BROKER, methods_supported: ['phone'] } });
  r = await through(h, 'INCOME');
  assert.equal(r.effects.find((e) => e.kind === 'send_list').reason, 'broker_no_teams');
});
test('tier B: no booking in the Flow; lead sees "matching"; broker offer effect; DATE refused until accepted', async () => {
  const h = harness();
  const r = await through(h, 'INCOME', { BUDGET: { budget_band: '750_1250' } });
  assert.equal(r.response.data.heading, C.COPY.end_matching_heading);
  assert.equal(r.response.data.body, C.fill(C.COPY.end_matching_body, { first_name: 'Lerato' }));
  assert.ok(r.effects.some((e) => e.kind === 'broker_offer'));
  const d = await h.send({ screen: 'DATE', date: '2026-10-08' });
  assert.equal(d.response.data.heading, C.COPY.end_matching_heading);
  assert.equal(h.state.booked.length, 0);
});

// ------------------------------------------------------------------------------------------------ tier B offer lifecycle
test('offer expiry = 2 working hours (Mon-Fri 08-17 SAST, holidays skipped)', () => {
  const iso = (t) => new Date(t).toISOString();
  assert.equal(iso(C.offerExpiry(Date.parse('2026-10-07T09:00:00+02:00'))), iso(Date.parse('2026-10-07T11:00:00+02:00')));
  assert.equal(iso(C.offerExpiry(Date.parse('2026-10-07T16:30:00+02:00'))), iso(Date.parse('2026-10-08T09:30:00+02:00')));
  assert.equal(iso(C.offerExpiry(Date.parse('2026-10-09T20:00:00+02:00'))), iso(Date.parse('2026-10-12T10:00:00+02:00'))); // Fri night -> Mon
  assert.equal(iso(C.offerExpiry(Date.parse('2026-12-24T16:00:00+02:00'), new Set(['2026-12-25']))), iso(Date.parse('2026-12-28T09:00:00+02:00')));
});
test('makeOffer: template with Accept/Decline, lead gets the matching line, expiry scheduled, evidence on lead', () => {
  const lead = { ...LEAD, capture: { first_name: 'Lerato', age_band: '35_44', budget_band: '750_1250', reasons: ['life_cover', 'funeral_cover'] } };
  const { offer, effects } = C.makeOffer({ lead, broker: BROKER, now: NOW });
  const t = effects.find((e) => e.kind === 'send_template');
  assert.equal(t.template, 'broker_lead_offer');
  assert.deepEqual(t.vars, ['Mark', 'Lerato', '35 to 44', 'R750 to R1,249', 'Life cover, Funeral cover', 'Wed 7 Oct at 11:00']);
  assert.deepEqual(t.quick_replies, [`offer_accept:${LEAD.id}`, `offer_decline:${LEAD.id}`]);
  assert.equal(effects.find((e) => e.kind === 'send_text').body, C.fill(C.COPY.lead_matching_wa, { first_name: 'Lerato' }));
  assert.equal(effects.find((e) => e.kind === 'schedule').at, offer.expires_at);
  assert.equal(effects.find((e) => e.kind === 'update_lead').set.offer_status, 'offered');
  const tpl = JSON.parse(readFileSync(join(ROOT, 'automation/templates/broker_lead_offer.json'), 'utf8'));
  assert.equal(tpl.components.find((c) => c.type === 'BODY').example.body_text[0].length, t.vars.length);
});
const OFFER = { lead_id: LEAD.id, broker_id: BROKER.broker_id, status: 'offered', broker_whatsapp: BROKER.adviser_whatsapp };
const B2 = { broker_id: 'b0000000-0000-4000-8000-000000000002' };
test('accept: delivered + counted, timestamped, W06 first touch with the Flow card', () => {
  const r = C.decideOffer('accept', { offer: OFFER, lead: LEAD, now: NOW, actor_broker_id: BROKER.broker_id });
  const set = r.effects.find((e) => e.kind === 'update_lead').set;
  assert.equal(set.offer_status, 'accepted'); assert.equal(set.counts_toward_cycle, true); assert.equal(set.delivered, true);
  assert.equal(set.offer_decided_at, new Date(NOW).toISOString());
  assert.equal(r.effects.find((e) => e.kind === 'first_touch').template, 'broker_intro_slots_v2');
});
test('decline: not counted, not delivered, never re-offered to the same broker; next broker gets re-consent in named mode', () => {
  let seen;
  const r = C.decideOffer('decline', { offer: OFFER, lead: { ...LEAD, declined_broker_ids: ['old'] }, now: NOW, nextBroker: (l, ex) => { seen = ex; return B2; } });
  const set = r.effects.find((e) => e.kind === 'update_lead').set;
  assert.equal(set.counts_toward_cycle, false); assert.equal(set.delivered, false); assert.equal(set.broker_id, null);
  assert.deepEqual(set.declined_broker_ids, ['old', BROKER.broker_id]);
  assert.ok(seen.has(BROKER.broker_id));
  assert.equal(r.effects.find((e) => e.kind === 'reconsent').broker_id, B2.broker_id);
  const g = C.decideOffer('decline', { offer: OFFER, lead: LEAD, now: NOW, consent_mode: 'generic', nextBroker: () => B2 });
  assert.equal(g.effects.find((e) => e.kind === 'offer_next').broker_id, B2.broker_id);
});
test('expiry = declined (status expired); no next broker -> held, lead told, alert', () => {
  const r = C.decideOffer('expired', { offer: OFFER, lead: LEAD, now: NOW, nextBroker: () => null });
  assert.equal(r.effects.find((e) => e.kind === 'update_offer').set.status, 'expired');
  assert.ok(r.effects.some((e) => e.kind === 'update_lead' && e.set.offer_status === 'held'));
  assert.equal(r.effects.find((e) => e.kind === 'send_text').body, C.fill(C.COPY.lead_held_wa, { first_name: 'Lerato' }));
  assert.ok(r.effects.some((e) => e.kind === 'alert'));
});
test('offer decisions are idempotent and only the offered broker can decide', () => {
  assert.equal(C.decideOffer('accept', { offer: { ...OFFER, status: 'declined' }, lead: LEAD, now: NOW }).changed, false);
  assert.equal(C.decideOffer('accept', { offer: OFFER, lead: LEAD, now: NOW, actor_broker_id: B2.broker_id }).effects[0].reason, 'offer_wrong_broker');
});

// ------------------------------------------------------------------------------------------------ email verification
const SECRET = 's'.repeat(40);
test('email verification: link + code, only hashes stored, link bound to the current email, expiry', () => {
  const lead = { ...LEAD, email: 'Lerato@Example.co.za' };
  const v = C.issueEmailVerification(lead, { secret: SECRET, now: NOW, adviser: 'Mark', randomInt: () => 42 });
  assert.equal(v.code, '000042');
  assert.ok(!JSON.stringify(v.set).includes('000042'));
  assert.match(v.mail.message.body.content, /000042/); assert.ok(v.mail.message.body.content.includes(v.link));
  assert.equal(v.mail.message.subject, 'Confirm your email for your call with Mark');
  assert.equal(C.verifyEmailToken(v.token, lead, { secret: SECRET, now: NOW + 1000 }).ok, true);
  assert.equal(C.verifyEmailToken(v.token, { ...lead, email: 'other@example.co.za' }, { secret: SECRET, now: NOW }).reason, 'bad_signature');
  assert.equal(C.verifyEmailToken(v.token, lead, { secret: SECRET, now: NOW + 25 * 3600e3 }).reason, 'expired');
  assert.equal(C.verifyEmailToken('junk', lead, { secret: SECRET, now: NOW }).reason, 'malformed');
  const stored = { ...lead, ...v.set };
  assert.equal(C.verifyEmailCode('000041', stored, { now: NOW }).reason, 'wrong');
  assert.equal(C.verifyEmailCode('000 042', stored, { now: NOW }).set.email_verified_via, 'code');
  assert.equal(C.verifyEmailCode('000042', { ...stored, email_verify_attempts: 5 }, { now: NOW }).reason, 'locked');
  assert.equal(C.verifyEmailCode('000042', stored, { now: NOW + 25 * 3600e3 }).reason, 'expired');
  assert.throws(() => C.issueEmailVerification(lead, { secret: 'short', now: NOW }));
});
test('unverified after 24 h -> flag (once); verified or < 24 h untouched', () => {
  const sent = new Date(NOW - 24 * 3600e3).toISOString();
  const fx = C.emailVerificationSweep([
    { id: 'a', email: 'a@x.co', email_verify_sent_at: sent },
    { id: 'b', email: 'b@x.co', email_verify_sent_at: sent, email_verified: true },
    { id: 'c', email: 'c@x.co', email_verify_sent_at: new Date(NOW - 3600e3).toISOString() },
    { id: 'd', email: 'd@x.co', email_verify_sent_at: sent, email_unverified_flag: true },
  ], NOW);
  assert.deepEqual(fx.map((e) => e.id), ['a']);
  assert.equal(fx[0].set.email_unverified_flag, true);
});

// ------------------------------------------------------------------------------------------------ W03 hook
const W03CTX = (extra = {}) => ({ at: '2026-10-07T09:00:00+02:00', mobile: '+27825550101', profile_name: 'Lerato M', lead_id: LEAD.id, broker: BROKER, brand: { brand_id: 'smc', consent_mode: 'named' }, ...extra });
test('W03: consent tap opens the capture Flow when brand.capture_ui = flow_v2 and a token is supplied; wa verified', () => {
  const first = W03.step(null, { type: 'text', text: { body: 'Hi' } }, W03CTX());
  const r = W03.step(first.thread, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } },
    W03CTX({ brand: { brand_id: 'smc', consent_mode: 'named', capture_ui: 'flow_v2' }, capture_flow: { flow_id: 'F1', flow_token: 'ft1.x' } }));
  const msg = r.actions.find((a) => a.kind === 'send').message;
  assert.equal(msg.type, 'flow'); assert.equal(msg.flow.screen, 'REASONS');
  const row = r.actions.find((a) => a.kind === 'insert_lead').row;
  assert.equal(row.wa_verified, true); assert.equal(row.wa_id, '27825550101'); assert.equal(row.verified_at, '2026-10-07T09:00:00+02:00');
  assert.equal(r.thread.stage, 'capture_flow');
  const api = W03.toCloudApi('+27825550101', msg);
  assert.equal(api.interactive.type, 'flow'); assert.equal(api.interactive.action.parameters.flow_token, 'ft1.x');
});
test('W03: flow_v2 without a token falls back to the tap path (and logs it); default brand unchanged', () => {
  const first = W03.step(null, { type: 'text', text: { body: 'Hi' } }, W03CTX());
  const r = W03.step(first.thread, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, W03CTX({ brand: { brand_id: 'smc', consent_mode: 'named', capture_ui: 'flow_v2' } }));
  assert.equal(r.thread.stage, 'q_age');
  assert.ok(r.actions.some((a) => a.reason === 'capture_flow_unavailable_tap_path'));
});

// ------------------------------------------------------------------------------------------------ dispute evidence
test('dispute evidence: consent + disclosure + answers + offers + booking; gaps listed; no secrets', () => {
  const lead = { ...LEAD, consent_text: 'I agree...', consent_text_version: 'ctwa-named-v3', consent_mode: 'named', consent_at: '2026-10-07T09:00:00+02:00', consent_source: 'ctwa',
    wa_id: '27825550101', wa_verified: true, verified_at: '2026-10-07T09:00:00+02:00', disclosure_msg_id: 'wamid.1', smoker: 'no', smoker_question_text: 'Do you smoke?…', smoker_answered_at: 'x',
    email_verify_code_hash: 'SECRET', broker_id: BROKER.broker_id, lead_tier: 'B', reasons: ['life_cover'] };
  const pack = C.disputeEvidence({ lead, booking: { id: 'bk_1', method: 'teams', start: SLOTS[0].start, graph_event_id: 'AAMk', join_url: 'https://teams' },
    messages: [{ wamid: 'wamid.1', template: 'broker_intro_booked', sent_at: 'a', delivered_at: 'b' }], offers: [{ broker_id: BROKER.broker_id, status: 'accepted', offered_at: 'o', decided_at: 'd', expires_at: 'e' }] }, { now: NOW, requested_by: 'jonathan' });
  assert.equal(pack.complete, true);
  assert.equal(pack.consent.version, 'ctwa-named-v3'); assert.equal(pack.disclosure.delivered_at, 'b'); assert.equal(pack.booking.graph_event_id, 'AAMk');
  assert.equal(pack.answers.smoker_question_text, 'Do you smoke?…'); assert.equal(pack.offers[0].status, 'accepted');
  assert.ok(!JSON.stringify(pack).includes('SECRET'));
  const gaps = C.disputeEvidence({ lead: { id: 'x' } }, { now: NOW });
  assert.deepEqual(gaps.gaps, ['consent_missing', 'disclosure_missing', 'wa_not_verified']);
});

// ------------------------------------------------------------------------------------------------ UTM shape fix (crm-audit R2)
test('W01 reads the real pixel.js body: context.utm.utm_* and cid/asid/adid/ref', () => {
  const s = normaliseSubmission({ first_name: 'Lerato', mobile: '0825550101', consent: true, context: { event_id: 'e1', utm: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'smc_a', utm_content: 'ad1', utm_term: 't', ref: 'r1', cid: '120', asid: '121', adid: '122' } } });
  assert.deepEqual([s.context.utm_source, s.context.utm_medium, s.context.utm_campaign, s.context.utm_content, s.context.utm_term], ['facebook', 'paid', 'smc_a', 'ad1', 't']);
  assert.deepEqual([s.context.campaign_id, s.context.adset_id, s.context.ad_id, s.context.ref], ['120', '121', '122', 'r1']);
  const legacy = normaliseSubmission({ context: { utm: { source: 'ig' } } });
  assert.equal(legacy.context.utm_source, 'ig');
  const px = readFileSync(join(ROOT, 'landing/shared/pixel.js'), 'utf8');
  assert.match(px, /'cid', 'asid', 'adid'/);
});
