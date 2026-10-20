// Every n8n webhook in the repo is classified (18 Oct 2026). A webhook a browser calls with fetch / sendBeacon must carry the
// LITERAL allowedOrigins list from lib/public-origins.cjs (n8n sends an expression out verbatim, and an empty option means "*":
// live W01 POST /lead reflected any Origin). Everything else is on the exempt list with the reason. A new webhook fails here
// until it is put on one of the lists. Run: node --test automation/tests/cors-webhooks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ALLOWED_ORIGINS } = createRequire(import.meta.url)('../lib/public-origins.cjs');
const LV_CONSOLE = 'https://leadvelocity.co.za,https://www.leadvelocity.co.za';

/** Browser-facing: file -> paths (method:path). Literal ALLOWED_ORIGINS. */
const BROWSER = {
  'W01.json': ['POST:lead', 'POST:lead/skip'], // SortMyCover /start/ step 0 + the landing pages
  'W04.json': ['GET:slots'], // /start/, landing pages, the broker portal tile
  'W05.json': ['POST:book'], // /start/ and the landing pages
  'W39.json': ['GET:start', 'POST:start/answers'], // /start/
  'W23.json': ['POST:intro/upload-confirm', 'POST:intro/approve', 'GET:intro/status', 'POST:intro/interview', 'POST:intro/script-select', 'POST:intro/upload',
    'POST:intro/script-generate', 'POST:intro/script-recheck'], // broker portal intro-video wizard
};
/** Browser-facing but deliberately narrower: the Lead Velocity console only (literal LV_CONSOLE). */
const BROWSER_LV_CONSOLE = {}; // W16 billing was the only one (retired 20 Oct 2026, D5)
/** Not called by a browser with fetch: no CORS option needed. file -> { 'method:path': reason }. */
const EXEMPT = {
  'SUB-email-verify.json': { 'GET:v/:token': 'link in the verification email (top-level navigation)' },
  'W02.json': { 'POST:meta-leadgen': 'Meta Lead Ads webhook', 'GET:meta-leadgen': 'Meta subscription handshake' },
  'W03.json': { 'GET:wa/:ref': 'tracked redirect link to wa.me', 'GET:whatsapp': 'Meta subscription handshake' },
  'W05.json': { 'GET:j/:booking_id': 'Teams join link (navigation)', 'GET:c/:booking_id': '.ics link (navigation)' },
  'W07.json': { 'POST:whatsapp': 'Meta WhatsApp webhook', 'POST:whatsapp-twilio': 'Twilio WhatsApp webhook' },
  'W15.json': { 'POST:sms-inbound': 'Twilio SMS webhook' },
  'W20.json': { 'POST:w20/broker-event': 'ms-oauth edge function (server)', 'POST:w20/preflight-result': 'server-side preflight', 'POST:w20/go-live': 'server-side go-live',
    'GET:ms/connect': 'portal link to Microsoft consent (navigation)', 'GET:ms/callback': 'Microsoft OAuth redirect (navigation)', 'POST:ms/disconnect': 'server-side (edge function)' },
  'W27.json': { 'POST:meta-health': 'Meta webhook', 'GET:meta-health': 'Meta subscription handshake' },
  'W28.json': { 'POST:flow': 'Meta WhatsApp Flows data_exchange endpoint' },
  'W34.json': { 'POST:w34/dsr': 'server-side DSR intake' },
  'W37.json': { 'POST:cal': 'Cal.com webhook' },
};

const files = readdirSync(A).filter((f) => /^(W\d+|SUB-.+)\.json$/.test(f)).sort();
const hooks = (f) => JSON.parse(readFileSync(join(A, f), 'utf8')).nodes.filter((n) => n.type === 'n8n-nodes-base.webhook')
  .map((n) => ({ key: `${String(n.parameters.httpMethod || 'GET').toUpperCase()}:${n.parameters.path}`, name: n.name, origins: (n.parameters.options || {}).allowedOrigins }));

test('every browser-facing webhook carries the literal ALLOWED_ORIGINS list (W01 /lead, /lead/skip, W05 /book, W39 /start, ...)', () => {
  for (const [f, keys] of Object.entries(BROWSER)) {
    const h = hooks(f);
    for (const k of keys) {
      const x = h.find((y) => y.key === k);
      assert.ok(x, `${f} has no webhook ${k}`);
      assert.equal(x.origins, ALLOWED_ORIGINS, `${f} ${k}: allowedOrigins must be the literal list`);
    }
  }
  for (const [f, keys] of Object.entries(BROWSER_LV_CONSOLE)) for (const k of keys) assert.equal(hooks(f).find((y) => y.key === k).origins, LV_CONSOLE, `${f} ${k}`);
});

test('every webhook in every workflow is classified (browser / LV console / exempt with a reason); no expression anywhere', () => {
  const unclassified = [];
  for (const f of files) for (const x of hooks(f)) {
    if (x.origins !== undefined) assert.ok(!String(x.origins).trim().startsWith('='), `${f} ${x.key}: an expression goes out verbatim`);
    const known = (BROWSER[f] || []).includes(x.key) || (BROWSER_LV_CONSOLE[f] || []).includes(x.key) || (EXEMPT[f] && EXEMPT[f][x.key]);
    if (!known) unclassified.push(`${f} ${x.key} (${x.name})`);
    if (EXEMPT[f] && EXEMPT[f][x.key]) assert.equal(x.origins, undefined, `${f} ${x.key} is exempt: no CORS option expected`);
  }
  assert.deepEqual(unclassified, [], 'classify each new webhook in tests/cors-webhooks.test.mjs');
  // and the lists name only webhooks that exist
  for (const [f, m] of Object.entries(EXEMPT)) for (const k of Object.keys(m)) assert.ok(hooks(f).some((y) => y.key === k), `${f} ${k} no longer exists`);
});
