// Owner alerts (Jono, 24 Oct 2026): until "Zoe Experience" exists, EVERY SortMyCover notification is one WhatsApp to the owner
// (+27 72 554 8057) from the SortMyCover number, through smc-whatsapp-send. lib/owner-alert.mjs is the one helper every
// path uses (W38, W22, W07, W10); this file proves the helper, its ride through the real sender code, and the real W07 / W10
// Code nodes that patch-owner-alerts.mjs rewrote. Run: node --test automation/tests/owner-alert.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runCode, ifBranch, lvViolations } from './_n8ncode.mjs';
import * as O from '../lib/owner-alert.mjs';
import * as S from '../lib/sub-whatsapp-send.mjs';
import * as W7 from '../lib/w07.mjs';

const wf = (n) => JSON.parse(readFileSync(new URL(`../${n}.json`, import.meta.url), 'utf8'));
const W07 = wf('W07'), W10 = wf('W10');
const JONO = '+27725548057';
const KG = '+27736867990';
const SYN = '+27600000921';
const ENV = { OPS_WHATSAPP_JONATHAN: JONO, OPS_WHATSAPP_KG: KG, TWILIO_CONTENT_SIDS: JSON.stringify({ ops_alert: 'HXalert' }), SYNTHETIC_TEST_NUMBERS: '+27600000912, +27600000921', SMC_TEST_PHONES: `${JONO},${KG}` };
const BOTH = { ...ENV, TWILIO_CONTENT_SIDS: JSON.stringify({ ops_alert: 'HXalert', ops_update: 'HXupdate' }) };
const TWILIO = { ...BOTH, WHATSAPP_PROVIDER: 'twilio', TWILIO_WHATSAPP_FROM: 'whatsapp:+27600156480', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'secret', WEBHOOK_URL: 'https://n8n.example.test' };
const vars = (it) => it.wa.template.components[0].parameters.map((x) => x.text);
const LEAD = (phone) => ({ id: '3f0c2a9e-0000-4000-8000-0000000000a1', first_name: 'Thandi', last_name: 'Nkosi', phone, brand_id: '00000000-0000-4000-8000-0000000000b1', broker_id: null, conv_state: { state: 'unbooked' }, language: 'en' });

test('recipients: SMC_OWNER_WHATSAPP, else OPS_WHATSAPP_JONATHAN, else the documented default; KG only when set; who = owner | kg | both', () => {
  assert.equal(O.DEFAULT_OWNER_WHATSAPP, JONO);
  assert.equal(O.ownerNumber({}), JONO, 'no env at all still reaches Jono');
  assert.equal(O.ownerNumber({ OPS_WHATSAPP_JONATHAN: '+27820000001' }), '+27820000001');
  assert.equal(O.ownerNumber({ OPS_WHATSAPP_JONATHAN: '+27820000001', SMC_OWNER_WHATSAPP: ' +27820000009 ' }), '+27820000009', 'Zoe Experience later = this env only');
  assert.deepEqual(O.recipients('owner', ENV), [{ who: 'owner', to: JONO }]);
  assert.deepEqual(O.recipients('kg', ENV), [{ who: 'kg', to: KG }]);
  assert.deepEqual(O.recipients('both', ENV), [{ who: 'owner', to: JONO }, { who: 'kg', to: KG }]);
  assert.deepEqual(O.recipients('both', { OPS_WHATSAPP_JONATHAN: JONO }), [{ who: 'owner', to: JONO }], 'no KG number -> owner only');
  assert.deepEqual(O.recipients('kg', { OPS_WHATSAPP_JONATHAN: JONO }), [], 'KG alone with no number -> nobody (never silently re-routed to Jono)');
  assert.deepEqual(O.recipients('nonsense', ENV), [{ who: 'owner', to: JONO }]);
  assert.match(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'), /^SMC_OWNER_WHATSAPP=\s+#.*\+27725548057/m, '.env.example documents the default');
});

test('template: ops_update once its SID is set, else the approved ops_alert; no SID at all = no owner template (W22 then emails only)', () => {
  assert.equal(O.templateKey(ENV), 'ops_alert');
  assert.equal(O.templateKey(BOTH), 'ops_update');
  assert.equal(O.templateKey({}), 'ops_alert', 'the key the sender will look up; without a SID the sender skips (twilio_content_sid_missing)');
  assert.equal(O.hasOwnerTemplate({}), false);
  assert.equal(O.hasOwnerTemplate({ TWILIO_CONTENT_SIDS: 'not json' }), false);
  assert.equal(O.hasOwnerTemplate(ENV), true);
  // both templates take the same three body variables (name, what, detail), so one helper fills either
  for (const name of ['ops_alert', 'ops_update']) {
    const t = JSON.parse(readFileSync(new URL(`../templates/${name}.json`, import.meta.url), 'utf8'));
    assert.equal(t.category, 'UTILITY', name);
    const body = t.components.find((c) => c.type === 'BODY').text;
    assert.deepEqual([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]), ['1', '2', '3'], name);
    assert.doesNotMatch(body, /^\{\{|\}\}[\s.!?]*$/, `${name}: Meta refuses a template that starts or ends with a variable`);
    assert.equal(t.components.find((c) => c.type === 'FOOTER').text, 'SortMyCover');
    assert.ok(!t.components.find((c) => c.type === 'BUTTONS'), `${name}: no buttons (the old URL button pointed at an unset CONSOLE_URL)`);
    const c = JSON.parse(readFileSync(new URL(`../templates/twilio/content/${name}.json`, import.meta.url), 'utf8'));
    assert.equal(c._meta.approval.name, `smc_${name}`);
    assert.deepEqual(c._meta.var_plan, [{ n: 1, kind: 'body' }, { n: 2, kind: 'body' }, { n: 3, kind: 'body' }]);
  }
});

test('ownerAlert: one prebuilt item per recipient; record:false, bypass_suppression:true, caller + correlation; vars = name, what, detail', () => {
  const items = O.ownerAlert({ what: '1 new lead', detail: ['- Lead: Thandi, WhatsApp ad, phone ends 234, routed to Smith Financial (real adviser)'], source: 'W38', key: 'tick:2026-10-24T06:13:00.000Z' }, ENV);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.deepEqual([it.kind, it.to, it.record, it.caller, it.bypass_suppression, it.who, it.template], ['prebuilt', JONO, false, 'W38', true, 'owner', 'ops_alert']);
  assert.equal(it.correlation, 'owner:W38:tick:2026-10-24T06:13:00.000Z:owner');
  assert.deepEqual(it.wa, { messaging_product: 'whatsapp', to: JONO, type: 'template', template: { name: 'ops_alert', language: { code: 'en' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Jono' }, { type: 'text', text: '1 new lead' }, { type: 'text', text: 'Lead: Thandi, WhatsApp ad, phone ends 234, routed to Smith Financial (real adviser)' }] }] } });
  const both = O.ownerAlert({ what: 'x', who: 'both', source: 'W07', key: 'wamid.1' }, BOTH);
  assert.deepEqual(both.map((x) => [x.to, x.who, vars(x)[0], x.correlation, x.wa.template.name]), [[JONO, 'owner', 'Jono', 'owner:W07:wamid.1:owner', 'ops_update'], [KG, 'kg', 'KG', 'owner:W07:wamid.1:kg', 'ops_update']]);
  assert.deepEqual(O.ownerAlert({ what: '' }, ENV), [], 'nothing to say -> no item');
  assert.deepEqual(O.ownerAlert({}, ENV), []);
  assert.equal(vars(O.ownerAlert({ what: 'x' }, ENV)[0])[2], 'See the CRM', 'empty detail -> a fixed phrase (Meta rejects an empty parameter)');
  assert.equal(O.ownerAlert({ what: 'x', source: 'W38' }, ENV)[0].correlation, 'owner:W38:x:owner', 'no key -> the what, slugged');
  assert.equal(O.ownerAlert({ what: 'x', key: 'a b  c' }, ENV)[0].correlation, 'owner:owner-alert:a_b_c:owner');
});

test('hygiene: emails / SA numbers / ID numbers redacted, lines joined " | ", no newline / tab / 5+ spaces, clipped on a word; the source text is never changed', () => {
  const detail = 'Lead: Lerato, email lerato@gmail.com, call 082 555 1234\n- ID 8001015009087\tnext\n\n     wide     gap';
  const it = O.ownerAlert({ what: 'Chat hand-off\n(unanswered)', detail }, ENV)[0];
  const [, what, d] = vars(it);
  assert.equal(what, 'Chat hand-off | (unanswered)');
  assert.equal(d, 'Lead: Lerato, email l***@g***.com, call [phone] | ID [id] next | wide    gap');
  for (const v of vars(it)) assert.doesNotMatch(v, /[\n\t]| {5,}/);
  assert.equal(O.clip('a'.repeat(50) + ' ' + 'b'.repeat(50), 60), 'a'.repeat(50) + '...', 'cut on the last whole word');
  assert.equal(O.clip('x'.repeat(100), 20), 'x'.repeat(17) + '...', 'one long token is still cut');
  assert.equal(O.clip('short', 20), 'short');
  assert.equal(O.clip(null, 20), '');
  const long = O.ownerAlert({ what: 'w'.repeat(500), detail: Array.from({ length: 60 }, (_, i) => `- line ${i} ${'y'.repeat(30)}`) }, ENV)[0];
  assert.ok(vars(long)[1].length <= O.MAX_WHAT && /\.\.\.$/.test(vars(long)[1]));
  assert.ok(vars(long)[2].length <= O.MAX_DETAIL && /\.\.\.$/.test(vars(long)[2]));
  assert.equal(O.redact('mail lerato@gmail.com on +27 82 555 1234, id 8001015009087'), 'mail l***@g***.com on [phone], id [id]');
});

test('POPIA: personLabel = first name + phone last 3; an email / number typed as a name is never echoed; firstNameOf / phoneTail', () => {
  assert.equal(O.personLabel({ first_name: 'Thandi Nkosi', phone: '+27 82 555 1234' }), 'Thandi, phone ends 234');
  assert.equal(O.personLabel({ first_name: 'Thandi', phone_last3: '495' }), 'Thandi, phone ends 495');
  assert.equal(O.personLabel({ phone: '+27725548057' }), 'name not given yet, phone ends 057');
  assert.equal(O.personLabel({ first_name: 'lerato@gmail.com', phone: '' }), 'name not given yet, no number');
  assert.equal(O.personLabel({ first_name: '0825551234' }), 'name not given yet, no number');
  assert.equal(O.personLabel({}), 'name not given yet, no number');
  assert.equal(O.firstNameOf("Sipho-Jr. O'Neil"), 'Sipho-Jr');
  assert.equal(O.phoneTail('12'), '');
  // the item never carries the full number of the person it is about
  const it = O.ownerAlert({ what: 'Chat hand-off (unanswered)', detail: `${O.personLabel({ first_name: 'Thandi', phone: '+27821234567' })}; the lead is waiting for a person`, source: 'W07', key: 'w1' }, ENV)[0];
  assert.doesNotMatch(JSON.stringify(it.wa), /27821234567|821234567|1234567/);
});

test('synthetic subject (SYNTHETIC_TEST_NUMBERS, exact numbers) -> no item; a tester on SMC_TEST_PHONES (Jono, KG) is a real subject and really sends', () => {
  assert.deepEqual(O.ownerAlert({ what: 'x', subject: { from: SYN } }, ENV), []);
  assert.deepEqual(O.ownerAlert({ what: 'x', subject: { phone: '060 000 0921' } }, ENV), [], 'SA local form of the same number');
  assert.deepEqual(O.ownerAlert({ what: 'x', subject: SYN }, ENV), [], 'a bare number works too');
  assert.deepEqual(O.ownerAlert({ what: 'x', subject: { is_synthetic: true } }, ENV), []);
  assert.equal(O.ownerAlert({ what: 'x', subject: { from: '+27600000920' } }, ENV).length, 1, 'a neighbouring number is real');
  assert.equal(O.ownerAlert({ what: 'x', subject: { from: JONO } }, ENV).length, 1, 'Jono as the subject (his own test lead) still alerts');
  assert.equal(O.ownerAlert({ what: 'x', subject: { from: SYN } }, { ...ENV, SYNTHETIC_TEST_NUMBERS: '' }).length, 1, 'unset list = none');
  assert.equal(O.syntheticSubject(null, ENV), false);
});

test('through the real sender code: valid prebuilt, suppression bypassed, Jono (SMC_TEST_PHONES) really sent, Twilio ContentSid + variables 1..3, synthetic recipient dry', () => {
  for (const [env, sid] of [[TWILIO, 'HXupdate'], [{ ...TWILIO, TWILIO_CONTENT_SIDS: JSON.stringify({ ops_alert: 'HXalert' }) }, 'HXalert']]) {
    const it = O.ownerAlert({ what: 'Red alert: W05 Book failed at "Graph create event"', detail: 'A lead or booking step did not finish', source: 'W22', key: 'k' }, env)[0];
    const n = S.normalise(it);
    assert.deepEqual([n.valid, n.missing, n.kind, n.to, n.record, n.bypass_suppression, n.caller, n.correlation], [true, [], 'prebuilt', '27725548057', false, true, 'W22', 'owner:W22:k:owner']);
    const d = S.decide(n, { suppressed: true, last_inbound_at: null }, env, Date.now());
    assert.equal(d.action, 'send', 'a STOP Jono sent as a tester never silences ops; a template needs no 24-h window');
    const r = S.twilioRequest(d, env);
    const form = new URLSearchParams(r.body);
    assert.deepEqual([form.get('From'), form.get('To'), form.get('ContentSid'), form.get('Body')], ['whatsapp:+27600156480', 'whatsapp:+27725548057', sid, null]);
    assert.deepEqual(JSON.parse(form.get('ContentVariables')), { 1: 'Jono', 2: 'Red alert: W05 Book failed at "Graph create event"', 3: 'A lead or booking step did not finish' });
    assert.equal(form.get('StatusCallback'), 'https://n8n.example.test/webhook/whatsapp-twilio');
    assert.equal(S.result(d, S.interpret({ body: { sid: 'SM1' } })).ok, true);
  }
  const it = O.ownerAlert({ what: 'x' }, TWILIO)[0];
  const n = S.normalise(it);
  assert.equal(S.decide(n, {}, { ...TWILIO, DRY_RUN_SENDS: 'true' }, Date.now()).action, 'dry', 'DRY_RUN_SENDS is the sender\'s');
  assert.equal(S.decide(n, {}, { ...TWILIO, SYNTHETIC_TEST_NUMBERS: JONO }, Date.now()).action, 'dry', 'only a SYNTHETIC_TEST_NUMBERS recipient is dry-run');
  assert.equal(S.decide(n, {}, { ...TWILIO, SMC_TEST_PHONES: JONO }, Date.now()).action, 'send', 'SMC_TEST_PHONES is routing only: the sender ignores it');
  assert.equal(S.twilioRequest(S.decide(n, {}, { ...TWILIO, TWILIO_CONTENT_SIDS: '{}' }, Date.now()), { ...TWILIO, TWILIO_CONTENT_SIDS: '{}' }).twilio_skip, 'twilio_content_sid_missing', 'no SID -> the caller sees ok:false (W38 then takes EMMA)');
  // inside a known-open window a caller may send plain text instead
  const txt = O.ownerAlert({ what: 'x', detail: 'y', window_open: true }, TWILIO)[0];
  assert.deepEqual([txt.template, txt.wa.type, txt.wa.text.body], [null, 'text', 'SortMyCover update: x. y']);
  assert.equal(S.decide(S.normalise(txt), { last_inbound_at: new Date().toISOString() }, TWILIO, Date.now()).action, 'send');
});

// ---- the real W07 / W10 Code nodes (patch-owner-alerts.mjs) ---------------------------------------------------------------

test('patch-owner-alerts.mjs is idempotent and the files are current; every Execute Workflow -> smc-whatsapp-send', () => {
  const before = ['W07', 'W10'].map((n) => readFileSync(new URL(`../${n}.json`, import.meta.url), 'utf8'));
  const out = execFileSync(process.execPath, [new URL('../patch-owner-alerts.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { encoding: 'utf8' });
  assert.match(out, /W07\.json: already\nW10\.json: already/);
  assert.deepEqual(['W07', 'W10'].map((n) => readFileSync(new URL(`../${n}.json`, import.meta.url), 'utf8')), before);
  // the nodes the patch owns: exact lv-automation form, Execute Workflow by id smc-whatsapp-send (the rest of W07 / W10 is checked by their own tests)
  const own = (w, names) => ({ ...w, nodes: w.nodes.filter((n) => names.includes(n.name)) });
  assert.deepEqual(lvViolations(own(W07, ['Alert ops (first name + initial, redacted)', 'Pre-consent handoff: alert ops (nothing to the person)', 'SUB input (Send ops alert)', 'Never silent: owner alert (lib w07.neverSilentAlert)', 'Never silent: owner WhatsApp (smc-whatsapp-send)']), 'smc-w07'), []);
  assert.deepEqual(lvViolations(own(W10, ['Rebook failed: owner alert (w07.neverSilentAlert)', 'Rebook failed: owner WhatsApp (smc-whatsapp-send)']), 'smc-w10'), []);
});

test('W07 "Alert ops": a sensitive chat -> Jono + KG, first name + phone last 3, no name slot abuse, no dead URL button; notify = [] -> nothing', async () => {
  const plan = (phone, kind, severity, notify) => ({ json: { lead: LEAD(phone), msg: { from: phone, wamid: 'wamid.A1' }, brand_id: 'b1',
    plan: { escalation: W7.escalationRow(kind, { lead_id: 'L1', broker_id: null, brand_id: 'b1', wamid: 'wamid.A1', urgent: severity === 'urgent' }) } } });
  const sensitive = plan('+27821234567', 'sensitive');
  const alerts = await runCode(W07, 'Alert ops (first name + initial, redacted)', { items: [{ id: 'esc-1' }], env: ENV, refs: { 'Carry plan': sensitive.json } });
  assert.deepEqual(alerts.map((a) => [a.json.to, a.json.who, a.json.caller, a.json.record, a.json.bypass_suppression, a.json.correlation]),
    [[JONO, 'owner', 'W07', false, true, 'owner:W07:wamid.A1:owner'], [KG, 'kg', 'W07', false, true, 'owner:W07:wamid.A1:kg']]);
  assert.deepEqual(vars(alerts[0].json), ['Jono', 'RED: Chat hand-off (sensitive)', 'Thandi, phone ends 567; reply personally, nothing automated was sent; open the conversation in the console']);
  assert.deepEqual(vars(alerts[1].json)[0], 'KG');
  assert.doesNotMatch(JSON.stringify(alerts), /27821234567|Nkosi|button|sub_type/);
  const unanswered = await runCode(W07, 'Alert ops (first name + initial, redacted)', { items: [{ id: 'esc-2' }], env: ENV, refs: { 'Carry plan': plan('+27821234567', 'unanswered').json } });
  assert.deepEqual(unanswered.map((a) => a.json.to), [JONO], 'a plain hand-off: Jono only');
  assert.equal(vars(unanswered[0].json)[1], 'Chat hand-off (unanswered)');
  assert.equal(vars(unanswered[0].json)[2], 'Thandi, phone ends 567; the lead is waiting for a person; open the conversation in the console');
  const none = await runCode(W07, 'Alert ops (first name + initial, redacted)', { items: [{ id: 'esc-3' }], env: ENV, refs: { 'Carry plan': { ...sensitive.json, plan: { escalation: { ...sensitive.json.plan.escalation, notify: [] } } } } });
  assert.deepEqual(none, [], 'notify = [] (synthetic subject, lib/w07.mjs escalationRow) -> no WhatsApp');
  assert.deepEqual(await runCode(W07, 'Alert ops (first name + initial, redacted)', { items: [{ id: 'esc-4' }], env: ENV, refs: { 'Carry plan': plan(SYN, 'sensitive').json } }), [], 'the helper checks the subject too');
  // the SUB input node passes the complete item through (record:false, bypass_suppression:true kept)
  const sub = await runCode(W07, 'SUB input (Send ops alert)', { json: alerts[0].json });
  assert.deepEqual(sub.json, alerts[0].json);
  const legacy = await runCode(W07, 'SUB input (Send ops alert)', { json: { wa: { to: '27725548057', type: 'text', text: { body: 'x' } } } });
  assert.deepEqual([legacy.json.kind, legacy.json.record, legacy.json.bypass_suppression, legacy.json.caller], ['prebuilt', false, false, 'W07'], 'a bare { wa } is still wrapped as before');
  assert.deepEqual(W07.connections['Alert ops (first name + initial, redacted)'].main[0].map((c) => c.node), ['Live send? (alert)']);
});

test('W07 pre-consent hand-off: both ops numbers, last 3 digits only (never the full number), synthetic -> nobody', async () => {
  const run = (from, reason = 'distress', profile_name = 'Thandi N') => runCode(W07, 'Pre-consent handoff: alert ops (nothing to the person)', { items: [{ route: 'handoff_pre_consent', reason, msg: { from, wamid: 'wamid.P1', profile_name } }], env: ENV });
  const red = await run('+27821234567');
  assert.deepEqual(red.map((x) => [x.json.to, x.json.correlation]), [[JONO, 'owner:W07:wamid.P1:owner'], [KG, 'owner:W07:wamid.P1:kg']]);
  assert.deepEqual(vars(red[0].json), ['Jono', 'RED: new WhatsApp in distress, no consent yet', 'Thandi, phone ends 567; nothing automated was sent: reply from the SortMyCover WhatsApp']);
  assert.doesNotMatch(JSON.stringify(red), /27821234567|1234567/, 'the full number never rides in a template (POPIA)');
  const person = await run('+27821234567', 'person', '');
  assert.equal(vars(person[0].json)[1], 'New WhatsApp asked for a person, no consent yet');
  assert.match(vars(person[0].json)[2], /^name not given yet, phone ends 567;/);
  assert.deepEqual(await run(SYN), []);
});

test('W07 never-silent and W10 rebook-failed: the owner WhatsApp item carries the EMMA body as `request` for the fallback; synthetic -> nothing', async () => {
  const ns = (from) => runCode(W07, 'Never silent: owner alert (lib w07.neverSilentAlert)', { items: [{ id: 'esc-2' }], env: ENV,
    refs: { 'Never silent: wait 25 s': { route: 'W04', msg: { from, profile_name: 'Thandi', wamid: 'wamid.N1' }, lead: LEAD(from) } } });
  const real = await ns('+27821234567');
  assert.equal(real.length, 1);
  assert.deepEqual([real[0].json.to, real[0].json.caller, real[0].json.record, real[0].json.bypass_suppression, real[0].json.correlation], [JONO, 'W07', false, true, 'owner:W07:wamid.N1:owner']);
  assert.deepEqual(vars(real[0].json), ['Jono', 'Lead needs a person (Lindi sent a holding line)', 'Thandi is waiting on open times. The W04 reply did not go out, so Lindi sent a holding line. Please follow up on WhatsApp. Lead 3f0c2a9e.']);
  assert.match(real[0].json.request.message, /^SortMyCover: Thandi is waiting on open times/);
  assert.equal(real[0].json.request.source, 'smc-never-silent');
  assert.doesNotMatch(JSON.stringify(real), /27821234567/);
  assert.deepEqual(await ns(SYN), []);
  const rb = (phone) => runCode(W10, 'Rebook failed: owner alert (w07.neverSilentAlert)', { items: [{}], env: ENV,
    refs: { 'Decide move (w10.applyReschedule)': { ld: LEAD(phone), bk: { id: 'bk-77' } } } });
  const r = await rb('+27821234567');
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].json.to, r[0].json.caller, r[0].json.correlation, vars(r[0].json)[1]], [JONO, 'W10', 'owner:W10:bk-77:owner', 'Rebooking failed, old booking kept (Lindi sent a holding line)']);
  assert.match(vars(r[0].json)[2], /^Thandi is waiting on a reschedule\./);
  assert.match(r[0].json.request.message, /Thandi is waiting on a reschedule/);
  assert.deepEqual(await rb(SYN), []);
  // the ok? gates: the sender's answer decides whether EMMA runs
  for (const [w, name] of [[W07, 'Never silent: WhatsApp sent? (ok)'], [W10, 'Rebook failed: WhatsApp sent? (ok)']]) {
    assert.equal(ifBranch(w, name, { json: { ok: true, external_id: 'SM1' } }), true);
    assert.equal(ifBranch(w, name, { json: { ok: false, error: 'x' } }), false);
    assert.equal(ifBranch(w, name, { json: {} }), false);
  }
});
