// automation/lib/w09.mjs  -  W09 reminder sequence (client). 4.6 item 6 (minimum set), 4.12 (canonical sequence).
// Imported by automation/W09.json (Code nodes, require('lv-automation').w09) and automation/tests/W09.test.mjs. Pure, no I/O.
//
// The sequence, planned from the booking event (W05 `schedule`, W10/W05 `rebuild`):
//   T0 + 10 min  what_to_expect
//   T-48 h       intro_media (video; intro_media_voice if no approved video) - only if booked >= 3 days out,
//                otherwise straight after booking (T0 + 15 min, fixtures _meta)
//   T-24 h       reminder_24h (Confirm / Reschedule) + prep_nudge        (skipped when booked < 24 h ahead)
//   T-2 h        reminder_2h                                              (skipped when booked ~2 h ahead)
//   T-10 min     reminder_10m
// Rules:
//  - Every job is sent at most once: idempotency key w09:{booking_id}:{touch}:{at}. A moved booking has new times and
//    therefore new keys; W09 `rebuild` cancels the unsent old ones. what_to_expect and intro media go once per lead
//    lineage (never repeated after a reschedule or a rebooking).
//  - Quiet hours 20:00-08:00 SAST (lib/wa.mjs, same as W08): a touch due then waits to 08:00. reminder_10m is
//    meeting-bound and exempt (the broker set the meeting time). A shifted touch that would land on top of the
//    meeting reminders is dropped (reminder_2h carries the details).
//  - Cancellable: W10 cancel / W13 / W15 `cancel_all`; W07 / W15 `pause` (resumed only by a human, `resume`).
//  - Stops at send time on: opt-out or suppression, booking no longer live or moved, meeting started, message budget.
//  - Every send Meta accepts updates leads.last_contact_at (CONTRACTS.md I-38d).
import { LINES, fill } from '../../conversation/lines.mjs';
import { METHOD_LABEL } from './w10.mjs';
import { MIN, H, D, ms, iso, inQuiet, outOfQuiet, dateLabel, timeLabel, firstName, templateMessage, textMessage, audioMessage, nowFrom, touchesLastContact } from './wa.mjs';
export { MIN, H, D, iso, nowFrom, touchesLastContact };

export const ONCE_PER_LINEAGE = new Set(['what_to_expect', 'intro_media', 'intro_media_voice']);
export const MAX_LEAD_MESSAGES = 12; // 4.6 cost design: ~12 messages per lead
export const QUIET_EXEMPT = new Set(['reminder_10m']);
export const ESSENTIAL = new Set(['reminder_24h', 'reminder_2h', 'reminder_10m']); // still sent at the message budget
export const LIVE = new Set(['booked', 'confirmed']);
export const TEMPLATES = ['what_to_expect', 'intro_media', 'intro_media_voice', 'reminder_24h', 'prep_nudge', 'reminder_2h', 'reminder_10m'];
export const PAUSE_REASONS = new Set(['sensitive', 'human_handoff', 'opt_out']);
const ONLINE = new Set(['teams', 'zoom', 'meet']);

/** Which intro media template a broker can send in the lead's language: video first (4.12), voice as fallback. */
export function mediaTemplate(lead = {}, broker = {}) {
  const lang = lead.language || 'en';
  const video = broker.intro_video_url?.[lang];
  const voice = broker.intro_voice_url?.[lang];
  if (broker.intro_media_pref === 'voice' && voice) return 'intro_media_voice';
  return video ? 'intro_media' : voice ? 'intro_media_voice' : null;
}

/**
 * reminderPlan({ bookingId, start, bookedAt, lead, broker, alreadySent }) -> { compressed, jobs:[{touch, template, at, key}] }
 * bookedAt = when the booking (or its last move) happened. alreadySent = touches already sent in this lead's lineage.
 */
export function reminderPlan({ bookingId, start, bookedAt, lead: l = {}, broker: b = {}, alreadySent = [] }) {
  if (l.opted_out_at) return { compressed: false, jobs: [] };
  const T0 = ms(bookedAt);
  const M = ms(start);
  const lt = M - T0;
  const mediaTpl = mediaTemplate(l, b);
  const raw = [
    ['what_to_expect', 'what_to_expect', T0 + 10 * MIN],
    mediaTpl ? ['intro_media', mediaTpl, lt >= 72 * H ? M - 48 * H : T0 + 15 * MIN] : null,
    lt >= 24 * H ? ['reminder_24h', 'reminder_24h', M - 24 * H] : null,
    lt >= 24 * H ? ['prep_nudge', 'prep_nudge', M - 24 * H] : null,
    ['reminder_2h', 'reminder_2h', M - 2 * H],
    ['reminder_10m', 'reminder_10m', M - 10 * MIN]
  ].filter(Boolean);
  const jobs = raw
    .map(([touch, tpl, t]) => {
      if (QUIET_EXEMPT.has(touch) || !inQuiet(t)) return [touch, tpl, t, false];
      return [touch, tpl, outOfQuiet(t), true];
    })
    // a touch pushed out of quiet hours must still land before the meeting reminders, or it is dropped
    .filter(([touch, , t, shifted]) => !shifted || t < M - (touch === 'reminder_2h' ? 30 * MIN : 2 * H))
    .filter(([, , t]) => t > T0 && t < M)
    .filter(([touch, , t]) => !(touch === 'reminder_2h' && t <= T0 + 15 * MIN)) // booked ~2 h ahead: the confirmation is the reminder
    .filter(([touch]) => !(ONCE_PER_LINEAGE.has(touch) && alreadySent.includes(touch)))
    .map(([touch, tpl, t]) => ({ touch, template: tpl, at: iso(t), key: jobKey(bookingId, touch, t) }))
    .sort((a, b2) => ms(a.at) - ms(b2.at));
  return { compressed: lt < 24 * H, jobs };
}
export const jobKey = (bookingId, touch, t) => `w09:${bookingId}:${touch}:${iso(t)}`;

/** Rows for the job insert (jsonb_to_recordset in W09.json "Insert jobs"). */
export const jobRows = (plan, booking) => plan.jobs.map((j) => ({ key: j.key, touch: j.touch, template: j.template, at: j.at, start: iso(booking.start ?? booking.appointment_date), compressed: plan.compressed }));

/**
 * In-memory model of the job table (lead_activities rows activity_type 'reminder_job'): one row per key, sent at most
 * once, cancellable. W09.json implements the same semantics in SQL (ON CONFLICT DO NOTHING, FOR UPDATE SKIP LOCKED).
 */
export class Scheduler {
  constructor() { this.rows = new Map(); this.sent = []; }
  add(leadId, bookingId, jobs) { for (const j of jobs) if (!this.rows.has(j.key)) this.rows.set(j.key, { ...j, lead_id: leadId, booking_id: bookingId, status: 'pending' }); }
  cancel(pred) { const out = []; for (const r of this.rows.values()) if (r.status === 'pending' && pred(r)) { r.status = 'cancelled'; out.push(r); } return out; }
  tick(now) {
    const due = [...this.rows.values()].filter((r) => r.status === 'pending' && ms(r.at) <= now);
    for (const r of due) { r.status = 'sent'; this.sent.push({ key: r.key, touch: r.touch, template: r.template, lead_id: r.lead_id, at: r.at }); }
    return due.length;
  }
  pending(leadId) { return [...this.rows.values()].filter((r) => r.lead_id === leadId && r.status === 'pending'); }
}

/** T-24 h "Confirm" tap (payload confirm:{booking_id}) -> booking confirmed. */
export function onConfirmTap(bk, now) {
  if (!LIVE.has(bk.status)) return { changed: false };
  bk.status = 'confirmed'; bk.confirmed_at = iso(now);
  return { changed: true };
}

/** Lead reschedule (W10 moves the same row; W09 `rebuild`): cancel unsent jobs, plan again, never repeat the intro. */
export function onReschedule(sched, bk, l, b, newStart, now) {
  const lineage = sched.sent.filter((s) => s.lead_id === l.id).map((s) => s.touch);
  const cancelled = sched.cancel((r) => r.booking_id === bk.id);
  Object.assign(bk, { start: newStart, reschedule_count: (bk.reschedule_count ?? 0) + 1, status: 'booked' }); // same row, same Graph event (moved, not duplicated)
  const plan = reminderPlan({ bookingId: bk.id, start: newStart, bookedAt: iso(now), lead: l, broker: b, alreadySent: lineage });
  sched.add(l.id, bk.id, plan.jobs);
  return { cancelled, plan };
}

/**
 * classifyOp(input) -> 'schedule'|'rebuild'|'cancel_all'|'pause'|'resume'|'tick'|'confirm'|'media_tap'|'reject'
 * Entries: W05 (schedule / rebuild with previous_booking_id), W10 (rebuild / cancel_all), W13 / W15 (cancel_all),
 * W07 / W15 (pause), console (resume), W07 taps (confirm:{bk}, play_voice_note:{bk}, looking_forward:{bk}),
 * the 5-minute schedule and the staging test hook (tick).
 */
export function classifyOp(input = {}) {
  if (['schedule', 'rebuild', 'cancel_all', 'pause', 'resume', 'tick'].includes(input.op)) return input.op;
  const p = String(input.msg?.payload || '').split(':')[0];
  if (p === 'confirm') return 'confirm';
  if (p === 'play_voice_note' || p === 'looking_forward') return 'media_tap';
  return 'reject';
}

/** CONTRACTS.md "Sub-workflow interfaces": a missing required field is logged as subcall_rejected and stops. */
export function validateInput(op, input = {}) {
  const need = { schedule: ['booking_id'], rebuild: ['booking_id'], pause: ['lead_id', 'reason'], resume: ['lead_id'] }[op] || [];
  const missing = need.filter((k) => !input[k]);
  if (op === 'cancel_all' && !input.booking_id && !input.lead_id) missing.push('booking_id');
  if (op === 'pause' && input.reason && !PAUSE_REASONS.has(input.reason)) missing.push('reason (sensitive|human_handoff|opt_out)');
  if (op === 'reject') missing.push('op');
  return missing.length ? { ok: false, missing } : { ok: true };
}

/** Booking id carried by a W07 tap payload (confirm:{id}, play_voice_note:{id}, looking_forward:{id}). */
export const tapBookingId = (msg = {}) => String(msg.payload || '').split(':').slice(1).join(':') || null;

/**
 * dueAction(job, ctx, now_ms) -> { action: 'send' } | { action: 'skip', reason } | { action: 'defer', at }
 * job = { touch, template, at, start }; ctx = { booking: { status, appointment_date }, lead: { opted_out_at },
 *       suppressed, paused, outbound_count }
 */
export function dueAction(job, ctx, now) {
  const bk = ctx.booking || {};
  if (ctx.lead?.opted_out_at || ctx.suppressed) return { action: 'skip', reason: 'opted_out' };
  if (ctx.paused) return { action: 'skip', reason: 'paused' };
  if (!LIVE.has(bk.status)) return { action: 'skip', reason: 'booking_not_live' };
  const M = ms(bk.appointment_date);
  if (job.start && ms(job.start) !== M) return { action: 'skip', reason: 'booking_moved' };
  if (now >= M) return { action: 'skip', reason: 'meeting_started' };
  if (job.touch !== 'reminder_10m' && now >= M - 10 * MIN) return { action: 'skip', reason: 'too_late' };
  if (!QUIET_EXEMPT.has(job.touch) && inQuiet(now)) {
    const at = outOfQuiet(now);
    return at < M - (job.touch === 'reminder_2h' ? 30 * MIN : 2 * H) ? { action: 'defer', at: iso(at) } : { action: 'skip', reason: 'quiet_hours' };
  }
  if ((ctx.outbound_count ?? 0) >= MAX_LEAD_MESSAGES && !ESSENTIAL.has(job.touch)) return { action: 'skip', reason: 'message_budget' };
  return { action: 'send' };
}

/** "Join on Teams: https://sortmycover.co.za/j/{booking}" | "Mark will call you on +27..." (reminder_2h {{4}}). */
export function methodDetail(booking = {}, broker = {}, lead = {}, brand = {}, when = '2h') {
  const adv = firstName(broker.adviser_name || broker.contact_person);
  const link = `https://${brand.domain || 'sortmycover.co.za'}/j/${booking.id}`;
  const number = booking.call_number || lead.call_number || lead.phone;
  if (ONLINE.has(booking.method)) return when === '2h' ? `Join on ${METHOD_LABEL[booking.method].replace('Microsoft ', '')}: ${link}` : `Join here: ${link}`;
  if (booking.method === 'whatsapp_call') return `${adv} will WhatsApp-call you on ${number}.`;
  const from = broker.phone_number || broker.whatsapp_number;
  return when === '10m' && from ? `${adv} will call you from ${from}.` : `${adv} will call you on ${number}.`;
}

/**
 * buildMessage(job, ctx) -> { to: 'lead', template, wa } for one reminder job. Variables follow automation/templates
 * (README index): what_to_expect 1 first_name 2 adviser 3 method + URL 1 booking ref; intro_media 1-4 + VIDEO header;
 * intro_media_voice header 1 adviser + body 1-4; reminder_24h 1 first 2 method 3 adviser 4 time; prep_nudge 1-2;
 * reminder_2h 1 first 2 adviser 3 time 4 method detail; reminder_10m 1 first 2 adviser 3 method detail.
 */
export function buildMessage(job, ctx) {
  const { lead = {}, booking = {}, broker = {}, brand = {} } = ctx;
  const to = lead.phone;
  const first = String(lead.first_name || '').trim() || 'there';
  const adviser = broker.adviser_name || broker.contact_person || '';
  const M = booking.appointment_date;
  const lang = lead.language || 'en';
  const qr = (k) => ({ quick_reply: `${k}:${booking.id}` });
  const P = {
    what_to_expect: { body: [first, adviser, METHOD_LABEL[booking.method] || booking.method], buttons: [{ url: booking.id }] },
    intro_media: { header: { video: broker.intro_video_url?.[lang] }, body: [first, adviser, dateLabel(M), timeLabel(M)], buttons: [qr('looking_forward'), qr('reschedule')] },
    intro_media_voice: { header: { text: adviser }, body: [first, adviser, dateLabel(M), timeLabel(M)], buttons: [qr('play_voice_note'), qr('reschedule')] },
    reminder_24h: { body: [first, METHOD_LABEL[booking.method] || booking.method, adviser, timeLabel(M)], buttons: [qr('confirm'), qr('reschedule')] },
    prep_nudge: { body: [first, adviser] },
    reminder_2h: { body: [first, adviser, timeLabel(M), methodDetail(booking, broker, lead, brand, '2h')], buttons: [qr('reschedule')] },
    reminder_10m: { body: [first, adviser, methodDetail(booking, broker, lead, brand, '10m')] }
  }[job.template];
  if (!P) throw new Error(`unknown W09 template ${job.template}`);
  return { to: 'lead', template: job.template, touch: job.touch, wa: templateMessage(to, job.template, P) };
}

/** Reply to a Confirm tap (session message: the tap opened the window). Only true words: "tomorrow" only if it is. */
export function confirmReply(lead = {}, booking = {}, broker = {}, now) {
  const L = LINES[lead.language] || LINES.en;
  const soon = ms(booking.appointment_date) - now <= 36 * H;
  const body = fill(soon ? L.CONFIRM_THANKS : L.COMMIT_OK, { first_name: lead.first_name || '', adviser_first: firstName(broker.adviser_name || broker.contact_person) });
  return { to: 'lead', wa: textMessage(lead.phone, body) };
}

/** intro_media_voice "Play voice note" tap: the template cannot carry audio, so the OGG note goes as a session message. */
export function mediaTapReply(msg = {}, lead = {}, broker = {}) {
  const k = String(msg.payload || '').split(':')[0];
  const voice = broker.intro_voice_url?.[lead.language || 'en'] || broker.intro_voice_url?.en;
  if (k === 'play_voice_note' && voice) return { to: 'lead', wa: audioMessage(lead.phone, voice), activity: 'intro_voice_played' };
  return { to: null, wa: null, activity: k === 'looking_forward' ? 'intro_looking_forward' : 'intro_media_tap' };
}

/** Finished-job status after the send node: sent (wamid), dry_run, failed. */
export function sendStatus(decision, response, dryRun) {
  if (decision.action !== 'send') return decision.action === 'defer' ? 'pending' : 'skipped';
  if (dryRun) return 'dry_run';
  return response?.messages?.[0]?.id ? 'sent' : 'failed';
}

/**
 * dueFromRow(row, now_ms) -> { job, decision, send|null } for one row of W09.json "Due jobs". The row is the job
 * (lead_activities 'reminder_job') joined to its booking, lead, broker and brand. `send` is the uniform item the
 * shared send chain reads ({ to, wa, lead_id, brand_id, broker_id, template, category, key, touch }).
 */
export function dueFromRow(r = {}, now) {
  const job = { key: r.key, touch: r.touch, template: r.template, at: r.at, start: r.start };
  const booking = { id: r.booking_id, status: r.booking_status, appointment_date: r.appointment_date, method: r.method, call_number: r.booking_call_number };
  const lead = { id: r.lead_id, first_name: r.first_name, phone: r.phone, language: r.language, opted_out_at: r.opted_out_at, call_number: r.lead_call_number };
  const broker = { adviser_name: r.adviser_name, contact_person: r.contact_person, phone_number: r.broker_phone, whatsapp_number: r.broker_whatsapp, intro_video_url: r.intro_video_url || {}, intro_voice_url: r.intro_voice_url || {} };
  const ctx = { booking, lead, broker, brand: { domain: r.domain }, suppressed: Boolean(r.suppressed), paused: Boolean(r.paused), outbound_count: Number(r.outbound_count || 0) };
  const decision = dueAction(job, ctx, now);
  if (decision.action !== 'send') return { job, decision, send: null };
  const m = buildMessage(job, ctx);
  return { job, decision, send: { to: 'lead', wa: m.wa, lead_id: r.lead_id, brand_id: r.brand_id, broker_id: r.broker_id, template: m.template, category: 'utility', key: r.key, touch: job.touch, workflow: 'W09' } };
}

/** planFromRow(row, op, now_ms) -> { plan, rows } for W09.json "Plan": schedule plans from booked_at, rebuild from now. */
export function planFromRow(r = {}, op, now) {
  const lineage = Array.isArray(r.lineage_sent) ? r.lineage_sent.filter(Boolean) : [];
  const bookedAt = op === 'schedule' && r.booked_at ? r.booked_at : now;
  const plan = reminderPlan({
    bookingId: r.booking_id, start: r.appointment_date, bookedAt,
    lead: { id: r.lead_id, language: r.language, opted_out_at: r.opted_out_at },
    broker: { intro_video_url: r.intro_video_url || {}, intro_voice_url: r.intro_voice_url || {}, intro_media_pref: r.intro_media_pref },
    alreadySent: lineage
  });
  if (!LIVE.has(r.status)) return { plan: { compressed: plan.compressed, jobs: [] }, rows: [], start: iso(r.appointment_date) };
  return { plan, rows: jobRows(plan, { start: r.appointment_date }), start: iso(r.appointment_date) };
}
