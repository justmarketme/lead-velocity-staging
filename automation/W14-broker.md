# W14 (broker side): the weekly report, words and payload (broker-success)

analytics-reporter supplies the SQL and the Sunday 23:00 run; broker-success owns the words, the payload shape, the templates mapping, the ask rules and the judge hooks. Design: `docs/design/broker-weekly-report.html` (approved; templatise, do not redesign). Portal view: `portal/spec/08-reports.md`.

## Editions and timing
Weekly: generated Sun 23:00, sent Mon 07:00 SAST (before the 07:30 digest). Day-15 (`broker_midcycle`) and cycle-end (`broker_cycle_end`) editions are generated 23:00 the night before and sent at 07:00 on that day; if that day is a Monday, the weekly is folded into it (one message per morning). Cycle-end uses the extended end date if a shortfall extension is running. Week label = `ceil(day_of_cycle / 7)`; weeks beyond 4 read "week 5 (extension)". (ASSUMPTION: edition timing; the master prompt does not say how they interact.)

## `reports` row
`reports(broker_id, week, cycle_id, edition weekly|midcycle|cycle_end, payload_json, pdf_url, sent_wa_at, sent_email_at, opened_portal_at, ask, ask_done_at)` (edition is a column I need; see needs_human). Every figure is `{v, target, last}` (value, target, last week; target/last null when not applicable).

```json
{
  "schema": "broker_report/1", "edition": "weekly", "week": "2026-W41", "week_of_cycle": 2, "weeks_in_cycle": 4,
  "broker": {"id": "uuid", "first_name": "Mark", "practice": "Mark Williams Financial Planning", "fsp": "00000"},
  "cycle": {"id": "uuid", "label": "October", "tier": "Bronze", "day": 14, "days_total": 30, "starts": "2026-09-29", "ends": "2026-10-28", "renewal_offer_on": "2026-10-21", "extension": {"active": false, "until": null}},
  "s1_one_line": "7 of 20 leads delivered, 5 booked, 4 showed up, 3 you rated a good fit. On track for the cycle.",
  "s2_progress": {
    "delivered": {"v": 7, "target": 10, "last": 4, "committed": 20}, "verified": {"v": 7, "target": null, "last": 4},
    "booked": {"v": 5, "target": 0.60, "last": 0.60, "rate": 0.71}, "attended": {"v": 4, "target": null, "last": 3},
    "show_rate": {"v": 0.80, "target": 0.65, "last": 0.75, "light": "green"},
    "replacements": {"used": 0, "cap": 4, "last_used": 0, "light": "green"}, "days_left": 16},
  "s3_meetings": {
    "last_week": [{"lead_ref": "lead_uuid", "first_name": "Lerato", "initial": "M", "full_name": "Lerato Mokoena", "when": "2026-10-08T11:00+02:00", "method": "teams", "outcome": "attended", "unconfirmed": false, "disposition": "fit_followup", "quality": 4}],
    "next_week": [{"first_name": "Pieter", "initial": "B", "when": "2026-10-13T10:00+02:00", "method": "teams"}],
    "todos": {"unmarked": [{"booking_id": "uuid", "first_name": "Sipho", "initial": "D"}], "followups_due": [{"first_name": "Lerato", "initial": "M", "due": "2026-10-15"}], "not_reached": []}},
  "s4_quality": {"avg_rating": {"v": 4.1, "target": 4.0, "last": 3.8}, "ratings_given": {"v": 0.75, "target": 0.90, "last": 1.0},
    "mix": {"fit_proceeding": 1, "fit_followup": 2, "nofit_budget": 0, "nofit_covered": 0, "nofit_criteria": 0, "unreachable": 0},
    "themes": [{"text": "Is my work cover enough?", "count": 4, "of": 7}]},
  "s5_notice": ["A new ad about bond cover went live Friday. Expect more leads mentioning a bond."],
  "s6_roi": {"shown": true, "close_rate": 0.30, "policies_reported": 1, "tracking_to": 3, "basis": {"attended": 4, "committed": 20, "delivered": 7}, "meetings_to_policies": {"v": 0.25, "last": 0}},
  "s7_ask": {"code": "mark_outcomes", "text": "Mark Thursday's two outcomes. It keeps your replacements accurate and your pre-call briefs sharp.", "button": "Mark outcomes (2)", "deep_link": "ask/rp_2026w41"},
  "s8_cycle": {"line": "Cycle 1 (Bronze) ends Wed 28 Oct. Your renewal offer arrives Wed 21 Oct. No contract."},
  "wa": {"v1": "...", "v2": "...", "v3": "...", "v4": "...", "v5": "...", "v6": "..."}
}
```
Rules: `s6_roi.shown` only when `brokers.close_rate` is set; `tracking_to = round(close_rate * attended * committed / delivered)` (his numbers, straight line, basis shown; null if delivered = 0); policies reported never feed any fee, ranking or alert. `s5_notice` only true statements, never spend, CPL, creative names or other brokers. Empty week: `s1_one_line` says so and `s7_ask` is null. The `wa` block is computed by the same code that builds the payload, so WhatsApp can never differ from the portal.

## WhatsApp mapping (templates already in `automation/templates`)
`broker_weekly` body: "This week: {{1}} / Delivered: {{2}} / Booked: {{3}} · Show rate: {{4}} / To-dos: {{5}} / One ask: {{6}} / Tap below..." Buttons: **Do it now** (`ask/<id>`), **Open report** (`r/<id>`).
| Var | Value | Example |
|---|---|---|
| 1 | week sentence + verdict, under 90 chars | "Week 2 of your October cycle. On track." |
| 2 | `delivered.v of committed (target t by now, last week l)` | "7 of 20 (target 10 by now, last week 4)" |
| 3 | `booked.v (last week l)` | "5 (last week 3)" |
| 4 | `show_rate (target, last week)` | "80% (target 65%, last week 75%)" |
| 5 | to-do count in words | "2 outcomes to mark" or "Nothing to mark" |
| 6 | `s7_ask.text` shortened to 60 chars | "Mark the 2 open outcomes" |
No newlines or runs of spaces in parameters; no lead names (aggregates only, POPIA); six lines. No ask this week: var 6 = "Nothing this week. You are all caught up." and "Do it now" opens the report (a no-ask template variant would be cleaner; needs_human). The mock's "Top theme" line is not in the approved template; it stays in portal and email.
`broker_midcycle`: 1 cycle month, 2 delivered, 3 committed, 4 booked, 5 attended, 6 average rating, 7 status line ("On track to deliver all 20." or "A little behind: we are adding leads and your cycle can extend up to 14 days."), 8 cycle end date. `broker_cycle_end`: 1 month, 2 end date, 3 delivered, 4 committed, 5 good-fit meetings (`fit_proceeding + fit_followup`), 6 average rating, 7 "Replacements used: n of cap." plus extension or credit sentence if any. Both carry the renewal link (`renew/<cycle>`, W19).

## Email and PDF
- From howzit@leadvelocity.co.za (Graph `sendMail`), bcc howzit@ (copy retained). Subject: "Your SortMyCover week · {delivered}/{committed} delivered · {n} thing(s) to do" (no ask: "· all caught up"). Mid-cycle: "Day 15 of your cycle · ..." ; end: "Your October cycle summary".
- HTML is generated from the approved design by a build script (`scripts/build-broker-report-email.mjs`, to be written by automation-engineer): table layout, inline styles, brand colours read from `brand/tokens.json` at build time (no hex in this repo outside tokens), single column, 600 px, dark-mode safe. Body = payload sections 1, 2, 3 (names as first name + initial), 4, 7, 8; the one-ask is a bulletproof button.
- PDF: headless Chromium prints the portal `/r/<id>/print` view, A4, two pages, file `SortMyCover-week-2-Oct-2026.pdf`. Emailed PDF = initials only; the portal "Download PDF" (logged in) shows full names. (ASSUMPTION, see needs_human.)

## One-ask selector (exactly one, or none)
Evaluate in order; first eligible wins. Cooldown: the same non-priority-0 ask is not repeated three weeks running unless it is priority 1.
| Pri | Code | Eligible when | Button |
|---|---|---|---|
| 0 | `reconnect_calendar` | `calendar_status <> ok` | Reconnect calendar |
| 1 | `mark_outcomes` | unconfirmed meetings, or attended without disposition, count >= 1 | Mark outcomes (n) |
| 2 | `not_reached` | any lead said the adviser did not reach them | Call them now |
| 3 | `record_intro` | no approved intro media and >= 5 bookings (show-rate lever) | Record my intro |
| 4 | `open_capacity` | free slots next 7 days < 3 while committed leads remain undelivered | Open more times |
| 5 | `confirm_holiday_hours` | public holiday in next 7 days and hours not confirmed | Confirm my hours |
| 6 | `rerecord_intro` | intro approved > 90 days ago | Re-record my intro |
| 7 | `add_close_rate` | >= 5 attended and no close rate | Add my close rate |
| 8 | `followup_due` | good-fit follow-ups due this week | See follow-ups |
None eligible: `s7_ask = null`. Button deep links `ask/<report_id>` land on the exact screen; `ask_done_at` is set when the action completes.

## Judge hooks (W33 rubric for reports; reject = hold and alert, per W14 failure handling)
| Id | Check |
|---|---|
| R01 | Every figure in the payload equals the console `v_cycle_progress` / outcomes query for that broker and week |
| R02 | WhatsApp text, email body, PDF and portal show identical numbers (same payload) |
| R03 | No banned word: CPL, CPC, CTR, CAPI, EMQ, attribution, ROAS, spend, "our funnel", guarantee/guaranteed, best, cheapest, "appointments" as the unit sold, insurer or product names, other brokers |
| R04 | Exactly one ask, or none with the one-line saying so |
| R05 | WhatsApp: at most six lines, no lead full name, no health detail |
| R06 | Every number has target and last week (or an explicit n/a) |
| R07 | Traffic light on show rate and replacements only |
| R08 | Grade 7 reading level (Flesch-Kincaid <= 7), first person, under 150 words before the first table |
| R09 | `s6_roi` absent unless a close rate exists; policies reported appear nowhere else |
| R10 | Layout and section order unchanged from the template |
| R11 | No cost, creative name or targeting detail |
Failures write `reports.payload_json.judge = {pass:false, failed:[ids]}` and block sending.
