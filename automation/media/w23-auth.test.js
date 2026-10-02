'use strict';
// I-32a: W23's browser-facing endpoints take a Supabase Bearer JWT; the broker comes from brokers.user_id = sub, never from the body.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'W23.json'), 'utf8'));
const node = (name) => W.nodes.find((n) => n.name === name);
const SECRET = 'x'.repeat(40);
const SUB = '11111111-2222-3333-4444-555555555555';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(claims = {}, { secret = SECRET, alg = 'HS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg, typ: 'JWT' }), p = b64({ sub: SUB, aud: 'authenticated', role: 'authenticated', exp: now + 600, ...claims });
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
// Run the Code node exactly as n8n would: $input / $env in scope, require available for the inlined module.
function run(name, headers, body, env = { SUPABASE_JWT_SECRET: SECRET }) {
  const fn = new Function('$input', '$env', 'require', node(name).parameters.jsCode);
  return fn({ first: () => ({ json: { headers, body } }) }, env, require)[0].json;
}
const BOTH = [['Verify broker JWT (upload)', 'Portal upload confirmed (browser, Bearer JWT)'], ['Verify broker JWT (approve)', 'Approve webhook (browser, Bearer JWT)']];

test('both browser endpoints: no header auth credential, no cookie, respond via node, CORS pinned to the portal origin', () => {
  for (const [, hook] of BOTH) {
    const p = node(hook).parameters;
    assert.equal(p.authentication, 'none');
    assert.equal(p.responseMode, 'responseNode');
    assert.equal(p.options.allowedOrigins, 'https://app.leadvelocity.co.za');
    assert.equal(node(hook).credentials, undefined);
  }
  assert.equal(node(BOTH[0][1]).parameters.path, 'intro/upload-confirm');
  assert.equal(node(BOTH[1][1]).parameters.path, 'intro/approve');
});

test('every path from a webhook reaches the JWT check before any DB or storage node', () => {
  for (const [ver, hook] of BOTH) {
    assert.deepEqual(W.connections[hook].main[0].map((t) => t.node), [ver]);
    const ok = W.connections[ver].main[0].map((t) => t.node);
    assert.equal(ok.length, 1);
    assert.match(ok[0], /^JWT valid\?/);
    const bad = W.connections[ok[0]].main[1].map((t) => t.node);
    assert.deepEqual(bad.map((n) => node(n).type), ['n8n-nodes-base.respondToWebhook']);
    assert.equal(node(bad[0]).parameters.options.responseCode, 401);
  }
});

test('valid broker token passes and yields sub only; body broker_id and approved_by are dropped', () => {
  for (const [ver] of BOTH) {
    const r = run(ver, { authorization: 'Bearer ' + jwt() }, { take_id: 't1', broker_id: 'someone-else', approved_by: 'x' });
    assert.equal(r.ok, true);
    assert.equal(r.sub, SUB);
    assert.deepEqual(r.body, { take_id: 't1' });
  }
});

test('rejects missing, wrong secret, alg none, expired, anon role, malformed and cookie-only callers', () => {
  const v = 'Verify broker JWT (upload)';
  const none = `${b64({ alg: 'none' })}.${b64({ sub: SUB, aud: 'authenticated', role: 'authenticated', exp: 9999999999 })}.`;
  const cases = [
    [{}, 'missing'], [{ cookie: 'sb=1' }, 'missing'],
    [{ authorization: 'Bearer ' + jwt({}, { secret: 'y'.repeat(40) }) }, 'bad_signature'],
    [{ authorization: 'Bearer ' + none }, 'alg'],
    [{ authorization: 'Bearer ' + jwt({ exp: 1 }) }, 'expired'],
    [{ authorization: 'Bearer ' + jwt({ role: 'anon', aud: 'anon' }) }, 'role'],
    [{ authorization: 'Bearer ' + jwt({ sub: 'not-a-uuid' }) }, 'sub'],
    [{ authorization: 'Bearer nonsense' }, 'malformed'],
    [{ authorization: 'Basic abc' }, 'missing'],
  ];
  for (const [h, why] of cases) { const r = run(v, h, { take_id: 't' }); assert.equal(r.ok, false, why); assert.equal(r.reason, why); assert.equal(r.sub, null); }
});

test('a missing server secret fails closed (never open)', () => {
  const r = run('Verify broker JWT (approve)', { authorization: 'Bearer ' + jwt() }, {}, {});
  assert.equal(r.ok, false);
});

test('broker comes from brokers.user_id = sub in both SQL nodes; no SQL reads broker_id from the body', () => {
  const load = node('Load broker (portal)').parameters;
  assert.match(load.query, /b\.user_id::text = \$1/);
  assert.equal(load.options.queryReplacement, '={{ [ $json.sub ] }}');
  const aq = node('Approve: make current, update brokers.intro_*_url (previous versions kept)').parameters;
  assert.match(aq.query, /from brokers where user_id::text = \$1/);
  assert.equal(aq.options.queryReplacement, '={{ [ $json.sub, $json.body.take_id ] }}');
  assert.doesNotMatch(aq.query, /broker_id::text = \$1/);
  assert.equal(node('Load broker (portal)').alwaysOutputData, true); // unknown user -> 403, not a hang
  const all = JSON.stringify(W.nodes.filter((n) => !n.name.startsWith('Verify broker JWT')).map((n) => n.parameters));
  assert.doesNotMatch(all, /json\.body\.broker_id/);
  assert.doesNotMatch(all, /json\.body\.approved_by/);
});

test('existing media-row logic is intact and answers are sent', () => {
  assert.ok(node('Insert media rows (state: processing)'));
  assert.ok(node('Mark rows ready (not current until approved)'));
  assert.match(node('Approve: make current, update brokers.intro_*_url (previous versions kept)').parameters.query, /is_current = true, approved_at = now\(\)|is_current = true, approved_at/);
  assert.deepEqual(W.connections['Approved something?'].main[0].map((t) => t.node).sort(), ['First intro for this broker? (compliance-qa spot-check)', 'Respond 200 (approve)']);
  assert.equal(node('Respond 403 (approve)').parameters.options.responseCode, 403);
  assert.equal(node('Respond 403 (upload)').parameters.options.responseCode, 403);
});

test('inlined verifier is the repo module (sha stamp matches lead-token.js)', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'security', 'lead-token.js'))).digest('hex').slice(0, 12);
  for (const [ver] of BOTH) assert.ok(node(ver).parameters.jsCode.includes('sha256:' + sha), 're-run node automation/media/patch-w23-auth.mjs');
});

test('static page: Bearer header from the Supabase session, no cookie, no broker id sent', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'portal', 'intro-media', 'app.js'), 'utf8');
  assert.match(js, /Authorization: 'Bearer ' \+ tok/);
  assert.match(js, /credentials: 'omit'/);
  assert.doesNotMatch(js, /credentials: 'include'/);
  assert.doesNotMatch(js, /broker_id/);
});

// ---- I-37a: the other recorder endpoints
const NEW = { status: 'GET', interview: 'POST', 'script-select': 'POST', upload: 'POST' };
const nodeBy = (name) => W.nodes.find((n) => n.name === name);

test('I-37a: every new endpoint is a JWT-gated webhook; no cookie, no credential, CORS pinned, 401 on a bad token', () => {
  for (const [tag, method] of Object.entries(NEW)) {
    const hook = W.nodes.find((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters.path === 'intro/' + tag);
    assert.ok(hook, tag);
    assert.equal(hook.parameters.httpMethod, method);
    assert.equal(hook.parameters.authentication, 'none');
    assert.equal(hook.parameters.responseMode, 'responseNode');
    assert.equal(hook.parameters.options.allowedOrigins, 'https://app.leadvelocity.co.za');
    assert.deepEqual(W.connections[hook.name].main[0].map((t) => t.node), [`Verify broker JWT (${tag})`]);
    assert.deepEqual(W.connections[`Verify broker JWT (${tag})`].main[0].map((t) => t.node), [`JWT valid? (${tag})`]);
    assert.equal(nodeBy(`Respond 401 (${tag})`).parameters.options.responseCode, 401);
    assert.deepEqual(W.connections[`JWT valid? (${tag})`].main[1].map((t) => t.node), [`Respond 401 (${tag})`]);
    const r = run(`Verify broker JWT (${tag})`, { authorization: 'Bearer ' + jwt() }, { broker_id: 'evil', take_id: 't' });
    assert.equal(r.ok, true); assert.equal(r.sub, SUB); assert.equal(r.body.broker_id, undefined);
    assert.equal(run(`Verify broker JWT (${tag})`, {}, {}).ok, false);
  }
});

test('I-37a status: read-only, broker from user_id = sub, returns takes + approval + gate-passed scripts only', () => {
  const q = nodeBy('Status (broker by user_id)').parameters;
  assert.match(q.query, /where b\.user_id::text = \$1/);
  assert.doesNotMatch(q.query, /\b(insert|update|delete)\b/i);
  assert.match(q.query, /gate_pass'\)::boolean is true/);
  assert.match(q.query, /'approved'/); assert.match(q.query, /'chosen_script'/);
  assert.equal(q.options.queryReplacement, "={{ [ $('Verify broker JWT (status)').item.json.sub ] }}");
});

test('I-37a interview: stores answers on brokers.positioning_answers by user_id = sub; validates id and length; no LLM / HTTP node on the path', () => {
  const q = nodeBy('Store interview answers (broker by user_id)').parameters;
  assert.match(q.query, /update brokers set positioning_answers/);
  assert.match(q.query, /where user_id::text = \$1/);
  assert.match(q.options.queryReplacement, /\^\[a-z_\]\{2,16\}\$/);
  assert.match(q.options.queryReplacement, /slice\(0, 2000\)/);
  assert.doesNotMatch(q.options.queryReplacement, /broker_id/);
  const downstream = ['Store interview answers (broker by user_id)', 'Stored? (interview)', 'Respond 200 (interview)', 'Respond 403 (interview)'];
  assert.ok(downstream.every((n) => !/httpRequest|anthropic|langchain/.test(nodeBy(n).type)));
});

test('I-37a script-select: selects a gate-approved candidate only; edited or free text is refused; never writes script text from the body', () => {
  const q = nodeBy('Select script (broker by user_id)').parameters;
  assert.match(q.query, /cand->>'id' = \$2 and \(cand->>'gate_pass'\)::boolean is true/);
  assert.match(q.query, /and not \$4::boolean and not \$5::boolean/); // gate_only and edited never store
  assert.match(q.query, /where user_id::text = \$1/);
  assert.doesNotMatch(q.options.queryReplacement, /body\.text|\.text \|\|/);
  assert.match(nodeBy('Respond 200 (script-select)').parameters.responseBody, /edited !== true/);
  assert.ok(!W.nodes.some((n) => /anthropic|langchain/.test(n.type)));
});

test('I-37a upload (phase 1): signed URL for broker-media/<broker uuid>/ with the credential NAME only; key built server-side from user_id', () => {
  const lb = nodeBy('Load broker (upload sign)').parameters;
  assert.match(lb.query, /where user_id::text = \$1/);
  const plan = nodeBy('Plan upload key').parameters.jsCode;
  assert.match(plan, /broker \+ '\/' \+ language \+ '\/' \+ take_id/);
  assert.match(plan, /200 \* 1024 \* 1024/);
  assert.doesNotMatch(plan, /body\.broker_id|body\.object_key/);
  const sign = nodeBy('Sign upload URL (Supabase Storage, credential by name)');
  assert.match(sign.parameters.url, /\/storage\/v1\/object\/upload\/sign\/broker-media\//);
  assert.deepEqual(sign.credentials, { httpHeaderAuth: { name: 'Supabase Storage (service role)' } });
  assert.doesNotMatch(JSON.stringify(sign), /eyJ|service_role_key|apikey/i);
  assert.equal(nodeBy('Respond 400 (upload sign)').parameters.options.responseCode, 400);
});

test('I-37a upload-confirm ownership: object_key must start with this broker uuid + "/", no "..", read from broker-media', () => {
  const cond = nodeBy('Broker found? (upload)').parameters.conditions.conditions[0].leftValue;
  assert.match(cond, /startsWith\(\$json\.broker_id \+ '\/'\)/);
  assert.match(cond, /includes\('\.\.'\)/);
  assert.equal(nodeBy('Respond 403 (upload)').parameters.options.responseCode, 403);
  assert.match(nodeBy('Download raw (object storage)').parameters.bucketName, /'broker-media'/);
  // evaluate the expression: own key passes, another broker's key and traversal fail
  const own = 'aaaa', evalCond = (key, id) => new Function('$json', '$', 'return ' + cond.replace(/^=\{\{|\}\}$/g, ''))({ broker_id: id }, () => ({ item: { json: { body: { object_key: key } } } }));
  assert.equal(evalCond('aaaa/en/t.mp4', own), true);
  assert.equal(evalCond('bbbb/en/t.mp4', own), false);
  assert.equal(evalCond('aaaa/../bbbb/t.mp4', own), false);
  assert.equal(evalCond('aaaaX/en/t.mp4', own), false);
});
