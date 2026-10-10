# 08 Reports

**Route:** `/broker/reports` (opens the latest report; history by week and cycle). **Prototype:** `portal/prototype/reports.html` (templatised from the approved `docs/design/broker-weekly-report.html`; do not redesign). **Co-mandate:** broker-success owns the words, analytics-reporter owns the SQL (see `automation/W14-broker.md` for the payload). **Inspired by (4.10a):** Amazon narrative memos/WBR (the sentence first), NN/g dashboard usability (every number next to its target and last week; layout never changes), AgencyAnalytics/Databox client-reporting research (his goal, mobile, under two minutes), EverQuote/MediaAlpha agent reporting (delivered, quality, replacements, what he must do), Cialdini + Martin et al. (give something specific, ask for one specific thing).

## One report, three surfaces, same numbers from the same `reports` row
WhatsApp (6 lines, aggregates only) and email (full report + PDF) are specified in `automation/W14-broker.md`. **This page is where he acts:** all 8 sections, drill-down to each lead, outcome buttons inline, history, PDF, close-rate input.

## Sections, always in this order (numbers always **value . target . last week**)
1. **One line** (headline): "7 of 20 leads delivered, 5 booked, 4 showed up, 3 you rated a good fit. On track for the cycle." Sub: week of cycle, cycle end date, renewal-offer date, tier. If the week has nothing to act on, the line says so and section 7 is hidden.
2. **Progress:** delivered/committed bar (verified leads only), booked, attended with show rate, replacement requests this cycle (a plain count, no cap, no light), days left, extension status ("Cycle extension: none needed" or "Extended to {date} to deliver your committed leads"). **Traffic light only on show rate (green at or above the 65% target, amber 50-64%, red under 50%; the 50% line is the 3.4 alert). Replacements get no light: they are goodwill, max 3 requests per Calendar Week, so there is no cap to be "used of".**
3. **Your meetings:** last week's list with outcome and his disposition (first name and initial outside the portal; full name inside it); next week's booked calls with method and time; his to-dos (outcomes not yet marked with a one-tap "Mark now", good-fit follow-ups due, leads who said he did not reach them).
4. **Quality, in his words:** average rating this cycle, disposition mix (six bars, NH-19 labels), "ratings given" rate (target 90%), and the top 3 themes leads asked about before the call (from the pre-call-brief corpus; redacted, nothing health-related).
5. **What you'll notice** (only when true, one line each): a new ad angle in plain words ("more leads mentioning a bond"), a quiz change, a new contact method, public-holiday blocks. Never spend, CPL, creative names, or anything about other brokers.
6. **Your ROI view (voluntary, only he sees it):** inputs for close rate, policies written this cycle (his number), average commission (optional). Once a close rate is saved: "At {x}%, with {a} attended so far and {c} leads committed, this cycle is tracking to about {n} policies." with the arithmetic shown. Meetings-to-policies trend. Hidden until a close rate exists; **never a projection we invent**; never used in any fee, ranking or alert (FAIS).
7. **One ask:** the single most valuable thing he can do this week, with a one-tap button.
8. **Your cycle:** cycle end date, renewal-offer date, tier. Day-15 and cycle-end editions add the renewal offer (W19) and the full-cycle summary.

Footer row: History (Week 1 . Week 2 ...; cycle summaries), "Download PDF", "Sent on WhatsApp 07:00 . email 07:00 . opened here 07:12".

## Reads and writes
| Action | Table / column |
|---|---|
| Load | `reports` row for (`broker_id`, `week`); `payload_json` is the only source for numbers (the page computes nothing) |
| Page opened | `reports.opened_portal_at` (first view only) |
| One-ask button | Deep link per ask code (see W14-broker.md); sets `reports.ask_done_at` when the underlying action completes |
| Close rate / commission | `brokers.close_rate` (stored as a fraction), `brokers.avg_commission_zar` |
| Policies written (his number) | **Only via the RPC `smc_report_policies_written(p_count, p_cycle_id)`** (0-1000, own cycle, stored on `cycles`). It is **portal-only: never in `reports.payload_json`, the WhatsApp message, the email or any PDF, and never in a fee, ranking or alert** (NH-43, FAIS). The section 6 sentence "tracking to about N policies" is computed in the portal from his own inputs at view time, not stored in the payload |
| Mark outcome inline | Same function as My leads (`outcomes`) |
| Download PDF | Server-rendered from the same payload, A4, 2 pages; **one canonical PDF only: first name + initial, no policies-written section, the same file that is emailed and stored in `reports.pdf_url`** (NH-44 default). Full lead names are on screen in the logged-in portal view only. The button reads "Download PDF (first name and initial, safe to forward)" |
| Report not ready (before Sunday 23:00 run) | "Your first report arrives on Monday at 07:00." Empty weeks still produce a report (the one-liner says "No meetings this week") |

## UX rules (4.10a)
Grade 7 English; first person ("your meetings"); never "our funnel"; no CPL, EMQ, CAPI, attribution; under 2 minutes on a phone; consistent template; under 150 words before the first table; not "log in to see anything that fits in six lines" (the WhatsApp message carries the essentials).

## Step clip: "Your weekly report" (30 s)
| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | WhatsApp 6-liner, then the portal report | "Every Monday at seven you get this on WhatsApp, and the full report here." |
| 0:09 | Headline, progress numbers with targets | "The first line tells you how the week went. Every number shows its target and last week." |
| 0:18 | The one-ask button | "At the bottom there's one thing to do this week. Tap it and it's done." |
| 0:25 | ROI inputs | "Add your close rate if you like. It's for you only, and never changes your price." |
