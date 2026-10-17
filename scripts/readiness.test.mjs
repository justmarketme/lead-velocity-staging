// node --test scripts/readiness.test.mjs
// Runs the Section 7 readiness checker with --json and asserts the console contract (schema lv.readiness.v1),
// that all 28 lines are evaluated without exceptions, and that the exit code follows the red rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const r = spawnSync(process.execPath, [join(ROOT, 'scripts/readiness.mjs'), '--json'], { cwd: ROOT, env, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024 });
const IDS = Array.from({ length: 28 }, (_, i) => `S7-${String(i + 1).padStart(2, '0')}`);
const EXTRA = ['S7-NH61']; // NH-61: cycle-1 manual-EFT line (no tasks.json node; title lives in readiness.mjs)
const POST_LAUNCH = ['S7-23', 'S7-24']; // NH-61: built and tested, switched off

test('runs and prints one JSON document', () => {
  assert.ok(r.status === 0 || r.status === 1, `exit ${r.status}: ${r.stderr}`);
  assert.doesNotThrow(() => JSON.parse(r.stdout));
});

const rep = JSON.parse(r.stdout || '{}');

test('top-level schema', () => {
  assert.equal(rep.schema, 'lv.readiness.v1');
  assert.ok(!Number.isNaN(Date.parse(rep.generated_at)));
  assert.equal(typeof rep.go_live_ready, 'boolean');
  assert.deepEqual(Object.keys(rep.counts).sort(), ['amber', 'green', 'post-launch', 'red']);
  assert.ok(Array.isArray(rep.lines) && Array.isArray(rep.exceptions));
});

test("today's run has no exceptions", () => {
  assert.deepEqual(rep.exceptions, []);
  for (const l of rep.lines) assert.ok(!l.checks.some((c) => c.name === 'evaluator'), `${l.id} evaluator threw`);
});

test('all 28 Section 7 lines, in order, each a tasks.json S7 node with the readiness acceptance test', () => {
  assert.deepEqual(rep.lines.map((l) => l.id), [...IDS, ...EXTRA]);
  const nodes = new Map(JSON.parse(readFileSync(join(ROOT, 'build/tasks.json'), 'utf8')).nodes.map((n) => [n.id, n]));
  for (const id of IDS) assert.match(nodes.get(id)?.acceptance_test || '', /console readiness check/);
});

test('line schema', () => {
  for (const l of rep.lines) {
    assert.ok(['green', 'amber', 'red', 'post-launch'].includes(l.status), l.id);
    assert.equal(typeof l.title, 'string');
    assert.ok(l.title.length > 10, l.id);
    assert.equal(typeof l.build_done, 'boolean');
    for (const k of ['evidence', 'missing']) assert.ok(Array.isArray(l[k]) && l[k].every((s) => typeof s === 'string'), `${l.id}.${k}`);
    assert.ok(l.checks.length > 0, l.id);
    for (const c of l.checks) {
      assert.ok(['pass', 'missing', 'fail'].includes(c.state), `${l.id} ${c.name}`);
      assert.ok(['build', 'live', 'info'].includes(c.half), `${l.id} ${c.name}`);
      assert.equal(typeof c.detail, 'string');
    }
    if (l.status === 'green') assert.equal(l.missing.length, 0, l.id);
    if (l.status !== 'green') assert.ok(l.missing.length > 0, `${l.id} is ${l.status} but names nothing missing`);
    if (l.status === 'amber') assert.ok(l.build_done && !l.checks.some((c) => c.state === 'fail'), `${l.id} amber needs a complete build half and no fail`);
  }
});

test('counts and exit code follow the red rule', () => {
  const c = { green: 0, amber: 0, red: 0, 'post-launch': 0 };
  for (const l of rep.lines) c[l.status]++;
  assert.deepEqual(rep.counts, c);
  assert.equal(c.green + c.amber + c.red + c['post-launch'], 29);
  assert.equal(r.status, c.red > 0 ? 1 : 0);
  assert.equal(rep.go_live_ready, c.red === 0 && c.amber === 0);
});

test('every line documents the evidence that turns it green', () => {
  const src = readFileSync(join(ROOT, 'scripts/readiness.mjs'), 'utf8');
  for (const id of [...IDS, ...EXTRA]) assert.match(src, new RegExp(`// ${id} [\\s\\S]*?// GREEN when:`), `${id} has no "GREEN when" comment`);
});

test('NH-61: S7-23 and S7-24 are post-launch and never block Go live; the manual-EFT line is checked', () => {
  for (const id of POST_LAUNCH) {
    const l = rep.lines.find((x) => x.id === id);
    assert.ok(['post-launch', 'green', 'red'].includes(l.status), id);
    if (l.status === 'post-launch') assert.equal(l.note, 'post-launch (NH-61)');
  }
  const m = rep.lines.find((x) => x.id === 'S7-NH61');
  assert.match(m.title, /Payment received/);
  assert.ok(m.checks.some((c) => /payment-received|Payment received/.test(c.name)));
  // A post-launch line alone must not make Go live unavailable.
  const blockers = rep.lines.filter((l) => l.status === 'red' || l.status === 'amber').map((l) => l.id);
  assert.equal(rep.go_live_ready, blockers.length === 0);
  assert.ok(!blockers.some((id) => POST_LAUNCH.includes(id) && rep.lines.find((x) => x.id === id).status === 'post-launch'));
});

test('no secret values in the output', () => {
  assert.doesNotMatch(r.stdout, /\b(sk|pk)_(live|test)_[A-Za-z0-9]{6,}/);
  assert.doesNotMatch(r.stdout, /\bEAA[A-Za-z0-9]{20,}/); // Meta access tokens
});
