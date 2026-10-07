// DRAFT for GATE-TEST-W13 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W13 No-show & replacement requests — Lead Generation Services Agreement clause 7 + Schedule 3 (ux-sprint-1, 2026-10-07)
// Rule protected: a replacement is GOODWILL, AT LEAD VELOCITY'S DISCRETION, never an entitlement and never automatic.
//  * Only a broker no-show request with proof (photo / screenshot) sent between start + 10 min and start + 30 min.
//  * At most 3 requests per Calendar Week per broker (Mon-Sun SAST, by the missed appointment's date), not 4/6/9 per
//    cycle: pricing.replacement_cap_cycle stays in the data and drives nothing.
//  * A confirmed lead no-show gets ONE rebook offer (missed_you) and nothing else. "Couldn't reach them" is feedback
//    only (clause 8.4). Dispositions, W10 C1A and system "uncontactable" claims are refused and logged.
//  * Lead Velocity decides each request; a replacement never changes Delivered (7.4).
//
// Run:  node --test automation/tests/W13.test.mjs     (offline)
// Loads the real logic (automation/lib/w13.mjs) and runs the Code nodes of the real workflow (automation/W13.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIX, MODE, lead, cycle, pricing, clone, ms, iso, H, D } from './_harness.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import { runCode, templateCounts, allWorkflows, PG_CRED } from './_n8ncode.mjs';
import { paramCounts } from '../lib/wa.mjs';
import * as W10 from '../lib/w10.mjs';
import * as R from '../lib/w13.mjs';

const WF = JSON.parse(readFileSync(new URL('../W13.json', import.meta.url), 'utf8'));
const node = (name) => WF.nodes.find((n) => n.name === name);
const MIN = 60_000;
// SYNTHETIC cycle price for the shortfall maths only. NOT a tier price (W25 forbids hard-coded prices).
const SYNTHETIC_PRICE = 10000;
const START = '2026-10-15T14:00:00+02:00'; // L04's booked start (a Thursday)
const req = (over = {}) => ({ broker_id: 'brk_mark', lead_id: 'lead_x', booking_id: 'bk_x', cycle_id: 'cyc_1', brand_id: 'brand_smc', missed_start_at: START, proof_sent_at: iso(ms(START) + 15 * MIN), proof_path: 'whatsapp-media:m1', ...over });

// ============================================================================================
// The rule (automation/lib/w13.mjs)
// ============================================================================================
test(`W13 [${MODE}] L04: a confirmed lead no-show opens nothing by itself; one missed_you offer; broker proof 10-30 min after start = a request`, () => {
  const fx = lead('L04');
  const e = fx.expected.W13;
  assert.equal(fx.expected.W12.lead_message, e.lead_message, 'W12 hands the lead no-show to W13 for missed_you');
  const t = R.replacementTrigger({ kind: 'no_show', confirmed_at: fx.expected.W12.no_show_confirmed_at });
  assert.deepEqual([t.due, t.why], [e.replacement, e.why]);
  assert.equal(fx.booking_request.slot_start, START);
  const rows = [];
  assert.equal(R.request(rows, req({ proof_sent_at: e.early_proof_at })).why, e.early_why);
  assert.equal(R.request(rows, req({ proof_sent_at: e.late_proof_at })).why, e.late_why, 'Schedule 3.4: late proof -> stands as Delivered');
  const ok = R.request(rows, req({ proof_sent_at: e.proof_at }));
  assert.deepEqual([ok.row.status, ok.used], [e.request_status, e.requests_used_after]);
  assert.deepEqual([ok.row.reason, ok.row.reason_code], ['no_show', 'schedule3_proof']);
});

test(`W13 [${MODE}] proof window is start + 10 min to start + 30 min inclusive; no proof (or a voice note) is no request`, () => {
  const d = (min, extra = {}) => R.requestDecision({ start_at: START, proof_at: iso(ms(START) + min * MIN), has_proof: true, ...extra });
  assert.equal(d(9.5).reason, 'too_early');
  assert.equal(d(10).ok, true);
  assert.equal(d(30).ok, true);
  assert.equal(d(30.5).reason, 'too_late');
  assert.equal(d(15, { has_proof: false }).reason, 'proof_missing');
  const plan = (media) => R.requestPlan({ proof_at: iso(ms(START) + 15 * MIN), media, media_id: 'm1' }, { booking_id: 'bk', missed_start_at: START, used_this_week: 0 });
  assert.equal(plan('image').record, true);
  assert.equal(plan('document').record, true, 'a screenshot sent as a file');
  assert.equal(plan('audio').why, 'proof_missing');
  assert.equal(R.requestPlan({ proof_at: START, media: 'image', media_id: 'm1' }, { booking_id: null }).why, 'no_booking');
});

test(`W13 [${MODE}] weekly maximum: 3 requests per broker per Calendar Week (Mon 00:00 - Sun 23:59 SAST); every request counts; next week starts fresh`, () => {
  assert.equal(R.WEEKLY_MAX, 3);
  assert.equal(R.weekStart('2026-10-15T14:00:00+02:00'), '2026-10-12T00:00:00+02:00');
  assert.equal(R.weekStart('2026-10-18T23:59:00+02:00'), '2026-10-12T00:00:00+02:00', 'Sunday night is the same week');
  assert.equal(R.weekStart('2026-10-19T00:00:00+02:00'), '2026-10-19T00:00:00+02:00', 'Monday 00:00 SAST starts a new one');
  assert.equal(R.weekStart('2026-10-18T22:30:00Z'), '2026-10-19T00:00:00+02:00', 'SAST, not UTC');
  const rows = [];
  const at = (day, i) => { const s = iso(ms('2026-10-12T09:00:00+02:00') + day * D); return req({ booking_id: `bk_${day}_${i}`, lead_id: `ld_${day}_${i}`, missed_start_at: s, proof_sent_at: iso(ms(s) + 12 * MIN) }); };
  for (let i = 0; i < 3; i++) assert.equal(R.request(rows, at(i, 0)).row.status, 'due', `#${i + 1}`);
  R.decide(rows[0], false); // a declined request still counts (clause 7.2: "consider no more than 3 requests")
  assert.equal(R.request(rows, at(4, 0)).why, 'weekly_max', 'the 4th in the week is not considered');
  assert.equal(R.request(rows, at(6, 1)).why, 'weekly_max', 'Sunday is still the same week');
  assert.equal(R.request(rows, at(7, 0)).row.status, 'due', 'Monday: a new Calendar Week');
  assert.equal(R.request(rows, { ...at(4, 2), broker_id: 'brk_other' }).row.status, 'due', 'per broker');
  assert.equal(R.request(rows, at(7, 0)).why, 'already_requested', 'one request per booking');
});

for (const tier of ['SMC_BRONZE', 'SMC_SILVER', 'SMC_GOLD']) {
  test(`W13 [${MODE}] ${tier}: replacement_cap_cycle (${pricing(tier).replacement_cap_cycle}) stays in the data but drives nothing; the weekly maximum is 3 on every plan`, () => {
    assert.ok(pricing(tier).replacement_cap_cycle > 0, 'kept in the pricing data (history)');
    const rows = [];
    const cyc = { ...clone(cycle()), tier_code: tier, replacement_cap: pricing(tier).replacement_cap_cycle };
    const r = (i) => R.request(rows, req({ booking_id: `bk_${i}`, lead_id: `ld_${i}`, cycle_id: cyc.cycle_id, missed_start_at: iso(ms(START) + i * H), proof_sent_at: iso(ms(START) + i * H + 11 * MIN) }));
    assert.deepEqual([0, 1, 2, 3].map((i) => r(i).row?.status || r(i).why), ['due', 'due', 'due', 'weekly_max']);
  });
}

test(`W13 [${MODE}] nothing else opens a replacement: lead no-show (first or second), every disposition, "Couldn't reach them", C1A, uncontactable, broker no-show`, () => {
  const at = '2026-10-15T11:00:00+02:00';
  assert.equal(R.replacementTrigger({ kind: 'no_show', confirmed_at: at, second_no_show: true }).due, false);
  for (const code of FIX._meta.disposition_codes) assert.equal(R.replacementTrigger({ kind: 'disposition', code, at }).due, false, code);
  assert.equal(R.replacementTrigger({ kind: 'disposition', code: 'unreachable', at }).why, 'feedback_only', 'clause 8.4');
  for (const kind of ['c1a', 'uncontactable']) assert.equal(R.replacementTrigger({ kind, verified: true, at }).why, 'clause7_request_only', kind);
  for (const id of ['L02', 'L03']) {
    assert.equal(lead(id).expected.W12.outcome, 'broker_no_show');
    assert.equal(R.replacementTrigger({ kind: 'broker_no_show' }).due, lead(id).expected.W13.replacement, id);
  }
});

test(`W13 [${MODE}] Lead Velocity decides (approve | decline) an undecided request only; the broker is told; wording is goodwill, at Lead Velocity's discretion`, () => {
  const rows = [];
  const { row } = R.request(rows, req());
  assert.equal(R.decide(row, true), 'approved');
  assert.throws(() => R.decide(row, false), /cannot decide a approved/);
  const second = R.request(rows, req({ booking_id: 'bk_2', lead_id: 'ld_2' })).row;
  assert.deepEqual([R.decide(second, false), second.note], ['rejected', 'declined']);
  const ctx = { lead_first_name: 'Pieter', missed_start_at: START, used_after: 2 };
  for (const k of ['requested', 'approved']) assert.match(R.brokerReply(k, ctx), /goodwill gesture, at Lead Velocity's discretion/, k);
  assert.match(R.brokerReply('requested', ctx), /Request 2 of 3 this week[\s\S]*still counts as delivered/);
  assert.match(R.brokerReply('too_late', ctx), /too late for a replacement request and still counts as delivered/);
  assert.match(R.brokerReply('weekly_max', ctx), /already sent 3 replacement requests this week/);
  assert.match(R.brokerReply('declined', ctx), /counts as delivered/);
  for (const k of ['requested', 'approved', 'declined', 'too_late', 'too_early', 'weekly_max', 'proof_missing', 'no_booking']) {
    assert.doesNotMatch(R.brokerReply(k, ctx), /entitle|guarantee|you are owed|per cycle/i, k);
  }
});

test(`W13 [${MODE}] rollover: Delivered drives close / extend / credit; replacements never change it (clause 7.4)`, () => {
  const cyc = { ...clone(cycle()), renewing: true };
  const end = ms(cyc.ends_at);
  assert.equal(R.cycleState(cyc, { delivered: 15 }, end - D, SYNTHETIC_PRICE).status, 'active');
  const ext = R.cycleState(cyc, { delivered: 18 }, end, SYNTHETIC_PRICE);
  assert.equal(ext.status, 'extended');
  assert.equal(ext.extended_until, '2026-11-25T00:00:00+02:00');
  assert.equal(R.cycleState(cyc, { delivered: 20 }, end + 5 * D, SYNTHETIC_PRICE).status, 'closed');
  const short = R.cycleState(cyc, { delivered: 18 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.deepEqual([short.status, short.shortfall, short.credit_zar, short.credit_as], ['closed', 2, SYNTHETIC_PRICE * 2 / 20, 'credit_next_cycle']);
  assert.equal(R.cycleState({ ...cyc, renewing: false }, { delivered: 18 }, end + 14 * D, SYNTHETIC_PRICE).credit_as, 'refund');
  assert.equal(R.cycleState(cyc, { delivered: 0 }, end + 14 * D, SYNTHETIC_PRICE).credit_zar, SYNTHETIC_PRICE, 'capped at the cycle price');
});

// ============================================================================================
// Workflow checks: automation/W13.json runs automation/lib/w13.mjs
// ============================================================================================
const c1a = (reason_code) => {
  const ld = { id: 'lead_c1a', verified_at: '2026-10-08T09:05:00+02:00', first_message_at: '2026-10-08T09:00:40+02:00', conv_state: { rebook_offered: true, ...(reason_code === 'no_call' ? { declined_call: true } : {}) } };
  const booking = { id: 'bk_c1a', status: 'cancelled', cancelled_at: '2026-10-12T10:00:00+02:00', brand_id: 'brand_smc', broker_id: 'brk_test_mark', cycle_id: cycle().cycle_id };
  return W10.c1aDecision({ lead: ld, booking, cancelled_by: 'lead', rebooked: false, rebook_offered: true, inbound_after_cancel: [], already_claimed: false, now_ms: ms('2026-10-12T10:00:00+02:00') + W10.C1A_SEQUENCE_MS + 60_000 }).w13;
};
const NORM = 'Normalise + validate (w13.normaliseInput)';

test('W13.json: DRAFT name, inactive, one Postgres credential, physical columns only, Code nodes require(\'lv-automation\').w13, id smc-w13', () => {
  assert.equal(WF.name, 'W13 No-show & replacement (DRAFT pending GATE-TEST-W13)');
  assert.equal(WF.active, false);
  assert.ok(WF.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres').every((n) => n.credentials.postgres.name === PG_CRED && n.credentials.postgres.id === ''));
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.code' && /\(w13\./.test(x.name))) assert.match(n.parameters.jsCode, /require\('lv-automation'\)\.w13;/, n.name);
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    for (const m of n.parameters.jsCode.matchAll(/require\('([^']+)'\)/g)) assert.equal(m[1], 'lv-automation', `${n.name}: exact allowlisted name only (I-46c), got ${m[1]}`);
    assert.doesNotMatch(n.parameters.jsCode, /REPO_DIR|await import\(|pathToFileURL|lv-automation\//, n.name);
  }
  assert.equal(Object.keys(WF)[0], 'id'); assert.equal(WF.id, 'smc-w13'); assert.equal(WF.settings.errorWorkflow, 'smc-w22');
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.executeWorkflow')) {
    const r = n.parameters.workflowId; const m = /^W(\d\d)\b/.exec(r.cachedResultName);
    assert.equal(r.mode, 'id', n.name); assert.equal(r.value, m ? `smc-w${m[1]}` : `smc-${r.cachedResultName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, n.name);
  }
  assert.deepEqual(node('Op').parameters.rules.values.map((v) => v.outputKey), ['request', 'no_show', 'decide', 'refuse', 'reject']);
  assert.ok(!WF.nodes.some((n) => n.type === 'n8n-nodes-base.scheduleTrigger'), 'no clock: nothing is approved or opened by time passing');
});

test('ONE writer per path: W13.json is the only workflow writing public.replacements; the request SQL locks per broker-week and allows at most 3; no cycle cap is read', () => {
  const writers = allWorkflows().filter(({ wf }) => /INSERT INTO public\.replacements|UPDATE public\.replacements/.test(JSON.stringify(wf))).map((x) => x.file);
  assert.deepEqual(writers, ['W13.json']);
  for (const f of ['W07.json', 'W10.json', 'W12.json', 'W29.json']) {
    const wf = allWorkflows().find((x) => x.file === f).wf;
    assert.ok(wf.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters.workflowId.cachedResultName === 'W13 No-show & replacement' && n.parameters.workflowId.value === 'smc-w13'), f);
  }
  const q = node('Record request (per broker-week lock, max 3, one per booking)').parameters.query;
  assert.match(q, /pg_advisory_xact_lock\(hashtext\('w13:week:' \|\| \$4::text \|\| ':' \|\| public\.smc_week_start\(\$6::timestamptz\)::text\)\);/);
  assert.match(q, /r\.broker_id = \$4::uuid AND public\.smc_week_start\(coalesce\(r\.missed_start_at, r\.claimed_at\)\) = public\.smc_week_start\(\$6::timestamptz\)/, 'counted like smc_request_noshow_replacement');
  assert.match(q, /WHERE used\.n < 3 AND NOT EXISTS \(SELECT 1 FROM public\.replacements x WHERE x\.booking_id = \$2::uuid\)/);
  assert.match(q, /'schedule3_proof'[\s\S]*'due'/);
  const logic = JSON.stringify(WF.nodes.filter((x) => x.type !== 'n8n-nodes-base.stickyNote').map((x) => x.parameters));
  assert.ok(!/replacement_cap|cap_reached|dispute_window_ends_at/.test(logic), 'no per-cycle cap, no self-approving window');
  const ctx = node('Request context (booking in the proof window, requests this week)').parameters.query;
  assert.match(ctx, /a\.broker_id = \$1::uuid/, "only the broker's own bookings");
});

test('W13.json request path: W07 broker photo -> plan -> record or a reply that says why; the recorded request goes to the console and the broker hears back', async () => {
  const fx = lead('L04').expected.W13;
  const msg = { from: '+27600000099', media: 'image', media_id: 'mid_1', wamid: 'wamid.P', at_ms: ms(fx.proof_at) };
  const n = (await runCode(WF, NORM, { json: { source: 'W07', route: 'W13', msg, from_broker_id: 'brk_mark' } })).json;
  assert.deepEqual([n.op, n.broker_id, n.proof_at, n.proof_path, n.broker_phone], ['request', 'brk_mark', fx.proof_at, 'whatsapp-media:mid_1', '+27600000099']);
  const ctxRow = { broker_id: 'brk_mark', broker_phone: '+27600000099', wamid: 'wamid.P', booking_id: 'bkg_L04', lead_id: 'lead_test_L04', brand_id: 'brand_smc', cycle_id: 'cyc_1', missed_start_at: START, lead_first_name: 'Pieter', used_this_week: 0, already_requested: false };
  const plan = async (over = {}, nOver = {}) => (await runCode(WF, 'Request plan (w13.requestPlan)', { json: { ...ctxRow, ...over }, refs: { [NORM]: { ...n, ...nOver } } })).json;
  const ok = await plan();
  assert.deepEqual([ok.record, ok.reply, ok.proof_path], [true, null, 'whatsapp-media:mid_1']);
  const late = await plan({}, { proof_at: fx.late_proof_at });
  assert.deepEqual([late.record, late.why, late.reply.to, late.reply.wa.type], [false, 'too_late', 'broker', 'text']);
  assert.match(late.reply.wa.text.body, /too late for a replacement request/);
  assert.equal((await plan({ used_this_week: 3 })).why, 'weekly_max');
  assert.equal((await plan({ already_requested: true })).why, 'already_requested');
  assert.equal((await plan({ booking_id: null })).why, 'no_booking');
  // the record batch returns the lock row + the insert row: one console note, one broker reply
  const NOTE = 'Request recorded -> console note + broker reply (w13.alertNote)';
  assert.equal(node(NOTE).parameters.mode, 'runOnceForAllItems');
  const ins = { id: 'rep_1', lead_id: 'lead_test_L04', cycle_id: 'cyc_1', broker_id: 'brk_mark', brand_id: 'brand_smc', booking_id: 'bkg_L04', missed_start_at: START, proof_path: 'whatsapp-media:mid_1', used_after: 1 };
  const out = await runCode(WF, NOTE, { items: [{ pg_advisory_xact_lock: '' }, ins], refs: { 'Request plan (w13.requestPlan)': ok } });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].pairedItem, { item: 1 });
  assert.match(out[0].json.note_text, /esc_kind=replacement_request; .*request 1 of 3 this Calendar Week.*Lead Velocity's discretion/);
  assert.match(out[0].json.reply.wa.text.body, /Request 1 of 3 this week/);
  assert.deepEqual(await runCode(WF, NOTE, { items: [{ pg_advisory_xact_lock: '' }], refs: { 'Request plan (w13.requestPlan)': ok } }), [], 'lost the race: nothing recorded, nothing said');
  assert.match(node('Escalate (console decides) + timeline').parameters.query, /'noshow_proof_sent'[\s\S]*'w13:noshow_proof:' \|\| \$7/);
});

test('W13.json no-show path (L04): one missed_you offer with 3 times, sent once; no clock, no claim', async () => {
  const slots = [0, 1, 2, 3].map((d) => ({ start: iso(ms('2026-10-16T10:00:00+02:00') + d * D), end: iso(ms('2026-10-16T10:30:00+02:00') + d * D) }));
  const CTX = 'No-show context (missed_you once)';
  const ctxRow = { booking_id: 'bkg_L04', lead_id: 'lead_test_L04', brand_id: 'brand_smc', broker_id: 'brk_test_mark', first_name: 'Pieter', phone: '+27600000004', adviser_name: 'Mark Smith', opted_out_at: null };
  const my = (await runCode(WF, 'missed_you (w13.missedYouItem)', { json: { slots }, refs: { [CTX]: ctxRow } })).json;
  assert.deepEqual([my.send.to, my.send.template, my.send.key], ['lead', 'missed_you', 'w13:missed_you:bkg_L04']);
  assert.deepEqual(paramCounts(my.send.wa), templateCounts('missed_you'));
  assert.ok(my.send.wa.template.components.filter((c) => c.sub_type === 'quick_reply').slice(0, 3).every((c) => /^slot_.+:resched:bkg_L04$/.test(c.parameters[0].payload)), 'W07 routes these to W10');
  assert.equal((await runCode(WF, 'missed_you (w13.missedYouItem)', { json: { slots: slots.slice(0, 2) }, refs: { [CTX]: ctxRow } })).json.send, null);
  assert.equal((await runCode(WF, 'missed_you (w13.missedYouItem)', { json: { slots }, refs: { [CTX]: { ...ctxRow, opted_out_at: '2026-10-15T18:00:00+02:00' } } })).json.why, 'opted_out');
  assert.match(node('Claim missed_you (sent once)').parameters.query, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  const downstream = new Set(); const walk = (n) => { for (const outs of WF.connections[n]?.main || []) for (const c of outs) if (!downstream.has(c.node)) { downstream.add(c.node); walk(c.node); } };
  walk(CTX);
  assert.ok(![...downstream].some((x) => /Record request|replacements/i.test(x)), 'the no-show path never reaches a replacement write');
});

test('W13.json legacy claims (W10 C1A, W29 dispositions, system uncontactable) are refused and logged; decide needs a boolean', async () => {
  const norm = async (j) => (await runCode(WF, NORM, { json: j })).json;
  for (const [j, why] of [[c1a('no_call'), 'clause7_request_only'], [c1a('cancel_no_rebook'), 'clause7_request_only'], [{ op: 'claim', outcome_id: 'o1', reason: 'uncontactable', reason_code: 'unreachable' }, 'feedback_only'], [{ op: 'claim', kind: 'uncontactable', lead_id: 'lx' }, 'clause7_request_only'], [{ op: 'withdraw', outcome_id: 'o1', reason_code: 'nofit_criteria' }, 'counts_as_delivered']]) {
    const n = await norm(j);
    assert.deepEqual([n.op, n.why], ['refuse', why], JSON.stringify(j));
  }
  assert.match(node('Timeline: not a replacement (refused, why)').parameters.query, /'replacement_not_opened'/);
  const bad = await norm({ op: 'decide', replacement_id: 'r1' });
  assert.deepEqual([bad.op, bad.missing], ['reject', ['approve']]);
  const d = node('Decide request (approve | decline) + emit').parameters.query;
  assert.match(d, /WHERE r\.id = \$1::uuid AND r\.status = 'due'/);
  assert.match(d, /'replacement_approved' ELSE 'replacement_declined'/);
  const reply = (await runCode(WF, 'Send item (decision, w13.replyItem)', { json: { replacement_id: 'r1', status: 'approved', broker_phone: '+27600000099', lead_first_name: 'Pieter', broker_id: 'b' } })).json;
  assert.match(reply.send.wa.text.body, /goodwill gesture, at Lead Velocity's discretion/);
});

test('W13.json: never writes cycles or credits; wording "committed", never "guaranteed"; sends go through the shared chain only when there is a message', () => {
  const s = JSON.stringify(WF);
  assert.ok(!/UPDATE public\.cycles|INSERT INTO public\.cycles|shortfall_credit_zar|extended_until/.test(s));
  for (const text of [s, readFileSync(new URL('../lib/w13.mjs', import.meta.url), 'utf8')]) assert.ok(!/guarantee/i.test(text), 'never "guaranteed"');
  assert.match(R.alertNote({ lead: { first_name: 'Pieter' }, used: 1, missed_start_at: START, proof_path: 'p' }), /the committed number and Delivered are unchanged/);
  for (const s2 of ['Send item (request recorded)', 'Send item (why not)', 'Send item (missed_you)', 'Send item (decision, w13.replyItem)']) assert.deepEqual(WF.connections[s2].main[0].map((c) => c.node), ['Has a message?'], s2);
  assert.match(node('Send WhatsApp').parameters.url, /PHONE_NUMBER_ID/);
  assert.ok(WF.connections['Send WhatsApp'].main[0].some((c) => c.node === 'Touch leads.last_contact_at (lead outbound)'));
});
