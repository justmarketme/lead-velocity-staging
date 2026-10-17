# Kill / scale rules as candidate actions (3.4)

`analytics/kill-scale.sql` defines `facts.v_kill_scale_candidates`. It only reads. The optimisation-advisor turns each row into an `ops.proposals` row (`source = 'kill_rule'`) for Approve / Snooze / Decline; ads-api-engineer applies approved changes with confirm-to-apply. Nothing here pauses or scales anything. The Approve and the check-date result land in the decision journal (6A2 item 7) via `ops.proposals`.

Window: the last 14 days ending 3 days ago, so "qualified" (needs a reply within 72 h) is read on leads old enough to have been verified. Binet and Field rule: no rule fires before its spend gate or sample minimum. `facts.v_kill_scale_gates` shows why a rule has not fired.

| Rule | Source | Fires when | Candidate action |
|---|---|---|---|
| K1 | 3.4 bullet 1 | Campaign spend in window >= R3,000 and (raw cost per lead > R250 or qualify rate < 60%) | `pause_ad` for the bottom half (floor of half) of active ads with spend >= R300, ranked by cost per qualified lead, ads with none ranking worst; plus `tighten_qualifying_questions` and `launch_new_concept_batch` for the campaign |
| K2 | 3.4 bullet 2 | Campaign has run >= 14 days, spend >= R3,000, cost per qualified lead > R400 (or none qualified) | `stop_spend_and_escalate_to_jonathan` |
| K3 | 3.4 bullet 3 | Show rate < 50% over 14 days with >= 8 held meetings (per adviser and overall) | `review_reminder_sequence_and_qualification` |
| K4 | 3.4 bullet 4, 4.12a | Ad has >= 5 fit/not-fit ratings and (quality index < 2.5 or not-a-fit > 40%), cumulative | `pause_ad` regardless of cost |
| K5 | 3.4 bullet 4 | >= 5 ratings, quality index >= 4, raw cost <= R250, qualified cost <= R400, ad spend >= R300, and no adviser trimmed or >= 80% booked | `increase_budget` +20% |
| K6 | line 758 | Next 7 days >= 80% booked and not trimmed: `trim_media_share` 30%. Trimmed and < 60%: `restore_media_share`. Full five days in a row: `offer_bigger_tier_or_add_adviser` | as named |

Columns: `rule_id, rule_cite, scope_type, scope_id, scope_name, evidence (jsonb), proposed_action, proposed_pct, n, faculty, title, metric`.

Assumptions (in `params.sql`, listed in needs_human): R300 minimum spend per ad before it can be ranked; 8 held meetings before K3 can fire; K5 interprets "within CPL threshold" as raw <= R250 and qualified <= R400; K4 counts ratings cumulatively not in the 14-day window. Conflict flagged: the pulse list in 6.8 says qualified cost <= R250, 3.4 says R400; 3.4 is used.

Tested by hand: `analytics/tests/scenarios.test.sql` (S1 to S4) covers each branch; results in `analytics/synthetic-check.md`.
