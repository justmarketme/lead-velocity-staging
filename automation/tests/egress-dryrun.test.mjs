// I-54c regression: no workflow node may reach WhatsApp / Messenger (graph.facebook.com .../messages), Twilio or a
// mail send (Graph sendMail, Outlook node "send", n8n whatsApp node "send") unless a DRY_RUN* gate sits on the node
// or upstream of it in the same workflow. Walks every automation/W*.json and SUB-*.json, so a new workflow is covered
// automatically. Execute Workflow -> smc-whatsapp-send is allowed: the sub-workflow gates itself (checked below).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const { senderKind, findUngated, gateSenders } = createRequire(import.meta.url)('../lib/egress-gate.cjs');

const files = fs.readdirSync(root).filter((f) => /^(W\d+|SUB-.+)\.json$/.test(f)).sort();
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

// Known gaps owned by another task. An entry must still be ungated (stale entries fail), so the list can only shrink.
const KNOWN_UNGATED = {
};

test('egress: at least the known workflows are scanned', () => {
  assert.ok(files.length >= 36, `only ${files.length} workflow files`);
  assert.ok(files.includes('SUB-whatsapp-send.json') && files.includes('W22.json'));
});

for (const f of files) {
  test(`egress: ${f} has no ungated sender`, () => {
    const bad = findUngated(load(f)).map((x) => x.name).filter((n) => !(KNOWN_UNGATED[f] || []).includes(n));
    assert.deepEqual(bad, [], `${f}: ${bad.join(' | ')} can send without a DRY_RUN_SENDS gate (route through SUB-whatsapp-send or add "Live send?")`);
  });
}

test('egress: KNOWN_UNGATED entries are still real (list can only shrink)', () => {
  for (const [f, names] of Object.entries(KNOWN_UNGATED)) {
    const ung = findUngated(load(f)).map((x) => x.name);
    for (const n of names) assert.ok(ung.includes(n), `${f} "${n}" is gated now: remove it from KNOWN_UNGATED`);
  }
});

test('egress: SUB-whatsapp-send gates its Graph POST on DRY_RUN_SENDS', () => {
  const wf = load('SUB-whatsapp-send.json');
  const src = JSON.stringify(wf.nodes);
  assert.match(src, /DRY_RUN_SENDS/);
  assert.equal(findUngated(wf).length, 0);
});

test('egress detector: finds and gates synthetic ungated senders (WhatsApp, Twilio, Graph sendMail, Outlook, whatsApp node)', () => {
  const mk = (name, type, parameters) => ({ id: name, name, type, typeVersion: 1, position: [0, 0], parameters });
  const wf = {
    nodes: [
      mk('trig', 'n8n-nodes-base.manualTrigger', {}),
      mk('wa', 'n8n-nodes-base.httpRequest', { url: "=https://graph.facebook.com/{{ $env.META_GRAPH_VERSION }}/{{ $env.PHONE_NUMBER_ID }}/messages" }),
      mk('tw', 'n8n-nodes-base.httpRequest', { url: '=https://api.twilio.com/2010-04-01/Accounts/x/Messages.json' }),
      mk('mail', 'n8n-nodes-base.httpRequest', { url: '=https://graph.microsoft.com/v1.0/users/x/sendMail' }),
      mk('ol', 'n8n-nodes-base.microsoftOutlook', { resource: 'message', operation: 'send' }),
      mk('wan', 'n8n-nodes-base.whatsApp', { operation: 'send' }),
      mk('llm', 'n8n-nodes-base.httpRequest', { url: 'https://api.anthropic.com/v1/messages' }),
      mk('after', 'n8n-nodes-base.code', {}),
    ],
    connections: { trig: { main: [['wa', 'tw', 'mail', 'ol', 'wan', 'llm'].map((node) => ({ node, type: 'main', index: 0 }))] }, wa: { main: [[{ node: 'after', type: 'main', index: 0 }]] } },
  };
  assert.deepEqual(findUngated(wf).map((x) => x.name).sort(), ['mail', 'ol', 'tw', 'wa', 'wan']);
  assert.equal(senderKind(wf.nodes[6]), null, 'Anthropic /messages is not a send');
  gateSenders(wf);
  assert.deepEqual(findUngated(wf), []);
  gateSenders(wf); // idempotent
  assert.equal(wf.nodes.length, 8 + 5 * 2);
  assert.deepEqual(wf.connections['Dry-run stub (wa)'].main[0].map((t) => t.node), ['after']);
});
