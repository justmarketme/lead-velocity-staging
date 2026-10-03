# Quarterly drill calendar (S7-05 drills_scheduled)

Owner: Jonathan (runs), KG (second pair of eyes), compliance-qa (writes the note). Set 2026-10-03. All times Africa/Johannesburg, Thursdays 10:00, 90 minutes. Each drill ends with a dated note in `deliverables/compliance-qa/drills/` (or `build/evidence/`), gaps become tasks, and the obligations register row P14 is updated.

| Quarter | Breach (P14, desk) | Restore (backup to clean server) | Failover (n8n/VPS down, fallbacks) | Red-team (abuse of public surfaces) |
|---|---|---|---|---|
| Q4 2026 | **2026-10-03 done, see `breach-drill-P14-2026-10-03.md`** | 2026-11-12 (only once W26 backups exist; if no VPS yet, move to 14 days after the first nightly backup and log why) | 2026-12-03 | 2026-12-10 |
| Q1 2027 | 2027-01-21 | 2027-02-11 | 2027-03-04 | 2027-03-11 |
| Q2 2027 | 2027-04-22 | 2027-05-13 | 2027-06-03 | 2027-06-10 |
| Q3 2027 | 2027-07-22 | 2027-08-12 | 2027-09-02 | 2027-09-09 |

## What each drill proves (pass = every line true, evidence saved)
- **Breach.** New synthetic scenario each time. Containment inside 1 h, assessment inside 24 h, Regulator and subject drafts ready inside 72 h (internal target), brokers told inside 24 h (agreement 9.8), `incidents` row timestamps filled. Gaps from last drill closed.
- **Restore.** Latest off-server backup restored to a throwaway server with synthetic-safe verification: row counts match, `suppression` and `consent` rows present, secrets not in the backup, time-to-restore recorded (target set at first run).
- **Failover.** n8n stopped for 30 min on staging: first-touch fallback, W22 alert to both phones, no lost lead, webhook retries replayed once, nothing sent twice.
- **Red-team.** Against staging only: form spam past Turnstile and rate limit, forged webhook signatures (Meta, WhatsApp, Paystack), broker A reading broker B's leads, STOP bypass, PII in logs, secrets in repo (secret guard). Findings graded; critical blocks go-live changes.

## Rules
- A missed drill is logged as overdue on the obligations register (`due_at` set on the date above) and shown on the console.
- Calendar invites to Jonathan and KG are NOT yet created (no sends in this session). Action: Jonathan to add the 16 dates above as recurring invites. Until then this document is the schedule of record.
- The compliance register (Part 3 step 9, P14) says "twice a year"; this calendar is stricter (quarterly). Register wording to be updated to match.
