# Synthetic check — watchlist and kill/scale run over the synthetic cycle

No `supabase/seed/smc_synthetic.sql` or `automation/tests/fixtures/synthetic-leads.json` existed (fixtures folder empty), so `analytics/tests/synthetic-seed.sql` was written: 1 Bronze adviser (committed 20, cap 4), cycle 2026-10-05 to 2026-11-03, 5 ads at R350 a day, 30 sign-ups, 16 qualified and replied, 12 bookings, 10 held meetings, as of Sunday 2026-10-18 (day 14). Everything ran on a scratch Postgres 16 via `analytics/tests/run-all.sh`. Rows are synthetic; the `facts` tables are a test stand-in for platform-architect's views.

## The seven tiles (plus the launch tile)
Hand check = recomputed independently from the seed design (Python and arithmetic), not from the views.

| Tile | Value | Target | Status | n | Hand check |
|---|---|---|---|---|---|
| 0 Cost of a lead vs the model | R163 | R200 | green | 30 | R4,900 spend / 30 sign-ups |
| 1 Cost per good-fit meeting | R1,633 | R900 | grey (n = 3) | 3 | R4,900 media / 3 good-fit meetings; see needs_human on the R900 target |
| 2 Leads we could actually reach | 70.8% | 85% | amber | 24 | 17 replied within 72 h of 24 leads at least 3 days old |
| 3 Booked calls that happen | 60.0% | 65% | amber | 10 | 6 attended of 10 held |
| 4 Meetings rated a good fit | 60.0% | 60% | green (boundary) | 5 | 3 fit of 5 rated; not-a-fit exactly 40% so the pause rule does not fire |
| 5 Margin this cycle | 43.7% projected (61.1% so far) | 30% | green | 30 | (16,500 - [(5,635 + 90) x 1.5 + 700]) / 16,500; 1.5 = 24 needed / 16 verified |
| 5b Margin at the stress cost per lead | 16.3% | 30% | below floor | | 45 sign-ups x R291.50 + R700 = R13,817.50 |
| 6 Days of capacity left | 31.5 | 5 | green | 18 | 18 open slots / (4 bookings in 7 days / 7) |
| 7 Renewal risk | green, 1 point | 0 or 1 | green | | show rate 60% under 65% = 1 point; marked by adviser 90% = 0 |

Finding the check surfaced: at today's 54% qualify rate, margin at the R250 stress cost per lead is 16%, not 30%. Cost per lead is fine (R163); the qualify rate (target 60%, 3.4) is the margin risk. Raised in the weekly seed as the margin insight.

## Kill/scale at the base data
Fired: K1 (campaign spend R3,850 >= R3,000 and qualify rate 54.2% < 60%) -> pause A5 (no qualified leads) and A3 (R385 per qualified lead), the bottom 2 of 5; tighten questions; new concept batch. Not fired, with reason: K2 (cost per qualified R296 <= R400), K3 (10 held, show 60% >= 50%), K4/K5 (fewer than 5 ratings per ad), K6 (calendar 42% booked).

## Branch scenarios (`analytics/tests/scenarios.test.sql`, each rolled back)
- S1: A3 with 5 ratings, 3 not-a-fit, quality 2.0 -> K4 pause. A1 with 5 ratings, quality 4.0, cost within limits -> K5 +20%.
- S2: 3 attended turned to no-show -> K3 fires (30% of 10). 10 of 12 slots booked -> K6 trim 30% and K5 is blocked. 50% booked while trimmed -> restore. Full 5 days -> upsell/add adviser.
- S3: fewer qualified leads -> K2 escalate (R481 per qualified lead, 14 days).
- S4: spend cut to a quarter -> no K1/K2 candidates; gates view shows spend R962 of R3,000.
- S5: poor show rate, auto-marked outcomes, 6 to-dos, report unopened twice, low quality -> renewal risk red, 9 points, five reasons.
- S6: tampered report number (delivered 16 vs console 15) -> `w14_reconcile` fails, `w14_hold` true. A cost sentence in the one-liner -> hold. Untampered report: all 15 checks pass, hold false.

## Broker report for the synthetic adviser
One line: "Week 2 of your October cycle: 15 of 20 leads delivered, 12 booked, 6 showed up, 3 you rated a good fit. On track." Show rate 60% amber, replacements 1 of 4 green, edition midcycle, one ask "Mark the 1 open outcome", 2 to-dos (1 unmarked, 1 follow-up due) matching the console's to-do count.

## Ask the data
The 20 questions all execute on this dataset; 7 correctly resolve to "not enough data yet" (n under 20).
