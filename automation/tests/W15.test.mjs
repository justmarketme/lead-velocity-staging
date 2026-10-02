// DRAFT for GATE-TEST-W15 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W15 Opt-out ("STOP" anywhere) — 2.1.2 POPIA, 4.6 item 14, W24 suppression
// Money rule protected: the licence to operate. STOP is honoured instantly, wherever it arrives (mid-quiz,
// mid-nurture, mid-reminders, after the call): opted_out set, every scheduled message cancelled, the booking
// released, the broker told not to call, and the number suppressed Lead-Velocity-wide so no later form or
// workflow can message it again. Exactly one confirmation goes back; nothing after that.
//
// Run:  node --test automation/tests/W15.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, clone, ms, iso, MIN, H, sha256, online } from './_harness.mjs';

// ============================================================================================
// Reference implementation
// ============================================================================================
const KEYWORDS = new Set(['stop', 'stopall', 'stop all', 'unsubscribe', 'opt out', 'optout', 'end', 'quit']);
const NEGATION = /\b(don ?t|do not|not|never|dont)\b/;
const MAX_WORDS = 5; // longer free text goes to the W07 intent model, which routes an opt-out intent here

/** Text message -> is it an opt-out? (Button taps are not text; the booking "Cancel" button is W10, not STOP.) */
export function isStop(text) {
  if (typeof text !== 'string') return false;
  const n = text.toLowerCase().replace(/['’]/g, '').replace(/-/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (KEYWORDS.has(n)) return true;
  const words = n.split(' ');
  if (words.length > MAX_WORDS || NEGATION.test(n)) return false;
  return words.includes('stop') || words.includes('unsubscribe') || n.includes('opt out');
}

export function newState() {
  return { leads: new Map(), bookings: [], jobs: [], sent: [], suppression: [], brokerNotifications: [], graphDeleted: [], activities: [] };
}

/** Inbound text from `mobile` at `now`. Returns what W15 did. */
export function handleInbound(st, mobile, text, now) {
  if (!isStop(text)) return { handled: false };
  const hash = sha256(mobile);
  const already = st.suppression.some((s) => s.mobile_hash === hash && s.source === 'stop');
  const leads = [...st.leads.values()].filter((l) => l.mobile === mobile);
  if (already) return { handled: true, duplicate: true };
  for (const l of leads) {
    Object.assign(l, { opted_out_at: iso(now), stage: 'opted_out' });
    for (const j of st.jobs) if (j.lead_id === l.id && j.status === 'pending') j.status = 'cancelled';
    for (const bk of st.bookings.filter((b) => b.lead_id === l.id && ['booked', 'confirmed'].includes(b.status))) {
      bk.status = 'cancelled';
      bk.cancel_reason = 'lead_opted_out';
      st.graphDeleted.push(bk.graph_event_id);
    }
    if (l.broker_id) {
      const b = FIX.brokers.find((x) => x.broker_id === l.broker_id);
      const msg = `${l.first_name} has opted out of contact. Please do not call or message them. Any booking has been removed from your calendar.`;
      st.brokerNotifications.push({ to: b.adviser_whatsapp, channel: 'whatsapp', lead_id: l.id, text: msg });
      st.brokerNotifications.push({ to: b.email, channel: 'email', lead_id: l.id, text: msg });
    }
    st.activities.push({ lead_id: l.id, workflow: 'W15', kind: 'opted_out', at: iso(now) });
  }
  st.suppression.push({ mobile_hash: hash, source: 'stop', brand_id: null, lead_id: leads[0]?.id ?? null, added_at: iso(now) });
  st.sent.push({ to: mobile, at: iso(now), kind: 'opt_out_confirmation', text: "You're opted out. We won't message you again. Reply START if that was a mistake." });
  return { handled: true, duplicate: false };
}

/** Dispatcher: sends due jobs that are still pending (cancelled ones never go). */
export function tick(st, now) {
  for (const j of st.jobs) if (j.status === 'pending' && ms(j.at) <= now) { j.status = 'sent'; st.sent.push({ to: j.to, at: j.at, kind: j.touch }); }
}

/** What W01/W06 check before any message. */
export const isSuppressed = (st, mobile) => st.suppression.some((s) => s.mobile_hash === sha256(mobile));

// ============================================================================================
// Fixture wiring: L10 booked, its full W09 plan + W12 post-call jobs queued.
// ============================================================================================
const B = broker();
function seedL10(st) {
  const fx = lead('L10');
  const l = { id: fx.lead_id, first_name: fx.submission.first_name, mobile: fx.expected.W01.mobile, broker_id: B.broker_id, stage: 'booked' };
  st.leads.set(l.id, l);
  st.bookings.push({ id: 'bkg_L10', lead_id: l.id, status: 'booked', graph_event_id: 'AAMkTEST_L10', start: fx.booking_request.slot_start });
  const end = ms(fx.booking_request.slot_start) + 30 * MIN;
  const jobs = [...fx.expected.W09.schedule, { touch: 'broker_outcome_check', at: iso(end + 15 * MIN) }, { touch: 'reach_check', at: iso(end + 30 * MIN) }];
  for (const j of jobs) st.jobs.push({ ...j, lead_id: l.id, to: j.touch.startsWith('broker') ? B.adviser_whatsapp : l.mobile, status: 'pending' });
  return { fx, l };
}

const offlineSys = () => {
  const st = newState();
  return {
    st,
    seedL10: async () => seedL10(st),
    inbound: async (mobile, text, now) => handleInbound(st, mobile, text, ms(now)),
    tick: async (now) => tick(st, ms(now)),
    state: async (leadId) => ({
      lead: st.leads.get(leadId),
      jobs: st.jobs.filter((j) => j.lead_id === leadId),
      bookings: st.bookings.filter((b) => b.lead_id === leadId),
      graph_deleted: st.graphDeleted,
      broker_notifications: st.brokerNotifications.filter((n) => n.lead_id === leadId),
      suppression: st.suppression,
      sent: st.sent,
    }),
  };
};
const onlineSys = () => ({
  seedL10: async () => {
    const fx = lead('L10');
    await online.post('/test/reset', { broker_id: B.broker_id, keep_calendar_busy: true });
    const r = await online.post('/lead', fx.submission, { now: fx.submission.submitted_at });
    await online.post('/book', { ...fx.booking_request, lead_id: r.body.lead_id }, { now: fx.booking_request.requested_at });
    return { fx, l: { id: r.body.lead_id, mobile: fx.expected.W01.mobile } };
  },
  inbound: async (mobile, text, now) => online.waInbound({ from: mobile, text, now: ms(now) }),
  tick: async (now) => online.tick(ms(now)),
  state: async (leadId) => {
    const s = await online.state(leadId);
    return { ...s, jobs: s.scheduled, sent: s.messages, graph_deleted: s.graph_deleted ?? [] };
  },
});
const fresh = () => (MODE === 'online' ? onlineSys() : offlineSys());

// ============================================================================================
// Tests
// ============================================================================================
test(`W15 [${MODE}] STOP keyword detection: short opt-outs in any case/punctuation; not "don't stop", not the booking "cancel"`, () => {
  for (const yes of ['STOP', 'Stop', 'stop.', 'STOP!!', ' stop ', 'Stop please', 'please stop', 'Unsubscribe', 'opt out', 'Opt-out', 'STOPALL', 'stop messaging me', 'END', 'Quit'])
    assert.equal(isStop(yes), true, yes);
  for (const no of ["Don't stop", 'dont stop', 'cancel', 'Cancel', 'stopwatch', 'Can I stop by later this week to chat about it', '', null, 'Yes, we spoke'])
    assert.equal(isStop(no), false, String(no));
});

test(`W15 [${MODE}] L10 STOP mid-sequence: opted out, remaining reminders and post-call checks cancelled, booking released`, async () => {
  const sys = fresh();
  const { fx, l } = await sys.seedL10();
  const e = fx.expected.W15;
  await sys.tick(fx.timeline.find((x) => x.event.startsWith('reminder_24h')).at); // T-24 h touches go out first
  await sys.inbound(l.mobile, fx.stop_message.text, fx.stop_message.at);
  const s = await sys.state(l.id);
  assert.equal(s.lead.opted_out_at, e.opted_out_at);
  assert.deepEqual(s.jobs.filter((j) => j.status === 'cancelled').map((j) => j.touch), e.cancelled);
  assert.equal(s.bookings[0].status, e.booking_status);
  assert.ok(s.graph_deleted.includes(s.bookings[0].graph_event_id) === e.graph_event_deleted);
});

test(`W15 [${MODE}] L10: broker told on WhatsApp + email, first name only, "do not call"`, async () => {
  const sys = fresh();
  const { fx, l } = await sys.seedL10();
  await sys.inbound(l.mobile, fx.stop_message.text, fx.stop_message.at);
  const n = (await sys.state(l.id)).broker_notifications;
  assert.deepEqual(n.map((x) => x.channel).sort(), ['email', 'whatsapp']);
  for (const x of n) {
    assert.ok(x.text.includes(fx.expected.W15.broker_notification_names_lead_as));
    assert.ok(/do not call/i.test(x.text));
    assert.ok(!x.text.includes(l.mobile), 'the number is not repeated in the notification');
  }
});

test(`W15 [${MODE}] suppression row: sha256 of the E.164 number, source stop, Lead-Velocity-wide (brand_id null)`, async () => {
  const sys = fresh();
  const { fx, l } = await sys.seedL10();
  await sys.inbound(l.mobile, fx.stop_message.text, fx.stop_message.at);
  const rows = (await sys.state(l.id)).suppression.filter((r) => r.mobile_hash === sha256(fx.expected.W15.suppression.mobile_hash_of));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, fx.expected.W15.suppression.source);
  assert.equal(rows[0].brand_id, fx.expected.W15.suppression.brand_id);
  assert.ok(!JSON.stringify(rows).includes('600000010'), 'no raw number in the suppression table');
});

test(`W15 [${MODE}] after STOP exactly one confirmation goes out and nothing else, ever (ticks through the meeting time)`, async () => {
  const sys = fresh();
  const { fx, l } = await sys.seedL10();
  await sys.tick(fx.timeline.find((x) => x.event.startsWith('reminder_24h')).at);
  await sys.inbound(l.mobile, fx.stop_message.text, fx.stop_message.at);
  await sys.tick(iso(ms(fx.booking_request.slot_start) + 3 * H));
  const after = (await sys.state(l.id)).sent.filter((m) => m.to === l.mobile && ms(m.at) >= ms(fx.stop_message.at));
  assert.deepEqual(after.map((m) => m.kind), fx.expected.W15.messages_to_lead_after_stop);
});

test(`W15 [${MODE}] a second STOP is idempotent: no second suppression row, notification or confirmation`, async () => {
  const sys = fresh();
  const { fx, l } = await sys.seedL10();
  await sys.inbound(l.mobile, 'STOP', fx.stop_message.at);
  await sys.inbound(l.mobile, 'stop!!', iso(ms(fx.stop_message.at) + MIN));
  const s = await sys.state(l.id);
  assert.equal(s.suppression.filter((r) => r.mobile_hash === sha256(l.mobile)).length, 1);
  assert.equal(s.broker_notifications.length, 2);
  assert.equal(s.sent.filter((m) => m.kind === 'opt_out_confirmation').length, 1);
});

test(`W15 [${MODE}] STOP anywhere: mid-CTWA quiz (not yet routed) and mid-nurture (unbooked) both opt out; unrouted -> no broker notice`, (t) => {
  if (MODE === 'online') return t.skip('online variants run in the 6B.10 rehearsal script');
  const st = newState();
  const quiz = { id: 'lead_test_L04', first_name: 'Pieter', mobile: '+27600000004', broker_id: null, stage: 'new' };
  const nurture = { id: 'lead_test_L02', first_name: 'Sipho', mobile: '+27600000002', broker_id: B.broker_id, stage: 'disclosed' };
  st.leads.set(quiz.id, quiz);
  st.leads.set(nurture.id, nurture);
  st.jobs.push({ lead_id: nurture.id, touch: 'unbooked_nudge_24h', at: '2026-10-13T09:02:30+02:00', to: nurture.mobile, status: 'pending' });
  st.jobs.push({ lead_id: nurture.id, touch: 'unbooked_nudge_72h', at: '2026-10-15T09:02:30+02:00', to: nurture.mobile, status: 'pending' });
  handleInbound(st, quiz.mobile, 'stop', ms('2026-10-12T19:05:50+02:00'));
  handleInbound(st, nurture.mobile, 'Please stop', ms('2026-10-12T11:10:00+02:00'));
  assert.ok(quiz.opted_out_at && nurture.opted_out_at);
  assert.equal(st.brokerNotifications.filter((n) => n.lead_id === quiz.id).length, 0, 'no broker for an unrouted lead');
  assert.equal(st.brokerNotifications.filter((n) => n.lead_id === nurture.id).length, 2);
  assert.ok(st.jobs.every((j) => j.status === 'cancelled'));
});

test(`W15 [${MODE}] STOP from a number we have no lead for: suppressed + confirmed, no lead row created`, (t) => {
  if (MODE === 'online') return t.skip('covered by the W01 online suppression test');
  const st = newState();
  handleInbound(st, '+27600000099', 'STOP', ms('2026-10-12T12:00:00+02:00'));
  assert.equal(st.leads.size, 0);
  assert.ok(isSuppressed(st, '+27600000099'));
  assert.equal(st.sent.length, 1);
});

test(`W15 [${MODE}] a later form from the STOPped number is suppressed (the W01/W06 gate reads this table)`, (t) => {
  if (MODE === 'online') return t.skip('W01.test.mjs "a suppressed (STOPped) number is stored but never messaged" covers it online');
  const st = newState();
  const { fx, l } = seedL10(st);
  handleInbound(st, l.mobile, fx.stop_message.text, ms(fx.stop_message.at));
  assert.equal(isSuppressed(st, '+27600000010'), true);
  assert.equal(fx.expected.W15.later_intake_whatsapp, false);
});
