# Data the advisor reads and writes (contract for platform-architect)

`supabase/migrations/20261002040000_smc_04_facts.sql` exists and defines `facts.fact_lead, fact_message, fact_booking, fact_outcome, fact_comment, fact_cost, fact_ad_day, fact_broker_day, fact_cycle, v_watchlist`. `slos.json` `reads.view` names those (`status: crm-gap` = table named in crm-gap.md; `proposed` = not in any migration yet). Column names inside `reads.column` are my reading of crm-gap.md and the migration's alias list; they were not checked against a live database. Anything the workflows need beyond those views is listed here. Additive DDL is in `sql-additions.sql` (not applied).

## Read objects the workflows call (bodies owed)
| Object | Returns | Used by |
|---|---|---|
| `facts.pulse_daily` (view) | long format, one row per (faculty, metric, date) for every metric id in `slos.json`: `faculty, metric, date, value, numerator, denominator, n, spend_zar, conversions, seed`. `value` = ratio for `chart: p`. Built from the `facts.fact_*` views per `slos.json reads`. Compliance metrics are daily 0/1 or counts. Should also offer rolling-7-day numerator/denominator for p-metrics (NH-AD-06). | W32 Series |
| `ops.judge_samples(date)` | one row per rubric (`whatsapp-conversation, comment-reply, pre-call-brief, report, creative, landing-page`, plus a seventh, `lead-pulse`, which W33 builds itself from `public.lead_pulse` (thumbs down, last 24 h, cap 10; no identity). W33 casts `samples` with `to_jsonb()` so both branches of its UNION are jsonb): `rubric text, samples jsonb[]`. Counts per 4.15: 20 conversations (stratified: >= 5 free text, >= 3 trips or handoffs, all live-flagged), 20 public replies, 5 briefs, every report, every new creative (24 h), the live page audit (axe + Lighthouse + page text + build sha). Text is redacted; each sample has `sample_ref`, `author`, and the evidence its rubric lists (flow state, booking row). Excludes anything authored by the advisor or the judge. | W33 |
| `ops.proposal_actuals(date)` | rows for proposals with `status in ('approved','done')`, `check_date <= date`, `verdict is null`: `proposal_id uuid, faculty, title, metric, forecast, baseline, actual, n, limits, test, kill_rule, check_date`. Numbers computed in SQL, not by the model. | W33 grading |
| `ops.notifications_due()` | `id, to, stage ('resend_other_partner' at >= 2 h unacked Red, 'call' at >= 4 h, 'reminder' at >= 24 h unactioned approval), what, impact, first_action, title, moves, cost_zar, grade, owner_agent, proposal_id` | W32 escalation |
| `ops.alert_recipients` | `wa, email, ops_email, name, pnid` for the two admins plus the SortMyCover `phone_number_id` | W32 sends |
| `ops.build_state_latest` | `commits_24h, tests_failing, tests_failed_twice, gates_oldest_hours` (written by the orchestrator Makefile/CI) | W32 Build line |
| `ops.settings` | `usd_zar, wa_graph_version, opt_daily_cap_zar, opt_weekly_cap_zar, twilio_sid, twilio_voice_from, build_active` | caps, sends |

## Write objects (the advisor's own tables only, 4.15)
`ops.pulses, ops.signals, ops.proposals (status proposed; Approve/Snooze/Decline update it), ops.notifications, ops.optimisation_memos, ops.quality_grades, ops.judge_runs, ops.costs (kind llm)`. The Approve branch additionally appends one node to `build/tasks.json` (see NH-AD-03).

## Mount points assumed by the workflows
`/home/node/repo` = the repo checkout (read `build/tasks.json`; write only in the Approve branch). Both workflows call each other over `http://127.0.0.1:5678/webhook/...` with the header-auth credential `n8n webhook secret (SMC)`.
