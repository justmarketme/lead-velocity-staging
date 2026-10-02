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
const SCRIPTS = ['vps/provision.sh', 'backup/pg_dump_nightly.sh', 'backup/restore.sh'];
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

test('provision.sh: default is a dry run that lists the 13 W26 steps in order and changes nothing', () => {
  const d = mkdtempSync(join(tmpdir(), 'w26-'));
  try {
    const env = join(d, 'env'); writeFileSync(env, 'VPS_HOST=203.0.113.10\n');
    const out = execFileSync('bash', [join(A, 'vps/provision.sh')], { env: { ...process.env, PROVISION_ENV_FILE: env }, encoding: 'utf8' });
    assert.match(out, /^DRY RUN \(no changes\)/);
    const steps = [...out.matchAll(/step (\d+) ([a-z-]+): PLAN: (.+)/g)];
    assert.deepEqual(steps.map((m) => m[2]), ['preflight', 'harden', 'retire-template', 'ship-code', 'ship-env', 'compose-up',
      'restore-n8n', 'dns', 'tls', 'backups', 'webhooks', 'synthetic-suite', 'ready']);
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
  assert.doesNotMatch(s, /unpause|campaign.*status.*ACTIVE/i, 'provisioning never unpauses anything');
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
