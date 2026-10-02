// DRAFT for GATE-TEST-W06 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W06 First touch (< 60 s)
// Money rule protected: every routed lead gets the disclosure card — practice, FSP number, adviser — on
// WhatsApp within 60 seconds (HBR speed; 2.1.2 disclosure), with the right template, and the message id +
// delivery status are logged as disclosure evidence. A lead we must not message never gets one.
//
// Run:  node --test automation/tests/W06.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, clone, ms, iso, H, renderBody, dateLabel, timeLabel, slotLabel, online } from './_harness.mjs';
import { generateSlots, offerSlots } from './_slots.mjs';

// ============================================================================================
// Reference implementation
// ============================================================================================
export const HOLD_S = 45; // page leads: wait this long for the in-page booking (ASSUMPTION, fixtures _meta)
export const DEADLINE_S = 60;
const METHOD_LABEL = FIX._meta.method_labels;

/**
 * Decide the first WhatsApp for one lead.
 * @param l      lead row (after W01/W02/W03)
 * @param ctx    { booking?:{created_at,start,method,id}, skipAt?, bookingsForSlots?:[], bookingUi? }
 * @returns null (must not message) or { template, send_at, clock_start, variables, header_image, buttons, trigger }
 */
export function planFirstTouch(l, b, ctx = {}) {
  if (!l || !l.broker_id || l.opted_out_at || l.stage === 'suppressed' || l.qualified === false || l.duplicate_of) return null;
  const clockStart = ms(l.routed_at); // the 60 s run from when routing is written (== lead creation for page/lead_ad)
  let trigger;
  let reason;
  if (l.origin === 'page') {
    const cands = [
      ['hold', clockStart + HOLD_S * 1000],
      ctx.skipAt ? ['skip', ms(ctx.skipAt)] : null,
      ctx.booking ? ['booking', ms(ctx.booking.created_at)] : null,
    ].filter(Boolean).sort((x, y) => x[1] - y[1]);
    [reason, trigger] = cands[0];
  } else {
    [reason, trigger] = ['routed', clockStart];
  }
  const sendAt = Math.max(trigger, clockStart);
  const common = [l.first_name, b.practice_name, b.fsp_number, b.adviser_name];
  if (reason === 'booking') {
    const st = ms(ctx.booking.start);
    return {
      template: 'broker_intro_booked', trigger: reason, send_at: iso(sendAt), clock_start: iso(clockStart), header_image: b.intro_card_url,
      variables: [...common, METHOD_LABEL[ctx.booking.method], dateLabel(st), timeLabel(st)],
      buttons: [{ type: 'url', param: ctx.booking.id }, { type: 'quick_reply', payload: `reschedule:${ctx.booking.id}` }, { type: 'quick_reply', payload: `cancel:${ctx.booking.id}` }],
    };
  }
  if ((ctx.bookingUi ?? FIX.brand.booking_ui) === 'flow')
    return { template: 'broker_intro_slots_v2', trigger: reason, send_at: iso(sendAt), clock_start: iso(clockStart), header_image: b.intro_card_url, variables: common, buttons: [{ type: 'flow', action: 'INIT' }] };
  const offers = offerSlots(generateSlots(b, b.calendar_busy, ctx.bookingsForSlots ?? [], sendAt).slots, 3);
  return {
    template: 'broker_intro_slots', trigger: reason, send_at: iso(sendAt), clock_start: iso(clockStart), header_image: b.intro_card_url,
    variables: [...common, ...offers.map((s) => slotLabel(ms(s.start)))],
    buttons: [...offers.map((s) => ({ type: 'quick_reply', payload: `slot:${s.start}` })), { type: 'quick_reply', payload: 'other_times' }],
  };
}

/** A page lead who books AFTER the slots card went out gets a short confirmation, never a second intro card. */
export const afterLateBooking = (firstTemplate) => (firstTemplate === 'broker_intro_booked' ? [] : ['booking_confirmed']);

/** Delivery webhooks -> disclosure evidence on the lead; failed -> SMS fallback with the same disclosure. */
export function applyStatus(l, log, status) {
  const msg = log.find((m) => m.wamid === status.id);
  msg.status = status.status;
  msg[`${status.status}_at`] = status.at;
  if (msg.is_disclosure && status.status === 'delivered') Object.assign(l, { wa_delivered_at: status.at, disclosure_delivered_at: status.at, disclosure_msg_id: msg.wamid });
  if (msg.is_disclosure && status.status === 'failed') {
    const text = renderBody(msg.template, msg.variables).replace(/\*/g, '');
    log.push({ channel: 'sms', provider: 'twilio', to: l.mobile, at: status.at, text, is_disclosure: true });
  }
}

// ============================================================================================
// Adapters
// ============================================================================================
const B = broker();
function leadRow(fx, over = {}) {
  const s = fx.submission;
  const routed = fx.expected.W01?.routed_at ?? s.submitted_at ?? s.created_time;
  return {
    id: fx.lead_id, origin: fx.origin, broker_id: B.broker_id, routed_at: routed, first_name: s.first_name ?? s.profile_name ?? s.field_data?.[0]?.values[0],
    mobile: fx.expected.W01?.mobile ?? `+${s.wa_id}`, stage: 'new', ...over,
  };
}
const ctxFor = (fx, extra = {}) => ({
  booking: fx.origin === 'page' && fx.booking_request ? { created_at: fx.booking_request.requested_at, start: fx.booking_request.slot_start, method: fx.booking_request.method, id: `bkg_${fx.fixture_id}` } : undefined,
  skipAt: fx.submission.skip_booking_at,
  bookingsForSlots: fx.fixture_id === 'L03' ? [{ start: '2026-10-13T10:30:00+02:00', end: '2026-10-13T11:00:00+02:00', status: 'booked' }] : [],
  ...extra,
});
const offlineSys = { plan: async (fx, over, extra) => planFirstTouch(leadRow(fx, over), B, ctxFor(fx, extra)) };
// Online: real webhooks + real clock. The plan is read back from the conversation log of the lead.
const onlineSys = {
  plan: async (fx) => {
    const t0 = Date.now();
    const r = fx.origin === 'page' ? await online.post('/lead', fx.submission) : await online.post('/test/seed-lead', fx);
    if (fx.origin === 'page' && fx.booking_request) await online.post('/book', { ...fx.booking_request, lead_id: r.body.lead_id });
    for (let i = 0; i < 70; i++) {
      const s = await online.state(r.body.lead_id);
      const first = s?.messages?.find((m) => m.is_disclosure);
      if (first) return { template: first.template, send_at: first.sent_at, clock_start: s.lead.routed_at, variables: first.variables, buttons: first.buttons, trigger: first.trigger };
      await new Promise((ok) => setTimeout(ok, 1000));
    }
    return { template: null, send_at: iso(t0 + 999_000), clock_start: iso(t0), variables: [] };
  },
};
const sys = MODE === 'online' ? onlineSys : offlineSys;
const within60 = (p) => ms(p.send_at) - ms(p.clock_start) <= DEADLINE_S * 1000;

// ============================================================================================
// Tests
// ============================================================================================
test(`W06 [${MODE}] L01 booked on the page inside the hold -> broker_intro_booked with every disclosure variable`, async () => {
  const fx = lead('L01');
  const p = await sys.plan(fx);
  const e = fx.expected.W06;
  assert.equal(p.template, e.template);
  assert.ok(within60(p), `sent ${p.send_at}, clock ${p.clock_start}`);
  assert.ok(ms(p.send_at) <= ms(e.deadline));
  assert.deepEqual(p.variables, e.variables);
  const text = renderBody(p.template, p.variables); // the real template file in automation/templates/
  for (const needle of ['Mark Smith Financial Services (FSP 00000)', 'an authorised financial services provider', '*Mark Smith*', 'Microsoft Teams', 'Thu 15 Oct at 10:00', 'Reply STOP to opt out.'])
    assert.ok(text.includes(needle), needle);
});

test(`W06 [${MODE}] L02 tapped "I'll pick on WhatsApp" -> broker_intro_slots at once, 3 real slots, payloads are ISO times`, async () => {
  const fx = lead('L02');
  const p = await sys.plan(fx);
  const e = fx.expected.W06;
  assert.equal(p.template, e.template);
  assert.equal(p.trigger, e.trigger);
  assert.equal(p.send_at, e.send_at);
  assert.deepEqual(p.variables, e.variables);
  assert.deepEqual(p.buttons.slice(0, 3).map((b) => b.payload.replace('slot:', '')), lead('L02').expected.W04.offered);
  assert.equal(p.buttons[3].payload, 'other_times');
  assert.ok(renderBody(p.template, p.variables).includes('1. Mon 12 Oct, 11:30\n2. Tue 13 Oct, 10:30\n3. Wed 14 Oct, 09:00'));
});

test(`W06 [${MODE}] instant-form (L03) and CTWA (L04) leads get the slots card as soon as routing is written`, async () => {
  for (const id of ['L03', 'L04']) {
    const fx = lead(id);
    const p = await sys.plan(fx);
    assert.equal(p.template, fx.expected.W06.template, id);
    assert.ok(within60(p), id);
    assert.ok(ms(p.send_at) <= ms(fx.expected.W06.deadline), id);
  }
});

test(`W06 [${MODE}] page lead who neither books nor skips -> slots card when the ${HOLD_S}-s hold expires (still < 60 s)`, async (t) => {
  if (MODE === 'online') return t.skip('online run covers it with L02 minus the skip tap; timing is wall-clock');
  const fx = clone(lead('L02'));
  delete fx.submission.skip_booking_at;
  const p = await sys.plan(fx);
  assert.equal(p.template, 'broker_intro_slots');
  assert.equal(p.trigger, 'hold');
  assert.equal(ms(p.send_at) - ms(p.clock_start), HOLD_S * 1000);
});

test(`W06 [${MODE}] page booking that arrives after the slots card -> short booking_confirmed, never a second intro card`, (t) => {
  if (MODE === 'online') return t.skip('asserted end to end in the 6B.10 rehearsal');
  const fx = clone(lead('L01'));
  fx.booking_request.requested_at = iso(ms(fx.submission.submitted_at) + 3 * 60_000);
  const p = planFirstTouch(leadRow(fx), B, ctxFor(fx));
  assert.equal(p.template, 'broker_intro_slots');
  assert.deepEqual(afterLateBooking(p.template), ['booking_confirmed']);
  assert.deepEqual(afterLateBooking('broker_intro_booked'), []);
});

test(`W06 [${MODE}] when brands.booking_ui = flow, the Flow-button card (v2) replaces the 3-slot card`, (t) => {
  if (MODE === 'online') return t.skip('flag flip is tested in the W28 suite');
  const p = planFirstTouch(leadRow(lead('L03')), B, ctxFor(lead('L03'), { bookingUi: 'flow' }));
  assert.equal(p.template, 'broker_intro_slots_v2');
  assert.equal(p.variables.length, 4);
  assert.ok(renderBody(p.template, p.variables).includes('Mark Smith Financial Services (FSP 00000)'));
});

test(`W06 [${MODE}] 100% of routed fixture leads are inside 60 s (the number this agent moves)`, async () => {
  const routed = FIX.leads.filter((l) => l.expected.W06);
  assert.ok(routed.length >= 5);
  for (const fx of routed) {
    const p = await sys.plan(fx);
    assert.ok(p && within60(p), `${fx.fixture_id}: ${p?.send_at}`);
    assert.equal(p.template, fx.expected.W06.template, fx.fixture_id);
  }
});

test(`W06 [${MODE}] no first touch for out-of-band, duplicate, suppressed, opted-out or unrouted leads`, (t) => {
  if (MODE === 'online') return t.skip('covered by W01 online assertions (no W06 job is queued)');
  const base = leadRow(lead('L02'));
  for (const over of [{ qualified: false }, { duplicate_of: 'lead_test_L01' }, { stage: 'suppressed' }, { opted_out_at: '2026-10-12T09:02:20+02:00' }, { broker_id: null }])
    assert.equal(planFirstTouch({ ...base, ...over }, B, {}), null, JSON.stringify(over));
});

test(`W06 [${MODE}] disclosure evidence: message id logged; "delivered" stamps wa_delivered_at + disclosure_delivered_at`, (t) => {
  if (MODE === 'online') return t.skip('needs Meta status webhooks; checked in the 6B.10 rehearsal on a real phone');
  const l = leadRow(lead('L01'));
  const p = planFirstTouch(l, B, ctxFor(lead('L01')));
  const log = [{ wamid: 'wamid.TEST.L01.1', template: p.template, variables: p.variables, is_disclosure: true, sent_at: p.send_at, status: 'sent' }];
  applyStatus(l, log, { id: 'wamid.TEST.L01.1', status: 'delivered', at: '2026-10-12T08:14:43+02:00' });
  assert.equal(l.disclosure_msg_id, 'wamid.TEST.L01.1');
  assert.equal(l.disclosure_delivered_at, '2026-10-12T08:14:43+02:00');
  assert.equal(l.wa_delivered_at, '2026-10-12T08:14:43+02:00');
});

test(`W06 [${MODE}] undeliverable WhatsApp -> SMS fallback (Twilio) carrying the same disclosure`, (t) => {
  if (MODE === 'online') return t.skip('fault-injected in the 6B.10 drill');
  const l = leadRow(lead('L02'));
  const p = planFirstTouch(l, B, ctxFor(lead('L02')));
  const log = [{ wamid: 'wamid.TEST.L02.1', template: p.template, variables: p.variables, is_disclosure: true }];
  applyStatus(l, log, { id: 'wamid.TEST.L02.1', status: 'failed', at: '2026-10-12T09:02:40+02:00' });
  const sms = log.find((m) => m.channel === 'sms');
  assert.ok(sms);
  for (const needle of ['Mark Smith Financial Services (FSP 00000)', 'authorised financial services provider', 'Mark Smith', 'Reply STOP to opt out.']) assert.ok(sms.text.includes(needle), needle);
  assert.ok(!sms.text.includes('*'), 'no WhatsApp bold markers in SMS');
  assert.equal(l.disclosure_delivered_at, undefined, 'a failed WhatsApp is not disclosure evidence');
});

test(`W06 [${MODE}] template variables obey Meta's rules (no newline, tab or 4+ spaces) for every fixture`, async () => {
  for (const fx of FIX.leads.filter((l) => l.expected.W06)) {
    const p = await sys.plan(fx);
    for (const v of p.variables) assert.ok(!/[\n\t]| {4,}/.test(v), `${fx.fixture_id}: ${JSON.stringify(v)}`);
  }
});
