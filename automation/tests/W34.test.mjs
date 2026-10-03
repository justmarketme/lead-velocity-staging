// DRAFT for GATE-TEST-W34: Jonathan (and compliance-qa) approve or edit. W34 stays inactive until this is approved.
//
// W34 POPIA operations: deliverables/compliance-qa/W34-popia-ops.md. Synthetic data only, offline, zero dependencies.
// Rule protected: personal information is kept no longer than the privacy notice says (24 h / 12 months / 5 years),
// a data-subject request is answered inside 30 days, and the things that prove we behaved (suppression hashes,
// audit_log, retention_log) are never erased.
// The Code nodes run *from automation/W34.json* in a sandbox (real code). SQL is checked statically: every column must
// exist in supabase/migrations (shared _sqlcheck.mjs) and the never-erase list is enforced on the statement text.
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
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }) });
  const call = (NOW, items, item) => {
    class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
    const ctx = vm.createContext({ $input: { ...wrap(items), item: item && { json: item } }, $json: item ?? items[0] ?? {}, $env: env, require, Date: FakeDate,
      $: (n) => { if (!refs[n]) throw new Error(`node "${n}" has not run`); return wrap(refs[n]); } });
    return vm.runInContext(`(function () {\n${node(name).parameters.jsCode}\n})()`, ctx);
  };
  if (node(name).parameters.mode === 'runOnceForEachItem') {
    return input.map((j, i) => JSON.parse(JSON.stringify(call(at(Array.isArray(now) ? now[i] : now), [j], j).json)));
  }
  return JSON.parse(JSON.stringify(call(at(now), input).map((i) => i.json)));
}
const ctxAt = (now, env = {}) => runCode('Set retention context', { now, env })[0];

// ---------------------------------------------------------------------------------------------
// 1. Structure and hygiene
// ---------------------------------------------------------------------------------------------
test('W34 structure: unique names, valid connections, SAST, inactive, credentials by name only', () => {
  const names = WF.nodes.map((n) => n.name);
  assert.equal(new Set(names).size, names.length, 'node names unique');
  for (const [from, c] of Object.entries(WF.connections)) {
    assert.ok(names.includes(from), `connection source ${from}`);
    for (const out of c.main) for (const e of out) assert.ok(names.includes(e.node), `connection target ${e.node}`);
  }
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  assert.equal(WF.active, false);
  const crons = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.scheduleTrigger').map((n) => n.parameters.rule.interval[0].expression).sort();
  assert.deepEqual(crons, ['0 7 * * *', '30 2 * * *', '30 7 1 * *']);
  for (const n of WF.nodes) for (const c of Object.values(n.credentials || {})) assert.deepEqual(Object.keys(c), ['name'], `${n.name}: credential by name only`);
  const raw = JSON.stringify(WF);
  assert.doesNotMatch(raw, /(sk_live|sk_test|eyJhbGci|EAAG|-----BEGIN|password=)/i, 'no secrets in the workflow');
  assert.doesNotMatch(raw, /\+27\d{9}|\b0[6-8]\d{8}\b/, 'no real-looking numbers in the workflow');
});

// ---------------------------------------------------------------------------------------------
// 2. SQL column existence (physical names, repo migrations)
// ---------------------------------------------------------------------------------------------
test('W34 SQL: every table/column named exists in supabase/migrations', () => {
  assert.ok(SQL.length >= 14, 'all Postgres nodes found');
  assert.deepEqual(checkSql(SQL), []);
});

// ---------------------------------------------------------------------------------------------
// 3. Retention arithmetic (Set retention context): privacy-notice defaults, env overrides, refusal, never early
// ---------------------------------------------------------------------------------------------
test('retention: defaults are the privacy notice periods (24 h / 12 months / 5 years / 72 h threads)', () => {
  const now = '2026-10-02T02:30:00+02:00';
  const c = ctxAt(now);
  assert.equal(c.run_id, 'W34-nightly-2026-10-02');
  assert.deepEqual(c.periods, { nonfit_hours: 24, lead_months: 12, consent_years: 5, wa_grace_hours: 0, wa_max_hours: 72, dsr_record_years: 5 });
  assert.equal(c.cutoffs.nonfit_before, new Date(Date.parse(now) - 24 * H).toISOString());
  assert.equal(c.cutoffs.lead_before, new Date('2025-10-02T02:30:00+02:00').toISOString());
  assert.equal(c.cutoffs.consent_before, new Date('2021-10-02T02:30:00+02:00').toISOString());
  assert.equal(c.cutoffs.wa_expired_before, new Date(now).toISOString());
  assert.equal(c.cutoffs.wa_stale_before, new Date(Date.parse(now) - 72 * H).toISOString());
  assert.deepEqual(c.policy, { nonfit: 'unqualified_24h', lead: '12m_after_last_contact', consent: 'consent_5y', wa: 'wa_thread_expired', dsr_record: 'dsr_record_5y' });
  assert.deepEqual(c.refused, []);
  assert.equal(c.batch, 500);
});

test('retention: SAST calendar — month-end clamp and leap day never purge early', () => {
  assert.equal(ctxAt('2027-02-28T02:30:00+02:00').cutoffs.lead_before, new Date('2026-02-28T02:30:00+02:00').toISOString());
  assert.equal(ctxAt('2026-03-31T02:30:00+02:00', { W34_LEAD_RETENTION_MONTHS: '1' }).cutoffs.lead_before, new Date('2026-02-28T02:30:00+02:00').toISOString());
  // Consent given on a leap day: 5 years later there is no 29 Feb; the record goes on 1 March, not 28 Feb.
  const c = ctxAt('2029-02-28T02:30:00+02:00');
  assert.equal(c.cutoffs.consent_before, new Date('2024-02-28T02:30:00+02:00').toISOString());
  assert.ok(Date.parse('2024-02-29T10:00:00+02:00') > Date.parse(c.cutoffs.consent_before), 'leap-day consent not yet due on 28 Feb 2029');
  // 00:30 SAST is still the previous UTC day: the SAST date must be used
  assert.equal(ctxAt('2026-10-01T00:30:00+02:00').run_day, '2026-10-01');
});

test('retention: property sweep — due only after anchor + period, never more than 3 days late', () => {
  const addMonths = (t, m) => { // SAST calendar add with month-end clamp
    const d = new Date(t + 2 * H); const y = d.getUTCFullYear(); const mo = d.getUTCMonth() + m;
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return Date.UTC(y, mo, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes()) - 2 * H;
  };
  let checked = 0;
  for (const nowIso of ['2026-10-02T02:30:00+02:00', '2027-02-28T02:30:00+02:00', '2027-03-01T02:30:00+02:00', '2028-02-29T02:30:00+02:00', '2026-12-31T02:30:00+02:00']) {
    const now = Date.parse(nowIso);
    for (const [months, key] of [[12, 'lead_before'], [60, 'consent_before']]) {
      const cut = Date.parse(ctxAt(nowIso).cutoffs[key]);
      for (let a = now - (months + 2) * 31 * D; a < now - (months - 2) * 28 * D; a += 7 * H) {
        const due = a <= cut; checked++;
        if (due) assert.ok(addMonths(a, months) <= now, `${nowIso} ${key}: anchor ${new Date(a).toISOString()} purged early`);
        else assert.ok(addMonths(a, months) > now - 3 * D, `${nowIso} ${key}: anchor ${new Date(a).toISOString()} more than 3 days late`);
      }
    }
  }
  assert.ok(checked > 1000);
});

test('retention: practitioner can change periods by env only (no workflow edit)', () => {
  const now = '2026-10-02T02:30:00+02:00';
  const c = ctxAt(now, { W34_NONFIT_RETENTION_HOURS: '72', W34_LEAD_RETENTION_MONTHS: '18', W34_CONSENT_RETENTION_YEARS: '3', W34_BATCH_LIMIT: '50' });
  assert.equal(c.cutoffs.nonfit_before, new Date(Date.parse(now) - 72 * H).toISOString());
  assert.equal(c.cutoffs.lead_before, new Date('2025-04-02T02:30:00+02:00').toISOString());
  assert.equal(c.cutoffs.consent_before, new Date('2023-10-02T02:30:00+02:00').toISOString());
  assert.equal(c.policy.lead, '18m_after_last_contact');
  assert.equal(c.policy.nonfit, 'unqualified_72h');
  assert.equal(c.batch, 50);
  // The SQL reads the cutoffs (not hard-coded intervals), so the env value is the only knob
  for (const n of ['Delete non-fit entries', 'Pseudonymise after lead retention', 'Delete consent records after consent retention']) {
    assert.doesNotMatch(strip(node(n).parameters.query), /interval|make_interval/, `${n}: no hard-coded period in SQL`);
    assert.match(node(n).parameters.options.queryReplacement, /cutoffs\./);
  }
});

test('retention: a bad setting is refused (job skipped, red), never clamped into an early purge', () => {
  for (const bad of ['0', '-1', '12.5', 'abc', '1e1']) {
    const c = ctxAt('2026-10-02T02:30:00+02:00', { W34_LEAD_RETENTION_MONTHS: bad });
    assert.equal(c.cutoffs.lead_before, '', `"${bad}" -> lead job skipped`);
    assert.equal(c.policy.lead, '');
    assert.ok(c.refused.some((r) => r.startsWith('W34_LEAD_RETENTION_MONTHS')), `"${bad}" reported`);
  }
  assert.deepEqual(ctxAt('2026-10-02T02:30:00+02:00', { W34_LEAD_RETENTION_MONTHS: '  ' }).refused, [], 'blank = default');
  const inv = ctxAt('2026-10-02T02:30:00+02:00', { W34_LEAD_RETENTION_MONTHS: '18', W34_CONSENT_RETENTION_YEARS: '1' });
  assert.equal(inv.cutoffs.consent_before, '', 'consent record may not end before the lead data it evidences');
  assert.notEqual(inv.cutoffs.lead_before, '');
  assert.equal(ctxAt('2026-10-02T02:30:00+02:00', { W34_WA_THREAD_GRACE_HOURS: '0' }).cutoffs.wa_expired_before, new Date('2026-10-02T02:30:00+02:00').toISOString());
  // every job SQL guards on an empty cutoff
  for (const n of ['Purge expired wa_threads', 'Delete non-fit entries', 'Pseudonymise after lead retention', 'Delete consent records after consent retention', 'Minimise closed DSR records']) {
    assert.match(node(n).parameters.query, /nullif\(\$1, ''\) is not null/, `${n} skips when its cutoff is refused`);
  }
  // and the summary turns a refusal into a red alert
  const ctx = ctxAt('2026-10-02T02:30:00+02:00', { W34_LEAD_RETENTION_MONTHS: '0' });
  const s = runCode('Summarise night', { now: '2026-10-02T02:31:00+02:00', refs: {
    'Set retention context': [ctx], 'Purge expired wa_threads': [{ job: 'wa_threads', due: 3, done: 3 }], 'Delete non-fit entries': [{ due: 1, done: 1 }],
    'Pseudonymise after lead retention': [{ due: 0, done: 0, media_urls: [] }],
    'Delete consent records after consent retention': [{ due: 0, done: 0 }], 'Minimise closed DSR records': [{ done: 0 }], 'Collect media to erase': [{ paths: [], unmapped: [] }] } })[0];
  assert.equal(s.red, true);
  assert.equal(s.alert.severity, 'red');
  assert.match(s.alert.message, /W34_LEAD_RETENTION_MONTHS=0/);
});

test('retention: a failing job is reported and the others still count (continueRegularOutput)', () => {
  const ctx = ctxAt('2026-10-02T02:30:00+02:00');
  const s = runCode('Summarise night', { now: '2026-10-02T02:31:00+02:00', refs: {
    'Set retention context': [ctx], 'Purge expired wa_threads': [{ job: 'wa_threads', due: 2, done: 2 }], 'Delete non-fit entries': [{ error: { message: 'deadlock detected' } }],
    'Pseudonymise after lead retention': [{ due: 4, done: 4, media_urls: ['m1'] }],
    'Delete consent records after consent retention': [{ due: 1, done: 1 }], 'Minimise closed DSR records': [{ done: 0 }], 'Collect media to erase': [{ paths: ['broker-media/11111111-1111-4111-8111-111111111111/m1.ogg'], unmapped: [] }] } })[0];
  assert.equal(s.red, true);
  assert.deepEqual(s.jobs['Purge expired wa_threads'], { due: 2, done: 2 });
  assert.ok(!WF.nodes.some((n) => n.name === 'Clear residual identifiers'), 'job 3b dropped: smc_erase_lead covers the residual columns (migration 12)');
  assert.ok(!('Delete non-fit entries' in s.jobs));
  assert.match(s.errors[0], /Delete non-fit entries: deadlock/);
  assert.equal(s.media.requested, 1);
  assert.doesNotMatch(JSON.stringify(s), /@|\+27/, 'nightly evidence is PII-free');
});

test('wa_threads purge (I-35l): deletes only past expires_at (or stale with no expiry) and logs each row', () => {
  const q = strip(node('Purge expired wa_threads').parameters.query);
  assert.match(q, /delete from public\.wa_threads/);
  assert.match(q, /wx\.expires_at < nullif\(\$1, ''\)::timestamptz/);
  assert.match(q, /coalesce\(wx\.last_inbound_at, wx\.updated_at\) < nullif\(\$2, ''\)::timestamptz/, 'unfinished chats: PN-v1.1 {{retention_unfinished_hours}}');
  assert.match(q, /insert into public\.retention_log \(table_name, row_id, action, policy\)/);
  assert.match(q, /left\(del\.mobile_hash, 12\)/, 'only a hash prefix is logged');
  assert.match(q, /not \$3::boolean/, 'dry run deletes nothing');
});

// ---------------------------------------------------------------------------------------------
// 4. The never-erase list
// ---------------------------------------------------------------------------------------------
const NEVER = ['public.suppression', 'public.audit_log', 'public.retention_log'];
test('never-erase: W34 SQL never deletes/updates/truncates suppression, audit_log or retention_log', () => {
  for (const { node: n, sql } of SQL) {
    const s = strip(sql);
    for (const t of NEVER) {
      assert.doesNotMatch(s, new RegExp(`delete\\s+from\\s+${t.replace('.', '\\.')}\\b`), `${n}: DELETE ${t}`);
      assert.doesNotMatch(s, new RegExp(`update\\s+${t.replace('.', '\\.')}\\b`), `${n}: UPDATE ${t}`);
      assert.doesNotMatch(s, new RegExp(`truncate[^;]*${t.replace('.', '\\.')}`), `${n}: TRUNCATE ${t}`);
    }
    assert.doesNotMatch(s, /\bdrop\s+(table|schema)|\btruncate\b/, `${n}: no DDL / truncate`);
    if (/insert into public\.suppression/.test(s)) assert.match(s, /on conflict \(mobile_hash, source\) do nothing/, `${n}: suppression insert-only`);
    assert.doesNotMatch(s, /do update/, `${n}: no upsert overwrites`);
  }
  // The only physical DELETE in W34 is the wa_threads expiry; leads go through the audited smc_erase_lead()
  const deletes = SQL.flatMap(({ node: n, sql }) => [...strip(sql).matchAll(/delete\s+from\s+([a-z_.]+)/g)].map((m) => `${n}:${m[1]}`));
  assert.deepEqual(deletes, ['Purge expired wa_threads:public.wa_threads']);
  for (const { node: n, sql } of SQL) for (const m of sql.matchAll(/smc_erase_lead\([^,]+,\s*('?)(\w+|\$\d)\1/g)) {
    if (m[1]) assert.ok(['pseudonymise', 'delete'].includes(m[2]), `${n}: erase action ${m[2]}`);
  }
});

test('never-erase: smc_erase_lead() (migration) keeps suppression, audit_log and the consent record', () => {
  const mig = readdirSync(join(REPO, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(join(REPO, 'supabase', 'migrations', f), 'utf8')).join('\n');
  const all = [...mig.matchAll(/CREATE OR REPLACE FUNCTION public\.smc_erase_lead\([\s\S]*?\nEND \$\$;/g)];
  assert.ok(all.length >= 1, 'smc_erase_lead found');
  const body = all[all.length - 1][0].replace(/--[^\n]*/g, '').toLowerCase();
  assert.doesNotMatch(body, /suppression|audit_log/, 'function never touches suppression or audit_log');
  assert.doesNotMatch(body, /(delete from|update)\s+public\.retention_log/, 'retention_log is append-only');
  assert.match(body, /insert into public\.retention_log/);
  const pseud = body.match(/if p_action = 'pseudonymise' then\s+update public\.leads\s+set([\s\S]*?)where/);
  assert.ok(pseud, 'pseudonymise branch found');
  for (const keep of ['consent_text', 'consent_text_version', 'consent_mode', 'consent_at', 'consent_page_url', 'consent_source', 'disclosure_msg_id', 'opted_out_at']) {
    assert.doesNotMatch(pseud[1], new RegExp(`\\b${keep}\\s*=`), `pseudonymise keeps ${keep} (5-year evidence)`);
  }
  // suppression.lead_id is ON DELETE SET NULL: deleting a lead never deletes its opt-out hash
  assert.match(mig, /CREATE TABLE IF NOT EXISTS public\.suppression[\s\S]*?lead_id\s+uuid REFERENCES public\.leads\(id\) ON DELETE SET NULL/);
});

test('never-erase: retention jobs skip open requests, routed leads and future bookings; DSR erase needs verification', () => {
  for (const n of ['Delete non-fit entries', 'Pseudonymise after lead retention', 'Delete consent records after consent retention']) {
    const q = strip(node(n).parameters.query);
    assert.match(q, /not exists \(select 1 from public\.dsr_requests dq where dq\.lead_id = l\.id and dq\.status not in/, `${n}: open DSR hold`);
    assert.match(q, /l\.brand_id is not null/, `${n}: SortMyCover rows only`);
    assert.match(q, /coalesce\(l\.is_synthetic, false\) = \$2::boolean/, `${n}: test mode isolates synthetic rows`);
    assert.match(q, /where not \$4::boolean/, `${n}: dry run erases nothing`);
  }
  const nf = strip(node('Delete non-fit entries').parameters.query);
  assert.match(nf, /l\.qualified_at is null/); assert.match(nf, /l\.disqualified_reason is not null/); assert.match(nf, /l\.broker_id is null/);
  assert.match(strip(node('Pseudonymise after lead retention').parameters.query), /ap\.status in \(''\, ''\)/, 'future booking hold');
  assert.match(strip(node('Delete consent records after consent retention').parameters.query), /like ''/, 'only already-pseudonymised rows reach the 5-year delete');
  for (const n of ['Export subject data', 'Suppress subject (erase step 1)', 'Erase subject (erase step 2)', 'Complete erase request', 'Mark export ready']) {
    assert.match(strip(node(n).parameters.query), /verified_at is not null/, `${n}: identity verified first`);
  }
  // suppress before erase
  const order = WF.connections['Suppress subject (erase step 1)'].main[0][0].node;
  assert.equal(order, 'Erase subject (erase step 2)');
});

// ---------------------------------------------------------------------------------------------
// 5. DSR intake and the 30-day clock
// ---------------------------------------------------------------------------------------------
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
  const q = strip(node('Record DSR + dsar ticket').parameters.query);
  assert.match(q, /insert into ops\.notifications \(kind, [^)]*\)\s+select '', \$2/, 'ticket row in ops.notifications');
  assert.match(node('Record DSR + dsar ticket').parameters.query, /select 'dsar', \$2/);
  assert.match(q, /where not exists \(select 1 from dup\)/, 'idempotent on dedupe_key');
  assert.doesNotMatch(node('Record DSR + dsar ticket').parameters.query, /jsonb_build_object\([^)]*requester/, 'ticket payload has no name/contact');
});

test('DSR clock: red when overdue, amber inside 7 days or unverified after 5, one ticket per request per SAST day', () => {
  const now = '2026-10-02T07:00:00+02:00';
  const rows = [
    { id: '00000000-0000-4000-8000-0000000003a1', kind: 'erase', status: 'in_progress', received_at: '2026-09-01T10:00:00+02:00', verified_at: '2026-09-02T10:00:00+02:00', due_at: '2026-10-01T10:00:00+02:00' },
    { id: '00000000-0000-4000-8000-0000000003a2', kind: 'access', status: 'verifying', received_at: '2026-09-07T10:00:00+02:00', verified_at: '2026-09-08T10:00:00+02:00', due_at: '2026-10-07T10:00:00+02:00' },
    { id: '00000000-0000-4000-8000-0000000003a3', kind: 'access', status: 'received', received_at: '2026-09-26T10:00:00+02:00', verified_at: null, due_at: '2026-10-26T10:00:00+02:00' },
    { id: '00000000-0000-4000-8000-0000000003a4', kind: 'correct', status: 'in_progress', received_at: '2026-09-26T10:00:00+02:00', verified_at: '2026-09-27T10:00:00+02:00', due_at: '2026-10-26T10:00:00+02:00' },
    { id: '00000000-0000-4000-8000-0000000003a5', kind: 'erase', status: 'completed', received_at: '2026-08-01T10:00:00+02:00', verified_at: '2026-08-02T10:00:00+02:00', due_at: '2026-08-31T10:00:00+02:00' },
    { id: '00000000-0000-4000-8000-0000000003a6', kind: 'access', status: 'received', received_at: '2026-09-30T10:00:00+02:00', verified_at: null, due_at: '2026-10-30T10:00:00+02:00' },
  ];
  const [c] = runCode('DSR clock', { now, input: rows });
  const by = Object.fromEntries(c.tickets.map((t) => [t.dsr_id.slice(-2), t]));
  assert.deepEqual(Object.keys(by).sort(), ['a1', 'a2', 'a3']);
  assert.equal(by.a1.severity, 'red'); assert.match(by.a1.what, /overdue by 1 day/);
  assert.equal(by.a2.severity, 'amber'); assert.equal(by.a2.days_left, 6);
  assert.equal(by.a3.severity, 'amber'); assert.match(by.a3.what, /not verified after 5 days/);
  assert.equal(c.red, 1); assert.equal(c.amber, 2); assert.equal(c.any, true);
  assert.equal(by.a1.dedupe_key, 'dsar-clock:00000000-0000-4000-8000-0000000003a1:2026-10-02');
  // exactly at the due instant it is still amber; one millisecond later it is red
  const due = [{ ...rows[1], due_at: now }];
  assert.equal(runCode('DSR clock', { now, input: due })[0].tickets[0].severity, 'amber');
  assert.equal(runCode('DSR clock', { now: Date.parse(now) + 1, input: due })[0].tickets[0].severity, 'red');
  // the SAST day (not UTC) keys the ticket: 01:00 SAST on the 3rd is still the 2nd in UTC
  assert.match(runCode('DSR clock', { now: '2026-10-03T01:00:00+02:00', input: [rows[0]] })[0].tickets[0].dedupe_key, /:2026-10-03$/);
  assert.match(strip(node('Queue DSR clock tickets').parameters.query), /where not exists \(select 1 from ops\.notifications nn where nn\.dedupe_key = x\.dedupe_key\)/);
  const alert = runCode('Build DSR clock alert', { now, refs: { 'DSR clock': [c] } })[0];
  assert.equal(alert.severity, 'red'); assert.deepEqual(alert.to, ['jonathan', 'kg'], 'missed SLA = Red to both phones');
});

test('DSR action guard: typed-twice id, export|erase only, erase defaults to pseudonymise', () => {
  const id = '00000000-0000-4000-8000-0000000003a1';
  const ok = runCode('Check DSR action', { now: RECEIVED, input: [{ body: { dsr_id: id, confirm_dsr_id: id.toUpperCase(), action: 'erase' } }] })[0];
  assert.equal(ok.erase_action, 'pseudonymise');
  assert.equal(runCode('Check DSR action', { now: RECEIVED, env: { W34_DSR_ERASE_ACTION: 'delete' }, input: [{ body: { dsr_id: id, confirm_dsr_id: id, action: 'erase' } }] })[0].erase_action, 'delete');
  assert.equal(runCode('Check DSR action', { now: RECEIVED, env: { W34_DSR_ERASE_ACTION: 'purge_all' }, input: [{ body: { dsr_id: id, confirm_dsr_id: id, action: 'erase' } }] })[0].erase_action, 'pseudonymise');
  assert.throws(() => runCode('Check DSR action', { now: RECEIVED, input: [{ body: { dsr_id: id, confirm_dsr_id: id.replace('a1', 'a2'), action: 'erase' } }] }), /not confirmed/);
  assert.throws(() => runCode('Check DSR action', { now: RECEIVED, input: [{ body: { dsr_id: id, confirm_dsr_id: id, action: 'truncate' } }] }), /export or erase/);
  const io = runCode('Build IO erase confirmation', { now: RECEIVED, input: [{ id, in_time: true }], refs: { 'Suppress subject (erase step 1)': [{ dsr_id: id, leads_found: 1, suppressed: 1, broker_notices: [] }], 'Map subject media to paths': [{ paths: [], unmapped: ['https://lookaside.fbsbx.com/x'] }] } })[0];
  assert.equal(io.severity, 'red', 'media outside the bucket is surfaced, not silently skipped'); assert.equal(io.unmapped_media, 1);
});

// ---------------------------------------------------------------------------------------------
// 6. Monthly report and the schema dependency
// ---------------------------------------------------------------------------------------------
test('monthly report: previous SAST month, nights counted, missing nights and overdue DSRs flag amber', () => {
  const m = runCode('Set report month', { now: '2026-11-01T07:30:00+02:00' })[0];
  assert.equal(m.month, '2026-10');
  const nights = Array.from({ length: 31 }, (_, i) => ({ run_day: '2026-10-' + String(i + 1).padStart(2, '0'), red: i === 4 })).filter((n) => n.run_day !== '2026-10-17');
  const stats = { purged: [{ table_name: 'public.leads', action: 'delete', policy: 'unqualified_24h', rows: 12 }, { table_name: 'public.wa_threads', action: 'delete', policy: 'wa_thread_expired', rows: 40 }], dsr_received: 2, dsr_completed: 1, dsr_completed_late: 0, dsr_overdue_now: 0, dsr_suppressed: 1 };
  const [r] = runCode('Build monthly report', { now: '2026-11-01T07:31:00+02:00', input: nights.map((n) => ({ data: n })), refs: { 'Set report month': [m], 'Monthly POPIA stats': [stats] } });
  assert.match(r.report_md, /Nights run: 30 of 31 \(missing: 2026-10-17\)/);
  assert.match(r.report_md, /Nights with an error or refused setting: 2026-10-05/);
  assert.match(r.report_md, /\| public\.wa_threads \| delete \| wa_thread_expired \| 40 \|/);
  assert.match(r.report_md, /Never deleted by W34/);
  assert.equal(r.red, true); assert.equal(r.alert.severity, 'amber');
  assert.match(r.alert.message, /52 rows purged/);
});

const kindConstraint = () => {
  const mig = readdirSync(join(REPO, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(join(REPO, 'supabase', 'migrations', f), 'utf8')).join('\n');
  const all = [...mig.matchAll(/ADD CONSTRAINT notifications_kind_check CHECK \(kind IN([\s\S]*?)\)\);/g)];
  return all.length ? all[all.length - 1][1] : '';
};
test("schema: ops.notifications kind check allows 'dsar' (migration 12, I-38a)", () => {
  assert.match(kindConstraint(), /'dsar'/);
});

// ---------------------------------------------------------------------------------------------
// 7. Follow-up (migration 12): one hash rule, signed w34-media-erase call (I-41b), broker notice via the shared sender
// ---------------------------------------------------------------------------------------------
test('hash rule: the three subject lookups use smc_hash_contact (digits-only, migration 12), no inline hashing', () => {
  for (const n of ['Record DSR + dsar ticket', 'Export subject data', 'Suppress subject (erase step 1)']) {
    const q = node(n).parameters.query;
    assert.match(q, /public\.smc_hash_contact\(l[ms]\.phone\)/, `${n}: phone hashed by smc_hash_contact`);
    assert.doesNotMatch(q, /extensions\.digest|regexp_replace/, `${n}: no second hash rule`);
  }
});

// I-41b: both media paths call the w34-media-erase edge function, HMAC-signed in a Code node; no credential.
const FN_SRC = readFileSync(join(REPO, 'supabase', 'functions', 'w34-media-erase', 'index.ts'), 'utf8');
const FN_PATH_RE = new RegExp(FN_SRC.match(/const PATH_RE = \/(.+)\/;\n/)[1]);
const FN_MAX = Number(FN_SRC.match(/const MAX_PATHS = (\d+);/)[1]);
const B1 = '11111111-1111-4111-8111-111111111111', B2 = '22222222-2222-4222-8222-222222222222';
const MEDIA_SECRET = 'synthetic-w34-media-erase-secret-0123456789abcdef';
const MEDIA_ENV = { W34_MEDIA_ERASE_URL: 'https://synthetic.supabase.co/functions/v1/w34-media-erase', W34_MEDIA_ERASE_SECRET: MEDIA_SECRET };
// The function's own verification (index.ts step 1), re-run with WebCrypto exactly as Deno does it.
async function fnVerify(secret, headers, raw, nowS) {
  const ts = headers['X-LV-Timestamp'] || '';
  const sig = (headers['X-LV-Signature'] || '').replace(/^sha256=/, '');
  if (!/^\d{9,11}$/.test(ts) || Math.abs(nowS - Number(ts)) > 300) return 'stale_or_missing_timestamp';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${raw}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return sig === expected ? 'ok' : 'bad_signature';
}
const headersOf = (httpNode, item) => Object.fromEntries(httpNode.parameters.headerParameters.parameters.map((h) => [h.name, item[h.value.match(/\$json\.(\w+)/)[1]]]));
const rawOf = (httpNode, item) => item[httpNode.parameters.body.match(/\$json\.(\w+)/)[1]];

test('media erase (I-41b): the function signs ts + "." + rawBody, and the source still says so', () => {
  assert.match(FN_SRC, /hmacHex\(secret, `\$\{ts\}\.\$\{raw\}`\)/, 'edge function signs `${ts}.${raw}`');
  assert.match(FN_SRC, /x-lv-timestamp/); assert.match(FN_SRC, /replace\(\/\^sha256=\//);
  assert.equal(FN_MAX, 50);
  assert.match(readFileSync(join(REPO, 'automation', 'vps', 'provision.sh'), 'utf8'), /printf '%s\.%s' "\$ts" "\$body" \| openssl dgst -sha256 -hmac/, 'same scheme as /webhook/w26/status');
});

test('media erase (I-41b, I-42d): both paths route Map -> IF -> Loop (1 per batch) -> Sign (per item) -> HTTP -> Loop -> follow-up', () => {
  const raw = JSON.stringify(WF);
  assert.doesNotMatch(raw, /W34 media erase \(storage service\)/, 'retired Header Auth credential is gone');
  assert.doesNotMatch(raw, /storage\/v1\/object\/<bucket>|"prefixes"/, 'no direct Storage API call left');
  const lanes = [
    { map: 'Collect media to erase', ifn: 'Any media?', loop: 'Loop media erase (nightly)', sign: 'Sign media erase (nightly)', http: 'Erase media files (storage)', done: 'Summarise night', none: 'Summarise night' },
    { map: 'Map subject media to paths', ifn: 'Any subject media?', loop: 'Loop subject media erase (DSR)', sign: 'Sign subject media erase (DSR)', http: 'Erase subject media (storage)', done: 'Check subject media erase', none: 'Complete erase request' },
  ];
  const to = (from, out = 0) => (WF.connections[from].main[out] || []).map((x) => x.node);
  for (const l of lanes) {
    assert.deepEqual(to(l.map), [l.ifn]);
    assert.deepEqual(to(l.ifn, 0), [l.loop]); assert.deepEqual(to(l.ifn, 1), [l.none], `${l.ifn}: no media -> ${l.none}`);
    const lp = node(l.loop);
    assert.equal(lp.type, 'n8n-nodes-base.splitInBatches'); assert.equal(lp.typeVersion, 3); assert.equal(lp.parameters.batchSize, 1, 'one batch per iteration');
    assert.deepEqual(to(l.loop, 0), [l.done], `${l.loop} done -> ${l.done} (every batch result)`);
    assert.deepEqual(to(l.loop, 1), [l.sign], `${l.loop} loop -> ${l.sign}: signed at its own send time`);
    assert.deepEqual(to(l.sign, 0), [l.http], 'Sign sits directly before the HTTP node');
    assert.deepEqual(to(l.http), [l.loop], 'HTTP back into the loop');
    assert.equal(node(l.sign).parameters.mode, 'runOnceForEachItem', `${l.sign}: one signature per batch`);
  }
  assert.equal(WF.connections['Check subject media erase'].main[0][0].node, 'Complete erase request');
  assert.deepEqual(to('Sign media erase (nightly)', 1), ['Loop media erase (nightly)'], 'nightly signer error -> back to the loop, never to the HTTP node');
  assert.equal(to('Sign subject media erase (DSR)', 1).length, 0, 'DSR signer has no error branch');
  assert.match(node('Summarise night').parameters.jsCode, /\$\('Loop media erase \(nightly\)'\)\.all\(0\)/, 'Summarise reads every batch from the loop done output');
  assert.doesNotMatch(node('Summarise night').parameters.jsCode, /\$\('Erase media files \(storage\)'\)/, 'never the HTTP node (last loop run only)');
  assert.equal(node('Sign media erase (nightly)').parameters.jsCode, node('Sign subject media erase (DSR)').parameters.jsCode, 'one signer');
  for (const s of ['Sign media erase (nightly)', 'Sign subject media erase (DSR)']) {
    const c = node(s).parameters.jsCode;
    assert.equal(node(s).type, 'n8n-nodes-base.code');
    assert.match(c, /\$input\.item\.json/, `${s}: signs the current item only`);
    assert.match(c, /createHmac\('sha256', secret\)\.update\(ts \+ '\.' \+ body, 'utf8'\)\.digest\('hex'\)/, `${s}: HMAC-SHA256 over ts + "." + body`);
    assert.match(c, /\$env\.W34_MEDIA_ERASE_SECRET/);
  }
  for (const n of ['Erase media files (storage)', 'Erase subject media (storage)']) {
    const h = node(n); const p = h.parameters;
    assert.equal(h.type, 'n8n-nodes-base.httpRequest');
    assert.equal(p.method, 'POST'); assert.equal(p.url, '={{ $env.W34_MEDIA_ERASE_URL }}');
    assert.equal(p.authentication, 'none'); assert.equal(p.genericAuthType, undefined); assert.equal(h.credentials, undefined, `${n}: no credential`);
    assert.equal(p.contentType, 'raw'); assert.equal(p.rawContentType, 'application/json'); assert.equal(p.body, '={{ $json.body }}', 'sends the signed string as is');
    assert.deepEqual(p.headerParameters.parameters.map((x) => x.name), ['X-LV-Timestamp', 'X-LV-Signature']);
  }
  assert.equal(node('Erase media files (storage)').onError, 'continueRegularOutput', 'nightly: failure reported by Summarise night');
  assert.equal(node('Erase subject media (storage)').onError, undefined, 'DSR: a non-2xx stops before "Complete erase request"');
  assert.equal(node('Sign subject media erase (DSR)').onError, undefined);
  assert.equal(node('Sign media erase (nightly)').onError, 'continueErrorOutput', 'nightly: a signer error skips the send and is reported');
  // HTTP retries reuse the signature: worst case per batch must stay inside the function's +-300 s window
  for (const n of ['Erase media files (storage)', 'Erase subject media (storage)']) {
    const h = node(n);
    const worst = (h.maxTries || 1) * (h.parameters.options.timeout || 300000) + ((h.maxTries || 1) - 1) * (h.waitBetweenTries || 1000);
    assert.ok(worst < 300000, `${n}: ${worst} ms worst case per batch < 300 s`);
  }
});

test('media erase (I-41b): paths are what the function accepts, batched <= 50, signatures verify as the function does', async () => {
  const map = runCode('Map subject media to paths', { now: RECEIVED, input: [{ dsr_id: 'd0000000-0000-4000-8000-000000000001', media_urls: [
    `https://synthetic.supabase.co/storage/v1/object/sign/broker-media/${B1}/voice-note.ogg?token=t`,
    `https://synthetic.supabase.co/storage/v1/object/public/broker-media/${B1}/a.mp4`,
    `https://synthetic.supabase.co/storage/v1/object/broker-media/${B1}/a.mp4`,
    `broker-media/${B2}/c.ogg`, `${B2}/d.ogg`,
    'https://lookaside.fbsbx.com/whatsapp_business/attachments/x', '1234567890', 'https://synthetic.supabase.co/storage/v1/object/other/z.ogg',
    '../etc/passwd', 'b1/not-a-uuid.ogg', `${B1}/voice%20note.ogg`, `${B1}/../${B2}/x.ogg`, `${B1}/*`] }] });
  assert.equal(map.length, 1);
  assert.deepEqual(map[0].paths, [`broker-media/${B1}/voice-note.ogg`, `broker-media/${B1}/a.mp4`, `broker-media/${B2}/c.ogg`, `broker-media/${B2}/d.ogg`]);
  for (const p of map[0].paths) assert.match(p, FN_PATH_RE, 'passes the function PATH_RE');
  assert.equal(map[0].unmapped.length, 8, 'Meta media, ids, other buckets, non-uuid folders, unsafe names and traversal are never sent');
  assert.deepEqual([map[0].policy, map[0].dsr_id, map[0].request_id], ['dsr', 'd0000000-0000-4000-8000-000000000001', 'dsr-d0000000-0000-4000-8000-000000000001']);
  assert.equal(runCode('Map subject media to paths', { now: RECEIVED, input: [{ dsr_id: 'd1', media_urls: [] }] })[0].any, false);

  const many = Array.from({ length: 123 }, (_, i) => `${B1}/v${i}.ogg`);
  const big = runCode('Map subject media to paths', { now: RECEIVED, input: [{ dsr_id: 'd1', media_urls: many }] });
  assert.deepEqual(big.map((c) => c.paths.length), [50, 50, 23], 'at most 50 paths per call');
  assert.deepEqual(big.map((c) => c.request_id), ['dsr-d1:1', 'dsr-d1:2', 'dsr-d1:3']);

  const nowS = Math.floor(Date.parse(RECEIVED) / 1000);
  const signed = runCode('Sign subject media erase (DSR)', { now: RECEIVED, env: MEDIA_ENV, input: big }); // per item, same clock
  assert.equal(signed.length, 3);
  const http = node('Erase subject media (storage)');
  for (const [i, s] of signed.entries()) {
    const raw = rawOf(http, s); const hdr = headersOf(http, s);
    const b = JSON.parse(raw);
    assert.deepEqual(Object.keys(b), ['paths', 'policy', 'dsr_id', 'request_id'], 'body is exactly the contract');
    assert.ok(b.paths.length <= FN_MAX && b.paths.length >= 1);
    assert.equal(b.policy, 'dsr'); assert.equal(b.request_id, big[i].request_id);
    assert.equal(hdr['X-LV-Timestamp'], String(nowS));
    assert.equal(hdr['X-LV-Signature'], 'sha256=' + createHmac('sha256', MEDIA_SECRET).update(`${nowS}.${raw}`).digest('hex'));
    assert.equal(await fnVerify(MEDIA_SECRET, hdr, raw, nowS + 299), 'ok', 'the function accepts it');
    assert.equal(await fnVerify(MEDIA_SECRET, hdr, raw.replace('"dsr"', '"retention"'), nowS), 'bad_signature', 'a changed body is refused');
    assert.equal(await fnVerify('another-secret-0123456789abcdef0123', hdr, raw, nowS), 'bad_signature');
    assert.equal(await fnVerify(MEDIA_SECRET, hdr, raw, nowS + 301), 'stale_or_missing_timestamp');
  }
  // nothing to erase: the IF before the loop goes false; the signer never signs an empty batch
  assert.throws(() => runCode('Sign subject media erase (DSR)', { now: RECEIVED, env: MEDIA_ENV, input: [{ paths: [], any: false, unmapped: [] }] }), /no paths: nothing signed/);
  // misconfigured: refuse rather than send unsigned / to the old Storage URL
  assert.throws(() => runCode('Sign subject media erase (DSR)', { now: RECEIVED, env: { ...MEDIA_ENV, W34_MEDIA_ERASE_SECRET: 'short' }, input: big }), /W34_MEDIA_ERASE_SECRET/);
  assert.throws(() => runCode('Sign subject media erase (DSR)', { now: RECEIVED, env: { ...MEDIA_ENV, W34_MEDIA_ERASE_URL: 'https://synthetic.supabase.co/storage/v1/object/broker-media' }, input: big }), /W34_MEDIA_ERASE_URL/);
  assert.throws(() => runCode('Sign subject media erase (DSR)', { now: RECEIVED, env: MEDIA_ENV, input: [{ any: true, paths: Array(51).fill(`broker-media/${B1}/x.ogg`) }] }), /over 50/);
});

test('media erase (I-41b): DSR follow-up completes only when every batch is ok', () => {
  const ok = runCode('Check subject media erase', { now: RECEIVED, input: [
    { ok: true, deleted: 50, not_found: 0, rejected: [], request_id: 'dsr-d1:1' }, { ok: true, deleted: 20, not_found: 3, rejected: [], request_id: 'dsr-d1:2' }] })[0];
  assert.deepEqual(ok, { batches: 2, deleted: 70, not_found: 3, rejected: 0 }, 'not_found (already gone) is fine');
  assert.throws(() => runCode('Check subject media erase', { now: RECEIVED, input: [
    { ok: false, deleted: 0, not_found: 0, rejected: [{ path: 'x', reason: 'unsafe path' }], request_id: 'dsr-d1' }] }), /NOT completed.*1 path\(s\) rejected \(unsafe path\)/);
  assert.throws(() => runCode('Check subject media erase', { now: RECEIVED, input: [
    { ok: false, error: 'deleted_but_not_logged', deleted: 2, request_id: 'dsr-d1' }] }), /deleted_but_not_logged/, '207: deleted but no retention_log row -> not completed');
  const io = runCode('Build IO erase confirmation', { now: RECEIVED, input: [{ in_time: true }], refs: {
    'Suppress subject (erase step 1)': [{ dsr_id: 'd1', leads_found: 1, suppressed: 1, broker_notices: [] }],
    'Map subject media to paths': [{ paths: [`broker-media/${B1}/a.ogg`], unmapped: [] }], 'Check subject media erase': [ok] } })[0];
  assert.equal(io.media_deleted, 70); assert.equal(io.severity, 'info');
});

test('media erase (I-41b): nightly retention signs with policy "retention", reads the response, any failure -> w34_retention_failure', () => {
  const ctx = ctxAt('2026-10-02T02:30:00+02:00');
  const refs = { 'Set retention context': [ctx], 'Pseudonymise after lead retention': [{ media_urls: [`${B1}/x.ogg`, 'https://lookaside.fbsbx.com/y'] }] };
  const col = runCode('Collect media to erase', { now: '2026-10-02T02:31:00+02:00', refs });
  assert.deepEqual(col[0].paths, [`broker-media/${B1}/x.ogg`]);
  assert.deepEqual([col[0].policy, col[0].dsr_id, col[0].request_id], ['retention', null, ctx.run_id]);
  assert.match(col[0].policy, /^[a-z_]{1,40}$/, 'policy passes the function check (no fallback to "dsr")');
  assert.equal(runCode('Collect media to erase', { now: '2026-10-02T02:31:00+02:00', refs: { ...refs, 'Set retention context': [{ ...ctx, dry_run: true }] } })[0].any, false, 'dry run sends nothing');
  const sig = runCode('Sign media erase (nightly)', { now: '2026-10-02T02:31:00+02:00', env: MEDIA_ENV, input: col });
  assert.equal(JSON.parse(sig[0].body).policy, 'retention'); assert.equal(JSON.parse(sig[0].body).dsr_id, null);
  const base = { ...refs, 'Collect media to erase': col,
    'Purge expired wa_threads': [{ due: 0, done: 0 }], 'Delete non-fit entries': [{ due: 0, done: 0 }], 'Delete consent records after consent retention': [{ due: 0, done: 0 }],
    'Minimise closed DSR records': [{ done: 0 }] };
  const night = (extra) => runCode('Summarise night', { now: '2026-10-02T02:32:00+02:00', refs: { ...base, ...extra } })[0];
  // HTTP non-2xx ({error} item via continueRegularOutput) + an unmapped reference
  const n1 = night({ 'Loop media erase (nightly)': [{ error: { message: '401 - {"ok":false,"error":"bad_signature"}' } }] });
  assert.equal(n1.red, true); assert.equal(n1.alert.kind, 'w34_retention_failure');
  assert.ok(n1.errors.some((e) => /not in the storage bucket/.test(e)) && n1.errors.some((e) => /bad_signature/.test(e)));
  // 2xx with rejected paths / 207 not logged
  const n2 = night({ 'Pseudonymise after lead retention': [{ media_urls: [`${B1}/x.ogg`] }], 'Collect media to erase': [{ ...col[0], unmapped: [] }],
    'Loop media erase (nightly)': [{ ok: false, deleted: 0, not_found: 0, rejected: [{ path: 'p', reason: 'unsafe path' }], request_id: ctx.run_id }] });
  assert.equal(n2.alert.kind, 'w34_retention_failure'); assert.equal(n2.media.rejected, 1);
  const n3 = night({ 'Collect media to erase': [{ ...col[0], unmapped: [] }], 'Loop media erase (nightly)': [{ ok: false, error: 'deleted_but_not_logged', deleted: 1, request_id: ctx.run_id }] });
  assert.equal(n3.red, true); assert.match(n3.errors.join(), /deleted_but_not_logged/);
  // signing failure (secret not set) is red too
  const n4 = night({ 'Collect media to erase': [{ ...col[0], unmapped: [] }], 'Loop media erase (nightly)': [{ error: 'W34_MEDIA_ERASE_SECRET missing or shorter than 32 characters: media not erased' }] });
  assert.equal(n4.alert.kind, 'w34_retention_failure'); assert.match(n4.errors.join(), /not sent: W34_MEDIA_ERASE_SECRET/);
  // all good: counts only, green
  const n5 = night({ 'Collect media to erase': [{ ...col[0], unmapped: [] }], 'Loop media erase (nightly)': [{ ok: true, deleted: 1, not_found: 0, rejected: [], request_id: ctx.run_id }] });
  assert.equal(n5.red, false); assert.deepEqual(n5.media, { requested: 1, deleted: 1, not_found: 0, rejected: 0, failed: false });
  assert.doesNotMatch(JSON.stringify(n5), /@|\+27/);
});

test('media erase (I-42d): two batches signed in one run carry their own timestamps and both verify at their own send time', async () => {
  // A long DSR backlog: 2 batches, the second sent 400 s after the first (slow responses + HTTP retries). The loop hands
  // the signer one batch per iteration, so each is signed when it is about to be sent.
  const big = runCode('Map subject media to paths', { now: RECEIVED, input: [{ dsr_id: 'd2', media_urls: Array.from({ length: 70 }, (_, i) => `${B1}/w${i}.ogg`) }] });
  assert.deepEqual(big.map((c) => c.paths.length), [50, 20]);
  const t1 = Date.parse(RECEIVED); const t2 = t1 + 400_000;
  const http = node('Erase subject media (storage)');
  for (const name of ['Sign subject media erase (DSR)', 'Sign media erase (nightly)']) {
    const [s1, s2] = runCode(name, { now: [t1, t2], env: MEDIA_ENV, input: big });
    const h1 = headersOf(http, s1), h2 = headersOf(http, s2);
    assert.equal(h1['X-LV-Timestamp'], String(Math.floor(t1 / 1000)), `${name}: batch 1 timestamp = its own send time`);
    assert.equal(h2['X-LV-Timestamp'], String(Math.floor(t2 / 1000)), `${name}: batch 2 timestamp = its own send time`);
    assert.notEqual(h1['X-LV-Signature'], h2['X-LV-Signature']);
    assert.equal(await fnVerify(MEDIA_SECRET, h1, rawOf(http, s1), Math.floor(t1 / 1000) + 5), 'ok', 'batch 1 verifies when sent');
    assert.equal(await fnVerify(MEDIA_SECRET, h2, rawOf(http, s2), Math.floor(t2 / 1000) + 5), 'ok', 'batch 2 verifies when sent, 400 s later');
    // the old one-timestamp-per-run scheme would have failed here: batch 1's stamp is stale by batch 2's send time
    assert.equal(await fnVerify(MEDIA_SECRET, h1, rawOf(http, s1), Math.floor(t2 / 1000) + 5), 'stale_or_missing_timestamp');
    assert.deepEqual([JSON.parse(rawOf(http, s1)).request_id, JSON.parse(rawOf(http, s2)).request_id], ['dsr-d2:1', 'dsr-d2:2']);
  }
  // the DSR check sees both responses (loop done output) and completes only when both are ok
  const both = runCode('Check subject media erase', { now: RECEIVED, input: [
    { ok: true, deleted: 50, not_found: 0, rejected: [], request_id: 'dsr-d2:1' }, { ok: true, deleted: 20, not_found: 0, rejected: [], request_id: 'dsr-d2:2' }] })[0];
  assert.deepEqual(both, { batches: 2, deleted: 70, not_found: 0, rejected: 0 });
  assert.throws(() => runCode('Check subject media erase', { now: RECEIVED, input: [
    { ok: true, deleted: 50, not_found: 0, rejected: [], request_id: 'dsr-d2:1' }, { ok: false, error: 'stale_or_missing_timestamp', request_id: 'dsr-d2:2' }] }), /NOT completed.*dsr-d2:2/);
});

test('broker notice: broker_dsr_erase goes through the shared WhatsApp sender, broker + lead first names only', () => {
  const tpl = JSON.parse(readFileSync(join(HERE, '..', 'templates', 'broker_dsr_erase.json'), 'utf8'));
  const body = tpl.components.find((c) => c.type === 'BODY').text;
  assert.equal(tpl.category, 'UTILITY');
  assert.equal((body.match(/\{\{\d\}\}/g) || []).length, 2, 'template takes exactly two params');
  const send = node('WhatsApp: broker_dsr_erase');
  assert.equal(send.type, 'n8n-nodes-base.executeWorkflow');
  assert.equal(send.parameters.workflowId.value, 'smc-whatsapp-send', 'the shared sender by its stable id (I-44b)');
  assert.equal(WF.connections['Build broker erase messages'].main[0][0].node, 'WhatsApp: broker_dsr_erase');
  assert.ok(!JSON.stringify(WF.connections).includes('"Notify IO + broker (W22)"'), 'broker notice no longer routed via W22');
  const sup = { dsr_id: 'd1', leads_found: 2, suppressed: 1, broker_notices: [
    { broker_id: 'b1', lead_id: 'l1', first_name: 'Lerato', broker_first_name: 'Mark', broker_to: '+27600000199' },
    { broker_id: 'b1', lead_id: 'l1', first_name: 'Lerato', broker_first_name: 'Mark', broker_to: '+27600000199' },
    { broker_id: 'b1', lead_id: 'l2', first_name: null, broker_first_name: '', broker_to: '+27600000199' },
    { broker_id: 'b2', lead_id: 'l3', first_name: 'Sipho', broker_first_name: 'Kg', broker_to: null } ] };
  const msgs = runCode('Build broker erase messages', { now: RECEIVED, refs: { 'Suppress subject (erase step 1)': [sup] } });
  assert.equal(msgs.length, 2, 'one per broker+lead; no number -> nothing sent');
  assert.deepEqual(msgs[0], { broker_id: 'b1', to: '+27600000199', idempotency_key: 'w34-dsr-erase:d1:b1:l1', template: { name: 'broker_dsr_erase', body: ['Mark', 'Lerato'], buttons: [] } });
  assert.deepEqual(msgs[1].template.body, ['there', 'not recorded']);
  const q = node('Suppress subject (erase step 1)').parameters.query;
  assert.match(q, /'broker_first_name', split_part\(/); assert.doesNotMatch(q, /last_name|'email'/, 'no surname or email leaves the database for the notice');
});
