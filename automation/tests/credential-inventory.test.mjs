// I-44f: automation/local/CREDENTIALS.md lists every credential the committed workflows reference (name + type),
// so one missing credential cannot silently block a whole workflow at activation. This test keeps the list from
// drifting: tables A and B must equal the scan of automation/W*.json, the same scan provision.sh step 7 runs
// (automation/vps/check-credentials.mjs) against n8n's credentials_entity before n8n starts.
// Run: node --test automation/tests/credentials.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { requiredCredentials, parsePresent, missingCredentials } from '../vps/check-credentials.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = readFileSync(join(A, 'local/CREDENTIALS.md'), 'utf8');
const REQ = requiredCredentials(A);
const section = (h) => { const i = DOC.indexOf(h); assert.ok(i >= 0, `section ${h}`); const j = DOC.indexOf('\n## ', i + 1); return DOC.slice(i, j < 0 ? undefined : j); };
const rows = (text) => text.split('\n').filter((l) => /^\| /.test(l) && !/^\| (Workflow|Credential name) \|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const unq = (c) => c.replace(/^`|`$/g, '');

test('table A (per workflow) equals the credential references in automation/W*.json', () => {
  const doc = new Set(rows(section('## A.')).map(([w, n, t]) => `${w}\t${unq(t)}\t${n}`));
  const scan = new Set();
  for (const [k, ws] of REQ) for (const w of ws) { const [t, n] = k.split('\t'); scan.add(`${w}\t${t}\t${n}`); }
  assert.deepEqual([...doc].filter((x) => !scan.has(x)), [], 'rows in CREDENTIALS.md that no workflow references');
  assert.deepEqual([...scan].filter((x) => !doc.has(x)), [], 'references missing from CREDENTIALS.md table A');
});

test('table B (distinct credentials) equals the scan, with the exact "used by" list and a backing for each', () => {
  const b = rows(section('## B.'));
  const doc = new Map(b.map(([n, t, used]) => [`${unq(t)}\t${n}`, used.split(',').map((s) => s.trim()).filter(Boolean)]));
  assert.equal(doc.size, b.length, 'no duplicate rows in table B');
  assert.deepEqual([...doc.keys()].sort(), [...REQ.keys()].sort(), 'distinct (type, name) set');
  for (const [k, ws] of REQ) assert.deepEqual(doc.get(k), ws, `used by: ${k.replace('\t', ' ')}`);
  for (const r of b) assert.ok(r[4] && r[4].length > 3, `backing documented: ${r[0]}`);
  assert.match(DOC, new RegExp(`${REQ.size} credentials across ${readdirSync(A).filter((f) => /^(W\d\d|SUB-[a-z0-9-]+)\.json$/.test(f)).length} workflow files`), 'summary count in the text');
});

test('CREDENTIALS.md carries names only, never values', () => {
  assert.doesNotMatch(DOC, /sk-ant-|sk_(live|test)_[A-Za-z0-9]{10}|EAA[A-Za-z0-9]{40}|AC[0-9a-f]{32}|BEGIN [A-Z ]*PRIVATE KEY|sb_secret_|eyJhbGci|AGE-SECRET-KEY-1/);
});

test('check-credentials.mjs: all present -> exit 0; one missing -> exit 1 naming type, credential and blocked workflows', () => {
  const all = [...REQ.keys()].map((k) => { const [t, n] = k.split('\t'); return `${n}\t${t}`; });
  const run = (input) => spawnSync(process.execPath, [join(A, 'vps/check-credentials.mjs')], { input, encoding: 'utf8' });
  let r = run(all.join('\n') + '\nsome other credential\thttpHeaderAuth\n');
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, new RegExp(`credentials OK: ${REQ.size}/${REQ.size}`));
  const drop = 'LV Supabase - n8n_app (least privilege)\tpostgres';
  r = run(all.filter((l) => l !== drop).join('\n'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /MISSING credential: postgres "LV Supabase - n8n_app \(least privilege\)" \(blocks (SUB-[a-z0-9-]+, )*W01, W02/); // SUB-<slug> files sort before W01 (I-48f)
  // same name, wrong type is a miss (n8n binds by name AND type)
  const miss = missingCredentials(REQ, parsePresent(all.map((l) => l.replace(/\tpostgres$/, '\thttpHeaderAuth')).join('\n')));
  assert.deepEqual(miss.map((m) => m.name), ['LV Supabase - n8n_app (least privilege)']);
  assert.equal(run('').status, 1, 'empty credential table fails closed');
});

test('provision.sh step 7 runs the credential check after the restore and before n8n starts', () => {
  const s = readFileSync(join(A, 'vps/provision.sh'), 'utf8');
  const s7 = s.slice(s.indexOf('s7() {'), s.indexOf('\n}', s.indexOf('s7() {')));
  const check = s7.indexOf('check-credentials.mjs'), restore = s7.lastIndexOf('pg_restore'), start = s7.indexOf('$DC start n8n');
  assert.ok(restore > 0 && check > restore && start > check, 'restore -> check -> start');
  assert.match(s7, /select name \|\| chr\(9\) \|\| type from credentials_entity/, 'names and types only, never the data column');
  assert.match(readFileSync(join(A, 'vps/W26.md'), 'utf8'), /check-credentials\.mjs/);
});

// Nodes whose type needs a credential but carry none: they fail when they run. Known gaps, owner ads-api-engineer (C6).
const NEEDS_CRED = /\.(postgres|microsoftOutlook|microsoftOutlookTrigger|whatsApp|s3|ftp)$/;
const gaps = [];
for (const f of readdirSync(A).filter((x) => /^(W\d\d|SUB-[a-z0-9-]+)\.json$/.test(x)).sort()) {
  for (const n of JSON.parse(readFileSync(join(A, f), 'utf8')).nodes) {
    const auth = n.parameters && n.parameters.authentication;
    if (!n.credentials && (NEEDS_CRED.test(n.type) || (auth && auth !== 'none'))) gaps.push(`${f.replace(/\.json$/, '')} / ${n.name}`);
  }
}
test('every node that needs a credential has one (CREDENTIALS.md C6)', gaps.length ? { todo: `${gaps.length} node(s) without a credential: ${gaps.join('; ')}` } : {}, () => {
  assert.deepEqual(gaps, []);
});
