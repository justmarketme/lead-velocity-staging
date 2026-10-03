// I-44b: every committed workflow carries a stable top-level id, and every reference to another workflow uses it.
// Why: `n8n import:workflow` refuses a file without an id (SQLITE_CONSTRAINT workflow_entity.id) and an Execute
// Workflow node with an empty workflowId has no target at run time. With ids in the files, the raw committed JSON
// imports as-is (no shim) and sub-calls resolve by id on every instance (laptop, local, VPS) the same way.
// Rule (same in every generator): "W07 ..." -> smc-w07; a callee without a W number -> smc-<slug> ("CAPI Send" -> smc-capi-send).
// Run: node --test automation/tests/workflow-ids.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = readdirSync(AUTOMATION).filter((f) => /^W\d\d\.json$/.test(f)).sort();
const WF = Object.fromEntries(FILES.map((f) => [f.slice(0, 3), JSON.parse(readFileSync(join(AUTOMATION, f), 'utf8'))]));
const expectedId = (w) => `smc-${w.toLowerCase()}`;
const COMMITTED = new Set(Object.keys(WF).map(expectedId));

// Callees that are referenced but not committed as automation/W*.json yet. Each is a real gap with an owner;
// the reference is already the final id, so the caller needs no edit when the callee lands.
const NOT_YET_COMMITTED = {
  'smc-capi-send': 'CAPI Send sub-workflow around automation/capi/capi.js (automation-engineer)',
  'smc-w26': 'W26 go-live runner (devops-security; automation/vps/W26.md, runs as a script today)',
  'smc-ads-budget': 'ads budget sub-workflow around automation/ads/meta-ads.js (ads-api-engineer)',
  'smc-whatsapp-send': 'shared template sender sub-workflow (automation-engineer)',
};
// Drafts owned by the core-path agent (being edited concurrently). Their failures are reported as TODO, not hidden.
const CORE_PATH = new Set(['W01', 'W04', 'W05', 'W06', 'W09', 'W12', 'W13', 'W15']);
const opts = (w) => (CORE_PATH.has(w) ? { todo: `core-path draft ${w}: adopt id ${expectedId(w)} and id references (I-44b)` } : {});

const refsOf = (wf) => wf.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => ({ node: n.name, p: n.parameters }));

for (const w of Object.keys(WF)) {
  test(`${w}.json: top-level id ${expectedId(w)}, sub-workflow references by id, errorWorkflow by id`, opts(w), () => {
    const wf = WF[w];
    assert.equal(wf.id, expectedId(w), 'top-level id = smc-<file name>');
    assert.equal(Object.keys(wf)[0], 'id', 'id is the first key (readable diffs, same in every generator)');
    for (const { node, p } of refsOf(wf)) {
      assert.equal(p.source || 'database', 'database', `${node}: database source`);
      const ref = p.workflowId;
      assert.equal(typeof ref, 'object', `${node}: resource-locator workflowId`);
      if (ref.value === '={{ $workflow.id }}') continue; // self sub-call (W32 decision branch)
      assert.equal(ref.mode, 'id', `${node}: mode id (not list: a list pick is blank in the file)`);
      assert.ok(COMMITTED.has(ref.value) || ref.value in NOT_YET_COMMITTED, `${node}: "${ref.value}" is neither a committed workflow id nor a listed pending callee`);
      if (ref.cachedResultName && /^W\d\d\b/.test(ref.cachedResultName)) {
        assert.equal(ref.value, expectedId(ref.cachedResultName.slice(0, 3)), `${node}: id matches its cachedResultName "${ref.cachedResultName}"`);
      }
    }
    const ew = wf.settings && wf.settings.errorWorkflow;
    if (ew !== undefined) assert.ok(COMMITTED.has(ew), `settings.errorWorkflow "${ew}" is a committed workflow id`);
  });
}

test('ids are unique across automation/W*.json', () => {
  const ids = Object.values(WF).map((w) => w.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});

test('every node name is unique within its workflow (n8n import rejects duplicates, I-44c)', () => {
  for (const [w, wf] of Object.entries(WF)) {
    const names = wf.nodes.map((n) => n.name);
    assert.equal(new Set(names).size, names.length, `${w}: duplicate node name`);
  }
});

test('no placeholder or blank workflow references remain in my workflows', () => {
  for (const [w, wf] of Object.entries(WF)) {
    if (CORE_PATH.has(w)) continue;
    const text = JSON.stringify(wf);
    assert.ok(!/REPLACE_WITH_\w+_WORKFLOW_ID/.test(text), `${w}: REPLACE_WITH_* placeholder`);
    for (const { node, p } of refsOf(wf)) assert.notEqual(p.workflowId.value, '', `${w} / ${node}: blank workflowId`);
  }
});

test('pending callees are still really missing (drop them from NOT_YET_COMMITTED when they land)', () => {
  for (const id of Object.keys(NOT_YET_COMMITTED)) assert.ok(!COMMITTED.has(id), `${id} is committed now: remove it from the pending list`);
});
