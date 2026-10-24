// Broker self-service helpers: FSP and WhatsApp normalisation (src/lib/brokerProfile.ts) and headshot sizing (src/lib/imagePrep.ts).
// Run: node --test src/lib/brokerProfile.test.mjs   (Node 22.18+/25 imports the .ts helpers directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './brokerProfile.ts';
import * as I from './imagePrep.ts';

test('FSP: digits only, 3 to 6, "FSP" prefix and spaces ignored', () => {
  assert.equal(P.normFsp('FSP 28418'), '28418');
  assert.equal(P.normFsp(' 28 418 '), '28418');
  for (const ok of ['28418', 'fsp 123', '123456']) assert.ok(P.fspValid(ok), ok);
  for (const bad of ['', '12', '1234567', '12ab', '28-418']) assert.ok(!P.fspValid(bad), bad);
});

test('WhatsApp: South African numbers to E.164', () => {
  assert.equal(P.toZaE164('083 327 8413'), '+27833278413');
  assert.equal(P.toZaE164('+27 83 327 8413'), '+27833278413');
  assert.equal(P.toZaE164('27833278413'), '+27833278413');
  assert.equal(P.toZaE164('0027833278413'), '+27833278413');
  assert.equal(P.toZaE164('(083) 327-8413'), '+27833278413');
  for (const bad of ['', '12345', '+44 7700 900123', '+270833278413', '083 327 841']) assert.equal(P.toZaE164(bad), null, bad);
  assert.equal(P.fmtZa('+27833278413'), '+27 83 327 8413');
});

test('profileErrorText: server messages pass through, permission errors become plain words', () => {
  assert.equal(P.profileErrorText({ message: 'FSP number: digits only, 3 to 6 of them' }), 'FSP number: digits only, 3 to 6 of them');
  assert.match(P.profileErrorText({ message: 'permission denied for function broker_update_profile' }), /couldn't save/);
  assert.equal(P.profileErrorText({ message: 'Preview is read-only' }), 'Preview only: nothing is saved.');
});

test('headshot sizing: long edge capped at 1600, aspect kept, never upscaled', () => {
  assert.deepEqual(I.fitWithin(4032, 3024), { width: 1600, height: 1200 });   // 12 MP phone, landscape
  assert.deepEqual(I.fitWithin(3024, 4032), { width: 1200, height: 1600 });   // portrait
  assert.deepEqual(I.fitWithin(800, 600), { width: 800, height: 600 });       // small stays small
  assert.throws(() => I.fitWithin(0, 100));
});

test('headshot type detection: HEIC by type or extension; non-images rejected', () => {
  assert.ok(I.isHeic('IMG_0001.HEIC', ''));
  assert.ok(I.isHeic('x', 'image/heif'));
  assert.ok(!I.isHeic('me.jpg', 'image/jpeg'));
  assert.ok(I.looksLikeImage('IMG_0001.HEIC', ''));      // empty type from some phones still accepted
  assert.ok(I.looksLikeImage('photo', 'image/png'));
  assert.ok(!I.looksLikeImage('cv.pdf', 'application/pdf'));
});
