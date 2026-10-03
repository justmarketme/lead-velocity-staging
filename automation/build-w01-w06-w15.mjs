#!/usr/bin/env node
// Generates automation/W01.json, automation/W06.json and automation/W15.json (DRAFTS pending GATE-TEST-W01/W06/W15).
// The logic lives in automation/lib/w01.mjs, w06.mjs, w15.mjs (pure, no I/O); every Code node loads it with
// require('lv-automation').w0x (I-44a/I-46c: n8n's runner allow-lists the exact name `lv-automation` = automation/index.cjs, Node require(esm);
// n8n needs NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation), so automation/tests/W01/W06/W15.test.mjs exercise the running code.
// Every workflow has a stable top-level id (smc-w01 / smc-w06 / smc-w15, I-44b); Execute Workflow nodes and
// settings.errorWorkflow reference other workflows by that id (smc-wNN), the name is kept as cachedResultName only.
// Run after any change to this file:   node automation/build-w01-w06-w15.mjs
// Credentials by name only (id ''), one Postgres credential, every secret via $env, workflows inactive. Zero dependencies.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PG = { postgres: { id: '', name: 'LV Supabase - n8n_app (least privilege)' } };
const TWILIO = { httpBasicAuth: { id: '', name: 'Twilio API key (Basic)' } };
const HOWZIT = { microsoftOutlookOAuth2Api: { id: '', name: 'Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send)' } };
const SETTINGS = { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: true, errorWorkflow: 'smc-w22' };
const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 };

let seq = 0;
let col = 0;
const pos = (x, y) => [x * 220, y * 200];
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: `n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra });
const prelude = (lib) => `const L = require('lv-automation').${lib.replace(/\.mjs$/, '')};\n`;
const code = (name, p, jsCode, mode = 'runOnceForAllItems') => node(name, 'code', 2, p, { mode, jsCode });
const pg = (name, p, query, replacement, extra = {}) => node(name, 'postgres', 2.5, p, { operation: 'executeQuery', query, options: replacement ? { queryReplacement: replacement } : {} }, { credentials: PG, alwaysOutputData: true, ...RETRY, ...extra });
// Callee name -> stable workflow id (I-44b). "W06 First touch" -> smc-w06; "CAPI Send" (no W number, no file yet) -> smc-capi-send.
const workflowIdOf = (target) => { const m = /^W(\d\d)\b/.exec(target); return m ? `smc-w${m[1]}` : `smc-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; };
const sub = (name, p, target, wait = false, notes = '') => node(name, 'executeWorkflow', 1.2, p, { source: 'database', workflowId: { __rl: true, mode: 'id', value: workflowIdOf(target), cachedResultName: target }, options: { waitForSubWorkflow: wait } }, notes ? { notes } : {});
const ifTrue = (name, p, expr) => node(name, 'if', 2, p, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} });
const switchOn = (name, p, expr, values) => node(name, 'switch', 3, p, {
  rules: { values: values.map((v, i) => ({ outputKey: v, renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: `s${i}`, leftValue: expr, rightValue: v, operator: { type: 'string', operation: 'equals' } }] } })) },
  options: { fallbackOutput: 'none' },
});
const respondJson = (name, p, extraHeaders = []) => node(name, 'respondToWebhook', 1.1, p, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.http.body) }}', options: { responseCode: '={{ $json.http.http_status }}', responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }, ...extraHeaders] } } });
const noop = (name, p) => node(name, 'noOp', 1, p, {});
const sticky = (content, h = 360) => node('Sticky: read me', 'stickyNote', 1, [0, -440], { width: 900, height: h, content });
const waSend = (name, p, bodyExpr = '={{ JSON.stringify($json.wa) }}') => node(name, 'httpRequest', 4.2, p, {
  method: 'POST', url: '=https://graph.facebook.com/{{ $env.META_GRAPH_VERSION }}/{{ $env.PHONE_NUMBER_ID }}/messages',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.META_SYSTEM_USER_TOKEN }}' }, { name: 'Content-Type', value: 'application/json' }] },
  sendBody: true, specifyBody: 'json', jsonBody: bodyExpr, options: { timeout: 10000, response: { response: { neverError: true } } },
}, { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 });
const smsSend = (name, p) => node(name, 'httpRequest', 4.2, p, {
  method: 'POST', url: '=https://api.twilio.com/2010-04-01/Accounts/{{ $env.TWILIO_ACCOUNT_SID }}/Messages.json',
  authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth', sendBody: true, contentType: 'form-urlencoded',
  bodyParameters: { parameters: [{ name: 'To', value: '={{ $json.sms.to }}' }, { name: 'From', value: '={{ $env.TWILIO_SMS_FROM }}' }, { name: 'Body', value: '={{ $json.sms.text }}' }] },
  options: { timeout: 10000, response: { response: { neverError: true } } },
}, { credentials: TWILIO, retryOnFail: true, maxTries: 2, waitBetweenTries: 5000 });
const link = (conn, from, to, out = 0) => {
  conn[from] ??= { main: [] };
  while (conn[from].main.length <= out) conn[from].main.push([]);
  conn[from].main[out].push({ node: to, type: 'main', index: 0 });
};
const chain = (conn, ...names) => names.slice(1).forEach((n, i) => link(conn, names[i], n));
const wf = (id, name, nodes, connections, tags) => ({ id, name, nodes, connections, active: false, settings: SETTINGS, pinData: {}, tags: tags.map((t) => ({ name: t })), meta: { templateCredsSetupCompleted: false, generatedBy: 'automation/build-w01-w06-w15.mjs' } });

// =========================================================================================== W01
function buildW01() {
  seq = 0;
  const n = [];
  const c = {};
  n.push(sticky(
    'W01 Lead intake (web) - DRAFT pending GATE-TEST-W01 (automation-engineer). Logic: automation/lib/w01.mjs (tested by automation/tests/W01.test.mjs, which also checks this file).\n' +
    'Entry 1 POST /lead (landing page): screen (origin, honeypot, fill time, E.164, consent) -> Context (per-IP + per-number counters in webhook_events, latest lead with the same digits-only hash, suppression, brokers) -> Turnstile siteverify (fail mode per TURNSTILE_FAIL_MODE) -> guard -> Twilio Lookup only when no 30-day cached line type -> decide (landline/VoIP reject, 90-day merge, bands lt35/35_44/45_50/51plus + lt750/750_1250/1250plus, named-consent check, suppression, routing) -> one INSERT (lead + timeline) -> 200 with lead_token (CONTRACTS.md) -> CAPI Send Lead (ids only, never email) -> W06 First touch (fire-and-forget, < 60 s).\n' +
    'Entry 2 POST /lead/skip (X-Lead-Token): the page\'s "I\'ll pick on WhatsApp" -> W06 op skip (slots card at once).\n' +
    'Entry 3 Execute Workflow "W01 Lead core": W02 { action: ingest, lead } (waits for { outcome, lead_id }) and W03 { kind: route_and_first_touch, lead_id } (routing written before W06 is called).\n' +
    'Email is stored only when the chosen method needs an invite (teams/zoom/meet), purpose meeting_invite. Consent text stored verbatim with its version; registry mismatch logged (consent_audit). Out-of-band: stored with retention_delete_after = +24 h (W34 purge), never routed, never messaged.\n' +
    'Env: BRAND_ID, PUBLIC_ALLOWED_ORIGINS, TURNSTILE_SECRET_KEY, TURNSTILE_FAIL_MODE, RATE_LIMIT_PER_IP_PER_HOUR, RATE_LIMIT_PER_NUMBER_PER_DAY, RATE_LIMIT_IP_SALT, TWILIO_LOOKUP_ENABLED, TWILIO_ACCOUNT_SID, LEAD_TOKEN_SECRET(_PREVIOUS), TEST_HOOKS_ENABLED, TEST_HOOKS_TOKEN, CONSUMER_DOMAIN. Needs NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation.', 400));

  // ---- entry 1: POST /lead
  n.push(node('POST /lead (landing page)', 'webhook', 2, pos(0, 0), { httpMethod: 'POST', path: 'lead', responseMode: 'responseNode', options: {} }, { webhookId: 'w01-lead-post' }));
  n.push(code('Screen (w01.normaliseSubmission + screen)', pos(1, 0), prelude('w01.mjs') +
`const it = $input.first().json; const h = it.headers || {};
const body = it.body || {};
const test_hooks = $env.TEST_HOOKS_ENABLED === 'true' && !!$env.TEST_HOOKS_TOKEN && h['x-test-token'] === $env.TEST_HOOKS_TOKEN && body.is_synthetic === true;
const now = test_hooks && h['x-test-now'] ? Date.parse(h['x-test-now']) : Date.now();
const ip = h['cf-connecting-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || null;
const allowed = String($env.PUBLIC_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const origin_ok = !allowed.length || !h.origin || allowed.includes(h.origin);
const sub = L.normaliseSubmission(body, { ip, user_agent: h['user-agent'] || null });
const scr = L.screen(sub, { now, origin_ok });
const lead_id = L.newLeadId();
const form_post = /x-www-form-urlencoded/i.test(h['content-type'] || '');
const keys = L.rateKeys({ ip, mobile_hash: scr.ok ? scr.mobile_hash : null, request_id: sub.request_id || lead_id, salt: $env.RATE_LIMIT_IP_SALT, now });
return [{ json: { from: 'page', sub, scr, now, lead_id, test_hooks, form_post, keys, mobile: scr.ok ? scr.mobile : null,
  lookup_override: test_hooks ? (h['x-test-lookup-line-type'] || null) : null,
  http: scr.ok ? null : { http_status: scr.http_status, body: scr.body }, result: scr.ok ? null : { outcome: 'rejected', reason: scr.reason } } }];`));
  n.push(ifTrue('Screen passed?', pos(2, 0), '$json.scr.ok'));

  // ---- shared pipeline (page + lead ad)
  n.push(pg('Context: counters, prior lead, suppression, brokers', pos(3, 0),
`-- One round trip. Counters: one webhook_events row per counted request (no raw IP: HMAC key; number: digits-only hash).
-- The CTE inserts are not visible to the counts below (same snapshot), so the counts are "before this request".
WITH ipc AS (
  INSERT INTO public.webhook_events (source, external_id, received_at, signature_ok)
  SELECT 'w01_ip', $1, now(), true WHERE $1 IS NOT NULL AND $1 <> ''
  ON CONFLICT DO NOTHING RETURNING id),
numc AS (
  INSERT INTO public.webhook_events (source, external_id, received_at, signature_ok)
  SELECT 'w01_num', $2, now(), true WHERE $2 IS NOT NULL AND $2 <> ''
  ON CONFLICT DO NOTHING RETURNING id)
SELECT br.id AS brand_uuid,
       (SELECT count(*) FROM public.webhook_events w WHERE w.source = 'w01_ip' AND $3 <> '' AND w.external_id LIKE $3 || '%' AND w.received_at > now() - interval '1 hour')::int AS ip_hits,
       (SELECT count(*) FROM public.webhook_events v WHERE v.source = 'w01_num' AND $4 <> '' AND v.external_id LIKE $4 || '%' AND v.received_at > now() - interval '24 hours')::int AS number_hits,
       (SELECT to_jsonb(p) FROM (SELECT l.id, l.brand_id, l.created_at, l.line_type, l.duplicate_of, l.broker_id, l.opted_out_at
                                   FROM public.leads l
                                  WHERE l.dedupe_hash = public.smc_hash_contact($5) AND l.brand_id = br.id
                                  ORDER BY l.created_at DESC LIMIT 1) p) AS prior,
       EXISTS (SELECT 1 FROM public.suppression s WHERE s.mobile_hash = public.smc_hash_contact($5) AND (s.brand_id IS NULL OR s.brand_id = br.id)) AS suppressed,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', b.id, 'broker_id', b.id, 'brand_id', b.brand_id, 'status', b.status, 'routing_on', b.routing_on, 'active', b.active,
                  'bookings_paused', b.bookings_paused, 'practice_name', b.firm_name, 'fsp_number', b.fsp_number, 'consent_mode', b.consent_mode,
                  'current_cycle_id', b.current_cycle_id, 'tier_code', b.tier_code, 'methods_supported', b.methods_supported,
                  'committed_leads', cy.committed_leads,
                  'leads_this_cycle', (SELECT count(*) FROM public.leads x WHERE x.broker_id = b.id AND x.cycle_id = b.current_cycle_id)))
                   FROM public.brokers b LEFT JOIN public.cycles cy ON cy.id = b.current_cycle_id
                  WHERE b.brand_id = br.id), '[]'::jsonb) AS brokers
  FROM public.brands br
 WHERE br.id = $6::uuid;`,
    "={{ [$json.keys.ip_external_id || '', $json.keys.num_external_id || '', $json.keys.ip_prefix || '', $json.keys.num_prefix || '', $json.mobile, /^[0-9a-f-]{36}$/i.test($json.brand_id || '') ? $json.brand_id : $env.BRAND_ID] }}"));
  n.push(ifTrue('Turnstile check needed? (page, secret set, not a test hook)', pos(4, 0), "$('Screen passed?').item.json.from === 'page' && !!$env.TURNSTILE_SECRET_KEY && !$('Screen passed?').item.json.test_hooks"));
  n.push(node('Turnstile siteverify', 'httpRequest', 4.2, pos(5, -1), {
    method: 'POST', url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify', sendBody: true, contentType: 'form-urlencoded',
    bodyParameters: { parameters: [{ name: 'secret', value: '={{ $env.TURNSTILE_SECRET_KEY }}' }, { name: 'response', value: "={{ $('Screen passed?').item.json.sub.turnstile_token || '' }}" }, { name: 'remoteip', value: "={{ $('Screen passed?').item.json.sub.context.client_ip || '' }}" }] },
    options: { timeout: 1500, response: { response: { neverError: true } } },
  }, { onError: 'continueRegularOutput' }));
  n.push(code('Guard (w01.guard) + Lookup needed?', pos(6, 0), prelude('w01.mjs') +
`const s = $('Screen passed?').first().json;
const ctx = $('Context: counters, prior lead, suppression, brokers').first().json;
const ran = $('Turnstile check needed? (page, secret set, not a test hook)').first().json && $input.first().json && $input.first().json.success !== undefined;
const allowed = String($env.PUBLIC_ALLOWED_ORIGINS || '').split(',').map((x) => x.replace(/^https?:\\/\\//, '').trim()).filter(Boolean);
const turnstile = s.from !== 'page' || !$env.TURNSTILE_SECRET_KEY || s.test_hooks ? { skipped: true } : L.turnstileVerdict(ran ? $input.first().json : null, { allowed_hosts: allowed, action: 'lead' });
const g = L.guard(s.scr, { channel: s.sub.channel, ip_hits: ctx.ip_hits, number_hits: ctx.number_hits, turnstile, test_hooks: s.test_hooks,
  limits: { ip: Number($env.RATE_LIMIT_PER_IP_PER_HOUR) || L.IP_LIMIT_PER_HOUR, number: Number($env.RATE_LIMIT_PER_NUMBER_PER_DAY) || L.NUMBER_LIMIT_PER_DAY }, fail_mode: $env.TURNSTILE_FAIL_MODE || 'open' });
const need_lookup = g.ok && !s.lookup_override && $env.TWILIO_LOOKUP_ENABLED === 'true' && L.lookupNeeded(ctx.prior, s.now);
return [{ json: { ...s, ctx, g, need_lookup, http: g.ok ? null : { http_status: g.http_status, body: g.body }, result: g.ok ? null : { outcome: 'rejected', reason: g.reason } } }];`));
  n.push(ifTrue('Guard passed?', pos(7, 0), '$json.g.ok'));
  n.push(ifTrue('Lookup needed? (no 30-day cached line type)', pos(8, 0), '$json.need_lookup'));
  n.push(node('Twilio Lookup v2 (line type)', 'httpRequest', 4.2, pos(9, -1), {
    method: 'GET', url: '=https://lookups.twilio.com/v2/PhoneNumbers/{{ encodeURIComponent($json.mobile) }}', authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth',
    sendQuery: true, queryParameters: { parameters: [{ name: 'Fields', value: 'line_type_intelligence' }] },
    options: { timeout: 1500, response: { response: { neverError: true } } },
  }, { credentials: TWILIO, onError: 'continueRegularOutput' }));
  n.push(code('Decide (w01.decide) + lead_token', pos(10, 0), prelude('w01.mjs') +
`const LT = require('lv-automation').leadToken;
const s = $('Guard passed?').first().json;
const resp = s.need_lookup ? $input.first().json : null;
const line_type = s.lookup_override ? L.lineTypeOf(s.lookup_override) : resp ? L.lineTypeFromLookup(resp) : (s.ctx.prior && s.ctx.prior.line_type) || 'unknown';
const brokers = s.ctx.brokers || [];
const routable = brokers.find((b) => b.status === 'active' && b.routing_on !== false);
const sub = L.withRegistryText(s.sub, routable); // lead-ad registry text gets the practice once the broker is known
const decision = L.decide(sub, { mobile: s.mobile, line_type, prior: s.ctx.prior, suppressed: s.ctx.suppressed, brokers, brand_id: s.ctx.brand_uuid,
  consent_mode: (routable && routable.consent_mode) || 'named', now: s.now, lead_id: s.lead_id, bot_check: s.g.bot_check });
if (decision.row) decision.row.is_synthetic = !!s.sub.is_synthetic && s.test_hooks;
const audit = L.consentAudit(sub, L.consentRegistry(routable || {}));
if (decision.kind === 'insert') decision.activities.push({ activity_type: 'consent_audit', actor_type: 'system', occurred_at: decision.row.created_at, idempotency_key: 'w01:consent:' + decision.row.id, payload: audit });
const token = decision.mint_token ? LT.mintLeadToken(decision.lead_id || decision.row.id, { secret: $env.LEAD_TOKEN_SECRET }).token : null;
const http = L.pageResponse(decision, token);
const angle = /^[a-z0-9-]{1,40}$/.test(s.sub.angle || '') ? s.sub.angle : 'cover';
const redirect = s.form_post && http.http_status === 200 ? 'https://' + ($env.CONSUMER_DOMAIN || 'sortmycover.co.za') + '/' + angle + '/thanks/' : null;
return [{ json: { from: s.from, kind: decision.kind, decision, http, redirect, result: L.coreResult(decision) } }];`));
  n.push(switchOn('Kind?', pos(11, 0), '={{ $json.kind }}', ['reject', 'duplicate', 'insert']));
  n.push(pg('Log duplicate on the existing lead (no new lead, no WhatsApp, no CAPI)', pos(12, 0),
`INSERT INTO public.lead_activities (lead_id, brand_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT l.id, l.brand_id, 'W01', 'lead', 'duplicate_submission', $2::jsonb, now(), $3
  FROM public.leads l WHERE l.id = $1::uuid
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;`,
    "={{ [$json.decision.lead_id, JSON.stringify($json.decision.activities[0].payload), $json.decision.activities[0].idempotency_key] }}"));
  n.push(code('Duplicate answer (same body as a new lead: the page never learns)', pos(13, 0), "return [{ json: $('Kind?').first().json }];"));
  n.push(pg('Insert lead + timeline (one statement; broker_id written before W06 exists)', pos(12, 1),
`WITH r AS (SELECT $1::jsonb AS j),
ins AS (
  INSERT INTO public.leads (id, brand_id, origin, source, is_synthetic, created_at, first_name, phone, line_type, language,
                            age_band, budget_band, bond, dependants, work_cover, method_pref, angle, email, email_purpose, email_status,
                            consent_text, consent_text_version, consent_mode, consent_at, consent_page_url, consent_source, consent_ads_at,
                            lead_event_id, fbclid, fbp, fbc, ad_id, adset_id, campaign_id, leadgen_id,
                            utm_source, utm_medium, utm_campaign, utm_content, utm_term, page_url, client_ip, client_user_agent,
                            broker_id, cycle_id, tier_code, routed_at, routing_reason, stage, disqualified_reason, retention_delete_after, opted_out_at)
  SELECT (j->>'id')::uuid, (j->>'brand_id')::uuid, j->>'origin', j->>'source', COALESCE((j->>'is_synthetic')::boolean, false), (j->>'created_at')::timestamptz,
         j->>'first_name', j->>'phone', j->>'line_type', j->>'language',
         j->>'age_band', j->>'budget_band', (j->>'bond')::boolean, (j->>'dependants')::boolean, (j->>'work_cover')::boolean, j->>'method_pref', j->>'angle',
         j->>'email', j->>'email_purpose', j->>'email_status',
         j->>'consent_text', j->>'consent_text_version', j->>'consent_mode', (j->>'consent_at')::timestamptz, j->>'consent_page_url', j->>'consent_source', (j->>'consent_ads_at')::timestamptz,
         j->>'lead_event_id', j->>'fbclid', j->>'fbp', j->>'fbc', j->>'ad_id', j->>'adset_id', j->>'campaign_id', j->>'leadgen_id',
         j->>'utm_source', j->>'utm_medium', j->>'utm_campaign', j->>'utm_content', j->>'utm_term', j->>'page_url', j->>'client_ip', j->>'client_user_agent',
         (j->>'broker_id')::uuid, (j->>'cycle_id')::uuid, j->>'tier_code', (j->>'routed_at')::timestamptz, j->>'routing_reason', j->>'stage', j->>'disqualified_reason',
         (j->>'retention_delete_after')::timestamptz, (j->>'opted_out_at')::timestamptz
    FROM r
  ON CONFLICT DO NOTHING
  RETURNING id, brand_id, broker_id, cycle_id)
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT ins.id, ins.brand_id, ins.broker_id, ins.cycle_id, 'W01', a->>'actor_type', a->>'activity_type', a->'payload', (a->>'occurred_at')::timestamptz, a->>'idempotency_key'
  FROM ins, jsonb_array_elements($2::jsonb) a
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING lead_id;`,
    '={{ [JSON.stringify($json.decision.row), JSON.stringify($json.decision.activities)] }}'));
  n.push(code('Inserted? (a same-event_id race inserts nothing: answer, send nothing)', pos(13, 1),
`const d = $('Kind?').first().json;
const inserted = $input.all().some((i) => i.json && i.json.lead_id);
return [{ json: { ...d, inserted, first_touch: inserted ? d.decision.first_touch : null, capi: inserted ? d.decision.capi : null } }];`));
  n.push(ifTrue('From the page? (respond)', pos(14, 0), "$json.from === 'page'"));
  n.push(ifTrue('No-JS form post? (303 to thanks)', pos(15, 0), '!!$json.redirect'));
  n.push(node('Respond 303 (no-JS form)', 'respondToWebhook', 1.1, pos(16, -1), { respondWith: 'noData', options: { responseCode: 303, responseHeaders: { entries: [{ name: 'Location', value: '={{ $json.redirect }}' }, { name: 'Cache-Control', value: 'no-store' }] } } }));
  n.push(respondJson('Respond (lead_id + lead_token)', pos(16, 0)));
  n.push(code('Result for the caller (W02 waits on it)', pos(15, 2), "return $input.all().map((i) => ({ json: i.json.result || { outcome: i.json.kind } }));"));
  n.push(ifTrue('CAPI Lead? (consent gate passed, row inserted)', pos(17, 0), '!!$json.capi'));
  n.push(code('CAPI payload (ids only, no email)', pos(18, -1),
`// CONTRACTS.md "CAPI Send": ids travel, the callee hashes phone + name inside capi.js; email is never sent to Meta.
return $input.all().map((i) => { const c = i.json.capi; return { json: { event_name: c.event_name, event_id: c.event_id, action_source: c.action_source, lead_id: c.lead_id, brand_id: c.brand_id, event_time: c.event_time } }; });`));
  n.push(sub('CAPI Send (Lead)', pos(19, -1), 'CAPI Send', false, 'Called with { event_name: Lead, event_id, action_source, lead_id, brand_id, event_time }. Consent gate, hashing and back-off inside the callee (automation/capi).'));
  n.push(ifTrue('First touch? (routed, not suppressed)', pos(17, 1), '!!$json.first_touch'));
  n.push(code('W06 input', pos(18, 1), "return $input.all().map((i) => ({ json: { op: 'routed', lead_id: i.json.first_touch.lead_id, origin: i.json.first_touch.origin, not_before: i.json.first_touch.not_before } }));"));
  n.push(sub('W06 First touch (< 60 s)', pos(19, 1), 'W06 First touch', false, 'Called with { op: routed, lead_id, origin }. The lead row (broker_id, cycle_id, routed_at) is committed before this call. W06 holds page leads 45 s for the in-page booking.'));

  // ---- entry 2: POST /lead/skip
  n.push(node('POST /lead/skip (I\'ll pick on WhatsApp)', 'webhook', 2, pos(0, 4), { httpMethod: 'POST', path: 'lead/skip', responseMode: 'responseNode', options: {} }, { webhookId: 'w01-lead-skip' }));
  n.push(code('Verify X-Lead-Token', pos(1, 4),
`const LT = require('lv-automation').leadToken;
const h =$input.first().json.headers || {};
const v = LT.verifyLeadToken(h['x-lead-token'] || '', { secret: $env.LEAD_TOKEN_SECRET, previousSecret: $env.LEAD_TOKEN_SECRET_PREVIOUS || undefined });
return [{ json: { ok: !!v.ok, lead_id: v.ok ? v.lead_id : null, http: v.ok ? { http_status: 202, body: { ok: true } } : { http_status: 401, body: { error: 'try_again' } } } }];`));
  n.push(respondJson('Respond 202 / 401', pos(2, 4)));
  n.push(ifTrue('Token ok?', pos(3, 4), '$json.ok'));
  n.push(pg('Lead still live + routed?', pos(4, 4),
    "SELECT l.id AS lead_id FROM public.leads l WHERE l.id = $1::uuid AND l.opted_out_at IS NULL AND l.broker_id IS NOT NULL AND l.first_message_at IS NULL;",
    '={{ [$json.lead_id] }}'));
  n.push(code('W06 skip input', pos(5, 4), "return $input.all().filter((i) => i.json.lead_id).map((i) => ({ json: { op: 'skip', lead_id: i.json.lead_id } }));"));
  n.push(sub('W06 First touch (skip)', pos(6, 4), 'W06 First touch', false, 'Called with { op: skip, lead_id }: the slots card goes now instead of at the end of the 45-s hold.'));

  // ---- entry 3: W01 Lead core (W02 / W03)
  n.push(node('Called as W01 Lead core (W02 ingest / W03 route)', 'executeWorkflowTrigger', 1.1, pos(0, 6), { inputSource: 'passthrough' }));
  n.push(switchOn('Core action?', pos(1, 6), "={{ $json.action === 'ingest' ? 'ingest' : $json.kind === 'route_and_first_touch' ? 'route' : 'other' }}", ['ingest', 'route', 'other']));
  n.push(code('Lead ad -> submission (w01.normaliseLeadAd + screen)', pos(2, 5), prelude('w01.mjs') +
`const out = [];
for (const it of $input.all()) {
  const sub = L.normaliseLeadAd(it.json, {});
  const now = Date.now();
  const scr = L.screen(sub, { now });
  const lead_id = L.newLeadId();
  out.push({ json: { from: 'core', sub, scr, now, lead_id, test_hooks: false, form_post: false, keys: L.rateKeys({ mobile_hash: scr.ok ? scr.mobile_hash : null, request_id: sub.request_id || lead_id, now }),
    mobile: scr.ok ? scr.mobile : null, lookup_override: null, brand_id: it.json.lead && it.json.lead.brand_id || null,
    http: scr.ok ? null : { http_status: scr.http_status, body: scr.body }, result: scr.ok ? null : { outcome: 'rejected', reason: scr.reason } } });
}
return out;`));
  n.push(pg('Load CTWA lead + brokers', pos(2, 7),
`SELECT to_jsonb(q) AS lead,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'broker_id', b.id, 'brand_id', b.brand_id, 'status', b.status, 'routing_on', b.routing_on,
                  'active', b.active, 'bookings_paused', b.bookings_paused, 'practice_name', b.firm_name, 'fsp_number', b.fsp_number,
                  'current_cycle_id', b.current_cycle_id, 'tier_code', b.tier_code, 'consent_mode', b.consent_mode))
                   FROM public.brokers b WHERE b.brand_id = q.brand_id), '[]'::jsonb) AS brokers
  FROM (SELECT l.id, l.brand_id, l.origin, l.broker_id, l.routed_at, l.opted_out_at, l.disqualified_reason, l.consent_text, l.consent_mode,
               l.routing_reason, l.consent_ads_at, l.lead_event_id, l.created_at,
               EXISTS (SELECT 1 FROM public.suppression s WHERE s.mobile_hash = public.smc_hash_contact(l.phone) AND (s.brand_id IS NULL OR s.brand_id = l.brand_id)) AS suppressed
          FROM public.leads l WHERE l.id = $1::uuid) q;`,
    '={{ [$json.lead_id] }}'));
  n.push(code('Route (w01.routeExisting)', pos(3, 7), prelude('w01.mjs') +
`const out = [];
for (const it of $input.all()) {
  const r = L.routeExisting(it.json.lead, { brokers: it.json.brokers || [], now: Date.now() });
  out.push({ json: { lead_id: it.json.lead && it.json.lead.id, r, routed: r.action === 'routed', update: r.update || null } });
}
return out;`));
  n.push(ifTrue('Routed or held? (write it)', pos(4, 7), "['routed', 'held'].includes($json.r.action)"));
  n.push(pg('Write routing (only if not routed yet) + timeline', pos(5, 7),
`WITH u AS (
  UPDATE public.leads l
     SET broker_id = COALESCE(($2::jsonb->>'broker_id')::uuid, l.broker_id), cycle_id = COALESCE(($2::jsonb->>'cycle_id')::uuid, l.cycle_id),
         tier_code = COALESCE($2::jsonb->>'tier_code', l.tier_code), routed_at = COALESCE(($2::jsonb->>'routed_at')::timestamptz, l.routed_at),
         routing_reason = $2::jsonb->>'routing_reason', updated_at = now()
   WHERE l.id = $1::uuid AND l.broker_id IS NULL AND l.opted_out_at IS NULL
  RETURNING l.id, l.brand_id, l.broker_id, l.cycle_id)
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT u.id, u.brand_id, u.broker_id, u.cycle_id, 'W01', 'system', CASE WHEN u.broker_id IS NULL THEN 'routing_held' ELSE 'routed' END, $2::jsonb, now(), 'w01:routed:' || u.id::text
  FROM u
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING lead_id, broker_id;`,
    '={{ [$json.lead_id, JSON.stringify($json.update || { routing_reason: $json.r.update && $json.r.update.routing_reason })] }}'));
  // I-49c: a lead W01 held at intake gets its CAPI Lead only now, when the hand-over write actually routed it.
  n.push(code('CAPI Lead at hand-over (held -> routed)', pos(6, 8),
`const routed = new Set($input.all().filter((i) => i.json.broker_id).map((i) => String(i.json.lead_id)));
return $('Route (w01.routeExisting)').all().map((i) => i.json).filter((x) => x.r && x.r.capi && routed.has(String(x.lead_id)))
  .map((x) => { const c = x.r.capi; return { json: { event_name: c.event_name, event_id: c.event_id, action_source: c.action_source, lead_id: c.lead_id, brand_id: c.brand_id, event_time: c.event_time } }; });`));
  n.push(sub('CAPI Send (Lead at hand-over)', pos(7, 8), 'CAPI Send', false, 'I-49c: { event_name: Lead, event_id, ... } for a lead held at intake (no CAPI then). Consent gate inside the callee.'));
  n.push(code('W06 input (CTWA)', pos(6, 7), "return $input.all().filter((i) => i.json.broker_id).map((i) => ({ json: { op: 'routed', lead_id: i.json.lead_id, origin: 'ctwa' } }));"));
  n.push(sub('W06 First touch (CTWA)', pos(7, 7), 'W06 First touch', false, 'Called with { op: routed, lead_id, origin: ctwa }: slots card (or Flow v2) at once.'));
  n.push(code('Unknown core call (logged, never guessed)', pos(2, 9), "return [{ json: { outcome: 'subcall_rejected', reason: 'W01 Lead core needs action=ingest or kind=route_and_first_touch', keys: Object.keys($input.first().json || {}) } }];"));

  // connections
  chain(c, 'POST /lead (landing page)', 'Screen (w01.normaliseSubmission + screen)', 'Screen passed?');
  link(c, 'Screen passed?', 'Context: counters, prior lead, suppression, brokers', 0);
  link(c, 'Screen passed?', 'From the page? (respond)', 1);
  chain(c, 'Context: counters, prior lead, suppression, brokers', 'Turnstile check needed? (page, secret set, not a test hook)');
  link(c, 'Turnstile check needed? (page, secret set, not a test hook)', 'Turnstile siteverify', 0);
  link(c, 'Turnstile check needed? (page, secret set, not a test hook)', 'Guard (w01.guard) + Lookup needed?', 1);
  chain(c, 'Turnstile siteverify', 'Guard (w01.guard) + Lookup needed?', 'Guard passed?');
  link(c, 'Guard passed?', 'Lookup needed? (no 30-day cached line type)', 0);
  link(c, 'Guard passed?', 'From the page? (respond)', 1);
  link(c, 'Lookup needed? (no 30-day cached line type)', 'Twilio Lookup v2 (line type)', 0);
  link(c, 'Lookup needed? (no 30-day cached line type)', 'Decide (w01.decide) + lead_token', 1);
  chain(c, 'Twilio Lookup v2 (line type)', 'Decide (w01.decide) + lead_token', 'Kind?');
  link(c, 'Kind?', 'From the page? (respond)', 0);
  link(c, 'Kind?', 'Log duplicate on the existing lead (no new lead, no WhatsApp, no CAPI)', 1);
  link(c, 'Kind?', 'Insert lead + timeline (one statement; broker_id written before W06 exists)', 2);
  chain(c, 'Log duplicate on the existing lead (no new lead, no WhatsApp, no CAPI)', 'Duplicate answer (same body as a new lead: the page never learns)', 'From the page? (respond)');
  chain(c, 'Insert lead + timeline (one statement; broker_id written before W06 exists)', 'Inserted? (a same-event_id race inserts nothing: answer, send nothing)', 'From the page? (respond)');
  link(c, 'Inserted? (a same-event_id race inserts nothing: answer, send nothing)', 'CAPI Lead? (consent gate passed, row inserted)');
  link(c, 'Inserted? (a same-event_id race inserts nothing: answer, send nothing)', 'First touch? (routed, not suppressed)');
  link(c, 'From the page? (respond)', 'No-JS form post? (303 to thanks)', 0);
  link(c, 'From the page? (respond)', 'Result for the caller (W02 waits on it)', 1);
  link(c, 'No-JS form post? (303 to thanks)', 'Respond 303 (no-JS form)', 0);
  link(c, 'No-JS form post? (303 to thanks)', 'Respond (lead_id + lead_token)', 1);
  link(c, 'CAPI Lead? (consent gate passed, row inserted)', 'CAPI payload (ids only, no email)', 0);
  chain(c, 'CAPI payload (ids only, no email)', 'CAPI Send (Lead)');
  link(c, 'First touch? (routed, not suppressed)', 'W06 input', 0);
  chain(c, 'W06 input', 'W06 First touch (< 60 s)');
  chain(c, "POST /lead/skip (I'll pick on WhatsApp)", 'Verify X-Lead-Token', 'Respond 202 / 401', 'Token ok?');
  link(c, 'Token ok?', 'Lead still live + routed?', 0);
  chain(c, 'Lead still live + routed?', 'W06 skip input', 'W06 First touch (skip)');
  chain(c, 'Called as W01 Lead core (W02 ingest / W03 route)', 'Core action?');
  link(c, 'Core action?', 'Lead ad -> submission (w01.normaliseLeadAd + screen)', 0);
  link(c, 'Core action?', 'Load CTWA lead + brokers', 1);
  link(c, 'Core action?', 'Unknown core call (logged, never guessed)', 2);
  link(c, 'Lead ad -> submission (w01.normaliseLeadAd + screen)', 'Screen passed?');
  chain(c, 'Load CTWA lead + brokers', 'Route (w01.routeExisting)', 'Routed or held? (write it)');
  link(c, 'Routed or held? (write it)', 'Write routing (only if not routed yet) + timeline', 0);
  chain(c, 'Write routing (only if not routed yet) + timeline', 'W06 input (CTWA)', 'W06 First touch (CTWA)');
  chain(c, 'Write routing (only if not routed yet) + timeline', 'CAPI Lead at hand-over (held -> routed)', 'CAPI Send (Lead at hand-over)');
  return wf('smc-w01', 'W01 Lead intake (web) (DRAFT pending GATE-TEST-W01)', n, c, ['SortMyCover', 'core-path', 'draft']);
}

// =========================================================================================== W06
function buildW06() {
  seq = 0;
  const n = [];
  const c = {};
  n.push(sticky(
    'W06 First touch (< 60 s) - DRAFT pending GATE-TEST-W06 (automation-engineer). Logic: automation/lib/w06.mjs (tested by automation/tests/W06.test.mjs, which also checks this file).\n' +
    'Entry: Execute Workflow from W01 / W01 Lead core (op routed), W01 POST /lead/skip (op skip), W05 (op booking: page booking inside the hold) and W07 (op status: delivery receipt of a disclosure card).\n' +
    'Page leads are held 45 s for the in-page booking; lead-ad and CTWA leads go at once. ONE claim per lead (lead_activities w06:first:{lead_id}) so exactly one intro card is ever sent. Templates: broker_intro_booked (7 vars, URL + 2 quick replies), broker_intro_slots (7 vars, slot_{ISO} x3 + other_times; slots from the W04 sub-workflow, never invented), broker_intro_slots_v2 (4 vars + Flow button, flow_token per CONTRACTS.md) when brands.booking_ui = flow.\n' +
    'Evidence: communications row (wamid, template, latency_ms) + leads.first_message_at / disclosure_msg_id / last_contact_at (CONTRACTS I-38d) in one statement. Delivered -> disclosure_delivered_at; failed or rejected -> SMS (Twilio) with the same disclosure words. No quiet hours on the first touch (HBR). DRY_RUN_SENDS=true sends nothing and touches nothing.\n' +
    'Env: META_GRAPH_VERSION, PHONE_NUMBER_ID, META_SYSTEM_USER_TOKEN, LEAD_TOKEN_SECRET, TWILIO_ACCOUNT_SID, TWILIO_SMS_FROM, DRY_RUN_SENDS.', 380));
  n.push(node('Called by W01 / W05 / W07 (op routed | skip | booking | status)', 'executeWorkflowTrigger', 1.1, pos(0, 0), { inputSource: 'passthrough' }));
  // I-45f: W05 sends { event: 'booking', ... } (w06.normaliseEvent maps it to op 'booking').
  n.push(switchOn('Op?', pos(1, 0), "={{ $json.op === 'status' ? 'status' : ['routed', 'skip', 'booking', 'hold'].includes($json.op || ($json.event === 'booking' ? 'booking' : '')) ? 'send' : 'other' }}", ['send', 'status', 'other']));
  n.push(pg('Load lead, broker, brand, live booking', pos(2, 0),
`SELECT l.id, l.brand_id, l.origin, l.first_name, l.phone, l.language, l.broker_id, l.routed_at, l.stage, l.opted_out_at, l.duplicate_of,
       l.disqualified_reason, l.first_message_at,
       EXISTS (SELECT 1 FROM public.suppression s WHERE s.mobile_hash = public.smc_hash_contact(l.phone) AND (s.brand_id IS NULL OR s.brand_id = l.brand_id)) AS suppressed,
       b.firm_name AS practice_name, b.fsp_number, b.contact_person AS adviser_name, b.intro_card_url,
       br.booking_ui,
       (SELECT to_jsonb(q) FROM (SELECT a.id, a.created_at, a.appointment_date AS start, a.method
                                   FROM public.appointments a
                                  WHERE a.client_id = l.id AND a.status IN ('booked','confirmed') AND (a.id = $2::uuid OR $2::uuid IS NULL)
                                  ORDER BY a.created_at DESC LIMIT 1) q) AS booking
  FROM public.leads l
  JOIN public.brokers b ON b.id = l.broker_id
  JOIN public.brands br ON br.id = l.brand_id
 WHERE l.id = $1::uuid;`,
    '={{ [$json.lead_id, $json.booking_id || null] }}'));
  n.push(code('Hold for the in-page booking? (w06.holdSeconds)', pos(3, 0), prelude('w06.mjs') +
`const ev = L.normaliseEvent($('Called by W01 / W05 / W07 (op routed | skip | booking | status)').first().json);
const l = $input.first().json;
if (!l || !l.id) return [{ json: { blocked: 'no_lead', lead_id: ev.lead_id, hold_s: 0 } }];
const block = L.blockReason(l);
return [{ json: { ev, l, blocked: block, hold_s: block ? 0 : L.holdSeconds(l, ev.op) } }];`));
  n.push(ifTrue('Blocked? (unrouted, out-of-band, duplicate, suppressed, opted out)', pos(4, 0), '!!$json.blocked'));
  n.push(pg('Log not sent (reason only)', pos(5, -1),
`INSERT INTO public.lead_activities (lead_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT l.id, 'W06', 'system', 'first_touch_blocked', jsonb_build_object('reason', $2::text), now(), 'w06:blocked:' || l.id::text
  FROM public.leads l WHERE l.id = $1::uuid
ON CONFLICT (idempotency_key) DO NOTHING;`,
    '={{ [$json.lead_id || ($json.l && $json.l.id) || null, $json.blocked] }}'));
  n.push(ifTrue('Page lead: hold 45 s?', pos(5, 0), '$json.hold_s > 0'));
  n.push(node('Wait 45 s (booking or skip may claim first)', 'wait', 1.1, pos(6, -1), { resume: 'timeInterval', amount: 45, unit: 'seconds' }));
  n.push(code('Event after hold', pos(7, -1), "return $input.all().map((i) => ({ json: { ...i.json, ev: { ...i.json.ev, op: 'hold' } } }));"));
  n.push(pg('Claim the one first touch (w06:first:{lead_id})', pos(8, 0),
`-- Exactly one intro card per lead: whichever event (hold expiry, skip, page booking) inserts this row first sends.
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT l.id, l.brand_id, l.broker_id, 'W06', 'system', 'first_touch_claimed', jsonb_build_object('op', $2::text, 'booking_id', NULLIF($3, '')), now(), 'w06:first:' || l.id::text
  FROM public.leads l
 WHERE l.id = $1::uuid AND l.opted_out_at IS NULL AND l.broker_id IS NOT NULL AND l.first_message_at IS NULL
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING lead_id;`,
    "={{ [$json.l.id, $json.ev.op, ($json.ev.op === 'booking' && $json.l.booking) ? String($json.l.booking.id) : ''] }}"));
  n.push(code('Claimed? -> need W04 slots?', pos(9, 0),
`const j = $('Hold for the in-page booking? (w06.holdSeconds)').first().json;
const ev = $('Event after hold').isExecuted ? { ...j.ev, op: 'hold' } : j.ev;
const claimed = $input.all().some((i) => i.json && i.json.lead_id);
const booked = ev.op === 'booking' && j.l.booking;
const need_slots = claimed && !booked && j.l.booking_ui !== 'flow';
// I-45f: a booking event that lost the claim (slots card already out, or a chat booking) -> booking_confirmed instead.
const late_booking = !claimed && !!booked;
return [{ json: { ...j, ev, claimed, need_slots, late_booking, broker_id: j.l.broker_id, limit: 10 } }];`));
  n.push(ifTrue('Claimed by this event?', pos(10, 0), '$json.claimed'));
  n.push(ifTrue('Booking after the card? -> booking_confirmed', pos(11, 1), '$json.late_booking'));
  n.push(noop('Already sent by another event (stop)', pos(12, 2)));
  n.push(pg('Claim booking_confirmed (w06:booking_confirmed:{booking_id})', pos(12, 1),
`-- Once per booking, and never when this booking's own event sent broker_intro_booked (that card is the confirmation).
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT l.id, l.brand_id, l.broker_id, 'W06', 'system', 'booking_confirmed_claimed', jsonb_build_object('booking_id', $2::text), now(), 'w06:booking_confirmed:' || $2::text
  FROM public.leads l
 WHERE l.id = $1::uuid AND l.opted_out_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.lead_activities f WHERE f.idempotency_key = 'w06:first:' || l.id::text AND f.payload->>'booking_id' = $2::text)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING lead_id;`,
    '={{ [$json.l.id, String($json.l.booking.id)] }}'));
  n.push(code('booking_confirmed item (w06.lateBookingConfirmed, claimed only)', pos(13, 1), prelude('w06.mjs') +
`const j = $('Claimed? -> need W04 slots?').first().json;
if (!$input.all().some((i) => i.json && i.json.lead_id)) return [];
const c = L.lateBookingConfirmed(j.l, j.l.booking);
return c ? [{ json: { l: j.l, booking_id: j.l.booking.id, template: c.template, wa: c.wa, dry: $env.DRY_RUN_SENDS === 'true' } }] : [];`));
  n.push(ifTrue('Send booking_confirmed live? (not DRY_RUN_SENDS)', pos(14, 1), '!!$json.wa && !$json.dry'));
  n.push(waSend('Send WhatsApp (booking_confirmed)', pos(15, 1)));
  n.push(pg('Log booking_confirmed + last_contact_at (only with a wamid)', pos(16, 1),
`WITH c AS (
  INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, content, status, external_id,
                                     lead_id, broker_id, author, workflow, template_name, template_category, metadata)
  SELECT $1::uuid, 'whatsapp', 'outbound', 'system', 'client', $2, 'template:booking_confirmed', 'sent', $3, $4::uuid, $5::uuid, 'system', 'W06',
         'booking_confirmed', 'UTILITY', jsonb_build_object('booking_id', $6::text)
   WHERE $3 <> ''
  ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING
  RETURNING id)
UPDATE public.leads l SET last_contact_at = now(), updated_at = now() WHERE l.id = $4::uuid AND $3 <> '';`,
    "={{ (() => { const p = $('booking_confirmed item (w06.lateBookingConfirmed, claimed only)').first().json; const w = ($json.messages && $json.messages[0] && $json.messages[0].id) || ''; return [p.l.brand_id, p.l.phone, w, p.l.id, p.l.broker_id, String(p.booking_id)]; })() }}"));
  n.push(ifTrue('List card needs slots?', pos(11, 0), '$json.need_slots'));
  n.push(sub('W04 Slots API (list, limit 10)', pos(12, -1), 'W04 Slots API', true, 'Called with { broker_id, limit: 10 }; waits -> { slots: [{start,end}], fallback? }. Same rules as GET /slots.'));
  n.push(code('Plan card (w06.planFirstTouch + toCloudApi)', pos(13, 0), prelude('w06.mjs') +
`const LT = require('lv-automation').leadToken;
const j = $('Claimed? -> need W04 slots?').first().json;
const slots = j.need_slots ? (($input.first().json || {}).slots || []) : [];
const now = Date.now();
const l = { ...j.l, mobile: j.l.phone };
const b = { id: j.l.broker_id, practice_name: j.l.practice_name, fsp_number: j.l.fsp_number, adviser_name: j.l.adviser_name, intro_card_url: j.l.intro_card_url };
const ctx = L.ctxFromEvent({ op: j.ev.op, booking: j.l.booking, booking_ui: j.l.booking_ui, slots }, now);
// The 60-s clock runs from routed_at (CONTRACTS.md W06). hold -> trigger 'hold'; skip / booking -> that event; lead-ad / CTWA -> 'routed'.
let plan = L.planFirstTouch(l, b, ctx);
if (plan && plan.blocked === 'not_enough_slots') {
  // Fewer than 3 free slots in 14 days: the Flow card still discloses and lets the lead pick any day; W22 is told.
  plan = { ...L.planFirstTouch(l, b, { ...ctx, bookingUi: 'flow' }), fallback_from: 'not_enough_slots' };
}
const flow_token = plan && plan.template === 'broker_intro_slots_v2' ? LT.mintFlowToken(l.id, 'book', null, { secret: $env.LEAD_TOKEN_SECRET }) : null;
const wa = plan ? L.toCloudApi(plan, { to: l.phone, flow_token, lang: 'en' }) : null;
return [{ json: { ...j, plan, wa, flow_token: flow_token ? 'minted' : null, dry: $env.DRY_RUN_SENDS === 'true', planned_at: now } }];`));
  n.push(ifTrue('Send live? (not DRY_RUN_SENDS)', pos(14, 0), '!!$json.wa && !$json.dry'));
  n.push(waSend('Send WhatsApp (intro card)', pos(15, 0)));
  n.push(code('Evidence rows (w06.communicationRow + sentUpdate)', pos(16, 0), prelude('w06.mjs') +
`const p = $('Plan card (w06.planFirstTouch + toCloudApi)').first().json;
const wamid = L.wamidOf($input.first().json);
const sentAt = Date.now();
const b = { id: p.l.broker_id };
const comm = L.communicationRow(p.plan, { ...p.l }, b, wamid, sentAt);
const upd = wamid ? L.sentUpdate(p.l, p.plan, wamid, sentAt) : null;
const sms = wamid ? null : { to: p.l.phone, text: L.smsText(p.plan.template, p.plan.variables) };
return [{ json: { ...p, wamid, comm, upd, sms, slow: upd ? !upd.within_60s : false, error: wamid ? null : JSON.stringify($input.first().json.error || $input.first().json).slice(0, 500) } }];`));
  n.push(pg('Log card + stamp lead + timeline (one statement; last_contact_at only with a wamid)', pos(17, 0),
`WITH c AS (
  INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, content, status, external_id,
                                     lead_id, broker_id, author, workflow, template_name, template_category, latency_ms, failed_reason, metadata)
  SELECT $1::uuid, 'whatsapp', 'outbound', 'system', 'client', $2, $3, CASE WHEN $4 <> '' THEN 'sent' ELSE 'failed' END, NULLIF($4, ''),
         $5::uuid, $6::uuid, 'system', 'W06', $7, 'UTILITY', $8::int, NULLIF($9, ''), $10::jsonb
  ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING
  RETURNING id),
u AS (
  UPDATE public.leads l
     SET first_message_at = COALESCE(l.first_message_at, now()), disclosure_msg_id = $4,
         last_contact_at = now(), stage = CASE WHEN l.stage IS NULL OR l.stage = 'new' THEN 'disclosed' ELSE l.stage END, updated_at = now()
   WHERE l.id = $5::uuid AND $4 <> ''
  RETURNING l.id)
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
VALUES ($5::uuid, $1::uuid, $6::uuid, 'W06', 'system', CASE WHEN $4 <> '' THEN 'first_touch_sent' ELSE 'first_touch_failed' END,
        jsonb_build_object('template', $7::text, 'wamid', NULLIF($4, ''), 'latency_ms', $8::int, 'trigger', $11::text), now(), 'w06:sent:' || $5::text)
ON CONFLICT (idempotency_key) DO NOTHING;`,
    "={{ [$json.l.brand_id, $json.l.phone, $json.comm.content, $json.wamid || '', $json.l.id, $json.l.broker_id, $json.plan.template, $json.comm.latency_ms, $json.error || '', JSON.stringify($json.comm.metadata), $json.plan.trigger] }}"));
  n.push(ifTrue('WhatsApp rejected? -> SMS now', pos(18, 0), '!!$json.sms'));
  n.push(smsSend('Twilio SMS (same disclosure)', pos(19, -1)));
  n.push(pg('Log SMS disclosure', pos(20, -1),
`INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, content, status, external_id, lead_id, broker_id, author, workflow, metadata)
VALUES ($1::uuid, 'sms', 'outbound', 'system', 'client', $2, $3, CASE WHEN $4 <> '' THEN 'sent' ELSE 'failed' END, NULLIF($4, ''), $5::uuid, $6::uuid, 'system', 'W06', jsonb_build_object('is_disclosure', true, 'fallback_for', $7::text))
ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING;`,
    "={{ (() => { const p = $('Evidence rows (w06.communicationRow + sentUpdate)').first().json; return [p.l.brand_id, p.sms.to, p.sms.text, ($json.sid || ''), p.l.id, p.l.broker_id, p.wamid || 'rejected']; })() }}"));
  n.push(ifTrue('Slower than 60 s or slots short? -> W22', pos(19, 1), "$json.slow || $json.plan.fallback_from === 'not_enough_slots'"));
  n.push(code('W22 signal', pos(20, 1), "return $input.all().map((i) => ({ json: { signal_key: i.json.slow ? 'first_touch_slow' : 'w06_no_slots', scope: 'lead:' + i.json.l.id, severity: i.json.slow ? 'red' : 'amber', source: 'W06', what: i.json.slow ? 'First WhatsApp later than 60 s' : 'Fewer than 3 free slots: Flow card sent instead of the 3-slot card', impact: 'HBR speed SLO', first_action: 'Check the W06 execution and the broker calendar' } }));"));
  n.push(sub('W22 Alerts (W06)', pos(21, 1), 'W22 Alerts'));

  // status branch
  n.push(pg('Load disclosure message by wamid', pos(2, 3),
`SELECT c.id AS comm_id, c.lead_id, c.brand_id, c.broker_id, c.template_name, c.recipient_contact, c.metadata
  FROM public.communications c
 WHERE c.channel = 'whatsapp' AND c.external_id = $1 AND c.workflow = 'W06'
 LIMIT 1;`,
    '={{ [$json.wamid] }}'));
  n.push(code('Status effect (w06.statusEffect)', pos(3, 3), prelude('w06.mjs') +
`const ev = $('Called by W01 / W05 / W07 (op routed | skip | booking | status)').first().json;
const m = $input.first().json;
if (!m || !m.comm_id) return [{ json: { skip: true } }];
const msg = { wamid: ev.wamid, template: m.template_name, variables: (m.metadata || {}).variables || [], is_disclosure: !!(m.metadata || {}).is_disclosure };
const e = L.statusEffect(msg, { status: ev.status, at: ev.at || new Date().toISOString() });
return [{ json: { skip: false, ev, m, e, sms: e.sms ? { to: m.recipient_contact, text: e.sms.text } : null, l: { id: m.lead_id, brand_id: m.brand_id, broker_id: m.broker_id, phone: m.recipient_contact }, wamid: ev.wamid } }];`));
  n.push(pg('Stamp disclosure evidence (first delivery wins)', pos(4, 3),
`WITH c AS (
  UPDATE public.communications SET status = $3, delivered_at = CASE WHEN $3 IN ('delivered','read') THEN COALESCE(delivered_at, $4::timestamptz) ELSE delivered_at END,
         failed_reason = CASE WHEN $3 = 'failed' THEN $5 ELSE failed_reason END, updated_at = now()
   WHERE id = $1::uuid RETURNING id)
UPDATE public.leads l
   SET wa_delivered_at = COALESCE(l.wa_delivered_at, $4::timestamptz), disclosure_delivered_at = COALESCE(l.disclosure_delivered_at, $4::timestamptz),
       disclosure_msg_id = COALESCE(l.disclosure_msg_id, $6), updated_at = now()
 WHERE l.id = $2::uuid AND $3 IN ('delivered','read')
RETURNING l.id;`,
    "={{ $json.skip ? [null, null, 'skip', null, '', ''] : [$json.m.comm_id, $json.m.lead_id, $json.ev.status, $json.ev.at || new Date().toISOString(), JSON.stringify($json.ev.errors || '').slice(0, 300), $json.wamid] }}"));
  n.push(ifTrue('Failed disclosure? -> SMS once', pos(5, 3), "!$('Status effect (w06.statusEffect)').first().json.skip && !!$('Status effect (w06.statusEffect)').first().json.sms"));
  n.push(pg('Claim SMS fallback (w06:sms:{wamid})', pos(6, 3),
`INSERT INTO public.lead_activities (lead_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
VALUES ($1::uuid, 'W06', 'system', 'disclosure_sms_fallback', jsonb_build_object('wamid', $2::text), now(), 'w06:sms:' || $2)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;`,
    "={{ [$('Status effect (w06.statusEffect)').first().json.m.lead_id, $('Status effect (w06.statusEffect)').first().json.wamid] }}"));
  n.push(code('SMS item (claimed only)', pos(7, 3), "const s = $('Status effect (w06.statusEffect)').first().json; return $input.all().some((i) => i.json && i.json.id) ? [{ json: { ...s } }] : [];"));
  n.push(ifTrue('Live SMS? (not DRY_RUN_SENDS)', pos(8, 3), "$env.DRY_RUN_SENDS !== 'true'"));
  n.push(smsSend('Twilio SMS (status fallback)', pos(9, 3)));
  n.push(pg('Log SMS disclosure (status fallback)', pos(10, 3),
`INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, content, status, external_id, lead_id, broker_id, author, workflow, metadata)
VALUES ($1::uuid, 'sms', 'outbound', 'system', 'client', $2, $3, CASE WHEN $4 <> '' THEN 'sent' ELSE 'failed' END, NULLIF($4, ''), $5::uuid, $6::uuid, 'system', 'W06', jsonb_build_object('is_disclosure', true, 'fallback_for', $7::text))
ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING;`,
    "={{ (() => { const p = $('SMS item (claimed only)').first().json; return [p.l.brand_id, p.sms.to, p.sms.text, ($json.sid || ''), p.l.id, p.l.broker_id, p.wamid]; })() }}"));
  n.push(code('Unknown W06 call (logged, never guessed)', pos(2, 5), "return [{ json: { outcome: 'subcall_rejected', reason: 'W06 needs op routed|skip|booking|hold|status and lead_id (or wamid)', keys: Object.keys($input.first().json || {}) } }];"));

  chain(c, 'Called by W01 / W05 / W07 (op routed | skip | booking | status)', 'Op?');
  link(c, 'Op?', 'Load lead, broker, brand, live booking', 0);
  link(c, 'Op?', 'Load disclosure message by wamid', 1);
  link(c, 'Op?', 'Unknown W06 call (logged, never guessed)', 2);
  chain(c, 'Load lead, broker, brand, live booking', 'Hold for the in-page booking? (w06.holdSeconds)', 'Blocked? (unrouted, out-of-band, duplicate, suppressed, opted out)');
  link(c, 'Blocked? (unrouted, out-of-band, duplicate, suppressed, opted out)', 'Log not sent (reason only)', 0);
  link(c, 'Blocked? (unrouted, out-of-band, duplicate, suppressed, opted out)', 'Page lead: hold 45 s?', 1);
  link(c, 'Page lead: hold 45 s?', 'Wait 45 s (booking or skip may claim first)', 0);
  link(c, 'Page lead: hold 45 s?', 'Claim the one first touch (w06:first:{lead_id})', 1);
  chain(c, 'Wait 45 s (booking or skip may claim first)', 'Event after hold', 'Claim the one first touch (w06:first:{lead_id})', 'Claimed? -> need W04 slots?', 'Claimed by this event?');
  link(c, 'Claimed by this event?', 'List card needs slots?', 0);
  link(c, 'Claimed by this event?', 'Booking after the card? -> booking_confirmed', 1);
  link(c, 'Booking after the card? -> booking_confirmed', 'Claim booking_confirmed (w06:booking_confirmed:{booking_id})', 0);
  link(c, 'Booking after the card? -> booking_confirmed', 'Already sent by another event (stop)', 1);
  chain(c, 'Claim booking_confirmed (w06:booking_confirmed:{booking_id})', 'booking_confirmed item (w06.lateBookingConfirmed, claimed only)', 'Send booking_confirmed live? (not DRY_RUN_SENDS)');
  link(c, 'Send booking_confirmed live? (not DRY_RUN_SENDS)', 'Send WhatsApp (booking_confirmed)', 0);
  chain(c, 'Send WhatsApp (booking_confirmed)', 'Log booking_confirmed + last_contact_at (only with a wamid)');
  link(c, 'List card needs slots?', 'W04 Slots API (list, limit 10)', 0);
  link(c, 'List card needs slots?', 'Plan card (w06.planFirstTouch + toCloudApi)', 1);
  chain(c, 'W04 Slots API (list, limit 10)', 'Plan card (w06.planFirstTouch + toCloudApi)', 'Send live? (not DRY_RUN_SENDS)');
  link(c, 'Send live? (not DRY_RUN_SENDS)', 'Send WhatsApp (intro card)', 0);
  chain(c, 'Send WhatsApp (intro card)', 'Evidence rows (w06.communicationRow + sentUpdate)', 'Log card + stamp lead + timeline (one statement; last_contact_at only with a wamid)');
  link(c, 'Evidence rows (w06.communicationRow + sentUpdate)', 'WhatsApp rejected? -> SMS now');
  link(c, 'Evidence rows (w06.communicationRow + sentUpdate)', 'Slower than 60 s or slots short? -> W22');
  link(c, 'WhatsApp rejected? -> SMS now', 'Twilio SMS (same disclosure)', 0);
  chain(c, 'Twilio SMS (same disclosure)', 'Log SMS disclosure');
  link(c, 'Slower than 60 s or slots short? -> W22', 'W22 signal', 0);
  chain(c, 'W22 signal', 'W22 Alerts (W06)');
  chain(c, 'Load disclosure message by wamid', 'Status effect (w06.statusEffect)', 'Stamp disclosure evidence (first delivery wins)', 'Failed disclosure? -> SMS once');
  link(c, 'Failed disclosure? -> SMS once', 'Claim SMS fallback (w06:sms:{wamid})', 0);
  chain(c, 'Claim SMS fallback (w06:sms:{wamid})', 'SMS item (claimed only)', 'Live SMS? (not DRY_RUN_SENDS)');
  link(c, 'Live SMS? (not DRY_RUN_SENDS)', 'Twilio SMS (status fallback)', 0);
  chain(c, 'Twilio SMS (status fallback)', 'Log SMS disclosure (status fallback)');
  return wf('smc-w06', 'W06 First touch (< 60 s) (DRAFT pending GATE-TEST-W06)', n, c, ['SortMyCover', 'core-path', 'draft']);
}

// =========================================================================================== W15
function buildW15() {
  seq = 0;
  const n = [];
  const c = {};
  n.push(sticky(
    'W15 Opt-out ("STOP" anywhere) - DRAFT pending GATE-TEST-W15 (automation-engineer). Logic: automation/lib/w15.mjs (tested by automation/tests/W15.test.mjs, which also checks this file).\n' +
    'Entries: Execute Workflow from W07 (WhatsApp STOP in any state, or an opt-out intent), the console / W34 ({ op: opt_out, lead_id | mobile, channel }) and POST /sms-inbound (Twilio, signature checked) for STOP replies to the SMS fallback.\n' +
    'Detection: conversation/guardrail.mjs STOP_RX (same net W07 routes on) + "stopall"; never the booking Cancel button. One statement: suppression row (smc_hash_contact = digits-only SHA-256, source stop, brand_id NULL = Lead-Velocity-wide) is the idempotency claim; leads.opted_out_at + stage opted_out; live bookings cancelled (W15_STOP_BOOKING_MODE=cancel, NH-28 b). Then: W09 pause (opt_out) + cancel_all per booking (CONTRACTS.md), Graph DELETE of the Outlook event (token from W04 graph_token), broker told by WhatsApp (session in window / broker_booking_changed template / held) and email from howzit@, first name only. Exactly one confirmation (lines.mjs STOP_ACK; STOP_ACK_CANCELLED when a live booking was cancelled, R6-04; STOP_ACK_BOOKED in keep mode) on the channel the STOP came in on, then nothing ever again. A second STOP is a no-op.\n' +
    'Env: META_GRAPH_VERSION, PHONE_NUMBER_ID, META_SYSTEM_USER_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_SMS_FROM, TWILIO_AUTH_TOKEN, W15_STOP_BOOKING_MODE, DRY_RUN_SENDS.', 380));
  n.push(node('Called by W07 / console / W34 (STOP or opt-out)', 'executeWorkflowTrigger', 1.1, pos(0, 0), { inputSource: 'passthrough' }));
  n.push(node('POST /sms-inbound (Twilio)', 'webhook', 2, pos(0, 2), { httpMethod: 'POST', path: 'sms-inbound', responseMode: 'responseNode', options: { rawBody: true } }, { webhookId: 'w15-sms-inbound' }));
  n.push(code('Verify Twilio signature', pos(1, 2),
`const V = require('lv-automation').verifyWebhooks;
const it = $input.first().json; const h = it.headers || {};
const params = it.body || {};
const base = String($env.WEBHOOK_URL || '').replace(/\\/$/, '');
const ok = !!V.verifyTwilioSignature({ url: base + '/webhook/sms-inbound', params, signatureHeader: h['x-twilio-signature'], authToken: $env.TWILIO_AUTH_TOKEN }).ok;
return [{ json: { ok, item: { source: 'twilio_sms', From: params.From, Body: params.Body } } }];`));
  n.push(node('Respond 200 (empty TwiML)', 'respondToWebhook', 1.1, pos(2, 2), { respondWith: 'text', responseBody: '<Response></Response>', options: { responseCode: '={{ $json.ok ? 200 : 403 }}', responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/xml' }] } } }));
  n.push(ifTrue('Signed?', pos(3, 2), '$json.ok'));
  n.push(code('SMS item', pos(4, 2), 'return [{ json: $input.first().json.item }];'));
  n.push(code('Entry (w15.entryFrom + isStop)', pos(1, 0), prelude('w15.mjs') +
`return $input.all().map((i) => { const e = L.entryFrom(i.json); return { json: { ...e, stop: e.force || L.isStop(e.text), lead_id: e.lead_id || (i.json.lead && i.json.lead.id) || null, now: Date.now() } }; });`));
  n.push(ifTrue('STOP? (else nothing: W07 owns every other message)', pos(2, 0), '$json.stop && !!($json.mobile || $json.lead_id)'));
  n.push(pg('Load leads, live bookings, brokers, suppression for this number', pos(3, 0),
`WITH h AS (SELECT public.smc_hash_contact(COALESCE($1, (SELECT x.phone FROM public.leads x WHERE x.id = $2::uuid))) AS mh,
                  COALESCE($1, (SELECT y.phone FROM public.leads y WHERE y.id = $2::uuid)) AS mobile)
SELECT h.mh AS mobile_hash, h.mobile,
       EXISTS (SELECT 1 FROM public.suppression s WHERE s.mobile_hash = h.mh AND s.source = 'stop') AS already_suppressed,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'first_name', l.first_name, 'phone', l.phone, 'broker_id', l.broker_id,
                  'brand_id', l.brand_id, 'opted_out_at', l.opted_out_at, 'language', l.language))
                   FROM public.leads l WHERE l.brand_id IS NOT NULL AND (l.dedupe_hash = h.mh OR l.id = $2::uuid)), '[]'::jsonb) AS leads,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'lead_id', a.client_id, 'broker_id', a.broker_id, 'status', a.status,
                  'graph_event_id', a.graph_event_id, 'start', a.appointment_date, 'method', a.method))
                   FROM public.appointments a JOIN public.leads la ON la.id = a.client_id
                  WHERE a.brand_id IS NOT NULL AND a.status IN ('booked','confirmed') AND (la.dedupe_hash = h.mh OR la.id = $2::uuid)), '[]'::jsonb) AS bookings,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'whatsapp_number', b.whatsapp_number, 'email', b.email, 'contact_person', b.contact_person,
                  'calendar_email', b.calendar_email,
                  'last_inbound_at', (SELECT max(c.created_at) FROM public.communications c WHERE c.broker_id = b.id AND c.lead_id IS NULL AND c.direction = 'inbound' AND c.sender_type = 'broker')))
                   FROM public.brokers b
                  WHERE b.id IN (SELECT lb.broker_id FROM public.leads lb WHERE lb.dedupe_hash = h.mh OR lb.id = $2::uuid)), '[]'::jsonb) AS brokers
  FROM h;`,
    '={{ [$json.mobile || null, $json.lead_id || null] }}'));
  n.push(code('Plan opt-out (w15.planOptOut)', pos(4, 0), prelude('w15.mjs') +
`const e = $('STOP? (else nothing: W07 owns every other message)').first().json;
const ctx = $input.first().json;
const language = (ctx.leads || []).map((l) => l.language).find(Boolean) || e.language || 'en';
const plan = L.planOptOut({ mobile: e.mobile || ctx.mobile, text: e.text, channel: e.channel, force: e.force, now: e.now, language,
  leads: ctx.leads || [], bookings: ctx.bookings || [], brokers: ctx.brokers || [], already_suppressed: ctx.already_suppressed, booking_mode: $env.W15_STOP_BOOKING_MODE });
return [{ json: { e, ctx, plan } }];`));
  n.push(ifTrue('First STOP for this number? (a repeat is a no-op)', pos(5, 0), '$json.plan.handled && !$json.plan.duplicate'));
  n.push(noop('Already opted out: nothing, no second confirmation', pos(6, 1)));
  n.push(pg('Opt out + suppress + release bookings (one statement; the suppression insert is the claim)', pos(6, 0),
`WITH sup AS (
  INSERT INTO public.suppression (mobile_hash, source, brand_id, lead_id, note)
  SELECT public.smc_hash_contact($1), 'stop', NULL, $2::uuid, $3
   WHERE $1 IS NOT NULL AND $1 <> ''
  ON CONFLICT (mobile_hash, source) DO NOTHING
  RETURNING id),
claim AS (SELECT (EXISTS (SELECT 1 FROM sup) OR $1 IS NULL OR $1 = '') AS ok),
upd AS (
  UPDATE public.leads l
     SET opted_out_at = COALESCE(l.opted_out_at, now()), stage = 'opted_out', updated_at = now()
   WHERE l.id IN (SELECT jsonb_array_elements_text($4::jsonb)::uuid) AND (SELECT ok FROM claim)
  RETURNING l.id),
bk AS (
  UPDATE public.appointments a
     SET status = 'cancelled', cancelled_at = now(), reason_notes = 'lead_opted_out', updated_at = now()
   WHERE a.id IN (SELECT jsonb_array_elements_text($5::jsonb)::uuid) AND a.status IN ('booked','confirmed') AND (SELECT ok FROM claim)
  RETURNING a.id),
act AS (
  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  SELECT (x->>'lead_id')::uuid, (x->>'brand_id')::uuid, (x->>'broker_id')::uuid, 'W15', 'lead', 'opted_out', x->'payload', now(), x->>'idempotency_key'
    FROM jsonb_array_elements($6::jsonb) x
   WHERE (SELECT ok FROM claim)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id)
SELECT (SELECT ok FROM claim) AS claimed, (SELECT count(*) FROM upd)::int AS leads_opted_out, (SELECT count(*) FROM bk)::int AS bookings_cancelled, (SELECT count(*) FROM act)::int AS activities;`,
    "={{ [$json.e.mobile || $json.ctx.mobile || '', ($json.plan.suppression && $json.plan.suppression.lead_id) || null, ($json.plan.suppression && $json.plan.suppression.note) || 'W15', JSON.stringify($json.plan.lead_updates.map((u) => u.id)), JSON.stringify($json.plan.booking_cancels.map((b) => b.booking_id)), JSON.stringify($json.plan.activities)] }}"));
  n.push(code('Fan out (W09, Graph delete, broker notices, one confirmation)', pos(7, 0), prelude('w15.mjs') +
`if (!$input.first().json.claimed) return []; // lost a race with a parallel STOP: the winner does everything
const p = $('Plan opt-out (w15.planOptOut)').first().json;
const out = [];
for (const w of p.plan.w09) out.push({ json: { kind: 'w09', ...w } });
const brokers = new Map((p.ctx.brokers || []).map((b) => [String(b.id), b]));
for (const b of p.plan.booking_cancels) if (b.graph_event_id) out.push({ json: { kind: 'graph_delete', broker_id: b.broker_id, op: 'graph_token', graph_event_id: b.graph_event_id, calendar_email: (brokers.get(String(b.broker_id)) || {}).calendar_email || null } });
for (const nt of p.plan.broker_notices) {
  if (nt.channel === 'email') { if (nt.to) out.push({ json: { kind: 'broker_email', to: nt.to, subject: nt.subject, text: nt.text, lead_id: nt.lead_id } }); continue; }
  if (!nt.to || nt.mode === 'held_no_template') { out.push({ json: { kind: 'broker_held', lead_id: nt.lead_id, broker_id: nt.broker_id } }); continue; }
  out.push({ json: { kind: 'broker_wa', lead_id: nt.lead_id, wa: nt.mode === 'session' ? L.waText(nt.to, nt.text) : L.brokerTemplate(nt.to, nt) } });
}
const cf = p.plan.confirmation;
if (cf) out.push({ json: { kind: cf.channel === 'sms' ? 'confirm_sms' : 'confirm_wa', lead_id: cf.lead_id, wa: L.waText(cf.to, cf.text), sms: { to: cf.to, text: cf.text }, text: cf.text, to: cf.to } });
return out;`));
  n.push(switchOn('Fan-out kind?', pos(8, 0), '={{ $json.kind }}', ['w09', 'graph_delete', 'broker_wa', 'broker_email', 'confirm_wa', 'confirm_sms', 'broker_held']));
  n.push(sub('W09 pause / cancel_all', pos(9, -2), 'W09 Reminder sequence', false, "Called with { op: 'pause', lead_id, reason: 'opt_out' } and { op: 'cancel_all', booking_id } (CONTRACTS.md). Idempotent."));
  n.push(sub('W04 graph_token', pos(9, -1), 'W04 Slots API', true, "Called with { op: 'graph_token', broker_id }; waits -> { access_token } (W04 is the only refresher)."));
  n.push(node('Graph DELETE event', 'httpRequest', 4.2, pos(10, -1), {
    method: 'DELETE', url: "=https://graph.microsoft.com/v1.0/users/{{ encodeURIComponent($('Fan-out kind?').item.json.calendar_email) }}/events/{{ $('Fan-out kind?').item.json.graph_event_id }}",
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $json.access_token }}' }] }, options: { timeout: 10000, response: { response: { neverError: true } } },
  }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 }));
  n.push(ifTrue('Live send? (broker WhatsApp)', pos(9, 0), "$env.DRY_RUN_SENDS !== 'true'"));
  n.push(waSend('Send WhatsApp (broker notice)', pos(10, 0)));
  n.push(ifTrue('Live send? (broker email)', pos(9, 1), "$env.DRY_RUN_SENDS !== 'true'"));
  n.push(node('Email broker from howzit@ (Graph sendMail)', 'httpRequest', 4.2, pos(10, 1), {
    method: 'POST', url: 'https://graph.microsoft.com/v1.0/me/sendMail', authentication: 'predefinedCredentialType', nodeCredentialType: 'microsoftOutlookOAuth2Api',
    sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ message: { subject: $json.subject, body: { contentType: 'Text', content: $json.text }, toRecipients: [{ emailAddress: { address: $json.to } }] }, saveToSentItems: true }) }}",
    options: { timeout: 10000, response: { response: { neverError: true } } },
  }, { credentials: HOWZIT, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 }));
  n.push(ifTrue('Live send? (confirmation)', pos(9, 2), "$env.DRY_RUN_SENDS !== 'true'"));
  n.push(waSend('Send WhatsApp (the one confirmation)', pos(10, 2)));
  n.push(pg('Log confirmation + touch leads.last_contact_at (lead outbound)', pos(11, 2),
`-- I-38d / CONTRACTS.md: a lead-facing send Meta accepted (wamid) touches last_contact_at. Dry runs never reach here.
WITH c AS (
  INSERT INTO public.communications (brand_id, channel, direction, sender_type, recipient_type, recipient_contact, content, status, external_id, lead_id, author, workflow, metadata)
  SELECT l.brand_id, 'whatsapp', 'outbound', 'system', 'client', $2, $3, 'sent', $4, l.id, 'system', 'W15', jsonb_build_object('kind', 'opt_out_confirmation')
    FROM public.leads l WHERE l.id = $1::uuid AND $4 <> ''
  ON CONFLICT (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL DO NOTHING
  RETURNING id)
UPDATE public.leads SET last_contact_at = now() WHERE id = $1::uuid AND $4 <> '' RETURNING id;`,
    "={{ (() => { const f = $('Fan-out kind?').item.json; return [f.lead_id, f.to, f.text, ($json.messages && $json.messages[0] && $json.messages[0].id) || '']; })() }}"));
  n.push(ifTrue('Live send? (SMS confirmation)', pos(9, 3), "$env.DRY_RUN_SENDS !== 'true'"));
  n.push(smsSend('Twilio SMS (the one confirmation)', pos(10, 3)));
  n.push(pg('Log broker notice held (no template yet; email carries it)', pos(9, 4),
`INSERT INTO public.lead_activities (lead_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
VALUES ($1::uuid, $2::uuid, 'W15', 'system', 'broker_notice_held', jsonb_build_object('reason', 'outside the broker window and no booking: broker_lead_opted_out template pending (needs_human)'), now(), 'w15:held:' || $1::text)
ON CONFLICT (idempotency_key) DO NOTHING;`,
    '={{ [$json.lead_id, $json.broker_id] }}'));

  chain(c, 'Called by W07 / console / W34 (STOP or opt-out)', 'Entry (w15.entryFrom + isStop)', 'STOP? (else nothing: W07 owns every other message)');
  chain(c, 'POST /sms-inbound (Twilio)', 'Verify Twilio signature', 'Respond 200 (empty TwiML)', 'Signed?');
  link(c, 'Signed?', 'SMS item', 0);
  link(c, 'SMS item', 'Entry (w15.entryFrom + isStop)');
  link(c, 'STOP? (else nothing: W07 owns every other message)', 'Load leads, live bookings, brokers, suppression for this number', 0);
  chain(c, 'Load leads, live bookings, brokers, suppression for this number', 'Plan opt-out (w15.planOptOut)', 'First STOP for this number? (a repeat is a no-op)');
  link(c, 'First STOP for this number? (a repeat is a no-op)', 'Opt out + suppress + release bookings (one statement; the suppression insert is the claim)', 0);
  link(c, 'First STOP for this number? (a repeat is a no-op)', 'Already opted out: nothing, no second confirmation', 1);
  chain(c, 'Opt out + suppress + release bookings (one statement; the suppression insert is the claim)', 'Fan out (W09, Graph delete, broker notices, one confirmation)', 'Fan-out kind?');
  link(c, 'Fan-out kind?', 'W09 pause / cancel_all', 0);
  link(c, 'Fan-out kind?', 'W04 graph_token', 1);
  link(c, 'Fan-out kind?', 'Live send? (broker WhatsApp)', 2);
  link(c, 'Fan-out kind?', 'Live send? (broker email)', 3);
  link(c, 'Fan-out kind?', 'Live send? (confirmation)', 4);
  link(c, 'Fan-out kind?', 'Live send? (SMS confirmation)', 5);
  link(c, 'Fan-out kind?', 'Log broker notice held (no template yet; email carries it)', 6);
  chain(c, 'W04 graph_token', 'Graph DELETE event');
  link(c, 'Live send? (broker WhatsApp)', 'Send WhatsApp (broker notice)', 0);
  link(c, 'Live send? (broker email)', 'Email broker from howzit@ (Graph sendMail)', 0);
  link(c, 'Live send? (confirmation)', 'Send WhatsApp (the one confirmation)', 0);
  chain(c, 'Send WhatsApp (the one confirmation)', 'Log confirmation + touch leads.last_contact_at (lead outbound)');
  link(c, 'Live send? (SMS confirmation)', 'Twilio SMS (the one confirmation)', 0);
  return wf('smc-w15', 'W15 Opt-out (DRAFT pending GATE-TEST-W15)', n, c, ['SortMyCover', 'core-path', 'draft', 'POPIA']);
}

const out = { 'W01.json': buildW01(), 'W06.json': buildW06(), 'W15.json': buildW15() };
for (const [f, w] of Object.entries(out)) {
  writeFileSync(join(HERE, f), JSON.stringify(w, null, 2) + '\n');
  console.log(`${f}: ${w.nodes.length} nodes`);
}
