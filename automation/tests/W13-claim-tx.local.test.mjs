// I-45m local proof: the W13 "Claim replacement" node (automation/W13.json) is ONE implicit transaction (two statements in one
// query string, queryBatching left at the default 'single'), so pg_advisory_xact_lock serialises claims per cycle. Runs the REAL
// node SQL, concurrently, against the REAL migration chain in a throwaway Postgres on a unix socket (no network, never the live DB).
// Skipped when no Postgres binaries exist. psql -c sends the whole string as one simple Query = what n8n/pg-promise sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, chmodSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execFile } from 'node:child_process';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const W13 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W13.json'), 'utf8'));
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/local/pgsql/bin'].find((d) => existsSync(join(d, 'initdb')));
const node = W13.nodes.find((n) => n.name.startsWith('Claim replacement'));

test('W13 claim node: static shape = one query string, two statements, batching single', () => {
  assert.ok(node, 'claim node exists');
  const opt = node.parameters.options || {};
  assert.ok(opt.queryBatching === undefined || opt.queryBatching === 'single', `queryBatching must be default/single, got ${opt.queryBatching}`);
  const stmts = node.parameters.query.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(stmts.length, 2, 'lock + insert');
  assert.match(stmts[0], /^SELECT pg_advisory_xact_lock\(hashtext\('w13:cycle:' \|\| \$4::text\)\)$/);
  assert.ok(!/\bCOMMIT\b|\bBEGIN\b/i.test(node.parameters.query), 'no hand-rolled txn control');
});

test('W13 claim SQL concurrently: no over-cap claim, one per lead, no partial write (real SQL, real migrations)', { skip: !PGBIN && 'no Postgres binaries on this machine', timeout: 600000 }, async (t) => {
  const isRoot = process.getuid && process.getuid() === 0;
  const run = (cmd, args, opts = {}) => isRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args], opts] : [cmd, args, opts];
  const as = (cmd, args, opts = {}) => { const [c, a, o] = run(cmd, args, opts); return execFileSync(c, a, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 26, ...o }); };
  const dir = mkdtempSync(join(tmpdir(), 'w13pg-')); chmodSync(dir, 0o777);
  const port = String(57000 + Math.floor(Math.random() * 900));
  const data = join(dir, 'data');
  as(join(PGBIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  as(join(PGBIN, 'pg_ctl'), ['-D', data, '-o', `-k ${dir} -c listen_addresses='' -p ${port}`, '-w', '-l', join(dir, 'log'), 'start']);
  t.after(() => { try { as(join(PGBIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); });
  const base = ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'];
  const file = (f, extra = []) => { const c = join(dir, `f${crypto.randomBytes(3).toString('hex')}.sql`); copyFileSync(f, c); chmodSync(c, 0o644); return as('psql', [...base, ...extra, '-f', c]); };
  const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const fill = (sql, params) => sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
  const q = (sql) => as('psql', [...base, '-At', '-F', '|', '-c', sql]).trim().split('\n').filter(Boolean).map((l) => l.split('|'));
  // one simple-protocol query string, as the n8n Postgres node sends it; async so claims truly overlap
  const claimAsync = (p) => new Promise((resolve) => {
    const [c, a] = run('psql', [...base, '-At', '-F', '|', '-c', fill(node.parameters.query, p)]);
    execFile(c, a, { encoding: 'utf8' }, (err, stdout, stderr) => resolve({ err, stdout: stdout.trim(), stderr }));
  });

  file(join(here, 'fixtures', 'pg-stub.sql'));
  const MIG = join(ROOT, 'supabase', 'migrations');
  const all = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  const legacy = all.filter((f) => !/^2026100\d_smc_/.test(f) && !f.startsWith('20260114094619'));
  const deferred = [];
  for (const f of legacy) { try { file(join(MIG, f), ['-1']); } catch { deferred.push(f); } }
  for (const f of deferred) file(join(MIG, f), ['-1']);
  for (const f of all.filter((x) => /^2026100\d_smc_/.test(x))) file(join(MIG, f), ['-1']);

  // ---- synthetic seed: one brand, one broker, two cycles (cap 4 and cap 2), many leads
  const uuid = () => crypto.randomUUID();
  const brand = uuid(), user = uuid(), broker = uuid(), cycA = uuid(), cycB = uuid();
  q(`INSERT INTO public.brands (id, code, name) VALUES ('${brand}', 'SYNTH', 'Synthetic')`);
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-broker@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person) VALUES ('${broker}', '${user}', 'Synthetic FSP', 'Synthetic')`);
  const tier = q('SELECT tier_code FROM public.pricing ORDER BY sort_order LIMIT 1')[0][0];
  for (const [id, no, cap] of [[cycA, 1, 4], [cycB, 2, 2]]) { // only one 'active' cycle per broker; the claim SQL does not look at status
    q(`INSERT INTO public.cycles (id, broker_id, brand_id, tier_code, cycle_no, price_zar, committed_leads, replacement_cap, media_share_zar, starts_at, ends_at, status)
       VALUES ('${id}', '${broker}', '${brand}', '${tier}', ${no}, 1000, 20, ${cap}, 0, now(), now() + interval '30 days', '${no === 1 ? 'active' : 'scheduled'}')`);
  }
  const mkLead = (i) => { const id = uuid(); q(`INSERT INTO public.leads (id, first_name, last_name, phone) VALUES ('${id}', 'Synthetic', 'L${i}', '+27000000${String(i).padStart(3, '0')}')`); return id; };
  const params = (lead, cycle, extra = {}) => [lead, null, null, cycle, broker, brand, extra.reason || 'no_show', extra.code || 'no_show', new Date().toISOString()];

  // ---- (1) 12 concurrent claims on cycle A (cap 4) + 6 on cycle B (cap 2), interleaved
  const leadsA = Array.from({ length: 12 }, (_, i) => mkLead(i));
  const leadsB = Array.from({ length: 6 }, (_, i) => mkLead(100 + i));
  const jobs = [];
  for (let i = 0; i < 12; i++) { jobs.push(claimAsync(params(leadsA[i], cycA))); if (i < 6) jobs.push(claimAsync(params(leadsB[i], cycB))); }
  const res = await Promise.all(jobs);
  for (const r of res) assert.equal(r.err, null, r.stderr);
  const tally = (cy) => Object.fromEntries(q(`SELECT status, count(*) FROM public.replacements WHERE cycle_id = '${cy}' GROUP BY 1`));
  assert.deepEqual(tally(cycA), { due: '4', rejected: '8' }, 'cycle A: exactly cap claims accepted, the rest rejected');
  assert.deepEqual(tally(cycB), { due: '2', rejected: '4' }, 'cycle B: independent lock, exactly its own cap');
  assert.equal(q(`SELECT count(*) FROM public.replacements WHERE cycle_id = '${cycA}' AND status <> 'rejected'`)[0][0], '4', 'never over cap');
  assert.deepEqual(q(`SELECT DISTINCT note FROM public.replacements WHERE status = 'rejected'`).flat(), ['cap_reached']);
  assert.deepEqual(q(`SELECT cap_position FROM public.replacements WHERE cycle_id = '${cycA}' AND status = 'due' ORDER BY 1`).flat(), ['1', '2', '3', '4'], 'positions contiguous: no gap from a lost race');

  // ---- (2) the same lead claimed 5x at once in a fresh cycle: one live row only (one per lead)
  const cycC = uuid();
  q(`INSERT INTO public.cycles (id, broker_id, brand_id, tier_code, cycle_no, price_zar, committed_leads, replacement_cap, media_share_zar, starts_at, ends_at, status)
     VALUES ('${cycC}', '${broker}', '${brand}', '${tier}', 3, 1000, 20, 4, 0, now(), now() + interval '30 days', 'scheduled')`);
  const one = mkLead(200);
  const dup = await Promise.all(Array.from({ length: 5 }, () => claimAsync(params(one, cycC))));
  for (const r of dup) assert.equal(r.err, null, r.stderr);
  assert.equal(q(`SELECT count(*) FROM public.replacements WHERE lead_id = '${one}'`)[0][0], '1', 'one row for one lead');
  assert.equal(dup.filter((r) => r.stdout).length, 1, 'only one caller got a row back; the others no-op');

  // ---- (3) no partial write / no leaked lock: a claim that fails mid-query leaves nothing and releases the cycle lock
  const bad = await claimAsync(params(mkLead(300), cycC, { reason: 'didnt_buy' })); // violates the reason CHECK (2.1.1)
  assert.ok(bad.err && /reason|check/i.test(bad.stderr), 'bad claim errors');
  assert.equal(q(`SELECT count(*) FROM public.replacements WHERE cycle_id = '${cycC}'`)[0][0], '1', 'failed claim wrote nothing');
  assert.equal(q(`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'`)[0][0], '0', 'xact lock released on rollback');
  const after = await claimAsync(params(mkLead(301), cycC));
  assert.equal(after.err, null, after.stderr);
  assert.equal(q(`SELECT count(*) FROM public.replacements WHERE cycle_id = '${cycC}' AND status = 'due'`)[0][0], '2', 'next claim proceeds');
});
