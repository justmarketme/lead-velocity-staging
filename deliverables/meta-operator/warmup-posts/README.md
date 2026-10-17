# G8 Page warm-up: organic posts WU01–WU05

Status: DRAFT · 5 Oct 2026 · Rules: setup-checklist G8, master prompt 2.1.8 + 4D.2, `DISC-S97-v1` (disclosure-wording.md), compliance notes phase4-review-2 §5a.

**Who posts:** Jonathan, from Meta Business Suite (scheduled posts are fine, G8 #2). No posting scripts. Each post needs a compliance-qa pass before it goes out (G8 #1).

## Posts

| ID | Source article | Image | Size |
|---|---|---|---|
| [WU01](WU01.md) | what-is-a-life-cover-gap | `brand/exports/feed/warmup/WU01-life-cover-gap-1080x1350.png` | 4:5 |
| [WU02](WU02.md) | how-to-read-your-payslips-cover-line | `brand/exports/feed/warmup/WU02-payslip-cover-line-1080x1350.png` | 4:5 |
| [WU03](WU03.md) | life-events-that-change-what-you-need | `brand/exports/feed/warmup/WU03-life-events-1080x1350.png` | 4:5 |
| [WU04](WU04.md) | what-happens-on-a-30-minute-call | `brand/exports/feed/warmup/WU04-30-minute-call-1080x1080.png` | 1:1 |
| [WU05](WU05.md) | how-sortmycover-works | `brand/exports/feed/warmup/WU05-how-sortmycover-works-1080x1350.png` | 4:5 |

Images are re-rendered by `node brand/scripts/build-warmup.mjs` (data only, existing templates, `lib.mjs` `shot()`).

> **Superseded 5 Oct:** the live schedule is now `../week1-posts/README.md`: these 5 posts plus Reel R01 and the FAQ carousel over 7 days. Open item 1 (video) is answered there.

## Proposed 7-day schedule (18:00 SAST), superseded

Day 1 = the first full day after the SortMyCover Page and Instagram exist (G2 done).

| Day | Post | Why this order |
|---|---|---|
| 1 | WU05 How SortMyCover works | Says who is behind the Page and that it gives no advice, before anything else |
| 2 | WU01 What is a life cover gap? | The core idea |
| 4 | WU02 Reading the payslip cover line | Practical follow-on to the gap |
| 5 | WU03 Life events | When the gap tends to change |
| 7 | WU04 What happens on a 30-minute call | Last, closest to the lead campaigns |

Post the same image + text on Facebook and Instagram (Business Suite can do both in one post; use the IG caption with hashtags for Instagram).

**Edits 5 Oct (`../profile-kit.md` §3):** stronger first lines on WU01, WU03, WU05 and "free" on WU04. Every post now ends its body with the soft CTA "Questions about the free 30-minute call? Send us a message." (to the Page "Send message" button), then the hashtags (IG) and DISC-S97-v1. Keyword comment CTAs ("comment CALL") are not used: 4.14 bans comment-bait. WU05 is the pinned post. FB lengths are now 542–674 chars.

**Changed again 5 Oct (Jonathan, supersedes the soft CTA and DISC-S97-v1 on social):** every post now ends with the CTA `Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za` (scheduled wording, Jonathan 5 Oct: never imply the call happens now) (WhatsApp version with `{{WA_LINK}}` in each file), then hashtags (IG), then `SortMyCover gives no financial advice, product comparisons or premium quotes.` No "Lead Velocity" in any social copy or image (competitors must not see the link). WU04's image footer must be re-rendered (`build-warmup.mjs` data updated). WU05's fee line now says "Advisers pay SortMyCover…" (compliance-qa to re-pass P-4).

## Open items (not solved here)

1. **Video:** G8 #1 asks for at least one short video so `SMC_ENG_video75_30d` starts filling. These five are stills. A short captioned video version of WU04 or WU05 is still needed (visual-producer).
2. **File size:** WU01 (129 KB), WU02 (124 KB) and WU05 (139 KB) are over the 120 KB still limit (4D.2 rule 7). Fine for organic posts; quantise before any ad use. `exports/render.mjs` uses ImageMagick `convert`, but on Windows `convert` is the system disk tool, so it was not run.
3. **Brand line on images:** WU01–03 and WU05 carry the approved line "Sort your cover. 30 minutes. A real adviser." (4D.2 rule 1). It is an imperative, not a "you/your" money or family claim, but compliance-qa should confirm it is fine on organic posts.
4. **Paid part of G8** (Reach ad, about R50/day) is not covered here; it waits on NH-MO-01 / NH-31 a.
