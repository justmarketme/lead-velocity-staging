// Password-reset helpers (src/lib/passwordReset.ts).
// Run: node --test src/lib/passwordReset.test.mjs   (Node 22.18+/25 imports the .ts helpers directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from './passwordReset.ts';

const client = (result, calls = []) => ({
  auth: {
    async resetPasswordForEmail(email, opts) {
      calls.push({ email, opts });
      if (result instanceof Error) throw result;
      return { error: result };
    },
  },
});

test('redirect is always the production origin, never localhost or a preview host', () => {
  assert.equal(R.resetRedirectUrl('http://localhost:8080'), 'https://leadvelocity.co.za/reset-password');
  assert.equal(R.resetRedirectUrl('https://lead-velocity-git-x.vercel.app'), 'https://leadvelocity.co.za/reset-password');
  assert.equal(R.resetRedirectUrl('https://evil.example'), 'https://leadvelocity.co.za/reset-password');
  assert.equal(R.resetRedirectUrl(undefined), 'https://leadvelocity.co.za/reset-password');
  assert.equal(R.resetRedirectUrl('https://leadvelocity.co.za/'), 'https://leadvelocity.co.za/reset-password');
  assert.equal(R.resetRedirectUrl('https://www.leadvelocity.co.za'), 'https://www.leadvelocity.co.za/reset-password');
});

test('request: normalises the address, pins redirectTo, reports "sent"', async () => {
  R.resetCooldownForTests();
  const calls = [];
  const out = await R.requestPasswordReset(client(null, calls), '  Broker@Example.COM ', 'http://localhost:5173', 1000);
  assert.equal(out, 'sent');
  assert.deepEqual(calls, [{ email: 'broker@example.com', opts: { redirectTo: 'https://leadvelocity.co.za/reset-password' } }]);
});

test('request: invalid email never reaches Supabase', async () => {
  R.resetCooldownForTests();
  const calls = [];
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'x'.repeat(260) + '@a.com']) {
    assert.equal(await R.requestPasswordReset(client(null, calls), bad, null), 'invalid_email');
  }
  assert.equal(calls.length, 0);
});

test('no enumeration: unknown user, provider error and network failure all read as "sent"', async () => {
  for (const result of [
    { message: 'User not found', status: 400, code: 'user_not_found' },
    { message: 'Error sending recovery email', status: 500, code: 'unexpected_failure' },
    new Error('fetch failed'),
  ]) {
    R.resetCooldownForTests();
    assert.equal(await R.requestPasswordReset(client(result), 'ghost@example.com', null), 'sent');
  }
});

test('rate limit from Supabase is surfaced; the address is not logged', async () => {
  R.resetCooldownForTests();
  const logged = [];
  const orig = console.warn; console.warn = (...a) => logged.push(a.join(' '));
  try {
    assert.equal(await R.requestPasswordReset(client({ status: 429, code: 'over_email_send_rate_limit' }), 'a@b.co', null), 'rate_limited');
    R.resetCooldownForTests();
    await R.requestPasswordReset(client({ status: 500, code: 'unexpected_failure', message: 'boom for a@b.co' }), 'a@b.co', null);
  } finally { console.warn = orig; }
  assert.ok(logged.every((l) => !l.includes('a@b.co')), logged.join('|'));
});

test('cooldown: a second request for the same address within 60s is blocked client-side', async () => {
  R.resetCooldownForTests();
  const calls = [];
  assert.equal(await R.requestPasswordReset(client(null, calls), 'a@b.co', null, 10_000), 'sent');
  assert.equal(await R.requestPasswordReset(client(null, calls), 'A@B.co', null, 30_000), 'rate_limited');
  assert.equal(R.cooldownRemaining('a@b.co', 30_000), 40);
  assert.equal(await R.requestPasswordReset(client(null, calls), 'other@b.co', null, 30_000), 'sent');
  assert.equal(await R.requestPasswordReset(client(null, calls), 'a@b.co', null, 70_001), 'sent');
  assert.equal(calls.length, 3);
});

test('new password: length, confirmation, bcrypt ceiling', () => {
  assert.equal(R.validateNewPassword('short', 'short'), 'Password must be at least 8 characters');
  assert.equal(R.validateNewPassword('longenough1', 'different1'), 'Passwords do not match');
  assert.match(R.validateNewPassword('a'.repeat(73), 'a'.repeat(73)), /72/);
  assert.equal(R.validateNewPassword('longenough1', 'longenough1'), null);
});

test('strength meter', () => {
  assert.equal(R.passwordStrength(''), 0);
  assert.equal(R.passwordStrength('abc'), 1);
  assert.equal(R.passwordStrength('abcdefgh'), 2);
  assert.equal(R.passwordStrength('Abcdefgh1'), 3);
  assert.equal(R.passwordStrength('Abcdefgh1234!'), 4);
});

test('recovery params: error beats token; expired link recognised in hash and query', () => {
  assert.deepEqual(R.parseRecoveryParams('', '#error=access_denied&error_code=otp_expired&error_description=x'), { kind: 'error', code: 'otp_expired' });
  assert.deepEqual(R.parseRecoveryParams('?error=access_denied', ''), { kind: 'error', code: 'access_denied' });
  assert.deepEqual(R.parseRecoveryParams('?token_hash=abc&type=recovery', ''), { kind: 'token_hash', tokenHash: 'abc' });
  assert.deepEqual(R.parseRecoveryParams('?token_hash=abc', ''), { kind: 'token_hash', tokenHash: 'abc' });
  assert.deepEqual(R.parseRecoveryParams('?token_hash=abc&type=signup', ''), { kind: 'none' });
  assert.deepEqual(R.parseRecoveryParams('?code=pkce123', ''), { kind: 'code', code: 'pkce123' });
  assert.deepEqual(R.parseRecoveryParams('', '#access_token=t&type=recovery'), { kind: 'none' });
  assert.deepEqual(R.parseRecoveryParams('', ''), { kind: 'none' });
});

test('verifyOtp failures: rejected token is final, transient failures are retryable', () => {
  assert.equal(R.verifyFailureIsFinal({ code: 'otp_expired', status: 403 }), true);
  assert.equal(R.verifyFailureIsFinal({ status: 400 }), true);
  assert.equal(R.verifyFailureIsFinal({ status: 429 }), false);
  assert.equal(R.verifyFailureIsFinal({ status: 500 }), false);
  assert.equal(R.verifyFailureIsFinal({ status: 0 }), false);
  assert.equal(R.verifyFailureIsFinal({}), false);
});

test('after reset: admins to the dashboard, brokers to their portal', () => {
  assert.equal(R.postResetDestination(true, 'premium'), '/dashboard');
  assert.equal(R.postResetDestination(false, 'premium'), '/broker-elite');
  assert.equal(R.postResetDestination(false, 'marketing'), '/broker-elite');
  assert.equal(R.postResetDestination(false, 'standard'), '/broker');
  assert.equal(R.postResetDestination(false, null), '/broker');
});
