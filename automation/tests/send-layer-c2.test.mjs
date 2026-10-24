// Smoke test 21 Oct 2026 (EMMA checklist/SMOKE-TEST-SMC-2026-10-21.md), send layer: issues #6, #7, #16, #17, #18 (W06 part).
// Every case runs the real workflow nodes (Code nodes through _n8ncode.mjs, Postgres parameter expressions evaluated the way
// n8n does) so the committed JSON is what is tested.
// Run: node --test automation/tests/send-layer-c2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runCode } from './_n8ncode.mjs';
import { broker } from './_harness.mjs';
import { isSyntheticNumber } from '../lib/wa.mjs';
import * as CAPI from '../lib/sub-capi-send.mjs';
import * as W from '../lib/w07.mjs';
import { decide as decideTurn } from '../../conversation/logic.mjs';

const require = createRequire(import.meta.url);
const W3 = require('../ctwa/w03.js');
const load = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const WA = load('SUB-whatsapp-send.json');
const CAPIWF = load('SUB-capi-send.json');
const W03 = load('W03.json');
const W06 = load('W06.json');
const W07 = load('W07.json');
const W08 = load('W08.json');
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); assert.ok(n, `no node "${name}"`); return n; };
const DECIDE = 'Decide (suppression, allow-list, window, template, dry run)';
const LIVE = { DRY_RUN_SENDS: 'false', WHATSAPP_PROVIDER: 'twilio' };

async function sub(input, ctx, env = LIVE) { return subAt(input, ctx, env); }
async function subAt(input, ctx, env = LIVE) {
  const n = await runCode(WA, 'Normalise input', { json: input });
  const d = (await runCode(WA, DECIDE, { json: ctx, env, refs: { 'Normalise input': n.json } })).json;
  return d;
}
const prebuilt = (to, extra = {}) => ({ kind: 'prebuilt', wa: { to, type: 'text', text: { body: 'hi' } }, record: false, caller: 'W03', correlation: 'c:1', ...extra });

/** A Postgres node's queryReplacement evaluated with $json and $('<node>') refs, as n8n does. */
function params(wf, name, json, refs = {}) {
  const rep = node(wf, name).parameters.options.queryReplacement.replace(/^=\{\{([\s\S]*)\}\}$/, '$1');
  const $ = (k) => { if (!(k in refs)) throw new Error(`$('${k}') not given`); return { item: { json: refs[k] }, first: () => ({ json: refs[k] }) }; };
  return new Function('$json', '$', '$env', `return (${rep});`)(json, $, {});
}
/** Status / external_id / failed_reason as the INSERT would write them ($n -> value). */
function row(wf, name, json, refs) {
  const q = node(wf, name).parameters.query;
  const p = params(wf, name, json, refs);
  const cols = /\(([^)]*)\)\s*(?:--[^\n]*\n)?\s*VALUES/.exec(q)[1].split(',').map((s) => s.trim());
  const vals = q.slice(q.indexOf('VALUES')).replace(/^VALUES\s*\(/, '').split(/,(?![^(]*\))/).map((s) => s.trim());
  const at = (c) => {
    const v = vals[cols.indexOf(c)];
    if (/^'[^']*'$/.test(v)) return v.slice(1, -1);
    const m = /\$(\d+)/.exec(v);
    const x = p[Number(m[1]) - 1];
    return /nullif/i.test(v) && x === '' ? null : x;
  };
  return { status: at('status'), external_id: at('external_id'), failed_reason: cols.includes('failed_reason') ? at('failed_reason') : undefined };
}

// ------------------------------------------------------------------ #16 synthetic numbers
// Review 21 Oct: 060 0 is an allocated cellular block (no reserved test range in South Africa), so only the EXACT numbers in
// env SYNTHETIC_TEST_NUMBERS are test numbers; unset = none, and a real client in +27 60 000 xxxx is a real client.
const SYN_ENV = { SYNTHETIC_TEST_NUMBERS: '+27600000923, 27600000951 +27600000912;+27600000001' };
test('#16 isSyntheticNumber: only the exact SYNTHETIC_TEST_NUMBERS; the 060 000 block, the SMC number and real mobiles are not', () => {
  for (const v of ['+27600000923', '27600000951', '+27 60 000 0912', 27600000001]) assert.equal(isSyntheticNumber(v, SYN_ENV), true, String(v));
  for (const v of ['+27600156480', '+27821234567', '+27600001234', '2760000092', '276000009231', '', null, undefined]) assert.equal(isSyntheticNumber(v, SYN_ENV), false, String(v));
  for (const v of ['+27600000923', '+27600001234']) assert.equal(isSyntheticNumber(v), false, `${v}: no list, no test numbers`);
  assert.equal(isSyntheticNumber('+27600000923', { SYNTHETIC_TEST_NUMBERS: '' }), false);
});

test('#16 smc-whatsapp-send: a listed test number is dry-run with DRY_RUN_SENDS=false; a real number (any block) still sends', async () => {
  const LIVE_SYN = { ...LIVE, ...SYN_ENV };
  assert.equal((await subAt(prebuilt('+27600001234'), { suppressed: false }, LIVE_SYN)).action, 'send', 'a real client in the 060 000 block is messaged');
  assert.equal((await subAt(prebuilt('+27600000923'), { suppressed: false })).action, 'send', 'no list: not a test number');
  const subS = (input, ctx, env = LIVE_SYN) => subAt(input, ctx, env);
  const d = await subS(prebuilt('+27600000923'), { suppressed: false });
  assert.equal(d.action, 'dry'); assert.equal(d.reason, 'synthetic_number'); assert.equal(d.external_id, 'dry:c:1');
  const res = (await runCode(WA, 'Result', { json: {}, refs: { [DECIDE]: d, 'Interpret Graph response': null } })).json;
  assert.equal(res.ok, true); assert.equal(res.messages[0].id, 'dry:c:1');
  assert.equal((await subS(prebuilt('+27821234567'), { suppressed: false })).action, 'send');
  assert.equal((await subS(prebuilt('+27600156480'), { suppressed: false })).action, 'send', 'the SMC number is not synthetic');
  assert.equal((await subS(prebuilt('+27600000923'), { suppressed: true })).reason, 'suppressed', 'suppression still first');
  // "Claimed and a live send?" only lets action=send through, so nothing reaches Twilio
  assert.match(node(WA, 'Claimed and a live send?').parameters.conditions.conditions[0].leftValue, /action === 'send'/);
});

test('#16 W03 intake: a listed test number is stored is_synthetic=true; any other number (060 000 block too) false', async () => {
  const MARK = broker();
  const consent = W3.consentFor('named', MARK);
  const thread = { stage: 'await_consent', origin: { origin: 'ctwa' }, consent, answers: {}, first_at: '2026-10-21T10:00:00+02:00', broker_id: MARK.broker_id };
  const ctxRow = { brand_id: 'b-smc', broker: { ...MARK, consent_mode: 'named' }, existing_open_lead_id: null, lead: null, suppressed: false, thread, new_lead_id: '11111111-2222-4333-8444-555555555555' };
  const syn = async (mobile, env = SYN_ENV) => {
    const ad = { msg: { from: mobile.slice(1), id: 'SMc2', timestamp: '1792310060', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, at: '2026-10-21T10:01:00+02:00', mobile, profile_name: 'Smoke Test', external_id: 'SMc2', hops: 0 };
    const [st] = await runCode(W03, 'W03 step', { items: [ctxRow], env, refs: { 'W07 hand-off -> Cloud API message': ad } });
    return st.json.actions.find((a) => a.kind === 'insert_lead').row.is_synthetic;
  };
  assert.equal(await syn('+27600000923'), true);
  assert.equal(await syn('+27821234567'), false);
  assert.equal(await syn('+27600001234'), false, 'a real client in the 060 000 block is a real lead');
  assert.equal(await syn('+27600000923', {}), false, 'no list: no test numbers');
});

// ------------------------------------------------------------------ #17 CAPI
test('#17 smc-capi-send: a synthetic lead (flag or a listed test number) is never sent unless a test event code is set', async () => {
  const input = { event_name: 'Qualified', event_id: 'q:1', action_source: 'system_generated', lead_id: '00000000-0000-0000-0000-0000000000a1', brand_id: '00000000-0000-0000-0000-0000000000b1' };
  const ctx = { found: true, consent_ads_at: '2026-10-21T10:00:00Z', phone: '+27821234567', pixel_id: 'px', dataset_id: 'ds', duplicate: false, is_synthetic: false };
  const build = async (c, env = { DRY_RUN_SENDS: 'false' }) => {
    const n = await runCode(CAPIWF, 'Normalise input', { json: input });
    return (await runCode(CAPIWF, 'Build event (consent gate, no email, dry run)', { json: c, env, refs: { 'Normalise input': n.json } })).json;
  };
  assert.equal((await build(ctx)).action, 'send', 'a real lead still goes');
  const flagged = await build({ ...ctx, is_synthetic: true });
  assert.equal(flagged.action, 'skip'); assert.equal(flagged.reason, 'synthetic_lead');
  assert.equal((await build({ ...ctx, is_synthetic: 't' })).reason, 'synthetic_lead');
  assert.equal((await build({ ...ctx, phone: '+27600000923' }, { DRY_RUN_SENDS: 'false', ...SYN_ENV })).reason, 'synthetic_lead', 'smoke numbers stored before the intake flag');
  assert.equal((await build({ ...ctx, phone: '+27600001234' }, { DRY_RUN_SENDS: 'false', ...SYN_ENV })).action, 'send', 'an unlisted 060 000 number is a real lead');
  const test = await build({ ...ctx, is_synthetic: true }, { DRY_RUN_SENDS: 'false', CAPI_TEST_EVENT_CODE: 'TEST123' });
  assert.equal(test.action, 'send'); assert.equal(test.body.test_event_code, 'TEST123');
  assert.match(node(CAPIWF, 'Load lead, consent, dataset and dedupe').parameters.query, /l\.is_synthetic/);
  assert.equal(CAPI.build(CAPI.normalise({ ...input, lead_id: null, user: { phone: '+27600000923' }, consent_ads: true }), { pixel_id: 'px' }, SYN_ENV).reason, 'synthetic_lead');
  // skip -> "Send?" false -> nothing claimed, nothing posted
  assert.deepEqual(CAPIWF.connections['Send?'].main[1] || [], []);
});

// ------------------------------------------------------------------ #6 closing lines past their own suppression
test('#6 W03: only the consent "No thanks" close line bypasses suppression', async () => {
  const MARK = broker();
  const consent = W3.consentFor('named', MARK);
  const thread = { stage: 'await_consent', origin: { origin: 'ctwa' }, consent, answers: {}, first_at: '2026-10-21T10:00:00+02:00', broker_id: MARK.broker_id };
  const r = W3.step(thread, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_no' } } }, { at: '2026-10-21T10:01:00+02:00', mobile: '+27821234567', broker: MARK, brand: { brand_id: 'smc', consent_mode: 'named' }, suppressed: false });
  assert.ok(r.actions.some((a) => a.kind === 'suppress'));
  const fan = await runCode(W03, 'Fan out actions', { items: [{ actions: r.actions, brand_id: 'b', mobile: '+27821234567', wamid: 'SMno', at: '2026-10-21T10:01:00+02:00' }] });
  const [body] = await runCode(W03, 'Build Cloud API body', { items: [fan.find((x) => x.json.kind === 'send').json] });
  assert.equal(body.json.close_line, true);
  const subIn = await runCode(W03, 'SUB input (WhatsApp send (session))', { json: { out: body.json } });
  assert.equal(subIn.json.bypass_suppression, true);
  const d = await sub(subIn.json, { suppressed: true });
  assert.equal(d.action, 'send', 'the goodbye goes out past the row W03 just wrote');
  // any other W03 reply keeps the gate
  const yes = W3.step(thread, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, { at: '2026-10-21T10:01:00+02:00', mobile: '+27821234567', broker: MARK, brand: { brand_id: 'smc', consent_mode: 'named' }, suppressed: false, lead_id: 'l1' });
  const fan2 = await runCode(W03, 'Fan out actions', { items: [{ actions: yes.actions, brand_id: 'b', mobile: '+27821234567', wamid: 'SMyes', at: '2026-10-21T10:01:00+02:00' }] });
  const [b2] = await runCode(W03, 'Build Cloud API body', { items: [fan2.find((x) => x.json.kind === 'send').json] });
  assert.equal((await runCode(W03, 'SUB input (WhatsApp send (session))', { json: { out: b2.json } })).json.bypass_suppression, false);
  assert.equal((await runCode(W03, 'SUB input (WhatsApp send (banner))', { json: { out: { ...body.json, banner: body.json.body } } })).json.bypass_suppression, false);
});

test('#6 W08: the CLOSE_UNBOOKED line bypasses suppression; the nudges do not', async () => {
  // review 21 Oct: only the tap whose "Save tap result" wrote the suppression row goes past it
  const close = await runCode(W08, 'SUB input (Send close line)', { json: { wa: { to: '27821234567', type: 'text', text: { body: 'bye' } } }, refs: { 'Save tap result': { updated: 1, suppressed: 1 } } });
  assert.equal(close.json.bypass_suppression, true);
  assert.equal((await sub(close.json, { suppressed: true })).action, 'send');
  // a second "No thanks" (double tap, an older message) or a number suppressed before (complaint / STOP / NCC row): the insert
  // conflicts (suppressed = 0), so the gate holds and no second goodbye goes past the objection
  for (const saved of [{ updated: 1, suppressed: 0 }, { updated: 1, suppressed: '0' }, { updated: 0, suppressed: 0 }]) {
    const again = await runCode(W08, 'SUB input (Send close line)', { json: { wa: { to: '27821234567', type: 'text', text: { body: 'bye' } } }, refs: { 'Save tap result': saved } });
    assert.equal(again.json.bypass_suppression, false, JSON.stringify(saved));
    assert.notEqual((await sub(again.json, { suppressed: true })).action, 'send');
  }
  assert.equal((await runCode(W08, 'SUB input (Send close line)', { json: { wa: { to: '27821234567', type: 'text', text: { body: 'bye' } } }, refs: { 'Save tap result': { updated: 1, suppressed: '1' } } })).json.bypass_suppression, true, 'postgres count as text');
  assert.match(node(W08, 'SUB input (Send WhatsApp)').parameters.jsCode, /bypass_suppression: false,/, 'nudges keep the suppression gate');
});

test('#6 W07: a pre-booking CANCEL closes through W08 only (W07 sends nothing itself, so no Start here again)', () => {
  const d = decideTurn('start_page', { intent: 'cancel', topics: [], slots: {}, confidence: 0.9 }, {}, { booking: null, unanswered: 0 });
  assert.ok(d.actions.includes('close_unbooked'));
  const lead = { id: 'l1', phone: '+27821234567', language: 'en', conv_state: { state: 'start_page', disclosed: true } };
  const plan = W.planActions(d, { lead, booking: null, pre: {}, nlu: { intent: 'cancel', topics: [], slots: {} }, now_ms: Date.parse('2026-10-21T10:00:00Z'), lang: 'en', state: 'start_page', wamid: 'SMx', disclosed: true, adviser_first: 'your adviser' });
  assert.deepEqual(plan.delegate.filter((x) => x.to === 'W08'), [{ to: 'W08', action: 'close' }]);
  assert.equal(plan.send, false);
  assert.equal(W.applyModelReply(plan, 'Sure, all done!').used, false, 'a model reply cannot turn the send back on');
  assert.equal(plan.send, false);
  // the Start here again card only hangs off W07's own send
  assert.deepEqual(W07.connections['Send WhatsApp (session, in 24-h window)'].main[0].map((x) => x.node).sort(), ['Start here again plan (W07)', 'Store outbound']);
  assert.match(node(W07, 'Anything to send?').parameters.conditions.conditions[0].leftValue, /\$json\.send === true/);
});

// ------------------------------------------------------------------ #7 status from the send result
const blocked = { ok: false, external_id: null, error: 'suppressed' };
const sent = { ok: true, external_id: 'SM123', messages: [{ id: 'SM123' }] };
test('#7 W03 "Store outbound (W03)": blocked -> failed + reason, no fake id; sent -> sent; DRY_RUN stand-in -> sent + dry id', () => {
  const refs = { 'Reply claim (w07:reply:{wamid})': { out: { brand_id: 'b', mobile: '+27821234567', content: 'bye', wamid: 'SMw', lead_id: 'l1' } } };
  assert.deepEqual(row(W03, 'Store outbound (W03)', blocked, refs), { status: 'failed', external_id: null, failed_reason: 'suppressed' });
  assert.deepEqual(row(W03, 'Store outbound (W03)', sent, refs), { status: 'sent', external_id: 'SM123', failed_reason: null });
  assert.deepEqual(row(W03, 'Store outbound (W03)', refs['Reply claim (w07:reply:{wamid})'], refs), { status: 'sent', external_id: 'dry:w03:SMw', failed_reason: null });
  const p = params(W03, 'Store outbound (W03)', blocked, refs); assert.equal(p[5], false, 'metadata.dry_run only for a dry id');
  assert.equal(params(W03, 'Store outbound (W03)', { ok: true, messages: [{ id: 'dry:c:1' }] }, refs)[5], true, 'sender dry run (synthetic number) is a dry run');
});

test('#7 W07 "Store outbound": blocked -> failed + reason; sent -> sent; DRY_RUN stand-in -> sent + dry id', () => {
  const s = { brand_id: 'b', msg: { from: '+27821234567', wamid: 'SMw' }, text: 'hi', lead: { id: 'l1', broker_id: null }, model: null };
  const refs = { 'Anything to send?': s };
  assert.deepEqual(row(W07, 'Store outbound', blocked, refs), { status: 'failed', external_id: null, failed_reason: 'suppressed' });
  assert.deepEqual(row(W07, 'Store outbound', sent, refs), { status: 'sent', external_id: 'SM123', failed_reason: null });
  assert.deepEqual(row(W07, 'Store outbound', s, refs), { status: 'sent', external_id: 'dry:SMw', failed_reason: null });
});

test('#7 W08 "Store outbound": blocked -> failed + reason; sent -> sent; DRY_RUN stand-in -> sent + dry id', () => {
  const d = { brand_id: 'b', phone: '+27821234567', template: 'unbooked_nudge_2h', idempotency_key: 'w08:l1:2h', lead_id: 'l1', broker_id: null, channel: 'template', touch: '2h' };
  const refs = { 'Build message (template or session)': d };
  assert.deepEqual(row(W08, 'Store outbound', blocked, refs), { status: 'failed', external_id: null, failed_reason: 'suppressed' });
  assert.deepEqual(row(W08, 'Store outbound', sent, refs), { status: 'sent', external_id: 'SM123', failed_reason: null });
  assert.deepEqual(row(W08, 'Store outbound', d, refs), { status: 'sent', external_id: 'dry:w08:l1:2h', failed_reason: null });
});

test('#7 no Store outbound node invents a dry: id for a real send that failed', () => {
  for (const wf of [W03, W07, W08]) for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) {
    const r = n.parameters.options?.queryReplacement || '';
    assert.ok(!/\|\| \('dry:/.test(r), `${wf.id} "${n.name}" still falls back to a dry: id whatever the result`);
    if (/INTO public\.communications/.test(n.parameters.query) && /\$json\.messages/.test(r)) assert.doesNotMatch(n.parameters.query, /'outbound', 'system', 'client', \$2, \$3, 'sent'/, `${wf.id} "${n.name}" hard-codes 'sent'`);
  }
});

// ------------------------------------------------------------------ #18 W06 receipts move forward only
// The node's own status / failed_reason CASE expressions are translated to JS and evaluated for every (stored, receipt)
// pair, so the SQL itself is what is checked offline (no Postgres needed).
const STAMP = 'Stamp disclosure evidence (first delivery wins)';
const RANK = (x) => ({ read: 3, delivered: 2, sent: 1 }[x] || 0);
const IN = (x, list) => list.includes(x);
function sqlCase(sql) {
  const js = sql
    .replace(/\(CASE (\$3|status) WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END\)/g, (m, x) => `RANK(${x === '$3' ? 'N' : 'S'})`)
    .replace(/COALESCE\(status, 'pending'\)/g, "(S ?? 'pending')")
    .replace(/\$3/g, 'N').replace(/\$5/g, 'R').replace(/\bfailed_reason\b/g, 'F').replace(/\bstatus\b/g, 'S')
    .replace(/(\(S \?\? 'pending'\)|S|N) IN \(([^)]*)\)/g, 'IN($1, [$2])')
    .replace(/ AND /g, ' && ').replace(/ = /g, ' === ')
    .replace(/CASE WHEN /g, '(').replace(/\s+WHEN /g, ' : ').replace(/ THEN /g, ' ? ').replace(/\s+ELSE /g, ' : ').replace(/ END/g, ')');
  return new Function('S', 'N', 'R', 'F', 'RANK', 'IN', `return ${js};`);
}
test('#18 W06 receipt stamp: status only moves forward (pending < sent < delivered < read; failed only over pending/sent, terminal)', () => {
  const q = node(W06, STAMP).parameters.query;
  const set = /SET\s+status = (CASE[\s\S]*?ELSE status END),\s+delivered_at/.exec(q);
  assert.ok(set, 'status is set through a CASE, never straight from $3');
  const status = sqlCase(set[1]);
  const fr = sqlCase(/failed_reason = (CASE[\s\S]*?END), updated_at/.exec(q)[1]);
  const want = {
    pending: { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' },
    sent: { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' },
    delivered: { sent: 'delivered', delivered: 'delivered', read: 'read', failed: 'delivered' },
    read: { sent: 'read', delivered: 'read', read: 'read', failed: 'read' },
    failed: { sent: 'failed', delivered: 'failed', read: 'failed', failed: 'failed' }, // exec 11587 -> 11588, row eb052c4f
  };
  for (const [cur, row2] of Object.entries(want)) for (const [rec, exp] of Object.entries(row2)) {
    assert.equal(status(cur, rec, '63024', null, RANK, IN), exp, `${cur} + receipt ${rec}`);
    assert.equal(fr(cur, rec, '63024', null, RANK, IN), rec === 'failed' && (cur === 'pending' || cur === 'sent') ? '63024' : null, `failed_reason ${cur} + ${rec}`);
  }
  assert.equal(status(null, 'failed', 'x', null, RANK, IN), 'failed', 'a NULL status counts as pending');
});


// Review 21 Oct: the E2E switch CAPI_SYNTHETIC_TEST_EVENT_CODE sends synthetic leads' events as test events and never touches a
// real lead's event (a real Lead / Qualified / GoodFit stays a production event); CAPI_TEST_EVENT_CODE keeps its staging meaning.
test('review #17: CAPI_SYNTHETIC_TEST_EVENT_CODE marks only synthetic leads; real leads stay production events', async () => {
  const input = { event_name: 'Qualified', event_id: 'q:2', action_source: 'system_generated', lead_id: '00000000-0000-0000-0000-0000000000a2', brand_id: '00000000-0000-0000-0000-0000000000b1' };
  const ctx = { found: true, consent_ads_at: '2026-10-21T10:00:00Z', phone: '+27821234567', pixel_id: 'px', dataset_id: 'ds', duplicate: false, is_synthetic: false };
  const env = { DRY_RUN_SENDS: 'false', CAPI_SYNTHETIC_TEST_EVENT_CODE: 'TESTE2E' };
  const n = CAPI.normalise(input);
  const real = CAPI.build(n, ctx, env);
  assert.equal(real.action, 'send'); assert.equal('test_event_code' in real.body, false, 'a real lead is a production event'); assert.equal(real.test_event_code, null);
  const syn = CAPI.build(n, { ...ctx, is_synthetic: true }, env);
  assert.equal(syn.action, 'send'); assert.equal(syn.body.test_event_code, 'TESTE2E');
  assert.equal(CAPI.build(n, { ...ctx, is_synthetic: true }, { DRY_RUN_SENDS: 'false' }).reason, 'synthetic_lead', 'no code: skipped as before');
  // the staging switch is unchanged: it marks every event (docs/CAPI-ENABLE; never while ads are live)
  assert.equal(CAPI.build(n, ctx, { DRY_RUN_SENDS: 'false', CAPI_TEST_EVENT_CODE: 'TEST123' }).body.test_event_code, 'TEST123');
});
