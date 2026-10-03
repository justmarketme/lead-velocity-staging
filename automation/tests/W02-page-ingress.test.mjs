// I-16 / I-25: W02 (Meta `page` ingress) routes feed comments to W30 and DMs to W31, forwarding the raw body
// byte-for-byte plus X-Hub-Signature-256; leadgen keeps its path. Offline: runs the real Code nodes, no sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCode, ifBranch, nodeRequire } from './_n8ncode.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = (f) => JSON.parse(readFileSync(join(A, f), 'utf8'));
const W02 = wf('W02.json'), W30 = wf('W30.json'), W31 = wf('W31.json');
const SECRET = 'test_app_secret';
const env = { META_APP_SECRET: SECRET };
const VERIFY = 'Verify signature + parse leadgen events';
// Deliberately odd bytes: key order, spacing, unicode escapes, trailing newline. Re-serialising would change them.
const rawOf = (o) => Buffer.from(JSON.stringify(o, null, 1).replace('"', '"') + '\n  ', 'utf8');
const sign = (b) => 'sha256=' + createHmac('sha256', SECRET).update(b).digest('hex');
const req = (buf, sig = sign(buf)) => ({ json: { headers: { 'x-hub-signature-256': sig } }, binary: { data: { data: buf.toString('base64') } } });
// runCode builds $input from json only, so feed binary via a patched $input: use the node code directly.
import { codeNode } from './_n8ncode.mjs';
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const verify = (buf, sig) => {
  const item = req(buf, sig);
  const fn = new AsyncFunction('$json', '$env', '$', '$input', 'require', codeNode(W02, VERIFY).parameters.jsCode);
  return fn(item.json, env, () => { throw new Error('no refs'); }, { all: () => [item], first: () => item }, nodeRequire);
};

const leadgen = { object: 'page', entry: [{ id: 'P1', time: 1, changes: [{ field: 'leadgen', value: { leadgen_id: 'L1', page_id: 'P1', form_id: 'F1', ad_id: 'A1', created_time: 1 } }] }] };
const comment = { object: 'page', entry: [{ id: 'P1', time: 1, changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'C1', message: 'Hi é' } }] }] };
const dm = { object: 'page', entry: [{ id: 'P1', time: 1, messaging: [{ sender: { id: 'U' }, recipient: { id: 'P1' }, message: { mid: 'm1', text: 'hello' } }] }] };

const routeOf = (items) => items.map((i) => i.json.route || (i.json.leadgen_id ? 'leadgen' : i.json.empty ? 'empty' : 'invalid'));

test('leadgen change keeps its path (ingest branch), no forward', async () => {
  const out = await verify(rawOf(leadgen));
  assert.deepEqual(routeOf(out), ['leadgen']);
  assert.equal(ifBranch(W02, 'Valid and has a lead?', { json: out[0].json }), true);
});

test('feed comment -> W30 with raw body byte-for-byte + original signature; not the lead path', async () => {
  const buf = rawOf(comment), sig = sign(buf);
  const out = await verify(buf, sig);
  assert.deepEqual(routeOf(out), ['w30']);
  assert.ok(Buffer.from(out[0].json.raw_body_b64, 'base64').equals(buf), 'bytes unchanged');
  assert.equal(out[0].json.signature, sig);
  assert.equal(ifBranch(W02, 'Valid and has a lead?', { json: out[0].json }), false);
});

test('DM -> W31 with raw body + signature', async () => {
  const buf = rawOf(dm), sig = sign(buf);
  const out = await verify(buf, sig);
  assert.deepEqual(routeOf(out), ['w31']);
  assert.ok(Buffer.from(out[0].json.raw_body_b64, 'base64').equals(buf));
  assert.equal(out[0].json.signature, sig);
});

test('bad signature forwards nothing; unrelated page change is empty', async () => {
  assert.deepEqual(await verify(rawOf(comment), 'sha256=00'), [{ json: { valid: false } }]);
  const out = await verify(rawOf({ object: 'page', entry: [{ id: 'P1', changes: [{ field: 'feed', value: { item: 'like' } }] }] }));
  assert.deepEqual(routeOf(out), ['empty']);
});

test('Switch routes w30 -> output 0, w31 -> output 1; Execute Workflow by id, fire-and-forget; wired', () => {
  const sw = W02.nodes.find((n) => n.name === 'Page forward route?');
  assert.deepEqual(sw.parameters.rules.values.map((r) => r.outputKey), ['w30', 'w31']);
  const c = W02.connections['Page forward route?'].main;
  const ex = (name) => W02.nodes.find((n) => n.name === name);
  const t30 = ex(c[0][0].node), t31 = ex(c[1][0].node);
  assert.equal(t30.parameters.workflowId.value, 'smc-w30'); assert.equal(t31.parameters.workflowId.value, 'smc-w31');
  for (const t of [t30, t31]) { assert.equal(t.parameters.workflowId.mode, 'id'); assert.equal(t.parameters.options.waitForSubWorkflow, false); }
  assert.ok(W02.connections[VERIFY].main[0].some((x) => x.node === 'Page forward route?'));
});

for (const [name, W, build, route] of [['W30', W30, comment, 'w30'], ['W31', W31, dm, 'w31']]) {
  test(`${name} accepts the forward: rebuilt request passes its own Verify signature, body unchanged`, async () => {
    const buf = rawOf(build), sig = sign(buf);
    const fwd = (await verify(buf, sig))[0].json;
    const rebuilt = W.nodes.find((n) => n.name === 'Rebuild raw body + signature header (from W02)');
    const fn = new AsyncFunction('$input', 'require', 'this_helpers', rebuilt.parameters.jsCode.replace(/this\.helpers/g, 'this_helpers'));
    const helpers = { prepareBinaryData: async (b) => ({ data: b.toString('base64') }) };
    const [o] = await fn({ all: () => [{ json: fwd }] }, nodeRequire, helpers);
    assert.equal(o.json.headers['x-hub-signature-256'], sig);
    assert.deepEqual(o.json.body, build);
    // The unchanged Verify signature node: raw from binary, header from json.headers.
    const v = W.nodes.find((n) => n.name === 'Verify signature');
    const vf = new AsyncFunction('$input', '$env', 'require', 'helpers_', v.parameters.jsCode.replace(/this\.helpers/g, 'helpers_'));
    const [res] = await vf({ all: () => [o] }, env, nodeRequire, { getBinaryDataBuffer: async () => Buffer.from(o.binary.data.data, 'base64') });
    assert.equal(res.json.signature_ok, true, res.json.reason);
    const bad = await vf({ all: () => [{ ...o, json: { ...o.json, headers: { 'x-hub-signature-256': 'sha256=00' } } }] }, env, nodeRequire, { getBinaryDataBuffer: async () => Buffer.from(o.binary.data.data, 'base64') });
    assert.equal(bad[0].json.signature_ok, false);
    assert.equal(W.connections['Called by W02 (page forward)'].main[0][0].node, rebuilt.name);
    assert.equal(W.connections[rebuilt.name].main[0][0].node, 'Verify signature');
  });
}
