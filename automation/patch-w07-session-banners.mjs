// automation/patch-w07-session-banners.mjs - session banners on W07's own interactive replies (Jono, 19 Oct 2026).
// With WA_SESSION_BANNERS=on, a reply that cannot carry an image header (a list on either provider; reply buttons on
// Twilio, whose twilio/quick-reply takes no media) gets its header card as an image message FIRST, then the reply
// (lib/wa-banner.cjs sessionBanner, read through lv-automation waProvider). Off (default): the plan node passes the
// item through unchanged and the reply goes exactly as before. The banner goes through smc-whatsapp-send (DRY_RUN_SENDS,
// suppression, provider switch), behind the same reply claim as the reply (w07:reply:{wamid}), with its own correlation,
// and a failure never stops the reply (onError continue). W07.json is maintained as JSON, so this script is the
// reproducible record of the change. Idempotent. Run after the other W07 patches: node automation/patch-w07-session-banners.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const has = (name) => wf.nodes.some((x) => x.name === name);
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };

const CARRY = 'Carry reply after pause';
const MAIN = 'SUB input (Send WhatsApp (session, in 24-h window))';
const PLAN = 'Session banner plan (W07)';
const IF = 'Banner first? (W07)';
const B_IN = 'SUB input (WhatsApp send (banner, W07))';
const B_SEND = 'WhatsApp send (banner, W07)';
const DONE = 'Banner done: the message (W07)';

let changed = false;
if (!has(PLAN)) {
  const [x, y] = node(MAIN).position || [0, 0];
  node(CARRY);
  wf.nodes.push(
    { id: 'w07-banner-plan', name: PLAN, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x - 360, y - 160], parameters: { mode: 'runOnceForEachItem', jsCode:
      "// lib/wa-banner.cjs (patch-w07-session-banners.mjs): WA_SESSION_BANNERS=on -> the header card first for a list / Twilio buttons.\n" +
      "const P = require('lv-automation').waProvider;\n" +
      "const sb = P.sessionBanner($json.wa, { WA_SESSION_BANNERS: $env.WA_SESSION_BANNERS, WHATSAPP_PROVIDER: $env.WHATSAPP_PROVIDER });\n" +
      'return { json: { ...$json, wa: sb.wa, _banner: sb.banner } };' } },
    { id: 'w07-banner-if', name: IF, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x - 240, y - 160], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ id: 'c1', leftValue: '={{ !!$json._banner }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
    { id: 'w07-banner-in', name: B_IN, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x - 120, y - 320], parameters: { mode: 'runOnceForEachItem', jsCode: [
      '// The banner image through smc-whatsapp-send (same transport, DRY_RUN_SENDS and suppression as the reply); own correlation.',
      'const wa = $json._banner;',
      "const exec = (typeof $execution !== 'undefined' && $execution && $execution.id) || 'x';",
      "const idx = (typeof $itemIndex !== 'undefined') ? $itemIndex : 0;",
      "return { json: { kind: 'prebuilt', wa, to: wa && wa.to, record: false, caller: 'W07', bypass_suppression: false, phone_number_id: null, lead_id: null, broker_id: null,",
      "  correlation: 'W07:banner:' + exec + ':' + idx } };"].join('\n') } },
    { id: 'w07-banner-send', name: B_SEND, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, position: [x, y - 320], onError: 'continueRegularOutput',
      parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } } },
    { id: 'w07-banner-done', name: DONE, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 120, y - 240], parameters: { mode: 'runOnceForEachItem', jsCode: `return { json: $('${IF}').item.json };` } },
  );
  // Carry reply after pause -> plan -> Banner first? -> (banner -> done ->) the reply
  const outs = wf.connections[CARRY].main;
  for (const o of outs) for (const t of o || []) if (t.node === MAIN) t.node = PLAN;
  wf.connections[PLAN] = { main: [[{ node: IF, type: 'main', index: 0 }]] };
  wf.connections[IF] = { main: [[{ node: B_IN, type: 'main', index: 0 }], [{ node: MAIN, type: 'main', index: 0 }]] };
  wf.connections[B_IN] = { main: [[{ node: B_SEND, type: 'main', index: 0 }]] };
  wf.connections[B_SEND] = { main: [[{ node: DONE, type: 'main', index: 0 }]] };
  wf.connections[DONE] = { main: [[{ node: MAIN, type: 'main', index: 0 }]] };
  changed = true;
}

if (changed) writeFileSync(FILE, JSON.stringify(wf, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('patch-w07-session-banners:', changed ? 'changed' : 'already');
