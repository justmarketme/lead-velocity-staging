// Generates the four sub-workflows that callers already reference by id (LOCAL-STAGING §7, I-44b, I-48f/g/h/i):
//   automation/SUB-whatsapp-send.json (smc-whatsapp-send) · SUB-capi-send.json (smc-capi-send)
//   automation/SUB-w26-runner.json (smc-w26)              · SUB-ads-budget.json (smc-ads-budget)
// Logic lives in automation/lib/sub-*.mjs (tested by automation/tests/SUB.test.mjs through the Code nodes);
// Code nodes load it only as require('lv-automation').<name> (I-46c). All four are active:false, errorWorkflow smc-w22.
// Run: node automation/build-sub-workflows.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { ALLOWED_ORIGINS } = createRequire(import.meta.url)('./lib/public-origins.cjs'); // literal list: n8n does not evaluate expressions in allowedOrigins

const OUT = dirname(fileURLToPath(import.meta.url));
const PG = { postgres: { name: 'LV Supabase - n8n_app (least privilege)' } };
const WA_CRED = { httpHeaderAuth: { name: 'WhatsApp Cloud API (system user)' } };
const META_CRED = { httpHeaderAuth: { name: 'Meta system user token (Bearer)' } };

function wfBuilder(id, name, settingsExtra = {}) {
  const nodes = []; const connections = {}; let x = 0;
  const add = (n) => { n.id = `${id}-${nodes.length + 1}`; n.position = n.position || [x += 220, 300 + (nodes.length % 3) * 40]; nodes.push(n); return n.name; };
  const link = (from, to, out = 0) => { const c = (connections[from] ||= { main: [] }); while (c.main.length <= out) c.main.push([]); c.main[out].push({ node: to, type: 'main', index: 0 }); };
  const chain = (...names) => { for (let i = 0; i < names.length - 1; i++) link(names[i], names[i + 1]); };
  const done = () => ({ id, name, nodes, connections, active: false, settings: { executionOrder: 'v1', timezone: 'Africa/Johannesburg', errorWorkflow: 'smc-w22', callerPolicy: 'workflowsFromSameOwner', ...settingsExtra }, tags: [{ name: 'SortMyCover' }, { name: 'sub-workflow' }], meta: { generatedBy: 'automation/build-sub-workflows.mjs' } });
  return { add, link, chain, done };
}
const trigger = (name) => ({ name, type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, parameters: { inputSource: 'passthrough' } });
const code = (name, jsCode, perItem = true) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: perItem ? { mode: 'runOnceForEachItem', jsCode } : { jsCode } });
const pg = (name, query, replacement, extra = {}) => ({ name, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery', query, options: { queryReplacement: replacement } }, ...extra });
const iff = (name, expr) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2, parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: `={{ ${expr} }}`, rightValue: true, operator: { type: 'boolean', operation: 'equals' } }] }, options: {} } });
const execW22 = (name) => ({ name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-w22', cachedResultName: 'W22 Alerts' }, options: { waitForSubWorkflow: false } } });
const sticky = (name, content, position) => ({ name, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position, parameters: { content, width: 520, height: 300 } });
const w22signal = (name, body) => code(name, `// I-47g: W22 producer contract (automation/W22.md section 3), handed over by Execute Workflow smc-w22.\n${body}`);
const write = (file, wf) => writeFileSync(join(OUT, file), JSON.stringify(wf, null, 2) + '\n');

// ---------------------------------------------------------------- smc-whatsapp-send
export function whatsappSend() {
  const b = wfBuilder('smc-whatsapp-send', 'WhatsApp Send (shared sender sub-workflow)');
  const T = b.add(trigger('Called by caller (whatsapp-send)'));
  const N = b.add(code('Normalise input', "const L = require('lv-automation').subWhatsappSend;\nreturn { json: L.normalise($json) };"));
  const V = b.add(iff('Input valid?', '$json.valid === true'));
  const R0 = b.add(code('Result (rejected input)', "const L = require('lv-automation').subWhatsappSend;\nreturn { json: L.result({ action: 'skip', reason: 'invalid_input', missing: $json.missing }) };"));
  const C = b.add(pg('Load context (brand, suppression, window, template, duplicate)',
`-- prebuilt sends without ids (2026-10-11): the lead (else the broker) is resolved from the recipient digits, so the
-- communications row lands on the CRM timeline (UnifiedCommunicationHub reads communications by lead_id / broker_id).
WITH given AS (SELECT NULLIF($1, '')::uuid AS lead_id, NULLIF($2, '')::uuid AS broker_id),
rl AS (SELECT CASE WHEN g.lead_id IS NULL AND g.broker_id IS NULL THEN
         (SELECT l.id FROM public.leads l WHERE l.brand_id IS NOT NULL AND regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g') = $3
           ORDER BY l.created_at DESC LIMIT 1) END AS lead_id FROM given g),
rb AS (SELECT CASE WHEN g.lead_id IS NULL AND g.broker_id IS NULL AND (SELECT r.lead_id FROM rl r) IS NULL THEN
         (SELECT b.id FROM public.brokers b WHERE b.brand_id IS NOT NULL AND regexp_replace(coalesce(b.whatsapp_number, ''), '\\D', '', 'g') = $3
           LIMIT 1) END AS broker_id FROM given g),
tgt AS (
  SELECT COALESCE(g.lead_id, rl.lead_id) AS lead_id, COALESCE(g.broker_id, rb.broker_id) AS broker_id FROM given g, rl, rb
)
SELECT COALESCE((SELECT l.brand_id FROM public.leads l WHERE l.id = t.lead_id),
                (SELECT b.brand_id FROM public.brokers b WHERE b.id = t.broker_id))::text AS brand_id,
       CASE WHEN NULLIF($1, '') IS NULL THEN t.lead_id::text END AS resolved_lead_id,
       CASE WHEN NULLIF($2, '') IS NULL THEN t.broker_id::text END AS resolved_broker_id,
       EXISTS (SELECT 1 FROM public.suppression s WHERE s.mobile_hash = public.smc_hash_contact($3)) AS suppressed,
       (SELECT max(c.created_at) FROM public.communications c
         WHERE c.channel = 'whatsapp' AND c.direction = 'inbound' AND c.sender_type IN ('broker', 'client')
           AND ((t.lead_id IS NOT NULL AND c.lead_id = t.lead_id)
             OR (t.lead_id IS NULL AND c.broker_id = t.broker_id))) AS last_inbound_at,
       (SELECT br.template_status FROM public.brands br
         WHERE br.id = COALESCE((SELECT l.brand_id FROM public.leads l WHERE l.id = t.lead_id),
                                (SELECT b.brand_id FROM public.brokers b WHERE b.id = t.broker_id))) AS template_status,
       EXISTS (SELECT 1 FROM public.communications d
                WHERE d.workflow = 'smc-whatsapp-send' AND d.metadata->>'correlation' = $4) AS duplicate
  FROM tgt t;`,
    "={{ [ $json.lead_id || '', $json.broker_id || '', $json.to, $json.correlation ] }}"));
  const D = b.add(code('Decide (suppression, allow-list, window, template, dry run)',
    "// Order: duplicate -> suppression (smc_hash_contact, digits only) -> WHATSAPP_TEST_RECIPIENTS -> template approval /\n// 24-h window -> DRY_RUN_SENDS (external_id dry:<correlation>) -> send.\nconst L = require('lv-automation').subWhatsappSend;\nconst n = $('Normalise input').item.json;\nreturn { json: L.decide(n, $json, $env, Date.now()) };"));
  const DUP = b.add(iff('Already sent (same correlation)?', "$json.action === 'duplicate'"));
  const REC = b.add(pg('Record communications row (claim before the Graph call)',
`-- recipient_contact is the legacy NOT NULL column: the recipient in E.164 (+ digits), I-50b.
INSERT INTO public.communications (channel, direction, sender_type, recipient_type, recipient_contact, lead_id, broker_id, brand_id, content, status, external_id, failed_reason, template_name, workflow, metadata)
-- brand_id falls back to BRAND_ID: an ops alert (W22 -> Jono / KG) has no lead or broker, and n8n_app may only write brand rows
-- (RLS "smc n8n_app brand rows"; executions 3427 / 3432, 18 Oct 2026). Such a recipient is 'admin'.
SELECT 'whatsapp', 'outbound', 'system', $1, $12, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, COALESCE(NULLIF($4, '')::uuid, NULLIF($14, '')::uuid), $5, $6, NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), 'smc-whatsapp-send', $10::jsonb
 WHERE $13::boolean
   AND NOT EXISTS (SELECT 1 FROM public.communications d WHERE d.workflow = 'smc-whatsapp-send' AND d.metadata->>'correlation' = $11)
RETURNING id::text AS comm_id;`,
    "={{ (() => { const L = $json; return [ L.lead_id ? 'client' : L.broker_id ? 'broker' : 'admin', L.lead_id || '', L.broker_id || '', L.brand_id || '', L.action === 'skip' ? '[skipped]' : (L.sent_as === 'template' && L.template ? 'template:' + L.template : (L.sent_as === 'text' ? '[text]' : (L.template ? 'template:' + L.template : '[' + (L.sent_as || L.kind) + ']'))), L.action === 'skip' ? 'failed' : 'pending', L.action === 'dry' ? L.external_id : '', L.action === 'skip' ? L.reason : '', L.template || '', JSON.stringify({ correlation: L.correlation, kind: L.kind, sent_as: L.sent_as || null, dry_run: L.action === 'dry', skip_reason: L.action === 'skip' ? L.reason : null, caller: (Object.entries(L).find(e => e[0] === 'caller') || [])[1] || null, provider: L.provider || null }), L.correlation, '+' + String(L.to || '').replace(/\\D/g, ''), L.record !== false, $env.BRAND_ID || '' ]; })() }}", { onError: 'continueRegularOutput' }));
  // record:false (the caller logs the message itself, keyed by the returned id): no claim row, the send still runs.
  // a failed log insert (onError output carries json.error) never blocks the send: better a missing row than a silent alert
  const LIVE = b.add(iff('Claimed and a live send?', "(!!$json.comm_id || $json.error !== undefined || $('Decide (suppression, allow-list, window, template, dry run)').item.json.record === false) && $('Decide (suppression, allow-list, window, template, dry run)').item.json.action === 'send'"));
  const H = b.add({ name: 'Graph POST /messages', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, credentials: WA_CRED, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: "=https://graph.facebook.com/{{ $env.META_GRAPH_VERSION || 'v21.0' }}/{{ $('Decide (suppression, allow-list, window, template, dry run)').item.json.phone_number_id || $env.PHONE_NUMBER_ID }}/messages", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify($('Decide (suppression, allow-list, window, template, dry run)').item.json.payload) }}", options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 15000 } } });
  // WHATSAPP_PROVIDER=twilio: same Decide output, same claim, same DRY_RUN gate (Decide); only the transport differs.
  const PT = b.add(iff('Provider is twilio?', "$('Decide (suppression, allow-list, window, template, dry run)').item.json.provider === 'twilio'"));
  const TB = b.add(code('Build Twilio request (Messages API form)', "// ContentSid + ContentVariables numbered from the submitted template spec (lib/wa-provider.mjs twilioVarPlan);\n// session buttons / lists / Flows map to the generic Content templates (automation/templates/twilio/).\n// Basic auth: TWILIO_API_KEY_SID/SECRET, else the CRM's TWILIO_ACCOUNT_SID/AUTH_TOKEN pair. No n8n credential.\nconst L = require('lv-automation').subWhatsappSend;\nconst d = $('Decide (suppression, allow-list, window, template, dry run)').item.json;\nreturn { json: L.twilioRequest(d, $env) };"));
  const TS = b.add(iff('Twilio request built?', '!$json.twilio_skip'));
  const TH = b.add({ name: 'Twilio POST /Messages', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: '=https://api.twilio.com/2010-04-01/Accounts/{{ $env.TWILIO_ACCOUNT_SID }}/Messages.json', sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '={{ $json.auth }}' }] },
      sendBody: true, contentType: 'raw', rawContentType: 'application/x-www-form-urlencoded', body: '={{ $json.body }}', options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 15000 } } });
  const I = b.add(code('Interpret Graph response', "const L = require('lv-automation').subWhatsappSend;\n// Both providers land here (name kept for callers/tests): Graph { messages[0].id } or Twilio { sid } / { twilio_skip }.\nreturn { json: L.interpret($json) };"));
  const U = b.add(pg('Update communications row (+ leads.last_contact_at on a real wamid)',
`WITH c AS (
  UPDATE public.communications SET status = $2, external_id = NULLIF($3, ''), failed_reason = NULLIF($4, ''), updated_at = now()
   WHERE id = NULLIF($1, '')::uuid   -- record:false sends have no row here (the caller logs them)
  RETURNING lead_id
)
UPDATE public.leads SET last_contact_at = now()
 WHERE id = (SELECT lead_id FROM c) AND $3 <> '' AND $3 NOT LIKE 'dry:%'
RETURNING id::text AS lead_id;`,
    "={{ [ $('Record communications row (claim before the Graph call)').item.json.comm_id || '', $json.ok ? 'sent' : 'failed', $json.external_id || '', $json.error || '' ] }}"));
  const F = b.add(iff('Send failed?', "$('Interpret Graph response').item.json.ok !== true"));
  const S = b.add(w22signal('Alert ops: W22 signal (send failed)',
    "const d = $('Decide (suppression, allow-list, window, template, dry run)').item.json;\nconst r = $('Interpret Graph response').item.json;\nreturn { json: { signal_key: 'whatsapp_send_failed', scope: d.broker_id ? 'broker:' + d.broker_id : 'lead:' + d.lead_id, severity: 'amber', what: 'WhatsApp send failed (' + (d.template || d.sent_as) + '): ' + (r.error || 'non-2xx'), impact: 'A broker or ops message was not delivered', first_action: 'Check the template status and the Graph error in the execution', source: 'smc-whatsapp-send' } };"));
  const W = b.add(execW22('Alert ops (send failed)'));
  const RES = b.add(code('Result', "// { ok, external_id, error } (+ messages:[{id}] on success): the LAST node on every path, so a waiting caller\n// (every prebuilt send, lib/wa-route.cjs) reads it as the Execute Workflow output.\nconst L = require('lv-automation').subWhatsappSend;\nconst d = $('Decide (suppression, allow-list, window, template, dry run)').item.json;\nlet r = null; try { r = $('Interpret Graph response').item.json; } catch (e) { r = null; }\nreturn { json: L.result(d, r) };"));
  b.chain(T, N, V); b.link(V, C, 0); b.link(V, R0, 1);
  b.chain(C, D, DUP); b.link(DUP, RES, 0); b.link(DUP, REC, 1);
  b.chain(REC, LIVE); b.link(LIVE, PT, 0); b.link(LIVE, RES, 1);
  b.link(PT, TB, 0); b.link(PT, H, 1); b.chain(TB, TS); b.link(TS, TH, 0); b.link(TS, I, 1); b.link(TH, I); b.chain(H, I); b.chain(I, U, F); b.link(F, S, 0); b.link(F, RES, 1); b.chain(S, W, RES);
  b.add(sticky('Note: smc-whatsapp-send', '## smc-whatsapp-send (LOCAL-STAGING §7)\nInput: `{ to, kind, template, variables, buttons, text?, interactive?, media?, lead_id?, broker_id?, correlation }` or the §7 shape `{ broker_id, to, template: { name, body, buttons }, idempotency_key }`.\n- Idempotent on `correlation` / `idempotency_key` (communications.metadata.correlation, claimed before the Graph call).\n- Suppression via smc_hash_contact (digits). WHATSAPP_TEST_RECIPIENTS allow-list. DRY_RUN_SENDS -> external_id `dry:<correlation>`.\n- Template not approved -> session text inside 24 h if `text`/`reminder.text` given, else skipped with `email_fallback: true` (the email leg stays with the caller, needs_human).\n- WHATSAPP_PROVIDER=meta (default) posts to Graph; =twilio builds a Messages API form (ContentSid from TWILIO_CONTENT_SIDS) and posts to api.twilio.com, same gate, claim and idempotency.\n- **prebuilt** (2026-10-11, lib/wa-route.cjs): every workflow send arrives as `{ kind: prebuilt, wa, record, caller, ... }` and WAITS for `{ ok, external_id, messages: [{ id }] }`. record:false = the caller logs the row; record:true = this sub logs it on the lead / broker resolved from the number.\n- Content logged as `template:<name>` / `[text]`, never the body.', [0, 0]));
  return b.done();
}

// ---------------------------------------------------------------- smc-capi-send
export function capiSend() {
  // Execution data would hold hashed identifiers: keep none (6.3 "never log hashed or raw identifiers").
  const b = wfBuilder('smc-capi-send', 'CAPI Send (Conversions API sub-workflow)', { saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false });
  const T = b.add(trigger('Called by caller (CAPI Send)'));
  const N = b.add(code('Normalise input', "const L = require('lv-automation').subCapiSend;\nreturn { json: L.normalise($json) };"));
  const V = b.add(iff('Input valid?', '$json.valid === true'));
  const C = b.add(pg('Load lead, consent, dataset and dedupe',
`SELECT (l.id IS NOT NULL) AS found, l.consent_ads_at, l.phone, l.first_name, l.last_name, l.fbc, l.fbp, l.client_ip, l.client_user_agent,
       COALESCE(NULLIF($2, '')::uuid, l.brand_id)::text AS lead_brand_id, br.pixel_id, br.dataset_id, br.waba_id,
       EXISTS (SELECT 1 FROM public.capi_log g WHERE g.event_id = $3 AND g.event_name = $4) AS duplicate
  FROM (SELECT 1) one
  LEFT JOIN public.leads l ON l.id = NULLIF($1, '')::uuid
  LEFT JOIN public.brands br ON br.id = COALESCE(NULLIF($2, '')::uuid, l.brand_id);`,
    "={{ [ $json.lead_id || '', $json.brand_id || '', $json.event_id, $json.event_name ] }}"));
  const B = b.add(code('Build event (consent gate, no email, dry run)',
    "// Consent gate first (capi/event-spec.md). Email is never sent. DRY_RUN_SENDS: nothing is written or posted.\nconst L = require('lv-automation').subCapiSend;\nconst n = $('Normalise input').item.json;\nreturn { json: L.build(n, $json, $env, Date.now()) };"));
  const S = b.add(iff('Send?', "$json.action === 'send'"));
  const CL = b.add(pg('Claim capi_log (unique event_id + event_name)',
`-- capi_log.id is bigint identity; status CHECK allows sent|failed|skipped_no_consent|test, so the claim is written
-- pessimistically as 'failed' with error 'in_flight' and "Update capi_log" overwrites both. A crash mid-send stays failed.
INSERT INTO public.capi_log (lead_id, brand_id, event_name, event_id, action_source, status, error)
VALUES (NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, $3, $4, $5, 'failed', 'in_flight')
ON CONFLICT (event_id, event_name) DO NOTHING
RETURNING id::text AS log_id;`,
    "={{ [ $json.log.lead_id || '', $json.log.brand_id || '', $json.log.event_name, $json.log.event_id, $json.log.action_source ] }}"));
  const CLD = b.add(iff('Claimed?', '!!$json.log_id'));
  const H = b.add({ name: 'POST /{dataset}/events', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, credentials: META_CRED, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: "={{ $('Build event (consent gate, no email, dry run)').item.json.url }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify($('Build event (consent gate, no email, dry run)').item.json.body) }}", options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 15000 } } });
  const I = b.add(code('Interpret response (usage header)', "const L = require('lv-automation').subCapiSend;\nreturn { json: L.interpret($json) };"));
  const U = b.add(pg('Update capi_log',
`UPDATE public.capi_log SET status = $2, events_received = $3::int, fbtrace_id = NULLIF($4, ''), error = NULLIF($5, ''), sent_at = CASE WHEN $2 = 'sent' THEN now() END
 WHERE id = $1::bigint RETURNING id::text AS log_id;`,
    "={{ [ $('Claim capi_log (unique event_id + event_name)').item.json.log_id, $json.status, $json.events_received == null ? null : $json.events_received, $json.fbtrace_id || '', $json.error || '' ] }}"));
  const EV = b.add(iff('Test event code set and sent?', "!!$env.CAPI_TEST_EVENT_CODE && $('Interpret response (usage header)').item.json.ok === true"));
  const EL = b.add(code('Evidence line (S7-11 / S7-14)',
    "// Appended to $env.CAPI_EVIDENCE_PATH (default /data/evidence/capi-test-events.jsonl, a writable volume; the repo\n// mount is read-only). readiness.mjs S7-11 / S7-14 read that path when CAPI_EVIDENCE_PATH is set. No identifiers.\nconst L = require('lv-automation').subCapiSend;\nconst b = $('Build event (consent gate, no email, dry run)').item.json;\nconst line = L.evidenceLine(b.log, $env.CAPI_TEST_EVENT_CODE, Date.now());\nreturn { json: { line }, binary: { data: { data: Buffer.from(line, 'utf8').toString('base64'), mimeType: 'application/x-ndjson', fileName: 'capi-test-events.jsonl' } } };"));
  const EW = b.add({ name: 'Append evidence file', type: 'n8n-nodes-base.readWriteFile', typeVersion: 1, onError: 'continueRegularOutput', parameters: { operation: 'write', fileName: "={{ $env.CAPI_EVIDENCE_PATH || '/data/evidence/capi-test-events.jsonl' }}", dataPropertyName: 'data', options: { append: true } } });
  const F = b.add(iff('Failed or usage >= 80%?', "$('Interpret response (usage header)').item.json.ok !== true || $('Interpret response (usage header)').item.json.usage_pct >= 80"));
  const SG = b.add(w22signal('Alert ops: W22 signal (CAPI)',
    "const r = $('Interpret response (usage header)').item.json;\nconst b = $('Build event (consent gate, no email, dry run)').item.json;\nconst failed = r.ok !== true;\nreturn { json: { signal_key: failed ? 'capi_send_failed' : 'capi_usage_80', scope: 'capi:' + b.log.event_name, severity: 'amber', what: failed ? 'CAPI ' + b.log.event_name + ' failed after 3 tries: ' + (r.error || 'error') + ' (fbtrace ' + (r.fbtrace_id || 'n/a') + ')' : 'CAPI usage header at ' + r.usage_pct + '%', impact: failed ? 'Meta did not receive one optimisation event' : 'CAPI calls will be throttled soon', first_action: failed ? 'Check capi_log status=failed and the dataset id' : 'Back off: hold non-critical CAPI events for an hour', source: 'smc-capi-send' } };"));
  const W = b.add(execW22('Alert ops (CAPI)'));
  b.chain(T, N, V); b.link(V, C, 0); b.chain(C, B, S); b.link(S, CL, 0); b.chain(CL, CLD); b.link(CLD, H, 0);
  b.chain(H, I, U, EV); b.link(EV, EL, 0); b.link(EV, F, 1); b.chain(EL, EW, F); b.link(F, SG, 0); b.chain(SG, W);
  b.add(sticky('Note: smc-capi-send', '## smc-capi-send (LOCAL-STAGING §7)\nInput (ids only): `{ event_name, event_id, action_source, lead_id, brand_id, ctwa_clid?, value?, event_time? }`; a caller may add `user: { phone, fn, ln, external_id, ip, ua, fbc, fbp }` + `custom_data` (lead row wins).\n1. Consent gate (`leads.consent_ads_at`). 2. Hash inside (capi.buildEvent); email never. 3. Dataset by action_source. 4. Dedupe on capi_log unique(event_id, event_name); DRY_RUN writes nothing. 5. 3 tries; failure or usage >= 80% -> W22. 6. CAPI_TEST_EVENT_CODE -> evidence JSONL at CAPI_EVIDENCE_PATH.\nExecution data is not saved (hashed identifiers).', [0, 0]));
  return b.done();
}

// ---------------------------------------------------------------- smc-w26 (n8n side of the go-live runner)
export function w26Runner() {
  const b = wfBuilder('smc-w26', 'W26 Go-live runner (n8n side: first payment + signed status)');
  // A) first payment from W16 (broker may still be onboarding: nothing here requires onboarded)
  const T = b.add(trigger('Called by W16 (first payment)'));
  const N = b.add(code('Normalise first payment', "const L = require('lv-automation').subW26;\nreturn { json: L.normaliseFirstPayment($json) };"));
  const V = b.add(iff('Has broker_id?', '$json.valid === true'));
  const P = b.add(code('Plan go-live signal (GATE-VPS or readiness)', "// VPS_HOST set -> a VPS exists: skip to readiness. Otherwise GATE-VPS: one to-do for Jonathan (batched with other gates).\nconst L = require('lv-automation').subW26;\nreturn { json: L.firstPaymentPlan($json, $env) };"));
  const R = b.add(pg('Record go_live notification + to-do (once per broker)',
`WITH n AS (
  INSERT INTO ops.notifications (kind, recipient, channel, source, status, signal_key, ref_table, ref_id, dedupe_key, what, payload)
  SELECT 'go_live', 'jonathan', 'whatsapp', 'W26', 'queued', $2, 'brokers', $1, $3, $4, $5::jsonb
   WHERE NOT EXISTS (SELECT 1 FROM ops.notifications x WHERE x.dedupe_key = $3)
  RETURNING id
), p AS (
  INSERT INTO ops.proposals (source, faculty, title, owner_agent, status, evidence)
  SELECT 'manual', 'build', $6, 'devops-security', 'proposed', $3 FROM n
  RETURNING id
)
UPDATE ops.notifications SET proposal_id = (SELECT id FROM p), updated_at = now()
 WHERE id = (SELECT id FROM n)
RETURNING id::text AS notification_id;`,
    "={{ [ $json.broker_id, $json.signal_key, $json.dedupe_key, $json.what, $json.payload, $json.proposal_title ] }}"));
  b.chain(T, N, V); b.link(V, P, 0); b.chain(P, R);
  // B) signed status from provision.sh notify()
  const WH = b.add({ name: 'POST /webhook/w26/status (provision.sh, HMAC)', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: 'smc-w26-status', parameters: { httpMethod: 'POST', path: 'w26/status', authentication: 'none', responseMode: 'responseNode', options: { rawBody: true } } });
  const VH = b.add(code('Verify HMAC (X-LV-Timestamp / X-LV-Signature)',
    "// HMAC-SHA256(\"<ts>.<raw body>\", INTERNAL_HMAC_SECRET), 5-min window (verifyWebhooks.timingSafeEqualStr + checkReplayWindow).\nconst L = require('lv-automation').subW26;\nconst it = $input.first();\nlet raw = null;\ntry { if (this && this.helpers && it.binary && it.binary.data) raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); } catch (e) { raw = null; }\nif (raw == null) raw = JSON.stringify(it.json.body ?? {});\nreturn [{ json: L.verifyStatus({ headers: it.json.headers || {}, raw, body: it.json.body, secret: $env.INTERNAL_HMAC_SECRET, nowMs: Date.now() }) }];", false));
  const OK = b.add(iff('Signature valid?', '$json.ok === true'));
  const R401 = b.add({ name: 'Respond 401', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, parameters: { respondWith: 'json', responseBody: '{"error":"unauthorised"}', options: { responseCode: 401 } } });
  const R200 = b.add({ name: 'Respond 200', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, parameters: { respondWith: 'json', responseBody: '{"ok":true}', options: { responseCode: 200 } } });
  const RT = b.add(code('Route status', "const L = require('lv-automation').subW26;\nreturn { json: L.routeStatus($('Verify HMAC (X-LV-Timestamp / X-LV-Signature)').item.json.body) };"));
  const FAIL = b.add(iff('Step failed?', "$json.action === 'failed'"));
  const SG = b.add(w22signal('Alert ops: W22 signal (provision step failed)', "const L = require('lv-automation').subW26;\nreturn { json: L.failedSignal($('Route status').item.json) };"));
  const W = b.add(execW22('Alert ops (provision step failed)'));
  const RDY = b.add(iff('Ready?', "$('Route status').item.json.action === 'ready'"));
  const MR = b.add(pg('Mark ready_for_go_live + go_live_ready + Go-live to-do',
`WITH b AS (
  UPDATE public.brokers br SET status = 'ready_for_go_live', status_changed_at = now(), updated_at = now()
   WHERE br.status = 'onboarded'
     AND EXISTS (SELECT 1 FROM ops.notifications n WHERE n.kind = 'go_live' AND n.ref_table = 'brokers' AND n.ref_id = br.id::text
                   AND n.signal_key IN ('go_live_vps_gate', 'go_live_pending'))
     AND NOT EXISTS (SELECT 1 FROM ops.notifications r WHERE r.kind = 'go_live' AND r.ref_table = 'brokers' AND r.ref_id = br.id::text
                   AND r.signal_key = 'go_live_ready')
  RETURNING br.id
), p AS (
  INSERT INTO ops.proposals (source, faculty, title, owner_agent, status, evidence)
  SELECT 'manual', 'build', 'VPS live, all checks green: tap Go live for broker ' || b.id::text, 'devops-security', 'proposed', $1 FROM b
  RETURNING id, title
)
INSERT INTO ops.notifications (kind, recipient, channel, source, status, signal_key, ref_table, ref_id, dedupe_key, what, payload, proposal_id)
SELECT 'go_live', 'jonathan', 'whatsapp', 'W26', 'queued', 'go_live_ready', 'brokers', b.id::text, 'go_live:go_live_ready:' || b.id::text,
       'VPS live, all checks green', $1::jsonb, (SELECT p.id FROM p WHERE p.title LIKE '%' || b.id::text)
  FROM b
RETURNING ref_id AS broker_id;`,
    "={{ [ $('Route status').item.json.evidence ] }}"));
  b.chain(WH, VH, OK); b.link(OK, R200, 0); b.link(OK, R401, 1);
  b.chain(R200, RT, FAIL); b.link(FAIL, SG, 0); b.link(FAIL, RDY, 1); b.chain(SG, W); b.link(RDY, MR, 0);
  b.add(sticky('Note: smc-w26', '## smc-w26 (LOCAL-STAGING §7, vps/W26.md)\n- **First payment** (W16): `{ op: first_payment, broker_id, cycle_id }`. Records one `ops.notifications` go_live row (`go_live_vps_gate`, or `go_live_pending` when VPS_HOST is set) and one `ops.proposals` to-do (faculty build). Does not require `onboarded`.\n- **POST /webhook/w26/status**: provision.sh notify() `{ step, name, ok, vps }`, HMAC `X-LV-Timestamp` / `X-LV-Signature`. ok:false -> W22 workflow_failed. `ready` -> brokers onboarded with a pending go-live row -> `ready_for_go_live`, `go_live_ready` notification + Go-live to-do.\n- Never provisions, buys, unpauses or calls Meta: going live is Jonathan\'s tap.', [0, 0]));
  return b.done();
}

// ---------------------------------------------------------------- smc-ads-budget (NH-57 default (a): propose only)
export function adsBudget() {
  const b = wfBuilder('smc-ads-budget', 'Ads budget (propose-only sub-workflow, NH-57 default a)');
  const T = b.add(trigger('Called by W16 / W19 (raise / lower)'));
  const N = b.add(code('Normalise input', "const L = require('lv-automation').subAdsBudget;\nreturn { json: L.normalise($json) };"));
  const V = b.add(iff('Input valid?', '$json.valid === true'));
  const P = b.add(code('Build proposal + approval row', "// Every change is a proposal for Jonathan; the Meta write path is never called from here (6.2 confirm-to-apply).\nconst L = require('lv-automation').subAdsBudget;\nreturn { json: L.proposal($json) };"));
  const I = b.add(pg('Insert proposal + approval outbox row (once per broker, cycle, op)',
`WITH p AS (
  INSERT INTO ops.proposals (source, faculty, title, metric, number_at_decision, cost_zar, owner_agent, status, mechanism, evidence)
  SELECT $1, $2, $3, $4, $5::numeric, $6::numeric, $7, 'proposed', $8, $9
   WHERE NOT EXISTS (SELECT 1 FROM ops.notifications x WHERE x.dedupe_key = $10)
  RETURNING id
)
INSERT INTO ops.notifications (kind, recipient, channel, source, status, ref_table, ref_id, dedupe_key, proposal_id, what, payload)
SELECT 'approval', 'jonathan', 'console', 'ads_budget', 'queued', 'proposals', p.id::text, $10, p.id, $3, $11::jsonb
  FROM p
RETURNING proposal_id::text AS proposal_id;`,
    "={{ (() => { const p = $json.proposal; const n = $json.notification; return [ p.source, p.faculty, p.title, p.metric, p.number_at_decision, p.cost_zar, p.owner_agent, p.mechanism, p.evidence, n.dedupe_key, JSON.stringify(n.payload) ]; })() }}"));
  b.chain(T, N, V); b.link(V, P, 0); b.chain(P, I);
  b.add(sticky('Note: smc-ads-budget (NH-57)', '## smc-ads-budget: propose only (NH-57 default a)\nInput `{ op: raise|lower, broker_id, cycle_id, amount_zar, reason }` (also `{ action, media_share_zar }`). Every change becomes an `ops.proposals` row (faculty media, source `ads_budget`; platform-architect adds the value to the check, I-48i) plus one `ops.notifications` approval row (channel console, source ads_budget, never `console`, so W32 does not read it as a decision). The Meta budget write path is never called here.\n\n**Alternative (b), not built:** a decrease-only system path in `ads/meta-ads.js` (ads-api-engineer) so `lower` applies unattended at cycle end without a confirmToken, while `raise` keeps the confirm gate. Money decision: Jonathan picks (a) or (b).', [0, 0]));
  return b.done();
}

// ---------------------------------------------------------------- smc-visit-beacon (I-32b)
export function visitBeacon() {
  const b = wfBuilder('smc-visit-beacon', 'Visit beacon (first-party page-view counters, I-32b)');
  const WH = b.add({ name: 'POST /beacon (landing page sendBeacon)', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: 'smc-visit-beacon', parameters: { httpMethod: 'POST', path: 'beacon', authentication: 'none', responseMode: 'responseNode', options: { rawBody: false, allowedOrigins: ALLOWED_ORIGINS } } });
  const N = b.add(code('Validate, DNT, rate limit, count', "// No IP, UA, referrer or session id leaves this node. The session id keys an in-memory 60-s rate window only.\nconst L = require('lv-automation').subVisitBeacon;\nconst it = $input.first().json;\nconst ev = L.normalise({ body: it.body, headers: it.headers || {}, env: $env });\nif (!ev.ok) return { json: { accept: false, reason: ev.reason } };\nconst sd = $getWorkflowStaticData('global');\nconst r = L.rateLimit(sd.rate, ev.sid, Date.now());\nsd.rate = r.state;\nif (!r.allowed) return { json: { accept: false, reason: r.reason } };\nreturn { json: { accept: true, inc: L.increment(ev, Date.now(), $env.BRAND_ID) } };"));
  const R = b.add({ name: 'Respond 204', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, parameters: { respondWith: 'noData', options: { responseCode: 204 } } });
  const OK = b.add(iff('Counted?', '$json.accept === true'));
  const U = b.add(pg('Upsert ops.page_day counters (no raw event stored)',
`INSERT INTO ops.page_day (day, brand_id, page_path, visits, quiz_starts, quiz_steps, source)
VALUES ($1::date, $2::uuid, $3, $4::int, CASE WHEN $5::int > 0 THEN $5::int END,
        CASE WHEN $6 = '' THEN NULL ELSE jsonb_build_object($6::text, jsonb_build_object('views', 1, 'abandons', 0)) END, 'first_party_beacon')
ON CONFLICT (day, brand_id, page_path) DO UPDATE SET
  visits = ops.page_day.visits + EXCLUDED.visits,
  quiz_starts = CASE WHEN $5::int > 0 OR ops.page_day.quiz_starts IS NOT NULL THEN COALESCE(ops.page_day.quiz_starts, 0) + $5::int END,
  quiz_steps = CASE WHEN $6 = '' THEN ops.page_day.quiz_steps
                    ELSE jsonb_set(COALESCE(ops.page_day.quiz_steps, '{}'::jsonb), ARRAY[$6::text],
                         jsonb_build_object('views', COALESCE((ops.page_day.quiz_steps -> $6 ->> 'views')::int, 0) + 1,
                                            'abandons', COALESCE((ops.page_day.quiz_steps -> $6 ->> 'abandons')::int, 0))) END,
  source = COALESCE(ops.page_day.source, EXCLUDED.source)
RETURNING visits;`,
    "={{ [ $json.inc.day, $json.inc.brand_id, $json.inc.page_path, $json.inc.visits, $json.inc.quiz_starts, $json.inc.step_key ] }}"));
  b.chain(WH, N, R, OK); b.link(OK, U, 0);
  b.add(sticky('Note: smc-visit-beacon (I-32b)', '## smc-visit-beacon\nPOST `<api_base>/beacon`, text/plain JSON `{ v:1, sid, a, e:view|step, s? }` from landing `page.js` (`navigator.sendBeacon`, no cookies). Always answers 204. DNT / Sec-GPC and rate-limited (20 per session, 1,200 total per minute) beacons are dropped. Writes daily counters only to `ops.page_day` (`visits`, `quiz_starts`, `quiz_steps.sN.views`). No IP, user agent, referrer or session id is stored. Needs `BRAND_ID` (uuid); optional `BEACON_ANGLE_SLUGS`, `PUBLIC_ALLOWED_ORIGINS`. Not a lead event: no Pixel, no CAPI, no send.', [0, 0]));
  return b.done();
}

// ---------------------------------------------------------------- smc-email-verify (2026-10-11)
// Agreement clause 5.8(b): the lead's email is confirmed by a one-tap link or a 6-digit code. Logic: lib/sub-email-verify.mjs
// over ctwa/capture-v2.js. Email from hello@sortmycover.co.za through Resend (RESEND_API_KEY, the CRM's key).
export function emailVerify() {
  const b = wfBuilder('smc-email-verify', 'Email Verify (Resend code + link, clause 5.8)');
  const LEAD_SQL = `SELECT l.id::text AS id, l.first_name, l.email, l.email_verified, l.email_verify_code_hash, l.email_verify_sent_at,
       l.email_verify_expires_at, l.email_verify_attempts, l.opted_out_at, l.phone, l.brand_id::text AS brand_id, l.broker_id::text AS broker_id,
       b.contact_person AS adviser_name
  FROM public.leads l LEFT JOIN public.brokers b ON b.id = l.broker_id
 WHERE l.id = NULLIF($1, '')::uuid AND l.brand_id IS NOT NULL;`;
  const T = b.add(trigger('Called by W05 / W28 (issue) or W07 (typed code)'));
  const N = b.add(code('Normalise input', "const L = require('lv-automation').subEmailVerify;\nreturn { json: L.normalise($json) };"));
  const V = b.add(iff('Valid and op = issue?', "$json.valid === true && $json.op === 'issue'"));
  const VC = b.add(iff('Valid and op = code?', "$json.valid === true && $json.op === 'code'"));
  // ---- issue
  const LI = b.add(pg('Load lead (issue)', LEAD_SQL, '={{ [ $json.lead_id ] }}'));
  const PI = b.add(code('Plan issue (code + link, 10-min gap)', "const L = require('lv-automation').subEmailVerify;\nreturn { json: { lead_id: $json.id, brand_id: $json.brand_id, broker_id: $json.broker_id, email: $json.email, ...L.issuePlan($json.id ? $json : null, $env, Date.now()) } };"));
  const SI = b.add(iff('Send the email?', "$json.action === 'send'"));
  const ST = b.add(pg('Store code hash + timeline (before the send)',
`-- Only the hash is stored (capture-v2 issueEmailVerification). A newer email replaces the older code.
WITH u AS (
  UPDATE public.leads SET email_verify_code_hash = $2, email_verify_sent_at = $3::timestamptz, email_verify_expires_at = $4::timestamptz,
                          email_verify_attempts = 0, updated_at = now()
   WHERE id = $1::uuid AND brand_id IS NOT NULL AND email_verified IS NOT TRUE
  RETURNING id, brand_id, broker_id)
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT u.id, u.brand_id, u.broker_id, 'system', 'email_verify_sent', jsonb_build_object('via', 'resend', 'expires_at', $4::text), now(), 'ev:sent:' || u.id::text || ':' || $3
  FROM u
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING lead_id::text AS lead_id;`,
    "={{ [ $json.lead_id, $json.set.email_verify_code_hash, $json.set.email_verify_sent_at, $json.set.email_verify_expires_at ] }}"));
  const LV = b.add(iff('Live send? (Resend)', "$env.DRY_RUN_SENDS !== 'true'"));
  const RS = b.add({ name: 'Resend POST /emails (hello@sortmycover.co.za)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: "={{ $('Plan issue (code + link, 10-min gap)').item.json.resend.url }}", sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Authorization', value: "={{ $('Plan issue (code + link, 10-min gap)').item.json.resend.headers.Authorization }}" },
        { name: 'Idempotency-Key', value: "={{ $('Plan issue (code + link, 10-min gap)').item.json.resend.headers['Idempotency-Key'] }}" }] },
      sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($('Plan issue (code + link, 10-min gap)').item.json.resend.body) }}",
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 15000 } } });
  const DRY = b.add(code('Dry-run stub (Resend)', "// DRY_RUN_SENDS=true: no email leaves the box; the evidence row is still written with a dry: id.\nreturn { json: { statusCode: 200, body: { id: 'dry:ev:' + $('Plan issue (code + link, 10-min gap)').item.json.lead_id } } };"));
  const IR = b.add(code('Interpret Resend response', "const L = require('lv-automation').subEmailVerify;\nreturn { json: L.interpretResend($json) };"));
  const LG = b.add(pg('Log email in communications (CRM timeline)',
`-- The CRM's UnifiedCommunicationHub shows this row on the lead. Content never holds the code or the link.
INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, subject, content, status, external_id, failed_reason, lead_id, broker_id, author, workflow, template_name, metadata)
VALUES (NULLIF($1, '')::uuid, 'email', 'outbound', 'system', 'client', $2, $3, '[email verification: code + link]', $4, NULLIF($5, ''), NULLIF($6, ''), $7::uuid, NULLIF($8, '')::uuid, 'system', 'smc-email-verify', 'email_verification',
        jsonb_build_object('provider', 'resend', 'from', $9::text, 'dry_run', $5 LIKE 'dry:%'))
ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING;`,
    "={{ (() => { const p = $('Plan issue (code + link, 10-min gap)').item.json; return [ p.brand_id || '', p.email, p.resend.body.subject, $json.ok ? 'sent' : 'failed', $json.external_id || '', $json.error || '', p.lead_id, p.broker_id || '', p.resend.body.from ]; })() }}"));
  const SK = b.add(pg('Log skipped issue (timeline)',
`INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT l.id, l.brand_id, l.broker_id, 'system', 'email_verify_skipped', jsonb_build_object('reason', $2::text), now(), 'ev:skip:' || l.id::text || ':' || $2 || ':' || to_char(now(), 'YYYYMMDDHH24')
  FROM public.leads l WHERE l.id = NULLIF($1, '')::uuid AND l.brand_id IS NOT NULL AND $2 NOT IN ('recently_sent', 'already_verified')
ON CONFLICT (idempotency_key) DO NOTHING;`, "={{ [ $json.lead_id || '', $json.reason || 'unknown' ] }}"));
  // ---- code
  const LC = b.add(pg('Load lead (code)', LEAD_SQL, '={{ [ $json.lead_id ] }}'));
  const PC = b.add(code('Check the typed code', "const L = require('lv-automation').subEmailVerify;\nconst n = $('Normalise input').item.json;\nconst r = L.codePlan($json.id ? $json : null, n.code, Date.now());\nreturn { json: { lead_id: $json.id, brand_id: $json.brand_id, broker_id: $json.broker_id, phone: $json.phone, ...r } };"));
  const UC = b.add(pg('Update lead + timeline (code)',
`WITH u AS (
  UPDATE public.leads SET email_verified = COALESCE(($2::jsonb->>'email_verified')::boolean, email_verified),
                          email_verified_at = COALESCE(($2::jsonb->>'email_verified_at')::timestamptz, email_verified_at),
                          email_verified_via = COALESCE($2::jsonb->>'email_verified_via', email_verified_via),
                          email_verify_attempts = COALESCE(($2::jsonb->>'email_verify_attempts')::int, email_verify_attempts),
                          email_unverified_flag = CASE WHEN ($2::jsonb->>'email_verified')::boolean THEN false ELSE email_unverified_flag END,
                          updated_at = now()
   WHERE id = $1::uuid AND brand_id IS NOT NULL
  RETURNING id, brand_id, broker_id)
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT u.id, u.brand_id, u.broker_id, 'lead', $3, $4::jsonb, now(), 'ev:code:' || u.id::text || ':' || $5
  FROM u
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING lead_id::text AS lead_id;`,
    "={{ [ $json.lead_id, JSON.stringify($json.set || {}), $json.activity.activity_type, JSON.stringify($json.activity.payload), String($('Normalise input').item.json.wamid || Date.now()) ] }}"));
  const RP = b.add(code('SUB input (reply on WhatsApp)', "// One reply to the typed code (the lead just wrote: inside the 24-h window). Through smc-whatsapp-send, so\n// WHATSAPP_PROVIDER switches it; the sub records the communications row (record:true).\nconst p = $('Check the typed code').item.json;\nconst n = $('Normalise input').item.json;\nreturn { json: { kind: 'prebuilt', wa: { messaging_product: 'whatsapp', to: String(n.to || p.phone || '').replace(/\\D/g, ''), type: 'text', text: { body: p.reply } }, record: true, caller: 'smc-email-verify', lead_id: p.lead_id, correlation: 'ev:reply:' + (n.wamid || p.lead_id + ':' + Date.now()) } };"));
  const WS = b.add({ name: 'WhatsApp reply (smc-whatsapp-send)', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: false } } });
  const RX = b.add(iff('Code expired? (issue a fresh one)', "$('Check the typed code').item.json.reissue === true"));
  const RI = b.add(code('Re-issue item', "return { json: { op: 'issue', lead_id: $('Check the typed code').item.json.lead_id } };"));
  const SELF = b.add({ name: 'Issue a fresh code (this workflow)', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-email-verify', cachedResultName: 'Email Verify' }, options: { waitForSubWorkflow: false } } });
  // ---- link
  const WH = b.add({ name: 'GET /v/:token (one-tap link)', type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: 'smc-email-verify-link', parameters: { httpMethod: 'GET', path: 'v/:token', authentication: 'none', responseMode: 'responseNode', options: {} } });
  const TK = b.add(code('Lead id from the token', "const L = require('lv-automation').subEmailVerify;\nreturn { json: { lead_id: L.leadIdFromToken($json.params && $json.params.token) || '' } };"));
  const LL = b.add(pg('Load lead (link)', LEAD_SQL, '={{ [ $json.lead_id ] }}'));
  const PL = b.add(code('Check the link', "const L = require('lv-automation').subEmailVerify;\nconst tok = $('GET /v/:token (one-tap link)').item.json.params.token;\nreturn { json: { lead_id: $json.id || null, ...L.linkPlan(tok, $json.id ? $json : null, $env, Date.now()) } };"));
  const UL = b.add(pg('Update lead + timeline (link)',
`WITH u AS (
  UPDATE public.leads SET email_verified = true, email_verified_at = ($2::jsonb->>'email_verified_at')::timestamptz, email_verified_via = 'link',
                          email_unverified_flag = false, updated_at = now()
   WHERE id = NULLIF($1, '')::uuid AND brand_id IS NOT NULL AND $3::boolean AND ($2::jsonb->>'email_verified') = 'true'
  RETURNING id, brand_id, broker_id)
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT u.id, u.brand_id, u.broker_id, 'lead', 'email_verified', '{"via":"link"}'::jsonb, now(), 'ev:link:' || u.id::text FROM u
ON CONFLICT (idempotency_key) DO NOTHING;`,
    "={{ [ $json.lead_id || '', JSON.stringify($json.set || {}), !!$json.ok ] }}"));
  const RL = b.add({ name: 'Respond (HTML page)', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
    parameters: { respondWith: 'text', responseBody: "={{ $('Check the link').item.json.page }}", options: { responseCode: "={{ $('Check the link').item.json.status }}", responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }, { name: 'Referrer-Policy', value: 'no-referrer' }] } } } });
  // 2026-10-11 verify gate: a verified email turns the lead's HELD slot into the booking (W05 op finalize: Outlook event,
  // Teams link, broker notice, intro card, reminders). No held slot -> W05 does nothing. Fire-and-forget.
  const FC = b.add(iff('Verified by the code? (finalize the held slot)', "$('Check the typed code').item.json.ok === true"));
  const FCI = b.add(code('Finalize item (code)', "return { json: { op: 'finalize', lead_id: $('Check the typed code').item.json.lead_id } };"));
  const FL = b.add(iff('Verified by the link? (finalize the held slot)', "$('Check the link').item.json.ok === true && !!$('Check the link').item.json.lead_id"));
  const FLI = b.add(code('Finalize item (link)', "return { json: { op: 'finalize', lead_id: $('Check the link').item.json.lead_id } };"));
  const W5C = b.add({ name: '-> W05 finalize (code)', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-w05', cachedResultName: 'W05 Book' }, options: { waitForSubWorkflow: false } } });
  const W5L = b.add({ name: '-> W05 finalize (link)', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1, parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-w05', cachedResultName: 'W05 Book' }, options: { waitForSubWorkflow: false } } });
  b.chain(T, N, V); b.link(V, LI, 0); b.link(V, VC, 1); b.link(VC, LC, 0);
  b.chain(LI, PI, SI); b.link(SI, ST, 0); b.link(SI, SK, 1); b.chain(ST, LV); b.link(LV, RS, 0); b.link(LV, DRY, 1); b.chain(RS, IR); b.chain(DRY, IR); b.chain(IR, LG);
  b.chain(LC, PC, UC, RP, WS); b.link(UC, RX); b.link(RX, RI, 0); b.chain(RI, SELF);
  b.chain(WH, TK, LL, PL, UL, RL);
  b.link(UC, FC); b.link(FC, FCI, 0); b.chain(FCI, W5C);
  b.link(UL, FL); b.link(FL, FLI, 0); b.chain(FLI, W5L);
  b.add(sticky('Note: smc-email-verify', '## smc-email-verify (agreement clause 5.8(b))\n- `{ op: issue, lead_id }` (W05 after an invite booking with an email, W28 after the Flow email step): one email from `hello@sortmycover.co.za` through **Resend** (`RESEND_API_KEY`) with a one-tap link `VERIFY_BASE_URL/v/<ev1 token>` and a 6-digit code. Only `sha256(lead_id|code)` is stored. 10-minute gap per lead. `DRY_RUN_SENDS` -> nothing sent, row with a `dry:` id.\n- `{ op: code, lead_id, code, wamid, to }` (W07 route `email_code`): checks the code (5 tries, 24 h), confirms the email, one WhatsApp reply via smc-whatsapp-send; an expired code is re-issued.\n- Verified (code or link) -> W05 `{ op: finalize, lead_id }`: the held slot becomes the booking (verify gate, 2026-10-11).\n- `GET /v/:token`: the link. Traefik routes `sortmycover.co.za/v/*` to `/webhook/v/:token`. One identical page for every failure.\n- Env: `EMAIL_VERIFY_SECRET` (>= 32 chars), `RESEND_API_KEY`, optional `VERIFY_EMAIL_FROM`, `VERIFY_BASE_URL`, `VERIFY_EMAIL_REPLY_TO`.', [0, 0]));
  return b.done();
}

const BUILDERS = { 'SUB-email-verify.json': emailVerify, 'SUB-whatsapp-send.json': whatsappSend, 'SUB-capi-send.json': capiSend, 'SUB-w26-runner.json': w26Runner, 'SUB-ads-budget.json': adsBudget, 'SUB-visit-beacon.json': visitBeacon };
export { BUILDERS };
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [f, fn] of Object.entries(BUILDERS)) { write(f, fn()); console.log('wrote', f); }
}
