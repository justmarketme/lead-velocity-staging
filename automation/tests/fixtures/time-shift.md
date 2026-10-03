# Time shift: how reminder and outcome timing is tested (Africa/Johannesburg)

All fixture times are written in SAST (`+02:00`). South Africa has no daylight saving, so SAST is always UTC+2 and "same wall-clock time" never drifts.

## Offline (default): a virtual clock
- Each reference function takes `now` as an argument. Nothing reads the machine clock.
- The fixture's `_meta.base_clock` is Mon 12 Oct 2026 08:00. Every lead, booking and tap has an absolute time on that clock.
- To test a reminder, the test computes the schedule from `booking_request.requested_at` (T0) and `slot_start` (M). It then checks the hand-computed times in `expected.W09.schedule`. Example, L01: T0 Mon 08:14:41, M Thu 10:00, so T-48 h is Tue 10:00.
- Branches are made by moving the booking time, not by waiting:
  - **Full sequence (L01, L10):** booked 3 or more days out, so `intro_media` goes at T-48 h.
  - **Mid-range (L04):** booked 24–72 h out, so `intro_media` goes at T0 + 15 min.
  - **Compressed (L02, L03):** booked less than 24 h out, so there is no T-24 h reminder or prep nudge.
  - **Edge case:** booked exactly 2 h out. The test rewrites `slot_start`; there is then no separate T-2 h.
- Scheduler tests call `tick(now)` on a loop of virtual instants. They prove each job is sent once, and that cancelled jobs (STOP, reschedule) never go.

## Online (against local n8n + tunnel, or the VPS)
Two mechanisms, both used only for staging:
1. **Whole-week shift of the fixtures.** `rebaseWeeks()` in `_harness.mjs` moves every fixture time forward by N × 7 days. N is the smallest shift that puts the base clock in the future and lands no fixture date on a public holiday (`data/za-public-holidays.json`). Weekday and time of day stay the same, so meeting hours, the 30-minute grid and the hand-computed expectations still hold.
2. **Virtual "now" on every request.** The harness sends `X-Test-Now: <ISO>` on `/lead`, `/slots`, `/book` and the WhatsApp webhook. `POST /test/tick {now}` makes the scheduler process every job due at or before that instant. No test waits 48 hours. The workflow writes `send_at` from the virtual now, and the tick fires it.
   - n8n honours `X-Test-Now` only when `TEST_HOOKS_ENABLED=true`, `X-Test-Token` matches `TEST_HOOKS_TOKEN`, and the payload is `is_synthetic: true`. Production ignores the header. The W26 synthetic suite on the VPS runs with hooks on, then switches them off.
- **The 60-second first-touch test (W06) uses the real wall clock.** It must prove the real latency. The harness polls the lead state for up to 70 s.

## What is not time-shifted
Meta delivery receipts and real phone taps. Those are checked in the 6B.10 day-in-the-life rehearsal on real phones.
