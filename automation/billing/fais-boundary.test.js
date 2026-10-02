'use strict';
// FAIS boundary (compliance-qa phase4-review-2, fix-wave-1): money code never reads sale outcomes.
// Static check: no file under automation/billing/ and none of W16-W19 / W25 may reference the broker
// ROI fields. Price is never tied to policies (0.1 Commercial model); billing only knows tier, cycle,
// invoice and payment. If this fails, remove the reference; do not add an exception here.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const BILLING_DIR = __dirname;
const AUTOMATION_DIR = path.join(__dirname, '..');
const WORKFLOWS = ['W16.json', 'W17.json', 'W18.json', 'W19.json', 'W25.json'];
const SELF = path.basename(__filename);

// Field names are built from parts so this file never matches its own pattern.
const FORBIDDEN = [
  ['policies', 'written'].join('_'),
  ['close', 'rate'].join('_'),
  'commiss' + 'ion',
  ['fact', 'broker', 'roi'].join('_'),
];
const PATTERN = new RegExp('(' + FORBIDDEN.join('|') + ')', 'i');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

function scan(file) {
  const hits = [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(PATTERN);
    if (m) hits.push(`${path.relative(AUTOMATION_DIR, file)}:${i + 1}: ${m[1]}`);
  });
  return hits;
}

test('FAIS boundary: automation/billing/** never references broker ROI fields', () => {
  const files = walk(BILLING_DIR).filter((f) => path.basename(f) !== SELF);
  assert.ok(files.length > 0, 'no billing files found');
  const hits = files.flatMap(scan);
  assert.deepStrictEqual(hits, [], 'billing code references sale-outcome fields:\n' + hits.join('\n'));
});

test('FAIS boundary: W16-W19 and W25 never reference broker ROI fields', () => {
  const hits = [];
  for (const name of WORKFLOWS) {
    const file = path.join(AUTOMATION_DIR, name);
    assert.ok(fs.existsSync(file), `missing workflow ${name}`);
    hits.push(...scan(file));
  }
  assert.deepStrictEqual(hits, [], 'billing workflows reference sale-outcome fields:\n' + hits.join('\n'));
});

test('FAIS boundary: the pattern actually catches each field (self-check)', () => {
  for (const f of FORBIDDEN) assert.ok(PATTERN.test(`select ${f} from x`), f);
});
