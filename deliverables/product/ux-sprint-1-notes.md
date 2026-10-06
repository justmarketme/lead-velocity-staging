# UX sprint 1: build notes

Branch `ux-sprint-1`. Date: 6 Oct 2026. Scope: the "first sprint" in `crm-ux-synthesis.md` §5 (S1 to S5).
Not pushed, not deployed.

## What changed for the broker

- **One shell, SortMyCover only.** The Lead Velocity bar, hamburger and sidebar are gone for SMC brokers.
  - Phones get one sticky header that shrinks on scroll and four bottom tabs: Today · Leads · Reports · More.
  - Desktop gets a left sidebar.
  - Every tap target on Today, Leads, the lead record, Reports and More is at least 44 × 44 px (checked at 360 px). The only exceptions are inline text links inside sentences, which WCAG exempts.
- **Today** (`/broker/today`) is the landing page for a live broker. It shows four things in order:
  1. The next meeting, with a big Join or Call button and a Brief sheet.
  2. "Needs you": meetings to mark, leads who say they weren't reached, and a calendar to reconnect. When this is empty it says "You're all caught up".
  3. The cycle card.
  4. Meetings later today and tomorrow.

  `/broker/dashboard`, the `broker_onb_live` button (`/leads`) and login all land here. Brokers who are still onboarding land on Start here.
- **One-tap marking (agreement clause 8.4).** There are only four answers: Met them · No-show · Couldn't reach them · Moved to another time.
  - A tap shows at once and stays undoable for 6 seconds. Only then is it written.
  - A mark still waiting to be written when the broker leaves the page is sent immediately, so it is never lost.
  - A failed write reverts the row and shows "Tap to try again".
  - Removed completely: dispositions, the 1 to 5 score, the voice-note prompt, the ROI view, close rate, policies written and follow-up nudges.
- **No-show proof (Schedule 3).**
  - No-show is disabled until 10 minutes after the start ("wait 6 min").
  - From minute 10 to minute 30 it opens a sheet with "Take a photo" (camera) and "Choose a screenshot". The rule is shown in one line, the proof goes to the private `broker-media` bucket, and the broker sees "Request sent. We'll tell you on WhatsApp".
  - After 30 minutes, or once 3 requests have been used this week, it just records the no-show, with the line "too late for a replacement request / it still counts as delivered".
  - The copy everywhere says: goodwill, not a right; no-shows only; up to 3 requests a week; proof within 30 minutes.
- **Cycle card**, shared by Today, My leads and Reports:
  - "N of 20 delivered", where delivered follows clause 5.2.
  - A pace tick at committed × day / 30.
  - One status line: on pace / behind / ending with the shortfall rules / rollover.
  - "No-show replacement requests this week: n of 3".
  - At 20 of 20, a **Top up** sheet: a stepper with a minimum of 10, the price × R850 from `src/lib/pricing.ts`, and the start date after 7 days' notice. Agreement and billing also has a top-up entry.
- **Lead record** (`/broker/leads/:id`):
  - A header with the name, self-declared bands, language, method and Join/Call.
  - The mark buttons, when the lead needs one.
  - A history timeline, newest first: enquiry → consent → booked/moved → **"Confirmed they'll attend: counts as delivered (toward your 20)"** → reminders → brief → your mark → proof sent / request approved / declined.
  - It reads only an allow-list of event types. Lead "themes" and retired feedback are never fetched, and no health detail is shown.
- **Deep links.**
  - `/broker/leads?lead=<id>&do=brief|mark|proof` and `/broker/today?lead=…` open the record with that action ready.
  - `/l/<lead_id>` (the `broker_new_booking` button) now resolves. Before this change it was a 404.
  - `/s/today` and `/leads` are routed.

## Migration to apply (user-gated)

`supabase/migrations/20261006_smc_18_feedback_firewall.sql` is **not applied**. It is additive and idempotent. The local throwaway-Postgres test (`S7-07.local`) applies every migration including this one, and it passes.

| Change | Why |
|---|---|
| `outcomes.outcome` CHECK adds `unreachable` | "Couldn't reach them" (clause 8.4 contactability) |
| `replacements` + `booking_id`, `missed_start_at`, `proof_path`, `proof_sent_at` | Schedule 3 proof and the weekly count |
| `smc_week_start()`, and `smc_replacements_cap()` now caps at 3 per Calendar Week per broker (was per cycle) | clause 7.2 |
| RPC `smc_request_noshow_replacement(booking, proof_path)` | One call: checks it's the broker's own booking, the 10 to 30 min window and the weekly maximum, then upserts the No-show and inserts the request |
| `REVOKE EXECUTE smc_report_policies_written` from `authenticated` | clause 8.4 (ROI write path retired) |
| `v_cycle_progress` + `delivered`, `replacement_requests_this_week`, `replacement_weekly_max` | `delivered` = consent + `qualified_at` + a booked appointment with `confirmed_at` (or the W09 `booking_confirmed` log row, which survives a reschedule), excluding replacement leads. Existing columns are unchanged. `verified` keeps the old 72-h rule for the W14 checks. `good_fit` is left as-is because `facts.w14_reconcile` still checks the one-liner against it (see F2). |

No column or table is dropped. `disposition_code`, `quality_score`, `voice_note_url`, `brokers.close_rate` and `cycles.policies_written_reported` stay in the schema with "RETIRED" comments, and nothing writes them.

**Until it is applied, the portal works as follows:**
- `delivered` is computed in the browser with the same rule.
- The weekly count comes from `replacements.claimed_at`.
- "Couldn't reach them" fails the CHECK. The row reverts with "can't be saved until our next server update. Please tell us on WhatsApp", and the other three answers still work.
- The proof is uploaded and recorded as a portal event (`outcome.marked`, `replacement_request: true`, `proof_path`) so ops can see it. The No-show is written directly.

## WhatsApp automation (feedback firewall, logged for automation-engineer)

Templates retired, moved to `automation/templates/retired/` and taken out of `submit.sh`: `broker_disposition`, `broker_quality`, `broker_fit_followup`, and `session/broker_disposition_list`.

`broker_outcome_check` now has the same four quick replies as the portal.
- W12 no longer asks for a disposition and stores no voice note.
- "Couldn't reach them" resolves to `unreachable`, with no lead message, no CAPI event, and no W13 or W10 call.
- W29 refuses disposition, quality and voice notes.
- Tests were updated with a `clause 8.4 (ux-sprint-1)` comment at each changed assertion.

## Follow-ups (not done in this sprint, need an owner)

- **F1, W13 (automation-engineer).** W13 still does three things that conflict with clause 7:
  - It opens a replacement automatically after a confirmed lead no-show, with no proof.
  - It caps per cycle (4/6/9).
  - It still accepts `unreachable`/`nofit_criteria` claims.

  Fix: route requests only through `smc_request_noshow_replacement`, and make the WhatsApp No-show tap ask for the photo between minutes 10 and 30. Until this is fixed, the automation path can still "promise" a replacement.
- **F2, W14 report (automation-engineer + platform-architect).** These still carry rating and outcome data:
  - The SQL payload `facts.w14_broker_report`: `s4_quality.avg_rating`, `ratings_given`, the disposition mix, `s6_roi`, the one-liner "N you rated a good fit", and the `add_close_rate` / `followup_due` asks.
  - The templates `broker_midcycle` (var 6, average rating) and `broker_cycle_end` (vars 5–6).
  - `W14-broker.md`.

  The portal no longer shows any of it, hides retired asks, and computes attendance itself. Rework the payload with an `s4_attendance` block, then drop `good_fit` from the view in the same migration.
- **F3, top-up checkout (billing-automation).** `billing/checkout/` has no top-up product. The sheet sends written notice (clause 9.2) as a support message, and Lead Velocity invoices.
- **F4, docs.** `portal/spec/07-my-leads.md`, `08-reports.md`, `portal/prototype/leads.html`, `reports.html`, `CONTRACTS.md` (lines ~138, 206, 207, 223), `conversation/state-machine.md` and `automation/ads/CONSOLE-ADS-API.md` still describe dispositions, ratings and ROI.
- **F5, console ads rules.** In `src/lib/smcAdsPlan.ts` the quality pause/scale rules depend on broker ratings that are no longer collected. They will simply never fire. Replace them with show-rate rules.
- **F6, CI checks named in the acceptance criteria.** Not built: the axe + Playwright 44 px check in CI, Lighthouse ≥ 95, and the RLS test that a second broker gets nothing for another broker's lead. The 44 px check was done by hand at 360 px. RLS is unchanged: every read goes through existing owner policies.
- **NH-UX-2 (Jonathan).** "Couldn't reach them" is treated as feedback, not a replacement trigger, as the synthesis proposes.
