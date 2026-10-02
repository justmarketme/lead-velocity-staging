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
// Alert nodes that used the body now read from the verify node
writeFileSync(file, JSON.stringify(w, null, 2) + '\n');
console.log('W23 patched:', w.nodes.length, 'nodes');
