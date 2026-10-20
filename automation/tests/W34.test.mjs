// W34 POPIA (lean, 20 Oct 2026; Jono: "the simplest thing that works", CRM-NURTURE-SCHEMA.md D4/D5).
//
// Nightly: delete expired WhatsApp threads; anonymise SortMyCover leads past leads.retention_delete_after (never routed or
// counted). DSR mail / webhook -> one escalations row kind dsr + a W22 alert to Jono (handled by hand). Breach mail -> incidents.
// Live tables only: no dsr_requests, retention_log, obligations, smc_erase_lead or ops.* (dropped 11 Oct).
// The Code nodes run *from automation/W34.json* in a sandbox (real code). SQL is checked statically against the schema mirror.
// Run: node --test automation/tests/W34.test.mjs
//
// Run: node --test automation/tests/W34.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, createHmac } from 'node:crypto';
import vm from 'node:vm';
import { checkSql, workflowSql } from './_sqlcheck.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const require = createRequire(import.meta.url);
import { nodeRequire } from './_n8ncode.mjs';
const WF = JSON.parse(readFileSync(join(HERE, '..', 'W34.json'), 'utf8'));
const H = 3600000; const D = 24 * H;
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const node = (name) => { const n = WF.nodes.find((x) => x.name === name); assert.ok(n, `W34.json has node "${name}"`); return n; };
const SQL = workflowSql(WF);
const strip = (s) => s.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();

// runOnceForAllItems: one call, `now` a single instant. runOnceForEachItem (n8n Code mode): one call per input item,
// `now` may be an array (the clock at each item's turn, e.g. one batch per Split-in-Batches iteration).
function runCode(name, { input = [], refs = {}, env = {}, now }) {
  const at = (t) => (typeof t === 'number' ? t : Date.parse(t));
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }), itemMatching: (i) => ({ json: arr[i] }) });
  const call = (NOW, items, item) => {
    class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
    const ctx = vm.createContext({ $input: { ...wrap(items), item: item && { json: item } }, $json: item ?? items[0] ?? {}, $env: env, require: (m) => (m === 'lv-automation' ? nodeRequire(m) : require(m)), Date: FakeDate,
      $: (n) => { if (!refs[n]) throw new Error(`node "${n}" has not run`); return wrap(refs[n]); } });
    return vm.runInContext(`(function () {\n${node(name).parameters.jsCode}\n})()`, ctx);
  };
  if (node(name).parameters.mode === 'runOnceForEachItem') {
    return input.map((j, i) => JSON.parse(JSON.stringify(call(at(Array.isArray(now) ? now[i] : now), [j], j).json)));
  }
  return JSON.parse(JSON.stringify(call(at(now), input).map((i) => i.json)));
}

const RECEIVED = '2026-10-02T09:15:00+02:00';
const hook = (body) => ({ headers: { 'x-test': '1' }, body });

test('DSR intake: webhook request hashed like W24, clock = received + 30 days, ceiling 30', () => {
  const [r] = runCode('Normalise DSR request', { now: RECEIVED, input: [hook({ kind: 'erase', channel: 'portal', requester: 'Test Person', contact: '060 000 0101', received_at: RECEIVED })] });
  assert.equal(r.kind, 'erase'); assert.equal(r.channel, 'portal');
  assert.equal(r.mobile_hash, sha('27600000101'), 'E.164 digits, SHA-256 (the W24/W15 rule)');
  assert.equal(r.subject_hash, null);
  assert.equal(r.requester_contact, '+27600000101');
  assert.equal(Date.parse(r.due_at) - Date.parse(r.received_at), 30 * D);
  assert.match(r.dedupe_key, /^dsar:[0-9a-f]{32}$/);
  for (const [v, days] of [['45', 30], ['0', 30], ['x', 30], ['21', 21]]) {
    const [x] = runCode('Normalise DSR request', { now: RECEIVED, env: { W34_DSR_DUE_DAYS: v }, input: [hook({ kind: 'access', contact: 'a@example.test' })] });
    assert.equal(Date.parse(x.due_at) - Date.parse(x.received_at), days * D, `W34_DSR_DUE_DAYS=${v}`);
  }
  const [e] = runCode('Normalise DSR request', { now: RECEIVED, input: [hook({ kind: 'access', contact: '  Person@Example.TEST ' })] });
  assert.equal(e.subject_hash, sha('person@example.test'), 'email hash = smc_hash_contact (sha256 of lower(trim))');
  assert.throws(() => runCode('Normalise DSR request', { now: RECEIVED, input: [hook({ kind: 'delete-everything', contact: 'a@example.test' })] }), /kind must be/);
  assert.throws(() => runCode('Normalise DSR request', { now: RECEIVED, input: [hook({ kind: 'erase' })] }), /need a mobile/);
});

test('DSR intake: howzit@ mail classified; non-DSR mail (FNB, brokers) ignored; same email never opens two tickets', () => {
  const mail = (subject, body, id) => ({ id, subject, bodyPreview: body, receivedDateTime: '2026-10-02T07:15:00Z', from: { emailAddress: { name: 'Synthetic Person', address: 'synthetic.person@example.test' } } });
  const out = runCode('Normalise DSR request', { now: RECEIVED, input: [
    mail('Please delete my details', 'I filled in your form. My number is 060 000 0102.', 'm1'),
    mail('POPIA request', 'What personal information do you hold about me?', 'm2'),
    mail('FNB: payment received', 'Reference LV-ABC-SILVER-202610 R4,500.00', 'm3'),
    mail('Re: Meeting tomorrow', 'Can we move to 10:00?', 'm4'),
    mail('Please delete my details', 'resend', 'm1'),
  ] });
  assert.deepEqual(out.map((o) => o.kind), ['erase', 'access', 'erase']);
  assert.equal(out[0].channel, 'email');
  assert.equal(out[0].mobile_hash, sha('27600000102'), 'number in the body is hashed for matching');
  assert.equal(out[0].subject_hash, sha('synthetic.person@example.test'));
  assert.equal(Date.parse(out[0].due_at) - Date.parse('2026-10-02T07:15:00Z'), 30 * D, 'clock starts at receipt, not at processing');
  assert.equal(out[0].dedupe_key, out[2].dedupe_key, 'same message id -> same dedupe key');
  assert.doesNotMatch(out[0].source_ref, /delete|details/i, 'no subject line stored in the note');
});

// ---------------------------------------------------------------------------------------------
const mail = (subject, bodyPreview, address = 'sender@example.test', id = 'm1') =>
  ({ id, subject, bodyPreview, from: { emailAddress: { address, name: 'Test Sender' } }, receivedDateTime: '2026-10-03T07:32:00Z' });
const detect = (...m) => runCode('Detect breach report (EN + AF keywords)', { input: m, now: '2026-10-03T08:00:00Z' });

test('B2 breach lane: true positives (English and Afrikaans) open one draft each', () => {
  const positives = [
    mail('Data breach', 'I think there was a data breach at your company'),
    mail('Your leads are public', 'I found your lead export on a public gist, please remove it', undefined, 'm2'),
    mail('Unauthorised disclosure', 'My personal information was shared without my consent with a third party', undefined, 'm3'),
    mail('Persoonlike inligting', 'My persoonlike inligting is blootgestel op die internet', undefined, 'm4'),
    mail('Databreuk', 'Daar is \'n datalek by julle', undefined, 'm5'),
    mail('Onbevoegde toegang', 'Onbevoegde openbaarmaking van my besonderhede', undefined, 'm6'),
    mail('FYI', 'Your database has been leaked on pastebin', undefined, 'm7'),
  ];
  const out = detect(...positives);
  assert.equal(out.length, positives.length, 'every true positive matches');
  for (const o of out) { assert.match(o.ref, /^[0-9a-f]{12}$/); assert.match(o.summary, /^DRAFT:/); assert.ok(o.matched.length); }
  assert.equal(new Set(out.map((o) => o.ref)).size, out.length, 'one ref per mail');
  assert.ok(!JSON.stringify(out).includes('lead export'), 'no message text is carried');
});

test('B2 breach lane G9 (breach drill P14): the 4 wrong-recipient drill emails (EN + AF) now open a draft each', () => {
  // build/evidence/S7-28-2026-10-05/detector-check.cjs: 0 of 4 matched before the fix
  const drill = [
    mail('Wrong lead', 'Hi, I received a lead this morning that is not mine. The client details were sent to me by mistake. Please check.', undefined, 'g9-1'),
    mail('Lead sent to the wrong broker', "You sent me someone else's client. Her name and number came through to me.", undefined, 'g9-2'),
    mail('Who is this?', 'A stranger WhatsApped me saying your company gave him my number and my details. I never agreed to that.', undefined, 'g9-3'),
    mail('Verkeerde lead', 'Ek het n lead gekry wat nie myne is nie. Die kliënt se besonderhede is per ongeluk aan my gestuur.', undefined, 'g9-4'),
  ];
  const out = detect(...drill);
  assert.equal(out.length, 4, JSON.stringify(out.map((o) => o.matched)));
  assert.ok(out.slice(0, 2).every((o) => o.matched.includes('en.misdirected')));
  assert.ok(out[2].matched.includes('en.passed_without_consent'));
  assert.ok(out[3].matched.includes('af.misdirected'));
  // more phrasings from the drill note
  const more = [
    mail('Re: lead', 'This is not my client, please remove her from my list', undefined, 'g9-5'),
    mail('Oops', "I think you sent me the wrong person's details", undefined, 'g9-6'),
    mail('Lead', 'Dit is nie my kliënt nie. Julle het die verkeerde persoon se besonderhede gestuur.', undefined, 'g9-7'),
    mail('Lead', 'Hierdie lead is per abuis vir my gestuur', undefined, 'g9-8'),
  ];
  assert.equal(detect(...more).length, more.length);
});

test('B2 breach lane G9: near-miss everyday wording still stays quiet', () => {
  const quiet = [
    mail('Booking', 'Sorry, I picked the wrong time. Can I move to Thursday?'),
    mail('Re: call', 'Not my problem, thanks, all sorted'),
    mail('Slot', 'The 10:00 slot is mine, see you then'),
    mail('Vraag', 'Ek is nie seker nie, kan ons Donderdag praat?'),
    mail('Missed call', 'Sorry, wrong number dialled earlier, I will call back'),
    mail('Confirm', 'There was no mistake, I booked it myself'),
    mail('Delete my details', 'Please delete my details, what data do you hold about me?'),
  ];
  assert.deepEqual(detect(...quiet), []);
});

test('B2 breach lane: DSR and ordinary mail do not trigger it', () => {
  const quiet = [
    mail('Delete my details', 'Please delete my personal information and forget me'),
    mail('What data do you hold', 'What personal information do you hold about me? This is a POPIA request'),
    mail('Correct my number', 'Please update my details, my number changed to 0600000101'),
    mail('Stop messages', 'I object to marketing, please stop contacting me'),
    mail('Invoice', 'Payment received, thank you. FNB inContact credit R1,000'),
    mail('Booking question', 'Can I move my call to Thursday? My data is on the form already'),
    mail('Verwyder my data', 'Verwyder asseblief my besonderhede en data'),
    mail('Delivery Status Notification', 'Your message to test@example.test could not be delivered (bounce)'),
  ];
  assert.deepEqual(detect(...quiet), []);
});

test('B2 breach lane: our own mailbox (W22 e-mail copies) never re-triggers; a DSR mail still reaches the DSR lane', () => {
  assert.deepEqual(detect(mail('[W22] popia_breach', 'Possible POPIA breach reported to howzit@', 'howzit@leadvelocity.co.za')), []);
  const dsr = mail('Delete my details', 'Please delete my details');
  assert.equal(runCode('Normalise DSR request', { input: [dsr], now: '2026-10-03T08:00:00Z' }).length, 1);
  assert.deepEqual(WF.connections['howzit@ mailbox (DSR keywords)'].main[0].map((e) => e.node).sort(),
    ['Detect breach report (EN + AF keywords)', 'Normalise DSR request']);
});

test('B2 breach lane: incident draft SQL uses the existing incidents table, no DDL, idempotent; alert is red, both phones, one per new incident', () => {
  const q = node('Open incident draft').parameters.query;
  assert.match(strip(q), /insert into public\.incidents \(declared_at, severity, summary\)/);
  assert.match(strip(q), /where not exists \(select 1 from public\.incidents/);
  assert.doesNotMatch(strip(q), /\b(create|alter|drop)\s+table\b/);
  const alerts = runCode('Build breach alert', { input: [{ incident_id: 'i-1', ref: 'abc123abc123', duplicate: false }, { incident_id: 'i-2', duplicate: true }, { duplicate: true }], env: { CONSOLE_URL: 'https://app.example.test' } });
  assert.equal(alerts.length, 1);
  assert.deepEqual([alerts[0].kind, alerts[0].workflow, alerts[0].severity, alerts[0].to, alerts[0].incident_id], ['popia_breach', 'W34', 'red', ['jonathan', 'kg'], 'i-1']);
  assert.match(alerts[0].deep_link, /\/compliance\/incidents\/i-1$/);
  assert.doesNotMatch(alerts[0].message, /@example|0600/);
  assert.equal(node('Alert breach (W22)').type, 'n8n-nodes-base.executeWorkflow', 'no direct send in W34: W22 owns delivery and DRY_RUN');
});

// I-43d (offline half): the real Summarise night code over a synthetic multi-batch loop-done output (3 batches: ok, ok with
// not_found, signer-error item). What stays for the next local-n8n rehearsal: that n8n's Split-in-Batches "done" output really
// carries every batch's HTTP/signer-error item in this shape (the unit tests feed it by hand).

// ---------------------------------------------------------------------------------------------
// Lean W34 (20 Oct 2026)
// ---------------------------------------------------------------------------------------------
test('W34 structure: unique names, valid connections, SAST, inactive, every SQL column exists (live schema mirror)', () => {
  const names = WF.nodes.map((n) => n.name);
  assert.equal(new Set(names).size, names.length);
  for (const [from, v] of Object.entries(WF.connections)) { assert.ok(names.includes(from), from); for (const o of v.main) for (const c of o) assert.ok(names.includes(c.node), c.node); }
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg'); assert.equal(WF.active, false);
  assert.deepEqual(checkSql(SQL), []);
  const s = JSON.stringify(WF);
  const sql = SQL.map((x) => x.sql).join(String.fromCharCode(10)) + WF.nodes.filter((n) => n.type === 'n8n-nodes-base.code').map((n) => n.parameters.jsCode).join(String.fromCharCode(10));
  for (const gone of ['dsr_requests', 'retention_log', 'public.obligations', 'smc_erase_lead', 'ops.']) assert.ok(!sql.includes(gone), gone);
});

test('nightly: threads (72 h) then leads past retention_delete_after; both triggers start the same chain', () => {
  const T = 'Delete expired WhatsApp threads (72 h)', A = 'Anonymise leads past retention_delete_after';
  assert.deepEqual(WF.connections['Nightly 02:30 SAST (retention)'].main[0].map((c) => c.node), [T]);
  assert.deepEqual(WF.connections['Manual run (synthetic nightly)'].main[0].map((c) => c.node), [T]);
  assert.deepEqual(WF.connections[T].main[0].map((c) => c.node), [A]);
  assert.match(strip(node(T).parameters.query), /delete from public\.wa_threads t\s+where t\.expires_at < now\(\) or t\.last_inbound_at < now\(\) - interval ''/);
  assert.match(node(T).parameters.query, /interval '72 hours'/);
});

test('anonymise: only brand leads past the date, never routed or counted; contact + tracking + messages cleared; consent and answers kept', () => {
  const q = node('Anonymise leads past retention_delete_after').parameters.query;
  const s = strip(q);
  assert.match(s, /x\.brand_id is not null and x\.retention_delete_after < now\(\)\s+and x\.routed_at is null and x\.lead_order_id is null/);
  for (const c of ['first_name = null', 'last_name = null', "phone = ''", 'email = null', 'alt_email = null', 'call_number = null', 'alt_number = null',
    'client_ip = null', 'client_user_agent = null', 'fbclid = null', 'fbp = null', 'fbc = null', 'ctwa_clid = null', 'wa_id = null', 'leadgen_id = null',
    'conv_state = null', 'capture_state = null', 'dedupe_hash = null', 'retention_delete_after = null']) assert.ok(s.includes(c), c);
  for (const keep of ['consent_text', 'consent_at', 'consent_source', 'age_band', 'income_band', 'opted_out_at']) assert.ok(!new RegExp(`\b${keep}\s*=`).test(s), `${keep} is kept`);
  assert.match(s, /update public\.communications m set content = null, subject = null, recipient_contact = '', metadata = ''::jsonb\s+where m\.lead_id in \(select id from l\)/);
  // smc_audit writes the evidence row (personal values redacted) with this source and reason: no new grant, no DDL
  assert.match(q, /set_config\('smc\.source', 'W34 retention', true\)/);
  assert.match(q, /set_config\('smc\.reason', 'retention_delete_after passed/);
  assert.match(s, /from cfg\s+where cfg\.s is not null and cfg\.r is not null/, 'cfg is evaluated before the rows change');
  // never touches the evidence tables or deletes a lead (n8n_app has no DELETE on leads)
  for (const t of ['public.suppression', 'public.audit_log', 'public.lead_optins']) assert.ok(!s.includes(t), t);
  assert.ok(!/delete from public\.leads/.test(s));
});

test('DSR: one escalations row kind dsr (no name or contact), deduped per request, then one W22 alert to Jono; nothing for a duplicate', () => {
  const ESC = 'Record DSR escalation (kind dsr, by hand)', AL = 'Build DSR alert (W22, to Jono)';
  assert.deepEqual(WF.connections['Normalise DSR request'].main[0].map((c) => c.node), [ESC]);
  assert.deepEqual(WF.connections[ESC].main[0].map((c) => c.node), [AL]);
  assert.deepEqual(WF.connections[AL].main[0].map((c) => c.node), ['Alert Information Officer (W22)']);
  const q = node(ESC).parameters.query;
  assert.match(q, /INSERT INTO public\.escalations \(brand_id, kind, severity, ref_table, ref_id, lead_id, raised_at, note\)\nSELECT \$1::uuid, 'dsr', 'urgent', 'dsr_request', \$2/);
  assert.match(q, /WHERE NOT EXISTS \(SELECT 1 FROM public\.escalations e WHERE e\.kind = 'dsr' AND e\.ref_id = \$2/);
  const rep = node(ESC).parameters.options.queryReplacement;
  assert.ok(!/requester|subject_hash|mobile_hash/.test(rep), 'no name, contact or hash in the escalation');
  const [r] = runCode('Normalise DSR request', { now: RECEIVED, input: [hook({ kind: 'erase', channel: 'portal', requester: 'Test Person', contact: '060 000 0101', received_at: RECEIVED })] });
  const alerts = runCode(AL, { input: [{ id: 'esc1', ref_id: r.dedupe_key }, {}], refs: { 'Normalise DSR request': [r, r] }, now: RECEIVED });
  assert.equal(alerts.length, 1, 'a duplicate (no row returned) raises nothing');
  assert.deepEqual([alerts[0].kind, alerts[0].workflow, alerts[0].to, alerts[0].severity], ['dsar_received', 'W34', ['jonathan'], 'amber']);
  assert.match(alerts[0].message, /New data-subject request \(erase, portal\)\. Answer by 2026-11-01 \(POPIA 30 days\)\. Handle by hand: reply from howzit@\./);
  assert.ok(!/Test Person|0600000101|27600000101/.test(alerts[0].message));
});
