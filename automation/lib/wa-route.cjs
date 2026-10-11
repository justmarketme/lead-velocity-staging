'use strict';
// automation/lib/wa-route.cjs (2026-10-11): every WhatsApp send goes through ONE transport, SUB-whatsapp-send
// (smc-whatsapp-send), so WHATSAPP_PROVIDER = meta | twilio switches the whole flow with one env flag.
//
// routeWaSends(wf, opts) finds each node that posts to the WhatsApp Cloud API directly (lib/egress-gate.cjs
// senderKind 'whatsapp': an HTTP Request to graph.facebook.com/.../messages, or an n8n WhatsApp node) and replaces it
// IN PLACE, keeping its name and its connections:
//
//   [parents] -> Code "SUB input (<name>)"  -> Execute Workflow "<name>" (smc-whatsapp-send, waits) -> [same children]
//
// The Code node turns the body the workflow already built (the old node's jsonBody expression, e.g. $json.wa) into a
// prebuilt sub-workflow input; the sub returns { ok, external_id, error, messages: [{ id }] }, so every downstream
// "$json.messages[0].id" expression keeps working and now reads the Twilio MessageSid under WHATSAPP_PROVIDER=twilio.
// Shared by the generators (called after gateSenders) and route-wa-sends.mjs (workflow JSON without a generator).
// Pure, no I/O, idempotent (a routed node is an executeWorkflow and is not found again).
const crypto = require('node:crypto');
const { senderKind } = require('./egress-gate.cjs');

const SUB_ID = 'smc-whatsapp-send';
const ADAPTER_PREFIX = 'SUB input (';
const uid = (s) => { const h = crypto.createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

/** Direct WhatsApp senders of a workflow (names). */
function directWaSends(wf) {
  return (wf.nodes || []).filter((n) => senderKind(n) === 'whatsapp').map((n) => n.name);
}

/** The JS expression an HTTP send node posts: '={{ JSON.stringify(EXPR) }}' -> 'EXPR'. */
function bodyExpr(n) {
  const raw = String((n.parameters || {}).jsonBody || '').trim();
  const m = /^=\{\{\s*JSON\.stringify\(([\s\S]+)\)\s*\}\}$/.exec(raw);
  return m ? m[1].trim() : null;
}

/** A brand phone-number-id expression inside the Graph URL (W03: $json.out.pnid), else null (env PHONE_NUMBER_ID). */
function pnidExpr(n) {
  const url = String((n.parameters || {}).url || '');
  if (/PHONE_NUMBER_ID/.test(url)) return null;
  const m = /'\/'\s*\+\s*(\$json[\w.]*)\s*\+\s*'\/messages'/.exec(url) || /\{\{\s*(\$json[\w.]*)\s*\}\}\/messages/.exec(url);
  return m ? m[1] : null;
}

/** n8n WhatsApp node (text send) -> a JS expression for the Cloud API text body. */
function whatsAppNodeExpr(n) {
  const p = n.parameters || {};
  const js = (v) => {
    const s = String(v == null ? '' : v);
    if (/^=\{\{([\s\S]*)\}\}$/.test(s.trim()) && (s.match(/\{\{/g) || []).length === 1) return `(${/^=\{\{([\s\S]*)\}\}$/.exec(s.trim())[1].trim()})`;
    if (s.startsWith('=')) { // template text with {{ }} parts
      const parts = s.slice(1).split(/(\{\{[\s\S]*?\}\})/).filter((x) => x !== '');
      return '(' + parts.map((x) => (/^\{\{/.test(x) ? `String(${x.slice(2, -2).trim()})` : JSON.stringify(x))).join(' + ') + ')';
    }
    return JSON.stringify(s);
  };
  return `{ messaging_product: 'whatsapp', to: ${js(p.recipientPhoneNumber)}, type: 'text', text: { body: ${js(p.textBody)} } }`;
}

/**
 * opts: { caller: 'W09', nodes: { '<send node name>': { record: bool (default false), bypass_suppression?: bool,
 *          wa?: '<JS expr override>' } } }
 * record defaults to false because almost every caller writes its own communications row from the returned id; set
 * record:true for a send whose workflow does not (W05, W08 close line, W10, W11, W23, W28): the sub then writes it.
 */
function routeWaSends(wf, opts = {}) {
  const caller = opts.caller || String(wf.name || wf.id || 'workflow').split(' ')[0];
  for (const name of directWaSends(wf)) {
    const x = wf.nodes.find((n) => n.name === name);
    const cfg = (opts.nodes || {})[name] || {};
    const isHttp = /httpRequest$/.test(x.type);
    const wa = cfg.wa || (isHttp ? bodyExpr(x) : whatsAppNodeExpr(x));
    if (!wa) throw new Error(`wa-route: ${caller} "${name}": cannot read the message body expression`);
    const pnid = isHttp ? pnidExpr(x) : null;
    const record = cfg.record === true;
    const adapterName = ADAPTER_PREFIX + name + ')';
    const [px, py] = x.position || [0, 0];
    const jsCode = [
      `// lib/wa-route.cjs: "${name}" sends through smc-whatsapp-send (WHATSAPP_PROVIDER meta | twilio). Generated: edit the`,
      `// generator / route-wa-sends.mjs config, not this node. record:${record} (${record ? 'the sub writes the communications row' : 'this workflow logs the message from the returned id'}).`,
      `const wa = ${wa};`,
      `const exec = (typeof $execution !== 'undefined' && $execution && $execution.id) || 'x';`,
      `const idx = (typeof $itemIndex !== 'undefined') ? $itemIndex : 0;`,
      'return { json: {',
      "  kind: 'prebuilt', wa, to: wa && wa.to,",
      `  record: ${record}, caller: ${JSON.stringify(caller)}, bypass_suppression: ${cfg.bypass_suppression === true},`,
      `  phone_number_id: ${pnid ? `(${pnid}) || null` : 'null'},`,
      `  lead_id: ${cfg.lead_id || 'null'}, broker_id: ${cfg.broker_id || 'null'},`,
      `  correlation: ${JSON.stringify(caller + ':' + name + ':')} + exec + ':' + idx,`,
      '} };',
    ].join('\n');
    const adapter = { id: uid('wa-route:' + caller + ':' + name), name: adapterName, type: 'n8n-nodes-base.code', typeVersion: 2, position: [px - 120, py + 120],
      parameters: { mode: 'runOnceForEachItem', jsCode } };
    // 1. every connection that targeted the send now targets the adapter
    for (const c of Object.values(wf.connections || {})) for (const arr of Object.values(c)) for (const outs of arr || []) for (const t of outs || []) if (t.node === name) t.node = adapterName;
    wf.connections[adapterName] = { main: [[{ node: name, type: 'main', index: 0 }]] };
    // 2. the send node itself becomes the waiting sub-call (same name: downstream $('<name>') references keep working)
    const idx = wf.nodes.indexOf(x);
    wf.nodes[idx] = { id: x.id, name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, position: x.position,
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: SUB_ID, cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } } };
    wf.nodes.push(adapter);
  }
  return wf;
}

module.exports = { routeWaSends, directWaSends, bodyExpr, pnidExpr, whatsAppNodeExpr, SUB_ID, ADAPTER_PREFIX };
