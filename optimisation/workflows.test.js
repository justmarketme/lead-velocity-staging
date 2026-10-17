'use strict';
// Structural checks on automation/W32.json and W33.json (no n8n import is possible here), plus a dry run of the two Code nodes that carry logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generate } = require('./build-workflows.cjs');
const root = path.join(__dirname, '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const wf = (f) => JSON.parse(fs.readFileSync(path.join(root, 'automation', f), 'utf8'));

for (const f of ['W32.json', 'W33.json']) {
  test(f + ' is in sync with its sources', () => {
    const want = JSON.stringify(generate()['automation/' + f], null, 2) + '\n';
    assert.equal(fs.readFileSync(path.join(root, 'automation', f), 'utf8'), want, 'run: node optimisation/build-workflows.cjs');
  });
  test(f + ' connections resolve, Code nodes parse, no secrets, credentials by name', () => {
    const w = wf(f); const names = new Set(w.nodes.map((n) => n.name));
    assert.equal(names.size, w.nodes.length);
    for (const [a, c] of Object.entries(w.connections)) { assert.ok(names.has(a), a); for (const o of c.main) for (const t of o) assert.ok(names.has(t.node), t.node); }
    for (const n of w.nodes) {
      if (n.type === 'n8n-nodes-base.code') assert.doesNotThrow(() => new AsyncFunction('$input', '$', n.parameters.jsCode), n.name);
      for (const c of Object.values(n.credentials || {})) assert.ok(c.name && !('data' in c), n.name);
    }
    assert.equal(w.active, false);
    assert.ok(!/sk-ant|Bearer [A-Za-z0-9]{12}|-----BEGIN/.test(JSON.stringify(w)));
  });
}

function run(node, ctx) {
  const fn = new AsyncFunction('$input', '$', '$json', 'helpers', 'Buffer', node.parameters.jsCode.replace(/this\.helpers/g, 'helpers'));
  const store = ctx.nodes;
  const $ = (name) => { const items = store[name]; assert.ok(items, 'node not provided: ' + name); return { all: () => items.map((json) => ({ json })), first: () => ({ json: items[0] }) }; };
  return fn({ all: () => [], first: () => ({ json: {} }) }, $, {}, { prepareBinaryData: async (b, n) => ({ fileName: n, data: b.toString('base64') }) }, Buffer);
}

test('Compute signals: quiet synthetic day yields quiet=true; a shifted show-rate yields an adverse run', async () => {
  const w = wf('W32.json'); const node = w.nodes.find((n) => n.name === 'Compute signals');
  const cfg = { build_active: false, caps: { daily: 15 }, spent: { day: 0 } };
  const day = (i) => new Date(Date.UTC(2026, 9, 3 + i)).toISOString().slice(0, 10);
  const series = (shift) => { const rows = []; const J = [-3, 2, -1, 3, -2, 1, 0];
    for (let i = 0; i < 60; i++) { const jitter = J[i % 7];
      const late = i >= 53;                       // last 7 days
      const num = 50 + jitter + (late && shift ? -9 : 0);
      rows.push({ faculty: 'nurture_show', metric: 'show_rate', date: day(i), value: num / 70, numerator: num, denominator: 70, n: 70, spend_zar: 0, conversions: num, seed: false }); }
    return rows; };
  const base = (rows) => ({ nodes: { Plan: [{ cfg, date: day(60), weekday: 'Tue' }], Series: rows, 'Judge today': [{}], 'Judge runs': [{}], Journal: [{}], 'Build state': [{}], 'Tasks.json': [{ data: { nodes: [] } }] } });
  const quiet = (await run(node, base(series(false))))[0].json;
  const signals = (await run(node, base(series(true))))[0].json;
  assert.equal(quiet.INPUT.signals.filter((s) => s.faculty === 'nurture_show').length, 0, JSON.stringify(quiet.INPUT.signals.filter((s) => s.faculty === 'nurture_show')));
  const adv = signals.INPUT.signals.find((s) => s.metric === 'show_rate');
  assert.ok(adv && adv.side === 'adverse', 'shift not flagged');
  assert.ok(['amber', 'red'].includes(signals.status));
});

test('Append task node: appends OPT-<id>, validates with the same rules, and is idempotent', async () => {
  const w = wf('W32.json'); const node = w.nodes.find((n) => n.name === 'Append task node');
  const tasks = JSON.parse(fs.readFileSync(path.join(root, 'build', 'tasks.json'), 'utf8'));
  const p = { id: '123e4567-e89b-12d3-a456-426614174000', title: 'Split the two-question turn', metric: 'booking_rate', owner_agent: 'conversation-designer', forecast: '+3 pts', test: '7 d', kill_rule: 'revert', check_date: '2026-10-21', decided_by: 'jonathan' };
  const ctx = { nodes: { Decide: [p], 'Tasks.json (approve)': [tasks] } };
  const out = (await run(node, ctx))[0];
  assert.equal(out.json.ok, true);
  const next = JSON.parse(Buffer.from(out.binary.data.data, 'base64').toString());
  assert.equal(next.nodes.length, tasks.nodes.length + 1);
  assert.equal(next.nodes.at(-1).id, 'OPT-123e4567');
  const again = (await run(node, { nodes: { Decide: [p], 'Tasks.json (approve)': [next] } }))[0];
  assert.equal(again.json.already, true);
});
