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
import { inlineModule } from '../security/inline-for-n8n.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'W23.json');
const w = JSON.parse(readFileSync(file, 'utf8'));
const ORIGIN = 'https://app.leadvelocity.co.za';
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
const newHook = (tag, method, y) => { const n = { parameters: { httpMethod: method, path: 'intro/' + tag, authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: ORIGIN } }, id: X(), name: `Intro ${tag} (browser, Bearer JWT)`, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, y], webhookId: 'intro/' + tag }; return n; };
function gate(tag, method, y) {
  const h = newHook(tag, method, y), v = codeNode(X(), `Verify broker JWT (${tag})`, [220, y]);
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
{ const g = gate('upload', 'POST', 3400);
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
// Alert nodes that used the body now read from the verify node
writeFileSync(file, JSON.stringify(w, null, 2) + '\n');
console.log('W23 patched:', w.nodes.length, 'nodes');
