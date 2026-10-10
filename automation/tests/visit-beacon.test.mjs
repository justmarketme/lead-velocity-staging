// I-32b: first-party visit beacon receiver: payload validation, DNT, rate limit, aggregation into ops.page_day, no PII.
// Run: node --test automation/tests/visit-beacon.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../lib/sub-visit-beacon.mjs';
import { runCode } from './_n8ncode.mjs';
import { workflowSql, checkSql } from './_sqlcheck.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = JSON.parse(readFileSync(join(A, 'SUB-visit-beacon.json'), 'utf8'));
const BRAND = '00000000-0000-0000-0000-0000000000a1';
const NOW = Date.parse('2026-10-03T22:30:00Z'); // 00:30 SAST on 4 Oct
const SID = 'c0ffee00-1111-4222-8333-444455556666';
const good = (o = {}) => JSON.stringify({ v: 1, sid: SID, a: 'new-bond', e: 'view', ...o });

test('payload: the page beacon shape is accepted as text/plain JSON string or parsed object', () => {
  const a = L.normalise({ body: good() });
  assert.deepEqual(a, { ok: true, event: 'view', slug: 'new-bond', step: null, sid: SID });
  assert.deepEqual(L.normalise({ body: JSON.parse(good({ e: 'step', s: 3 })) }), { ok: true, event: 'step', slug: 'new-bond', step: 3, sid: SID });
});
test('payload: rejects bad shape, sid, slug, event, step, unknown slug, wrong origin', () => {
  const r = (o, extra = {}) => L.normalise({ body: good(o), ...extra }).reason;
  assert.equal(L.normalise({ body: 'nope' }).reason, 'shape');
  assert.equal(r({ v: 2 }), 'shape'); assert.equal(r({ sid: 'x' }), 'sid'); assert.equal(r({ a: 'New Bond!' }), 'angle');
  assert.equal(r({ e: 'click' }), 'event'); assert.equal(r({ e: 'step', s: 0 }), 'step'); assert.equal(r({ e: 'step', s: 9 }), 'step'); assert.equal(r({ e: 'step' }), 'step');
  assert.equal(r({}, { env: { BEACON_ANGLE_SLUGS: 'employer-gap' } }), 'angle');
  assert.equal(r({}, { env: { PUBLIC_ALLOWED_ORIGINS: 'https://sortmycover.co.za' }, headers: { origin: 'https://evil.example' } }), 'origin');
});
test('DNT / Sec-GPC header: dropped before anything is counted', () => {
  assert.equal(L.normalise({ body: good(), headers: { dnt: '1' } }).reason, 'dnt');
  assert.equal(L.normalise({ body: good(), headers: { 'sec-gpc': '1' } }).reason, 'dnt');
  assert.equal(L.normalise({ body: good(), headers: { dnt: '0' } }).ok, true);
});
test('rate limit: 20 per session per minute, 1,200 global, window resets, state stays in memory only', () => {
  let st; let ok = 0;
  for (let i = 0; i < 25; i++) { const r = L.rateLimit(st, SID, NOW); st = r.state; if (r.allowed) ok++; }
  assert.equal(ok, L.RATE_PER_SESSION);
  assert.equal(L.rateLimit(st, SID, NOW + 1000).reason, 'rate_session');
  assert.equal(L.rateLimit(st, SID, NOW + L.RATE_WINDOW_MS).allowed, true, 'new window');
  let g; let n = 0;
  for (let i = 0; i < 1300; i++) { const r = L.rateLimit(g, `sess-${String(i).padStart(6, '0')}`, NOW); g = r.state; if (r.allowed) n++; }
  assert.equal(n, L.RATE_GLOBAL);
  assert.deepEqual(Object.keys(st).sort(), ['global', 's', 'start']);
});
test('aggregation: visits, quiz_starts, quiz_steps views by SAST day and angle; no per-event data kept', () => {
  const rows = new Map();
  const feed = (o, now = NOW) => L.applyIncrement(rows, L.increment(L.normalise({ body: good(o) }), now, BRAND));
  feed({}); feed({ sid: 'aaaaaaaa-1' }); feed({ e: 'step', s: 1 }); feed({ e: 'step', s: 2 }); feed({ e: 'step', s: 2, sid: 'aaaaaaaa-1' }); feed({ a: 'turned-40' });
  feed({}, NOW + 24 * 3600e3);
  const r = rows.get(`2026-10-04|${BRAND}|/new-bond/`);
  assert.equal(r.visits, 2); assert.equal(r.quiz_starts, 1);
  assert.deepEqual(r.quiz_steps, { s1: { views: 1, abandons: 0 }, s2: { views: 2, abandons: 0 } });
  assert.equal(rows.get(`2026-10-04|${BRAND}|/turned-40/`).visits, 1);
  assert.equal(rows.get(`2026-10-05|${BRAND}|/new-bond/`).visits, 1, 'SAST day boundary');
  assert.equal(rows.size, 3);
  assert.ok(!JSON.stringify([...rows.values()]).includes('aaaaaaaa') && !JSON.stringify([...rows.values()]).includes(SID), 'no session id in the rows');
});
test('workflow: webhook /beacon -> Code -> 204 -> upsert; SQL matches the schema; no IP/UA/session id reaches the SQL', async () => {
  assert.equal(WF.active, false);
  assert.ok(WF.nodes.some((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters.path === 'beacon'));
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const sql = workflowSql(WF).map((x) => x.sql).join('\n');
  assert.match(sql, /ops\.page_day/); assert.doesNotMatch(sql, /\b(ip|user_agent|sid|referrer)\b/i);
  const upsert = WF.nodes.find((n) => n.type === 'n8n-nodes-base.postgres');
  assert.doesNotMatch(upsert.parameters.options.queryReplacement, /sid|headers|ip/);
  const sd = {};
  globalThis.$getWorkflowStaticData = () => sd; // n8n Code-node global (not a parameter of the harness)
  const run = (body, headers = {}) => runCode(WF, 'Validate, DNT, rate limit, count', { json: { body, headers }, env: { BRAND_ID: BRAND } });
  const ok = (await run(JSON.parse(good()))).json;
  assert.equal(ok.accept, true); assert.equal(ok.inc.page_path, '/new-bond/'); assert.equal(ok.inc.brand_id, BRAND); assert.ok(!('sid' in ok.inc));
  assert.equal((await run(JSON.parse(good()), { dnt: '1' })).json.accept, false);
  assert.ok(sd.rate && !JSON.stringify(sd.rate).includes('127.0.0.1'), 'rate state holds only the window counters');
  delete globalThis.$getWorkflowStaticData;
});
