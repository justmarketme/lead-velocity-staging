// automation/patch-w07-w28-last-resort.mjs - W07: W28's "last resort" hand-off ({ lead_id, body, last_resort: true },
// the booking Flow had no slots) is sent to the lead (21 Oct 2026). Before this it fell into the W05 contact-start path,
// crashed on booking.method and the client got nothing. Route: Sub-call router rule last_resort -> load lead -> build a
// session text -> smc-whatsapp-send (record:true, so the sender logs it; opted-out/suppressed numbers are skipped there).
// Idempotent. Run: node automation/patch-w07-w28-last-resort.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const F = new URL('./W07.json', import.meta.url);
const w = JSON.parse(readFileSync(F, 'utf8'));
const SUB = 'Sub-call from? (W03 forward / W05)';
const LOAD = 'W28 last resort: load lead';
const BUILD = 'W28 last resort: build the message';
const SEND = 'W28 last resort: send (smc-whatsapp-send)';

const sw = w.nodes.find((n) => n.name === SUB);
const rules = sw.parameters.rules.values;
if (!rules.some((r) => r.outputKey === 'w28_last_resort')) {
  const outs = w.connections[SUB].main;
  const fallback = outs[rules.length] || [];
  outs[rules.length] = [];
  outs[rules.length + 1] = fallback; // the fallback ("extra") output moves down one slot
  const r = JSON.parse(JSON.stringify(rules[0]));
  r.outputKey = 'w28_last_resort';
  r.conditions.conditions[0].id = 'f' + rules.length;
  r.conditions.conditions[0].leftValue = '={{ String($json.last_resort === true) }}';
  r.conditions.conditions[0].rightValue = 'true';
  rules.push(r);
}
const idx = rules.findIndex((r) => r.outputKey === 'w28_last_resort');

const pgCred = w.nodes.find((n) => n.type === 'n8n-nodes-base.postgres' && n.credentials && n.credentials.postgres).credentials;
const base = sw.position;
const upsert = (node) => {
  const i = w.nodes.findIndex((n) => n.name === node.name);
  if (i >= 0) w.nodes[i] = { ...w.nodes[i], ...node, id: w.nodes[i].id }; else w.nodes.push(node);
};
upsert({ id: 'w07-w28-lr-load', name: LOAD, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, credentials: pgCred, alwaysOutputData: false,
  position: [base[0] + 260, base[1] + 320],
  parameters: { operation: 'executeQuery',
    query: 'SELECT l.id, l.phone, l.brand_id, l.broker_id FROM public.leads l WHERE l.id = $1::uuid AND l.opted_out_at IS NULL AND l.phone IS NOT NULL;',
    options: { queryReplacement: "={{ [$json.lead_id || '00000000-0000-0000-0000-000000000000'] }}" } } });
upsert({ id: 'w07-w28-lr-build', name: BUILD, type: 'n8n-nodes-base.code', typeVersion: 2, position: [base[0] + 520, base[1] + 320],
  parameters: { mode: 'runOnceForAllItems', jsCode: `// One session text per lead; the body is W28's own "ask for a day" text. No lead / opted out -> nothing (load returned no row).
const src = $('${SUB}').all();
return $input.all().filter((it) => it.json && it.json.id).map((it, i) => {
  const s = (src.find((x) => x.json.lead_id === it.json.id) || src[0]).json;
  const to = String(it.json.phone).replace(/\\D/g, '');
  const body = String(s.body || '').slice(0, 1000);
  return { json: { kind: 'prebuilt', wa: { messaging_product: 'whatsapp', to, type: 'text', text: { body } }, to, record: true, caller: 'W07',
    bypass_suppression: false, phone_number_id: null, lead_id: it.json.id, broker_id: it.json.broker_id || null,
    correlation: 'W07:w28_last_resort:' + it.json.id + ':' + body.length } };
}).filter((x) => x.json.wa.text.body);` } });
upsert({ id: 'w07-w28-lr-send', name: SEND, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [base[0] + 780, base[1] + 320],
  parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } } });

const outs = w.connections[SUB].main;
outs[idx] = [{ node: LOAD, type: 'main', index: 0 }];
w.connections[LOAD] = { main: [[{ node: BUILD, type: 'main', index: 0 }]] };
w.connections[BUILD] = { main: [[{ node: SEND, type: 'main', index: 0 }]] };

writeFileSync(F, JSON.stringify(w, null, 2) + '\n');
console.log(`W07: ${SUB} output ${idx} (w28_last_resort) -> ${LOAD} -> ${BUILD} -> ${SEND}; fallback at ${rules.length}`);
