// automation/patch-w07-never-silent-alert.mjs - the owner alert for W07's "never silent" fallback (18 Oct 2026).
// The fallback opened a console escalation, but nothing pushes an escalation to anyone: KG's 23:20 test reached a held lead
// (held_broker_not_ready) and only the client heard anything. Now the escalation is followed by ONE message to Jono through
// EMMA (POST https://emmadoesit.cloud/api/notify, x-emma-secret, the W38 lead-alert path), behind DRY_RUN_SENDS like every
// sender. Run after patch-w07-never-silent.mjs. Idempotent: drops the nodes it owns and adds them again.
// Run: node automation/patch-w07-never-silent-alert.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { gateSenders } = createRequire(import.meta.url)('./lib/egress-gate.cjs');
const FILE = new URL('./W07.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const wf = JSON.parse(raw);
const P = 'Never silent: ';
const WAIT = `${P}wait 25 s`, ESC = `${P}escalation`;
const BUILD = `${P}owner alert (lib w07.neverSilentAlert)`, SEND = `${P}notify Jono (EMMA /api/notify)`;
const OWN = [BUILD, SEND, `Live send? (${SEND})`, `Dry-run stub (${SEND})`];

wf.nodes = wf.nodes.filter((n) => !OWN.includes(n.name));
for (const k of OWN) delete wf.connections[k];
for (const src of Object.values(wf.connections)) for (const outs of src.main || []) if (Array.isArray(outs)) {
  for (let i = outs.length - 1; i >= 0; i--) if (OWN.includes(outs[i].node)) outs.splice(i, 1);
}
const esc = wf.nodes.find((n) => n.name === ESC);
if (!esc) throw new Error(`${ESC} missing: run patch-w07-never-silent.mjs first`);
const [x, y] = esc.position;
wf.nodes.push(
  { id: 'ns-alert-build', name: BUILD, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 220, y],
    parameters: { mode: 'runOnceForEachItem', jsCode: `const L = require('lv-automation').w07;\nconst j = $('${WAIT}').item.json;\nreturn { json: { request: L.neverSilentAlert(j) } };` } },
  { id: 'ns-alert-send', name: SEND, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 660, y],
    parameters: { method: 'POST', url: 'https://emmadoesit.cloud/api/notify', sendHeaders: true,
      headerParameters: { parameters: [{ name: 'content-type', value: 'application/json' }, { name: 'x-emma-secret', value: '={{ $env.EMMA_SHARED_SECRET }}' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.request) }}',
      options: { timeout: 10000, response: { response: { fullResponse: true, neverError: true } } } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: 'continueRegularOutput',
    notes: 'Owner alert for every never-silent fallback (lib/w07.mjs neverSilentAlert): first name, the silent hand-off, the lead id; never the number or the message.' },
);
const c = (wf.connections[ESC] ||= { main: [[]] });
if (!c.main[0]) c.main[0] = [];
c.main[0].push({ node: BUILD, type: 'main', index: 0 });
wf.connections[BUILD] = { main: [[{ node: SEND, type: 'main', index: 0 }]] };
gateSenders(wf); // "Live send? (...)" + "Dry-run stub (...)" in front of the new sender (DRY_RUN_SENDS)

const indent = /^\{\n( +)"/.exec(raw)?.[1].length || 2;
writeFileSync(FILE, JSON.stringify(wf, null, indent) + '\n');
console.log('W07: never-silent owner alert wired after the escalation (gated)');
