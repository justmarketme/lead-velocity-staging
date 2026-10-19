// One Graph version name (19 Oct 2026): META_GRAPH_VERSION, with META_API_VERSION only as a fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { graphVersion, DEFAULT_GRAPH_VERSION } = require('../graph-version.cjs');

test('graphVersion: META_GRAPH_VERSION wins, META_API_VERSION / API_VERSION are fallbacks, default v25.0, adds the v', () => {
  assert.equal(graphVersion({ META_GRAPH_VERSION: 'v26.0', META_API_VERSION: 'v23.0' }), 'v26.0');
  assert.equal(graphVersion({ META_API_VERSION: 'v23.0' }), 'v23.0');
  assert.equal(graphVersion({ API_VERSION: '24.0' }), 'v24.0');
  assert.equal(graphVersion({}), 'v25.0');
  assert.equal(DEFAULT_GRAPH_VERSION, 'v25.0');
});

test('capi.js and meta-ads.js follow the same rule', () => {
  const saved = { ...process.env };
  try {
    delete process.env.META_GRAPH_VERSION; delete process.env.META_API_VERSION; delete process.env.API_VERSION;
    const capi = require('../capi/capi.js');
    assert.equal(capi.apiVersion(), 'v25.0');
    process.env.META_API_VERSION = 'v23.0';
    assert.equal(capi.apiVersion(), 'v23.0');
    process.env.META_GRAPH_VERSION = 'v26.0';
    assert.equal(capi.apiVersion(), 'v26.0');
  } finally { process.env = saved; }
});

/** Every file outside docs/tests that reads META_API_VERSION must read META_GRAPH_VERSION first (n8n JSON included). */
test('no reader uses META_API_VERSION without META_GRAPH_VERSION before it', () => {
  const skip = /(^|\/)(node_modules|tests|\.git)(\/|$)|\.md$|\.env\.example$|graph-version\.cjs$|\.test\.m?[jt]s$/;
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f); const rel = relative(ROOT, p).replace(/\\/g, '/');
      if (skip.test(rel)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(json|m?js|cjs)$/.test(f)) files.push([rel, p]);
    }
  };
  for (const d of ['automation', 'scripts']) walk(join(ROOT, d));
  const bad = [];
  for (const [rel, p] of files) {
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/META_API_VERSION/g)) {
      const before = src.slice(Math.max(0, m.index - 60), m.index);
      if (!/META_GRAPH_VERSION/.test(before)) bad.push(`${rel}: …${src.slice(m.index - 30, m.index + 30).replace(/\s+/g, ' ')}…`);
    }
  }
  assert.deepEqual(bad, []);
});
