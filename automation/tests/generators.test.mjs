// I-40a: every generated workflow must equal what its generator emits today. A stale generator can then never
// silently overwrite a hand-synced file again (W03 lost its W07 sub-call and loop guard that way).
// The generators write into a temp dir (GEN_OUT_DIR); the committed files are never touched by this test.
// If this fails: either regenerate (the module changed and the JSON was not rebuilt) or port the hand edit
// into the generator (the JSON was edited by hand). Never "fix" it by editing the JSON alone.
// Run: node --test automation/tests/generators.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTOMATION = join(HERE, '..');
const ROOT = join(AUTOMATION, '..');
const require = createRequire(import.meta.url);

function regenerate(script, ids) {
  const dir = mkdtempSync(join(tmpdir(), 'smc-gen-'));
  try {
    execFileSync(process.execPath, [join(ROOT, script)], { env: { ...process.env, GEN_OUT_DIR: dir }, stdio: 'pipe' });
    return Object.fromEntries(ids.map((id) => [id, readFileSync(join(dir, `${id}.json`), 'utf8')]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function assertSame(id, fresh, generator) {
  const committed = readFileSync(join(AUTOMATION, `${id}.json`), 'utf8');
  if (committed === fresh) return;
  const a = JSON.parse(committed), b = JSON.parse(fresh);
  const names = (w) => new Set(w.nodes.map((n) => n.name));
  const onlyCommitted = [...names(a)].filter((x) => !names(b).has(x));
  const onlyFresh = [...names(b)].filter((x) => !names(a).has(x));
  const changed = a.nodes.filter((n) => { const m = b.nodes.find((x) => x.name === n.name); return m && JSON.stringify(m) !== JSON.stringify(n); }).map((n) => n.name);
  assert.fail(`automation/${id}.json differs from ${generator} output.\n  nodes only in committed: ${JSON.stringify(onlyCommitted)}\n  nodes only in generated: ${JSON.stringify(onlyFresh)}\n  nodes that differ: ${JSON.stringify(changed)}`);
}

test('W03 + W28: automation/build-w03-w28.mjs regenerates the committed files byte for byte', () => {
  const out = regenerate('automation/build-w03-w28.mjs', ['W03', 'W28']);
  for (const [id, text] of Object.entries(out)) assertSame(id, text, 'automation/build-w03-w28.mjs');
});

test('W03 keeps the I-40a shape: W07 sub-call, loop guard, no public POST webhook', () => {
  const w = JSON.parse(readFileSync(join(AUTOMATION, 'W03.json'), 'utf8'));
  const subs = w.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => JSON.stringify(n.parameters));
  assert.ok(subs.some((p) => /W07/.test(p)), 'W03 hands free text to W07 via executeWorkflow');
  assert.ok(w.nodes.some((n) => /loop/i.test(n.name)), 'W03 has a loop-guard node');
  const posts = w.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook' && String(n.parameters.httpMethod || 'GET').toUpperCase() === 'POST');
  assert.equal(posts.length, 0, 'W03 has no POST webhook (inbound arrives via the WhatsApp trigger / router)');
});

test('W16-W19 + W25: automation/billing/build-workflows.mjs regenerates the committed files byte for byte', () => {
  const ids = ['W16', 'W17', 'W18', 'W19', 'W25'];
  const out = regenerate('automation/billing/build-workflows.mjs', ids);
  for (const id of ids) assertSame(id, out[id], 'automation/billing/build-workflows.mjs');
});

test('W32 + W33: optimisation/build-workflows.cjs generate() equals the committed files byte for byte', () => {
  const { generate } = require(join(ROOT, 'optimisation', 'build-workflows.cjs'));
  for (const [f, wf] of Object.entries(generate())) {
    const id = f.replace(/^automation\//, '').replace(/\.json$/, '');
    assertSame(id, JSON.stringify(wf, null, 2) + '\n', 'optimisation/build-workflows.cjs');
  }
});

test('the generators never write into automation/ when GEN_OUT_DIR is set', () => {
  const before = ['W03', 'W28', 'W16', 'W17', 'W18', 'W19', 'W25'].map((id) => readFileSync(join(AUTOMATION, `${id}.json`), 'utf8'));
  regenerate('automation/build-w03-w28.mjs', ['W03']);
  regenerate('automation/billing/build-workflows.mjs', ['W16']);
  const after = ['W03', 'W28', 'W16', 'W17', 'W18', 'W19', 'W25'].map((id) => readFileSync(join(AUTOMATION, `${id}.json`), 'utf8'));
  assert.deepEqual(after, before);
});
