// automation/lib/w38.mjs  -  W38 SMC owner alert (leads, bookings, booking changes, console escalations), 18 Oct 2026.
// Imported by the Code nodes of automation/W38.json (require('lv-automation').w38) and by automation/tests/W38.test.mjs.
//
// Why: the SortMyCover dry-run ads route every lead to Jono's own "SortMyCover test practice" broker record, and nothing
// tells him a lead arrived (W22 covers incidents only; broker notices fire at booking, and the test record has no WhatsApp
// number on purpose: W07 would treat Jono's own test messages as broker messages).
// 24 Oct 2026 (owner rule, docs/OWNER-ALERTS-AUDIT.md): the first real lead (Cassiem, 08:12 SAST) reached Teams and Telegram
// through EMMA and never Jono's WhatsApp. The transport is now ONE WhatsApp from the SortMyCover number through
// smc-whatsapp-send (lib/owner-alert.mjs); EMMA /api/notify stays as the fallback rung when the sender answers ok:false.
// The same tick also sweeps the console queue (public.escalations: W10 / W11 / W12 / W13 / W15 / W39 rows nobody pushed
// anywhere) and the booking changes and voice call-backs in public.lead_activities, so those workflows need no edit.
//
// Every minute: SortMyCover leads (public.leads), bookings (public.appointments), escalations (raised_at) and a short list of
// lead_activities (booking_moved / booking_cancelled / voice_callback_requested / voice_callback_scheduled) created since a
// watermark kept in the workflow's static data -> ONE short message:
//   - first run (no watermark): watermark = the database's now(), nothing is sent (history is never replayed);
//   - each tick reads created_at > watermark - OVERLAP_MS (late commits, and W01 stamps created_at itself before the insert)
//     and drops ids already sent (the seen map, pruned to the overlap window and capped at SEEN_CAP);
//   - the new watermark is committed only after the WhatsApp sender answered ok (or EMMA 2xx on the fallback, or the
//     DRY_RUN_SENDS stub). Anything else keeps the old watermark, so the next tick sends the same items again; the
//     ALERT_AFTER_FAILS-th failure in a row fails the run once, so W22 (the error workflow) emails ops;
//   - SMC_LEAD_ALERT_ENABLED !== 'true': nothing runs and the state is dropped, so switching it on again starts fresh.
// POPIA data minimisation: the SQL returns only a first name, the last 3 digits of the number, attribution labels, the routed
// practice, a booking's time and method, an escalation's kind / severity / esc_kind token (never its note text) and an
// activity's type / new time. Never email, the full number, ID numbers or message text; format() masks again in case a wider
// row ever reaches it, and owner-alert redacts every template variable once more.
// Test / real split (23 Oct 2026, lib/routing-split.mjs): both rows of the split carry the same practice name, so the SQL
// also returns two booleans, test_lead (is_synthetic, or the number is on SYNTHETIC_TEST_NUMBERS / SMC_TEST_PHONES, compared
// inside the database) and test_practice (the broker is on SMC_TEST_BROKER_IDS; null while the rule is off), plus
// split_unknown_ids (an id on SMC_TEST_BROKER_IDS is no broker: the split cannot be trusted). line() labels the side and
// flags an item on the wrong side; format() puts the misconfiguration warning on top.
import { testBrokerIds, testPhoneDigits } from './routing-split.mjs';
import { ownerAlert, firstNameOf, phoneTail as tail3 } from './owner-alert.mjs';

export const SMC_BRAND_ID = '6e532b05-984f-4906-90a0-a5257cde328c';
export const NOTIFY_URL = 'https://emmadoesit.cloud/api/notify';
export const SOURCE = 'smc-lead-alert';
export const TITLE = 'SortMyCover lead';
export const OVERLAP_MS = 5 * 60_000;
export const SEEN_CAP = 200;
export const ROW_LIMIT = 200; // the SQL's LIMIT in build-w38.mjs (a full page advances the watermark only to its newest row)
export const MAX_LINES = 25;
export const MAX_CHARS = 3500; // EMMA keeps the first 4000
export const ALERT_AFTER_FAILS = 3;
export const KINDS = ['lead', 'booking', 'escalation', 'activity'];
/** lead_activities rows the tick reports (W10 booking changes, smc-voice call-backs): the SQL's IN list in build-w38.mjs. */
export const ACTIVITY_TYPES = ['booking_moved', 'booking_cancelled', 'voice_callback_requested', 'voice_callback_scheduled'];

/** The two switches, read exactly as the other workflows read DRY_RUN_SENDS. */
export const gates = (env = {}) => ({ enabled: env.SMC_LEAD_ALERT_ENABLED === 'true', dryRun: env.DRY_RUN_SENDS === 'true' });

const ms = (iso) => { const t = Date.parse(iso == null ? '' : String(iso)); return Number.isFinite(t) ? t : NaN; };
const keyOf = (r) => `${r.kind}:${r.id}`;

/**
 * Tick start. Disabled -> { run: false } (the node clears the static data). Enabled -> the query window
 * { run: true, brand_id, since }, since = '' on the first run (the SQL then reads no rows, only now()).
 */
export function start(state = {}, env = {}) {
  if (!gates(env).enabled) return { run: false, reason: 'disabled' };
  const wm = ms(state && state.watermark);
  return { run: true, brand_id: SMC_BRAND_ID, since: Number.isFinite(wm) ? new Date(wm - OVERLAP_MS).toISOString() : '' };
}

/** Keeps only ids that can still come back (created inside the overlap window), newest first, at most SEEN_CAP. */
export function prune(seen = {}, watermarkMs) {
  const floor = watermarkMs - OVERLAP_MS - 60_000;
  return Object.fromEntries(Object.entries(seen || {})
    .filter(([, t]) => Number.isFinite(t) && t >= floor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SEEN_CAP));
}

/**
 * The query result { db_now, items } -> what this tick does:
 *   { action: 'init', next }                               first run: watermark = db_now, nothing sent
 *   { action: 'idle', next }                               nothing new: the watermark advances now
 *   { action: 'send', next, items, keys, message, request } new items: `next` is committed only after an ok / 2xx (commit())
 */
export function plan(state = {}, rows = [], dbNow, opts = {}) {
  const now = ms(dbNow);
  if (!Number.isFinite(now)) throw new Error('w38.plan: no db_now from the query');
  const arr = typeof rows === 'string' ? JSON.parse(rows) : rows; // jsonb arrives parsed; a text cast would not
  const list = (Array.isArray(arr) ? arr : []).filter((r) => r && r.id && KINDS.includes(r.kind));
  const old = ms(state && state.watermark);
  if (!Number.isFinite(old)) {
    const seen = Object.fromEntries(list.map((r) => [keyOf(r), Number.isFinite(ms(r.created_at)) ? ms(r.created_at) : now]));
    return { action: 'init', next: { watermark: new Date(now).toISOString(), seen: prune(seen, now) } };
  }
  const seen0 = state.seen && typeof state.seen === 'object' ? state.seen : {};
  const fresh = list.filter((r) => !(keyOf(r) in seen0)).sort((a, b) => (ms(a.created_at) || 0) - (ms(b.created_at) || 0));
  const newest = list.reduce((m, r) => Math.max(m, ms(r.created_at) || 0), 0);
  const wm = Math.max(old, list.length >= ROW_LIMIT && newest ? Math.min(now, newest) : now);
  const seen = { ...seen0 };
  for (const r of fresh) seen[keyOf(r)] = Number.isFinite(ms(r.created_at)) ? ms(r.created_at) : now;
  const next = { watermark: new Date(wm).toISOString(), seen: prune(seen, wm) };
  if (!fresh.length) return { action: 'idle', next };
  const message = format(fresh, opts); // opts.split_unknown_ids: the misconfiguration warning line
  return { action: 'send', next, items: fresh.length, keys: fresh.map(keyOf), message, request: requestBody(message) };
}

/**
 * The owner WhatsApp for a planned tick (lib/owner-alert.mjs): ONE smc-whatsapp-send `prebuilt` item to the owner number,
 * template ops_update / ops_alert, var 2 = the head line ("1 new lead, 1 booking change"), var 3 = the item lines joined
 * " | " (clipped by the helper). Key = the tick's new watermark, so a retried tick carries the same correlation.
 */
export function ownerItems(p = {}, env = {}) {
  const [head, ...lines] = String(p.message || '').split('\n');
  return ownerAlert({ what: head.replace(/^SortMyCover:\s*/, ''), detail: lines, who: 'owner', source: 'W38', key: `tick:${(p.next && p.next.watermark) || ''}` }, env);
}

/**
 * After the send: the sender's { ok: true } (external_id `dry:` = the DRY_RUN_SENDS / synthetic dry run), EMMA's 2xx on the
 * fallback, or the dry-run stub commits plan.next; anything else keeps the old watermark and seen map (the next tick sends
 * the same items again) and counts the failure.
 * -> { state, delivered, dry_run, status, channel, alert } (alert: the ALERT_AFTER_FAILS-th failure in a row; the run fails once -> W22).
 */
export function commit(state = {}, p = {}, res = {}, nowIso = new Date().toISOString()) {
  const r = res || {};
  const viaSender = r.ok === true || r.ok === false; // smc-whatsapp-send Result { ok, external_id, error }
  const dry = r.dry_run === true || (viaSender && r.ok && /^dry:/.test(String(r.external_id || '')));
  // the EMMA stub passes the sender's { ok: false } through with its own fake 2xx (dry_run: true, statusCode: 200)
  const status = r.dry_run === true ? Number(r.statusCode || 200) : viaSender ? (r.ok ? 200 : 0) : Number(r.statusCode || 0);
  if (dry || (status >= 200 && status < 300)) {
    const channel = dry ? 'dry' : viaSender ? 'whatsapp' : 'emma';
    const last = { at: nowIso, items: p.items || 0, status, dry_run: dry, channel, ...(viaSender && r.external_id ? { external_id: String(r.external_id) } : {}), ...(dry ? { message: p.message } : {}) };
    return { delivered: !dry, dry_run: dry, status, channel, alert: false, state: { ...p.next, fails: 0, last } };
  }
  const fails = (Number(state && state.fails) || 0) + 1;
  const err = (viaSender && r.error) || (r.body && (r.body.error || r.body.message)) || (r.error && (r.error.message || r.error)) || '';
  const last_error = { at: nowIso, status, detail: String(err).slice(0, 200) };
  return { delivered: false, dry_run: false, status, channel: null, alert: fails === ALERT_AFTER_FAILS, state: { ...state, fails, last_error } };
}

export const requestBody = (message) => ({ message, source: SOURCE, title: TITLE });

// ---- the message -----------------------------------------------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHOD = { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone call' };
const ORIGIN = { page: 'site', ctwa: 'WhatsApp ad', lead_ad: 'Meta form', calcom: 'Cal.com' };
const pad = (n) => String(n).padStart(2, '0');

/** "Tue 21 Oct 14:30 SAST": Africa/Johannesburg is UTC+2 all year (no daylight saving). */
export function sastText(iso) {
  const t = ms(iso);
  if (!Number.isFinite(t)) return 'time not set';
  const d = new Date(t + 2 * 3600_000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} SAST`;
}

/** Last 3 digits only, whatever arrives (the SQL already sends only phone_last3). */
export const phoneTail = tail3;

/** First word of the name, letters only; an email or a number typed into the name field is never echoed. */
export const firstName = firstNameOf;

/** Attribution label from public values (angle, utm, ref): no token with "@", no digit runs, short. */
const safeLabel = (v) => String(v == null ? '' : v).split(/\s+/).filter((t) => t && !t.includes('@')).join(' ')
  .replace(/\d{5,}/g, '').replace(/[^A-Za-z0-9 _./:-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

export function sourceText(r = {}) {
  const origin = safeLabel(ORIGIN[r.origin] || r.origin);
  const detail = safeLabel(r.angle || r.utm_content || r.utm_campaign || r.ref || '');
  if (!origin && !detail) return '';
  return origin && detail ? `${origin} (${detail})` : origin || detail;
}

const isTestItem = (r) => r.synthetic === true || r.test_lead === true;
/** Which side of the test / real split the practice is on (only while the rule is on: test_practice is then a boolean). */
const sideText = (r) => (!r.practice || typeof r.test_practice !== 'boolean' ? ''
  : (r.test_practice ? ' (TEST practice)' : ' (real adviser)') + (r.test_practice !== isTestItem(r) ? ' [WRONG SIDE of the test/real split: check it now]' : ''));
const practiceText = (r) => { const p = String(r.practice || '').replace(/\s+/g, ' ').trim().slice(0, 60); return (p || 'not routed') + sideText(r); };
export const SPLIT_WARNING = '! Test/real routing split: SMC_TEST_BROKER_IDS names an id that is no broker. Check the n8n .env now.';
/** The split's env lists as query parameters ($3 test broker ids, $4 test numbers as E.164 digits; '' = none). */
export const splitParams = (env = {}) => ({ test_broker_ids: [...testBrokerIds(env)].join(','), test_phones: testPhoneDigits(env).join(',') });

/** Console escalation labels by the esc_kind token (the note's `esc_kind=<token>` prefix) or, without one, by escalations.kind. */
export const ESC_LABEL = {
  broker_no_show: 'the lead says the adviser did not call', outcome_disputed: 'outcome disputed', two_unconfirmed: 'two unconfirmed outcomes',
  outcome_unmarked: 'outcome not marked', late_broker_mark: 'late adviser mark after the apology', second_reschedule: 'second reschedule',
  replacement_weekly_max: 'replacement limit reached', replacement_due: 'replacement due', replacement_disputed: 'replacement disputed',
  broker_no_whatsapp: 'adviser has no WhatsApp number', dsr: 'data-subject request', guardrail_trip: 'guardrail trip', sensitive: 'sensitive chat',
  human_handoff: 'asked for a person', needs_human: 'needs a person', complaint: 'complaint', band_conflict: 'budget band conflict',
  opted_out_message: 'message after opting out', replacement_dispute: 'replacement disputed', classifier_invalid: 'reply check failed', other: 'needs a person',
};
const escText = (r) => {
  const k = safeLabel(r.esc_kind || '').trim().replace(/\s+/g, '_').toLowerCase().replace(/^_+|_+$/g, '');
  return ESC_LABEL[k] || (k ? k.replace(/_/g, ' ') : ESC_LABEL[String(r.esc || '')] || 'needs a person'); // an unknown token: its words, never free text
};
const ACTIVITY_LABEL = { booking_moved: 'Booking moved', booking_cancelled: 'Booking cancelled', voice_callback_requested: 'Call-back asked (phone)', voice_callback_scheduled: 'Missed call, automatic call-back set' };

/** One line per item. Only the allowed fields are ever read. */
export function line(r = {}) {
  const tail = phoneTail(r.phone_last3 != null ? r.phone_last3 : r.phone);
  const phone = tail ? `phone ends ${tail}` : 'no number';
  const test = isTestItem(r) ? ' [test data]' : '';
  if (r.kind === 'booking') {
    const what = r.rebooked ? 'Rebooking' : 'Booking';
    const held = r.status === 'pending_verification' ? ' (held until the email is verified)' : '';
    const method = METHOD[r.method] || safeLabel(r.method) || 'method not set';
    const practice = r.practice ? `with ${practiceText(r)}` : 'not routed';
    return `- ${what}: ${firstName(r.first_name)}, ${sastText(r.at)}, ${method}, ${phone}, ${practice}${held}${test}`;
  }
  if (r.kind === 'escalation') {
    const urgent = r.severity === 'red' ? ' (RED)' : r.severity === 'urgent' ? ' (urgent)' : '';
    const practice = r.practice ? `, with ${practiceText(r)}` : '';
    return `- Needs a person${urgent}: ${escText(r)}, ${firstName(r.first_name)}, ${phone}${practice}${test}`;
  }
  if (r.kind === 'activity') {
    const label = ACTIVITY_LABEL[r.activity] || safeLabel(String(r.activity || '').replace(/_/g, ' ')) || 'Update';
    const when = r.activity === 'booking_moved' && r.at ? `, to ${sastText(r.at)}` : '';
    const practice = r.practice ? `, with ${practiceText(r)}` : '';
    return `- ${label}: ${firstName(r.first_name)}${when}, ${phone}${practice}${test}`;
  }
  const src = sourceText(r);
  const routed = r.practice ? `routed to ${practiceText(r)}` : 'not routed';
  return `- ${r.repeat ? 'Repeat lead' : 'Lead'}: ${firstName(r.first_name)}${src ? `, ${src}` : ''}, ${phone}, ${routed}${test}`;
}

/** The message for a tick's new items (oldest first), plain text, at most MAX_LINES lines and MAX_CHARS characters. */
export function format(items = [], opts = {}) {
  const count = (k) => items.filter((r) => r.kind === k).length;
  const n = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : null);
  const head = `SortMyCover: ${[n(count('lead'), 'new lead', 'new leads'), n(count('booking'), 'new booking', 'new bookings'),
    n(count('activity'), 'booking change', 'booking changes'), n(count('escalation'), 'needs a person', 'need a person')].filter(Boolean).join(', ')}`;
  const lines = items.slice(0, MAX_LINES).map(line);
  if (items.length > MAX_LINES) lines.push(`...and ${items.length - MAX_LINES} more (see the CRM)`);
  let text = [head, ...(opts && opts.split_unknown_ids === true ? [SPLIT_WARNING] : []), ...lines].join('\n');
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS - 20).replace(/\n[^\n]*$/, '') + '\n...(cut, see the CRM)';
  return text;
}
