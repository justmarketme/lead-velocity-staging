// Change requests + approved-item locks (src/lib/changeRequests.ts).
// Run: node --test src/lib/changeRequests.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from './changeRequests.ts';

test('readChangeRequests: newest first, malformed dropped', () => {
  const p = { change_requests: [
    { id: 'a', item: 'bio', message: 'Fix typo', status: 'open', at: '2026-10-13T10:00:00Z' },
    { id: 'b', item: 'intro_card', message: 'New photo', status: 'resolved', at: '2026-10-13T12:00:00Z', resolved_at: '2026-10-13T13:00:00Z', unlock: true },
    { id: 'c', item: 'nope', message: 'x', status: 'open', at: '2026-10-13T11:00:00Z' },
    { item: 'bio', status: 'open' },
    'junk',
  ] };
  const rs = C.readChangeRequests(p);
  assert.deepEqual(rs.map((r) => r.id), ['b', 'a']);
  assert.equal(rs[0].unlock, true);
  assert.deepEqual(C.openRequests(p).map((r) => r.id), ['a']);
  assert.deepEqual(C.openRequests(p, 'intro_card'), []);
  assert.deepEqual(C.readChangeRequests(null), []);
  assert.deepEqual(C.readChangeRequests({ change_requests: {} }), []);
});

test('locks: card approved locks bio + headshot; accepted bio review locks bio; unlocked_at frees', () => {
  assert.equal(C.cardLocked({}), false);
  assert.equal(C.bioLocked({}), false);
  assert.equal(C.cardLocked({ card: { status: 'done', approved_at: '2026-10-13T10:00:00Z' } }), true);
  assert.equal(C.bioLocked({ card: { status: 'done', approved_at: '2026-10-13T10:00:00Z' } }), true);
  assert.equal(C.cardLocked({ card: { status: 'done', approved_at: 'x', unlocked_at: 'y' } }), false);
  assert.equal(C.bioLocked({ bio_review: { status: 'accepted' } }), true);
  assert.equal(C.bioLocked({ bio_review: { status: 'accepted', unlocked_at: '2026-10-14T00:00:00Z' } }), false);
  assert.equal(C.bioLocked({ bio_review: { status: 'changes_suggested' } }), false);
  assert.equal(C.bioLocked({ bio_review: { status: 'accepted', unlocked_at: 'y' }, card: { approved_at: 'x' } }), true);
});

test('changeMessage', () => {
  assert.equal(C.changeMessage(' Use my new surname ', ''), 'Use my new surname');
  assert.equal(C.changeMessage('Photo', ' older one was better '), 'Photo\n\nNote: older one was better');
  assert.equal(C.changeMessage('x'.repeat(2000), '').length, 1000);
});
