'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./capi.js');

const h = (s) => require('crypto').createHash('sha256').update(s).digest('hex');

test('sha256 known vector', () => {
  assert.equal(c.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('phone normalisation to E.164 without plus', () => {
  assert.equal(c.normalise.phone('082 123 4567'), '27821234567');
  assert.equal(c.normalise.phone('+27 82 123 4567'), '27821234567');
  assert.equal(c.normalise.phone('0027821234567'), '27821234567');
});

test('user_data hashing: PII hashed, fbp/fbc/ip/ua untouched', () => {
  const u = c.buildUserData({ phone: '0821234567', email: '  Lerato.M@Gmail.com ', fn: ' Lerato ', ct: 'Cape Town', country: 'ZA',
    external_id: 'lead_1', fbp: 'fb.1.1.2', fbc: 'fb.1.1.IwAR', client_ip: '1.2.3.4', client_user_agent: 'UA/1' });
  assert.deepEqual(u.ph, [h('27821234567')]);
  assert.equal(u.em, undefined); // email is never sent to Meta
  assert.ok(!JSON.stringify(u).includes(h('lerato.m@gmail.com')));
  assert.deepEqual(u.fn, [h('lerato')]);
  assert.deepEqual(u.ct, [h('capetown')]);
  assert.deepEqual(u.country, [h('za')]);
  assert.deepEqual(u.external_id, [h('lead_1')]);
  assert.equal(u.fbp, 'fb.1.1.2'); assert.equal(u.fbc, 'fb.1.1.IwAR');
  assert.equal(u.client_ip_address, '1.2.3.4'); assert.equal(u.client_user_agent, 'UA/1');
  assert.ok(!JSON.stringify(u).includes('0821234567'));
});

test('already-hashed values are not double hashed', () => {
  const x = h('27821234567');
  assert.deepEqual(c.buildUserData({ phone: x }).ph, [x]);
});

test('event_id passthrough and stable server id', () => {
  assert.equal(c.buildEvent({ eventName: 'Lead', eventId: 'browser-uuid', user: {} }).event_id, 'browser-uuid');
  assert.equal(c.buildEvent({ eventName: 'Qualified', leadId: 'L9', stage: 'qualified', user: {} }).event_id, 'evt_L9_qualified');
  assert.throws(() => c.buildEvent({ eventName: 'Lead', user: {} }));
});

test('payload shape + test_event_code + url', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: 'T1' }) }; };
  const r = await c.sendEvent({ pixelId: '123', token: 'tok', testEventCode: 'TEST1', eventName: 'Lead', eventId: 'e1', eventTime: 1700000000,
    eventSourceUrl: 'https://sortmycover.co.za/', user: { phone: '0821234567', fbp: 'fb.1.1.2' }, custom: { content_name: 'a1' }, fetchImpl });
  assert.deepEqual(r, { events_received: 1, fbtrace_id: 'T1' });
  assert.match(seen.url, /^https:\/\/graph\.facebook\.com\/v[\d.]+\/123\/events$/);
  assert.equal(seen.body.test_event_code, 'TEST1');
  const ev = seen.body.data[0];
  assert.equal(ev.action_source, 'website'); assert.equal(ev.event_time, 1700000000); assert.equal(ev.custom_data.content_name, 'a1');
});

test('retries 5xx/429 three times then succeeds; 4xx does not retry', async () => {
  let n = 0;
  const f = async () => (++n < 4 ? { ok: false, status: n === 1 ? 429 : 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: 'x' }) });
  const r = await c.sendEvent({ pixelId: '1', token: 't', eventName: 'Lead', eventId: 'e', fetchImpl: f, sleep: async () => {} });
  assert.equal(n, 4); assert.equal(r.events_received, 1);
  let m = 0;
  const bad = async () => { m++; return { ok: false, status: 400, json: async () => ({ error: { message: 'bad', fbtrace_id: 'F' } }) }; };
  await assert.rejects(c.sendEvent({ pixelId: '1', token: 't', eventName: 'Lead', eventId: 'e', fetchImpl: bad, sleep: async () => {} }), /400.*F/);
  assert.equal(m, 1);
});

test('sendOffline: system_generated, value = quality score, stable id', async () => {
  let b;
  const f = async (u, i) => { b = JSON.parse(i.body); return { ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: 'o' }) }; };
  await c.sendOffline({ pixelId: '1', token: 't', eventName: 'Attended', leadId: 'L1', value: 4, user: { phone: '0821234567' }, fetchImpl: f });
  assert.equal(b.data[0].action_source, 'system_generated');
  assert.equal(b.data[0].event_id, 'evt_L1_attended');
  assert.equal(b.data[0].custom_data.value, 4);
  assert.throws(() => c.sendOffline({ pixelId: '1', token: 't', eventName: 'Purchase', leadId: 'L1' }));
});

test('sendBusinessMessagingLead: channel + ctwa_clid', async () => {
  let b;
  const f = async (u, i) => { b = JSON.parse(i.body); return { ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: 'm' }) }; };
  await c.sendBusinessMessagingLead({ datasetId: 'D1', token: 't', leadId: 'L2', ctwaClid: 'ARAx', wabaId: 'W1', fetchImpl: f });
  const e = b.data[0];
  assert.equal(e.action_source, 'business_messaging'); assert.equal(e.messaging_channel, 'whatsapp');
  assert.equal(e.user_data.ctwa_clid, 'ARAx'); assert.equal(e.event_id, 'evt_L2_ctwa_lead');
});

test('hashAudienceRow hashes only, schema order; EMAIL is not a supported column', () => {
  const r = c.hashAudienceRow({ phone: '0821234567', email: 'A@B.com' }, ['FN', 'PHONE']);
  assert.deepEqual(r, ['', h('27821234567')]);
  assert.ok(!c.AUDIENCE_SCHEMA.includes('EMAIL'));
  assert.throws(() => c.hashAudienceRow({ email: 'A@B.com' }, ['EMAIL']), /unknown schema field/);
});

test('buildEvent never carries em even if a caller passes email or a pre-hashed em', () => {
  const ev = c.buildEvent({ eventName: 'Lead', leadId: 'L9', stage: 'lead', user: { phone: '0821234567', email: 'x@y.com', em: h('x@y.com') } });
  assert.equal(ev.user_data.em, undefined);
  assert.ok(!JSON.stringify(ev).includes(h('x@y.com')));
});

test('default API version is v23.0 when env unset', () => {
  delete process.env.META_API_VERSION; delete process.env.API_VERSION;
  assert.equal(c.apiVersion(), 'v23.0');
});
