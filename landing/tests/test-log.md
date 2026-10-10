# Test log (CXL method: one variable at a time, >= 200 conversions per arm or 14 days, whichever first)

Nothing is live, so nothing is judged yet. Only about a third of tested changes win: report lift with a confidence interval, not just the winner.

| # | Test | Variable | Arm A (control) | Arm B | Switch | Primary metric | Status |
|---|---|---|---|---|---|---|---|
| T1 | Quiz-first vs form-first | step order | Quiz then details (this build) | Details first, quiz after | needs a second template (not built; PR with evidence) | page conversion to submitted lead | not started |
| T2 | Booking on page vs WhatsApp-only | `booking` in `config/site.json` (`data-booking`) | true | false (skips slots, goes to not-booked thank-you) | build two dists, split by ad set | submit -> booked, and cost per attended meeting | ready to run |
| T3 | Hero image | image | none (text hero, this build) | family image / adviser-neutral scene | needs a hero image asset <= 120 KB WebP | page conversion at equal LCP | blocked on visual-producer asset |
| T4 | Budget band wording | `budget_band` labels | "Under R500 ... R1 250 or more" | alternative wording from creative-strategist | edit template copy | quiz completion and qualified share | not started |

Format for results: arm, visitors, conversions, rate, relative lift, 95% interval, decision.

## Lighthouse mobile — 2026-10-02 23:15 UTC (cloud sandbox, Chromium /opt/pw-browsers, lighthouse 13.5.0, simulated Slow 4G, 4× CPU)
Run with `landing/lighthouse.sh <slug>` against `http-server dist`. Budget: performance ≥ 90, LCP < 2,500 ms, CLS < 0.1, accessibility ≥ 95. All 10 pages PASS.

| page | performance | accessibility | LCP | CLS | TBT |
|---|---|---|---|---|---|
| employer-gap | 100 | 100 | 1,401 ms | 0.043 | 0 ms |
| new-bond | 100 | 100 | 1,401 ms | 0.043 | 0 ms |
| new-baby | 100 | 100 | 1,407 ms | 0.043 | 2 ms |
| turned-40 | 99 | 100 | 1,396 ms | 0.069 | 0 ms |
| self-employed | 100 | 100 | 1,362 ms | 0.043 | 0 ms |
| virtual | 100 | 100 | 1,403 ms | 0.043 | 0 ms |
| myth-bust | 100 | 100 | 1,399 ms | 0.043 | 0 ms |
| c13-check-not-buy | 100 | 100 | 1,403 ms | 0.043 | 0 ms |
| extended-family | 100 | 100 | 1,399 ms | 0.043 | 0 ms |
| what-the-call | 100 | 100 | 1,395 ms | 0.043 | 0 ms |

Notes: fonts self-hosted, pixel inert (no pixel id before GATE-PIXEL), consent_mode=named with [PLACEHOLDER] practice until the broker row is verified. turned-40 CLS 0.069 is the highest (hero image height reserve — within budget, watch after the real headshot lands). Re-run on the public URL after GATE-DOMAINS + hosting (S7-15 wants ≥ 90 on `go.`/`sortmycover.co.za`). Reports in `landing/reports/` (git-ignored). Quiz suite 9/9 the same run.

## I-32b first-party visit beacon — 2026-10-03
Lighthouse mobile new-bond: perf 100, a11y 100, LCP 1,473 ms, CLS 0.043. quiz.spec.ts 13/13 (2 new: beacon payload and steps, DNT/GPC/opt-out silent). automation/tests/visit-beacon.test.mjs 6/6, SUB + loader 33/33, egress-dryrun 44/44.
