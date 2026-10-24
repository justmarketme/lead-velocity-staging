// automation/patch-w07-preconsent-handoff.mjs - W07: distress or "speak to a person" from a number with no lead yet
// (21 Oct 2026, Jono). routeInbound returns route 'handoff_pre_consent' (lib/w07.mjs); this adds the Route output and a
// Code node that builds one ops_alert per ops number (Jonathan / KG) into the existing alert send chain. Nothing is sent
// to the person and the route does not pass the "Never silent" check, so no fallback goes out either.
// Idempotent. Run: node automation/patch-w07-preconsent-handoff.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const F = new URL('./W07.json', import.meta.url);
const w = JSON.parse(readFileSync(F, 'utf8'));
const KEY = 'handoff_pre_consent';
const NODE = 'Pre-consent handoff: alert ops (nothing to the person)';
const ALERT_NEXT = 'Live send? (alert)';

const route = w.nodes.find((n) => n.name === 'Route');
const rules = route.parameters.rules.values;
if (!rules.some((r) => r.outputKey === KEY)) {
  // The Switch's last output is the fallback ("extra"): it moves down one slot when a rule is added.
  const outsBefore = w.connections.Route.main;
  const fallback = outsBefore[rules.length] || [];
  outsBefore[rules.length] = [];
  outsBefore[rules.length + 1] = fallback;
  const tpl = JSON.parse(JSON.stringify(rules.find((r) => r.outputKey === 'paused')));
  tpl.outputKey = KEY;
  tpl.conditions.conditions[0].id = 's' + rules.length; // W07.test I-51c: rule ids are s0..sN in order
  tpl.conditions.conditions[0].rightValue = KEY;
  rules.push(tpl);
}
const idx = rules.findIndex((r) => r.outputKey === KEY);

const code = `// ${KEY}: lib/w07.mjs routeInbound. One ops_alert per ops number; the person gets nothing automated.
const out = [];
$input.all().forEach((it, i) => {
  const red = String(it.json.reason || '').startsWith('distress'); // the Route node carries route + reason only
  const from = String((it.json.msg && it.json.msg.from) || ''); // full number: the team must be able to reply to someone with no lead yet
  for (const t of [$env.OPS_WHATSAPP_JONATHAN, $env.OPS_WHATSAPP_KG].filter(Boolean)) {
    out.push({ json: { wa: { messaging_product: 'whatsapp', to: t, type: 'template', template: { name: 'ops_alert', language: { code: 'en' }, components: [
      { type: 'body', parameters: [
        { type: 'text', text: 'New WhatsApp, ' + (red ? 'distress' : 'asked for a person') + ' (no consent yet): ' + from },
        { type: 'text', text: 'now' },
        { type: 'text', text: red ? 'Red: reply personally, nothing automated was sent' : 'Waiting for a person, nothing automated was sent' },
        { type: 'text', text: 'Reply from the SortMyCover WhatsApp' } ] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'console' }] } ] } } }, pairedItem: { item: i } });
  }
});
return out;`;

let node = w.nodes.find((n) => n.name === NODE);
if (!node) {
  const paused = w.nodes.find((n) => n.name === 'Paused / opted out: log only');
  node = { parameters: {}, id: 'w07-preconsent-handoff', name: NODE, type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [paused.position[0], paused.position[1] + 160] };
  w.nodes.push(node);
}
node.parameters = { mode: 'runOnceForAllItems', jsCode: code };

const outs = w.connections.Route.main;
while (outs.length <= idx) outs.push([]);
outs[idx] = [{ node: NODE, type: 'main', index: 0 }];
w.connections[NODE] = { main: [[{ node: ALERT_NEXT, type: 'main', index: 0 }]] };

writeFileSync(F, JSON.stringify(w, null, 2) + '\n');
console.log(`W07: route ${KEY} -> "${NODE}" -> "${ALERT_NEXT}" (output ${idx})`);
