// Reference slot rules (owned by W04; also used by W05 re-check, W06 slot offers, W10/W13 rebooking offers).
// Kept out of W04.test.mjs so importing it does not re-run W04's tests in other files.
// 4.6 booking rules: Africa/Johannesburg, meeting hours, 30-min slots, 15-min buffer, 2-h notice, 14-day horizon,
// max per day / per week, SA public holidays, spread across days, Outlook free/busy exclusion.
import { HOLIDAYS, ms, iso, sast, at, D, H, MIN, DOW, weekKey } from './_harness.mjs';

export const ACTIVE = new Set(['booked', 'confirmed']);
export const DAY_VIEW_MAX = 20; // Flow RadioButtonsGroup limit (W28)

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/**
 * @param b        broker row
 * @param busy     Outlook getSchedule busy blocks [{start,end}] or null when Graph auth failed
 * @param bookings our bookings for this broker [{start,end,status}] (also in Outlook, listed separately for the caps)
 * @param now      ms
 * @returns {fallback?:'whatsapp', slots:[{start,end}]}
 */
export function generateSlots(b, busy, bookings, now, holidays = HOLIDAYS) {
  if (busy === null) return { fallback: 'whatsapp', slots: [] }; // calendar auth error -> "pick on WhatsApp"
  if (b.bookings_paused || b.status !== 'active') return { slots: [] };
  const slotMs = b.slot_minutes * MIN;
  const buf = b.buffer_minutes * MIN;
  const earliest = now + b.min_notice_hours * H;
  const latest = now + b.horizon_days * D;
  const active = bookings.filter((x) => ACTIVE.has(x.status)).map((x) => ({ s: ms(x.start), e: ms(x.end) }));
  const blocks = [...busy.map((x) => ({ s: ms(x.start), e: ms(x.end) })), ...active];
  const perDay = new Map();
  const perWeek = new Map();
  for (const x of active) {
    const d = sast(x.s).date;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    const w = weekKey(x.s);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const out = [];
  for (let day = at(sast(now).date, '00:00'); day <= latest; day += D) {
    const p = sast(day);
    if (holidays.has(p.date)) continue;
    if ((perDay.get(p.date) ?? 0) >= b.max_meetings_per_day) continue;
    if ((perWeek.get(weekKey(day)) ?? 0) >= b.max_meetings_per_week) continue;
    for (const [open, close] of b.meeting_hours[DOW[p.dow]] ?? []) {
      for (let s = at(p.date, open); s + slotMs <= at(p.date, close); s += slotMs) {
        if (s < earliest || s > latest) continue;
        if (blocks.some((k) => overlaps(s - buf, s + slotMs + buf, k.s, k.e))) continue;
        out.push({ start: iso(s), end: iso(s + slotMs) });
      }
    }
  }
  return { slots: out };
}

/** Offer n slots earliest-first but spread across days: round-robin by day (never stack one day). */
export function offerSlots(slots, n = 3) {
  const byDay = new Map();
  for (const s of slots) {
    const d = s.start.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(s);
  }
  const days = [...byDay.keys()].sort();
  const out = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const d of days) {
      const s = byDay.get(d)[round];
      if (s && out.length < n) { out.push(s); added = true; }
    }
    if (!added) break;
  }
  return out;
}

/** Flow day screen: that day's free slots, at most 20. */
export const dayView = (slots, date) => slots.filter((s) => s.start.startsWith(date)).slice(0, DAY_VIEW_MAX);

/** Flow CalendarPicker unavailable-dates: working days in range with no free slot (full, blocked, holiday). */
export function unavailableDates(b, slots, now) {
  const free = new Set(slots.map((s) => s.start.slice(0, 10)));
  const out = [];
  for (let day = at(sast(now).date, '00:00'); day <= now + b.horizon_days * D; day += D) {
    const p = sast(day);
    const works = (b.meeting_hours[DOW[p.dow]] ?? []).length > 0;
    if (works && !free.has(p.date)) out.push(p.date); // full, blocked or holiday (holidays have no free slot)
  }
  return out;
}

