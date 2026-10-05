// I-36c: W14 email consumer. Offline: node --test automation/tests/W14-email.test.mjs
// Runs the Code nodes from automation/W14.json in a sandbox on a synthetic queued ops.notifications row, runs the REAL
// scripts/build-broker-report-email.mjs through the command the node builds (PDF step faked only when no Chromium is installed),
// and checks the Graph sendMail body, the DRY_RUN gate, the dry evidence row and the credential name. No network, no database, no mail sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const WF = JSON.parse(readFileSync(join(here, '..', 'W14.json'), 'utf8'));
const W17 = JSON.parse(readFileSync(join(here, '..', 'W17.json'), 'utf8'));
const FX = JSON.parse(readFileSync(join(here, 'fixtures', 'w14-payloads.json'), 'utf8'));
const Q = JSON.parse(readFileSync(join(here, 'fixtures', 'w14-email-queue.json'), 'utf8')).queued;
const { findUngated } = createRequire(import.meta.url)('../lib/egress-gate.cjs');
const node = (name) => { const n = WF.nodes.find((x) => x.name === name); assert.ok(n, `node ${name}`); return n; };
const after = (from) => (WF.connections[from]?.main || []).map((o) => o.map((c) => c.node));

function run(name, { input = [], refs = {}, env = {} } = {}) {
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }) });
  const ctx = vm.createContext({ $input: wrap(input), $: (n) => { assert.ok(refs[n], `test supplies $('${n}')`); return wrap(refs[n]); }, $env: env, Buffer });
  return JSON.parse(JSON.stringify(vm.runInContext(`(function () {\n${node(name).parameters.jsCode}\n})()`, ctx).map((i) => i.json)));
}
const row = () => ({ ...Q, report_data: FX.weekly_close_rate });
const hasChromium = ['CHROMIUM_PATH'].some((k) => process.env[k] && existsSync(process.env[k])) || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].some(existsSync);

// ------------------------------------------------------------------ structure
test('W14 email: queue consumer wiring, claim + backoff SQL, credential is the one W17 uses, no new credential name', () => {
  assert.equal(node('Every 15 min report emails').parameters.rule.interval[0].expression, '*/15 * * * *');
  const q = node('Queued report emails').parameters.query;
  assert.match(q, /source = 'W14' and x\.channel = 'email' and x\.sent_at is null/);
  assert.match(q, /for update skip locked/); assert.match(q, /attempts < 3/); assert.match(q, /interval '15 minutes'/);
  assert.deepEqual(after('Queued report emails'), [['Build email command']]);
  assert.deepEqual(after('Build email command'), [['Build email + PDF (initials only)']]);
  assert.match(node('Build email + PDF (initials only)').parameters.command, /\$json\.cmd/);
  assert.deepEqual(after('Built?'), [['Live send? (Graph sendMail)'], ['Email failed (retry or alert)']]);
  assert.deepEqual(after('Live send? (Graph sendMail)'), [['Graph sendMail (howzit@)'], ['Dry-run stub (Graph sendMail)']]);
  assert.deepEqual(after('Email sent?'), [['Store email evidence'], ['Email failed (retry or alert)']]);
  const send = node('Graph sendMail (howzit@)');
  const w17cred = new Set(W17.nodes.flatMap((n) => Object.values(n.credentials || {}).map((c) => c.name)));
  assert.deepEqual(Object.keys(send.credentials), ['microsoftOutlookOAuth2Api']);
  assert.ok(w17cred.has(send.credentials.microsoftOutlookOAuth2Api.name), 'same credential name W17 uses');
  assert.equal(send.credentials.microsoftOutlookOAuth2Api.id, null);
  assert.match(send.parameters.url, /graph_url/);
  assert.equal(send.parameters.nodeCredentialType, 'microsoftOutlookOAuth2Api');
  assert.ok(send.retryOnFail !== true, 'no retry storm: backoff is the claim query, 3 tries max');
});

test('W14 email: egress gate: Graph sendMail sits behind DRY_RUN_SENDS (findUngated is empty for W14)', () => {
  assert.deepEqual(findUngated(WF), []);
  assert.match(JSON.stringify(node('Live send? (Graph sendMail)').parameters), /DRY_RUN_SENDS/);
  const stub = run('Dry-run stub (Graph sendMail)', { input: [{ ok: true }] })[0];
  assert.deepEqual([stub.dry_run, stub.statusCode], [true, 202]);
});

// ------------------------------------------------------------------ Build email command + real builder
test('W14 email: command builder validates the row before anything reaches a shell', () => {
  const bad = (patch) => run('Build email command', { input: [{ ...row(), ...patch }] })[0];
  assert.equal(bad({ notification_id: "x'; rm -rf /; '" }).build_error, 'bad_id');
  assert.equal(bad({ report_id: 'nope' }).build_error, 'bad_id');
  assert.equal(bad({ broker_email: null }).build_error, 'no_broker_email');
  assert.equal(bad({ broker_email: 'a b@x.y' }).build_error, 'no_broker_email');
  assert.equal(bad({ report_data: null }).build_error, 'no_payload');
  assert.equal(bad({ payload: { ...Q.payload, pdf: 'full_names' } }).build_error, 'not_initials_only');
  for (const p of ['bad_id', 'no_broker_email']) assert.equal(bad(p === 'bad_id' ? { report_id: 'nope' } : { broker_email: '' }).cmd, 'true', 'a bad row runs nothing');
  const ok = bad({});
  assert.equal(ok.build_error, null);
  assert.match(ok.cmd, /scripts\/build-broker-report-email\.mjs/); assert.match(ok.cmd, / --pdf /);
  assert.match(ok.cmd, new RegExp(`--report-id ${Q.report_id}`));
  assert.ok(!('report_data' in ok), 'the payload is not carried on the item after the command is built');
});

function buildAndCompose({ mailbox } = {}) {
  const [cmdItem] = run('Build email command', { input: [row()] });
  // forward slashes: the path goes through `sh -c`, which eats Windows backslashes (it wrote C:UsersJono... dirs into the repo root)
  const dir = mkdtempSync(join(tmpdir(), 'w14-email-')).replace(/\\/g, '/');
  // the real builder, through the exact command. Without Chromium (this sandbox) the PDF step is faked after the real HTML build.
  let cmd = cmdItem.cmd.replace(/\/tmp\/w14-email\//g, dir + '/');
  if (!hasChromium) cmd = cmd.replace(' --pdf ', ' ').replace('echo \'@@PDF\'; base64 -w0 "$D"/*.pdf', 'echo \'@@PDF\'; printf %%PDF-1.4-fake | base64 -w0');
  let stdout;
  try { stdout = execFileSync('sh', ['-c', cmd], { encoding: 'utf8', env: { ...process.env, REPO_DIR: ROOT, PORTAL_URL: 'https://app.leadvelocity.co.za' } }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  const out = run('Compose Graph sendMail', { input: [{ stdout, exitCode: 0 }], refs: { 'Build email command': [cmdItem] }, env: mailbox ? { HOWZIT_MAILBOX: mailbox } : {} })[0];
  return { cmdItem, stdout, out };
}

test('W14 email: real builder via the node command -> Graph sendMail body: from howzit@, bcc howzit@, PDF attached, initials only', () => {
  const { cmdItem, out } = buildAndCompose();
  assert.equal(out.ok, true, out.error);
  assert.equal(out.graph_url, 'https://graph.microsoft.com/v1.0/users/howzit%40leadvelocity.co.za/sendMail');
  const m = out.graph_body.message;
  assert.equal(m.toRecipients[0].emailAddress.address, Q.broker_email);
  assert.equal(m.bccRecipients[0].emailAddress.address, 'howzit@leadvelocity.co.za');
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0]['@odata.type'], '#microsoft.graph.fileAttachment');
  assert.equal(m.attachments[0].contentType, 'application/pdf');
  assert.match(m.attachments[0].name, /\.pdf$/);
  assert.ok(Buffer.from(m.attachments[0].contentBytes, 'base64').length > 8, 'attachment has bytes');
  assert.equal(m.body.contentType, 'HTML');
  assert.ok(m.subject && m.body.content.length > 500);
  assert.equal(out.graph_body.saveToSentItems, true);
  assert.equal(out.notification_id, cmdItem.notification_id);
  // initials only: no full name of any lead in the fixture appears in the email body
  const people = [...FX.weekly_close_rate.s3_meetings.last_week, ...FX.weekly_close_rate.s3_meetings.next_week].map((x) => x.full_name).filter(Boolean);
  assert.ok(people.length >= 2, 'fixture has people to look for');
  for (const p of people) assert.ok(!m.body.content.includes(p), `no lead name "${p}" in the email body`);
});

test('W14 email: builder failure, missing PDF and oversize attachment become ok:false (no send), never a crash', () => {
  const [c] = run('Build email command', { input: [row()] });
  const refs = { 'Build email command': [c] };
  const f = (o) => run('Compose Graph sendMail', { input: [o], refs })[0];
  assert.match(f({ stdout: '', exitCode: 1, stderr: 'no headless Chromium found' }).error, /^builder_failed: no headless Chromium/);
  assert.equal(f({ stdout: '@@META\n@@HTML\n@@PDF\n', exitCode: 0 }).ok, false);
  const big = '@@META\n' + Buffer.from(JSON.stringify({ subject: 's', pdf_name: 'a.pdf' })).toString('base64') + '\n@@HTML\nPGI+PC9iPg==\n@@PDF\n' + 'A'.repeat(3600000) + '\n';
  assert.equal(f({ stdout: big, exitCode: 0 }).error, 'pdf_too_large_for_inline_attachment');
  const [badRow] = run('Build email command', { input: [{ ...row(), broker_email: null }] });
  const r = run('Compose Graph sendMail', { input: [{ stdout: '' }], refs: { 'Build email command': [badRow] } })[0];
  assert.deepEqual([r.ok, r.error], [false, 'no_broker_email']);
});

// ------------------------------------------------------------------ result + evidence
test('W14 email: dry run writes a dry communications row and leaves the queue row queued; a real send closes it', () => {
  const built = { ...Q, broker_email: Q.broker_email, subject: 'S', pdf_name: 'a.pdf', ok: true };
  const refs = { 'Built?': [built] };
  const dry = run('Email sent or failed', { input: [{ ...built, statusCode: 202, dry_run: true, body: {} }], refs })[0];
  assert.deepEqual([dry.ok, dry.dry_run], [true, true]);
  const real = run('Email sent or failed', { input: [{ statusCode: 202, body: '' }], refs })[0];
  assert.deepEqual([real.ok, real.dry_run], [true, false]);
  const bad = run('Email sent or failed', { input: [{ statusCode: 403, body: { error: { code: 'ErrorAccessDenied' } } }], refs })[0];
  assert.equal(bad.ok, false); assert.match(bad.error, /^graph_403/);
  const sql = node('Store email evidence').parameters.query;
  assert.match(sql, /case when \$6::boolean then n\.status else 'sent' end/, 'dry leaves status');
  assert.match(sql, /case when \$6::boolean then null else now\(\) end/, 'dry leaves sent_at null');
  assert.match(sql, /greatest\(n\.attempts - 1, 0\)/, 'dry gives the attempt back');
  assert.match(sql, /'dry:email:'/); assert.match(sql, /'email', 'outbound', 'system', 'broker'/);
  assert.match(sql, /on conflict \(channel, external_id\)/);
  assert.equal(node('Store email evidence').parameters.options.queryReplacement, '={{ [ $json.notification_id, $json.brand_id, $json.broker_email, $json.subject, $json.pdf_name, $json.dry_run === true, $json.broker_id, $json.report_id ] }}');
  const fail = node('Email failed (retry or alert)').parameters.query;
  assert.match(fail, /attempts >= 3 then 'send_failed'/); assert.match(fail, /dedupe_key = 'w14-email-failed-'/);
  assert.ok(!/refresh|contentBytes|pdf_b64/.test(sql + fail), 'the PDF never reaches the database');
});

test('W14 email: the queue SQL really only takes W14 email rows (static) and the existing queue insert still names the builder', () => {
  assert.match(node('Mark sent and queue email').parameters.query, /'builder', 'scripts\/build-broker-report-email\.mjs'/);
  assert.match(node('Mark sent and queue email').parameters.query, /'pdf', 'initials_only'/);
});
