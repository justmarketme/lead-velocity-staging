// I-45m local proof: the W13 "Record request" node (automation/W13.json) is ONE implicit transaction (two statements in one
// query string, queryBatching left at the default 'single'), so pg_advisory_xact_lock serialises requests per broker and
// Calendar Week (clause 7.2: max 3). ux-sprint-1 2026-10-07: was a per-cycle claim cap. Runs the REAL
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
const node = W13.nodes.find((n) => n.name.startsWith('Record request'));

test('W13 record-request node: static shape = one query string, two statements, batching single', () => {
  assert.ok(node, 'claim node exists');
  const opt = node.parameters.options || {};
  assert.ok(opt.queryBatching === undefined || opt.queryBatching === 'single', `queryBatching must be default/single, got ${opt.queryBatching}`);
  const stmts = node.parameters.query.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(stmts.length, 2, 'lock + insert');
  assert.match(stmts[0], /^SELECT pg_advisory_xact_lock\(hashtext\('w13:week:' \|\| \$4::text \|\| ':' \|\| public\.smc_week_start\(\$6::timestamptz\)::text\)\)$/);
  assert.ok(!/\bCOMMIT\b|\bBEGIN\b/i.test(node.parameters.query), 'no hand-rolled txn control');
});

test('W13 request SQL concurrently: max 3 per broker-week, one per booking, no partial write (real SQL, real migrations)', { skip: !PGBIN && 'no Postgres binaries on this machine', timeout: 600000 }, async (t) => {
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

  // ---- synthetic seed: one brand, two brokers, one cycle each, many leads + bookings in one Calendar Week
  const uuid = () => crypto.randomUUID();
  const brand = uuid();
  q(`INSERT INTO public.brands (id, code, name) VALUES ('${brand}', 'SYNTH', 'Synthetic')`);
  const tier = q('SELECT tier_code FROM public.pricing ORDER BY sort_order LIMIT 1')[0][0];
  const mkBroker = (i) => {
    const user = uuid(), broker = uuid(), cyc = uuid();
    q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-broker-${i}@example.test')`);
    q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person) VALUES ('${broker}', '${user}', 'Synthetic FSP', 'Synthetic')`);
    q(`INSERT INTO public.cycles (id, broker_id, brand_id, tier_code, cycle_no, price_zar, committed_leads, replacement_cap, media_share_zar, starts_at, ends_at, status)
       VALUES ('${cyc}', '${broker}', '${brand}', '${tier}', 1, 1000, 20, 9, 0, now(), now() + interval '30 days', 'active')`);
    return { broker, cyc };
  };
  let n = 0;
  const mkLead = () => { const id = uuid(); n++; q(`INSERT INTO public.leads (id, first_name, last_name, phone) VALUES ('${id}', 'Synthetic', 'L${n}', '+27000000${String(n).padStart(3, '0')}')`); return id; };
  const WEEK = '2026-10-13T09:00:00+02:00'; // a Tuesday
  const params = (b, lead, i, extra = {}) => { const start = new Date(Date.parse(extra.start || WEEK) + i * 3600_000).toISOString(); return [lead, extra.booking || uuid(), b.cyc, b.broker, brand, start, 'whatsapp-media:m' + i, new Date(Date.parse(start) + 12 * 60_000).toISOString()]; };

  // ---- (1) 8 concurrent requests from broker A (cycle cap 9 in the data) + 5 from broker B, same week: 3 each, never more
  const A = mkBroker(1), B = mkBroker(2);
  const jobs = [];
  for (let i = 0; i < 8; i++) { jobs.push(claimAsync(params(A, mkLead(), i))); if (i < 5) jobs.push(claimAsync(params(B, mkLead(), i))); }
  const res = await Promise.all(jobs);
  for (const r of res) assert.equal(r.err, null, r.stderr);
  const count = (b) => q(`SELECT count(*) FROM public.replacements WHERE broker_id = '${b.broker}'`)[0][0];
  assert.equal(count(A), '3', 'clause 7.2: max 3 per Calendar Week, whatever replacement_cap says');
  assert.equal(count(B), '3', 'per broker: independent lock');
  assert.deepEqual(q(`SELECT DISTINCT status, reason_code FROM public.replacements`), [['due', 'schedule3_proof']]);

  // ---- (2) next Calendar Week starts fresh; the same booking twice at once gives one row
  const bk = uuid();
  const lead = mkLead();
  const dup = await Promise.all(Array.from({ length: 4 }, () => claimAsync(params(A, lead, 0, { start: '2026-10-19T09:00:00+02:00', booking: bk }))));
  for (const r of dup) assert.equal(r.err, null, r.stderr);
  assert.equal(q(`SELECT count(*) FROM public.replacements WHERE booking_id = '${bk}'`)[0][0], '1', 'one request per booking');
  assert.equal(count(A), '4', 'Monday: a new week');

  // ---- (3) no partial write / no leaked lock
  const bad = await claimAsync(params(A, 'not-a-uuid', 1, { start: '2026-10-19T09:00:00+02:00' }));
  assert.ok(bad.err, 'bad request errors');
  assert.equal(count(A), '4', 'failed request wrote nothing');
  assert.equal(q(`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'`)[0][0], '0', 'xact lock released on rollback');
});
