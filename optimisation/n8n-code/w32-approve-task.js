// Appends one node to build/tasks.json for an approved proposal. Idempotent, validated in-code with the same rules as
// build/validate-tasks.mjs (the real validator is run again by the next node, and the file is restored if it fails).
const p = $('Decide').first().json;                       // the ops.proposals row just approved
const tf = $('Tasks.json (approve)').first();
const doc = (tf.json && tf.json.data && tf.json.data.nodes) ? tf.json.data : tf.json;
if (!doc || !Array.isArray(doc.nodes)) return [{ json: { ok: false, error: 'tasks.json not readable' } }];
const original = JSON.stringify(doc, null, 2) + '\n';
const id = 'OPT-' + String(p.id).slice(0, 8);
if (doc.nodes.some((n) => n.id === id)) return [{ json: { ok: true, already: true, task_id: id } }];
const node = {
  id, title: String(p.title).slice(0, 160), owner: p.owner_agent, phase: 'optimisation', depends_on: [],
  acceptance_test: 'ops.proposals id=' + p.id + ': ' + p.metric + ' ' + (p.forecast && p.forecast.delta ? p.forecast.delta : '') + ' at ' + String(p.check_date).slice(0, 10) + '; test: ' + p.test + '; kill if: ' + p.kill_rule,
  human_gate: false, status: 'pending', section: '4.15', proposal_id: p.id, check_date: String(p.check_date).slice(0, 10), approved_by: p.decided_by, source: 'optimisation-advisor'
};
const next = Object.assign({}, doc, { nodes: doc.nodes.concat([node]) });
// ---- port of build/validate-tasks.mjs ----
const errs = []; const STATUS = ['pending', 'in_progress', 'green', 'red', 'needs_human'];
const ids = new Map(next.nodes.map((n) => [n.id, n]));
if (ids.size !== next.nodes.length) errs.push('duplicate node ids');
for (const n of next.nodes) {
  for (const k of ['id', 'title', 'owner', 'depends_on', 'acceptance_test', 'human_gate', 'status']) if (n[k] === undefined || n[k] === null) errs.push(n.id + ': missing ' + k);
  if (!STATUS.includes(n.status)) errs.push(n.id + ': bad status ' + n.status);
  for (const d of (n.depends_on || [])) if (!ids.has(d)) errs.push(n.id + ': unknown dependency ' + d);
}
for (let i = 1; i <= 35; i++) if (!ids.has('W' + String(i).padStart(2, '0'))) errs.push('missing W' + i);
const state = new Map();
const visit = (x, path) => { if (state.get(x) === 2) return; if (state.get(x) === 1) { errs.push('cycle: ' + path.concat(x).join(' -> ')); return; } state.set(x, 1); for (const d of (ids.get(x).depends_on || [])) if (ids.has(d)) visit(d, path.concat(x)); state.set(x, 2); };
for (const k of ids.keys()) visit(k, []);
if (errs.length) return [{ json: { ok: false, error: errs.slice(0, 5).join('; '), task_id: id } }];
const buf = Buffer.from(JSON.stringify(next, null, 2) + '\n');
const bak = Buffer.from(original);
return [{ json: { ok: true, task_id: id, check_date: node.check_date }, binary: { data: await this.helpers.prepareBinaryData(buf, 'tasks.json', 'application/json'), bak: await this.helpers.prepareBinaryData(bak, 'tasks.json.bak', 'application/json') } }];
