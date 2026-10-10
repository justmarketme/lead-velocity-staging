// node --test src/lib/smcRules.test.mjs   (Node 22.6+ strips the TypeScript types)
// Contract rules behind the broker portal one-tap marking, no-show proof and cycle card (ux-sprint-1).
import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKS, markLabel, proofWindow, weekStartSast, requestsThisWeek, cyclePace, clampTopup,
  REPLACEMENT_MARKS, canAskReplacement, markPlan, replacementKindOf, REPLACEMENT_REASON, REPLACEMENT_REASON_CODE, PROOF_ACTIVITY,
} from "./smcRules.ts";

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

test("clause 7 + Schedule 3: no-show AND couldn't-reach can earn a replacement request; met / moved never", () => {
  assert.deepEqual([...REPLACEMENT_MARKS], ["no_show", "unreachable"]);
  for (const k of ["no_show", "unreachable"]) assert.equal(canAskReplacement(k), true, k);
  for (const k of ["attended", "rescheduled", "broker_no_show", "", null, undefined]) assert.equal(canAskReplacement(k), false, String(k));
  // every kind that can ask is one of the four answers (clause 8.4): nothing new for the broker to say
  for (const k of REPLACEMENT_MARKS) assert.ok(MARKS.some((m) => m.kind === k), k);
  // the storage conventions shared with the automation and the SQL (smc_20)
  assert.deepEqual(REPLACEMENT_REASON, { no_show: "no_show", unreachable: "uncontactable" });
  assert.deepEqual(REPLACEMENT_REASON_CODE, { no_show: "schedule3_proof", unreachable: "schedule3_proof_unreachable" });
  assert.deepEqual(PROOF_ACTIVITY, { no_show: "noshow_proof_sent", unreachable: "unreachable_proof_sent" });
  assert.equal(replacementKindOf({ reason: "no_show", reason_code: "schedule3_proof" }), "no_show");
  assert.equal(replacementKindOf({ reason: "uncontactable", reason_code: "schedule3_proof_unreachable" }), "unreachable");
  assert.equal(replacementKindOf({ reason: "uncontactable" }), "unreachable");
  assert.equal(replacementKindOf({ reason: "disqualified" }), null);
});

test("couldn't-reach has the same proof window as no-show: opens at start + 10 min, closes at start + 30 min", () => {
  const start = T("2026-10-06T10:00:00+02:00");
  const plan = (kind, offsetMs, used = 0) => markPlan(kind, proofWindow(start, start + offsetMs), used, 3);
  for (const kind of ["no_show", "unreachable"]) {
    assert.deepEqual(plan(kind, 2 * 60_000), { mode: "wait", minsToOpen: 8 }, `${kind} 2 min in`);
    assert.deepEqual(plan(kind, 10 * 60_000 - 1), { mode: "wait", minsToOpen: 1 }, `${kind} just before minute 10`);
    assert.deepEqual(plan(kind, 10 * 60_000), { mode: "ask" }, `${kind} at minute 10`);
    assert.deepEqual(plan(kind, 30 * 60_000), { mode: "ask" }, `${kind} at minute 30`);
    assert.deepEqual(plan(kind, 30 * 60_000 + 1), { mode: "late" }, `${kind} after minute 30: record only, still delivered`);
    assert.deepEqual(plan(kind, 3 * 3600_000), { mode: "late" }, `${kind} hours later`);
  }
  // met / moved are never gated by the window or the counter
  for (const kind of ["attended", "rescheduled"]) {
    assert.deepEqual(plan(kind, 2 * 60_000), { mode: "record" });
    assert.deepEqual(plan(kind, 20 * 60_000, 3), { mode: "record" });
  }
});

test("clause 7.2: ONE weekly counter of 3 across no-shows and couldn't-reach, whatever the status", () => {
  const start = T("2026-10-07T10:00:00+02:00");
  const now = start + 12 * 60_000; // Wednesday, inside the window
  const wk = [
    { reason: "no_show", status: "approved", missed_start_at: "2026-10-05T09:00:00+02:00" },
    { reason: "no_show", status: "rejected", missed_start_at: "2026-10-06T09:00:00+02:00" }, // declined still counts
    { reason: "uncontactable", status: "due", missed_start_at: "2026-10-06T14:00:00+02:00" },
  ];
  assert.equal(requestsThisWeek(wk, now), 3, "2 no-show + 1 couldn't-reach = 3");
  for (const kind of ["no_show", "unreachable"]) assert.deepEqual(markPlan(kind, proofWindow(start, now), 3, 3), { mode: "capped", used: 3, max: 3 }, `a 4th ${kind} is over`);
  // two requests used: either kind may still ask, and it is the third that fills the counter
  assert.equal(requestsThisWeek(wk.slice(0, 2), now), 2);
  for (const kind of ["no_show", "unreachable"]) assert.deepEqual(markPlan(kind, proofWindow(start, now), 2, 3), { mode: "ask" });
  assert.equal(requestsThisWeek([...wk.slice(0, 2), { reason: "uncontactable", status: "due", missed_start_at: "2026-10-07T09:00:00+02:00" }], now), 3);
  // a different Calendar Week starts fresh (Sunday 23:59 SAST is still the old week; Monday 00:00 is the new one)
  const rows = [...wk, { reason: "uncontactable", missed_start_at: "2026-10-11T23:59:00+02:00" }, { reason: "no_show", missed_start_at: "2026-10-12T00:00:00+02:00" }];
  assert.equal(requestsThisWeek(rows, now), 4, "Sunday 23:59 belongs to this week (the cap is enforced at the 4th, server-side)");
  assert.equal(requestsThisWeek(rows, T("2026-10-12T09:00:00+02:00")), 1, "next Monday: a fresh count");
  assert.equal(requestsThisWeek(wk, T("2026-09-30T12:00:00+02:00")), 0, "the week before: none");
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
