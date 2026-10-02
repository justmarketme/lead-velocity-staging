#!/usr/bin/env node
// Generates automation/W03.json and automation/W28.json from the tested logic modules (inlined verbatim, sha-stamped).
// Run after any change to ctwa/w03.js, flows/w28-endpoint.js, flows/flow-crypto.js, security/lead-token.js:
//   node automation/build-w03-w28.mjs
// Credentials by name only (id ''), every secret via $env, workflows inactive. Zero dependencies.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineModule } from './security/inline-for-n8n.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PG = { postgres: { id: '', name: 'LV Supabase Postgres' } };
const WA = { httpHeaderAuth: { id: '', name: 'WhatsApp Cloud API (system user)' } };
const SETTINGS = { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: true, errorWorkflow: 'W22 Alerts' };

let seq = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: `n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra });
const code = (name, pos, jsCode, mode = 'runOnceForAllItems') => node(name, 'code', 2, pos, { mode, jsCode });
const pg = (name, pos, query, replacement) => node(name, 'postgres', 2.5, pos, { operation: 'executeQuery', query, options: replacement ? { queryReplacement: replacement } : {} }, { credentials: PG });
const sub = (name, pos, target) => node(name, 'executeWorkflow', 1.1, pos, { source: 'database', workflowId: { __rl: true, mode: 'list', value: '', cachedResultName: target }, options: { waitForSubWorkflow: false } });
const respond = (name, pos, body, codeExpr, headers) => node(name, 'respondToWebhook', 1.1, pos, { respondWith: body === null ? 'noData' : 'text', ...(body === null ? {} : { responseBody: body }), options: { responseCode: codeExpr, ...(headers ? { responseHeaders: { entries: headers } } : {}) } });
const ifTrue = (name, pos, expr) => node(name, 'if', 2, pos, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'c1', leftValue: expr, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} });
const switchOn = (name, pos, expr, values) => node(name, 'switch', 3, pos, {
  rules: { values: values.map((v) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr, rightValue: v, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: v })) },
  options: { fallbackOutput: 'none' },
});
const link = (conn, from, to, out = 0) => {
  conn[from] ??= { main: [] };
  while (conn[from].main.length <= out) conn[from].main.push([]);
  conn[from].main[out].push({ node: to, type: 'main', index: 0 });
};

const VW = inlineModule('VW', 'verify-webhooks.js');
const LT = inlineModule('LT', 'lead-token.js');
const W3 = inlineModule('W3', '../ctwa/w03.js');
const FC = inlineModule('FC', '../flows/flow-crypto.js');
const W28 = inlineModule('EP', '../flows/w28-endpoint.js');

// =========================================================================================== W03
function buildW03() {
  seq = 0;
  const c = {};
  const n = [];
  n.push(node('Sticky: read me', 'stickyNote', 1, [0, -360], { width: 760, height: 340, content:
    'W03 Click-to-WhatsApp intake (automation-engineer). Sub-workflow since I-35d: W07 owns POST /whatsapp (signature, 200, wamid claim, statuses, STOP, brokers, nfm_reply) and calls W03 for unknown numbers / CTWA entries / qualifying taps (automation/CONTRACTS.md "Inbound ownership"). ' +
    'The adapter rebuilds the Cloud API message from W07\'s normalised msg -> W03 step. GET /whatsapp verify handshake stays here until W07 has one (one GET handler only). ' +
    'W03 step = automation/ctwa/w03.js inlined (tested by automation/tests/W03.test.mjs): consent FIRST (named mode, 0.1) -> tap-only age/budget/bond/method -> W01 Lead core routes and W06 sends the intro card < 60 s. ' +
    'No consent = only smc_hash_contact(mobile) in suppression. Forwards to W07 carry origin w03 and W07 never routes them back here (I-37e). W03 is the SINGLE owner of unfinished-CTWA stall nudges (+1/+20/+68 h, inside the 72-h window; before consent they only re-ask the consent question); W08 skips every lead without broker_id. Consent text version ctwa-named-v2 (responsible party + STOP + privacy link). Pre-consent state lives in public.wa_threads (needs_human: schema pass 3). lead_token minted on insert (CONTRACTS.md). ' +
    'Second entry: GET /wa/:ref tracked redirect (I-09) -> 302 wa.me only. Env: META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN, META_GRAPH_VERSION, LEAD_TOKEN_SECRET, WA_DISPLAY_NUMBER_DIGITS. Needs NODE_FUNCTION_ALLOW_BUILTIN=crypto.' }));

  // I-35d: W07 owns POST /whatsapp (signature, 200, wamid claim, statuses, STOP, brokers, nfm_reply). W03 is a sub-workflow:
  // W07 calls it with { source: 'W07', route, msg, lead, booking } where msg is W07's normaliseInbound() shape. The adapter below
  // rebuilds the Cloud API message object that ctwa/w03.js step() reads, so the tested logic is unchanged.
  n.push(node('Called by W07 (CTWA lead)', 'executeWorkflowTrigger', 1.1, [0, 0], { inputSource: 'passthrough' }));
  n.push(code('W07 hand-off -> Cloud API message', [220, 0],
`const out = [];
for (const it of $input.all()) {
  const j = it.json || {};
  const g = j.msg || {};
  if (!g.wamid || !g.from) continue;
  const m = { id: g.wamid, from: String(g.from).replace(/^\\+/, ''), timestamp: String(Math.floor(Number(g.at_ms || Date.now()) / 1000)), type: g.type || 'text' };
  if (g.referral) m.referral = g.referral;
  if (m.type === 'text') m.text = { body: g.text || '' };
  else if (m.type === 'button') m.button = { payload: g.payload, text: g.text || '' };
  else if (m.type === 'interactive') m.interactive = g.list_id != null ? { type: 'list_reply', list_reply: { id: g.list_id, title: g.text || '' } } : { type: 'button_reply', button_reply: { id: g.payload, title: g.text || '' } };
  else if (g.media) m[m.type] = { caption: g.text || '' };
  out.push({ json: { kind: 'lead', source: j.source || 'W07', external_id: g.wamid, phone_number_id: g.phone_number_id, mobile: '+' + m.from, profile_name: j.profile_name || null, msg: m, at: new Date(Number(m.timestamp) * 1000).toISOString() } });
}
return out;`));
  n.push(pg('Load context', [1340, 200],
`-- brand by receiving number; routed candidate (named consent needs the broker before the prompt, 0.1);
-- 90-day open lead; LV-wide or brand suppression (a past CTWA "No thanks" may be asked again: they wrote to us);
-- pre-consent thread (public.wa_threads, needs_human schema pass 3).
SELECT br.id AS brand_id,
       (SELECT row_to_json(k) FROM (
          SELECT b.id AS broker_id, b.practice_name, b.fsp_number, b.adviser_name, split_part(b.adviser_name, ' ', 1) AS adviser_first_name,
                 b.methods_supported, coalesce(b.consent_mode, 'named') AS consent_mode, b.current_cycle_id
            FROM public.brokers b
           WHERE b.brand_id = br.id AND b.active AND b.routing_on AND NOT b.bookings_paused AND b.status = 'active'
           ORDER BY b.next_free_slot_at NULLS LAST, b.created_at
           LIMIT 1) k) AS broker,
       (SELECT l.id FROM public.leads l
         WHERE l.brand_id = br.id AND l.dedupe_hash = public.smc_hash_contact($2)
           AND l.created_at > now() - interval '90 days' AND l.opted_out_at IS NULL
           AND coalesce(l.stage, 'new') NOT IN ('disqualified', 'unbooked_closed', 'opted_out')
         ORDER BY l.created_at DESC LIMIT 1) AS existing_open_lead_id,
       EXISTS (SELECT 1 FROM public.suppression s
                WHERE s.mobile_hash = public.smc_hash_contact($2) AND (s.brand_id IS NULL OR s.brand_id = br.id)
                  AND s.source <> 'no_consent_ctwa') AS suppressed,
       (SELECT t.state FROM public.wa_threads t
         WHERE t.brand_id = br.id AND t.mobile_hash = public.smc_hash_contact($2) AND t.expires_at > now()) AS thread,
       gen_random_uuid() AS new_lead_id
  FROM public.brands br
 WHERE br.phone_number_id = $1
 LIMIT 1;`,
    '={{ [ $json.phone_number_id, $json.mobile ] }}'));
  n.push(code('W03 step', [1560, 200], W3 +
`const out = [];
for (const [i, item] of $input.all().entries()) {
  const ctxRow = item.json;
  const m = $('W07 hand-off -> Cloud API message').all()[i].json;
  const broker = ctxRow.broker || null;
  const brand = { brand_id: ctxRow.brand_id, consent_mode: broker ? broker.consent_mode : 'named' };
  const r = W3.step(ctxRow.thread || null, m.msg, { at: m.at, mobile: m.mobile, profile_name: m.profile_name, lead_id: ctxRow.new_lead_id,
    broker, brand, existing_open_lead_id: ctxRow.existing_open_lead_id, suppressed: ctxRow.suppressed, wamid: m.external_id, is_synthetic: false });
  const st = r.actions.find((a) => a.kind === 'schedule_stall');
  const cancel = r.actions.some((a) => a.kind === 'cancel_stall');
  const stallDue = st && !cancel ? new Date(Date.parse(m.at) + st.hours[0] * 3600e3).toISOString() : null;
  out.push({ json: { brand_id: ctxRow.brand_id, mobile: m.mobile, wamid: m.external_id, at: m.at, phone_number_id: m.phone_number_id, broker, thread: r.thread, actions: r.actions, stall_due_at: stallDue } });
}
return out;`));
  n.push(pg('Save thread', [1780, 120],
`-- No PII in state: stage, answers (bands), origin (ad id / ctwa_clid / ref), consent text + version. Purged after expires_at.
-- W08 polls stall_due_at for the +1 h / +20 h / +68 h nudges (4.6 step 7); a reply moves it forward.
INSERT INTO public.wa_threads (brand_id, mobile_hash, state, stage, last_inbound_at, stall_due_at, expires_at, updated_at)
VALUES ($1::uuid, public.smc_hash_contact($2), $3::jsonb, $3::jsonb->>'stage', $4::timestamptz, $5::timestamptz, $4::timestamptz + interval '72 hours', now())
ON CONFLICT (brand_id, mobile_hash) DO UPDATE
   SET state = EXCLUDED.state, stage = EXCLUDED.stage, last_inbound_at = EXCLUDED.last_inbound_at,
       stall_due_at = EXCLUDED.stall_due_at, expires_at = EXCLUDED.expires_at, updated_at = now()
RETURNING stage;`,
    '={{ [ $json.brand_id, $json.mobile, JSON.stringify($json.thread || { stage: "none" }), $json.at, $json.stall_due_at ] }}'));
  n.push(code('Fan out actions', [1780, 280],
    "return $input.all().flatMap((it) => it.json.actions.filter((a) => !['schedule_stall', 'cancel_stall', 'ignore'].includes(a.kind)).map((a) => ({ json: { ...a, _brand_id: it.json.brand_id, _mobile: it.json.mobile, _wamid: it.json.wamid, _at: it.json.at, _pnid: it.json.phone_number_id, _broker: it.json.broker } })));"));
  n.push(switchOn('Action?', [2000, 280], '={{ $json.kind }}', ['send', 'insert_lead', 'update_lead', 'suppress', 'capi', 'route_and_first_touch', 'forward_w07', 'alert']));
  n.push(code('Build Cloud API body', [2240, 0], W3 + "return $input.all().map((it) => ({ json: { pnid: it.json._pnid, body: W3.toCloudApi(it.json._mobile, it.json.message) } }));"));
  n.push(node('WhatsApp send (session)', 'httpRequest', 4.2, [2460, 0], {
    method: 'POST', url: "={{ 'https://graph.facebook.com/' + $env.META_GRAPH_VERSION + '/' + $json.pnid + '/messages' }}",
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
    options: { timeout: 10000, retry: { maxTries: 3, waitBetweenTries: 1000 } },
  }, { credentials: WA, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 }));
  n.push(pg('Insert lead (consent at the tap)', [2240, 140],
`-- Row is created at "Yes, continue" (W01 parity): consent text = exact words shown, verified by the tap (3.3).
-- campaign/adset from the W21 ad_objects cache; W21 back-fills when null. Idempotent on id and on the activity key.
WITH ins AS (
  INSERT INTO public.leads (id, brand_id, origin, ref, ad_id, ctwa_clid, phone, first_name, consent_text, consent_text_version,
                            consent_mode, consent_at, consent_source, verified_at, wa_delivered_at, stage, stage_entered_at,
                            is_synthetic, campaign_id, adset_id)
  SELECT $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, 'ctwa', $12::timestamptz, $13::timestamptz,
         'verified', $12::timestamptz, $14::boolean, a.campaign_id, a.adset_id
    FROM (SELECT 1) one
    LEFT JOIN public.ad_objects a ON a.id = $5 AND a.level = 'ad'
  ON CONFLICT (id) DO NOTHING
  RETURNING id, brand_id)
INSERT INTO public.lead_activities (lead_id, brand_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT id, brand_id, 'W03', 'lead', 'ctwa_consent', jsonb_build_object('consent_text_version', $10::text, 'wamid', $15::text), $12::timestamptz, 'W03:consent:' || $15::text
  FROM ins
ON CONFLICT DO NOTHING
RETURNING lead_id;`,
    '={{ [ $json.row.id, $json.row.brand_id, $json.row.origin, $json.row.ref, $json.row.ad_id, $json.row.ctwa_clid, $json.row.phone, $json.row.first_name, $json.row.consent_text, $json.row.consent_text_version, $json.row.consent_mode, $json.row.consent_at, $json.row.wa_delivered_at, $json.row.is_synthetic, $json._wamid ] }}'));
  n.push(code('Mint lead_token', [2460, 140], LT +
    "// CONTRACTS.md lead_token: minted on insert, never stored; travels to W01 core / W06 so any web link (page booking fallback) carries it.\nreturn $input.all().map((it) => ({ json: { lead_id: it.json.lead_id, lead_token: LT.mintLeadToken(it.json.lead_id, { secret: $env.LEAD_TOKEN_SECRET }).token } }));"));
  n.push(pg('Update lead (answers / out-of-band)', [2240, 280],
`-- bands arrive already mapped to leads_smc_checks codes (w03.js AGE_TO_DB / BUDGET_TO_DB). leads.qualified is GENERATED: never written.
UPDATE public.leads
   SET age_band               = coalesce($2::jsonb->>'age_band', age_band),
       budget_band            = coalesce($2::jsonb->>'budget_band', budget_band),
       bond                   = coalesce(($2::jsonb->>'bond')::boolean, bond),
       dependants             = coalesce(($2::jsonb->>'dependants')::boolean, dependants),
       method_pref            = coalesce($2::jsonb->>'method_pref', method_pref),
       qualified_at           = coalesce(($2::jsonb->>'qualified_at')::timestamptz, qualified_at),
       disqualified_reason    = coalesce($2::jsonb->>'disqualified_reason', disqualified_reason),
       broker_id              = CASE WHEN $2::jsonb ? 'disqualified_reason' THEN NULL ELSE broker_id END,
       retention_delete_after = coalesce(($2::jsonb->>'retention_delete_after')::timestamptz, retention_delete_after),
       stage                  = coalesce($2::jsonb->>'stage', stage),
       stage_entered_at       = CASE WHEN $2::jsonb ? 'stage' THEN now() ELSE stage_entered_at END,
       last_contact_at        = now(),
       updated_at             = now()
 WHERE id = $1::uuid
RETURNING id;`,
    '={{ [ $json.id, JSON.stringify($json.set) ] }}'));
  n.push(pg('Suppress (hash only)', [2240, 420],
    "-- L05: nothing but smc_hash_contact(mobile); no name, no referral, no lead row.\nINSERT INTO public.suppression (mobile_hash, source, brand_id)\nVALUES (public.smc_hash_contact($1), 'no_consent_ctwa', $2::uuid)\nON CONFLICT DO NOTHING\nRETURNING id;",
    '={{ [ $json._mobile, $json._brand_id ] }}'));
  n.push(sub('CAPI business-messaging Lead', [2240, 560], 'CAPI Send'));
  n.push(sub('W01 Lead core (route + W06 first touch < 60 s)', [2240, 700], 'W01 Lead core'));
  // I-37e loop guard: everything W03 hands back to W07 carries origin 'w03'; W07 routeInbound never sends it to W03 again.
  n.push(code('Mark origin w03 (loop guard)', [2240, 840], "const m = $('Called by W07 (CTWA lead)').first().json.msg || {}; return $input.all().map((it) => ({ json: { origin: 'w03', source: 'W03', lead_id: it.json.lead_id, reason: it.json.reason, brand_id: it.json._brand_id || null, msg: { ...m, origin: 'w03' } } }));"));
  n.push(sub('W07 Conversation agent (forward)', [2460, 840], 'W07 Conversation agent'));
  n.push(sub('W22 Alerts: W03', [2240, 980], 'W22 Alerts'));

  // tracked redirect (I-09)
  n.push(node('CTWA redirect (GET /wa/:ref)', 'webhook', 2, [0, 600], { httpMethod: 'GET', path: 'wa/:ref', responseMode: 'responseNode', options: {} }, { webhookId: 'w03-ctwa-redirect' }));
  n.push(code('Build redirect', [220, 600], W3 +
    "const it = $input.first().json;\nconst r = W3.redirectFor((it.params || {}).ref, $env.WA_DISPLAY_NUMBER_DIGITS, (it.headers || {})['user-agent'] || '');\nreturn [{ json: r }];"));
  n.push(respond('Respond 302 to wa.me', [440, 520], null, 302, [
    { name: 'Location', value: '={{ $json.headers.Location }}' },
    { name: 'Cache-Control', value: 'no-store' },
    { name: 'Referrer-Policy', value: 'no-referrer' },
  ]));
  n.push(pg('Log click (no IP, no UA)', [440, 680],
    "-- ops.ctwa_clicks (needs_human: schema pass 3). Counting only (POPIA minimisation).\nINSERT INTO ops.ctwa_clicks (ref, clicked_at, ua_class) VALUES ($1, now(), $2);",
    '={{ [ $json.click.ref, $json.click.ua_class ] }}'));

  // Meta GET handshake
  n.push(node('Meta webhook verify (GET)', 'webhook', 2, [0, 900], { httpMethod: 'GET', path: 'whatsapp', responseMode: 'responseNode', options: {} }, { webhookId: 'w03-waba-get' }));
  n.push(code('Check hub.verify_token', [220, 900], VW + "const q = $input.first().json.query || {};\nconst r = VW.metaVerifyHandshake(q, $env.META_WEBHOOK_VERIFY_TOKEN);\nreturn [{ json: r }];"));
  n.push(respond('Respond hub.challenge', [440, 900], '={{ $json.ok ? $json.challenge : "forbidden" }}', '={{ $json.ok ? 200 : 403 }}'));

  link(c, 'Called by W07 (CTWA lead)', 'W07 hand-off -> Cloud API message');
  link(c, 'W07 hand-off -> Cloud API message', 'Load context');
  link(c, 'Load context', 'W03 step');
  link(c, 'W03 step', 'Save thread');
  link(c, 'W03 step', 'Fan out actions');
  link(c, 'Fan out actions', 'Action?');
  ['Build Cloud API body', 'Insert lead (consent at the tap)', 'Update lead (answers / out-of-band)', 'Suppress (hash only)', 'CAPI business-messaging Lead',
    'W01 Lead core (route + W06 first touch < 60 s)', 'Mark origin w03 (loop guard)', 'W22 Alerts: W03'].forEach((t, i) => link(c, 'Action?', t, i));
  link(c, 'Mark origin w03 (loop guard)', 'W07 Conversation agent (forward)');
  link(c, 'Build Cloud API body', 'WhatsApp send (session)');
  link(c, 'Insert lead (consent at the tap)', 'Mint lead_token');
  link(c, 'CTWA redirect (GET /wa/:ref)', 'Build redirect');
  link(c, 'Build redirect', 'Respond 302 to wa.me');
  link(c, 'Build redirect', 'Log click (no IP, no UA)');
  link(c, 'Meta webhook verify (GET)', 'Check hub.verify_token');
  link(c, 'Check hub.verify_token', 'Respond hub.challenge');
  return { name: 'W03 Lead intake (Click-to-WhatsApp)', nodes: n, connections: c, active: false, settings: SETTINGS, pinData: {}, tags: [{ name: 'intake' }, { name: 'whatsapp' }], meta: { notes: 'automation-engineer. Logic: automation/ctwa/w03.js. Generated by automation/build-w03-w28.mjs; do not hand-edit Code nodes.' } };
}

// =========================================================================================== W28
function buildW28() {
  seq = 0;
  const c = {};
  const n = [];
  n.push(node('Sticky: read me', 'stickyNote', 1, [0, -360], { width: 760, height: 340, content:
    'W28 Booking Flow endpoint (automation-engineer). Contract: automation/flows/booking-flow-endpoint.md. NOT on the launch path (0.3 #3): ' +
    'brands.booking_ui = list ships first; the Flow is a flag flip once published (HUMAN GATE) and the _v2 templates are approved. ' +
    'POST /flow: X-Hub-Signature-256 (432) -> decrypt (421; flow-crypto.js = placeholder mirror of Meta reference code, swap verbatim at W28 step 2) -> ping answers at once -> ' +
    'flow_token verified by HMAC (lead-token.js, no flow_tokens table; payload ids never trusted) -> lead/broker/booking from Postgres -> W04 slot engine (same engine as /slots; fresh getSchedule for slot_selected) -> ' +
    'w28-endpoint.js screens (METHOD/DATE/SLOTS/EMAIL/SUMMARY; email only for Teams/Zoom/Meet) -> encrypted 200 in < 3 s. Complete is NOT here: nfm_reply -> W07 ingress (POST /whatsapp) -> W05 (transactional re-check). ' +
    'Fallback ladder: 2 errors on a token, calendar down, no slots, or op=send_list -> interactive list of the next 10 slots (spread across days). op=revert (called by W22 on ping failure) sets booking_ui = list. ' +
    'Env: META_APP_SECRET, FLOW_PRIVATE_KEY, FLOW_PRIVATE_KEY_PASSPHRASE, LEAD_TOKEN_SECRET, LEAD_TOKEN_SECRET_PREVIOUS, META_GRAPH_VERSION, PHONE_NUMBER_ID. NODE_FUNCTION_ALLOW_BUILTIN=crypto,dns.' }));

  n.push(node('Flow endpoint (POST)', 'webhook', 2, [0, 0], { httpMethod: 'POST', path: 'flow', responseMode: 'responseNode', options: { rawBody: true } }, { webhookId: 'w28-flow-post' }));
  n.push(code('Verify + decrypt', [220, 0], VW + FC + LT +
`const it = $input.first();
const raw = it.binary && it.binary.data ? Buffer.from(it.binary.data.data, 'base64').toString('utf8') : (it.json.rawBody || JSON.stringify(it.json.body));
const sig = (it.json.headers || {})['x-hub-signature-256'];
if (!VW.verifyMetaSignature(raw, sig, $env.META_APP_SECRET).ok) return [{ json: { status: 432 } }];
let dec;
try { dec = FC.decryptRequest(JSON.parse(raw), String($env.FLOW_PRIVATE_KEY || '').replace(/\\\\n/g, '\\n'), $env.FLOW_PRIVATE_KEY_PASSPHRASE); }
catch (e) { return [{ json: { status: e.statusCode || 421 } }]; }
const req = dec.decryptedBody;
const aes = dec.aesKeyBuffer.toString('base64');
const iv = dec.initialVectorBuffer.toString('base64');
if (req.action === 'ping') return [{ json: { status: 200, ping: true, encrypted: FC.encryptResponse({ data: { status: 'active' } }, dec.aesKeyBuffer, dec.initialVectorBuffer) } }];
const tok = LT.verifyFlowToken(req.flow_token, { secret: $env.LEAD_TOKEN_SECRET, previousSecret: $env.LEAD_TOKEN_SECRET_PREVIOUS });
const d = req.data || {};
return [{ json: { status: 200, ping: false, req, tok, aes, iv, lead_id: tok.ok ? tok.lead_id : null, booking_id: tok.ok ? tok.booking_id : null,
  date: d.date || null, fresh: d.action_type === 'slot_selected' } }];`));
  n.push(switchOn('Status?', [440, 0], '={{ $json.status === 200 ? ($json.ping ? "ping" : "work") : "reject" }}', ['ping', 'work', 'reject']));
  n.push(respond('Respond ping (encrypted)', [660, -160], '={{ $json.encrypted }}', 200));
  n.push(respond('Respond 421 / 432', [660, 160], '={{ "" }}', '={{ $json.status }}'));
  n.push(pg('Load token context', [660, 0],
`-- The flow_token (HMAC) names the lead; everything else is looked up here, never taken from the payload.
SELECT row_to_json(l) AS lead, row_to_json(b) AS broker, row_to_json(a) AS booking, br.booking_ui,
       (SELECT count(*) FROM public.lead_activities x
         WHERE x.lead_id = l.id AND x.activity_type = 'flow_error' AND x.payload->>'flow_token' = $2)::int AS flow_errors,
       (SELECT x.payload->>'typed_hash' FROM public.lead_activities x
         WHERE x.lead_id = l.id AND x.activity_type = 'flow_email_suggested' AND x.payload->>'flow_token' = $2
         ORDER BY x.occurred_at DESC LIMIT 1) AS email_suggested_for
  FROM (SELECT id, email, opted_out_at, brand_id, broker_id, phone FROM public.leads WHERE id = $1::uuid) l
  JOIN (SELECT id AS broker_id, adviser_name, split_part(adviser_name, ' ', 1) AS adviser_first_name, methods_supported, calendar_provider,
               meeting_hours, slot_minutes, buffer_minutes, min_notice_hours, horizon_days, max_meetings_per_day, max_meetings_per_week,
               bookings_paused, status
          FROM public.brokers) b ON b.broker_id = l.broker_id
  JOIN public.brands br ON br.id = l.brand_id
  LEFT JOIN LATERAL (SELECT ap.id, ap.method, to_char(ap.appointment_date AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI:SS"+02:00"') AS start
                       FROM public.appointments ap
                      WHERE ap.id = $3::uuid AND ap.client_id = l.id) a ON true;`,
    '={{ [ $json.lead_id, $json.req.flow_token, $json.booking_id ] }}'));
  n.at(-1).alwaysOutputData = true; // bad/expired token -> no row, but the Flow must still get an encrypted error response
  n.push(node('W04 Slot engine', 'executeWorkflow', 1.1, [880, 0], { source: 'database', workflowId: { __rl: true, mode: 'list', value: '', cachedResultName: 'W04 Slots API' }, options: { waitForSubWorkflow: true } }, { alwaysOutputData: true }));
  n.push(code('Handle (w28-endpoint.js)', [1100, 0], LT + EP_SAFE() +
`const dns = require('dns').promises;
const crypto = require('crypto');
const base = $('Verify + decrypt').first().json;
const ctx = $('Load token context').first()?.json || {};
const w04 = $input.first()?.json || { fallback: 'whatsapp', slots: [] };   // W04 output: { fallback?, slots:[{start,end}] }
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com']);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
const out = await EP.handle(base.req, {
  verifyToken: () => base.tok,
  loadContext: async () => ({ lead: ctx.lead, broker: ctx.broker, booking: ctx.booking, flow_errors: ctx.flow_errors || 0, email_suggested_for: ctx.email_suggested_for }),
  slots: async () => w04,
  now: Date.now(),
  resolveMx: (d) => withTimeout(dns.resolveMx(d), 250),
  disposable: DISPOSABLE,
  hash: (s) => crypto.createHash('sha256').update(s.toLowerCase()).digest('hex'),
});
return [{ json: { response: out.response, effects: out.effects, lead_id: ctx.lead ? ctx.lead.id : null, brand_id: ctx.lead ? ctx.lead.brand_id : null, broker_id: ctx.broker ? ctx.broker.broker_id : null, aes: base.aes, iv: base.iv } }];`));
  n.push(code('Encrypt response', [1320, -100], FC + "const j = $input.first().json;\nreturn [{ json: { ...j, encrypted: FC.encryptResponse(j.response, Buffer.from(j.aes, 'base64'), Buffer.from(j.iv, 'base64')) } }];"));
  n.push(respond('Respond 200 (encrypted)', [1540, -100], '={{ $json.encrypted }}', 200));
  n.push(code('Fan out effects', [1320, 100], "return $input.all().flatMap((it) => (it.json.effects || []).map((e) => ({ json: { ...e, _lead_id: it.json.lead_id, _brand_id: it.json.brand_id, _broker_id: it.json.broker_id } })));"));
  n.push(switchOn('Effect?', [1540, 100], '={{ $json.kind }}', ['activity', 'store_email', 'send_list', 'security_event']));
  n.push(pg('Log activity (flow_opened / flow_error)', [1760, 0],
    "-- I-22: W28 is the feeder for lead_activities 'flow_opened'; 'flow_error' rows drive the two-errors -> list rule.\nINSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)\nVALUES ($1::uuid, $2::uuid, $3::uuid, 'W28', 'lead', $4, $5::jsonb, now(),\n        CASE WHEN $4 = 'flow_opened' THEN 'W28:flow_opened:' || ($5::jsonb->>'flow_token') ELSE NULL END)\nON CONFLICT DO NOTHING\nRETURNING id;",
    '={{ [ $json._lead_id, $json._brand_id, $json._broker_id, $json.activity_type, JSON.stringify($json.payload) ] }}'));
  n.push(pg('Store email (meeting_invite only)', [1760, 140],
    "-- 0.1 Email: only for Teams/Zoom/Meet, purpose meeting_invite. Delivery check happens when W05 sends the invite.\nUPDATE public.leads SET email = $2, email_status = $3, email_purpose = 'meeting_invite', updated_at = now()\n WHERE id = $1::uuid AND $4 = 'meeting_invite'\nRETURNING id;",
    '={{ [ $json.lead_id, $json.email, $json.email_status, $json.email_purpose ] }}'));
  n.push(sub('W22 Alerts: flow security event', [1760, 420], 'W22 Alerts'));

  // ---- single sub-workflow entry: op = send_list | revert
  n.push(node('Called by W06/W07/W10/W22', 'executeWorkflowTrigger', 1.1, [0, 600], { inputSource: 'passthrough' }));
  n.push(switchOn('Op?', [220, 600], '={{ $json.op }}', ['send_list', 'revert']));
  n.push(code('Normalise send_list input', [1760, 280], "return $input.all().map((it) => ({ json: { op: 'send_list', lead_id: it.json._lead_id || it.json.lead_id, reason: it.json.reason || null } }));"));
  n.push(pg('Load lead for list', [440, 520],
    "SELECT l.id AS lead_id, l.phone, l.brand_id, l.opted_out_at, b.id AS broker_id, b.adviser_name, split_part(b.adviser_name, ' ', 1) AS adviser_first_name\n  FROM public.leads l JOIN public.brokers b ON b.id = l.broker_id\n WHERE l.id = $1::uuid AND l.opted_out_at IS NULL;",
    '={{ [ $json.lead_id ] }}'));
  n.push(node('W04 Slot engine (list)', 'executeWorkflow', 1.1, [660, 520], { source: 'database', workflowId: { __rl: true, mode: 'list', value: '', cachedResultName: 'W04 Slots API' }, options: { waitForSubWorkflow: true } }));
  n.push(code('Build 10-slot list', [880, 520], EP_SAFE() +
`// Spread across days, earliest first (W04 rule); same as _slots.mjs offerSlots.
const spread = (slots, n) => { const by = new Map(); for (const s of slots) { const d = s.start.slice(0, 10); if (!by.has(d)) by.set(d, []); by.get(d).push(s); }
  const days = [...by.keys()].sort(); const out = []; for (let r = 0; out.length < n; r++) { let add = false; for (const d of days) { const s = by.get(d)[r]; if (s && out.length < n) { out.push(s); add = true; } } if (!add) break; } return out; };
const l = $('Load lead for list').first().json;
const w04 = $input.first().json || {};
if (w04.fallback || !(w04.slots || []).length) return [{ json: { lead_id: l.lead_id, body: null, last_resort: true } }];   // ladder step 4: W07 asks for a day
const body = EP.listFallback({ adviser_name: l.adviser_name, adviser_first_name: l.adviser_first_name }, w04.slots, spread, l.phone);
return [{ json: { lead_id: l.lead_id, brand_id: l.brand_id, broker_id: l.broker_id, body, last_resort: false } }];`));
  n.push(ifTrue('Have slots?', [1100, 520], '={{ !$json.last_resort }}'));
  n.push(node('WhatsApp send list', 'httpRequest', 4.2, [1320, 460], {
    method: 'POST', url: "={{ 'https://graph.facebook.com/' + $env.META_GRAPH_VERSION + '/' + $env.PHONE_NUMBER_ID + '/messages' }}",
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
    options: { timeout: 10000 },
  }, { credentials: WA, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 }));
  n.push(pg('Log list sent', [1540, 460],
    "INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at)\nVALUES ($1::uuid, $2::uuid, $3::uuid, 'W28', 'system', 'booking_list_sent', jsonb_build_object('wamid', $4::text), now())\nRETURNING id;",
    "={{ [ $('Build 10-slot list').item.json.lead_id, $('Build 10-slot list').item.json.brand_id, $('Build 10-slot list').item.json.broker_id, ($json.messages || [{}])[0].id || null ] }}"));
  n.push(sub('W07 last resort (ask for a day, offer 3)', [1320, 600], 'W07 Conversation agent'));
  n.push(pg('Revert booking_ui to list', [440, 760],
    "-- Fallback ladder step 3: endpoint ping failed (W22 hourly). Idempotent.\nUPDATE public.brands SET booking_ui = 'list', updated_at = now() WHERE booking_ui = 'flow' RETURNING id;"));
  n.push(sub('W22 Alerts: booking_ui reverted', [660, 760], 'W22 Alerts'));

  link(c, 'Flow endpoint (POST)', 'Verify + decrypt');
  link(c, 'Verify + decrypt', 'Status?');
  link(c, 'Status?', 'Respond ping (encrypted)', 0);
  link(c, 'Status?', 'Load token context', 1);
  link(c, 'Status?', 'Respond 421 / 432', 2);
  link(c, 'Load token context', 'W04 Slot engine');
  link(c, 'W04 Slot engine', 'Handle (w28-endpoint.js)');
  link(c, 'Handle (w28-endpoint.js)', 'Encrypt response');
  link(c, 'Handle (w28-endpoint.js)', 'Fan out effects');
  link(c, 'Encrypt response', 'Respond 200 (encrypted)');
  link(c, 'Fan out effects', 'Effect?');
  link(c, 'Effect?', 'Log activity (flow_opened / flow_error)', 0);
  link(c, 'Effect?', 'Store email (meeting_invite only)', 1);
  link(c, 'Effect?', 'Normalise send_list input', 2);
  link(c, 'Effect?', 'W22 Alerts: flow security event', 3);
  link(c, 'Normalise send_list input', 'Load lead for list');
  link(c, 'Called by W06/W07/W10/W22', 'Op?');
  link(c, 'Op?', 'Load lead for list', 0);
  link(c, 'Op?', 'Revert booking_ui to list', 1);
  link(c, 'Load lead for list', 'W04 Slot engine (list)');
  link(c, 'W04 Slot engine (list)', 'Build 10-slot list');
  link(c, 'Build 10-slot list', 'Have slots?');
  link(c, 'Have slots?', 'WhatsApp send list', 0);
  link(c, 'Have slots?', 'W07 last resort (ask for a day, offer 3)', 1);
  link(c, 'WhatsApp send list', 'Log list sent');
  link(c, 'Revert booking_ui to list', 'W22 Alerts: booking_ui reverted');
  return { name: 'W28 Booking Flow endpoint', nodes: n, connections: c, active: false, settings: SETTINGS, pinData: {}, tags: [{ name: 'booking' }, { name: 'whatsapp' }, { name: 'flow' }], meta: { notes: 'automation-engineer. Logic: automation/flows/w28-endpoint.js + flow-crypto.js + security/lead-token.js. Generated by automation/build-w03-w28.mjs; do not hand-edit Code nodes.' } };
}
function EP_SAFE() { return W28; }

writeFileSync(join(HERE, 'W03.json'), JSON.stringify(buildW03(), null, 1) + '\n');
writeFileSync(join(HERE, 'W28.json'), JSON.stringify(buildW28(), null, 1) + '\n');
console.log('wrote automation/W03.json, automation/W28.json');
