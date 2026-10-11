// Portal-side helpers of "Connect my Outlook calendar" (src/lib/smcMsConnect.ts): card state incl. the brand gate,
// granted permissions, safe Teams links and the return-to-page after Microsoft sign-in.
// Run: node --test src/lib/smcMsConnect.portal.test.mjs   (Node 22.18+/25 imports the .ts helper directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './smcMsConnect.ts';

test('outlookCardView: no brand_id means no SortMyCover order, whatever the calendar columns say', () => {
  assert.deepEqual(H.outlookCardView({ brand_id: null, calendar_status: 'ok', calendar_mode: null }), { state: 'no_smc' });
  assert.deepEqual(H.outlookCardView({ calendar_status: null, calendar_mode: null }), { state: 'no_smc' });
});

test('outlookCardView: status vocabulary', () => {
  const b = { brand_id: 'smc' };
  assert.deepEqual(H.outlookCardView({ ...b, calendar_status: null, calendar_mode: null }), { state: 'not_connected' });
  assert.deepEqual(H.outlookCardView({ ...b, calendar_status: 'needs_reconnect', calendar_mode: 'oauth' }), { state: 'needs_reconnect' });
  assert.deepEqual(H.outlookCardView({ ...b, calendar_status: 'blocked_admin_consent', calendar_mode: null }), { state: 'admin_blocked' });
  assert.deepEqual(H.outlookCardView({ ...b, calendar_status: 'ok', calendar_mode: 'shared_fallback' }), { state: 'shared' });
  assert.deepEqual(H.outlookCardView({ ...b, calendar_status: 'ok', calendar_mode: 'oauth', calendar_status_detail: { account: 'mark@firm.co.za' } }),
    { state: 'connected', account: 'mark@firm.co.za' });
});

test('grantedScopes + permissionRows: column and callback detail, case-insensitive', () => {
  const s = H.grantedScopes({ calendar_scopes: 'Calendars.ReadWrite offline_access', calendar_status_detail: { scopes: ['onlinemeetings.readwrite', 'User.Read'] } });
  assert.deepEqual(s.sort(), ['Calendars.ReadWrite', 'User.Read', 'offline_access', 'onlinemeetings.readwrite'].sort());
  assert.deepEqual(H.permissionRows(s).map((r) => r.granted), [true, true, true]);
  assert.deepEqual(H.permissionRows(['Calendars.ReadWrite']).map((r) => [r.key, r.granted]), [['freebusy', true], ['events', true], ['teams', false]]);
  assert.deepEqual(H.grantedScopes({}), []);
});

test('safeJoinUrl: only https links survive', () => {
  assert.equal(H.safeJoinUrl('https://teams.microsoft.com/l/meetup-join/19%3a'), 'https://teams.microsoft.com/l/meetup-join/19%3a');
  assert.equal(H.safeJoinUrl('javascript:alert(1)'), '');
  assert.equal(H.safeJoinUrl('http://teams.microsoft.com/x'), '');
  assert.equal(H.safeJoinUrl('https://x.y/"onmouseover=1'), '');
  assert.equal(H.safeJoinUrl(null), '');
});

test('isPortalReturnPath: portal pages only, never the calendar route or another origin', () => {
  assert.equal(H.isPortalReturnPath('/broker-elite?tab=calendar'), true);
  assert.equal(H.isPortalReturnPath('/broker/dashboard'), true);
  assert.equal(H.isPortalReturnPath('/broker/calendar'), false);
  assert.equal(H.isPortalReturnPath('/broker/calendar?x=1'), false);
  assert.equal(H.isPortalReturnPath('//evil.example/broker'), false);
  assert.equal(H.isPortalReturnPath('https://evil.example/broker'), false);
  assert.equal(H.isPortalReturnPath('/admin'), false);
});

test('withCallbackParams keeps the page query and adds only the result params', () => {
  assert.equal(H.withCallbackParams('/broker-elite?tab=calendar', '?calendar=connected&code=SECRET'), '/broker-elite?tab=calendar&calendar=connected');
  assert.equal(H.withCallbackParams('/broker/dashboard', '?error=calendar&reason=link_expired'), '/broker/dashboard?error=calendar&reason=link_expired');
  assert.equal(H.withCallbackParams('/broker/dashboard', ''), '/broker/dashboard');
});
