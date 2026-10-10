// I-52a (REHEARSAL-L01 F2): every literal `source` a workflow writes to public.webhook_events must be in
// webhook_events_source_check as last defined by the migrations (02 creates it inline, 13 §7 widens it).
// A new source in any automation/W*.json or SUB-*.json that the CHECK does not allow fails here, not on a lead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTO = resolve(HERE, '..');
const MIG = resolve(AUTO, '..', 'supabase', 'migrations');
const MIGRATIONS = ['20261002020000_smc_02_core.sql', '20261002060000_smc_06_pass2.sql', '20261002130000_smc_13_pass7.sql'];

/** Split the start of `s` into top-level comma-separated expressions (quotes and parens respected). */
function topLevelItems(s, want) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (let i = 0; i < s.length && out.length < want; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) { if (s[i + 1] === q) { cur += s[++i]; } else q = null; } continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') { if (depth === 0) { out.push(cur.trim()); break; } depth--; }
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    if (depth === 0 && /^\s(where|from|on\s+conflict|returning)\b/i.test(s.slice(i, i + 14))) { out.push(cur.trim()); break; }
    cur += c;
  }
  return out;
}

/** Every INSERT INTO [public.]webhook_events in a text: { source literal | null, expr }. */
export function webhookInserts(text) {
  // Code nodes may build SQL by concatenating string literals: join 'a ' + 'b' first.
  const t = text.replace(/(['"`])\s*\+\s*\1/g, '');
  const re = /insert\s+into\s+(?:public\.)?webhook_events\s*\(([^)]*)\)\s*(values\s*\(|select\s+)/gi;
  const found = [];
  let m;
  while ((m = re.exec(t))) {
    const cols = m[1].split(',').map((c) => c.trim().toLowerCase());
    const idx = cols.indexOf('source');
    if (idx < 0) continue;
    const items = topLevelItems(t.slice(m.index + m[0].length), idx + 1);
    const expr = items[idx] ?? '';
    const lit = /^'([^']*)'$/.exec(expr);
    found.push({ source: lit ? lit[1] : null, expr });
  }
  return found;
}

function workflowFiles() {
  return readdirSync(AUTO).filter((f) => /^(W\d+|SUB-.+)\.json$/.test(f)).sort();
}

function collectStrings(v, acc = []) {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, acc));
  return acc;
}

/** { file, node, source, expr } for every webhook_events insert in the workflow exports. */
export function workflowSources() {
  const rows = [];
  for (const f of workflowFiles()) {
    const wf = JSON.parse(readFileSync(join(AUTO, f), 'utf8'));
    for (const n of wf.nodes || []) {
      if (/stickyNote$/.test(n.type || '')) continue;
      for (const s of collectStrings(n.parameters || {})) {
        for (const hit of webhookInserts(s)) rows.push({ file: f, node: n.name, ...hit });
      }
    }
  }
  return rows;
}

/** The effective CHECK list: last definition across 02 → 06 → 13 (inline table CHECK or ADD CONSTRAINT). */
export function checkList() {
  let current = null;
  const history = [];
  for (const f of MIGRATIONS) {
    const sql = readFileSync(join(MIG, f), 'utf8').replace(/--[^\n]*/g, '');
    const defs = [];
    const inline = /create\s+table\s+if\s+not\s+exists\s+public\.webhook_events\s*\(\s*[^;]*?source\s+text[^,]*?check\s*\(\s*source\s+in\s*\(([^)]*)\)/gi;
    const added = /add\s+constraint\s+webhook_events_source_check\s+check\s*\(\s*source\s+in\s*\(([^)]*)\)/gi;
    for (const re of [inline, added]) { let m; while ((m = re.exec(sql))) defs.push({ at: m.index, list: m[1] }); }
    defs.sort((a, b) => a.at - b.at);
    for (const d of defs) {
      current = [...d.list.matchAll(/'([^']+)'/g)].map((x) => x[1]);
      history.push({ file: f, list: current });
    }
  }
  return { current, history };
}

// The only non-literal writer allowed: the shared verify-webhooks helper constant (source passed as $1 by JS
// callers that pass a provider name). Any other dynamic source must be reviewed and added here on purpose.
const DYNAMIC_OK = /^\$1$/;
const DYNAMIC_FILES_OK = new Set(['W03.json', 'W16.json', 'W19.json', 'W25.json', 'W28.json']);

test('extractor finds W01 rate-counter and W20 dedupe sources (F2 regression)', () => {
  const lits = new Set(workflowSources().filter((r) => r.source).map((r) => `${r.file}:${r.source}`));
  for (const k of ['W01.json:w01_ip', 'W01.json:w01_num', 'W20.json:w20', 'W07.json:whatsapp', 'W03.json:whatsapp', 'W16.json:paystack']) {
    assert.ok(lits.has(k), `expected ${k} in extracted literals`);
  }
});

test('W03/W07 claim keys are external_id prefixes, never a source', () => {
  for (const r of workflowSources()) {
    if (r.source) assert.ok(!/[:]/.test(r.source), `${r.file} ${r.node}: source '${r.source}' looks like a claim key`);
  }
});

test('CHECK list parsed from migrations: 13 §7 is a superset of 02 (additive)', () => {
  const { current, history } = checkList();
  assert.ok(history.length >= 2, `expected 02 + 13 definitions, got ${history.map((h) => h.file).join(', ')}`);
  assert.equal(history[0].file, '20261002020000_smc_02_core.sql');
  for (const v of history[0].list) assert.ok(current.includes(v), `02 value '${v}' dropped from the current CHECK`);
});

test('every literal webhook_events.source in W*.json / SUB-*.json is allowed by the CHECK', () => {
  const { current } = checkList();
  const rows = workflowSources();
  assert.ok(rows.length > 0, 'no webhook_events inserts found: extractor broken');
  const missing = rows.filter((r) => r.source && !current.includes(r.source));
  assert.deepEqual(missing.map((r) => `${r.file} / ${r.node}: '${r.source}'`), [],
    'add these to webhook_events_source_check in a new additive migration section');
});

test('non-literal sources are only the shared verify-webhooks helper constant', () => {
  const dyn = workflowSources().filter((r) => !r.source);
  for (const r of dyn) {
    assert.ok(DYNAMIC_OK.test(r.expr) && DYNAMIC_FILES_OK.has(r.file),
      `${r.file} / ${r.node}: dynamic source '${r.expr}' — make it a literal or review it against the CHECK`);
  }
});
