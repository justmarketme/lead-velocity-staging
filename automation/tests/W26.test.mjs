// W26 Go-live runner: offline acceptance checks for the provisioning + backup scripts (4C.2).
// Nothing is provisioned: provision.sh runs in its default DRY-RUN mode against a dummy env file.
//   node --test automation/tests/W26.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = ['vps/provision.sh', 'vps/apply-analytics.sh', 'backup/pg_dump_nightly.sh', 'backup/restore.sh'];
const SECRETISH = /sk-ant-|sk_(live|test)_[A-Za-z0-9]{10}|EAA[A-Za-z0-9]{40}|AC[0-9a-f]{32}|BEGIN [A-Z ]*PRIVATE KEY|sb_secret_|eyJhbGci|AGE-SECRET-KEY-1/;
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;

test('scripts parse (bash -n) and carry no secrets', () => {
  for (const s of SCRIPTS) {
    execFileSync('bash', ['-n', join(A, s)]);
    assert.doesNotMatch(readFileSync(join(A, s), 'utf8'), SECRETISH, s);
  }
  for (const f of ['vps/traefik/docker-compose.traefik.yml', 'backup/cron.lv-backup', 'vps/W26.md', 'vps/UPTIME.md', 'dns/DNS.md']) {
    assert.doesNotMatch(readFileSync(join(A, f), 'utf8'), SECRETISH, f);
  }
});

test('provision.sh: default is a dry run that lists the 14 W26 steps in order and changes nothing', () => {
  const d = mkdtempSync(join(tmpdir(), 'w26-'));
  try {
    const env = join(d, 'env'); writeFileSync(env, 'VPS_HOST=203.0.113.10\n');
    const out = execFileSync('bash', [join(A, 'vps/provision.sh')], { env: { ...process.env, PROVISION_ENV_FILE: env }, encoding: 'utf8' });
    assert.match(out, /^DRY RUN \(no changes\)/);
    const steps = [...out.matchAll(/step (\d+) ([a-z0-9-]+): PLAN: (.+)/g)];
    assert.deepEqual(steps.map((m) => m[2]), ['preflight', 'harden', 'retire-template', 'ship-code', 'ship-env', 'compose-up',
      'restore-n8n', 'dns', 'tls', 'backups', 'webhooks', 'analytics', 'synthetic-suite', 'ready']);
    assert.ok(steps.every((m) => m[3].trim().length > 10), 'every step has a description');
    assert.doesNotMatch(out, /203\.0\.113\.10.*->/, 'dry run performs no DNS actions');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('provision.sh: safety properties', () => {
  const s = readFileSync(join(A, 'vps/provision.sh'), 'utf8');
  assert.match(s, /APPLY=""/, 'dry run unless --apply');
  assert.match(s, /trap 'say "HALT/, 'halts on the first failing step and names it');
  assert.match(s, /SUPABASE_SERVICE_ROLE_KEY/, 'service-role key is stripped before shipping .env');
  assert.match(s, /umask 077/);
  assert.match(s, /07\.done/, 'n8n restore cannot silently overwrite a live VPS');
  assert.doesNotMatch(s, /\/(campaigns|adsets|ads)\b|status=ACTIVE|daily_budget|routing.*(on|true)/i, 'provisioning never touches budgets, campaign status or routing');
  assert.match(s, /git -C "\$REPO" archive/, 'no git credentials on the VPS');
  assert.doesNotMatch(s, /kubectl|helm|swarm/i, 'single server, no orchestrator');
});

test('Traefik overlay: TLS on every router, editor allow-listed, api host limited to webhooks + healthz', () => {
  const y = readFileSync(join(A, 'vps/traefik/docker-compose.traefik.yml'), 'utf8');
  for (const r of ['n8n-ui', 'n8n-api', 'n8n-link']) {
    assert.match(y, new RegExp(`routers\\.${r}\\.tls\\.certresolver=le`));
    assert.match(y, new RegExp(`routers\\.${r}\\.entrypoints=websecure`));
  }
  assert.match(y, /ipallowlist\.sourcerange=\$\{N8N_UI_ALLOW_IPS:-127\.0\.0\.1\/32\}/);
  assert.match(y, /n8n-api\.rule=Host\(`\$\{API_HOST\}`\) && \(PathPrefix\(`\/webhook\/`\) \|\| PathPrefix\(`\/healthz`\)\)/);
  assert.match(y, /exposedbydefault=false/);
  assert.match(y, /redirections\.entrypoint\.scheme=https/);
  assert.match(y, /EXECUTIONS_DATA_SAVE_ON_SUCCESS: none/);
});

test('backup: encryption round trip (selftest) and fail-closed without config', { skip: !has('age-keygen') && 'age not installed' }, () => {
  const out = execFileSync('bash', [join(A, 'backup/pg_dump_nightly.sh'), '--selftest'], { encoding: 'utf8' });
  assert.match(out, /round trip OK/);
  const r = spawnSync('bash', [join(A, 'backup/pg_dump_nightly.sh')], { env: { PATH: process.env.PATH, BACKUP_ENV_FILE: '/nonexistent' }, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /FATAL: BACKUP_DB_URL not set/);
  const c = readFileSync(join(A, 'backup/cron.lv-backup'), 'utf8');
  assert.match(c, /^30 0 \* \* \* root .*pg_dump_nightly\.sh/m);
  assert.match(c, /--consent/);
});

test('Code-node runtime (I-35b/I-36e): repo mounted read-only at /repo, same builtins in local and VPS compose, no external modules', () => {
  const base = readFileSync(join(A, 'docker-compose.yml'), 'utf8');
  const vps = readFileSync(join(A, 'vps/traefik/docker-compose.traefik.yml'), 'utf8');
  assert.match(base, /^\s+- \.\.:\/repo:ro$/m, 'repo root mounted read-only');
  for (const y of [base, vps]) {
    assert.match(y, /^\s+REPO_DIR: \/repo$/m);
    assert.match(y, /^\s+NODE_FUNCTION_ALLOW_BUILTIN: crypto,dns,url,fs,path$/m);
    assert.match(y, /^\s+NODE_FUNCTION_ALLOW_EXTERNAL: ""$/m);
  }
  const s = readFileSync(join(A, 'vps/provision.sh'), 'utf8');
  assert.match(s, /SHIP_DIRS=\(automation conversation knowledge/, 'step 4 ships what the mount needs');
  assert.match(s, /ANALYTICS_DB_URL\|/, 'step 5 strips the DDL URL from the VPS .env');
});

test('CORS (I-34c): browser endpoints on API_HOST allow X-Lead-Token + Authorization from the three origins only', () => {
  const y = readFileSync(join(A, 'vps/traefik/docker-compose.traefik.yml'), 'utf8');
  const rule = y.match(/routers\.n8n-cors\.rule=(.+)/)[1];
  for (const p of ['lead', 'slots', 'book', 'billing-autorenew']) assert.ok(rule.includes(`Path(\`/webhook/${p}\`)`), p);
  assert.match(rule, /^Host\(`\$\{API_HOST\}`\)/);
  assert.match(y, /routers\.n8n-cors\.tls\.certresolver=le/);
  assert.match(y, /routers\.n8n-cors\.middlewares=api-cors,api-ratelimit,sec-headers/);
  const origins = y.match(/accessControlAllowOriginList=\$\{PUBLIC_ALLOWED_ORIGINS:-([^}]+)\}/)[1].split(',');
  assert.deepEqual(origins, ['https://sortmycover.co.za', 'https://sortmycover.leadvelocity.co.za', 'https://app.leadvelocity.co.za']);
  assert.match(y, /accessControlAllowHeaders=Content-Type,X-Lead-Token,Authorization/);
  assert.match(y, /accessControlAllowCredentials=false/);
  assert.doesNotMatch(y, /accessControlAllowOriginList=\*/);
});

test('apply-analytics.sh (I-35k): fixed order, one transaction, dry run rolls back, halts before migrations', () => {
  const S = join(A, 'vps/apply-analytics.sh');
  const order = ['params.sql', 'watchlist.sql', 'kill-scale.sql', 'W14-broker.sql', 'W14-lv.sql'];
  const listed = [...execFileSync('bash', [S, '--print'], { encoding: 'utf8' }).matchAll(/analytics\/(\S+)/g)].map((m) => m[1]);
  assert.deepEqual(listed, order);
  const d = mkdtempSync(join(tmpdir(), 'w26a-'));
  try { // fake psql: answers the precondition query with $READY, records the streamed script
    const bin = join(d, 'bin'); execFileSync('mkdir', [bin]);
    writeFileSync(join(bin, 'psql'), `#!/usr/bin/env bash\nfor a in "$@"; do [[ "$a" == -c ]] && { echo "$READY"; exit 0; }; done\ncat > "${d}/script.sql"\n`, { mode: 0o755 });
    const env = join(d, 'env'); writeFileSync(env, 'ANALYTICS_DB_URL=postgres://x@127.0.0.1:1/none\n');
    const run = (args, READY) => spawnSync('bash', [S, ...args], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PROVISION_ENV_FILE: env, READY }, encoding: 'utf8' });
    let r = run([], '0');
    assert.equal(r.status, 3); assert.match(r.stdout, /HALT: migrations not applied/);
    r = run([], '1'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /dry-run OK/);
    let sql = readFileSync(join(d, 'script.sql'), 'utf8');
    assert.deepEqual([...sql.matchAll(/^\\i '.*\/analytics\/(\S+)'$/gm)].map((m) => m[1]), order);
    assert.match(sql, /^\\set ON_ERROR_STOP on\nBEGIN;/); assert.match(sql, /ROLLBACK;\n$/); assert.doesNotMatch(sql, /COMMIT/);
    r = run(['--apply'], '1'); assert.equal(r.status, 0, r.stderr);
    sql = readFileSync(join(d, 'script.sql'), 'utf8');
    assert.match(sql, /COMMIT;\n$/); assert.doesNotMatch(sql, /ROLLBACK/);
    assert.doesNotMatch(r.stdout + r.stderr, /postgres:\/\//, 'never prints the URL');
  } finally { rmSync(d, { recursive: true, force: true }); }
  for (const f of order) assert.doesNotMatch(readFileSync(join(A, '..', 'analytics', f), 'utf8'), /^\s*(begin|commit)\s*;/im, `${f} has no own transaction control`);
  const p = readFileSync(join(A, 'vps/provision.sh'), 'utf8');
  assert.match(p, /--analytics-dry-run\) ANALYTICS_MODE=--dry-run/);
});
