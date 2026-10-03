// I-46d: the lv-automation loader (automation/index.cjs) in every runtime definition.
// n8n 2.41's task runner allows an external module only by exact request name (NODE_FUNCTION_ALLOW_EXTERNAL) and has no
// dynamic import(), so a Code node loads repo code in exactly one form: require('lv-automation').<name>.
// This test proves (1) every name index.cjs exports loads, through the same link the containers use,
// (2) every Code node that mentions lv-automation uses that exact form and a name the loader exports,
// (3) the local compose file and the VPS overlay carry the allowlist value and the link step into the full repo mount.
// Run: node --test automation/tests/loader.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(A, '..');
const require = createRequire(import.meta.url);
const L = require(join(A, 'index.cjs'));
const NAMES = Object.keys(L);
const BASE = readFileSync(join(A, 'docker-compose.yml'), 'utf8');
const VPS = readFileSync(join(A, 'vps/traefik/docker-compose.traefik.yml'), 'utf8');
const LINK = 'ln -sfn /repo/automation /home/node/.node_modules/lv-automation';

test('package.json names the module lv-automation with index.cjs as its only entry', () => {
  const p = JSON.parse(readFileSync(join(A, 'package.json'), 'utf8'));
  assert.equal(p.name, 'lv-automation');
  assert.equal(p.main, './index.cjs');
  assert.equal(p.exports['.'], './index.cjs');
  assert.ok(!p.dependencies || !Object.keys(p.dependencies).length, 'no npm dependencies behind the allowlisted name');
});

test('every name exported by index.cjs loads (and its file sits inside the repo)', () => {
  assert.ok(NAMES.length > 0);
  assert.deepEqual(NAMES, Object.keys(L.MODULES), 'exports = MODULES');
  for (const [name, rel] of Object.entries(L.MODULES)) {
    const file = resolve(A, rel);
    assert.ok(file.startsWith(REPO + sep), `${name}: ${rel} stays inside the repo (the read-only /repo mount)`);
    assert.ok(existsSync(file), `${name}: ${rel} exists`);
    const m = L[name];
    assert.ok(m && typeof m === 'object', `${name} loads to an object`);
    assert.ok(Object.keys(m).length > 0, `${name} exports something`);
  }
});

test('resolution through the container link: $HOME/.node_modules/lv-automation -> automation/ loads every name from another cwd', () => {
  const home = mkdtempSync(join(tmpdir(), 'lv-home-'));
  try {
    mkdirSync(join(home, '.node_modules'));
    symlinkSync(A, join(home, '.node_modules', 'lv-automation'));
    const probe = `const L = require('lv-automation'); const out = { at: require.resolve('lv-automation'), bad: [] };
      for (const k of Object.keys(L)) { try { if (!L[k] || typeof L[k] !== 'object') out.bad.push(k); } catch (e) { out.bad.push(k + ': ' + e.message); } }
      console.log(JSON.stringify(out));`;
    const r = spawnSync(process.execPath, ['-e', probe], { cwd: home, env: { PATH: process.env.PATH, HOME: home }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(realpathSync(out.at), realpathSync(join(A, 'index.cjs')), 'the link resolves to the repo copy (relative ../conversation paths work)');
    assert.deepEqual(out.bad, []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// Code nodes across automation/W*.json
const FILES = readdirSync(A).filter((f) => /^W\d\d\.json$/.test(f)).sort();
const codeNodes = [];
for (const f of FILES) {
  for (const n of JSON.parse(readFileSync(join(A, f), 'utf8')).nodes) {
    const src = (n.parameters && (n.parameters.jsCode || n.parameters.functionCode)) || '';
    if (src.includes('lv-automation')) codeNodes.push({ wf: f.slice(0, 3), node: n.name, type: n.type, src });
  }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// The request string must be exactly 'lv-automation' (the runner's allowList.has(request)); quote style does not
// change the request, so require("lv-automation") is the same form. Comments may mention the name freely.
const EXACT = /require\((['"])lv-automation\1\)/;
test('Code nodes that mention lv-automation use exactly require(\'lv-automation\'), no subpath, no import()', () => {
  const users = codeNodes.filter((c) => stripComments(c.src).includes('lv-automation'));
  assert.ok(users.length > 0, 'at least one Code node uses the loader');
  for (const c of users) {
    const where = `${c.wf} / ${c.node}`;
    assert.equal(c.type, 'n8n-nodes-base.code', `${where}: only Code nodes load repo code`);
    const code = stripComments(c.src);
    assert.match(code, EXACT, `${where}: uses require('lv-automation')`);
    // every mention of the name in code (not comments) must be the exact form
    const mentions = code.match(/.{0,12}lv-automation.{0,2}/g) || [];
    for (const m of mentions) assert.match(m, /require\((['"])lv-automation\1\)$/, `${where}: "${m.trim()}" is not the exact form`);
    assert.doesNotMatch(code, /lv-automation\//, `${where}: no subpath`);
    assert.doesNotMatch(code, /import\(\s*['"`]lv-automation/, `${where}: no import()`);
  }
});

test('every name a Code node reads off require(\'lv-automation\') is exported by index.cjs', () => {
  const used = new Map();
  for (const c of codeNodes) {
    for (const m of stripComments(c.src).matchAll(/require\((['"])lv-automation\1\)(?:\.([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])?/g)) {
      const name = m[2] || m[3];
      if (!name) continue; // destructuring / whole-module use is fine
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(c.wf);
    }
  }
  for (const [name, wfs] of used) assert.ok(NAMES.includes(name), `"${name}" (used by ${[...wfs].join(', ')}) is not exported by automation/index.cjs`);
});

test('compose + VPS overlay: allowlist = lv-automation, builtins unchanged, link step into the full read-only repo mount', () => {
  assert.match(BASE, /^\s+- \.\.:\/repo:ro$/m, 'base mounts the whole repo root read-only at /repo (not a copy of automation/)');
  assert.doesNotMatch(BASE + VPS, /:\/repo\/automation(:ro)?\s*$/m, 'automation/ is never mounted on its own');
  for (const [label, y] of [['docker-compose.yml', BASE], ['docker-compose.traefik.yml', VPS]]) {
    assert.match(y, /^\s+NODE_FUNCTION_ALLOW_EXTERNAL: lv-automation$/m, `${label}: allowlist is exactly lv-automation`);
    assert.match(y, /^\s+NODE_FUNCTION_ALLOW_BUILTIN: crypto,dns,url,fs,path$/m, `${label}: builtins unchanged`);
    assert.match(y, /^\s+REPO_DIR: \/repo$/m, `${label}: REPO_DIR`);
    assert.ok(y.includes(`mkdir -p /home/node/.node_modules && ${LINK} && exec /docker-entrypoint.sh`), `${label}: link step, then the image entrypoint`);
    assert.match(y, /^\s+init: true$/m, `${label}: init for PID 1 signals`);
    assert.match(y, /^\s+entrypoint:\n\s+- \/bin\/sh\n\s+- -c\n/m, `${label}: entrypoint is a sh -c list`);
  }
  const live = (y) => y.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(live(BASE) + live(VPS), /\/usr\/local\/lib\/node_modules/, 'the node user cannot write the global prefix; the link lives in $HOME');
  const s = readFileSync(join(A, 'vps/provision.sh'), 'utf8');
  const ship = s.match(/SHIP_DIRS=\(([^)]*)\)/)[1].split(/\s+/);
  for (const d of ['automation', 'conversation', 'landing/config', 'data']) assert.ok(ship.includes(d), `provision.sh step 4 ships ${d}/ (reached through index.cjs)`);
  const ex = readFileSync(join(A, '.env.example'), 'utf8');
  assert.match(ex, /^NODE_FUNCTION_ALLOW_EXTERNAL=\s+# leave unset: fixed to lv-automation/m, '.env.example explains the fixed value');
});
