// automation/patch-w07-w09-pause-input.mjs - W07's "-> W09 pause" sends the W09 pause contract (21 Oct 2026, late).
// Live (synthetic distress smoke, +27600000926): W07 passed the whole plan item to W09, which has no `op`, so W09 classifyOp
// returned 'reject'; its subcall_rejected row had no brand (lead without a booking) and failed RLS; the failed W09 run raised
// a red W22 "workflow failed" WhatsApp to Jono. So a bereaved client's reminders were never paused, real or test.
// CONTRACTS.md "Sub-workflow interfaces": W09 pause = { op: 'pause', lead_id, reason: 'sensitive'|'human_handoff'|'opt_out' }.
// This adds one Code node between "Pause reminders? (sensitive)" and "-> W09 pause" that builds exactly that.
// Idempotent. Run: node automation/patch-w07-w09-pause-input.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const F = new URL('./W07.json', import.meta.url);
const raw = readFileSync(F, 'utf8');
const wf = JSON.parse(raw);
const IF = 'Pause reminders? (sensitive)';
const CALL = '-> W09 pause';
const NODE = 'W09 pause input (op pause, sensitive)';

const call = wf.nodes.find((n) => n.name === CALL);
if (!call || !wf.connections[IF]) throw new Error(`W07 has no "${IF}" -> "${CALL}"`);
let node = wf.nodes.find((n) => n.name === NODE);
if (!node) {
  node = { parameters: {}, id: 'w07-w09-pause-input', name: NODE, type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [call.position[0] - 180, call.position[1] + 120] };
  wf.nodes.push(node);
}
node.parameters = { mode: 'runOnceForEachItem', jsCode:
`// W09 pause contract (CONTRACTS.md): { op: 'pause', lead_id, reason }. A sensitive hand-off (distress) pauses every unsent
// reminder for the lead; only a person resumes them (console, op 'resume').
const e = $json.plan.escalation || {};
return { json: { op: 'pause', lead_id: e.lead_id || ($json.lead && $json.lead.id) || null, reason: 'sensitive', source: 'W07' } };` };
const outs = wf.connections[IF].main;
outs[0] = [{ node: NODE, type: 'main', index: 0 }];
wf.connections[NODE] = { main: [[{ node: CALL, type: 'main', index: 0 }]] };

const indent = /^\{\n( +)"/.exec(raw)?.[1].length || 2;
const out = JSON.stringify(wf, null, indent) + (raw.endsWith('\n') ? '\n' : '');
if (out !== raw) writeFileSync(F, out);
console.log(`W07: "${IF}" -> "${NODE}" -> "${CALL}"`);
