# First-principles memo — creative-strategist (4B)

**Agent:** creative-strategist · Creative Director, direct response · **Date:** 2026-10-02
**Inputs (no new research, 0.1 Research status):** MASTER-PROMPT 0.1, 0.3, 1.1, 1.2, 2.1 (esp. 2.1.5, 2.1.6, 2.1.8), 3.2–3.5a, 4.2, 4B, 4D.2, 4D.4a, 4D.5, 6B.12; `build/inventory.md` §0, §4.1, §6; `src/pages/{Home,Pricing,Promotions}.tsx`, `src/components/{Hero,TrustBar,Footer}.tsx`; `deliverables/contracts-drafter/needs-human.md` (NH-CD-02, NH-CD-09).
**Cited sources:** only my five — Meta Andromeda creative guidance (A), Long-running SA financial ads in the Ad Library (A, primary), Jon Loomer (B), Unbounce reading-level data (B), Ethos/Ladder-style US DTC life ads (C, adapt). Hook-level numbers come from the prompt's own 4D.4a table, which is the given research for this build.

---

## 1. The irreducible goal (one sentence, with the numbers)

Every ad earns a click from a 35–50-year-old working parent at **raw CPL ≤ R200** and pre-filters so that **≥ 70% of raw leads qualify** (3.2), while no ad ever names a product, insurer, premium, cover amount or broker, or makes a second-person claim about the viewer's money, family or age.

Why these two numbers: at 70% qualify, break-even raw CPL is ~R468; at 60% it is ~R397 (3.2). The creative is the lever on both. The hook sets CPL. *Who the ad speaks to* sets the qualify rate (4.2 "Why it works").

## 2. Fixed constraints vs conventions

**Fixed (law, platform, physics, money). Not negotiable:**
| # | Constraint | Source |
|---|---|---|
| F1 | No advice, no product or insurer names, no premiums, no cover amounts, no comparisons, no "best/cheapest" | 1.2, 2.1.1, 2.1.6 |
| F2 | Meta personal-attributes policy: no second-person assertions about finances, debts, family, health, age or ethnicity. No cultural labels ("black tax" never in an ad) | 2.1.8 |
| F3 | Insurance ads target 18+. Age targeting may be removed (Special Ad Category check). So **the creative has to do the targeting** | 2.1.3, 2.1.4 |
| F4 | No fake testimonials, no fake people presented as clients, no fabricated statistics | 2.1.5 |
| F5 | Broker-neutral: one creative set for every broker. The broker's face and name appear only in the WhatsApp intro card | 1.2, 4.2 task 7 |
| F6 | Get 3 ads approved by Meta before producing the full 15 | 2.1.8 |
| F7 | Most Feed/Stories plays are sound-off → captions burned in, text on screen at 0.0 s | 4D.4a |
| F8 | Placement physics: 1080×1920 (safe zones: top 250 px, bottom 340 px), 1080×1350, 1080×1080 | 4D.4b.3 |
| F9 | Brand lock: SortMyCover wordmark with tick, amber #F5A623 / charcoal #1F2933 / off-white #FBF8F2, the line "Sort your cover. 30 minutes. A real adviser." used verbatim | 4D.4a, 4D.4b |
| F10 | Cycle-1 creative is code-rendered (HTML/SVG → Chromium/ffmpeg). No photoreal humans | 0.1, 4D.5 |
| F11 | Money: Bronze media ≈ R8.5k a cycle buys ~37–42 raw leads at R200. Kill rules run from R3,000 spend | 3.4, 3.5, 6B.12 |

**Conventions (what the category usually does). Each one is kept only if it beats the first-principles version:**
| Convention | Kept? | Reason |
|---|---|---|
| Price hook ("from R99/month") | **No** | F1. Price-led SA ads churn (Ad Library survivorship, A) |
| Everyday-spend anchor ("less than your DStv") | **Held** | Ethos pattern (C). 4.2 allows it only with compliance-qa + Jonathan sign-off → `needs_human`, not in the 15 |
| Fear / mortality shock | **No** | Fear-led SA ads churn (A). Also a Meta risk |
| Testimonials / social proof (H11) | **No, until real** | F4. Held until consenting real quotes exist |
| Family lifestyle photography | **No** | F10. Diversity comes from angle × format × motion instead |
| Close-up face in frame 1 (+4–10 pts hook, 4D.4a) | **No in cycle 1** | F5 + F10. Replaced by motion and text in the first 0.5 s (+3–8 and +4–9 pts) |
| Audience call-out (Ethos: "If you're 40 with kids…") | **Yes, adapted** | Third person and moment-based ("New baby. New bond.") so F2 holds. This is the qualify-rate lever |
| Objection-busting (fast / simple / no visit) | **Yes** | Ethos (C) + survives in SA ads (A). Angles 4 and 7 |
| Concrete number in the first 3 s | **Yes, limited** | 4D.4a (+31% for finance hooks with a number). Only multipliers, time ("30 minutes") and one flagged illustrative bond figure. Never a premium or cover amount |
| "Get a quote" CTA | **No** | Implies a premium. CTA family is "Check my cover" |
| Many variants of one winner | **No** | Andromeda (A) + Loomer (B): distinct angles find distinct audiences. Near-duplicates don't |

## 3. Mechanisms with A/B evidence (everything else is a hypothesis)

1. **The creative is the targeting** (Meta Andromeda, A). The ranking model reads the ad to decide who sees it. Seven angles mean seven audience clusters pulled from one broad target. → 15 concepts across 7 angles, at least 2 per angle, each a different idea, not a re-skin.
2. **Educational, gap-framed, plain-English angles survive; price-led and fear-led ones churn** (long-running SA ads, A, primary). → Every concept teaches one gap or one fact about the call, then offers the check.
3. **Controlled single-variable tests** (Loomer, B). → The 4D.4a matrix changes one thing per arm. The hook test is read on hook rate and CTR first (these reach a read in thousands of impressions), then on CPL and qualify rate.
4. **Grade 5–7 copy converts best in finance** (Unbounce, B). → Short sentences, one-syllable words, no jargon. Every primary text was checked at ≤ Grade 7 (hand-computed Flesch-Kincaid; max 4.3).
5. **Hook and hold physics** (4D.4a table, B): text on screen at 0.0 s, motion by 0.5 s, payoff promised in frame 1 and delivered by second 6, cuts every 2–3 s, one idea per video.

Hypotheses (C, to measure, not research): the Ethos "teach the gap" pattern works in SA; amber beats teal; video beats static for lead gen; the myth-bust claim holds up.

## 4. The simplest design that satisfies the fixed constraints

**One ad = one moment + one gap + one next step.**
- **Moment (the pre-filter):** a life event or situation that mostly happens between 35 and 50: a bond, a baby, turning 40, running a business, carrying a second household. Said in the third person or as a scene ("New baby. New bond. Same old cover?"). Never "you are…". This is how the ad filters for age without stating age (F2, F3).
- **Gap (the hook):** a fact that opens a question. Work cover is usually 2–4× salary. Bonds are often bigger. Cover set up years ago doesn't grow with the family.
- **Next step (the payoff):** "A licensed adviser can check it in 30 minutes, on video, WhatsApp or phone. Free to check. You decide after." Same promise in every ad, so the brand line is reinforced (F9).
- **CTA:** "Check my cover" family. End card: "Sort your cover. 30 minutes. A real adviser." + "Tap to check your cover".
- **Production:** kinetic type and animated gap bars on charcoal, amber for the one thing that matters in each frame, off-white body text. Two motion styles (kinetic type, gap bars) × three ratios. No faces.

The budget-level qualifiers (R750+ a month) are **not** in the ad. A premium band in an ad breaks F1. The form does that job. The ad's job is to bring people for whom the moment is real.

## 5. Assumptions register and kill criteria

| # | Assumption (grade) | Test | Metric | Read by |
|---|---|---|---|---|
| A1 | Gap-framed education (Ethos pattern, C) works for SA 35–50 | All 15 concepts live; compare angles | Raw CPL and qualify rate per angle | R3,000 spend (3.4) |
| A2 | H1 (C01) and H3 (C03) are the strongest hooks | 4D.4a matrix | Hook rate, hold, CPL, WhatsApp reply, booking | ≥ 2,000 impressions per arm for hook/hold; leads as volume allows (see `needs_human`) |
| A3 | Amber beats teal-on-cream (C) | Same ads, colour swapped | Hook rate, CTR | Week 1–2 |
| A4 | Video beats static for lead gen (C) | 4:5 video vs 1:1 static of the same concept | CPL, qualify rate | Week 2 |
| A5 | Virtual-convenience angles (C08, C09) bring lower-intent leads | Compare broker quality index by angle (4.12a) | Quality index, "not a fit" % | n ≥ 5 dispositions per ad |
| A6 | Extended-family angles (C06, C07) read as respectful | Comment sentiment (community-response-lead) | Negative-comment share | First 1,000 impressions |
| A7 | "Life cover costs less than most people think" can be substantiated | compliance-qa source check before C12 runs | Pass/fail | Before publish |
| A8 | Life-stage hooks pre-filter age without age targeting | Age band split from the form | % of raw leads in 35–50 per angle | R3,000 spend |

**Kill criteria — per ad (3.4, 4D.4a):** hook < 25% Feed / < 30% Reels or hold < 35% after 2,000 impressions → replace in the next batch. After R3,000 spend: raw CPL > R250 or qualify < 60% → pause the bottom 50%. Broker quality index < 2.5 or "not a fit" > 40% (n ≥ 5) → pause, whatever the CPL.

**Kill criteria — for this design:** if by **day 14** no angle reaches raw CPL ≤ R250 with qualify ≥ 60%, the "teach the gap" thesis is wrong for this audience. Then: (a) escalate to Jonathan (3.4), (b) put the held everyday-spend anchor up for sign-off, (c) trigger the Flow photo-scene experiment if hook rate < 30% (4D.5). Speed of truth is the mitigation for the one risk the research can't remove (6B.12): distinct angles make CPL readable by angle from day 1.

## 6. Deliberately not built (and why)

- **Price hooks and the DStv anchor.** F1. The anchor is held for sign-off (4.2).
- **H11 social-norm hook and any testimonial.** F4. Comes back only with real, consenting quotes.
- **H12 payslip checklist.** Kept in reserve for the 2–3-week refresh (4.2 volume note). It fits the gap angle, which already has its 2.
- **Faces, photography, AI people.** F5, F10.
- **Per-broker creative.** F5. One set serves every broker.
- **Retargeting and lookalike-specific creative.** Andromeda reads the ad. Audience tweaks aren't the lever.
- **Afrikaans (CoverKlaar) versions.** Phase 6 (6B.11).
- **An Ad Library scan.** That is production work (4.1), not this task.
- **Hooks in the library that break a fixed rule as written.** Adapted, not used verbatim: H3 (9 words, implies the viewer's bond), H5 (12 words, "you've"), H6 (11 words), H7 ("your family"). Each adaptation is noted in `concepts.md`.
