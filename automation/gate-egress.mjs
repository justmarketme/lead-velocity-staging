#!/usr/bin/env node
// I-54c: apply lib/egress-gate.cjs to the workflow JSON that has no generator (W14, W22, W23, W30, W31).
// Idempotent. Generated workflows (W19, W28, W32) are gated inside their generators instead.
// usage: node automation/gate-egress.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { gateSenders, findUngated } = createRequire(import.meta.url)('./lib/egress-gate.cjs');
const check = process.argv.includes('--check');
let bad = 0;
for (const f of ['W14', 'W22', 'W23', 'W30', 'W31']) {
  const p = path.join(here, f + '.json');
  const raw = fs.readFileSync(p, 'utf8');
  const wf = JSON.parse(raw);
  const todo = findUngated(wf);
  if (!todo.length) { console.log(`${f}: gated`); continue; }
  if (check) { console.error(`${f}: ungated ${todo.map((t) => t.name).join(', ')}`); bad++; continue; }
  const indent = /^\{\n( +)"/.exec(raw)?.[1].length || 2;
  fs.writeFileSync(p, JSON.stringify(gateSenders(wf), null, indent) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`${f}: gated ${todo.map((t) => t.name).join(', ')}`);
}
process.exit(bad ? 1 : 0);
