// node --test src/lib/smcRules.test.mjs   (Node 22.6+ strips the TypeScript types)
// Contract rules behind the broker portal one-tap marking, no-show proof and cycle card (ux-sprint-1).
import test from "node:test";
import assert from "node:assert/strict";
import { MARKS, markLabel, proofWindow, weekStartSast, requestsThisWeek, cyclePace, clampTopup } from "./smcRules.ts";

const T = (s) => Date.parse(s);

test("clause 8.4: exactly four answers, attendance and contactability only", () => {
  assert.deepEqual(MARKS.map((m) => m.label), ["Met them", "No-show", "Couldn't reach them", "Moved to another time"]);
  assert.deepEqual(MARKS.map((m) => m.kind), ["attended", "no_show", "unreachable", "rescheduled"]);
  const words = JSON.stringify(MARKS).toLowerCase();
  for (const banned of ["fit", "budget", "covered", "proceeding", "quality", "policy", "premium", "commission"]) assert.ok(!words.includes(banned), banned);
  assert.equal(markLabel("attended"), "Met them");
  assert.equal(markLabel("fit_proceeding"), "");
});

test("Schedule 3: proof window opens at start + 10 min and closes at start + 30 min", () => {
  const start = T("2026-10-06T10:00:00+02:00");
  assert.equal(proofWindow(start, start - 60_000).state, "not_started");
  assert.deepEqual(proofWindow(start, start + 3 * 60_000), { state: "waiting", minsToOpen: 7, minsLeft: 0 });
  assert.equal(proofWindow(start, start + 10 * 60_000).state, "open");
  assert.equal(proofWindow(start, start + 30 * 60_000).state, "open");
  assert.equal(proofWindow(start, start + 30 * 60_000 + 1).state, "closed");
  assert.equal(proofWindow(start, start + 12 * 60_000).minsLeft, 18);
});

test("clause 1.1.6: Calendar Week is Monday 00:00 to Sunday 23:59 SAST", () => {
  const mon = T("2026-10-05T00:00:00+02:00");
  assert.equal(weekStartSast(T("2026-10-05T00:00:00+02:00")), mon);
  assert.equal(weekStartSast(T("2026-10-11T23:59:00+02:00")), mon);
  assert.equal(weekStartSast(T("2026-10-04T23:59:00+02:00")), T("2026-09-28T00:00:00+02:00"));
  // Sunday 23:30 SAST is Sunday 21:30 UTC: still the same week
  assert.equal(weekStartSast(T("2026-10-11T21:30:00Z")), mon);
  const now = T("2026-10-07T12:00:00+02:00");
  const reqs = [{ missed_start_at: "2026-10-05T09:00:00+02:00" }, { claimed_at: "2026-10-06T09:20:00+02:00" }, { missed_start_at: "2026-10-04T16:00:00+02:00" }];
  assert.equal(requestsThisWeek(reqs, now), 2);
});

test("cycle pace: tick at committed × day / 30, statuses", () => {
  const s = T("2026-10-01T00:00:00+02:00"), e = s + 30 * 86400e3;
  const at = (day) => s + (day - 0.5) * 86400e3;
  assert.deepEqual(cyclePace({ delivered: 12, committed: 20, startsAtMs: s, endsAtMs: e, nowMs: at(14), cycleDays: 30 }), { day: 14, daysTotal: 30, expected: 9, pacePct: 45, deliveredPct: 60, status: "on_pace" });
  assert.equal(cyclePace({ delivered: 5, committed: 20, startsAtMs: s, endsAtMs: e, nowMs: at(14), cycleDays: 30 }).status, "behind");
  assert.equal(cyclePace({ delivered: 17, committed: 20, startsAtMs: s, endsAtMs: e, nowMs: at(29), cycleDays: 30 }).status, "ending_short");
  assert.equal(cyclePace({ delivered: 20, committed: 20, startsAtMs: s, endsAtMs: e, nowMs: at(20), cycleDays: 30 }).status, "complete");
  assert.equal(cyclePace({ delivered: 18, committed: 20, startsAtMs: s, endsAtMs: e, nowMs: e + 2 * 86400e3, cycleDays: 30 }).status, "rollover");
});

test("top-up quantity: minimum 10, steps of 5", () => {
  assert.equal(clampTopup(3, 10), 10);
  assert.equal(clampTopup(15, 10), 15);
  assert.equal(clampTopup(NaN, 10), 10);
});
