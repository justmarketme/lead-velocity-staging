'use strict';
// automation/lib/egress-gate.cjs  (I-54c)
// One definition of "a node that can send to the outside world" and "gated by DRY_RUN_SENDS", shared by
// (a) the generators that call gateSenders() on their finished workflow object and
// (b) tests/egress-dryrun.test.mjs, which fails when any workflow JSON has an ungated sender.
// Pure, no I/O. Idempotent: running gateSenders twice changes nothing.
const crypto = require('node:crypto');

const DRY_RE = /DRY_RUN/;
const SUB_SEND_ID = 'smc-whatsapp-send'; // SUB-whatsapp-send honours DRY_RUN_SENDS itself (SUB.test.mjs)
const GATE_PREFIX = 'Live send? (';
const STUB_PREFIX = 'Dry-run stub (';

const params = (n) => JSON.stringify(n.parameters || {});

/** 'whatsapp' | 'twilio' | 'email' | 'messenger' | null. executeWorkflow -> SUB-whatsapp-send is not a sender here (the sub gates itself). */
function senderKind(n) {
  const t = String(n.type || '');
  const s = params(n);
  if (t.endsWith('.whatsApp') && /"operation":"send/.test(s)) return 'whatsapp';
  if (t.endsWith('.microsoftOutlook') && /"operation":"(send|sendAndWait|reply)"/.test(s)) return 'email';
  if (t.endsWith('.emailSend')) return 'email';
  if (!t.endsWith('.httpRequest')) return null;
  const url = String((n.parameters || {}).url || '');
  if (/api\.twilio\.com/i.test(url)) return 'twilio';
  if (/graph\.facebook\.com/i.test(url) && /\/messages(['"\s}]|$)/.test(url)) {
    // WhatsApp Cloud API sends use PHONE_NUMBER_ID / pnid; Messenger / Instagram DMs use the page or IG owner id.
    return /owner_id|private_replies/.test(url) ? 'messenger' : 'whatsapp';
  }
  if (/graph\.facebook\.com/i.test(url) && /private_replies/.test(url)) return 'messenger';
  if (/graph\.microsoft\.com/i.test(url) && /sendMail/i.test(url)) return 'email';
  if (/graph_url/.test(url) || /graph_url/.test(s)) return 'email'; // W20: URL built in a Code node (sendMail)
  return null;
}

function parentsOf(wf) {
  const par = {};
  for (const [src, c] of Object.entries(wf.connections || {})) {
    for (const arr of Object.values(c)) for (const outs of arr || []) for (const x of outs || []) (par[x.node] ||= new Set()).add(src);
  }
  return par;
}

/** True when the node itself, or any node upstream of it in the same workflow, reads DRY_RUN*. */
function isGated(wf, node, par = parentsOf(wf)) {
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const seen = new Set([node.name]);
  const stack = [node.name];
  while (stack.length) {
    const cur = stack.pop();
    if (DRY_RE.test(params(byName[cur] || {}).replace(/stickyNote/g, '')) && (byName[cur] || {}).type !== 'n8n-nodes-base.stickyNote') return true;
    for (const p of par[cur] || []) if (!seen.has(p)) { seen.add(p); stack.push(p); }
  }
  return false;
}

const uid = (s) => { const h = crypto.createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

/** Ungated senders of a workflow: [{ name, kind }]. */
function findUngated(wf) {
  const par = parentsOf(wf);
  const out = [];
  for (const n of wf.nodes || []) {
    const kind = senderKind(n);
    if (kind && !isGated(wf, n, par)) out.push({ name: n.name, kind });
  }
  return out;
}

/**
 * Insert  [parents] -> IF "Live send? (X)" -true-> X  /  -false-> Code "Dry-run stub (X)" -> X's downstream.
 * The stub passes the input through with a fake 2xx response so Log / Mark-sent nodes behave as after a real send.
 */
function gateSenders(wf) {
  for (const { name, kind } of findUngated(wf)) {
    const x = wf.nodes.find((n) => n.name === name);
    const [px, py] = x.position || [0, 0];
    const gate = { id: uid('gate:' + name), name: GATE_PREFIX + name + ')', type: 'n8n-nodes-base.if', typeVersion: 2, position: [px - 200, py],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: 'c1', leftValue: "={{ $env.DRY_RUN_SENDS !== 'true' }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } };
    const stub = { id: uid('stub:' + name), name: STUB_PREFIX + name + ')', type: 'n8n-nodes-base.code', typeVersion: 2, position: [px, py + 160],
      parameters: { mode: 'runOnceForAllItems', jsCode: `// DRY_RUN_SENDS=true: nothing leaves the box (${kind}). Pass the input on with a fake 2xx so downstream logging still runs.\nreturn $input.all().map((i, n) => ({ json: { ...i.json, dry_run: true, statusCode: 200, body: { messages: [{ id: 'dry:' + n }] } } }));` } };
    // 1. re-point every connection that targets X at the gate
    for (const c of Object.values(wf.connections)) for (const arr of Object.values(c)) for (const outs of arr) for (const t of outs) if (t.node === name) t.node = gate.name;
    // 2. gate true -> X, false -> stub; stub -> everything X fed
    wf.connections[gate.name] = { main: [[{ node: name, type: 'main', index: 0 }], [{ node: stub.name, type: 'main', index: 0 }]] };
    const downstream = wf.connections[name]?.main?.[0] || [];
    wf.connections[stub.name] = { main: [downstream.map((t) => ({ ...t }))] };
    wf.nodes.push(gate, stub);
  }
  return wf;
}

module.exports = { senderKind, isGated, findUngated, gateSenders, parentsOf, SUB_SEND_ID };
