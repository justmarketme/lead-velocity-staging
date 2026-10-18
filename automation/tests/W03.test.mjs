// W03 Click-to-WhatsApp intake (not core-path; authored by automation-engineer).
// Run: node --test automation/tests/W03.test.mjs   (Node 18+, offline, synthetic fixtures only)
// Logic under test: automation/ctwa/w03.js (inlined into automation/W03.json). Structure check: automation/W03.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FIX, lead, broker, ms } from './_harness.mjs';

const require = createRequire(import.meta.url);
const W3 = require('../ctwa/w03.js');
const WF = JSON.parse(readFileSync(new URL('../W03.json', import.meta.url), 'utf8'));
const MARK = broker();
const BRAND = { brand_id: 'smc', consent_mode: 'named' };

/** Fixture inbound -> Cloud API message shape. */
function toMsg(m, i) {
  const base = { from: '', id: `wamid.TEST.${i}`, timestamp: String(Math.floor(ms(m.at) / 1000)) };
  if (m.type === 'text') return { ...base, type: 'text', text: { body: m.text }, ...(m.referral ? { referral: m.referral } : {}) };
  if (m.type === 'list') return { ...base, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: m.payload, title: m.payload } } };
  return { ...base, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: m.payload, title: m.payload } } };
}
function run(fx, { brand = BRAND, brokerRow = MARK, existing = null } = {}) {
  const s = fx.submission;
  let thread = null;
  const all = [];
  s.inbound.forEach((m, i) => {
    const r = W3.step(thread, toMsg(m, i), { at: m.at, mobile: '+' + s.wa_id, profile_name: s.profile_name, lead_id: fx.lead_id ?? `lead_test_${fx.fixture_id}`, broker: brokerRow, brand, existing_open_lead_id: existing, suppressed: false, is_synthetic: true });
    thread = r.thread;
    r.actions.forEach((a) => all.push({ at: m.at, ...a }));
  });
  return { thread, actions: all };
}
const sends = (acts) => acts.filter((a) => a.kind === 'send');

test('L04 consent yes: named consent first, lead row at the tap (verified), Meta referral stored, CAPI Lead once', () => {
  const fx = lead('L04');
  const { actions } = run(fx);
  const consentMsg = sends(actions)[0].message;
  assert.equal(consentMsg.type, 'button');
  assert.ok(consentMsg.body.includes(`${MARK.practice_name} (FSP ${MARK.fsp_number}), an authorised financial services provider`), consentMsg.body);
  assert.deepEqual(consentMsg.buttons.map((b) => b.id), ['consent_yes', 'consent_no']);
  const ins = actions.filter((a) => a.kind === 'insert_lead');
  assert.equal(ins.length, 1);
  const row = ins[0].row;
  const e = fx.expected.W01;
  assert.equal(ins[0].at, e.lead_row_at);
  assert.equal(row.verified_at, e.verified_at);
  assert.equal(row.ctwa_clid, e.ctwa_clid);
  assert.equal(row.ad_id, 'ad_test_ctwa_01');
  assert.equal(row.origin, 'ctwa');
  assert.equal(row.consent_mode, 'named');
  assert.equal(row.consent_text_version, 'ctwa-named-v3');
  assert.match(row.consent_text, /Lead Velocity \(Pty\) Ltd/);
  assert.match(row.consent_text, /Reply STOP to opt out/);
  assert.match(row.consent_text, /sortmycover\.co\.za\/privacy/);
  assert.ok(row.consent_text.length < 1024, 'consent body under the WhatsApp interactive limit');
  assert.equal(row.consent_text, consentMsg.body, 'stored consent = the exact words shown');
  assert.equal(row.phone, '+27600000104');
  const capi = actions.filter((a) => a.kind === 'capi');
  assert.deepEqual(capi.map((c) => [c.event_name, c.event_id, c.action_source]), [['Lead', e.capi_lead_event_id, 'business_messaging']]);
});

test('L04 qualifying is tap-only and ends in route + first touch at the method tap (W06 deadline 60 s)', () => {
  const fx = lead('L04');
  const { actions, thread } = run(fx);
  const route = actions.filter((a) => a.kind === 'route_and_first_touch');
  assert.equal(route.length, 1);
  assert.equal(route[0].at, fx.expected.W01.routed_at);
  assert.equal(route[0].deadline_s, 60);
  assert.equal(route[0].template_hint, fx.expected.W06.template);
  const upd = actions.filter((a) => a.kind === 'update_lead').at(-1).set;
  assert.deepEqual([upd.age_band, upd.budget_band, upd.bond, upd.dependants, upd.method_pref, upd.stage], ['45_50', '750_1250', true, true, 'phone', 'qualified']);
  assert.equal(thread.stage, 'done');
  // every question is interactive, never free text
  for (const s of sends(actions)) assert.ok(['button', 'list'].includes(s.message.type));
});

test('L05 consent no: no lead row, only the hashed number, one reply after "No", no CAPI, broker not named in the close', () => {
  const fx = lead('L05');
  const { actions, thread } = run(fx);
  assert.equal(actions.filter((a) => a.kind === 'insert_lead').length, 0);
  assert.equal(actions.filter((a) => a.kind === 'capi').length, 0);
  const sup = actions.filter((a) => a.kind === 'suppress');
  assert.equal(sup.length, 1);
  assert.equal(sup[0].source, fx.expected.W01.suppression.source);
  assert.equal(sup[0].mobile_hash, createHash('sha256').update(fx.expected.W01.suppression.mobile_hash_of).digest('hex'));
  const afterNo = sends(actions).filter((a) => a.at === fx.submission.inbound[1].at);
  assert.equal(afterNo.length, fx.expected.W01.messages_after_no);
  assert.doesNotMatch(afterNo[0].message.body, /Mark|FSP/);
  assert.equal(thread.origin, undefined, 'origin/referral dropped on "No thanks"');
});

test('L06 out-of-band age: polite close, no hand-over, deleted within 24 h, no first touch', () => {
  const fx = lead('L06');
  const { actions } = run(fx);
  assert.equal(actions.filter((a) => a.kind === 'route_and_first_touch').length, 0);
  const upd = actions.filter((a) => a.kind === 'update_lead').at(-1).set;
  assert.equal(upd.disqualified_reason, fx.expected.W01.disqualified_reason);
  assert.equal(upd.broker_id, null);
  assert.equal(upd.age_band, '51plus', 'fixture code mapped to the leads_smc_checks code');
  assert.equal(ms(upd.retention_delete_after), ms(fx.expected.W01.delete_after));
  assert.match(sends(actions).at(-1).message.body, /not the right fit/);
});

test('generic consent mode uses the 4.6 CTWA text with the v3 scope (fixture ctwa-generic-v3)', () => {
  const { actions } = run(lead('L05'), { brand: { brand_id: 'smc', consent_mode: 'generic' } });
  assert.equal(sends(actions)[0].message.body, FIX.consent_texts['ctwa-generic-v3']);
});

test('named mode with no routable broker: no consent prompt, nothing stored, alert raised', () => {
  const { actions } = run(lead('L04'), { brokerRow: null });
  assert.equal(actions.filter((a) => a.kind === 'insert_lead').length, 0);
  assert.ok(actions.some((a) => a.kind === 'alert' && a.signal_key === 'ctwa_no_broker'));
});

test('existing open lead (90-day dedupe): forwarded to W07, no second consent, no second lead', () => {
  const { actions } = run(lead('L04'), { existing: 'lead_test_L04' });
  assert.ok(actions.every((a) => a.kind === 'forward_w07'));
});

test('free text mid-question re-asks the same question and logs the text for the brief; state does not move', () => {
  const fx = lead('L04');
  const r1 = W3.step(null, toMsg(fx.submission.inbound[0], 0), { at: fx.submission.inbound[0].at, mobile: '+27600000104', lead_id: 'x1', broker: MARK, brand: BRAND });
  const r2 = W3.step(r1.thread, toMsg(fx.submission.inbound[1], 1), { at: fx.submission.inbound[1].at, mobile: '+27600000104', lead_id: 'x1', broker: MARK, brand: BRAND });
  const r3 = W3.step(r2.thread, { type: 'text', text: { body: 'how much does cover cost?' } }, { at: fx.submission.inbound[1].at, mobile: '+27600000104', lead_id: 'x1', broker: MARK, brand: BRAND });
  assert.equal(r3.thread.stage, 'q_age');
  assert.ok(r3.actions.some((a) => a.kind === 'forward_w07' && a.reply === false));
  assert.equal(r3.actions.find((a) => a.kind === 'send').message.type, 'list');
});

test('stall nudges at +1 h, +20 h, +68 h (inside the 72-h CTWA window) and cancelled when qualifying ends', () => {
  const { actions } = run(lead('L04'));
  const st = actions.filter((a) => a.kind === 'schedule_stall');
  assert.ok(st.length >= 1);
  assert.deepEqual(st[0].hours, [1, 20, 68]);
  assert.ok(Math.max(...st[0].hours) < 72);
  assert.ok(actions.some((a) => a.kind === 'cancel_stall'));
});

test('readOrigin: W03-notes acceptance (a)-(g)', () => {
  const ref = (body, referral) => W3.readOrigin({ type: 'text', text: { body }, ...(referral ? { referral } : {}) });
  const R = { source_type: 'ad', source_id: '120212345678901234', ctwa_clid: 'ARAk_test' };
  let o = ref("Hi, I'd like to book a 30-minute call with an adviser.", R); // (a) the ad pre-fill since 18 Oct 2026
  assert.deepEqual([o.origin, o.ctwa_clid, o.ad_id, o.ref], ['ctwa', 'ARAk_test', '120212345678901234', null]);
  o = ref("Hi, I'd like to check my life cover (ref cmt_120212345678901234)"); // (b)
  assert.deepEqual([o.origin, o.ad_id, o.ctwa_clid, o.text_without_ref], ['comment', '120212345678901234', null, "Hi, I'd like to check my life cover"]);
  o = ref("Hi (ref cmt_120212345678901234)", R); // (c)
  assert.deepEqual([o.origin, o.ref, o.ctwa_clid], ['ctwa', 'cmt_120212345678901234', 'ARAk_test']);
  o = ref('Hi (ref cmt_org_111111_222222)'); // (d)
  assert.deepEqual([o.origin, o.ad_id], ['comment', null]);
  assert.equal(ref('Hi (ref dm_instagram)').origin, 'dm'); // (e)
  for (const bad of ['Hi (ref <script>)', 'Hi (ref cmt_12; drop)']) { const x = ref(bad); assert.equal(x.ref, null); assert.equal(x.text_without_ref, bad); } // (f)
  assert.equal(ref('Hi (ref cmt_120212345678901234) and more').ref, null); // (g)
});

test('redirect (I-09): good ref -> 302 to wa.me with the ref prefill; bad ref -> plain prefill; never another host', () => {
  const ok = W3.redirectFor('cmt_120212345678901234', '27600000099', 'Mozilla/5.0 (iPhone)');
  assert.equal(ok.status, 302);
  assert.equal(new URL(ok.headers.Location).host, 'wa.me');
  assert.equal(new URL(ok.headers.Location).searchParams.get('text'), "Hi, I'd like to book a 30-minute call with an adviser. (ref cmt_120212345678901234)");
  assert.deepEqual(ok.click, { ref: 'cmt_120212345678901234', ua_class: 'ios' });
  for (const bad of ['https://evil.example', '<script>', 'cmt_1', '../x', '%0d%0aSet-Cookie:x']) {
    const r = W3.redirectFor(bad, '27600000099');
    assert.equal(new URL(r.headers.Location).host, 'wa.me');
    assert.equal(new URL(r.headers.Location).searchParams.get('text'), "Hi, I'd like to book a 30-minute call with an adviser.");
    assert.equal(r.click.ref, null);
  }
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.throws(() => W3.redirectFor('dm_messenger', ''));
});

test('every interactive message fits Cloud API limits (<=3 buttons/20 chars, <=10 rows/24 chars)', () => {
  const qs = ['q_age', 'q_budget', 'q_bond', 'q_method'].map((s) => W3.question(s, MARK));
  qs.push({ type: 'button', body: 'x', buttons: [{ id: 'consent_yes', title: 'Yes, continue' }, { id: 'consent_no', title: 'No thanks' }] });
  for (const q of qs) {
    const api = W3.toCloudApi('+27600000104', q).interactive;
    if (api.type === 'button') { assert.ok(api.action.buttons.length <= 3); for (const b of api.action.buttons) assert.ok(b.reply.title.length <= 20 && b.reply.title === q.buttons.find((x) => x.id === b.reply.id).title); }
    else { const rows = api.action.sections.flatMap((s) => s.rows); assert.ok(rows.length <= 10); for (const r of rows) assert.ok(r.title.length <= 24 && q.rows.find((x) => x.id === r.id).title === r.title); }
  }
});

test('W03.json: settings block, inactive, credentials by name only, no secrets, every connection target exists, inlined logic is current', () => {
  assert.equal(WF.active, false);
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  assert.equal(WF.settings.errorWorkflow, 'smc-w22', 'n8n reads errorWorkflow as a workflow id (I-44b)');
  const names = new Set(WF.nodes.map((n) => n.name));
  for (const [from, c] of Object.entries(WF.connections)) {
    assert.ok(names.has(from), from);
    for (const out of c.main) for (const l of out) assert.ok(names.has(l.node), l.node);
  }
  for (const n of WF.nodes) for (const cred of Object.values(n.credentials || {})) assert.equal(cred.id, '', `${n.name}: credential by name only`);
  const raw = JSON.stringify(WF);
  assert.doesNotMatch(raw, /EAA[A-Za-z0-9]{20,}|sk_live|-----BEGIN|Bearer [A-Za-z0-9._-]{20,}/);
  assert.match(raw, /\$env\.LEAD_TOKEN_SECRET/);
  const src = readFileSync(new URL('../ctwa/w03.js', import.meta.url), 'utf8');
  const sha = createHash('sha256').update(src).digest('hex').slice(0, 12);
  assert.ok(raw.includes(`w03.js sha256:${sha}`), 'W03.json inlines the current w03.js (regenerate with automation/build-w03-w28.mjs)');
});

// I-44d: Meta's GET subscription check must get the challenge back verbatim as text/plain 200. The verify node returns
// { ok, status, body } (body = challenge), and the respond node used $json.challenge, so it sent an empty 200.
// The real Code node runs here, and the respond node's expressions are evaluated on its output.
test('I-44d GET verify: right token -> 200 text/plain with the challenge; wrong token -> 403; bad challenge -> 400', () => {
  const node = (name) => WF.nodes.find((n) => n.name === name);
  const TOKEN = 'synthetic-meta-webhook-verify-token';
  const verify = (query) => new Function('$input', '$env', 'require', node('Check hub.verify_token').parameters.jsCode)(
    { first: () => ({ json: { query } }) }, { META_WEBHOOK_VERIFY_TOKEN: TOKEN }, require)[0].json;
  const resp = node('Respond hub.challenge');
  const expr = (e, $json) => new Function('$json', `return (${String(e).replace(/^=\{\{([\s\S]*)\}\}$/, '$1')});`)($json);
  const answer = (query) => { const j = verify(query); return { status: Number(expr(resp.parameters.options.responseCode, j)), body: expr(resp.parameters.responseBody, j) }; };
  assert.equal(resp.parameters.respondWith, 'text');
  const ct = resp.parameters.options.responseHeaders.entries.find((h) => h.name === 'Content-Type');
  assert.match(ct.value, /^text\/plain/);
  assert.deepEqual(answer({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '1158201444' }), { status: 200, body: '1158201444' });
  assert.deepEqual(answer({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1158201444' }), { status: 403, body: 'forbidden' });
  assert.deepEqual(answer({ 'hub.mode': 'unsubscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '1' }), { status: 403, body: 'forbidden' });
  assert.equal(answer({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '<script>' }).status, 400, 'challenge is echoed only when it is a plain token');
  assert.ok(!/\$json\.challenge/.test(resp.parameters.responseBody), 'the verify node has no challenge field');
});

// ---------------------------------------------------------------- I-47a / I-47b / I-48b / I-48k (2026-10-03)
import { runCode } from './_n8ncode.mjs';
const QLEAD = (state, over = {}) => ({ id: 'lead_q1', conv_state: { state }, broker_id: MARK.broker_id, ...over });
const typedStep = (state, slots, over = {}, thread = null) => W3.step(thread, { type: 'text', text: { body: 'typed' } },
  { at: '2026-10-13T10:00:00+02:00', mobile: '+27600000047', lead_id: 'unused', broker: MARK, brand: BRAND, existing_open_lead_id: 'lead_q1', lead: QLEAD(state, over), typed: { slots, actions: ['record_answer', 'next_question'] }, hops: 1 });

test('I-47a: typed "I\'m 47" at q_age with no wa_thread -> age_band 45_50 recorded, conv_state q_budget written by W03, budget question asked, no forward back', () => {
  const r = typedStep('q_age', { age_band: '45-50' });
  const upd = r.actions.find((a) => a.kind === 'update_lead');
  assert.deepEqual(upd.set, { age_band: '45_50', conv_state_state: 'q_budget' });
  assert.equal(r.thread.stage, 'q_budget');
  assert.match(r.actions.find((a) => a.kind === 'send').message.body, /each month/);
  assert.equal(r.actions.some((a) => a.kind === 'forward_w07'), false);
});

test('I-47a: NLU bands map to leads_smc_checks codes (lt35/35_44/45_50/51plus; lt750/750_1250/1250plus); out-of-band closes', () => {
  for (const [nlu, db] of [['35-44', '35_44'], ['45-50', '45_50']]) assert.equal(typedStep('q_age', { age_band: nlu }).actions.find((a) => a.kind === 'update_lead').set.age_band, db);
  for (const [nlu, db] of [['<35', 'lt35'], ['51+', '51plus']]) {
    const r = typedStep('q_age', { age_band: nlu });
    const u = r.actions.find((a) => a.kind === 'update_lead').set;
    assert.equal(u.age_band, db); assert.equal(u.stage, 'disqualified'); assert.equal(u.conv_state_state, 'closed_oob'); assert.equal(r.thread.stage, 'closed');
  }
  for (const [nlu, db] of [['750-1250', '750_1250'], ['1250+', '1250plus'], ['1250-1499', '1250_1499'], ['1500+', '1500_plus']]) {
    const r = typedStep('q_budget', { budget_band: nlu }, { age_band: '45_50' });
    assert.deepEqual(r.actions.find((a) => a.kind === 'update_lead').set, { budget_band: db, conv_state_state: 'q_bond' });
  }
  // tier C (2026-10-11): under R750 is recorded and the questions go on (never disqualified on budget)
  const loR = typedStep('q_budget', { budget_band: '<750' });
  assert.deepEqual(loR.actions.find((a) => a.kind === 'update_lead').set, { budget_band: 'lt750', conv_state_state: 'q_bond' });
  assert.equal(loR.thread.stage, 'q_bond'); assert.ok(loR.actions.some((a) => a.kind === 'send'), 'next question asked');
  assert.ok(!loR.actions.some((a) => a.kind === 'update_lead' && a.set.disqualified_reason), 'not disqualified');
  const u1 = typedStep('q_budget', { budget_band: 'unsure' });
  assert.equal(u1.actions.find((a) => a.kind === 'update_lead').set.conv_state_state, 'q_budget_clarify');
  assert.equal(typedStep('q_budget_clarify', { budget_band: 'unsure' }).actions.find((a) => a.kind === 'update_lead').set.stage, 'disqualified');
});

test('tier C: tapped under-R750 rows continue; at the end an unrouted tier-C lead goes to W01 routing (held or standing yes), never closed', () => {
  for (const id of ['budget_under_500', 'budget_500_750']) {
    const r = W3.step({ stage: 'q_budget', lead_id: 'lead_q1', answers: { age_band: '45_50' } }, { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id } } }, { at: '2026-10-13T10:00:00+02:00', mobile: '+27600000047', lead_id: 'unused', broker: MARK, brand: BRAND });
    const u = r.actions.find((a) => a.kind === 'update_lead').set;
    assert.deepEqual(u, { budget_band: 'lt750', conv_state_state: 'q_bond' }, id);
    assert.equal(r.thread.stage, 'q_bond', id);
  }
  const fin = typedStep('q_method', { method: 'phone' }, { age_band: '45_50', budget_band: 'lt750', broker_id: null });
  assert.equal(fin.actions.find((a) => a.kind === 'update_lead').set.budget_band, 'lt750');
  assert.ok(fin.actions.some((a) => a.kind === 'route_and_first_touch'), 'W01 decides: standing-yes broker or held_low_budget');
});

test('I-47a: 4.6 order to the end; bond/dependants typed; method -> hand back after_qualifying (routed lead) or W01 route (unrouted)', () => {
  const b = typedStep('q_bond', { dependants: true });
  assert.deepEqual(b.actions.find((a) => a.kind === 'update_lead').set, { dependants: true, conv_state_state: 'q_method' });
  assert.equal(b.actions.find((a) => a.kind === 'send').message.body, 'How would you like to talk to Mark?'.replace('Mark', MARK.adviser_first_name || 'the adviser'));
  const m = typedStep('q_method', { method: 'phone' }, { age_band: '45_50', budget_band: '1250plus' });
  const fin = m.actions.find((a) => a.kind === 'update_lead').set;
  assert.equal(fin.method_pref, 'phone'); assert.equal(fin.age_band, '45_50'); assert.equal(fin.budget_band, '1250plus'); assert.equal(fin.conv_state_state, 'unbooked');
  assert.ok(m.actions.some((a) => a.kind === 'forward_w07' && a.reason === 'after_qualifying'));
  const m2 = typedStep('q_method', { method: 'phone' }, { broker_id: null });
  assert.ok(m2.actions.some((a) => a.kind === 'route_and_first_touch'));
  // a tap at q_method for a W07-owned lead works the same way (W07 routes q_method taps here, I-48k)
  const tap = W3.step(null, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'method_teams' } } }, { at: '2026-10-13T10:00:00+02:00', mobile: '+27600000047', broker: MARK, brand: BRAND, existing_open_lead_id: 'lead_q1', lead: QLEAD('q_method') });
  assert.equal(tap.actions.find((a) => a.kind === 'update_lead').set.method_pref, 'teams');
  // no answer in the typed text -> the same question again, nothing forwarded back to W07 (it already has the text)
  const none = typedStep('q_age', {});
  assert.equal(none.thread.stage, 'q_age'); assert.equal(none.actions.some((a) => a.kind === 'forward_w07'), false);
  // a lead that is not mid-qualifying is still handed back
  assert.equal(typedStep('booked', { age_band: '45-50' }).actions[0].reason, 'existing_lead_90d');
});

test('I-47b: no brands row for the receiving number -> log row + W22 signal, no thread stored', () => {
  const r = W3.step(null, { type: 'text', text: { body: 'hi' } }, { at: '2026-10-13T10:00:00+02:00', mobile: '+27600000047', brand: { brand_id: null }, phone_number_id: '999' });
  assert.equal(r.no_thread, true);
  assert.equal(r.actions[0].kind, 'log_no_brand');
  assert.equal(r.actions[1].signal_key, 'w03_no_brand');
  const sw = WF.nodes.find((n) => n.name === 'Action?');
  const i = sw.parameters.rules.values.findIndex((v) => v.outputKey === 'log_no_brand');
  assert.equal(WF.connections['Action?'].main[i][0].node, 'Log no brand (I-47b)');
  assert.match(WF.nodes.find((n) => n.name === 'Load context').parameters.query, /FROM \(SELECT 1\) one\s+LEFT JOIN public\.brands br/);
  assert.equal(WF.connections['W03 step'].main[0].some((x) => x.node === 'Save thread'), false, 'Save thread only behind the brand gate');
});

test('I-47a via the real Code nodes: W07 delegation -> adapter carries typed slots, lead id, hops; "W03 step" records the band', async () => {
  const deleg = { source: 'W07', route: 'W03', lead: { id: 'lead_q1' }, delegate: { to: 'W03', action: 'record_answer', actions: ['record_answer', 'next_question'], slots: { age_band: '45-50' } },
    msg: { wamid: 'wamid.I47', from: '+27600000047', at_ms: Date.parse('2026-10-13T08:00:00Z'), type: 'text', text: "I'm 47", phone_number_id: '100000000000001', hops: 1 } };
  const [ad] = await runCode(WF, 'W07 hand-off -> Cloud API message', { items: [deleg] });
  assert.deepEqual(ad.json.typed.slots, { age_band: '45-50' }); assert.equal(ad.json.lead_id, 'lead_q1'); assert.equal(ad.json.hops, 1);
  const ctxRow = { brand_id: 'b-smc', broker: { ...MARK, consent_mode: 'named' }, existing_open_lead_id: 'lead_q1', lead: QLEAD('q_age'), suppressed: false, thread: null, new_lead_id: 'n1' };
  const [st] = await runCode(WF, 'W03 step', { items: [ctxRow], refs: { 'W07 hand-off -> Cloud API message': ad.json } });
  assert.equal(st.json.lead_id, 'lead_q1'); assert.equal(st.json.store_thread, true);
  assert.deepEqual(st.json.actions.find((a) => a.kind === 'update_lead').set, { age_band: '45_50', conv_state_state: 'q_budget' });
  const fan = await runCode(WF, 'Fan out actions', { items: [st.json] });
  const send = fan.find((x) => x.json.kind === 'send');
  const [body] = await runCode(WF, 'Build Cloud API body', { items: [send.json] });
  assert.equal(body.json.lead_id, 'lead_q1'); assert.equal(body.json.wamid, 'wamid.I47'); assert.match(body.json.content, /each month/);
  const [noBrand] = await runCode(WF, 'W03 step', { items: [{ ...ctxRow, brand_id: null }], refs: { 'W07 hand-off -> Cloud API message': ad.json } });
  assert.equal(noBrand.json.store_thread, false);
});

test('I-48b/I-48k: W03 sends behind the shared reply claim + DRY_RUN_SENDS gate and writes the outbound communications row; hand-back hop limit', async () => {
  const c = WF.connections;
  assert.equal(c['Build Cloud API body'].main[0][0].node, 'Reply claim (w07:reply:{wamid})');
  assert.equal(c['Reply claim (w07:reply:{wamid})'].main[0][0].node, 'Live send? (W03)');
  // 2026-10-11: the send goes through smc-whatsapp-send (lib/wa-route.cjs): Live send? -> SUB input -> the waiting sub-call
  assert.equal(c['Live send? (W03)'].main[0][0].node, 'SUB input (WhatsApp send (session))');
  assert.equal(c['SUB input (WhatsApp send (session))'].main[0][0].node, 'WhatsApp send (session)');
  assert.equal(WF.nodes.find((n) => n.name === 'WhatsApp send (session)').parameters.workflowId.value, 'smc-whatsapp-send');
  assert.equal(c['Live send? (W03)'].main[1][0].node, 'Store outbound (W03)');
  assert.equal(c['WhatsApp send (session)'].main[0][0].node, 'Store outbound (W03)');
  assert.match(WF.nodes.find((n) => n.name === 'Live send? (W03)').parameters.conditions.conditions[0].leftValue, /DRY_RUN_SENDS !== 'true'/);
  const store = WF.nodes.find((n) => n.name === 'Store outbound (W03)');
  assert.match(store.parameters.query, /INSERT INTO public\.communications[\s\S]*'W03'/);
  const rep = store.parameters.options.queryReplacement.replace(/^=\{\{([\s\S]*)\}\}$/, '$1');
  const out = { brand_id: 'b', mobile: '+27600000047', content: 'q', wamid: 'wamid.I47', lead_id: 'lead_q1' };
  const args = new Function('$json', '$', `return (${rep});`)({}, () => ({ item: { json: { out } } }));
  assert.equal(args[3], 'dry:w03:wamid.I47'); assert.equal(args[5], true);
  const fwd = await runCode(WF, 'Mark origin w03 (loop guard)', { items: [{ lead_id: 'l', reason: 'after_qualifying' }], refs: { 'Called by W07 (CTWA lead)': { msg: { wamid: 'w', hops: 3 } } } });
  assert.equal(fwd[0].json.hop_over, true); assert.equal(fwd[0].json.msg.hops, 4);
  assert.equal(c['Hop limit ok? (I-48b)'].main[1][0].node, 'Log hop limit (W03)');
  assert.deepEqual(W3.hopNext(2), { hops: 3, over: false });
});

test('I-47a: a stored placeholder thread { stage: "none" } is no thread (the lead path runs); a null thread is never stored', async () => {
  const r = W3.step({ stage: 'none', answers: {} }, { type: 'text', text: { body: "I'm 47" } }, { at: '2026-10-13T10:00:00+02:00', mobile: '+27600000047', broker: MARK, brand: BRAND, existing_open_lead_id: 'lead_q1', lead: QLEAD('q_age'), typed: { slots: { age_band: '45-50' } } });
  assert.equal(r.actions.find((a) => a.kind === 'update_lead').set.age_band, '45_50');
  const ad = { msg: { type: 'text', text: { body: 'x' } }, at: '2026-10-13T08:00:00Z', mobile: '+27600000047', external_id: 'w', typed: null, hops: 0 };
  const [st] = await runCode(WF, 'W03 step', { items: [{ brand_id: 'b', broker: null, existing_open_lead_id: 'lead_q1', lead: QLEAD('booked'), thread: null }], refs: { 'W07 hand-off -> Cloud API message': ad } });
  assert.equal(st.json.thread, null); assert.equal(st.json.store_thread, false);
});

test('I-47a: for a W07-owned lead the lead row wins over a stale rebuilt thread (from_lead)', () => {
  const stale = { stage: 'q_budget', lead_id: 'lead_q1', answers: { age_band: '45_50' }, from_lead: true };
  const r = W3.step(stale, { type: 'text', text: { body: "I'm 47" } }, { at: '2026-10-13T10:00:00+02:00', mobile: '+27600000047', broker: MARK, brand: BRAND, existing_open_lead_id: 'lead_q1', lead: QLEAD('q_age'), typed: { slots: { age_band: '45-50' } } });
  assert.equal(r.actions.find((a) => a.kind === 'update_lead').set.conv_state_state, 'q_budget');
  assert.equal(r.thread.stage, 'q_budget');
});

// Quiz v2 (2026-10-14): every band code the page / WhatsApp sends is accepted; a web lead is asked with the approved
// qualify_budget template, so there is ONE list (the template's five bands); the band triggers routing (held leads) and W05 finalize.
test('quiz v2 bands: 750_1499 qualifies (was missing), ids map to DB codes, one list for lead-ad and web leads; W03.json wiring', () => {
  for (const v of ['750_1250', '750_1499', '1250_1499', '1500_plus']) assert.ok(W3.QUAL_BUDGET.has(v), v);
  assert.deepEqual(['lt750', 'under_750', '750_1499', '1500_plus'].map((v) => W3.BUDGET_TO_DB[v]), ['lt750', 'lt750', '750_1499', '1500_plus']);
  assert.equal(W3.BUDGET_ROWS_V2, undefined, 'no second band list: the approved template has the five bands');
  assert.deepEqual(W3.BUDGET_ROWS.map(([id]) => id), ['budget_under_500', 'budget_500_750', 'budget_750_1250', 'budget_1250_1499', 'budget_1500_plus'], 'qualify_budget template rows untouched');
  assert.deepEqual(W3.question('q_budget').rows.map((r) => r.id), W3.BUDGET_ROWS.map(([id]) => id));
  assert.doesNotMatch(W3.question('q_budget').body, /current|paying|premium/i, 'forward-looking wording, never "what do you pay now"');
  // a CTWA lead answering R750-R1,499 (typed or tapped) is in band, not closed
  const t = { stage: 'q_budget', lead_id: 'lead_v2b', answers: { age_band: '35_44' } };
  const r = W3.step(t, { type: 'interactive', interactive: { list_reply: { id: 'budget_750_1499' } } }, { at: '2026-10-13T10:00:00+02:00', mobile: '+27600000188', brand: { brand_id: 'b1', consent_mode: 'generic' } });
  assert.equal(r.thread.stage, 'q_bond'); assert.equal(r.actions.find((a) => a.kind === 'update_lead').set.budget_band, '750_1499');
  // wiring: Load context reads the lead's origin (threadFromLead needs it), finalize_booking -> W05 by id
  const nd = (n) => WF.nodes.find((x) => x.name === n);
  assert.match(nd('Load context').parameters.query, /l2\.origin/);
  const sw = nd('Action?').parameters.rules.values.map((v) => v.outputKey);
  const i = sw.indexOf('finalize_booking');
  assert.ok(i > sw.indexOf('update_lead'), 'band UPDATE runs before finalize (execution order v1)');
  assert.equal(WF.connections['Action?'].main[i][0].node, 'W05 Book (finalize after the band)');
  assert.equal(nd('W05 Book (finalize after the band)').parameters.workflowId.value, 'smc-w05');
});

// ---------------------------------------------------------------- website opener (17 Oct 2026, WHATSAPP-OPENERS.md)
const OPENER = (topic, who, ref, via) => `Hi Lindi, I'd like to chat about ${topic}. I agree that SortMyCover may message me on WhatsApp about this and share my details with ${who}. Ref ${ref}${via ? ` via ${via}` : ''}`;
const opStep = (text, extra = {}) => W3.step(null, { from: '27600000555', id: 'SMopener1', timestamp: '1792240000', type: 'text', text: { body: text }, ...extra },
  { at: '2026-10-17T14:50:00+02:00', mobile: '+27600000555', profile_name: 'Thabo Mokoena', lead_id: 'lead_opener_1', broker: MARK, brand: BRAND, existing_open_lead_id: null, suppressed: false, wamid: 'SMopener1', is_synthetic: true });

test('opener from an unknown number: lead stored at once with the opener consent, ref, via and provenance; greet + topic + first question', () => {
  const r = opStep(OPENER('cover for my family', 'an authorised adviser', 'a06', 'ig/cycle1-new-baby/reel-02'));
  const ins = r.actions.filter((a) => a.kind === 'insert_lead');
  assert.equal(ins.length, 1, 'no consent buttons: the opener is the consent');
  const row = ins[0].row;
  assert.equal(row.consent_text_version, 'CONSENT-GENERIC-v5web');
  assert.equal(row.consent_mode, 'generic');
  assert.equal(row.consent_source, 'whatsapp_opener');
  assert.equal(row.consent_text, 'I agree that SortMyCover may message me on WhatsApp about this and share my details with an authorised adviser.');
  assert.equal(row.consent_at, '2026-10-17T14:50:00+02:00');
  assert.equal(row.ref, 'a06');
  assert.equal(row.source, 'campaign');
  assert.equal(row.origin, 'ctwa');
  assert.equal(row.product_interest, 'life_cover');
  assert.deepEqual(row.reasons, ['life_cover']);
  assert.deepEqual([row.utm_source, row.utm_campaign, row.utm_content], ['ig', 'cycle1-new-baby', 'reel-02']);
  assert.equal(row.first_name, 'Thabo Mokoena');
  assert.deepEqual(row.conv_state, { state: 'q_age', topic: 'cover for my family', ref: 'a06' });
  const pv = row.provenance;
  assert.equal(pv.door, 'whatsapp_opener');
  assert.equal(pv.page_ref, 'a06');
  assert.deepEqual(pv.via, { source: 'ig', campaign: 'cycle1-new-baby', content: 'reel-02' });
  assert.equal(pv.inbound_sid, 'SMopener1');
  assert.equal(pv.received_at, '2026-10-17T14:50:00+02:00');
  assert.equal(pv.consent_version, 'CONSENT-GENERIC-v5web');
  assert.match(pv.opener_text, /^Hi Lindi, I'd like to chat about cover for my family\./);
  const s = sends(r.actions);
  assert.equal(s.length, 1, 'one message');
  assert.equal(s[0].message.type, 'list');
  assert.match(s[0].message.body, /^Hi Thabo, I'm Lindi from SortMyCover\. /);
  assert.equal(/AI/.test(s[0].message.body), false, 'no AI wording (Jono, 17 Oct)');
  assert.match(s[0].message.body, /Thanks for getting in touch about cover for my family\. If it's something else, just tell me\.\n\nWhich age group are you in\?$/);
  assert.equal(r.thread.stage, 'q_age');
  assert.equal(r.thread.lead_id, 'lead_opener_1');
});

test('opener: curly apostrophe, no via (direct visit), site page code -> website_form; income topic -> disability reason', () => {
  const r = opStep(OPENER('income protection', 'an authorised adviser', 'w-learn-income').replace("I'd", 'I’d'));
  const row = r.actions.find((a) => a.kind === 'insert_lead').row;
  assert.equal(row.source, 'website_form');
  assert.equal(row.ref, 'w-learn-income');
  assert.deepEqual(row.reasons, ['disability']);
  assert.equal(row.utm_source, null);
  assert.equal(row.provenance.via, null);
});

test('opener for a will (Capital Legacy): lead stored, a person is promised and an escalation opened, no cover questions', () => {
  const r = opStep(OPENER('a will', 'Capital Legacy', 'b02', 'fb/cycle1-wills/carousel'));
  const row = r.actions.find((a) => a.kind === 'insert_lead').row;
  assert.equal(row.product_interest, 'wills');
  assert.equal(row.reasons, null);
  assert.equal(row.conv_state.state, 'handoff');
  assert.match(row.consent_text, /share my details with Capital Legacy\.$/);
  const s = sends(r.actions);
  assert.equal(s.length, 1);
  assert.equal(s[0].message.type, 'text');
  assert.match(s[0].message.body, /Capital Legacy consultant, so I've asked a person from our team to message you here shortly/);
  assert.equal(r.actions.filter((a) => a.kind === 'escalate').length, 1);
  assert.equal(r.actions.filter((a) => a.kind === 'alert').length, 0, 'no W22 call (inactive): the escalation row is the alert');
});

test('edited opener without the consent sentence, unknown ref, or plain text: normal consent question, no lead row', () => {
  for (const t of ["Hi Lindi, I'd like to chat about cover for my family. Ref a06",
    OPENER('cover', 'an authorised adviser', 'zz9'),
    OPENER('cover', 'an authorised adviser', 'a06').replace('I agree that', 'I do not agree that'),
    "Hi Lindi, I'd like to sort out life cover for my family"]) {
    const r = opStep(t);
    assert.equal(r.actions.filter((a) => a.kind === 'insert_lead').length, 0, t);
    const s = sends(r.actions);
    assert.deepEqual(s[0].message.buttons.map((b) => b.id), ['consent_yes', 'consent_no'], t);
    assert.equal(r.thread.stage, 'await_consent');
    assert.equal(r.thread.first_wamid, 'SMopener1');
  }
});

test('provenance on the consent tap: CTWA ad referral -> ctwa_ad with the referral fields; no referral -> whatsapp_direct', () => {
  const ctx = (id) => ({ at: '2026-10-17T15:00:00+02:00', mobile: '+27600000556', profile_name: 'Ann', lead_id: 'lead_tap_1', broker: MARK, brand: BRAND, existing_open_lead_id: null, suppressed: false, wamid: id, is_synthetic: true });
  const referral = { source_type: 'ad', source_id: '120200000001', source_url: 'https://fb.me/x', headline: 'Cover for your family', ctwa_clid: 'clid_1' };
  const first = W3.step(null, { from: '27600000556', id: 'SMa', timestamp: '1', type: 'text', text: { body: 'hi' }, referral }, ctx('SMa'));
  const tap = W3.step(first.thread, { from: '27600000556', id: 'SMb', timestamp: '2', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes', title: 'Yes' } } }, ctx('SMb'));
  const row = tap.actions.find((a) => a.kind === 'insert_lead').row;
  assert.equal(row.consent_source, 'ctwa_ad');
  assert.equal(row.ad_id, '120200000001');
  assert.equal(row.ctwa_clid, 'clid_1');
  assert.deepEqual(row.provenance.referral, referral);
  assert.equal(row.provenance.first_inbound_sid, 'SMa');
  assert.equal(row.provenance.inbound_sid, 'SMb', 'the evidence is the consent tap');
  const post = W3.step(null, { from: '27600000557', id: 'SMc', timestamp: '1', type: 'text', text: { body: 'hi' }, referral: { ...referral, source_type: 'post' } }, ctx('SMc'));
  assert.equal(W3.step(post.thread, { id: 'SMd', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, ctx('SMd')).actions.find((a) => a.kind === 'insert_lead').row.consent_source, 'ctwa_post');
  const direct = W3.step(null, { from: '27600000558', id: 'SMe', timestamp: '1', type: 'text', text: { body: 'hello' } }, ctx('SMe'));
  const drow = W3.step(direct.thread, { id: 'SMf', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, ctx('SMf')).actions.find((a) => a.kind === 'insert_lead').row;
  assert.equal(drow.consent_source, 'whatsapp_direct');
  assert.equal(drow.provenance.referral, null);
  assert.equal(JSON.stringify(direct.thread).includes('hello'), false, 'no free text in thread state');
});

test('W03.json: lead insert writes the opener extras + provenance ($16), escalate action is wired', () => {
  const ins = WF.nodes.find((n) => n.name === 'Insert lead (consent at the tap)');
  for (const k of ["$16::jsonb->>'consent_source'", "$16::jsonb->>'source'", "$16::jsonb->>'product_interest'", "$16::jsonb->>'utm_source'", "'provenance', $16::jsonb->'provenance'"]) assert.ok(ins.parameters.query.includes(k), k);
  assert.match(ins.parameters.options.queryReplacement, /provenance: \$json\.row\.provenance/);
  const sw = WF.nodes.find((n) => n.name === 'Action?');
  const idx = sw.parameters.rules.values.findIndex((r) => r.outputKey === 'escalate');
  assert.ok(idx >= 0);
  assert.equal(WF.connections['Action?'].main[idx][0].node, 'Escalate to a person (opener)');
  assert.ok(WF.nodes.find((n) => n.name === 'W03 step').parameters.jsCode.includes('parseOpener'), 'step node inlines the tested logic');
});

test('lead_optins row (contract 17 Oct): opener and CTWA-ad consent map to the contract columns; channel left to the trigger', () => {
  const op = opStep(OPENER('cover and my new bond', 'an authorised adviser', 'w-learn-bond', 'fb/cycle1/carousel-3')).actions.find((a) => a.kind === 'insert_lead').row.optin;
  assert.deepEqual(op, {
    lead_id: 'lead_opener_1', brand_id: 'smc', ref_code: 'w-learn-bond', via_source: 'fb', via_campaign: 'cycle1', via_content: 'carousel-3',
    referral_source_type: null, referral_source_id: null, referral_source_url: null, referral_headline: null, ctwa_clid: null,
    consent_version: 'CONSENT-GENERIC-v5web', consent_text: 'I agree that SortMyCover may message me on WhatsApp about this and share my details with an authorised adviser.',
    opener_text: OPENER('cover and my new bond', 'an authorised adviser', 'w-learn-bond', 'fb/cycle1/carousel-3'), message_sid: 'SMopener1',
    received_at: '2026-10-17T14:50:00+02:00', recorded_by: 'W03',
  });
  assert.equal('channel' in op, false);
  const ctx = (id) => ({ at: '2026-10-17T15:00:00+02:00', mobile: '+27600000559', profile_name: 'Ann', lead_id: 'lead_tap_2', broker: MARK, brand: BRAND, existing_open_lead_id: null, suppressed: false, wamid: id, is_synthetic: true });
  const referral = { source_type: 'ad', source_id: '1202', source_url: 'https://www.instagram.com/p/x', headline: 'H', ctwa_clid: 'clid_9' };
  const first = W3.step(null, { from: '27600000559', id: 'SMg', timestamp: '1', type: 'text', text: { body: 'hi' }, referral }, ctx('SMg'));
  const tap = W3.step(first.thread, { id: 'SMh', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, ctx('SMh'));
  const o = tap.actions.find((a) => a.kind === 'insert_lead').row.optin;
  assert.deepEqual([o.referral_source_type, o.referral_source_id, o.referral_source_url, o.ctwa_clid, o.message_sid, o.ref_code, o.via_source, o.consent_version], ['ad', '1202', 'https://www.instagram.com/p/x', 'clid_9', 'SMh', null, null, 'ctwa-named-v3']);
});

test('W03.json: lead_optins insert runs after the lead insert, idempotent on message_sid, never blocks the run', () => {
  const n = WF.nodes.find((x) => x.name === 'Opt-in record (lead_optins)');
  assert.match(n.parameters.query, /^INSERT INTO public\.lead_optins \(lead_id, brand_id, ref_code,/);
  assert.match(n.parameters.query, /ON CONFLICT \(message_sid\) DO NOTHING/);
  assert.equal(/\bchannel\b/.test(n.parameters.query), false, 'channel is derived by the trigger');
  assert.equal(n.onError, 'continueRegularOutput');
  assert.ok(WF.connections['Insert lead (consent at the tap)'].main[0].some((x) => x.node === 'Opt-in record (lead_optins)'));
});

// ---------------------------------------------------------------- /start/ page link (brand flag start_page, 18 Oct 2026)
const SP_TOKEN = 'lt1.lead_test_L04.1792240000.' + 'A'.repeat(43);
const SP_BRAND = { ...BRAND, start_page: true };
const consentThenYes = (ctxExtra = {}) => {
  const base = { at: '2026-10-18T10:00:00+02:00', mobile: '+27600000104', profile_name: 'Thandi Nkosi', lead_id: 'lead_sp_1', broker: MARK, existing_open_lead_id: null, suppressed: false, wamid: 'SMsp1', is_synthetic: true, ...ctxExtra };
  const first = W3.step(null, { from: '27600000104', id: 'SMsp0', timestamp: '1792310000', type: 'text', text: { body: 'Hi' } }, base);
  return W3.step(first.thread, { from: '27600000104', id: 'SMsp1', timestamp: '1792310060', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, base);
};

test('start page OFF (default): the consent tap asks q_age exactly as before, even with a token on hand', () => {
  for (const ctx of [{ brand: BRAND }, { brand: BRAND, start_page: { token: SP_TOKEN } }, { brand: SP_BRAND }]) {
    const r = consentThenYes(ctx);
    const s = sends(r.actions);
    assert.equal(s.length, 1);
    assert.equal(s[0].message.type, 'list');
    assert.equal(s[0].message.body, 'Which age group are you in?');
    assert.equal(r.thread.stage, 'q_age');
    assert.deepEqual(r.actions.find((a) => a.kind === 'insert_lead').row.conv_state, { state: 'q_age' });
  }
});

test('start page ON: one call-to-action (header image, body, "Start here", link with the token in the fragment), state start_page + a stall', () => {
  const r = consentThenYes({ brand: SP_BRAND, start_page: { token: SP_TOKEN } });
  const s = sends(r.actions);
  assert.equal(s.length, 1, 'ONE message replaces the first question');
  const m = s[0].message;
  assert.equal(m.type, 'cta_url');
  assert.equal(m.url, `https://sortmycover.co.za/start/#lt=${SP_TOKEN}`, 'token in the fragment, never a query or path (CONTRACTS lead_token)');
  assert.equal(m.button, 'Start here'); assert.ok(m.button.length <= 20);
  assert.equal(m.header_image, 'https://n8n.sortmycover.co.za/media/whatsapp/headers/header-intent.png');
  assert.equal(m.body, "Thanks Thandi. Lovely to have you here. Tap below to answer a few quick questions and pick a time with Mark. It takes about a minute. Or just reply here if you'd rather chat.");
  assert.ok(m.body.length <= 1024);
  assert.doesNotMatch(m.body, /\bfree\b|\bAI\b|Lead Velocity/i);
  assert.equal(r.thread.stage, 'start_page');
  assert.deepEqual(r.actions.find((a) => a.kind === 'insert_lead').row.conv_state, { state: 'start_page' });
  assert.equal(r.actions.find((a) => a.kind === 'schedule_stall').stage, 'start_page');
  // Cloud API shape (Meta in-session interactive cta_url)
  const body = W3.toCloudApi('+27600000104', m);
  assert.deepEqual(body.interactive, { type: 'cta_url', header: { type: 'image', image: { link: m.header_image } }, body: { text: m.body }, action: { name: 'cta_url', parameters: { display_text: 'Start here', url: m.url } } });
  // no name, no adviser: still a complete sentence
  assert.equal(W3.startPageBody('', ''), "Thanks. Lovely to have you here. Tap below to answer a few quick questions and pick a time with an adviser. It takes about a minute. Or just reply here if you'd rather chat.");
});

test('start page ON: a website opener greets, then the call-to-action (wills openers still go to a person)', () => {
  const ctx = { at: '2026-10-17T14:50:00+02:00', mobile: '+27600000555', profile_name: 'Thabo Mokoena', lead_id: 'lead_opener_1', broker: MARK, brand: SP_BRAND, existing_open_lead_id: null, suppressed: false, wamid: 'SMopener1', is_synthetic: true, start_page: { token: SP_TOKEN } };
  const msg = (text) => ({ from: '27600000555', id: 'SMopener1', timestamp: '1792240000', type: 'text', text: { body: text } });
  const r = W3.step(null, msg(OPENER('cover for my family', 'an authorised adviser', 'a06')), ctx);
  const s = sends(r.actions);
  assert.equal(s.length, 1);
  assert.equal(s[0].message.type, 'cta_url');
  assert.equal(s[0].message.body, "Hi Thabo, I'm Lindi from SortMyCover. Thanks for getting in touch about cover for my family. If it's something else, just tell me.\n\nTap below to answer a few quick questions and pick a time with Mark. It takes about a minute. Or just reply here if you'd rather chat.");
  assert.deepEqual(r.actions.find((a) => a.kind === 'insert_lead').row.conv_state, { state: 'start_page', topic: 'cover for my family', ref: 'a06' });
  assert.equal(r.thread.stage, 'start_page');
  const w = W3.step(null, msg(OPENER('a will', 'Capital Legacy', 'b02')), ctx);
  assert.equal(sends(w.actions)[0].message.type, 'text');
  assert.equal(w.actions.filter((a) => a.kind === 'escalate').length, 1);
});

test('start page pending: anything typed or tapped in chat falls back to q_age and the taps go on exactly as today', () => {
  const r = consentThenYes({ brand: SP_BRAND, start_page: { token: SP_TOKEN } });
  const lead = { id: 'lead_sp_1', conv_state: { state: 'start_page' }, broker_id: null, origin: 'ctwa' };
  const ctx = { at: '2026-10-18T10:05:00+02:00', mobile: '+27600000104', profile_name: 'Thandi Nkosi', lead_id: 'unused', broker: MARK, brand: SP_BRAND, existing_open_lead_id: 'lead_sp_1', lead, suppressed: false, wamid: 'SMsp2', is_synthetic: true, start_page: { token: SP_TOKEN } };
  for (const m of [{ type: 'text', text: { body: 'Is this legit?' } }, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'whatever' } } }]) {
    for (const th of [r.thread, null]) {
      const f = W3.step(th, { from: '27600000104', id: 'SMsp2', timestamp: '1792310300', ...m }, ctx);
      assert.deepEqual(sends(f.actions).map((a) => a.message.body), ['Which age group are you in?']);
      assert.deepEqual(f.actions.find((a) => a.kind === 'update_lead'), { kind: 'update_lead', id: 'lead_sp_1', set: { conv_state_state: 'q_age' } });
      assert.equal(f.actions.find((a) => a.kind === 'schedule_stall').stage, 'q_age');
      assert.equal(f.thread.stage, 'q_age'); assert.equal(f.thread.lead_id, 'lead_sp_1');
      assert.equal(f.actions.some((a) => a.kind === 'insert_lead'), false, 'no second lead');
      // the next tap is an ordinary q_age answer
      const age = W3.step(f.thread, { from: '27600000104', id: 'SMsp3', timestamp: '1792310400', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'age_35_44' } } }, { ...ctx, lead: { ...lead, conv_state: { state: 'q_age' } }, wamid: 'SMsp3' });
      assert.deepEqual(age.actions.find((a) => a.kind === 'update_lead').set, { age_band: '35_44', conv_state_state: 'q_budget' });
    }
  }
  // the page was answered (W39 moved the lead to unbooked): the old thread no longer triggers the fallback
  const done = W3.step(r.thread, { from: '27600000104', id: 'SMsp9', timestamp: '1792310900', type: 'text', text: { body: 'thanks' } }, { ...ctx, lead: { ...lead, conv_state: { state: 'unbooked' } } });
  assert.equal(sends(done.actions).length, 0);
  assert.equal(done.actions[0].kind, 'forward_w07');
});

test('W03.json: Load context reads brands.start_page column-agnostically; "W03 step" mints a token only when the flag is on and the transport can carry the link', async () => {
  assert.match(WF.nodes.find((n) => n.name === 'Load context').parameters.query, /coalesce\(to_jsonb\(br\)->>'start_page', 'off'\) = 'on' AS start_page/);
  const ad = { msg: { from: '27600000104', id: 'SMsp1', timestamp: '1792310060', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent_yes' } } }, at: '2026-10-18T10:01:00+02:00', mobile: '+27600000104', profile_name: 'Thandi', external_id: 'SMsp1', hops: 0 };
  const consent = W3.consentFor('named', MARK);
  const thread = { stage: 'await_consent', origin: { origin: 'ctwa' }, consent, answers: {}, first_at: '2026-10-18T10:00:00+02:00', broker_id: MARK.broker_id };
  const row = (start_page) => ({ brand_id: 'b-smc', broker: { ...MARK, consent_mode: 'named' }, existing_open_lead_id: null, lead: null, suppressed: false, thread, new_lead_id: '11111111-2222-4333-8444-555555555555', start_page });
  const SECRET = 'x'.repeat(40);
  const run = async (sp, env) => (await runCode(WF, 'W03 step', { items: [row(sp)], refs: { 'W07 hand-off -> Cloud API message': ad }, env: { LEAD_TOKEN_SECRET: SECRET, ...env } }))[0].json;
  const sendOf = (j) => j.actions.find((a) => a.kind === 'send').message;
  assert.equal(sendOf(await run(false, {})).type, 'list', 'flag off: q_age');
  const on = sendOf(await run(true, {}));
  assert.equal(on.type, 'cta_url', 'flag on, Meta transport: the link');
  const tok = on.url.split('#lt=')[1];
  const LT = require('../security/lead-token.js');
  assert.equal(LT.verifyLeadToken(tok, { secret: SECRET }).lead_id, '11111111-2222-4333-8444-555555555555');
  assert.equal(sendOf(await run(true, { WHATSAPP_PROVIDER: 'twilio', TWILIO_CONTENT_SIDS: '{}' })).type, 'list', 'Twilio without the smc_start_cta SID: tap path');
  assert.equal(sendOf(await run(true, { WHATSAPP_PROVIDER: 'twilio', TWILIO_CONTENT_SIDS: JSON.stringify({ smc_start_cta: 'HXcta' }) })).type, 'cta_url');
  assert.equal(sendOf(await run(true, { LEAD_TOKEN_SECRET: '' })).type, 'list', 'no secret: no token, tap path');
  // the stored outbound content is the body only (never the link / token)
  const fan = await runCode(WF, 'Fan out actions', { items: [await run(true, {})] });
  const [b] = await runCode(WF, 'Build Cloud API body', { items: [fan.find((x) => x.json.kind === 'send').json] });
  assert.doesNotMatch(b.json.content, /lt1\./);
  assert.equal(b.json.body.interactive.type, 'cta_url');
});

test('lead-ad band tap: W03 records the band and asks W01 core to route (W01 then discloses before any hand-over; see W01.test.mjs)', () => {
  const lead = { id: 'lead_ld1', origin: 'lead_ad', conv_state: { state: 'q_budget' }, age_band: '45_50', broker_id: null };
  const r = W3.step(null, { from: '27600000191', id: 'SMld1', timestamp: '1792310000', type: 'button', button: { payload: 'budget_1500_plus' } },
    { at: '2026-10-18T10:00:00+02:00', mobile: '+27600000191', profile_name: 'Thandi', lead_id: 'unused', broker: MARK, brand: BRAND, existing_open_lead_id: 'lead_ld1', lead, suppressed: false, wamid: 'SMld1', is_synthetic: true });
  const kinds = r.actions.map((a) => a.kind);
  assert.ok(kinds.includes('route_and_first_touch'));
  assert.equal(kinds.filter((k) => k === 'send').length, 0, 'W03 itself sends nothing: the disclosure text is W01 core\'s first step');
});
