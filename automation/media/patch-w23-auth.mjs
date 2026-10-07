#!/usr/bin/env node
// I-32a: puts the Supabase-JWT gate in front of W23's two browser-facing endpoints. Idempotent; rewrites automation/W23.json.
//   node automation/media/patch-w23-auth.mjs
// Re-run after any change to automation/security/lead-token.js so the inlined copy (sha-stamped) stays current.
// Before: portal back end -> /webhook/w23-portal-upload and /webhook/w23-approve, header auth, broker_id taken from the body.
// After:  browser -> {API}/intro/upload-confirm and {API}/intro/approve with Authorization: Bearer <Supabase access token>;
//         HS256 verify (SUPABASE_JWT_SECRET, env name) -> broker = brokers.user_id = sub. broker_id in the body is never read.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// TODO(I-44a): when the other workflows move Code nodes from import($env.REPO_DIR + ...) to require('lv-automation/lib/...'), change PRE below the same way.
import { inlineModule } from '../security/inline-for-n8n.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'W23.json');
const w = JSON.parse(readFileSync(file, 'utf8'));
const ORIGIN = "={{ $env.PUBLIC_ALLOWED_ORIGINS || 'https://leadvelocity.co.za' }}"; // I-37b: env-driven, never a literal (automation/tests/W26.test.mjs)
const N = (name) => w.nodes.find((n) => n.name === name);
const drop = (names) => { w.nodes = w.nodes.filter((n) => !names.includes(n.name)); names.forEach((x) => delete w.connections[x]); };
const link = (from, to, out = 0) => { const c = (w.connections[from] ||= { main: [] }); (c.main[out] ||= []); if (!c.main[out].some((t) => t.node === to)) c.main[out].push({ node: to, type: 'main', index: 0 }); };
const unlink = (from, to) => { const c = w.connections[from]; if (c) c.main = c.main.map((o) => (o || []).filter((t) => t.node !== to)); };

const LT = inlineModule('LT', 'lead-token.js');
const verifyCode = LT + `// I-32a. Browser-facing W23 endpoints: Bearer Supabase access token only. Needs NODE_FUNCTION_ALLOW_BUILTIN=crypto.
const it = $input.first().json;
const hdr = it.headers || {};
const auth = String(hdr.authorization || hdr.Authorization || '');
const m = /^Bearer\\s+(\\S+)$/i.exec(auth);
let v = { ok: false, reason: 'missing' };
if (m) { try { v = LT.verifySupabaseJwt(m[1], { secret: $env.SUPABASE_JWT_SECRET }); } catch (e) { v = { ok: false, reason: 'server_config' }; } }
// body is passed through for the take fields only (take_id, kind, language, mime, script_text). broker_id in it is never read.
const body = Object.assign({}, it.body || {}); delete body.broker_id; delete body.approved_by;
return [{ json: { ok: v.ok, reason: v.ok ? null : v.reason, sub: v.ok ? v.user_id : null, body } }];
`;

const codeNode = (id, name, pos) => ({ parameters: { jsCode: verifyCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos });
const ifOk = (id, name, pos, left, op = 'boolean') => ({ parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: left, rightValue: true, operator: { type: 'boolean', operation: 'equals' } }] } }, id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos });
const respond = (id, name, pos, code, json) => ({ parameters: { respondWith: 'json', responseBody: json, options: { responseCode: code } }, id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos });
const hook = (n, path) => { n.parameters = { httpMethod: 'POST', path, authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: ORIGIN } }; delete n.credentials; n.webhookId = path; };

// ---- rename + re-mode the webhooks
const up = N('Portal upload confirmed') || N('Portal upload confirmed (browser, Bearer JWT)');
const ap = N('Approve webhook') || N('Approve webhook (browser, Bearer JWT)');
up.name = 'Portal upload confirmed (browser, Bearer JWT)'; ap.name = 'Approve webhook (browser, Bearer JWT)';
hook(up, 'intro/upload-confirm'); hook(ap, 'intro/approve');
for (const [o, n] of [['Portal upload confirmed', up.name], ['Approve webhook', ap.name]]) if (w.connections[o]) { w.connections[n] = w.connections[o]; delete w.connections[o]; }
// expressions that referenced the old node name
const retarget = (s) => s.split("$('Portal upload confirmed')").join(`$('${up.name}')`);
const retarget2 = (s) => s.split("$('Approve webhook').item.json.body.broker_id").join("$('Verify broker JWT (approve)').item.json.sub").split("$('Approve webhook')").join("$('Verify broker JWT (approve)')");
for (const n of w.nodes) if (n.parameters && n.name !== 'Verify broker JWT (upload)' && n.name !== 'Verify broker JWT (approve)') n.parameters = JSON.parse(retarget2(retarget(JSON.stringify(n.parameters))));

// ---- clean any previous run, then (re)build
drop(['Verify broker JWT (upload)', 'JWT valid? (upload)', 'Broker found? (upload)', 'Respond 401 (upload)', 'Respond 403 (upload)', 'Respond 200 (upload)',
  'Verify broker JWT (approve)', 'Respond 401 (approve)', 'JWT valid? (approve)', 'Respond 200 (approve)', 'Respond 403 (approve)']);
unlink(up.name, 'Load broker (portal)'); w.connections[up.name] = { main: [[]] };
unlink(ap.name, 'Approve: make current, update brokers.intro_*_url (previous versions kept)'); w.connections[ap.name] = { main: [[]] };

// upload: Verify -> valid? -> Load broker by user_id -> found? -> Respond 200 -> Download raw ; failures answer 401 / 403
w.nodes.push(codeNode('w23-60', 'Verify broker JWT (upload)', [200, -160]), ifOk('w23-61', 'JWT valid? (upload)', [440, -160], '={{ $json.ok === true }}'),
  respond('w23-62', 'Respond 401 (upload)', [680, -300], 401, '{"error":"unauthorised"}'),
  ifOk('w23-63', 'Broker found? (upload)', [920, 0], '={{ !!$json.broker_id }}'),
  respond('w23-64', 'Respond 403 (upload)', [1160, 140], 403, '{"error":"no_broker"}'),
  respond('w23-65', 'Respond 200 (upload)', [1160, -40], 200, '{"ok":true,"state":"processing"}'));
link(up.name, 'Verify broker JWT (upload)'); link('Verify broker JWT (upload)', 'JWT valid? (upload)');
link('JWT valid? (upload)', 'Load broker (portal)', 0); link('JWT valid? (upload)', 'Respond 401 (upload)', 1);
link('Load broker (portal)', 'Broker found? (upload)');
// the existing edge Load broker -> Download raw is replaced by found? -> respond + download
unlink('Load broker (portal)', 'Download raw (object storage)');
link('Broker found? (upload)', 'Respond 200 (upload)', 0); link('Broker found? (upload)', 'Download raw (object storage)', 0); link('Broker found? (upload)', 'Respond 403 (upload)', 1);
const lb = N('Load broker (portal)');
lb.parameters.query = 'select b.id::text as broker_id, b.contact_person as adviser_name, b.firm_name as practice_name, b.fsp_number, b.whatsapp_number as to_number from brokers b where b.user_id::text = $1 limit 1';
lb.parameters.options.queryReplacement = '={{ [ $json.sub ] }}';
lb.alwaysOutputData = true;

// approve: Verify -> valid? -> approve query (broker from user_id) ; answer after the query
w.nodes.push(codeNode('w23-66', 'Verify broker JWT (approve)', [200, 1500]), ifOk('w23-67', 'JWT valid? (approve)', [420, 1500], '={{ $json.ok === true }}'),
  respond('w23-68', 'Respond 401 (approve)', [620, 1360], 401, '{"error":"unauthorised"}'),
  respond('w23-69', 'Respond 200 (approve)', [820, 1380], 200, '{"ok":true,"compliance_spot_check":"pending"}'),
  respond('w23-70', 'Respond 403 (approve)', [820, 1700], 403, '{"error":"nothing_to_approve"}'));
link(ap.name, 'Verify broker JWT (approve)'); link('Verify broker JWT (approve)', 'JWT valid? (approve)');
const AQ = 'Approve: make current, update brokers.intro_*_url (previous versions kept)';
link('JWT valid? (approve)', AQ, 0); link('JWT valid? (approve)', 'Respond 401 (approve)', 1);
link('Approved something?', 'Respond 200 (approve)', 0); link('Approved something?', 'Respond 403 (approve)', 1);
const aq = N(AQ);
// $1 = jwt sub (never the body), $2 = take_id. The broker is the row with user_id = sub; approved_by = sub.
aq.parameters.query = aq.parameters.query
  .replace('with t as (', "with me as (select id::text as bid from brokers where user_id::text = $1),\nt as (")
  .split('broker_id::text = $1').join('broker_id::text in (select bid from me)')
  .split('where id::text = $1 and exists').join('where id::text in (select bid from me) and exists')
  .split("case when $3 ~*").join("case when $1 ~*").split('then $3::uuid').join('then $1::uuid')
  .replace("ai_check->>'take_id' = $2", "ai_check->>'take_id' = $2");
aq.parameters.options.queryReplacement = '={{ [ $json.sub, $json.body.take_id ] }}';

// ===================================================================== I-37a: the rest of the recorder's endpoints
// Same gate on every one: webhook (no credential, responseNode) -> own "Verify broker JWT (<tag>)" -> "JWT valid?" -> DB by user_id = sub.
for (const n of w.nodes.filter((x) => x.id.startsWith('w23-x'))) delete w.connections[n.name];
w.nodes = w.nodes.filter((x) => !x.id.startsWith('w23-x'));
let xid = 0;
const X = () => 'w23-x' + String(++xid).padStart(2, '0');
const pg = (id, name, pos, query, repl) => ({ parameters: { operation: 'executeQuery', query, options: { queryReplacement: repl } }, id, name, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: pos, alwaysOutputData: true, credentials: { postgres: { name: 'LV Supabase - n8n_app (least privilege)' } } });
const newHook = (tag, method, y, path = tag) => { const n = { parameters: { httpMethod: method, path: 'intro/' + path, authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: ORIGIN } }, id: X(), name: `Intro ${tag} (browser, Bearer JWT)`, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, y], webhookId: 'intro/' + path }; return n; };
// tag = unique node-name suffix (n8n rejects duplicate node names); path = URL segment (defaults to tag).
function gate(tag, method, y, path = tag) {
  const h = newHook(tag, method, y, path), v = codeNode(X(), `Verify broker JWT (${tag})`, [220, y]);
  const ok = ifOk(X(), `JWT valid? (${tag})`, [440, y], '={{ $json.ok === true }}'), r401 = respond(X(), `Respond 401 (${tag})`, [660, y - 140], 401, '{"error":"unauthorised"}');
  w.nodes.push(h, v, ok, r401);
  link(h.name, v.name); link(v.name, ok.name); link(ok.name, r401.name, 1);
  return { ok: ok.name, ver: v.name, body: `$('${v.name}').item.json.body`, sub: `$('${v.name}').item.json.sub` };
}
const jsonBody = (e) => '={{ ' + e + ' }}';

// GET intro/status
{ const g = gate('status', 'GET', 2200);
  const q = pg(X(), 'Status (broker by user_id)', [680, 2200], `select b.id::text as broker_id, jsonb_build_object(
 'step', case when b.positioning_answers->'chosen_script' is not null then 'record' when b.positioning_answers->'script_candidates' is not null then 'scripts' else 'interview' end,
 'broker', jsonb_build_object('first_name', split_part(coalesce(b.contact_person,''), ' ', 1), 'name', b.contact_person, 'practice', b.firm_name, 'fsp', b.fsp_number),
 'scripts', coalesce((select jsonb_agg(jsonb_build_object('id', c->>'id', 'label', c->>'label', 'text', c->>'text')) from jsonb_array_elements(coalesce(b.positioning_answers->'script_candidates','[]'::jsonb)) c where (c->>'gate_pass')::boolean is true), '[]'::jsonb),
 'chosen_script', b.positioning_answers->'chosen_script'->>'id',
 'generating', (b.positioning_answers->'interview_complete_at' is not null and b.positioning_answers->'script_candidates' is null),
 'takes', coalesce((select jsonb_agg(jsonb_build_object('take_id', m.ai_check->>'take_id', 'state', m.state, 'kind', m.kind, 'language', m.language, 'reason', m.ai_check->>'reason', 'preview_url', m.url, 'thumbnail_url', m.thumbnail_url, 'ai_check', m.ai_check) order by m.created_at) from broker_media m where m.broker_id = b.id and (m.kind = 'video' or (m.kind = 'voice' and not exists (select 1 from broker_media v where v.broker_id = m.broker_id and v.kind = 'video' and v.ai_check->>'take_id' = m.ai_check->>'take_id')))), '[]'::jsonb),
 'approved', (select jsonb_build_object('at', m.approved_at, 'take_id', m.ai_check->>'take_id') from broker_media m where m.broker_id = b.id and m.is_current and m.approved_at is not null order by m.approved_at desc limit 1)
) as payload from brokers b where b.user_id::text = $1 limit 1`, '={{ [ ' + g.sub + ' ] }}');
  const f = ifOk(X(), 'Broker found? (status)', [900, 2200], '={{ !!$json.broker_id }}');
  const r200 = respond(X(), 'Respond 200 (status)', [1120, 2140], 200, '={{ Object.assign({ explainer_url: null, example_url: null, show_rate: null, whatsapp_capture: { number: $env.WA_CAPTURE_NUMBER || null, link: $env.WA_CAPTURE_NUMBER ? "https://wa.me/" + $env.WA_CAPTURE_NUMBER + "?text=Intro%20video" : null, qr_url: null } }, $json.payload) }}');
  const r403 = respond(X(), 'Respond 403 (status)', [1120, 2300], 403, '{"error":"no_broker"}');
  w.nodes.push(q, f, r200, r403); link(g.ok, q.name, 0); link(q.name, f.name); link(f.name, r200.name, 0); link(f.name, r403.name, 1); }

// POST intro/interview: typed answers only, stored in brokers.positioning_answers.answers; no LLM here.
{ const g = gate('interview', 'POST', 2600);
  const b = g.body;
  const q = pg(X(), 'Store interview answers (broker by user_id)', [680, 2600], `update brokers set positioning_answers = coalesce(positioning_answers, '{}'::jsonb)
 || case when $2 <> '' then jsonb_build_object('answers', coalesce(positioning_answers->'answers', '{}'::jsonb) || jsonb_build_object($2::text, $3::text)) else '{}'::jsonb end
 || case when $4::boolean then jsonb_build_object('interview_complete_at', now(), 'language', $5::text, 'languages_spoken', $6::text) else '{}'::jsonb end
where user_id::text = $1 and ($4::boolean or $2 <> '') returning id::text as broker_id`,
    `={{ [ ${g.sub}, /^[a-z_]{2,16}$/.test(String(${b}.question_id || '')) ? ${b}.question_id : '', String(${b}.text || '').slice(0, 2000), ${b}.complete === true, ['en', 'af'].includes(${b}.language) ? ${b}.language : 'en', String(${b}.languages_spoken || '').slice(0, 200) ] }}`);
  const f = ifOk(X(), 'Stored? (interview)', [900, 2600], '={{ !!$json.broker_id }}');
  const r200 = respond(X(), 'Respond 200 (interview)', [1120, 2540], 200, '{"ok":true}');
  const r403 = respond(X(), 'Respond 403 (interview)', [1120, 2700], 403, '{"error":"no_broker_or_invalid"}');
  w.nodes.push(q, f, r200, r403); link(g.ok, q.name, 0); link(q.name, f.name); link(f.name, r200.name, 0); link(f.name, r403.name, 1); }

// POST intro/script-select: SELECTS one of the gate-approved candidates (brokers.positioning_answers.script_candidates, written by the
// conversation-designer generator). Free or edited text is refused here: it needs the FAIS gate, which is not this workflow's job.
{ const g = gate('script-select', 'POST', 3000);
  const b = g.body;
  const q = pg(X(), 'Select script (broker by user_id)', [680, 3000], `with b as (select id, positioning_answers as pa from brokers where user_id::text = $1),
c as (select cand from b, jsonb_array_elements(coalesce(pa->'script_candidates', '[]'::jsonb)) cand where cand->>'id' = $2 and (cand->>'gate_pass')::boolean is true limit 1),
u as (update brokers set positioning_answers = positioning_answers || jsonb_build_object('chosen_script', (select cand || jsonb_build_object('language', $3::text, 'chosen_at', now()) from c)) where id in (select id from b) and exists (select 1 from c) and not $4::boolean and not $5::boolean returning id)
select exists (select 1 from c) as found, (select count(*) from u) as stored`,
    `={{ [ ${g.sub}, String(${b}.script_id || '').slice(0, 40), ['en', 'af'].includes(${b}.language) ? ${b}.language : 'en', ${b}.gate_only === true, ${b}.edited === true ] }}`);
  const r200 = respond(X(), 'Respond 200 (script-select)', [900, 3000], 200, `={{ { pass: $json.found === true && ${b}.edited !== true, checks: $json.found !== true ? [{ id: 'select', ok: false, msg: 'That script is not one of your approved options.', fix: 'Pick one of the three scripts.' }] : (${b}.edited === true ? [{ id: 'edit', ok: false, msg: 'Edited wording has to be checked before you can record.', fix: 'Pick an option as written, or ask us to check your edit.' }] : []) } }}`);
  w.nodes.push(q, r200); link(g.ok, q.name, 0); link(q.name, r200.name); }

// POST intro/upload (phase 1): signed upload URL into the private broker-media bucket, key = <broker uuid>/<language>/<take_id>.<ext>
{ const g = gate('upload-url', 'POST', 3400, 'upload'); // node names "(upload-url)" so they do not collide with the upload-confirm lane's "(upload)" nodes
  const b = g.body;
  const lb = pg(X(), 'Load broker (upload sign)', [680, 3400], 'select id::text as broker_id from brokers where user_id::text = $1 limit 1', '={{ [ ' + g.sub + ' ] }}');
  const f = ifOk(X(), 'Broker found? (upload sign)', [900, 3400], '={{ !!$json.broker_id }}');
  const r403 = respond(X(), 'Respond 403 (upload sign)', [1120, 3560], 403, '{"error":"no_broker"}');
  const plan = { parameters: { jsCode: `// Plan the object key. The broker uuid prefix comes from brokers.user_id = sub (never the body).
const crypto = require('crypto');
const j = $('${g.ver}').item.json, body = j.body || {};
const broker = $('Load broker (upload sign)').item.json.broker_id;
const kind = body.kind === 'audio' ? 'audio' : (body.kind === 'video' ? 'video' : null);
const mime = String(body.mime || '');
const ext = mime.includes('mp4') ? (kind === 'audio' ? 'm4a' : 'mp4') : mime.includes('quicktime') ? 'mov' : mime.includes('ogg') ? 'ogg' : (kind === 'audio' ? 'webm' : 'webm');
const size = Number(body.size) || 0;
const language = ['en', 'af'].includes(body.language) ? body.language : 'en';
const ok = !!kind && /^(video|audio)\\//.test(mime) && size > 0 && size <= 200 * 1024 * 1024;
const take_id = crypto.randomUUID();
return [{ json: { ok, broker_id: broker, take_id, mime, object_key: broker + '/' + language + '/' + take_id + '.' + ext } }];` }, id: X(), name: 'Plan upload key', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1120, 3380] };
  const pv = ifOk(X(), 'Plan valid? (upload sign)', [1340, 3380], '={{ $json.ok === true }}');
  const r400 = respond(X(), 'Respond 400 (upload sign)', [1560, 3540], 400, '{"error":"bad_upload"}');
  const sign = { parameters: { method: 'POST', url: "={{ $env.SUPABASE_URL }}/storage/v1/object/upload/sign/broker-media/{{ $json.object_key }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '{}', options: {} }, id: X(), name: 'Sign upload URL (Supabase Storage, credential by name)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1560, 3380], credentials: { httpHeaderAuth: { name: 'Supabase Storage (service role)' } } };
  const r200 = respond(X(), 'Respond 200 (upload sign)', [1780, 3380], 200, `={{ { take_id: $('Plan upload key').item.json.take_id, object_key: $('Plan upload key').item.json.object_key, upload_url: $env.SUPABASE_URL + '/storage/v1' + $json.url, method: 'PUT', headers: { 'Content-Type': $('Plan upload key').item.json.mime }, expires_at: new Date(Date.now() + 7200000).toISOString() } }}`);
  w.nodes.push(lb, f, r403, plan, pv, r400, sign, r200);
  link(g.ok, lb.name, 0); link(lb.name, f.name); link(f.name, plan.name, 0); link(f.name, r403.name, 1); link(plan.name, pv.name); link(pv.name, sign.name, 0); link(pv.name, r400.name, 1); link(sign.name, r200.name); }

// upload-confirm: the take must live under THIS broker's uuid prefix in broker-media (ownership), and is read from that bucket.
{ const okb = N('Broker found? (upload)');
  const ob = "String($('Verify broker JWT (upload)').item.json.body.object_key || '')";
  okb.parameters.conditions.conditions[0].leftValue = `={{ !!$json.broker_id && ${ob}.startsWith($json.broker_id + '/') && !${ob}.includes('..') }}`;
  N('Respond 403 (upload)').parameters.responseBody = '{"error":"forbidden"}';
  const dl = N('Download raw (object storage)'); dl.parameters.bucketName = "={{ $env.INTRO_RAW_BUCKET || 'broker-media' }}"; }

// ===================================================================== I-40i: script-generate + script-recheck
// Logic lives in automation/media/intro-script.mjs (imported from $env.REPO_DIR like W07, so the tested code is the running code).
// Contract: conversation/prompts/intro-script.md. LLM calls: x-api-key from $env.ANTHROPIC_API_KEY (the W07 pattern; no n8n credential holds a key).
// Order of the rules is the contract's: generate -> scriptCheck (deterministic) -> gate LLM (Haiku, fails closed; pass < 0.8 re-checked on Sonnet).
for (const n of w.nodes.filter((x) => x.id.startsWith('w23-y'))) delete w.connections[n.name];
w.nodes = w.nodes.filter((x) => !x.id.startsWith('w23-y'));
let yid = 0; const Y = () => 'w23-y' + String(++yid).padStart(2, '0');
const PRE = "const url = require('url');\nconst M = await import(url.pathToFileURL(($env.REPO_DIR || '/home/node/repo') + '/automation/media/intro-script.mjs').href);\n";
const mcode = (name, pos, body, mode) => ({ parameters: Object.assign({ jsCode: PRE + body }, mode ? { mode } : {}), id: Y(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos });
const llm = (name, pos, expr, timeout) => ({ parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', sendHeaders: true, headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.ANTHROPIC_API_KEY }}' }, { name: 'anthropic-version', value: '2023-06-01' }, { name: 'content-type', value: 'application/json' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr, options: { timeout, response: { response: { neverError: true } } } }, id: Y(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput' });
const ifx = (name, pos, expr) => ifOk(Y(), name, pos, expr);
const SONNET = '$env.ANTHROPIC_MODEL_STRONG || undefined', HAIKU = '$env.ANTHROPIC_MODEL_FAST || undefined';
const BROKER_SQL = "select b.id::text as broker_id, b.contact_person as adviser_name, b.firm_name as practice_name, b.fsp_number, coalesce(to_jsonb(b)->'verified_credentials', '[]'::jsonb) as verified_credentials, coalesce(b.positioning_answers, '{}'::jsonb) as positioning_answers from brokers b where b.user_id::text = $1 limit 1";

// the gate half shared by generate (per variant) and recheck. `from` = node holding {text, facts, lang, det}; returns the node to link a det-pass item into and the final node name.
function gateChain(sfx, y, from) {
  const h = llm(`Script gate LLM (Haiku, fails closed) ${sfx}`, [0, y], '={{ JSON.stringify($json.gate_body) }}', 8000);
  const pg_ = mcode(`Parse gate ${sfx}`, [0, y], `const src = $('${from}').item.json; const g = M.parseGate($json);\nreturn [{ json: Object.assign({}, src, { gate: g, sonnet_body: g.needs_sonnet ? M.gateRequest(src.text, src.facts, src.lang, { model: ${SONNET} }) : null }) }];`);
  const conf = ifx(`Gate confident? ${sfx}`, [0, y], '={{ $json.gate.needs_sonnet !== true }}');
  const hs = llm(`Script gate re-check (Sonnet) ${sfx}`, [0, y], '={{ JSON.stringify($json.sonnet_body) }}', 15000);
  const pr = mcode(`Parse re-check ${sfx}`, [0, y], `const src = $('Parse gate ${sfx}').item.json; const rc = M.parseGate($json);\nreturn [{ json: Object.assign({}, src, { gate: M.finalGate(src.gate, rc) }) }];`);
  [h, pg_, conf, hs, pr].forEach((n, i) => { n.position = [1500 + i * 220, y]; });
  w.nodes.push(h, pg_, conf, hs, pr);
  link(h.name, pg_.name); link(pg_.name, conf.name); link(conf.name, hs.name, 1); link(hs.name, pr.name);
  return { entry: h.name, okOut: conf.name, reOut: pr.name };
}


// I-41h: cost logging. Side branch (never in the response path); a failed insert continues regularly and cannot fail the request.
const COST_SQL = "insert into ops.costs (date, kind, brand_id, broker_id, amount_zar, source_ref, note) values (current_date, 'llm', $1::uuid, $2::uuid, $3::numeric, $4::text, $5::text) on conflict do nothing";
const USAGE = (node) => `(() => { try { const j = $('${node}').item.json; return { model: j.model, usage: j.usage }; } catch (e) { return null; } })()`;
const costNodes = (label, llmNodes, resultNode, brokerExpr, refExpr, x0, y) => {
  const calc = mcode(`Cost row (${label})`, [x0, y + 200], `const calls = [${llmNodes.map(USAGE).join(', ')}];
const row = M.llmCostRow(calls);
let broker = ''; try { broker = ${brokerExpr}; } catch (e) {}
return [{ json: Object.assign({ broker_id: broker, source_ref: ${refExpr} }, row) }];`);
  const ins = pg(Y(), `Log LLM cost (${label})`, [x0 + 220, y + 200], COST_SQL, "={{ [ $env.BRAND_ID, $json.broker_id, $json.amount_zar, $json.source_ref, $json.note ] }}");
  ins.onError = 'continueRegularOutput';
  w.nodes.push(calc, ins); link(resultNode, calc.name); link(calc.name, ins.name);
};

// ---------------- POST intro/script-generate
{ const g = gate('script-generate', 'POST', 4000);
  const load = pg(Y(), 'Load broker + answers (generate)', [680, 4000], BROKER_SQL, '={{ [ ' + g.sub + ' ] }}');
  const complete = ifx('Interview complete? (generate)', [900, 4000], "={{ !!$json.broker_id && !!$json.positioning_answers.interview_complete_at }}");
  const r409 = respond(Y(), 'Respond 409 (script-generate)', [1120, 4120], 409, '{"error":"interview_incomplete"}');
  const allowed = ifx('Generation allowed? (generate)', [1120, 4000], "={{ !$json.positioning_answers.script_generated_at || (Date.now() - Date.parse($json.positioning_answers.script_generated_at)) > 3600000 }}");
  const r429 = respond(Y(), 'Respond 429 (script-generate)', [1340, 4120], 429, '{"error":"try_again_in_an_hour"}');
  const lang = `['en', 'af'].includes(${g.body}.lang) ? ${g.body}.lang : (/^[a-z]{2,8}$/.test(String(${g.body}.lang || '')) ? ${g.body}.lang : 'en')`;
  const explode = mcode('Explode 3 angles', [1340, 4000], `const b = $json; const lang = ${lang};
const facts = { practice: b.practice_name, fsp: b.fsp_number, verified_credentials: b.verified_credentials };
return M.ANGLES.map((m) => ({ json: Object.assign({}, m, { facts, lang, attempt: 1, broker: { adviser_name: b.adviser_name, practice_name: b.practice_name, fsp_number: b.fsp_number, verified_credentials: b.verified_credentials }, answers: b.positioning_answers, req: M.genRequest({ adviser_name: b.adviser_name, practice_name: b.practice_name, fsp_number: b.fsp_number, verified_credentials: b.verified_credentials }, b.positioning_answers, m.angle, lang, { model: ${SONNET} }) }) }));`);
  w.nodes.push(load, complete, r409, allowed, r429, explode);
  link(g.ok, load.name, 0); link(load.name, complete.name); link(complete.name, allowed.name, 0); link(complete.name, r409.name, 1); link(allowed.name, explode.name, 0); link(allowed.name, r429.name, 1);
  // one attempt = generate -> check -> det pass? -> gate (-> sonnet re-check) -> variant result
  const attempt = (n, srcNode, x0) => {
    const gen = llm(`Generate variant (Sonnet) (${n})`, [x0, 4000], '={{ JSON.stringify($json.req) }}', 30000);
    const chk = mcode(`Check variant (${n})`, [x0 + 220, 4000], `const src = $('${srcNode}').item.json; const text = M.parseGenerated($json, src.angle); const det = M.detCheck(text, src.facts, src.lang);\nreturn [{ json: Object.assign({}, src, { text, det, gate: null, gate_body: det.pass ? M.gateRequest(text, src.facts, src.lang, { model: ${HAIKU} }) : null }) }];`);
    const dp = ifx(`Det pass? (${n})`, [x0 + 440, 4000], '={{ $json.det.pass === true }}');
    const res = mcode(`Variant result (${n})`, [x0 + 2800, 4000], "const j = $json; return [{ json: Object.assign({}, j, { v: M.variant({ id: j.id, label: j.label, angle: j.angle }, j.text, j.det, j.gate || null) }) }];");
    w.nodes.push(gen, chk, dp, res);
    const gc = gateChain(`(${n})`, 4000, `Check variant (${n})`);
    costNodes(`generate ${n}`, [`Generate variant (Sonnet) (${n})`, `Script gate LLM (Haiku, fails closed) (${n})`, `Script gate re-check (Sonnet) (${n})`], res.name,
      "$('Load broker + answers (generate)').first().json.broker_id", "`w23:script-generate:${broker}:${$execution.id}:${$json.angle}:" + n + "`", x0 + 2800, 4000);
    link(gen.name, chk.name); link(chk.name, dp.name); link(dp.name, gc.entry, 0); link(dp.name, res.name, 1); link(gc.okOut, res.name, 0); link(gc.reOut, res.name);
    return { entry: gen.name, out: res.name };
  };
  const a1 = attempt(1, 'Explode 3 angles', 1560); link(explode.name, a1.entry);
  const needs = ifx('Needs retry? (generate)', [4900, 4000], '={{ $json.v.gate_pass !== true }}');
  const retry = mcode('Retry prep (generate)', [5120, 4100], "return [{ json: Object.assign({}, $json, { attempt: 2, det: null, gate: null, v: null }) }];");
  w.nodes.push(needs, retry); link(a1.out, needs.name); link(needs.name, retry.name, 0);
  const a2 = attempt(2, 'Retry prep (generate)', 5340); link(retry.name, a2.entry);
  const merge = { parameters: { mode: 'append' }, id: Y(), name: 'Merge variants', type: 'n8n-nodes-base.merge', typeVersion: 3, position: [8200, 4000] };
  const collect = mcode('Collect 3 (generate)', [8420, 4000], "const list = $input.all().map((i) => i.json.v).filter(Boolean);\nreturn [{ json: { variants: M.collectThree(list), gate_version: M.GATE_VERSION } }];", 'runOnceForAllItems');
  const store = pg(Y(), 'Store candidates (generate)', [8640, 4000], `update brokers set positioning_answers = (coalesce(positioning_answers, '{}'::jsonb) - 'chosen_script') || jsonb_build_object('script_candidates', $2::jsonb, 'script_generated_at', now(), 'script_gate_version', $3::text) where user_id::text = $1 and positioning_answers->'interview_complete_at' is not null returning id::text as broker_id`, "={{ [ " + g.sub + ", JSON.stringify($('Collect 3 (generate)').item.json.variants), $('Collect 3 (generate)').item.json.gate_version ] }}");
  const stored = ifx('Stored? (generate)', [8860, 4000], '={{ !!$json.broker_id }}');
  const r200 = respond(Y(), 'Respond 200 (script-generate)', [9080, 3940], 200, "={{ { variants: $('Collect 3 (generate)').item.json.variants } }}");
  const r409b = respond(Y(), 'Respond 409 (script-generate store)', [9080, 4100], 409, '{"error":"interview_incomplete"}');
  w.nodes.push(merge, collect, store, stored, r200, r409b);
  w.connections[a2.out] = { main: [[{ node: merge.name, type: 'main', index: 1 }]] };
  // Merge input 0 = variants that passed first time, input 1 = retried ones
  w.connections[needs.name].main[1] = [{ node: merge.name, type: 'main', index: 0 }];
  link(merge.name, collect.name); link(collect.name, store.name); link(store.name, stored.name); link(stored.name, r200.name, 0); link(stored.name, r409b.name, 1); }

// ---------------- POST intro/script-recheck (edited text; fails closed; a failed check is a normal 200 answer)
{ const g = gate('script-recheck', 'POST', 5000);
  const b = g.body;
  const load = pg(Y(), 'Load broker facts (recheck)', [680, 5000], BROKER_SQL, '={{ [ ' + g.sub + ' ] }}');
  const found = ifx('Broker found? (recheck)', [900, 5000], '={{ !!$json.broker_id }}');
  const r403 = respond(Y(), 'Respond 403 (script-recheck)', [1120, 5140], 403, '{"error":"no_broker"}');
  const chk = mcode('Check edited text', [1120, 5000], `const b = ${b}; const br = $json; const text = String(b.text || '');
const lang = ['en', 'af'].includes(b.lang) ? b.lang : (/^[a-z]{2,8}$/.test(String(b.lang || '')) ? b.lang : 'en');
const facts = { practice: br.practice_name, fsp: br.fsp_number, verified_credentials: br.verified_credentials };
const tooLong = text.length > 1500;
const det = tooLong || !text.trim() ? { pass: false, verdict: 'block', issues: ['empty or over 1,500 characters'], rule: 'invalid_input' } : M.detCheck(text, facts, lang);
return [{ json: { text, facts, lang, det, choose: b.choose === true, gate: null, gate_body: det.pass ? M.gateRequest(text, facts, lang, { model: ${HAIKU} }) : null } }];`);
  const dp = ifx('Det pass? (recheck)', [1340, 5000], '={{ $json.det.pass === true }}');
  const res = mcode('Recheck result', [4000, 5000], "const j = $json; return [{ json: Object.assign({}, j, { result: M.recheckResult(j.text, j.facts, j.lang, j.det, j.gate || null) }) }];");
  const choose = ifx('Store chosen script? (recheck)', [4220, 5000], '={{ $json.result.pass === true && $json.choose === true }}');
  const store = pg(Y(), 'Store chosen script (recheck)', [4440, 4940], `update brokers set positioning_answers = coalesce(positioning_answers, '{}'::jsonb) || jsonb_build_object('chosen_script', jsonb_build_object('id', 'custom', 'label', 'Your edited script', 'text', $2::text, 'language', $3::text, 'checked_at', now(), 'gate_version', $4::text)) where user_id::text = $1 returning id::text as broker_id`, "={{ [ " + g.sub + ", $('Recheck result').item.json.text, $('Recheck result').item.json.lang, 'intro-script-v1.0.0' ] }}");
  const r200 = respond(Y(), 'Respond 200 (script-recheck)', [4660, 5000], 200, "={{ $('Recheck result').item.json.result }}");
  w.nodes.push(load, found, r403, chk, dp, res, choose, store, r200);
  costNodes('recheck', ['Script gate LLM (Haiku, fails closed) (recheck)', 'Script gate re-check (Sonnet) (recheck)'], res.name,
    "$('Load broker facts (recheck)').first().json.broker_id", "`w23:script-recheck:${broker}:${$execution.id}`", 4000, 5000);
  link(g.ok, load.name, 0); link(load.name, found.name); link(found.name, chk.name, 0); link(found.name, r403.name, 1); link(chk.name, dp.name);
  const gc = gateChain('(recheck)', 5000, 'Check edited text'); link(dp.name, gc.entry, 0); link(dp.name, res.name, 1); link(gc.okOut, res.name, 0); link(gc.reOut, res.name);
  link(res.name, choose.name); link(choose.name, store.name, 0); link(choose.name, r200.name, 1); link(store.name, r200.name); }
// Alert nodes that used the body now read from the verify node
writeFileSync(file, JSON.stringify(w, null, 2) + '\n');
console.log('W23 patched:', w.nodes.length, 'nodes');
