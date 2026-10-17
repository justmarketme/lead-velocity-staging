// I-48j: community escalations stay amber, so no reply or signal text may promise a timed human response.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const TIME_RX = /\b\d+\s*(min|minute|hour)s?\b/i;
const ESC_SECTIONS = ['complaint_ack', 'private_complaint', 'private_sensitive_human_template', 'dm_handoff'];

function corpusSections() {
  const out = [];
  const parts = rd('../../community/reply-corpus.md').split(/^#### /m).slice(1);
  for (const p of parts) {
    const head = p.split('\n')[0].trim();
    const key = head.split('|')[0].trim();
    if (ESC_SECTIONS.includes(key)) out.push({ head, body: p });
  }
  return out;
}

test('escalation reply corpus has no time-bound promise', () => {
  const secs = corpusSections();
  assert.ok(secs.length >= 8, 'found escalation sections');
  for (const s of secs) {
    assert.doesNotMatch(s.body, TIME_RX, s.head);
    assert.doesNotMatch(s.body, /\bwithin\b|\bbinne\b/i, s.head);
  }
});

for (const [name, file] of [['W30', '../../automation/W30.json'], ['W31', '../../automation/W31.json']]) {
  test(`${name} community_escalation signal is amber with no time-bound text`, () => {
    const wf = JSON.parse(rd(file));
    const nodes = wf.nodes.filter((n) => n.parameters && typeof n.parameters.jsCode === 'string' && n.parameters.jsCode.includes("signal_key: 'community_escalation'"));
    assert.ok(nodes.length >= 1, 'signal node found');
    for (const n of nodes) {
      const code = n.parameters.jsCode;
      assert.match(code, /signal_key: 'community_escalation'[^]*?severity: 'amber'/);
      assert.doesNotMatch(code, /severity: 'red'/);
      const what = code.match(/what: ('(?:[^'\\]|\\.)*'(?:\s*\+\s*(?:'(?:[^'\\]|\\.)*'|[\w.$()[\]]+))*)/);
      assert.ok(what, 'what text found');
      assert.doesNotMatch(what[1], TIME_RX);
      assert.doesNotMatch(what[1], /\bwithin\b/i);
      assert.match(what[1], /person from the team needs to follow up/);
    }
  });
}
