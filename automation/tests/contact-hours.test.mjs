// Smoke test #13 (21 Oct 2026): the ONE contact-hours rule for marketing sends (CPA s12 / Reg 4) and the SA public holiday
// lists. Run: node --test automation/tests/contact-hours.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as C from '../lib/contact-hours.mjs';

const require = createRequire(import.meta.url);
const t = (s) => Date.parse(`${s}+02:00`);
const sast = (ms) => new Date(ms + 2 * 3600e3).toISOString().slice(0, 16);

test('marketing hours: Mon-Fri 08:00-20:00, Sat 09:00-13:00, never Sunday or a public holiday', () => {
  const yes = ['2026-10-19T08:00:00', '2026-10-19T19:59:00', '2026-10-23T12:00:00', '2026-10-24T09:00:00', '2026-10-24T12:59:00'];
  const no = ['2026-10-19T07:59:00', '2026-10-19T20:00:00', '2026-10-24T08:59:00', '2026-10-24T13:00:00', '2026-10-24T16:00:00',
    '2026-10-25T10:00:00', // Sunday
    '2026-11-04T10:00:00', // municipal election day (Wed), a public holiday
    '2026-12-16T10:00:00', '2026-12-25T10:00:00', '2026-12-26T10:00:00'];
  for (const s of yes) assert.equal(C.inMarketingHours(t(s)), true, s);
  for (const s of no) assert.equal(C.inMarketingHours(t(s)), false, s);
});

test('a send outside the hours moves to the next allowed moment (never dropped)', () => {
  const next = (s) => sast(C.nextMarketingTime(t(s)));
  assert.equal(next('2026-10-19T10:15:00'), '2026-10-19T10:15', 'inside: unchanged');
  assert.equal(next('2026-10-19T21:30:00'), '2026-10-20T08:00');
  assert.equal(next('2026-10-23T20:30:00'), '2026-10-24T09:00', 'Friday night -> Saturday 09:00');
  assert.equal(next('2026-10-24T14:00:00'), '2026-10-26T08:00', 'Saturday afternoon -> Monday 08:00');
  assert.equal(next('2026-10-25T10:00:00'), '2026-10-26T08:00', 'Sunday -> Monday 08:00');
  assert.equal(next('2026-11-03T20:30:00'), '2026-11-05T08:00', 'election day 4 Nov is skipped');
  assert.equal(next('2026-12-24T21:00:00'), '2026-12-28T08:00', '25 Fri, 26 Sat holidays, 27 Sunday');
  assert.equal(next('2026-10-24T08:30:00'), '2026-10-24T09:00', 'Saturday opens at 09:00');
});

test('latest allowed moment before t: itself inside, else 30 min before the last window closed', () => {
  const back = (s) => sast(C.latestMarketingTimeBefore(t(s)));
  assert.equal(back('2026-10-20T15:00:00'), '2026-10-20T15:00');
  assert.equal(back('2026-10-20T23:00:00'), '2026-10-20T19:30');
  assert.equal(back('2026-10-21T06:00:00'), '2026-10-20T19:30');
  assert.equal(back('2026-10-25T18:00:00'), '2026-10-24T12:30', 'Sunday -> Saturday 12:30');
  assert.equal(back('2026-10-24T15:00:00'), '2026-10-24T12:30');
  assert.equal(back('2026-11-04T11:00:00'), '2026-11-03T19:30', 'election day -> the evening before');
});

test('booking reminders: one clearly named setting, off until Jono decides (reminders keep quiet hours 20:00-08:00)', () => {
  assert.equal(typeof C.BOOKING_REMINDERS_USE_MARKETING_HOURS, 'boolean');
  assert.equal(C.BOOKING_REMINDERS_USE_MARKETING_HOURS, false);
});

// ---------- every SA public holiday list in the repo agrees with data/za-public-holidays.json
const FILE = JSON.parse(readFileSync(new URL('../../data/za-public-holidays.json', import.meta.url), 'utf8'));
const DATES = FILE.holidays.map((h) => h.date).sort();
const VOICE = (() => {
  const src = readFileSync(new URL('../../supabase/functions/_shared/smc_voice_lib.ts', import.meta.url), 'utf8');
  const m = src.match(/export const ZA_HOLIDAYS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'smc_voice_lib.ts ZA_HOLIDAYS literal found');
  return [...m[1].matchAll(/"(\d{4}-\d{2}-\d{2})"/g)].map((x) => x[1]).sort();
})();

test('holiday data: 4 Nov 2026 (municipal election day) is a public holiday; dates unique and well-formed', () => {
  assert.ok(DATES.includes('2026-11-04'), 'data/za-public-holidays.json has 2026-11-04');
  assert.equal(new Set(DATES).size, DATES.length, 'no duplicate dates');
  for (const d of DATES) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test('every holiday list agrees: data file = W04 slots (lv-automation holidays) = marketing hours = voice callbacks (smc_voice_lib.ts)', () => {
  const W04 = require('../index.cjs').holidays.holidays.map((h) => h.date).sort();
  assert.deepEqual(W04, DATES, 'W04 / W28 read the data file through index.cjs');
  assert.deepEqual([...C.HOLIDAYS].sort(), DATES, 'lib/contact-hours.mjs');
  assert.deepEqual(VOICE, DATES, 'supabase/functions/_shared/smc_voice_lib.ts ZA_HOLIDAYS (copy: keep it in step with the data file)');
});
