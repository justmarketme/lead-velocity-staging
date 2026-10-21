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
  const map = { Attended: 'attended', 'No-show': 'no_show', Rescheduled: 'rescheduled' };
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

test(`W12 [${MODE}] L01: Attended + lead "Yes" -> attended, CAPI Attended, thank-you; fit_followup q4 -> broker nudge in 7 d`, async () => {
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
    const tapD = fx.timeline.find((x) => x.data?.template === 'broker_disposition');
    const tapQ = fx.timeline.find((x) => x.data?.template === 'broker_quality');
    const d = recordDisposition(o, { code: tapD.data.payload, quality: Number(tapQ.data.payload), at: tapD.at });
    assert.equal(d.disposition_code, e.disposition_code);
    assert.equal(d.quality_score, e.quality_score);
    assert.equal(d.broker_fit_followup_at, e.broker_fit_followup_at);
    assert.equal(d.replacement_eligible, false);
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

test(`W12 [${MODE}] disposition buttons map 1:1 onto the six 4.12a codes; only unreachable + nofit_criteria open a replacement`, () => {
  const btns = template('broker_disposition').components.find((c) => c.type === 'BUTTONS').buttons.map((b) => b.text);
  assert.deepEqual(btns.map((b) => BUTTON_TO_CODE[b]), CODES);
  const att = { outcome: 'attended' };
  const eligible = CODES.filter((c) => recordDisposition(att, { code: c, at: '2026-10-15T11:00:00+02:00' }).replacement_eligible);
  assert.deepEqual(eligible.sort(), ['nofit_criteria', 'unreachable']);
  assert.ok(CODES.every((c) => recordDisposition(att, { code: c, at: '2026-10-15T11:00:00+02:00' }).counts_as_delivered));
});

test(`W12 [${MODE}] quality must be 1-5; no disposition on a no-show`, () => {
  const att = { outcome: 'attended' };
  for (const q of [0, 6, 2.5]) assert.throws(() => recordDisposition(att, { code: 'fit_proceeding', quality: q, at: '2026-10-15T11:00:00+02:00' }));
  assert.throws(() => recordDisposition({ outcome: 'no_show' }, { code: 'unreachable', at: '2026-10-15T11:00:00+02:00' }));
});

test(`W12 [${MODE}] two unconfirmed outcomes for one broker within 30 days -> Jonathan calls the broker`, () => {
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
const mrow = (fx, over = {}) => ({ booking_id: `bkg_${fx.fixture_id}`, lead_id: fx.lead_id, brand_id: 'brand_smc', broker_id: BK.broker_id, appointment_date: fx.reschedule_request?.new_slot_start ?? fx.booking_request.slot_start, slot_end: endOf(fx), status: 'booked', first_name: 'Pieter', last_name: 'V', phone: '+27600000004', language: 'en', opted_out_at: null, adviser_name: BK.adviser_name, contact_person: BK.adviser_name, adviser_whatsapp: BK.adviser_whatsapp, whatsapp_number: BK.adviser_whatsapp, broker_mark: null, reach: null, sent_outcome_check: false, sent_broker_nudge: false, sent_reach_check: false, outcome_exists: false, ...over });
const sweep = async (row, now) => (await runCode(WF, 'Decide (w12.sweepItems)', { items: [row], refs: { 'Classify + validate (w12.classifyOp)': { now_iso: now } } })).map((x) => x.json);
// Follow-up claim chain (19 Oct 2026): Claim source (adds the query params) -> Claim W12 follow-ups (a row = claim won)
// -> Claimed follow-ups. won=false runs the last node as n8n does when the claim insert returned nothing.
const claimed = async (claimItem, won = true) => {
  const src = (await runCode(WF, 'Claim source', { json: claimItem })).json;
  return (await runCode(WF, 'Claimed follow-ups (w12.claimedFollowUps)', { items: [won ? { id: 'act_claim' } : {}], refs: { 'Claim source': src } })).map((x) => x.json);
};
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
  assert.match(ins, /UPDATE public\.appointments SET status = \$12/);
  assert.match(ins, /UPDATE public\.leads SET stage = COALESCE\(\$13, stage\)/);
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

test('W12.json L01 two-sided attended: thank-you to the lead, CAPI Attended, W29; Attended tap asks the disposition at once (4.12a list, in window)', async () => {
  const fx = lead('L01');
  const row = mrow(fx, { first_name: 'Lerato', last_name: 'M', phone: '+27600000001', broker_mark: 'attended', reach: 'yes', sent_outcome_check: true, sent_reach_check: true });
  const [res] = await sweep(row, '2026-10-15T11:05:00+02:00');
  assert.deepEqual([res.o.outcome, res.o.auto_marked, res.o.unconfirmed, res.o.marked_via, res.o.lead_reach_check], ['attended', false, false, 'whatsapp', 'yes']);
  const fu = await follow({ ...res, row }, 'out_L01');
  const thanks = fu.find((x) => x.fu === 'send');
  assert.deepEqual([thanks.send.to, thanks.send.template, thanks.send.wa.to], ['lead', 'attended_thanks', '+27600000001']);
  assert.equal(fu.find((x) => x.fu === 'capi').event_id, fx.expected.W12.capi_attended_event_id);
  const ask = (await runCode(WF, 'Disposition ask (w12.dispositionItem)', { items: [row], refs: { 'Classify + validate (w12.classifyOp)': { op: 'broker_tap', now_iso: '2026-10-15T10:46:00+02:00' } } }))[0].json;
  assert.equal(ask.send.to, 'broker'); assert.equal(ask.send.wa.type, 'interactive'); assert.equal(ask.send.wa.to, BK.adviser_whatsapp);
  const session = JSON.parse(readFileSync(new URL('../templates/session/broker_disposition_list.json', import.meta.url), 'utf8'));
  assert.deepEqual(ask.send.wa.interactive.action.sections, session.interactive.action.sections, 'same rows/ids as the session file (4.12a codes)');
  assert.equal(ask.send.wa.interactive.body.text, 'Thanks. Which best describes Lerato M. after the call? Pick the closest one.');
  const late = (await runCode(WF, 'Disposition ask (w12.dispositionItem)', { items: [{ ...row, broker_last_inbound_at: '2026-10-10T09:00:00+02:00' }], refs: { 'Classify + validate (w12.classifyOp)': { op: 'feedback', now_iso: '2026-10-15T12:00:00+02:00' } } }))[0].json;
  assert.equal(late.send.template, 'broker_disposition', 'out of window: the 6-button template');
  assert.deepEqual(await runCode(WF, 'Disposition ask (w12.dispositionItem)', { items: [{ ...row, already_dispositioned: true }], refs: { 'Classify + validate (w12.classifyOp)': { op: 'broker_tap', now_iso: '2026-10-15T10:46:00+02:00' } } }), []);
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
  // W11 backstop entry: the attended path only (no broker re-ask), behind the w12:outcome claim (19 Oct 2026)
  const [c] = (await runCode(WF, 'Auto-attended resolution (w12.autoAttendedResolution)', { items: [{ ...row, outcome_id: 'out_auto', reach: 'none' }] })).map((x) => x.json);
  assert.deepEqual([c.fu, c.via, c.outcome_id, c.appointment_status, c.lead_stage, c.dispute_open], ['claim', 'auto', 'out_auto', null, null, false], 'W11 already wrote status and stage');
  const auto = await claimed(c);
  assert.deepEqual(auto.map((x) => x.fu).sort(), ['capi', 'send', 'w29']);
  assert.deepEqual(await claimed(c, false), [], 'claim lost (W12 or the portal path ran first): nothing');
});

test('W12 voice note: only the WhatsApp media reference is stored (no download, no transcript in W12)', async () => {
  const v = (await runCode(WF, 'Voice note reference (w12.voiceNoteRef)', { json: { op: 'voice_note', msg: { media: 'audio', media_id: 'MEDIA123', from: BK.adviser_whatsapp } } })).json;
  assert.deepEqual(v.ref, { voice_note_url: 'whatsapp-media:MEDIA123', media_id: 'MEDIA123' });
  assert.match(node('Store voice note reference (no audio, no transcript here)').parameters.query, /SET voice_note_url = \$2, updated_at = now\(\)/);
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
  assert.deepEqual(paramCounts(R.dispositionTemplateMessage(bk, ld, br).wa), templateCounts('broker_disposition'));
  assert.deepEqual(R.CODES, CODES, '4.12a codes = fixture codes');
  // W07 routes the broker's outcome taps here and the lead's reach taps here
  assert.deepEqual(R.parseTap({ payload: 'no_show:bk1' }), { side: 'broker', mark: 'no_show', booking_id: 'bk1' });
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
  assert.deepEqual(fus.slice(6), ['capi_hold', 'capi_release', 'send_skipped']);
  assert.match(node('Park held CAPI Attended (w12:capi_hold)').parameters.query, /'w12:capi_hold:' \|\| \$4::text\)\s+ON CONFLICT \(idempotency_key\) DO NOTHING/);
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

// NH-62 (Jonathan, 2026-10-03): KG "not_attended" -> outcome no_show, replacement-eligible via W13's no_show op (goodwill,
// max 3 requests per broker per Calendar Week; crm-nurture 2026-10-11: no cycles, no per-plan cap).
import * as W13 from '../lib/w13.mjs';

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

test('NH-62: KG-ruled no-shows claim goodwill replacements through W13, at most 3 per broker per Calendar Week; the 4th is refused (nothing written)', () => {
  const ctx = { broker_id: BK.broker_id, lead_order_id: 'lo_test_001' };
  const rows = [];
  const kgTrig = (i) => W13.replacementTrigger({ kind: 'no_show', confirmed_at: iso(ms('2026-10-15T15:00:00+02:00') + i * H), second_no_show: true });
  for (let i = 0; i < W13.WEEKLY_MAX; i++) assert.equal(W13.claim(ctx, rows, `kg_lead_${i}`, kgTrig(i)).row.status, 'due', `#${i + 1}`);
  const over = W13.claim(ctx, rows, 'kg_lead_over', kgTrig(W13.WEEKLY_MAX));
  assert.deepEqual([over.row, over.refused], [null, 'weekly_max']);
  assert.deepEqual(over.alerts, ['Jonathan: weekly replacement maximum reached']);
  assert.equal(rows.length, 3);
});

// ============================================================================================
// CAPI quality events (19 Oct 2026): Qualified + GoodFit from the 5-min tick (w12.qualityEventItems)
// ============================================================================================
test('CAPI quality: Qualified = tier A/B band (W01 QUAL_BUDGET), GoodFit = the two good-fit codes (W29 GOOD_FIT); deterministic event ids', async () => {
  const { QUAL_BUDGET } = await import('../lib/w01.mjs');
  const { GOOD_FIT } = await import('../lib/w29.mjs');
  assert.deepEqual(R.CAPI_QUALIFIED_BANDS, [...QUAL_BUDGET]);
  assert.ok(!R.CAPI_QUALIFIED_BANDS.includes('lt750'), 'tier C (under R750) is never Qualified for Meta');
  assert.deepEqual(R.CAPI_GOOD_FIT_CODES, [...GOOD_FIT]); assert.deepEqual(R.CAPI_GOOD_FIT_CODES, ['fit_proceeding', 'fit_followup']);
  assert.equal(R.capiQualified({ lead_id: 'L1', brand_id: 'B' }).event_id, 'evt_L1_qualified');
  assert.equal(R.capiGoodFit({ lead_id: 'L1', brand_id: 'B' }).event_id, 'evt_L1_goodfit');
});

test('CAPI quality: CTWA Qualified sends the click reference only; offline otherwise; GoodFit always offline (as Attended), value = rating', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const rows = [
    { event_name: 'Qualified', lead_id: 'Lc', brand_id: 'B', ctwa_clid: 'CLID', event_time: '2026-10-19T10:00:00Z' },
    { event_name: 'Qualified', lead_id: 'Lw', brand_id: 'B', ctwa_clid: null, event_time: '2026-10-19T10:00:00Z' },
    { event_name: 'GoodFit', lead_id: 'Lg', brand_id: 'B', ctwa_clid: 'CLID', event_time: '2026-10-19T09:00:00Z', quality_score: 4 },
  ];
  assert.deepEqual(R.qualityEventItems(rows, now), [
    { fu: 'capi', event_name: 'Qualified', event_id: 'evt_Lc_qualified', action_source: 'business_messaging', ctwa_clid: 'CLID', lead_id: 'Lc', brand_id: 'B', event_time: '2026-10-19T10:00:00Z' },
    { fu: 'capi', event_name: 'Qualified', event_id: 'evt_Lw_qualified', action_source: 'system_generated', lead_id: 'Lw', brand_id: 'B', event_time: '2026-10-19T10:00:00Z' },
    { fu: 'capi', event_name: 'GoodFit', event_id: 'evt_Lg_goodfit', action_source: 'system_generated', lead_id: 'Lg', brand_id: 'B', value: 4, event_time: '2026-10-19T09:00:00Z' },
  ]);
});

test('CAPI quality: an unrated GoodFit waits 2 h for the WhatsApp rating, then goes without a value; stale (Meta 7-day edge) and future events never go', () => {
  const marked = Date.parse('2026-10-19T10:00:00Z');
  const g = { event_name: 'GoodFit', lead_id: 'L1', brand_id: 'B', event_time: new Date(marked).toISOString(), quality_score: null };
  assert.deepEqual(R.qualityEventItems([g], marked + R.GOODFIT_VALUE_WAIT - 1), []);
  const late = R.qualityEventItems([g], marked + R.GOODFIT_VALUE_WAIT);
  assert.equal(late.length, 1); assert.equal('value' in late[0], false);
  assert.equal(R.qualityEventItems([{ ...g, quality_score: '5' }], marked + 60_000)[0].value, 5, 'a rated one goes at once (pg smallint may arrive as text)');
  const q = { event_name: 'Qualified', lead_id: 'L2', brand_id: 'B', event_time: new Date(marked).toISOString() };
  assert.deepEqual(R.qualityEventItems([q], marked + R.CAPI_HOLD_MAX), [], 'at the hold edge: dropped (Meta rejects > 7 days)');
  assert.deepEqual(R.qualityEventItems([q], marked - 1), [], 'future (test clock) not sent');
  assert.deepEqual(R.qualityEventItems([{ ...q, event_name: 'Attended' }, { ...q, lead_id: null }], marked + 1), [], 'other names / no lead: nothing');
});

test('W12.json: the tick feeds Qualified + GoodFit to CAPI Send through the Follow-up switch; SQL dedupes on capi_log and pre-filters consent', async () => {
  const to = (from, out = 0) => ((WF.connections[from] || {}).main || [])[out]?.map((x) => x.node) || [];
  const Q = 'Quality events due (Qualified + GoodFit, not in capi_log)';
  const C = 'Quality events (w12.qualityEventItems)';
  assert.ok(to('Op', 0).includes(Q), 'tick output only');
  for (let i = 1; i < 8; i++) assert.ok(!to('Op', i).includes(Q), `op output ${i} does not run the sweep`);
  assert.deepEqual(to(Q), [C]); assert.deepEqual(to(C), ['Follow-up']);
  const capiSub = WF.nodes.find((n) => n.name === to('Follow-up', 1)[0]);
  assert.equal(capiSub.type, 'n8n-nodes-base.executeWorkflow'); assert.equal(capiSub.parameters.workflowId.value, 'smc-capi-send');
  const sql = WF.nodes.find((n) => n.name === Q).parameters.query;
  assert.match(sql, /g\.event_id = 'evt_' \|\| l\.id::text \|\| '_qualified' AND g\.event_name = 'Qualified'/);
  assert.match(sql, /g\.event_id = 'evt_' \|\| o\.lead_id::text \|\| '_goodfit' AND g\.event_name = 'GoodFit'/);
  assert.match(sql, /\(l\.ctwa_clid IS NOT NULL OR l\.consent_ads_at IS NOT NULL\)/);
  assert.match(sql, /l\.opted_out_at IS NULL AND l\.consent_ads_at IS NOT NULL/);
  assert.match(sql, /o\.outcome = 'attended' AND o\.dispute_status <> 'open'/);
  assert.match(sql, new RegExp(`interval '${R.QUALITY_SWEEP_LOOKBACK_H} hours'`));
  for (const b of R.CAPI_QUALIFIED_BANDS) assert.ok(sql.includes(`'${b}'`), b);
  assert.ok(!sql.includes("'lt750'"));
  // /start/ v4 (Jono, 19 Oct FINAL): no budget band -> income R15k+ AND age 35-50 (lib/w39.mjs isQualifiedV4); proven on the real schema in start-page.local.test.mjs
  const W39L = await import('../lib/w39.mjs');
  const page = sql.slice(sql.indexOf('l.budget_band IS NULL AND'), sql.indexOf('AND l.opted_out_at'));
  for (const x of [...W39L.QUALIFIED_AGE, ...W39L.QUALIFIED_INCOME]) assert.ok(page.includes(`'${x}'`), x);
  for (const x of ['lt35', '51plus', 'lt15k', 'lt20k', 'prefer_not']) assert.ok(!page.includes(`'${x}'`), `${x} never Qualified`);
  assert.deepEqual(checkSql(workflowSql({ nodes: WF.nodes.filter((n) => n.name === Q) })), [], 'physical columns only');
  // the real Code node -> items CAPI Send accepts as valid input
  const { normalise } = await import('../lib/sub-capi-send.mjs');
  const items = (await runCode(WF, C, { items: [
    { event_name: 'Qualified', lead_id: 'Lc', brand_id: 'B', ctwa_clid: 'CLID', event_time: '2026-10-19T10:00:00Z', quality_score: null },
    { event_name: 'GoodFit', lead_id: 'Lg', brand_id: 'B', ctwa_clid: null, event_time: '2026-10-19T09:00:00Z', quality_score: 5 },
  ], refs: { 'Classify + validate (w12.classifyOp)': { now_iso: '2026-10-19T12:00:00Z' } } })).map((x) => x.json);
  assert.deepEqual(items.map((x) => [x.fu, x.event_name, x.action_source]), [['capi', 'Qualified', 'business_messaging'], ['capi', 'GoodFit', 'system_generated']]);
  for (const x of items) assert.equal(normalise(x).valid, true, `${x.event_name}: ${normalise(x).missing}`);
});

// ============================================================================================
// 19 Oct 2026 live gate-test (booking cf9069c2): a broker row with no WhatsApp number crashed "Store outbound" (NULL
// recipient_contact, execution 4760, the whole tick lost); a failed send stored failed_reason NULL although
// smc-whatsapp-send knew the cause (twilio_content_sid_missing, execution 4795).
// ============================================================================================
import { evalParam } from './_n8ncode.mjs';
const noNumber = { adviser_whatsapp: null, whatsapp_number: null };

test('W12 broker with no WhatsApp number: outcome check, nudge and disposition ask are skipped with a reason (claimed), one console alert; never a send', async () => {
  const fx = lead('L04');
  const r0 = mrow(fx, noNumber);
  const [a] = await sweep(r0, fx.expected.W12.outcome_check_at);
  assert.equal(a.fu, 'send_skipped'); assert.equal(a.send, undefined, 'no send item, so nothing reaches Store outbound');
  assert.deepEqual([a.skip.to, a.skip.template, a.skip.reason, a.skip.key, a.skip.booking_id], ['broker', 'broker_outcome_check', 'no_broker_whatsapp', 'w12:outcome_check:bkg_L04', 'bkg_L04'], 'claims the same key as a send (the sweep moves on)');
  assert.equal(a.alert.fu, 'alert'); assert.equal(a.alert.kind, 'other'); assert.match(a.alert.note, /^esc_kind=broker_no_whatsapp; Pieter V\.: /);
  const [n] = await sweep({ ...r0, sent_outcome_check: true, sent_reach_check: true }, iso(ms(endOf(fx)) + 15 * MIN + 3 * H));
  assert.deepEqual([n.fu, n.skip.key], ['send_skipped', 'w12:broker_nudge:bkg_L04']);
  // the lead side is unaffected
  const [l] = await sweep({ ...r0, sent_outcome_check: true }, fx.expected.W12.reach_check_at);
  assert.deepEqual([l.fu, l.send.template, l.send.wa.to], ['send', 'reach_check', '+27600000004']);
  // disposition ask (portal feedback op, out of window) with no number
  const [d] = (await runCode(WF, 'Disposition ask (w12.dispositionItem)', { items: [{ ...r0, broker_last_inbound_at: null }], refs: { 'Classify + validate (w12.classifyOp)': { op: 'feedback', now_iso: '2026-10-15T12:00:00+02:00' } } })).map((x) => x.json);
  assert.deepEqual([d.fu, d.skip.template, d.skip.key], ['send_skipped', 'broker_disposition', 'w12:disposition_ask:bkg_L04:tpl']);
  // a bare '+' is not a number either
  assert.equal(R.sweepItems({ ...r0, adviser_whatsapp: '+', whatsapp_number: null }, ms(fx.expected.W12.outcome_check_at))[0].fu, 'send_skipped');
});

test('W12 lead with no phone: the thank-you is skipped under send_skipped:{key} (never looks sent), no escalation', () => {
  const fx = lead('L01');
  const row = mrow(fx, { phone: null, broker_mark: 'attended', reach: 'yes' });
  const sk = R.followUps({ outcome: 'attended', lead_message: 'attended_thanks', capi: [] }, row, 'o1').find((x) => x.fu === 'send_skipped');
  assert.deepEqual([sk.skip.to, sk.skip.reason, sk.skip.key], ['lead', 'no_lead_phone', 'send_skipped:w12:attended_thanks:bkg_L01']);
  assert.equal(sk.alert, undefined);
  const ap = R.followUps({ outcome: 'broker_no_show', lead_message: 'broker_no_show_apology', alerts: [] }, row, 'o2').find((x) => x.fu === 'send_skipped');
  assert.equal(ap.skip.key, 'send_skipped:w12:apology:bkg_L01', 'w12:apology:{id} stays unwritten: the late-mark check reads it as "apology sent"');
});

test('W12.json wiring: send_skipped from the sweep, the disposition ask and the follow-ups is logged (claims the key) and alerts once; Escalate dedupes per esc_kind', async () => {
  const to = (from, out = 0) => ((WF.connections[from] || {}).main || [])[out]?.map((x) => x.node) || [];
  const S = 'Skipped send item (no recipient)';
  const LOG = 'Log skipped send (no recipient; claims the key)';
  const ALERT = 'Skip alert (first skip of a broker message only)';
  const keysOf = (name) => node(name).parameters.rules.values.map((v) => v.outputKey);
  assert.equal(keysOf('Sweep item').indexOf('send_skipped'), 2); assert.ok(to('Sweep item', 2).includes(S));
  assert.equal(keysOf('Follow-up').indexOf('send_skipped'), 8); assert.ok(to('Follow-up', 8).includes(S));
  assert.deepEqual(to('Disposition ask (w12.dispositionItem)'), ['Sweep item'], 'the ask goes through the same send / skip switch');
  assert.deepEqual(to(S), [LOG]);
  assert.match(node(LOG).parameters.query, /'send_skipped'[\s\S]*ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING id/);
  assert.deepEqual(to(LOG), [ALERT]);
  assert.deepEqual(to(ALERT), ['Escalate (KG broker no-show / console dispute)']);
  const fx = lead('L04');
  const [a] = await sweep(mrow(fx, noNumber), fx.expected.W12.outcome_check_at);
  assert.deepEqual(evalParam(WF, LOG, 'options.queryReplacement', { json: a }),
    [a.skip.lead_id, 'brand_smc', BK.broker_id, 'broker_outcome_check', 'broker', 'no_broker_whatsapp', 'bkg_L04', 'w12:outcome_check:bkg_L04']);
  const alerts = (await runCode(WF, ALERT, { items: [{ id: 'act1' }], refs: { [S]: a } })).map((x) => x.json);
  assert.deepEqual(alerts.map((x) => x.kind), ['other']);
  assert.deepEqual(await runCode(WF, ALERT, { items: [{}], refs: { [S]: a } }), [], 'already logged: no second alert');
  assert.match(node('Escalate (KG broker no-show / console dispute)').parameters.query, /split_part\(COALESCE\(e\.note, ''\), ';', 1\) = split_part\(COALESCE\(\$7, ''\), ';', 1\)/);
  assert.deepEqual(checkSql(workflowSql({ nodes: WF.nodes.filter((n) => [LOG, 'Escalate (KG broker no-show / console dispute)'].includes(n.name)) })), []);
});

test('W12.json Store outbound records the sender reason in failed_reason (twilio_content_sid_missing), never a NULL recipient', () => {
  const send = { to: 'lead', wa: { to: '+27600000001', type: 'template' }, lead_id: 'L', brand_id: 'B', broker_id: 'R', template: 'reach_check', key: 'w12:reach_check:bk' };
  const P = 'options.queryReplacement';
  const q = node('Store outbound').parameters.query;
  assert.match(q, /failed_reason/); assert.match(q, /COALESCE\(NULLIF\(\$3, ''\), 'unknown'\)/);
  const at = (json, env = { DRY_RUN_SENDS: 'false' }) => evalParam(WF, 'Store outbound', P, { json, env, refs: { 'Live send?': { send } } });
  const failed = at({ ok: false, external_id: null, error: 'twilio_content_sid_missing' });
  assert.deepEqual([failed[4], failed[5], failed[11]], ['failed', 'failed:w12:reach_check:bk', 'twilio_content_sid_missing']);
  const ok = at({ ok: true, messages: [{ id: 'SM1' }] });
  assert.deepEqual([ok[4], ok[5], ok[11]], ['sent', 'SM1', '']);
  assert.equal(at({ error: { message: '(#131047) Re-engagement message' } })[11], '(#131047) Re-engagement message');
  const dry = at({ send }, { DRY_RUN_SENDS: 'true' });
  assert.deepEqual([dry[4], dry[11]], ['sent', '']);
  const logged = JSON.parse(evalParam(WF, 'Log send failed (once; W22 reads it)', P, { json: { ok: false, error: 'twilio_content_sid_missing' }, refs: { 'Live send?': { send } } })[3]);
  assert.equal(logged.error, 'twilio_content_sid_missing', 'the string error from smc-whatsapp-send, not "no wamid"');
  assert.deepEqual(checkSql(workflowSql({ nodes: [node('Store outbound')] })), []);
});

// ============================================================================================
// Portal-marked outcomes (19 Oct 2026): the broker portal (src/pages/portal/Leads.tsx MarkOne.save) writes outcomes
// directly. The tick resolves those rows with the same two-sided rules and runs the follow-ups once, behind the
// w12:outcome:{bk} claim the sweep's own insert writes (so a WhatsApp-resolved booking is never followed up twice).
// ============================================================================================
const PEND = '2026-10-15T10:30:00+02:00';
const prow = (over = {}) => ({ outcome_id: 'out_p', outcome: 'attended', disposition_code: 'fit_proceeding', booking_id: 'bkg_p', lead_id: 'lead_p', brand_id: 'brand_smc', broker_id: BK.broker_id,
  appointment_date: '2026-10-15T10:00:00+02:00', slot_end: PEND, first_name: 'Thandi', last_name: 'N', phone: '+27600000009', language: 'en', opted_out_at: null,
  adviser_name: BK.adviser_name, contact_person: BK.adviser_name, adviser_whatsapp: BK.adviser_whatsapp, whatsapp_number: BK.adviser_whatsapp, reach: null, ...over });
const pat = (min) => ms(PEND) + min * MIN;
const fus = (c) => R.claimedFollowUps(c);
const kinds = (c) => fus(c).map((x) => x.fu).sort();

test('Portal attended: thank-you + W29 at once; CAPI Attended goes through the I-51b gate (held until the lead answered or her window closed)', () => {
  const c = R.portalResolution(prow(), pat(10));
  assert.deepEqual([c.fu, c.via, c.outcome_id, c.r.outcome, c.dispute_open, c.appointment_status, c.lead_stage], ['claim', 'portal', 'out_p', 'attended', false, 'attended', 'dispositioned']);
  assert.deepEqual(kinds(c), ['capi_hold', 'send', 'w29']);
  const thanks = fus(c).find((x) => x.fu === 'send');
  assert.deepEqual([thanks.send.to, thanks.send.template, thanks.send.wa.to, thanks.send.key], ['lead', 'attended_thanks', '+27600000009', 'w12:attended_thanks:bkg_p']);
  assert.equal(fus(c).find((x) => x.fu === 'capi_hold').reason, 'awaiting_lead');
  assert.equal(fus(c).find((x) => x.fu === 'w29').outcome_id, 'out_p');
  // lead said yes -> Attended now, same event id as the WhatsApp path
  const yes = fus(R.portalResolution(prow({ reach: 'yes' }), pat(40))).find((x) => x.fu === 'capi');
  assert.deepEqual([yes.event_name, yes.event_id, yes.action_source, yes.event_time], ['Attended', 'evt_lead_p_attended', 'system_generated', PEND]);
  // no disposition on the row yet -> stage attended (W29 moves it on)
  assert.equal(R.portalResolution(prow({ disposition_code: null }), pat(10)).lead_stage, 'attended');
  // unreachable disposition -> Attended dropped with its reason (I-51b c)
  const un = fus(R.portalResolution(prow({ disposition_code: 'unreachable', reach: 'yes' }), pat(40))).find((x) => x.fu === 'capi_release');
  assert.deepEqual([un.decision, un.reason], ['drop', 'unreachable_disposition']);
  // opted-out lead: no thank-you
  assert.ok(!kinds(R.portalResolution(prow({ opted_out_at: '2026-10-15T09:00:00+02:00' }), pat(10))).includes('send'));
});

test('Portal no-show: waits for the lead reach window (end + 30 min + 2 h), then W13 no_show (missed_you + 48-h clock); never a W12 send', () => {
  const row = prow({ outcome: 'no_show', disposition_code: null });
  const confirm = 30 + 120;
  assert.equal(R.portalResolution(row, pat(confirm) - 1), null, 'pending: the next tick looks again (no claim)');
  const c = R.portalResolution(row, pat(confirm));
  assert.deepEqual([c.r.outcome, c.appointment_status, c.lead_stage, c.dispute_open], ['no_show', 'no_show', 'no_show', false]);
  assert.deepEqual(kinds(c), ['w13', 'w29']);
  const w13 = fus(c).find((x) => x.fu === 'w13');
  assert.deepEqual(w13, { fu: 'w13', ...R.w13NoShow('out_p', { id: 'bkg_p' }, 'lead_p', iso(pat(confirm))) });
  assert.equal(w13.idempotency_key, 'w12:no_show:bkg_p', 'same key as a WhatsApp no-show: W13 runs once');
});

test('Portal mark vs the lead answer (R6-03): disagreement opens the dispute for KG, nothing to the lead, no W13, Attended held', () => {
  const att = R.portalResolution(prow({ reach: 'no' }), pat(40));
  assert.deepEqual([att.dispute_open, att.appointment_status], [true, 'attended'], 'as the WhatsApp path: the row says attended, the dispute is open');
  assert.deepEqual(kinds(att), ['alert', 'capi_hold', 'w29']);
  assert.equal(fus(att).find((x) => x.fu === 'capi_hold').reason, 'conflict_pending_kg');
  assert.match(fus(att).find((x) => x.fu === 'alert').note, /^esc_kind=outcome_disputed; .*broker marked attended \(portal\), lead answered no/);
  const ns = R.portalResolution(prow({ outcome: 'no_show', disposition_code: null, reach: 'yes' }), pat(40));
  assert.equal(ns.dispute_open, true); assert.deepEqual(kinds(ns), ['alert', 'w29']);
  const rs = R.portalResolution(prow({ outcome: 'rescheduled', disposition_code: null, reach: 'no' }), pat(40));
  assert.equal(rs.dispute_open, true); assert.ok(!kinds(rs).includes('w10'), 'no W10 offer until KG decides');
});

test('Portal rescheduled -> W10 rebook (broker_rescheduled); outside the sweep window or before the slot ended -> nothing', () => {
  const c = R.portalResolution(prow({ outcome: 'rescheduled', disposition_code: null }), pat(20));
  assert.deepEqual([c.appointment_status, c.lead_stage], ['rescheduled', null]);
  const w10 = fus(c).find((x) => x.fu === 'w10');
  assert.deepEqual([w10.source, w10.reason, w10.schedule_d], ['W12', 'broker_rescheduled', false]);
  assert.equal(R.portalResolution(prow(), ms(PEND) + R.STALE_AFTER_END), null, 'stale (48 h): never a late thank-you');
  assert.equal(R.portalResolution(prow(), ms(PEND) - 1), null);
  assert.equal(R.portalResolution(prow({ outcome: 'broker_no_show' }), pat(40)), null, 'not a portal button');
  assert.equal(R.portalResolution(prow({ outcome_id: null }), pat(40)), null);
});

test('W12.json: tick reads portal rows without a w12:outcome claim; they and the W11 row run follow-ups only after winning that claim (no double sends)', async () => {
  const to = (from, out = 0) => ((WF.connections[from] || {}).main || [])[out]?.map((x) => x.node) || [];
  const Q = 'Portal-marked outcomes (no W12 follow-ups yet)';
  const RES = 'Portal resolution (w12.portalResolution)';
  const CL = 'Claim W12 follow-ups (w12:outcome, once per booking)';
  const FU = 'Claimed follow-ups (w12.claimedFollowUps)';
  assert.ok(to('Op', 0).includes(Q), 'tick output'); for (let i = 1; i < 8; i++) assert.ok(!to('Op', i).includes(Q), `op output ${i}`);
  assert.deepEqual(to(Q), [RES]); assert.deepEqual(to(RES), ['Claim source']);
  assert.deepEqual(to('Load auto-attended outcome (W11)'), ['Auto-attended resolution (w12.autoAttendedResolution)']);
  assert.deepEqual(to('Auto-attended resolution (w12.autoAttendedResolution)'), ['Claim source']);
  assert.deepEqual(to('Claim source'), [CL]); assert.deepEqual(to(CL), [FU]); assert.deepEqual(to(FU), ['Follow-up']);
  const sql = node(Q).parameters.query;
  assert.match(sql, /o\.marked_via = 'portal' AND o\.dispute_status = 'none'/);
  assert.match(sql, /o\.outcome IN \('attended', 'no_show', 'rescheduled'\)/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM public\.lead_activities c WHERE c\.idempotency_key = 'w12:outcome:' \|\| a\.id::text\)/);
  assert.match(sql, /interval '48 hours'/); assert.match(sql, /NOT \$2::boolean OR l\.is_synthetic/);
  // ONE key for "follow-ups ran": the sweep's insert writes it with its own row, the claim takes it for every other writer
  assert.match(node('Insert outcome + appointment + stage + timeline').parameters.query, /'outcome_recorded'[\s\S]*'w12:outcome:' \|\| o\.booking_id::text/);
  const cl = node(CL).parameters.query;
  assert.match(cl, /'outcome_recorded'[\s\S]*'w12:outcome:' \|\| \$4::text\)\s+ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING id/);
  for (const t of ['outcomes', 'appointments', 'leads']) assert.match(cl, new RegExp(`UPDATE public\\.${t} [\\s\\S]*?EXISTS \\(SELECT 1 FROM c\\)`), `${t} written only by the claim winner`);
  assert.deepEqual(checkSql(workflowSql({ nodes: WF.nodes.filter((n) => n.name === Q || n.name === CL) })), [], 'physical columns only');
  // the real Code nodes, as n8n runs them
  const [c, ...rest] = (await runCode(WF, RES, { items: [prow(), prow({ booking_id: 'bkg_q', outcome: 'no_show', disposition_code: null })], refs: { 'Classify + validate (w12.classifyOp)': { now_iso: iso(pat(10)) } } })).map((x) => x.json);
  assert.equal(c.row.booking_id, 'bkg_p'); assert.equal(rest.length, 0, 'the no-show inside its reach window waits');
  const src = (await runCode(WF, 'Claim source', { json: c })).json;
  assert.deepEqual(evalParam(WF, CL, 'options.queryReplacement', { json: src }),
    ['lead_p', 'brand_smc', BK.broker_id, 'bkg_p', 'attended', 'portal', 'attended', 'none', false, 'attended', 'dispositioned', 'attended']); // #40: + conv_state.state
  assert.deepEqual((await claimed(c)).map((x) => x.fu).sort(), ['capi_hold', 'send', 'w29']);
  assert.deepEqual(await claimed(c, false), [], 'claim lost: nothing sent');
});

test('v4b16: "Yes, we spoke" while the outcome is open -> one short reply (claimed key); later attended_thanks is not sent again', async () => {
  const fx = lead('L01');
  const END = endOf(fx);
  const base = mrow(fx, { first_name: 'Lerato', phone: '+27600000001', reach: 'yes', reach_at: iso(ms(END) + 35 * MIN), sent_outcome_check: true, sent_reach_check: true });
  const now = iso(ms(END) + 40 * MIN);
  const items = await sweep(base, now);
  const reply = items.find((x) => x.fu === 'send' && x.send.key === 'w12:reach_thanks:' + base.booking_id);
  assert.ok(reply, 'reply item');
  assert.deepEqual([reply.send.to, reply.send.wa.type, reply.send.wa.to, reply.send.template, reply.send.claim], ['lead', 'text', '+27600000001', null, true]);
  const adv = BK.adviser_name.split(' ')[0];
  assert.equal(reply.send.wa.text.body, `Thanks, Lerato. Glad you and ${adv} could talk. ${adv} will follow up with you directly.`);
  assert.ok(!/R\s?\d|price|fee|free|AI|commission/i.test(reply.send.wa.text.body));
  assert.ok(!items.some((x) => x.fu === 'resolve'), 'broker has not marked yet: still pending');
  // already sent / opted out / tap outside the 24-h window -> nothing
  for (const over of [{ sent_reach_thanks: true }, { opted_out_at: now }, { reach_at: iso(ms(now) - 24 * H) }]) {
    assert.ok(!(await sweep({ ...base, ...over }, now)).some((x) => x.send && x.send.key.startsWith('w12:reach_thanks:')), JSON.stringify(over));
  }
  // the broker marks attended later: attended_thanks is skipped because she already got the reply
  const later = { ...base, broker_mark: 'attended', sent_reach_thanks: true };
  const [res] = (await sweep(later, iso(ms(END) + 2 * H))).filter((x) => x.fu === 'resolve');
  assert.equal(res.o.outcome, 'attended');
  const fu = await follow({ ...res, row: later }, 'out_L01');
  assert.ok(!fu.some((x) => x.fu === 'send'), 'no second thank-you');
  assert.ok(fu.some((x) => x.fu === 'w29'));
  // both sides in the same pass (L01): no reach reply, attended_thanks as before
  const same = await sweep({ ...base, broker_mark: 'attended' }, now);
  assert.ok(!same.some((x) => x.send && x.send.key.startsWith('w12:reach_thanks:')));
  // the state query carries the two columns the rule reads
  const q = WF.nodes.find((n) => n.name === 'Meeting state (ended, no outcome yet)').parameters.query;
  assert.match(q, /'w12:reach_thanks:' \|\| a\.id::text\) AS sent_reach_thanks/);
  assert.match(q, /AS reach_at/);
});

// Smoke test 21 Oct 2026 (#40): a lead that rescheduled and then attended kept conv_state.state 'rescheduling' (W12 wrote the
// stage, never the conversation state), so the after-call deferral line (conversation/logic.mjs, state attended) never fired.
test('#40 W12 outcome moves conv_state.state on (attended / no_show / broker_no_show), never over opted_out or handoff', () => {
  assert.deepEqual(R.CONV_STATE_AFTER_OUTCOME, { attended: 'attended', no_show: 'no_show', broker_no_show: 'broker_no_show' });
  const row = (outcome) => R.outcomeRow({ outcome, lead_reach_check: 'none', dispute_status: 'none' }, { now: ms(PEND) });
  assert.deepEqual(['attended', 'no_show', 'broker_no_show', 'rescheduled'].map((o) => row(o).conv_state), ['attended', 'no_show', 'broker_no_show', null]);
  // the claim path (portal marks, W11 auto-attended) carries it as its 12th parameter, even when the stage is not written
  const c = R.portalResolution(prow(), pat(10));
  assert.equal(R.claimParams(c)[11], 'attended');
  const auto = R.autoAttendedResolution({ ...prow(), outcome: 'attended' });
  assert.deepEqual([R.claimParams(auto)[10], R.claimParams(auto)[11]], [null, 'attended'], 'W11 wrote the stage; the state still moves');
  assert.equal(R.claimParams(R.portalResolution(prow({ outcome: 'rescheduled', disposition_code: null }), pat(20)))[11], null);
  const node = (n) => WF.nodes.find((x) => x.name === n).parameters;
  const GUARD = /COALESCE\(conv_state->>'state', ''\) NOT IN \('opted_out', 'handoff'\)/;
  const ins = node('Insert outcome + appointment + stage + timeline');
  assert.match(ins.query, /conv_state = CASE WHEN \$14::text IS NOT NULL AND COALESCE\(conv_state->>'state', ''\) NOT IN \('opted_out', 'handoff'\) AND NOT EXISTS \(.*?\) THEN COALESCE\(conv_state, '\{\}'::jsonb\) \|\| jsonb_build_object\('state', \$14::text\) ELSE conv_state END/);
  assert.match(ins.options.queryReplacement, /o\.lead_stage, o\.conv_state \|\| null\]/);
  const claim = node('Claim W12 follow-ups (w12:outcome, once per booking)');
  assert.match(claim.query, GUARD); assert.match(claim.query, /\(\$11 IS NOT NULL OR \$12 IS NOT NULL\)/);
  assert.match(node('Apply KG not_attended (outcome -> no_show, audit activity)').query, /jsonb_build_object\('state', 'no_show'\)/);
  assert.deepEqual(checkSql(workflowSql(WF).filter((x) => /Insert outcome|Claim W12|KG not_attended/.test(x.node))), []);
});

// Review 21 Oct 2026 (#40 follow-up): W05's live-booking check needs ends_at > now(), so once call A has ended (still 'booked'
// until W12 records it) the lead can book call B. A's outcome must not then set conv_state.state to attended / no_show over
// B's 'booked' (logic.mjs would read a later "please cancel" as close_unbooked). Runs the generated SQL in PGlite.
test('review #40: an outcome for call A never moves conv_state.state while the lead has a newer live booking B', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`CREATE TABLE leads (id uuid PRIMARY KEY, stage text, conv_state jsonb, updated_at timestamptz);
    CREATE TABLE appointments (id uuid PRIMARY KEY, client_id uuid, status text, appointment_date timestamptz, updated_at timestamptz);
    CREATE TABLE outcomes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid UNIQUE, lead_id uuid, broker_id uuid, brand_id uuid, outcome text, lead_reach_check text,
      marked_via text, marked_at timestamptz, auto_marked boolean, unconfirmed boolean, dispute_status text, updated_at timestamptz);
    CREATE TABLE lead_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid, brand_id uuid, broker_id uuid, workflow text, actor_type text, activity_type text,
      payload jsonb, occurred_at timestamptz, idempotency_key text UNIQUE);
    CREATE TABLE escalations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, kind text, severity text, ref_table text, ref_id text, lead_id uuid, broker_id uuid,
      raised_at timestamptz, note text, resolved_at timestamptz, updated_at timestamptz);`);
  const LD = '10000000-0000-4000-8000-000000000001'; const A = '20000000-0000-4000-8000-00000000000a'; const B = '20000000-0000-4000-8000-00000000000b';
  const BR = '30000000-0000-4000-8000-000000000001'; const BRAND = '40000000-0000-4000-8000-000000000001';
  const reset = async (withB) => {
    await db.exec('DELETE FROM leads; DELETE FROM appointments; DELETE FROM outcomes; DELETE FROM lead_activities;');
    await db.query(`INSERT INTO leads VALUES ($1, 'booked', '{"state":"booked"}', now())`, [LD]);
    await db.query(`INSERT INTO appointments VALUES ($1, $2, 'booked', now() - interval '2 hours', now())`, [A, LD]);
    if (withB) await db.query(`INSERT INTO appointments VALUES ($1, $2, 'booked', now() + interval '2 days', now())`, [B, LD]);
  };
  const state = async () => (await db.query('SELECT conv_state->>\'state\' AS s FROM leads WHERE id = $1', [LD])).rows[0].s;
  const q = (n) => WF.nodes.find((x) => x.name === n).parameters.query;
  // n8n's Postgres node substitutes queryReplacement values as literals (pg-promise); do the same, highest index first
  const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const run = (sql, params) => db.exec(params.reduceRight((acc, v, i) => acc.split(`$${i + 1}`).join(lit(v)), sql));
  // 1. the claim path (portal marks, W11 auto-attended): params as claimParams builds them
  const claim = (bk) => [LD, BRAND, BR, bk, 'attended', 'portal', 'attended', 'none', false, 'attended', null, 'attended'];
  // 2. the sweep insert ($1..$14)
  const ins = (bk) => [bk, LD, BR, BRAND, 'no_show', 'none', 'whatsapp', new Date().toISOString(), false, false, 'none', 'no_show', 'no_show', 'no_show'];
  for (const [name, params] of [['Claim W12 follow-ups (w12:outcome, once per booking)', claim], ['Insert outcome + appointment + stage + timeline', ins]]) {
    await reset(false); await run(q(name), params(A)); assert.notEqual(await state(), 'booked', `${name}: no newer booking -> the state moves (#40)`);
    await reset(true); await run(q(name), params(A)); assert.equal(await state(), 'booked', `${name}: B is live and later -> B's state stays`);
  }
  // 3. KG not_attended (attended -> no_show)
  const kg = 'Apply KG not_attended (outcome -> no_show, audit activity)';
  for (const withB of [false, true]) {
    await reset(withB);
    await db.query(`INSERT INTO outcomes (booking_id, lead_id, broker_id, brand_id, outcome) VALUES ($1, $2, $3, $4, 'attended')`, [A, LD, BR, BRAND]);
    await db.query(`INSERT INTO lead_activities (lead_id, payload, idempotency_key) VALUES ($1, '{"decision":"not_attended"}', 'w12:kg_decision:' || $2)`, [LD, A]);
    await run(q(kg), [A, 'not_attended']);
    assert.equal(await state(), withB ? 'booked' : 'no_show', `KG not_attended, B live: ${withB}`);
  }
  await db.close();
});
