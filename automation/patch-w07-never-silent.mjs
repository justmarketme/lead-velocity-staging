// automation/patch-w07-never-silent.mjs - adds the "never silent" guard to automation/W07.json (17 Oct 2026).
// W07.json is maintained as JSON (no full generator), so this script is the reproducible record of the change.
// Idempotent: re-running removes the guard nodes it owns and adds them again. Logic lives in lib/w07.mjs
// (NEVER_SILENT_*, neverSilentSend), tested by automation/tests/W07.test.mjs.
// Run: node automation/patch-w07-never-silent.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const wf = JSON.parse(readFileSync(FILE, 'utf8'));
const P = 'Never silent: ';
const WAIT = `${P}wait 25 s`, CHECK = `${P}anything sent since the inbound?`, IFN = `${P}nothing went out?`;
const BUILD = `${P}fallback (lib w07.neverSilentSend)`, SEND = `${P}send fallback`, ESC = `${P}escalation`;
const OWN = [WAIT, CHECK, IFN, BUILD, SEND, ESC];

// drop any earlier copy (idempotent)
wf.nodes = wf.nodes.filter((n) => !OWN.includes(n.name));
for (const k of OWN) delete wf.connections[k];
for (const src of Object.values(wf.connections)) for (const outs of src.main || []) if (Array.isArray(outs)) {
  for (let i = outs.length - 1; i >= 0; i--) if (OWN.includes(outs[i].node)) outs.splice(i, 1);
}

const pgCred = wf.nodes.find((n) => n.name === 'Store outbound').credentials;
const sendNode = wf.nodes.find((n) => n.name === 'Send WhatsApp (session, in 24-h window)');
const at = (x, y) => [x, y];
const X = 2600, Y = 2200;
wf.nodes.push(
  { id: 'ns-wait', name: WAIT, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: at(X, Y),
    parameters: { resume: 'timeInterval', amount: 25, unit: 'seconds' },
    notes: 'WHATSAPP-OPENERS.md rule 4 (17 Oct 2026): runs in parallel with every hand-off to W03/W04/W05/W10, which send the reply themselves. lib/w07.mjs NEVER_SILENT_WAIT_S.' },
  { id: 'ns-check', name: CHECK, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: at(X + 220, Y), credentials: pgCred,
    parameters: { operation: 'executeQuery', options: { queryReplacement: "={{ [ ($json.msg && $json.msg.from) || '', ($json.lead && $json.lead.id) || '', String(($json.msg && $json.msg.at_ms) || Date.now()), ($json.msg && $json.msg.wamid) || '', $json.brand_id || '' ] }}" },
      query: `-- Never silent: any outbound WhatsApp to this number (or lead) since the inbound? If none and the number is not opted out,
-- claim the one fallback for this inbound (w07:silent:{wamid}), so a W03 -> W07 hand-back cannot send a second one.
WITH s AS (
  SELECT EXISTS (SELECT 1 FROM public.communications c
                  WHERE c.direction = 'outbound' AND c.channel = 'whatsapp'
                    AND c.created_at >= to_timestamp($3::bigint / 1000.0) - interval '5 seconds'
                    AND (c.recipient_contact = $1 OR (nullif($2, '') IS NOT NULL AND c.lead_id = nullif($2, '')::uuid))) AS sent,
         EXISTS (SELECT 1 FROM public.suppression x
                  WHERE x.mobile_hash = public.smc_hash_contact($1) AND x.source <> 'no_consent_ctwa') AS suppressed,
         EXISTS (SELECT 1 FROM public.leads l WHERE l.phone = $1 AND l.opted_out_at IS NOT NULL) AS opted_out),
c AS (
  INSERT INTO public.webhook_events (source, external_id, brand_id, signature_ok)
  SELECT 'whatsapp', 'w07:silent:' || $4, nullif($5, '')::uuid, true
    FROM s WHERE NOT s.sent AND NOT s.suppressed AND NOT s.opted_out AND $4 <> '' AND $1 <> ''
  ON CONFLICT (source, external_id) DO NOTHING
  RETURNING id)
SELECT s.sent, s.suppressed, s.opted_out, (SELECT id FROM c) AS claim_id FROM s;` },
    onError: 'continueRegularOutput' },
  { id: 'ns-if', name: IFN, type: 'n8n-nodes-base.if', typeVersion: 2, position: at(X + 440, Y),
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ id: 'c1', leftValue: '={{ String(!!$json.claim_id) }}', rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} } },
  { id: 'ns-build', name: BUILD, type: 'n8n-nodes-base.code', typeVersion: 2, position: at(X + 660, Y - 100),
    parameters: { mode: 'runOnceForEachItem', jsCode: `const L = require('lv-automation').w07;\nconst j = $('${WAIT}').item.json;\nreturn { json: L.neverSilentSend(j) };` } },
  { id: 'ns-send', name: SEND, type: sendNode.type, typeVersion: sendNode.typeVersion, position: at(X + 880, Y - 100),
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: true } },
    onError: 'continueRegularOutput' },
  { id: 'ns-esc', name: ESC, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: at(X + 660, Y + 100), credentials: pgCred,
    parameters: { operation: 'executeQuery', options: { queryReplacement: `={{ (() => { const j = $('${WAIT}').item.json; return [ j.brand_id || '', (j.msg && j.msg.wamid) || '', (j.lead && j.lead.id) || '', 'never_silent: hand-off to ' + (j.route || '?') + ' produced no reply in 25 s; a fallback was sent, a person must follow up' ]; })() }}` },
      query: `INSERT INTO public.escalations (brand_id, kind, severity, ref_table, ref_id, lead_id, raised_at, note)
VALUES (nullif($1, '')::uuid, 'needs_human', 'urgent', 'communications', nullif($2, ''), nullif($3, '')::uuid, now(), $4)
RETURNING id;` },
    onError: 'continueRegularOutput' },
);

const link = (from, to, out = 0) => {
  const c = (wf.connections[from] ||= { main: [] });
  while (c.main.length <= out) c.main.push([]);
  if (!c.main[out].some((x) => x.node === to)) c.main[out].push({ node: to, type: 'main', index: 0 });
};
// switch outputs by rule outputKey, so the wiring follows the rule list rather than fixed indices
const outIndex = (switchName, key) => {
  const sw = wf.nodes.find((n) => n.name === switchName);
  const i = sw.parameters.rules.values.findIndex((r) => r.outputKey === key);
  if (i < 0) throw new Error(`${switchName} has no output ${key}`);
  return i;
};
for (const key of ['W03', 'W04_list', 'W05', 'W10']) link('Route', WAIT, outIndex('Route', key));
for (const key of ['W03', 'W04', 'W10']) link('Delegate to', WAIT, outIndex('Delegate to', key));
link(WAIT, CHECK); link(CHECK, IFN); link(IFN, BUILD, 0); link(IFN, ESC, 0); link(BUILD, SEND);

writeFileSync(FILE, JSON.stringify(wf, null, 2) + '\n');
console.log('W07.json: never-silent guard on Route W03/W04_list/W05/W10 and Delegate W03/W04/W10');
