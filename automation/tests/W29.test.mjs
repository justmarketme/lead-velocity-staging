// W29 Feedback loop - synthetic tests (fixtures only). DRAFT for Jonathan (4C.2). Run: node --test automation/tests/W29.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIX, lead, ms, iso, D, template, renderBody } from './_harness.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as F from '../lib/w29.mjs';

const WF = JSON.parse(readFileSync(new URL('../W29.json', import.meta.url), 'utf8'));
// clause 8.4 (ux-sprint-1): the disposition list moved to templates/retired/ (was templates/session/)
const LIST = JSON.parse(readFileSync(new URL('../templates/retired/broker_disposition_list.json', import.meta.url), 'utf8'));
const L01 = lead('L01');
const E = L01.expected.W12;
const DISP_AT = ms(E.broker_fit_followup_at) - 7 * D; // the tap that set fit_followup
const attended = (over = {}) => ({ id: 'out_L01', booking_id: 'bk_L01', lead_id: L01.lead_id, outcome: 'attended', disposition_code: null, quality_score: null, auto_marked: false, ...over });
const RETIRED = { error: 'retired: agreement clause 8.4' };

test('codes: the six 4.12a codes are kept only to read historic rows; the disposition templates are retired and never submitted', () => {
  assert.deepEqual(F.CODES, FIX._meta.disposition_codes);
  const rows = LIST.interactive.action.sections.flatMap((s) => s.rows);
  assert.deepEqual(rows.map((r) => r.id), F.CODES);
  // clause 8.4 (ux-sprint-1): the templates live in retired/ and are out of submit.sh (was: broker_disposition has 6 buttons)
  const sh = readFileSync(new URL('../templates/submit.sh', import.meta.url), 'utf8');
  for (const n of ['broker_disposition', 'broker_quality', 'broker_fit_followup']) {
    assert.throws(() => template(n), /ENOENT/, `${n} is not a live template`);
    assert.ok(JSON.parse(readFileSync(new URL(`../templates/retired/${n}.json`, import.meta.url), 'utf8')).name === n);
    assert.doesNotMatch(sh.match(/REST=\(([\s\S]*?)\n\)/)[1], new RegExp(`\\b${n}\\b`), `${n} not submitted`);
  }
});

test('parse broker replies: list row, quick-reply payload, quality tap/typed, voice note (retired), follow-up taps, noise', () => {
  for (const c of F.CODES) assert.deepEqual(F.parseBrokerReply({ list_id: c }), { kind: 'disposition', value: c });
  assert.deepEqual(F.parseBrokerReply({ payload: 'nofit_budget:bk_L01' }), { kind: 'disposition', value: 'nofit_budget', booking_id: 'bk_L01' });
  assert.deepEqual(F.parseBrokerReply({ payload: 'quality:4:bk_L01' }), { kind: 'quality', value: 4, booking_id: 'bk_L01' });
  assert.equal(F.parseBrokerReply({ payload: '5' }).value, 5);
  assert.equal(F.parseBrokerReply({ text: '3' }).value, 3);
  assert.equal(F.parseBrokerReply({ text: '7' }).kind, 'unknown');
  // clause 8.4 (ux-sprint-1): audio parses as 'retired' (no Kind output), so the media is never fetched or transcribed
  assert.deepEqual(F.parseBrokerReply({ media: 'audio', media_id: 'm1' }), { kind: 'retired', value: 'voice' });
  assert.equal(F.parseBrokerReply({ payload: `fit_followup:${L01.lead_id}:done` }).value, 'done');
  assert.equal(F.parseBrokerReply({ payload: `fit_followup:${L01.lead_id}:open` }).value, 'open');
  assert.equal(F.parseBrokerReply({ text: 'thanks' }).kind, 'unknown');
});

test('L01: the fit_followup disposition and the quality 4 tap are refused (clause 8.4); nothing is written, no replacement', () => {
  // clause 8.4 (ux-sprint-1): applyDisposition refuses with no update (was: disposition_code fit_followup, ask_quality, +7 d nudge)
  assert.deepEqual(F.applyDisposition(attended(), E.disposition_code, DISP_AT), RETIRED);
  // clause 8.4 (ux-sprint-1): applyQuality refuses with no update (was: quality_score 4, next thanks)
  assert.deepEqual(F.applyQuality(attended({ disposition_code: 'fit_followup' }), E.quality_score), RETIRED);
  assert.equal(L01.expected.W13.replacement, false);
});

test('replacements (W13): no disposition opens or withdraws a replacement any more (clause 8.4)', () => {
  // clause 8.4 (ux-sprint-1): every code, incl. unreachable / nofit_criteria and a correction, is refused, so W13 is never called
  for (const c of F.CODES) {
    const d = F.applyDisposition(attended(), c, DISP_AT);
    assert.deepEqual(d, RETIRED, c); assert.equal(F.w13Call(attended(), d), null, c);
  }
  assert.deepEqual(F.applyDisposition(attended({ disposition_code: 'unreachable' }), 'fit_proceeding', DISP_AT), RETIRED);
});

test('guards: disposition and quality are refused on every outcome (clause 8.4)', () => {
  // clause 8.4 (ux-sprint-1): one refusal for all inputs (was: per-outcome / 1-5 / unknown-code guards)
  for (const o of [attended(), attended({ outcome: 'no_show' }), attended({ outcome: 'broker_no_show' }), attended({ outcome: 'unreachable' })]) {
    assert.deepEqual(F.applyDisposition(o, 'fit_proceeding', DISP_AT), RETIRED);
    for (const q of [0, 3, 6]) assert.deepEqual(F.applyQuality(o, q), RETIRED);
  }
});

test('voice note: refused (clause 8.4); no transcript, no summary, no insight', () => {
  // clause 8.4 (ux-sprint-1): voiceNote refuses with no update (was: redacted transcript, 2-line summary, what_mattered insight)
  const v = F.voiceNote({ duration_s: 42, transcript: 'Nice guy. His ID is 8001015009087. Mostly worried about the bond.', summary: 'Engaged and ready.' });
  assert.deepEqual(v, RETIRED); assert.equal(v.update, undefined); assert.equal(v.insight, undefined);
});

test('kill/scale per ad (3.4): n < 5 -> no index, no signal; index < 2.5 or not-a-fit > 40% -> pause; >= 4 -> scale candidate', () => {
  const rows = (qs, codes) => qs.map((q, i) => ({ quality_score: q, disposition_code: codes[i] }));
  const small = F.adQuality(rows([1, 1, 1, 1], ['nofit_budget', 'nofit_budget', 'nofit_budget', 'nofit_budget']));
  assert.equal(small.quality_index, null); assert.equal(small.signal, null); assert.equal(small.quality_n, 4);
  assert.equal(F.adQuality(rows([2, 2, 3, 2, 3], F.CODES.slice(0, 5).map(() => 'fit_proceeding'))).signal, 'pause');
  assert.equal(F.adQuality(rows([4, 4, 3, 3, 3], ['nofit_budget', 'nofit_covered', 'nofit_criteria', 'fit_proceeding', 'fit_followup'])).signal, 'pause', '60% not a fit');
  const good = F.adQuality(rows([4, 5, 4, 4, 5, 4], ['fit_proceeding', 'fit_followup', 'fit_proceeding', 'fit_proceeding', 'nofit_budget', 'fit_followup']));
  assert.equal(good.signal, 'scale_candidate'); assert.equal(good.quality_index, 4.33); assert.equal(good.nofit_rate, 0.1667);
  assert.equal(F.adQuality(rows([3, 3, 4, 3, 3], ['fit_proceeding', 'fit_proceeding', 'fit_proceeding', 'fit_proceeding', 'fit_proceeding'])).signal, null);
});

test('qualification tuning: nofit_budget > 15% -> budget_drift; nofit_covered clustered on one angle -> already_covered', () => {
  const r = (code, angle = 'bond') => ({ disposition_code: code, angle });
  const t = F.tuning([r('nofit_budget'), r('fit_proceeding'), r('fit_proceeding'), r('fit_followup'), r('fit_proceeding'), r('nofit_covered', 'work_cover'), r('nofit_covered', 'work_cover'), r('nofit_covered', 'bond')]);
  assert.deepEqual(t.map((x) => x.kind), ['already_covered']);
  assert.equal(t[0].angle, 'work_cover');
  const b = F.tuning([r('nofit_budget'), r('nofit_budget'), r('fit_proceeding'), r('fit_proceeding'), r('fit_proceeding')]);
  assert.equal(b[0].kind, 'budget_drift'); assert.match(b[0].text, /40% of 5 calls/);
  assert.deepEqual(F.tuning([r('fit_proceeding')]), []);
});

test('thanks line is always true and never promises spend; renders in broker_feedback_thanks', () => {
  const few = F.thanksLine({ quality_index: null, quality_n: 2 });
  assert.equal(few, 'So far 2 of your calls from this ad have a rating.');
  const many = F.thanksLine({ quality_index: 4.2, quality_n: 6 });
  assert.equal(many, 'That ad is now rated 4.2 from 6 of your calls.');
  assert.ok(!/budget|more behind|spend/i.test(few + many));
  assert.equal(renderBody('broker_feedback_thanks', [many]), 'Logged, thank you. That ad is now rated 4.2 from 6 of your calls. Your feedback shapes the next leads we send you.');
});

test('W29.json: a retired voice note matches no Kind output, so the media fetch / transcription never runs (clause 8.4)', () => {
  const kind = WF.nodes.find((n) => n.name === 'Kind');
  const keys = kind.parameters.rules.values.map((v) => v.outputKey);
  // clause 8.4 (ux-sprint-1): no 'retired' route; the fallback output ('extra', index = keys.length) is not connected
  assert.ok(!keys.includes('retired'));
  assert.equal(kind.parameters.options.fallbackOutput, 'extra');
  assert.ok(!(WF.connections.Kind.main[keys.length] || []).length);
  assert.equal(keys.indexOf('voice'), 2); assert.deepEqual(WF.connections.Kind.main[2].map((c) => c.node), ['Fetch WhatsApp media URL']);
});

test('fit_followup nudge: never due (clause 8.4); the W29.json template node skips', async () => {
  const o = { disposition_code: 'fit_followup', marked_at: iso(DISP_AT) };
  // clause 8.4 (ux-sprint-1): followupDue is always false (was: true at +7 d, once)
  for (const t of [ms(E.broker_fit_followup_at) - 1, ms(E.broker_fit_followup_at), ms(E.broker_fit_followup_at) + 7 * D]) assert.equal(F.followupDue(o, t, false), false);
  // clause 8.4 (ux-sprint-1): a historic fit_followup row that the daily query still finds gets no broker_fit_followup send
  const { runCode } = await import('./_n8ncode.mjs');
  const row = { id: 'out_L01', lead_id: L01.lead_id, marked_at: iso(DISP_AT), disposition_code: 'fit_followup', first_name: 'Lerato', last_name: 'M', contact_person: 'Mark Smith', whatsapp_number: '+27600000090' };
  const out = (await runCode(WF, 'broker_fit_followup template', { json: { id: 'claim1' }, refs: { 'fit_followup due': row } })).json;
  assert.deepEqual(out, { skip: true });
});

test('W29.json: physical columns only; disposition cast to the enum; W13 owns replacements; ad_metrics + insights fed', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const s = JSON.stringify(WF);
  assert.ok(s.includes('$2::public.smc_disposition_code'));
  assert.ok(!s.includes('INSERT INTO public.replacements'), 'W29 never writes replacements itself');
  assert.ok(s.includes('UPDATE public.ad_metrics') && s.includes('INSERT INTO public.insights'));
  for (const bad of ['good_fit_', 'not_fit_']) assert.ok(!s.includes(bad), bad);
  const execs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => n.parameters.workflowId.cachedResultName);
  assert.deepEqual(execs, ['W13 No-show & replacement']);
  assert.ok(s.includes('CASE WHEN o.auto_marked THEN o.unconfirmed ELSE false END'), 'respects outcomes CHECK (auto_marked => unconfirmed)');
});

test('I-45k: W29 -> W13 sends { op, outcome_id, reason, reason_code, idempotency_key } (W13 contract), never just { lead_id }', async () => {
  const { runCode } = await import('./_n8ncode.mjs');
  const name = 'W13 claim item (op, outcome_id, reason, reason_code, idempotency_key)';
  const o = attended({ id: 'out_L01' });
  const d = F.applyDisposition(o, 'unreachable', DISP_AT);
  const out = (await runCode(WF, name, { items: [{ lead_id: L01.lead_id }], refs: { 'Apply disposition': { o, d } } })).map((x) => x.json);
  // clause 8.4 (ux-sprint-1): a refused disposition makes no W13 call (was: claim uncontactable for 'unreachable')
  assert.deepEqual(out, []);
  // the contract shape itself is unchanged for any caller that still passes a w13 decision
  assert.deepEqual(F.w13Call({ id: 'out_L01' }, { w13: { op: 'withdraw', reason_code: 'unreachable' } }), { op: 'withdraw', outcome_id: 'out_L01', reason: null, reason_code: 'unreachable', idempotency_key: 'w29:withdraw:out_L01:unreachable' });
  assert.deepEqual(WF.connections['Tell W13?'].main[0].map((c) => c.node), [name]);
  assert.deepEqual(WF.connections[name].main[0].map((c) => c.node), ['-> W13 claim / withdraw replacement']);
});

import { evalParam } from './_n8ncode.mjs';
test('F10 (REHEARSAL-L01 execs 56/58/61/72) "insights" params come from the Ad quality item, not $json (the ad_metrics UPDATE output replaces it)', () => {
  const AQ = 'Ad quality + tuning (w29.adQuality / tuning)';
  const INS = 'insights: kill/scale + tuning (once per 24 h per kind)';
  const o = { brand_id: 'brand_smc', broker_id: 'brk_mark', cycle_id: 'cyc_1', ad_id: 'ad_123', angle: 'bond' };
  const insights = [{ kind: 'kill_signal', text: 'Lead quality 2.1 from 5 calls', n: 5 }];
  const aq = { o, q: { quality_index: 2.1, quality_n: 5, nofit_rate: 0.4 }, insights };
  // What the rehearsal's insights node actually received: the Postgres UPDATE result, no `o`.
  const pgOut = { success: true };
  const p = evalParam(WF, INS, 'options.queryReplacement', { json: pgOut, refs: { [AQ]: aq } });
  assert.ok(Array.isArray(p), 'query parameters are an array');
  assert.deepEqual(p, ['brand_smc', 'brk_mark', 'cyc_1', 'ad_123', 'bond', JSON.stringify(insights)]);
  // An outcome with no ad (organic / CTWA without referral) still gives a valid array.
  const p2 = evalParam(WF, INS, 'options.queryReplacement', { json: pgOut, refs: { [AQ]: { ...aq, o: { ...o, ad_id: undefined, angle: undefined }, insights: [] } } });
  assert.deepEqual(p2, ['brand_smc', 'brk_mark', 'cyc_1', null, null, '[]']);
  const q = evalParam(WF, 'ad_metrics quality (latest row for the ad)', 'options.queryReplacement', { json: aq, refs: { [AQ]: aq } });
  assert.deepEqual(q, ['ad_123', 2.1, 5, 0.4]);
});
