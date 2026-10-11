// DRAFT for GATE-TEST-W13 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W13 No-show & replacement — inside the Lead Velocity CRM (crm-nurture, 2026-10-11). Agreed rule (agreement clause 7 /
// Schedule 3): a replacement is GOODWILL, opened only for a lead NO-SHOW confirmed by both sides or a lead the broker could
// not reach (UNREACHABLE); never for a broker no-show, never because nobody bought, never for "outside criteria" or "no call".
// At most 3 requests per broker per Calendar Week (SAST, by the date of the missed appointment), no-shows and unreachable
// together. Lead Velocity has 48 h to dispute. There are no cycles and no per-plan caps: an APPROVED replacement adds one lead
// of capacity to the CRM lead order the missed lead was delivered on (public.smc_order_capacity).
//
// Run:  node --test automation/tests/W13.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
// The concurrency proof of the claim SQL (and of the routing triggers) is W13-claim-tx.local.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, order, clone, ms, iso, H, D, online } from './_harness.mjs';

import { readFileSync } from 'node:fs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as R from '../lib/w13.mjs';
const { REBOOK_WAIT, DISPUTE_WINDOW, WEEKLY_MAX, replacementTrigger, claim, dispute, settle, decide, orderCapacity, weekStart, weekLockKey } = R;
const WF = JSON.parse(readFileSync(new URL('../W13.json', import.meta.url), 'utf8'));
const CTX = { broker_id: 'brk_test_mark', lead_order_id: 'lo_test_001' };
const inWeek = (i, base = '2026-10-13T09:00:00+02:00') => ({ due: true, reason: 'no_show', reason_code: 'no_show', due_at: iso(ms(base) + i * H) });

// ============================================================================================
// Rules
// ============================================================================================
test(`W13 [${MODE}] L04: no-show confirmed, no reply to missed_you for 48 h -> replacement_due, 48-h dispute window, then approved`, async () => {
  const fx = lead('L04');
  const e = fx.expected.W13;
  if (MODE === 'online') {
    const seeded = (await online.post('/test/seed-outcome', { fixture: fx, outcome: 'no_show', no_show_confirmed_at: fx.expected.W12.no_show_confirmed_at })).body;
    await online.tick(ms(e.dispute_window_ends_at));
    const st = await online.state(seeded.lead_id);
    const r = st.replacements[0];
    assert.equal(r.reason, e.reason);
    assert.equal(ms(r.claimed_at), ms(e.replacement_due_at));
    assert.equal(ms(r.dispute_window_ends_at), ms(e.dispute_window_ends_at));
    assert.equal(r.status, e.status_after_window);
    return;
  }
  const trig = replacementTrigger({ kind: 'no_show', confirmed_at: fx.expected.W12.no_show_confirmed_at });
  assert.equal(trig.due, true);
  assert.equal(trig.due_at, e.replacement_due_at);
  const rows = [];
  const { row, alerts } = claim(CTX, rows, fx.lead_id, trig);
  assert.equal(row.reason, e.reason);
  assert.equal(row.lead_order_id, order().lead_order_id, 'linked to the lead order the lead was delivered on');
  assert.equal(row.dispute_window_ends_at, e.dispute_window_ends_at);
  assert.deepEqual(alerts, ['Jonathan: replacement_due']);
  assert.equal(settle(row, ms(e.dispute_window_ends_at) - 1), 'due', 'not approved inside the window');
  assert.equal(settle(row, ms(e.dispute_window_ends_at)), e.status_after_window);
  assert.equal(rows.filter((r) => r.broker_id === CTX.broker_id && r.status !== 'rejected').length, e.replacements_used_after);
});

test(`W13 [${MODE}] rebooking (or replying) inside 48 h means no replacement; a second no-show is due at once`, () => {
  const confirmed = '2026-10-15T17:00:00+02:00';
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, rebooked_at: '2026-10-16T09:00:00+02:00' }).due, false);
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, replied_at: '2026-10-17T16:59:00+02:00' }).due, false);
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, rebooked_at: '2026-10-17T17:01:00+02:00' }).due, true, 'too late');
  const second = replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, second_no_show: true });
  assert.equal(second.due_at, confirmed);
  assert.equal(REBOOK_WAIT, 48 * H); assert.equal(DISPUTE_WINDOW, 48 * H);
});

test(`W13 [${MODE}] dispositions: only "unreachable" opens a replacement (agreed rule: no-shows and unreachable leads only)`, () => {
  const at = '2026-10-15T11:00:00+02:00';
  const due = FIX._meta.disposition_codes.filter((code) => replacementTrigger({ kind: 'disposition', code, at }).due);
  assert.deepEqual(due, ['unreachable']);
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'unreachable', at }).reason, 'uncontactable');
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'nofit_criteria', at }).why, 'not_replaceable');
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'did_not_buy', at }).due, false, 'never "didn\'t buy" (FAIS)');
  assert.deepEqual([...R.REASONS].sort(), ['no_show', 'uncontactable'], 'same two reasons as the replacements.reason CHECK');
});

test(`W13 [${MODE}] broker no-show (L02, L03) never opens a replacement (Schedule D)`, () => {
  for (const id of ['L02', 'L03']) {
    assert.equal(lead(id).expected.W12.outcome, 'broker_no_show');
    assert.equal(replacementTrigger({ kind: 'broker_no_show' }).due, lead(id).expected.W13.replacement, id);
  }
});

test(`W13 [${MODE}] uncontactable: replaceable only if the lead was verified (an unverified lead never counted)`, () => {
  assert.equal(replacementTrigger({ kind: 'uncontactable', verified: true, at: '2026-10-20T09:00:00+02:00' }).due, true);
  assert.equal(replacementTrigger({ kind: 'uncontactable', verified: false, at: '2026-10-20T09:00:00+02:00' }).due, false);
});

test(`W13 [${MODE}] weekly maximum: 3 requests per broker per Calendar Week (no-shows + unreachable together); the 4th is refused and nothing is written; next week opens again`, () => {
  const rows = [];
  assert.equal(claim(CTX, rows, 'a', inWeek(0)).row.status, 'due');
  assert.equal(claim(CTX, rows, 'b', { ...inWeek(1), reason: 'uncontactable', reason_code: 'unreachable' }).row.status, 'due');
  assert.equal(claim(CTX, rows, 'c', inWeek(30)).row.cap_position, 3);
  const over = claim(CTX, rows, 'd', inWeek(40));
  assert.deepEqual([over.row, over.refused, over.used], [null, 'weekly_max', WEEKLY_MAX]);
  assert.deepEqual(over.alerts, ['Jonathan: weekly replacement maximum reached']);
  assert.equal(rows.length, 3, 'a refused request writes nothing');
  // counted by the date of the MISSED appointment, in SAST: Monday 00:00 starts the next week
  assert.equal(claim({ ...CTX, missed_start_at: '2026-10-19T00:00:00+02:00' }, rows, 'e', inWeek(0, '2026-10-19T09:00:00+02:00')).row.status, 'due');
  assert.equal(claim({ ...CTX, missed_start_at: '2026-10-18T23:59:00+02:00' }, rows, 'f', inWeek(0, '2026-10-19T09:00:00+02:00')).refused, 'weekly_max', 'Sunday 23:59 is still the full week');
  // another broker has his own counter
  assert.equal(claim({ broker_id: 'brk_other', lead_order_id: 'lo_x' }, rows, 'g', inWeek(0)).row.status, 'due');
  assert.equal(weekStart('2026-10-13T09:00:00+02:00'), '2026-10-11T22:00:00.000Z');
  assert.equal(weekLockKey('b1', '2026-10-18T23:59:00+02:00'), 'w13:week:b1:2026-10-11T22:00');
});

test(`W13 [${MODE}] every request counts for its week (a disputed-and-upheld one too): it does not free a place that week`, () => {
  const rows = [];
  const first = claim(CTX, rows, 'a', inWeek(0)).row;
  for (const id of ['b', 'c']) claim(CTX, rows, id, inWeek(1));
  dispute(first, ms(first.claimed_at) + H);
  decide(first, true);
  assert.equal(first.status, 'rejected');
  assert.equal(claim(CTX, rows, 'd', inWeek(2)).refused, 'weekly_max');
});

test(`W13 [${MODE}] 48-h dispute window: Lead Velocity can dispute at 47 h, not at 49 h; one replacement per lead`, () => {
  const rows = [];
  const trig = { due: true, reason: 'no_show', reason_code: 'no_show', due_at: '2026-10-17T17:00:00+02:00' };
  const { row } = claim(CTX, rows, 'lead_x', trig);
  const late = { ...row };
  dispute(row, ms(trig.due_at) + 47 * H);
  assert.equal(row.status, 'disputed');
  assert.throws(() => dispute(late, ms(trig.due_at) + 49 * H), /window closed/);
  assert.equal(claim(CTX, rows, 'lead_x', trig).row, row, 'idempotent per lead');
  assert.equal(rows.length, 1);
});

test(`W13 [${MODE}] capacity: an APPROVED replacement adds one lead to its CRM lead order; a due / rejected one adds nothing`, () => {
  const o = { ...clone(order()), attached: 20 };
  assert.deepEqual(orderCapacity(o, []), { capacity: 20, remaining: 0, counted_toward_order: 20, open: false });
  const rows = [{ lead_order_id: o.lead_order_id, status: 'due' }, { lead_order_id: o.lead_order_id, status: 'rejected' }, { lead_order_id: 'other', status: 'approved' }];
  assert.equal(orderCapacity(o, rows).remaining, 0);
  rows.push({ lead_order_id: o.lead_order_id, status: 'approved' });
  assert.deepEqual(orderCapacity(o, rows), { capacity: 21, remaining: 1, counted_toward_order: 19, open: true });
  assert.deepEqual(orderCapacity({ ...o, attached: 21 }, rows), { capacity: 21, remaining: 0, counted_toward_order: 20, open: false }, 'the paid number is delivered in full');
  assert.equal(orderCapacity({ ...o, status: 'pending', attached: 0 }, []).open, false, 'only a paid order is open');
});

// ============================================================================================
// Workflow checks: automation/W13.json runs automation/lib/w13.mjs; ONE writer shared with W10/W12/W29 and the portal RPC
// ============================================================================================
import { runCode, templateCounts, allWorkflows, PG_CRED } from './_n8ncode.mjs';
import { paramCounts } from '../lib/wa.mjs';
import * as W10 from '../lib/w10.mjs';
const node = (name) => WF.nodes.find((n) => n.name === name);
const W10WF = JSON.parse(readFileSync(new URL('../W10.json', import.meta.url), 'utf8'));
const c1a = (reason_code) => {
  const lead = { id: 'lead_c1a', verified_at: '2026-10-08T09:05:00+02:00', first_message_at: '2026-10-08T09:00:40+02:00', conv_state: { rebook_offered: true, ...(reason_code === 'no_call' ? { declined_call: true } : {}) } };
  const booking = { id: 'bk_c1a', status: 'cancelled', cancelled_at: '2026-10-12T10:00:00+02:00', brand_id: 'brand_smc', broker_id: 'brk_test_mark' };
  return W10.c1aDecision({ lead, booking, cancelled_by: 'lead', rebooked: false, rebook_offered: true, inbound_after_cancel: [], already_claimed: false, now_ms: ms('2026-10-12T10:00:00+02:00') + W10.C1A_SEQUENCE_MS + 60_000 }).w13;
};

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
  const ops = node('Op').parameters.rules.values.map((v) => v.outputKey);
  for (const op of ['claim', 'withdraw', 'no_show', 'dispute', 'decide', 'tick', 'reject']) assert.ok(ops.includes(op), op);
});

test('ONE writer: W13.json is the only workflow that writes public.replacements; W10 / W12 / W29 call W13 by id smc-w13; the weekly lock + count in SQL', () => {
  const writers = allWorkflows().filter(({ wf }) => /INSERT INTO public\.replacements|UPDATE public\.replacements/.test(JSON.stringify(wf))).map((x) => x.file);
  assert.deepEqual(writers, ['W13.json']);
  for (const f of ['W10.json', 'W12.json', 'W29.json']) {
    const wf = allWorkflows().find((x) => x.file === f).wf;
    assert.ok(wf.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters.workflowId.cachedResultName === 'W13 No-show & replacement' && n.parameters.workflowId.value === 'smc-w13'), f);
  }
  const q = node('Claim replacement (weekly lock, max 3, one per lead)').parameters.query;
  assert.match(q, /pg_advisory_xact_lock\(hashtextextended\('w13:week:' \|\| \$5::text/, 'requests serialised per broker and Calendar Week');
  assert.match(q, /r\.broker_id = \$5::uuid\s+AND public\.smc_week_start\(coalesce\(r\.missed_start_at, r\.claimed_at\)\) = public\.smc_week_start/, 'counted exactly like smc_replacements_cap / smc_request_replacement');
  assert.match(q, /WHERE used\.n < 3/);
  assert.match(q, /NOT \(x\.status = 'rejected' AND COALESCE\(x\.note, ''\) = 'withdrawn'\)/, 'one per lead; a withdrawn claim frees it');
  assert.match(q, /'refused', 'weekly_max'/);
  assert.ok(!/public\.cycles|public\.pricing|replacement_cap/.test(JSON.stringify(WF)), 'no cycles, no pricing caps');
  assert.deepEqual(R.COUNTED, new Set(['due', 'disputed', 'approved', 'fulfilled']));
});

test('W10 C1A, W29 and W12 claims share the one weekly counter; only cancel_no_rebook (could not reach) and unreachable are replaceable', () => {
  const rows = [];
  const viaW10 = R.normaliseInput(c1a('cancel_no_rebook'));
  assert.equal(viaW10.op, 'claim'); assert.equal(viaW10.outcome_id, null, 'C1A: no outcomes row'); assert.ok(R.validateInput(viaW10).ok);
  const t10 = R.claimDecision(viaW10, CTX);
  assert.deepEqual([t10.trig.reason, t10.trig.reason_code], ['uncontactable', 'cancel_no_rebook']);
  assert.equal(claim(CTX, rows, viaW10.lead_id, t10.trig).row.status, 'due');
  assert.equal(claim(CTX, rows, viaW10.lead_id, replacementTrigger({ kind: 'no_show', confirmed_at: '2026-10-14T17:00:00+02:00', second_no_show: true })).row, rows[0], 'still ONE replacement for that lead');
  assert.equal(R.claimDecision(R.normaliseInput({ ...c1a('no_call'), lead_id: 'lead_c1a_2' }), CTX).why, 'not_replaceable', 'C1A "no call" is not a replacement trigger');
  assert.equal(R.claimDecision(R.normaliseInput({ op: 'claim', outcome_id: 'out_9', reason: 'disqualified', reason_code: 'nofit_criteria' }), CTX).why, 'not_replaceable');
  const viaW29 = R.normaliseInput({ op: 'claim', outcome_id: 'out_10', reason: 'uncontactable', reason_code: 'unreachable', at: '2026-10-13T11:00:00+02:00' });
  assert.equal(claim(CTX, rows, 'lead_w29', R.claimDecision(viaW29, CTX).trig).row.status, 'due');
  assert.equal(claim(CTX, rows, 'lead_w12a', replacementTrigger({ kind: 'no_show', confirmed_at: '2026-10-12T17:00:00+02:00' })).row.status, 'due');
  assert.equal(claim(CTX, rows, 'lead_w12b', replacementTrigger({ kind: 'no_show', confirmed_at: '2026-10-12T17:00:00+02:00' })).refused, 'weekly_max', 'the 4th request from ANY caller in the week is refused');
  assert.match(W10WF.nodes.find((n) => n.name === 'C1A decision row (idempotency + evidence)').parameters.query, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
});

test('W13.json "Decide claim" node: C1A / W29 / system shapes; not routed, not on a lead order, unverified uncontactable and non-trigger codes are logged, not claimed', async () => {
  const dec = async (input, row) => (await runCode(WF, 'Decide claim (w13.claimDecision)', { json: row, refs: { 'Claim input': input } })).json;
  const ctx = { lead_id: 'lead_c1a', lead_order_id: 'lo_test_001', verified_at: '2026-10-08T09:05:00+02:00', brand_id: 'brand_smc', broker_id: 'brk_test_mark', booking_id: 'bk_c1a', missed_start_at: '2026-10-12T10:00:00+02:00' };
  const cancel = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: c1a('cancel_no_rebook') })).json;
  const d = await dec(cancel, ctx);
  assert.equal(d.claim, true); assert.deepEqual([d.trig.reason, d.trig.reason_code, d.booking_id], ['uncontactable', 'cancel_no_rebook', 'bk_c1a']);
  const noCall = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: c1a('no_call') })).json;
  assert.deepEqual([(await dec(noCall, ctx)).claim, (await dec(noCall, ctx)).why], [false, 'not_replaceable']);
  const budget = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: { op: 'claim', outcome_id: 'o1', reason: 'disqualified', reason_code: 'nofit_budget' } })).json;
  assert.equal((await dec(budget, ctx)).why, 'counts_as_delivered');
  const sys = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: { op: 'claim', kind: 'uncontactable', lead_id: 'lead_x' } })).json;
  assert.equal((await dec(sys, { ...ctx, verified_at: null })).why, 'never_verified_never_counted');
  assert.equal((await dec(sys, ctx)).claim, true);
  assert.equal((await dec(cancel, { ...ctx, lead_order_id: null })).why, 'not_delivered_on_a_lead_order');
  assert.equal((await dec(cancel, { ...ctx, broker_id: null })).why, 'not_routed');
  const bad = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: { op: 'decide', replacement_id: 'r1' } })).json;
  assert.equal(bad.op, 'reject'); assert.deepEqual(bad.missing, ['upheld']);
});

test('W13.json no-show path (L04): one missed_you offer with 3 times, 48-h clock, rebook/reply inside 48 h stops it, second no-show claims at once', async () => {
  const fx = lead('L04');
  const confirmed = fx.expected.W12.no_show_confirmed_at;
  const clk = async (over) => (await runCode(WF, 'No-show clock decision', { json: { lead_id: fx.lead_id, booking_id: 'bkg_L04', outcome_id: 'out_L04', confirmed_at: confirmed, confirmed_at_row: true, ...over }, refs: { 'Normalise + validate (w13.normaliseInput)': { op: 'tick' } } })).json;
  const due = await clk({});
  assert.deepEqual([due.trig.due, due.trig.due_at, due.trig.reason, due.decided_key], [true, fx.expected.W13.replacement_due_at, fx.expected.W13.reason, 'w13:no_show_decided:bkg_L04']);
  assert.equal(due.cycle_id, undefined, 'no cycles');
  assert.equal((await clk({ rebooked_at: '2026-10-16T09:00:00+02:00' })).trig.why, 'rebooked');
  assert.equal((await clk({ rebooked_activity_at: '2026-10-16T09:00:00+02:00' })).trig.why, 'rebooked', 'W10 rebooked_after_no_show row stops the clock');
  assert.equal((await clk({ replied_at: '2026-10-16T12:00:00+02:00' })).trig.why, 'engaged_in_chat');
  const second = (await runCode(WF, 'No-show clock decision', { json: { lead_id: fx.lead_id, booking_id: 'bkg_L04b', second_no_show: true }, refs: { 'Normalise + validate (w13.normaliseInput)': { op: 'no_show', confirmed_at: confirmed, outcome_id: 'out_L04b' } } })).json;
  assert.deepEqual([second.trig.due, second.trig.reason_code, second.trig.due_at, second.outcome_id], [true, 'second_no_show', confirmed, 'out_L04b']);
  const slots = [0, 1, 2, 3].map((d) => ({ start: iso(ms('2026-10-16T10:00:00+02:00') + d * D), end: iso(ms('2026-10-16T10:30:00+02:00') + d * D) }));
  const ctxRow = { booking_id: 'bkg_L04', lead_id: fx.lead_id, brand_id: 'brand_smc', broker_id: 'brk_test_mark', first_name: 'Pieter', phone: '+27600000004', adviser_name: 'Mark Smith', opted_out_at: null };
  const my = (await runCode(WF, 'missed_you (w13.missedYouItem)', { json: { slots }, refs: { 'No-show context + 48-h clock (w13:no_show:{booking})': ctxRow } })).json;
  assert.deepEqual([my.send.to, my.send.template, my.send.key], ['lead', 'missed_you', 'w13:missed_you:bkg_L04']);
  assert.deepEqual(paramCounts(my.send.wa), templateCounts('missed_you'));
  assert.ok(my.send.wa.template.components.filter((c) => c.sub_type === 'quick_reply').slice(0, 3).every((c) => /^slot_.+:resched:bkg_L04$/.test(c.parameters[0].payload)), 'W07 routes these to W10');
  assert.equal((await runCode(WF, 'missed_you (w13.missedYouItem)', { json: { slots: slots.slice(0, 2) }, refs: { 'No-show context + 48-h clock (w13:no_show:{booking})': ctxRow } })).json.send, null);
  assert.equal((await runCode(WF, 'missed_you (w13.missedYouItem)', { json: { slots }, refs: { 'No-show context + 48-h clock (w13:no_show:{booking})': { ...ctxRow, opted_out_at: '2026-10-15T18:00:00+02:00' } } })).json.why, 'opted_out');
  assert.match(node('No-show context + 48-h clock (w13:no_show:{booking})').parameters.query, /'w13:no_show:' \|\| ctx\.booking_id::text/);
  assert.match(node('Claim missed_you (sent once)').parameters.query, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
});

test('W13.json: never writes lead orders (capacity is the view); approved emits replacement_approved; never "guaranteed"; W09 cancel_all on due', () => {
  const s = JSON.stringify(WF);
  assert.ok(!/INSERT INTO public\.lead_order|UPDATE public\.lead_order|DELETE FROM public\.lead_order/.test(s), 'routing triggers attach leads; W13 never touches orders');
  assert.match(node('Settle: window closed -> approved (+1 on the lead order)').parameters.query, /'replacement_approved'[\s\S]*'w13:approved:' \|\| s\.id::text/);
  assert.match(node('Withdraw (W29 correction, inside the window only)').parameters.query, /r\.status = 'due' AND r\.dispute_window_ends_at > \$3::timestamptz/);
  assert.match(node('Dispute (Lead Velocity, inside the 48-h window)').parameters.query, /status = 'due' AND dispute_window_ends_at > \$2::timestamptz/);
  for (const text of [s, readFileSync(new URL('../lib/w13.mjs', import.meta.url), 'utf8')]) assert.ok(!/guarantee/i.test(text), 'never "guaranteed" (0.1)');
  assert.match(R.alertNote('weekly_max', { lead: { first_name: 'Pieter', last_name: 'V' }, used: 3, reason_code: 'no_show' }), /3 of 3 goodwill replacement requests this Calendar Week\. Not opened; nothing is owed/);
  assert.equal(WF.nodes.find((n) => n.name === 'W09 cancel_all (lead)').parameters.workflowId.cachedResultName, 'W09 Reminder sequence');
  assert.match(node('Send WhatsApp').parameters.url, /PHONE_NUMBER_ID/);
  assert.ok(WF.connections['Send WhatsApp'].main[0].some((c) => c.node === 'Touch leads.last_contact_at (lead outbound)'));
});

test('F11 (REHEARSAL-L01) "Claim replacement" emits the lock row + the claim row: the alert node runs once over all items, no pairedItem lookup, one alert per real row (due or refused)', async () => {
  const NOTE = 'Alert + timeline text (w13.alertNote)';
  const n = node(NOTE);
  assert.equal(n.parameters.mode, 'runOnceForAllItems', 'per-item mode resolved $(...).item through the lock row -> "reading \'pairedItem\'"');
  assert.ok(!/\.item\.json/.test(n.parameters.jsCode), 'no paired-item lookups');
  const decide = { lead_id: 'lead_test_L06', brand_id: 'brand_smc', broker_id: 'brk_mark', first_name: 'Pieter', last_name: 'V' };
  const lock = { pg_advisory_xact_lock: '' };
  const ins = { id: '070070bc-0951-42f6-af52-183d352ed3ba', lead_id: 'lead_test_L06', lead_order_id: 'lo_test_001', status: 'due', note: null, cap_position: 2, dispute_window_ends_at: '2026-10-20T11:00:00Z', reason_code: 'no_show', used_after: 2, weekly_max: 3 };
  const out = await runCode(WF, NOTE, { items: [lock, ins], refs: { 'Decide claim (w13.claimDecision)': decide } });
  assert.equal(out.length, 1, 'exactly one item: the replacements row');
  const r = out[0].json;
  assert.equal(r.id, ins.id); assert.equal(r.ref_id, ins.id); assert.equal(r.cap_position, 2); assert.equal(r.status, 'due');
  assert.equal(r.brand_id, 'brand_smc'); assert.equal(r.broker_id, 'brk_mark'); assert.equal(r.activity, 'replacement_due');
  assert.match(r.note_text, /Pieter/);
  assert.deepEqual(out[0].pairedItem, { item: 1 }, 'paired to its own input row, so downstream $(NOTE).item resolves');
  // Over the weekly maximum: nothing was written (id null), Jonathan is told, urgently.
  const refused = await runCode(WF, NOTE, { items: [lock, { ...ins, id: null, status: 'refused', note: 'weekly_max', cap_position: null, dispute_window_ends_at: null, used_after: 3 }], refs: { 'Decide claim (w13.claimDecision)': decide } });
  assert.equal(refused[0].json.weekly_max_reached, true); assert.equal(refused[0].json.severity, 'urgent'); assert.equal(refused[0].json.ref_id, 'lead_test_L06');
  assert.equal(refused[0].json.activity, 'replacement_refused_weekly_max');
  // Lead already has a replacement (insert skipped): only the lock row arrives -> nothing to alert.
  assert.deepEqual(await runCode(WF, NOTE, { items: [lock], refs: { 'Decide claim (w13.claimDecision)': decide } }), []);
});
