// Generates automation/W36.json: "W36 Capital Legacy watch". Weekly (Monday 07:00 SAST) it reads the Capital Legacy pages
// that SortMyCover's wills and estate pages rely on (sites/sortmycover/config/capital-legacy-watch.json), normalises the
// visible text, hashes it, compares with the last run (workflow static data; first run: the committed baseline hashes)
// and, when something changed or could not be read, emails Jonathan which pages changed, the facts we took from them,
// a line diff and which of our pages are affected.
// Logic: sites/sortmycover/scripts/capital-legacy-watch.mjs, loaded as require('lv-automation').clWatch (I-46c); the local
// CLI sites/sortmycover/scripts/check-capital-legacy.mjs runs the same code. No tables, no DDL.
// Email: the W22 path (Graph sendMail from HOWZIT_MAILBOX, credential "MS Graph app-only - howzit@ Mail.Send"), to
// CL_WATCH_TO (Jonathan's address), falling back to OPS_EMAIL. DRY_RUN_SENDS=true sends nothing.
// Run: node automation/build-w36-capital-legacy-watch.mjs   Test: node --test automation/tests/W36.test.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));
const ID = 'smc-w36';
const nodes = []; const connections = {};
let x = 0;
const add = (n, y = 300) => { n.id = `${ID}-${nodes.length + 1}`; n.position = n.position || [x += 240, y]; nodes.push(n); return n.name; };
const link = (from, to, out = 0) => { const c = (connections[from] ||= { main: [] }); while (c.main.length <= out) c.main.push([]); c.main[out].push({ node: to, type: 'main', index: 0 }); };
const code = (name, jsCode) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { mode: 'runOnceForAllItems', jsCode } });
const iff = (name, expr) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'c1', leftValue: `={{ ${expr} }}`, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } });
const httpGet = (name, url, extra = {}) => ({
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: {
    url, sendHeaders: true,
    headerParameters: { parameters: [{ name: 'User-Agent', value: 'SortMyCover content check (+https://sortmycover.co.za)' }] },
    options: { response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } }, timeout: 20000, redirect: { redirect: { followRedirects: true, maxRedirects: 5 } }, ...extra },
  },
  retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput',
});

const T = add({ name: 'Weekly Mon 07:00 - Capital Legacy check', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 7 * * 1' }] } } });
const L1 = add(code('Load watch list',
`// Sources and baseline hashes: sites/sortmycover/config/capital-legacy-watch.json (read from the repo mount).
const L = require('lv-automation').clWatch;
const w = L.loadWatch();
return [{ json: { content_api: w.content_api, sources: w.sources.length } }];`));
const R = add(httpGet('Get content API ref', '={{ $json.content_api }}'));
const P = add(code('Plan requests',
`// FAQ entries are read by uid from Capital Legacy's public content API (the FAQ page paginates and reorders);
// pages by URL. Without a master ref the FAQ requests fail and are reported as "could not read".
const L = require('lv-automation').clWatch;
const r = $input.first().json || {};
let ref = '';
try { ref = L.masterRef(r.body ?? r.data); } catch (e) { ref = ''; }
return L.requestPlan(L.loadWatch(), ref).map((p) => ({ json: p }));`));
const F = add(httpGet('Fetch Capital Legacy page', '={{ $json.url }}', { batching: { batch: { batchSize: 1, batchInterval: 1500 } } }));
const C = add(code('Normalise, hash, compare (static data)',
`// One item per planned request, same order (HTTP Request keeps item order). State {sources:{id:{hash,text}}} lives in
// workflow static data, which n8n saves for trigger (production) runs only; a manual run compares but keeps nothing.
// First run: no state, so the committed baseline hashes are compared (no line diff yet), then text is stored.
const L = require('lv-automation').clWatch;
const plan = $('Plan requests').all().map((i) => i.json);
const fetched = $input.all().map((i, n) => {
  const r = i.json || {};
  const status = Number(r.statusCode || 0);
  const body = r.body ?? r.data;
  return { id: plan[n].id, ok: status >= 200 && status < 300 && body != null, status,
    body: typeof body === 'string' ? body : JSON.stringify(body ?? ''),
    error: r.error ? String(r.error.message || r.error) : undefined };
});
const store = $getWorkflowStaticData('global');
const now = new Date().toISOString();
const cmp = L.compare(L.loadWatch(), store.clWatch || {}, fetched, now);
store.clWatch = cmp.state;
const rep = L.report(cmp, { now });
return [{ json: {
  checked_at: now, changed: cmp.changed.length, failed: cmp.failed.length,
  results: cmp.results.map(({ diff, ...r }) => r),
  notify: !!rep, subject: rep ? rep.subject : null, text: rep ? rep.text : null,
  to: $env.CL_WATCH_TO || $env.OPS_EMAIL,
} }];`));
const N = add(iff('Anything to report?', '$json.notify === true'));
const D = add(iff('Live send? (Email to Jonathan)', "$env.DRY_RUN_SENDS !== 'true'"));
const M = add({
  name: 'Email Jonathan (Graph sendMail)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: {
    method: 'POST', url: '=https://graph.microsoft.com/v1.0/users/{{ $env.HOWZIT_MAILBOX }}/sendMail',
    authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ message: { subject: $json.subject, body: { contentType: 'Text', content: $json.text }, toRecipients: [ { emailAddress: { address: $json.to } } ] }, saveToSentItems: true }) }}",
    options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 10000 },
  },
  credentials: { oAuth2Api: { id: 'lv-graph-howzit-mailsend', name: 'MS Graph app-only - howzit@ Mail.Send' } },
  retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
}, 200);
const S = add(code('Dry-run stub (email)',
`// DRY_RUN_SENDS=true: nothing leaves the box (email). Pass the input on with a fake 2xx so the run shows what would be sent.
return $input.all().map((i, n) => ({ json: { ...i.json, dry_run: true, statusCode: 202, body: { id: 'dry:' + n } } }));`), 400);
nodes.push({ id: `${ID}-note`, name: 'Note', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [240, 40], parameters: { width: 640, height: 220, content:
`## W36 Capital Legacy watch
Weekly check of the Capital Legacy pages behind SortMyCover's wills and estate pages (config: sites/sortmycover/config/capital-legacy-watch.json). Emails Jonathan only when a page changed or could not be read.
Env: CL_WATCH_TO (Jonathan; falls back to OPS_EMAIL), HOWZIT_MAILBOX, DRY_RUN_SENDS. Needs N8N_BLOCK_ENV_ACCESS_IN_NODE=false and NODE_FUNCTION_ALLOW_EXTERNAL=lv-automation (as every SMC workflow).
After an email: run node sites/sortmycover/scripts/check-capital-legacy.mjs, update the pages, then --update.
Generated by automation/build-w36-capital-legacy-watch.mjs: edit that, not this.` } });

link(T, L1); link(L1, R); link(R, P); link(P, F); link(F, C); link(C, N); link(N, D); link(D, M); link(D, S, 1);

const wf = {
  id: ID, name: 'W36 Capital Legacy watch', nodes, connections, active: false,
  settings: { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: true, errorWorkflow: 'smc-w22', callerPolicy: 'workflowsFromSameOwner' },
  tags: [{ name: 'SortMyCover' }, { name: 'content-watch' }],
  meta: { generatedBy: 'automation/build-w36-capital-legacy-watch.mjs' },
};
writeFileSync(join(OUT, 'W36.json'), JSON.stringify(wf, null, 2) + '\n');
console.log(`W36.json: ${nodes.length} nodes`);
