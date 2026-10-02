# Test log (CXL method: one variable at a time, >= 200 conversions per arm or 14 days, whichever first)

Nothing is live, so nothing is judged yet. Only about a third of tested changes win: report lift with a confidence interval, not just the winner.

| # | Test | Variable | Arm A (control) | Arm B | Switch | Primary metric | Status |
|---|---|---|---|---|---|---|---|
| T1 | Quiz-first vs form-first | step order | Quiz then details (this build) | Details first, quiz after | needs a second template (not built; PR with evidence) | page conversion to submitted lead | not started |
| T2 | Booking on page vs WhatsApp-only | `booking` in `config/site.json` (`data-booking`) | true | false (skips slots, goes to not-booked thank-you) | build two dists, split by ad set | submit -> booked, and cost per attended meeting | ready to run |
| T3 | Hero image | image | none (text hero, this build) | family image / adviser-neutral scene | needs a hero image asset <= 120 KB WebP | page conversion at equal LCP | blocked on visual-producer asset |
| T4 | Budget band wording | `budget_band` labels | "Under R500 ... R1 250 or more" | alternative wording from creative-strategist | edit template copy | quiz completion and qualified share | not started |

Format for results: arm, visitors, conversions, rate, relative lift, 95% interval, decision.
