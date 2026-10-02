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

// ============================================================================================
// Reference implementation
// ============================================================================================
const VIDEO = new Set(['teams', 'zoom', 'meet']);
const TITLE_LABEL = { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'Phone' };
const INVITE_FROM = 'howzit@leadvelocity.co.za';
const KNOWN_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'webmail.co.za', 'mweb.co.za', 'telkomsa.net', 'vodamail.co.za', 'leadvelocity.co.za'];
const DISPOSABLE = new Set(['mailinator.com', 'yopmail.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com']);
// Offline MX stub. Online runs use real DNS (n8n DNS lookup) — these domains all have MX in real life except the typos.
const MX_STUB = new Set([...KNOWN_DOMAINS, ...DISPOSABLE]);

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Syntax -> typo suggestion -> disposable -> MX. Returns {ok,status} or {ok:false, reason, suggestion?}. */
export function checkEmail(raw, { acceptTypo = false, hasMx = (d) => MX_STUB.has(d) } = {}) {
  const email = String(raw ?? '').trim().toLowerCase();
  const m = /^[^\s@]+@([a-z0-9-]+(\.[a-z0-9-]+)+)$/.exec(email);
  if (!m) return { ok: false, reason: 'syntax' };
  const domain = m[1];
  if (!acceptTypo && !KNOWN_DOMAINS.includes(domain)) {
    const near = KNOWN_DOMAINS.find((k) => lev(domain, k) <= 2);
    if (near) return { ok: false, reason: 'typo', suggestion: email.replace(/@.*/, '@' + near) };
  }
  if (DISPOSABLE.has(domain)) return { ok: false, reason: 'disposable' };
  if (!hasMx(domain)) return { ok: false, reason: 'no_mx' };
  return { ok: true, email, status: 'mx_ok' };
}

export function newBookState() {
  return { broker: clone(broker()), leads: new Map(), bookings: [], events: new Map(), capi: [], invites: [], notifications: [], messages: [], idem: new Map(), seq: 0 };
}

export function book(st, req, now) {
  if (st.idem.has(req.idempotency_key)) return st.idem.get(req.idempotency_key); // retries never double-book
  const b = st.broker;
  const l = st.leads.get(req.lead_id);
  if (!l) return { http_status: 404, body: { error_code: 'unknown_lead' } };
  if (l.opted_out_at) return { http_status: 409, body: { error_code: 'opted_out' } };
  if (!b.methods_supported.includes(req.method)) return { http_status: 422, body: { error_code: 'method_not_supported', methods: b.methods_supported } };
  let email = null;
  if (VIDEO.has(req.method)) {
    if (!req.email) return { http_status: 422, body: { error_code: 'email_required' } };
    const chk = checkEmail(req.email, { acceptTypo: !!req.email_confirmed });
    if (!chk.ok) return { http_status: 422, body: { error_code: `email_${chk.reason}`, suggestion: chk.suggestion } };
    email = chk.email;
  }
  // ---- transaction: re-check free/busy NOW, then insert (W05 "Re-check getSchedule") ----
  const free = generateSlots(b, b.calendar_busy, st.bookings, now).slots;
  if (!free.some((s) => ms(s.start) === ms(req.slot_start)))
    return { http_status: 409, body: { error_code: 'slot_taken', next: offerSlots(free, 3) } };
  const start = ms(req.slot_start);
  const end = start + b.slot_minutes * MIN;
  const label = TITLE_LABEL[req.method];
  const bodyLines = [
    `${l.first_name} · ${l.mobile}`,
    `Age band ${l.age_band} · budget band ${l.budget_band}`,
    `Method: ${label}`,
    req.method === 'phone' ? `Call ${l.first_name} on ${l.call_number ?? l.mobile}` : null,
    req.method === 'whatsapp_call' ? `WhatsApp-call ${l.first_name} on ${l.call_number ?? l.mobile}` : null,
    `Consent ref: ${l.id}/${l.consent_text_version} at ${l.consent_at}`,
    `Source: ${l.origin}${l.ad_id ? ' · ' + l.ad_id : ''}`,
    `Pre-call brief: https://app.leadvelocity.co.za/l/${l.id}`,
  ].filter(Boolean);
  const graphId = `AAMkTEST_${++st.seq}`;
  const event = {
    id: graphId,
    transactionId: req.idempotency_key, // Graph's own idempotency for event creation
    subject: `Life cover call – ${l.first_name} – ${label}`,
    start: { dateTime: iso(start).slice(0, 19), timeZone: 'Africa/Johannesburg' },
    end: { dateTime: iso(end).slice(0, 19), timeZone: 'Africa/Johannesburg' },
    categories: ['SortMyCover'],
    isOnlineMeeting: req.method === 'teams',
    onlineMeetingProvider: req.method === 'teams' ? 'teamsForBusiness' : undefined,
    attendees: b.add_client_as_attendee && email ? [{ emailAddress: { address: email }, type: 'required' }] : [],
    body: { contentType: 'text', content: bodyLines.join('\n') },
    onlineMeeting: req.method === 'teams' ? { joinUrl: `https://teams.microsoft.com/l/meetup-join/TEST_${graphId}` } : undefined,
  };
  st.events.set(graphId, event);
  const booking = {
    id: `bkg_${st.seq}`, lead_id: l.id, broker_id: b.broker_id, cycle_id: b.current_cycle_id, start: iso(start), end: iso(end),
    method: req.method, status: 'booked', graph_event_id: graphId, booked_via: req.booked_via, idempotency_key: req.idempotency_key,
    created_at: iso(now), reschedule_count: 0,
  };
  st.bookings.push(booking);
  Object.assign(l, { stage: 'booked', broker_id: b.broker_id, cycle_id: b.current_cycle_id });
  if (email) Object.assign(l, { email, email_status: 'mx_ok', email_purpose: 'meeting_invite' });
  if (email) st.invites.push({ from: INVITE_FROM, to: email, join_url: event.onlineMeeting?.joinUrl, ics: true, lead_id: l.id });
  st.notifications.push({ to: b.adviser_whatsapp, template: 'broker_new_booking', vars: [b.adviser_first_name, l.first_name, booking.start] });
  // CAPI Schedule (event-spec): CTWA leads -> business_messaging only; others -> browser id or evt_<id>_schedule
  if (l.origin === 'ctwa') st.capi.push({ event_name: 'Schedule', event_id: `evt_${l.id}_ctwa_schedule`, action_source: 'business_messaging', lead_id: l.id });
  else if (l.consent_ads_at) st.capi.push({ event_name: 'Schedule', event_id: req.context?.event_id || `evt_${l.id}_schedule`, action_source: req.booked_via === 'page' ? 'website' : 'system_generated', lead_id: l.id });
  booking.schedule_event_id = st.capi.at(-1)?.lead_id === l.id ? st.capi.at(-1).event_id : null;
  const res = { http_status: 201, body: { booking_id: booking.id, graph_event_id: graphId, start: booking.start, end: booking.end, method: req.method, join_url: event.onlineMeeting?.joinUrl ?? null } };
  st.idem.set(req.idempotency_key, res);
  return res;
}

/** Graph mail webhook on howzit@ reports an NDR for the invite. */
export function onInviteBounce(st, leadId, now) {
  const l = st.leads.get(leadId);
  l.email_status = 'bounced';
  const domain = l.email.split('@')[1];
  const near = KNOWN_DOMAINS.find((k) => k !== domain && lev(domain, k) <= 2);
  st.messages.push({ to: l.mobile, at: iso(now), kind: 'email_bounced_prompt', text: `The invite to ${l.email} bounced — can you check the address?`, suggestion: near ? l.email.replace(/@.*/, '@' + near) : null });
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
    state: async (leadId) => ({ lead: st.leads.get(leadId), bookings: st.bookings.filter((b) => b.lead_id === leadId), events: [...st.events.values()].filter((e) => st.bookings.some((b) => b.lead_id === leadId && b.graph_event_id === e.id)), capi: st.capi.filter((c) => c.lead_id === leadId), invites: st.invites.filter((i) => i.lead_id === leadId), messages: st.messages.filter((m) => m.to === st.leads.get(leadId).mobile) }),
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
