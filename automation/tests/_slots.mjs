// Shared slot rules for the tests (W05/W06/W10/W13/W28 import this). Owned by W04: since the W04 build this file is a
// thin wrapper around the RUNNING engine, automation/lib/w04.mjs, so every test that offers or re-checks a slot
// exercises the same code the W04 workflow runs (the rule lives once, in the lib). Not a test file (leading underscore).
// 4.6 booking rules: Africa/Johannesburg, meeting hours, 30-min slots, 15-min buffer, 2-h notice, 14-day horizon,
// max per day / per week, SA public holidays, spread across days, Outlook free/busy exclusion.
import { HOLIDAYS } from './_harness.mjs';
import * as W04 from '../lib/w04.mjs';

export const ACTIVE = W04.ACTIVE;
export const DAY_VIEW_MAX = W04.DAY_VIEW_MAX; // Flow RadioButtonsGroup limit (W28)

/**
 * @param b        broker row (fixture shape)
 * @param busy     Outlook getSchedule busy blocks [{start,end}] or null when Graph auth failed
 * @param bookings our bookings for this broker [{start,end,status}]
 * @param now      ms
 * @param holidays defaults to data/za-public-holidays.json (the lib itself requires them: no list = fail closed)
 * @returns {fallback?:'whatsapp', slots:[{start,end}]}
 */
export function generateSlots(b, busy, bookings, now, holidays = HOLIDAYS) {
  return W04.generateSlots(b, busy, bookings || [], now, holidays);
}
export const offerSlots = W04.offerSlots;
export const dayView = W04.dayView;
export const unavailableDates = W04.unavailableDates;
