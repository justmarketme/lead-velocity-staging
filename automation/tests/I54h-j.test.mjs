// I-54h (F15) + I-54j: offline tests.
//  - I-54h: every later Graph PATCH / DELETE (W15 STOP, W10 move + cancel, W05 update_method) targets the calendar the
//    event was created in: appointments.calendar_provider = 'shared_lv' -> howzit@ shared calendar + howzit@ credential;
//    otherwise the broker's own calendar + W04 graph_token. One helper: lib/w05.graphEventTarget.
//  - I-54j: W06 latency never negative under the test clock; W05 stores join_url only for online-meeting methods.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCode } from './_n8ncode.mjs';
import { lead, broker } from './_harness.mjs';
import * as W5 from '../lib/w05.mjs';
import * as W06 from '../lib/w06.mjs';
import * as W15 from '../lib/w15.mjs';

const wf = (f) => JSON.parse(readFileSync(new URL(`../${f}.json`, import.meta.url), 'utf8'));
const W10 = wf('W10'); const W15J = wf('W15'); const W05J = wf('W05');
const node = (w, name) => w.nodes.find((n) => n.name === name);
const out = (w, from, i = 0) => ((w.connections[from] || { main: [] }).main[i] || []).map((e) => e.node);
const ENV = { HOWZIT_MAILBOX: 'howzit@leadvelocity.co.za', SMC_SHARED_CALENDAR_ID: 'SHARED-CAL-1' };
const HOWZIT_CRED = 'Microsoft 365 howzit@ (Graph, Calendars.ReadWrite + OnlineMeetings.ReadWrite)';
const SHARED_BROKER = { id: 'b1', calendar_email: 'mark@broker.example', calendar_status: 'blocked_admin_consent', calendar_mode: 'shared_fallback' };
const OWN_BROKER = { id: 'b1', calendar_email: 'mark@broker.example', calendar_status: 'ok', calendar_mode: 'oauth' };

test('I-54h lib: graphEventTarget follows the stored route, shared -> howzit@ calendar + howzit@ credential, own -> broker + graph_token', () => {
  const s = W5.graphEventTarget({ graph_event_id: 'AAMk/1=', calendar_provider: 'shared_lv' }, OWN_BROKER, ENV);
  assert.equal(s.route, 'shared'); assert.equal(s.credential, 'howzit_calendar');
  assert.equal(s.url, 'https://graph.microsoft.com/v1.0/users/howzit%40leadvelocity.co.za/calendars/SHARED-CAL-1/events/AAMk%2F1%3D');
  const o = W5.graphEventTarget({ graph_event_id: 'AAMk1', calendar_provider: 'outlook' }, SHARED_BROKER, ENV);
  assert.equal(o.route, 'broker', 'the booking route wins over the broker\'s CURRENT mode');
  assert.equal(o.credential, 'broker_token');
  assert.equal(o.url, 'https://graph.microsoft.com/v1.0/users/mark%40broker.example/events/AAMk1');
  // older row without calendar_provider: derive from the broker
  assert.equal(W5.graphEventTarget({ graph_event_id: 'x' }, SHARED_BROKER, ENV).route, 'shared');
  assert.equal(W5.graphEventTarget({ graph_event_id: 'x' }, OWN_BROKER, ENV).route, 'broker');
  // no event -> nothing to touch; shared without a calendar id fails closed (never calendars//events)
  assert.equal(W5.graphEventTarget({ calendar_provider: 'shared_lv' }, OWN_BROKER, ENV).route, 'none');
  const miss = W5.graphEventTarget({ graph_event_id: 'x', calendar_provider: 'shared_lv' }, OWN_BROKER, { HOWZIT_MAILBOX: ENV.HOWZIT_MAILBOX });
  assert.equal(miss.error, 'shared_calendar_id_missing'); assert.equal(miss.url, null);
  // calendar id from brokers.calendar_status_detail wins over env
  const det = W5.graphEventTarget({ graph_event_id: 'x', calendar_provider: 'shared_lv' }, { calendar_status_detail: { shared_calendar_id: 'DET' } }, ENV);
  assert.match(det.url, /\/calendars\/DET\/events\/x$/);
});

test('I-54h W15: STOP on a shared_lv booking deletes in the howzit@ shared calendar; an own-calendar booking deletes in the broker calendar', async () => {
  const now = Date.parse('2026-10-05T08:00:00Z');
  const mk = (provider) => W15.planOptOut({ mobile: '+27820000001', text: 'STOP', now, leads: [{ id: 'L1', phone: '+27820000001', broker_id: 'b1' }],
    bookings: [{ id: 'k1', lead_id: 'L1', broker_id: 'b1', status: 'booked', graph_event_id: 'EV1', calendar_provider: provider, start: '2026-10-09T10:00:00Z', method: 'phone' }], brokers: [{ id: 'b1', contact_person: 'Mark Smith' }] });
  assert.equal(mk('shared_lv').booking_cancels[0].calendar_provider, 'shared_lv');
  const NAME = 'Fan out (W09, Graph delete, broker notices, one confirmation)';
  const run = async (provider, broker) => {
    const plan = mk(provider);
    const res = await runCode(W15J, NAME, { json: { claimed: true }, env: ENV, refs: { 'Plan opt-out (w15.planOptOut)': { plan, ctx: { brokers: [broker] } } } });
    return res.map((r) => r.json).find((j) => j.kind === 'graph_delete');
  };
  const sh = await run('shared_lv', { ...OWN_BROKER });
  assert.equal(sh.graph_route, 'shared');
  assert.match(sh.url, /\/users\/howzit%40leadvelocity\.co\.za\/calendars\/SHARED-CAL-1\/events\/EV1$/);
  const own = await run('outlook', { ...SHARED_BROKER });
  assert.equal(own.graph_route, 'broker');
  assert.match(own.url, /\/users\/mark%40broker\.example\/events\/EV1$/);
  const bad = await runCode(W15J, NAME, { json: { claimed: true }, env: { HOWZIT_MAILBOX: ENV.HOWZIT_MAILBOX }, refs: { 'Plan opt-out (w15.planOptOut)': { plan: mk('shared_lv'), ctx: { brokers: [OWN_BROKER] } } } });
  assert.equal(bad.map((r) => r.json).find((j) => j.kind === 'graph_delete').graph_route, 'skip');
  // wiring: shared -> howzit@ credential node; broker -> W04 graph_token -> broker DELETE
  const sw = 'Graph calendar? (shared howzit@ vs broker)';
  assert.deepEqual(out(W15J, 'Fan-out kind?', 1), [sw]);
  assert.deepEqual(out(W15J, sw, 0), ['Graph DELETE event (howzit@ shared calendar)']);
  assert.deepEqual(out(W15J, sw, 1), ['W04 graph_token']);
  assert.equal(node(W15J, 'Graph DELETE event (howzit@ shared calendar)').credentials.microsoftOutlookOAuth2Api.name, HOWZIT_CRED);
  assert.equal(node(W15J, 'Graph DELETE event').credentials, undefined, 'the broker branch never carries the howzit@ credential');
  assert.equal(node(W15J, 'Graph DELETE event').parameters.url, "={{ $('Fan-out kind?').item.json.url }}");
});

test('I-54h W10: move (PATCH) and cancel (DELETE) branch on the booking route; shared uses the howzit@ credential, own keeps W04 graph_token', async () => {
  for (const [tname, sname, shName, tokName, ownName, srcNode, next] of [
    ['Graph target (move)', 'Graph calendar? (move)', 'Graph PATCH event (howzit@ shared calendar)', 'Graph token for broker', 'Graph PATCH event (same event id)', 'Merge context', 'W09 rebuild reminders'],
    ['Graph target (cancel)', 'Graph calendar? (cancel)', 'Graph DELETE event (howzit@ shared calendar)', 'Graph token for broker (cancel)', 'Graph DELETE event', 'Decide cancel (w10.applyCancel)', 'W09 cancel all reminders'],
  ]) {
    const run = async (provider, broker) => (await runCode(W10, tname, { json: { x: 1 }, env: ENV, refs: { [srcNode]: { bk: { graph_event_id: 'EV9', calendar_provider: provider }, br: broker } } })).json;
    const sh = await run('shared_lv', OWN_BROKER);
    assert.equal(sh.gt.route, 'shared'); assert.match(sh.gt.url, /\/users\/howzit%40leadvelocity\.co\.za\/calendars\/SHARED-CAL-1\/events\/EV9$/);
    assert.equal(sh.x, 1, 'passthrough of the item');
    const own = await run('outlook', SHARED_BROKER);
    assert.equal(own.gt.route, 'broker'); assert.match(own.gt.url, /\/users\/mark%40broker\.example\/events\/EV9$/);
    assert.equal((await run('shared_lv', { ...OWN_BROKER, calendar_email: null }).then((r) => r.gt.route)), 'shared');
    assert.equal(out(W10, tname)[0], sname);
    assert.deepEqual([out(W10, sname, 0), out(W10, sname, 1), out(W10, sname, 2)], [[shName], [tokName], [next]]);
    assert.deepEqual(out(W10, shName), [next]);
    assert.equal(node(W10, shName).credentials.microsoftOutlookOAuth2Api.name, HOWZIT_CRED);
    assert.equal(node(W10, ownName).credentials, undefined);
    assert.ok(node(W10, ownName).parameters.url.includes(`$('${tname}')`), 'broker branch URL also comes from the helper');
    assert.equal(node(W10, shName).parameters.url, `={{ $('${tname}').item.json.gt.url }}`);
  }
  // nothing else in W10 still builds a broker-calendar event URL by hand
  const sql = JSON.stringify(node(W10, 'Load booking, lead, broker, brand').parameters);
  assert.ok(sql.includes('a.calendar_provider') && sql.includes('b.calendar_mode'));
  assert.ok(!JSON.stringify(W10.nodes.map((n) => n.parameters.url)).includes('.calendar_email) }}/events'), 'no hand-built users/{calendar_email}/events URL left');
});

test('I-54h W05 update_method: the Teams/phone PATCH follows the booking route too', async () => {
  const t = 'Method calendar target (w05.graphEventTarget)';
  const plan = (provider, br) => ({ booking: { id: 'k', broker_id: 'b1', graph_event_id: 'EVM', calendar_provider: provider }, broker: br });
  const run = async (p) => (await runCode(W05J, t, { env: ENV, refs: { 'Plan method change (w05.planUpdateMethod)': p } }))[0].json;
  const sh = await run(plan('shared_lv', OWN_BROKER));
  assert.equal(sh.route, 'shared'); assert.match(sh.target.url, /\/calendars\/SHARED-CAL-1\/events\/EVM$/);
  const own = await run(plan('outlook', SHARED_BROKER));
  assert.equal(own.route, 'broker'); assert.equal(own.broker_id, 'b1');
  const sw = 'Method event calendar?';
  assert.deepEqual([out(W05J, sw, 0), out(W05J, sw, 1), out(W05J, sw, 2)], [['Graph PATCH event (method, howzit@ shared calendar)'], ['graph_token input (method)'], ['Save method']]);
  assert.equal(node(W05J, 'Graph PATCH event (method, howzit@ shared calendar)').credentials.microsoftOutlookOAuth2Api.name, HOWZIT_CRED);
  assert.equal(node(W05J, 'Graph PATCH event (method, ASSUMPTION)').credentials, undefined);
  assert.ok(JSON.stringify(node(W05J, 'Load booking for method change').parameters).includes('a.calendar_provider'));
});

test('I-54j W05: join_url is stored only for Teams / Zoom / Meet; phone and WhatsApp-call bookings store none', () => {
  const l = lead('L01'); const b = broker();
  const mk = (method) => {
    const p = { lead_id: l.lead_id, broker_id: b.broker_id, start: '2026-10-20T08:00:00.000Z', end: '2026-10-20T08:30:00.000Z', method, email: method === 'teams' ? 'x@example.com' : null, email_status: method === 'teams' ? 'mx_ok' : null, booked_via: 'page', idempotency_key: `k-${method}`, route: 'graph', adviser_first: 'Mark' };
    const ev = { ok: true, graph_event_id: 'EV', ical_uid: 'U', join_url: 'https://teams.microsoft.com/l/meetup-join/STRAY' };
    const ctx = { lead: { id: l.lead_id, first_name: 'Synthetic', phone: '+27600000151', language: 'en', brand_id: 'smc' }, broker: { ...b, calendar_status: 'ok' }, now: Date.parse('2026-10-03T08:00:00Z') };
    const bk = { id: 'bk1', appointment_date: p.start, ends_at: p.end, method, broker_id: b.broker_id };
    return W5.finish(ctx, p, bk, ev);
  };
  for (const m of ['phone', 'whatsapp_call']) {
    const f = mk(m);
    assert.equal(f.appointment_update.join_url, null, m); assert.equal(f.response.body.join_url, null, m);
  }
  const t = mk('teams');
  assert.match(t.appointment_update.join_url, /teams\.microsoft\.com/); assert.match(t.response.body.join_url, /teams\.microsoft\.com/);
  const save = JSON.stringify(node(W05J, 'Save method').parameters.query);
  assert.ok(save.includes("join_url = CASE WHEN $2 IN ('teams','zoom','meet') THEN join_url ELSE NULL END"), 'a Teams -> phone method change clears the stale link');
});

test('I-54j W06: latency is computed on the lead clock (never negative under the test clock) and unchanged in production', async () => {
  const plan = { template: 'broker_intro_slots', trigger: 'routed', variables: [], clock_start: '2026-10-17T10:00:00+02:00', send_at: '2026-10-17T10:00:00+02:00' };
  const wall = Date.now(); // wall clock is far from the test clock (x-test-now 17 Oct)
  const sent = W06.sentAtOnLeadClock(plan, wall, wall + 450);
  assert.equal(sent - Date.parse(plan.clock_start), 450);
  assert.equal(W06.sentUpdate({ stage: 'new' }, plan, 'wamid.X', sent).latency_ms, 450);
  // test clock in the PAST of the wall clock gave a huge positive number before; also fixed
  const past = { ...plan, clock_start: '2026-01-01T10:00:00+02:00', send_at: '2026-01-01T10:00:20+02:00' };
  assert.equal(W06.sentUpdate({ stage: 'new' }, past, 'w', W06.sentAtOnLeadClock(past, wall, wall + 100)).latency_ms, 20_100);
  // production: planned ~ send_at on the same clock -> the real wall time is kept (a late send still counts against 60 s)
  const prod = { ...plan, clock_start: new Date(wall - 5000).toISOString(), send_at: new Date(wall).toISOString() };
  assert.equal(W06.sentAtOnLeadClock(prod, wall + 3000, wall + 70_000), wall + 70_000);
  // the workflow node uses it
  const N = 'Evidence rows (w06.communicationRow + sentUpdate)';
  const WF = wf('W06');
  const l = { id: 'L', brand_id: 'smc', phone: '+27600000151', broker_id: 'b1', stage: 'new' };
  const full = { template: 'broker_intro_slots', trigger: 'routed', variables: ['Sam', 'Practice', '1234', 'Mark', 'x', 'y', 'z'], clock_start: plan.clock_start, send_at: plan.send_at };
  const r = (await runCode(WF, N, { json: { messages: [{ id: 'wamid.T' }] }, refs: { 'Plan card (w06.planFirstTouch + toCloudApi)': { l, plan: full, planned_at: wall } } }))[0].json;
  assert.ok(r.comm.latency_ms >= 0 && r.comm.latency_ms < 5000, `latency ${r.comm.latency_ms}`);
  assert.equal(r.upd.within_60s, true); assert.equal(r.slow, false);
});
