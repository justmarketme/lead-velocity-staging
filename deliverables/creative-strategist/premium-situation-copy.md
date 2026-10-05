# SortMyCover — 6 premium-situation ad variants (P01–P06)

**PROPOSAL — not published; needs Jonathan's yes (NH-66).**
Owner: creative-strategist · Date: 2026-10-05 · Inputs: `docs/research/high-premium-client-meta-targeting.md` (allowed/forbidden copy table), `deliverables/media-buyer/sa-affluent-targeting-map.md`, cycle-1 concepts C01–C15 (`concepts.md`) for voice and visual styles.

## Rules applied
- Third-person situation copy only. It describes a situation (bond, school fees, two incomes, own business, partners), never the viewer. No "you earn", "high earners", "affluent", no income or wealth figure, no rand amount, no price, no cover amount.
- No "guaranteed", no benefit or price promise, no product or insurer name (no "buy-and-sell" or "key-person" product wording). FAIS-safe: "a licensed adviser can look at the real numbers" is the whole offer. No advice, no recommendation.
- SortMyCover is the brand. The broker is not named and no broker face is used.
- Hook ≤ 8 words, primary text ≤ 125 characters, headline ≤ 40 characters. Grade 5–7 or lower. No exclamation marks.
- Visuals reuse the existing code-rendered templates (HTML/SVG, charcoal and amber, no people). Only the words change. Each variant keeps the cycle-1 end card ("Sort your cover. 30 minutes. A real adviser.") and the 9:16, 4:5 and 1:1 layouts of the template it reuses.
- CTA for all six: **Check my cover** (button `LEARN_MORE`, never `GET_QUOTE`).

## The six variants

| ID | Hook (words) | Primary text (chars) | Headline (chars) | CTA | Reuses visual template | Compliance note |
|---|---|---|---|---|---|---|
| **P01** | Bond, school fees, bills. One salary. (6) | Some families carry a bond and school fees on one salary. An adviser can look at the real numbers. Free to check. (113) | Bond and school fees: check the gap (35) | Check my cover | **C01** style G (short amber bar vs long outlined bar), labels changed to "One salary" vs "Bond + school fees + bills" | "Some families" is third person; no income figure; "check the gap" echoes approved C01 wording. |
| **P02** | Two incomes. Kids. One bond. (5) | Many households run on two incomes and one bond. A licensed adviser can check how it all fits. Free, 30 minutes. (114) | Two incomes, one bond, one check (32) | Check my cover | **C05** style G (growth frame): amber box stays small, outer frame grows with "bond", "kids", "school" | Describes a household pattern, not the viewer; "two incomes" is not an income level; no age or family claim to "you". |
| **P03** | A business owner has no HR to ask. (8) | Business owners have no employer cover to read. An adviser can look at what is in place. Free to check. (104) | Own-business cover: what is in place (37) | Check my cover | **C10** style K (three nos), swap lines to "No payslip cover line. No HR. No group scheme." | Third person "business owners"; states a fact about group cover (no unsourced "most/often"); no product named. |
| **P04** | Business partners: if one cannot work? (6) | Partners can plan for the day one of them cannot work. A licensed adviser can talk it through. Free to check. (108) | Partners: plan for one being out (32) | Check my cover | **C06** style G (two outlines joined by one amber line), relabelled "Partner A", "Partner B", line "the business" | Self-selects owners with no claim about the viewer; no "buy-and-sell" or any product named; no fear imagery. |
| **P05** | School fees run for twelve years. (6) | School fees come due every year, for years. A licensed adviser can look at how the income behind them is covered. (112) | School fees run for years. Check. (33) | Check my cover | **C03** style K checklist: "☑ Place at school", "☑ Fees paid this year", "☐ Income behind it checked?" (last box amber) | Factual (Grade 1–12); no fee amount; "income behind them" is generic, not the viewer's; no private-school or wealth display. |
| **P06** | One person runs the whole business. (6) | Many small businesses rely on one key person. A licensed adviser can talk through what that means. Free to check. (113) | When a business relies on one person (36) | Check my cover | **C11** style K (to-do list): "☑ Clients" "☑ Staff" "☐ What if the one person is out?" | "Many ... rely" is a mild generalisation: **substantiation needed before publish (ARB 4.1)**, fallback "Some small businesses"; no product named. |

Character counts are hand-counted; re-run `fk_check.py` and a length check on the CSV before upload. If P06's "Many" cannot be sourced, ship the fallback.

## Targeting map (variant to cell)

Cells are from `deliverables/media-buyer/sa-affluent-targeting-map.md`. Every cell uses the same Tier-1 "people living in" locations (§1), age 30–55 and the §3 exclusions. The copy never names the targeting.

| Variant | Interest stack (§2) | Ad set (§5) | Why this pairing |
|---|---|---|---|
| P01 | **Stack 1** (F parents AND A/B/C/E); also Stack 2 | A and B | Families with school-age children plus bond signals |
| P02 | **Stack 1** (F AND A/B/C/E) with life events H ("Newlywed", "Recently moved") as hints | A and B | Dual-income households with kids; the Advantage+ ad set may find them without interest hints |
| P03 | **Stack 3** (G small business owners, page admins AND A/B/C) | A and B | Own-business owners with no employer cover |
| P04 | **Stack 3** (G professionals: SAICA, Law Society, HPCSA, ECSA AND A/B/C) | B first | Professional practices with partners; narrow pool, so watch the 200,000 audience-size floor |
| P05 | **Stack 1** (F, school clusters in §1 optional pins: private-school areas) | B | School-fee commitment is strongest in the F plus school-cluster cell |
| P06 | **Stack 3** (G small business owners AND A/B/C) with Stack 2 (E homeowners) as hint | A and B | Single-owner businesses |

Run all six in both ad sets (the §5 rule: same creatives in both). Judge on cost per verified R1,500+ lead and the R1,500+ share, as in the research. Cycle-1 kill rules (3.4) apply unchanged.

## Gates before anything publishes
1. Jonathan's yes (NH-66).
2. compliance-qa re-check of all six texts against the breach table (second-person status, premium, product, advice).
3. P06 "Many small businesses rely on one key person" gets a source or the fallback wording.
4. Special Ad Category check (campaign-spec §10) comes first. If Meta forces it, targeting falls back to creative and location, and this copy still stands.
5. `needs_human`: which FSP number appears on a broker-neutral ad (unchanged from cycle 1).
