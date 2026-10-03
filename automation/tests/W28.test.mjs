// W28 Booking Flow endpoint (not core-path; authored by automation-engineer). Not on the launch path (0.3 #3).
// Run: node --test automation/tests/W28.test.mjs   (Node 18+, offline, synthetic fixtures, keys generated per run)
// Logic: automation/flows/w28-endpoint.js + flow-crypto.js + security/lead-token.js. Slots: the W04 reference engine (_slots.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, publicEncrypt, randomBytes, createCipheriv, createDecipheriv, constants } from 'node:crypto';
import { FIX, broker, lead, ms, iso, H, D } from './_harness.mjs';
import { generateSlots, unavailableDates, dayView, offerSlots } from './_slots.mjs';

const require = createRequire(import.meta.url);
const EP = require('../flows/w28-endpoint.js');
const FC = require('../flows/flow-crypto.js');
const LT = require('../security/lead-token.js');
const WF = JSON.parse(readFileSync(new URL('../W28.json', import.meta.url), 'utf8'));

const SECRET = randomBytes(32).toString('hex');
const NOW = ms(FIX._meta.base_clock); // Mon 2026-10-12 08:00 SAST
const MARK = broker();
const L = lead('L02');
const LEAD_ROW = { id: L.lead_id, email: null, opted_out_at: null, brand_id: 'smc', broker_id: MARK.broker_id, phone: '+27600000002' };
const engine = (b, busy = b.calendar_busy, bookings = []) => generateSlots(b, busy, bookings, NOW);

function deps({ kind = 'book', bookingId = null, busy, bookings = [], lead: leadRow = LEAD_ROW, flowErrors = 0, mx = ['mx.example'], booking = null, suggested = null } = {}) {
  const token = LT.mintFlowToken(leadRow.id, kind, bookingId, { secret: SECRET, nowMs: NOW });
  return {
    token,
    d: {
      verifyToken: (t) => LT.verifyFlowToken(t, { secret: SECRET, nowMs: NOW }),
      loadContext: async () => ({ lead: leadRow, broker: MARK, booking, flow_errors: flowErrors, email_suggested_for: suggested }),
      slots: async (b) => engine(b, busy === undefined ? b.calendar_busy : busy, bookings),
      now: NOW,
      resolveMx: async (dom) => (dom.endsWith('.invalid') ? [] : mx),
      disposable: new Set(['mailinator.com']),
      hash: (s) => createHash('sha256').update(s.toLowerCase()).digest('hex'),
    },
  };
}
const ids = { broker_id: MARK.broker_id, lead_id: L.lead_id };

test('ping answers {status: active} without a token', async () => {
  const r = await EP.handle({ version: '3.0', action: 'ping' }, deps().d);
  assert.deepEqual(r.response, { data: { status: 'active' } });
});

test('envelope: RSA-OAEP(SHA-256) + AES-128-GCM request decrypts; response uses the flipped IV; wrong key -> 421', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const aes = randomBytes(16);
  const iv = randomBytes(16);
  const c = createCipheriv('aes-128-gcm', aes, iv);
  const payload = { version: '3.0', action: 'ping' };
  const enc = Buffer.concat([c.update(JSON.stringify(payload)), c.final(), c.getAuthTag()]);
  const body = {
    encrypted_aes_key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aes).toString('base64'),
    encrypted_flow_data: enc.toString('base64'),
    initial_vector: iv.toString('base64'),
  };
  const dec = FC.decryptRequest(body, pem);
  assert.deepEqual(dec.decryptedBody, payload);
  const out = Buffer.from(FC.encryptResponse({ data: { status: 'active' } }, dec.aesKeyBuffer, dec.initialVectorBuffer), 'base64');
  const flipped = Buffer.from(iv.map((b) => ~b & 0xff));
  const dc = createDecipheriv('aes-128-gcm', aes, flipped);
  dc.setAuthTag(out.subarray(-16));
  assert.deepEqual(JSON.parse(Buffer.concat([dc.update(out.subarray(0, -16)), dc.final()]).toString()), { data: { status: 'active' } });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => FC.decryptRequest(body, other), (e) => e.statusCode === 421);
});

test('I-34g envelope hardening: tampered tag, SHA-1 key wrap, 12-byte IV, missing fields, long round-trip', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const mk = (payload, { iv = randomBytes(16), hash = 'sha256', aes = randomBytes(16) } = {}) => {
    const c = createCipheriv('aes-128-gcm', aes, iv);
    const enc = Buffer.concat([c.update(JSON.stringify(payload)), c.final(), c.getAuthTag()]);
    return { aes, iv, enc, body: { encrypted_aes_key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: hash }, aes).toString('base64'), encrypted_flow_data: enc.toString('base64'), initial_vector: iv.toString('base64') } };
  };
  const big = { version: '3.0', action: 'data_exchange', screen: 'SLOTS', data: { day: '2026-10-12', note: 'Ünïcode \u2713 '.repeat(200) }, flow_token: 't'.repeat(120) };
  const a = mk(big, { iv: randomBytes(12) });
  const dec = FC.decryptRequest(a.body, pem);
  assert.deepEqual(dec.decryptedBody, big);
  const resp = { screen: 'SUCCESS', data: { ok: true } };
  const out = Buffer.from(FC.encryptResponse(resp, dec.aesKeyBuffer, dec.initialVectorBuffer), 'base64');
  const dc = createDecipheriv('aes-128-gcm', a.aes, Buffer.from(a.iv.map((b) => ~b & 0xff))); dc.setAuthTag(out.subarray(-16));
  assert.deepEqual(JSON.parse(Buffer.concat([dc.update(out.subarray(0, -16)), dc.final()]).toString()), resp);
  const t = mk({ action: 'ping' }); const bad = Buffer.from(t.enc); bad[bad.length - 1] ^= 1;
  assert.throws(() => FC.decryptRequest({ ...t.body, encrypted_flow_data: bad.toString('base64') }, pem), (e) => e.statusCode === 421, 'tampered tag');
  assert.throws(() => FC.decryptRequest(mk({ action: 'ping' }, { hash: 'sha1' }).body, pem), (e) => e.statusCode === 421, 'SHA-1 OAEP is not what Meta sends');
  assert.throws(() => FC.decryptRequest({ ...t.body, initial_vector: undefined }, pem), (e) => e.statusCode === 421);
  assert.throws(() => FC.decryptRequest(null, pem), (e) => e.statusCode === 421);
});

test('INIT: METHOD screen with only the broker\'s methods, calendar bounds from the W04 engine, flow_opened logged (I-22)', async () => {
  const { token, d } = deps();
  const r = await EP.handle({ version: '3.0', action: 'INIT', flow_token: token }, d);
  assert.equal(r.response.screen, 'METHOD');
  const x = r.response.data;
  assert.deepEqual(x.methods.map((m) => m.id), ['teams', 'whatsapp_call', 'phone']);
  assert.ok(!x.methods.some((m) => m.id === 'google_meet'), 'Meet hidden for Outlook brokers');
  assert.equal(x.min_date, '2026-10-12');
  assert.equal(x.max_date, '2026-10-26');
  assert.deepEqual(x.include_days, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const ref = unavailableDates(MARK, engine(MARK).slots, NOW).filter((dt) => dt >= x.min_date && dt <= x.max_date);
  assert.deepEqual(x.unavailable_dates, ref);
  assert.equal(x.heading, 'How would you like to meet Mark?');
  assert.ok(r.effects.some((e) => e.kind === 'activity' && e.activity_type === 'flow_opened' && e.payload.flow_token === token));
});

test('date_selected: that day\'s slots (<= 20), ids are ISO +02:00, identical to the W04 day view', async () => {
  const { token, d } = deps();
  const r = await EP.handle({ version: '3.0', action: 'data_exchange', flow_token: token, screen: 'DATE', data: { ...ids, action_type: 'date_selected', date: '2026-10-14', method: 'teams' } }, d);
  assert.equal(r.response.screen, 'SLOTS');
  const want = dayView(engine(MARK).slots, '2026-10-14').map((s) => s.start);
  assert.deepEqual(r.response.data.slots.map((s) => s.id), want);
  assert.ok(want.length > 0 && want.length <= 20);
  assert.match(r.response.data.date_label, /^Wednesday 14 October \(South African time\)$/);
});

test('slot_selected: call methods go straight to SUMMARY with no email; Teams asks for the invite email', async () => {
  const { token, d } = deps();
  const slot = dayView(engine(MARK).slots, '2026-10-14')[0].start;
  const phone = await EP.handle({ version: '3.0', action: 'data_exchange', flow_token: token, data: { ...ids, action_type: 'slot_selected', method: 'phone', date: '2026-10-14', slot } }, d);
  assert.equal(phone.response.screen, 'SUMMARY');
  assert.equal(phone.response.data.email, '');
  assert.match(phone.response.data.summary_text, /Mark will call your mobile/);
  const teams = await EP.handle({ version: '3.0', action: 'data_exchange', flow_token: token, data: { ...ids, action_type: 'slot_selected', method: 'teams', date: '2026-10-14', slot } }, d);
  assert.equal(teams.response.screen, 'EMAIL');
  assert.equal(teams.response.data.prompt, 'Where should we send the Teams invite?');
});

test('slot_selected re-checks fresh: a slot taken since it was shown returns the next 3 with an error', async () => {
  const slot = dayView(engine(MARK).slots, '2026-10-14')[0];
  const { token, d } = deps({ bookings: [{ start: slot.start, end: slot.end, status: 'booked' }] });
  const r = await EP.handle({ version: '3.0', action: 'data_exchange', flow_token: token, data: { ...ids, action_type: 'slot_selected', method: 'phone', date: '2026-10-14', slot: slot.start } }, d);
  assert.equal(r.response.screen, 'SLOTS');
  assert.equal(r.response.data.show_error, true);
  assert.equal(r.response.data.slots.length, 3);
  assert.ok(r.response.data.slots.every((s) => s.id > slot.start));
});

test('email_entered: typo suggestion once, then accepted; no MX and disposable rejected; valid -> SUMMARY + store (meeting_invite)', async () => {
  const slot = '2026-10-14T10:00:00+02:00';
  const ask = async (email, opts) => { const { token, d } = deps(opts); return EP.handle({ version: '3.0', action: 'data_exchange', flow_token: token, data: { ...ids, action_type: 'email_entered', method: 'teams', date: '2026-10-14', slot, email } }, d); };
  const t1 = await ask('lerato.m@gmial.com');
  assert.equal(t1.response.screen, 'EMAIL');
  assert.equal(t1.response.data.show_suggestion, true);
  assert.equal(t1.response.data.init_email, 'lerato.m@gmail.com');
  assert.ok(t1.effects.some((e) => e.activity_type === 'flow_email_suggested'));
  const typedHash = createHash('sha256').update('lerato.m@gmial.com').digest('hex');
  const t2 = await ask('lerato.m@gmial.com', { suggested: typedHash });
  assert.equal(t2.response.screen, 'SUMMARY', 'second submit of the same address is accepted');
  assert.equal((await ask('a@nowhere.invalid')).response.data.show_error, true);
  assert.equal((await ask('a@mailinator.com')).response.data.show_error, true);
  assert.equal((await ask('not-an-email')).response.data.show_error, true);
  const ok = await ask('howzit+lerato.test@leadvelocity.co.za');
  assert.equal(ok.response.screen, 'SUMMARY');
  assert.deepEqual(ok.effects.find((e) => e.kind === 'store_email'), { kind: 'store_email', lead_id: L.lead_id, email: 'howzit+lerato.test@leadvelocity.co.za', email_status: 'mx_ok', email_purpose: 'meeting_invite' });
});

test('trust the token, not the payload: broker/lead mismatch -> error + list fallback + security event; forged token refused', async () => {
  const { token, d } = deps();
  const r = await EP.handle({ version: '3.0', action: 'data_exchange', flow_token: token, data: { ...ids, broker_id: 'brk_other', action_type: 'date_selected', date: '2026-10-14', method: 'phone' } }, d);
  assert.ok(r.response.data.error_message);
  assert.ok(r.effects.some((e) => e.kind === 'security_event' && e.reason === 'flow_payload_mismatch'));
  assert.ok(r.effects.some((e) => e.kind === 'send_list'));
  const forged = token.replace(L.lead_id, 'lead_test_L01');
  const f = await EP.handle({ version: '3.0', action: 'INIT', flow_token: forged }, d);
  assert.ok(f.response.data.error_message);
  assert.ok(f.effects.some((e) => e.reason === 'flow_token_bad_signature'));
});

test('fallback ladder: second error on a token -> 10-slot list; calendar down -> show_error + list; opted-out lead -> no Flow', async () => {
  const one = deps({ flowErrors: 0 });
  const e1 = await EP.handle({ version: '3.0', action: 'error', flow_token: one.token, data: { error: 'x' } }, one.d);
  assert.deepEqual(e1.response, { data: { acknowledged: true } });
  assert.ok(!e1.effects.some((e) => e.kind === 'send_list'));
  const two = deps({ flowErrors: 1 });
  const e2 = await EP.handle({ version: '3.0', action: 'error', flow_token: two.token, data: { error: 'x' } }, two.d);
  assert.ok(e2.effects.some((e) => e.kind === 'send_list' && e.reason === 'two_flow_errors'));
  const down = deps({ busy: null });
  const c = await EP.handle({ version: '3.0', action: 'data_exchange', flow_token: down.token, data: { ...ids, action_type: 'date_selected', date: '2026-10-14', method: 'phone' } }, down.d);
  assert.equal(c.response.data.show_error, true);
  assert.ok(c.effects.some((e) => e.kind === 'send_list' && e.reason === 'calendar_unavailable'));
  const gone = deps({ lead: { ...LEAD_ROW, opted_out_at: iso(NOW - H) } });
  const g = await EP.handle({ version: '3.0', action: 'INIT', flow_token: gone.token }, gone.d);
  assert.ok(g.response.data.error_message);
});

test('10-slot list (launch path): <= 10 rows, spread across days earliest-first, titles fit 24 chars, ids carry the ISO start', async () => {
  const slots = engine(MARK).slots;
  const { LINES: LN } = await import('../../conversation/lines.mjs');
  const body = EP.listFallback(MARK, slots, offerSlots, '+27600000002', { lines: LN });
  const rows = body.interactive.action.sections[0].rows;
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((r) => r.id.slice(5)), offerSlots(slots, 10).map((s) => s.start));
  assert.ok(rows.every((r) => r.title.length <= 24 && /^slot_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+02:00$/.test(r.id)));
  assert.equal(new Set(rows.slice(0, 3).map((r) => r.id.slice(5, 15))).size, 3, 'first three rows on three different days');
  assert.ok(body.interactive.action.button.length <= 20);
  assert.equal(body.to, '27600000002');
});

test('reschedule INIT pre-fills the current booking; booking id must match the token', async () => {
  const booking = { id: 'bk_test_L03', method: 'teams', start: '2026-10-15T10:00:00+02:00' };
  const { token, d } = deps({ kind: 'reschedule', bookingId: booking.id, booking });
  const r = await EP.handle({ version: '3.0', action: 'INIT', flow_token: token }, d);
  assert.equal(r.response.data.booking_id, booking.id);
  assert.equal(r.response.data.current_method, 'teams');
  assert.equal(r.response.data.current_booking_text, 'Now booked: Thu 15 Oct, 10:00, Microsoft Teams video call');
  const bad = await EP.handle({ version: '3.0', action: 'data_exchange', flow_token: token, data: { ...ids, booking_id: 'bk_other', action_type: 'date_selected', date: '2026-10-14', method: 'teams' } }, d);
  assert.ok(bad.effects.some((e) => e.reason === 'flow_payload_mismatch'));
});

test('W28.json: inactive, settings block, credentials by name, no secrets, connections resolve, inlined modules current, ping before token work', () => {
  assert.equal(WF.active, false);
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  assert.equal(WF.settings.errorWorkflow, 'smc-w22', 'n8n reads errorWorkflow as a workflow id (I-44b)');
  const names = new Set(WF.nodes.map((n) => n.name));
  for (const [from, c] of Object.entries(WF.connections)) { assert.ok(names.has(from), from); for (const out of c.main) for (const l of out) assert.ok(names.has(l.node), l.node); }
  for (const n of WF.nodes) for (const cred of Object.values(n.credentials || {})) assert.equal(cred.id, '');
  const raw = JSON.stringify(WF);
  assert.doesNotMatch(raw, /EAA[A-Za-z0-9]{20,}|-----BEGIN|sk_live/);
  for (const e of ['META_APP_SECRET', 'FLOW_PRIVATE_KEY', 'LEAD_TOKEN_SECRET']) assert.match(raw, new RegExp(`\\$env\\.${e}`));
  for (const [f, label] of [['../flows/w28-endpoint.js', 'w28-endpoint.js'], ['../flows/flow-crypto.js', 'flow-crypto.js'], ['../security/lead-token.js', 'lead-token.js']]) {
    const sha = createHash('sha256').update(readFileSync(new URL(f, import.meta.url), 'utf8')).digest('hex').slice(0, 12);
    assert.ok(raw.includes(`${label} sha256:${sha}`), `${label} inlined and current`);
  }
  assert.ok(WF.connections['Status?'].main[0].some((l) => l.node === 'Respond ping (encrypted)'));
});

// ---------- I-39k: one message, never two (delegate lines travel inside W28's own lead-facing message) ----------
const { LINES } = await import('../../conversation/lines.mjs');
const MARK_ROW = { adviser_name: MARK.adviser_name, adviser_first_name: MARK.adviser_first_name };

test('I-39k ask_email WITH delegate.body: exactly one text message = delegate.body + the email question', () => {
  const delegate = { to: 'W10', action: 'change_method', body: "Thanks Sipho. I'll change it to Teams.", lead_lines: ['Thanks Sipho.'], intro_line: "I'll change it to Teams.", lang: 'en' };
  const r = EP.askEmailMessage({ to: '+27600000002', method: 'teams', broker: MARK_ROW, lead: { language: 'en' }, delegate, lines: LINES, reason: 'change_method' });
  assert.equal(r.message.type, 'text');
  assert.equal(r.message.text.body, "Thanks Sipho. I'll change it to Teams. Where should we send the Teams invite? Reply with your email address.");
  assert.equal(r.message.text.body.split(delegate.body).length - 1, 1, 'delegate body appears once, inside the one message');
  assert.ok(r.message.text.body.length <= EP.WA_BODY_MAX);
  // an over-long delegate body is trimmed, the question is never cut
  const long = EP.askEmailMessage({ to: '+27600000002', method: 'zoom', broker: MARK_ROW, delegate: { body: 'x'.repeat(2000), lang: 'en' }, lines: LINES });
  assert.ok(long.message.text.body.length <= EP.WA_BODY_MAX);
  assert.ok(long.message.text.body.endsWith('Where should we send the Zoom invite? Reply with your email address.'));
});

test('I-39k ask_email WITHOUT delegate.body: lead_lines + intro_line if given, else lines.mjs in the lead\'s language', () => {
  const lines = EP.askEmailMessage({ to: '+27600000002', method: 'teams', broker: MARK_ROW, delegate: { lead_lines: ['Thanks.'], intro_line: "I'll change it to Teams.", lang: 'en' }, lines: LINES, reason: 'change_method' });
  assert.equal(lines.message.text.body, "Thanks. I'll change it to Teams. Where should we send the Teams invite? Reply with your email address.");
  const af = EP.askEmailMessage({ to: '+27600000002', method: 'teams', broker: MARK_ROW, lead: { language: 'af' }, lines: LINES, reason: 'change_method' });
  assert.equal(af.lang, 'af');
  assert.ok(af.message.text.body.startsWith(LINES.af.METHOD_CHANGED.replace('{method}', 'Teams')), af.message.text.body);
  assert.match(af.message.text.body, /Waarheen moet ons die Teams-uitnodiging stuur\?/);
  const plain = EP.askEmailMessage({ to: '+27600000002', method: 'teams', broker: MARK_ROW, lead: { language: 'en' }, lines: LINES });
  assert.equal(plain.message.text.body, 'Where should we send the Teams invite? Reply with your email address.');
});

test('I-39k 10-slot list carries the W04/W07 delegate body in its one body; without it, SLOTS_INTRO in the lead\'s language', () => {
  const slots = engine(MARK).slots;
  const withBody = EP.listFallback(MARK, slots, offerSlots, '+27600000002', { delegate: { body: 'Sure. Here are the next open times with Mark.', lang: 'en' }, lines: LINES });
  assert.equal(withBody.interactive.body.text, `Sure. Here are the next open times with Mark. ${LINES.en.TZ}`);
  const af = EP.listFallback(MARK, slots, offerSlots, '+27600000002', { lead: { language: 'af' }, lines: LINES });
  assert.equal(af.interactive.body.text, `${LINES.af.SLOTS_INTRO.replace('{adviser_first}', 'Mark')} ${LINES.af.TZ}`);
  assert.equal(af.interactive.action.sections[0].rows.length, 10, 'still one interactive message with the list');
});
