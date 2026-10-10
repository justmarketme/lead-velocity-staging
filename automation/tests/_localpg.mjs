// Throwaway local Postgres for tests that need the REAL repo migration chain (not a test file: leading underscore).
// Two backends, same surface; never the live project, never staging:
//   native  - Postgres 16/17 binaries on this machine (Linux CI / sandbox): initdb into a temp dir, unix socket only
//             (listen_addresses='', no network).
//   docker  - Windows/macOS laptops with Docker: a disposable `postgres:16-alpine` container (the image local n8n already
//             uses, so no pull) started with `--network none` and removed on stop. SQL goes in over `docker exec -i` stdin.
// Opt out with LV_TEST_PG=off; force a backend with LV_TEST_PG=native|docker.
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Production is Postgres 17 (Supabase). Prefer a local postgres:17-alpine image, fall back to 16. Override with SMC_PG_IMAGE.
const IMAGE_CANDIDATES = process.env.SMC_PG_IMAGE ? [process.env.SMC_PG_IMAGE] : ['postgres:17-alpine', 'postgres:16-alpine'];
let IMAGE = IMAGE_CANDIDATES[0];
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/local/pgsql/bin'].find((d) => existsSync(join(d, 'initdb')));

function dockerReady() {
  for (const img of IMAGE_CANDIDATES) {
    try { execFileSync('docker', ['image', 'inspect', img], { stdio: 'ignore', timeout: 20000 }); IMAGE = img; return true; } catch { /* try next */ }
  }
  return false;
}

/** Which backend this machine can run, or null (the caller skips). Decided synchronously at module load. */
export function localPgBackend() {
  const want = String(process.env.LV_TEST_PG || '').toLowerCase();
  if (want === 'off') return null;
  if (want === 'native') return PGBIN ? 'native' : null;
  if (want === 'docker') return dockerReady() ? 'docker' : null;
  return PGBIN ? 'native' : dockerReady() ? 'docker' : null;
}

/**
 * Starts the database. Returns { backend, dir, sql(text, extraArgs) -> stdout, file(path, extraArgs), stop() }.
 * `dir` is a host temp dir the caller may use for scratch files (removed by stop()).
 */
export function startLocalPg(backend = localPgBackend()) {
  if (!backend) throw new Error('no local Postgres backend');
  const dir = mkdtempSync(join(tmpdir(), 'lvpg-'));
  const base = ['-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'];
  const opts = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 26 };
  if (backend === 'native') {
    chmodSync(dir, 0o777);
    const isRoot = process.getuid && process.getuid() === 0;
    const as = (cmd, args, o = {}) => execFileSync(isRoot ? 'runuser' : cmd, isRoot ? ['-u', 'postgres', '--', cmd, ...args] : args, { ...opts, ...o });
    const port = String(56000 + Math.floor(Math.random() * 900));
    const data = join(dir, 'data');
    as(join(PGBIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
    as(join(PGBIN, 'pg_ctl'), ['-D', data, '-o', `-k ${dir} -c listen_addresses='' -p ${port}`, '-w', '-l', join(dir, 'log'), 'start']);
    const conn = ['-h', dir, '-p', port];
    const sql = (text, extra = []) => { const f = join(dir, `q${crypto.randomBytes(4).toString('hex')}.sql`); writeFileSync(f, text); chmodSync(f, 0o644); return as('psql', [...conn, ...base, ...extra, '-f', f]); };
    return { backend, dir, sql, file: (p, extra = []) => sql(readFileSync(p, 'utf8'), extra),
      stop: () => { try { as(join(PGBIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); } };
  }
  // docker
  const name = `lv-test-pg-${crypto.randomBytes(4).toString('hex')}`;
  execFileSync('docker', ['run', '-d', '--rm', '--name', name, '--network', 'none', '--label', 'lv.test=throwaway',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres', IMAGE], opts);
  const stop = () => { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {} rmSync(dir, { recursive: true, force: true }); };
  // The image runs a temporary socket-only server during init, then restarts; TCP on loopback is up only after that.
  // 90 s was not enough when the whole suite ran at once (three containers starting beside the other tests); SMC_PG_READY_MS overrides.
  const until = Date.now() + Number(process.env.SMC_PG_READY_MS || 240000);
  for (;;) {
    try { execFileSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }); break; }
    catch { if (Date.now() > until) { stop(); throw new Error('throwaway Postgres did not become ready'); } execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']); }
  }
  const sql = (text, extra = []) => execFileSync('docker', ['exec', '-i', name, 'psql', '-h', '127.0.0.1', ...base, ...extra, '-f', '-'], { ...opts, input: text });
  return { backend, dir, sql, file: (p, extra = []) => sql(readFileSync(p, 'utf8'), extra), stop };
}

/**
 * Applies pg-stub.sql + the repo migration chain exactly as S7-08-09 always has (legacy first with one retry pass, then smc_*).
 * SMC_BASE=real: instead of replaying the repo's legacy migrations (which do NOT reproduce production: 26 live migrations are
 * missing from the repo), start from the captured LIVE public schema (supabase/drift/real-public-schema-*.sql) + synthetic seed.
 */
export function applyRepoMigrations(pg) {
  pg.file(join(ROOT, 'automation', 'tests', 'fixtures', 'pg-stub.sql'));
  if (String(process.env.SMC_BASE || '').toLowerCase() === 'real') {
    const D = join(ROOT, 'supabase', 'drift');
    pg.file(join(D, 'real-public-prelude.sql'));
    pg.file(join(D, readdirSync(D).find((f) => /^real-public-schema-.*\.sql$/.test(f))));
    pg.file(join(D, 'real-seed-synthetic.sql'));
    pg.sql('ALTER DATABASE postgres SET search_path = "$user", public, extensions');
    const MIGR = join(ROOT, 'supabase', 'migrations');
    for (const f of readdirSync(MIGR).filter((x) => /^\d{14}_smc_.*\.sql$/.test(x)).sort()) pg.file(join(MIGR, f), ['-1']);
    return;
  }
  const MIG = join(ROOT, 'supabase', 'migrations');
  const all = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  const legacy = all.filter((f) => !/^\d{14}_smc_/.test(f) && !f.startsWith('20260114094619'));
  const deferred = [];
  for (const f of legacy) { try { pg.file(join(MIG, f), ['-1']); } catch { deferred.push(f); } }
  for (const f of deferred) pg.file(join(MIG, f), ['-1']);
  for (const f of all.filter((x) => /^\d{14}_smc_/.test(x))) pg.file(join(MIG, f), ['-1']);
}

/** psql with $n parameters inlined as literals (test-only; synthetic values) -> rows of string cells. */
export function makeQuery(pg) {
  const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  return (text, params = []) => {
    const q = text.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
    return pg.sql(q, ['-At', '-F', '\x1f']).trim().split('\n').filter(Boolean).map((l) => l.split('\x1f'));
  };
}

