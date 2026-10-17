// I-22 feeders: ops.infra_day (automation/backup/ops_feeders.sql) and ops.page_day / ops.page_audits
// (automation/backup/ops_feeders.mjs). Offline: node --test automation/tests/ops-feeders.test.mjs
// Row shape is checked against the physical DDL in migration 06; when Postgres 16/17 binaries exist the SQL runs on a
// throwaway cluster (same pattern as W22.test.mjs). Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as F from '../backup/ops_feeders.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const MIG06 = readFileSync(join(ROOT, 'supabase/migrations/20261002060000_smc_06_pass2.sql'), 'utf8');
const INFRA_SQL = readFileSync(join(here, '..', 'backup', 'ops_feeders.sql'), 'utf8');
const ddl = (t) => { const m = MIG06.match(new RegExp(`CREATE TABLE IF NOT EXISTS ops\\.${t} \\(([\\s\\S]*?)\\n\\);`)); assert.ok(m, `DDL for ops.${t}`); return m[0]; };
const cols = (t) => [...ddl(t).matchAll(/^\s{2}([a-z_0-9]+)\s+[a-z]/gm)].map((m) => m[1]).filter((c) => !['primary', 'unique'].includes(c));

const LHR = (over = {}) => ({
  lighthouseVersion: '13.0.0', fetchTime: '2026-10-01T22:30:00.000Z', // 00:30 SAST on 2 Oct
  requestedUrl: 'https://go.leadvelocity.co.za/employer-gap/', finalDisplayedUrl: 'https://go.leadvelocity.co.za/employer-gap/',
  configSettings: { formFactor: 'mobile' },
  categories: { performance: { score: 0.93 }, accessibility: { score: 0.97, auditRefs: [{ id: 'color-contrast', weight: 7 }, { id: 'image-alt', weight: 10 }, { id: 'bypass', weight: 7 }] },
    'best-practices': { score: 1 }, seo: { score: 1 } },
  audits: { 'largest-contentful-paint': { numericValue: 2140.6 }, 'cumulative-layout-shift': { numericValue: 0.02 }, 'total-blocking-time': { numericValue: 120 },
    'color-contrast': { score: 0, scoreDisplayMode: 'binary', details: { items: [{}, {}] } }, 'image-alt': { score: 1, scoreDisplayMode: 'binary' },
    bypass: { score: null, scoreDisplayMode: 'notApplicable' } },
  ...over,
});

test('row shapes use exactly the physical column names from migration 06', () => {
  const pd = F.pageDayRow(LHR());
  const pa = F.pageAuditRow(LHR(), { buildSha: 'abc1234', html: '<p>x</p>' });
  for (const [t, row, list] of [['page_day', pd, F.PAGE_DAY_COLS], ['page_audits', pa, F.PAGE_AUDIT_COLS]]) {
    const phys = cols(t);
    assert.deepEqual(Object.keys(row).sort(), [...list].sort(), `${t}: row keys = declared columns`);
    for (const k of list) assert.ok(phys.includes(k), `${t}.${k} exists in the DDL`);
  }
  for (const k of F.INFRA_DAY_COLS) assert.ok(cols('infra_day').includes(k), `infra_day.${k} exists in the DDL`);
  assert.match(INFRA_SQL, new RegExp(`INSERT INTO ops\\.infra_day \\(${F.INFRA_DAY_COLS.join(', ')}\\)`), 'SQL writes the declared columns');
});

test('page_day: SAST day, path, lab LCP in seconds, visits never invented', () => {
  const r = F.pageDayRow(LHR());
  assert.equal(r.day, '2026-10-02', '22:30 UTC = 00:30 SAST next day');
  assert.equal(r.page_path, '/employer-gap/');
  assert.equal(r.lcp_p75_s, 2.141);
  assert.equal(r.visits, 0); assert.equal(r.quiz_starts, null); assert.equal(r.quiz_steps, null);
  assert.equal(r.source, 'lighthouse_ci');
  const sql = F.pageDaySql(r, 'SMC');
  assert.match(sql, /\(SELECT id FROM public\.brands WHERE code = 'SMC'\)/);
  assert.doesNotMatch(sql.split('DO UPDATE')[1], /visits|quiz_/, 'conflict update never overwrites visits/quiz data');
});

test('page_audits: scores, axe-shaped failures, public text only, SQL-safe', () => {
  const html = `<html><head><style>.a{}</style><script>var secret=1</script></head><body><h1>Cover, sorted</h1><!-- note --><p>It's R0 &amp; quick</p></body></html>`;
  const r = F.pageAuditRow(LHR(), { buildSha: 'abc1234', html });
  assert.equal(r.url, 'https://go.leadvelocity.co.za/employer-gap/');
  assert.equal(r.audited_at, '2026-10-01T22:30:00.000Z');
  assert.deepEqual([r.lighthouse.performance, r.lighthouse.accessibility, r.lighthouse.lcp_ms], [93, 97, 2140.6]);
  assert.deepEqual(r.axe.violations, [{ id: 'color-contrast', impact: 'serious', nodes: 2 }], 'only failing, applicable audits');
  assert.equal(r.page_text, "Cover, sorted It's R0 & quick");
  const sql = F.pageAuditSql(r);
  assert.match(sql, /It''s R0/, 'quotes doubled');
  assert.match(sql, /WHERE NOT EXISTS/, 're-runs do not duplicate');
  assert.equal(F.lit("a'); DROP TABLE x; --"), "'a''); DROP TABLE x; --'");
  assert.equal(F.lit({ q: "it's" }), `'{"q":"it''s"}'::jsonb`);
});

test('ops_feeders.sql: psql variables, n8n_app-safe (no DELETE), idempotent upsert', () => {
  assert.match(INFRA_SQL, /:'day'/); assert.match(INFRA_SQL, /:'monitors'/);
  assert.doesNotMatch(INFRA_SQL.replace(/--.*$/gm, ''), /\bDELETE\b|\bTRUNCATE\b/i);
  assert.match(INFRA_SQL, /ON CONFLICT \(day, monitor\) DO UPDATE/);
  const sh = readFileSync(join(here, '..', 'backup', 'pg_dump_nightly.sh'), 'utf8');
  assert.match(sh, /feeders \|\| log "WARN: ops feeders failed/, 'a feeder failure never fails the backup');
  assert.match(sh, /OPS_FEEDER_DB_URL/);
});

const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/local/pgsql/bin'].find((d) => existsSync(join(d, 'initdb')));
test('SQL on real Postgres: infra_day downtime maths + guards; page rows insert and re-run cleanly', { skip: !PGBIN && 'no Postgres binaries on this machine' }, (t) => {
  const isRoot = process.getuid && process.getuid() === 0;
  const as = (cmd, args) => execFileSync(isRoot ? 'runuser' : cmd, isRoot ? ['-u', 'postgres', '--', cmd, ...args] : args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const dir = mkdtempSync(join(tmpdir(), 'feedpg-')); chmodSync(dir, 0o777);
  const port = String(56000 + Math.floor(Math.random() * 900)); const data = join(dir, 'data');
  as(join(PGBIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  as(join(PGBIN, 'pg_ctl'), ['-D', data, '-o', `-k ${dir} -c listen_addresses='' -p ${port}`, '-w', '-l', join(dir, 'log'), 'start']);
  t.after(() => { try { as(join(PGBIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); });
  let k = 0;
  const psql = (sql, vars = {}) => {
    const f = join(dir, `q${k++}.sql`); writeFileSync(f, sql); chmodSync(f, 0o644);
    const v = Object.entries(vars).flatMap(([a, b]) => ['-v', `${a}=${b}`]);
    return as('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', ...v, '-f', f]).trim();
  };
  psql(`CREATE SCHEMA ops; CREATE TABLE public.brands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE);
        INSERT INTO public.brands (code) VALUES ('SMC');
        CREATE TABLE ops.notifications (id bigserial, signal_key text, scope text, created_at timestamptz, last_seen_at timestamptz, payload jsonb NOT NULL DEFAULT '{}');
        ${MIG06.match(/CREATE TABLE IF NOT EXISTS ops\.backup_runs \([\s\S]*?\n\);/)[0]}
        ${ddl('infra_day')} ${ddl('page_day')} ${ddl('page_audits')}`);
  const day = '2026-09-30';
  const run = () => psql(INFRA_SQL, { day, monitors: 'api' });
  assert.equal(run(), '', 'no pg_dump on record yet = pre-VPS: no fake 100% rows');
  psql(`INSERT INTO ops.backup_runs (kind, started_at, ok) VALUES ('pg_dump', '2026-09-29T00:30:00Z', true);
        INSERT INTO ops.notifications (signal_key, scope, created_at, payload) VALUES
          ('uptime_down', 'monitor:api.leadvelocity.co.za', '2026-09-30T08:05:00Z', '{"since":"2026-09-30T08:00:00Z"}'),
          ('uptime_recovered', 'monitor:api.leadvelocity.co.za', '2026-09-30T08:30:00Z', '{}'),
          ('uptime_down', 'monitor:go.leadvelocity.co.za', '2026-09-30T21:50:00Z', '{"since":"not a date"}'),
          ('uptime_recovered', 'monitor:go.leadvelocity.co.za', '2026-09-30T22:20:00Z', '{}');`);
  // api: 08:00-08:30 UTC = 30 min. go: 21:50-22:00 UTC is 23:50-24:00 SAST (10 min in day), the rest falls on 1 Oct.
  const rows = run().split('\n').map((l) => l.split('|')).sort();
  assert.deepEqual(rows, [['2026-09-30', 'api', '97.917', '30'], ['2026-09-30', 'go', '99.306', '10']]);
  assert.equal(run().split('\n').length, 2, 're-run upserts, no duplicates');
  assert.equal(psql('SELECT count(*) FROM ops.infra_day'), '2');
  assert.equal(psql(INFRA_SQL, { day: '2099-01-01', monitors: 'api' }), '', 'incomplete (future) day is skipped');
  // page feeders through the CLI path (pagesSql), including the dist text lookup
  const rep = join(dir, 'reports'); const dist = join(dir, 'dist', 'employer-gap'); mkdirSync(rep); mkdirSync(dist, { recursive: true });
  writeFileSync(join(rep, 'lighthouse-employer_gap.report.json'), JSON.stringify(LHR()));
  writeFileSync(join(dist, 'index.html'), "<body><h1>Cover, sorted</h1><p>It's quick</p></body>");
  const { files, sql } = F.pagesSql(rep, { distDir: join(dir, 'dist'), brandCode: 'SMC', buildSha: 'abc1234' });
  assert.equal(files.length, 1);
  psql(sql); psql(sql);
  assert.equal(psql('SELECT count(*), max(lcp_p75_s)::text, max(visits) FROM ops.page_day'), '1|2.141|0');
  assert.equal(psql("SELECT count(*), max(page_text), max(lighthouse->>'performance'), (SELECT b.code FROM public.brands b JOIN ops.page_day p ON p.brand_id = b.id LIMIT 1) FROM ops.page_audits"), "1|Cover, sorted It's quick|93|SMC");
  psql("UPDATE ops.page_day SET visits = 57, source = 'cloudflare_web_analytics'"); psql(sql); psql(sql);
  assert.equal(psql('SELECT visits, source FROM ops.page_day'), '57|cloudflare_web_analytics+lighthouse_ci', 'real visit counts survive a Lighthouse re-run');
});
