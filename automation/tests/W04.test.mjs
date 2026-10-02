// DRAFT for GATE-TEST-W04 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W04 Slots API  (GET /slots?broker_id=…  ·  GET /slots?broker_id=…&date=YYYY-MM-DD for the Flow's day screen)
// Money rule protected: we only ever offer a time the broker can really keep — inside his hours, never on a
// holiday, never over his daily/weekly cap, never against something already in his Outlook — so a booking
// never turns into a no-show we caused, and his week fills evenly (4.6 "Broker calendar").
//
// Run:  node --test automation/tests/W04.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE, lead, broker, clone, ms, iso, sast, at, D, H, MIN, HOLIDAYS, online } from './_harness.mjs';

// ============================================================================================
// Reference implementation: automation/tests/_slots.mjs (shared with W05/W06/W13; the rule lives there once)
// ============================================================================================
export { generateSlots, offerSlots, dayView, unavailableDates } from './_slots.mjs';
import { generateSlots, offerSlots, dayView, unavailableDates } from './_slots.mjs';

// ============================================================================================
// Adapters
// ============================================================================================
const B = broker();
const offline = {
  slots: async ({ b = B, busy = b.calendar_busy, bookings = [], now }) => generateSlots(b, busy, bookings, now),
  offer: async (args) => offerSlots((await offline.slots(args)).slots, 3),
  day: async (args, date) => dayView((await offline.slots(args)).slots, date),
};
// Online: the test seeds the broker's busy blocks and bookings through the staging hook, then calls /slots.
const onlineSys = {
  seed: (args) => online.post('/test/seed-calendar', { broker: args.b ?? B, busy: args.busy ?? (args.b ?? B).calendar_busy, bookings: args.bookings ?? [], graph_auth_error: args.busy === null }),
  slots: async (args) => { await onlineSys.seed(args); return (await online.get(`/slots?broker_id=${(args.b ?? B).broker_id}`, { now: args.now })).body; },
  offer: async (args) => { await onlineSys.seed(args); return (await online.get(`/slots?broker_id=${(args.b ?? B).broker_id}&offer=3`, { now: args.now })).body.slots; },
  day: async (args, date) => { await onlineSys.seed(args); return (await online.get(`/slots?broker_id=${(args.b ?? B).broker_id}&date=${date}`, { now: args.now })).body.slots; },
};
const sys = MODE === 'online' ? onlineSys : offline;

const starts = (arr) => arr.map((s) => s.start);
const book = (start, status = 'booked') => ({ start, end: iso(ms(start) + 30 * MIN), status });

// ============================================================================================
// Tests
// ============================================================================================
test(`W04 [${MODE}] L02 at 09:02:30 Mon: hand-computed 3 offers, one per day`, async () => {
  const e = lead('L02').expected.W04;
  const got = await sys.offer({ now: ms(e.offer_at), bookings: [] });
  assert.deepEqual(starts(got), e.offered, e.why);
});

test(`W04 [${MODE}] L03 at 14:40 Mon: Monday too late, Tuesday pushed past busy + L02's booking + buffers`, async () => {
  const e = lead('L03').expected.W04;
  const got = await sys.offer({ now: ms(e.offer_at), bookings: [book('2026-10-13T10:30:00+02:00')] });
  assert.deepEqual(starts(got), e.offered, e.why);
});

test(`W04 [${MODE}] every slot is inside meeting hours, on the 30-min grid, 30 min long, weekdays only`, async () => {
  const { slots } = await sys.slots({ now: at('2026-10-12', '08:00') });
  assert.ok(slots.length > 0);
  for (const s of slots) {
    const p = sast(ms(s.start));
    const e = sast(ms(s.end));
    assert.ok(p.dow >= 1 && p.dow <= 5, `${s.start} weekday`);
    assert.ok(p.mi === 0 || p.mi === 30, `${s.start} on grid`);
    assert.equal(ms(s.end) - ms(s.start), 30 * MIN);
    assert.ok(p.hh >= 9 && (e.hh < 17 || (e.hh === 17 && e.mi === 0)), `${s.start} inside 09:00-17:00`);
    assert.ok(s.start.endsWith('+02:00'), 'Africa/Johannesburg offset on every time');
  }
});

test(`W04 [${MODE}] minimum notice 2 h: nothing earlier than now + 2 h`, async () => {
  const now = at('2026-10-12', '10:10');
  const { slots } = await sys.slots({ now });
  assert.ok(slots.every((s) => ms(s.start) >= now + 2 * H));
  assert.equal(slots[0].start, '2026-10-12T12:30:00+02:00');
});

test(`W04 [${MODE}] horizon 14 days: nothing after now + 14 d`, async () => {
  const now = at('2026-10-12', '08:00');
  const { slots } = await sys.slots({ now });
  assert.ok(slots.every((s) => ms(s.start) <= now + 14 * D));
  assert.equal(slots.at(-1).start.slice(0, 10), '2026-10-23', 'last bookable day = Fri 23 Oct (Mon 26 Oct 08:00 = +14 d, before 09:00)');
});

test(`W04 [${MODE}] 15-min buffer around every busy block (Outlook events and our bookings)`, async () => {
  // Tue 13 Oct busy 09:00-10:00 -> 10:00 is NOT free (buffer), 10:30 is.
  const day = await sys.day({ now: at('2026-10-12', '08:00') }, '2026-10-13');
  assert.ok(!starts(day).includes('2026-10-13T10:00:00+02:00'));
  assert.ok(starts(day).includes('2026-10-13T10:30:00+02:00'));
  // Our own booking 11:00-11:30 blocks 10:30 and 11:30 too.
  const day2 = await sys.day({ now: at('2026-10-12', '08:00'), bookings: [book('2026-10-13T11:00:00+02:00')] }, '2026-10-13');
  for (const t of ['10:30', '11:00', '11:30']) assert.ok(!starts(day2).includes(`2026-10-13T${t}:00+02:00`), t);
  assert.ok(starts(day2).includes('2026-10-13T12:00:00+02:00'));
});

test(`W04 [${MODE}] free/busy exclusion: an Outlook event removes the overlapping slots and nothing else`, async () => {
  const day = await sys.day({ now: at('2026-10-12', '08:00') }, '2026-10-14'); // Wed lunch 12:00-13:00
  for (const t of ['11:30', '12:00', '12:30', '13:00']) assert.ok(!starts(day).includes(`2026-10-14T${t}:00+02:00`), t);
  for (const t of ['11:00', '13:30']) assert.ok(starts(day).includes(`2026-10-14T${t}:00+02:00`), t);
});

test(`W04 [${MODE}] max meetings per day (3): a day with 3 bookings offers nothing; cancelled ones don't count`, async () => {
  const now = at('2026-10-12', '08:00');
  const three = ['09:00', '11:00', '14:00'].map((t) => book(`2026-10-16T${t}:00+02:00`));
  assert.equal((await sys.day({ now, bookings: three }, '2026-10-16')).length, 0);
  const twoPlusCancelled = [...three.slice(0, 2), { ...three[2], status: 'cancelled' }];
  assert.ok((await sys.day({ now, bookings: twoPlusCancelled }, '2026-10-16')).length > 0);
});

test(`W04 [${MODE}] max meetings per week (12, Mon-Sun): a full week offers nothing until next Monday`, async () => {
  const now = at('2026-10-19', '07:00');
  const b = { ...clone(B), max_meetings_per_day: 4 };
  const full = [];
  for (const d of ['19', '20', '21']) for (const t of ['09:00', '10:00', '11:00', '12:00']) full.push(book(`2026-10-${d}T${t}:00+02:00`));
  const { slots } = await sys.slots({ b, busy: [], bookings: full, now });
  assert.ok(slots.every((s) => s.start >= '2026-10-26'), 'nothing left in the week of 19 Oct');
  assert.ok(slots.some((s) => s.start.startsWith('2026-10-26')), 'next week opens');
});

test(`W04 [${MODE}] SA public holidays are blocked (Wed 16 Dec 2026, Fri 25 Dec 2026)`, async () => {
  const { slots } = await sys.slots({ busy: [], now: at('2026-12-14', '08:00') });
  const days = new Set(slots.map((s) => s.start.slice(0, 10)));
  assert.ok(!days.has('2026-12-16'));
  assert.ok(!days.has('2026-12-25'));
  assert.ok(days.has('2026-12-17'));
  assert.ok(HOLIDAYS.has('2026-12-16') && HOLIDAYS.has('2027-03-22'), 'holiday file loaded (incl. Sunday->Monday rule)');
});

test(`W04 [${MODE}] spread across days: 3 offers on 3 different days when 3 days have room`, async () => {
  const got = await sys.offer({ busy: [], now: at('2026-10-12', '06:00') });
  assert.equal(new Set(got.map((s) => s.start.slice(0, 10))).size, 3);
  assert.deepEqual(starts(got), ['2026-10-12T09:00:00+02:00', '2026-10-13T09:00:00+02:00', '2026-10-14T09:00:00+02:00']);
  // Round-robin pure rule: two days with room -> d1, d2, d1.
  const two = offerSlots([{ start: '2026-10-12T09:00:00+02:00' }, { start: '2026-10-12T10:00:00+02:00' }, { start: '2026-10-13T09:00:00+02:00' }]);
  assert.deepEqual(starts(two), ['2026-10-12T09:00:00+02:00', '2026-10-13T09:00:00+02:00', '2026-10-12T10:00:00+02:00']);
});

test(`W04 [${MODE}] day view for the Flow returns at most 20 slots`, async () => {
  const b = { ...clone(B), meeting_hours: { ...B.meeting_hours, tue: [['06:00', '20:00']] } };
  const day = await sys.day({ b, busy: [], now: at('2026-10-12', '06:00') }, '2026-10-13');
  assert.equal(day.length, 20);
});

test(`W04 [${MODE}] unavailable-dates for the CalendarPicker = working days with no free slot`, (t) => {
  if (MODE === 'online') return t.skip('covered by the W28 Flow INIT test');
  const now = at('2026-12-14', '08:00');
  const { slots } = generateSlots(B, [], [], now);
  const u = unavailableDates(B, slots, now);
  assert.ok(u.includes('2026-12-16') && u.includes('2026-12-25'));
  assert.ok(!u.includes('2026-12-19'), 'weekends come from include-days, not unavailable-dates');
});

test(`W04 [${MODE}] bookings paused -> no slots; Graph auth error -> fallback "pick on WhatsApp"`, async () => {
  assert.equal((await sys.slots({ b: { ...clone(B), bookings_paused: true }, now: at('2026-10-12', '08:00') })).slots.length, 0);
  const r = await sys.slots({ busy: null, now: at('2026-10-12', '08:00') });
  assert.equal(r.fallback, 'whatsapp');
  assert.equal(r.slots.length, 0);
});
