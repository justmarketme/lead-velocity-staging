// Generates automation/SUB-ads-console.json (id smc-ads-console): the four console webhooks behind Console, Ads
//   POST /webhook/ads-confirm · /ads-budget · /ads-ad-status · /ads-campaign-status        (CONSOLE-ADS-API.md section 2)
// All logic lives in automation/ads/console-api.js (tested by automation/tests/ads-console.test.mjs through the Code nodes below);
// Code nodes load it only as require('lv-automation').adsConsole (I-46c). active:false, errorWorkflow smc-w22.
// Run: node automation/build-ads-console.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const OUT = dirname(fileURLToPath(import.meta.url));
const { SQL } = createRequire(import.meta.url)('./ads/console-api.js');
const PG = { postgres: { name: 'LV Supabase - n8n_app (least privilege)' } };
const ID = 'smc-ads-console';

const nodes = []; const connections = {};
const add = (n) => { n.id = `${ID}-${nodes.length + 1}`; n.position = n.position || [220 * (nodes.length % 9), 240 + 160 * Math.floor(nodes.length / 9)]; nodes.push(n); return n.name; };
const link = (from, to, out = 0) => { const c = (connections[from] ||= { main: [] }); while (c.main.length <= out) c.main.push([]); c.main[out].push({ node: to, type: 'main', index: 0 }); };
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) link(n[i], n[i + 1]); };
const code = (name, jsCode) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { mode: 'runOnceForEachItem', jsCode } });
const pg = (name, query, replacement, extra = {}) => ({ name, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery', query, options: { queryReplacement: replacement } }, ...extra });
const iff = (name, expr) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2, parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and', conditions: [{ id: 'c1', leftValue: `={{ ${expr} }}`, rightValue: true, operator: { type: 'boolean', operation: 'equals' } }] }, options: {} } });
const respond = (name, bodyExpr, statusExpr) => ({ name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, parameters: { respondWith: 'json', responseBody: `={{ JSON.stringify(${bodyExpr}) }}`, options: { responseCode: `={{ ${statusExpr} }}` } } });
const hook = (name, path, wid) => ({ name, type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: wid, parameters: { httpMethod: 'POST', path, authentication: 'none', responseMode: 'responseNode',
  options: { allowedOrigins: "={{ $env.PUBLIC_ALLOWED_ORIGINS || 'https://leadvelocity.co.za' }}" } } });
const LV = "const L = require('lv-automation').adsConsole;\n";

const PARSE = 'Parse request + verify caller (JWT)';
const DECIDE = 'Decide (admin, SMC target, caps, mint or verify token)';
const SHAPE = 'Shape response + DB record';
const routes = [['confirm', 'ads-confirm'], ['budget', 'ads-budget'], ['ad-status', 'ads-ad-status'], ['campaign-status', 'ads-campaign-status']];

const parse = add(code(PARSE, `${LV}// The caller must hold a valid Supabase user JWT (HS256, SUPABASE_JWT_SECRET). The admin role is checked in the next Postgres node (public.has_role).\nreturn { json: L.parseRequest({ route: $json.route, headers: $json.headers || {}, body: $json.body || {} }, { jwtSecret: $env.SUPABASE_JWT_SECRET }) };`));
for (const [route, path] of routes) {
  const w = add(hook(`POST /${path}`, path, `smc-${path}`));
  const t = add(code(`Route: ${route}`, `return { json: { headers: $json.headers, body: $json.body, route: '${route}' } };`));
  chain(w, t, parse);
}
const callerOk = add(iff('Caller ok?', '$json.ok === true'));
const respondErr = add(respond('Respond (refused or preview)', '$json.body', '$json.status || 400'));
const ctx = add(pg('Load context (admin?, SMC brand, target in ad cache, active cycles, plan, cycle spend)', SQL.context, '={{ [ $json.user_id, $json.target ] }}'));
const decide = add(code(DECIDE, `${LV}// confirm route: guardrails + mint a bound, single-use token. Apply routes: verify the token against the SERVER-normalised params.\n// The go-live share comes from the cycles row loaded above; nothing the browser sends can widen a cap.\nconst sd = $getWorkflowStaticData('global');\nconst d = L.decide({ parsed: $('${PARSE}').item.json, ctx: $json, env: $env, blockedUntil: sd.metaBlockedUntil || 0 });\nif (d.ok === true && d.mode === 'apply') return { json: d };\nif (d.ok === true) return { json: { mode: 'respond', status: d.status, body: d.body } };\nreturn { json: { mode: 'respond', status: d.status, body: d.body } };`));
const needs = add(iff('Needs a Meta write?', "$json.mode === 'apply'"));
const claim = add(pg('Claim confirm token (single use, before the Graph call)', SQL.claim,
  '={{ [ $json.nonce, $json.brandId, $json.plan.action, $json.plan.target, JSON.stringify($json.plan.params), JSON.stringify($json.plan.before), $json.plan.requestedBy, $json.confirmedBy, $json.plan.reason ] }}'));
const claimed = add(code('Claimed?', `// An empty result means the nonce is already in ads_write_log: the token was used before (CONFIRM_REUSED).\nconst d = $('${DECIDE}').item.json;\nif (!$json.log_id) return { json: { mode: 'respond', status: 409, body: { ok: false, code: 'CONFIRM_REUSED', message: 'confirmToken already used' } } };\nreturn { json: { ...d, logId: $json.log_id } };`));
const claimIf = add(iff('Token claimed?', "$json.mode === 'apply'"));
const apply = add(code('Apply at Meta (system user token; ADS_DRY_RUN sends nothing)', `${LV}const d = $json;\nconst applied = await L.applyWrite({ d, env: $env });\nconst sd = $getWorkflowStaticData('global');\nif (applied.blockedUntil) sd.metaBlockedUntil = applied.blockedUntil; // rate-limit back-off survives across webhook runs\nreturn { json: { d, applied } };`));
const shape = add(code(SHAPE, `${LV}const s = L.shape({ d: $json.d, applied: $json.applied });\nreturn { json: { status: s.status, body: s.body, record: s.record } };`));
const record = add(pg('Record result (ads_write_log, ad cache, ops.notifications)', SQL.record, '={{ $json.record }}', { onError: 'continueRegularOutput' }));
const respondApply = add(respond('Respond (applied or failed)', `$('${SHAPE}').item.json.body`, `$('${SHAPE}').item.json.status`));

link(parse, callerOk); link(callerOk, ctx, 0); link(callerOk, respondErr, 1);
chain(ctx, decide, needs); link(needs, claim, 0); link(needs, respondErr, 1);
chain(claim, claimed, claimIf); link(claimIf, apply, 0); link(claimIf, respondErr, 1);
chain(apply, shape, record, respondApply);

add({ name: 'Note: smc-ads-console', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, 0], parameters: { width: 640, height: 420, content:
  '## smc-ads-console (CONSOLE-ADS-API.md section 2)\n' +
  'Webhooks `ads-confirm`, `ads-budget`, `ads-ad-status`, `ads-campaign-status`. The console sends its Supabase JWT; no other credential reaches the browser.\n\n' +
  '1. JWT verified (HS256) and `public.has_role(uid, admin)`; `confirmed_by` / `requested_by` are the JWT user.\n' +
  '2. The target must be in `ad_objects` joined to the `brands` row `SMC` (SortMyCover only). Page / account IDs come from that row.\n' +
  '3. Caps, +20% step, 48 h, Meta minimum are checked at preview AND at apply. Caps are per 30-day broker cycle: sum of active cycles media_share_zar / 1.15 (never typed); spend counts from the cycle start.\n' +
  '4. Go-live: the share is read from `cycles` here; a browser-sent share is ignored.\n' +
  '5. Token: HMAC `META_CONFIRM_SECRET`, bound to action + target + server params, 15 min. Single use is a unique nonce row in `public.ads_write_log` claimed BEFORE the Graph call (migration smc_17).\n' +
  '6. Result: `ads_write_log` (audited by smc_audit), `ad_objects` cache (budget, status, last_budget_change_at), one `ops.notifications` row (ads_audit).\n\n' +
  '**Env:** `SUPABASE_JWT_SECRET`, `META_CONFIRM_SECRET` (>= 16 chars), `META_SYSTEM_USER_TOKEN`, `META_API_VERSION` (optional), `PUBLIC_ALLOWED_ORIGINS`, `ADS_DRY_RUN=true` (validate and log, send nothing).\n' +
  'Needs migrations smc_16 (ads_launch_plan) and smc_17 (ads_write_log). A failed Graph call after the claim spends the token: preview again. Never autonomous: only a console tap reaches these webhooks.' } });

const wf = { id: ID, name: 'Ads console webhooks (confirm, budget, ad status, campaign status)', nodes, connections, active: false,
  settings: { executionOrder: 'v1', timezone: 'Africa/Johannesburg', errorWorkflow: 'smc-w22', callerPolicy: 'workflowsFromSameOwner' },
  tags: [{ name: 'SortMyCover' }, { name: 'ads' }], meta: { generatedBy: 'automation/build-ads-console.mjs' } };
writeFileSync(join(OUT, 'SUB-ads-console.json'), JSON.stringify(wf, null, 2) + '\n');
console.log('wrote SUB-ads-console.json', nodes.length, 'nodes');
