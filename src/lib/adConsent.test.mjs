// Ad consent + per-ad approval helpers for the broker portal (src/lib/adConsent.ts).
// Run: node --test src/lib/adConsent.test.mjs   (Node 22.18+/25 imports the .ts helpers directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from './adConsent.ts';

test('readAdConsent: granted / withdrawn / absent / malformed', () => {
  assert.deepEqual(A.readAdConsent({ ad_consent: { status: 'granted', at: '2026-10-13T16:42:00Z', wording_version: 'ADS-LIKENESS-v2' } }),
    { status: 'granted', at: '2026-10-13T16:42:00Z', wording_version: 'ADS-LIKENESS-v2' });
  assert.equal(A.readAdConsent({ ad_consent: { status: 'withdrawn' } }).status, 'withdrawn');
  assert.equal(A.readAdConsent(null), null);
  assert.equal(A.readAdConsent({}), null);
  assert.equal(A.readAdConsent({ ad_consent: { status: 'maybe' } }), null);
  assert.equal(A.readAdConsent({ ad_consent: 'granted' }), null);
  assert.equal(A.adConsentGranted({ ad_consent: { status: 'granted' } }), true);
  assert.equal(A.adConsentGranted({ ad_consent: { status: 'withdrawn' } }), false);
});

test('fmtDayTimeSast: SAST (UTC+2), next day after 22:00 UTC', () => {
  assert.equal(A.fmtDayTimeSast('2026-10-13T16:42:05Z'), '13 Oct 2026, 18:42');
  assert.equal(A.fmtDayTimeSast('2026-10-13T22:30:00Z'), '14 Oct 2026, 00:30');
  assert.equal(A.fmtDayTimeSast('2026-10-13T16:42:05.123456+00:00'), '13 Oct 2026, 18:42');
  assert.equal(A.fmtDayTimeSast('nope'), '');
  assert.equal(A.fmtDayTimeSast(null), '');
});

test('admin line', () => {
  assert.deepEqual(A.adConsentAdminText(null), { text: 'Ad consent: not given', granted: false });
  assert.deepEqual(A.adConsentAdminText({ ad_consent: { status: 'granted', at: '2026-10-13T16:42:00Z', wording_version: 'ADS-LIKENESS-v2' } }),
    { text: 'Ad consent: granted on 13 Oct 2026, 18:42 (ADS-LIKENESS-v2)', granted: true });
  assert.deepEqual(A.adConsentAdminText({ ad_consent: { status: 'withdrawn', at: '2026-10-14T08:00:00Z' } }),
    { text: 'Ad consent: withdrawn on 14 Oct 2026, 10:00', granted: false });
});

test('splitAds: waiting, approved, declined hidden, processing hidden', () => {
  const base = { version: 1, url: 'x', thumbnail_url: null, script_text: null, is_current: false, approved_at: null, created_at: '2026-10-13T00:00:00Z', ai_check: null };
  const rows = [
    { ...base, id: 'ready', state: 'ready' },
    { ...base, id: 'ok', state: 'approved', is_current: true, approved_at: '2026-10-13T10:00:00Z' },
    { ...base, id: 'declined', state: 'rejected', ai_check: { broker_decision: 'declined' } },
    { ...base, id: 'pulled', state: 'rejected', ai_check: { broker_decision: 'consent_withdrawn' } },
    { ...base, id: 'proc', state: 'processing' },
    { ...base, id: 'nourl', state: 'ready', url: null },
  ];
  const s = A.splitAds(rows);
  assert.deepEqual(s.waiting.map((r) => r.id), ['ready', 'pulled']);
  assert.deepEqual(s.approved.map((r) => r.id), ['ok']);
  assert.deepEqual(A.splitAds(null), { waiting: [], approved: [] });
});

test('wording and version are identical in the portal and the migration (what the audit row stores)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261013190000_broker_ad_consent_and_approval.sql', import.meta.url), 'utf8');
  const lit = (name) => {
    const m = sql.match(new RegExp(`${name}\\s+constant text := '((?:[^']|'')*)';`));
    assert.ok(m, `constant ${name} in the migration`);
    return m[1].replace(/''/g, "'");
  };
  assert.equal(lit('c_version'), A.AD_CONSENT_VERSION);
  assert.equal(lit('c_body'), A.AD_CONSENT_BODY);
  assert.equal(lit('c_checkbox'), A.AD_CONSENT_CHECKBOX);
  assert.equal(A.AD_CONSENT_VERSION, 'ADS-LIKENESS-v2');
});
