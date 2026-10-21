// automation/lib/contact-hours.mjs  -  the ONE contact-hours rule for direct-marketing WhatsApp sends (smoke test #13, 21 Oct 2026).
// Imported by lib/w08.mjs (unbooked + Start here nudges), lib/w01.mjs (budget reminder, low-budget close), lib/w05.mjs (the
// hold-released rebook nudge) and lib/w09.mjs (booking reminders, only when BOOKING_REMINDERS_USE_MARKETING_HOURS is true).
// Node 18+, zero dependencies. The holiday list is data/za-public-holidays.json, the same file W04 slots read.
//
// Consumer Protection Act s12 / Regulation 4 (direct marketing contact hours), the same window the voice callbacks use
// (supabase/functions/_shared/smc_voice_lib.ts WINDOWS):
//   Mon-Fri 08:00-20:00, Sat 09:00-13:00, never on a Sunday or a public holiday (SAST, Africa/Johannesburg, no DST).
// A marketing send that falls outside is moved to the next allowed moment (nextMarketingTime), never dropped.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FILE = require('../../data/za-public-holidays.json');

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const SAST = 2 * H;

/** SA public holidays (YYYY-MM-DD, SAST), from data/za-public-holidays.json. */
export const HOLIDAYS = new Set(FILE.holidays.map((h) => h.date));

/** Allowed minutes of the SAST day per weekday (0 = Sunday): [open, close), close exclusive. null = no marketing that day. */
export const MARKETING_HOURS = Object.freeze({
  0: null,
  1: [8 * 60, 20 * 60], 2: [8 * 60, 20 * 60], 3: [8 * 60, 20 * 60], 4: [8 * 60, 20 * 60], 5: [8 * 60, 20 * 60],
  6: [9 * 60, 13 * 60],
});

/**
 * THE SETTING (Jono decides): do booking reminders for an appointment the person booked (W09: what_to_expect, intro_media,
 * reminder_24h, prep_nudge, reminder_2h) follow the marketing hours above?
 *   false (today) = they keep their own rule: quiet hours 20:00-08:00 SAST every day (lib/wa.mjs QUIET), reminder_10m exempt.
 *   true          = they follow MARKETING_HOURS (no Sundays, holidays or Saturday afternoons); reminder_10m stays exempt.
 */
export const BOOKING_REMINDERS_USE_MARKETING_HOURS = false;

const asSet = (h) => (h instanceof Set ? h : new Set(Array.isArray(h) ? h.map((x) => (typeof x === 'string' ? x : x.date)) : []));
const toMs = (t) => (typeof t === 'number' ? t : Date.parse(t));
/** Start of the SAST calendar day containing t (ms). */
const dayStart = (t) => t - ((((t + SAST) % D) + D) % D);
const sastDate = (t) => new Date(t + SAST).toISOString().slice(0, 10);
/** The marketing window of the SAST day starting at `day` as absolute ms [open, close), or null. */
function windowOf(day, hol) {
  const w = MARKETING_HOURS[new Date(day + SAST).getUTCDay()];
  if (!w || hol.has(sastDate(day))) return null;
  return [day + w[0] * MIN, day + w[1] * MIN];
}

/** True when a direct-marketing message may go out at t. */
export function inMarketingHours(t, holidays = HOLIDAYS) {
  const x = toMs(t);
  const w = windowOf(dayStart(x), asSet(holidays));
  return !!w && x >= w[0] && x < w[1];
}

/** t when it is inside the marketing hours, else the next moment that is (the next window's opening). */
export function nextMarketingTime(t, holidays = HOLIDAYS) {
  const x = toMs(t);
  const hol = asSet(holidays);
  for (let i = 0, day = dayStart(x); i < 15; i++, day += D) {
    const w = windowOf(day, hol);
    if (!w || x >= w[1]) continue;
    return Math.max(x, w[0]);
  }
  throw new Error('contact-hours: no marketing window in 14 days');
}

/**
 * The latest moment at or before t that is inside the marketing hours: t itself when inside, else `margin` before the
 * close of the last window that ended before t (19:30 on a weekday, 12:30 on a Saturday with the default 30 min).
 */
export function latestMarketingTimeBefore(t, holidays = HOLIDAYS, margin = 30 * MIN) {
  const x = toMs(t);
  const hol = asSet(holidays);
  if (inMarketingHours(x, hol)) return x;
  for (let i = 0, day = dayStart(x); i < 15; i++, day -= D) {
    const w = windowOf(day, hol);
    if (!w || x < w[0]) continue;
    return Math.max(w[0], w[1] - margin);
  }
  throw new Error('contact-hours: no marketing window in the 14 days before');
}
