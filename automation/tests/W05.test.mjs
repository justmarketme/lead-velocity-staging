// DRAFT for GATE-TEST-W05 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W05 Book  (POST /book from the page, the 10-slot list, the Flow or the chat)
// Money rule protected: ZERO double-bookings (the number this agent moves). The slot is re-checked against the
// broker's live free/busy inside the booking transaction; if it's gone the lead gets the next 3 instead of an
// error. The event lands in the broker's Outlook with everything he needs, and email is only ever asked for
// (and only used) when the method needs an invite (0.1 Email rule, POPIA purpose limitation).
//
// Run:  node --test automation/tests/W05.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, cycle, clone, ms, iso, at, MIN, H, online } from './_harness.mjs';
import { generateSlots, offerSlots } from './_slots.mjs';
import * as W5 from '../lib/w05.mjs';
import { readFileSync } from 'node:fs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import { lvViolations } from './_n8ncode.mjs';

// ============================================================================================
// Offline booking adapter (I-45a): the RUNNING code. book() walks the same lib/w05.mjs steps the W05.json Code nodes
// call (parseHttp | parseSub -> decide -> W04 is_free via lib/w04.mjs respond -> afterCheck -> the INSERT's re-check
// twin insertBlocked -> graphEvent / afterEvent -> finish) and emulates only what n8n does around them: the Postgres
// rows, the Graph create response, the sends. No reference copy of the booking rules lives in this file any more.
// ============================================================================================
import { createRequire } from 'node:module';
import * as W4 from '../lib/w04.mjs';
import { HOLIDAYS } from './_harness.mjs';
const LT5 = createRequire(import.meta.url)('../security/lead-token.js');
const OFFLINE_SECRET = 'w05-offline-lead-token-secret-0123456789abcdef';

// Email layers: the RUNNING code (lib/w05.mjs), re-exported so this file's assertions exercise it.
export const checkEmail = W5.checkEmail;

export function newBookState() {
  return { broker: clone(broker()), leads: new Map(), bookings: [], events: new Map(), capi: [], invites: [], notifications: [], messages: [], seq: 0 };
}

const asHttp = (status, body) => ({ http_status: status, body });

export async function book(st, req, now) {
  // Caller parse: the page posts with X-Lead-Token (http lane); list / chat / Flow picks arrive as a sub-call.
  const env = { LEAD_TOKEN_SECRET: OFFLINE_SECRET };
  let c;
  if (req.booked_via === 'page') {
    const { token } = LT5.mintLeadToken(req.lead_id, { secret: OFFLINE_SECRET, nowMs: now });
    c = W5.parseHttp({ [LT5.HEADER]: token }, req, env, now);
    if (!c.ok) return asHttp(c.status, c.body);
  } else {
    const r = W5.parseSub(req, env, now);
    if (r.op !== 'book') return asHttp(400, { error_code: r.reason || r.op });
    c = { lane: 'sub', mode: null, req: r };
  }
  // "Load lead, broker, replay, live booking" (Postgres). The lead was routed by W01 (leads.broker_id); the broker's
  // calendar is connected (calendar_status ok -> Graph route; busy = his Outlook getSchedule blocks).
  const brokerRow = { ...st.broker, calendar_status: 'ok' };
  const row0 = st.leads.get(c.req.lead_id);
  const ctx = {
    lane: c.lane, mode: c.mode, req: c.req, now,
    lead: row0 ? { ...row0, broker_id: row0.broker_id || brokerRow.broker_id } : null, broker: brokerRow,
    existing: st.bookings.find((x) => x.idempotency_key === c.req.idempotency_key) || null,
    live: st.bookings.find((x) => x.client_id === c.req.lead_id && W5.LIVE.has(x.status)) || null,
    mx: {},
  };
  const dec = W5.decide(ctx);
  if (dec.action === 'respond') return asHttp(dec.status, dec.body);
  if (dec.action === 'replay') return asHttp(201, W5.publicBody(dec.booking));
  if (dec.action !== 'check') return asHttp(dec.action === 'message' ? 422 : 409, { error_code: dec.kind || dec.reason || dec.action });
  // "W04 is_free (re-check, waits)": W04's engine against Outlook busy + our live appointments.
  const w04 = (r) => W4.respond({ lane: 'sub', req: r, broker: brokerRow, bookings: st.bookings, busy: st.broker.calendar_busy, route: dec.plan.route, now, holidays: HOLIDAYS });
  const free = w04(dec.is_free);
  await null; // n8n awaits the sub-workflow: a concurrent request can pass its own re-check here (the race test)
  const after = W5.afterCheck(ctx, dec, free);
  if (after.action === 'taken') return asHttp(after.status, after.body);
  // "Insert appointment (re-check overlap + buffer, idempotent)": ON CONFLICT / overlap -> nothing inserted -> taken.
  const replay = st.bookings.find((x) => x.idempotency_key === after.row.idempotency_key);
  if (replay) return asHttp(201, W5.publicBody(replay));
  if (W5.insertBlocked(st.bookings, after.row, W4.brokerConfig(brokerRow).buffer_minutes)) {
    const t = W5.taken(ctx, dec.plan, w04({ op: 'list', limit: 3 }).slots);
    return asHttp(t.status, t.body);
  }
  const booking = { ...after.row, id: `bkg_${++st.seq}` };
  st.bookings.push(booking);
  // Graph create (emulated response) -> afterEvent -> finish.
  const ev = W5.graphEvent(ctx, dec.plan);
  const graphId = `AAMkTEST_${st.seq}`;
  const created = { ...ev, id: graphId, ...(ev.isOnlineMeeting ? { onlineMeeting: { joinUrl: `https://teams.microsoft.com/l/meetup-join/TEST_${graphId}` } } : {}) };
  st.events.set(graphId, created);
  const evRes = W5.afterEvent({ statusCode: 201, body: created });
  const fin = W5.finish(ctx, dec.plan, booking, evRes);
  Object.assign(booking, fin.appointment_update, { start: booking.appointment_date, end: booking.ends_at });
  Object.assign(st.leads.get(row0.id), fin.lead_update);
  if (fin.invite) st.invites.push({ from: W5.INVITE_FROM, to: fin.invite.to, join_url: evRes.join_url, ics: fin.invite.message.attachments.some((x) => x.contentType === 'text/calendar'), lead_id: row0.id });
  st.notifications.push({ to: fin.broker.to, template: fin.broker.template, vars: fin.broker.vars });
  if (fin.capi) st.capi.push(fin.capi);
  if (fin.w06) (st.w06 = st.w06 || []).push(fin.w06);
  return asHttp(fin.response.status, fin.response.body);
}

/** Graph mail webhook on howzit@ reports an NDR for the invite (W17 -> W05 invite_bounced -> lib bounceEffect). */
export function onInviteBounce(st, leadId, now) {
  const l = st.leads.get(leadId);
  const eff = W5.bounceEffect({ ...l, phone: l.mobile }, { now });
  Object.assign(l, eff.lead_update);
  st.messages.push({ to: l.mobile, at: iso(now), ...eff.message });
}

// ============================================================================================
// Adapters
// ============================================================================================
function seedLead(st, fx) {
  const s = fx.submission;
  const isPage = fx.origin === 'page';
  const row = {
    id: fx.lead_id, origin: fx.origin, first_name: s.first_name ?? s.profile_name ?? s.field_data?.find((f) => f.name === 'first_name').values[0],
    mobile: fx.expected.W01.mobile ?? `+${s.wa_id}`, age_band: s.quiz?.age_band ?? '45_50', budget_band: s.quiz?.budget_band ?? '750_1250',
    consent_text_version: s.consent?.version ?? s.consent_text_version, consent_at: s.consent?.at ?? s.created_time ?? s.inbound?.[1]?.at,
    consent_ads_at: isPage || fx.origin === 'lead_ad' ? (s.consent?.at ?? s.created_time) : null, ad_id: s.context?.ad_id ?? s.ad_id ?? null,
  };
  st.leads.set(row.id, row);
  return row.id;
}
function offlineSys() {
  const st = newBookState();
  return {
    st,
    setup: async (fx) => seedLead(st, fx),
    book: async (req, now) => book(st, req, ms(now)),
    addOutlookEvent: async (start, end) => st.broker.calendar_busy.push({ start, end }),
    state: async (leadId) => ({ lead: st.leads.get(leadId), bookings: st.bookings.filter((b) => b.client_id === leadId), events: [...st.events.values()].filter((e) => st.bookings.some((b) => b.client_id === leadId && b.graph_event_id === e.id)), capi: st.capi.filter((c) => c.lead_id === leadId), invites: st.invites.filter((i) => i.lead_id === leadId), messages: st.messages.filter((m) => m.to === st.leads.get(leadId).mobile) }),
    allBookings: async () => st.bookings,
    bounce: async (leadId, now) => onInviteBounce(st, leadId, ms(now)),
    notifications: async () => st.notifications,
  };
}
function onlineSys() {
  return {
    setup: async (fx) => {
      await online.post('/test/reset', { broker_id: broker().broker_id, keep_calendar_busy: true });
      const r = fx.origin === 'page' ? await online.post('/lead', fx.submission, { now: fx.submission.submitted_at }) : await online.post('/test/seed-lead', fx, {});
      return r.body.lead_id;
    },
    book: async (req, now) => online.post('/book', req, { now }),
    addOutlookEvent: async (start, end) => online.post('/test/seed-calendar', { add_busy: [{ start, end }] }),
    state: (leadId) => online.state(leadId),
    allBookings: async () => (await online.get(`/test/bookings?broker_id=${broker().broker_id}`)).body,
    bounce: async (leadId, now) => online.post('/test/bounce', { lead_id: leadId }, { now }),
    notifications: async () => (await online.get(`/test/notifications?broker_id=${broker().broker_id}`)).body,
  };
}
const fresh = () => (MODE === 'online' ? onlineSys() : offlineSys());
const reqFor = (fx, leadId, over = {}) => ({ ...clone(fx.booking_request), lead_id: leadId, broker_id: broker().broker_id, ...over });

// ============================================================================================
// Tests
// ============================================================================================
test(`W05 [${MODE}] L01 page booking, Teams: Outlook event with Teams link, client not an attendee, invite from howzit@`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const id = await sys.setup(fx);
  const r = await sys.book(reqFor(fx, id), fx.booking_request.requested_at);
  const e = fx.expected.W05;
  assert.equal(r.http_status ?? r.status, e.http_status);
  assert.equal(r.body.start, e.slot_start);
  assert.equal(r.body.end, e.slot_end);
  const s = await sys.state(id);
  const ev = s.events[0];
  assert.equal(ev.subject, e.event_title);
  assert.equal(ev.isOnlineMeeting, e.is_online_meeting);
  assert.equal(ev.onlineMeetingProvider, e.online_meeting_provider);
  assert.equal(ev.attendees.length, 0, 'client NOT added as attendee by default (keeps broker mailbox private)');
  assert.deepEqual(ev.categories, ['SortMyCover']);
  assert.equal(ev.start.timeZone, 'Africa/Johannesburg');
  for (const needle of ['35_44', '750_1250', 'Teams', 'Consent ref', 'Pre-call brief']) assert.ok(ev.body.content.includes(needle), needle);
  assert.equal(s.lead.email_status, e.email_status);
  assert.equal(s.lead.email_purpose, e.email_purpose);
  assert.equal(s.invites.length, 1);
  assert.equal(s.invites[0].from, e.invite_from);
  assert.ok(s.invites[0].join_url, 'invite carries the join link');
  assert.equal(s.bookings[0].graph_event_id, ev.id, 'Graph event.id stored on the booking (Section 7)');
  assert.equal(s.bookings[0].cycle_id, e.cycle_id);
  assert.deepEqual(s.capi.map((c) => [c.event_name, c.event_id]), [['Schedule', e.capi_schedule_event_id]]);
});

test(`W05 [${MODE}] phone and WhatsApp-call bookings: number in the event body, no email asked or stored`, async () => {
  const sys = fresh();
  for (const id of ['L02', 'L03']) {
    const fx = lead(id);
    const lid = await sys.setup(fx);
    const r = await sys.book(reqFor(fx, lid, { email: 'should.not.be.stored@gmail.com' }), fx.booking_request.requested_at);
    assert.equal(r.http_status ?? r.status, 201, id);
    const s = await sys.state(lid);
    assert.equal(s.events[0].subject, fx.expected.W05.event_title);
    assert.ok(s.events[0].body.content.includes(fx.expected.W05.body_contains), `${id} body`);
    assert.equal(s.events[0].isOnlineMeeting, false);
    assert.equal(s.lead.email ?? null, null, `${id}: email never stored for call methods`);
    assert.equal(s.invites.length, 0);
    assert.deepEqual(s.capi.map((c) => c.event_id), [fx.expected.W05.capi_schedule_event_id]);
  }
});

test(`W05 [${MODE}] CTWA lead (L04): business-messaging Schedule only, no website twin`, async () => {
  const sys = fresh();
  const fx = lead('L04');
  const lid = await sys.setup(fx);
  await sys.book(reqFor(fx, lid), fx.booking_request.requested_at);
  const s = await sys.state(lid);
  assert.deepEqual(s.capi.map((c) => [c.event_id, c.action_source]), [[fx.expected.W05.capi_schedule_event_id, fx.expected.W05.capi_schedule_action_source]]);
});

test(`W05 [${MODE}] slot taken in Outlook after it was offered -> 409 + next 3 free slots (not an error page)`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const lid = await sys.setup(fx);
  await sys.addOutlookEvent('2026-10-15T09:30:00+02:00', '2026-10-15T10:30:00+02:00'); // broker adds gym after the page loaded
  const r = await sys.book(reqFor(fx, lid), fx.booking_request.requested_at);
  assert.equal(r.http_status ?? r.status, 409);
  assert.equal(r.body.error_code, 'slot_taken');
  assert.equal(r.body.next.length, 3);
  assert.ok(r.body.next.every((s) => s.start !== fx.booking_request.slot_start));
  assert.equal((await sys.state(lid)).bookings.length, 0);
});

test(`W05 [${MODE}] two people pick the same slot at the same moment -> exactly one booking (zero double-bookings)`, async () => {
  const sys = fresh();
  const a = lead('L01');
  const bfx = lead('L02');
  const ida = await sys.setup(a);
  const idb = await sys.setup(bfx);
  const slot = '2026-10-15T10:00:00+02:00';
  const now = '2026-10-12T09:10:00+02:00'; // after both leads exist on the virtual clock
  const [ra, rb] = await Promise.all([
    sys.book(reqFor(a, ida, { slot_start: slot }), now),
    sys.book(reqFor(bfx, idb, { slot_start: slot, method: 'teams', email: 'howzit+sipho.test@leadvelocity.co.za', idempotency_key: 'book_L02_race' }), now),
  ]);
  const codes = [ra.http_status ?? ra.status, rb.http_status ?? rb.status].sort();
  assert.deepEqual(codes, [201, 409]);
  const loser = (ra.http_status ?? ra.status) === 409 ? ra : rb;
  assert.equal(loser.body.next.length, 3);
  const all = (await sys.allBookings()).filter((x) => ms(x.start) === ms(slot) && ['booked', 'confirmed'].includes(x.status));
  assert.equal(all.length, 1);
});

test(`W05 [${MODE}] a retried POST /book with the same idempotency key returns the same booking, one event`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const lid = await sys.setup(fx);
  const r1 = await sys.book(reqFor(fx, lid), fx.booking_request.requested_at);
  const r2 = await sys.book(reqFor(fx, lid), iso(ms(fx.booking_request.requested_at) + 5000));
  assert.equal(r2.body.booking_id, r1.body.booking_id);
  const s = await sys.state(lid);
  assert.equal(s.bookings.length, 1);
  assert.equal(s.events.length, 1);
  assert.equal(s.capi.length, 1);
});

test(`W05 [${MODE}] slots that break the rules are refused even if posted directly (notice, hours, holiday)`, async () => {
  const sys = fresh();
  const fx = lead('L02');
  const lid = await sys.setup(fx);
  const now = '2026-10-12T11:40:00+02:00';
  for (const slot of ['2026-10-12T12:30:00+02:00' /* < 2 h */, '2026-10-13T17:00:00+02:00' /* after hours */, '2026-10-13T08:30:00+02:00' /* before */, '2026-10-17T10:00:00+02:00' /* Saturday */]) {
    const r = await sys.book(reqFor(fx, lid, { slot_start: slot, idempotency_key: `rule_${slot}` }), now);
    assert.equal(r.http_status ?? r.status, 409, slot);
  }
});

test(`W05 [${MODE}] method the broker doesn't support (Zoom) -> 422 with his methods`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const lid = await sys.setup(fx);
  const r = await sys.book(reqFor(fx, lid, { method: 'zoom', idempotency_key: 'zoom1' }), fx.booking_request.requested_at);
  assert.equal(r.http_status ?? r.status, 422);
  assert.deepEqual(r.body.methods, broker().methods_supported);
});

test(`W05 [${MODE}] email layers: syntax, typo suggestion, disposable, MX; Teams without email refused`, async () => {
  assert.deepEqual(checkEmail('lerato.m@gmial.com'), { ok: false, reason: 'typo', suggestion: 'lerato.m@gmail.com' });
  assert.equal(checkEmail('lerato.m@outlok.com').suggestion, 'lerato.m@outlook.com');
  assert.equal(checkEmail('not-an-email').reason, 'syntax');
  assert.equal(checkEmail('x@mailinator.com').reason, 'disposable');
  assert.equal(checkEmail('x@no-mx-here-test.co.za').reason, 'no_mx');
  assert.equal(checkEmail('lerato.m@gmial.com', { acceptTypo: true }).reason, 'no_mx', 'keeping the typo still needs a live domain');
  assert.equal(checkEmail(' Howzit+Lerato.Test@LeadVelocity.co.za ').status, 'mx_ok');
  const sys = fresh();
  const fx = lead('L01');
  const lid = await sys.setup(fx);
  const r = await sys.book(reqFor(fx, lid, { email: undefined, idempotency_key: 'noemail' }), fx.booking_request.requested_at);
  assert.equal(r.body.error_code, 'email_required');
  const r2 = await sys.book(reqFor(fx, lid, { email: 'lerato@gmial.com', idempotency_key: 'typo' }), fx.booking_request.requested_at);
  assert.equal(r2.body.error_code, 'email_typo');
  assert.equal(r2.body.suggestion, 'lerato@gmail.com');
});

test(`W05 [${MODE}] invite bounce -> email_status=bounced and a WhatsApp prompt with the suggested fix`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const lid = await sys.setup(fx);
  // The address passed every instant check (MX ok) but the mailbox itself does not exist -> NDR on howzit@.
  await sys.book(reqFor(fx, lid, { idempotency_key: 'bounce2' }), fx.booking_request.requested_at);
  await sys.bounce(lid, '2026-10-12T08:20:00+02:00');
  const s = await sys.state(lid);
  assert.equal(s.lead.email_status, 'bounced');
  assert.ok(s.messages.some((m) => m.kind === 'email_bounced_prompt'));
});

test(`W05 [${MODE}] broker is told about the booking (first name only — no surname, no email)`, async () => {
  const sys = fresh();
  const fx = lead('L01');
  const lid = await sys.setup(fx);
  await sys.book(reqFor(fx, lid), fx.booking_request.requested_at);
  const n = (await sys.notifications()).filter((x) => x.template === 'broker_new_booking');
  assert.equal(n.length, 1);
  assert.ok(!JSON.stringify(n).includes('@'), 'no email address in the broker WhatsApp');
  assert.equal(n[0].vars[1], 'Lerato');
});

test(`W05 [${MODE}] lead row carries broker_id and cycle_id after booking (W05 "store broker_id/cycle_id on the lead")`, async () => {
  const sys = fresh();
  const fx = lead('L03');
  const lid = await sys.setup(fx);
  await sys.book(reqFor(fx, lid), fx.booking_request.requested_at);
  const s = await sys.state(lid);
  assert.equal(s.lead.broker_id, broker().broker_id);
  assert.equal(s.lead.cycle_id, cycle().cycle_id);
  assert.equal(s.lead.stage, 'booked');
});

// ============================================================================================
// Build checks: the real module and the real automation/W05.json
// ============================================================================================
const WF5 = JSON.parse(readFileSync(new URL('../W05.json', import.meta.url), 'utf8'));
const ctx5 = (over = {}) => ({ lane: 'http', mode: 'lead', lead: { id: 'lead_test_L02', broker_id: broker().broker_id, first_name: 'Sipho', phone: '+27600000002', origin: 'page', consent_ads_at: '2026-10-12T09:00:00+02:00' }, broker: broker(), now: ms('2026-10-12T11:40:00+02:00'), ...over });

test('W05 lib: call methods never carry email; invite methods need one; unsupported method -> 422 with methods', () => {
  const r = W5.parseHttp({}, {}, {});
  assert.equal(r.ok, false);
  const d = W5.decide(ctx5({ req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'phone', email: null, booked_via: 'page', idempotency_key: 'k1' } }));
  assert.equal(d.action, 'check'); assert.equal(d.plan.email, null); assert.equal(d.is_free.op, 'is_free');
  assert.equal(W5.decide(ctx5({ req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'teams', booked_via: 'page', idempotency_key: 'k2' } })).body.error_code, 'email_required');
  const z = W5.decide(ctx5({ req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'zoom', booked_via: 'page', idempotency_key: 'k3' } }));
  assert.equal(z.status, 422); assert.deepEqual(z.body.methods, broker().methods_supported);
  const chat = W5.decide(ctx5({ lane: 'sub', req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'zoom', booked_via: 'chat', idempotency_key: 'k4' } }));
  assert.equal(chat.action, 'message'); assert.match(chat.wa.interactive.body.text, /doesn't offer that way/);
});

test('W05 lib: taken -> 409 with next 3 under both keys; SLOT_TAKEN line in chat; Graph event + CAPI without email', () => {
  const next = ['2026-10-14T09:00:00+02:00', '2026-10-15T09:00:00+02:00', '2026-10-16T09:00:00+02:00'].map((s) => ({ start: s, end: iso(ms(s) + 30 * MIN) }));
  const t = W5.taken(ctx5({ lane: 'sub' }), { method: 'phone' }, next);
  assert.equal(t.status, 409); assert.equal(t.body.next.length, 3); assert.deepEqual(t.body.slots, t.body.next); assert.match(t.wa.interactive.body.text, /just taken/);
  const p = { start: '2026-10-13T10:30:00+02:00', end: '2026-10-13T11:00:00+02:00', method: 'teams', email: 'x@gmail.com', idempotency_key: 'k', booked_via: 'page', context: {} };
  const ev = W5.graphEvent(ctx5(), p);
  assert.equal(ev.isOnlineMeeting, true); assert.equal(ev.onlineMeetingProvider, 'teamsForBusiness'); assert.equal(ev.attendees.length, 0);
  assert.ok(!JSON.stringify(W5.capiSchedule(ctx5().lead, p)).includes('@'));
  assert.equal(W5.capiSchedule({ id: 'x', origin: 'ctwa' }, p).action_source, 'business_messaging');
});

test('W05.json: draft name, inactive, one Postgres credential, physical columns only, insert re-checks overlap + buffer', () => {
  assert.equal(WF5.name, 'W05 Book (DRAFT pending GATE-TEST-W05)');
  assert.equal(WF5.active, false);
  const pgs = WF5.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres');
  assert.ok(pgs.every((n) => n.credentials.postgres.name === 'LV Supabase - n8n_app (least privilege)'));
  assert.deepEqual(checkSql(workflowSql(WF5)), []);
  const ins = pgs.find((n) => n.name.startsWith('Insert appointment')).parameters.query;
  assert.match(ins, /NOT EXISTS/); assert.match(ins, /make_interval\(mins/); assert.match(ins, /ON CONFLICT DO NOTHING/);
  // I-50a: appointments has no lead_id column; the lead is client_id (FK leads.id), as W09/W12/W13 read it.
  assert.doesNotMatch(ins, /\blead_id\b/); assert.match(ins, /INSERT INTO public\.appointments \(client_id, broker_id,/);
  assert.equal('lead_id' in W5.appointmentRow({ lead: { id: 'l1', phone: '+27820000000' }, broker: { broker_id: 'b1' }, now: Date.now() }, { start: '2026-10-05T08:00:00Z', end: '2026-10-05T08:30:00Z', method: 'phone', booked_via: 'list', idempotency_key: 'k' }), false);
  const all = JSON.stringify(WF5);
  for (const needle of ["require('lv-automation').w05;", 'W04 Slots API', 'CAPI Send', 'W09 Reminder sequence', 'W06 First touch', 'last_contact_at', 'teamsForBusiness'].slice(0, 6)) assert.ok(all.includes(needle), needle);
  assert.deepEqual(lvViolations(WF5, 'smc-w05', { builtins: ['dns'] }), [], 'I-46c exact-name require + I-44b ids');
  const names = new Set(WF5.nodes.map((n) => n.name));
  for (const [k, v] of Object.entries(WF5.connections)) { assert.ok(names.has(k), k); for (const o of v.main) for (const e of o) assert.ok(names.has(e.node), e.node); }
});

// I-49b / I-45i: the W17 -> W05 invite_bounced leg, run through the W05.json Code node as n8n runs it.
test('W05.json invite_bounced: EMAIL_BOUNCED inside 24 h, invite_email_bounced (3 vars) outside, via smc-whatsapp-send (no wait); call methods never asked', async () => {
  const { runCode: run, templateCounts: tc } = await import('./_n8ncode.mjs');
  const { LINES: LN, fill: fl } = await import('../../conversation/lines.mjs');
  const wf5 = JSON.parse(readFileSync(new URL('../W05.json', import.meta.url), 'utf8'));
  const row = { id: 'lead-1', email: 'lerato.m@gmial.com', phone: '+27820000001', first_name: 'Lerato Mokoena', language: 'en', method: 'teams', adviser_name: 'Mark Smith' };
  const inW = (await run(wf5, 'Bounce prompt (w05.bounceEffect)', { items: [{ ...row, last_inbound_at: new Date(Date.now() - 3600e3).toISOString() }] })).map((x) => x.json);
  assert.equal(inW.length, 1);
  assert.equal(inW[0].kind, 'text');
  assert.equal(inW[0].text, fl(LN.en.EMAIL_BOUNCED, { method: 'Microsoft Teams' }));
  const out = (await run(wf5, 'Bounce prompt (w05.bounceEffect)', { items: [{ ...row, last_inbound_at: new Date(Date.now() - 30 * 3600e3).toISOString() }] })).map((x) => x.json);
  assert.equal(out[0].kind, 'template');
  assert.equal(out[0].template, 'invite_email_bounced');
  assert.deepEqual(out[0].variables, ['Lerato', 'Microsoft Teams', 'Mark Smith']);
  assert.equal(out[0].variables.length, tc('invite_email_bounced').body);
  assert.equal(out[0].correlation, inW[0].correlation, 'asked once per address (same correlation key)');
  assert.deepEqual(await run(wf5, 'Bounce prompt (w05.bounceEffect)', { items: [{ ...row, method: 'phone' }] }), [], 'call methods never ask for an email');
  const sendNode = wf5.nodes.find((x) => x.name === '-> WhatsApp Send (invite bounce)');
  assert.equal(sendNode.parameters.workflowId.value, 'smc-whatsapp-send');
  assert.equal(sendNode.parameters.options.waitForSubWorkflow, false);
  assert.equal(wf5.connections['Bounce prompt (w05.bounceEffect)'].main[0][0].node, '-> WhatsApp Send (invite bounce)');
});

test('I-45f: a first booking calls W06 op booking (W06 picks broker_intro_booked vs booking_confirmed); W06 reads it as a booking', async () => {
  const W6 = await import('../lib/w06.mjs');
  const st = newBookState();
  const fx = lead('L01');
  const id = seedLead(st, fx);
  const r = await book(st, reqFor(fx, id), ms(fx.booking_request.requested_at));
  assert.equal(r.http_status ?? r.status, fx.expected.W05.http_status);
  assert.equal(st.w06.length, 1);
  const call = st.w06[0];
  assert.equal(call.op, 'booking', 'W06 Op? switch routes on op');
  assert.equal(call.lead_id, id);
  const ev = W6.normaliseEvent(call);
  assert.equal(ev.booking.id, call.booking_id);
  assert.equal(ev.booking.start, call.start);
  const legacy = W6.normaliseEvent({ event: 'booking', lead_id: id, booking_id: 'b1', start: call.start, method: 'teams' });
  assert.equal(legacy.op, 'booking', 'the older { event: booking } shape is still accepted');
  const W06WF = JSON.parse(readFileSync(new URL('../W06.json', import.meta.url), 'utf8'));
  const op = W06WF.nodes.find((n) => n.name === 'Op?');
  assert.match(JSON.stringify(op.parameters), /event === 'booking'/);
});

// F8 (REHEARSAL-L01): shared-fallback calendar id from calendar_status_detail, else SMC_SHARED_CALENDAR_ID; both empty ->
// fail-closed error item (never calendars//events) -> W22 shared_calendar_id_missing; a Graph 201 stores its id.
test('F8 W05.json shared calendar: empty id -> error item + alert, never an empty URL; stub response id -> graph_event_id', async () => {
  const { runCode: run } = await import('./_n8ncode.mjs');
  const wf5 = JSON.parse(readFileSync(new URL('../W05.json', import.meta.url), 'utf8'));
  const ctx = { now: Date.parse('2026-10-12T07:00:00Z'), broker: { id: 'b1', adviser_name: 'Mark Smith', practice_name: 'Synthetic Practice', calendar_mode: 'shared_fallback', calendar_status: 'ok', calendar_status_detail: {} }, lead: { id: 'l1', first_name: 'Lerato', phone: '+27820000001', language: 'en' } };
  const plan = { lead_id: 'l1', broker_id: 'b1', route: 'shared', method: 'phone', start: '2026-10-13T08:00:00.000Z', end: '2026-10-13T08:30:00.000Z', idempotency_key: 'book_f8', booked_via: 'page' };
  const decide = { ctx, dec: { plan }, lane: 'http' };
  const none = (await run(wf5, 'Event body (shared)', { refs: { 'Decide (w05.decide + MX)': decide }, env: {} }))[0].json;
  assert.equal(none.error, 'shared_calendar_id_missing');
  assert.equal(none.url, null);
  const gate = wf5.connections['Shared calendar id?'].main;
  assert.equal(gate[0][0].node, 'Graph create event (howzit@ shared calendar, ASSUMPTION)');
  assert.equal(gate[1][0].node, 'After event (w05.finish)', 'missing id skips Graph and goes straight to finish');
  assert.equal(wf5.connections['Event body (shared)'].main[0][0].node, 'Shared calendar id?');
  const row = { id: 'appt-1', broker_id: 'b1', cycle_id: null, booked_at: '2026-10-12T07:00:00.000Z', appointment_date: plan.start, ends_at: plan.end, method: 'phone', status: 'booked' };
  const fail = (await run(wf5, 'After event (w05.finish)', { json: none, refs: { 'Decide (w05.decide + MX)': decide, 'Insert appointment (re-check overlap + buffer, idempotent)': row } }))[0].json;
  assert.equal(fail.ev.reason, 'shared_calendar_id_missing');
  assert.equal(fail.f.appointment_update.graph_event_id, null);
  assert.equal(fail.f.alert.signal_key, 'shared_calendar_id_missing');
  assert.equal(fail.status, 201, 'the booking is kept');
  const envId = (await run(wf5, 'Event body (shared)', { refs: { 'Decide (w05.decide + MX)': decide }, env: { SMC_SHARED_CALENDAR_ID: 'env-cal', HOWZIT_MAILBOX: 'howzit@example.test' } }))[0].json;
  assert.equal(envId.url, 'https://graph.microsoft.com/v1.0/users/howzit%40example.test/calendars/env-cal/events');
  const det = { ...decide, ctx: { ...ctx, broker: { ...ctx.broker, calendar_status_detail: '{"shared_calendar_id":"synthetic-shared-cal"}' } } };
  const detId = (await run(wf5, 'Event body (shared)', { refs: { 'Decide (w05.decide + MX)': det }, env: { SMC_SHARED_CALENDAR_ID: 'env-cal' } }))[0].json;
  assert.match(detId.url, /\/calendars\/synthetic-shared-cal\/events$/, 'broker detail wins over env');
  assert.ok(detId.event && detId.event.subject);
  const ok = (await run(wf5, 'After event (w05.finish)', { json: { statusCode: 201, body: { id: 'AAMk-stub-1', iCalUId: 'ical-1' } }, refs: { 'Decide (w05.decide + MX)': det, 'Insert appointment (re-check overlap + buffer, idempotent)': row } }))[0].json;
  assert.equal(ok.f.appointment_update.graph_event_id, 'AAMk-stub-1');
  assert.equal(ok.f.alert, null);
  const save = wf5.nodes.find((n) => n.name === 'Save event ids + lead (stage, broker, cycle, invite email)');
  assert.match(save.parameters.query, /graph_event_id = NULLIF\(\$2, ''\)/);
  assert.match(save.parameters.options.queryReplacement, /u\.graph_event_id/);
  assert.throws(() => W5.graphEventUrl('shared', { sharedCalendarId: '' }), /shared_calendar_id_missing/);
});

test('I-54a F13 W05 -> W04: the is_free re-check carries {now, is_synthetic} only when Decide moved the clock (test_clock); production sends nothing extra', async () => {
  const shifted = Date.parse('2026-12-01T08:00:00+02:00');
  const lead1 = { id: 'lead-f13', first_name: 'Lerato', phone: '+27600000001', is_synthetic: true, broker_id: 'b1' };
  const brokerRow = { ...clone(broker()), calendar_status: 'ok' };
  const slot = '2026-12-08T10:00:00+02:00';
  const mk = (test_clock, now) => W5.decide({ lane: 'sub', req: { op: 'book', lead_id: lead1.id, slot_start: slot, method: 'phone', booked_via: 'list', idempotency_key: 'k-f13', context: {} }, lead: lead1, broker: brokerRow, existing: null, live: null, mx: {}, now, test_clock });
  const on = mk(true, shifted);
  assert.equal(on.action, 'check');
  assert.equal(on.is_free.is_synthetic, true);
  assert.equal(Date.parse(on.is_free.now), shifted);
  const off = mk(false, shifted);
  assert.ok(!('now' in off.is_free) && !('is_synthetic' in off.is_free));
  // end to end through W04: accepted past wall+14d with hooks, wall-relative (slot_taken) without
  const sub = W4.subcallInput(on.is_free);
  const run = (now) => W4.respond({ lane: 'sub', req: sub, broker: brokerRow, bookings: [], busy: [], route: 'graph', now, holidays: HOLIDAYS });
  assert.equal(run(W4.subClockFor(sub, { TEST_HOOKS_ENABLED: 'true' })).free, true);
  assert.equal(run(W4.subClockFor(sub, {})).free, false, 'same request without hooks stays on the wall clock');
  assert.equal(run(W4.subClockFor(W4.subcallInput(off.is_free), { TEST_HOOKS_ENABLED: 'true' })).free, false, 'non-synthetic stays on the wall clock');
  assert.ok(JSON.parse(readFileSync(new URL('../W04.json', import.meta.url), 'utf8')).nodes.find((n) => n.name === 'Plan (w04.planRequest)').parameters.jsCode.includes('subClockFor'));
});
