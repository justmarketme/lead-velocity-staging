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
import { execFileSync, execFile } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMAGE = 'postgres:16-alpine';
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/local/pgsql/bin'].find((d) => existsSync(join(d, 'initdb')));

function dockerReady() {
  try { execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 20000 }); return true; } catch { return false; }
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
 * Starts the database. Returns { backend, dir, sql(text, extraArgs) -> stdout, sqlAsync(text, extraArgs) -> Promise<{err, stdout, stderr}>
 * (a separate psql session per call, so statements really overlap), file(path, extraArgs), stop() }.
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
    const sqlAsync = (text, extra = []) => new Promise((resolve) => {
      const f = join(dir, `q${crypto.randomBytes(4).toString('hex')}.sql`); writeFileSync(f, text); chmodSync(f, 0o644);
      const args = [...conn, ...base, ...extra, '-f', f];
      execFile(isRoot ? 'runuser' : 'psql', isRoot ? ['-u', 'postgres', '--', 'psql', ...args] : args, { encoding: 'utf8', maxBuffer: 1 << 26 }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout).trim(), stderr }));
    });
    return { backend, dir, sql, sqlAsync, file: (p, extra = []) => sql(readFileSync(p, 'utf8'), extra),
      stop: () => { try { as(join(PGBIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); } };
  }
  // docker
  const name = `lv-test-pg-${crypto.randomBytes(4).toString('hex')}`;
  execFileSync('docker', ['run', '-d', '--rm', '--name', name, '--network', 'none', '--label', 'lv.test=throwaway',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres', IMAGE], opts);
  const stop = () => { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {} rmSync(dir, { recursive: true, force: true }); };
  // The image runs a temporary socket-only server during init, then restarts; TCP on loopback is up only after that.
  const until = Date.now() + 90000;
  for (;;) {
    try { execFileSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }); break; }
    catch { if (Date.now() > until) { stop(); throw new Error('throwaway Postgres did not become ready'); } execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']); }
  }
  const sql = (text, extra = []) => execFileSync('docker', ['exec', '-i', name, 'psql', '-h', '127.0.0.1', ...base, ...extra, '-f', '-'], { ...opts, input: text });
  const sqlAsync = (text, extra = []) => new Promise((resolve) => {
    const child = execFile('docker', ['exec', '-i', name, 'psql', '-h', '127.0.0.1', ...base, ...extra, '-f', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout).trim(), stderr }));
    child.stdin.end(text);
  });
  return { backend, dir, sql, sqlAsync, file: (p, extra = []) => sql(readFileSync(p, 'utf8'), extra), stop };
}

/** Applies pg-stub.sql + the repo migration chain exactly as S7-08-09 always has (legacy first with one retry pass, then smc_*). */
export function applyRepoMigrations(pg) {
  pg.file(join(ROOT, 'automation', 'tests', 'fixtures', 'pg-stub.sql'));
  const MIG = join(ROOT, 'supabase', 'migrations');
  const all = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  const legacy = all.filter((f) => !/^202610\d\d_smc_/.test(f) && !f.startsWith('20260114094619')); // every smc_NN file (Oct 2026), incl. smc_20
  const deferred = [];
  for (const f of legacy) { try { pg.file(join(MIG, f), ['-1']); } catch { deferred.push(f); } }
  for (const f of deferred) pg.file(join(MIG, f), ['-1']);
  for (const f of all.filter((x) => /^202610\d\d_smc_/.test(x))) pg.file(join(MIG, f), ['-1']);
}

/** psql with $n parameters inlined as literals (test-only; synthetic values) -> rows of string cells. */
export function makeQuery(pg) {
  const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  return (text, params = []) => {
    const q = text.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
    return pg.sql(q, ['-At', '-F', '\x1f']).trim().split('\n').filter(Boolean).map((l) => l.split('\x1f'));
  };
}

