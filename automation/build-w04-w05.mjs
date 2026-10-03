#!/usr/bin/env node
// Generates automation/W04.json (Slots API) and automation/W05.json (Book) as DRAFTS pending GATE-TEST-W04/W05.
// Code nodes load the tested pure logic with require('lv-automation').w04 / .w05 (I-46c: n8n's runner allow-lists the
// exact name `lv-automation` = automation/index.cjs; NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation); SA public holidays
// come from require('lv-automation').holidays (data/za-public-holidays.json). Stable top-level ids smc-w04 / smc-w05
// (I-44b); Execute Workflow nodes and settings.errorWorkflow reference other workflows by id, name kept as cachedResultName.
// Credentials by name only (id ''), secrets via $env, workflows inactive. Run: node automation/build-w04-w05.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPH_SCOPE } from './lib/w04.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PG = { postgres: { id: '', name: 'LV Supabase - n8n_app (least privilege)' } };
const MS_SECRET = { httpCustomAuth: { id: '', name: 'Microsoft Graph broker-connect client secret (W20)' } };
const HOWZIT_MAIL = { microsoftOutlookOAuth2Api: { id: '', name: 'Microsoft 365 howzit@ (Graph, Mail.Read + Mail.Send)' } };
const HOWZIT_CAL = { microsoftOutlookOAuth2Api: { id: '', name: 'Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite)' } };
const SETTINGS = { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: false, saveDataSuccessExecution: 'none', errorWorkflow: 'smc-w22' };
const PRE = (lib) => `const L = require('lv-automation').${lib.replace(/\.mjs$/, '')};\n`;
const HOL = `const HOL = new Set(require('lv-automation').holidays.holidays.map((h) => h.date));\n`;

let seq = 0; let X = 0;
const pos = () => [((X++) % 8) * 240, Math.floor((X - 1) / 8) * 200];
const node = (name, type, tv, parameters, extra = {}) => ({ id: `n${String(++seq).padStart(2, '0')}`, name, type: `n8n-nodes-base.${type}`, typeVersion: tv, position: pos(), parameters, ...extra });
const code = (name, lib, body) => node(name, 'code', 2, { mode: 'runOnceForAllItems', jsCode: PRE(lib) + body });
const pg = (name, query, repl, extra = {}) => node(name, 'postgres', 2.5, { operation: 'executeQuery', query, options: repl ? { queryReplacement: repl } : {} }, { credentials: PG, alwaysOutputData: true, ...extra });
// Callee name -> stable workflow id (I-44b). "W04 Slots API" -> smc-w04; "CAPI Send" (no W number) -> smc-capi-send.
const workflowIdOf = (target) => { const m = /^W(\d\d)\b/.exec(target); return m ? `smc-w${m[1]}` : `smc-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; };
const sub = (name, target, wait = false) => node(name, 'executeWorkflow', 1.1, { source: 'database', workflowId: { __rl: true, mode: 'id', value: workflowIdOf(target), cachedResultName: target }, options: { waitForSubWorkflow: wait } });
const ifTrue = (name, expr) => node(name, 'if', 2, { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: `={{ String(${expr}) }}`, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} });
const sw = (name, expr, keys) => node(name, 'switch', 3, { rules: { values: keys.map((k) => ({ conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ leftValue: expr, rightValue: k, operator: { type: 'string', operation: 'equals' } }] }, renameOutput: true, outputKey: k })) }, options: { fallbackOutput: 'none' } });
const respond = (name) => node(name, 'respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.body) }}', options: { responseCode: '={{ $json.status }}', responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } } });
const http = (name, method, urlExpr, opts = {}) => node(name, 'httpRequest', 4.2, { method, url: urlExpr, ...opts.params, options: { timeout: opts.timeout || 8000, response: { response: { fullResponse: true, neverError: true } } } }, { ...(opts.cred ? { credentials: opts.cred } : {}), retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 });
const link = (c, from, to, out = 0) => { c[from] ??= { main: [] }; while (c[from].main.length <= out) c[from].main.push([]); c[from].main[out].push({ node: to, type: 'main', index: 0 }); };
const chain = (c, ...names) => { for (let i = 0; i + 1 < names.length; i++) link(c, names[i], names[i + 1]); };
const wf = (id, name, notes, nodes, connections, tags) => ({ id, name, nodes, connections, active: false, settings: SETTINGS, pinData: {}, tags: tags.map((t) => ({ name: t })), meta: { notes } });

const BROKER_COLS = `b.id, b.brand_id, b.status, b.adviser_name, b.contact_person, b.practice_name, b.firm_name, b.fsp_number, b.adviser_whatsapp, b.whatsapp_number, b.email,
         b.methods_supported, b.meeting_hours, b.slot_minutes, b.buffer_minutes, b.min_notice_hours, b.horizon_days, b.max_meetings_per_day,
         b.max_meetings_per_week, b.bookings_paused, b.add_client_as_attendee, b.calendar_provider, b.calendar_status, b.calendar_mode,
         b.calendar_email, b.ms_tenant_id, b.calendar_status_at, b.calendar_status_detail, b.current_cycle_id`;
const HOLDS = (brokerExpr) => `COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'start', a.appointment_date, 'end', a.ends_at, 'status', a.status))
                   FROM public.appointments a
                  WHERE a.broker_id::text = ${brokerExpr} AND a.brand_id IS NOT NULL
                    AND a.status IN ('booked','confirmed') AND a.ends_at > now() - interval '1 day'), '[]'::jsonb) AS bookings`;

// =========================================================================================== W04
function buildW04() {
  seq = 0; X = 0; const c = {}; const n = [];
  n.push(node('Sticky: read me', 'stickyNote', 1, { width: 760, height: 360, content: 'W04 Slots API (DRAFT pending GATE-TEST-W04; automation-engineer). GET /slots: X-Lead-Token (lead path, broker from leads.broker_id, never the query) OR Authorization: Bearer <broker JWT> (portal next-free-slot), CONTRACTS.md. Sub-workflow ops list / is_free / graph_token (CONTRACTS "Sub-workflow interfaces"); W07 W04_list -> W28 send_list. Logic automation/lib/w04.mjs (tests automation/tests/W04.test.mjs). Calendar route: calendar_status ok -> Vault refresh token (smc_vault_ms_refresh) -> token exchange -> Graph getSchedule (ASSUMPTION shapes, lib comments); blocked_admin_consent / shared_fallback -> shared calendar = hours minus our appointments (0.3 #4); anything else -> fallback whatsapp. Refresh failure -> lead_activities calendar.refresh_failed (W22 metric) + smc_set_calendar_status. Busy blocks cached 60 s per broker in static data (never tokens); is_free is always fresh. Successful executions are not saved (tokens pass through items).' }));
  n.push(node('GET /slots', 'webhook', 2, { httpMethod: 'GET', path: 'slots', responseMode: 'responseNode', options: {} }, { webhookId: 'w04-slots-get' }));
  n.push(code('Resolve caller (lead token | broker JWT)', 'w04.mjs', `const j = $input.first().json;\nconst h = j.headers || {};\nconst req = L.resolveCaller(h, j.query || {}, $env, Date.now());\nreturn [{ json: { lane: 'http', req, hdr: { 'x-test-token': h['x-test-token'] || '', 'x-test-now': h['x-test-now'] || '' } } }];`));
  n.push(ifTrue('Caller ok?', '$json.req.ok === true'));
  n.push(code('Caller error', 'w04.mjs', `const r = $json.req;\nreturn [{ json: { lane: 'http', status: r.status || 401, body: { error: r.error || 'try_again' } } }];`));
  n.push(pg('Load lead + broker + holds (http)', `-- Lead path: the broker comes from leads.broker_id (I-29). Broker path: brokers.user_id = jwt.sub (I-30a).
WITH ld AS (
  SELECT l.id, l.broker_id, l.brand_id, l.opted_out_at, l.is_synthetic
    FROM public.leads l
   WHERE $1 <> '' AND l.id::text = $1 AND l.brand_id IS NOT NULL
), bk AS (
  SELECT ${BROKER_COLS}
    FROM public.brokers b
   WHERE b.brand_id IS NOT NULL
     AND (b.id = (SELECT ld.broker_id FROM ld) OR ($2 <> '' AND b.user_id::text = $2))
   LIMIT 1
)
SELECT (SELECT to_jsonb(ld) FROM ld) AS lead, (SELECT to_jsonb(bk) FROM bk) AS broker,
       ${HOLDS('(SELECT bk.id::text FROM bk)')};`, '={{ [$json.req.mode === \'lead\' ? $json.req.lead_id : \'\', $json.req.mode === \'broker\' ? $json.req.user_id : \'\'] }}'));
  n.push(code('Merge (http)', 'w04.mjs', `const c = $('Resolve caller (lead token | broker JWT)').first().json;\nconst r = $input.first().json;\nreturn [{ json: { lane: 'http', req: c.req, hdr: c.hdr, lead: r.lead || null, broker: r.broker || null, bookings: r.bookings || [] } }];`));
  n.push(node('Called by W05/W06/W07/W10/W28', 'executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }));
  n.push(code('Normalise sub-call (w04.subcallInput)', 'w04.mjs', `return $input.all().map((it) => ({ json: { lane: 'sub', req: L.subcallInput(it.json || {}), raw_delegate: (it.json && it.json.delegate) || null } }));`));
  n.push(sw('Sub op?', "={{ ['list','is_free','graph_token'].includes($json.req.op) ? 'work' : $json.req.op }}", ['work', 'send_list', 'reject']));
  n.push(pg('Log subcall_rejected', `INSERT INTO public.lead_activities (lead_id, workflow, actor_type, activity_type, payload, occurred_at)
VALUES (NULLIF($1, '')::uuid, 'W04', 'system', 'subcall_rejected', jsonb_build_object('reason', $2::text), now())
RETURNING id;`, "={{ [$json.req.lead_id || '', $json.req.reason || 'unknown'] }}"));
  n.push(code('Return (rejected)', 'w04.mjs', `return [{ json: { slots: [], fallback: 'whatsapp', free: false, next_slots: [], error: 'subcall_rejected' } }];`));
  n.push(code('W28 send_list input', 'w04.mjs', `return $input.all().map((it) => ({ json: { op: 'send_list', lead_id: it.json.req.lead_id, reason: it.json.req.reason, delegate: it.json.raw_delegate } }));`));
  n.push(sub('-> W28 send_list (10-slot list)', 'W28 Booking Flow endpoint'));
  n.push(pg('Load broker + holds (sub)', `SELECT (SELECT to_jsonb(k) FROM (SELECT ${BROKER_COLS} FROM public.brokers b WHERE b.id::text = $1 AND b.brand_id IS NOT NULL) k) AS broker,
       ${HOLDS('$1')};`, '={{ [$json.req.broker_id] }}'));
  n.push(code('Merge (sub)', 'w04.mjs', `const c = $('Normalise sub-call (w04.subcallInput)').first().json;\nconst r = $input.first().json;\nreturn [{ json: { lane: 'sub', req: c.req, hdr: {}, lead: null, broker: r.broker || null, bookings: r.bookings || [] } }];`));
  n.push(code('Plan (w04.planRequest)', 'w04.mjs', `const x = $input.first().json;\nconst now = L.clockFor(x.hdr || {}, $env, !!(x.lead && x.lead.is_synthetic));\nconst plan = L.planRequest(x);\nconst b = L.brokerConfig(x.broker || {});\nconst gs = plan.next === 'graph' ? L.getScheduleRequest(b, now, { fresh: !!x.req.fresh }) : null;\nconst tk = plan.next === 'graph' ? L.tokenRefreshForm({ clientId: $env.MS_GRAPH_CLIENT_ID, tenant: b.ms_tenant_id || $env.MS_GRAPH_TENANT }) : null;\nconst stale = !b.calendar_status_at || now - Date.parse(b.calendar_status_at) > 86400000;\nreturn [{ json: { ...x, now, plan, gs, tk, stale, token_only: !!plan.token_only, busy: plan.route === 'shared' ? [] : null } }];`));
  n.push(sw('Next?', '={{ $json.plan.next }}', ['respond', 'graph', 'compute']));
  n.push(code('Busy cache (60 s)', 'w04.mjs', `const x = $input.first().json;\nconst hit = !x.token_only && !x.req.fresh ? L.cacheGet($getWorkflowStaticData('global').w04_busy, L.brokerConfig(x.broker).broker_id, x.now) : null;\nreturn [{ json: { ...x, busy: hit, cached: !!hit } }];`));
  n.push(ifTrue('Cached?', '$json.cached === true'));
  n.push(pg('Vault: Microsoft refresh token', `-- Returns the refresh token only while brokers.calendar_status = 'ok' (migration 13). Never logged: this workflow does not save successful executions.
SELECT public.smc_vault_ms_refresh($1::uuid) AS rt;`, '={{ [$json.plan && $json.broker ? $json.broker.id : null] }}'));
  n.push(http('Microsoft token refresh', 'POST', "={{ $('Plan (w04.planRequest)').first().json.tk.url }}", { cred: MS_SECRET, timeout: 10000, params: { authentication: 'genericCredentialType', genericAuthType: 'httpCustomAuth', sendBody: true, contentType: 'form-urlencoded', bodyParameters: { parameters: [{ name: 'client_id', value: '={{ $env.MS_GRAPH_CLIENT_ID }}' }, { name: 'grant_type', value: 'refresh_token' }, { name: 'refresh_token', value: '={{ $json.rt || "" }}' }, { name: 'scope', value: GRAPH_SCOPE }] } } }));
  n.push(code('Token plan (w04.planToken)', 'w04.mjs', `const x = $('Plan (w04.planRequest)').first().json;\nconst tok = L.planToken($input.first().json, x.now);\nreturn [{ json: { ...x, tok } }];`));
  n.push(ifTrue('Token ok?', '$json.tok.ok === true'));
  n.push(pg('calendar.refresh_failed (+ status)', `WITH s AS (SELECT CASE WHEN $3 <> '' THEN public.smc_set_calendar_status($1::uuid, $3, jsonb_build_object('reason', $2::text)) END AS st)
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at)
SELECT NULL, b.brand_id, b.id, 'W04', 'system', 'calendar.refresh_failed', jsonb_build_object('reason', $2::text, 'transient', $4::boolean), now()
  FROM public.brokers b, s WHERE b.id = $1::uuid
RETURNING id;`, "={{ [$json.broker.id, $json.tok.reason || 'unknown', $json.tok.status_to || '', !!$json.tok.transient] }}"));
  n.push(code('Refresh failed -> fail closed', 'w04.mjs', `const x = $('Token plan (w04.planRequest)'.replace('planRequest', 'planToken')).first().json;\nreturn [{ json: { ...x, busy: null } }];`));
  n.push(pg('Vault: keep rotated refresh token (daily)', `-- ASSUMPTION: Microsoft rotates refresh tokens and the previous one stays valid; store the new one at most once a day.
SELECT CASE WHEN $2 <> '' AND $3::boolean THEN public.smc_vault_store_ms_refresh($1::uuid, $2, NULL, NULL) END AS stored;`, "={{ [$json.broker.id, ($('Microsoft token refresh').first().json.body || {}).refresh_token || '', !!$json.stale] }}"));
  n.push(ifTrue('Token only?', "$('Token plan (w04.planToken)').first().json.token_only === true"));
  n.push(http('Graph getSchedule (ASSUMPTION)', 'POST', "={{ $('Plan (w04.planRequest)').first().json.gs.url }}", { params: { sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: "=Bearer {{ $('Token plan (w04.planToken)').first().json.tok.access_token }}" }, { name: 'Prefer', value: "={{ $('Plan (w04.planRequest)').first().json.gs.headers.Prefer }}" }] }, sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($('Plan (w04.planRequest)').first().json.gs.body) }}" } }));
  n.push(code('Parse getSchedule + cache', 'w04.mjs', `const x = $('Token plan (w04.planToken)').first().json;\nconst busy = L.parseGetSchedule($input.first().json);\nconst sd = $getWorkflowStaticData('global'); sd.w04_busy = sd.w04_busy || {};\nif (busy) L.cachePut(sd.w04_busy, L.brokerConfig(x.broker).broker_id, busy, x.now);\nconst { tok, ...rest } = x;\nreturn [{ json: { ...rest, busy } }];`));
  n.push(code('Compute (w04.respond)', 'w04.mjs', HOL + `const x = $input.first().json;\nlet out;\nif (x.plan.next === 'respond') out = x.plan.result;\nelse if (x.token_only) out = x.tok && x.tok.ok ? { access_token: x.tok.access_token, expires_at: x.tok.expires_at } : { error: 'refresh_failed' };\nelse out = L.respond({ lane: x.lane, req: x.req, broker: x.broker, bookings: x.bookings, busy: x.busy, route: x.plan.route, now: x.now, holidays: HOL });\nreturn [{ json: x.lane === 'http' ? { lane: 'http', status: out.status, body: out.body } : { lane: 'sub', body: out } }];`));
  n.push(ifTrue('HTTP lane?', "$json.lane === 'http'"));
  n.push(respond('Respond (slots JSON)'));
  n.push(code('Return to caller', 'w04.mjs', `return [{ json: $input.first().json.body }];`));
  chain(c, 'GET /slots', 'Resolve caller (lead token | broker JWT)', 'Caller ok?');
  link(c, 'Caller ok?', 'Load lead + broker + holds (http)', 0); link(c, 'Caller ok?', 'Caller error', 1);
  link(c, 'Caller error', 'HTTP lane?');
  chain(c, 'Load lead + broker + holds (http)', 'Merge (http)', 'Plan (w04.planRequest)');
  chain(c, 'Called by W05/W06/W07/W10/W28', 'Normalise sub-call (w04.subcallInput)', 'Sub op?');
  link(c, 'Sub op?', 'Load broker + holds (sub)', 0); link(c, 'Sub op?', 'W28 send_list input', 1); link(c, 'Sub op?', 'Log subcall_rejected', 2);
  chain(c, 'Log subcall_rejected', 'Return (rejected)'); chain(c, 'W28 send_list input', '-> W28 send_list (10-slot list)');
  chain(c, 'Load broker + holds (sub)', 'Merge (sub)', 'Plan (w04.planRequest)', 'Next?');
  link(c, 'Next?', 'Compute (w04.respond)', 0); link(c, 'Next?', 'Busy cache (60 s)', 1); link(c, 'Next?', 'Compute (w04.respond)', 2);
  chain(c, 'Busy cache (60 s)', 'Cached?'); link(c, 'Cached?', 'Compute (w04.respond)', 0); link(c, 'Cached?', 'Vault: Microsoft refresh token', 1);
  chain(c, 'Vault: Microsoft refresh token', 'Microsoft token refresh', 'Token plan (w04.planToken)', 'Token ok?');
  link(c, 'Token ok?', 'Vault: keep rotated refresh token (daily)', 0); link(c, 'Token ok?', 'calendar.refresh_failed (+ status)', 1);
  chain(c, 'calendar.refresh_failed (+ status)', 'Refresh failed -> fail closed', 'Compute (w04.respond)');
  chain(c, 'Vault: keep rotated refresh token (daily)', 'Token only?');
  link(c, 'Token only?', 'Compute (w04.respond)', 0); link(c, 'Token only?', 'Graph getSchedule (ASSUMPTION)', 1);
  chain(c, 'Graph getSchedule (ASSUMPTION)', 'Parse getSchedule + cache', 'Compute (w04.respond)', 'HTTP lane?');
  link(c, 'HTTP lane?', 'Respond (slots JSON)', 0); link(c, 'HTTP lane?', 'Return to caller', 1);
  // the token-only Compute needs tok: Token only? true carries the vault output, so Compute re-reads it
  n.find((x) => x.name === 'Compute (w04.respond)').parameters.jsCode = n.find((x) => x.name === 'Compute (w04.respond)').parameters.jsCode.replace("const x = $input.first().json;", "let x = $input.first().json;\nif (!x.plan) x = $('Token plan (w04.planToken)').first().json;");
  n.find((x) => x.name === 'Refresh failed -> fail closed').parameters.jsCode = PRE('w04.mjs') + `const x = $('Token plan (w04.planToken)').first().json;\nreturn [{ json: { ...x, busy: null } }];`;
  return wf('smc-w04', 'W04 Slots API (DRAFT pending GATE-TEST-W04)', 'automation-engineer. W04 slots; logic automation/lib/w04.mjs; tests automation/tests/W04.test.mjs. Callers bind by id smc-w04 (name kept as cachedResultName only).', n, c, ['booking', 'core', 'draft']);
}

// =========================================================================================== W05
function buildW05() {
  seq = 0; X = 0; const c = {}; const n = [];
  const LOAD = `-- lead + its broker + idempotent replay + the lead's live booking (one round trip)
WITH ld AS (
  SELECT l.id, l.brand_id, l.broker_id, l.cycle_id, l.first_name, l.phone, l.email, l.email_status, l.email_purpose, l.age_band, l.budget_band,
         l.consent_text_version, l.consent_at, l.consent_ads_at, l.origin, l.ad_id, l.ctwa_clid, l.call_number, l.method_pref, l.language,
         l.conv_state, l.opted_out_at, l.is_synthetic
    FROM public.leads l WHERE l.id::text = $1 AND l.brand_id IS NOT NULL
), bk AS (
  SELECT ${BROKER_COLS} FROM public.brokers b WHERE b.brand_id IS NOT NULL AND b.id = (SELECT ld.broker_id FROM ld)
), byuser AS (
  SELECT b.id FROM public.brokers b WHERE $3 <> '' AND b.user_id::text = $3 AND b.brand_id IS NOT NULL LIMIT 1
)
SELECT (SELECT to_jsonb(ld) FROM ld) AS lead, (SELECT to_jsonb(bk) FROM bk) AS broker, (SELECT to_jsonb(byuser) FROM byuser) AS broker_by_user,
       (SELECT to_jsonb(e) FROM (SELECT a.id, a.appointment_date, a.ends_at, a.method, a.status, a.join_url, a.ics_url FROM public.appointments a WHERE a.idempotency_key = $2 LIMIT 1) e) AS existing,
       (SELECT to_jsonb(v) FROM (SELECT a.id, a.appointment_date, a.ends_at, a.method, a.status FROM public.appointments a
                                  WHERE a.client_id::text = $1 AND a.brand_id IS NOT NULL AND a.status IN ('booked','confirmed') AND a.ends_at > now()
                                  ORDER BY a.appointment_date LIMIT 1) v) AS live;`;
  n.push(node('Sticky: read me', 'stickyNote', 1, { width: 760, height: 380, content: 'W05 Book (DRAFT pending GATE-TEST-W05; automation-engineer). POST /book (X-Lead-Token or broker JWT, CONTRACTS.md) and sub-calls: book (W07 slot taps + Flow nfm_reply, W10, W28), update_method (W10), invite_bounced (W17 NDR). Logic automation/lib/w05.mjs (tests automation/tests/W05.test.mjs). Zero double-bookings: W04 is_free (fresh getSchedule + our appointments + buffer) -> INSERT with the overlap+buffer re-check in the same statement, ON CONFLICT DO NOTHING (gist exclusion + unique indexes), re-select = replay or taken (next 3). Outlook event via Graph (Teams: isOnlineMeeting, teamsForBusiness; ASSUMPTION shapes) in the broker calendar (W04 graph_token) or the howzit@ shared calendar (0.3 #4). Email only for Teams/Zoom/Meet (0.1); invite from howzit@ with .ics. Then: broker_new_booking + email, W06 booking event (first confirmation is W06\'s), W09 schedule/rebuild, W07 contact confirm (call methods), CAPI Send Schedule (no email). Lead sends touch last_contact_at (I-38d).' }));
  n.push(node('POST /book', 'webhook', 2, { httpMethod: 'POST', path: 'book', responseMode: 'responseNode', options: {} }, { webhookId: 'w05-book-post' }));
  n.push(code('Parse + verify caller (w05.parseHttp)', 'w05.mjs', `const j = $input.first().json;\nconst h = j.headers || {};\nconst p = L.parseHttp(h, j.body || {}, $env, Date.now());\nreturn [{ json: { lane: 'http', ...p, hdr: { 'x-test-token': h['x-test-token'] || '', 'x-test-now': h['x-test-now'] || '' } } }];`));
  n.push(ifTrue('Caller ok?', '$json.ok === true'));
  n.push(node('Called by W07/W10/W17/W28', 'executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }));
  n.push(code('Normalise sub-call (w05.parseSub)', 'w05.mjs', `return $input.all().map((it) => ({ json: { lane: 'sub', ok: true, req: L.parseSub(it.json || {}, $env, Date.now()), hdr: {} } }));`));
  n.push(sw('Sub op?', '={{ $json.req.op }}', ['book', 'update_method', 'invite_bounced', 'to_w10', 'reject']));
  n.push(pg('Log subcall_rejected', `INSERT INTO public.lead_activities (lead_id, workflow, actor_type, activity_type, payload, occurred_at)
VALUES (NULLIF($1, '')::uuid, 'W05', 'system', $3, jsonb_build_object('reason', $2::text), now()) RETURNING id;`, "={{ [$json.req.lead_id || '', $json.req.reason || 'unknown', $json.req.security ? 'flow_security_event' : 'subcall_rejected'] }}"));
  n.push(code('W10 pick payload', 'w05.mjs', `return $input.all().map((it) => ({ json: it.json.req ? (it.json.req.w10 || it.json.w10) : it.json.w10 }));`));
  n.push(sub('-> W10 reschedule pick', 'W10 Reschedule / cancel'));
  n.push(pg('Load lead, broker, replay, live booking', LOAD, "={{ [$json.req.lead_id || '', $json.req.idempotency_key || '', $json.mode === 'broker' ? ($json.user_id || '') : ''] }}"));
  n.push(code('Decide (w05.decide + MX)', 'w05.mjs', `const dns = require('dns').promises;\nconst x = $('Load lead, broker, replay, live booking').first().json;\nconst c = $input.first().json.req ? $input.first().json : ($('Parse + verify caller (w05.parseHttp)').isExecuted ? $('Parse + verify caller (w05.parseHttp)').first().json : $('Normalise sub-call (w05.parseSub)').first().json);\nconst now = L.clockFor(c.hdr || {}, $env, !!(x.lead && x.lead.is_synthetic));\nconst mx = {};\nconst d = L.emailDomain(c.req.email || (x.lead && x.lead.email) || '');\nif (d) { try { const r = await Promise.race([dns.resolveMx(d), new Promise((_, rj) => setTimeout(() => rj(new Error('t')), 300))]); mx[d] = Array.isArray(r) && r.length > 0; } catch (e) { mx[d] = false; } }\nconst ctx = { lane: c.lane, mode: c.mode, req: c.req, lead: x.lead, broker: x.broker, broker_by_user: x.broker_by_user, existing: x.existing, live: x.live, mx, now };\nconst dec = L.decide(ctx);\nreturn [{ json: { ctx, dec, action: dec.action, lane: c.lane, status: dec.status, body: dec.body, wa: dec.wa || null, to: 'lead', lead_id: x.lead ? x.lead.id : null, w10: dec.w10 || null } }];`));
  n.push(sw('Decision?', '={{ $json.action }}', ['respond', 'replay', 'message', 'to_w10', 'stop', 'check']));
  n.push(code('is_free input', 'w05.mjs', `return [{ json: $input.first().json.dec.is_free }];`));
  n.push(sub('W04 is_free (re-check, waits)', 'W04 Slots API', true));
  n.push(code('After re-check (w05.afterCheck)', 'w05.mjs', `const d = $('Decide (w05.decide + MX)').first().json;\nconst r = L.afterCheck(d.ctx, d.dec, $input.first().json);\nreturn [{ json: { ...d, check: r, action: r.action, status: r.status, body: r.body, wa: r.wa || null, row: r.row || null } }];`));
  n.push(ifTrue('Free?', "$json.action === 'insert'"));
  n.push(pg('Insert appointment (re-check overlap + buffer, idempotent)', `-- Zero double-bookings: the overlap+buffer re-check and the insert are ONE statement. appointments_smc_no_overlap (gist),
-- appointments_smc_no_double_booking and appointments_smc_idem_uidx are the last line of defence: ON CONFLICT DO NOTHING
-- turns any of them into "no row", and the re-select below decides replay (same key) or taken (next 3).
INSERT INTO public.appointments (client_id, broker_id, brand_id, cycle_id, appointment_date, ends_at, method, status, calendar_provider, booked_via, booked_at, idempotency_key, previous_booking_id, call_number, invite_email_status, schedule_event_id)
SELECT $1::uuid, $2::uuid, $3::uuid, NULLIF($4, '')::uuid, $5::timestamptz, $6::timestamptz, $7, 'booked', $8, $9, now(), $10, NULLIF($11, '')::uuid, NULLIF($12, ''), NULLIF($13, ''), NULLIF($14, '')
 WHERE NOT EXISTS (
   SELECT 1 FROM public.appointments x
    WHERE x.broker_id = $2::uuid AND x.brand_id IS NOT NULL AND x.status IN ('booked','confirmed')
      AND tstzrange(x.appointment_date - make_interval(mins => $15::int), x.ends_at + make_interval(mins => $15::int), '[)')
          && tstzrange($5::timestamptz, $6::timestamptz, '[)'))
ON CONFLICT DO NOTHING
RETURNING id, client_id, broker_id, cycle_id, appointment_date, ends_at, method, status, booked_at, booked_via, idempotency_key;`, "={{ (() => { const r = $json.row; const b = $json.ctx.broker || {}; return [r.client_id, r.broker_id, r.brand_id, r.cycle_id || '', r.appointment_date, r.ends_at, r.method, r.calendar_provider, r.booked_via, r.idempotency_key, r.previous_booking_id || '', r.call_number || '', r.invite_email_status || '', r.schedule_event_id || '', b.buffer_minutes == null ? 15 : b.buffer_minutes]; })() }}", { onError: 'continueRegularOutput' }));
  n.push(ifTrue('Inserted?', '!!$json.id'));
  n.push(pg('Re-select by idempotency key', `SELECT (SELECT to_jsonb(e) FROM (SELECT a.id, a.appointment_date, a.ends_at, a.method, a.status, a.join_url, a.ics_url FROM public.appointments a WHERE a.idempotency_key = $1 LIMIT 1) e) AS existing;`, "={{ [$('After re-check (w05.afterCheck)').first().json.row.idempotency_key] }}"));
  n.push(code('Lost the race: replay or next 3', 'w05.mjs', `const d = $('After re-check (w05.afterCheck)').first().json;\nconst ex = $input.first().json.existing;\nif (ex) return [{ json: { ...d, action: 'replay', status: 201, body: L.publicBody(ex), wa: null } }];\nconst t = L.taken(d.ctx, d.dec.plan, []);\nreturn [{ json: { ...d, action: 'taken', status: 409, body: t.body, wa: t.wa || null } }];`));
  n.push(ifTrue('Broker calendar (graph)?', "$('Decide (w05.decide + MX)').first().json.dec.plan.route === 'graph'"));
  n.push(code('graph_token input', 'w05.mjs', `return [{ json: { op: 'graph_token', broker_id: $('Decide (w05.decide + MX)').first().json.dec.plan.broker_id } }];`));
  n.push(sub('W04 graph_token (waits)', 'W04 Slots API', true));
  const evBody = "={{ JSON.stringify($('Event body').first().json.event) }}";
  n.push(code('Event body', 'w05.mjs', `const d = $('Decide (w05.decide + MX)').first().json;\nreturn [{ json: { access_token: $input.first().json.access_token || '', event: L.graphEvent(d.ctx, d.dec.plan, { portalUrl: $env.PORTAL_URL }) } }];`));
  n.push(http('Graph create event (broker calendar, ASSUMPTION)', 'POST', '=https://graph.microsoft.com/v1.0/me/events', { params: { sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $json.access_token }}' }, { name: 'Prefer', value: 'outlook.timezone="Africa/Johannesburg"' }] }, sendBody: true, specifyBody: 'json', jsonBody: evBody } }));
  n.push(code('Event body (shared)', 'w05.mjs', `const d = $('Decide (w05.decide + MX)').first().json;\nconst det = (d.ctx.broker && d.ctx.broker.calendar_status_detail) || {};\nreturn [{ json: { url: L.graphEventUrl('shared', { howzit: $env.HOWZIT_MAILBOX || L.INVITE_FROM, sharedCalendarId: det.shared_calendar_id || $env.SMC_SHARED_CALENDAR_ID || '' }), event: L.graphEvent(d.ctx, d.dec.plan, { portalUrl: $env.PORTAL_URL }) } }];`));
  n.push(http('Graph create event (howzit@ shared calendar, ASSUMPTION)', 'POST', '={{ $json.url }}', { cred: HOWZIT_CAL, params: { authentication: 'predefinedCredentialType', nodeCredentialType: 'microsoftOutlookOAuth2Api', sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($json.event) }}" } }));
  n.push(code('After event (w05.finish)', 'w05.mjs', `const d = $('Decide (w05.decide + MX)').first().json;\nconst row = $('Insert appointment (re-check overlap + buffer, idempotent)').first().json;\nconst ev = L.afterEvent($input.first().json);\nconst f = L.finish(d.ctx, d.dec.plan, row, ev, { site: $env.SITE_URL });\nreturn [{ json: { ...d, booking: row, ev, f, lane: d.lane, status: f.response.status, body: f.response.body } }];`));
  n.push(pg('Save event ids + lead (stage, broker, cycle, invite email)', `WITH a AS (
  UPDATE public.appointments
     SET graph_event_id = NULLIF($2, ''), ical_uid = NULLIF($3, ''), join_url = NULLIF($4, ''), ics_url = $5,
         invite_email_status = NULLIF($6, ''), schedule_event_id = NULLIF($7, ''), updated_at = now()
   WHERE id = $1::uuid
  RETURNING client_id)
UPDATE public.leads l
   SET stage = 'booked', stage_entered_at = now(), broker_id = $8::uuid, cycle_id = NULLIF($9, '')::uuid,
       email = CASE WHEN $10 <> '' THEN $10 ELSE l.email END,
       email_status = CASE WHEN $10 <> '' THEN $11 ELSE l.email_status END,
       email_purpose = CASE WHEN $10 <> '' THEN 'meeting_invite' ELSE l.email_purpose END,
       updated_at = now()
  FROM a WHERE l.id = a.client_id
RETURNING l.id;`, "={{ (() => { const f = $json.f; const u = f.appointment_update; const lu = f.lead_update; return [$json.booking.id, u.graph_event_id || '', u.ical_uid || '', u.join_url || '', u.ics_url, u.invite_email_status || '', u.schedule_event_id || '', lu.broker_id, lu.cycle_id || '', lu.email || '', lu.email_status || '']; })() }}"));
  n.push(pg('Timeline: booked', `INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::uuid, NULLIF($4, '')::uuid, 'W05', 'lead', 'booking_created', jsonb_build_object('booking_id', $5::text, 'start', $6::text, 'method', $7::text, 'booked_via', $8::text, 'graph_event', $9::boolean), now(), 'w05:booked:' || $5)
ON CONFLICT (idempotency_key) DO NOTHING RETURNING id;`, "={{ (() => { const d = $('After event (w05.finish)').first().json; const p = d.dec.plan; return [p.lead_id, (d.ctx.lead || {}).brand_id || '', p.broker_id, d.booking.cycle_id || '', d.booking.id, p.start, p.method, p.booked_via, !!d.ev.ok]; })() }}"));
  n.push(code('Answer', 'w05.mjs', `const j = $input.first().json;\nconst src = j.f ? j : ($('After event (w05.finish)').isExecuted ? $('After event (w05.finish)').first().json : j);\nreturn [{ json: { lane: src.lane, status: src.status || 200, body: src.body || {}, wa: src.wa || null, to: 'lead', lead_id: src.lead_id || (src.ctx && src.ctx.lead && src.ctx.lead.id) || null, f: src.f || null } }];`));
  n.push(ifTrue('HTTP lane?', "$json.lane === 'http'"));
  n.push(respond('Respond (book JSON)'));
  n.push(code('Fan out effects', 'w05.mjs', `const j = $input.first().json;\nconst out = [];\nif (j.wa) out.push({ kind: 'wa', to: 'lead', lead_id: j.lead_id, wa: j.wa });\nconst f = j.f; if (!f) return out.map((x) => ({ json: x }));\nif (f.invite) out.push({ kind: 'mail', mail: { message: f.invite.message, saveToSentItems: true } });\nif (f.broker.email) out.push({ kind: 'mail', mail: { message: { subject: f.broker.email.subject, body: { contentType: 'Text', content: f.broker.email.body }, toRecipients: [{ emailAddress: { address: f.broker.email.to } }] }, saveToSentItems: true } });\nif (f.broker.wa) out.push({ kind: 'wa', to: 'broker', lead_id: j.lead_id, wa: f.broker.wa });\nif (f.lead_wa) out.push({ kind: 'wa', to: 'lead', lead_id: j.lead_id, wa: f.lead_wa });\nfor (const k of ['w06', 'w09', 'w07', 'capi', 'ask_email', 'alert']) if (f[k]) out.push({ kind: k, ...f[k] });\nreturn out.map((x) => ({ json: x }));`));
  n.push(sw('Effect?', '={{ $json.kind }}', ['wa', 'mail', 'w06', 'w09', 'w07', 'capi', 'ask_email', 'alert']));
  n.push(ifTrue('Live send?', "!!$json.wa && $env.DRY_RUN_SENDS !== 'true'"));
  n.push(http('Send WhatsApp', 'POST', '=https://graph.facebook.com/{{ $env.META_GRAPH_VERSION }}/{{ $env.PHONE_NUMBER_ID }}/messages', { params: { sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.META_SYSTEM_USER_TOKEN }}' }] }, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.wa) }}' } }));
  n.push(pg('Touch leads.last_contact_at (lead sends)', `-- I-38d: every lead-facing send Meta accepted (wamid) updates last_contact_at; broker sends never.
UPDATE public.leads SET last_contact_at = now() WHERE id = $1::uuid AND $2 = 'lead' AND $3 <> '' RETURNING id;`, "={{ [$('Live send?').item.json.lead_id, $('Live send?').item.json.to, (($json.body || {}).messages || [{}])[0].id || ''] }}"));
  n.push(http('Email from howzit@ (Graph sendMail)', 'POST', '=https://graph.microsoft.com/v1.0/users/{{ encodeURIComponent($env.HOWZIT_MAILBOX) }}/sendMail', { cred: HOWZIT_MAIL, params: { authentication: 'predefinedCredentialType', nodeCredentialType: 'microsoftOutlookOAuth2Api', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.mail) }}' } }));
  n.push(sub('-> W06 First touch (booking event)', 'W06 First touch'));
  n.push(sub('-> W09 Reminder sequence (schedule / rebuild)', 'W09 Reminder sequence'));
  n.push(sub('-> W07 post-booking contact confirm', 'W07 Conversation agent (Thandi)'));
  n.push(sub('-> CAPI Send (Schedule, no email)', 'CAPI Send'));
  n.push(sub('-> W28 ask_email', 'W28 Booking Flow endpoint'));
  n.push(sub('-> W22 Alerts', 'W22 Alerts'));
  // update_method (W10)
  n.push(pg('Load booking for method change', `SELECT (SELECT to_jsonb(k) FROM (SELECT a.id, a.client_id, a.broker_id, a.appointment_date, a.ends_at, a.method, a.status, a.graph_event_id, a.idempotency_key, a.booked_via FROM public.appointments a WHERE a.id::text = $1) k) AS booking,
       (SELECT to_jsonb(q) FROM (SELECT l.id, l.first_name, l.phone, l.email, l.email_status, l.email_purpose, l.age_band, l.budget_band, l.consent_text_version, l.consent_at, l.origin, l.ad_id, l.call_number, l.language, l.brand_id FROM public.leads l JOIN public.appointments a ON a.client_id = l.id WHERE a.id::text = $1) q) AS lead,
       (SELECT to_jsonb(r) FROM (SELECT ${BROKER_COLS} FROM public.brokers b JOIN public.appointments a ON a.broker_id = b.id WHERE a.id::text = $1) r) AS broker;`, '={{ [$json.req.booking_id] }}'));
  n.push(code('Plan method change (w05.planUpdateMethod)', 'w05.mjs', `const x = $input.first().json;\nconst req = $('Normalise sub-call (w05.parseSub)').first().json.req;\nconst p = L.planUpdateMethod({ req, booking: x.booking, lead: x.lead, broker: x.broker, now: Date.now() });\nconst invite = p.action === 'patch' ? L.inviteMail({ lead: x.lead, broker: x.broker }, p.plan, x.booking, {}) : null;\nreturn [{ json: { ...p, booking: x.booking, ask: p.ask_email || null, mail: invite ? { message: invite.message, saveToSentItems: true } : null, kind: p.action } }];`));
  n.push(sw('Method plan?', '={{ $json.action }}', ['patch', 'ask_email', 'reject']));
  n.push(code('graph_token input (method)', 'w05.mjs', `return [{ json: { op: 'graph_token', broker_id: $json.booking.broker_id } }];`));
  n.push(sub('W04 graph_token (method, waits)', 'W04 Slots API', true));
  n.push(http('Graph PATCH event (method, ASSUMPTION)', 'PATCH', "=https://graph.microsoft.com/v1.0/me/events/{{ $('Plan method change (w05.planUpdateMethod)').first().json.booking.graph_event_id }}", { params: { sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $json.access_token }}' }] }, sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($('Plan method change (w05.planUpdateMethod)').first().json.graph_patch) }}" } }));
  n.push(pg('Save method', `UPDATE public.appointments SET method = $2, call_number = NULLIF($3, ''), invite_email_status = $4, updated_at = now() WHERE id = $1::uuid RETURNING id;`, "={{ (() => { const p = $('Plan method change (w05.planUpdateMethod)').first().json; return [p.booking.id, p.appointment_update.method, p.appointment_update.call_number || '', p.appointment_update.invite_email_status]; })() }}"));
  n.push(code('Method invite?', 'w05.mjs', `const p = $('Plan method change (w05.planUpdateMethod)').first().json;\nreturn p.mail ? [{ json: { kind: 'mail', mail: p.mail } }] : [];`));
  n.push(code('ask_email input (method)', 'w05.mjs', `return [{ json: $json.ask }];`));
  // invite_bounced (W17)
  n.push(pg('Mark invite bounced', `WITH l AS (
  UPDATE public.leads SET email_status = 'bounced', updated_at = now()
   WHERE lower(email) = $1 AND email_purpose = 'meeting_invite' AND brand_id IS NOT NULL
  RETURNING id, email, phone, language, first_name)
SELECT l.id, l.email, l.phone, l.language, l.first_name, bk.method, bk.adviser_name,
       (SELECT max(c.created_at) FROM public.communications c WHERE c.lead_id = l.id AND c.direction = 'inbound') AS last_inbound_at
  FROM l
  LEFT JOIN LATERAL (
    SELECT a.method, COALESCE(b.adviser_name, b.contact_person) AS adviser_name
      FROM public.appointments a JOIN public.brokers b ON b.id = a.broker_id
     WHERE a.client_id = l.id AND ($2 = '' OR a.id::text = $2)
     ORDER BY a.appointment_date DESC
     LIMIT 1) bk ON true;`, "={{ [$json.req.recipient || '', $json.req.booking_id || ''] }}"));
  // I-49b: one ask, through the shared sender (EMAIL_BOUNCED session line in the 24-h window, else invite_email_bounced).
  n.push(code('Bounce prompt (w05.bounceEffect)', 'w05.mjs', `return $input.all().filter((it) => it.json.id).map((it) => L.bounceEffect(it.json, { now: Date.now(), last_inbound_ms: Date.parse(it.json.last_inbound_at || '') }).send).filter(Boolean).map((send) => ({ json: send }));`));
  n.push(node('-> WhatsApp Send (invite bounce)', 'executeWorkflow', 1.1, { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'smc-whatsapp-send', cachedResultName: 'WhatsApp Send' }, options: { waitForSubWorkflow: false } }));
  // ---------- connections
  chain(c, 'POST /book', 'Parse + verify caller (w05.parseHttp)', 'Caller ok?');
  link(c, 'Caller ok?', 'Load lead, broker, replay, live booking', 0); link(c, 'Caller ok?', 'Answer', 1);
  chain(c, 'Called by W07/W10/W17/W28', 'Normalise sub-call (w05.parseSub)', 'Sub op?');
  link(c, 'Sub op?', 'Load lead, broker, replay, live booking', 0); link(c, 'Sub op?', 'Load booking for method change', 1); link(c, 'Sub op?', 'Mark invite bounced', 2); link(c, 'Sub op?', 'W10 pick payload', 3); link(c, 'Sub op?', 'Log subcall_rejected', 4);
  chain(c, 'W10 pick payload', '-> W10 reschedule pick');
  chain(c, 'Load lead, broker, replay, live booking', 'Decide (w05.decide + MX)', 'Decision?');
  link(c, 'Decision?', 'Answer', 0); link(c, 'Decision?', 'Answer', 1); link(c, 'Decision?', 'Answer', 2); link(c, 'Decision?', 'W10 pick payload', 3); link(c, 'Decision?', 'Log subcall_rejected', 4); link(c, 'Decision?', 'is_free input', 5);
  chain(c, 'is_free input', 'W04 is_free (re-check, waits)', 'After re-check (w05.afterCheck)', 'Free?');
  link(c, 'Free?', 'Insert appointment (re-check overlap + buffer, idempotent)', 0); link(c, 'Free?', 'Answer', 1);
  chain(c, 'Insert appointment (re-check overlap + buffer, idempotent)', 'Inserted?');
  link(c, 'Inserted?', 'Broker calendar (graph)?', 0); link(c, 'Inserted?', 'Re-select by idempotency key', 1);
  chain(c, 'Re-select by idempotency key', 'Lost the race: replay or next 3', 'Answer');
  link(c, 'Broker calendar (graph)?', 'graph_token input', 0); link(c, 'Broker calendar (graph)?', 'Event body (shared)', 1);
  chain(c, 'graph_token input', 'W04 graph_token (waits)', 'Event body', 'Graph create event (broker calendar, ASSUMPTION)', 'After event (w05.finish)');
  chain(c, 'Event body (shared)', 'Graph create event (howzit@ shared calendar, ASSUMPTION)', 'After event (w05.finish)');
  chain(c, 'After event (w05.finish)', 'Save event ids + lead (stage, broker, cycle, invite email)', 'Timeline: booked', 'Answer', 'HTTP lane?');
  link(c, 'HTTP lane?', 'Respond (book JSON)', 0); link(c, 'HTTP lane?', 'Fan out effects', 1);
  chain(c, 'Respond (book JSON)', 'Fan out effects', 'Effect?');
  ['Live send?', 'Email from howzit@ (Graph sendMail)', '-> W06 First touch (booking event)', '-> W09 Reminder sequence (schedule / rebuild)', '-> W07 post-booking contact confirm', '-> CAPI Send (Schedule, no email)', '-> W28 ask_email', '-> W22 Alerts'].forEach((t, i) => link(c, 'Effect?', t, i));
  link(c, 'Live send?', 'Send WhatsApp', 0); chain(c, 'Send WhatsApp', 'Touch leads.last_contact_at (lead sends)');
  chain(c, 'Load booking for method change', 'Plan method change (w05.planUpdateMethod)', 'Method plan?');
  link(c, 'Method plan?', 'graph_token input (method)', 0); link(c, 'Method plan?', 'ask_email input (method)', 1); link(c, 'Method plan?', 'Log subcall_rejected', 2);
  chain(c, 'graph_token input (method)', 'W04 graph_token (method, waits)', 'Graph PATCH event (method, ASSUMPTION)', 'Save method', 'Method invite?', 'Email from howzit@ (Graph sendMail)');
  chain(c, 'ask_email input (method)', '-> W28 ask_email');
  chain(c, 'Mark invite bounced', 'Bounce prompt (w05.bounceEffect)', '-> WhatsApp Send (invite bounce)');
  return wf('smc-w05', 'W05 Book (DRAFT pending GATE-TEST-W05)', 'automation-engineer. W05 book; logic automation/lib/w05.mjs (+ lib/w04.mjs via the W04 sub-workflow); tests automation/tests/W05.test.mjs. Callers bind by id smc-w05 (name kept as cachedResultName only).', n, c, ['booking', 'core', 'draft']);
}

writeFileSync(join(HERE, 'W04.json'), JSON.stringify(buildW04(), null, 2) + '\n');
writeFileSync(join(HERE, 'W05.json'), JSON.stringify(buildW05(), null, 2) + '\n');
console.log('wrote W04.json, W05.json');
