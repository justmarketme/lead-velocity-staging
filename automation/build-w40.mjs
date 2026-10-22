#!/usr/bin/env node
// Generates automation/W40.json: W40 Social replies = Lindi on Facebook and Instagram (comments + DMs), 21 Oct 2026.
// Plan: Desktop\EMMA\checklist\SOCIAL-AUDIT-LINDI-SMC-2026-10-21.md sections 3 and 5 (Jono's go, 21 Oct 2026).
// Logic: automation/lib/social.mjs (require('lv-automation').social). Tests: automation/tests/social.test.mjs.
// Runbook: DEPLOY-RUNBOOK-SOCIAL.md (shadow first; nothing here is deployed, imported or subscribed).
//
// In:  POST /webhook/meta-social (the Instagram object, signature checked here) and Execute Workflow from W02 (the Page
//      object: feed comments, Messenger, standby, hand-overs; W02 forwards the raw bytes + signature, W40 checks them again).
// Out: Graph comment replies / hides / private replies / DMs (Code node "Send step", DRY_RUN_SENDS honoured inside
//      lib/social.mjs sendStep), W22 signals, public.communications rows (hashes only, no incoming text), public.suppression
//      (STOP), a daily shadow digest by email (smc-email-send, gated) and the nightly 30-day anonymiser.
// Switches: SOCIAL_MODE (off | shadow | live; unset = off), SOCIAL_CHANNELS (fb_comments, ig_comments, messenger, ig_dm,
//      private_replies; unset = none), DRY_RUN_SENDS (global), SOCIAL_HUMAN_PAUSE_HOURS (24), SOCIAL_HASH_SALT (required).
// Saves no execution data, on success or on failure (comment text and Meta ids pass through items only).
// Stable id smc-w40 (I-44b), credentials by name only, workflow inactive, errorWorkflow smc-w22.
// Run: node automation/build-w40.mjs   (GEN_OUT_DIR=<dir> writes elsewhere: tests/generators.test.mjs)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { gateSenders } = createRequire(import.meta.url)('./lib/egress-gate.cjs');
const HERE = dirname(fileURLToPath(import.meta.url));
const PG = { postgres: { id: '', name: 'LV Supabase - n8n_app (least privilege)' } };
// Saves no execution data at all: comments, DM text and Meta ids only ever live in the running execution.
const SETTINGS = { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: false, saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'none', saveExecutionProgress: false, errorWorkflow: 'smc-w22', callerPolicy: 'workflowsFromSameOwner' };
const PRE = "const L = require('lv-automation').social;\n";

let seq = 0;
const node = (name, type, tv, position, parameters, extra = {}) => ({ id: `w40n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion: tv, position, parameters, ...extra });
const code = (name, position, body, mode = 'runOnceForAllItems', extra = {}) => node(name, 'code', 2, position, { mode, jsCode: PRE + body }, extra);
const pg = (name, position, query, repl) => node(name, 'postgres', 2.5, position, { operation: 'executeQuery', query, options: { queryReplacement: repl } }, { credentials: PG, alwaysOutputData: false });
const ifTrue = (name, position, expr) => node(name, 'if', 2, position, { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
  conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} });
const sw = (name, position, expr, keys) => node(name, 'switch', 3, position, { rules: { values: keys.map((k) => ({ conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
  conditions: [{ leftValue: expr, rightValue: k, operator: { type: 'string', operation: 'equals' } }] }, renameOutput: true, outputKey: k })) }, options: { fallbackOutput: 'none' } });
const sub = (name, position, id, cached) => node(name, 'executeWorkflow', 1.2, position, { source: 'database', workflowId: { __rl: true, mode: 'id', value: id, cachedResultName: cached }, options: { waitForSubWorkflow: false } }, { onError: 'continueRegularOutput' });
const c = {};
const link = (from, to, out = 0) => { c[from] ??= { main: [] }; while (c[from].main.length <= out) c[from].main.push([]); c[from].main[out].push({ node: to, type: 'main', index: 0 }); };

// One INSERT for every W40 communications row (inbound event, marker, claim). communications_smc_external_uidx makes it once-only.
const ROW_COLS = 'channel text, external_id text, direction text, author text, sender_type text, recipient_type text, status text, intent text, handoff boolean, content text, guardrail_trip boolean, guardrail_rule text, metadata jsonb';
const INSERT_ROW = (param) => `INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, status, external_id, author, intent, workflow, handoff, content, guardrail_trip, guardrail_rule, metadata)
  SELECT $1::uuid, r.channel, r.direction, r.sender_type, r.recipient_type, 'meta:redacted', r.status, r.external_id, r.author, r.intent, 'W40',
         COALESCE(r.handoff, false), r.content, COALESCE(r.guardrail_trip, false), r.guardrail_rule, r.metadata
    FROM jsonb_to_record(${param}::jsonb) AS r(${ROW_COLS})
   WHERE r.external_id IS NOT NULL
  ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING`;

const CONTEXT_SQL = `-- W40: write the event once (communications_smc_external_uidx; brand rows; recipient_contact 'meta:redacted'; no message
-- text, salted hashes only) and read the thread state in the same statement. The SELECT sees the snapshot before the
-- insert, so no count includes this event. $4 is the planned event, echoed back so the next node needs no lookup.
WITH k AS (SELECT * FROM jsonb_to_record($3::jsonb) AS y(thread text, sender text, post text, parent_graph_id text, stop_hash text, mode text)),
ins AS (
${INSERT_ROW('$2')}
  RETURNING id),
w AS (SELECT c.* FROM public.communications c, k WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.metadata->>'thread' = k.thread)
SELECT $4::jsonb AS item,
       EXISTS (SELECT 1 FROM ins) AS fresh,
       EXISTS (SELECT 1 FROM public.suppression s, k WHERE s.mobile_hash = k.stop_hash AND s.source = 'stop') AS stopped,
       EXISTS (SELECT 1 FROM public.communications c, k WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.intent = 'under_18' AND c.metadata->>'sender' = k.sender) AS minor,
       (SELECT max(w.created_at) FROM w WHERE w.author = 'human' OR w.handoff) AS human_at,
       EXISTS (SELECT 1 FROM w WHERE w.author = 'human' AND w.metadata->>'kind' = 'comment') AS human_comment_thread,
       (SELECT count(*) FROM w, k WHERE w.author = 'bot' AND w.metadata->>'op' = 'dm' AND w.metadata->>'mode' = k.mode AND w.created_at > now() - interval '24 hours')::int AS bot_dm_24h,
       (SELECT count(*) FROM w, k WHERE w.author = 'bot' AND w.metadata->>'faq' = 'true' AND w.metadata->>'mode' = k.mode AND w.created_at > now() - interval '24 hours')::int AS faq_24h,
       EXISTS (SELECT 1 FROM w, k WHERE w.author = 'bot' AND w.metadata->>'op' = 'dm' AND w.metadata->>'mode' = k.mode) AS disclosed,
       (SELECT count(*) FROM public.communications c, k WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.author = 'bot' AND c.metadata->>'op' = 'public_reply'
          AND c.metadata->>'sender' = k.sender AND c.metadata->>'post' = k.post AND c.metadata->>'mode' = k.mode)::int AS public_to_sender_on_post,
       EXISTS (SELECT 1 FROM public.communications c, k WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.author = 'bot' AND k.parent_graph_id IS NOT NULL
          AND c.metadata->>'graph_id' = k.parent_graph_id) AS parent_is_ours,
       (SELECT count(*) FROM public.communications c WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.direction = 'inbound'
          AND c.created_at > now() - interval '10 minutes')::int AS inbound_10min;`;

const CLAIM_SQL = `-- The outgoing row is written BEFORE the send (one per step key: w40:o:<op>:<id>). No row back = already claimed = no send.
WITH ins AS (
${INSERT_ROW('$2')}
  RETURNING id)
SELECT $3::jsonb AS item, EXISTS (SELECT 1 FROM ins) AS claimed;`;

const RESULT_SQL = `-- The send result onto the claimed row (status, Graph id, failure). An empty $6 (a duplicate) updates nothing.
-- $7 = a human-takeover marker when the Page had already replied under the comment.
WITH u AS (
  UPDATE public.communications
     SET status = COALESCE(NULLIF($3, ''), status), failed_reason = NULLIF($4, ''), metadata = metadata || $5::jsonb, updated_at = now()
   WHERE brand_id = $1::uuid AND workflow = 'W40' AND channel = $2 AND external_id = NULLIF($6, '')
  RETURNING 1),
h AS (
${INSERT_ROW("NULLIF($7, 'null')")}
  RETURNING 1)
SELECT $8::jsonb AS item, (SELECT count(*) FROM u)::int AS updated, (SELECT count(*) FROM h)::int AS human_marked;`;

const n = [];
n.push(node('Sticky: read me', 'stickyNote', 1, [-520, -520], { width: 900, height: 420, content:
  '## W40 Social replies: Lindi on Facebook and Instagram (21 Oct 2026)\n' +
  'Plan: SOCIAL-AUDIT-LINDI-SMC-2026-10-21.md sections 3 and 5. Logic: automation/lib/social.mjs. Runbook: DEPLOY-RUNBOOK-SOCIAL.md.\n' +
  'In: POST /webhook/meta-social (Instagram object; X-Hub-Signature-256 checked) and W02 (Page object: feed comments, Messenger, standby, hand-overs; raw bytes re-checked here).\n' +
  'Switches: SOCIAL_MODE off|shadow|live (unset = off), SOCIAL_CHANNELS (fb_comments, ig_comments, messenger, ig_dm, private_replies; unset = none), DRY_RUN_SENDS, SOCIAL_HUMAN_PAUSE_HOURS (24), SOCIAL_HASH_SALT (required; never rotate: the STOP list is keyed on it).\n' +
  'Each event is written once (communications_smc_external_uidx) with hashes only, never the incoming text. Every outgoing row is written BEFORE its send. Human takeover: Page Inbox echoes, standby, hand-overs, a delayed check on Instagram echoes and Page comments, and a look at existing replies before a public reply.\n' +
  'Brain: $env.LINDI_BRAIN_URL (smc-lindi-chat, ElevenLabs agent_8201) with $env.LINDI_RELAY_TOKEN; unset / error / timeout = the fixed line. No Anthropic API.\n' +
  'Saves no execution data. Generated by automation/build-w40.mjs; do not hand-edit.' }));

// ---- ingress
n.push(node('Meta social webhook (POST)', 'webhook', 2, [-520, 0], { httpMethod: 'POST', path: 'meta-social', responseMode: 'responseNode', options: { rawBody: true } }, { webhookId: 'w40-meta-social-post' }));
n.push(code('Verify signature (webhook)', [-280, 0], `const it = $input.first();
// Raw bytes exactly as received; the signature is over these bytes, never over a re-serialised body.
const buf = it.binary && it.binary.data ? Buffer.from(it.binary.data.data, 'base64') : Buffer.from(it.json.rawBody || JSON.stringify(it.json.body || {}), 'utf8');
const sig = (it.json.headers || {})['x-hub-signature-256'];
return [{ json: L.readWebhook({ raw: buf, signature: sig, secret: $env.META_APP_SECRET, source: 'instagram webhook' }) }];`));
n.push(node('Respond 200 / 401', 'respondToWebhook', 1.1, [-40, -140], { respondWith: 'text', responseBody: '={{ $json.valid ? "ok" : "bad signature" }}', options: { responseCode: '={{ $json.valid ? 200 : 401 }}' } }));
n.push(node('Meta webhook verify (GET)', 'webhook', 2, [-520, -260], { httpMethod: 'GET', path: 'meta-social', responseMode: 'responseNode', options: {} }, { webhookId: 'w40-meta-social-get' }));
n.push(code('Check hub.verify_token', [-280, -260], `const q = $json.query || {};
const ok = q['hub.mode'] === 'subscribe' && !!$env.META_WEBHOOK_VERIFY_TOKEN && q['hub.verify_token'] === $env.META_WEBHOOK_VERIFY_TOKEN;
return [{ json: { ok, challenge: ok ? String(q['hub.challenge']) : 'forbidden' } }];`));
n.push(node('Respond hub.challenge', 'respondToWebhook', 1.1, [-40, -260], { respondWith: 'text', responseBody: '={{ $json.challenge }}', options: { responseCode: '={{ $json.ok ? 200 : 403 }}' } }));
n.push(node('From W02 (Page events)', 'executeWorkflowTrigger', 1.1, [-520, 220], { inputSource: 'passthrough' }));
n.push(code('Verify signature (from W02)', [-280, 220], `// W02 forwards the ORIGINAL bytes (base64) and the original header; nothing is trusted because W02 checked it.
const out = [];
for (const it of $input.all()) {
  const j = it.json || {};
  out.push({ json: L.readWebhook({ raw: Buffer.from(String(j.raw_body_b64 || ''), 'base64'), signature: j.signature, secret: $env.META_APP_SECRET, source: 'page (W02)' }) });
}
return out;`));
n.push(code('Plan events (social.planEvents)', [0, 60], `// SOCIAL_MODE off (or unset, or no SOCIAL_HASH_SALT) = nothing at all. Channels not in SOCIAL_CHANNELS are dropped here.
const cfg = L.config($env);
if (cfg.mode === 'off') return [];
const out = [];
for (const it of $input.all()) {
  const w = it.json || {};
  if (!w.valid) { out.push({ json: { lane: 'alert', signal: L.signatureAlert(w.source || 'unknown') } }); continue; }
  for (const x of L.planEvents(w.body, cfg, $env.SOCIAL_HASH_SALT)) out.push({ json: x });
}
return out;`));
n.push(sw('Lane', [240, 60], '={{ $json.lane }}', ['event', 'row', 'stop', 'alert', 'echo', 'send']));

// ---- event: record once + context, decide, brain, gate, fan out
n.push(pg('Record event + load context', [480, -200], CONTEXT_SQL, '={{ [ $env.BRAND_ID, JSON.stringify($json.row), JSON.stringify($json.keys), JSON.stringify({ ev: $json.ev, keys: $json.keys }) ] }}'));
n.push(code('Decide (social.decide)', [720, -200], `// Pure: human takeover, STOP, under 18, 24-h window, 7-day rule, CPA hours, caps, circuit breaker, the case and its steps.
const item = $json.item;
const d = L.decide(item.ev, $json, L.config($env), Date.now(), require('lv-automation').holidays, item.keys);
return { json: { ...item, d } };`, 'runOnceForEachItem'));
n.push(ifTrue('Brain draft? (LINDI_BRAIN_URL)', [960, -200], "!!$json.d.brain && String($env.LINDI_BRAIN_URL || '').trim() !== ''"));
n.push(node('Lindi brain (ElevenLabs)', 'httpRequest', 4.2, [1200, -300], {
  method: 'POST', url: '={{ $env.LINDI_BRAIN_URL }}', sendHeaders: true,
  headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.LINDI_RELAY_TOKEN }}' }, { name: 'content-type', value: 'application/json' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.d.brain.body) }}',
  options: { timeout: 12000, response: { response: { neverError: true } } } }, { onError: 'continueRegularOutput' }));
n.push(code('Gate draft (social.finishDraft)', [1440, -200], `// A brain draft is used only if it passes gateDraft (banned words, outputGate public mode, toneCheck). Anything else,
// including no brain, an error or a timeout, keeps the fixed line.
const base = $('Decide (social.decide)').item.json;
const fromBrain = $json && $json.d ? null : $json;
const d = base.d && base.d.brain ? L.finishDraft(base.d, fromBrain) : base.d;
return { json: { ...base, d } };`, 'runOnceForEachItem'));
n.push(code('Fan out (social.fanOut)', [1680, -200], `const out = [];
for (const it of $input.all()) for (const x of L.fanOut(it.json.d, it.json)) out.push({ json: x });
return out;`));

// ---- lanes: rows, STOP, alerts, echo check
n.push(pg('Write marker row', [480, 40], `-- Thread state (handoff / human / minor): no text, hashes only.\n${INSERT_ROW('$2')}\nRETURNING id;`, '={{ [ $env.BRAND_ID, JSON.stringify($json.row) ] }}'));
n.push(pg('Add to STOP list (suppression)', [480, 200], `-- STOP is permanent: public.suppression, source 'stop', the salted hash of the Meta id (never a phone hash).
INSERT INTO public.suppression (mobile_hash, source, brand_id, note)
VALUES ($1, 'stop', NULL, 'W40 social STOP (Facebook / Instagram id, salted hash)')
ON CONFLICT DO NOTHING
RETURNING id;`, '={{ [ $json.stop_hash ] }}'));
n.push(code('W22 signal (social)', [480, 360], `// A link and a case type only: never the message text or the person's name.
return $input.all().map((i) => ({ json: i.json.signal }));`));
n.push(sub('W22 Alerts (social)', [720, 360], 'smc-w22', 'W22 Alerts'));
n.push(node('Wait 20 s (echo check)', 'wait', 1.1, [480, 520], { resume: 'timeInterval', amount: 20, unit: 'seconds' }, { webhookId: 'w40-echo-check' }));
n.push(pg('Re-check echo (ours?)', [720, 520], `-- The delayed check: an Instagram echo or a Page comment is ours only if one of our own sends recorded that Graph id
-- (both sides are the same salted hash; an empty $2 matches nothing, so it counts as a person).
SELECT $3::jsonb AS item,
       EXISTS (SELECT 1 FROM public.communications c WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.author = 'bot' AND c.metadata->>'graph_id' = $2) AS ours;`,
'={{ [ $env.BRAND_ID, String($json.ev.gkey || \'\'), JSON.stringify({ ev: $json.ev, keys: $json.keys }) ] }}'));
n.push(code('Echo verdict (social.echoVerdict)', [960, 520], `const out = [];
for (const it of $input.all()) for (const x of L.echoVerdict(it.json.item, it.json.ours === true)) out.push({ json: x });
return out;`));

// ---- send loop: next step -> claim (row first) -> send -> record -> next step
n.push(code('Next step (social.nextStep)', [480, 720], `// From "Fan out" (send lane) or back from "Record step result" (the item is echoed through Postgres as $json.item).
const it = $json.item || $json;
const step = L.nextStep(it);
return { json: { ...it, step, claim: step ? L.claimRow(it, step) : null } };`, 'runOnceForEachItem'));
n.push(ifTrue('Step left?', [720, 720], '!!$json.step'));
n.push(pg('Claim step (outgoing row first)', [960, 720], CLAIM_SQL, '={{ [ $env.BRAND_ID, JSON.stringify($json.claim), JSON.stringify($json) ] }}'));
n.push(code('Send step (Graph; DRY_RUN_SENDS)', [1200, 720], `// Shadow (or SOCIAL_MODE switched off since the decision): nothing leaves. DRY_RUN_SENDS=true: nothing leaves.
// Live: Page token from META_SYSTEM_USER_TOKEN, a look at existing Page replies before a public reply, then the Graph POST.
const it = $json.item;
const mode = L.config($env).mode === 'live' ? it.d.mode : 'shadow';
const env = { DRY_RUN_SENDS: $env.DRY_RUN_SENDS, META_SYSTEM_USER_TOKEN: $env.META_SYSTEM_USER_TOKEN, META_GRAPH_VERSION: $env.META_GRAPH_VERSION, META_API_VERSION: $env.META_API_VERSION };
const result = await L.sendStep({ step: it.step, claimed: $json.claimed === true, mode, env });
const update = L.resultUpdate(it, it.step, result, $env.SOCIAL_HASH_SALT); // our own Graph ids are stored hashed
return { json: { item: L.afterStep({ ...it, step: null, claim: null }, result), update } };`, 'runOnceForEachItem'));
n.push(pg('Record step result', [1440, 720], RESULT_SQL,
  '={{ [ $env.BRAND_ID, $json.update.channel, $json.update.status, $json.update.failed_reason, JSON.stringify($json.update.meta), $json.update.external_id, JSON.stringify($json.update.human), JSON.stringify($json.item) ] }}'));

// ---- daily shadow digest + the 30-day rule
n.push(node('Daily 07:30 SAST (shadow digest)', 'scheduleTrigger', 1.2, [-520, 980], { rule: { interval: [{ field: 'cronExpression', expression: '30 7 * * *' }] } }));
n.push(pg('Load shadow drafts (24 h)', [-280, 980], `-- Passed drafts only (content is written only after the gate). Never the incoming text, never a name.
SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', c.channel, 'intent', c.intent, 'op', c.metadata->>'op', 'content', c.content) ORDER BY c.created_at)
                   FROM public.communications c
                  WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.author = 'bot' AND c.metadata->>'mode' = 'shadow'
                    AND c.content IS NOT NULL AND c.created_at > now() - interval '24 hours'), '[]'::jsonb) AS drafts,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', x.channel, 'intent', x.intent, 'n', x.n))
                   FROM (SELECT c.channel, c.intent, count(*) AS n FROM public.communications c
                          WHERE c.brand_id = $1::uuid AND c.workflow = 'W40' AND c.author = 'bot' AND c.metadata->>'mode' = 'shadow'
                            AND c.created_at > now() - interval '24 hours' GROUP BY 1, 2) x), '[]'::jsonb) AS counts;`, '={{ [ $env.BRAND_ID ] }}'));
n.push(code('Digest (social.digest)', [-40, 980], `const r = $input.first().json || {};
const dg = L.digest(r.drafts || [], r.counts || []);
const to = [$env.OPS_ALERT_EMAIL, $env.OPS_ALERT_EMAIL_KG].filter(Boolean).map(String);
if (!dg || !to.length) return [];
return [{ json: { relay: { body: { from: 'SortMyCover <hello@sortmycover.co.za>', to, subject: dg.subject, text: dg.text, tags: [{ name: 'kind', value: 'social_digest' }] },
  idempotency_key: 'w40:digest:' + new Date().toISOString().slice(0, 10) } } }];`));
n.push(node('Email digest (smc-email-send)', 'httpRequest', 4.2, [440, 980], {
  method: 'POST', url: "={{ ($env.SUPABASE_FUNCTIONS_URL || 'https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1') + '/smc-email-send' }}",
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.LINDI_RELAY_TOKEN }}' }, { name: 'Idempotency-Key', value: "={{ $json.relay.idempotency_key || '' }}" }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.relay.body) }}',
  options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true } } } }, { onError: 'continueRegularOutput' }));
n.push(node('Nightly 02:50 SAST (30-day rule)', 'scheduleTrigger', 1.2, [-520, 1180], { rule: { interval: [{ field: 'cronExpression', expression: '50 2 * * *' }] } }));
n.push(pg('Anonymise W40 rows older than 30 days', [-280, 1180], `-- The 30-day rule (privacy notice): W40 rows older than 30 days lose their text and every Meta id. The thread hash (so a
-- comment thread a person joined stays theirs), the case and the under-18 marker's sender hash stay. n8n_app has no DELETE.
WITH u AS (
  UPDATE public.communications
     SET content = NULL, external_id = NULL, redacted = true, updated_at = now(),
         metadata = jsonb_strip_nulls(jsonb_build_object('thread', metadata->'thread', 'kind', metadata->'kind', 'op', metadata->'op', 'marker', metadata->'marker',
                    'mode', metadata->'mode', 'case', metadata->'case', 'sender', CASE WHEN intent = 'under_18' THEN metadata->'sender' END))
   WHERE brand_id = $1::uuid AND workflow = 'W40' AND redacted = false AND created_at < now() - interval '30 days'
  RETURNING 1)
SELECT count(*)::int AS anonymised FROM u;`, '={{ [ $env.BRAND_ID ] }}'));

// ---- wiring
link('Meta webhook verify (GET)', 'Check hub.verify_token');
link('Check hub.verify_token', 'Respond hub.challenge');
link('Meta social webhook (POST)', 'Verify signature (webhook)');
link('Verify signature (webhook)', 'Respond 200 / 401');
link('Verify signature (webhook)', 'Plan events (social.planEvents)');
link('From W02 (Page events)', 'Verify signature (from W02)');
link('Verify signature (from W02)', 'Plan events (social.planEvents)');
link('Plan events (social.planEvents)', 'Lane');
['Record event + load context', 'Write marker row', 'Add to STOP list (suppression)', 'W22 signal (social)', 'Wait 20 s (echo check)', 'Next step (social.nextStep)']
  .forEach((to, i) => link('Lane', to, i));
link('Record event + load context', 'Decide (social.decide)');
link('Decide (social.decide)', 'Brain draft? (LINDI_BRAIN_URL)');
link('Brain draft? (LINDI_BRAIN_URL)', 'Lindi brain (ElevenLabs)', 0);
link('Brain draft? (LINDI_BRAIN_URL)', 'Gate draft (social.finishDraft)', 1);
link('Lindi brain (ElevenLabs)', 'Gate draft (social.finishDraft)');
link('Gate draft (social.finishDraft)', 'Fan out (social.fanOut)');
link('Fan out (social.fanOut)', 'Lane');
link('W22 signal (social)', 'W22 Alerts (social)');
link('Wait 20 s (echo check)', 'Re-check echo (ours?)');
link('Re-check echo (ours?)', 'Echo verdict (social.echoVerdict)');
link('Echo verdict (social.echoVerdict)', 'Write marker row');
link('Next step (social.nextStep)', 'Step left?');
link('Step left?', 'Claim step (outgoing row first)', 0);
link('Claim step (outgoing row first)', 'Send step (Graph; DRY_RUN_SENDS)');
link('Send step (Graph; DRY_RUN_SENDS)', 'Record step result');
link('Record step result', 'Next step (social.nextStep)');
link('Daily 07:30 SAST (shadow digest)', 'Load shadow drafts (24 h)');
link('Load shadow drafts (24 h)', 'Digest (social.digest)');
link('Digest (social.digest)', 'Email digest (smc-email-send)');
link('Nightly 02:50 SAST (30-day rule)', 'Anonymise W40 rows older than 30 days');

const wf = gateSenders({ id: 'smc-w40', name: 'W40 Social replies', nodes: n, connections: c, active: false, settings: SETTINGS, pinData: {},
  tags: [{ name: 'social' }, { name: 'lindi' }], meta: { notes: 'Lindi on Facebook and Instagram. Logic automation/lib/social.mjs; tests automation/tests/social.test.mjs; runbook DEPLOY-RUNBOOK-SOCIAL.md. Generated by automation/build-w40.mjs; do not hand-edit.' } });
const OUT_DIR = process.env.GEN_OUT_DIR || HERE;
writeFileSync(join(OUT_DIR, 'W40.json'), JSON.stringify(wf, null, 2) + '\n');
console.log(`wrote ${OUT_DIR === HERE ? 'automation' : OUT_DIR}/W40.json`, wf.nodes.length, 'nodes');
