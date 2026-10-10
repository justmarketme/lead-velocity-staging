// DRAFT for GATE-TEST-W13 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W13 No-show & replacement — 0.1 (per-cycle cap, shortfall), 4.12a, Schedule C
// Money rule protected: replacements are what erode margin, so they open ONLY for the contract triggers
// (lead no-show confirmed by both sides, unreachable, outside criteria, verified-then-uncontactable), never for a
// broker no-show and never because nobody bought (FAIS, Raspberry Academy). The cap is per cycle and comes from
// the pricing row (Bronze 4 / Silver 6 / Gold 9). Lead Velocity has 48 h to dispute. A short cycle extends up
// to 14 days; anything still short is credited at the plan's Effective Lead Price (top-up leads too), capped at what was paid.
//
// Run:  node --test automation/tests/W13.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
// Loads the real logic (automation/lib/w13.mjs) and the real workflow (automation/W13.json) for the structure checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, cycle, pricing, clone, ms, iso, H, D, online } from './_harness.mjs';

// ============================================================================================
// The real module (automation/lib/w13.mjs, imported by the Code nodes of automation/W13.json)
// ============================================================================================
import { readFileSync } from 'node:fs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as R from '../lib/w13.mjs';
const { REBOOK_WAIT, DISPUTE_WINDOW, MAX_EXTENSION, replacementTrigger, claim, dispute, settle, decide, cycleState } = R;
const WF = JSON.parse(readFileSync(new URL('../W13.json', import.meta.url), 'utf8'));
// SYNTHETIC cycle price for the shortfall maths only. NOT a tier price (W25 forbids hard-coded prices).
export const SYNTHETIC_PRICE = 10000;

/** New cycle snapshots its cap from the pricing row (3.6 single source). */
export const newCycle = (tier, id = `cyc_${tier}`) => ({ ...clone(cycle()), cycle_id: id, tier_code: tier, committed_leads: pricing(tier).committed_leads, replacement_cap: pricing(tier).replacement_cap_cycle });

// ============================================================================================
// Tests
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
  const cyc = clone(cycle());
  const { row, alerts } = claim(cyc, rows, fx.lead_id, trig);
  assert.equal(row.reason, e.reason);
  assert.equal(row.dispute_window_ends_at, e.dispute_window_ends_at);
  assert.deepEqual(alerts, ['Jonathan: replacement_due']);
  assert.equal(settle(row, ms(e.dispute_window_ends_at) - 1), 'due', 'not approved inside the window');
  assert.equal(settle(row, ms(e.dispute_window_ends_at)), e.status_after_window);
  assert.equal(rows.filter((r) => r.cycle_id === cyc.cycle_id && r.status !== 'rejected').length, e.replacements_used_after);
});

test(`W13 [${MODE}] rebooking (or replying) inside 48 h means no replacement; a second no-show is due at once`, () => {
  const confirmed = '2026-10-15T17:00:00+02:00';
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, rebooked_at: '2026-10-16T09:00:00+02:00' }).due, false);
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, replied_at: '2026-10-17T16:59:00+02:00' }).due, false);
  assert.equal(replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, rebooked_at: '2026-10-17T17:01:00+02:00' }).due, true, 'too late');
  const second = replacementTrigger({ kind: 'no_show', confirmed_at: confirmed, second_no_show: true });
  assert.equal(second.due_at, confirmed);
});

test(`W13 [${MODE}] dispositions: only unreachable and nofit_criteria open a replacement; budget/covered/fit never do`, () => {
  const at = '2026-10-15T11:00:00+02:00';
  const due = FIX._meta.disposition_codes.filter((code) => replacementTrigger({ kind: 'disposition', code, at }).due);
  assert.deepEqual(due.sort(), ['nofit_criteria', 'unreachable']);
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'unreachable', at }).reason, 'uncontactable');
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'nofit_criteria', at }).reason, 'disqualified');
  assert.equal(replacementTrigger({ kind: 'disposition', code: 'did_not_buy', at }).due, false, 'never "didn\'t buy" (FAIS)');
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

for (const tier of ['SMC_BRONZE', 'SMC_SILVER', 'SMC_GOLD']) {
  test(`W13 [${MODE}] per-cycle cap for ${tier} comes from pricing (${pricing(tier).replacement_cap_cycle}); one more is refused + Jonathan alerted; no weekly cap`, () => {
    const cyc = newCycle(tier);
    const cap = pricing(tier).replacement_cap_cycle;
    assert.equal(cyc.replacement_cap, cap);
    const rows = [];
    const sameWeek = (i) => ({ due: true, reason: 'no_show', reason_code: 'no_show', due_at: iso(ms('2026-10-13T09:00:00+02:00') + i * H) });
    for (let i = 0; i < cap; i++) assert.equal(claim(cyc, rows, `lead_cap_${i}`, sameWeek(i)).row.status, 'due', `#${i + 1} (all in one week)`);
    const over = claim(cyc, rows, 'lead_cap_over', sameWeek(cap));
    assert.equal(over.row.status, 'rejected');
    assert.equal(over.row.note, 'cap_reached');
    assert.deepEqual(over.alerts, ['Jonathan: replacement cap reached']);
  });
}

test(`W13 [${MODE}] a rejected (disputed-and-upheld) claim frees its place under the cap; other cycles don't count`, () => {
  const cyc = newCycle('SMC_BRONZE');
  const rows = [{ lead_id: 'old', cycle_id: 'cyc_previous', status: 'approved' }];
  const t = (i) => ({ due: true, reason: 'no_show', reason_code: 'no_show', due_at: iso(ms('2026-10-13T09:00:00+02:00') + i * H) });
  const first = claim(cyc, rows, 'a', t(0)).row;
  for (const id of ['b', 'c', 'd']) claim(cyc, rows, id, t(1));
  dispute(first, ms(first.claimed_at) + H);
  decide(first, true);
  assert.equal(claim(cyc, rows, 'e', t(2)).row.status, 'due');
});

test(`W13 [${MODE}] 48-h dispute window: Lead Velocity can dispute at 47 h, not at 49 h; one replacement per lead`, () => {
  const rows = [];
  const cyc = clone(cycle());
  const trig = { due: true, reason: 'no_show', reason_code: 'no_show', due_at: '2026-10-17T17:00:00+02:00' };
  const { row } = claim(cyc, rows, 'lead_x', trig);
  const late = { ...row };
  dispute(row, ms(trig.due_at) + 47 * H);
  assert.equal(row.status, 'disputed');
  assert.throws(() => dispute(late, ms(trig.due_at) + 49 * H), /window closed/);
  assert.equal(claim(cyc, rows, 'lead_x', trig).row, row, 'idempotent per lead');
  assert.equal(rows.length, 1);
});

test(`W13 [${MODE}] shortfall: cycle extends up to 14 days; closes early once delivered; remaining shortfall credited at the plan's Effective Lead Price, capped at what was paid`, () => {
  const cyc = { ...clone(cycle()), renewing: true };
  const end = ms(cyc.ends_at);
  assert.equal(cycleState(cyc, { verified: 15, approvedReplacements: 0 }, end - D, SYNTHETIC_PRICE).status, 'active');
  const ext = cycleState(cyc, { verified: 18, approvedReplacements: 1 }, end, SYNTHETIC_PRICE);
  assert.equal(ext.status, 'extended');
  assert.equal(ext.extended_until, '2026-11-25T00:00:00+02:00');
  assert.equal(cycleState(cyc, { verified: 21, approvedReplacements: 1 }, end + 5 * D, SYNTHETIC_PRICE).status, 'closed', 'delivered on day 5 of the extension');
  const short = cycleState(cyc, { verified: 18, approvedReplacements: 0 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.deepEqual([short.status, short.shortfall, short.credit_zar, short.credit_as], ['closed', 2, SYNTHETIC_PRICE * 2 / 20, 'credit_next_cycle']);
  const leaving = cycleState({ ...cyc, renewing: false }, { verified: 18, approvedReplacements: 0 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.equal(leaving.credit_as, 'refund');
  const nothing = cycleState(cyc, { verified: 0, approvedReplacements: 3 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.equal(nothing.credit_zar, SYNTHETIC_PRICE, 'liability capped at the cycle price (no top-ups)');
  // NOTE (Jonathan 2026-10-10): cycles.committed_leads includes paid top-ups (W16), and an undelivered top-up lead is credited at the
  // plan's Effective Lead Price (price / the plan's own commitment), not by spreading it into the plan price. The cap becomes what
  // the broker paid for the cycle's leads: the plan price plus the top-up leads at that rate.
  const rate = SYNTHETIC_PRICE / 20; // 20 = the plan's own commitment in this fixture
  const withTopup = { ...cyc, committed_leads: 30, topup_leads: 10 };
  const partTopup = cycleState(withTopup, { verified: 26, approvedReplacements: 0 }, end + 14 * D, SYNTHETIC_PRICE); // plan delivered, 6 of 10 top-up leads
  assert.deepEqual([partTopup.status, partTopup.shortfall, partTopup.credit_zar], ['closed', 4, 4 * rate]);
  assert.ok(partTopup.credit_zar > (SYNTHETIC_PRICE * 4) / 30, 'not the old price / total-committed spread');
  const noneTopup = cycleState(withTopup, { verified: 0, approvedReplacements: 0 }, end + 14 * D, SYNTHETIC_PRICE);
  assert.equal(noneTopup.credit_zar, SYNTHETIC_PRICE + 10 * rate, 'capped at the plan price plus the top-up leads at the plan rate');
  assert.equal(cycleState(cyc, { verified: 20, approvedReplacements: 0 }, end, SYNTHETIC_PRICE).status, 'closed', 'on target: no extension');
});

// ============================================================================================
// Workflow checks: automation/W13.json runs automation/lib/w13.mjs; ONE replacement counter shared with W10/W12/W29
// ============================================================================================
import { runCode, templateCounts, allWorkflows, PG_CRED } from './_n8ncode.mjs';
import { paramCounts } from '../lib/wa.mjs';
import * as W10 from '../lib/w10.mjs';
const node = (name) => WF.nodes.find((n) => n.name === name);
const W10WF = JSON.parse(readFileSync(new URL('../W10.json', import.meta.url), 'utf8'));
const c1a = (reason_code) => {
  const lead = { id: 'lead_c1a', verified_at: '2026-10-08T09:05:00+02:00', first_message_at: '2026-10-08T09:00:40+02:00', conv_state: { rebook_offered: true, ...(reason_code === 'no_call' ? { declined_call: true } : {}) } };
  const booking = { id: 'bk_c1a', status: 'cancelled', cancelled_at: '2026-10-12T10:00:00+02:00', brand_id: 'brand_smc', broker_id: 'brk_test_mark', cycle_id: cycle().cycle_id };
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

test('ONE counter: W13.json is the only workflow that writes public.replacements; W10 / W12 / W29 call W13 by id smc-w13', () => {
  const writers = allWorkflows().filter(({ wf }) => /INSERT INTO public\.replacements|UPDATE public\.replacements/.test(JSON.stringify(wf))).map((x) => x.file);
  assert.deepEqual(writers, ['W13.json']);
  for (const f of ['W10.json', 'W12.json', 'W29.json']) {
    const wf = allWorkflows().find((x) => x.file === f).wf;
    assert.ok(wf.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflow' && n.parameters.workflowId.cachedResultName === 'W13 No-show & replacement' && n.parameters.workflowId.value === 'smc-w13'), f);
  }
  const q = node('Claim replacement (per-cycle lock, cap, one per lead)').parameters.query;
  assert.match(q, /pg_advisory_xact_lock\(hashtext\('w13:cycle:' \|\| \$4::text\)\);/, 'claims serialised per cycle');
  assert.match(q, /r\.cycle_id = \$4::uuid AND r\.status <> 'rejected'/, 'counted exactly like smc_replacements_cap / COUNTED');
  assert.match(q, /FROM public\.cycles cy WHERE cy\.id = \$4::uuid/, 'cap from the cycle row (snapshotted from pricing)');
  assert.match(q, /NOT \(x\.status = 'rejected' AND COALESCE\(x\.note, ''\) = 'withdrawn'\)/, 'one per lead; a withdrawn claim frees it');
  assert.match(q, /'cap_reached'/);
  assert.ok(!/replacement_cap\s*[:=]\s*[0-9]|\b(4|6|9)\s*AS cap\b/.test(JSON.stringify(WF)), 'no hard-coded caps');
  assert.deepEqual(R.COUNTED, new Set(['due', 'disputed', 'approved', 'fulfilled']));
});

test('W10 C1A claims and W12/W29 claims hit the same counter: same cycle cap, never two rows for one lead', () => {
  const cyc = newCycle('SMC_BRONZE');
  const rows = [];
  const viaW10 = R.normaliseInput(c1a('cancel_no_rebook'));
  assert.equal(viaW10.op, 'claim'); assert.equal(viaW10.outcome_id, null, 'C1A: no outcomes row'); assert.ok(R.validateInput(viaW10).ok);
  const t10 = R.claimDecision(viaW10, { cycle_id: cyc.cycle_id });
  assert.deepEqual([t10.trig.reason, t10.trig.reason_code], ['uncontactable', 'cancel_no_rebook']);
  assert.equal(claim(cyc, rows, viaW10.lead_id, t10.trig).row.status, 'due');
  // the same lead later no-shows a rebooked call: still ONE replacement for that lead
  assert.equal(claim(cyc, rows, viaW10.lead_id, replacementTrigger({ kind: 'no_show', confirmed_at: '2026-10-20T17:00:00+02:00', second_no_show: true })).row, rows[0]);
  const viaW29 = R.normaliseInput({ op: 'claim', outcome_id: 'out_9', reason: 'disqualified', reason_code: 'nofit_criteria' });
  claim(cyc, rows, 'lead_w29', R.claimDecision(viaW29, { cycle_id: cyc.cycle_id }).trig);
  claim(cyc, rows, 'lead_w12a', replacementTrigger({ kind: 'no_show', confirmed_at: '2026-10-15T17:00:00+02:00' }));
  claim(cyc, rows, 'lead_w12b', replacementTrigger({ kind: 'no_show', confirmed_at: '2026-10-15T17:00:00+02:00' }));
  const fifth = claim(cyc, rows, 'lead_c1a_2', R.claimDecision(R.normaliseInput({ ...c1a('no_call'), lead_id: 'lead_c1a_2' }), { cycle_id: cyc.cycle_id }).trig);
  assert.equal(fifth.row.status, 'rejected', 'Bronze 4: the 5th claim from ANY caller is over the cap');
  assert.equal(rows.filter((r) => R.COUNTED.has(r.status)).length, pricing('SMC_BRONZE').replacement_cap_cycle);
  // W10's own JSON sends the C1A claim with the contract key
  assert.match(W10WF.nodes.find((n) => n.name === 'C1A decision row (idempotency + evidence)').parameters.query, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
});

test('W13.json "Decide claim" node: C1A / W29 / system shapes; unverified uncontactable and non-trigger codes are logged, not claimed', async () => {
  const dec = async (input, row) => (await runCode(WF, 'Decide claim (w13.claimDecision)', { json: row, refs: { 'Claim input': input } })).json;
  const ctx = { lead_id: 'lead_c1a', cycle_id: cycle().cycle_id, replacement_cap: 4, verified_at: '2026-10-08T09:05:00+02:00', brand_id: 'brand_smc', broker_id: 'brk_test_mark' };
  const n = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: c1a('no_call') })).json;
  const d = await dec(n, ctx);
  assert.equal(d.claim, true); assert.deepEqual([d.trig.reason, d.trig.reason_code], ['disqualified', 'no_call']);
  const budget = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: { op: 'claim', outcome_id: 'o1', reason: 'disqualified', reason_code: 'nofit_budget' } })).json;
  assert.equal((await dec(budget, ctx)).why, 'counts_as_delivered');
  const sys = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: { op: 'claim', kind: 'uncontactable', lead_id: 'lead_x' } })).json;
  assert.equal((await dec(sys, { ...ctx, verified_at: null })).why, 'never_verified_never_counted');
  assert.equal((await dec(sys, ctx)).claim, true);
  assert.equal((await dec(n, { ...ctx, cycle_id: null })).why, 'no_cycle');
  const bad = (await runCode(WF, 'Normalise + validate (w13.normaliseInput)', { json: { op: 'decide', replacement_id: 'r1' } })).json;
  assert.equal(bad.op, 'reject'); assert.deepEqual(bad.missing, ['upheld']);
});

test('W13.json no-show path (L04): one missed_you offer with 3 times, 48-h clock, rebook/reply inside 48 h stops it, second no-show claims at once', async () => {
  const fx = lead('L04');
  const confirmed = fx.expected.W12.no_show_confirmed_at;
  const clk = async (over) => (await runCode(WF, 'No-show clock decision', { json: { lead_id: fx.lead_id, booking_id: 'bkg_L04', cycle_id: 'cyc_1', outcome_id: 'out_L04', confirmed_at: confirmed, confirmed_at_row: true, ...over }, refs: { 'Normalise + validate (w13.normaliseInput)': { op: 'tick' } } })).json;
  const due = await clk({});
  assert.deepEqual([due.trig.due, due.trig.due_at, due.trig.reason, due.decided_key], [true, fx.expected.W13.replacement_due_at, fx.expected.W13.reason, 'w13:no_show_decided:bkg_L04']);
  assert.equal((await clk({ rebooked_at: '2026-10-16T09:00:00+02:00' })).trig.why, 'rebooked');
  assert.equal((await clk({ rebooked_activity_at: '2026-10-16T09:00:00+02:00' })).trig.why, 'rebooked', 'W10 rebooked_after_no_show row stops the clock');
  assert.equal((await clk({ replied_at: '2026-10-16T12:00:00+02:00' })).trig.why, 'engaged_in_chat');
  const second = (await runCode(WF, 'No-show clock decision', { json: { lead_id: fx.lead_id, booking_id: 'bkg_L04b', cycle_id: 'cyc_1', second_no_show: true }, refs: { 'Normalise + validate (w13.normaliseInput)': { op: 'no_show', confirmed_at: confirmed, outcome_id: 'out_L04b' } } })).json;
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

test('W13.json: shortfall is W19\'s (emit replacement_approved only, never touch cycles); wording "committed", never "guaranteed"; W09 cancel_all on due', () => {
  const s = JSON.stringify(WF);
  assert.ok(!/UPDATE public\.cycles|INSERT INTO public\.cycles|shortfall_credit_zar|extended_until/.test(s), 'W13 never writes cycles / credits');
  assert.match(node('Settle: window closed -> approved (emit for W19)').parameters.query, /'replacement_approved'[\s\S]*'w13:approved:' \|\| s\.id::text/);
  assert.match(node('Withdraw (W29 correction, inside the window only)').parameters.query, /r\.status = 'due' AND r\.dispute_window_ends_at > \$3::timestamptz/);
  assert.match(node('Dispute (Lead Velocity, inside the 48-h window)').parameters.query, /status = 'due' AND dispute_window_ends_at > \$2::timestamptz/);
  for (const text of [s, readFileSync(new URL('../lib/w13.mjs', import.meta.url), 'utf8')]) assert.ok(!/guarantee/i.test(text), 'never "guaranteed" (0.1)');
  assert.match(R.alertNote('cap_reached', { lead: { first_name: 'Pieter', last_name: 'V' }, cap: 4, reason_code: 'no_show' }), /the committed number is unchanged/);
  assert.equal(WF.nodes.find((n) => n.name === 'W09 cancel_all (lead)').parameters.workflowId.cachedResultName, 'W09 Reminder sequence');
  assert.match(node('Send WhatsApp').parameters.url, /PHONE_NUMBER_ID/);
  assert.ok(WF.connections['Send WhatsApp'].main[0].some((c) => c.node === 'Touch leads.last_contact_at (lead outbound)'));
});

test('F11 (REHEARSAL-L01 exec 79) "Claim replacement" emits the lock row + the insert row: the alert node runs once over all items, no pairedItem lookup, one alert per real row', async () => {
  const NOTE = 'Alert + timeline text (w13.alertNote, committed wording)';
  const n = node(NOTE);
  assert.equal(n.parameters.mode, 'runOnceForAllItems', 'per-item mode resolved $(...).item through the lock row -> "reading \'pairedItem\'"');
  assert.ok(!/\.item\.json/.test(n.parameters.jsCode), 'no paired-item lookups');
  const decide = { lead_id: 'lead_test_L06', brand_id: 'brand_smc', broker_id: 'brk_mark', cycle_id: 'cyc_1', first_name: 'Pieter', last_name: 'V' };
  const lock = { pg_advisory_xact_lock: '' };
  const ins = { id: '070070bc-0951-42f6-af52-183d352ed3ba', lead_id: 'lead_test_L06', cycle_id: 'cyc_1', status: 'due', note: null, cap_position: 3, over_cap: false, dispute_window_ends_at: '2026-10-20T11:00:00Z', reason_code: 'no_show', cap: 4, used_after: 3 };
  const out = await runCode(WF, NOTE, { items: [lock, ins], refs: { 'Decide claim (w13.claimDecision)': decide } });
  assert.equal(out.length, 1, 'exactly one item: the replacements row');
  const r = out[0].json;
  assert.equal(r.id, ins.id); assert.equal(r.cap_position, 3); assert.equal(r.over_cap, false); assert.equal(r.status, 'due');
  assert.equal(r.brand_id, 'brand_smc'); assert.equal(r.broker_id, 'brk_mark'); assert.equal(r.activity, 'replacement_due');
  assert.match(r.note_text, /Pieter/);
  assert.deepEqual(out[0].pairedItem, { item: 1 }, 'paired to its own input row, so downstream $(NOTE).item resolves');
  // Over cap: the row is still written ('rejected' / cap_reached) and Jonathan is told, urgently.
  const over = await runCode(WF, NOTE, { items: [lock, { ...ins, status: 'rejected', note: 'cap_reached', cap_position: 5, over_cap: true }], refs: { 'Decide claim (w13.claimDecision)': decide } });
  assert.equal(over[0].json.cap_reached, true); assert.equal(over[0].json.severity, 'urgent'); assert.equal(over[0].json.over_cap, true);
  // Lead already has a replacement (insert skipped): only the lock row arrives -> nothing to alert.
  assert.deepEqual(await runCode(WF, NOTE, { items: [lock], refs: { 'Decide claim (w13.claimDecision)': decide } }), []);
});
