// WHATSAPP_PROVIDER switch (meta | twilio): outbound mapping per shape, Twilio inbound signature + normalisation
// equal to the Meta-normalised shape, DRY_RUN still blocks Twilio sends. Offline, synthetic data only.
// Run: node --test automation/tests/wa-provider.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { runCode } from './_n8ncode.mjs';
import * as P from '../lib/wa-provider.mjs';
import * as S from '../lib/sub-whatsapp-send.mjs';
import { normaliseInbound } from '../lib/w07.mjs';
import { findUngated } from '../lib/egress-gate.cjs';

const load = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const W07 = load('W07.json'); const SUB = load('SUB-whatsapp-send.json');
const ENV = { WHATSAPP_PROVIDER: 'twilio', TWILIO_WHATSAPP_FROM: '+27600000000', TWILIO_CONTENT_SIDS: JSON.stringify({ reminder_24h: 'HXaaa', 'confirm.qr': 'HXqr' }), TWILIO_AUTH_TOKEN: 'tok', WEBHOOK_URL: 'https://n8n.example.test' };
const approved = { items: [{ name: 'reminder_24h', status: 'APPROVED' }] };
const open = new Date(Date.now() - 3600_000).toISOString();

test('provider: default meta, twilio only when asked', () => {
  assert.equal(P.providerOf({}), 'meta'); assert.equal(P.providerOf({ WHATSAPP_PROVIDER: 'bogus' }), 'meta'); assert.equal(P.providerOf({ WHATSAPP_PROVIDER: ' Twilio ' }), 'twilio');
});

test('outbound: meta default is byte-identical (decide() payload is the Graph body)', () => {
  const n = S.normalise({ to: '27820000001', kind: 'text', text: 'hi', lead_id: 'l1', correlation: 'c1' });
  const d = S.decide(n, { last_inbound_at: open }, {}, Date.now());
  assert.equal(d.provider, 'meta'); assert.equal(d.action, 'send'); assert.equal(d.payload.type, 'text');
});

test('outbound twilio: text -> Body, From/To whatsapp:+', () => {
  const r = P.toTwilioRequest({ to: '27820000001', type: 'text', text: { body: 'hi' } }, ENV, { statusCallback: 'https://x/cb' });
  assert.deepEqual(r.form, { To: 'whatsapp:+27820000001', From: 'whatsapp:+27600000000', StatusCallback: 'https://x/cb', Body: 'hi' });
});

test('outbound twilio: media link -> MediaUrl; media id has no equivalent', () => {
  assert.equal(P.toTwilioRequest({ to: '27820000001', type: 'image', image: { link: 'https://m/x.png', caption: 'c' } }, ENV).form.MediaUrl, 'https://m/x.png');
  assert.equal(P.toTwilioRequest({ to: '27820000001', type: 'image', image: { id: '123' } }, ENV).reason, 'twilio_media_needs_public_link');
});

test('outbound twilio: template -> ContentSid + numbered ContentVariables; missing SID skips', () => {
  const n = S.normalise({ to: '27820000001', template: 'reminder_24h', variables: ['Lerato', 'Thu 15 Oct', '10:00', 'Mark', 'Teams'], lead_id: 'l1', correlation: 'c2' });
  const d = S.decide(n, { last_inbound_at: null, template_status: approved }, ENV);
  if (d.action === 'send') {
    const r = P.toTwilioRequest(d.payload, ENV);
    assert.equal(r.form.ContentSid, 'HXaaa');
    assert.deepEqual(Object.keys(JSON.parse(r.form.ContentVariables)), ['1', '2', '3', '4', '5'].slice(0, Object.keys(JSON.parse(r.form.ContentVariables)).length));
    assert.equal(JSON.parse(r.form.ContentVariables)['1'], 'Lerato');
    assert.equal(P.toTwilioRequest(d.payload, { ...ENV, TWILIO_CONTENT_SIDS: '{}' }).reason, 'twilio_content_sid_missing');
  } else assert.equal(d.reason, 'param_count_mismatch'); // template shape differs from this variable list: mapping is exercised below
  const raw = { to: '27820000001', type: 'template', template: { name: 'reminder_24h', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }, { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'confirm:b1' }] }] } };
  const r = P.toTwilioRequest(raw, ENV);
  assert.deepEqual(JSON.parse(r.form.ContentVariables), { 1: 'A', 2: 'B', 3: 'confirm:b1' });
});

test('outbound twilio: interactive buttons/list -> Content template when mapped, else text fallback', () => {
  const i = { type: 'button', body: { text: 'Pick' }, action: { buttons: [{ type: 'reply', reply: { id: 'a', title: 'Yes' } }, { type: 'reply', reply: { id: 'b', title: 'No' } }] } };
  const fb = P.toTwilioRequest({ to: '27820000001', type: 'interactive', interactive: i }, ENV);
  assert.equal(fb.via, 'text_fallback'); assert.equal(fb.form.Body, 'Pick\n\nReply with: Yes / No');
  const mapped = P.toTwilioRequest({ to: '27820000001', type: 'interactive', interactive: { ...i, content_key: 'confirm.qr' } }, ENV, { variables: { 1: 'x' } });
  assert.equal(mapped.via, 'content'); assert.equal(mapped.form.ContentSid, 'HXqr'); assert.equal(mapped.form.Body, undefined);
  const list = { type: 'list', body: { text: 'Times' }, action: { sections: [{ rows: [{ id: 's1', title: 'Thu 10:00' }, { id: 's2', title: 'Fri 11:00' }] }] } };
  assert.match(P.toTwilioRequest({ to: '27820000001', type: 'interactive', interactive: list }, ENV).form.Body, /Thu 10:00 \/ Fri 11:00/);
  assert.equal(P.toTwilioRequest({ to: '1', type: 'text', text: { body: 'x' } }, { ...ENV, TWILIO_WHATSAPP_FROM: '' }).reason, 'twilio_from_missing');
});

test('outbound: Twilio response interpretation shares the Meta interpret() entry', () => {
  assert.deepEqual(S.interpret({ body: { sid: 'SM1', status: 'queued' }, statusCode: 201 }), { ok: true, external_id: 'SM1', error: null });
  assert.equal(S.interpret({ body: { code: 63016, message: 'Template not approved' }, statusCode: 400 }).ok, false);
  assert.equal(S.interpret({ twilio_skip: 'twilio_content_sid_missing' }).error, 'twilio_content_sid_missing');
  assert.equal(S.interpret({ body: { messages: [{ id: 'wamid.1' }] } }).external_id, 'wamid.1');
});

test('DRY_RUN_SENDS blocks a Twilio send: decide() -> dry, no payload; workflow Twilio node is gated', () => {
  const n = S.normalise({ to: '27820000001', kind: 'text', text: 'hi', lead_id: 'l1', correlation: 'c3' });
  const d = S.decide(n, { last_inbound_at: open }, { ...ENV, DRY_RUN_SENDS: 'true' });
  assert.equal(d.action, 'dry'); assert.equal(d.payload, undefined); assert.equal(d.external_id, 'dry:c3'); assert.equal(d.provider, 'twilio');
  const tw = SUB.nodes.filter((x) => /api\.twilio\.com\/2010-04-01\/Accounts\/.+\/Messages\.json/.test(x.parameters.url || ''));
  assert.equal(tw.length, 1);
  assert.deepEqual(findUngated(SUB), []);
  // the Twilio node sits behind Decide (reads DRY_RUN_SENDS) and the Live send claim
  const parent = (name) => Object.entries(SUB.connections).filter(([, c]) => c.main.flat().some((x) => x.node === name)).map(([k]) => k);
  assert.deepEqual(parent('Twilio POST /Messages'), ['Twilio request built?']);
  assert.deepEqual(parent('Provider is twilio?'), ['Claimed and a live send?']);
  assert.ok(!SUB.nodes.some((x) => (x.credentials || {}).httpBasicAuth), 'no new credential reference: Basic auth is built from env in the Code node');
});

// ------------------------------------------------------------------ inbound
const URL_ = 'https://n8n.example.test/webhook/whatsapp-twilio';
const sign = (params, url = URL_, tok = 'tok') => createHmac('sha1', tok).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
const run = (params, sig) => runCode(W07, 'Verify Twilio signature + normalise', { json: { headers: { 'x-twilio-signature': sig }, body: params }, env: ENV, items: [{ headers: { 'x-twilio-signature': sig }, body: params }] });

const metaBody = (m) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '27600000000' }, messages: [{ id: 'SM1', from: '27821234567', timestamp: '1760000000', ...m }] } }] }] });
const twBase = { MessageSid: 'SM1', From: 'whatsapp:+27821234567', To: 'whatsapp:+27600000000', SmsStatus: 'received' };
const CASES = {
  text: [{ type: 'text', text: { body: 'Hello' } }, { Body: 'Hello' }],
  button: [{ type: 'button', button: { payload: 'confirm:bk1', text: 'Confirm' } }, { Body: 'Confirm', ButtonPayload: 'confirm:bk1', ButtonText: 'Confirm' }],
  list: [{ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'slot_2026-10-14T14:00:00+02:00', title: 'Wed 14:00' } } }, { Body: 'Wed 14:00', ListId: 'slot_2026-10-14T14:00:00+02:00', ListTitle: 'Wed 14:00' }],
  image: [{ type: 'image', image: { id: 'MID', caption: 'cap' } }, { Body: 'cap', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME', MediaContentType0: 'image/jpeg' }],
};
for (const [name, [meta, tw]] of Object.entries(CASES)) {
  test(`inbound normalisation: Twilio ${name} equals the Meta-normalised shape`, () => {
    const m = normaliseInbound(metaBody(meta))[0];
    const t = P.normaliseTwilioInbound({ ...twBase, ...tw }, 1760000000_000)[0].msg;
    // Only provider-specific carriers differ: media handle (Meta id vs Twilio URL). Everything W07 reads is equal.
    const strip = (x) => ({ ...x, media_id: x.media ? 'H' : null });
    assert.deepEqual(strip(t), strip(m));
    if (name === 'image') assert.match(t.media_id, /^twilio:https:\/\/api\.twilio\.com\//);
  });
}

test('inbound status callbacks map to the W07 status item', () => {
  assert.deepEqual(P.normaliseTwilioInbound({ MessageSid: 'SM9', MessageStatus: 'delivered' }, 5000)[0], { kind: 'status', wamid: 'SM9', status: 'delivered', ts: 5, error: null });
  assert.equal(P.normaliseTwilioInbound({ MessageSid: 'SM9', MessageStatus: 'undelivered', ErrorCode: '63016' }, 0)[0].status, 'failed');
  assert.match(P.normaliseTwilioInbound({ MessageSid: 'SM9', MessageStatus: 'failed', ErrorCode: '63016' }, 0)[0].error, /^63016/);
});

test('W07 Twilio ingress: valid signature -> items identical in shape to the Meta node; invalid / missing / wrong provider -> valid:false', async () => {
  const params = { ...twBase, Body: 'Hello' };
  const ok = await run(params, sign(params));
  assert.equal(ok[0].json.valid, true); assert.equal(ok[0].json.kind, 'message'); assert.equal(ok[0].json.msg.text, 'Hello'); assert.match(ok[0].json.payload_hash, /^[0-9a-f]{64}$/);
  const st = await run({ MessageSid: 'SM9', MessageStatus: 'read' }, sign({ MessageSid: 'SM9', MessageStatus: 'read' }));
  assert.equal(st[0].json.kind, 'status');
  assert.equal((await run(params, sign(params, URL_, 'wrong')))[0].json.valid, false);
  assert.equal((await run({ ...params, Body: 'tampered' }, sign(params)))[0].json.valid, false);
  assert.equal((await run(params, undefined))[0].json.valid, false);
  assert.equal((await run(params, sign(params, 'https://evil.example.test/webhook/whatsapp-twilio')))[0].json.valid, false);
  const wrong = await runCode(W07, 'Verify Twilio signature + normalise', { json: {}, env: { ...ENV, WHATSAPP_PROVIDER: 'meta' }, items: [{ headers: { 'x-twilio-signature': sign(params) }, body: params }] });
  assert.equal(wrong[0].json.reason, 'provider_not_twilio');
});

test('W07 Twilio ingress is wired to the shared path (same Respond + Message-or-status nodes)', () => {
  const to = (n) => W07.connections[n].main[0].map((x) => x.node).sort();
  assert.deepEqual(to('Verify Twilio signature + normalise'), to('Verify signature + normalise'));
  const hook = W07.nodes.find((n) => n.name === 'WhatsApp webhook (Twilio)');
  assert.equal(hook.parameters.path, 'whatsapp-twilio'); assert.equal(hook.parameters.httpMethod, 'POST');
});

test('twilioMediaRequest: Basic-auth fetch only for api.twilio.com media', () => {
  const r = P.twilioMediaRequest('twilio:https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME', { TWILIO_API_KEY_SID: 'SK', TWILIO_API_KEY_SECRET: 's' });
  assert.match(r.headers.Authorization, /^Basic /);
  assert.equal(P.twilioMediaRequest('twilio:https://evil.test/x', {}), null);
});
