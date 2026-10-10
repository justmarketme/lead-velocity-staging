// DRAFT for GATE-TEST-W13 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W13 No-show & couldn't-reach replacement requests — Lead Generation Services Agreement clause 7 + Schedule 3
// (ux-sprint-1, 2026-10-07; "Couldn't reach them" added by Jonathan, 10 Oct 2026)
// Rule protected: a replacement is GOODWILL, AT LEAD VELOCITY'S DISCRETION, never an entitlement and never automatic.
//  * Only a broker request with proof (photo / screenshot) sent between start + 10 min and start + 30 min. Two kinds, one
//    rule: a no-show, and a lead the broker couldn't reach (call log / chat screenshot with at least 2 attempts and no
//    reply, or showing the number is wrong or invalid).
//  * At most 3 requests per Calendar Week per broker (Mon-Sun SAST, by the missed appointment's date), the two kinds
//    COMBINED in one counter, not 4/6/9 per cycle: pricing.replacement_cap_cycle stays in the data and drives nothing.
//  * A confirmed lead no-show gets ONE rebook offer (missed_you) and nothing else. The "Couldn't reach them" TAP is
//    outcome-only (clause 8.4; W12 never calls W13): the request arrives as the proof image. Dispositions, W10 C1A and
//    system "uncontactable" claims carry no proof: they are refused and logged (why proof_required).
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
import * as W12 from '../lib/w12.mjs';
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

// ============================================================================================
// "Couldn't reach them" (clause 7, Jonathan 10 Oct 2026): a goodwill request like a no-show, same window, same counter
// ============================================================================================
test(`W13 [${MODE}] clause 7 (Jonathan 10 Oct 2026): unreachable proof 10-30 min after the start = a request (reason uncontactable, schedule3_proof_unreachable); early, late or no proof = none`, () => {
  const trig = (min, extra = {}) => R.replacementTrigger({ kind: 'unreachable_proof', start_at: START, proof_at: iso(ms(START) + min * MIN), has_proof: true, ...extra });
  assert.deepEqual(trig(15), { due: true, reason: 'uncontactable', reason_code: 'schedule3_proof_unreachable', due_at: iso(ms(START) + 15 * MIN) });
  assert.equal(trig(10).due, true, 'inclusive at start + 10');
  assert.equal(trig(30).due, true, 'inclusive at start + 30');
  assert.deepEqual([trig(9.5).due, trig(9.5).why], [false, 'too_early']);
  assert.deepEqual([trig(30.5).due, trig(30.5).why], [false, 'too_late']);
  assert.equal(trig(15, { has_proof: false }).why, 'proof_missing', 'no screenshot, no request');
  assert.equal(trig(15, { used_this_week: 3 }).why, 'weekly_max');
  assert.equal(trig(15, { already_requested: true }).why, 'already_requested');
  // the no-show trigger is untouched
  assert.deepEqual(R.replacementTrigger({ kind: 'noshow_proof', start_at: START, proof_at: iso(ms(START) + 15 * MIN), has_proof: true }).reason_code, 'schedule3_proof');
  // the in-memory model of the Record request SQL stores the same pair
  const rows = [];
  const ok = R.request(rows, req({ kind: 'unreachable' }));
  assert.deepEqual([ok.row.status, ok.row.reason, ok.row.reason_code, ok.used], ['due', 'uncontactable', 'schedule3_proof_unreachable', 1]);
  assert.equal(R.request(rows, req({ kind: 'unreachable', booking_id: 'bk_y', proof_sent_at: iso(ms(START) + 9 * MIN) })).why, 'too_early');
  assert.equal(R.request(rows, req({ kind: 'unreachable', booking_id: 'bk_z', proof_sent_at: iso(ms(START) + 31 * MIN) })).why, 'too_late', 'Schedule 3.4: the lead still counts as Delivered');
  assert.equal(R.request(rows, req({ kind: 'unreachable', booking_id: 'bk_w', proof_path: null })).why, 'proof_missing');
  assert.equal(R.request(rows, req({ kind: 'unreachable' })).why, 'already_requested', 'same booking twice');
});

test(`W13 [${MODE}] request kind: the caption decides first, else the booked method (phone / whatsapp_call = unreachable; teams / zoom / meet / in person = no_show)`, () => {
  const k = (caption, method) => R.requestKind({ caption, method });
  // caption wording
  for (const c of ['Couldn\'t reach him', 'could not reach her', 'unreachable', 'No answer after 3 calls', 'he did not answer', 'didnt answer', 'wrong number', 'Invalid number', 'number is not valid', 'not a valid number', 'straight to voicemail', 'call log', 'not on whatsapp']) assert.equal(k(c, 'teams'), 'unreachable', c);
  for (const c of ['No-show', 'no show', 'noshow', 'He didn\'t show', 'didnt come', 'she did not arrive', 'did not join', 'empty room', 'empty call', 'Empty meeting']) assert.equal(k(c, 'phone'), 'no_show', `${c} (caption beats the method)`);
  // method fallback
  assert.equal(k('', 'phone'), 'unreachable');
  assert.equal(k(undefined, 'whatsapp_call'), 'unreachable');
  assert.equal(k('', 'teams'), 'no_show');
  assert.equal(k('see attached', 'zoom'), 'no_show');
  assert.equal(k(null, 'meet'), 'no_show');
  assert.equal(k('', 'in_person'), 'no_show');
  assert.equal(k('', undefined), 'no_show', 'nothing to go on: the no-show wording (the proof is the same)');
  assert.equal(k('', 'PHONE'), 'unreachable', 'case-insensitive');
  assert.equal(R.requestKind(), 'no_show');
  // a caption that matches both wordings is read as unreachable (the call-attempt evidence is the more specific)
  assert.equal(k('no show, did not answer', 'teams'), 'unreachable');
  // the same decision inside requestPlan: the caption comes from the W07 caption, the method from the booking
  const plan = (caption, method, over = {}) => R.requestPlan({ proof_at: iso(ms(START) + 15 * MIN), media: 'image', media_id: 'm1', caption, ...over }, { booking_id: 'bk', missed_start_at: START, used_this_week: 0, method });
  assert.deepEqual([plan('', 'phone').kind, plan('', 'phone').write], ['unreachable', { reason: 'uncontactable', reason_code: 'schedule3_proof_unreachable', activity_type: 'unreachable_proof_sent', idem_prefix: 'w13:unreachable_proof' }]);
  assert.deepEqual([plan('', 'teams').kind, plan('', 'teams').write], ['no_show', { reason: 'no_show', reason_code: 'schedule3_proof', activity_type: 'noshow_proof_sent', idem_prefix: 'w13:noshow_proof' }]);
  assert.equal(plan('wrong number', 'teams').kind, 'unreachable', 'caption beats method');
  assert.equal(plan('no show', 'phone').kind, 'no_show', 'caption beats method');
  assert.deepEqual([plan('', 'phone', { media: 'audio' }).record, plan('', 'phone', { media: 'audio' }).why], [false, 'proof_missing']);
  // replacements.reason maps back to the kind
  assert.deepEqual([R.kindOfReason('uncontactable'), R.kindOfReason('no_show')], ['unreachable', 'no_show']);
});

test(`W13 [${MODE}] SHARED COUNTER: no-shows and unreachables are ONE count of 3 per Calendar Week; every row counts, decided or not; the next week starts fresh`, () => {
  const rows = [];
  const wk = (day, i) => { const s = iso(ms('2026-10-12T09:00:00+02:00') + day * D + i * H); return req({ booking_id: `bk_${day}_${i}`, lead_id: `ld_${day}_${i}`, missed_start_at: s, proof_sent_at: iso(ms(s) + 12 * MIN) }); };
  // 2 no-shows + 1 unreachable = 3 (clause 7 (Jonathan 10 Oct 2026): ONE counter)
  assert.equal(R.request(rows, wk(0, 0)).used, 1);
  assert.equal(R.request(rows, wk(1, 0)).used, 2);
  const third = R.request(rows, { ...wk(2, 0), kind: 'unreachable' });
  assert.deepEqual([third.used, third.row.reason, third.row.cap_position], [3, 'uncontactable', 3]);
  R.decide(rows[0], false); // a declined request still counts
  // the 4th request of EITHER kind is refused weekly_max
  assert.equal(R.request(rows, wk(3, 0)).why, 'weekly_max', '4th, a no-show');
  assert.equal(R.request(rows, { ...wk(3, 1), kind: 'unreachable' }).why, 'weekly_max', '4th, an unreachable');
  assert.equal(R.request(rows, { ...wk(6, 0), kind: 'unreachable' }).why, 'weekly_max', 'Sunday is still the same Calendar Week');
  // the same booking twice is already_requested, whichever kind asks the second time
  assert.equal(R.request(rows, { ...wk(0, 0), kind: 'unreachable' }).why, 'already_requested');
  assert.equal(R.request(rows, wk(2, 0)).why, 'already_requested');
  // the other direction: 2 unreachable + 1 no-show = 3, then the 4th is refused too
  const rows2 = [];
  R.request(rows2, { ...wk(0, 0), kind: 'unreachable' }); R.request(rows2, { ...wk(1, 0), kind: 'unreachable' });
  assert.equal(R.request(rows2, wk(2, 0)).used, 3);
  assert.equal(R.request(rows2, wk(4, 0)).why, 'weekly_max');
  assert.equal(R.request(rows2, { ...wk(4, 1), kind: 'unreachable' }).why, 'weekly_max');
  // Monday 00:00 SAST starts a new Calendar Week for both kinds; another broker has its own count
  assert.equal(R.request(rows2, { ...wk(7, 0), kind: 'unreachable' }).used, 1);
  assert.equal(R.request(rows2, wk(7, 1)).used, 2);
  assert.equal(R.request(rows2, { ...wk(4, 2), broker_id: 'brk_other', kind: 'unreachable' }).used, 1);
  // no per-cycle cap in the rows or the model
  assert.ok(rows.every((r) => r.over_cap === false));
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

test(`W13 [${MODE}] nothing without a proof image opens a replacement: lead no-show (first or second), every disposition (incl. unreachable), C1A, system uncontactable, broker no-show`, () => {
  const at = '2026-10-15T11:00:00+02:00';
  assert.equal(R.replacementTrigger({ kind: 'no_show', confirmed_at: at, second_no_show: true }).due, false);
  for (const code of FIX._meta.disposition_codes) assert.equal(R.replacementTrigger({ kind: 'disposition', code, at }).due, false, code);
  // clause 7 (Jonathan 10 Oct 2026): was 'feedback_only' / 'clause7_request_only'. An unreachable lead CAN earn a request now, but only with the
  // broker's proof image (kind 'unreachable_proof'); a disposition, a C1A claim or a system 'uncontactable' carries no proof -> 'proof_required'.
  assert.equal(R.replacementTrigger({ kind: 'disposition', code: 'unreachable', at }).why, 'proof_required');
  for (const kind of ['c1a', 'uncontactable']) assert.equal(R.replacementTrigger({ kind, verified: true, at }).why, 'proof_required', kind);
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

test(`W13 [${MODE}] broker replies per kind (clause 7, Jonathan 10 Oct 2026): the rule names both, the proof line follows the kind, the lead always counts as delivered, no reply promises a replacement`, () => {
  const RULE = "A replacement is a goodwill gesture, at Lead Velocity's discretion, for no-shows and for leads you couldn't reach: up to 3 requests a week combined, with proof sent between 10 and 30 minutes after the start.";
  const UNREACH_PROOF = 'a screenshot of your call log or WhatsApp chat with them showing at least 2 attempts since the start time and no reply, or showing the number is wrong or invalid';
  const NOSHOW_PROOF = 'a photo of the place showing the time, or a screenshot of the call showing the time and that only you were there';
  const has = (text, part, msg) => assert.ok(text.includes(part), `${msg}: expected to contain "${part}" in "${text}"`);
  const hasnt = (text, part, msg) => assert.ok(!text.includes(part), `${msg}: must not contain "${part}" in "${text}"`);
  const base = { lead_first_name: 'Pieter', missed_start_at: START, used_after: 2, used_this_week: 3 };
  for (const rk of ['no_show', 'unreachable']) {
    const ctx = { ...base, request_kind: rk };
    const mine = rk === 'unreachable' ? UNREACH_PROOF : NOSHOW_PROOF;
    const other = rk === 'unreachable' ? NOSHOW_PROOF : UNREACH_PROOF;
    for (const k of ['too_early', 'too_late', 'proof_missing']) has(R.brokerReply(k, ctx), RULE, `${rk} ${k}`);
    has(R.brokerReply('too_early', ctx), mine, `${rk} too_early`);
    has(R.brokerReply('proof_missing', ctx), mine, `${rk} proof_missing`);
    hasnt(R.brokerReply('too_early', ctx), other, `${rk}: only its own proof line`);
    has(R.brokerReply('requested', ctx), "Request 2 of 3 this week (no-shows and leads you couldn't reach count together). A replacement is a goodwill gesture, at Lead Velocity's discretion; we'll tell you here once we've decided. The lead still counts as delivered.", rk);
    has(R.brokerReply('too_late', ctx), 'too late for a replacement request and still counts as delivered', rk);
    has(R.brokerReply('weekly_max', ctx), "already sent 3 replacement requests this week (no-shows and leads you couldn't reach count together), the most we can consider, so this one still counts as delivered.", rk);
    for (const k of ['requested', 'too_early', 'too_late', 'weekly_max', 'already_requested', 'proof_missing', 'declined', 'no_booking']) {
      assert.doesNotMatch(R.brokerReply(k, ctx), /we'll send you a replacement|you will get a replacement|is yours|entitle|guarantee|you are owed|per cycle/i, `${rk} ${k}: never a promise`);
    }
  }
  has(R.brokerReply('requested', { ...base, request_kind: 'unreachable' }), "proof that you couldn't reach Pieter (14:00)", 'unreachable requested');
  has(R.brokerReply('requested', { ...base, request_kind: 'no_show' }), 'we have your proof for Pieter (14:00)', 'no_show requested');
  assert.ok(R.brokerReply('too_late', { ...base, request_kind: 'unreachable' }).startsWith("Noted as a lead you couldn't reach."));
  assert.ok(R.brokerReply('too_late', { ...base, request_kind: 'no_show' }).startsWith('Noted as a no-show.'));
  // no kind known (no booking matched): the rule line still names both kinds
  has(R.brokerReply('no_booking', {}), RULE, 'no_booking');
  // the console note says which kind it is
  const un = R.alertNote({ lead: { first_name: 'Pieter' }, used: 3, missed_start_at: START, proof_path: 'p', kind: 'unreachable' });
  has(un, "Pieter: broker couldn't-reach proof", 'unreachable note');
  has(un, "request 3 of 3 this Calendar Week (no-shows and couldn't-reach requests share one count)", 'unreachable note');
  has(un, 'the committed number and Delivered are unchanged', 'unreachable note');
  const ns = R.alertNote({ lead: { first_name: 'Pieter' }, used: 1, missed_start_at: START, proof_path: 'p' });
  has(ns, 'Pieter: broker no-show proof', 'no-show note');
  has(ns, 'request 1 of 3 this Calendar Week', 'no-show note');
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
  // clause 7 (Jonathan 10 Oct 2026): the counter counts ALL rows of the broker-week (no reason filter), so no-shows and unreachables share it
  assert.match(q, /r\.broker_id = \$4::uuid AND public\.smc_week_start\(coalesce\(r\.missed_start_at, r\.claimed_at\)\) = public\.smc_week_start\(\$6::timestamptz\)\)/, 'counted like smc_request_replacement');
  assert.doesNotMatch(q.replace(/--[^\n]*/g, ''), /r\.reason|reason\s*=|reason\s+IN/i, 'the shared counter does not filter by reason');
  assert.match(q, /WHERE used\.n < 3 AND NOT EXISTS \(SELECT 1 FROM public\.replacements x WHERE x\.booking_id = \$2::uuid\)/);
  // clause 7 (Jonathan 10 Oct 2026): reason and reason_code are parameters 9 and 10 (were hard-coded 'no_show' / 'schedule3_proof')
  assert.match(q, /\$5::uuid, \$9::text, \$10::text, \$2::uuid, \$6::timestamptz, \$7, \$8::timestamptz, \$8::timestamptz, 'due'/);
  assert.doesNotMatch(q.replace(/--[^\n]*/g, ''), /'no_show'|'uncontactable'|'schedule3_proof/, 'the kind is a parameter, not a literal');
  assert.match(q, /RETURNING id, lead_id, cycle_id, broker_id, brand_id, booking_id, missed_start_at, proof_path, reason, reason_code\)/);
  assert.match(node('Record request (per broker-week lock, max 3, one per booking)').parameters.options?.queryReplacement, /\$json\.proof_at, \$json\.reason, \$json\.reason_code\] \}\}$/);
  const logic = JSON.stringify(WF.nodes.filter((x) => x.type !== 'n8n-nodes-base.stickyNote').map((x) => x.parameters));
  assert.ok(!/replacement_cap|cap_reached|dispute_window_ends_at/.test(logic), 'no per-cycle cap, no self-approving window');
  const ctx = node('Request context (booking in the proof window, requests this week)').parameters.query;
  assert.match(ctx, /a\.broker_id = \$1::uuid/, "only the broker's own bookings");
  // clause 7 (Jonathan 10 Oct 2026): the booked method travels with the context (it picks the kind when the caption does not)
  assert.match(ctx, /a\.appointment_date AS missed_start_at, a\.method, l\.first_name AS lead_first_name/);
  assert.match(ctx, /bk\.missed_start_at, bk\.method, bk\.lead_first_name,/);
  // the same count in the context query: every row of the broker-week, whatever its reason
  assert.match(ctx, /WHERE r\.broker_id = b\.id\n\s+AND public\.smc_week_start\(coalesce\(r\.missed_start_at, r\.claimed_at\)\) = public\.smc_week_start\(bk\.missed_start_at\)\)::int AS used_this_week/);
});

test('W13.json request path: W07 broker photo -> plan -> record or a reply that says why; the recorded request goes to the console and the broker hears back', async () => {
  const fx = lead('L04').expected.W13;
  const msg = { from: '+27600000099', media: 'image', media_id: 'mid_1', wamid: 'wamid.P', at_ms: ms(fx.proof_at) };
  const n = (await runCode(WF, NORM, { json: { source: 'W07', route: 'W13', msg, from_broker_id: 'brk_mark' } })).json;
  assert.deepEqual([n.op, n.broker_id, n.proof_at, n.proof_path, n.broker_phone], ['request', 'brk_mark', fx.proof_at, 'whatsapp-media:mid_1', '+27600000099']);
  // clause 7 (Jonathan 10 Oct 2026): the W07 caption (msg.text) travels as `caption` and picks the request kind; no caption = ''
  assert.equal(n.caption, '');
  const nCap = (await runCode(WF, NORM, { json: { source: 'W07', route: 'W13', msg: { ...msg, text: '  Couldn\'t reach him, wrong number  ' }, from_broker_id: 'brk_mark' } })).json;
  assert.equal(nCap.caption, "Couldn't reach him, wrong number");
  assert.equal(R.normaliseInput({ source: 'W07', msg: { ...msg, text: 'x'.repeat(2000) }, from_broker_id: 'b' }).caption.length, 1024, 'bounded');
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
  // clause 7 (Jonathan 10 Oct 2026): the plan carries the kind and the columns the SQL takes as parameters
  assert.deepEqual([ok.kind, ok.reason, ok.reason_code, ok.activity_type, ok.idem_prefix], ['no_show', 'no_show', 'schedule3_proof', 'noshow_proof_sent', 'w13:noshow_proof'], 'no caption and no method = the no-show wording (the proof is the same)');
  const phone = await plan({ method: 'phone' });
  assert.deepEqual([phone.record, phone.kind, phone.reason, phone.reason_code, phone.activity_type, phone.idem_prefix], [true, 'unreachable', 'uncontactable', 'schedule3_proof_unreachable', 'unreachable_proof_sent', 'w13:unreachable_proof'], 'a phone appointment: the only proof is a call log');
  const wrongNum = await plan({ method: 'teams' }, { caption: 'Wrong number' });
  assert.deepEqual([wrongNum.record, wrongNum.kind, wrongNum.reason, wrongNum.reason_code], [true, 'unreachable', 'uncontactable', 'schedule3_proof_unreachable'], 'the caption beats the method');
  const teams = await plan({ method: 'teams' }, { caption: '' });
  assert.deepEqual([teams.kind, teams.reason], ['no_show', 'no_show']);
  // refused unreachable requests are answered in the unreachable wording; the unreachable proof has the same window and counter
  const earlyU = await plan({ method: 'phone' }, { proof_at: iso(ms(START) + 9 * MIN) });
  assert.deepEqual([earlyU.record, earlyU.why, earlyU.kind], [false, 'too_early', 'unreachable']);
  assert.match(earlyU.reply.wa.text.body, /showing at least 2 attempts since the start time and no reply/);
  const lateU = await plan({ method: 'phone' }, { proof_at: iso(ms(START) + 31 * MIN) });
  assert.deepEqual([lateU.record, lateU.why], [false, 'too_late']);
  assert.match(lateU.reply.wa.text.body, /^Noted as a lead you couldn't reach\. .*too late for a replacement request and still counts as delivered/);
  assert.equal((await plan({ method: 'phone', used_this_week: 3 })).why, 'weekly_max', 'the same counter');
  assert.equal((await plan({ method: 'phone', used_this_week: 2 })).record, true, '2 no-shows already + this unreachable = the 3rd');
  assert.equal((await plan({ method: 'phone' }, { media: 'audio' })).why, 'proof_missing');
  // the record batch returns the lock row + the insert row: one console note, one broker reply
  const NOTE = 'Request recorded -> console note + broker reply (w13.alertNote)';
  assert.equal(node(NOTE).parameters.mode, 'runOnceForAllItems');
  const ins = { id: 'rep_1', lead_id: 'lead_test_L04', cycle_id: 'cyc_1', broker_id: 'brk_mark', brand_id: 'brand_smc', booking_id: 'bkg_L04', missed_start_at: START, proof_path: 'whatsapp-media:mid_1', reason: 'no_show', reason_code: 'schedule3_proof', used_after: 1 };
  const out = await runCode(WF, NOTE, { items: [{ pg_advisory_xact_lock: '' }, ins], refs: { 'Request plan (w13.requestPlan)': ok } });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].pairedItem, { item: 1 });
  assert.match(out[0].json.note_text, /esc_kind=replacement_request; .*broker no-show proof.*request 1 of 3 this Calendar Week.*Lead Velocity's discretion/);
  assert.match(out[0].json.reply.wa.text.body, /Request 1 of 3 this week/);
  assert.deepEqual([out[0].json.request_kind, out[0].json.activity_type, out[0].json.activity_key], ['no_show', 'noshow_proof_sent', 'w13:noshow_proof:bkg_L04']);
  // the unreachable row (reason read back from the table): console note, timeline type and key, and the reply follow it
  const insU = { ...ins, id: 'rep_2', reason: 'uncontactable', reason_code: 'schedule3_proof_unreachable', used_after: 3 };
  const outU = await runCode(WF, NOTE, { items: [{ pg_advisory_xact_lock: '' }, insU], refs: { 'Request plan (w13.requestPlan)': phone } });
  assert.equal(outU.length, 1);
  assert.deepEqual([outU[0].json.request_kind, outU[0].json.activity_type, outU[0].json.activity_key], ['unreachable', 'unreachable_proof_sent', 'w13:unreachable_proof:bkg_L04']);
  assert.match(outU[0].json.note_text, /esc_kind=replacement_request; Pieter: broker couldn't-reach proof .*request 3 of 3 this Calendar Week \(no-shows and couldn't-reach requests share one count\).*the committed number and Delivered are unchanged/);
  assert.match(outU[0].json.reply.wa.text.body, /we have your proof that you couldn't reach Pieter .*Request 3 of 3 this week.*The lead still counts as delivered/);
  assert.doesNotMatch(outU[0].json.reply.wa.text.body, /we'll send you a replacement/i);
  assert.deepEqual(await runCode(WF, NOTE, { items: [{ pg_advisory_xact_lock: '' }], refs: { 'Request plan (w13.requestPlan)': ok } }), [], 'lost the race: nothing recorded, nothing said');
  // the timeline row follows the kind (parameters 8 and 9), not a literal
  const esc = node('Escalate (console decides) + timeline');
  assert.match(esc.parameters.query, /'W13', 'broker', \$8::text, jsonb_build_object\('booking_id', \$7::text, 'replacement_id', \$2::text, 'via', 'whatsapp'\), now\(\), \$9::text\)/);
  assert.doesNotMatch(esc.parameters.query, /noshow_proof_sent|unreachable_proof_sent|w13:noshow_proof/, 'no hard-coded kind');
  assert.match(esc.parameters.options.queryReplacement, /\$json\.booking_id, \$json\.activity_type, \$json\.activity_key\] \}\}$/);
  assert.match(node('Timeline: no request (why)').parameters.query, /'request_kind', \$7::text/);
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
  // clause 7 (Jonathan 10 Oct 2026): every claim without a proof image is refused with why 'proof_required' (was 'clause7_request_only' / 'feedback_only');
  // an unreachable lead can still earn a request, but only through the proof image (op request), never through a claim, a disposition or a tap.
  for (const [j, why] of [[c1a('no_call'), 'proof_required'], [c1a('cancel_no_rebook'), 'proof_required'], [{ op: 'claim', outcome_id: 'o1', reason: 'uncontactable', reason_code: 'unreachable' }, 'proof_required'], [{ op: 'claim', kind: 'uncontactable', lead_id: 'lx' }, 'proof_required'], [{ op: 'withdraw', outcome_id: 'o1', reason_code: 'nofit_criteria' }, 'counts_as_delivered']]) {
    const n = await norm(j);
    assert.deepEqual([n.op, n.why], ['refuse', why], JSON.stringify(j));
  }
  // W29 sub-call shape (disposition 'unreachable' arrives as j.d.w13 + j.o): also refused, logged as replacement_not_opened
  const w29 = await norm({ d: { w13: { op: 'claim', reason: 'uncontactable', reason_code: 'unreachable' } }, o: { lead_id: 'lx', cycle_id: 'cy' } });
  assert.deepEqual([w29.op, w29.why, w29.source], ['refuse', 'proof_required', 'W29']);
  assert.match(node('Timeline: not a replacement (refused, why)').parameters.query, /'replacement_not_opened'/);
  // none of those paths reaches a replacement write
  const refuseDown = new Set(); const walkR = (x) => { for (const outs of WF.connections[x]?.main || []) for (const c of outs) if (!refuseDown.has(c.node)) { refuseDown.add(c.node); walkR(c.node); } };
  walkR('Timeline: not a replacement (refused, why)');
  assert.ok(![...refuseDown].some((x) => /Record request|Escalate/.test(x)), 'a refused claim never writes a request');
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

// ============================================================================================
// Templates and docs stay consistent with the rule (clause 7, Jonathan 10 Oct 2026)
// ============================================================================================
test('broker_outcome_check stays the Meta-approved 4-button UTILITY template (no replacement wording, payloads unchanged); the README row says the replacement request comes only from the proof image', () => {
  const tpl = JSON.parse(readFileSync(new URL('../templates/broker_outcome_check.json', import.meta.url), 'utf8'));
  assert.equal(tpl.category, 'UTILITY');
  const body = tpl.components.find((c) => c.type === 'BODY').text;
  assert.doesNotMatch(body, /replac/i, 'the template says nothing about replacements: changing it would need Meta re-approval');
  assert.deepEqual(tpl.components.find((c) => c.type === 'BUTTONS').buttons.map((b) => b.text), ['Met them', 'No-show', "Couldn't reach them", 'Moved to another time']);
  // the payloads W12 sends are unchanged (attended / no_show / unreachable / rescheduled :{booking})
  const m = W12.outcomeCheckMessage({ id: 'bk1', appointment_date: START }, { first_name: 'Lerato', last_name: 'Mokoena' }, { adviser_name: 'Mark Smith', whatsapp_number: '+27600000099' });
  assert.deepEqual(m.wa.template.components.filter((c) => c.sub_type === 'quick_reply').map((c) => c.parameters[0].payload), ['attended:bk1', 'no_show:bk1', 'unreachable:bk1', 'rescheduled:bk1']);
  const readme = readFileSync(new URL('../templates/README.md', import.meta.url), 'utf8');
  const row = readme.split('\n').find((l) => l.startsWith('| 21 | `broker_outcome_check`'));
  assert.ok(row, 'README row 21');
  assert.match(row, /`attended` \/ `no_show` \/ `unreachable` \/ `rescheduled`/);
  assert.match(row, /clause 8\.4: attendance and contact only/);
  assert.match(row, /The tap only records the outcome; it never requests a replacement/);
  assert.match(row, /unreachable lead \(like a no-show\) can ALSO earn a goodwill replacement request under clause 7, but only through the proof image the broker sends W13 10 to 30 minutes after the start, 3 requests a week combined, Lead Velocity decides/);
  assert.doesNotMatch(readme, /feedback only|never a replacement|no replacement/i, 'no stale "feedback only / no replacement" rule left in the template index');
});

test('docs: CONTRACTS.md W13 rows and the state machine describe the request / decide / refuse interface and 3 a Calendar Week combined, not claim / withdraw and a per-cycle cap', () => {
  const contracts = readFileSync(new URL('../CONTRACTS.md', import.meta.url), 'utf8');
  const rows = contracts.split('\n').filter((l) => l.startsWith('| `W13 '));
  assert.ok(rows.length >= 5, 'W13 interface rows: sub-workflow table + no_show / request / decide-refuse / billing events');
  const joined = rows.join('\n');
  assert.match(joined, /3 requests per Calendar Week/i);
  assert.match(joined, /combined/i);
  assert.match(joined, /schedule3_proof_unreachable/);
  assert.doesNotMatch(joined, /Bronze 4 \/ Silver 6 \/ Gold 9|`withdraw` only before|over the cap/i, 'the old per-cycle cap interface is gone');
  assert.match(joined, /no per-cycle cap/, 'the rows say there is none');
  assert.match(joined, /why `proof_required`/);
  const sm = readFileSync(new URL('../../conversation/state-machine.md', import.meta.url), 'utf8');
  assert.doesNotMatch(sm, /per-cycle cap/i);
  assert.match(sm, /goodwill replacement request with proof, 3 a week combined/);
  assert.doesNotMatch(sm, /replacement_due/, 'no 48 h silence / replacement_due path any more');
});
