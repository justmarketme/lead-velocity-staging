'use strict';
// node --test automation/security/lead-token.test.js   (Node 18+, zero dependencies)
// Secrets are random per run: nothing secret is committed.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const LT = require('./lead-token.js');

const SECRET = crypto.randomBytes(32).toString('hex');
const OLD = crypto.randomBytes(32).toString('hex');
const JWT_SECRET = crypto.randomBytes(32).toString('hex');
const NOW = Date.parse('2026-10-12T08:14:05+02:00'); // fixture L01 submitted_at
const DAY = 86400000;
const LEAD = 'lead_test_L01';
const BROKER_USER = '7b0d7a5e-1c1d-4c4e-9a52-0d5b4b0c1a01'; // synthetic auth.users id

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims, { secret = JWT_SECRET, alg = 'HS256' } = {}) {
  const h = b64({ alg, typ: 'JWT' });
  const p = b64(claims);
  const sig = alg === 'none' ? '' : crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}
const brokerClaims = (extra = {}) => ({ sub: BROKER_USER, aud: 'authenticated', role: 'authenticated', exp: Math.floor(NOW / 1000) + 3600, ...extra });
const keys = { leadSecret: SECRET, jwtSecret: JWT_SECRET, nowMs: NOW };

test('mint -> verify round trip returns the lead id and a 14-day expiry', () => {
  const { token, exp } = LT.mintLeadToken(LEAD, { secret: SECRET, nowMs: NOW });
  assert.match(token, /^lt1\.lead_test_L01\.\d+\.[A-Za-z0-9_-]{43}$/);
  assert.equal(exp, Math.floor(NOW / 1000) + 14 * 86400);
  const v = LT.verifyLeadToken(token, { secret: SECRET, nowMs: NOW + 13 * DAY });
  assert.deepEqual(v, { ok: true, lead_id: LEAD, exp });
});

test('signature is HMAC-SHA256 over "lead_id|exp", base64url', () => {
  const { token, exp } = LT.mintLeadToken(LEAD, { secret: SECRET, nowMs: NOW });
  const expected = crypto.createHmac('sha256', SECRET).update(`${LEAD}|${exp}`).digest('base64url');
  assert.equal(token.split('.')[3], expected);
});

test('expired after 14 days', () => {
  const { token } = LT.mintLeadToken(LEAD, { secret: SECRET, nowMs: NOW });
  assert.equal(LT.verifyLeadToken(token, { secret: SECRET, nowMs: NOW + 14 * DAY + 1000 }).reason, 'expired');
});

test('tampered lead id, tampered exp, wrong secret and garbage are all rejected', () => {
  const { token } = LT.mintLeadToken(LEAD, { secret: SECRET, nowMs: NOW });
  const [v, , exp, sig] = token.split('.');
  assert.equal(LT.verifyLeadToken(`${v}.lead_test_L02.${exp}.${sig}`, { secret: SECRET, nowMs: NOW }).reason, 'bad_signature');
  assert.equal(LT.verifyLeadToken(`${v}.${LEAD}.${Number(exp) + 86400}.${sig}`, { secret: SECRET, nowMs: NOW }).reason, 'bad_signature');
  assert.equal(LT.verifyLeadToken(token, { secret: OLD, nowMs: NOW }).reason, 'bad_signature');
  for (const bad of ['', 'abc', 'lt0.a.1.b', `lt1.${LEAD}.x.${sig}`, 'lt1.a|b.1.' + sig, 'x'.repeat(300), null, 42]) {
    assert.equal(LT.verifyLeadToken(bad, { secret: SECRET, nowMs: NOW }).ok, false, String(bad).slice(0, 20));
  }
});

test('an exp further out than the TTL is refused even with a valid signature', () => {
  const { token } = LT.mintLeadToken(LEAD, { secret: SECRET, nowMs: NOW, ttlSeconds: 90 * 86400 });
  assert.equal(LT.verifyLeadToken(token, { secret: SECRET, nowMs: NOW }).reason, 'exp_too_far');
});

test('rotation: a token minted with the previous secret verifies only while LEAD_TOKEN_SECRET_PREVIOUS is set', () => {
  const { token } = LT.mintLeadToken(LEAD, { secret: OLD, nowMs: NOW });
  assert.equal(LT.verifyLeadToken(token, { secret: SECRET, previousSecret: OLD, nowMs: NOW }).ok, true);
  assert.equal(LT.verifyLeadToken(token, { secret: SECRET, nowMs: NOW }).ok, false);
});

test('mint refuses a short secret and an unsafe lead id (no "|" or "." smuggling)', () => {
  assert.throws(() => LT.mintLeadToken(LEAD, { secret: 'short', nowMs: NOW }));
  assert.throws(() => LT.mintLeadToken('a|b', { secret: SECRET, nowMs: NOW }));
  assert.throws(() => LT.mintLeadToken('a.b', { secret: SECRET, nowMs: NOW }));
});

test('safeEqual is constant-time shaped: equal lengths compare, unequal lengths are false without throwing', () => {
  assert.equal(LT.safeEqual(Buffer.from('abc'), Buffer.from('abc')), true);
  assert.equal(LT.safeEqual(Buffer.from('abc'), Buffer.from('abd')), false);
  assert.equal(LT.safeEqual(Buffer.from('abc'), Buffer.from('abcd')), false);
  assert.equal(LT.safeEqual('abc', 'abc'), false);
});

// ---------- /slots caller switch (I-30a) ----------
test('/slots lead path: X-Lead-Token -> mode lead; broker/broker_id in the query is never returned or used', () => {
  const { token } = LT.mintLeadToken(LEAD, { secret: SECRET, nowMs: NOW });
  const r = LT.resolveSlotsCaller({ headers: { 'X-Lead-Token': token }, query: { broker: 'brk_other', broker_id: 'brk_other', date: '2026-10-15' } }, keys);
  assert.deepEqual(r, { ok: true, mode: 'lead', lead_id: LEAD, limit: 3, date: '2026-10-15' });
  assert.ok(!JSON.stringify(r).includes('brk_other'));
});

test('/slots broker path: Bearer Supabase JWT -> mode broker with user id, limit defaults to 1 and caps at 3', () => {
  const r = LT.resolveSlotsCaller({ headers: { authorization: `Bearer ${jwt(brokerClaims())}` }, query: { limit: '1' } }, keys);
  assert.deepEqual(r, { ok: true, mode: 'broker', user_id: BROKER_USER, limit: 1 });
  assert.equal(LT.resolveSlotsCaller({ headers: { authorization: `Bearer ${jwt(brokerClaims())}` }, query: { limit: '50' } }, keys).limit, 3);
});

test('/slots broker path rejects: wrong secret, alg none, expired, anon role, both credentials, none at all', () => {
  const call = (headers) => LT.resolveSlotsCaller({ headers, query: {} }, keys);
  assert.equal(call({ authorization: `Bearer ${jwt(brokerClaims(), { secret: OLD })}` }).reason, 'bad_signature');
  assert.equal(call({ authorization: `Bearer ${jwt(brokerClaims(), { alg: 'none' })}` }).reason, 'alg');
  assert.equal(call({ authorization: `Bearer ${jwt(brokerClaims({ exp: Math.floor(NOW / 1000) - 120 }))}` }).reason, 'expired');
  assert.equal(call({ authorization: `Bearer ${jwt(brokerClaims({ role: 'anon', aud: 'anon' }))}` }).reason, 'role');
  const { token } = LT.mintLeadToken(LEAD, { secret: SECRET, nowMs: NOW });
  assert.deepEqual(call({ authorization: `Bearer ${jwt(brokerClaims())}`, 'x-lead-token': token }), { ok: false, status: 400, reason: 'ambiguous_caller' });
  assert.deepEqual(call({}), { ok: false, status: 401, reason: 'no_credentials' });
});
