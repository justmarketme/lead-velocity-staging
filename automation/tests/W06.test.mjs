// DRAFT for GATE-TEST-W06 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W06 First touch (< 60 s)
// Money rule protected: every routed lead gets the disclosure card — practice, FSP number, adviser — on
// WhatsApp within 60 seconds (HBR speed; 2.1.2 disclosure), with the right template, and the message id +
// delivery status are logged as disclosure evidence. A lead we must not message never gets one.
//
// Run:  node --test automation/tests/W06.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
// Loads the real logic (automation/lib/w06.mjs, the module the W06 Code nodes require as require('lv-automation').w06)
// and the real workflow (automation/W06.json): structure checks + its Code nodes run through _n8ncode.mjs.
// Slots come from the real W04 engine (lib/w04.mjs via _slots.mjs), offered the way W06 asks W04 (list, limit 10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FIX, MODE, lead, broker, clone, ms, iso, H, renderBody, template, online } from './_harness.mjs';
import { generateSlots, offerSlots } from './_slots.mjs';
import { runCode, PG_CRED, templateCounts } from './_n8ncode.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as W06 from '../lib/w06.mjs';

const { HOLD_S, DEADLINE_S, planFirstTouch, afterLateBooking, applyStatus, firstTouchTrigger } = W06;
const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');
const WF = JSON.parse(readFileSync(new URL('../W06.json', import.meta.url), 'utf8'));
// Code nodes require('lv-automation') (I-46c); _n8ncode.mjs resolves that exact name to automation/index.cjs offline.
const RUN = WF;
const SECRET = 'w06-test-lead-token-secret-0123456789abcdef';
const N = {
  trigger: 'Called by W01 / W05 / W07 (op routed | skip | booking | status)',
  hold: 'Hold for the in-page booking? (w06.holdSeconds)',
  claimed: 'Claimed? -> need W04 slots?',
  plan: 'Plan card (w06.planFirstTouch + toCloudApi)',
  evidence: 'Evidence rows (w06.communicationRow + sentUpdate)',
  status: 'Status effect (w06.statusEffect)',
  afterHold: 'Event after hold',
};

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
const bookingsFor = (fx) => (fx.fixture_id === 'L03' ? [{ start: '2026-10-13T10:30:00+02:00', end: '2026-10-13T11:00:00+02:00', status: 'booked' }] : []);
/** W04 sub-call as W06 makes it: { broker_id, limit: 10 } -> offerSlots(engine slots, 10), computed at send time. */
const w04List = (fx, atMs) => ({ slots: offerSlots(generateSlots(B, B.calendar_busy, bookingsFor(fx), atMs).slots, 10) });
const ctxFor = (fx, extra = {}) => {
  const ctx = {
    booking: fx.origin === 'page' && fx.booking_request ? { created_at: fx.booking_request.requested_at, start: fx.booking_request.slot_start, method: fx.booking_request.method, id: `bkg_${fx.fixture_id}` } : undefined,
    skipAt: fx.submission.skip_booking_at,
    ...extra,
  };
  ctx.slots = w04List(fx, firstTouchTrigger(leadRow(fx), ctx).send_ms).slots;
  return ctx;
};
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

/** The row "Load lead, broker, brand, live booking" returns (physical columns). */
const dbRow = (fx, over = {}) => {
  const l = leadRow(fx);
  return { id: l.id, brand_id: 'smc', origin: l.origin, first_name: l.first_name, phone: l.mobile, language: 'en', broker_id: B.broker_id, routed_at: l.routed_at,
    stage: 'new', opted_out_at: null, duplicate_of: null, disqualified_reason: null, first_message_at: null, suppressed: false,
    practice_name: B.practice_name, fsp_number: B.fsp_number, adviser_name: B.adviser_name, intro_card_url: B.intro_card_url, booking_ui: 'list', booking: null, ...over };
};

// ============================================================================================
// Structure: the committed automation/W06.json
// ============================================================================================
test('W06 structure: id smc-w06, inactive, nodes present, every connection resolves, credentials by name', () => {
  assert.equal(WF.id, 'smc-w06');
  assert.equal(WF.active, false);
  const names = new Set(WF.nodes.map((n) => n.name));
  assert.equal(names.size, WF.nodes.length, 'unique node names');
  const types = new Set(WF.nodes.map((n) => n.type));
  for (const t of ['executeWorkflowTrigger', 'switch', 'postgres', 'code', 'if', 'wait', 'httpRequest', 'executeWorkflow'])
    assert.ok(types.has(`n8n-nodes-base.${t}`), t);
  for (const n of Object.values(N)) assert.ok(names.has(n), n);
  for (const [from, c] of Object.entries(WF.connections)) {
    assert.ok(names.has(from), `connection source ${from}`);
    for (const out of c.main) for (const e of out) assert.ok(names.has(e.node), `${from} -> ${e.node}`);
  }
  for (const n of WF.nodes.filter((x) => x.credentials)) for (const cr of Object.values(n.credentials)) { assert.equal(cr.id, '', n.name); assert.ok(cr.name, n.name); }
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) assert.equal(n.credentials.postgres.name, PG_CRED, n.name);
  assert.equal(WF.settings.errorWorkflow, 'smc-w22');
  const wait = WF.nodes.find((n) => n.type === 'n8n-nodes-base.wait');
  assert.equal(wait.parameters.amount, HOLD_S, 'the Wait node holds exactly HOLD_S');
  assert.ok(WF.nodes.find((n) => /Claim the one first touch/.test(n.name)).parameters.query.includes("'w06:first:' || l.id::text"), 'one claim per lead');
});

test('W06 structure: Code nodes load lib/w06.mjs via lv-automation, sub-workflows referenced by id', () => {
  const codes = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.code');
  for (const name of [N.hold, N.plan, N.evidence, N.status])
    assert.match(codes.find((n) => n.name === name).parameters.jsCode, /require\('lv-automation'\)\.w06;/, name);
  for (const n of codes) {
    assert.doesNotMatch(n.parameters.jsCode, /REPO_DIR|await import\(|pathToFileURL/, n.name);
    for (const m of n.parameters.jsCode.matchAll(/require\('([^']+)'\)/g)) assert.equal(m[1], 'lv-automation', `${n.name}: exact allowlisted name only (I-46c), got ${m[1]}`);
    assert.doesNotMatch(n.parameters.jsCode, /lv-automation\//, `${n.name}: no subpath require`);
  }
  const subs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow');
  for (const n of subs) assert.equal(n.parameters.workflowId.mode, 'id', n.name);
  assert.deepEqual(subs.map((n) => n.parameters.workflowId.value).sort(), ['smc-w04', 'smc-w22']);
  assert.equal(subs.find((n) => n.parameters.workflowId.value === 'smc-w04').parameters.options.waitForSubWorkflow, true, 'W04 slots are awaited');
});

test('W06 structure: every column the SQL names exists in the migrations', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
});

test('W06 lib template bodies are byte-identical to the submitted templates (a template edit without a code edit fails)', () => {
  for (const name of Object.keys(W06.TEMPLATE_BODY)) {
    assert.equal(W06.TEMPLATE_BODY[name], template(name).components.find((c) => c.type === 'BODY').text, name);
    assert.equal(W06.VAR_COUNT[name], templateCounts(name).body, name);
  }
});

// ============================================================================================
// Behaviour (lib/w06.mjs, the module the Code nodes run)
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
  for (const needle of [`${B.practice_name} (FSP ${B.fsp_number})`, 'an authorised financial services provider', '*Mark Smith*', 'Microsoft Teams', 'Thu 15 Oct at 10:00', 'Reply STOP to opt out.'])
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
  // GATE-TEST-W06: fixture expected payloads 'slot:{ISO}'; 0.1/CONTRACTS says 'slot_{ISO}' (CONTRACTS "W06 First touch" quick-reply payloads; W07 router sends /^slot_/ taps to W05) (needs-human-log 2026-10-03 (d))
  for (const b of p.buttons.slice(0, 3)) assert.match(b.payload, /^slot_\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(p.buttons.slice(0, 3).map((b) => b.payload.replace(/^slot_/, '')), lead('L02').expected.W04.offered);
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
  assert.ok(renderBody(p.template, p.variables).includes(`${B.practice_name} (FSP ${B.fsp_number})`));
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
  for (const needle of [`${B.practice_name} (FSP ${B.fsp_number})`, 'authorised financial services provider', 'Mark Smith', 'Reply STOP to opt out.']) assert.ok(sms.text.includes(needle), needle);
  assert.ok(!sms.text.includes('*'), 'no WhatsApp bold markers in SMS');
  assert.equal(l.disclosure_delivered_at, undefined, 'a failed WhatsApp is not disclosure evidence');
});

test(`W06 [${MODE}] template variables obey Meta's rules (no newline, tab or 4+ spaces) for every fixture`, async () => {
  for (const fx of FIX.leads.filter((l) => l.expected.W06)) {
    const p = await sys.plan(fx);
    for (const v of p.variables) assert.ok(!/[\n\t]| {4,}/.test(v), `${fx.fixture_id}: ${JSON.stringify(v)}`);
  }
});

// ============================================================================================
// The Code nodes of W06.json (what n8n runs, through _n8ncode.mjs)
// ============================================================================================
test('W06 node "Hold": page lead on op routed waits HOLD_S; lead-ad / CTWA / skip go at once; blocked leads stop', async () => {
  const run = async (fx, op, over) => (await runCode(RUN, N.hold, { json: dbRow(fx, over), refs: { [N.trigger]: { op, lead_id: fx.lead_id } } }))[0].json;
  assert.equal((await run(lead('L02'), 'routed')).hold_s, HOLD_S);
  assert.equal((await run(lead('L02'), 'skip')).hold_s, 0);
  assert.equal((await run(lead('L03'), 'routed')).hold_s, 0);
  assert.equal((await run(lead('L04'), 'routed')).hold_s, 0);
  assert.equal((await run(lead('L02'), 'routed', { suppressed: true })).blocked, 'suppressed');
  assert.equal((await run(lead('L02'), 'routed', { opted_out_at: '2026-10-12T09:02:20+02:00' })).blocked, 'opted_out');
  assert.equal((await run(lead('L02'), 'routed', { disqualified_reason: 'age_band' })).blocked, 'out_of_band');
});

test('W06 node "Plan card": slots card from the W04 list -> Cloud API template with slot_{ISO} payloads; booking -> booked card', async () => {
  const fx = lead('L02');
  const l = dbRow(fx);
  const plan = async (ev, w04, over = {}) => (await runCode(RUN, N.plan, { json: w04, env: { LEAD_TOKEN_SECRET: SECRET }, refs: { [N.claimed]: { ev, l: { ...l, ...over }, claimed: true, need_slots: !!w04.slots, broker_id: l.broker_id } } }))[0].json;
  const a = await plan({ op: 'skip', lead_id: l.id }, w04List(fx, ms(fx.submission.skip_booking_at)));
  assert.equal(a.plan.template, 'broker_intro_slots');
  assert.equal(a.wa.to, '27600000102');
  assert.equal(a.wa.template.name, 'broker_intro_slots');
  assert.equal(a.wa.template.components[0].parameters[0].image.link, B.intro_card_url, 'header = the broker intro card');
  const qr = a.wa.template.components.filter((c) => c.sub_type === 'quick_reply').map((c) => c.parameters[0].payload);
  // GATE-TEST-W06: fixture expected 'slot:{ISO}'; 0.1/CONTRACTS says 'slot_{ISO}' (W07 router) (needs-human-log 2026-10-03 (d))
  assert.deepEqual(qr, [...lead('L02').expected.W04.offered.map((s) => `slot_${s}`), 'other_times']);
  assert.equal(a.wa.template.components.find((c) => c.type === 'body').parameters.length, templateCounts('broker_intro_slots').body);

  const bk = { id: 'bkg_L01', created_at: '2026-10-12T08:14:41+02:00', start: '2026-10-15T10:00:00+02:00', method: 'teams' };
  const b = await plan({ op: 'booking', lead_id: l.id }, {}, { origin: 'page', booking: bk, first_name: 'Lerato' });
  assert.equal(b.plan.template, 'broker_intro_booked');
  assert.deepEqual(b.plan.variables, lead('L01').expected.W06.variables);
  assert.deepEqual(b.wa.template.components.filter((c) => c.type === 'button').map((c) => c.sub_type), ['url', 'quick_reply', 'quick_reply']);

  const f = await plan({ op: 'routed', lead_id: l.id }, {}, { origin: 'lead_ad', booking_ui: 'flow' });
  assert.equal(f.plan.template, 'broker_intro_slots_v2');
  const flowBtn = f.wa.template.components.find((c) => c.sub_type === 'flow');
  assert.ok(LT.verifyFlowToken(flowBtn.parameters[0].action.flow_token, { secret: SECRET }).ok, 'flow_token minted per CONTRACTS "W28 flow_token"');
  assert.equal(f.flow_token, 'minted', 'the token itself is never echoed in the item');

  const short = await plan({ op: 'skip', lead_id: l.id }, { slots: w04List(fx, ms(fx.submission.skip_booking_at)).slots.slice(0, 2) });
  assert.equal(short.plan.template, 'broker_intro_slots_v2', 'fewer than 3 slots -> the Flow card still discloses');
  assert.equal(short.plan.fallback_from, 'not_enough_slots');
});

test('W06 node "Status effect": delivered -> evidence; failed -> one SMS with the same disclosure words', async () => {
  const p = planFirstTouch(leadRow(lead('L02')), B, ctxFor(lead('L02')));
  const m = { comm_id: 'c1', lead_id: 'lead_test_L02', brand_id: 'smc', broker_id: B.broker_id, template_name: p.template, recipient_contact: '+27600000102', metadata: { is_disclosure: true, variables: p.variables } };
  const run = async (status) => (await runCode(RUN, N.status, { json: m, refs: { [N.trigger]: { op: 'status', wamid: 'wamid.TEST.L02.1', status, at: '2026-10-12T09:02:40+02:00' } } }))[0].json;
  const d = await run('delivered');
  assert.equal(d.e.lead_update.disclosure_msg_id, 'wamid.TEST.L02.1');
  assert.equal(d.sms, null);
  const f = await run('failed');
  assert.equal(f.e.lead_update, null);
  assert.equal(f.sms.to, '+27600000102');
  assert.ok(f.sms.text.includes(`${B.practice_name} (FSP ${B.fsp_number})`) && !f.sms.text.includes('*'));
  const none = (await runCode(RUN, N.status, { json: {}, refs: { [N.trigger]: { op: 'status', wamid: 'x', status: 'failed' } } }))[0].json;
  assert.equal(none.skip, true, 'a status for a message W06 did not send is ignored');
});

test('W06 node "Evidence rows": a wamid stamps first_message_at / last_contact_at; a rejected send goes to SMS at once', async () => {
  const fx = lead('L02');
  const l = dbRow(fx);
  const p = planFirstTouch(leadRow(fx), B, ctxFor(fx));
  const ref = { [`${N.plan}`]: { l, plan: p } };
  const ok = (await runCode(RUN, N.evidence, { json: { messages: [{ id: 'wamid.TEST.L02.1' }] }, refs: ref }))[0].json;
  assert.equal(ok.wamid, 'wamid.TEST.L02.1');
  assert.equal(ok.comm.template_name, 'broker_intro_slots');
  assert.equal(ok.comm.metadata.is_disclosure, true);
  assert.ok(ok.upd.first_message_at && ok.upd.last_contact_at);
  assert.equal(ok.sms, null);
  const bad = (await runCode(RUN, N.evidence, { json: { error: { message: '(#131026) undeliverable' } }, refs: ref }))[0].json;
  assert.equal(bad.wamid, null);
  assert.equal(bad.upd, null, 'no wamid -> last_contact_at untouched');
  assert.ok(bad.sms.text.includes('Reply STOP to opt out.'));
});

test('I-45f W06 nodes: { event: booking } from W05 is op booking; a booking that lost the claim -> booking_confirmed once', async () => {
  const fx = lead('L02');
  const l = dbRow(fx);
  const bk = { id: 'bkg_L02', created_at: '2026-10-12T09:05:00+02:00', start: '2026-10-15T10:00:00+02:00', method: 'phone' };
  const hold = (await runCode(RUN, N.hold, { json: dbRow(fx, { booking: bk }), refs: { [N.trigger]: { event: 'booking', lead_id: l.id, booking_id: bk.id, start: bk.start, method: bk.method } } }))[0].json;
  assert.equal(hold.ev.op, 'booking');
  assert.equal(hold.hold_s, 0, 'a booking event never waits');
  const claimedRef = { ...hold, l: { ...l, booking: bk } };
  const lost = await runCode(RUN, N.claimed, { items: [{}], refs: { [N.hold]: claimedRef, [N.afterHold]: {} } });
  assert.equal(lost[0].json.claimed, false);
  assert.equal(lost[0].json.late_booking, true, 'claim taken by the slots card -> booking_confirmed path');
  const won = await runCode(RUN, N.claimed, { items: [{ lead_id: l.id }], refs: { [N.hold]: claimedRef, [N.afterHold]: {} } });
  assert.equal(won[0].json.late_booking, false, 'claim won -> broker_intro_booked (the intro card is the confirmation)');
  const cname = 'booking_confirmed item (w06.lateBookingConfirmed, claimed only)';
  const item = (await runCode(RUN, cname, { items: [{ lead_id: l.id }], env: { DRY_RUN_SENDS: 'false' }, refs: { [N.claimed]: { l: { ...l, booking: bk } } } }))[0].json;
  assert.equal(item.template, 'booking_confirmed');
  assert.equal(item.wa.template.name, 'booking_confirmed');
  assert.equal(item.wa.to, '27600000102');
  const qr = item.wa.template.components.filter((c) => c.sub_type === 'quick_reply').map((c) => c.parameters[0].payload);
  assert.deepEqual(qr, ['confirm:bkg_L02', 'reschedule:bkg_L02', 'cancel:bkg_L02']);
  assert.equal(item.wa.template.components.find((c) => c.type === 'body').parameters.length, templateCounts('booking_confirmed').body);
  const none = await runCode(RUN, cname, { items: [{}], refs: { [N.claimed]: { l: { ...l, booking: bk } } } });
  assert.deepEqual(none, [], 'claim not won (already confirmed, or this booking sent broker_intro_booked) -> nothing');
  const claim = RUN.nodes.find((n) => n.name === 'Claim booking_confirmed (w06:booking_confirmed:{booking_id})');
  assert.match(claim.parameters.query, /payload->>'booking_id' = \$2::text/, 'never after this booking\'s own broker_intro_booked');
  const wired = (RUN.connections['Claimed by this event?'].main[1] || []).map((c) => c.node);
  assert.deepEqual(wired, ['Booking after the card? -> booking_confirmed']);
});

test('F4 (REHEARSAL-L01 exec 21/40) DRY_RUN_SENDS: the dry branch of both "Send live?" IFs writes the same evidence rows with external_id dry:<correlation>', async () => {
  const fx = lead('L02');
  const l = dbRow(fx);
  const p = planFirstTouch(leadRow(fx), B, ctxFor(fx));
  const DRY_CARD = 'Dry run: stand-in response (external_id dry:w06:first:{lead_id})';
  const DRY_BC = 'Dry run: stand-in response (external_id dry:w06:booking_confirmed:{booking_id})';
  const out = (name, i) => ((RUN.connections[name] || {}).main || [])[i] || [];
  // The rehearsal failure: output 1 (false = dry) of both IFs went nowhere.
  assert.deepEqual(out('Send live? (not DRY_RUN_SENDS)', 1).map((c) => c.node), [DRY_CARD]);
  assert.deepEqual(out(DRY_CARD, 0).map((c) => c.node), [N.evidence], 'dry card -> the same evidence node as a live send');
  assert.deepEqual(out('Send booking_confirmed live? (not DRY_RUN_SENDS)', 1).map((c) => c.node), [DRY_BC]);
  assert.deepEqual(out(DRY_BC, 0).map((c) => c.node), ['Log booking_confirmed + last_contact_at (only with a wamid)']);
  // Stand-in response: only for a planned, dry item; correlation = the claim key.
  const planned = { l, plan: p, wa: { to: l.phone }, dry: true };
  const r = await runCode(RUN, DRY_CARD, { json: planned, env: { DRY_RUN_SENDS: 'true' } });
  assert.equal(r[0].json.messages[0].id, `dry:w06:first:${l.id}`);
  assert.deepEqual(await runCode(RUN, DRY_CARD, { json: { ...planned, wa: null } }), [], 'nothing planned -> nothing logged (as before)');
  const ev = (await runCode(RUN, N.evidence, { json: r[0].json, refs: { [N.plan]: { ...planned } } }))[0].json;
  assert.equal(ev.wamid, `dry:w06:first:${l.id}`);
  assert.equal(ev.comm.metadata.dry_run, true);
  assert.equal(ev.sms, null, 'a dry run never falls back to SMS');
  assert.ok(ev.upd && ev.upd.disclosure_msg_id === `dry:w06:first:${l.id}`, 'first-touch timing + disclosure evidence stamped');
  const bc = await runCode(RUN, DRY_BC, { json: { l, booking_id: 'bkg_L02', wa: { to: l.phone }, dry: true } });
  assert.equal(bc[0].json.messages[0].id, 'dry:w06:booking_confirmed:bkg_L02');
  // A dry id is evidence but not contact: last_contact_at only moves for a real wamid (same rule as wa.touchesLastContact).
  for (const name of ['Log card + stamp lead + timeline (one statement; last_contact_at only with a wamid)', 'Log booking_confirmed + last_contact_at (only with a wamid)']) {
    const q = RUN.nodes.find((n) => n.name === name).parameters.query;
    assert.match(q, /NOT LIKE 'dry:%'/, `${name}: last_contact_at guarded for dry ids`);
  }
});

// Round 3 F12 (REHEARSAL-L01): communications_smc_checks allows template_category utility | marketing |
// authentication | service (lower case). W06's dry first-touch log wrote 'UTILITY' and every first touch failed at
// the INSERT on a real database. No workflow SQL may write an upper-case category literal.
test('F12: no workflow writes an upper-case template_category literal (communications_smc_checks is lower case)', async () => {
  const { allWorkflows } = await import('./_n8ncode.mjs');
  const bad = [];
  for (const { file, wf } of allWorkflows())
    for (const n of wf.nodes) {
      const q = n.parameters && n.parameters.query;
      if (typeof q === 'string' && /'(UTILITY|MARKETING|AUTHENTICATION|SERVICE)'/.test(q) && /communications/.test(q)) bad.push(`${file}: ${n.name}`);
    }
  assert.deepEqual(bad, []);
});
