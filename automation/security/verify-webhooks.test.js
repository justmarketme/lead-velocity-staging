'use strict';
// Offline tests: node --test automation/security/  (no network, synthetic secrets generated per run)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const path = require('node:path');
const VW = require('./verify-webhooks.js');
const { redact, redactString } = require('./redact.js');

const rnd = () => crypto.randomBytes(24).toString('hex'); // synthetic secrets only, never real values
const META_SECRET = rnd();
const PAYSTACK_SECRET = rnd();
const TWILIO_TOKEN = rnd();

const metaBody = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA1', changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.ABC', timestamp: '1790000000' }] } }] }],
});
const metaSig = 'sha256=' + crypto.createHmac('sha256', META_SECRET).update(metaBody).digest('hex');

test('Meta: valid X-Hub-Signature-256 passes (string and Buffer bodies)', () => {
  assert.equal(VW.verifyMetaSignature(metaBody, metaSig, META_SECRET).ok, true);
  assert.equal(VW.verifyMetaSignature(Buffer.from(metaBody), metaSig, META_SECRET).ok, true);
  assert.equal(VW.verifyMetaSignature(metaBody, metaSig.toUpperCase().replace('SHA256=', 'sha256='), META_SECRET).ok, true);
});

test('Meta: tampered body, wrong secret, missing/malformed header, parsed body all fail', () => {
  assert.equal(VW.verifyMetaSignature(metaBody + ' ', metaSig, META_SECRET).reason, 'signature_mismatch');
  assert.equal(VW.verifyMetaSignature(metaBody, metaSig, rnd()).reason, 'signature_mismatch');
  assert.equal(VW.verifyMetaSignature(metaBody, undefined, META_SECRET).reason, 'missing_or_malformed_signature');
  assert.equal(VW.verifyMetaSignature(metaBody, 'sha1=abc', META_SECRET).reason, 'missing_or_malformed_signature');
  assert.equal(VW.verifyMetaSignature(metaBody, 'sha256=zz', META_SECRET).reason, 'missing_or_malformed_signature');
  assert.equal(VW.verifyMetaSignature(JSON.parse(metaBody), metaSig, META_SECRET).reason, 'raw_body_required');
  assert.equal(VW.verifyMetaSignature(metaBody, metaSig, '').reason, 'missing_secret');
});

test('Meta: verify-token handshake', () => {
  const token = rnd();
  const ok = VW.metaVerifyHandshake({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '1158201444' }, token);
  assert.deepEqual([ok.ok, ok.status, ok.body], [true, 200, '1158201444']);
  const nested = VW.metaVerifyHandshake({ hub: { mode: 'subscribe', verify_token: token, challenge: 'abc' } }, token);
  assert.equal(nested.status, 200);
  assert.equal(VW.metaVerifyHandshake({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' }, token).status, 403);
  assert.equal(VW.metaVerifyHandshake({ 'hub.mode': 'unsubscribe', 'hub.verify_token': token, 'hub.challenge': '1' }, token).status, 403);
  assert.equal(VW.metaVerifyHandshake({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '<script>' }, token).status, 400);
  assert.equal(VW.metaVerifyHandshake({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '1' }, '').status, 403);
});

test('Paystack: x-paystack-signature HMAC-SHA512', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { id: 302961, reference: 'SMC-TEST-1', amount: 100 } });
  const sig = crypto.createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex');
  assert.equal(VW.verifyPaystackSignature(body, sig, PAYSTACK_SECRET).ok, true);
  assert.equal(VW.verifyPaystackSignature(body.replace('100', '999'), sig, PAYSTACK_SECRET).reason, 'signature_mismatch');
  assert.equal(VW.verifyPaystackSignature(body, sig.slice(0, 64), PAYSTACK_SECRET).reason, 'missing_or_malformed_signature');
  assert.equal(VW.verifyPaystackSignature(body, undefined, PAYSTACK_SECRET).reason, 'missing_or_malformed_signature');
  assert.equal(VW.verifyPaystackSignature({}, sig, PAYSTACK_SECRET).reason, 'raw_body_required');
});

function twilioSign(url, params) {
  return crypto.createHmac('sha1', TWILIO_TOKEN).update(Buffer.from(VW.twilioSignedString(url, params), 'utf8')).digest('base64');
}

test('Twilio: form-encoded callback signature (sorted params, port variants, arrays)', () => {
  const url = 'https://api.example.test/webhook/twilio/status?x=1';
  const params = { MessageStatus: 'delivered', MessageSid: 'SM' + 'a'.repeat(32), To: '+27820000000' };
  const sig = twilioSign(url, params);
  assert.equal(VW.verifyTwilioSignature({ url, params, signatureHeader: sig, authToken: TWILIO_TOKEN }).ok, true);
  // reordered keys still verify
  const reordered = { To: params.To, MessageSid: params.MessageSid, MessageStatus: params.MessageStatus };
  assert.equal(VW.verifyTwilioSignature({ url, params: reordered, signatureHeader: sig, authToken: TWILIO_TOKEN }).ok, true);
  // signed with :443, received without
  const sigPort = twilioSign('https://api.example.test:443/webhook/twilio/status?x=1', params);
  assert.equal(VW.verifyTwilioSignature({ url, params, signatureHeader: sigPort, authToken: TWILIO_TOKEN }).ok, true);
  // tampered param
  assert.equal(VW.verifyTwilioSignature({ url, params: { ...params, MessageStatus: 'failed' }, signatureHeader: sig, authToken: TWILIO_TOKEN }).reason, 'signature_mismatch');
  // arrays
  const arr = { Digits: '1', Tags: ['b', 'a'] };
  assert.equal(VW.verifyTwilioSignature({ url, params: arr, signatureHeader: twilioSign(url, arr), authToken: TWILIO_TOKEN }).ok, true);
  assert.equal(VW.verifyTwilioSignature({ url, params, signatureHeader: sig, authToken: '' }).reason, 'missing_secret');
  assert.equal(VW.verifyTwilioSignature({ url: 'ftp://x', params, signatureHeader: sig, authToken: TWILIO_TOKEN }).reason, 'bad_url');
});

test('Twilio: JSON body with bodySHA256', () => {
  const body = JSON.stringify({ CallSid: 'CA' + 'b'.repeat(32), CallStatus: 'completed' });
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const url = `https://api.example.test/webhook/twilio/voice?bodySHA256=${hash}`;
  const sig = twilioSign(url, null);
  assert.equal(VW.verifyTwilioSignature({ url, rawBody: body, signatureHeader: sig, authToken: TWILIO_TOKEN }).ok, true);
  assert.equal(VW.verifyTwilioSignature({ url, rawBody: body + 'x', signatureHeader: sig, authToken: TWILIO_TOKEN }).reason, 'body_hash_mismatch');
  assert.equal(VW.verifyTwilioSignature({ url, signatureHeader: sig, authToken: TWILIO_TOKEN }).reason, 'raw_body_required');
});

test('Replay window', () => {
  const now = Date.UTC(2026, 9, 2, 10, 0, 0);
  assert.equal(VW.checkReplayWindow(Math.floor(now / 1000) - 10, { nowMs: now }).ok, true);
  assert.equal(VW.checkReplayWindow(now - 10_000, { nowMs: now }).ok, true); // ms
  assert.equal(VW.checkReplayWindow(String(Math.floor(now / 1000) - 299), { nowMs: now }).ok, true);
  assert.equal(VW.checkReplayWindow(Math.floor(now / 1000) - 301, { nowMs: now }).reason, 'outside_replay_window');
  assert.equal(VW.checkReplayWindow(Math.floor(now / 1000) + 120, { nowMs: now }).reason, 'timestamp_in_future');
  assert.equal(VW.checkReplayWindow(new Date(now - 1000).toISOString(), { nowMs: now }).ok, true);
  assert.equal(VW.checkReplayWindow('yesterday', { nowMs: now }).reason, 'bad_timestamp');
  assert.equal(VW.checkReplayWindow(Math.floor(now / 1000) - 3000, { nowMs: now, toleranceSec: 3600 }).ok, true);
});

test('Idempotency: keys, event-id extraction, store with TTL', () => {
  assert.equal(VW.idempotencyKey('Paystack', 'charge.success:1'), 'paystack:charge.success:1');
  assert.equal(VW.idempotencyKey('meta', ''), null);
  assert.deepEqual(VW.extractEventIds('whatsapp', JSON.parse(metaBody)), ['msg:wamid.ABC']);
  assert.deepEqual(VW.extractEventIds('meta', { entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '444' } }] }] }), ['leadgen:444']);
  assert.deepEqual(VW.extractEventIds('meta', { entry: [{ changes: [{ field: 'statuses', value: { statuses: [{ id: 'w1', status: 'read' }] } }] }] }), ['status:w1:read']);
  assert.deepEqual(VW.extractEventIds('paystack', { event: 'charge.success', data: { id: 9 } }), ['charge.success:9']);
  assert.deepEqual(VW.extractEventIds('twilio', { CallSid: 'CA1', CallStatus: 'busy' }), ['CA1:busy']);
  const fallback = VW.extractEventIds('meta', {}, '{"x":1}');
  assert.match(fallback[0], /^sha256:[0-9a-f]{64}$/);
  let t = 0;
  const backing = {};
  const store = VW.createIdempotencyStore({ ttlMs: 1000, backing, now: () => t });
  assert.equal(store.seen('k1'), false);
  assert.equal(store.seen('k1'), true);
  t = 2000;
  assert.equal(store.seen('k1'), false, 'expired keys are forgotten');
  assert.equal(Object.keys(backing).length, 1, 'state lives in the backing object (n8n static data)');
  assert.match(VW.WEBHOOK_EVENTS_INSERT_SQL, /ON CONFLICT \(source, external_id\) DO NOTHING/);
});

test('timingSafeEqualStr', () => {
  assert.equal(VW.timingSafeEqualStr('abc', 'abc'), true);
  assert.equal(VW.timingSafeEqualStr('abc', 'abd'), false);
  assert.equal(VW.timingSafeEqualStr('abc', 'abcd'), false);
  assert.equal(VW.timingSafeEqualStr(undefined, 'a'), false);
  assert.equal(VW.headerValue({ 'X-Hub-Signature-256': ['v'] }, 'x-hub-signature-256'), 'v');
});

test('Redaction masks emails, phones, SA IDs and secret keys', () => {
  const out = redact({
    text: 'Lerato lerato.m@gmail.com +27 82 123 4567 / 0821234567 ID 8001015009087',
    headers: { authorization: 'Bearer x', 'x-hub-signature-256': 'sha256=...' },
    nested: [{ phone: '+27821234567' }],
    count: 5,
    ad_id: '120211234567890123',
  });
  assert.doesNotMatch(out.text, /lerato\.m@gmail\.com/);
  assert.match(out.text, /l\*\*\*@g\*\*\*\.com/);
  assert.doesNotMatch(out.text, /123 4567|0821234567|8001015009087/);
  assert.match(out.text, /\[id-redacted\]/);
  assert.equal(out.headers.authorization, '[secret]');
  assert.equal(out.headers['x-hub-signature-256'], '[secret]');
  assert.equal(out.nested[0].phone, '+********567');
  assert.equal(out.count, 5);
  assert.equal(out.ad_id, '120211234567890123', 'platform ids are not phones');
  assert.equal(redactString('booking at 10:00 on 2026-10-07'), 'booking at 10:00 on 2026-10-07');
});

test('Inlined n8n Code-node bundle evaluates and verifies the same as the module', async () => {
  const { inlineAll } = await import(path.join(__dirname, 'inline-for-n8n.mjs'));
  const code = inlineAll() + '\n;({ VW, RD });';
  const ctx = vm.createContext({ require, Buffer, URL });
  const { VW: V2, RD } = vm.runInContext(code, ctx);
  assert.equal(V2.verifyMetaSignature(metaBody, metaSig, META_SECRET).ok, true);
  assert.equal(V2.verifyMetaSignature(metaBody, metaSig, rnd()).ok, false);
  assert.equal(typeof RD.redact, 'function');
});
