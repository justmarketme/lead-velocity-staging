# Ask the data (6A2 item 4) — read-only design

Console -> Ask. Jonathan or KG types a business question; the assistant answers with the number, the comparison that makes it meaningful, how it was computed (expandable), the caveat and one suggested next question. It never invents a number it did not compute.

## Flow
1. **Draft (Haiku):** question + metric dictionary (`knowledge/metrics.md`, only plain names, means, SQL and targets) + whitelist column list -> one SQL SELECT.
2. **Guard (code, not the model):** parse the SQL (pglast or equivalent); reject if not a single SELECT/WITH-SELECT, if it references any relation outside the whitelist, any function outside the allow list (no `pg_*`, `set_config`, `dblink`, `copy`, `lo_*`), or any DML/DDL. Inject `LIMIT 200` when absent; reject above 200. `statement_timeout = 5s`. Executed as role `facts_reader` (SELECT on the whitelist only, no access to `public.*` or `ops.*`).
3. **Run, then explain (Sonnet):** gets the question, SQL, result rows (max 50 shown) and the dictionary entry. Must output: headline number, comparison, caveat, next question. Every figure in the answer must appear in the result rows (checked by string match; a miss re-asks once, then answers "I could not compute that").
4. **Log:** every query to `ops.ask_log(asked_at, asked_by, question, sql, rows_returned, n_min, answer, refused_reason)`.

## Whitelist
Tables: `facts.fact_lead, fact_message, fact_booking, fact_outcome, fact_comment, fact_ad_day, fact_broker_day, fact_cycle, fact_cost, fact_system_day, fact_lead_theme`.
Views: `facts.v_watchlist_0..7, v_kill_scale_candidates, v_w14_lv_creative, v_w14_lv_margin, v_w14_lv_renewal, v_cycle_progress, v_params`.
Excluded on purpose: `facts.fact_broker_roi` (policies written and close rate: FAIS, never in any fee or ranking, 3.7), anything with names, numbers or emails (the `facts` layer holds none; `lead_key` is a hash and may be used to join or count but a result column named `lead_key` is stripped), and the operational tables.
No row-level lead output: results with a `lead_key` column or more than 50 rows that are not grouped are refused ("ask for a summary").

## Sample-size rule
Every ratio, average or comparison query must return an `n` column (the events behind it). If the smallest `n` is under 20 the answer is: "Not enough data yet (n = X, need 20)" plus the raw counts. Pure counts and sums need no `n`. Rankings of fewer than 3 items say so.

## Prompts
**Draft (Haiku), system:** "You write one read-only Postgres SELECT over the `facts` schema using only the tables and views listed. Use `facts.as_of()` for today. Use `facts.disp_class(disposition_code)` to classify dispositions. Always include an `n` column for any ratio or average. Never select lead_key, names, phone numbers or emails. If the question cannot be answered from these tables, return `-- cannot answer` and a one-line reason. Use the metric dictionary definitions exactly; do not invent a metric."
**Explain (Sonnet), system:** "Answer in plain English at a Grade 7 reading level, as a business owner would say it. Give: (1) the number, (2) the comparison to the target or last period from the dictionary, (3) one caveat about sample size or window, (4) one suggested next question. Use plain names, never jargon (put jargon only in brackets once). Use only numbers present in the result. If n is under 20 say 'Not enough data yet' and show the counts. Never give advice about insurance products."

## Acceptance (Section 7)
20 scripted owner questions with expected SQL and answer shape: `analytics/ask-the-data-questions.json`. Each SQL was executed on the synthetic cycle (`analytics/tests/synthetic-seed.sql`, shifted to today; physical column names of smc_04/06, `public.v_cycle_progress` for cycle counts) and its output is stored as `expected_on_synthetic`. `expected_kind_on_synthetic` says whether the assistant must answer with a number or with "not enough data yet" (7 of 20, because one adviser and 14 days of data). A test passes when the assistant's SQL returns the same rows as the stored SQL (compared by result, not by text) and the explanation contains no number that is not in the rows. `analytics/tests/ask-questions.test.py` re-runs all 20 against the fixture (20 of 20 match). Q15, Q16 and Q18 depend on feeders the fixture leaves empty (lead themes, comments, infra uptime) and must answer "not enough data yet".
