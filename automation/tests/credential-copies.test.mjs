// I-47h: automation/vps/ROTATION.md carries the machine-derived credential-copies table; it must equal the script output
// (same pattern as credential-inventory.test.mjs for CREDENTIALS.md). Run: node --test automation/tests/credential-copies.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { requiredCredentials } from '../vps/check-credentials.mjs';
import { copies, SECRETS } from '../vps/credential-copies.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = readFileSync(join(A, 'vps/ROTATION.md'), 'utf8');
const run = (...args) => spawnSync(process.execPath, [join(A, 'vps/credential-copies.mjs'), ...args], { encoding: 'utf8' });

test('ROTATION.md table equals the credential-copies.mjs output', () => {
  const m = DOC.match(/<!-- credential-copies:begin -->\n([\s\S]*?)\n<!-- credential-copies:end -->/);
  assert.ok(m, 'markers present');
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(m[1].trim(), r.stdout.trim());
});

test('every workflow credential is mapped to exactly one secret, and no mapping is stale', () => {
  const r = run('--check');
  assert.equal(r.status, 0, r.stderr);
  const c = copies(A);
  assert.deepEqual(c.unclassified, []);
  assert.deepEqual(c.stale, []);
  assert.equal(c.rows.length, requiredCredentials(A).size);
});

test('the known multi-copy secrets keep their counts (Meta 6 copies / 5 names, Anthropic 3, Twilio 2)', () => {
  const by = (s) => copies(A).rows.filter((x) => x.secret === s);
  assert.equal(by('Meta system-user token').length, 6);
  assert.equal(new Set(by('Meta system-user token').map((x) => x.name)).size, 5);
  assert.equal(by('Anthropic API key').length, 3);
  assert.equal(by('Twilio API key').length, 2);
  assert.ok(by('Microsoft Entra app (howzit@ and broker connect)').length >= 5);
});

test('ROTATION.md covers the order, the leak rule and the no-rename rule; carries no values', () => {
  for (const re of [/Issue the new secret/, /Update `\.env`/, /Update every n8n credential copy/, /check-credentials\.mjs/, /Revoke the old secret/, /Leak = halt \+ rotate/, /never renames or merges/, /one credential per secret/])
    assert.match(DOC, re);
  assert.doesNotMatch(DOC, /sk-ant-|sk_(live|test)_[A-Za-z0-9]{10}|EAA[A-Za-z0-9]{40}|AC[0-9a-f]{32}|BEGIN [A-Z ]*PRIVATE KEY|sb_secret_|eyJhbGci|AGE-SECRET-KEY-1/);
});

test('every .env variable named in the table exists in .env.example (or is a "-" entry)', () => {
  const ex = readFileSync(join(A, '.env.example'), 'utf8');
  for (const [, env] of SECRETS) for (const v of env.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) || []) {
    if (['GATE', 'NCC'].includes(v)) continue;
    assert.match(ex, new RegExp(`^${v}=`, 'm'), v);
  }
});

test('check-credentials.mjs warns (stderr, exit unchanged) when TRANSCRIBE_URL / SUPABASE_S3_* are empty (I-47i)', async () => {
  const { envWarnings } = await import('../vps/check-credentials.mjs');
  assert.equal(envWarnings({}).length, 2);
  assert.deepEqual(envWarnings({ TRANSCRIBE_URL: 'https://x', SUPABASE_S3_ENDPOINT: 'a', SUPABASE_S3_REGION: 'b', SUPABASE_S3_ACCESS_KEY: 'c', SUPABASE_S3_SECRET_KEY: 'd' }), []);
  const all = [...requiredCredentials(A).keys()].map((k) => { const [t, n] = k.split('\t'); return `${n}\t${t}`; }).join('\n');
  const r = spawnSync(process.execPath, [join(A, 'vps/check-credentials.mjs')], { input: all, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARNING: TRANSCRIBE_URL is empty/);
  assert.match(r.stderr, /SUPABASE_S3_ENDPOINT/);
});
