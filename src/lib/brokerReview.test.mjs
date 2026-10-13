// Lead Velocity review helpers for the broker portal (src/lib/brokerReview.ts).
// Run: node --test src/lib/brokerReview.test.mjs   (Node 22.18+/25 imports the .ts helpers directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from './brokerReview.ts';

const MARK_CHECK = {
  status: 'verified', checked_by: 'Lead Velocity', checked_at: '2026-10-13T15:51:39Z',
  register_name: 'ORACLE BROKER SERVICES (PTY) LTD', register_status: 'Authorized', representative: 'MARK WESTON',
  products_checked: true, advice: true, intermediary: true, under_supervision: false, categories_count: 14,
  covers: ['life cover', 'disability', 'severe illness', 'income protection'], audit_table: 'broker_compliance_checks',
};
const ORIGINAL = 'With 26 years experience, I help families to secure the lives of their loved ones, saving money and focusing on structuring their retirement, both before and at retirement.';
const SUGGESTED = "With 26 years' experience, I help families protect the people they love and plan for retirement, before and at retirement.";

test('FSP badge: verified check → title with SAST date, register name and Authorised', () => {
  assert.deepEqual(R.fspVerifiedBadge(MARK_CHECK), {
    title: 'Verified by Lead Velocity on the FSCA register · 13 Oct 2026',
    detail: 'ORACLE BROKER SERVICES (PTY) LTD · Authorised',
    products: 'Authorised for advice and intermediary services · 14 product categories, including life cover, disability, severe illness and income protection',
  });
  // 23:30 UTC is already the next day in South Africa
  assert.equal(R.fmtDaySast('2026-10-13T23:30:00Z'), '14 Oct 2026');
  assert.equal(R.fmtDaySast('nonsense'), '');
  assert.equal(R.fspVerifiedBadge({ status: 'verified' }, '2026-01-05T08:00:00Z').title, 'Verified by Lead Velocity on the FSCA register · 05 Jan 2026');
});

test('FSP products line: only when products were checked; wording follows the flags', () => {
  assert.equal(R.fspProductsText({ ...MARK_CHECK, products_checked: false }), '');
  assert.equal(R.fspProductsText({ status: 'verified' }), '');
  assert.equal(R.fspProductsText({ products_checked: true, advice: true, intermediary: false, categories_count: 1, covers: ['life cover'] }),
    'Authorised for advice · 1 product category, including life cover');
  assert.equal(R.fspProductsText({ products_checked: true, intermediary: true, under_supervision: true, categories_count: 3 }),
    'Authorised for intermediary services (under supervision) · 3 product categories');
  assert.equal(R.fspVerifiedBadge({ status: 'verified', register_name: 'X' }).products, '');
});

test('FSP badge: any other status keeps the old behaviour (null)', () => {
  for (const c of [null, undefined, {}, { status: 'blocked' }, { status: 'pending_manual' }, { status: 'checking' }]) assert.equal(R.fspVerifiedBadge(c), null);
  assert.equal(R.registerStatusText('Suspended'), 'Suspended');
});

const review = (status, extra = {}) => ({ bio_review: { status, original: ORIGINAL, suggested: SUGGESTED, reason: "We can't include promises", suggested_at: '2026-10-13T16:00:00Z', decided_at: null, ...extra } });

test('bio review: open suggestion blocks the card and shows the suggestion', () => {
  const r = R.readBioReview(review('changes_suggested'));
  assert.equal(r.status, 'changes_suggested');
  assert.ok(R.bioBlocked(r, ORIGINAL));
  assert.ok(R.bioBlocked(r, `  ${ORIGINAL.replace(/ /g, '  ')} `), 'whitespace differences do not unblock');
  assert.equal(R.bioReviewView(r, ORIGINAL), 'suggestion');
});

test('bio review: accepted → approved note while the suggested bio is live, never blocked', () => {
  const r = R.readBioReview(review('accepted', { decided_at: '2026-10-14T08:00:00Z' }));
  assert.ok(!R.bioBlocked(r, SUGGESTED));
  assert.equal(R.bioReviewView(r, SUGGESTED), 'approved');
  assert.equal(R.bioReviewView(r, 'A later bio he wrote himself, long enough to pass.'), null);
});

test('bio review: declined stays blocked until he saves a different bio', () => {
  const r = R.readBioReview(review('declined', { decided_at: '2026-10-14T08:00:00Z' }));
  assert.ok(R.bioBlocked(r, ORIGINAL));
  assert.equal(R.bioReviewView(r, ORIGINAL), 'rewrite');
  const mine = 'I help families in Pretoria look after the people they love and plan calmly for retirement.';
  assert.ok(!R.bioBlocked(r, mine));
  assert.equal(R.bioReviewView(r, mine), null);
});

test('bio review: absent or malformed → nothing', () => {
  for (const p of [null, undefined, {}, { bio_review: null }, { bio_review: 'x' }, { bio_review: { status: 'weird' } }]) {
    assert.equal(R.readBioReview(p), null);
  }
  assert.ok(!R.bioBlocked(null, ORIGINAL));
  assert.equal(R.bioReviewView(null, ORIGINAL), null);
});

test('intro card: approvable only once the bio review is accepted (or there is none)', () => {
  assert.ok(R.cardApprovable(null));
  assert.ok(R.cardApprovable(R.readBioReview(review('accepted'))));
  assert.ok(!R.cardApprovable(R.readBioReview(review('changes_suggested'))));
  assert.ok(!R.cardApprovable(R.readBioReview(review('declined'))));
});
