// I-53h / I-52c: pubcheck.mjs offline against fixtures (no n8n).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stableHash, execTargets, cronsStarted, compare, loadRepo } from '../local/pubcheck.mjs';

const call = (id) => ({ name: `call ${id}`, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [0, 0], parameters: { workflowId: { value: id } } });
const cron = { name: 'tick', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: {} } };
const mk = (id, nodes, connections = {}) => ({ id, nodes, connections });
const repo = new Map([
  ['a', { file: 'W01.json', wf: mk('a', [call('b'), call('c')], { 'call b': { main: [[{ node: 'call c', type: 'main', index: 0 }]] } }) }],
  ['b', { file: 'W02.json', wf: mk('b', [cron, { name: 'x', type: 't', typeVersion: 1, parameters: { k: 1, j: 2 }, credentials: { pg: { id: '1', name: 'LV' } } }]) }],
  ['c', { file: 'W03.json', wf: mk('c', [{ name: 'y', type: 't', typeVersion: 1, parameters: {} }]) }],
]);

test('hash ignores ids, positions, key order, credential ids; sees behaviour changes', () => {
  const base = repo.get('b').wf;
  const same = mk('b', [{ ...base.nodes[1], id: 'zzz', position: [9, 9], parameters: { j: 2, k: 1 }, credentials: { pg: { id: '77', name: 'LV' } } }, { ...cron, position: [5, 5] }]);
  assert.equal(stableHash(same), stableHash(base));
  const changed = mk('b', [base.nodes[0], { ...base.nodes[1], parameters: { k: 2, j: 2 } }]);
  assert.notEqual(stableHash(changed), stableHash(base));
  assert.notEqual(stableHash(mk('b', base.nodes, { x: {} })), stableHash(base));
  assert.notEqual(stableHash(mk('b', [base.nodes[0], { ...base.nodes[1], disabled: true }])), stableHash(base));
});

test('hash accepts JSON-string nodes/connections and activeVersion wrapper', () => {
  const b = repo.get('b').wf;
  assert.equal(stableHash({ id: 'b', nodes: JSON.stringify(b.nodes), connections: '{}' }), stableHash(b));
  assert.equal(stableHash({ id: 'b', activeVersion: { nodes: b.nodes, connections: {} } }), stableHash(b));
});

test('targets and the crons that start with them', () => {
  assert.deepEqual(execTargets(repo), ['b', 'c']);
  assert.deepEqual(cronsStarted(repo, ['b', 'c']), [{ id: 'b', node: 'tick', type: 'n8n-nodes-base.scheduleTrigger' }]);
});

test('compare: ok, missing target, drift, stale extra', () => {
  const pub = (ids) => ids.map((id) => ({ id, nodes: JSON.stringify(repo.get(id).wf.nodes), connections: JSON.stringify(repo.get(id).wf.connections) }));
  assert.deepEqual(compare(repo, pub(['b', 'c'])).problems, []);
  assert.match(compare(repo, pub(['b'])).problems[0], /MISSING.*c/);
  const stale = pub(['b', 'c']); stale[1].nodes = '[]';
  assert.match(compare(repo, stale).problems[0], /DRIFT: c/);
  const extra = pub(['a', 'b', 'c']); extra[0].nodes = '[]';
  assert.match(compare(repo, extra).problems[0], /DRIFT: a/);
  assert.deepEqual(compare(repo, pub(['b']), { onlyPublished: true }).problems, []);
});

test('real repo: every Execute Workflow target resolves to a committed workflow; self-hash is stable', () => {
  const r = loadRepo();
  assert.ok(execTargets(r).length >= 20);
  const pub = [...r].map(([id, { wf }]) => ({ id, nodes: JSON.stringify(wf.nodes.slice().reverse()), connections: JSON.stringify(wf.connections) }));
  assert.deepEqual(compare(r, pub).problems, []);
});
