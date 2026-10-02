# media-buyer — first-principles memo (4B protocol)

Author: media-buyer (Head of Paid Social). Written from MASTER-PROMPT only (0.1, 0.3, 2.1, 3.1–3.5, 4.4, 4.4a, 4.4b, 4D.4a, 6.2, 6.3, 6B.12) and `automation/capi/event-spec.md`. No new research. Date: 2026-10-02.

## 1. Irreducible goal (one sentence, with the number)
Buy the cheapest verified, qualified, 35–50 life-cover lead who will actually attend a call with a licensed adviser: **cost per qualified lead <= R250 at 14 days, trending to <= R200**, measured per ad, and judged on cost per attended meeting once volume allows.

## 2. Constraints

**Fixed (law, platform, physics, money)**
| Constraint | Source |
|---|---|
| Ads educational only; no product/insurer/premium/cover amount/comparison/broker; third-person copy; 18+; 3 ads approved by Meta before the full batch | 1.2, 2.1.8, 2.1.3 |
| Opt-in consent, unticked, privacy link; exact consent text and version stored; out-of-band submissions deleted within 24 h; no contact without consent (so form-abandoners can never be messaged) | 2.1.2, 2.1.7 |
| Special Ad Category must be checked at campaign creation and declared honestly; design must work without age targeting | 2.1.4 |
| Meta may ask for licensing proof; fallback = broker's Page + authorisation letter, then stop and escalate | 2.1.3 |
| Conversion Leads optimisation needs >= 200 leads/month; we make ~25–50 | 4.4 |
| Native instant forms cannot book a slot; WhatsApp must contact within 60 s | 4.4, 4.6 |
| Unit sold = qualified lead, counted only once verified on WhatsApp within 72 h | 0.1, 3.3 |
| Money: R16,500 Bronze all-in; media share per tier from `pricing`; nothing spent before first payment; budget changes, publish and payment are human gates; Jonathan enters payment details | 0.1, 2.2, 3.5, 3.6 |
| Pre-decided: no panic changes before 14 days unless an SLO burns; kill rules from R3,000 | 0.3 #13, 3.4 |

**Conventions (what the industry usually does; kept only if cheaper or better evidenced)**
Interest stacks and many ad sets; separate campaigns per audience; landing page as primary; raw CPL as the scorecard; lookalikes from day 1; boosting; retargeting every abandoner; day-by-day bid tweaks.

## 3. Mechanisms with evidence (grades from 4.4)
| Mechanism | Grade | Used how |
|---|---|---|
| Platform rules define what is possible; Leads + CAPI stages, not Conversion Leads | A | Optimise on `Lead`; send `Qualified`/`Attended`/`GoodFit` offline |
| Downstream stage feedback via CAPI/offline events teaches Meta which clicks become meetings | A | W12/W29 daily upload; seeds for 4.4b lookalikes |
| Consolidation + broad targeting + creative diversity beats fragmented ad sets (Loomer; Andromeda) | B | One broad ad set per campaign; creative is the targeting |
| Quality, not CPL, is the scorecard (AdFirm/LeadSync lens); instant form beats website form on cost per qualified lead in two documented tests, provided contact < 60 s and junk is filtered | B | Campaign A primary; cost per qualified lead and per attended meeting drive budget |
| Minimum sample before judgment; about a third of changes win (CXL) | B | R3,000 before any judgment; >= 30 leads per arm for tests; no day-2 changes |
| Higher Intent form adds a review step (fewer accidental submits); Rich Creative is vendor-only | A / C | A1 Higher Intent primary; A2 Rich Creative tested, not assumed |

Everything else (CTWA beating forms; landing page ~3x qualified rate; lookalikes beating broad at small budgets; amber beating teal) is a hypothesis to measure, not to research.

## 4. Simplest design that satisfies the fixed constraints, vs convention
**Design:** one Page (SortMyCover), one Pixel/dataset, one campaign (A: Leads, instant form, Higher Intent) with one broad ad set (SA, Advantage+ audience, age 35–50 as set where Meta allows), 8–10 ads in a controlled colour x format x hook matrix, exclusions of everyone already in the funnel, qualifying questions and conditional logic so junk never enters the automation, `Lead` as the optimisation event, `Qualified`/`Attended`/`GoodFit` fed back by CAPI. B (quiz landing page) and C (CTWA) are built, paused, and switched on by trigger, not by calendar.

| Convention | Kept? | Reason |
|---|---|---|
| Instant form as primary | Kept | Cheaper cost per qualified lead in both documented tests, conditional on < 60 s contact (our WhatsApp flow) and junk filtering (Higher Intent + qualifying questions + number validation) |
| Landing page as primary | Not kept; funded test (B) | Higher CPL; one data set shows ~3x qualified rate, so it earns a test, not the default |
| Raw CPL scorecard | Dropped | Cost per qualified lead and per attended meeting only |
| Many segmented ad sets / interest stacks | Dropped | Fragments learning at ~R350/day |
| Age 35–50 hard targeting | Kept as "where allowed" | Cheaper than paying for junk; but the form's age routing does the real filtering, so the design survives Special Ad Category |
| Exclusion audiences | Kept | Cheaper than re-reaching people already in the funnel |
| Lookalikes | Deferred (Phase 3 gates) | Seed quality beats size; seeds do not exist yet |
| Retargeting | Deferred (Phase 2); Meta audiences only | Needs >= 1,000 pixel audience; no direct contact ever |

**Arithmetic check that changes how rules are read (3.2, 3.4):** cost per qualified lead = raw CPL / qualify rate. At the 3.2 target (raw CPL R200, qualify 70%) that is R286; at R200 and 65% it is R308. The true north (<= R250) needs raw CPL of about R175 at 70% or R163 at 65%, and verification (WhatsApp reply within 72 h) lowers the qualified rate further. The 3.4 raw-CPL kill line (R250) equals roughly R357–R385 per qualified lead, close to the R400 escalation line. So the console must lead with cost per qualified lead, never raw CPL, and the first realistic lever is the qualify rate (form routing, creative call-outs), not the bid.

## 5. Assumptions register and kill criteria for the design
| # | Assumption (C/D grade) | Test | Metric | Decide by |
|---|---|---|---|---|
| A1 | Raw CPL R200–R500 in SA financial services | Live from day 1; pulse tile "CPL vs model" | raw CPL, cost per qualified lead | R3,000 spend; day 14 |
| A2 | Qualify rate >= 60–70% | Qualified/raw by origin | qualify % | R3,000 spend |
| A3 | Higher Intent form lowers junk without killing volume | A1 vs A2 (Rich Creative) on the same winning creative, equal budget | raw CPL, qualify %, reply rate; >= 30 leads/arm | Cycle 2 (needs volume) |
| A4 | Qualifying-question routing stops junk entering automation and Meta does not count routed-out people as `Lead` | Test leads in staging (routed-out, in-band) and check Leads Center + Events Manager | Lead count vs submitted | Before publish |
| A5 | Amber beats teal; video beats static (4D.4a) | Matrix on H1 and H3, pooled by colour and by format | hook, hold, raw CPL, reply, booking; >= 30 leads/arm | Cycle 1 end; likely extends to cycle 2 |
| A6 | Advantage+ audience treats age as a suggestion, so out-of-band share may be high | Out-of-band submission % | % routed out | Day 14; if > 30%, A/B Original audience hard 35–50 (single variable) |
| A7 | CTWA beats forms on cost per qualified lead (vendor-grade) | Test C when triggered | cost per qualified lead, reply rate | >= 30 leads/arm |
| A8 | Lookalikes beat broad | LAL-Q 1% vs broad at equal creative/budget | cost per attended meeting | Per 4.4b gates |

**Kill criteria for this design (if true, this design is wrong; do the action):**
- After R3,000: raw CPL > R250 or qualify rate < 60% -> 3.4 action (pause bottom 50% of creatives, tighten questions, new batch).
- Day 14: cost per qualified lead > R400 -> stop, escalate to Jonathan.
- Qualify rate < 50% for the instant form -> switch on Campaign B (4.4 trigger) and tighten routing.
- Meta asks for licensing proof or restricts the account -> stop all spend, escalate, 2.1.3 fallback.
- Show rate < 50% for 14 days -> not an ads fault first; review reminders and qualification (3.4), do not cut ad spend on that signal alone.

## 6. Deliberately not built
Interest-stacked or 20-ad-set structures; boosted posts; Conversion Leads optimisation (volume gate); retargeting or messaging anyone who did not submit with consent (audience-only, Phase 2, never contacted); marketing-category WhatsApp blasts; lookalike campaigns before seed gates; day-2 budget or creative panic changes; separate campaigns per concept or per audience; offsite landing-page-first strategy; Google Flow creative (not mine; 4D.5); any ad copy, hooks or imagery (creative-strategist and visual-producer own those; I only specify structure and the test matrix).
