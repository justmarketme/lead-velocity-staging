# Creative test matrix: cycle 1 and cycle 2 (reconciled with media-buyer)

**Owner:** performance-creative-director (design and the reading). media-buyer (build and delivery). analytics-reporter (numbers). **Date:** 2026-10-02 · **Status:** DRAFT. Nothing is published.
**Basis:** 4D.4a test matrix; `deliverables/media-buyer/campaign-spec.md` §4.4–4.5 and §11; **NH-22 (d) default: cycle 1 tests colour on H1 only.** If Jonathan instead picks the full 2×2 on H1 and H3, the cycle-2 arms below simply start on day 1, and nothing else changes.

## Why it is cut down (the arithmetic)
Campaign A runs at R350/day, which is about 50 raw leads a month across all ads (campaign-spec §4.5). The full 4D.4a matrix has 8 arms. At ≥ 30 leads per arm, that needs ~240 matrix leads, which is 5+ cycles. One variable on one hook (2 arms, ~60 leads) is the only design that can conclude inside cycles 1–2. Loomer's method is one variable at a time. Andromeda still gets its diversity from the other 8 ads.

## Cycle 1: what goes live (Campaign A, one ad set, max 10 ads)
| Step | Ads (`C{nn}_{H#}_{fmt}-{col}_{upload}`) | Role |
|---|---|---|
| **1. First-submit trio (2.1.8: 3 approved before the batch)** | `C01_H1_vid-amb`, `C03_H3_vid-amb`, `C14_H10_vid-amb` | Together these clear the three riskiest patterns with Meta: a number in the hook (C01), a life-event scene (C03) and the plain explainer with UI mocks (C14). If all three pass, the other patterns are lower risk |
| **2. Matrix arm (after the trio is approved)** | `C01_H1_vid-teal` | The only colour twin in cycle 1. It is identical to `C01_H1_vid-amb` except for the palette |
| **3. Diversity set (after the trio is approved)** | `C04_H4_vid-amb`, `C05_H5_vid-amb`, `C06_H9_vid-amb`, `C08_H6_vid-amb`, `C10_H7_vid-amb`, `C13_H16_vid-amb` | One ad for each remaining angle, so all 7 angles are live (Andromeda: distinct creatives find distinct audiences) |
| **Pool (rendered, not live)** | C02 (H12 Variant B; H2 on hold), C07, C09, C11, C12 (H18; H8 on hold), C15, all stills, C01/C08/C12 6-s motion stills, C04 carousel | Replacements and the week 2–3 refresh |

Total live: **10 ads** (the campaign-spec cap). All are video. Each video ad carries its 9:16 for Reels/Stories and its 4:5 for Feed through placement asset customisation, so hook and hold rates exist for every ad.

### The one cycle-1 comparison
| Arm | Ad | Variable | Held constant |
|---|---|---|---|
| A (incumbent) | `C01_H1_vid-amb` | amber on charcoal | hook, copy, timeline, motion, length, form A1, ad set, placements, upload day |
| B (challenger) | `C01_H1_vid-teal` | teal on cream | same |

**Upload both on the same day and never edit either one.** An edit resets the comparison.

## Metrics (per arm, and per placement where Meta splits them)
| Metric | Definition | Target / read |
|---|---|---|
| **Hook rate** | 3-second video plays ÷ impressions | **≥ 30% Reels, ≥ 25% Feed** |
| **Hold rate** | ThruPlays ÷ 3-second video plays (ThruPlay = 15 s, or completion if shorter). This definition is proposed; analytics-reporter confirms it in the console | **≥ 35%** |
| CTR (link / form open) | form opens ÷ impressions | context |
| **Raw CPL** | spend ÷ instant-form leads | model R200; R250 is the 3.4 trigger |
| Qualify rate / cost per qualified lead | verified qualified ÷ raw | the headline number (campaign-spec §13) |
| **WhatsApp reply rate** | leads who reply or tap within 72 h ÷ raw leads (= verified %) | context |
| **Booking rate** | bookings ÷ verified leads | context |
| Broker quality index | W29, once n ≥ 5 dispositions | the 3.4 / §11.1 pause rule |

## Decision rules
1. **Leading read (no kill):** once each arm has ≥ 2,000 impressions, compare hook, hold and CTR. This informs the **next batch** only (campaign-spec §4.5). It never pauses an arm.
2. **Verdict:** only at **≥ 30 leads per arm**. Teal wins only if its cost per qualified lead is **≥ 20% lower** and its hook rate points the same way. **Any smaller difference, or a split signal, means amber stays.** The incumbent keeps a tie because it is the asset already being built (Binet & Field: consistency compounds). Switching colour resets recognition.
3. **If teal wins:** the palette page changes. The tick shape, wordmark, type and line do not (brand-bible §colour). Every concept is re-rendered in the new palette in one batch, never piecemeal.
4. **Delivery skew:** Meta will not split delivery evenly inside one ad set. If either arm gets < 25% of the pair's impressions over 7 days, the comparison is recorded as **inconclusive** for that week. → **NH-PCD-06 (media-buyer):** either accept this, or run the C01 pair as a Meta A/B test (two ad sets, even split) once Campaign A has ≥ 30 leads. My recommendation is to accept for cycle 1 and decide at cycle-1 close.
5. **3.4 wins over the matrix.** If the R3,000 rule pauses an arm, that arm is recorded as "inconclusive" and re-run in the next batch (campaign-spec §4.5).
6. **Expected timing, honestly:** the pair will draw ~20–30% of ~50 leads, which is 10–15 leads in cycle 1. The verdict lands in **cycle 2 or 3**. Cycle 1 delivers the leading read.

## Replace-after-2,000-impressions rule (every live ad, not only the matrix)
Any ad below hook **30% (Reels) / 25% (Feed)**, or below hold **35%**, after **2,000 impressions** is marked for replacement **in the next batch**, not paused mid-flight. Its replacement covers the same angle:
| Live ad | Replacement from the pool |
|---|---|
| C01 (either arm) | none. A matrix arm is never swapped mid-test. If **both** arms fail, the test is stopped and C02 (H12) takes the H1 slot |
| C03, C04, C05 (trigger) | No pool reserve. creative-strategist writes a new trigger concept for the week-2 batch (marriage or job change, both from the 1.1 trigger list) |
| C06 | C07 |
| C08 | C09 |
| C10 | C11 |
| C13 | C12 (H18) |
| C14 | C15 |
**Week-3 Flow trigger (4D.5):** if the best two creatives are below 30% hook rate, or frequency is > 3 with CPL rising for 7 days, the Flow photo-scene experiment is proposed to Jonathan. It is not switched on automatically.

## Cycle 2 (waits for cycle-1 data; only one new variable at a time)
| Test | Arms | Hook | Reads | Notes |
|---|---|---|---|---|
| **Static vs video** (4D.6 C-claim: "video beats stills for lead gen") | `C01_H1_sta-{col}` (4:5 + 1:1) vs `C01_H1_vid-{col}` | H1 | CTR, raw CPL, cost per qualified lead, reply, booking. Statics have no hook or hold rate | `{col}` = the colour that is leading, or amber if the colour test is inconclusive. The static is already rendered (C01.md) |
| **H3 into the matrix** | `C03_H3_vid-teal` (+ `sta-amb`/`sta-teal` if Jonathan accepts the full matrix under NH-22 d) | H3 | same as cycle 1 | Teal twin rendered only if Jonathan keeps this arm |
| "UGC-style beats polished" (4D.6 C-claim) | **Not in cycle 2.** It needs real, consenting people on camera (no AI humans). It goes to the backlog with the Flow experiment as the nearest permitted proxy | | | |
Everything else waits for ≥ R20k/month media (4D.4a).

## Naming reconciliation with campaign-spec (media-buyer to update §4.4 and §4.5)
| campaign-spec has | Should be | Why |
|---|---|---|
| Trio `C01_H1_sta-amb`, `C01_H1_vid-amb`, `C02_H3_vid-amb` | Trio `C01_H1_vid-amb`, `C03_H3_vid-amb`, `C14_H10_vid-amb` | Concept numbers come from concepts.md (H3 = **C03**). C14 is the third pattern. The C01 static adds no new policy pattern |
| 8 matrix ads `C01_H1_*`, `C02_H3_*` | 2 ads in cycle 1 (`C01_H1_vid-amb`, `C01_H1_vid-teal`). H3 arms move to cycle 2 as `C03_H3_*` | NH-22 d default |
| Diversity `C03_H10_vid-amb`, `C04_H5_vid-amb` | `C14_H10_vid-amb` (now in the trio), `C05_H5_vid-amb`, plus C04, C06, C08, C10, C13 | Concept numbers. One ad for each remaining angle, still ≤ 10 live |
| H3 text "Just got bond approval? Read this before the champagne." | "Bond approved. Champagne open. Cover checked?" | hook-library-v2 (2.1.8 + 8-word limit) |
| A2 carousel card 2 "Most bonds don't." | "The bond and the bills don't." | NH-PCD-01 |
| `{format}` = `{sta\|vid\|car}-{amb\|teal}` | add `mot` (6-s motion still). File names add the ratio: `…_vid-amb-9x16_{render}` | `_production-spec.md` |
