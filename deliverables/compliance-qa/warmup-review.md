# Warm-up posts WU01–WU05 + profile kit: compliance review, 2026-10-05

Reviewer: compliance-qa. Scope: `deliverables/meta-operator/warmup-posts/WU01–WU05.md` (FB text, IG caption, alt text, the five PNGs in `brand/exports/feed/warmup/`) and `deliverables/meta-operator/profile-kit.md` (bios, About, IG name, highlights, ice-breakers). Rules: 2.1.1 (no advice, comparison, quotes, cover amounts), 2.1.5 (no unverifiable claims), 2.1.8 (Meta personal-attributes rule), 1.2 (no broker/insurer/FSP on public assets), disclosure-wording.md (DISC-S97-v1, §4a). This is a QA flag list, not legal advice.

**Decided, not reopened:** Jonathan's bios (`BIO-FB-v3`, `BIO-IG-v3`, disclosure-wording §4a, 2026-10-05) are consumer copy; disclosure lives in About → details (DISC-FULL-v1) and the ad end-card (S97). They are confirmed below and must not be reverted to disclosure text.

## Verdict per post

| Post | Result | Notes |
|---|---|---|
| WU01 Life cover gap | **PASS** | Third person throughout. "Often a few times salary" is the approved fallback (P-2), no 2–4×. No rand figure, no product, insurer or broker. "Only a licensed adviser can say what suits one family" keeps it out of advice. |
| WU02 Payslip cover line | **FIX (made)** | Fact error: "a lump sum paid to **chosen beneficiaries**". For group life inside a retirement fund the trustees decide who gets paid under Pension Funds Act s37C; the nomination form is only a guide (CDH, Ninety One notes). Post now reads "a lump sum paid out if a member dies while employed". The HR question "Who is the beneficiary?" stays (it's a good question to ask). Same fix made in the source article `landing/holding/learn/how-to-read-your-payslips-cover-line.html` l.46 so post and page still match. Counts updated (FB 602, IG 655). The self-check row claimed an adviser line that the post doesn't have; corrected. |
| WU03 Life events | **PASS** | "A big change is a natural time to check cover" = P-5. List of events, no "you/your", no claim about the reader. |
| WU04 30-minute call | **PASS** | Describes the adviser's disclosure (name and licence details first) without naming one. "No pressure / no obligation / no bank card details needed" are in the reviewed source article. Low note (L-1 below). |
| WU05 How SortMyCover works | **PASS** | Fee line matches 2.1.1 and the Raspberry Academy structure: the same flat fee for each 30-day cycle, "whether or not anyone buys", never commission. "Who gives the advice? Not SortMyCover." is the right pinned post. |

**Across all five:** the closing DISC-S97-v1 text matches disclosure-wording.md word for word. No emojis, no exclamation marks, no links, no guarantees, no prices. Hashtags are generic (4 each). The soft CTA "Questions about the free 30-minute call? Send us a message." passes: no advice, no price, no claim about the reader, and it isn't comment-bait. The posts contain no AI people, so no AI label is needed.

**Image brand line "Sort your cover. 30 minutes. A real adviser." (README open item 3): PASS.** It's an imperative brand line. It says nothing about the viewer's finances, debts, family or health, so it doesn't break Meta's personal-attributes policy (and that policy applies to ads, so it would also hold if G8's Reach campaign boosts these posts). The five PNGs were checked visually: no broker, FSP, insurer, rand figure or "you/your" claim.

## Profile kit

| Item | Result |
|---|---|
| `BIO-FB-v3` (Page intro) | PASS: says what we do and that we don't give advice. Decided; leave it. |
| About → details, Option A (DISC-FULL-v1) / Option B | PASS. "Free 30-minute calls with licensed advisers, for South Africans." adds no claim beyond "free". |
| IG Name "SortMyCover \| Life cover & insurance, explained" | PASS: educational, no "best/cheap/advice". |
| `BIO-IG-v3` (decided) / `BIO-IG-v4` (option) | Both PASS. v4 keeps "We don't give advice ourselves" word for word. Either may be used; choosing is a creative decision, not a compliance one. |
| Ice-breakers, Send message button, category Education | PASS. |
| Highlights / grid posts 6–9 | Not reviewed (not made yet). Each one needs its own pass before posting. |
| §4 "Never post" list | PASS. It matches 2.1.8, 1.2 and 4.14. |

## Low notes (no change needed now)
- **L-1 (WU04, source article):** "No bank card details needed on the call" and "no pressure" describe how *brokers* behave, but the broker agreement doesn't oblige them to it yet. contracts-drafter: add a broker conduct line (no card details taken on the intro call; no pressure selling) so the public claim is backed. Until then the claim is acceptable because it describes the intended call.
- **L-2 (profile kit, Advisers highlight):** "Every adviser is an authorised financial services provider." Some routed advisers may be *representatives* of an FSP rather than FSPs themselves. The intro card pulls from the `brokers` row and the FSCA register, so that's where it gets checked. Before the highlight is made, the practitioner (GATE-OPINION) should confirm the wording, or it should say "works under an authorised financial services provider".

## Files changed
- `deliverables/meta-operator/warmup-posts/WU02.md`: beneficiary line (FB + IG), counts, self-check row, status.
- `deliverables/meta-operator/warmup-posts/WU01, WU03, WU04, WU05.md`: status line only (compliance-qa PASS).
- `landing/holding/learn/how-to-read-your-payslips-cover-line.html` l.46: same beneficiary fix.

Result: **5/5 cleared to post** (WU02 after the fix above). Posting stays a Jonathan action in Business Suite (G8 #2).

Sources: [CDH, trustees not bound by nomination forms](https://www.cliffedekkerhofmeyr.com/en/news/publications/2023/Practice/Employment/employment-law-alert-6-march-2023-not-respecting-your-dying-wish-pension-fund-trustees-are-not-bound-by-beneficiary-nomination-forms.html) · [Ninety One, trustees have the final say](https://ninetyone.com/en/south-africa/insights/retirement-fund-death-benefits-why-trustees-have-the-final-say)
