# First-principles memo: performance-creative-director (4B)

**Date:** 2026-10-02 · **Cited sources:** only my five: Meta creative docs (A), Jon Loomer (B), Binet & Field (B), Harry Dry / Marketing Examples (C), Meta Ad Library, SA finance (A, primary). The numbers come from the 4D.4a tables, which are the given research. No web research was done.

**1. Goal (one sentence):** every live ad holds **hook ≥ 30% (Reels) / ≥ 25% (Feed) and hold ≥ 35%**, and earns a **cost per qualified lead ≤ R250**, while being unmistakably SortMyCover in every frame and never breaking 2.1.5 or 2.1.8.

**2. Fixed versus convention.**
- **Fixed (law, platform, physics, money):**
  - No "you/your" claims about money, family, age or health (2.1.8).
  - No fabricated statistics. No AI people presented as real (2.1.5).
  - No premiums, cover amounts, insurer or broker names (1.2).
  - Most plays are sound-off, so the first frame and the captions carry everything (Meta).
  - Reels safe zones are top 250 px and bottom 340 px.
  - Three ads must be approved before the batch.
  - Cycle 1 is code-rendered with no humans (0.1).
  - Media is about R350/day, roughly 50 leads a month.
- **Conventions, and what I decided:**
  - **Faces in frame 1** (+4–10 pts): not available in cycle 1. Replaced by text at 0.0 s plus motion by 0.5 s (+4–9 and +3–8 pts).
  - **Lifestyle photography:** dropped. Diversity comes from angle × motion style.
  - **The 2×2 colour × format matrix:** cut to one variable, because the budget cannot fill it.
  - **"Most X" statistics in hooks:** kept only when sourced.

**3. Mechanisms I build on (the rest are hypotheses).**
- **First frame carries the message** (Meta, A). Every hook is legible at 0.0 s and ≤ 8 words.
- **Named problem beats curiosity gap** (Loomer, B). This is why H3's "One thing left" became "Cover checked?".
- **Concrete beats abstract** (Harry Dry). This is why H5 became "Cover set up at 28. Life at 40." and why C01's bond amount is a blank to fill in rather than an invented figure.
- **Distinctive assets on every frame; one human truth per concept** (Binet & Field). Tick on every frame, one amber thing per frame, the line verbatim, and a stated human truth at the top of every brief.
- **Survivorship** (Ad Library, A): educational, plain, gap-framed creative persists. Price-led and fear-led creative churns. This is why the DStv anchor is declined and there is no fear imagery.

**4. The simplest design that meets the goal:**
- **One system.** Charcoal field, one amber element, DM Sans 800 hook in the hook zone, one caption lane, tick top-left, the shared end card.
- **15 briefs feeding one 9:16 motion template.** Each brief is a timeline of rows (ON / visual / CAP).
- **Two motion styles** (kinetic type and gap bars).
- **Stills are the payoff frame.**
- **10 live ads**, one per angle plus the colour twin.
- **Colour is the only variable tested in cycle 1.**

**5. Assumptions and kill criteria.**
| # | Assumption (grade) | Measured by | Kill / change |
|---|---|---|---|
| P1 | Typographic motion can hit ≥ 30% hook without a face (B, extrapolated) | hook rate per ad at 2,000 impressions | Best two < 30% → propose the week-3 Flow experiment (4D.5) |
| P2 | Amber out-recognises teal in an SA finance feed (C) | C01 colour pair, ≥ 30 leads per arm | Teal ≥ 20% cheaper per qualified lead, with hook agreeing → switch the palette in one batch |
| P3 | Video beats stills for lead gen (C, 4D.6) | cycle-2 static vs video on H1 | Static cheaper per qualified lead → shift the Feed mix toward stills |
| P4 | Three-beat and checklist hooks hold ≥ 35% (B) | hold per ad | Below 35% → replace from the pool next batch |
| P5 | The "sorted" closing beat (box gets ticked) lifts hold or reply (C) | C03/C11 against the rest | No lift → drop the device and keep the end card |

**6. Deliberately not built:**
- **Flow prompt packs.** They are only needed if the week-3 trigger fires.
- **The "Sorted tick" character.** It is a cycle-2 option (4D.4a decision 4).
- **H11 testimonials.** Not until they are real.
- **Afrikaans variants.** Phase 6.
- **Per-broker creative.**

**needs_human raised (for the orchestrator to log; I did not edit `build/tasks.json`):**
- **NH-PCD-01 (compliance-qa).** The "2–4× salary" source must be on file before C01 is submitted. "Most bonds don't/are bigger" stays out until it is sourced. Rough affordability arithmetic says it may be untrue for most households. Copy changes are owed in concepts.md (C01) and in the instant-form A2 carousel.
- **NH-PCD-02 (compliance-qa → Jonathan).** C02 "R1.4m bond. 3× salary cover." Is "3× salary cover" a cover amount? The default is H12 Variant B.
- **NH-PCD-03 (creative-strategist).** C03 primary text: "most new owners skip" and "they never check" are unsourced.
- **NH-PCD-04 (compliance-qa).** H8 "costs less than most people think" has no source. The default is H18.
- **NH-PCD-05 (Jonathan).** The DStv anchor: my recommendation is decline (it implies a premium and pulls below-band budgets).
- **NH-PCD-06 (media-buyer).** Colour-pair delivery skew in one ad set: accept for cycle 1, or move to a Meta A/B test later.
- **Linked, not new:** the NH-22 (d) default is applied here. The teal tokens, the 4:5 end card and the motion template are owed by visual-producer (look-rules.md). The hold-rate definition needs analytics-reporter to confirm. The campaign-spec renaming is owed by media-buyer.
