// S7-08 / S7-09 local proof (I-55): synthetic W22 alerts (DND, dedupe, escalation) and Approve -> task, over the REAL
// node code in automation/W22.json + W32.json and the REAL migration chain, in a throwaway Postgres on a unix socket
// (listen_addresses='', no network, never the live project). Skipped when no Postgres binaries exist.
// Evidence env is "local" (not staging): build/evidence/S7-08.jsonl and S7-09.jsonl are written by hand from this run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, chmodSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const W22 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W22.json'), 'utf8'));
const W32 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W32.json'), 'utf8'));
const nd = (WF, name) => { const n = WF.nodes.find((x) => x.name === name); assert.ok(n, `node ${name}`); return n; };
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/local/pgsql/bin'].find((d) => existsSync(join(d, 'initdb')));

function runCode(WF, name, { input = [], refs = {}, nowIso, binaryHelper } = {}) {
  const NOW = nowIso ? Date.parse(nowIso) : Date.now();
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }) });
  const ctx = vm.createContext({ $input: wrap(input), $: (n) => { assert.ok(refs[n], `supplies $('${n}')`); return wrap(refs[n]); },
    $env: {}, require: (m) => import.meta && globalThis.process.getBuiltinModule(m), Buffer, URL, Date: FakeDate, JSON, Promise });
  const fn = vm.runInContext(`(async function () {\n${nd(WF, name).parameters.jsCode}\n})`, ctx);
  return fn.call({ helpers: { prepareBinaryData: async (b, fileName) => ({ fileName, len: b.length }) } })
    .then((out) => JSON.parse(JSON.stringify(out.map((i) => i.json))));
}

test('S7-08/S7-09 local: synthetic W22 alerts + console Approve creates a task (real node code, real migrations)', { skip: !PGBIN && 'no Postgres binaries on this machine', timeout: 600000 }, async (t) => {
  const isRoot = process.getuid && process.getuid() === 0;
  const as = (cmd, args, opts = {}) => execFileSync(isRoot ? 'runuser' : cmd, isRoot ? ['-u', 'postgres', '--', cmd, ...args] : args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 26, ...opts });
  const dir = mkdtempSync(join(tmpdir(), 's708pg-')); chmodSync(dir, 0o777);
  const port = String(56000 + Math.floor(Math.random() * 900));
  const data = join(dir, 'data');
  as(join(PGBIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  as(join(PGBIN, 'pg_ctl'), ['-D', data, '-o', `-k ${dir} -c listen_addresses='' -p ${port}`, '-w', '-l', join(dir, 'log'), 'start']);
  t.after(() => { try { as(join(PGBIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); });
  const base = ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'];
  const file = (f, extra = []) => { const c = join(dir, `f${crypto.randomBytes(3).toString('hex')}.sql`); copyFileSync(f, c); chmodSync(c, 0o644); return as('psql', [...base, ...extra, '-f', c]); };
  const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const psql = (sql, params = []) => {
    const q = sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
    const f = join(dir, `q${crypto.randomBytes(4).toString('hex')}.sql`); writeFileSync(f, q); chmodSync(f, 0o644);
    return as('psql', [...base, '-At', '-F', '\x1f', '-f', f]).trim().split('\n').filter(Boolean).map((l) => l.split('\x1f'));
  };

  // ---- build the schema from the repo chain (stub = minimal Supabase surface; pg_cron/net migration skipped)
  file(join(here, 'fixtures', 'pg-stub.sql'));
  const MIG = join(ROOT, 'supabase', 'migrations');
  const all = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  const legacy = all.filter((f) => !f.startsWith('20261002_smc_') && !f.startsWith('20260114094619'));
  let deferred = [];
  for (const f of legacy) { try { file(join(MIG, f), ['-1']); } catch { deferred.push(f); } }
  for (const f of deferred) file(join(MIG, f), ['-1']);
  for (const f of all.filter((x) => x.startsWith('20261002_smc_'))) file(join(MIG, f), ['-1']);

  // =========================================================== (1) W22: DND, dedupe, escalation
  const sig = (k, extra = {}) => ({ kind: 'signal', signal_key: k, scope: 'global', severity: 'red', what: `synthetic ${k}`, impact: 'synthetic', first_action: 'none', since: new Date().toISOString(), ...extra });
  const dedupeSql = nd(W22, 'Dedupe 24 h + write ops.notifications').parameters.query;
  const toParams = (o) => [o.dedupe_key, o.signal_key, o.scope, o.severity, o.always_send, o.status, o.source, o.what, o.impact, o.first_action, o.since_label, o.primary_partner, o.payload, o.to || ''];
  const NIGHT = '2026-10-02T21:30:00Z'; // 23:30 SAST
  const DAY = '2026-10-03T08:00:00Z';   // 10:00 SAST
  const send = async (nowIso, ...signals) => {
    const pol = await runCode(W22, 'Policy: severity, DND, redaction', { nowIso, input: signals });
    return pol.map((o) => ({ o, r: psql(dedupeSql, toParams(o))[0] }));
  };
  const rowOf = (id) => psql(`SELECT status, escalation_level, seen_count, first_sent_at IS NOT NULL, acked_at IS NOT NULL FROM ops.notifications WHERE id = '${id}'`)[0];

  // DND: at 23:30 SAST a non-always-send red is held; the always-send set goes straight out
  const [held, always] = await send(NIGHT, sig('cpl_kill_raw'), sig('guardrail_trip', { scope: 'conversation:c1' }));
  assert.equal(held.o.status, 'held_dnd'); assert.equal(always.o.status, 'sending');
  assert.equal(held.r[1], 'held_dnd', 'stored held');
  assert.equal(always.r[1], 'sending', 'always-send stored for delivery');
  // nothing is released before 07:00 SAST
  const due = nd(W22, 'Due escalations').parameters.query;
  const heldRow = () => psql(due).filter((x) => x[0] === held.r[0]).map((x) => ({ id: x[0], notification_id: x[0], signal_key: x[2], dedupe_key: x[3], severity: x[4], always_send: x[5] === 't', status: x[6], escalation_level: Number(x[7]), first_sent_at: x[8] || null, acked_at: x[9] || null, what: x[10], impact: x[11], first_action: x[12], since_label: x[13], primary_partner: x[14], to: x[15] }));
  assert.deepEqual(await runCode(W22, 'Escalation policy', { nowIso: '2026-10-03T04:55:00Z', input: heldRow() }), [], 'still held at 06:55 SAST');
  const [rel] = await runCode(W22, 'Escalation policy', { nowIso: '2026-10-03T05:00:00Z', input: heldRow() });
  assert.deepEqual([rel.decision, rel.released_from_dnd, rel.recipients.join()], ['send_now', true, 'jonathan,kg'], 'released at 07:00 SAST');
  const [gpol] = await runCode(W22, 'Policy: severity, DND, redaction', { nowIso: NIGHT, input: [sig('failed_debit')] });
  assert.equal(gpol.status, 'sending', 'payment failure bypasses DND'); assert.equal(gpol.primary_partner, 'kg');

  // Dedupe: the same signal twice in 24 h notifies once; amber -> red is a new key; after 24 h it may notify again
  const [a1] = await send(DAY, sig('fsca_mismatch', { scope: 'broker:mark' }));
  const [a2] = await send(DAY, sig('fsca_mismatch', { scope: 'broker:mark' }));
  assert.equal(a1.r[1], 'sending'); assert.equal(a2.r[1], 'suppressed'); assert.equal(a2.r[0], a1.r[0]);
  assert.equal(rowOf(a1.r[0])[2], '2', 'seen_count bumped, not a second notification');
  assert.equal(psql("SELECT count(*) FROM ops.notifications WHERE dedupe_key = 'fsca_mismatch|broker:mark|red'")[0][0], '1');
  const [a3] = await send(DAY, sig('fsca_mismatch', { scope: 'broker:mark', severity: 'amber' }));
  assert.notEqual(a3.r[0], a1.r[0]); assert.equal(a3.r[1], 'amber_to_pulse', 'amber is a different key and never WhatsApps');
  psql(`UPDATE ops.notifications SET created_at = now() - interval '25 hours' WHERE id = '${a1.r[0]}'`);
  const [a4] = await send(DAY, sig('fsca_mismatch', { scope: 'broker:mark' }));
  assert.equal(a4.r[1], 'sending'); assert.notEqual(a4.r[0], a1.r[0]);

  // Escalation: delivered at t0; <2 h nothing; 2 h -> the other partner; 4 h -> voice to both; ack stops it
  const log = nd(W22, 'Log delivery').parameters.query;
  const id = a4.r[0];
  psql(log, [id, 'whatsapp', 'jonathan', 0, 200]); psql(log, [id, 'whatsapp', 'kg', 0, 200]);
  assert.deepEqual(rowOf(id).slice(0, 2), ['sent', '0']);
  const fetchDue = () => psql(due).filter((x) => x[0] === id).map((x) => ({ id: x[0], notification_id: x[0], signal_key: x[2], severity: x[4], always_send: x[5] === 't', status: x[6], escalation_level: Number(x[7]), first_sent_at: x[8], acked_at: x[9] || null, what: x[10], primary_partner: x[14] }));
  assert.equal(fetchDue().length, 0, 'under 2 h: not due');
  psql(`UPDATE ops.notifications SET first_sent_at = '${DAY}'::timestamptz - interval '2 hours 1 minute' WHERE id = '${id}'`);
  const [e1] = await runCode(W22, 'Escalation policy', { nowIso: DAY, input: fetchDue() });
  assert.deepEqual([e1.decision, e1.escalation_level, e1.recipients.join()], ['escalate_resend', 1, 'kg'], '2 h -> the partner who is not primary');
  assert.match(e1.what, /^ESCALATED/);
  psql(log, [id, 'whatsapp', 'kg', 1, 200]);
  assert.deepEqual(rowOf(id).slice(0, 2), ['escalated', '1']);
  assert.deepEqual(await runCode(W22, 'Escalation policy', { nowIso: DAY, input: fetchDue() }), [], 'level 1 waits for 4 h');
  psql(`UPDATE ops.notifications SET first_sent_at = '${DAY}'::timestamptz - interval '4 hours 1 minute' WHERE id = '${id}'`);
  const [e2] = await runCode(W22, 'Escalation policy', { nowIso: DAY, input: fetchDue() });
  assert.deepEqual([e2.decision, e2.recipients.join()], ['escalate_call', 'jonathan,kg'], '4 h -> Twilio voice to both');
  psql(log, [id, 'voice', 'jonathan', 2, 200]);
  assert.equal(fetchDue().length, 0, 'level 2 is the end of the ladder');
  // ack stops a level-0 red
  const [b1] = await send(DAY, sig('template_rejected', { scope: 'tpl:ops_alert' }));
  psql(log, [b1.r[0], 'whatsapp', 'jonathan', 0, 200]);
  psql(`UPDATE ops.notifications SET first_sent_at = now() - interval '3 hours' WHERE id = '${b1.r[0]}'`);
  assert.equal(psql(due).filter((x) => x[0] === b1.r[0]).length, 1);
  psql(nd(W22, 'Record ack').parameters.query, [b1.r[0], 'jonathan']);
  assert.equal(psql(due).filter((x) => x[0] === b1.r[0]).length, 0, 'acked leaves the escalation queue');

  // =========================================================== (2) Approve on a proposal creates a task
  const uid = '00000000-0000-4000-8000-0000000000aa';
  psql(`INSERT INTO auth.users (id, email) VALUES ('${uid}', 'synthetic-admin@example.test')`);
  psql(`INSERT INTO public.user_roles (user_id, role) VALUES ('${uid}', 'admin')`);
  const pid = '11111111-2222-4333-8444-555555555555';
  psql(`INSERT INTO ops.proposals (id, faculty, title, metric, forecast, test, kill_rule, owner_agent, check_date)
        VALUES ('${pid}', 'page_flow', 'Synthetic: shorter quiz step 2', 'quiz_step2_dropoff', '{"delta":"-4pp"}', 'A/B 14 d', 'kill if no lift at n=300', 'landing-page-builder', current_date + 14)`);
  const asAdmin = (sql) => psql(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)::text; ${sql}`);
  // non-admin cannot decide
  assert.throws(() => psql(`SELECT id FROM public.smc_console_decide_proposal('${pid}', 'approve')`), /admin only/);
  asAdmin(`SELECT id FROM public.smc_console_decide_proposal('${pid}', 'approve')`);
  assert.deepEqual(psql(`SELECT status, decided_by_label, task_id IS NULL FROM ops.proposals WHERE id = '${pid}'`)[0], ['approved', 'console', 't']);
  const [nrow] = psql(`UPDATE ops.notifications SET status = 'sending' WHERE kind = 'approval' AND proposal_id = '${pid}' AND status = 'queued' RETURNING id, proposal_id, payload`);
  assert.ok(nrow, 'console Approve queued one approval outbox row for W32');
  assert.throws(() => asAdmin(`SELECT id FROM public.smc_console_decide_proposal('${pid}', 'approve')`), /already decided/, 'double Approve refused');

  // W32 follow-up with the real nodes: console row -> Validate decision -> Decide (SQL) -> Append task node -> validator -> Link task
  const [cr] = await runCode(W32, 'Console row to decision', { input: [{ id: nrow[0], proposal_id: nrow[1], payload: nrow[2] }] });
  assert.equal(cr.valid, true);
  const [vd] = await runCode(W32, 'Validate decision', { input: [cr] });
  assert.deepEqual([vd.valid, vd.decision, vd.via, vd.proposal_id], [true, 'approve', 'console', pid]);
  const decRows = psql(nd(W32, 'Decide').parameters.query, [vd.decision, vd.proposal_id, vd.decided_by, vd.reason, vd.via]);
  assert.equal(decRows.length, 1, 'Decide matches the console-decided row');
  const [D] = psql(`SELECT id::text, title, metric, forecast, test, kill_rule, owner_agent, check_date::text, decided_by_label, decided_via FROM ops.proposals WHERE id = '${pid}'`);
  const decide = { id: D[0], title: D[1], metric: D[2], forecast: JSON.parse(D[3]), test: D[4], kill_rule: D[5], owner_agent: D[6], check_date: D[7], decided_by: D[8] };
  const tasksDoc = JSON.parse(readFileSync(join(ROOT, 'build', 'tasks.json'), 'utf8')); // read only; the copy below is what gets appended
  const [ap] = await runCode(W32, 'Append task node', { refs: { Decide: [decide], 'Tasks.json (approve)': [tasksDoc] } });
  assert.equal(ap.ok, true, JSON.stringify(ap)); assert.equal(ap.task_id, 'OPT-11111111');
  // validate the appended file with the real validator on a temp copy
  const nodes = tasksDoc.nodes.concat([{ id: ap.task_id, title: decide.title, owner: decide.owner_agent, phase: 'optimisation', depends_on: [], acceptance_test: 'x', human_gate: false, status: 'pending', section: '4.15', proposal_id: pid }]);
  const vdir = join(dir, 'v'); execFileSync('mkdir', ['-p', vdir]);
  copyFileSync(join(ROOT, 'build', 'validate-tasks.mjs'), join(vdir, 'validate-tasks.mjs'));
  writeFileSync(join(vdir, 'tasks.json'), JSON.stringify({ ...tasksDoc, nodes }));
  execFileSync('node', [join(vdir, 'validate-tasks.mjs')], { stdio: 'pipe' });
  psql(nd(W32, 'Link task').parameters.query, [decide.id, ap.task_id]);
  assert.equal(psql(`SELECT task_id FROM ops.proposals WHERE id = '${pid}'`)[0][0], 'OPT-11111111');
  assert.equal(psql(nd(W32, 'Decide').parameters.query, [vd.decision, vd.proposal_id, vd.decided_by, vd.reason, vd.via]).length, 0, 'replay is a no-op once task_id is set');
  const [again] = await runCode(W32, 'Append task node', { refs: { Decide: [decide], 'Tasks.json (approve)': [{ nodes }] } });
  assert.deepEqual([again.ok, again.already], [true, true], 'task append idempotent');
});
