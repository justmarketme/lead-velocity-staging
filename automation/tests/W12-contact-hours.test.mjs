// W12 contact hours (22 Oct 2026, Instant Form consent pack: SOCIAL-AUDIT-LINDI-SMC-2026-10-21 row 22 + section 5 item 8).
// What W12 STARTS with the lead (reach_check, attended_thanks, the Schedule D apology + its W10 rebooking) goes only inside
// the CPA s12 / Reg 4 hours of lib/contact-hours.mjs: Mon-Fri 08:00-20:00, Sat 09:00-13:00, never Sunday or a public holiday.
// Outside them it waits (never dropped for being late). Broker messages and the reply to her own tap are not held.
// Offline, real code: lib/w12.mjs and the Code nodes of automation/W12.json (run as n8n runs them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../lib/w12.mjs';
import { inMarketingHours } from '../lib/contact-hours.mjs';
import { runCode } from './_n8ncode.mjs';
import { checkSql, workflowSql } from './_sqlcheck.mjs';

const WF = JSON.parse(readFileSync(new URL('../W12.json', import.meta.url), 'utf8'));
const node = (name) => WF.nodes.find((n) => n.name === name);
const to = (from, out = 0) => ((WF.connections[from] || {}).main || [])[out]?.map((x) => x.node) || [];
const MIN = 60_000, H = 60 * MIN;
const t = (s) => Date.parse(s);
const sast = (ms) => new Date(ms + 2 * H).toISOString().replace('.000Z', '+02:00').replace('Z', '+02:00');

const row = (over = {}) => ({ booking_id: 'bk1', lead_id: 'ld1', brand_id: 'brand_smc', broker_id: 'br1', appointment_date: '2026-10-15T19:15:00+02:00', slot_end: '2026-10-15T19:45:00+02:00',
  first_name: 'Lerato', last_name: 'Mokoena', phone: '+27600000001', language: 'en', opted_out_at: null, adviser_name: 'Mark Smith', contact_person: 'Mark Smith',
  adviser_whatsapp: '+27600000099', whatsapp_number: '+27600000099', broker_mark: null, reach: null, sent_outcome_check: false, sent_broker_nudge: false, sent_reach_check: false, outcome_exists: false, ...over });

// ------------------------------------------------------------------------------------------- the reach check
test('reachPlan: a daytime call is asked at end + 30 min as before; an evening call next morning; Saturday afternoon / a holiday eve not at all', () => {
  const day = R.reachPlan('2026-10-15T10:30:00+02:00'); // Thursday
  assert.deepEqual([sast(day.ask_at), sast(day.window_close)], ['2026-10-15T11:00:00+02:00', '2026-10-15T13:00:00+02:00'], 'unchanged in hours');
  const eve = R.reachPlan('2026-10-15T19:45:00+02:00'); // 20:15 is closed
  assert.deepEqual([sast(eve.ask_at), sast(eve.window_close)], ['2026-10-16T08:00:00+02:00', '2026-10-16T10:00:00+02:00'], 'next opening, her 2 h run from then');
  const fri = R.reachPlan('2026-10-16T19:45:00+02:00'); // Friday evening -> Saturday 09:00 (13 h 15 after the end)
  assert.equal(sast(fri.ask_at), '2026-10-17T09:00:00+02:00');
  const sat = R.reachPlan('2026-10-17T12:45:00+02:00'); // Saturday 13:15 closed -> Monday 08:00 is past the 21-h limit
  assert.equal(sat.ask_at, null, 'not asked: the 24-h auto-attend comes first');
  assert.equal(sast(sat.window_close), '2026-10-17T15:15:00+02:00', 'the broker mark stands as for an opted-out lead');
  const hol = R.reachPlan('2026-12-15T19:45:00+02:00'); // Tue evening, Wed 16 Dec is a public holiday -> Thu 08:00 = too late
  assert.equal(hol.ask_at, null);
  assert.equal(R.REACH_ASK_LATEST_AFTER_END, 21 * H, 'her window closes at least 1 h before the 24-h backstop');
  for (const end of ['2026-10-15T10:30:00+02:00', '2026-10-15T19:45:00+02:00', '2026-10-16T19:45:00+02:00']) {
    const p = R.reachPlan(end);
    assert.ok(inMarketingHours(p.ask_at), end);
    assert.ok(p.window_close <= t(end) + R.AUTO_ATTEND_AFTER_END - H, end);
  }
});

test('sweep: the reach check waits for the hours (not at 20:15, not at 07:55, at 08:00); the broker check is not held', () => {
  const r = row();
  const kinds = (now) => R.sweepItems(r, t(now)).map((x) => x.send && x.send.key).filter(Boolean);
  assert.deepEqual(kinds('2026-10-15T20:00:00+02:00'), ['w12:outcome_check:bk1'], 'broker outcome check at end + 15 even at 20:00');
  assert.deepEqual(kinds('2026-10-15T20:15:00+02:00').filter((k) => k.includes('reach')), [], 'no reach check at 20:15');
  const nudged = { ...r, sent_outcome_check: true, sent_broker_nudge: true };
  assert.deepEqual(R.sweepItems(nudged, t('2026-10-16T07:55:00+02:00')).filter((x) => x.send), [], 'not before 08:00');
  const at8 = R.sweepItems(nudged, t('2026-10-16T08:00:00+02:00')).filter((x) => x.send);
  assert.deepEqual(at8.map((x) => [x.send.key, x.send.to, x.send.template]), [['w12:reach_check:bk1', 'lead', 'reach_check']]);
  // an outage that runs past 20:00 the next day: still not sent outside the hours
  assert.deepEqual(R.sweepItems({ ...r, sent_outcome_check: true }, t('2026-10-16T20:30:00+02:00')).filter((x) => x.send && x.send.to === 'lead'), []);
  // Saturday afternoon: never asked (past the limit), nothing sent on Sunday
  const s = row({ appointment_date: '2026-10-17T12:15:00+02:00', slot_end: '2026-10-17T12:45:00+02:00', sent_outcome_check: true });
  for (const now of ['2026-10-17T13:15:00+02:00', '2026-10-18T10:00:00+02:00']) assert.deepEqual(R.sweepItems(s, t(now)).filter((x) => x.send && x.send.to === 'lead'), [], now);
});

test('broker No-show + lead silent: her 2-h window runs from when she was asked (evening call: confirmed 10:00 next day, not 22:15)', () => {
  const m = { slotEnd: '2026-10-15T19:45:00+02:00', leadId: 'ld1', brokerMark: 'no_show', reach: null, consentAds: true };
  assert.equal(R.resolveOutcome(m, t('2026-10-15T22:15:00+02:00')).outcome, 'pending', 'old rule would have confirmed here without asking her');
  assert.equal(R.resolveOutcome(m, t('2026-10-16T09:59:00+02:00')).outcome, 'pending');
  const r = R.resolveOutcome(m, t('2026-10-16T10:00:00+02:00'));
  assert.equal(r.outcome, 'no_show'); assert.equal(r.no_show_confirmed_at, '2026-10-16T10:00:00+02:00');
  // daytime call: unchanged (end + 30 min + 2 h)
  const d = R.resolveOutcome({ ...m, slotEnd: '2026-10-15T10:30:00+02:00' }, t('2026-10-15T13:00:00+02:00'));
  assert.equal(d.outcome, 'no_show');
  // CAPI Attended waits for the same window
  const g = (now) => R.capiAttendedGate({ slotEnd: '2026-10-15T19:45:00+02:00', reach: null, consentAds: true }, t(now));
  assert.equal(g('2026-10-15T22:30:00+02:00').reason, 'awaiting_lead');
  assert.equal(g('2026-10-16T10:00:00+02:00').reason, 'lead_window_closed');
});

// ------------------------------------------------------------------------------------------- thank-you and apology
const attended = { outcome: 'attended', lead_message: 'attended_thanks', capi: [] };
const noShowApology = { outcome: 'broker_no_show', lead_message: 'broker_no_show_apology', alerts: ['KG'] };

test('attended_thanks: in hours -> sent at once (claimed key); 21:30 -> held until 08:00; Saturday 14:00 -> Monday 08:00', () => {
  const r = row({ broker_mark: 'attended' });
  const now = R.followUps(attended, r, 'o1', undefined, t('2026-10-15T12:00:00+02:00'));
  const s = now.find((x) => x.fu === 'send');
  assert.deepEqual([s.send.key, s.send.template, s.send.claim], ['w12:attended_thanks:bk1', 'attended_thanks', true]);
  assert.ok(!now.some((x) => x.fu === 'send_hold'));
  const late = R.followUps(attended, r, 'o1', undefined, t('2026-10-15T21:30:00+02:00'));
  assert.ok(!late.some((x) => x.fu === 'send'), 'nothing to the lead at 21:30');
  const h = late.find((x) => x.fu === 'send_hold').hold;
  assert.deepEqual([h.kind, h.key, h.due_at, h.with_w10, h.booking_id, h.lead_id], ['attended_thanks', 'w12:attended_thanks:bk1', '2026-10-16T08:00:00+02:00', false, 'bk1', 'ld1']);
  assert.ok(late.some((x) => x.fu === 'w29'), 'everything else runs as before');
  assert.equal(R.followUps(attended, r, 'o1', undefined, t('2026-10-17T14:00:00+02:00')).find((x) => x.fu === 'send_hold').hold.due_at, '2026-10-19T08:00:00+02:00');
  // no phone: skipped at once under send_skipped:{key} (a hold would wait for nothing)
  const np = R.followUps(attended, row({ phone: null }), 'o1', undefined, t('2026-10-15T21:30:00+02:00'));
  assert.equal(np.find((x) => x.fu === 'send_skipped').skip.key, 'send_skipped:w12:attended_thanks:bk1');
  // a W12.json imported before 22 Oct 2026 passes no clock and has no route for a hold: nothing is held (sent as before)
  const legacy = R.followUps(attended, r, 'o1');
  assert.deepEqual(legacy.filter((x) => x.fu === 'send' || x.fu === 'send_hold').map((x) => x.fu), ['send']);
});

test('Schedule D apology: 20:45 -> held with the W10 rebooking (apology first at 08:00); her session closing first -> sent now; in hours -> as before', () => {
  const r = row({ appointment_date: '2026-10-15T17:00:00+02:00', slot_end: '2026-10-15T17:30:00+02:00', reach: 'no', reach_at: '2026-10-15T18:05:00+02:00' });
  const inHours = R.followUps(noShowApology, r, 'o2', undefined, t('2026-10-15T19:00:00+02:00'));
  assert.deepEqual(inHours.map((x) => x.fu).sort(), ['alert', 'send', 'w10', 'w29']);
  assert.deepEqual([inHours.find((x) => x.fu === 'send').send.key, inHours.find((x) => x.fu === 'send').send.claim], ['w12:apology:bk1', true]);
  const late = R.followUps(noShowApology, r, 'o2', undefined, t('2026-10-15T20:45:00+02:00'));
  assert.deepEqual(late.map((x) => x.fu).sort(), ['alert', 'send_hold', 'w29'], 'no apology and no rebooking offer at 20:45; KG is still alerted');
  const h = late.find((x) => x.fu === 'send_hold').hold;
  assert.deepEqual([h.kind, h.key, h.due_at, h.with_w10], ['apology', 'w12:apology:bk1', '2026-10-16T08:00:00+02:00', true]);
  // Saturday call: her "No" at 13:05, apology due 15:45 -> Monday 08:00 is past her 24-h session (no apology template)
  const sat = row({ appointment_date: '2026-10-17T12:00:00+02:00', slot_end: '2026-10-17T12:30:00+02:00', reach: 'no', reach_at: '2026-10-17T13:05:00+02:00' });
  const s = R.followUps(noShowApology, sat, 'o3', undefined, t('2026-10-17T15:45:00+02:00'));
  assert.deepEqual(s.map((x) => x.fu).sort(), ['alert', 'send', 'w10', 'w29']);
  assert.equal(s.find((x) => x.fu === 'send').send.hours_exempt, 'session_closes_before_hours');
});

test('heldLeadMessageItems: nothing outside the hours or before due; then the message under its key (claimed), the rebooking after the apology; opted out / session closed -> skipped', () => {
  const held = (over = {}) => row({ kind: 'apology', key: 'w12:apology:bk1', due_at: '2026-10-16T08:00:00+02:00', with_w10: true, reach: 'no', reach_at: '2026-10-15T18:05:00+02:00', ...over });
  assert.deepEqual(R.heldLeadMessageItems([held()], t('2026-10-16T07:59:00+02:00')), [], 'closed');
  assert.deepEqual(R.heldLeadMessageItems([held({ due_at: '2026-10-16T09:00:00+02:00' })], t('2026-10-16T08:30:00+02:00')), [], 'not due yet');
  const out = R.heldLeadMessageItems([held()], t('2026-10-16T08:00:00+02:00'));
  assert.deepEqual(out.map((x) => x.fu), ['send', 'w10'], 'apology first, then the rebooking');
  assert.deepEqual([out[0].send.key, out[0].send.claim, out[0].send.to, out[0].send.wa.type, out[0].send.wa.to], ['w12:apology:bk1', true, 'lead', 'text', '+27600000001']);
  assert.match(out[0].send.wa.text.body, /Lerato/);
  assert.deepEqual([out[1].schedule_d, out[1].reason, out[1].booking.id], [true, 'broker_no_show', 'bk1']);
  const thanks = R.heldLeadMessageItems([held({ kind: 'attended_thanks', key: 'w12:attended_thanks:bk1', with_w10: false })], t('2026-10-16T08:00:00+02:00'));
  assert.deepEqual(thanks.map((x) => [x.fu, x.send.key, x.send.template]), [['send', 'w12:attended_thanks:bk1', 'attended_thanks']]);
  const opted = R.heldLeadMessageItems([held({ opted_out_at: '2026-10-15T22:00:00+02:00', with_w10: false })], t('2026-10-16T08:00:00+02:00'));
  assert.deepEqual(opted.map((x) => [x.fu, x.skip.key, x.skip.reason]), [['send_skipped', 'send_skipped:w12:apology:bk1', 'opted_out']], 'never writes w12:apology (I-50f reads it as sent)');
  const closed = R.heldLeadMessageItems([held({ reach_at: '2026-10-15T07:00:00+02:00' })], t('2026-10-16T08:00:00+02:00'));
  assert.deepEqual(closed.map((x) => x.fu), ['send_skipped', 'w10']);
  assert.equal(closed[0].skip.reason, 'session_window_closed');
  assert.deepEqual(R.heldLeadMessageItems([held({ kind: 'missed_you' }), {}, null], t('2026-10-16T08:00:00+02:00')), [], 'only the two W12 kinds');
});

// ------------------------------------------------------------------------------------------- W12.json
test('W12.json: holds are parked once per booking + kind, the tick releases due ones through the Follow-up switch, every follow-up send is claimed', async () => {
  assert.deepEqual(to('Follow-up', 9), ['Park held lead message (w12:hold, contact hours)']);
  assert.deepEqual(to('Follow-up', 0), ['Message item'], 'follow-up sends go through the claim (sent once)');
  assert.deepEqual(to('Message item'), ['Claim message (w12 key, sent once)']);
  assert.match(node('Park held lead message (w12:hold, contact hours)').parameters.query, /'post_call_message_held'[\s\S]*'w12:hold:' \|\| \$5::text \|\| ':' \|\| \$4::text\)\s+ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.ok(to('Op', 0).includes('Held lead messages due (contact hours)'), 'read on the tick');
  assert.deepEqual(to('Held lead messages due (contact hours)'), ['Held lead messages (w12.heldLeadMessageItems)']);
  assert.deepEqual(to('Held lead messages (w12.heldLeadMessageItems)'), ['Follow-up']);
  const q = node('Held lead messages due (contact hours)').parameters.query;
  assert.match(q, /h\.activity_type = 'post_call_message_held'/);
  assert.match(q, /\(h\.payload->>'due_at'\)::timestamptz <= \$1::timestamptz/);
  assert.match(q, /NOT EXISTS \(SELECT 1 FROM public\.lead_activities s WHERE s\.idempotency_key IN \(h\.payload->>'key', 'send_skipped:' \|\| \(h\.payload->>'key'\)\)\)/);
  assert.match(q, /NOT \$2::boolean OR l\.is_synthetic/);
  assert.deepEqual(checkSql(workflowSql({ nodes: WF.nodes.filter((n) => /contact hours/.test(n.name)) })), [], 'physical columns only');
  // the real Code nodes, as n8n runs them
  const due = row({ kind: 'attended_thanks', key: 'w12:attended_thanks:bk1', due_at: '2026-10-16T08:00:00+02:00', with_w10: false });
  const run = async (now) => (await runCode(WF, 'Held lead messages (w12.heldLeadMessageItems)', { items: [due], refs: { 'Classify + validate (w12.classifyOp)': { now_iso: now } } })).map((x) => x.json);
  assert.deepEqual(await run('2026-10-16T07:00:00+02:00'), []);
  assert.deepEqual((await run('2026-10-16T08:05:00+02:00')).map((x) => x.send.key), ['w12:attended_thanks:bk1']);
  const fu = (await runCode(WF, 'Follow-ups (w12.followUps)', { items: [{ outcome_id: 'o1' }], refs: { 'Write outcome? (not pending, not disputed)': { r: attended, row: row({ broker_mark: 'attended' }) }, 'Classify + validate (w12.classifyOp)': { now_iso: '2026-10-15T21:00:00+02:00' } } })).map((x) => x.json);
  assert.deepEqual(fu.map((x) => x.fu).sort(), ['send_hold', 'w29']);
  // the sweep's Classify node carries the clock every follow-up node reads
  for (const n of ['Follow-ups (w12.followUps)', 'Claimed follow-ups (w12.claimedFollowUps)', 'Held lead messages (w12.heldLeadMessageItems)']) assert.match(node(n).parameters.jsCode, /now_iso/, n);
});

test('W12.json I-50f: the claimed apology writes w12:apology:{bk}, the row the late-mark check reads', () => {
  const claim = node('Claim message (w12 key, sent once)').parameters;
  assert.match(claim.query, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.match(String(claim.options && claim.options.queryReplacement), /\$json\.send\.key/);
  assert.match(node('Late broker mark? (apology already sent)').parameters.query, /'w12:apology:' \|\| a\.id::text/);
  const it = R.followUps(noShowApology, row({ reach: 'no', reach_at: '2026-10-15T10:05:00+02:00' }), 'o2', undefined, t('2026-10-15T13:45:00+02:00')).find((x) => x.fu === 'send');
  assert.equal(it.send.key, 'w12:apology:bk1');
});
