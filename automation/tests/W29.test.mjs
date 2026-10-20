// W29 Feedback loop - synthetic tests (fixtures only). DRAFT for Jonathan (4C.2). Run: node --test automation/tests/W29.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIX, lead, ms, iso, D, template, renderBody } from './_harness.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as F from '../lib/w29.mjs';

const WF = JSON.parse(readFileSync(new URL('../W29.json', import.meta.url), 'utf8'));
const LIST = JSON.parse(readFileSync(new URL('../templates/session/broker_disposition_list.json', import.meta.url), 'utf8'));
const L01 = lead('L01');
const E = L01.expected.W12;
const DISP_AT = ms(E.broker_fit_followup_at) - 7 * D; // the tap that set fit_followup
const attended = (over = {}) => ({ id: 'out_L01', booking_id: 'bk_L01', lead_id: L01.lead_id, outcome: 'attended', disposition_code: null, quality_score: null, auto_marked: false, ...over });

test('codes: exactly the six 4.12a codes, same as the fixture, the session list rows and the template buttons', () => {
  assert.deepEqual(F.CODES, FIX._meta.disposition_codes);
  const rows = LIST.interactive.action.sections.flatMap((s) => s.rows);
  assert.deepEqual(rows.map((r) => r.id), F.CODES);
  assert.ok(rows.every((r) => r.title.length <= 24));
  assert.equal(template('broker_disposition').components.find((c) => c.type === 'BUTTONS').buttons.length, 6);
});

test('parse broker replies: list row, quick-reply payload, quality tap/typed, voice note, follow-up taps, noise', () => {
  for (const c of F.CODES) assert.deepEqual(F.parseBrokerReply({ list_id: c }), { kind: 'disposition', value: c });
  assert.deepEqual(F.parseBrokerReply({ payload: 'nofit_budget:bk_L01' }), { kind: 'disposition', value: 'nofit_budget', booking_id: 'bk_L01' });
  assert.deepEqual(F.parseBrokerReply({ payload: 'quality:4:bk_L01' }), { kind: 'quality', value: 4, booking_id: 'bk_L01' });
  assert.equal(F.parseBrokerReply({ payload: '5' }).value, 5);
  assert.equal(F.parseBrokerReply({ text: '3' }).value, 3);
  assert.equal(F.parseBrokerReply({ text: '7' }).kind, 'unknown');
  assert.deepEqual(F.parseBrokerReply({ media: 'audio', media_id: 'm1' }), { kind: 'voice', value: 'm1' });
  assert.equal(F.parseBrokerReply({ payload: `fit_followup:${L01.lead_id}:done` }).value, 'done');
  assert.equal(F.parseBrokerReply({ payload: `fit_followup:${L01.lead_id}:open` }).value, 'open');
  assert.equal(F.parseBrokerReply({ text: 'thanks' }).kind, 'unknown');
});

test('L01: fit_followup -> outcomes.disposition_code, ask quality next, follow-up nudge at the fixture time, no replacement', () => {
  const d = F.applyDisposition(attended(), E.disposition_code, DISP_AT);
  assert.equal(d.update.disposition_code, 'fit_followup'); assert.equal(d.update.marked_via, 'whatsapp');
  assert.equal(d.next, 'ask_quality'); assert.equal(d.w13, null); assert.equal(d.lead_stage, 'dispositioned');
  assert.equal(iso(d.followup_due_ms), E.broker_fit_followup_at);
  const q = F.applyQuality(attended({ disposition_code: 'fit_followup' }), E.quality_score);
  assert.deepEqual(q, { update: { quality_score: 4 }, next: 'thanks' });
  assert.equal(L01.expected.W13.replacement, false);
});

test('replacements (W13): unreachable -> uncontactable, nofit_criteria -> disqualified, nothing else; correction withdraws', () => {
  assert.deepEqual(F.applyDisposition(attended(), 'unreachable', DISP_AT).w13, { op: 'claim', reason: 'uncontactable', reason_code: 'unreachable' });
  assert.deepEqual(F.applyDisposition(attended(), 'nofit_criteria', DISP_AT).w13, { op: 'claim', reason: 'disqualified', reason_code: 'nofit_criteria' });
  for (const c of ['fit_proceeding', 'fit_followup', 'nofit_budget', 'nofit_covered']) assert.equal(F.applyDisposition(attended(), c, DISP_AT).w13, null, c);
  assert.deepEqual(F.applyDisposition(attended({ disposition_code: 'unreachable' }), 'fit_proceeding', DISP_AT).w13, { op: 'withdraw', reason_code: 'unreachable' });
});

test('guards: no disposition or quality on a no-show / broker no-show; quality must be 1-5; unknown code rejected', () => {
  assert.match(F.applyDisposition(attended({ outcome: 'no_show' }), 'fit_proceeding', DISP_AT).error, /no_show/);
  assert.match(F.applyDisposition(attended({ outcome: 'broker_no_show' }), 'unreachable', DISP_AT).error, /broker_no_show/);
  assert.ok(F.applyDisposition(attended(), 'good_fit_proceeding', DISP_AT).error);
  assert.ok(F.applyQuality(attended(), 0).error); assert.ok(F.applyQuality(attended(), 6).error);
  assert.ok(F.applyQuality(attended({ outcome: 'no_show' }), 3).error);
  assert.equal(F.applyDisposition(attended({ quality_score: 4 }), 'fit_proceeding', DISP_AT).next, 'thanks');
});

test('voice note: <= 60 s, transcript redacted (ID / health), 2-line summary, what_mattered insight; never to the lead', () => {
  const v = F.voiceNote({ duration_s: 42, transcript: 'Nice guy. His ID is 8001015009087. Mostly worried about the bond.', summary: 'Engaged and ready. Main worry was the bond. Wants a second call.' });
  assert.ok(!v.update.transcript.includes('8001015009087'));
  assert.equal(v.update.summary, 'Engaged and ready. Main worry was the bond.');
  assert.deepEqual(v.insight, { source: 'voice_note', kind: 'what_mattered', text: v.update.summary });
  const h = F.voiceNote({ duration_s: 20, transcript: 'She has diabetes', summary: 'She has diabetes so cover is a worry.' });
  assert.equal(h.update.transcript, '[health detail removed]'); assert.equal(h.insight, null);
  assert.ok(F.voiceNote({ duration_s: 90, transcript: 'x', summary: 'y' }).error);
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
  assert.equal(F.thanksLine({ quality_index: null, quality_n: 0 }), 'Your rating is saved on the lead.', 'a lead with no ad never hears "from this ad"');
});

test('fit_followup nudge: due at +7 d, once', () => {
  const o = { disposition_code: 'fit_followup', marked_at: iso(DISP_AT) };
  assert.equal(F.followupDue(o, ms(E.broker_fit_followup_at) - 1, false), false);
  assert.equal(F.followupDue(o, ms(E.broker_fit_followup_at), false), true);
  assert.equal(F.followupDue(o, ms(E.broker_fit_followup_at), true), false);
  assert.equal(F.followupDue({ ...o, disposition_code: 'fit_proceeding' }, ms(E.broker_fit_followup_at), false), false);
});

test('W29.json: physical columns only; disposition cast to the enum; W13 owns replacements; no dropped tables (insights / ad_metrics / cycles)', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const s = JSON.stringify(WF);
  assert.ok(s.includes('$2::public.smc_disposition_code'));
  assert.ok(!s.includes('INSERT INTO public.replacements'), 'W29 never writes replacements itself');
  for (const gone of ['public.insights', 'public.ad_metrics', 'cycle_id']) assert.ok(!s.includes(gone), gone);
  assert.ok(s.includes("'quality_signal'"), 'kill/scale + tuning signals land on the lead timeline');
  for (const bad of ['good_fit_', 'not_fit_']) assert.ok(!s.includes(bad), bad);
  const execs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => n.parameters.workflowId.cachedResultName);
  assert.deepEqual(execs, ['W13 No-show & replacement', 'WhatsApp Send']);
  assert.ok(s.includes('CASE WHEN o.auto_marked THEN o.unconfirmed ELSE false END'), 'respects outcomes CHECK (auto_marked => unconfirmed)');
});

test('I-45k: W29 -> W13 sends { op, outcome_id, reason, reason_code, idempotency_key } (W13 contract), never just { lead_id }', async () => {
  const { runCode } = await import('./_n8ncode.mjs');
  const name = 'W13 claim item (op, outcome_id, reason, reason_code, idempotency_key)';
  const o = attended({ id: 'out_L01' });
  const d = F.applyDisposition(o, 'unreachable', DISP_AT);
  const out = (await runCode(WF, name, { items: [{ lead_id: L01.lead_id }], refs: { 'Apply disposition': { o, d } } })).map((x) => x.json);
  assert.deepEqual(out, [{ op: 'claim', outcome_id: 'out_L01', reason: 'uncontactable', reason_code: 'unreachable', idempotency_key: 'w29:claim:out_L01:unreachable' }]);
  const w = F.applyDisposition(attended({ id: 'out_L01', disposition_code: 'unreachable' }), 'fit_proceeding', DISP_AT);
  assert.deepEqual(F.w13Call({ id: 'out_L01' }, w), { op: 'withdraw', outcome_id: 'out_L01', reason: null, reason_code: 'unreachable', idempotency_key: 'w29:withdraw:out_L01:unreachable' });
  assert.deepEqual(WF.connections['Tell W13?'].main[0].map((c) => c.node), [name]);
  assert.deepEqual(WF.connections[name].main[0].map((c) => c.node), ['-> W13 claim / withdraw replacement']);
});

import { evalParam } from './_n8ncode.mjs';
test('F10 (REHEARSAL-L01 execs 56/58/61/72) signal params come from the Ad quality item, not $json; admin-only timeline row', () => {
  const AQ = 'Ad quality + tuning (w29.adQuality / tuning)';
  const SIG = 'Quality signals -> LV-only lead timeline (once per day per kind)';
  assert.deepEqual(WF.connections[AQ].main[0].map((c) => c.node), [SIG]);
  assert.deepEqual(WF.connections[SIG].main[0].map((c) => c.node), ['Send thanks? (quality just logged)']);
  const o = { brand_id: 'brand_smc', broker_id: 'brk_mark', lead_id: L01.lead_id, ad_id: 'ad_123', angle: 'bond' };
  const signals = [{ kind: 'kill_signal', text: 'Lead quality 2.1 from 5 calls', n: 5 }];
  const aq = { o, q: { quality_index: 2.1, quality_n: 5, nofit_rate: 0.4 }, signals };
  const p = evalParam(WF, SIG, 'options.queryReplacement', { json: { success: true }, refs: { [AQ]: aq } });
  assert.deepEqual(p, ['brand_smc', 'brk_mark', L01.lead_id, 'ad_123', 'bond', JSON.stringify(signals)]);
  // An outcome with no ad (organic / CTWA without referral) still gives a valid array.
  const p2 = evalParam(WF, SIG, 'options.queryReplacement', { json: {}, refs: { [AQ]: { ...aq, o: { ...o, ad_id: undefined, angle: undefined }, signals: [] } } });
  assert.deepEqual(p2, ['brand_smc', 'brk_mark', L01.lead_id, null, null, '[]']);
  // broker_id stays out of the column list: the broker's own-timeline policy must never show him media-rule signals.
  const sql = WF.nodes.find((n) => n.name === SIG).parameters.query;
  assert.match(sql, /^INSERT INTO public\.lead_activities \(lead_id, brand_id, workflow,/);
  assert.match(sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
});

test("ad window: thanks counts only this broker's calls on the ad; signals use every broker; tuning = broker's last 30 days", async () => {
  const { runCode } = await import('./_n8ncode.mjs');
  const AQ = 'Ad quality + tuning (w29.adQuality / tuning)';
  const row = (q, own, own_30d = own, same_ad = true, code = 'fit_proceeding') => ({ quality_score: q, disposition_code: code, ad_id: 'ad_123', angle: 'bond', same_ad, own, own_30d });
  const items = [row(5, true), row(4, true), ...[1, 1, 2, 1, 2].map((q) => row(q, false))];
  const o = { brand_id: 'brand_smc', broker_id: 'brk_mark', lead_id: L01.lead_id, ad_id: 'ad_123', angle: 'bond' };
  const [out] = (await runCode(WF, AQ, { items, refs: { Merge: { o, kind: 'quality' } } })).map((x) => x.json);
  assert.equal(out.thanks, 'So far 2 of your calls from this ad have a rating.');
  assert.equal(out.q.quality_n, 7);
  assert.deepEqual(out.signals.map((x) => x.kind), ['kill_signal']);
  const rows = WF.nodes.find((n) => n.name === 'Outcomes for this ad + this broker (30 d)');
  assert.match(rows.parameters.query, /o\.broker_id = \$2::uuid AND o\.created_at > now\(\) - interval '30 days'/);
  assert.equal(evalParam(WF, rows.name, 'options.queryReplacement', { json: {}, refs: { Merge: { o } } }).join('|'), 'ad_123|brk_mark');
});

test('v4b16: broker sends go through the shared sender (Twilio or Meta by WHATSAPP_PROVIDER), never straight to Graph', async () => {
  const { directWaSends } = (await import('node:module')).createRequire(import.meta.url)('../lib/wa-route.cjs');
  assert.deepEqual(directWaSends(WF), []);
  const send = WF.nodes.find((n) => n.name === 'Send WhatsApp (broker)');
  assert.equal(send.type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(send.parameters.workflowId.value, 'smc-whatsapp-send');
  const { runCode } = await import('./_n8ncode.mjs');
  const wa = { messaging_product: 'whatsapp', to: '+27600000002', type: 'text', text: { body: 'Logged, thank you.' } };
  const [x] = [await runCode(WF, 'SUB input (Send WhatsApp (broker))', { json: { wa } })].map((r) => r.json);
  assert.deepEqual([x.kind, x.to, x.record, x.caller], ['prebuilt', '+27600000002', true, 'W29'], 'the sub writes the communications row (W29 has no log node)');
  assert.ok(!JSON.stringify(WF).includes('/{{ $env.PHONE_NUMBER_ID }}/messages'));
});

test('v4b16: voice note fetch works for a Twilio MediaUrl (Basic auth) and a Meta media id; the audio file goes to the transcriber', () => {
  const IFN = 'Twilio media? (MediaUrl, WHATSAPP_PROVIDER=twilio)';
  assert.deepEqual(WF.connections.Kind.main[2].map((c) => c.node), [IFN]);
  assert.deepEqual(WF.connections[IFN].main.map((o) => o.map((c) => c.node)), [['Download voice note (Twilio MediaUrl, Basic auth)'], ['Fetch WhatsApp media URL']]);
  assert.deepEqual(WF.connections['Fetch WhatsApp media URL'].main[0].map((c) => c.node), ['Download voice note (Meta media URL)']);
  for (const dl of ['Download voice note (Twilio MediaUrl, Basic auth)', 'Download voice note (Meta media URL)']) assert.deepEqual(WF.connections[dl].main[0].map((c) => c.node), ['Transcribe (Whisper-class, audio not stored)']);
  const cond = WF.nodes.find((n) => n.name === IFN).parameters.conditions.conditions[0].leftValue;
  const isTwilio = (value) => new Function('$json', 'return ' + cond.replace(/^=\{\{|\}\}$/g, ''))({ value });
  assert.equal(isTwilio('twilio:https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1'), 'true');
  assert.equal(isTwilio('1234567890'), 'false');
  assert.equal(isTwilio('twilio:https://evil.example/x'), 'false', 'only api.twilio.com gets the Twilio credentials');
  const tr = WF.nodes.find((n) => n.name === 'Transcribe (Whisper-class, audio not stored)').parameters;
  assert.equal(tr.contentType, 'multipart-form-data');
  assert.deepEqual(tr.bodyParameters.parameters.find((p) => p.name === 'file'), { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'data' });
  assert.equal(tr.bodyParameters.parameters.find((p) => p.name === 'response_format').value, 'verbose_json', 'the gate reads duration + text');
  assert.ok(!JSON.stringify(WF.nodes.filter((n) => n.type === 'n8n-nodes-base.readWriteFile')).includes('voice'), 'audio is never written to disk');
});
