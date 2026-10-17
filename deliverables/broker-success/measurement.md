# Measurement: broker onboarding and report (broker-success)

| Measure | Definition | Target | Source | Action if missed |
|---|---|---|---|---|
| Onboarding complete within 48 h of first login | `onboarding_completed_at - first_login_at <= 48 h` (steps 2-6 done) | 100% of brokers after #1; broker #1 is assisted | `brokers`; W20 stamps `sla_48h_missed_at` | Jonathan sees the stall; the step that stalled most gets its copy or clip rewritten |
| Support calls | Calls or support messages per broker during onboarding (`support_events`, any channel) | **0 calls**; messages tracked | Help page, WhatsApp replies to W20, howzit@ | Top 3 topics each month decide the next clip or copy fix; re-render the explainer on the top 3 questions |
| Step completion rate and time per step | Share done, minutes from previous step | Video 90% watched; FSP first-try pass; calendar first-try connect | `onboarding_progress` | Admin-consent rate is the 0.3 #4 risk: if above 20% make the shared-calendar option more prominent |
| Nudge effect | Steps completed within 24 h of a nudge | Tracked | W20 timeline | If under 30%, change the wording, not the frequency (no third nudge) |
| Disposition rate | dispositions / attended meetings | **>= 90%** | `outcomes` | Report ask `mark_outcomes`; two unconfirmed in a cycle: Jonathan calls |
| Time to mark | Meeting end to outcome tap | Median under 3 h | `outcomes.marked_at` | 3-h WhatsApp nudge (W12) |
| Report opened | WhatsApp read, portal view (`opened_portal_at`) or email open, within 24 h of send | >= 80% of Mondays | `reports`, WhatsApp receipts | Unopened two weeks running: Jonathan calls (renewal-risk input) |
| One-ask done | `ask_done_at` within 7 days | >= 50% | `reports` | Rotate the ask wording; check the deep link lands on the right screen |
| Intro media | Step done within 48 h; show rate video vs voice vs none | Owned by intro-media-producer | `broker_media` | Their plan: 100 bookings |

Reporting: weekly in the console under Broker. Every measure is by broker and as a rolling average. Policies written (broker-reported) is never a measure of us and never enters a fee.
