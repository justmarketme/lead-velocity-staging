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
  assert.match(consentMsg.body, /Mark Smith Financial Services \(FSP 12345\), an authorised financial services provider/);
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
  assert.equal(row.consent_text_version, 'ctwa-named-v2');
  assert.match(row.consent_text, /Lead Velocity \(Pty\) Ltd/);
  assert.match(row.consent_text, /Reply STOP to opt out/);
  assert.match(row.consent_text, /sortmycover\.co\.za\/privacy/);
  assert.ok(row.consent_text.length < 1024, 'consent body under the WhatsApp interactive limit');
  assert.equal(row.consent_text, consentMsg.body, 'stored consent = the exact words shown');
  assert.equal(row.phone, '+27600000004');
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

test('generic consent mode uses the 4.6 CTWA text verbatim (fixture ctwa-v1)', () => {
  const { actions } = run(lead('L05'), { brand: { brand_id: 'smc', consent_mode: 'generic' } });
  assert.equal(sends(actions)[0].message.body, FIX.consent_texts['ctwa-v1']);
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
  const r1 = W3.step(null, toMsg(fx.submission.inbound[0], 0), { at: fx.submission.inbound[0].at, mobile: '+27600000004', lead_id: 'x1', broker: MARK, brand: BRAND });
  const r2 = W3.step(r1.thread, toMsg(fx.submission.inbound[1], 1), { at: fx.submission.inbound[1].at, mobile: '+27600000004', lead_id: 'x1', broker: MARK, brand: BRAND });
  const r3 = W3.step(r2.thread, { type: 'text', text: { body: 'how much does cover cost?' } }, { at: fx.submission.inbound[1].at, mobile: '+27600000004', lead_id: 'x1', broker: MARK, brand: BRAND });
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
  let o = ref("Hi, I'd like to check my life cover", R); // (a)
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
  assert.equal(new URL(ok.headers.Location).searchParams.get('text'), "Hi, I'd like to check my life cover (ref cmt_120212345678901234)");
  assert.deepEqual(ok.click, { ref: 'cmt_120212345678901234', ua_class: 'ios' });
  for (const bad of ['https://evil.example', '<script>', 'cmt_1', '../x', '%0d%0aSet-Cookie:x']) {
    const r = W3.redirectFor(bad, '27600000099');
    assert.equal(new URL(r.headers.Location).host, 'wa.me');
    assert.equal(new URL(r.headers.Location).searchParams.get('text'), "Hi, I'd like to check my life cover");
    assert.equal(r.click.ref, null);
  }
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.throws(() => W3.redirectFor('dm_messenger', ''));
});

test('every interactive message fits Cloud API limits (<=3 buttons/20 chars, <=10 rows/24 chars)', () => {
  const qs = ['q_age', 'q_budget', 'q_bond', 'q_method'].map((s) => W3.question(s, MARK));
  qs.push({ type: 'button', body: 'x', buttons: [{ id: 'consent_yes', title: 'Yes, continue' }, { id: 'consent_no', title: 'No thanks' }] });
  for (const q of qs) {
    const api = W3.toCloudApi('+27600000004', q).interactive;
    if (api.type === 'button') { assert.ok(api.action.buttons.length <= 3); for (const b of api.action.buttons) assert.ok(b.reply.title.length <= 20 && b.reply.title === q.buttons.find((x) => x.id === b.reply.id).title); }
    else { const rows = api.action.sections.flatMap((s) => s.rows); assert.ok(rows.length <= 10); for (const r of rows) assert.ok(r.title.length <= 24 && q.rows.find((x) => x.id === r.id).title === r.title); }
  }
});

test('W03.json: settings block, inactive, credentials by name only, no secrets, every connection target exists, inlined logic is current', () => {
  assert.equal(WF.active, false);
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  assert.equal(WF.settings.errorWorkflow, 'W22 Alerts');
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
