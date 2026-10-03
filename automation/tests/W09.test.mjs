// DRAFT for GATE-TEST-W09 — Jonathan approves or edits; the workflow is not built until this is approved.
//
// W09 Reminder sequence (client) — canonical sequence 4.12, minimum set 4.6 item 6
// Money rule protected: show rate. Multiple reminders beat one (Cochrane / BMJ Open); every touch is useful,
// lands at the right moment, is sent exactly once, and stops the instant the lead says STOP or the booking moves.
//   T0 + 10 min  what_to_expect
//   T-48 h       intro_media (video; voice if no video) — if booked >= 3 days out, else straight after booking
//   T-24 h       reminder_24h (Confirm / Reschedule) + prep_nudge
//   T-2 h        reminder_2h
//   T-10 min     reminder_10m
//   Booked < 24 h ahead -> compressed: no T-24 h touches.
//
// Run:  node --test automation/tests/W09.test.mjs     (offline)  ·  set N8N_PUBLIC_URL for online.
// Loads the real logic (automation/lib/w09.mjs) and the real workflow (automation/W09.json) for the structure checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX, MODE, lead, broker, clone, ms, iso, MIN, H, D, renderBody, template, online } from './_harness.mjs';

// ============================================================================================
// The real module (automation/lib/w09.mjs, imported by the Code nodes of automation/W09.json)
// ============================================================================================
import { readFileSync } from 'node:fs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';
import * as R from '../lib/w09.mjs';
const { reminderPlan, Scheduler, onConfirmTap, onReschedule, MAX_LEAD_MESSAGES } = R;
const WF = JSON.parse(readFileSync(new URL('../W09.json', import.meta.url), 'utf8'));

// ============================================================================================
// Adapters
// ============================================================================================
const B = broker();
const leadOf = (fx) => ({ id: fx.lead_id, language: 'en', mobile: fx.expected.W01?.mobile });
const planFor = (fx, over = {}) =>
  reminderPlan({ bookingId: `bkg_${fx.fixture_id}`, start: fx.booking_request.slot_start, bookedAt: fx.booking_request.requested_at, lead: leadOf(fx), broker: B, ...over });

const offlineSys = { plan: async (fx) => planFor(fx) };
const onlineSys = {
  plan: async (fx) => {
    await online.post('/test/reset', { broker_id: B.broker_id, keep_calendar_busy: true });
    const r = fx.origin === 'page' ? await online.post('/lead', fx.submission, { now: fx.submission.submitted_at }) : await online.post('/test/seed-lead', fx);
    await online.post('/book', { ...fx.booking_request, lead_id: r.body.lead_id }, { now: fx.booking_request.requested_at });
    const s = await online.state(r.body.lead_id);
    const jobs = (s.scheduled ?? []).filter((j) => j.workflow === 'W09' && j.status === 'pending').map((j) => ({ touch: j.touch, at: j.at, template: j.template, key: j.key }));
    return { compressed: s.booking?.compressed ?? null, jobs };
  },
};
const sys = MODE === 'online' ? onlineSys : offlineSys;
const simple = (jobs) => jobs.map((j) => ({ touch: j.touch, at: j.at }));

// ============================================================================================
// Tests
// ============================================================================================
for (const id of ['L01', 'L04', 'L10']) {
  test(`W09 [${MODE}] ${id}: booked >= 24 h ahead -> full sequence at the hand-computed times`, async () => {
    const fx = lead(id);
    const p = await sys.plan(fx);
    assert.deepEqual(simple(p.jobs), fx.expected.W09.schedule);
    if (p.compressed !== null) assert.equal(p.compressed, false);
  });
}

for (const id of ['L02', 'L03']) {
  test(`W09 [${MODE}] ${id}: booked < 24 h ahead -> compressed (no T-24 h reminder or prep nudge)`, async () => {
    const fx = lead(id);
    const p = await sys.plan(fx);
    assert.deepEqual(simple(p.jobs), fx.expected.W09.schedule);
    assert.ok(!p.jobs.some((j) => ['reminder_24h', 'prep_nudge'].includes(j.touch)));
    if (p.compressed !== null) assert.equal(p.compressed, true);
  });
}

test(`W09 [${MODE}] intro media: T-48 h only when booked >= 3 days out (L01), else 15 min after booking (L04)`, async () => {
  const a = (await sys.plan(lead('L01'))).jobs.find((j) => j.touch === 'intro_media');
  assert.equal(a.at, iso(ms(lead('L01').booking_request.slot_start) - 48 * H));
  const b = (await sys.plan(lead('L04'))).jobs.find((j) => j.touch === 'intro_media');
  assert.equal(b.at, iso(ms(lead('L04').booking_request.requested_at) + 15 * MIN));
});

test(`W09 [${MODE}] every touch falls strictly between booking and meeting, in time order`, async () => {
  for (const fx of FIX.leads.filter((l) => l.expected.W09)) {
    const p = await sys.plan(fx);
    const T0 = ms(fx.booking_request.requested_at);
    const M = ms(fx.booking_request.slot_start);
    let prev = 0;
    for (const j of p.jobs) {
      assert.ok(ms(j.at) > T0 && ms(j.at) < M, `${fx.fixture_id} ${j.touch}`);
      assert.ok(ms(j.at) >= prev, `${fx.fixture_id} order`);
      prev = ms(j.at);
    }
  }
});

test(`W09 [${MODE}] booked exactly 2 h ahead (minimum notice): no separate T-2 h, T-10 min still goes`, (t) => {
  if (MODE === 'online') return t.skip('edge case of the pure rule');
  const fx = clone(lead('L02'));
  fx.booking_request.slot_start = '2026-10-12T13:40:00+02:00';
  const p = planFor(fx);
  assert.deepEqual(p.jobs.map((j) => j.touch), ['what_to_expect', 'intro_media', 'reminder_10m']);
});

test(`W09 [${MODE}] voice note replaces video when the broker has no approved video; nothing if neither`, (t) => {
  if (MODE === 'online') return t.skip('broker media is seeded per broker in W23 tests');
  const noVideo = { ...clone(B), intro_video_url: {} };
  const p = reminderPlan({ bookingId: 'b', start: lead('L01').booking_request.slot_start, bookedAt: lead('L01').booking_request.requested_at, lead: leadOf(lead('L01')), broker: noVideo });
  assert.equal(p.jobs.find((j) => j.touch === 'intro_media').template, 'intro_media_voice');
  const none = { ...noVideo, intro_voice_url: {} };
  const q = reminderPlan({ bookingId: 'b', start: lead('L01').booking_request.slot_start, bookedAt: lead('L01').booking_request.requested_at, lead: leadOf(lead('L01')), broker: none });
  assert.ok(!q.jobs.some((j) => j.touch === 'intro_media'));
});

test(`W09 [${MODE}] T-24 h "Confirm" tap -> booking status confirmed (L01)`, async (t) => {
  if (MODE === 'online') {
    const fx = lead('L01');
    const tap = fx.timeline.find((e) => e.data?.button === 'Confirm');
    await online.waInbound({ from: fx.expected.W01.mobile, buttonPayload: `confirm:bkg_${fx.fixture_id}`, now: ms(tap.at) });
    return t.diagnostic('online: confirm asserted via /test/state in the rehearsal script');
  }
  const bk = { id: 'bkg_L01', status: 'booked' };
  onConfirmTap(bk, ms(lead('L01').timeline.find((e) => e.data?.button === 'Confirm').at));
  assert.equal(bk.status, lead('L01').expected.W09.after_confirm_tap.booking_status);
});

test(`W09 [${MODE}] reschedule (L03): old reminders cancelled, new ones for the new time, intro not resent, same booking row`, (t) => {
  if (MODE === 'online') return t.skip('online reschedule is part of the W10 suite and the rehearsal');
  const fx = lead('L03');
  const exp = fx.expected.W09.after_reschedule;
  const sched = new Scheduler();
  const l = leadOf(fx);
  const bk = { id: 'bkg_L03', start: fx.booking_request.slot_start, status: 'booked', graph_event_id: 'AAMkTEST_L03' };
  sched.add(l.id, bk.id, planFor(fx).jobs);
  const resAt = ms(fx.reschedule_request.requested_at);
  sched.tick(resAt); // what_to_expect, intro_media, reminder_2h already went out
  const { cancelled, plan } = onReschedule(sched, bk, l, B, fx.reschedule_request.new_slot_start, resAt);
  assert.deepEqual(cancelled.map((c) => `${c.touch}@${c.at}`), exp.cancelled);
  assert.deepEqual(simple(plan.jobs), exp.schedule);
  for (const touch of exp.not_resent) assert.ok(!plan.jobs.some((j) => j.touch === touch), touch);
  assert.equal(bk.graph_event_id, 'AAMkTEST_L03', 'event moved, not duplicated');
  assert.equal(bk.reschedule_count, exp.reschedule_count);
});

test(`W09 [${MODE}] STOP (L10) cancels every pending reminder; an opted-out lead gets no plan at all`, (t) => {
  if (MODE === 'online') return t.skip('asserted in W15.test.mjs online');
  const fx = lead('L10');
  const sched = new Scheduler();
  const l = leadOf(fx);
  sched.add(l.id, 'bkg_L10', planFor(fx).jobs);
  const stopAt = ms(fx.stop_message.at);
  sched.tick(stopAt);
  const cancelled = sched.cancel((r) => r.lead_id === l.id);
  assert.deepEqual(cancelled.map((c) => c.touch), ['reminder_2h', 'reminder_10m']);
  sched.tick(ms(fx.booking_request.slot_start));
  assert.ok(sched.sent.every((s) => ms(s.at) <= stopAt), 'nothing sent after STOP');
  assert.equal(planFor(fx, { lead: { ...l, opted_out_at: fx.stop_message.at } }).jobs.length, 0);
});

test(`W09 [${MODE}] scheduler sends each reminder exactly once even if ticks overlap or repeat (no retry storm)`, (t) => {
  if (MODE === 'online') return t.skip('idempotency keys asserted on the scheduler table in staging');
  const sched = new Scheduler();
  const fx = lead('L01');
  const jobs = planFor(fx).jobs;
  sched.add(fx.lead_id, 'bkg_L01', jobs);
  sched.add(fx.lead_id, 'bkg_L01', jobs); // workflow re-run: same keys, no duplicates
  const end = ms(fx.booking_request.slot_start);
  for (let now = ms(fx.booking_request.requested_at); now <= end; now += 30 * MIN) { sched.tick(now); sched.tick(now); }
  sched.tick(end); sched.tick(end);
  assert.equal(sched.sent.length, jobs.length);
  assert.equal(new Set(sched.sent.map((s) => s.key)).size, jobs.length);
});

test(`W09 [${MODE}] message budget: first touch + reminders + post-call touches <= ${MAX_LEAD_MESSAGES} per booked lead`, async () => {
  const POST_CALL = ['reach_check', 'attended_thanks', 'lead_pulse'];
  for (const fx of FIX.leads.filter((l) => l.expected.W09)) {
    const n = 1 + (await sys.plan(fx)).jobs.length + POST_CALL.length;
    assert.ok(n <= MAX_LEAD_MESSAGES, `${fx.fixture_id}: ${n}`);
  }
});

test(`W09 [${MODE}] reminder copy comes from the real templates (positive norm, Confirm/Reschedule, STOP line)`, () => {
  const t24 = renderBody('reminder_24h', ['Lerato', 'Microsoft Teams', 'Mark Smith', '10:00']);
  assert.ok(t24.includes('Most people find 30 minutes is all it takes'));
  assert.ok(t24.includes('Reply STOP to opt out.'));
  const btns = template('reminder_24h').components.find((c) => c.type === 'BUTTONS').buttons.map((b) => b.text);
  assert.deepEqual(btns, ['Confirm', 'Reschedule']);
  for (const name of ['what_to_expect', 'reminder_2h', 'reminder_10m', 'prep_nudge', 'intro_media', 'intro_media_voice'])
    assert.equal(template(name).category, 'UTILITY', name);
});

// ============================================================================================
// Workflow checks: automation/W09.json runs automation/lib/w09.mjs (Code nodes executed here as n8n does)
// ============================================================================================
import { runCode, templateCounts, PG_CRED } from './_n8ncode.mjs';
import { paramCounts, inQuiet } from '../lib/wa.mjs';
const node = (name) => WF.nodes.find((n) => n.name === name);

test('W09.json: DRAFT name, inactive, one Postgres credential, physical columns only, Code nodes require(\'lv-automation\').w09, id smc-w09', () => {
  assert.equal(WF.name, 'W09 Reminder sequence (DRAFT pending GATE-TEST-W09)');
  assert.equal(WF.active, false);
  const pgs = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres');
  assert.ok(pgs.length >= 8);
  assert.ok(pgs.every((n) => n.credentials.postgres.name === PG_CRED && n.credentials.postgres.id === ''), 'credential by name only');
  assert.deepEqual(checkSql(workflowSql(WF)), []);
  const codes = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.code' && /\(w09\./.test(n.name));
  assert.ok(codes.length >= 5);
  for (const n of codes) assert.match(n.parameters.jsCode, /require\('lv-automation'\)\.w09;/, n.name);
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    for (const m of n.parameters.jsCode.matchAll(/require\('([^']+)'\)/g)) assert.equal(m[1], 'lv-automation', `${n.name}: exact allowlisted name only (I-46c), got ${m[1]}`);
    assert.doesNotMatch(n.parameters.jsCode, /REPO_DIR|await import\(|pathToFileURL|lv-automation\//, n.name);
  }
  assert.equal(Object.keys(WF)[0], 'id'); assert.equal(WF.id, 'smc-w09'); assert.equal(WF.settings.errorWorkflow, 'smc-w22');
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.executeWorkflow')) {
    const r = n.parameters.workflowId; const m = /^W(\d\d)\b/.exec(r.cachedResultName);
    assert.equal(r.mode, 'id', n.name); assert.equal(r.value, m ? `smc-w${m[1]}` : `smc-${r.cachedResultName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, n.name);
  }
  assert.ok(!/sk-|EAAG|Bearer [A-Za-z0-9]{20}/.test(JSON.stringify(WF)), 'no secrets inline');
});

test('W09.json: CONTRACTS entries (schedule, rebuild, cancel_all, pause, resume) + taps + tick are switch outputs wired to their nodes', () => {
  const ops = node('Op').parameters.rules.values.map((v) => v.outputKey);
  for (const op of ['schedule', 'rebuild', 'cancel_all', 'pause', 'resume', 'tick', 'confirm', 'media_tap', 'reject']) assert.ok(ops.includes(op), op);
  const to = (op) => WF.connections.Op.main[ops.indexOf(op)].map((c) => c.node);
  assert.deepEqual(to('schedule'), ['Load booking, lead, broker (plan)']);
  assert.deepEqual(to('rebuild'), ['Load booking, lead, broker (plan)']);
  assert.deepEqual(to('cancel_all'), ['Cancel all unsent jobs (booking or lead)']);
  assert.deepEqual(to('pause'), ['Pause reminders (lead)']);
  assert.deepEqual(to('reject'), ['Log subcall_rejected (CONTRACTS: never guessed)']);
  assert.ok(WF.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflowTrigger'));
  assert.equal(node('Every 5 minutes (due reminders)').parameters.rule.interval[0].expression, '*/5 * * * *');
});

test('W09.json: idempotent per appointment + step (job key, one done row per key), append-only cancels, DRY_RUN guard, last_contact_at after Meta accepts', () => {
  assert.match(node('Insert jobs (one row per key)').parameters.query, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.match(node('Claim send (w09done key, first tick wins)').parameters.query, /'w09done:' \|\| \$5\)\s+ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING id/);
  assert.match(node('Cancel all unsent jobs (booking or lead)').parameters.query, /'cancelled'/);
  assert.ok(!workflowSql(WF).some((q) => /UPDATE public\.lead_activities|DELETE FROM public\.lead_activities/i.test(q.sql)), 'the timeline stays append-only');
  assert.equal(WF.connections['Claimed? (send once)'].main[0][0].node, 'Send item (job)');
  assert.match(node('Live send?').parameters.conditions.conditions[0].leftValue, /DRY_RUN_SENDS/);
  assert.ok(WF.connections['Send WhatsApp'].main[0].some((c) => c.node === 'Touch leads.last_contact_at (lead outbound)'));
  assert.match(node('Touch leads.last_contact_at (lead outbound)').parameters.query, /SET last_contact_at = now\(\)[\s\S]*\$2 = 'lead' AND \$3 <> ''/);
  assert.equal(R.jobKey('bk1', 'reminder_2h', ms('2026-10-15T08:00:00+02:00')), 'w09:bk1:reminder_2h:2026-10-15T08:00:00+02:00');
});

const c09 = (over = {}) => ({ op: 'schedule', now_iso: '2026-10-12T08:14:41+02:00', ...over });
const planRow = (fx, over = {}) => ({ booking_id: `bkg_${fx.fixture_id}`, lead_id: fx.lead_id, brand_id: 'brand_smc', broker_id: B.broker_id, cycle_id: 'cyc_1', appointment_date: fx.booking_request.slot_start, status: 'booked', booked_at: fx.booking_request.requested_at, language: 'en', opted_out_at: null, intro_video_url: B.intro_video_url, intro_voice_url: B.intro_voice_url, lineage_sent: [], ...over });

test('W09.json "Plan" node (schedule from the booking event): the job rows are the hand-computed fixture schedules', async () => {
  for (const id of ['L01', 'L02', 'L03', 'L04', 'L10']) {
    const fx = lead(id);
    const out = (await runCode(WF, 'Plan (w09.planFromRow)', { json: planRow(fx), refs: { 'Classify + validate (w09.classifyOp)': c09() } })).json;
    assert.deepEqual(out.rows.map((r) => ({ touch: r.touch, at: r.at })), fx.expected.W09.schedule, id);
    assert.ok(out.rows.every((r) => r.key.startsWith(`w09:bkg_${id}:`) && r.start === fx.booking_request.slot_start));
  }
  // rebuild (W10 move): planned from "now", intro not repeated once sent in the lineage, nothing for a booking no longer live
  const fx = lead('L03');
  const now = fx.reschedule_request.requested_at;
  const re = (await runCode(WF, 'Plan (w09.planFromRow)', { json: planRow(fx, { appointment_date: fx.reschedule_request.new_slot_start, lineage_sent: ['what_to_expect', 'intro_media'] }), refs: { 'Classify + validate (w09.classifyOp)': c09({ op: 'rebuild', now_iso: now }) } })).json;
  assert.deepEqual(re.rows.map((r) => ({ touch: r.touch, at: r.at })), fx.expected.W09.after_reschedule.schedule);
  const gone = (await runCode(WF, 'Plan (w09.planFromRow)', { json: planRow(fx, { status: 'cancelled' }), refs: { 'Classify + validate (w09.classifyOp)': c09() } })).json;
  assert.deepEqual(gone.rows, []);
});

const dueRow = (over = {}) => ({ key: 'w09:bkg_L01:reminder_2h:2026-10-15T08:00:00+02:00', lead_id: 'lead_test_L01', brand_id: 'brand_smc', broker_id: B.broker_id, cycle_id: 'cyc_1', booking_id: 'bkg_L01', touch: 'reminder_2h', template: 'reminder_2h', at: '2026-10-15T08:00:00+02:00', start: '2026-10-15T10:00:00+02:00', booking_status: 'confirmed', appointment_date: '2026-10-15T10:00:00+02:00', method: 'teams', first_name: 'Lerato', phone: '+27600000001', language: 'en', opted_out_at: null, adviser_name: 'Mark Smith', contact_person: 'Mark Smith', broker_phone: '+27600000090', broker_whatsapp: '+27600000090', intro_video_url: B.intro_video_url, intro_voice_url: B.intro_voice_url, domain: 'sortmycover.co.za', suppressed: false, paused: false, outbound_count: 4, ...over });
const due = async (row, now) => (await runCode(WF, 'Decide (w09.dueFromRow)', { json: row, refs: { 'Classify + validate (w09.classifyOp)': { now_iso: now } } })).json;

test('W09.json "Decide" node at send time: sends the right template; stops on STOP, suppression, pause, moved or cancelled booking, meeting started', async () => {
  const ok = await due(dueRow(), '2026-10-15T08:00:00+02:00');
  assert.equal(ok.action, 'send');
  assert.equal(ok.send.to, 'lead'); assert.equal(ok.send.template, 'reminder_2h'); assert.equal(ok.send.wa.to, '+27600000001');
  assert.match(ok.send.wa.template.components[0].parameters[3].text, /^Join on Teams: https:\/\/sortmycover\.co\.za\/j\/bkg_L01$/);
  const why = async (over, now = '2026-10-15T08:00:00+02:00') => (await due(dueRow(over), now)).reason;
  assert.equal(await why({ opted_out_at: '2026-10-14T09:00:00+02:00' }), 'opted_out');
  assert.equal(await why({ suppressed: true }), 'opted_out');
  assert.equal(await why({ paused: true }), 'paused');
  assert.equal(await why({ booking_status: 'cancelled' }), 'booking_not_live');
  assert.equal(await why({ appointment_date: '2026-10-16T10:00:00+02:00' }), 'booking_moved');
  assert.equal(await why({}, '2026-10-15T10:00:00+02:00'), 'meeting_started');
});

test('W09 quiet hours 20:00-08:00 SAST: a touch due at night waits to 08:00 (or is dropped if that is too close to the call); T-10 min is exempt', async () => {
  const late = await due(dueRow({ touch: 'what_to_expect', template: 'what_to_expect', at: '2026-10-12T21:00:00+02:00' }), '2026-10-12T21:00:00+02:00');
  assert.equal(late.action, 'defer'); // nothing written: the 08:00 tick sends it
  const t10 = await due(dueRow({ touch: 'reminder_10m', template: 'reminder_10m', appointment_date: '2026-10-15T20:30:00+02:00', start: '2026-10-15T20:30:00+02:00' }), '2026-10-15T20:20:00+02:00');
  assert.equal(t10.action, 'send');
  const p = reminderPlan({ bookingId: 'b', start: '2026-10-15T09:00:00+02:00', bookedAt: '2026-10-12T19:55:00+02:00', lead: { language: 'en' }, broker: B });
  const wte = p.jobs.find((j) => j.touch === 'what_to_expect');
  assert.equal(wte.at, '2026-10-13T08:00:00+02:00', 'booked at 19:55: what_to_expect moves from 20:05 to 08:00');
  assert.ok(p.jobs.every((j) => R.QUIET_EXEMPT.has(j.touch) || !inQuiet(j.at)), 'no planned touch inside quiet hours');
});

test('W09 sends match the submitted templates: variable counts per template (header, body, quick replies, URL)', () => {
  const ctx = { lead: { first_name: 'Lerato', phone: '+27600000001', language: 'en' }, booking: { id: 'bk1', appointment_date: '2026-10-15T10:00:00+02:00', method: 'teams' }, broker: { ...B, adviser_name: 'Mark Smith' }, brand: {} };
  for (const t of R.TEMPLATES) {
    const m = R.buildMessage({ touch: t, template: t }, ctx);
    assert.deepEqual(paramCounts(m.wa), templateCounts(t), t);
  }
});

test('W09 virtual clock (synthetic run): "now" is honoured only with TEST_HOOKS_ENABLED=true AND a synthetic item; production uses the wall clock', async () => {
  const cls = (json, env) => runCode(WF, 'Classify + validate (w09.classifyOp)', { json, env });
  const t = '2026-10-15T07:55:00+02:00';
  const a = (await cls({ op: 'tick', now: t, is_synthetic: true }, { TEST_HOOKS_ENABLED: 'true' })).json;
  assert.equal(a.now_iso, t); assert.equal(a.synthetic_only, true);
  const b = (await cls({ op: 'tick', now: t, is_synthetic: true }, {})).json;
  assert.notEqual(b.now_iso, t); assert.equal(b.synthetic_only, false);
  const c = (await cls({ op: 'tick', now: t }, { TEST_HOOKS_ENABLED: 'true' })).json;
  assert.notEqual(c.now_iso, t, 'never for a real lead');
  const bad = (await cls({ op: 'pause', lead_id: 'x', reason: 'bored' }, {})).json;
  assert.equal(bad.op, 'reject'); assert.ok(bad.missing.length);
  assert.equal((await cls({ op: 'cancel_all' }, {})).json.op, 'reject', 'cancel_all needs booking_id or lead_id');
  assert.equal((await cls({ msg: { payload: 'confirm:bkg_L01' } }, {})).json.booking_id, 'bkg_L01');
});

test('W09 last_contact_at rule (I-38d): only lead sends Meta accepted', () => {
  assert.equal(R.touchesLastContact('lead', 'wamid.X'), true);
  assert.equal(R.touchesLastContact('lead', ''), false);
  assert.equal(R.touchesLastContact('lead', 'dry:w09:x'), false);
  assert.equal(R.touchesLastContact('broker', 'wamid.X'), false);
});

test('F9 (REHEARSAL-L01 execs 42-50) time-shifted schedule (x-test-now): what_to_expect is anchored on the test-clock booking, not the wall-clock booked_at', async () => {
  const fx = lead('L01');
  // The rehearsal: appointments.created_at is the real clock (3 Oct), the booking happened on the test clock (12 Oct).
  const row = planRow(fx, { booked_at: '2026-10-03T07:50:00+02:00', appointment_date: '2026-10-15T10:00:00+02:00' });
  const shifted = (await runCode(WF, 'Plan (w09.planFromRow)', { json: row, refs: { 'Classify + validate (w09.classifyOp)': c09({ now_iso: '2026-10-12T08:14:41+02:00', synthetic_only: true }) } })).json;
  const wte = shifted.rows.find((r) => r.touch === 'what_to_expect');
  assert.ok(wte, 'what_to_expect is scheduled');
  assert.equal(wte.at, '2026-10-12T08:24:41+02:00', 'T0 + 10 min on the test clock (was 2026-10-03T08:00:00+02:00)');
  assert.ok(shifted.rows.every((r) => Date.parse(r.at) > Date.parse('2026-10-12T08:14:41+02:00')), 'no job is planned before the virtual booking');
  // Quiet hours still apply on the test clock: a virtual 21:30 booking sends what_to_expect at 08:00 next morning.
  const late = (await runCode(WF, 'Plan (w09.planFromRow)', { json: row, refs: { 'Classify + validate (w09.classifyOp)': c09({ now_iso: '2026-10-12T21:30:00+02:00', synthetic_only: true }) } })).json;
  assert.equal(late.rows.find((r) => r.touch === 'what_to_expect').at, '2026-10-13T08:00:00+02:00');
  // Production (clock not shifted) keeps the stored booked_at as T0.
  const prod = (await runCode(WF, 'Plan (w09.planFromRow)', { json: planRow(fx), refs: { 'Classify + validate (w09.classifyOp)': c09({ synthetic_only: false }) } })).json;
  assert.deepEqual(prod.rows.map((r) => ({ touch: r.touch, at: r.at })), fx.expected.W09.schedule);
});

// I-53k: W05 forwards the test clock it captured (x-test-now on a synthetic lead) to W09 schedule, so what_to_expect
// (T0+10 min) is planned from the shifted booking time, not the wall-clock appointments.booked_at.
test('I-53k: W05 finish -> W09 schedule carries {now, is_synthetic} on a shifted clock; Classify + Plan put what_to_expect at shifted T0+10 min', async () => {
  const W5 = await import('../lib/w05.mjs');
  const fx = lead('L01');
  const shifted = ms(fx.booking_request.requested_at);
  const wall = Date.parse('2026-10-03T08:00:00+02:00');
  const ctx = { lane: 'http', req: { lead_id: fx.lead_id }, lead: { id: fx.lead_id, phone: '+27600000001', first_name: 'Lerato', language: 'en', is_synthetic: true }, broker: B, now: shifted, test_clock: true };
  const p = { method: 'phone', start: fx.booking_request.slot_start, booked_via: 'page' };
  const booking = { id: 'bkg_L01', broker_id: B.broker_id, method: 'phone', booked_at: new Date(wall).toISOString(), appointment_date: fx.booking_request.slot_start, ends_at: iso(ms(fx.booking_request.slot_start) + 30 * MIN) };
  const f = W5.finish(ctx, p, booking, { ok: true, graph_event_id: 'AAMk1' });
  assert.equal(f.w09.op, 'schedule');
  assert.equal(f.w09.is_synthetic, true);
  assert.equal(ms(f.w09.now), shifted);
  // production: no test clock -> nothing extra forwarded
  const prod = W5.finish({ ...ctx, test_clock: false }, p, booking, { ok: true, graph_event_id: 'AAMk1' });
  assert.equal(prod.w09.now, undefined); assert.equal(prod.w09.is_synthetic, undefined);
  // W09 Classify (the real node) with TEST_HOOKS_ENABLED honours it; Plan then anchors T0 on the shifted clock.
  const env = { TEST_HOOKS_ENABLED: 'true' };
  const c = (await runCode(WF, 'Classify + validate (w09.classifyOp)', { json: { kind: 'w09', ...f.w09 }, env })).json;
  assert.equal(c.op, 'schedule'); assert.equal(c.synthetic_only, true); assert.equal(ms(c.now_iso), shifted);
  const out = (await runCode(WF, 'Plan (w09.planFromRow)', { json: planRow(fx, { booked_at: booking.booked_at }), refs: { 'Classify + validate (w09.classifyOp)': c } })).json;
  const wte = out.rows.find((r) => r.touch === 'what_to_expect');
  assert.ok(wte, 'what_to_expect planned');
  assert.equal(ms(wte.at) >= shifted + 10 * MIN && ms(wte.at) < ms(fx.booking_request.slot_start), true, wte.at);
  // and the W05 Decide node really sets ctx.test_clock from the same clock
  const W05WF = JSON.parse(readFileSync(new URL('../W05.json', import.meta.url), 'utf8'));
  assert.match(W05WF.nodes.find((n) => n.name === 'Decide (w05.decide + MX)').parameters.jsCode, /test_clock: now !== wall/);
});
