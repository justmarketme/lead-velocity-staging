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

test(`W12 [${MODE}] L02: broker taps No-show but the lead says "No, not yet" -> BROKER no-show (Schedule D), no lead no-show`, async () => {
  const fx = lead('L02');
  const o = await sys.resolve(fx, '2026-10-13T11:45:00+02:00');
  assert.equal(o.outcome, 'broker_no_show');
  assert.equal(o.lead_reach_check, 'no');
  assert.equal(o.capi.length, 0, 'no Attended event');
  if (MODE === 'offline') {
    assert.equal(o.lead_message, fx.expected.W12.lead_message);
    assert.deepEqual(o.alerts, ['KG']);
    assert.equal(o.next, 'rebook_at_our_cost');
  }
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

test('W12.json L02 broker no-show (lead "No, not yet"): apology (session) + W10 rebook at our cost + KG alert; never W13', async () => {
  const fx = lead('L02');
  const row = mrow(fx, { broker_mark: 'no_show', reach: 'no', sent_outcome_check: true, sent_reach_check: true });
  const [res] = await sweep(row, '2026-10-13T11:45:00+02:00');
  assert.equal(res.o.outcome, 'broker_no_show'); assert.equal(res.o.lead_stage, null, 'lead stage unchanged: the lead did nothing wrong');
  const fu = await follow({ ...res, row }, 'out_L02');
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
