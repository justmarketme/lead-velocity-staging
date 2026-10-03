// DRAFT for GATE-TEST-W15 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W15 Opt-out ("STOP" anywhere) — 2.1.2 POPIA, 4.6 item 14, W24 suppression
// Money rule protected: the licence to operate. STOP is honoured instantly, wherever it arrives (mid-quiz,
// mid-nurture, mid-reminders, after the call): opted_out set, every scheduled message cancelled, the booking
// released, the broker told not to call, and the number suppressed Lead-Velocity-wide so no later form or
// workflow can message it again. Exactly one confirmation goes back; nothing after that.
//
// Run:  node --test automation/tests/W15.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
// Offline runs the Code nodes of automation/W15.json (Entry -> Plan opt-out -> Fan out) through _n8ncode.mjs; they
// load automation/lib/w15.mjs as n8n does (require('lv-automation').w15). Only the Postgres statements and the
// send / Graph / sub-workflow nodes are emulated in memory (same claim rule: the suppression insert).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FIX, MODE, lead, broker, clone, ms, iso, MIN, H, sha256, online } from './_harness.mjs';
import { runCode, PG_CRED } from './_n8ncode.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as W15 from '../lib/w15.mjs';
import { hashContact } from '../lib/w01.mjs';

const { isStop, hashMobile } = W15;
const require = createRequire(import.meta.url);
const WF = JSON.parse(readFileSync(new URL('../W15.json', import.meta.url), 'utf8'));
// Code nodes require('lv-automation') (I-46c); _n8ncode.mjs resolves that exact name to automation/index.cjs offline.
const RUN = WF;
const N = {
  trigger: 'Called by W07 / console / W34 (STOP or opt-out)',
  entry: 'Entry (w15.entryFrom + isStop)',
  stopIf: 'STOP? (else nothing: W07 owns every other message)',
  load: 'Load leads, live bookings, brokers, suppression for this number',
  plan: 'Plan opt-out (w15.planOptOut)',
  claim: 'Opt out + suppress + release bookings (one statement; the suppression insert is the claim)',
  fan: 'Fan out (W09, Graph delete, broker notices, one confirmation)',
  fanIf: 'Fan-out kind?',
  sms: 'POST /sms-inbound (Twilio)',
};

// ============================================================================================
// Offline system: the workflow's Code nodes; the database statements emulated in memory.
// ============================================================================================
const B = broker();
const dbBroker = (b) => ({ id: b.broker_id, whatsapp_number: b.adviser_whatsapp, email: b.email, contact_person: b.adviser_name, calendar_email: b.calendar_id, last_inbound_at: null });

export function newState() {
  return { leads: new Map(), bookings: [], jobs: [], sent: [], suppression: [], brokerNotifications: [], graphDeleted: [], activities: [], w09: [], fanout: [] };
}

/** Inbound text from `mobile` at `now` (the W07 hand-off item) -> W15. Returns what W15 did. */
export async function handleInbound(st, mobile, text, now, env = {}) {
  const [e] = await runCode(RUN, N.entry, { items: [{ source: 'whatsapp', route: 'W15', msg: { from: mobile.replace(/^\+/, ''), text, wamid: `wamid.TEST.${now}` } }] });
  const entry = { ...e.json, now }; // virtual clock (the SQL stamps now() in production)
  if (!(entry.stop && (entry.mobile || entry.lead_id))) return { handled: false };
  // "Load leads, live bookings, brokers, suppression for this number"
  const mh = hashContact(entry.mobile);
  const leads = [...st.leads.values()].filter((l) => hashContact(l.phone) === mh);
  const ctx = {
    mobile_hash: mh, mobile: entry.mobile,
    already_suppressed: st.suppression.some((s) => s.mobile_hash === mh && s.source === 'stop'),
    leads: leads.map((l) => ({ id: l.id, first_name: l.first_name, phone: l.phone, broker_id: l.broker_id, brand_id: 'smc', opted_out_at: l.opted_out_at ?? null, language: 'en' })),
    bookings: st.bookings.filter((b) => ['booked', 'confirmed'].includes(b.status) && leads.some((l) => l.id === b.lead_id)),
    brokers: FIX.brokers.filter((b) => leads.some((l) => l.broker_id === b.broker_id)).map(dbBroker),
  };
  const [p] = await runCode(RUN, N.plan, { json: ctx, env: { W15_STOP_BOOKING_MODE: env.W15_STOP_BOOKING_MODE ?? 'cancel' }, refs: { [N.stopIf]: entry } });
  const plan = p.json.plan;
  if (!plan.handled || plan.duplicate) return { handled: plan.handled, duplicate: !!plan.duplicate, plan };
  // The one statement: the suppression insert is the claim (ON CONFLICT (mobile_hash, source) DO NOTHING).
  const claimed = !st.suppression.some((s) => s.mobile_hash === plan.suppression.mobile_hash && s.source === 'stop');
  if (claimed) {
    st.suppression.push({ ...plan.suppression, added_at: iso(now) });
    for (const u of plan.lead_updates) Object.assign(st.leads.get(u.id), { opted_out_at: st.leads.get(u.id).opted_out_at ?? u.opted_out_at, stage: u.stage });
    for (const c of plan.booking_cancels) Object.assign(st.bookings.find((b) => b.id === c.booking_id), { status: 'cancelled', cancel_reason: 'lead_opted_out' });
    for (const a of plan.activities) if (!st.activities.some((x) => x.idempotency_key === a.idempotency_key)) st.activities.push({ ...a, workflow: 'W15', kind: a.activity_type });
  }
  const items = await runCode(RUN, N.fan, { json: { claimed }, refs: { [N.plan]: p.json } });
  st.fanout.push(...items.map((i) => i.json));
  for (const { json: f } of items) {
    if (f.kind === 'w09') {
      st.w09.push(f); // W09 pause (opt_out) + cancel_all: every unsent job for the lead / booking is cancelled
      for (const j of st.jobs) if (j.status === 'pending' && (f.lead_id ? j.lead_id === f.lead_id : st.bookings.some((b) => b.id === f.booking_id && b.lead_id === j.lead_id))) j.status = 'cancelled';
    }
    if (f.kind === 'graph_delete') st.graphDeleted.push(f.graph_event_id);
    if (f.kind === 'confirm_wa' || f.kind === 'confirm_sms') st.sent.push({ to: f.to, at: iso(now), kind: 'opt_out_confirmation', text: f.text });
  }
  // Broker notices: what the plan decided, cross-checked against what the fan-out actually emitted.
  for (const nt of plan.broker_notices) {
    const emitted = items.some(({ json: f }) => f.lead_id === nt.lead_id && (nt.channel === 'email' ? f.kind === 'broker_email' : ['broker_wa', 'broker_held'].includes(f.kind)));
    if (emitted) st.brokerNotifications.push({ to: nt.to, channel: nt.channel, lead_id: nt.lead_id, text: nt.text, mode: nt.mode });
  }
  return { handled: true, duplicate: false, plan };
}

/** Dispatcher: sends due jobs that are still pending (cancelled ones never go). */
export function tick(st, now) {
  for (const j of st.jobs) if (j.status === 'pending' && ms(j.at) <= now) { j.status = 'sent'; st.sent.push({ to: j.to, at: j.at, kind: j.touch }); }
}

/** What W01/W06 check before any message: suppression.mobile_hash = smc_hash_contact(number). */
export const isSuppressed = (st, mobile) => st.suppression.some((s) => s.mobile_hash === hashContact(mobile));

// ============================================================================================
// Fixture wiring: L10 booked, its full W09 plan + W12 post-call jobs queued.
// ============================================================================================
function seedL10(st) {
  const fx = lead('L10');
  const l = { id: fx.lead_id, first_name: fx.submission.first_name, mobile: fx.expected.W01.mobile, phone: fx.expected.W01.mobile, broker_id: B.broker_id, stage: 'booked' };
  st.leads.set(l.id, l);
  st.bookings.push({ id: 'bkg_L10', lead_id: l.id, broker_id: B.broker_id, status: 'booked', graph_event_id: 'AAMkTEST_L10', start: fx.booking_request.slot_start, method: fx.booking_request.method });
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
// Structure: the committed automation/W15.json
// ============================================================================================
test('W15 structure: id smc-w15, inactive, nodes present, every connection resolves, credentials by name', () => {
  assert.equal(WF.id, 'smc-w15');
  assert.equal(WF.active, false);
  const names = new Set(WF.nodes.map((n) => n.name));
  assert.equal(names.size, WF.nodes.length, 'unique node names');
  const types = new Set(WF.nodes.map((n) => n.type));
  for (const t of ['executeWorkflowTrigger', 'webhook', 'respondToWebhook', 'code', 'if', 'postgres', 'switch', 'executeWorkflow', 'httpRequest'])
    assert.ok(types.has(`n8n-nodes-base.${t}`), t);
  for (const n of Object.values(N)) assert.ok(names.has(n), n);
  for (const [from, c] of Object.entries(WF.connections)) {
    assert.ok(names.has(from), `connection source ${from}`);
    for (const out of c.main) for (const e of out) assert.ok(names.has(e.node), `${from} -> ${e.node}`);
  }
  for (const n of WF.nodes.filter((x) => x.credentials)) for (const cr of Object.values(n.credentials)) { assert.equal(cr.id, '', n.name); assert.ok(cr.name, n.name); }
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) assert.equal(n.credentials.postgres.name, PG_CRED, n.name);
  assert.equal(WF.settings.errorWorkflow, 'smc-w22');
  const claim = WF.nodes.find((n) => n.name === N.claim).parameters.query;
  assert.match(claim, /INSERT INTO public\.suppression[\s\S]*public\.smc_hash_contact\(\$1\), 'stop', NULL[\s\S]*ON CONFLICT \(mobile_hash, source\) DO NOTHING/, 'suppression insert is the claim, digits-only hash, LV-wide');
  const kinds = WF.nodes.find((n) => n.name === N.fanIf).parameters.rules.values.map((v) => v.outputKey);
  assert.deepEqual(kinds, ['w09', 'graph_delete', 'broker_wa', 'broker_email', 'confirm_wa', 'confirm_sms', 'broker_held']);
  assert.equal(WF.connections[N.fanIf].main.length, kinds.length, 'every fan-out kind is wired');
});

test('W15 structure: Code nodes load lib/w15.mjs via lv-automation, sub-workflows referenced by id', () => {
  const codes = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.code');
  for (const name of [N.entry, N.plan, N.fan]) assert.match(codes.find((n) => n.name === name).parameters.jsCode, /require\('lv-automation'\)\.w15;/, name);
  for (const n of codes) {
    assert.doesNotMatch(n.parameters.jsCode, /REPO_DIR|await import\(|pathToFileURL/, n.name);
    for (const m of n.parameters.jsCode.matchAll(/require\('([^']+)'\)/g)) assert.equal(m[1], 'lv-automation', `${n.name}: exact allowlisted name only (I-46c), got ${m[1]}`);
    assert.doesNotMatch(n.parameters.jsCode, /lv-automation\//, `${n.name}: no subpath require`);
  }
  const subs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow');
  for (const n of subs) assert.equal(n.parameters.workflowId.mode, 'id', n.name);
  assert.deepEqual(subs.map((n) => n.parameters.workflowId.value).sort(), ['smc-w04', 'smc-w09']);
});

test('W15 structure: every column the SQL names exists in the migrations', () => {
  assert.deepEqual(checkSql(workflowSql(WF)), []);
});

// ============================================================================================
// Behaviour
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

test(`W15 [${MODE}] suppression row: digits-only hash of the number, source stop, Lead-Velocity-wide (brand_id null)`, async () => {
  const sys = fresh();
  const { fx, l } = await sys.seedL10();
  await sys.inbound(l.mobile, fx.stop_message.text, fx.stop_message.at);
  // GATE-TEST-W15: fixture expected sha256 of the E.164 '+27…' number; 0.1/CONTRACTS says digits-only smc_hash_contact (migration 12, I-38a; CONTRACTS "W15 Opt-out") (needs-human-log 2026-10-03 (b))
  const of = fx.expected.W15.suppression.mobile_hash_of;
  const want = MODE === 'offline' ? hashContact(of) : sha256(of);
  assert.equal(hashMobile(of), sha256(of.replace(/\D/g, '')), 'w15.hashMobile = smc_hash_contact');
  assert.equal(hashMobile(of), hashContact(of), 'W15 and W01 hash the same way');
  const rows = (await sys.state(l.id)).suppression.filter((r) => r.mobile_hash === want);
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
  assert.equal(s.suppression.filter((r) => r.mobile_hash === (MODE === 'offline' ? hashContact(l.mobile) : sha256(l.mobile))).length, 1);
  assert.equal(s.broker_notifications.length, 2);
  assert.equal(s.sent.filter((m) => m.kind === 'opt_out_confirmation').length, 1);
});

test(`W15 [${MODE}] STOP anywhere: mid-CTWA quiz (not yet routed) and mid-nurture (unbooked) both opt out; unrouted -> no broker notice`, async (t) => {
  if (MODE === 'online') return t.skip('online variants run in the 6B.10 rehearsal script');
  const st = newState();
  const quiz = { id: 'lead_test_L04', first_name: 'Pieter', mobile: '+27600000104', phone: '+27600000104', broker_id: null, stage: 'new' };
  const nurture = { id: 'lead_test_L02', first_name: 'Sipho', mobile: '+27600000102', phone: '+27600000102', broker_id: B.broker_id, stage: 'disclosed' };
  st.leads.set(quiz.id, quiz);
  st.leads.set(nurture.id, nurture);
  st.jobs.push({ lead_id: nurture.id, touch: 'unbooked_nudge_24h', at: '2026-10-13T09:02:30+02:00', to: nurture.mobile, status: 'pending' });
  st.jobs.push({ lead_id: nurture.id, touch: 'unbooked_nudge_72h', at: '2026-10-15T09:02:30+02:00', to: nurture.mobile, status: 'pending' });
  await handleInbound(st, quiz.mobile, 'stop', ms('2026-10-12T19:05:50+02:00'));
  await handleInbound(st, nurture.mobile, 'Please stop', ms('2026-10-12T11:10:00+02:00'));
  assert.ok(quiz.opted_out_at && nurture.opted_out_at);
  assert.equal(st.brokerNotifications.filter((n) => n.lead_id === quiz.id).length, 0, 'no broker for an unrouted lead');
  assert.equal(st.brokerNotifications.filter((n) => n.lead_id === nurture.id).length, 2);
  assert.ok(st.jobs.every((j) => j.status === 'cancelled'));
  // Outside the broker's 24-h window with no booking (cancel mode): the broker_lead_opted_out template (I-55a); the email still goes too.
  const wa = st.fanout.find((f) => f.kind === 'broker_wa' && f.lead_id === nurture.id);
  assert.equal(wa.wa.type, 'template');
  assert.equal(wa.wa.template.name, 'broker_lead_opted_out');
  assert.ok(st.fanout.some((f) => f.kind === 'broker_email' && f.lead_id === nurture.id));
});

test(`W15 [${MODE}] STOP from a number we have no lead for: suppressed + confirmed, no lead row created`, async (t) => {
  if (MODE === 'online') return t.skip('covered by the W01 online suppression test');
  const st = newState();
  await handleInbound(st, '+27600000099', 'STOP', ms('2026-10-12T12:00:00+02:00'));
  assert.equal(st.leads.size, 0);
  assert.ok(isSuppressed(st, '+27600000099'));
  assert.equal(st.sent.length, 1);
});

test(`W15 [${MODE}] a later form from the STOPped number is suppressed (the W01/W06 gate reads this table)`, async (t) => {
  if (MODE === 'online') return t.skip('W01.test.mjs "a suppressed (STOPped) number is stored but never messaged" covers it online');
  const st = newState();
  const { fx, l } = seedL10(st);
  await handleInbound(st, l.mobile, fx.stop_message.text, ms(fx.stop_message.at));
  assert.equal(isSuppressed(st, '+27600000110'), true);
  assert.equal(fx.expected.W15.later_intake_whatsapp, false);
});

// ============================================================================================
// Code-node specifics (what n8n runs, through _n8ncode.mjs)
// ============================================================================================
test('W15 node "Plan opt-out": W15_STOP_BOOKING_MODE=keep keeps the booking and says so (NH-28 b); default cancels', async () => {
  const st = newState();
  const { fx, l } = seedL10(st);
  const r = await handleInbound(st, l.mobile, fx.stop_message.text, ms(fx.stop_message.at), { W15_STOP_BOOKING_MODE: 'keep' });
  assert.equal(r.plan.booking_mode, 'keep');
  assert.equal(st.bookings[0].status, 'booked');
  assert.equal(st.graphDeleted.length, 0);
  assert.ok(st.brokerNotifications.every((n) => /stays booked/.test(n.text)));
  assert.equal(W15.bookingMode(undefined), 'cancel', 'unset env -> cancel (.env.example default)');
});

test('W15 node "Plan opt-out": cancel mode + live booking -> the one confirmation is the filled STOP_ACK_CANCELLED (R6-04, I-49b)', async () => {
  const { LINES, fill } = await import('../../conversation/lines.mjs');
  const st = newState();
  const { fx, l } = seedL10(st);
  const start = st.bookings[0].start;
  const r = await handleInbound(st, l.mobile, fx.stop_message.text, ms(fx.stop_message.at));
  assert.equal(r.plan.booking_mode, 'cancel');
  assert.equal(r.plan.booking_cancels.length, 1);
  const d = new Date(ms(start) + 2 * H);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const want = fill(LINES.en.STOP_ACK_CANCELLED, { adviser_first: String(B.contact_person || B.adviser_name).trim().split(/\s+/)[0],
    date: `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`, time: d.toISOString().slice(11, 16) });
  assert.equal(r.plan.confirmation.text, want);
  assert.doesNotMatch(want, /\{/, 'every placeholder filled');
  // Earliest cancelled booking wins when there are several; nothing live -> plain STOP_ACK.
  const two = W15.planOptOut({ mobile: '+27820000001', text: 'STOP', now: Date.parse('2026-10-05T08:00:00Z'), leads: [{ id: 'L1', phone: '+27820000001', broker_id: 'b1' }],
    bookings: [{ id: 'k2', lead_id: 'L1', broker_id: 'b1', status: 'booked', start: '2026-10-09T10:00:00Z' }, { id: 'k1', lead_id: 'L1', broker_id: 'b1', status: 'confirmed', start: '2026-10-07T07:30:00Z' }],
    brokers: [{ id: 'b1', contact_person: 'Mark Smith' }] });
  assert.equal(two.confirmation.text, fill(LINES.en.STOP_ACK_CANCELLED, { adviser_first: 'Mark', date: 'Wed 7 Oct', time: '09:30' }));
  const none = W15.planOptOut({ mobile: '+27820000001', text: 'STOP', leads: [{ id: 'L1', phone: '+27820000001' }], bookings: [] });
  assert.equal(none.confirmation.text, LINES.en.STOP_ACK);
});

test('W15 node "Fan out": loses a parallel-STOP race -> emits nothing; out-of-window broker with a cancelled booking -> broker_booking_changed', async () => {
  const st = newState();
  const { fx, l } = seedL10(st);
  await handleInbound(st, l.mobile, fx.stop_message.text, ms(fx.stop_message.at));
  const wa = st.fanout.find((f) => f.kind === 'broker_wa');
  assert.equal(wa.wa.type, 'template');
  assert.equal(wa.wa.template.name, 'broker_booking_changed');
  assert.equal(wa.wa.to, B.adviser_whatsapp.replace('+', ''));
  assert.deepEqual(st.w09.map((w) => w.op), ['pause', 'cancel_all']);
  const confirm = st.fanout.find((f) => f.kind === 'confirm_wa');
  assert.equal(confirm.wa.type, 'text', 'the confirmation is a session text (the STOP opened the window)');
  const plan = { plan: { w09: [{ op: 'pause', lead_id: 'x' }], booking_cancels: [], broker_notices: [], confirmation: null }, ctx: { brokers: [] } };
  assert.deepEqual(await runCode(RUN, N.fan, { json: { claimed: false }, refs: { [N.plan]: plan } }), []);
});

test('W15 node "Entry": Twilio SMS STOP and console opt-out are accepted; a booking "Cancel" tap is not a STOP', async () => {
  const [sms] = await runCode(RUN, N.entry, { items: [{ source: 'twilio_sms', From: '+27600000110', Body: 'STOP' }] });
  assert.deepEqual([sms.json.channel, sms.json.stop, sms.json.mobile], ['sms', true, '+27600000110']);
  const [con] = await runCode(RUN, N.entry, { items: [{ op: 'opt_out', lead_id: 'lead_test_L10', channel: 'console' }] });
  assert.deepEqual([con.json.channel, con.json.stop, con.json.lead_id], ['console', true, 'lead_test_L10']);
  const [tap] = await runCode(RUN, N.entry, { items: [{ source: 'whatsapp', route: 'W10', msg: { from: '27600000110', text: 'Cancel' } }] });
  assert.equal(tap.json.stop, false);
});

test('I-54b F14 W15.json: DRY_RUN_SENDS leaves the same communications evidence as a live send (dry: ids), and never touches last_contact_at', async () => {
  const conn = (from, out = 0) => (WF.connections[from]?.main[out] || []).map((e) => e.node);
  const pgNode = (name) => WF.nodes.find((n) => n.name === name && n.type === 'n8n-nodes-base.postgres');
  const cases = [
    ['Live send? (broker WhatsApp)', 'Dry run: stand-in response (broker WhatsApp, dry:w15:broker_wa:{lead_id})', 'Log broker WhatsApp notice (communications; live wamid or dry:)', 'Send WhatsApp (broker notice)', 'dry:w15:broker_wa:'],
    ['Live send? (broker email)', 'Dry run: stand-in response (broker email, dry:w15:broker_email:{lead_id})', 'Log broker email notice (communications; live or dry:)', 'Email broker from howzit@ (Graph sendMail)', 'dry:w15:broker_email:'],
    ['Live send? (confirmation)', 'Dry run: stand-in response (confirmation, dry:w15:confirm:{lead_id})', 'Log confirmation + touch leads.last_contact_at (lead outbound)', 'Send WhatsApp (the one confirmation)', 'dry:w15:confirm:'],
  ];
  for (const [ifName, dryName, logName, sendName, prefix] of cases) {
    assert.deepEqual(conn(ifName, 0), [sendName], `${ifName} true -> live send`);
    assert.deepEqual(conn(ifName, 1), [dryName], `${ifName} false (DRY_RUN_SENDS) is connected`);
    assert.deepEqual(conn(dryName), [logName], 'dry stand-in -> the same evidence node');
    assert.ok(conn(sendName).includes(logName), 'live send -> the same evidence node');
    const [o] = await runCode(RUN, dryName, { json: { lead_id: 'lead_x', kind: 'x' } });
    const id = o.json.messages?.[0]?.id ?? o.json.dry_id;
    assert.equal(id, `${prefix}lead_x`);
    assert.ok(pgNode(logName).parameters.query.includes('public.communications'));
  }
  // lower-case category (F12) and the CHECK-listed vocabulary only
  const q = pgNode('Log broker WhatsApp notice (communications; live wamid or dry:)').parameters.query;
  assert.match(q, /CASE WHEN \$5 <> '' THEN 'utility' END/);
  assert.ok(!/'(UTILITY|MARKETING|SERVICE|AUTHENTICATION)'/.test(q));
  assert.match(pgNode('Log confirmation + touch leads.last_contact_at (lead outbound)').parameters.query, /last_contact_at = now\(\) WHERE id = \$1::uuid AND \$4 <> '' AND \$4 NOT LIKE 'dry:%'/);
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  // the params evaluate with a dry stand-in: wamid dry:..., template name for a template notice, session text body otherwise
  const tpl = { lead_id: 'lead_x', wa: { to: '27600000001', type: 'template', template: { name: 'broker_booking_changed' } } };
  const prm = JSON.parse(JSON.stringify(evalExpr(pgNode('Log broker WhatsApp notice (communications; live wamid or dry:)').parameters.options.queryReplacement, { messages: [{ id: 'dry:w15:broker_wa:lead_x' }] }, { 'Fan-out kind?': tpl })));
  assert.deepEqual([prm[0], prm[3], prm[4]], ['lead_x', 'dry:w15:broker_wa:lead_x', 'broker_booking_changed']);
  const txt = evalExpr(pgNode('Log broker WhatsApp notice (communications; live wamid or dry:)').parameters.options.queryReplacement, { messages: [{ id: 'wamid.1' }] }, { 'Fan-out kind?': { lead_id: 'l', wa: { to: '1', type: 'text', text: { body: 'hello' } } } });
  assert.deepEqual([txt[2], txt[4]], ['hello', '']);
});

function evalExpr(expr, json, refs) {
  const m = /^=\{\{([\s\S]*)\}\}$/.exec(String(expr).trim());
  const $ = (k) => ({ item: { json: refs[k] } });
  return new Function('$json', '$', `return (${m[1]});`)(json, $);
}

test('I-55a broker_lead_opted_out: cancel mode, window closed, no booking -> template with {{1}} adviser first, {{2}} lead first, URL suffix leads?lead=<id>; never the number', () => {
  const base = { mobile: '+27820000001', text: 'STOP', now: Date.parse('2026-10-05T08:00:00Z'), leads: [{ id: 'L1', first_name: 'Lerato Mokoena', phone: '+27820000001', broker_id: 'b1' }], bookings: [] };
  const brokers = [{ id: 'b1', contact_person: 'Mark Smith', adviser_whatsapp: '+27830000009', email: 'm@example.test', last_inbound_at: '2026-10-03T08:00:00Z' }];
  const r = W15.planOptOut({ ...base, brokers, booking_mode: 'cancel' });
  const wa = r.broker_notices.find((n) => n.channel === 'whatsapp');
  assert.equal(wa.mode, 'template');
  assert.equal(wa.template, 'broker_lead_opted_out');
  assert.deepEqual(wa.vars, ['Mark', 'Lerato']);
  assert.equal(wa.url_suffix, 'leads?lead=L1');
  assert.ok(!JSON.stringify(wa.vars).includes('27820000001'));
  const body = W15.brokerTemplate(wa.to, wa);
  assert.equal(body.template.name, 'broker_lead_opted_out');
  assert.deepEqual(body.template.components[0].parameters.map((x) => x.text), ['Mark', 'Lerato']);
  assert.equal(body.template.components[1].parameters[0].text, 'leads?lead=L1');
  assert.ok(r.broker_notices.some((n) => n.channel === 'email'), 'the email leg is unchanged');
  // inside the window: session text, no template; keep mode: held (the booking stands, nothing from this template); a cancelled booking still uses broker_booking_changed.
  const inWin = W15.planOptOut({ ...base, now: Date.parse('2026-10-03T09:00:00Z'), brokers, booking_mode: 'cancel' });
  assert.equal(inWin.broker_notices.find((n) => n.channel === 'whatsapp').mode, 'session');
  assert.equal(W15.planOptOut({ ...base, brokers, booking_mode: 'keep' }).broker_notices.find((n) => n.channel === 'whatsapp').mode, 'held_no_template');
  const withBk = W15.planOptOut({ ...base, brokers, booking_mode: 'cancel', bookings: [{ id: 'k1', lead_id: 'L1', broker_id: 'b1', status: 'booked', start: '2026-10-07T07:30:00Z', method: 'phone' }] });
  assert.equal(withBk.broker_notices.find((n) => n.channel === 'whatsapp').template, 'broker_booking_changed');
});
