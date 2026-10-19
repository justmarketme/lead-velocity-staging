// automation/patch-w07-cancel-stop.mjs - W07 routing for the W10 cancel card and the W15 STOP card (19 Oct 2026).
// The routing itself is lib/w07.mjs routeInbound (tested in W07.test.mjs / wa-banners.test.mjs):
//  - taps read msg.payload OR msg.list_id; cancel_reason:<code>:<booking_id> (the cancel card's reason list) -> W10;
//  - while conv_state.cancel_reason_pending.until is ahead and a booking is live, free text -> W10 with
//    delegate { action: 'cancel_reason_text' } (lib/w10.mjs classifyOp -> cancel, the text stored as the reason);
//  - an opted-out lead's every message -> W15 (reason stop_followup), never Lindi or any other sender.
// This script carries routeInbound's `delegate` on the routed item ("Route (deterministic) + prefilter"), so W10 reads
// it exactly as it reads a Lindi delegation. W07.json is maintained as JSON, so this script is the reproducible record of
// the change. Idempotent. Run after the other W07 patches: node automation/patch-w07-cancel-stop.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };
const swap = (n, key, from, to) => {
  const v = n.parameters[key];
  if (v.includes(to)) return false;
  if (!v.includes(from)) throw new Error(`W07 "${n.name}": anchor not found: ${from.slice(0, 60)}`);
  n.parameters[key] = v.replace(from, to);
  return true;
};

const changed = [
  swap(node('Route (deterministic) + prefilter'), 'jsCode',
    'return { json: { route: r.route, reason: r.reason, msg,', 'return { json: { route: r.route, reason: r.reason, ...(r.delegate ? { delegate: r.delegate } : {}), msg,'),
];

if (changed.some(Boolean)) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w07-cancel-stop:', changed.map((c) => (c ? 'changed' : 'already')).join(' '));
