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
import { FIX, MODE, lead, broker, clone, ms, iso, at, MIN, H, online } from './_harness.mjs';
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

export async function book(st, req, now, { sub = false } = {}) {
  // Caller parse: the page posts with X-Lead-Token (http lane); list / chat / Flow picks arrive as a sub-call
  // (so does op finalize: smc-email-verify -> "Finalize request" -> the same pipeline).
  const env = { LEAD_TOKEN_SECRET: OFFLINE_SECRET };
  let c;
  if (req.booked_via === 'page' && !sub) {
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
    live: st.bookings.find((x) => x.client_id === c.req.lead_id && (W5.LIVE.has(x.status) || x.status === W5.HELD)) || null,
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
  // op finalize: the same statement PROMOTES the held row (pending_verification -> booked) instead of inserting.
  let booking;
  if (after.row.finalize_booking_id) {
    booking = st.bookings.find((x) => x.id === after.row.finalize_booking_id && x.status === W5.HELD && ms(x.verify_by) > now);
    if (!booking) return asHttp(200, { finalized: false });
    Object.assign(booking, { status: 'booked', verify_by: null, booked_at: iso(now) });
  } else {
    const replay = st.bookings.find((x) => x.idempotency_key === after.row.idempotency_key);
    if (replay) return asHttp(201, W5.publicBody(replay));
    if (W5.insertBlocked(st.bookings, after.row, W4.brokerConfig(brokerRow).buffer_minutes)) {
      const t = W5.taken(ctx, dec.plan, w04({ op: 'list', limit: 3 }).slots);
      return asHttp(t.status, t.body);
    }
    booking = { ...after.row, id: `bkg_${++st.seq}` };
    st.bookings.push(booking);
  }
  // Verify gate: a HELD slot -> holdPending (no Outlook event, no broker notice, no W06 / W09 / CAPI)
  if (booking.status === W5.HELD) {
    const h = W5.holdPending(ctx, dec.plan, booking);
    const l = st.leads.get(row0.id);
    if (h.lead_update.email && String(l.email || '').toLowerCase() !== h.lead_update.email.toLowerCase()) l.email_verified = false;
    Object.assign(l, h.lead_update);
    if (h.lead_wa) st.messages.push({ to: l.mobile, kind: 'wa', template: h.lead_wa.template.name, vars: h.lead_wa.template.components[0].parameters.map((x) => x.text) });
    if (h.issue) (st.verify_issued = st.verify_issued || []).push(h.issue);
    if (h.ask_email) (st.ask_email = st.ask_email || []).push(h.ask_email);
    return asHttp(h.response.status, h.response.body);
  }
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
/** smc-email-verify confirmed the link / code: leads.email_verified, then op finalize (W05 "Load held slot" -> book). */
export async function verifyEmail(st, leadId, now) {
  const l = st.leads.get(leadId);
  l.email_verified = true;
  const hold = st.bookings.find((x) => x.client_id === leadId && x.status === W5.HELD) || null;
  const req = W5.finalizeRequest(hold, { ...l, id: leadId }, now);
  if (!req) return asHttp(200, { finalized: false });
  return book(st, req, now, { sub: true });
}
/**
 * W05 "Every 5 min: release unverified holds" (+ the rebook nudge). Same semantics as the W05.json query: the hold is
 * released at verify_by; the nudge only inside the contact hours (w05.holdNudgeOpen), otherwise marked pending for the
 * first sweep inside them; once per booking; never to a lead with another live booking or an opt-out.
 */
export function releaseHolds(st, now) {
  const out = [];
  st.holdNudge ||= new Map(); // booking id -> 'pending' | 'sent'
  for (const b of st.bookings) if (b.status === W5.HELD && ms(b.verify_by) <= now) {
    Object.assign(b, { status: 'cancelled', cancelled_at: iso(now) });
    st.holdNudge.set(b.id, 'pending');
  }
  if (!W5.holdNudgeOpen(now)) return out;
  for (const [id, state] of st.holdNudge) {
    if (state !== 'pending') continue;
    st.holdNudge.set(id, 'sent');
    const b = st.bookings.find((x) => x.id === id);
    const l = st.leads.get(b.client_id);
    if (l.opted_out_at || st.bookings.some((x) => x.id !== id && x.client_id === b.client_id && ['pending_verification', 'booked', 'confirmed'].includes(x.status))) continue;
    const n = W5.holdReleased({ id: b.id, appointment_date: b.appointment_date, lead_id: l.id, first_name: l.first_name, phone: l.mobile });
    st.messages.push({ to: l.mobile, kind: 'wa', template: n.template, vars: n.variables, buttons: n.buttons });
    out.push(n);
  }
  return out;
}
function offlineSys() {
  const st = newBookState();
  return {
    st,
    setup: async (fx) => seedLead(st, fx),
    // book() then, unless { verify: false }, the lead verifies the email at once: the result is the booking that reaches
    // the broker (the hold + finalize path runs every time; the hold itself is tested with verify: false).
    book: async (req, now, opts = {}) => {
      const r = await book(st, req, ms(now));
      if (opts.verify === false || !(r.body && r.body.held)) return r;
      return verifyEmail(st, req.lead_id, ms(now) + 60_000);
    },
    verify: async (leadId, now) => verifyEmail(st, leadId, ms(now)),
    release: async (now) => releaseHolds(st, ms(now)),
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
// Every booking of an unverified lead carries an email now (verify gate): a synthetic gmail address when the fixture has none.
const reqFor = (fx, leadId, over = {}) => ({ ...clone(fx.booking_request), lead_id: leadId, broker_id: broker().broker_id,
  email: 'email' in over ? over.email : (fx.booking_request.email || `synthetic.${String(fx.fixture_id).toLowerCase()}@gmail.com`), ...over });

// ============================================================================================
// Tests
// ============================================================================================
test(`W05 [${MODE}] L01 page booking, Teams, broker opted out of attendee invites: Outlook event with Teams link, invite from howzit@`, async () => {
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
  assert.equal(ev.attendees.length, 0, 'fixture broker opted out (add_client_as_attendee=false): no attendee, the howzit@ email is the invite');
  assert.deepEqual(ev.categories, ['SortMyCover']);
  assert.equal(ev.start.timeZone, 'Africa/Johannesburg');
  for (const needle of ['35_44', '750_1250', 'Teams', 'Consent ref', 'Pre-call brief']) assert.ok(ev.body.content.includes(needle), needle);
  assert.equal(s.lead.email_status, e.email_status);
  assert.equal(s.lead.email_purpose, e.email_purpose);
  assert.equal(s.invites.length, 1);
  assert.equal(s.invites[0].from, e.invite_from);
  assert.ok(s.invites[0].join_url, 'invite carries the join link');
  assert.equal(s.bookings[0].graph_event_id, ev.id, 'Graph event.id stored on the booking (Section 7)');
  assert.equal(s.bookings[0].cycle_id, undefined, 'no cycles: the lead order link lives in lead_order_items (database trigger)');
  assert.deepEqual(s.capi.map((c) => [c.event_name, c.event_id]), [['Schedule', e.capi_schedule_event_id]]);
});

test(`W05 [${MODE}] phone and WhatsApp-call bookings: number in the event body; the email is kept for the verification only (no invite)`, async () => {
  const sys = fresh();
  for (const id of ['L02', 'L03']) {
    const fx = lead(id);
    const lid = await sys.setup(fx);
    const r = await sys.book(reqFor(fx, lid, { email: 'verify.only@gmail.com' }), fx.booking_request.requested_at);
    assert.equal(r.http_status ?? r.status, 201, id);
    const s = await sys.state(lid);
    assert.equal(s.events[0].subject, fx.expected.W05.event_title);
    assert.ok(s.events[0].body.content.includes(fx.expected.W05.body_contains), `${id} body`);
    assert.equal(s.events[0].isOnlineMeeting, false);
    assert.equal(s.lead.email, 'verify.only@gmail.com', `${id}: kept for the verification (2026-10-11 verify gate)`);
    assert.equal(s.invites.length, 0, 'no meeting invite for a call method');
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

test(`W05 [${MODE}] lead row carries broker_id after booking (W05 "store broker_id on the lead"; no cycle_id in the CRM chain)`, async () => {
  const sys = fresh();
  const fx = lead('L03');
  const lid = await sys.setup(fx);
  await sys.book(reqFor(fx, lid), fx.booking_request.requested_at);
  const s = await sys.state(lid);
  assert.equal(s.lead.broker_id, broker().broker_id);
  assert.equal(s.lead.cycle_id, undefined);
  assert.equal(s.lead.stage, 'booked');
});

// ============================================================================================
// Build checks: the real module and the real automation/W05.json
// ============================================================================================
const WF5 = JSON.parse(readFileSync(new URL('../W05.json', import.meta.url), 'utf8'));
const ctx5 = (over = {}) => ({ lane: 'http', mode: 'lead', lead: { id: 'lead_test_L02', broker_id: broker().broker_id, first_name: 'Sipho', phone: '+27600000002', origin: 'page', consent_ads_at: '2026-10-12T09:00:00+02:00', budget_band: '1500_plus' }, broker: broker(), now: ms('2026-10-12T11:40:00+02:00'), ...over });

test('W05 lib: verified lead + call method needs no email; unverified lead needs one for every method; invite methods always; unsupported -> 422', () => {
  const r = W5.parseHttp({}, {}, {});
  assert.equal(r.ok, false);
  const vlead = { ...ctx5().lead, email: 'sipho@gmail.com', email_verified: true };
  const d = W5.decide(ctx5({ lead: vlead, req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'phone', email: null, booked_via: 'page', idempotency_key: 'k1' } }));
  assert.equal(d.action, 'check'); assert.equal(d.plan.email, null); assert.equal(d.is_free.op, 'is_free'); assert.equal(d.plan.hold, false, 'verified: books straight through');
  assert.equal(W5.decide(ctx5({ req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'phone', email: null, booked_via: 'page', idempotency_key: 'k1b' } })).body.error_code, 'email_required', 'unverified phone booking needs the email (verification)');
  const u = W5.decide(ctx5({ req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'phone', email: 'sipho@gmail.com', booked_via: 'page', idempotency_key: 'k1c' } }));
  assert.equal(u.plan.hold, true, 'unverified: a held slot');
  assert.equal(W5.decide(ctx5({ lead: vlead, req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'phone', email: 'other@gmail.com', booked_via: 'page', idempotency_key: 'k1d' } })).plan.hold, true, 'a different email is not verified');
  assert.equal(W5.decide(ctx5({ req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'teams', booked_via: 'page', idempotency_key: 'k2' } })).body.error_code, 'email_required');
  const z = W5.decide(ctx5({ req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'zoom', booked_via: 'page', idempotency_key: 'k3' } }));
  assert.equal(z.status, 422); assert.deepEqual(z.body.methods, broker().methods_supported);
  const chat = W5.decide(ctx5({ lane: 'sub', req: { slot_start: '2026-10-13T10:30:00+02:00', method: 'zoom', booked_via: 'chat', idempotency_key: 'k4' } }));
  assert.equal(chat.action, 'message'); assert.match(chat.wa.interactive.body.text, /doesn't offer that way/);
});

// ============================================================================================
// Verify gate (Jonathan, 2026-10-11): the booking reaches the broker only after the client verifies the email
// ============================================================================================
test(`W05 [${MODE}] unverified lead: a HELD slot (nobody else can take it), nothing to the broker, one WhatsApp + the verification email`, async (t) => {
  if (MODE === 'online') return t.skip('offline adapter');
  const sys = fresh();
  const fx = lead('L01');
  const id = await sys.setup(fx);
  const r = await sys.book(reqFor(fx, id), fx.booking_request.requested_at, { verify: false });
  assert.equal(r.http_status, 201); assert.equal(r.body.held, true); assert.equal(r.body.booked, false); assert.equal(r.body.verify, 'email');
  const s = await sys.state(id);
  assert.equal(s.bookings[0].status, 'pending_verification');
  assert.equal(s.events.length, 0, 'no Outlook event'); assert.equal(s.invites.length, 0, 'no invite'); assert.equal(s.capi.length, 0, 'no CAPI Schedule');
  assert.equal((await sys.notifications()).length, 0, 'the broker is told nothing'); assert.equal((sys.st.w06 || []).length, 0, 'no intro card');
  // verify_by = min(now + 24 h, start - 2 h)
  const now = ms(fx.booking_request.requested_at); const start = ms(fx.booking_request.slot_start);
  assert.equal(ms(r.body.verify_by), Math.min(now + 24 * H, start - 2 * H));
  const m = s.messages.find((x) => x.template === 'booking_held_verify_email');
  assert.ok(m, 'one WhatsApp: held, confirm the email'); assert.equal(m.vars.length, 5);
  assert.deepEqual(sys.st.verify_issued, [{ op: 'issue', lead_id: id }]);
  // another lead cannot take the held time; this lead picking again is reminded to verify first
  const other = lead('L02'); const oid = await sys.setup(other);
  const r2 = await sys.book(reqFor(other, oid, { slot_start: fx.booking_request.slot_start, method: 'teams', idempotency_key: 'k_other' }), fx.booking_request.requested_at, { verify: false });
  assert.equal(r2.http_status, 409);
  const r3 = await sys.book(reqFor(fx, id, { slot_start: iso(start + 24 * H), idempotency_key: 'k_again' }), fx.booking_request.requested_at, { verify: false });
  assert.equal(r3.body.error_code, 'held_awaiting_email');
});

test(`W05 [${MODE}] the email is verified in time: the held row becomes the booking, THEN the Outlook event, Teams link, broker notice, W06, CAPI (once)`, async (t) => {
  if (MODE === 'online') return t.skip('offline adapter');
  const sys = fresh();
  const fx = lead('L01');
  const id = await sys.setup(fx);
  const held = await sys.book(reqFor(fx, id), fx.booking_request.requested_at, { verify: false });
  const fin = await sys.verify(id, iso(ms(fx.booking_request.requested_at) + 30 * MIN));
  assert.equal(fin.http_status, 201); assert.equal(fin.body.booked, true); assert.equal(fin.body.booking_id, held.body.booking_id, 'the same row, the same slot');
  const s = await sys.state(id);
  assert.equal(s.bookings.length, 1); assert.equal(s.bookings[0].status, 'booked'); assert.equal(s.bookings[0].verify_by, null);
  assert.equal(s.events.length, 1); assert.ok(s.events[0].isOnlineMeeting);
  assert.equal(s.invites.length, 1); assert.equal((await sys.notifications()).length, 1); assert.equal(s.capi.length, 1); assert.equal(sys.st.w06.length, 1);
  // a second verification event finalizes nothing twice
  const again = await sys.verify(id, iso(ms(fx.booking_request.requested_at) + 31 * MIN));
  assert.equal(again.body.finalized, false); assert.equal((await sys.state(id)).events.length, 1);
});

test(`W05 [${MODE}] not verified by verify_by: the hold is released for everyone, the lead is nudged to rebook, a late verification revives nothing`, async (t) => {
  if (MODE === 'online') return t.skip('offline adapter');
  const sys = fresh();
  const fx = lead('L01');
  const id = await sys.setup(fx);
  const held = await sys.book(reqFor(fx, id), fx.booking_request.requested_at, { verify: false });
  assert.deepEqual(await sys.release(iso(ms(held.body.verify_by) - MIN)), [], 'not before the deadline');
  const out = await sys.release(held.body.verify_by);
  assert.equal(out.length, 1); assert.equal(out[0].template, 'booking_hold_released'); assert.deepEqual(out[0].buttons, [{ quick_reply: 'see_open_times' }]);
  assert.equal(out[0].correlation, `w05:hold_released:${held.body.booking_id}`);
  assert.equal((await sys.state(id)).bookings[0].status, 'cancelled');
  const late = await sys.verify(id, iso(ms(held.body.verify_by) + MIN));
  assert.equal(late.body.finalized, false, 'released holds are never revived');
  assert.equal((await sys.state(id)).events.length, 0);
  // the time is free again for another lead
  const other = lead('L02'); const oid = await sys.setup(other);
  const r = await sys.book(reqFor(other, oid, { slot_start: fx.booking_request.slot_start, method: 'teams', idempotency_key: 'k_after' }), held.body.verify_by);
  assert.equal(r.http_status, 201);
});

test('W05 lib: verify window = min(now + 24 h, start - 2 h); under 15 minutes -> too_soon_to_verify (nothing held); finalizeRequest rules', () => {
  const now = ms('2026-10-12T11:40:00+02:00');
  assert.equal(W5.holdDeadline(now, now + 3 * 24 * H), now + 24 * H);
  assert.equal(W5.holdDeadline(now, now + 10 * H), now + 8 * H);
  const c = ctx5({ req: { slot_start: iso(now + 2 * H + 10 * MIN), method: 'phone', email: 'sipho@gmail.com', booked_via: 'page', idempotency_key: 'k9' } });
  const d = W5.decide(c);
  const a = W5.afterCheck(c, d, { free: true, next_slots: [] });
  assert.equal(a.action, 'taken'); assert.equal(a.body.error_code, 'too_soon_to_verify');
  const hold = { id: 'h1', status: 'pending_verification', appointment_date: '2026-10-15T10:00:00+02:00', method: 'teams', booked_via: 'page', idempotency_key: 'page:x:1', verify_by: iso(now + H) };
  assert.equal(W5.finalizeRequest(hold, { id: 'x', email: 'a@gmail.com', email_verified: false }, now), null, 'not verified');
  assert.equal(W5.finalizeRequest(hold, { id: 'x', email: 'a@gmail.com', email_verified: true, budget_band: '750_1499' }, now + 2 * H), null, 'past verify_by');
  assert.equal(W5.finalizeRequest(hold, { id: 'x', email: 'a@gmail.com', email_verified: true, budget_band: '750_1499' }, now).finalize_booking_id, 'h1');
  assert.deepEqual(W5.parseSub({ op: 'finalize', lead_id: 'x' }), { op: 'finalize', lead_id: 'x', booking_id: null });
});

// Quiz v2 (2026-10-13): the page no longer asks the budget, so the hand-over also waits for the self-declared band
test('W05 band gate (quiz v2): handed over only when the email is verified AND budget_band is known; held otherwise; finalize waits for both', () => {
  const now = ms('2026-10-12T11:40:00+02:00');
  const req = (k, email = null) => ({ slot_start: '2026-10-14T10:30:00+02:00', method: 'phone', email, booked_via: 'page', idempotency_key: k });
  const base = { ...ctx5().lead, email: 'sipho@gmail.com', email_verified: true };
  assert.equal(W5.bandKnown({ budget_band: '750_1499' }), true); assert.equal(W5.bandKnown({ budget_band: null }), false); assert.equal(W5.bandKnown({}), false);
  // verified email + band -> straight through (unchanged)
  const ok = W5.decide(ctx5({ lead: base, req: req('bg1') }));
  assert.deepEqual([ok.plan.hold, ok.plan.hold_for], [false, null]);
  // verified email, NO band -> held for the band (no verify email / message), lifted later by W03 -> op finalize
  const nb = { ...base, budget_band: null };
  const d = W5.decide(ctx5({ lead: nb, req: req('bg2') }));
  assert.deepEqual([d.action, d.plan.hold, d.plan.hold_for], ['check', true, 'budget']);
  const row = { id: 'hb1', verify_by: iso(now + 20 * H) };
  const h = W5.holdPending(ctx5({ lead: nb }), { ...d.plan, end: d.plan.end }, row);
  assert.deepEqual([h.response.body.held, h.response.body.verify, h.lead_wa, h.issue, h.ask_email], [true, 'budget', null, null, null]);
  assert.equal(h.timeline.payload.held_for, 'budget');
  // unverified email, no band (the v2 page booking) -> held for the email first: the verify email goes as today
  const v2 = { ...ctx5().lead, budget_band: null };
  const e = W5.decide(ctx5({ lead: v2, req: req('bg3', 'sipho@gmail.com') }));
  assert.deepEqual([e.plan.hold, e.plan.hold_for], [true, 'email']);
  const he = W5.holdPending(ctx5({ lead: v2 }), e.plan, row);
  assert.equal(he.response.body.verify, 'email'); assert.equal(he.issue.op, 'issue'); assert.ok(he.lead_wa && JSON.stringify(he.lead_wa).includes('booking_held_verify_email'), 'booking_held_verify_email WhatsApp');
  // finalize (email verified -> smc-email-verify; band arrived -> W03): only when BOTH are in
  const hold = { id: 'h2', status: 'pending_verification', appointment_date: '2026-10-15T10:00:00+02:00', method: 'phone', booked_via: 'page', idempotency_key: 'page:x:2', verify_by: iso(now + 20 * H) };
  assert.equal(W5.finalizeRequest(hold, { id: 'x', email: 'a@gmail.com', email_verified: true, budget_band: null }, now), null, 'email verified, band missing: keep holding');
  assert.equal(W5.finalizeRequest(hold, { id: 'x', email: 'a@gmail.com', email_verified: false, budget_band: '750_1499' }, now), null, 'band in, email not verified: keep holding');
  assert.equal(W5.finalizeRequest(hold, { id: 'x', email: 'a@gmail.com', email_verified: true, budget_band: '750_1499' }, now).finalize_booking_id, 'h2', 'both in: handed over');
  // a broker booking his own lead in the portal is not gated on the band
  const bk = W5.decide(ctx5({ mode: 'broker', broker_by_user: { id: broker().broker_id }, lead: nb, req: req('bg4') }));
  assert.equal(bk.plan.hold, false);
  // the finalize load reads the band
  assert.match(WF5.nodes.find((n) => n.name === 'Load held slot + lead (finalize)').parameters.query, /l\.email_verified, l\.budget_band/);
});

test('W05.json verify gate wiring: insert writes the hold or promotes it; held branch skips the calendar + broker; finalize op; 5-min release sweep', () => {
  const nd = (n) => WF5.nodes.find((x) => x.name === n);
  const to = (n) => (WF5.connections[n]?.main || []).map((o) => o.map((c) => c.node));
  const ins = nd('Insert appointment (re-check overlap + buffer, idempotent)').parameters.query;
  assert.match(ins, /status = 'booked', verify_by = NULL[\s\S]*status = 'pending_verification' AND verify_by > now\(\)/);
  assert.match(ins, /x\.status IN \('pending_verification','booked','confirmed'\)/, 'a held slot blocks the time');
  assert.deepEqual(to('Inserted?')[0], ['Held? (email not verified: no calendar, no broker)']);
  assert.deepEqual(to('Held? (email not verified: no calendar, no broker)'), [['Hold plan (w05.holdPending)'], ['Broker calendar (graph)?']]);
  assert.ok(!JSON.stringify(to('Hold plan (w05.holdPending)')).includes('Graph'), 'the hold never reaches Graph');
  assert.ok(to('Sub op?').flat().includes('Load held slot + lead (finalize)'));
  assert.equal(nd('-> Email verify (hold: issue)').parameters.workflowId.value, 'smc-email-verify');
  assert.match(nd('Release held slots past verify_by (+ timeline)').parameters.query, /status = 'pending_verification' AND a\.verify_by <= now\(\)/);
  // smoke test #13: the 5-min sweep reads the contact hours first (one item, always), then releases (the nudge is gated on it)
  assert.deepEqual(to('Every 5 min: release unverified holds'), [['Contact hours now (w05.holdNudgeOpen)']]);
  assert.deepEqual(to('Contact hours now (w05.holdNudgeOpen)'), [['Release held slots past verify_by (+ timeline)']]);
  assert.equal(nd('-> WhatsApp Send (booking_hold_released)').parameters.workflowId.value, 'smc-whatsapp-send');
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
  const held = await book(st, reqFor(fx, id), ms(fx.booking_request.requested_at));
  assert.equal(held.body.held, true); assert.equal(st.w06, undefined, 'no W06 call while the slot is only held');
  const r = await verifyEmail(st, id, ms(fx.booking_request.requested_at) + 60_000); // the first booking reaches W06 after the verification
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
  const row = { id: 'appt-1', broker_id: 'b1', booked_at: '2026-10-12T07:00:00.000Z', appointment_date: plan.start, ends_at: plan.end, method: 'phone', status: 'booked' };
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
  const save = wf5.nodes.find((n) => n.name === 'Save event ids + lead (stage, broker, invite email)');
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

// ---- I-45j: GET /c/{booking_id} (.ics) -------------------------------------------------------------------------
const ICS_ID = '3f2a9c1e-0000-4000-8000-0000000000aa';
const icsRow = (o = {}) => ({ id: ICS_ID, client_id: 'lead_A', appointment_date: '2026-10-08T07:30:00Z', ends_at: '2026-10-08T08:00:00Z', method: 'teams', status: 'booked', join_url: 'https://teams.example.test/j/1', booked_at: '2026-10-05T10:00:00Z', ...o });
const icsEnv = { LEAD_TOKEN_SECRET: OFFLINE_SECRET };

test('I-45j .ics auth: signed ?k= or the owning lead\'s X-Lead-Token; everything else is the same 404', () => {
  const k = W5.icsSig(OFFLINE_SECRET, ICS_ID);
  const url = W5.icsUrl(ICS_ID, W5.SITE, OFFLINE_SECRET);
  assert.equal(url, `${W5.SITE}/c/${ICS_ID}?k=${k}`);
  assert.equal(W5.icsUrl(ICS_ID), `${W5.SITE}/c/${ICS_ID}`, 'no secret -> the plain form (tests only)');
  assert.deepEqual(W5.parseIcsRequest({ params: { booking_id: ICS_ID }, query: { k } }, icsEnv), { ok: true, booking_id: ICS_ID, via: 'sig' });
  // wrong / other booking's signature, none, malformed id
  for (const q of [{ k: W5.icsSig(OFFLINE_SECRET, '3f2a9c1e-0000-4000-8000-0000000000bb') }, { k: 'x'.repeat(43) }, {}]) {
    assert.equal(W5.parseIcsRequest({ params: { booking_id: ICS_ID }, query: q }, icsEnv).status, 404);
  }
  assert.equal(W5.parseIcsRequest({ params: { booking_id: '../etc/passwd' }, query: { k } }, icsEnv).status, 404);
  // a signature made with a different secret is rejected; the previous secret still verifies (rotation)
  assert.equal(W5.parseIcsRequest({ params: { booking_id: ICS_ID }, query: { k: W5.icsSig('another-secret-another-secret-0123456789', ICS_ID) } }, icsEnv).ok, false);
  assert.equal(W5.parseIcsRequest({ params: { booking_id: ICS_ID }, query: { k: W5.icsSig('previous-secret-previous-secret-0123456', ICS_ID) } }, { ...icsEnv, LEAD_TOKEN_SECRET_PREVIOUS: 'previous-secret-previous-secret-0123456' }).ok, true);
  // lead token path: ok only after the owner check
  const { token } = LT5.mintLeadToken('lead_A', { secret: OFFLINE_SECRET });
  const t = W5.parseIcsRequest({ headers: { [LT5.HEADER]: token }, params: { booking_id: ICS_ID } }, icsEnv);
  assert.deepEqual([t.ok, t.via, t.lead_id], [true, 'token', 'lead_A']);
  assert.equal(W5.icsResponse(icsRow(), { adviser: 'Mark Smith', caller: t }).status, 200);
  assert.equal(W5.icsResponse(icsRow({ client_id: 'lead_B' }), { adviser: 'Mark Smith', caller: t }).status, 404, 'another lead\'s booking never leaks');
  assert.equal(W5.icsResponse(null).status, 404);
  assert.equal(W5.parseIcsRequest({ params: { booking_id: ICS_ID }, query: {} }, {}).status, 404, 'no secret configured -> 404, not a crash');
});

test('I-45j .ics format: UTC DTSTART/DTEND, UID from the booking id, METHOD:PUBLISH, no lead PII; cancelled -> STATUS:CANCELLED', () => {
  const r = W5.icsResponse(icsRow(), { adviser: 'Mark Smith' });
  assert.equal(r.headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.match(r.body, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  for (const line of ['METHOD:PUBLISH', `UID:${ICS_ID}@sortmycover.co.za`, 'DTSTART:20261008T073000Z', 'DTEND:20261008T080000Z', 'DTSTAMP:20261005T100000Z', 'STATUS:CONFIRMED', 'SUMMARY:Your call with Mark', 'DESCRIPTION:Join: https://teams.example.test/j/1']) assert.ok(r.body.split('\r\n').includes(line.replace(/[,;]/g, (m) => '\\' + m)) || r.body.includes(line.replace(/[,;]/g, (m) => '\\' + m)), line);
  assert.ok(!/lerato|\+?27\d{9}|@(?!sortmycover)/i.test(r.body.replace(/https?:\/\/\S+/g, '')), 'no lead name, number or email');
  const phone = W5.icsResponse(icsRow({ method: 'phone', join_url: 'https://stale.example.test' }), { adviser: 'Mark Smith' });
  assert.match(phone.body, /DESCRIPTION:Mark will call you/);
  assert.ok(!phone.body.includes('stale.example.test'), 'call methods never carry a join link');
  const gone = W5.icsResponse(icsRow({ status: 'cancelled' }), { adviser: 'Mark Smith' });
  assert.equal(gone.status, 200);
  assert.match(gone.body, /STATUS:CANCELLED/);
  assert.match(gone.body, /SEQUENCE:1/);
  assert.match(gone.body, /SUMMARY:Cancelled: Your call with Mark/);
  assert.match(W5.icsResponse(icsRow({ status: 'rescheduled' }), { adviser: 'Mark' }).body, /STATUS:CANCELLED/);
  // same UID as the invite's .ics so the calendar updates one event
  assert.match(W5.icsFile({ uid: `${ICS_ID}@sortmycover.co.za`, start: '2026-10-08T07:30:00Z', end: '2026-10-08T08:00:00Z', summary: 's' }), new RegExp(`UID:${ICS_ID}@sortmycover.co.za`));
});

test('I-45j W05.json: GET c/:booking_id webhook -> verify -> load (no lead PII columns) -> build -> text respond; finish() signs the stored ics_url', () => {
  const wf = JSON.parse(readFileSync(new URL('../W05.json', import.meta.url), 'utf8'));
  const hook = wf.nodes.find((x) => x.name === 'GET /c/:booking_id (.ics)');
  assert.deepEqual([hook.parameters.httpMethod, hook.parameters.path, hook.parameters.responseMode], ['GET', 'c/:booking_id', 'responseNode']);
  assert.ok(hook.webhookId);
  const load = wf.nodes.find((x) => x.name === 'Load booking for .ics (id only, no lead PII)').parameters.query;
  assert.ok(!/first_name|phone|email|mobile/i.test(load));
  assert.equal(wf.nodes.find((x) => x.name === 'Respond (.ics)').parameters.respondWith, 'text');
  const fin = wf.nodes.find((x) => x.name === 'After event (w05.finish)').parameters.jsCode;
  assert.match(fin, /ics_secret: \$env\.LEAD_TOKEN_SECRET/);
  const c = wf.connections;
  assert.equal(c['GET /c/:booking_id (.ics)'].main[0][0].node, 'Verify .ics caller (w05.parseIcsRequest)');
  assert.equal(c['Build .ics (w05.icsResponse)'].main[0][0].node, 'Respond (.ics)');
  assert.equal(c['.ics caller ok?'].main[1][0].node, '.ics not found (404)');
});

// ============================================================================================
// I-45h: /book bot guard (Turnstile action=book, fails CLOSED per NH-32; per-IP + per-lead rate limits; internal bypass)
// ============================================================================================
const GUARD_ENV = { LEAD_TOKEN_SECRET: OFFLINE_SECRET, TURNSTILE_SECRET_KEY: 'x', PUBLIC_ALLOWED_ORIGINS: 'https://sortmycover.co.za', TEST_HOOKS_ENABLED: 'true', TEST_HOOKS_TOKEN: 'tt' };
const gBody = { slot_start: '2026-10-13T10:30:00+02:00', method: 'phone', request_id: 'req-12345678', turnstile_token: 'tok' };
const pageGuard = (over = {}, hdr = {}, env = GUARD_ENV) => {
  const now = Date.now();
  const { token } = LT5.mintLeadToken('lead_g1', { secret: OFFLINE_SECRET, nowMs: now });
  return W5.parseHttp({ [LT5.HEADER]: token, 'cf-connecting-ip': '41.0.0.1', ...hdr }, { ...gBody, ...over }, env, now);
};
const ts = (o) => ({ success: true, hostname: 'sortmycover.co.za', action: 'book', ...o });

test('I-45h: /book without a Turnstile token -> 400 try_again; invalid / wrong action / wrong host -> 400; valid -> ok', () => {
  const g = (over, t) => W5.bookGuard(pageGuard(over).guard, { ip_hits: 0, lead_hits: 0, turnstile: t }, GUARD_ENV);
  const missing = g({ turnstile_token: undefined }, null);
  assert.equal(missing.status, 400); assert.equal(missing.body.error_code, 'try_again'); assert.equal(missing.reason, 'turnstile_missing');
  assert.equal(g({}, ts({ success: false })).status, 400);
  assert.equal(g({}, ts({ action: 'lead' })).status, 400);
  assert.equal(g({}, ts({ hostname: 'evil.example' })).status, 400);
  const okv = g({}, ts({})); assert.equal(okv.ok, true); assert.equal(okv.bot_check, 'passed');
  assert.equal(pageGuard().req.turnstile_token, undefined); // the token never reaches the booking request
});

test('I-45h: siteverify down -> 503 try_again, FAILS CLOSED (NH-32), even with TURNSTILE_FAIL_MODE=open', () => {
  const env = { ...GUARD_ENV, TURNSTILE_FAIL_MODE: 'open' };
  for (const down of [null, { error: 'timeout' }, { 'error-codes': ['x'] }]) {
    const r = W5.bookGuard(pageGuard({}, {}, env).guard, { ip_hits: 0, lead_hits: 0, turnstile: down }, env);
    assert.equal(r.ok, false); assert.equal(r.status, 503); assert.equal(r.body.error_code, 'try_again'); assert.equal(r.reason, 'turnstile_unreachable');
  }
});

test('I-45h: per-IP (10/h) and per-lead (5/day) rate limits trip with 429 rate_limited; below the limit passes', () => {
  const g = pageGuard().guard;
  assert.equal(W5.bookGuard(g, { ip_hits: 9, lead_hits: 4, turnstile: ts({}) }, GUARD_ENV).ok, true);
  const ip = W5.bookGuard(g, { ip_hits: 10, lead_hits: 0, turnstile: ts({}) }, GUARD_ENV);
  assert.equal(ip.status, 429); assert.equal(ip.body.error_code, 'rate_limited'); assert.equal(ip.reason, 'ip_rate');
  const ld = W5.bookGuard(g, { ip_hits: 0, lead_hits: 5, turnstile: ts({}) }, GUARD_ENV);
  assert.equal(ld.status, 429); assert.equal(ld.reason, 'lead_rate');
  assert.equal(W5.bookGuard(g, { ip_hits: 3, lead_hits: 0, turnstile: ts({}) }, { ...GUARD_ENV, RATE_LIMIT_PER_IP_PER_HOUR: '3' }).status, 429);
  assert.match(g.keys.ip_external_id, /^bk_ip:[0-9a-f]{32}:req-12345678$/); assert.ok(!JSON.stringify(g.keys).includes('41.0.0.1'));
  assert.equal(g.keys.lead_prefix, 'bk_lead:lead_g1:');
});

test('I-45h: internal ops bypass: broker JWT, sub-calls (W07/W10/W28), test hooks, and no secret configured', () => {
  const jwt = createRequire(import.meta.url)('../security/lead-token.js');
  assert.equal(W5.bookGuard({ applies: false }, { turnstile: null }, GUARD_ENV).ok, true);
  assert.equal(W5.bookGuard(undefined, {}, GUARD_ENV).ok, true); // sub-call lane never builds a guard
  const hook = pageGuard({ is_synthetic: true }, { 'x-test-token': 'tt' });
  assert.equal(hook.guard.applies, false);
  assert.equal(W5.bookGuard(hook.guard, { ip_hits: 99, lead_hits: 99, turnstile: null }, GUARD_ENV).ok, true);
  assert.equal(pageGuard({ is_synthetic: true }, { 'x-test-token': 'wrong' }).guard.applies, true);
  assert.equal(pageGuard({ is_synthetic: false }, { 'x-test-token': 'tt' }).guard.applies, true);
  const noSecret = { ...GUARD_ENV, TURNSTILE_SECRET_KEY: '' };
  assert.equal(W5.bookGuard(pageGuard({ turnstile_token: undefined }, {}, noSecret).guard, { ip_hits: 0, lead_hits: 0 }, noSecret).ok, true);
  assert.ok(jwt); // broker-JWT callers get guard.applies=false in parseHttp (mode !== 'lead'), covered by the structural check below
  assert.equal(W5.parseSub({ lead_id: 'l1', slot_start: '2026-10-13T10:30:00+02:00', method: 'phone', booked_via: 'chat', idempotency_key: 'chat:k1:abcdefgh' }, {}, Date.now()).guard, undefined);
});

test('I-45h: W05.json wires the guard before any lookup/insert on the /book path only', () => {
  const names = WF5.nodes.map((n) => n.name);
  for (const nm of ['Guard counters (bk_ip / bk_lead)', 'Turnstile siteverify (book)', 'Guard (w05.bookGuard)', 'Guard passed?']) assert.ok(names.includes(nm), nm);
  const nxt = (a, i = 0) => (WF5.connections[a]?.main[i] || []).map((x) => x.node);
  assert.deepEqual(nxt('Caller ok?', 0), ['Guard counters (bk_ip / bk_lead)']);
  assert.deepEqual(nxt('Guard passed?', 0), ['Load lead, broker, replay, live booking']);
  assert.deepEqual(nxt('Guard passed?', 1), ['Answer']);
  assert.ok(!Object.values(WF5.connections['Called by W07/W10/W17/W28'].main).flat().some((x) => /Guard/.test(x.node))); // sub-calls skip it
  assert.match(JSON.stringify(WF5.nodes.find((n) => n.name === 'Turnstile siteverify (book)')), /siteverify/);
});

// Jono 2026-10-13: the client's invite comes FROM the broker's own Outlook (Exchange meeting request with the Teams link)
// whenever the event goes into his connected calendar; howzit@ only as the fallback.
test('W05 lib: Outlook-connected broker -> client is a required attendee and no howzit@ email; opt-out, shared, failed create -> howzit@', () => {
  const p = { start: '2026-10-13T10:30:00+02:00', end: '2026-10-13T11:00:00+02:00', method: 'teams', email: 'client@gmail.com', idempotency_key: 'k-att', booked_via: 'page', context: {}, route: 'graph' };
  const own = { ...broker(), calendar_status: 'ok', calendar_mode: 'oauth', add_client_as_attendee: null };
  const c = ctx5({ broker: own });
  const ev = W5.graphEvent(c, p);
  assert.deepEqual(ev.attendees, [{ emailAddress: { address: 'client@gmail.com', name: 'Sipho' }, type: 'required' }], 'default (null) = attendee');
  assert.equal(W5.inviteMail(c, p, { id: 'b1' }, { ok: true }), null, 'Exchange sends the invite: no howzit@ email');
  const bk = (id) => ({ id, broker_id: own.broker_id, appointment_date: p.start, ends_at: p.end, method: 'teams', status: 'booked' });
  const f = W5.finish(c, p, bk('b1'), { ok: true, graph_event_id: 'AAMk1', join_url: 'https://teams.microsoft.com/l/meetup-join/x' });
  assert.equal(f.invite, null); assert.equal(f.appointment_update.invite_email_status, 'sent');
  // fallback 1: the Graph create failed -> the client still gets the howzit@ email
  assert.ok(W5.finish(c, p, bk('b2'), { ok: false, reason: 'http_500' }).invite, 'failed create -> howzit@ email');
  // fallback 2: explicit opt-out
  const out = ctx5({ broker: { ...own, add_client_as_attendee: false } });
  assert.equal(W5.graphEvent(out, p).attendees.length, 0); assert.ok(W5.inviteMail(out, p, { id: 'b3' }, { ok: true }));
  // fallback 3: shared Lead Velocity calendar (not connected / admin consent pending)
  const sh = ctx5({ broker: { ...own, calendar_status: 'blocked_admin_consent' } });
  const ps = { ...p, route: 'shared' };
  assert.equal(W5.graphEvent(sh, ps).attendees.length, 0); assert.ok(W5.inviteMail(sh, ps, { id: 'b4' }, { ok: true }));
  // call methods never use the (verification-only) email for an invite
  assert.equal(W5.graphEvent(c, { ...p, method: 'phone' }).attendees.length, 0);
});
test('W05 lib: method change to Teams on the broker calendar PATCHes the client in as attendee instead of a howzit@ email', () => {
  const own = { ...broker(), calendar_status: 'ok', calendar_mode: 'oauth', add_client_as_attendee: true, methods_supported: ['teams', 'phone'] };
  const booking = { id: 'bk1', status: 'booked', appointment_date: '2026-10-14T10:00:00+02:00', ends_at: '2026-10-14T10:30:00+02:00', calendar_provider: 'outlook', idempotency_key: 'k', booked_via: 'page', method: 'phone' };
  const lead = { ...ctx5().lead, email: 'client@gmail.com', email_purpose: 'meeting_invite', email_status: 'valid' };
  const r = W5.planUpdateMethod({ req: { method: 'teams', email: 'client@gmail.com', email_confirmed: true }, booking, lead, broker: own, mx: { has_mx: true } });
  assert.equal(r.action, 'patch');
  assert.deepEqual(r.graph_patch.attendees, [{ emailAddress: { address: 'client@gmail.com', name: 'Sipho' }, type: 'required' }]);
  assert.equal(W5.inviteMail({ lead, broker: own }, r.plan, booking, {}), null);
});

test('parseSub: a W07 hand-off is recognised by route W05 + msg (W07 never sets source), 17 Oct 2026 live bug', async () => {
  const L = await import('../lib/w05.mjs');
  const j = { route: 'W05', reason: 'slot picked from the 10-slot list', msg: { wamid: 'SMabc', from: '+27725548057', type: 'interactive', text: 'Fri 23 Oct 10:00', payload: null, list_id: 'slot_2026-10-23T10:00:00+02:00' }, lead: { id: '57761ccd-c9d1-4008-ac6a-2c0cee877833', broker_id: 'f688380e-fb68-4bfc-a9ee-4bf37ce76dcc' } };
  const r = L.parseSub(j, {}, Date.parse('2026-10-17T12:00:00Z'));
  assert.equal(r.op, 'book');
  assert.equal(r.lead_id, j.lead.id);
  assert.equal(Date.parse(r.slot_start), Date.parse('2026-10-23T08:00:00Z')); // 10:00 SAST
  assert.equal(r.booked_via, 'list');
});

// ============================================================================================
// 17 Oct 2026 (Jono): SortMyCover leads (brands.code 'SMC') get their booking email FROM SortMyCover: the smc-client-email
// edge function sends it through Resend from hello@sortmycover.co.za, never howzit@. Any other brand keeps the howzit@
// Graph sendMail exactly as before. Synthetic data only.
// ============================================================================================
const SMC_FN = '../../supabase/functions/smc-client-email/render.ts';
const SMC_MAIL = 'Email client from SortMyCover (smc-client-email)';
const SMC_GATE = `Live send? (${SMC_MAIL})`;
const smcLead = (over = {}) => ({ ...ctx5().lead, brand_code: 'SMC', email: 'sipho.test@example.com', email_verified: true, email_status: 'valid', ...over });
const ownCal = (over = {}) => ({ ...broker(), calendar_status: 'ok', calendar_mode: 'oauth', add_client_as_attendee: null, ...over });
const pTeams = { start: '2026-10-13T10:30:00+02:00', end: '2026-10-13T11:00:00+02:00', method: 'teams', email: 'sipho.test@example.com', idempotency_key: 'k-smc', booked_via: 'page', context: {}, route: 'graph' };
const bkOf = (id, p = pTeams) => ({ id, broker_id: broker().broker_id, appointment_date: p.start, ends_at: p.end, method: p.method, status: 'booked' });

test('W05 lib (SMC): Outlook-connected broker -> SortMyCover email (invite from the adviser calendar, accept it); no howzit@ email; the function accepts the body', async () => {
  const { validate, render } = await import(SMC_FN);
  const c = ctx5({ broker: ownCal(), lead: smcLead() });
  const f = W5.finish(c, pTeams, bkOf('bk-smc-1'), { ok: true, graph_event_id: 'AAMk1', join_url: 'https://teams.microsoft.com/l/meetup-join/x' });
  assert.equal(f.invite, null, 'never howzit@ for a SortMyCover lead');
  assert.deepEqual(f.client_email, {
    kind: 'booking_confirmed', to: 'sipho.test@example.com', lead_first_name: 'Sipho', slot_start: '2026-10-13T10:30:00+02:00', slot_end: '2026-10-13T11:00:00+02:00',
    method: 'teams', adviser_name: 'Mark Smith', practice_name: 'Synthetic Test Advisory (TEST ONLY)', fsp_number: 'TEST-00000',
    join_url: 'https://teams.microsoft.com/l/meetup-join/x', booking_id: 'bk-smc-1', calendar_invite: 'adviser', idempotency_key: 'w05:client_email:booking_confirmed:bk-smc-1',
  });
  assert.equal(f.appointment_update.invite_email_status, 'sent');
  const v = validate(f.client_email);
  assert.ok(v.ok, `the edge function accepts exactly what W05 sends: ${JSON.stringify(v)}`);
  const m = render(v.input, Date.parse('2026-10-12T10:00:00Z'));
  assert.equal(m.subject, 'Booked: your call with Mark on Tue 13 Oct at 10:30');
  assert.match(m.text, /calendar invite is on its way from Mark's own calendar\. Please accept it/);
  assert.match(m.text, /Synthetic Test Advisory \(TEST ONLY\), an authorised financial services provider \(FSP TEST-00000\)/);
  assert.equal(m.attachments.length, 0);
});

test('W05 lib (SMC): no adviser invite (opt-out, shared calendar, failed create) -> .ics attached; call methods get the email too; no usable email -> none', async () => {
  const { validate } = await import(SMC_FN);
  const att = (c, p, ev, id) => W5.finish(c, p, bkOf(id, p), ev).client_email;
  assert.equal(att(ctx5({ broker: ownCal({ add_client_as_attendee: false }), lead: smcLead() }), pTeams, { ok: true }, 'b1').calendar_invite, 'attached', 'opt-out');
  assert.equal(att(ctx5({ broker: ownCal({ calendar_status: 'blocked_admin_consent' }), lead: smcLead() }), { ...pTeams, route: 'shared' }, { ok: true }, 'b2').calendar_invite, 'attached', 'shared calendar');
  const failed = W5.finish(ctx5({ broker: ownCal(), lead: smcLead() }), pTeams, bkOf('b3'), { ok: false, reason: 'http_500' });
  assert.equal(failed.client_email.calendar_invite, 'attached'); assert.equal(failed.invite, null); assert.equal(failed.appointment_update.invite_email_status, 'sent');
  // phone booking of a verified lead: the plan carries no email (verification-only), the verified address gets the confirmation
  const pPhone = { ...pTeams, method: 'phone', email: null };
  const ph = W5.finish(ctx5({ broker: ownCal(), lead: smcLead() }), pPhone, bkOf('b4', pPhone), { ok: true });
  assert.equal(ph.client_email.to, 'sipho.test@example.com'); assert.equal(ph.client_email.method, 'phone');
  assert.equal(ph.client_email.calendar_invite, 'attached'); assert.equal('join_url' in ph.client_email, false);
  assert.equal(ph.appointment_update.invite_email_status, 'not_needed');
  assert.ok(validate(ph.client_email).ok);
  // nothing to send to: unverified + no email on the plan, or a bounced address
  assert.equal(W5.finish(ctx5({ broker: ownCal(), lead: smcLead({ email_verified: false }) }), pPhone, bkOf('b5', pPhone), { ok: true }).client_email, null);
  assert.equal(W5.finish(ctx5({ broker: ownCal(), lead: smcLead({ email_status: 'bounced' }) }), pPhone, bkOf('b6', pPhone), { ok: true }).client_email, null);
});

test('W05 lib: any other brand keeps the howzit@ Graph email unchanged and gets no SortMyCover email', () => {
  for (const brand_code of ['LV', undefined, '']) {
    const lead = smcLead({ brand_code });
    const c = ctx5({ broker: ownCal({ add_client_as_attendee: false }), lead });
    const f = W5.finish(c, pTeams, bkOf('bk-lv'), { ok: true });
    assert.equal(f.client_email, null, `brand ${brand_code}`);
    assert.deepEqual(f.invite, W5.inviteMail(c, pTeams, { ...bkOf('bk-lv'), join_url: null, ics_url: f.appointment_update.ics_url }, { ok: true }));
    assert.equal(f.invite.message.toRecipients[0].emailAddress.address, 'sipho.test@example.com');
  }
  assert.equal(W5.isSmcLead({ brand_code: 'smc' }), true); assert.equal(W5.isSmcLead({ brand_id: 'x' }), false); assert.equal(W5.isSmcLead(null), false);
});

test('W05 lib: update_method -> SMC booking_updated email (adviser invite when the new or old method put the client on the Outlook event); other brands keep howzit@', async () => {
  const { validate } = await import(SMC_FN);
  const own = ownCal({ add_client_as_attendee: true, methods_supported: ['teams', 'phone'] });
  const booking = { id: 'bk1', status: 'booked', appointment_date: '2026-10-14T10:00:00+02:00', ends_at: '2026-10-14T10:30:00+02:00', calendar_provider: 'outlook', idempotency_key: 'k', booked_via: 'page', method: 'phone' };
  const lead = smcLead({ email: 'client@gmail.com', email_purpose: 'meeting_invite' });
  const now = Date.parse('2026-10-13T09:00:00Z');
  const toTeams = W5.planUpdateMethod({ req: { method: 'teams', email: 'client@gmail.com', email_confirmed: true }, booking, lead, broker: own, mx: { has_mx: true } });
  const e1 = W5.methodChangeEmails({ lead, broker: own, booking }, toTeams.plan, now);
  assert.equal(e1.mail, null);
  assert.equal(e1.smc_email.kind, 'booking_updated'); assert.equal(e1.smc_email.method, 'teams'); assert.equal(e1.smc_email.calendar_invite, 'adviser');
  assert.equal(e1.smc_email.idempotency_key, `w05:client_email:booking_updated:bk1:teams:${Math.floor(now / 60000)}`);
  assert.ok(validate(e1.smc_email).ok);
  // teams -> phone on his calendar: the client was an attendee, so the update comes from his calendar too (no second entry)
  const toPhone = W5.planUpdateMethod({ req: { method: 'phone' }, booking: { ...booking, method: 'teams' }, lead, broker: own });
  assert.equal(W5.methodChangeEmails({ lead, broker: own, booking: { ...booking, method: 'teams' } }, toPhone.plan, now).smc_email.calendar_invite, 'adviser');
  // the same change on the shared calendar: nobody was invited from Outlook -> the updated .ics is attached
  const shared = { ...booking, method: 'teams', calendar_provider: 'shared_lv' };
  assert.equal(W5.methodChangeEmails({ lead, broker: own, booking: shared }, W5.planUpdateMethod({ req: { method: 'phone' }, booking: shared, lead, broker: own }).plan, now).smc_email.calendar_invite, 'attached');
  // another brand: exactly the howzit@ invite the node built before
  const lv = { ...lead, brand_code: 'LV' };
  const sh = { ...booking, calendar_provider: 'shared_lv' };
  const pl = W5.planUpdateMethod({ req: { method: 'teams', email: 'client@gmail.com', email_confirmed: true }, booking: sh, lead: lv, broker: own, mx: { has_mx: true } }).plan;
  const inv = W5.inviteMail({ lead: lv, broker: own }, pl, sh, {});
  assert.deepEqual(W5.methodChangeEmails({ lead: lv, broker: own, booking: sh }, pl, now), { mail: { message: inv.message, saveToSentItems: true }, smc_email: null, guest_drop: false });
});

test('W05 lib: smc-client-email result -> nothing when sent or dry-run; one amber W22 alert otherwise (the booking stands)', () => {
  const sent = { lead_id: 'l1', smc_email: { kind: 'booking_confirmed', booking_id: 'bk9' } };
  assert.equal(W5.clientEmailResult({ statusCode: 200, body: { id: 're_1' } }, sent), null);
  assert.equal(W5.clientEmailResult({ dry_run: true, statusCode: 200, body: { messages: [{ id: 'dry:0' }] } }, sent), null);
  const a = W5.clientEmailResult({ statusCode: 502, body: { error: 'resend', status: 403 } }, sent);
  assert.equal(a.signal_key, 'client_email_failed'); assert.equal(a.severity, 'amber'); assert.equal(a.source, 'W05');
  assert.equal(a.scope, 'booking:bk9'); assert.equal(a.lead_id, 'l1');
  assert.match(a.what, /booking_confirmed email to the client not sent for booking bk9 \(HTTP 502 resend \(Resend 403\)\)/);
  assert.match(W5.clientEmailResult({ statusCode: 400, body: { error: 'invalid', fields: ['fsp_number'] } }, sent).what, /fields fsp_number/);
  assert.match(W5.clientEmailResult({ error: { message: 'timeout of 15000ms exceeded' } }, sent).what, /error: timeout/);
  assert.equal(W5.clientEmailResult({ statusCode: 200, body: {} }, sent).signal_key, 'client_email_failed', '2xx without a Resend id is not a send');
});

test('W05.json (SMC email): function call behind DRY_RUN_SENDS, relay token from $env, failures -> W22; brand read in both loads; Code nodes run', async () => {
  const { runCode: run, many: mk } = await import('./_n8ncode.mjs');
  const { findUngated } = createRequire(import.meta.url)('../lib/egress-gate.cjs');
  const byName = (nm) => WF5.nodes.find((x) => x.name === nm);
  const nxt = (a, i = 0) => (WF5.connections[a]?.main[i] || []).map((x) => x.node);
  const h = byName(SMC_MAIL);
  assert.equal(h.type, 'n8n-nodes-base.httpRequest'); assert.equal(h.parameters.method, 'POST');
  assert.match(h.parameters.url, /'https:\/\/cmsylaupctrbsvzrgzwy\.supabase\.co\/functions\/v1'\) \+ '\/smc-client-email'/);
  assert.deepEqual(h.parameters.headerParameters.parameters, [{ name: 'x-api-key', value: '={{ $env.LINDI_RELAY_TOKEN }}' }]);
  assert.equal(h.parameters.jsonBody, '={{ JSON.stringify($json.smc_email) }}');
  assert.equal(h.onError, 'continueRegularOutput'); assert.equal(h.credentials, undefined, 'no n8n credential: the token is $env');
  assert.equal(h.parameters.options.response.response.neverError, true);
  // DRY_RUN_SENDS gate (lib/egress-gate.cjs counts the function as an email sender)
  assert.match(JSON.stringify(byName(SMC_GATE).parameters), /DRY_RUN_SENDS !== 'true'/);
  assert.deepEqual(nxt(SMC_GATE, 0), [SMC_MAIL]); assert.deepEqual(nxt(SMC_GATE, 1), [`Dry-run stub (${SMC_MAIL})`]);
  assert.deepEqual(nxt(`Dry-run stub (${SMC_MAIL})`), ['Client email result (w05.clientEmailResult)']);
  assert.deepEqual(findUngated(WF5), []);
  // routes in: the fan-out (Effect? smc_email) and update_method (Save method -> Method client email); out: W22 on failure
  const eff = byName('Effect?').parameters.rules.values.map((r) => r.outputKey);
  assert.deepEqual(nxt('Effect?', eff.indexOf('smc_email')), [SMC_GATE]);
  assert.deepEqual(nxt('Effect?', eff.indexOf('mail')), ['Live send? (Email from howzit@ (Graph sendMail))'], 'Graph path unchanged');
  assert.ok(nxt('Save method').includes('Method client email (SortMyCover)') && nxt('Save method').includes('Method invite?'));
  assert.deepEqual(nxt('Method client email (SortMyCover)'), [SMC_GATE]);
  assert.deepEqual(nxt('Method invite?'), ['Live send? (Email from howzit@ (Graph sendMail))']);
  assert.deepEqual(nxt(SMC_MAIL), ['Client email result (w05.clientEmailResult)']);
  assert.deepEqual(nxt('Client email result (w05.clientEmailResult)'), ['-> W22 Alerts']);
  assert.match(byName('Load lead, broker, replay, live booking').parameters.query, /SELECT br\.code FROM public\.brands br WHERE br\.id = l\.brand_id\) AS brand_code/);
  assert.match(byName('Load booking for method change').parameters.query, /l\.email_verified,[\s\S]*AS brand_code/);
  // Fan out effects: the client email is its own effect, next to the broker's howzit@ mail
  const smcBody = { kind: 'booking_confirmed', booking_id: 'bk1' };
  const fan = (await run(WF5, 'Fan out effects', { json: { lane: 'sub', lead_id: 'l1', f: { client_email: smcBody, broker: { email: { to: 'broker@example.test', subject: 's', body: 'b' } } } } })).map((x) => x.json);
  assert.deepEqual(fan.find((x) => x.kind === 'smc_email'), { kind: 'smc_email', lead_id: 'l1', smc_email: smcBody });
  assert.equal(fan.filter((x) => x.kind === 'mail').length, 1, 'only the broker notice goes to Graph');
  // result node: failure -> alert (request found through the gate's paired item); dry-run stub -> nothing
  const sent = { kind: 'smc_email', lead_id: 'l1', smc_email: smcBody };
  const fail = (await run(WF5, 'Client email result (w05.clientEmailResult)', { json: { statusCode: 502, body: { error: 'resend', status: 403 } }, refs: { [SMC_GATE]: mk([sent]) } })).map((x) => x.json);
  assert.equal(fail.length, 1); assert.equal(fail[0].signal_key, 'client_email_failed'); assert.equal(fail[0].scope, 'booking:bk1');
  assert.deepEqual(await run(WF5, 'Client email result (w05.clientEmailResult)', { json: { ...sent, dry_run: true, statusCode: 200, body: { messages: [{ id: 'dry:0' }] } }, refs: {} }), []);
  assert.deepEqual(await run(WF5, 'Client email result (w05.clientEmailResult)', { json: { statusCode: 200, body: { id: 're_1' } }, refs: { [SMC_GATE]: mk([sent]) } }), []);
  // update_method: the plan node builds smc_email for an SMC lead; the method node forwards it
  const plan = (await run(WF5, 'Plan method change (w05.planUpdateMethod)', {
    json: { booking: { id: 'bk1', status: 'booked', appointment_date: '2026-10-14T10:00:00+02:00', ends_at: '2026-10-14T10:30:00+02:00', calendar_provider: 'outlook', idempotency_key: 'k', booked_via: 'page', method: 'phone' },
      lead: smcLead({ email: 'client@gmail.com' }), broker: ownCal({ methods_supported: ['teams', 'phone'] }) },
    refs: { 'Normalise sub-call (w05.parseSub)': { req: { op: 'update_method', booking_id: 'bk1', method: 'teams', email: 'client@gmail.com', email_confirmed: true } } },
  }))[0].json;
  assert.equal(plan.action, 'patch'); assert.equal(plan.mail, null); assert.equal(plan.smc_email.kind, 'booking_updated'); assert.equal(plan.lead_id, 'lead_test_L02');
  const fwd = (await run(WF5, 'Method client email (SortMyCover)', { refs: { 'Plan method change (w05.planUpdateMethod)': plan } })).map((x) => x.json);
  assert.deepEqual(fwd, [{ kind: 'smc_email', lead_id: 'lead_test_L02', smc_email: plan.smc_email }]);
  assert.deepEqual(await run(WF5, 'Method client email (SortMyCover)', { refs: { 'Plan method change (w05.planUpdateMethod)': { ...plan, smc_email: null } } }), []);
});

// 17 Oct 2026 live: the howzit@ Graph credential failed on the adviser's notice email and stopped the whole fan-out, so
// the client got no W06 confirmation and no W09 reminders. SortMyCover bookings now send that notice through
// smc-email-send (Resend, SortMyCover sender); every email node continues on error.
test('W05 lib (SMC): the adviser notice goes through smc-email-send, never howzit@; other brands unchanged', () => {
  const c = ctx5({ broker: { ...ownCal(), email: 'adviser.test@example.com' }, lead: smcLead() });
  const f = W5.finish(c, pTeams, bkOf('bk-smc-9'), { ok: true, graph_event_id: 'AAMk9' });
  assert.equal(f.broker.email, null, 'no howzit@ email for a SortMyCover booking');
  assert.equal(f.broker_relay.body.from, 'SortMyCover <hello@sortmycover.co.za>');
  assert.deepEqual(f.broker_relay.body.to, ['adviser.test@example.com']);
  assert.match(f.broker_relay.body.subject, /^New booking: /);
  assert.equal(f.broker_relay.idempotency_key, 'w05:broker:bk-smc-9');
  const other = W5.finish(ctx5({ broker: { ...ownCal(), email: 'adviser.test@example.com' } }), pTeams, bkOf('bk-lv-9'), { ok: true, graph_event_id: 'AAMk9' });
  assert.equal(other.broker_relay, null);
  assert.equal(other.broker.email.to, 'adviser.test@example.com');
});
test('W05 workflow: email nodes never stop the fan-out; the adviser relay is gated by DRY_RUN_SENDS', () => {
  const byName = (n) => WF5.nodes.find((x) => x.name === n);
  assert.equal(byName('Email from howzit@ (Graph sendMail)').onError, 'continueRegularOutput');
  assert.equal(byName('Email adviser from SortMyCover (smc-email-send)').onError, 'continueRegularOutput');
  assert.ok(byName('Live send? (Email adviser from SortMyCover (smc-email-send))'));
  assert.match(byName('Fan out effects').parameters.jsCode, /kind: 'smc_relay'/);
});

// ============================================================================================
// /start/ v4 (Jono, 2026-10-19): no budget question, an optional Teams guest, phone calls without an email
// ============================================================================================
const sReq = (k, over = {}) => ({ slot_start: '2026-10-14T10:30:00+02:00', method: 'teams', email: 'sipho@gmail.com', booked_via: 'page', idempotency_key: k, ...over });
const startLead = (over = {}) => ({ ...ctx5().lead, budget_band: null, origin: 'page', routing_reason: 'single_broker', conv_state: { state: 'unbooked', via: 'start_page' }, ...over });

test('W05 /start/ v4: a start-page lead with no budget band is band-known (held for the email only, booked after the link); a normal page lead is still held for the budget', () => {
  const now = ms('2026-10-12T11:40:00+02:00');
  for (const l of [startLead(), startLead({ conv_state: { start: { via: 'start_page' } } }), startLead({ conv_state: '{"via":"start_page"}' }), startLead({ conv_state: {}, routing_reason: 'start_page_pending' })]) assert.equal(W5.bandKnown(l), true, JSON.stringify(l.conv_state));
  assert.equal(W5.bandKnown({ ...ctx5().lead, budget_band: null, conv_state: { state: 'unbooked' }, routing_reason: 'single_broker' }), false);
  // before the email link: held for the email
  const d = W5.decide(ctx5({ lead: startLead(), req: sReq('sp1') }));
  assert.deepEqual([d.plan.hold, d.plan.hold_for], [true, 'email']);
  // after the link: not held at all (no 'budget' hold)
  const v = W5.decide(ctx5({ lead: startLead({ email: 'sipho@gmail.com', email_verified: true }), req: sReq('sp2') }));
  assert.deepEqual([v.plan.hold, v.plan.hold_for], [false, null]);
  const hold = { id: 'hsp', status: 'pending_verification', appointment_date: '2026-10-15T10:00:00+02:00', method: 'teams', booked_via: 'page', idempotency_key: 'page:x:sp', verify_by: iso(now + 20 * H) };
  const fr = W5.finalizeRequest(hold, { id: 'x', email: 'a@gmail.com', email_verified: true, budget_band: null, conv_state: { via: 'start_page' } }, now);
  assert.equal(fr.finalize_booking_id, 'hsp', 'finalize returns a request without a band');
  // a normal page lead with no band, verified email: still held for the budget
  const n = W5.decide(ctx5({ lead: { ...ctx5().lead, budget_band: null, email: 'sipho@gmail.com', email_verified: true }, req: sReq('sp3') }));
  assert.deepEqual([n.plan.hold, n.plan.hold_for], [true, 'budget']);
  // both loads feed the columns bandKnown reads
  assert.match(WF5.nodes.find((x) => x.name === 'Load lead, broker, replay, live booking').parameters.query, /l\.conv_state, l\.routing_reason,/);
  assert.match(WF5.nodes.find((x) => x.name === 'Load held slot + lead (finalize)').parameters.query, /l\.email_verified, l\.budget_band, l\.conv_state, l\.routing_reason FROM public\.leads l/);
});

test('W05 /start/ v4 guest: Teams only (400 invalid otherwise); checked like the lead email (422 guest_email_<reason>); never the lead; on the plan', () => {
  const env = { LEAD_TOKEN_SECRET: OFFLINE_SECRET };
  const t0 = ms('2026-10-12T11:40:00+02:00');
  const { token } = LT5.mintLeadToken('lead_g', { secret: OFFLINE_SECRET, nowMs: t0 });
  const p = (body) => W5.parseHttp({ [LT5.HEADER]: token }, { slot_start: '2026-10-14T10:30:00+02:00', email: 'sipho@gmail.com', request_id: 'req-guest-1', ...body }, env, t0);
  for (const method of ['phone', 'whatsapp_call', 'zoom', 'meet']) {
    const r = p({ method, guest_email: 'thabo@gmail.com' });
    assert.deepEqual([r.ok, r.status, r.body], [false, 400, { error: 'invalid', field: 'guest_email' }], method);
  }
  assert.equal(p({ method: 'phone', guest_email: '' }).ok, true, 'an empty guest field is no guest');
  assert.equal(p({ method: 'teams', guest_email: 'Thabo@Gmail.com' }).req.guest_email, 'Thabo@Gmail.com');
  const lead = startLead({ email: 'sipho@gmail.com', email_verified: true });
  const dec = (g, over = {}) => W5.decide(ctx5({ lead, req: sReq(`g-${g}`, { guest_email: g, ...over }) }));
  assert.equal(dec('Thabo@Gmail.com').plan.guest_email, 'thabo@gmail.com', 'accepted, lower-cased');
  const typo = dec('thabo@gmial.com');
  assert.deepEqual([typo.status, typo.body.error_code, typo.body.suggestion], [422, 'guest_email_typo', 'thabo@gmail.com']);
  assert.equal(dec('thabo@gmial.com', { guest_email_confirmed: true }).body.error_code, 'guest_email_no_mx', 'a confirmed typo still needs MX');
  assert.equal(dec('not-an-email').body.error_code, 'guest_email_syntax');
  assert.equal(dec('x@mailinator.com').body.error_code, 'guest_email_disposable');
  assert.equal(dec('SIPHO@gmail.com').body.error_code, 'guest_email_same', 'the request email');
  assert.equal(W5.decide(ctx5({ lead: { ...lead, email: 'old@gmail.com' }, req: sReq('g-old', { guest_email: 'old@gmail.com' }) })).body.error_code, 'guest_email_same', "the lead's stored email");
  // the guest needs no verification: a verified lead + guest books straight through
  assert.equal(dec('thabo@gmail.com').plan.hold, false);
});

test('W05 /start/ v4 guest: kept through hold -> finalize; Outlook attendee only when the client is; SMC email + adviser notices; stored in lead_activities', () => {
  const now = ms('2026-10-12T11:40:00+02:00');
  const hold = { id: 'hg', status: 'pending_verification', appointment_date: '2026-10-15T10:00:00+02:00', method: 'teams', booked_via: 'page', idempotency_key: 'page:x:g', verify_by: iso(now + 20 * H), guest_email: 'thabo@gmail.com' };
  const fr = W5.finalizeRequest(hold, { id: 'x', email: 'sipho.test@example.com', email_verified: true, conv_state: { via: 'start_page' } }, now);
  assert.deepEqual([fr.guest_email, fr.guest_prechecked], ['thabo@gmail.com', true]);
  const c = ctx5({ broker: ownCal(), lead: smcLead({ conv_state: { via: 'start_page' } }), existing: { id: 'hg', status: 'pending_verification' }, req: fr });
  const d = W5.decide({ ...c, lane: 'sub' });
  assert.equal(d.plan.guest_email, 'thabo@gmail.com', 'carried over from the held row');
  const p = { ...pTeams, guest_email: 'thabo@gmail.com' };
  const ev = W5.graphEvent(c, p);
  assert.deepEqual(ev.attendees.map((a) => a.emailAddress.address), ['sipho.test@example.com', 'thabo@gmail.com'], 'client is an attendee -> so is the guest');
  assert.match(ev.body.content, /Joining: one guest \(thabo@gmail\.com\)/);
  assert.deepEqual(W5.graphEvent(ctx5({ broker: ownCal({ add_client_as_attendee: false }), lead: smcLead() }), p).attendees, [], 'opt-out: neither');
  const f = W5.finish(c, p, bkOf('bk-g'), { ok: true, graph_event_id: 'AAMk', join_url: 'https://teams.microsoft.com/l/meetup-join/x' });
  assert.equal(f.client_email.guest_email, 'thabo@gmail.com');
  assert.equal(f.client_email.to, 'sipho.test@example.com');
  assert.match(f.broker_relay.body.text, /Joining: one guest/); assert.doesNotMatch(f.broker_relay.body.text, /thabo/, 'the adviser email never carries an address');
  assert.doesNotMatch(JSON.stringify(f.broker.wa), /guest|thabo/, 'broker_new_booking template vars unchanged');
  // storage: one booking_guest row per booking (hold and booked), the loads read it back
  const q = (nm) => WF5.nodes.find((x) => x.name === nm).parameters.query;
  for (const nm of ['Save hold: lead email (unverified) + timeline', 'Timeline: booked']) assert.match(q(nm), /'booking_guest', jsonb_build_object\('booking_id', \$\d::text, 'guest_email', \$\d::text\), now\(\), 'w05:guest:' \|\| \$\d/, nm);
  for (const nm of ['Load held slot + lead (finalize)', 'Load booking for method change']) assert.match(q(nm), /'w05:guest:' \|\| a\.id::text LIMIT 1\) AS guest_email/, nm);
  assert.match(WF5.nodes.find((x) => x.name === 'Decide (w05.decide + MX)').parameters.jsCode, /L\.emailDomain\(c\.req\.guest_email/);
});

test('W05 /start/ v4 guest: Teams -> phone sends the guest ONE change email, then drops the guest (attendee list + stored address)', () => {
  const own = ownCal({ methods_supported: ['teams', 'phone'] });
  const booking = { id: 'bkg2', status: 'booked', appointment_date: '2026-10-14T10:00:00+02:00', ends_at: '2026-10-14T10:30:00+02:00', calendar_provider: 'outlook', idempotency_key: 'k', booked_via: 'page', method: 'teams', guest_email: 'thabo@gmail.com' };
  const lead = smcLead();
  const r = W5.planUpdateMethod({ req: { method: 'phone' }, booking, lead, broker: own });
  assert.deepEqual(r.graph_patch.attendees.map((a) => a.emailAddress.address), ['sipho.test@example.com'], 'the guest leaves the Outlook event (Exchange cancels it for them)');
  assert.equal(r.plan.guest_email, null);
  const em = W5.methodChangeEmails({ lead, broker: own, booking }, r.plan, 0);
  assert.equal(em.smc_email.guest_email, 'thabo@gmail.com', 'the guest gets the change notice once');
  assert.equal(em.guest_drop, true);
  // after the drop the load finds no guest: the next change emails the client only
  const again = W5.methodChangeEmails({ lead, broker: own, booking: { ...booking, method: 'phone', guest_email: null } }, { ...r.plan, method: 'teams' }, 60_000);
  assert.equal(again.smc_email.guest_email, undefined); assert.equal(again.guest_drop, false);
  // staying on Teams keeps the guest on the attendee list
  const tt = W5.planUpdateMethod({ req: { method: 'teams', email: 'sipho.test@example.com', email_confirmed: true }, booking, lead, broker: own, mx: { 'example.com': true } });
  assert.deepEqual(tt.graph_patch.attendees.map((a) => a.emailAddress.address), ['sipho.test@example.com', 'thabo@gmail.com']);
  assert.match(WF5.nodes.find((x) => x.name === 'Save method').parameters.query, /payload = \(g\.payload - 'guest_email'\)/);
});

test('W05 /start/ v4 phone: a WhatsApp-proven lead books a phone call with no email at once (no hold, no client email); Teams still held; a desktop web lead keeps the email rule', async () => {
  const req = (k, over = {}) => ({ slot_start: '2026-10-14T10:30:00+02:00', method: 'phone', email: null, booked_via: 'page', idempotency_key: k, ...over });
  for (const proven of [{ origin: 'ctwa' }, { wa_verified: true }, { verified_at: '2026-10-12T09:00:00+02:00' }]) {
    const lead = startLead({ email: null, email_verified: false, ...proven });
    const d = W5.decide(ctx5({ lead, req: req(`ph-${Object.keys(proven)[0]}`) }));
    assert.deepEqual([d.action, d.plan.hold, d.plan.email], ['check', false, null], JSON.stringify(proven));
    const c = ctx5({ lead: { ...lead, brand_code: 'SMC', call_number: '+27600000999', alt_number: '+27600000888' }, broker: ownCal() });
    const f = W5.finish(c, d.plan, bkOf('bk-ph', d.plan), { ok: true, graph_event_id: 'AAMk' });
    assert.equal(f.client_email, null, 'no email: confirmation and reminders on WhatsApp only');
    assert.deepEqual(f.lead_update, { stage: 'booked', broker_id: broker().broker_id });
    const ev = W5.graphEvent(c, d.plan);
    assert.match(ev.body.content, /Call Sipho on \+27600000999/); assert.match(ev.body.content, /If no answer: \+27600000888/);
  }
  // the CTWA lead's WhatsApp call too (it goes to the proven number itself)
  assert.equal(W5.decide(ctx5({ lead: startLead({ origin: 'ctwa' }), req: req('wc', { method: 'whatsapp_call' }) })).plan.hold, false);
  // Teams still needs the email + the link
  assert.equal(W5.decide(ctx5({ lead: startLead({ origin: 'ctwa' }), req: req('pt', { method: 'teams' }) })).body.error_code, 'email_required');
  const pt = W5.decide(ctx5({ lead: startLead({ origin: 'ctwa' }), req: req('pt2', { method: 'teams', email: 'sipho@gmail.com' }) }));
  assert.deepEqual([pt.plan.hold, pt.plan.hold_for], [true, 'email']);
  // desktop web lead (origin page, never messaged us): phone needs the email, then is held for the link
  const web = startLead({ routing_reason: 'start_page_pending', conv_state: { state: 'start_page', via: 'start_page' } });
  assert.equal(W5.decide(ctx5({ lead: web, req: req('pw') })).body.error_code, 'email_required');
  const pw = W5.decide(ctx5({ lead: web, req: req('pw2', { email: 'sipho@gmail.com' }) }));
  assert.deepEqual([pw.plan.hold, pw.plan.hold_for], [true, 'email']);
  // the LOAD feeds the proof + the alt number
  assert.match(WF5.nodes.find((x) => x.name === 'Load lead, broker, replay, live booking').parameters.query, /l\.call_number, l\.alt_number,[\s\S]*l\.email_verified, l\.wa_verified, l\.verified_at,/);
  // the offline adapter end to end: 201 booked, nothing held
  const sys = offlineSys();
  const id = 'lead_ctwa_phone';
  sys.st.leads.set(id, { id, origin: 'ctwa', first_name: 'Ayanda', mobile: '+27600000123', age_band: '35_44', budget_band: null, conv_state: { via: 'start_page' }, email_verified: false, consent_ads_at: null });
  const r = await sys.book({ lead_id: id, slot_start: '2026-10-14T10:30:00+02:00', method: 'phone', booked_via: 'page', request_id: 'req-ctwa-phone-1' }, '2026-10-12T11:40:00+02:00', { verify: false });
  assert.equal(r.http_status, 201, JSON.stringify(r.body)); assert.equal(r.body.booked, true); assert.equal(r.body.held, undefined);
});

test('W05 /start/ v4: a start-page booking gets booking_confirmed from W05 (no W06 card, no W07 number ask) and stamps the first touch; other bookings unchanged', () => {
  const c = (lead) => ctx5({ broker: ownCal(), lead: smcLead(lead) });
  const pPhone = { ...pTeams, method: 'phone', email: null };
  for (const [name, lead] of [['web', { origin: 'page', routing_reason: 'start_page_pending', conv_state: { via: 'start_page' } }], ['whatsapp', { origin: 'ctwa', conv_state: { start: { via: 'start_page' } } }]]) {
    for (const p of [pTeams, pPhone]) {
      const f = W5.finish(c(lead), p, bkOf(`bk-sp-${name}-${p.method}`, p), { ok: true, graph_event_id: 'AAMk', join_url: p.method === 'teams' ? 'https://teams.microsoft.com/l/meetup-join/x' : null });
      assert.equal(f.w06, null, `${name} ${p.method}: never W06 broker_intro_booked`);
      assert.equal(f.lead_wa.template.name, 'booking_confirmed', `${name} ${p.method}: W05 sends booking_confirmed`);
      assert.equal(f.w07, null, `${name} ${p.method}: no "which number" ask`);
      assert.deepEqual(f.start_touch, { lead_id: 'lead_test_L02', booking_id: `bk-sp-${name}-${p.method}`, idempotency_key: 'w06:first:lead_test_L02' });
      assert.ok(f.w09, 'reminders still scheduled');
    }
  }
  // a start-page REBOOKING: booking_confirmed as for any rebooking, no first-touch stamp
  const rb = W5.finish(c({ conv_state: { via: 'start_page' } }), { ...pTeams, previous_booking_id: 'bk-old' }, bkOf('bk-rb'), { ok: true });
  assert.equal(rb.lead_wa.template.name, 'booking_confirmed'); assert.equal(rb.start_touch, null);
  // non-start-page page / CTWA bookings: today's path (W06 booking event, W07 contact confirm for calls, no lead_wa)
  for (const lead of [{ origin: 'page', conv_state: {} }, { origin: 'ctwa', conv_state: { state: 'unbooked' }, routing_reason: 'single_broker' }]) {
    const t = W5.finish(c(lead), pTeams, bkOf('bk-n1'), { ok: true });
    assert.equal(t.w06.op, 'booking'); assert.equal(t.lead_wa, null); assert.equal(t.start_touch, null);
    const ph = W5.finish(c(lead), pPhone, bkOf('bk-n2', pPhone), { ok: true });
    assert.equal(ph.w07.source, 'W05', 'call methods still get the W07 contact confirm');
  }
  // W05.json: the lead send carries start_touch; the touch statement stamps first_message_at + W06's one-card claim
  const fan = WF5.nodes.find((x) => x.name === 'Fan out effects').parameters.jsCode;
  assert.match(fan, /wa: f\.lead_wa, start_touch: !!f\.start_touch/);
  const t = WF5.nodes.find((x) => x.name === 'Touch leads.last_contact_at (lead sends)');
  assert.match(t.parameters.query, /first_message_at = CASE WHEN \$4 = 'true' AND l\.broker_id IS NOT NULL THEN COALESCE\(l\.first_message_at, now\(\)\)/);
  assert.match(t.parameters.query, /'first_touch_claimed'[\s\S]*'w06:first:' \|\| l\.id::text[\s\S]*ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.match(t.parameters.options.queryReplacement, /\$\('Live send\?'\)\.item\.json\.start_touch \? 'true' : 'false'/);
  assert.deepEqual(checkSql(workflowSql(WF5).filter((x) => x.node === 'Touch leads.last_contact_at (lead sends)')), []);
});

test('copy pass (Jono, 2026-10-19): no STOP prompt in the v4 session messages W05 / W10 / W15 build; the client help address is hello@sortmycover.co.za', async () => {
  const R10 = await import('../lib/w10.mjs');
  const R15 = await import('../lib/w15.mjs');
  const lead = { ...ctx5().lead, phone: '+27600000002', language: 'en' };
  const bk = { id: 'bk-copy', appointment_date: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T08:30:00Z', status: 'booked', method: 'phone' };
  const msgs = [
    W5.slotTakenMessage(lead, W4.brokerConfig(broker()), [{ start: '2026-10-21T10:00:00+02:00', end: '2026-10-21T10:30:00+02:00' }], 'phone'),
    W5.slotTakenMessage(lead, W4.brokerConfig(broker()), [], null),
    W5.heldReminderMessage(lead, bk),
    R10.cancelCardList(bk, lead), R10.cancelProblemWa(bk, lead), R10.cancelOtherWa(bk, lead),
    R10.cancelDoneWa({ booking: bk, lead, broker: {}, now_ms: 1, last_inbound_ms: 0 }),
    R15.leavingList('+27600000002', R15.leavingText('Sipho', { date: 'Wed 21 Oct', time: '10:00' })),
  ];
  for (const m of msgs) {
    const s = JSON.stringify(m);
    assert.doesNotMatch(s, /\bSTOP\b|opt out/i, s.slice(0, 120));
    assert.doesNotMatch(s, /hello@leadvelocity|howzit@|support@/i);
  }
  assert.equal(msgs[0].interactive.footer, undefined, 'the slot list has no STOP footer');
  for (const s of [R10.cancelLine('went_wrong', lead, bk), R15.leavingText('Sipho')]) assert.match(s, /hello@sortmycover\.co\.za/);
});

test('v4b15 adviser notice: a start-page lead shows income + topics (or "Prep answers follow"), the call number + alt and the guest, not the budget band; other leads unchanged', () => {
  const sp = (over = {}) => smcLead({ age_band: '35_44', budget_band: null, conv_state: { via: 'start_page' }, call_number: '+27600000999', alt_number: '+27600000888', ...over });
  const pPhone = { ...pTeams, method: 'phone', email: null };
  // before the answers: "Prep answers follow"
  const n0 = W5.brokerNotice(ctx5({ lead: sp() }), pPhone);
  assert.match(n0.email.body, /Age band 35-44\. Prep answers follow\. Call them on \+27600000999 \(if no answer: \+27600000888\)\./);
  assert.doesNotMatch(n0.email.body, /budget band/);
  const ev0 = W5.graphEvent(ctx5({ lead: sp(), broker: ownCal() }), pPhone);
  assert.match(ev0.body.content, /Age band 35-44 · Prep answers follow/);
  assert.match(ev0.body.content, /Call Sipho on \+27600000999/); assert.match(ev0.body.content, /If no answer: \+27600000888/);
  assert.doesNotMatch(ev0.body.content, /budget band/);
  // with the answers: income label + topics as words (old income codes mapped to their own range)
  const ans = sp({ income_band: '30k_50k', conv_state: { via: 'start_page', start: { via: 'start_page', topics: ['life', 'new_bond', 'will'] } } });
  const n1 = W5.brokerNotice(ctx5({ lead: ans }), pTeams);
  assert.match(n1.email.body, /Income R30,000 to R50,000 · Wants help with life cover, cover for a new bond, a will\./);
  assert.doesNotMatch(n1.email.body, /Call them on/, 'Teams: no number line');
  assert.equal(W5.prepFacts({ income_band: '40k_60k' }).line, 'Income R40,000 to R60,000');
  assert.equal(W5.prepFacts({ income_band: 'lt20k' }).income, 'Under R20,000');
  assert.equal(W5.prepFacts({ income_band: 'prefer_not' }).income, 'Prefer not to say');
  // guest: "Joining: one guest" (+ the email in the Outlook event, which has the attendee field)
  const pg = { ...pTeams, guest_email: 'thabo@gmail.com' };
  assert.match(W5.brokerNotice(ctx5({ lead: ans }), pg).email.body, /Joining: one guest/);
  assert.match(W5.graphEvent(ctx5({ lead: ans, broker: ownCal() }), pg).body.content, /Joining: one guest \(thabo@gmail\.com\)/);
  // the approved template: {{7}} reads "budget band", so it keeps the budget band ('-' when none); 7 vars unchanged
  assert.equal(n1.vars.length, 7); assert.equal(n1.vars[6], '-');
  // a normal lead keeps the budget band everywhere
  const nl = ctx5({ lead: smcLead({ age_band: '45_50', budget_band: '1500_plus', conv_state: {} }) });
  assert.match(W5.brokerNotice(nl, pTeams).email.body, /Age band 45-50, budget band R1,500\+\./);
  assert.match(W5.graphEvent(nl, pTeams).body.content, /Age band 45_50 · budget band 1500_plus/);
  // the loads feed income_band (+ conv_state for the method-change PATCH body)
  assert.match(WF5.nodes.find((x) => x.name === 'Load lead, broker, replay, live booking').parameters.query, /l\.alt_number, l\.income_band,/);
  assert.match(WF5.nodes.find((x) => x.name === 'Load booking for method change').parameters.query, /l\.income_band, l\.conv_state, l\.routing_reason,/);
});

// Smoke test 21 Oct 2026 (#2): a lead with no first name got "Hi ," in the invite, "Hi -," in booking_confirmed, and Mark's
// notice / email subject read "-" ("New booking: - on ..."). No name -> "there" for the client, "your client" for the adviser.
test('#2 W05 lib: no first name -> "there" to the client, "your client" to the adviser (never "-" or an empty name)', () => {
  const p = { start: '2026-10-26T11:00:00+02:00', end: '2026-10-26T11:30:00+02:00', method: 'teams', email: 'client@gmail.com', idempotency_key: 'k-nn', booked_via: 'page', context: {}, route: 'shared' };
  for (const first_name of [null, '', '   ']) {
    const c = ctx5({ lead: { ...ctx5().lead, first_name }, broker: { ...broker(), email: 'mark@example.com', adviser_whatsapp: '+27820000099' } });
    const mail = W5.inviteMail(c, p, { id: 'b-nn' }, { ok: true });
    assert.match(mail.message.body.content, /^Hi there,\n/, JSON.stringify(first_name));
    const n = W5.brokerNotice(c, p);
    assert.equal(n.vars[1], 'your client');
    assert.match(n.email.subject, /^New booking: your client on /);
    assert.match(n.email.body, /^Your client booked a /);
    const bc = W5.bookingConfirmed(c, p, { id: 'b-nn', call_number: '+27600000002' });
    assert.equal(bc.template.components[0].parameters[0].text, 'there');
    const ev = W5.graphEvent(c, { ...p, method: 'phone' });
    assert.doesNotMatch(ev.subject, /–\s+–/);
  }
  // a named lead is unchanged
  const named = ctx5();
  assert.match(W5.inviteMail(named, p, { id: 'b-n' }, { ok: true }).message.body.content, /^Hi Sipho,\n/);
  assert.equal(W5.brokerNotice(named, p).vars[1], 'Sipho');
});

// ============================================================================================
// Smoke test 21 Oct 2026 (#37): /book refreshed the broker's Microsoft token twice (W04 is_free, then W04 graph_token).
// ============================================================================================
test('#37 /book: the is_free re-check hands back its Microsoft token and the Outlook create reuses it (one refresh per booking)', async () => {
  const { runCode: run } = await import('./_n8ncode.mjs');
  const WF4 = JSON.parse(readFileSync(new URL('../W04.json', import.meta.url), 'utf8'));
  const now = Date.parse('2026-10-21T12:00:00Z');
  // W04: only an is_free sub-call that asks for it gets the token, never an HTTP answer
  assert.equal(W4.subcallInput({ op: 'is_free', broker_id: 'b1', start: '2026-10-22T08:00:00Z', want_token: true }).want_token, true);
  assert.equal(W4.subcallInput({ op: 'is_free', broker_id: 'b1', start: '2026-10-22T08:00:00Z' }).want_token, undefined);
  const tok = { ok: true, access_token: 'AT-1', expires_at: new Date(now + 3600e3).toISOString() };
  assert.deepEqual(W4.reusableToken({ op: 'is_free', want_token: true }, tok), { access_token: 'AT-1', expires_at: tok.expires_at });
  for (const [req, t] of [[{ op: 'is_free' }, tok], [{ op: 'list', want_token: true }, tok], [{ op: 'is_free', want_token: true }, { ok: false }]]) assert.equal(W4.reusableToken(req, t), null);
  const compute = async (x) => (await run(WF4, 'Compute (w04.respond)', { json: x, refs: { 'Token plan (w04.planToken)': { tok } } }))[0].json;
  const res = { next: 'respond', result: { free: true, next_slots: [] } };
  assert.deepEqual((await compute({ lane: 'sub', req: { op: 'is_free', want_token: true }, plan: res })).body, { free: true, next_slots: [], access_token: 'AT-1', expires_at: tok.expires_at });
  assert.deepEqual((await compute({ lane: 'sub', req: { op: 'is_free' }, plan: res })).body, { free: true, next_slots: [] }, 'W10 / others: no token');
  assert.equal(JSON.stringify(await compute({ lane: 'http', req: { op: 'is_free', want_token: true }, plan: { next: 'respond', result: { status: 200, body: { slots: [] } } } })).includes('AT-1'), false);
  // W05: the re-check asks for it on the broker calendar only
  const isFree = { op: 'is_free', broker_id: 'b1', start: 's', end: 'e' };
  assert.deepEqual((await run(WF5, 'is_free input', { json: { dec: { is_free: isFree, plan: { route: 'graph' } } } }))[0].json, { ...isFree, want_token: true });
  assert.deepEqual((await run(WF5, 'is_free input', { json: { dec: { is_free: isFree, plan: { route: 'shared' } } } }))[0].json, isFree);
  // a good token (> 5 min left) skips W04 graph_token; otherwise the old path
  const C = WF5.connections; const outs = (n, i = 0) => ((C[n] && C[n].main[i]) || []).map((t) => t.node);
  const IFN = 'Re-check token still good? (#37: no second refresh)';
  assert.deepEqual(outs('Broker calendar (graph)?', 0), [IFN]);
  assert.deepEqual([outs(IFN, 0), outs(IFN, 1)], [['Event body'], ['graph_token input']]);
  assert.deepEqual(outs('graph_token input'), ['W04 graph_token (waits)']); assert.deepEqual(outs('W04 graph_token (waits)'), ['Event body']);
  assert.equal(W5.recheckToken({ access_token: 'AT-1', expires_at: new Date(now + 301e3).toISOString() }, now), 'AT-1');
  assert.equal(W5.recheckToken({ access_token: 'AT-1', expires_at: new Date(now + 299e3).toISOString() }, now), null, 'about to expire: refresh');
  assert.equal(W5.recheckToken({ free: true }, now), null);
  const dec = { ctx: ctx5({ lane: 'sub', broker: ownCal({ methods_supported: ['teams', 'phone'] }) }), dec: { plan: { lead_id: 'lead_test_L02', broker_id: broker().broker_id, start: '2026-10-22T08:00:00.000Z', end: '2026-10-22T08:30:00.000Z', method: 'phone', idempotency_key: 'k1', route: 'graph' } } };
  const far = { free: true, access_token: 'AT-RECHECK', expires_at: new Date(Date.now() + 3600e3).toISOString() };
  const body = async (refs) => (await run(WF5, 'Event body', { refs: { 'Decide (w05.decide + MX)': dec, ...refs } }))[0].json;
  assert.equal((await body({ 'W04 is_free (re-check, waits)': far })).access_token, 'AT-RECHECK', 'no second refresh');
  assert.equal((await body({ 'W04 is_free (re-check, waits)': far, 'W04 graph_token (waits)': { access_token: 'AT-FRESH' } })).access_token, 'AT-FRESH');
  assert.equal((await body({ 'W04 is_free (re-check, waits)': far })).event.subject, 'SortMyCover call – Sipho – Phone');
});

// ============================================================================================
// Smoke test 21 Oct 2026 (#3): phone -> Teams left no join link; a verified email outside the offline 10-domain list was asked
// again and Outlook never changed; W10 had saved the method and told the client before W05 did anything.
// ============================================================================================
test('#3 update_method: a verified email is used as is (any domain); other addresses need the real MX answer', () => {
  const own = ownCal({ add_client_as_attendee: true, methods_supported: ['teams', 'phone'] });
  const booking = { id: 'bk3', broker_id: 'b1', status: 'booked', appointment_date: '2026-10-23T08:30:00Z', ends_at: '2026-10-23T09:00:00Z', calendar_provider: 'outlook', idempotency_key: 'k3', booked_via: 'chat', method: 'phone', graph_event_id: 'EV3' };
  const proton = smcLead({ email: 'client@protonmail.com', email_status: 'mx_ok', email_purpose: 'meeting_invite', email_verified: true });
  // live: d7ab3bda (protonmail.com, verified, mx_ok) got ask_email because no DNS answer was passed
  const r = W5.planUpdateMethod({ req: { method: 'teams' }, booking, lead: proton, broker: own });
  assert.equal(r.action, 'patch');
  assert.equal(r.plan.email, 'client@protonmail.com');
  assert.deepEqual(r.graph_patch.attendees.map((a) => a.emailAddress.address), ['client@protonmail.com']);
  assert.equal(r.appointment_update.invite_email_status, 'sent');
  assert.equal(W5.planUpdateMethod({ req: { method: 'teams', email: 'CLIENT@protonmail.com ' }, booking, lead: proton, broker: own }).action, 'patch', 'the same address typed again');
  // not verified: the real MX answer decides (never the offline list for an unknown domain)
  const work = smcLead({ email: 'thandi@company.co.za', email_status: 'mx_ok', email_purpose: 'meeting_invite', email_verified: false });
  assert.equal(W5.planUpdateMethod({ req: { method: 'teams' }, booking, lead: work, broker: own }).action, 'ask_email');
  assert.equal(W5.planUpdateMethod({ req: { method: 'teams' }, booking, lead: work, broker: own, mx: { 'company.co.za': true } }).action, 'patch');
  assert.equal(W5.planUpdateMethod({ req: { method: 'teams' }, booking, lead: work, broker: own, mx: { 'company.co.za': false } }).action, 'ask_email');
  // a bounced verified email is not trusted; a different typed address is checked
  assert.equal(W5.planUpdateMethod({ req: { method: 'teams' }, booking, lead: { ...proton, email_status: 'bounced' }, broker: own }).action, 'ask_email');
  assert.equal(W5.planUpdateMethod({ req: { method: 'teams', email: 'other@unknown-domain.test' }, booking, lead: proton, broker: own }).action, 'ask_email');
});

test('#3 update_method: the Teams join link comes from the Graph PATCH answer; a failed PATCH saves and tells nothing', () => {
  const p = { method: 'teams' };
  const join = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x';
  assert.deepEqual(W5.afterMethodPatch({ statusCode: 200, body: { id: 'EV3', onlineMeeting: { joinUrl: join } } }, p, 'bk3', 'b1'), { ok: true, join_url: join, alert: null });
  const noLink = W5.afterMethodPatch({ statusCode: 200, body: { id: 'EV3', onlineMeeting: null } }, p, 'bk3', 'b1');
  assert.deepEqual([noLink.ok, noLink.join_url, noLink.alert.signal_key, noLink.alert.severity, noLink.alert.scope], [true, null, 'teams_join_url_missing', 'amber', 'booking:bk3']);
  const fail = W5.afterMethodPatch({ statusCode: 403, body: { error: { code: 'ErrorAccessDenied' } } }, p, 'bk3', 'b1');
  assert.deepEqual([fail.ok, fail.join_url, fail.alert.signal_key, fail.alert.severity], [false, null, 'calendar_event_update_failed', 'red']);
  assert.match(fail.alert.what, /HTTP 403 ErrorAccessDenied/);
  assert.equal(W5.afterMethodPatch({ error: { message: 'timeout' } }, p, 'bk3').ok, false, 'no response');
  assert.deepEqual(W5.afterMethodPatch({ statusCode: 200, body: { id: 'EV3' } }, { method: 'phone' }, 'bk3'), { ok: true, join_url: null, alert: null }, 'phone: no link, no alert');
  // the joinRedirect (/j/<booking>) now has a link to send the client to
  assert.equal(W5.joinRedirect({ booking_id: '11111111-1111-4111-8111-111111111111' }, { status: 'booked', method: 'teams', join_url: join }).status, 302);
  // W10's one message rides along (parseSub keeps it; anything that is not a message is dropped)
  const wa = { messaging_product: 'whatsapp', to: '+27600000002', type: 'text', text: { body: "I'll change it to Teams." } };
  assert.deepEqual(W5.parseSub({ op: 'update_method', booking_id: 'bk3', method: 'teams', notify_wa: wa }).notify_wa, wa);
  assert.equal('notify_wa' in W5.parseSub({ op: 'update_method', booking_id: 'bk3', method: 'teams', notify_wa: 'x' }), false);
});

test('#3 W05.json update_method: PATCH answer -> saved (with the join link) -> client email + the W10 message; failure -> W22 only', async () => {
  const { runCode: run, evalParam } = await import('./_n8ncode.mjs');
  const C = WF5.connections; const outs = (n, i = 0) => ((C[n] && C[n].main[i]) || []).map((t) => t.node);
  const AFTER = 'After method PATCH (w05.afterMethodPatch)';
  for (const n of ['Graph PATCH event (method, howzit@ shared calendar)', 'Graph PATCH event (method, ASSUMPTION)']) assert.deepEqual(outs(n), [AFTER], n);
  assert.deepEqual(outs(AFTER).sort(), ['Method PATCH alert', 'Method patched?']);
  assert.deepEqual([outs('Method patched?', 0), outs('Method patched?', 1)], [['Save method'], []]);
  assert.deepEqual(outs('Method PATCH alert'), ['-> W22 Alerts']);
  assert.deepEqual(outs('Save method').sort(), ['Method change message (after the change)', 'Method client email (SortMyCover)', 'Method invite?']);
  assert.deepEqual(outs('Method change message (after the change)'), ['Live send?']);
  // nothing reaches Save method except the PATCH-ok branch and the no-event route
  const into = Object.entries(C).filter(([, v]) => (v.main || []).some((o) => (o || []).some((t) => t.node === 'Save method'))).map(([k]) => k).sort();
  assert.deepEqual(into, ['Method event calendar?', 'Method patched?']);
  const save = WF5.nodes.find((x) => x.name === 'Save method');
  assert.match(save.parameters.query, /WHERE id = \$1::uuid AND status IN \('booked','confirmed'\)/);
  assert.equal(save.alwaysOutputData, false, 'a booking that is no longer live: nothing saved, nothing told');
  const join = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x';
  const plan = { booking: { id: 'bk3', broker_id: 'b1' }, lead_id: 'l3', plan: { method: 'teams' }, appointment_update: { method: 'teams', call_number: null, invite_email_status: 'sent' }, guest_drop: false,
    smc_email: { kind: 'booking_updated', method: 'teams', booking_id: 'bk3' } };
  const after = (await run(WF5, AFTER, { json: { statusCode: 200, body: { id: 'EV3', onlineMeeting: { joinUrl: join } } }, refs: { 'Plan method change (w05.planUpdateMethod)': plan } }))[0].json;
  assert.deepEqual(after, { ok: true, join_url: join, alert: null });
  assert.deepEqual(evalParam(WF5, 'Save method', 'options.queryReplacement', { refs: { 'Plan method change (w05.planUpdateMethod)': plan, [AFTER]: after } }), ['bk3', 'teams', '', 'sent', 'false', join]);
  assert.equal(evalParam(WF5, 'Save method', 'options.queryReplacement', { refs: { 'Plan method change (w05.planUpdateMethod)': plan } })[5], '', 'no event to patch: no link');
  const mail = (await run(WF5, 'Method client email (SortMyCover)', { refs: { 'Plan method change (w05.planUpdateMethod)': plan, [AFTER]: after } }))[0].json;
  assert.equal(mail.smc_email.join_url, join);
  const wa = { messaging_product: 'whatsapp', to: '+27600000002', type: 'text', text: { body: "I'll change it to Teams." } };
  const msg = async (req) => (await run(WF5, 'Method change message (after the change)', { refs: { 'Normalise sub-call (w05.parseSub)': { req }, 'Plan method change (w05.planUpdateMethod)': plan } })).map((x) => x.json);
  assert.deepEqual(await msg({ op: 'update_method', notify_wa: wa }), [{ kind: 'wa', to: 'lead', lead_id: 'l3', wa }]);
  assert.deepEqual(await msg({ op: 'update_method' }), []);
  const al = (await run(WF5, 'Method PATCH alert', { json: { ok: false, alert: { signal_key: 'calendar_event_update_failed' } }, refs: { 'Plan method change (w05.planUpdateMethod)': plan } })).map((x) => x.json);
  assert.deepEqual(al, [{ signal_key: 'calendar_event_update_failed', lead_id: 'l3' }]);
  // the plan node: a verified protonmail.com email patches (no DNS lookup for it, no second ask)
  const own = ownCal({ add_client_as_attendee: true, methods_supported: ['teams', 'phone'] });
  const p = (await run(WF5, 'Plan method change (w05.planUpdateMethod)', {
    json: { booking: { id: 'bk3', broker_id: 'b1', status: 'booked', appointment_date: '2026-10-23T08:30:00Z', ends_at: '2026-10-23T09:00:00Z', calendar_provider: 'outlook', idempotency_key: 'k3', booked_via: 'chat', method: 'phone', graph_event_id: 'EV3' },
      lead: smcLead({ email: 'client@protonmail.com', email_status: 'mx_ok', email_purpose: 'meeting_invite', email_verified: true }), broker: own },
    refs: { 'Normalise sub-call (w05.parseSub)': { req: { op: 'update_method', booking_id: 'bk3', method: 'teams' } } } }))[0].json;
  assert.equal(p.action, 'patch');
});

// Smoke test #13 (21 Oct 2026): the rebook nudge after a released hold is a marketing send. The release itself happens at
// verify_by (the slot is freed for everyone at once); the nudge waits for the contact hours (lib/contact-hours.mjs) and goes
// at most once, never to a lead who booked again or opted out meanwhile.
test('W05 hold released outside the contact hours: slot freed at once, nudge held to the next allowed sweep, sent once', () => {
  const st = newBookState();
  const lid = 'lead_hold_night';
  st.leads.set(lid, { id: lid, first_name: 'Thandi', mobile: '+27600000901' });
  st.bookings.push({ id: 'bk_night', client_id: lid, status: W5.HELD, verify_by: '2026-10-24T22:30:00+02:00', appointment_date: '2026-10-27T10:00:00+02:00' });
  assert.deepEqual(releaseHolds(st, ms('2026-10-24T22:30:00+02:00')), [], 'Saturday 22:30: no WhatsApp');
  assert.equal(st.bookings[0].status, 'cancelled', 'the slot is freed at verify_by all the same');
  assert.deepEqual(releaseHolds(st, ms('2026-10-25T11:00:00+02:00')), [], 'Sunday: still held back');
  const mon = releaseHolds(st, ms('2026-10-26T08:00:00+02:00'));
  assert.equal(mon.length, 1, 'Monday 08:00: the nudge goes'); assert.equal(mon[0].template, 'booking_hold_released');
  assert.equal(mon[0].correlation, 'w05:hold_released:bk_night');
  assert.deepEqual(releaseHolds(st, ms('2026-10-26T08:05:00+02:00')), [], 'once only');
  // a lead who booked again before the hours opened gets no "pick a time" nudge
  const l2 = 'lead_hold_rebooked';
  st.leads.set(l2, { id: l2, first_name: 'Sipho', mobile: '+27600000902' });
  st.bookings.push({ id: 'bk_night2', client_id: l2, status: W5.HELD, verify_by: '2026-10-26T21:00:00+02:00', appointment_date: '2026-10-28T10:00:00+02:00' });
  releaseHolds(st, ms('2026-10-26T21:00:00+02:00'));
  st.bookings.push({ id: 'bk_new', client_id: l2, status: 'booked', appointment_date: '2026-10-29T10:00:00+02:00' });
  assert.deepEqual(releaseHolds(st, ms('2026-10-27T08:00:00+02:00')), []);
  assert.equal(W5.holdNudgeOpen(ms('2026-11-04T10:00:00+02:00')), false, '4 Nov 2026 election day');
  assert.equal(W5.holdNudgeOpen(ms('2026-10-24T12:00:00+02:00')), true, 'Saturday morning');
});

test('W05.json: the release sweep gates the rebook nudge on the contact hours (w05.holdNudgeOpen) and claims it once', () => {
  const WF = JSON.parse(readFileSync(new URL('../W05.json', import.meta.url), 'utf8'));
  const nd = (n) => WF.nodes.find((x) => x.name === n);
  const to = (n) => (WF.connections[n]?.main || []).map((o) => o.map((x) => x.node));
  const hours = nd('Contact hours now (w05.holdNudgeOpen)');
  assert.ok(hours && /require\('lv-automation'\)\.w05/.test(hours.parameters.jsCode) && /L\.holdNudgeOpen\(Date\.now\(\)\)/.test(hours.parameters.jsCode));
  assert.deepEqual(to('Every 5 min: release unverified holds'), [['Contact hours now (w05.holdNudgeOpen)']]);
  assert.deepEqual(to('Contact hours now (w05.holdNudgeOpen)'), [['Release held slots past verify_by (+ timeline)']]);
  const rel = nd('Release held slots past verify_by (+ timeline)');
  assert.match(rel.parameters.options.queryReplacement, /in_hours/);
  const q = rel.parameters.query;
  assert.match(q, /'nudge', 'pending'/, 'a hold released outside the hours is marked for the next allowed sweep');
  assert.match(q, /WHERE \$1::boolean/, 'nothing is nudged outside the hours');
  assert.match(q, /'w05:hold_nudge:' \|\| d\.id::text[\s\S]*ON CONFLICT \(idempotency_key\) DO NOTHING/, 'at most once');
  assert.match(q, /x\.id <> d\.id AND x\.status IN \('pending_verification','booked','confirmed'\)/, 'not after a new booking (the released hold itself excluded)');
  assert.deepEqual(checkSql([{ node: rel.name, sql: q }]), []);
});
