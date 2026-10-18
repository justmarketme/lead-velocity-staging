// automation/patch-w07-typing.mjs - Lindi's WhatsApp typing dots (Jono, 17-18 Oct 2026: "she must have those three dots like
// she's still typing ... not just immediate responses").
// Two fixes, idempotent:
//  1. Twilio's typing API (Public Beta, POST messaging.twilio.com/v3/Indicators/Typing.json) answers 400 to channel
//     'whatsapp'; it needs 'WHATSAPP' (tested live 18 Oct: lowercase 400, uppercase {"success":true}). Every live call failed,
//     so no dots ever showed.
//  2. The only call was made AFTER the model had written the reply (3-5 s in), followed by a pause that was often 0.8 s, so
//     even working dots would barely show. Now the dots also go up the moment a message arrives (they last until the reply is
//     delivered or 25 s), and the existing call before the human pause keeps them up.
// Run: node automation/patch-w07-typing.mjs && node automation/patch-w07-never-silent.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const wf = JSON.parse(readFileSync(FILE, 'utf8'));
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };

const LATE = 'Typing indicator (Lindi, Twilio)';
const ROUTE = 'Route (deterministic) + prefilter';
const GATE = 'Show typing dots now? (Twilio)';
const EARLY = 'Typing indicator on arrival (Lindi, Twilio)';
const body = (expr) => `={{ JSON.stringify({ channel: 'WHATSAPP', messageId: ${expr} }) }}`;

// 1. the existing call: channel in capitals
const late = node(LATE);
late.parameters.jsonBody = body('$json.inbound_wamid');

// 2. dots on arrival, beside the normal flow (never in its way: no outgoing connections, errors ignored)
wf.nodes = wf.nodes.filter((n) => n.name !== GATE && n.name !== EARLY);
delete wf.connections[GATE]; delete wf.connections[EARLY];
for (const src of Object.values(wf.connections)) for (const outs of src.main || []) if (Array.isArray(outs)) {
  for (let i = outs.length - 1; i >= 0; i--) if (outs[i].node === GATE || outs[i].node === EARLY) outs.splice(i, 1);
}
const route = node(ROUTE);
const [rx, ry] = route.position;
// no dots for STOP (W15 sends one confirmation), opted-out, a person handling the chat, or the W03 hand-back loop
wf.nodes.push({
  id: 'ty-gate', name: GATE, type: 'n8n-nodes-base.if', typeVersion: 2, position: [rx + 220, ry - 260],
  parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: 'c1',
    leftValue: "={{ String($env.WHATSAPP_PROVIDER === 'twilio' && /^(SM|MM)[0-9a-f]{32}$/.test(($json.msg && $json.msg.wamid) || '') && !['W15', 'ignore_opted_out', 'paused', 'ignore_loop'].includes($json.route) && !($json.msg && $json.msg.origin === 'w03')) }}",
    rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} },
});
wf.nodes.push({
  id: 'ty-early', name: EARLY, type: late.type, typeVersion: late.typeVersion, position: [rx + 440, ry - 300], onError: 'continueRegularOutput',
  notes: 'Typing dots the moment a message arrives (Twilio Public Beta; also marks the message read). They stay up until the reply is delivered or 25 s.',
  parameters: { ...JSON.parse(JSON.stringify(late.parameters)), jsonBody: body('$json.msg.wamid') },
});
const routeOuts = wf.connections[ROUTE].main;
routeOuts[0].push({ node: GATE, type: 'main', index: 0 });
wf.connections[GATE] = { main: [[{ node: EARLY, type: 'main', index: 0 }], []] };

writeFileSync(FILE, JSON.stringify(wf, null, 2) + '\n');
console.log('W07.json: typing dots fixed (WHATSAPP) and shown on arrival');
