// "Connect my Outlook calendar" (ms-oauth edge function + portal step). No network, no database.
// Run: node --test automation/tests/ms-oauth.test.mjs   (Node 22.18+/25: imports the .ts helper directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as L from '../../supabase/functions/ms-oauth/lib.mjs';
import * as W20 from '../lib/w20-ms.mjs';
import * as H from '../../src/lib/smcMsConnect.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SECRET = 'state-secret-0123456789-0123456789-abc';
const BROKER = '11111111-2222-4333-8444-555555555555';
const NOW = Date.parse('2026-10-07T08:00:00Z');
const CFG = { portalUrl: 'https://leadvelocity.co.za/', clientId: '00000000-0000-4000-8000-0000000000aa', nowMs: NOW };
const jwt = (o) => `x.${Buffer.from(JSON.stringify(o)).toString('base64url')}.y`;
const goodToken = (extra = {}) => ({ statusCode: 200, body: {
  refresh_token: 'RT-secret-value', access_token: 'AT', scope: 'openid profile User.Read Calendars.ReadWrite OnlineMeetings.ReadWrite offline_access',
  id_token: jwt({ tid: '9f0c1a2b-1111-4222-8333-444455556666', preferred_username: 'adviser@example.co.za', name: 'Synthetic Adviser' }), ...extra } });
const state = () => L.verifyState(L.mintState({ brokerId: BROKER, secret: SECRET, nowMs: NOW }), { secret: SECRET, nowMs: NOW });

// ---------------------------------------------------------------- state + PKCE
test('state: round-trips, binds to the broker, expires after 10 minutes, rejects tampering and W20 v1 states', () => {
  const s = L.mintState({ brokerId: BROKER, secret: SECRET, nowMs: NOW });
  assert.equal(L.verifyState(s, { secret: SECRET, nowMs: NOW }).broker_id, BROKER);
  assert.equal(L.verifyState(s, { secret: SECRET, nowMs: NOW + 601_000 }).reason, 'expired');
  const [v, , n, e, m] = s.split('.');
  assert.equal(L.verifyState([v, '99999999-2222-4333-8444-555555555555', n, e, m].join('.'), { secret: SECRET, nowMs: NOW }).reason, 'bad_signature');
  assert.equal(L.verifyState(s.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), { secret: SECRET, nowMs: NOW }).ok, false);
  const v1 = W20.mintState({ brokerId: BROKER, secret: SECRET, nowMs: NOW });
  assert.equal(L.verifyState(v1, { secret: SECRET, nowMs: NOW }).reason, 'malformed');
  assert.throws(() => L.mintState({ brokerId: BROKER, secret: 'short' }), /MS_OAUTH_STATE_SECRET/);
});
test('state: previous secret accepted during rotation', () => {
  const old = 'old-secret-0123456789-0123456789-abcdef';
  const s = L.mintState({ brokerId: BROKER, secret: old, nowMs: NOW });
  assert.equal(L.verifyState(s, { secret: SECRET, nowMs: NOW }).ok, false);
  assert.equal(L.verifyState(s, { secret: SECRET, previousSecret: old, nowMs: NOW }).ok, true);
});
test('PKCE: S256 challenge in the authorize URL matches the verifier the token exchange sends; verifier never in the URL', () => {
  const st = L.mintState({ brokerId: BROKER, secret: SECRET, nowMs: NOW });
  const redirectUri = 'https://x.supabase.co/functions/v1/ms-oauth/callback';
  const u = new URL(L.authorizeUrl({ clientId: CFG.clientId, redirectUri, state: st, secret: SECRET, nowMs: NOW }));
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('response_type'), 'code');
  const form = L.tokenForm({ clientId: CFG.clientId, clientSecret: 'cs', redirectUri, code: 'C', state: st, secret: SECRET, nowMs: NOW });
  const verifier = form.get('code_verifier');
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), u.searchParams.get('code_challenge'));
  assert.ok(!u.toString().includes(verifier));
  assert.equal(form.get('grant_type'), 'authorization_code');
});
test('scopes: delegated Calendars.ReadWrite, OnlineMeetings.ReadWrite, offline_access, User.Read; no mail, no application permissions', () => {
  for (const s of ['Calendars.ReadWrite', 'OnlineMeetings.ReadWrite', 'offline_access', 'User.Read']) assert.ok(L.SCOPES.includes(s), s);
  assert.ok(!L.SCOPES.some((s) => /^Mail|\.default$/i.test(s)));
  assert.deepEqual(L.SCOPES, W20.SCOPES, 'same scopes as W20, so W04 refresh requests stay valid');
});

// ---------------------------------------------------------------- callback plan
test('callback: good exchange -> store (token only on the store action), account + tenant captured, redirect connected', () => {
  const p = L.planCallback({ state: state(), query: { code: 'C', state: 's' }, token: goodToken(), currentStatus: null, cfg: CFG });
  assert.equal(p.action, 'store');
  assert.equal(p.refresh_token, 'RT-secret-value');
  assert.equal(p.account, 'adviser@example.co.za');
  assert.equal(p.tenant_id, '9f0c1a2b-1111-4222-8333-444455556666');
  assert.equal(p.redirect, 'https://leadvelocity.co.za/broker/calendar?calendar=connected');
  assert.ok(!JSON.stringify(L.publicPlan(p)).includes('RT-secret-value'), 'publicPlan (loggable) carries no token');
  assert.ok(!JSON.stringify(p.detail).includes('RT-secret-value') && !p.redirect.includes('RT-secret'), 'token not in detail or redirect');
});
test('callback: bad/expired state never touches the broker', () => {
  const bad = L.verifyState('v2.nonsense', { secret: SECRET, nowMs: NOW });
  const p = L.planCallback({ state: bad, query: { code: 'C' }, token: goodToken(), cfg: CFG });
  assert.equal(p.action, 'none');
  assert.match(p.redirect, /reason=link_expired/);
});
test('callback: admin consent required (AADSTS90094 / 65001) -> consent_pending with a ready admin-consent link', () => {
  for (const q of [
    { error: 'access_denied', error_description: 'AADSTS90094: The grant requires admin permission.' },
    { error: 'consent_required', error_description: 'AADSTS65001: The user or administrator has not consented' },
  ]) {
    const p = L.planCallback({ state: state(), query: q, token: null, currentStatus: 'needs_reconnect', cfg: CFG });
    assert.equal(p.action, 'status');
    assert.equal(p.status, 'consent_pending');
    assert.match(p.redirect, /error=admin_consent/);
    const u = new URL(p.detail.admin_consent_url);
    assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/organizations/v2.0/adminconsent');
    assert.equal(u.searchParams.get('client_id'), CFG.clientId);
    assert.equal(u.searchParams.get('redirect_uri'), 'https://leadvelocity.co.za/broker/calendar');
  }
  const t = L.planCallback({ state: state(), query: { code: 'C' }, token: { statusCode: 400, body: { error: 'invalid_grant', error_description: 'AADSTS65001: consent' } }, cfg: CFG });
  assert.equal(t.status, 'consent_pending');
});
test('callback: user cancels -> no change; failed RE-connect never downgrades a working calendar', () => {
  const c = L.planCallback({ state: state(), query: { error: 'access_denied', error_description: 'AADSTS65004: user declined' }, currentStatus: 'ok', cfg: CFG });
  assert.equal(c.action, 'none');
  assert.match(c.redirect, /calendar=cancelled/);
  const g = L.planCallback({ state: state(), query: { code: 'C' }, token: { statusCode: 400, body: { error: 'invalid_grant' } }, currentStatus: 'ok', cfg: CFG });
  assert.equal(g.action, 'none');
  assert.equal(g.kept_ok, true);
  const first = L.planCallback({ state: state(), query: { code: 'C' }, token: { statusCode: 400, body: { error: 'invalid_grant' } }, currentStatus: null, cfg: CFG });
  assert.equal(first.action, 'status');
  assert.equal(first.status, 'error');
});
test('callback: missing refresh token or missing required scope is an error, not a connection', () => {
  const noRt = goodToken(); delete noRt.body.refresh_token;
  assert.equal(L.planCallback({ state: state(), query: { code: 'C' }, token: noRt, cfg: CFG }).detail.reason, 'no_refresh_token');
  const lessScope = L.planCallback({ state: state(), query: { code: 'C' }, token: goodToken({ scope: 'openid User.Read offline_access Calendars.ReadWrite' }), cfg: CFG });
  assert.equal(lessScope.action, 'status');
  assert.equal(lessScope.detail.reason, 'scope_missing');
  assert.ok(!('refresh_token' in lessScope));
});
test('callback: bad client secret raises the app-credentials alert', () => {
  const p = L.planCallback({ state: state(), query: { code: 'C' }, token: { statusCode: 401, body: { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret' } }, cfg: CFG });
  assert.equal(p.alert, true);
  assert.equal(p.detail.reason, 'app_credentials');
});
test('error classification stays in step with W20 (same table, no drift)', () => {
  const cases = [
    { error: 'access_denied', error_description: 'AADSTS90094: x' }, { error: 'access_denied' }, { error: 'x', error_description: 'AADSTS65004: declined' },
    { error: 'invalid_client' }, { error: 'invalid_grant' }, { error: 'server_error', error_description: 'AADSTS50000' },
    { error: 'invalid_request', error_description: 'Need admin approval' }, { error: 'consent_required' },
  ];
  for (const c of cases) assert.deepEqual(L.mapError(c), W20.mapError(c), JSON.stringify(c));
  assert.deepEqual(L.CONSENT_CODES, W20.CONSENT_CODES);
});

// ---------------------------------------------------------------- W20 hand-off + token handling
test('calendar.connected event is signed with INTERNAL_HMAC_SECRET exactly as W20 verifies it', () => {
  const e = L.connectedEvent({ brokerId: BROKER, tokenRef: `ms_refresh_${BROKER}_1`, secret: 'internal-secret', nowMs: NOW });
  assert.equal(e.signature, `sha256=${createHmac('sha256', 'internal-secret').update(e.raw).digest('hex')}`);
  const ev = JSON.parse(e.raw);
  assert.equal(ev.type, 'calendar.connected');
  assert.equal(ev.broker_id, BROKER);
  assert.ok(!e.raw.includes('RT-secret'));
});
test('edge function source: token reaches only the Vault RPC; never selected, returned, or logged', () => {
  const src = readFileSync(join(ROOT, 'supabase/functions/ms-oauth/index.ts'), 'utf8');
  assert.ok(src.includes('smc_vault_store_ms_refresh'));
  assert.ok(!/from\("brokers"\)\.(update|upsert|insert)/.test(src), 'never writes the brokers row directly');
  assert.ok(!/console\.\w+\([^)]*refresh_token/.test(src), 'never logs the token');
  assert.ok(!/json\(\d+,\s*\{[^}]*refresh_token/.test(src), 'never returns the token');
  assert.ok(!/decrypted_secret|smc_vault_ms_refresh\b/.test(src), 'the callback never reads a token back');
  assert.ok(!/VITE_/.test(src), 'secrets are function env, never VITE_');
});
test('migration: service_role can run the vault wrappers; disconnect deletes the Vault secret', () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261007180000_smc_18_ms_oauth_edge.sql'), 'utf8');
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.smc_vault_store_ms_refresh[\s\S]*TO service_role/);
  assert.match(sql, /DELETE FROM vault\.secrets/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.smc_ms_disconnect\(uuid\) FROM PUBLIC, anon, authenticated/);
});
test('W04/W05 still read the stored token the edge function writes (same vault RPC and status gate)', () => {
  const m13 = readFileSync(join(ROOT, 'supabase/migrations/20261002130000_smc_13_pass7.sql'), 'utf8');
  assert.match(m13, /smc_vault_ms_refresh[\s\S]*calendar_status = 'ok'/);
  assert.ok(readFileSync(join(ROOT, 'automation/build-w04-w05.mjs'), 'utf8').includes('smc_vault_ms_refresh'));
});

// ---------------------------------------------------------------- onboarding step state (portal helper)
const row = (o = {}) => ({ calendar_status: null, calendar_mode: null, calendar_status_detail: null, onboarding_progress: {}, ...o });
test('step view: not connected -> blocked -> verifying -> done "Connected as"', () => {
  assert.deepEqual(H.calendarStepView(row()), { state: 'not_connected' });
  assert.deepEqual(H.calendarStepView(row({ calendar_status: 'blocked_admin_consent' })), { state: 'admin_blocked' });
  assert.deepEqual(H.calendarStepView(row({ calendar_status: 'needs_reconnect' })), { state: 'needs_reconnect' });
  const detail = { account: 'adviser@example.co.za' };
  assert.deepEqual(H.calendarStepView(row({ calendar_status: 'ok', calendar_status_detail: detail })), { state: 'verifying', account: 'adviser@example.co.za' });
  assert.deepEqual(H.calendarStepView(row({ calendar_status: 'ok', calendar_status_detail: detail, onboarding_progress: { calendar: { status: 'done' } } })),
    { state: 'done', account: 'adviser@example.co.za', shared: false });
});
test('step view: disconnect clears the account and the step cannot show done without a connection', () => {
  assert.equal(H.connectedAs(row({ calendar_status: 'needs_reconnect', calendar_status_detail: { account: 'mark@x.co.za' } })), null);
  assert.deepEqual(H.calendarStepView(row({ calendar_status: 'needs_reconnect', onboarding_progress: { calendar: { status: 'done' } } })), { state: 'needs_reconnect' });
  assert.equal(H.connectedAs(row({ calendar_status: 'ok', calendar_status_detail: { account: 'not-an-email' } })), null);
});
test('step view: shared calendar fallback counts once the step is done', () => {
  assert.deepEqual(H.calendarStepView(row({ calendar_mode: 'shared_fallback', onboarding_progress: { calendar: { status: 'done' } } })), { state: 'done', account: null, shared: true });
});
test('callback banners and the IT-admin note', () => {
  assert.equal(H.callbackNotice('?calendar=connected').tone, 'ok');
  assert.equal(H.callbackNotice('?calendar=cancelled').tone, 'info');
  assert.equal(H.callbackNotice('?error=admin_consent'), null);
  assert.match(H.callbackNotice('?error=calendar&reason=link_expired').text, /expired/);
  assert.equal(H.callbackNotice(''), null);
  const note = H.adminConsentNote({ brokerName: 'Synthetic Adviser', consentUrl: 'https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=abc' });
  assert.ok(note.includes('adminconsent?client_id=abc') && note.includes('Synthetic Adviser'));
  assert.ok(!note.includes('\n'), 'one paragraph');
  assert.match(note, /cannot read my email/);
  assert.equal(H.msUrl('https://evil.example/https://login.microsoftonline.com/'), '');
  assert.ok(H.msUrl('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?x=1'));
});
