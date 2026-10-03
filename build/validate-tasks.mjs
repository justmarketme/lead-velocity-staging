// Validates build/tasks.json: unique ids, known deps, no cycles, required fields, W01–W35 present.
import { readFileSync } from 'node:fs';
const { nodes } = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url)));
const errs = [];
const ids = new Map(nodes.map((n) => [n.id, n]));
if (ids.size !== nodes.length) errs.push('duplicate node ids');
const STATUS = ['pending', 'in_progress', 'green', 'red', 'needs_human'];
for (const n of nodes) {
  for (const k of ['id', 'title', 'owner', 'depends_on', 'acceptance_test', 'human_gate', 'status'])
    if (n[k] === undefined || n[k] === null) errs.push(`${n.id}: missing ${k}`);
  if (!STATUS.includes(n.status)) errs.push(`${n.id}: bad status ${n.status}`);
  for (const d of n.depends_on) if (!ids.has(d)) errs.push(`${n.id}: unknown dependency ${d}`);
}
for (let i = 1; i <= 35; i++) if (!ids.has(`W${String(i).padStart(2, '0')}`)) errs.push(`missing W${i}`);
const state = new Map();
const visit = (id, path) => {
  if (state.get(id) === 2) return;
  if (state.get(id) === 1) { errs.push(`cycle: ${[...path, id].join(' → ')}`); return; }
  state.set(id, 1);
  for (const d of ids.get(id).depends_on) visit(d, [...path, id]);
  state.set(id, 2);
};
for (const id of ids.keys()) visit(id, []);
const count = (f) => nodes.filter(f).length;
console.log(`${nodes.length} nodes · ${count((n) => n.human_gate)} human gates · ` +
  STATUS.map((s) => `${s} ${count((n) => n.status === s)}`).join(' · '));
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('tasks.json valid');
