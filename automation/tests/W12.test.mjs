// DRAFT for GATE-TEST-W12 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W12 Outcome, disposition & feedback (two-sided) — 4.6 W12 row, 4.12a, Schedule C/D
// Money rule protected: a no-show is only a no-show when the LEAD's side agrees. The broker's tap alone never
// creates a replacement: a lead no-show needs the lead to also stay silent on the reach-check; if the lead says
// the adviser didn't call, it is a broker no-show (no replacement, we apologise and rebook). Unmarked meetings
// become "attended" at 24 h, flagged "unconfirmed", so nothing sits in limbo.
//
// Run:  node --test automation/tests/W12.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
// Loads the real logic (automation/lib/w12.mjs) and the real workflow (automation/W12.json) for the structure checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, clone, ms, iso, MIN, H, D, template, online } from './_harness.mjs';

// ============================================================================================
// The real module (automation/lib/w12.mjs, imported by the Code nodes of automation/W12.json)
// ============================================================================================
import { readFileSync } from 'node:fs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as R from '../lib/w12.mjs';
const { OUTCOME_CHECK_AFTER_END, REACH_CHECK_AFTER_END, BROKER_NUDGE_AFTER, AUTO_ATTEND_AFTER_END, REACH_WINDOW, FIT_FOLLOWUP_AFTER, REPLACEMENT_CODES, BUTTON_TO_CODE, postCallPlan, resolveOutcome, recordDisposition, unconfirmedAlert } = R;
const WF = JSON.parse(readFileSync(new URL('../W12.json', import.meta.url), 'utf8'));
// 4.12a codes: the module's list is the fixture list (same order as broker_disposition.json).
export const CODES = FIX._meta.disposition_codes;

// ============================================================================================
// Adapters
// ============================================================================================
const endOf = (fx) => {
  const start = fx.reschedule_request?.new_slot_start ?? fx.booking_request.slot_start;
  return iso(ms(start) + broker().slot_minutes * MIN);
};
function sidesFrom(fx) {
  const bTap = fx.timeline.filter((e) => e.actor === 'broker' && e.data?.template === 'broker_outcome_check').at(-1);
  const lTap = fx.timeline.filter((e) => e.actor === 'lead' && e.data?.template === 'reach_check').at(-1);
  // clause 8.4 (ux-sprint-1): new button texts (Met them / Couldn't reach them / Moved to another time); fixtures keep the old ones
  const map = { Attended: 'attended', 'Met them': 'attended', 'No-show': 'no_show', "Couldn't reach them": 'unreachable', Rescheduled: 'rescheduled', 'Moved to another time': 'rescheduled' };
  return { brokerMark: bTap ? map[bTap.data.button] : null, reach: lTap ? (lTap.data.button.startsWith('Yes') ? 'yes' : 'no') : null };
}
const offlineSys = {
  resolve: async (fx, now, over = {}) => resolveOutcome({ slotEnd: endOf(fx), leadId: fx.lead_id, consentAds: true, ...sidesFrom(fx), ...over }, ms(now)),
};
// Online: the booking is seeded, both sides' taps are replayed as signed WhatsApp webhooks, then the virtual clock is ticked.
const onlineSys = {
  resolve: async (fx, now, over = {}) => {
    const seeded = (await online.post('/test/seed-booking', { fixture: fx, slot_end: endOf(fx) })).body;
    const s = { ...sidesFrom(fx), ...over };
    const end = ms(endOf(fx));
    if (s.brokerMark) await online.waInbound({ from: broker().adviser_whatsapp, buttonPayload: `outcome:${seeded.booking_id}:${s.brokerMark}`, now: end + 20 * MIN });
    if (s.reach) await online.waInbound({ from: seeded.mobile, buttonPayload: `reach:${seeded.booking_id}:${s.reach}`, now: end + 40 * MIN });
    await online.tick(ms(now));
    const st = await online.state(seeded.lead_id);
    return { ...st.outcome, capi: st.capi?.filter((c) => c.event_name === 'Attended') ?? [] };
  },
};
const sys = MODE === 'online' ? onlineSys : offlineSys;

// ============================================================================================
// Tests
// ============================================================================================
test(`W12 [${MODE}] post-call timing: broker T+15 after the slot ends, lead reach-check T+30, one nudge at +3 h`, () => {
  for (const id of ['L01', 'L02', 'L03', 'L04']) {
    const fx = lead(id);
    const p = postCallPlan(endOf(fx));
    assert.equal(p.outcome_check_at, fx.expected.W12.outcome_check_at, id);
    if (fx.expected.W12.reach_check_at) assert.equal(p.reach_check_at, fx.expected.W12.reach_check_at, id);
    if (fx.expected.W12.broker_nudge_at) assert.equal(p.broker_nudge_at, fx.expected.W12.broker_nudge_at, id);
  }
});

test(`W12 [${MODE}] L01: Attended + lead "Yes" -> attended, CAPI Attended, thank-you; no disposition / quality is asked (clause 8.4)`, async () => {
  const fx = lead('L01');
  const e = fx.expected.W12;
  const o = await sys.resolve(fx, '2026-10-15T11:05:00+02:00');
  assert.equal(o.outcome, e.outcome);
  assert.equal(o.auto_marked, e.auto_marked);
  assert.equal(o.unconfirmed, e.unconfirmed);
  assert.equal(o.lead_reach_check, e.lead_reach_check);
  assert.deepEqual(o.capi.map((c) => c.event_id), [e.capi_attended_event_id]);
  if (MODE === 'offline') {
    assert.equal(o.lead_message, e.lead_message);
    // clause 8.4 (ux-sprint-1): attended no longer hands over to a disposition ask (was next 'W12_disposition')
    assert.equal(o.next, null);
    // clause 8.4 (ux-sprint-1): the fixture's disposition / quality taps are no longer recorded (fit_followup, q4 retired)
    assert.throws(() => recordDisposition(o, { code: e.disposition_code, quality: e.quality_score, at: '2026-10-15T10:53:00+02:00' }), /retired: agreement clause 8\.4/);
  }
});

test(`W12 [${MODE}] L02: broker taps No-show but the lead says "No, not yet" -> a conflict for KG (R6-03), neither side's no-show automatically`, async () => {
  const fx = lead('L02');
  const o = await sys.resolve(fx, '2026-10-13T11:45:00+02:00');
  assert.equal(o.outcome, 'disputed', 'lines-r6.md s.3: broker No-show vs lead "No" is a conflict, not a broker no-show');
  assert.equal(o.capi.length, 0, 'no Attended event');
  if (MODE === 'offline') {
    assert.equal(o.lead_message, null, 'no apology, no missed_you: nothing to the lead until KG decides');
    assert.deepEqual(o.alerts, [], 'no KG urgent alert (the console conflict alert is amber)');
    assert.equal(o.next, 'console_queue');
  }
});

test('W12 L03 timing (R6-03): lead "No, not yet" waits for the broker until broker_nudge_at; each broker mark resolves without an apology', () => {
  const end = '2026-10-15T10:30:00+02:00';
  const base = { slotEnd: end, leadId: 'x', consentAds: true, reach: 'no' };
  const nudge = ms(R.postCallPlan(end).broker_nudge_at);
  assert.equal(nudge, ms(end) + 15 * MIN + 3 * H);
  const early = resolveOutcome({ ...base, brokerMark: null }, ms(end) + 31 * MIN);
  assert.equal(early.outcome, 'pending', 'the tap alone resolves nothing');
  assert.equal(early.lead_message, null); assert.deepEqual(early.alerts, []);
  assert.equal(resolveOutcome({ ...base, brokerMark: null }, nudge - 1).outcome, 'pending');
  const late = resolveOutcome({ ...base, brokerMark: null }, nudge);
  assert.equal(late.outcome, 'broker_no_show'); assert.equal(late.lead_message, 'broker_no_show_apology');
  assert.deepEqual(late.alerts, ['KG']); assert.equal(late.next, 'rebook_at_our_cost');
  const att = resolveOutcome({ ...base, brokerMark: 'attended' }, ms(end) + H);
  assert.equal(att.outcome, 'attended'); assert.equal(att.dispute_status, 'open'); assert.equal(att.lead_message, null, 'no thank-you, no apology');
  const resch = resolveOutcome({ ...base, brokerMark: 'rescheduled' }, ms(end) + H);
  assert.equal(resch.outcome, 'rescheduled'); assert.equal(resch.dispute_status, 'open'); assert.equal(resch.lead_message, null);
  assert.ok(!R.followUps(resch, { booking_id: 'b', lead_id: 'x' }, 'o1').some((f) => f.fu === 'w10' || f.fu === 'send'), 'nothing to the lead until KG decides');
  const ns = resolveOutcome({ ...base, brokerMark: 'no_show' }, ms(end) + H);
  assert.equal(ns.outcome, 'disputed'); assert.equal(ns.lead_message, null);
  const un = resolveOutcome({ ...base, brokerMark: 'attended', disposition: 'unreachable' }, ms(end) + H);
  assert.equal(un.outcome, 'attended'); assert.equal(un.dispute_status, null, 'Unreachable/wrong number -> normal W13 path'); assert.equal(un.lead_message, null);
});

test('W12 BROKER_NO_SHOW_APOLOGY comes from conversation/lines.mjs (the lib/w12 draft is gone)', async () => {
  const { LINES } = await import('../../conversation/lines.mjs');
  assert.equal(R.BROKER_NO_SHOW_APOLOGY.en, LINES.en.BROKER_NO_SHOW_APOLOGY);
  assert.equal(R.BROKER_NO_SHOW_APOLOGY.af, LINES.af.BROKER_NO_SHOW_APOLOGY);
  const m = R.brokerNoShowApology({ phone: '+27820000001', first_name: 'Lerato', language: 'en' }, { adviser_name: 'Mark Smith' });
  assert.equal(m.wa.text.body, LINES.en.BROKER_NO_SHOW_APOLOGY.replace('{first_name}', 'Lerato').replace('{adviser_first}', 'Mark'));
});

test(`W12 [${MODE}] L03: broker never marks and the lead says the adviser didn't call -> broker no-show, NOT auto-attended at 24 h`, async () => {
  const fx = lead('L03');
  const o = await sys.resolve(fx, iso(ms(endOf(fx)) + 25 * H));
  assert.equal(o.outcome, 'broker_no_show');
  assert.equal(o.auto_marked, false);
});

test(`W12 [${MODE}] L04: broker No-show + lead silent -> pending until the 2-h reach window closes, then a lead no-show`, async () => {
  const fx = lead('L04');
  const e = fx.expected.W12;
  const early = await sys.resolve(fx, '2026-10-15T16:59:00+02:00');
  assert.equal(early.outcome, 'pending', 'no no-show while the lead can still answer');
  const late = await sys.resolve(fx, '2026-10-15T17:00:00+02:00');
  assert.equal(late.outcome, e.outcome);
  assert.equal(late.lead_reach_check, e.lead_reach_check);
  if (MODE === 'offline') {
    assert.equal(late.no_show_confirmed_at, e.no_show_confirmed_at);
    assert.equal(late.lead_message, e.lead_message);
    assert.equal(late.next, 'W13');
  }
});

test(`W12 [${MODE}] nobody marks anything -> at 24 h: attended, auto_marked, unconfirmed (and CAPI Attended)`, async () => {
  const fx = clone(lead('L01'));
  fx.timeline = fx.timeline.filter((x) => !['broker_outcome_check', 'reach_check'].includes(x.data?.template));
  const before = await sys.resolve(fx, iso(ms(endOf(fx)) + 24 * H - MIN));
  assert.equal(before.outcome, 'pending');
  const after = await sys.resolve(fx, iso(ms(endOf(fx)) + 24 * H));
  assert.equal(after.outcome, 'attended');
  assert.equal(after.auto_marked, true);
  assert.equal(after.unconfirmed, true);
  assert.equal(after.capi.length, 1);
});

test(`W12 [${MODE}] sides disagree -> console queue, never an automatic replacement`, (t) => {
  if (MODE === 'online') return t.skip('dispute queue is asserted in the console E2E test');
  const base = { slotEnd: '2026-10-15T10:30:00+02:00', leadId: 'x', consentAds: true };
  const a = resolveOutcome({ ...base, brokerMark: 'no_show', reach: 'yes' }, ms('2026-10-15T12:00:00+02:00'));
  assert.equal(a.outcome, 'disputed');
  assert.equal(a.next, 'console_queue');
  const b = resolveOutcome({ ...base, brokerMark: 'attended', reach: 'no' }, ms('2026-10-15T12:00:00+02:00'));
  assert.equal(b.outcome, 'attended');
  assert.equal(b.dispute_status, 'open');
  // I-50f: CAPI Attended is held (emitted nowhere) until KG decides; the console note says so (attribution-analyst)
  assert.deepEqual(b.capi, []);
  assert.deepEqual(b.capi_held, ['Attended']);
  const fu = R.followUps(b, { booking_id: 'bk', lead_id: 'x', broker_mark: 'attended', reach: 'no' }, 'o1');
  assert.ok(!fu.some((f) => f.fu === 'capi'), 'no CAPI Attended on an Attended-vs-No conflict');
  assert.match(fu.find((f) => f.fu === 'alert').note, /CAPI Attended held until KG decides/);
  const plain = resolveOutcome({ ...base, brokerMark: 'attended', reach: 'yes' }, ms('2026-10-15T12:00:00+02:00'));
  assert.equal(plain.capi.length, 1, 'no conflict -> Attended fires as before');
});

test(`W12 [${MODE}] Rescheduled -> hands over to W10; opted-out lead gets no thank-you`, (t) => {
  if (MODE === 'online') return t.skip('W10 suite');
  const base = { slotEnd: '2026-10-15T10:30:00+02:00', leadId: 'x', consentAds: true };
  assert.equal(resolveOutcome({ ...base, brokerMark: 'rescheduled', reach: null }, ms('2026-10-15T11:00:00+02:00')).next, 'W10');
  assert.equal(resolveOutcome({ ...base, brokerMark: 'attended', reach: null, optedOut: true }, ms('2026-10-15T11:00:00+02:00')).lead_message, null);
});

test(`W12 [${MODE}] clause 8.4: broker_outcome_check has 4 buttons mapping to attended / no_show / unreachable / rescheduled`, () => {
  // clause 8.4 (ux-sprint-1): replaces the 6-button disposition mapping test (broker_disposition is retired)
  const btns = template('broker_outcome_check').components.find((c) => c.type === 'BUTTONS').buttons.map((b) => b.text);
  assert.deepEqual(btns, ['Met them', 'No-show', "Couldn't reach them", 'Moved to another time']);
  assert.ok(btns.every((b) => b.length <= 25));
  // clause 8.4 (ux-sprint-1): the body asks only whether the call happened, never how it went
  assert.doesNotMatch(template('broker_outcome_check').components.find((c) => c.type === 'BODY').text, /how did|fit|quality|anything we should know/i);
  const m = R.outcomeCheckMessage({ id: 'bk1', appointment_date: '2026-10-15T10:00:00+02:00' }, { first_name: 'Lerato', last_name: 'M' }, { adviser_name: 'Mark Smith', adviser_whatsapp: '+27600000090' });
  const payloads = m.wa.template.components.filter((c) => c.type === 'button').map((c) => c.parameters[0].payload);
  // clause 8.4 (ux-sprint-1): button order = payload order; every payload is a broker mark parseTap accepts
  assert.deepEqual(payloads, ['attended:bk1', 'no_show:bk1', 'unreachable:bk1', 'rescheduled:bk1']);
  assert.deepEqual(payloads.map((p) => R.parseTap({ payload: p }).mark), ['attended', 'no_show', 'unreachable', 'rescheduled']);
});

test(`W12 [${MODE}] clause 8.4: disposition / quality are never recorded`, () => {
  // clause 8.4 (ux-sprint-1): recordDisposition refuses every call (was: quality 1-5 checks, no disposition on a no-show)
  assert.throws(() => recordDisposition({ outcome: 'attended' }, { code: 'fit_proceeding', quality: 4, at: '2026-10-15T11:00:00+02:00' }), /retired: agreement clause 8\.4/);
  assert.throws(() => recordDisposition({ outcome: 'no_show' }, { code: 'unreachable', at: '2026-10-15T11:00:00+02:00' }), /retired/);
  // clause 8.4 (ux-sprint-1): no disposition ask, list or template is produced
  assert.equal(R.dispositionAsk(), null);
  assert.equal(R.dispositionItem({ booking_id: 'bk1' }, Date.now(), Date.now()), null);
});

test(`W12 [${MODE}] clause 8.4: "Couldn't reach them" -> outcome unreachable; no lead message, no CAPI, no W13, no W10`, async () => {
  const end = '2026-10-15T10:30:00+02:00';
  const base = { slotEnd: end, leadId: 'x', consentAds: true, brokerMark: 'unreachable' };
  const closes = ms(R.postCallPlan(end).reach_check_at) + REACH_WINDOW;
  // clause 8.4 (ux-sprint-1): like a broker No-show, it waits for the lead's reach window
  assert.equal(resolveOutcome({ ...base, reach: null }, closes - 1).outcome, 'pending');
  const silent = resolveOutcome({ ...base, reach: null }, closes);
  const agrees = resolveOutcome({ ...base, reach: 'no' }, ms(end) + H);
  for (const r of [silent, agrees]) {
    // clause 8.4 (ux-sprint-1): recorded as unreachable only, nothing else happens
    assert.equal(r.outcome, 'unreachable'); assert.equal(r.lead_message, null); assert.deepEqual(r.capi, []); assert.deepEqual(r.alerts, []); assert.equal(r.next, null);
    const fu = R.followUps(r, { booking_id: 'bk', lead_id: 'x', broker_mark: 'unreachable' }, 'o1');
    assert.deepEqual(fu.map((f) => f.fu), ['w29'], 'only the outcome_recorded fact: no send, capi, w13, w10, alert');
    const o = R.outcomeRow(r, { now: closes });
    // clause 8.4 (ux-sprint-1): appointments.status has no 'unreachable' value -> 'no_show' (never 'attended'); lead stage untouched
    assert.deepEqual([o.outcome, o.appointment_status, o.lead_stage, o.dispute_status], ['unreachable', 'no_show', null, 'none']);
  }
  // clause 8.4 (ux-sprint-1): lead says "Yes, we spoke" -> console dispute, no row (same as a broker No-show vs lead "Yes")
  const d = resolveOutcome({ ...base, reach: 'yes' }, ms(end) + H);
  assert.deepEqual([d.outcome, d.dispute_status, d.next, d.lead_message], ['disputed', 'open', 'console_queue', null]);
  assert.equal(R.outcomeRow(d, { now: ms(end) + H }), null);
  // clause 8.4 (ux-sprint-1): an unreachable mark never sends CAPI Attended, even if KG says attended
  assert.deepEqual(R.capiAttendedGate({ slotEnd: end, leadId: 'x', consentAds: true, brokerMark: 'unreachable', reach: 'yes', kgDecision: 'attended' }, ms(end) + H), { action: 'drop', reason: 'unreachable_mark' });
  // clause 8.4 (ux-sprint-1): the sweep stops asking the broker once he marked unreachable (no outcome_check / nudge)
  assert.deepEqual(R.sweepActions({ slot_end: end, sent: { outcome_check: true, reach_check: true }, brokerMark: 'unreachable' }, ms(end) + 15 * MIN + 3 * H).map((a) => [a.kind, a.r?.outcome]), [['resolve', 'unreachable']]);
  // clause 8.4 (ux-sprint-1): W07 routes the new tap to W12, not to W29
  const { routeInbound } = await import('../lib/w07.mjs');
  assert.equal(routeInbound({ from: '+27600000090', payload: 'unreachable:bk1' }, { broker_numbers: new Set(['+27600000090']), broker_status: 'live' }).route, 'W12');
});

test(`W12 [${MODE}] two unconfirmed outcomes in one cycle -> Jonathan calls the broker`, () => {
  assert.deepEqual(unconfirmedAlert([{ unconfirmed: true }]), []);
  assert.deepEqual(unconfirmedAlert([{ unconfirmed: true }, { unconfirmed: false }, { unconfirmed: true }]), ['Jonathan: call broker']);
});

// ============================================================================================
// Workflow checks: automation/W12.json runs automation/lib/w12.mjs (Code nodes executed here as n8n does)
// ============================================================================================
import { runCode, templateCounts, allWorkflows, PG_CRED } from './_n8ncode.mjs';
import { paramCounts } from '../lib/wa.mjs';
const node = (name) => WF.nodes.find((n) => n.name === name);
const BK = broker();
const mrow = (fx, over = {}) => ({ booking_id: `bkg_${fx.fixture_id}`, lead_id: fx.lead_id, brand_id: 'brand_smc', broker_id: BK.broker_id, cycle_id: 'cyc_1', appointment_date: fx.reschedule_request?.new_slot_start ?? fx.booking_request.slot_start, slot_end: endOf(fx), status: 'booked', first_name: 'Pieter', last_name: 'V', phone: '+27600000004', language: 'en', opted_out_at: null, adviser_name: BK.adviser_name, contact_person: BK.adviser_name, adviser_whatsapp: BK.adviser_whatsapp, whatsapp_number: BK.adviser_whatsapp, broker_mark: null, reach: null, sent_outcome_check: false, sent_broker_nudge: false, sent_reach_check: false, outcome_exists: false, ...over });
const sweep = async (row, now) => (await runCode(WF, 'Decide (w12.sweepItems)', { items: [row], refs: { 'Classify + validate (w12.classifyOp)': { now_iso: now } } })).map((x) => x.json);
const follow = async (item, outcomeId) => (await runCode(WF, 'Follow-ups (w12.followUps)', { items: [outcomeId ? { outcome_id: outcomeId } : item], refs: { 'Write outcome? (not pending, not disputed)': item } })).map((x) => x.json);

test('W12.json: DRAFT name, inactive, one Postgres credential, physical columns only, Code nodes require(\'lv-automation\').w12, id smc-w12', () => {
  assert.equal(WF.name, 'W12 Outcome, disposition & feedback (DRAFT pending GATE-TEST-W12)');
  assert.equal(WF.active, false);
  const pgs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres');
  assert.ok(pgs.every((n) => n.credentials.postgres.name === PG_CRED && n.credentials.postgres.id === ''));
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.code' && /\(w12\./.test(x.name))) assert.match(n.parameters.jsCode, /require\('lv-automation'\)\.w12;/, n.name);
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    for (const m of n.parameters.jsCode.matchAll(/require\('([^']+)'\)/g)) assert.equal(m[1], 'lv-automation', `${n.name}: exact allowlisted name only (I-46c), got ${m[1]}`);
    assert.doesNotMatch(n.parameters.jsCode, /REPO_DIR|await import\(|pathToFileURL|lv-automation\//, n.name);
  }
  assert.equal(Object.keys(WF)[0], 'id'); assert.equal(WF.id, 'smc-w12'); assert.equal(WF.settings.errorWorkflow, 'smc-w22');
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.executeWorkflow')) {
    const r = n.parameters.workflowId; const m = /^W(\d\d)\b/.exec(r.cachedResultName);
    assert.equal(r.mode, 'id', n.name); assert.equal(r.value, m ? `smc-w${m[1]}` : `smc-${r.cachedResultName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, n.name);
  }
  const execs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => n.parameters.workflowId.cachedResultName);
  for (const t of ['CAPI Send', 'W29 Feedback loop', 'W13 No-show & replacement', 'W10 Reschedule / cancel']) assert.ok(execs.includes(t), t);
  const ops = node('Op').parameters.rules.values.map((v) => v.outputKey);
  for (const op of ['tick', 'broker_tap', 'reach', 'auto_attended', 'voice_note', 'feedback', 'reject']) assert.ok(ops.includes(op), op);
});

test('W12.json writes: one outcome per booking (first writer, same as W11 backstop), appointments.outcome status + stage + timeline; taps last-win per CONTRACTS; never replacements', () => {
  const ins = node('Insert outcome + appointment + stage + timeline').parameters.query;
  assert.match(ins, /INSERT INTO public\.outcomes[\s\S]*ON CONFLICT \(booking_id\) DO NOTHING/);
  assert.match(ins, /UPDATE public\.appointments SET status = \$13/);
  assert.match(ins, /UPDATE public\.leads SET stage = COALESCE\(\$14, stage\)/);
  assert.match(ins, /'outcome_recorded'/);
  assert.match(ins, /esc_kind=two_unconfirmed/);
  assert.match(node('Record reach answer (w12:reach, last tap wins)').parameters.query, /'reach_check'[\s\S]*'w12:reach:' \|\| a\.id::text[\s\S]*DO UPDATE SET payload = EXCLUDED\.payload/);
  assert.match(node('Record broker mark (w12:mark, last tap wins)').parameters.query, /'w12:mark:' \|\| a\.id::text/);
  assert.ok(!JSON.stringify(WF).includes('INSERT INTO public.replacements'), 'W13 owns replacements');
  assert.match(node('Claim message (w12 key, sent once)').parameters.query, /ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING id/);
  assert.ok(WF.connections['Send WhatsApp'].main[0].some((c) => c.node === 'Touch leads.last_contact_at (lead outbound)'));
  assert.match(JSON.stringify(node('Live send?').parameters), /DRY_RUN_SENDS/);
});

test('W12.json sweep (L04): broker check at end + 15, reach check at end + 30, nudge once at + 3 h 15, lead no-show only after the 2-h reach window', async () => {
  const fx = lead('L04');
  const r0 = mrow(fx);
  assert.deepEqual(await sweep(r0, '2026-10-15T14:44:00+02:00'), []);
  const a = await sweep(r0, fx.expected.W12.outcome_check_at);
  assert.deepEqual(a.map((x) => [x.fu, x.send.to, x.send.template, x.send.key]), [['send', 'broker', 'broker_outcome_check', 'w12:outcome_check:bkg_L04']]);
  assert.deepEqual(a[0].send.wa.template.components.at(-1).parameters[0].payload, 'rescheduled:bkg_L04');
  const b = await sweep({ ...r0, sent_outcome_check: true }, fx.expected.W12.reach_check_at);
  assert.deepEqual(b.map((x) => [x.send.to, x.send.template]), [['lead', 'reach_check']]);
  const nudge = await sweep({ ...r0, sent_outcome_check: true, sent_reach_check: true }, iso(ms(endOf(fx)) + 15 * MIN + 3 * H));
  assert.deepEqual(nudge.map((x) => x.send.key), ['w12:broker_nudge:bkg_L04']);
  assert.deepEqual(await sweep({ ...r0, sent_outcome_check: true, sent_reach_check: true, sent_broker_nudge: true }, iso(ms(endOf(fx)) + 5 * H)), [], 'one nudge only');
  const marked = { ...r0, broker_mark: 'no_show', sent_outcome_check: true, sent_reach_check: true };
  assert.deepEqual(await sweep(marked, '2026-10-15T16:59:00+02:00'), [], 'pending while the lead can answer');
  const [res] = await sweep(marked, '2026-10-15T17:00:00+02:00');
  assert.equal(res.fu, 'resolve'); assert.equal(res.r.outcome, 'no_show');
  assert.deepEqual([res.o.outcome, res.o.marked_at, res.o.appointment_status, res.o.lead_stage, res.o.lead_reach_check], ['no_show', fx.expected.W12.no_show_confirmed_at, 'no_show', 'no_show', 'none']);
  const fu = await follow({ ...res, row: marked }, 'out_L04');
  const w13 = fu.find((x) => x.fu === 'w13');
  assert.deepEqual([w13.op, w13.outcome_id, w13.booking_id, w13.confirmed_at, w13.idempotency_key], ['no_show', 'out_L04', 'bkg_L04', fx.expected.W12.no_show_confirmed_at, 'w12:no_show:bkg_L04']);
  assert.ok(!fu.some((x) => x.fu === 'send'), 'missed_you is W13\'s message, not W12\'s');
  assert.ok(fu.some((x) => x.fu === 'w29' && x.event === 'outcome_recorded'), 'pulse facts / quality fed for every outcome');
});

test('W12.json L01 two-sided attended: thank-you to the lead, CAPI Attended, W29; no disposition ask after the Attended tap (clause 8.4)', async () => {
  const fx = lead('L01');
  const row = mrow(fx, { first_name: 'Lerato', last_name: 'M', phone: '+27600000001', broker_mark: 'attended', reach: 'yes', sent_outcome_check: true, sent_reach_check: true });
  const [res] = await sweep(row, '2026-10-15T11:05:00+02:00');
  assert.deepEqual([res.o.outcome, res.o.auto_marked, res.o.unconfirmed, res.o.marked_via, res.o.lead_reach_check], ['attended', false, false, 'whatsapp', 'yes']);
  const fu = await follow({ ...res, row }, 'out_L01');
  const thanks = fu.find((x) => x.fu === 'send');
  assert.deepEqual([thanks.send.to, thanks.send.template, thanks.send.wa.to], ['lead', 'attended_thanks', '+27600000001']);
  assert.equal(fu.find((x) => x.fu === 'capi').event_id, fx.expected.W12.capi_attended_event_id);
  // clause 8.4 (ux-sprint-1): the "Disposition ask" node emits nothing (was: in-window list / out-of-window broker_disposition template)
  assert.deepEqual(await runCode(WF, 'Disposition ask (w12.dispositionItem)', { items: [row], refs: { 'Classify + validate (w12.classifyOp)': { op: 'broker_tap', now_iso: '2026-10-15T10:46:00+02:00' } } }), []);
  // clause 8.4 (ux-sprint-1): a portal/console 'feedback' op asks nothing either
  assert.deepEqual(await runCode(WF, 'Disposition ask (w12.dispositionItem)', { items: [{ ...row, broker_last_inbound_at: '2026-10-10T09:00:00+02:00' }], refs: { 'Classify + validate (w12.classifyOp)': { op: 'feedback', now_iso: '2026-10-15T12:00:00+02:00' } } }), []);
  // clause 8.4 (ux-sprint-1): no generated node sends a retired template or the retired session list
  for (const t of ['broker_disposition', 'broker_quality', 'broker_fit_followup', 'Which best describes']) assert.ok(!WF.nodes.some((n) => n.type === 'n8n-nodes-base.code' && (n.parameters.jsCode || '').includes(t)), t);
});

test('W12.json L02/L03 (R6-03): broker No-show vs lead "No" -> console alert only; broker unmarked at broker_nudge_at -> apology (session) + W10 rebook at our cost + KG alert; never W13', async () => {
  const fx = lead('L02');
  const row = mrow(fx, { broker_mark: 'no_show', reach: 'no', sent_outcome_check: true, sent_reach_check: true });
  const conflict = await sweep(row, '2026-10-13T11:45:00+02:00');
  assert.ok(conflict.every((x) => !x.o), 'disputed: no outcomes row');
  const row3 = mrow(fx, { broker_mark: null, reach: 'no', sent_outcome_check: true, sent_reach_check: true, sent_broker_nudge: true });
  const nudgeAt = R.postCallPlan(row3.slot_end).broker_nudge_at;
  assert.deepEqual((await sweep(row3, iso(ms(nudgeAt) - MIN))).filter((x) => x.o), [], 'pending before broker_nudge_at');
  const [res] = (await sweep(row3, nudgeAt)).filter((x) => x.o);
  assert.equal(res.o.outcome, 'broker_no_show'); assert.equal(res.o.lead_stage, null, 'lead stage unchanged: the lead did nothing wrong');
  const fu = await follow({ ...res, row: row3 }, 'out_L03');
  assert.deepEqual(fu.map((x) => x.fu).sort(), ['alert', 'send', 'w10', 'w29']);
  assert.equal(fu.find((x) => x.fu === 'w10').schedule_d, true);
  assert.equal(fu.find((x) => x.fu === 'send').send.wa.type, 'text');
  assert.match(fu.find((x) => x.fu === 'alert').note, /^esc_kind=broker_no_show; .*no replacement/);
});

test('W12.json unmarked at 24 h: attended + auto_marked + unconfirmed (marked_via auto, flagged); disputed sides -> console alert, no row', async () => {
  const fx = lead('L01');
  const row = mrow(fx, { sent_outcome_check: true, sent_reach_check: true, sent_broker_nudge: true });
  assert.deepEqual(await sweep(row, iso(ms(endOf(fx)) + 24 * H - MIN)), []);
  const [res] = await sweep(row, iso(ms(endOf(fx)) + 24 * H));
  assert.deepEqual([res.o.outcome, res.o.auto_marked, res.o.unconfirmed, res.o.marked_via], ['attended', true, true, 'auto']);
  const [d] = await sweep({ ...row, broker_mark: 'no_show', reach: 'yes' }, iso(ms(endOf(fx)) + H));
  assert.equal(d.o, null);
  const fu = await follow({ ...d, row: { ...row, broker_mark: 'no_show', reach: 'yes' } });
  assert.deepEqual(fu.map((x) => [x.fu, x.kind]), [['alert', 'outcome_unmarked']]);
  // W11 backstop entry: the attended path only (no broker re-ask)
  const auto = (await runCode(WF, 'Auto-attended follow-ups (w12.resolveOutcome at 24 h)', { items: [{ ...row, outcome_id: 'out_auto', reach: 'none' }] })).map((x) => x.json);
  assert.deepEqual(auto.map((x) => x.fu).sort(), ['capi', 'send', 'w29']);
});

test('W12 voice note: RETIRED (clause 8.4), nothing is stored (no reference, no download, no transcript)', async () => {
  const v = (await runCode(WF, 'Voice note reference (w12.voiceNoteRef)', { json: { op: 'voice_note', msg: { media: 'audio', media_id: 'MEDIA123', from: BK.adviser_whatsapp } } })).json;
  // clause 8.4 (ux-sprint-1): no media reference is kept (was whatsapp-media:MEDIA123)
  assert.equal(v.ref, null);
  // clause 8.4 (ux-sprint-1): the store node only writes when $2 (the reference) is not null, so a null ref writes nothing
  assert.match(node('Store voice note reference (no audio, no transcript here)').parameters.query, /SET voice_note_url = \$2, updated_at = now\(\)[\s\S]*AND \$2 IS NOT NULL/);
  assert.ok(!WF.nodes.some((n) => n.type === 'n8n-nodes-base.httpRequest' && n.name !== 'Send WhatsApp'), 'no media fetch / transcription call');
  assert.equal(R.voiceNoteRef({ media: 'image', media_id: 'x' }), null);
});

test('W12 sends match the submitted templates (variable counts)', () => {
  const bk = { id: 'bk1', appointment_date: '2026-10-15T10:00:00+02:00' };
  const ld = { first_name: 'Lerato', last_name: 'M', phone: '+27600000001' };
  const br = { adviser_name: 'Mark Smith', adviser_whatsapp: '+27600000090' };
  assert.deepEqual(paramCounts(R.outcomeCheckMessage(bk, ld, br).wa), templateCounts('broker_outcome_check'));
  assert.deepEqual(paramCounts(R.reachCheckMessage(bk, ld, br).wa), templateCounts('reach_check'));
  assert.deepEqual(paramCounts(R.attendedThanksMessage(ld, br).wa), templateCounts('attended_thanks'));
  // clause 8.4 (ux-sprint-1): broker_disposition is retired (templates/retired/), so its count check is gone
  assert.deepEqual(R.CODES, CODES, '4.12a codes = fixture codes');
  // W07 routes the broker's outcome taps here and the lead's reach taps here
  assert.deepEqual(R.parseTap({ payload: 'no_show:bk1' }), { side: 'broker', mark: 'no_show', booking_id: 'bk1' });
  // clause 8.4 (ux-sprint-1): "Couldn't reach them" is a broker mark
  assert.deepEqual(R.parseTap({ payload: 'unreachable:bk1' }), { side: 'broker', mark: 'unreachable', booking_id: 'bk1' });
  assert.deepEqual(R.parseTap({ payload: 'reach_no:bk1' }), { side: 'lead', answer: 'no', booking_id: 'bk1' });
  assert.ok(allWorkflows().every(({ file, wf }) => file === 'W12.json' || !JSON.stringify(wf).includes("'w12:mark:'")), 'only W12 writes the broker mark rows');
});

test('I-50f: a broker mark after the Schedule D apology went out -> one KG conflict escalation, nothing else', async () => {
  const row = { outcome_id: 'o1', outcome: 'broker_no_show', booking_id: 'bk1', lead_id: 'ld1', brand_id: 'smc', broker_id: 'brk', mark: 'attended', first_name: 'Lerato', last_name: 'Mokoena', adviser_name: 'Mark Smith', apology_sent: true };
  const out = (await runCode(WF, 'Late mark conflict (w12.lateMarkConflict)', { items: [row, { ...row, apology_sent: false }, {}] })).map((x) => x.json);
  assert.equal(out.length, 1);
  assert.equal(out[0].fu, 'alert');
  assert.equal(out[0].kind, 'outcome_unmarked', 'same escalation kind W12 already uses for console disputes');
  assert.equal(out[0].to, 'KG');
  assert.match(out[0].note, /^esc_kind=late_broker_mark; Lerato M\.?: Mark marked attended after the Schedule D apology/);
  const q = WF.nodes.find((n) => n.name === 'Late broker mark? (apology already sent)');
  assert.match(q.parameters.query, /'w12:apology:' \|\| a\.id::text/);
  assert.deepEqual(WF.connections['Late mark conflict (w12.lateMarkConflict)'].main[0].map((c) => c.node), ['Follow-up']);
  assert.ok(WF.connections['Record broker mark (w12:mark, last tap wins)'].main[0].some((c) => c.node === 'Late broker mark? (apology already sent)'));
});

// ============================================================================================
// I-51b: CAPI Attended hold / release (attribution-analyst). Attended cannot be recalled, so the gate decides once.
// ============================================================================================
const END = '2026-10-15T10:30:00+02:00';
const GATE_BASE = { slotEnd: END, leadId: 'x', consentAds: true };
const WINDOW_CLOSES = ms(END) + 30 * MIN + 2 * H;

test('I-51b (b): Attended waits for the lead (answer or the 2.5-h window), then goes with the same event_id; never before', () => {
  const early = resolveOutcome({ ...GATE_BASE, brokerMark: 'attended', reach: null }, ms(END) + 20 * MIN);
  assert.deepEqual(early.capi, []); assert.deepEqual(early.capi_held, ['Attended']); assert.equal(early.capi_gate.reason, 'awaiting_lead');
  const park = R.followUps(early, { booking_id: 'bk', lead_id: 'x', brand_id: 'b', broker_id: 'br', slot_end: END }, 'o1').find((f) => f.fu === 'capi_hold');
  assert.deepEqual([park.booking_id, park.event_id, park.reason], ['bk', 'evt_x_attended', 'awaiting_lead']);
  const held = { booking_id: 'bk', lead_id: 'x', brand_id: 'b', broker_id: 'br', slot_end: END, event_id: 'evt_x_attended', outcome_outcome: 'attended' };
  assert.deepEqual(R.releaseHeld(held, WINDOW_CLOSES - 1), [], 'still holding one ms before the window closes');
  const [rel] = R.releaseHeld(held, WINDOW_CLOSES);
  assert.deepEqual([rel.fu, rel.decision, rel.reason], ['capi_release', 'send', 'lead_window_closed']);
  const capi = R.releaseCapi(rel);
  assert.deepEqual([capi.event_name, capi.event_id, capi.action_source, capi.event_time], ['Attended', 'evt_x_attended', 'system_generated', END]);
  const [yes] = R.releaseHeld({ ...held, reach: 'yes' }, ms(END) + 40 * MIN);
  assert.deepEqual([yes.decision, yes.reason], ['send', 'lead_confirmed']);
  // inside Meta's 7-day event window: dropped 12 h before the edge, with a reason, never sent stale
  const [stale] = R.releaseHeld({ ...held, reach: 'no' }, ms(END) + 7 * D - 11 * H);
  assert.deepEqual([stale.decision, stale.reason], ['drop', 'meta_window_expired']);
  assert.ok(R.CAPI_HOLD_MAX < 7 * D);
});

test('I-51b (a): conflict hold is released on KG "attended" (same event_id) and dropped with a reason on "not_attended"', () => {
  const held = { booking_id: 'bk', lead_id: 'x', brand_id: 'b', broker_id: 'br', slot_end: END, event_id: 'evt_x_attended', outcome_outcome: 'attended', reach: 'no', first_name: 'Lerato', last_name: 'M', adviser_name: 'Mark Smith' };
  const [alert] = R.releaseHeld(held, ms(END) + 3 * H);
  assert.equal(alert.fu, 'alert'); assert.match(alert.note, /^esc_kind=outcome_disputed;.*held until then/, 'a lead No that arrives after the outcome row still reaches KG');
  const [send] = R.releaseHeld({ ...held, kg_decision: 'attended' }, ms(END) + 3 * H);
  assert.deepEqual([send.fu, send.decision, send.reason, send.event_id], ['capi_release', 'send', 'kg_attended', 'evt_x_attended']);
  assert.equal(R.releaseCapi(send).event_id, 'evt_x_attended');
  const [drop] = R.releaseHeld({ ...held, kg_decision: 'not_attended' }, ms(END) + 3 * H);
  assert.deepEqual([drop.decision, drop.reason], ['drop', 'kg_not_attended']);
  assert.equal(R.capiAttendedGate({ ...GATE_BASE, reach: 'no', kgDecision: 'attended' }, ms(END) + H).action, 'send');
  assert.deepEqual(R.releaseHeld({ ...held, outcome_outcome: 'no_show', kg_decision: 'attended' }, ms(END) + H).map((x) => [x.decision, x.reason]), [['drop', 'outcome_not_attended']]);
  assert.equal(R.validateInput('kg_decision', { booking_id: 'bk', decision: 'attended' }).ok, true);
  assert.deepEqual(R.validateInput('kg_decision', { booking_id: 'bk', decision: 'maybe' }).missing, ['decision (attended|not_attended)']);
  assert.equal(R.classifyOp({ op: 'kg_decision' }), 'kg_decision');
});

test('I-51b (c): Attended + unreachable never sends Attended (any reach, any timing, even after KG "attended" or while held)', () => {
  for (const reach of [null, 'yes', 'no']) {
    const r = resolveOutcome({ ...GATE_BASE, brokerMark: 'attended', reach, disposition: 'unreachable' }, WINDOW_CLOSES + H);
    assert.deepEqual(r.capi, [], `reach ${reach}`); assert.equal(r.capi_dropped, 'unreachable_disposition');
    const fu = R.followUps(r, { booking_id: 'bk', lead_id: 'x', brand_id: 'b', broker_id: 'br', slot_end: END }, 'o1');
    assert.ok(!fu.some((f) => f.fu === 'capi'));
    assert.deepEqual(fu.filter((f) => f.fu === 'capi_release').map((f) => [f.decision, f.reason]), [['drop', 'unreachable_disposition']]);
  }
  // the disposition usually arrives AFTER the Attended tap: the held event is dropped on the next tick
  const held = { booking_id: 'bk', lead_id: 'x', brand_id: 'b', broker_id: 'br', slot_end: END, outcome_outcome: 'attended', disposition_code: 'unreachable', kg_decision: 'attended', reach: 'yes' };
  assert.deepEqual(R.releaseHeld(held, WINDOW_CLOSES).map((x) => [x.decision, x.reason]), [['drop', 'unreachable_disposition']]);
  assert.equal(R.capiAttendedGate({ ...GATE_BASE, reach: 'yes', disposition: 'fit_proceeding' }, ms(END) + H).action, 'send');
});

test('W12.json I-51b: kg_decision op, held-queue sweep, claim-once release, CAPI Send only on a claimed send; no DDL', async () => {
  const ops = node('Op').parameters.rules.values.map((v) => v.outputKey);
  assert.equal(ops.indexOf('reject'), 6); assert.ok(ops.includes('kg_decision'));
  const fus = node('Follow-up').parameters.rules.values.map((v) => v.outputKey);
  assert.deepEqual(fus.slice(6), ['capi_hold', 'capi_release']);
  assert.match(node('Park held CAPI Attended (w12:capi_hold)').parameters.query, /'w12:capi_hold:' \|\| \$5::text\)\s+ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.match(node('Claim CAPI release (once per booking, logs the reason)').parameters.query, /'w12:capi_release:'[\s\S]*ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING id/);
  assert.match(node('Record KG decision (w12:kg_decision, first wins)').parameters.query, /'w12:kg_decision:' \|\| a\.id::text/);
  assert.match(node('Held CAPI Attended (not yet released)').parameters.query, /NOT EXISTS[\s\S]*'w12:capi_release:'/);
  assert.match(node('Resolve the open dispute escalation').parameters.query, /UPDATE public\.escalations SET resolved_at/);
  assert.ok(WF.connections['Op'].main[7].some((c) => c.node === 'Record KG decision (w12:kg_decision, first wins)'));
  assert.ok(WF.connections['Release item (w12.releaseCapi, only when claimed + decision send)'].main[0].some((c) => c.node === 'CAPI Send (Attended)'));
  assert.doesNotMatch(JSON.stringify(WF), /CREATE TABLE|ALTER TABLE|CREATE INDEX/);
  // the code nodes run as n8n runs them
  const row = { booking_id: 'bk', lead_id: 'ld', brand_id: 'b', broker_id: 'br', slot_end: END, event_id: 'evt_ld_attended', outcome_outcome: 'attended', reach: 'no', kg_decision: 'attended' };
  const out = (await runCode(WF, 'Release held (w12.releaseHeld)', { items: [row], refs: { 'Classify + validate (w12.classifyOp)': { now_iso: '2026-10-15T14:00:00+02:00' } } })).map((x) => x.json);
  assert.deepEqual(out.map((x) => [x.fu, x.decision, x.reason]), [['capi_release', 'send', 'kg_attended']]);
  const sent = await runCode(WF, 'Release item (w12.releaseCapi, only when claimed + decision send)', { items: [{ id: 'act1' }, {}], refs: { 'Release source': out[0] } });
  assert.ok(sent.length >= 1 && sent[0].json.event_id === 'evt_ld_attended' && sent[0].json.fu === 'capi');
});

// NH-62 (Jonathan, 2026-10-03): KG "not_attended" -> outcome no_show, replacement-eligible via W13's no_show op, cap per cycle.
import * as W13 from '../lib/w13.mjs';
import { pricing, cycle } from './_harness.mjs';

test('NH-62: KG not_attended flips the outcome to no_show, audits it, calls W13 no_show; KG attended changes nothing; first decision wins', async () => {
  const q = node('Apply KG not_attended (outcome -> no_show, audit activity)').parameters.query;
  assert.match(q, /payload->>'decision' = 'not_attended'/, 'guarded by the recorded (first) decision');
  assert.match(q, /UPDATE public\.outcomes SET outcome = 'no_show'[\s\S]*outcome = 'attended' AND EXISTS \(SELECT 1 FROM k\)/);
  assert.match(q, /'outcome_kg_not_attended'[\s\S]*'w12:kg_not_attended:' \|\| o\.booking_id::text[\s\S]*ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.doesNotMatch(q, /verified|delivered|capi/i, 'delivered/verified count untouched');
  assert.doesNotMatch(JSON.stringify(WF), /CREATE TABLE|ALTER TABLE|CREATE INDEX/);
  const c = (n) => WF.connections[n].main[0].map((x) => x.node);
  assert.ok(c('Resolve the open dispute escalation').includes('Apply KG not_attended (outcome -> no_show, audit activity)'));
  assert.deepEqual(c('Apply KG not_attended (outcome -> no_show, audit activity)'), ['KG no-show -> W13 payload (w12.w13NoShow)']);
  assert.deepEqual(c('KG no-show -> W13 payload (w12.w13NoShow)'), ['W13 no_show (KG not_attended: replacement path, cap in W13)']);
  // the payload is the one a lead no-show sends, and W13 accepts it as a no_show
  const p = (await runCode(WF, 'KG no-show -> W13 payload (w12.w13NoShow)', { json: { outcome_id: 'o1', booking_id: 'bk', lead_id: 'ld', confirmed_at: '2026-10-15T15:00:00+02:00' } })).json;
  assert.deepEqual(p, R.w13NoShow('o1', { id: 'bk' }, 'ld', '2026-10-15T15:00:00+02:00'));
  const n = W13.normaliseInput(p); assert.equal(n.op, 'no_show'); assert.equal(W13.validateInput(n).ok, true);
  // the held CAPI Attended is dropped (reason kg_not_attended) even though the outcome row is already no_show
  const held = { booking_id: 'bk', lead_id: 'ld', brand_id: 'b', broker_id: 'br', slot_end: END, outcome_outcome: 'no_show', kg_decision: 'not_attended' };
  assert.deepEqual(R.releaseHeld(held, ms(END) + H).map((x) => [x.fu, x.decision, x.reason]), [['capi_release', 'drop', 'kg_not_attended']]);
  // KG attended: outcome stays attended, Attended is released
  assert.deepEqual(R.releaseHeld({ ...held, outcome_outcome: 'attended', kg_decision: 'attended' }, ms(END) + H).map((x) => [x.decision, x.reason]), [['send', 'kg_attended']]);
});

for (const tier of ['SMC_BRONZE', 'SMC_SILVER', 'SMC_GOLD']) {
  test(`NH-62 [${tier}]: KG-ruled no-shows claim replacements through W13 up to the cycle cap; the next is cap_reached`, () => {
    const cap = pricing(tier).replacement_cap_cycle;
    const cyc = { ...clone(cycle()), cycle_id: `cyc_${tier}`, tier_code: tier, replacement_cap: cap };
    const rows = [];
    const kgTrig = (i) => W13.replacementTrigger({ kind: 'no_show', confirmed_at: iso(ms('2026-10-15T15:00:00+02:00') + i * H), second_no_show: true });
    for (let i = 0; i < cap; i++) assert.equal(W13.claim(cyc, rows, `kg_lead_${i}`, kgTrig(i)).row.status, 'due', `#${i + 1}`);
    const over = W13.claim(cyc, rows, 'kg_lead_over', kgTrig(cap));
    assert.deepEqual([over.row.status, over.row.note], ['rejected', 'cap_reached']);
    assert.deepEqual(over.alerts, ['Jonathan: replacement cap reached']);
  });
}
