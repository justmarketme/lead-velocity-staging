# Day 3 · Reel R01 · "Who gives the advice? Not SortMyCover."

Status: NEW, needs compliance-qa before posting. Jonathan posts or schedules it in Business Suite himself (G8 #2).

| Field | Value |
|---|---|
| Day / time | Day 3 · 18:00 SAST |
| Format | Reel, 9:16, 1080×1920, 30 fps, H.264, **silent** (on-screen text carries the whole message; sound-off feeds) · 21 s |
| Video | `brand/exports/feed/week1/W1D3-reel-R01-who-gives-advice-1080x1920.mp4` |
| Frames | `brand/exports/feed/week1/R01-frames/R01-f1…f7-1080x1920.png` + `concat.txt` |
| Build | `cd brand && node scripts/build-week1.mjs` (data only, uses the existing `reels-endcard.html`; ffmpeg stitches the frames) |
| Cover image | Frame 1 ("Who gives the advice?"). In the IG grid, check the 3:4 crop |
| Surfaces | Facebook Page Reel + Instagram Reel (Business Suite, both at once). Also share to Stories and add to the "What to expect" Highlight |
| Links | None |
| Why this Reel | Turns the pinned post WU05 (the trust answer) into the format IG ranks on watch time and sends (research #1). The hook is readable at frame 0 and the payoff ("Not SortMyCover.") lands by 2.5 s. Easy to forward to a partner, which earns sends. It is the first video, so `SMC_ENG_video75_30d` starts filling (G8 #1) |

## Script / on-screen text (burned in, hard cuts, every cut ≤ 3 s)

| Time | Frame | On-screen text (bold = amber) |
|---|---|---|
| 0.0–2.5 | f1 | Who gives **the advice?** |
| 2.5–5.0 | f2 | **Not** SortMyCover. |
| 5.0–8.0 | f3 | SortMyCover books a **free 30-minute call.** |
| 8.0–11.0 | f4 | A **licensed adviser** gives the advice. |
| 11.0–14.0 | f5 | Video, WhatsApp or phone. **No sales visit.** |
| 14.0–17.0 | f6 | No obligation. **Decide later, or not.** |
| 17.0–21.0 | f7 end card | Sort your cover. 30 minutes. **A real adviser.** · pill: "sortmycover.co.za" · fine print: "SortMyCover gives no financial advice, product comparisons or premium quotes." (5 Oct, Jonathan: no Lead Velocity on social; **current f7 PNG + MP4 still show the old Lead Velocity line: re-run `build-week1.mjs`**) |

Every frame carries the tick mark and the SortMyCover wordmark from the template. Reading level: 7 frames, 36 words, longest sentence 8 words, about Grade 2 to 3.

## Facebook text (about 400 chars)

```text
Who gives the advice? Not SortMyCover.

SortMyCover books a free 30-minute call with a licensed adviser, for a time that suits. The adviser gives the advice.

The call is on video, WhatsApp or phone. No sales visit. No obligation to buy anything.

Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

SortMyCover gives no financial advice, product comparisons or premium quotes.
```

## Instagram caption (about 455 chars, 4 hashtags)

```text
Who gives the advice? Not SortMyCover.

SortMyCover books a free 30-minute call with a licensed adviser, for a time that suits. The adviser gives the advice.

The call is on video, WhatsApp or phone. No sales visit. No obligation to buy anything.

Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za

#SortMyCover #LifeCover #FinancialLiteracy #SouthAfrica

SortMyCover gives no financial advice, product comparisons or premium quotes.
```

**CTA when click-to-WhatsApp is live** (swap the CTA line only): `Pick a time for a free 30-minute call with a licensed adviser on WhatsApp: {{WA_LINK}}`

## Alt text / accessibility description

A 21-second silent video with large text on a dark charcoal background, a white tick mark and the SortMyCover logo. The text reads, one line at a time: Who gives the advice? Not SortMyCover. SortMyCover books a free 30-minute call. A licensed adviser gives the advice. Video, WhatsApp or phone. No sales visit. No obligation. Decide later, or not. The last screen: Sort your cover. 30 minutes. A real adviser. sortmycover.co.za. SortMyCover gives no financial advice, product comparisons or premium quotes.

## Self-check against the hard rules

| Rule | Result |
|---|---|
| Educational, broker-neutral | PASS: explains the model only; no broker, practice, face or FSP number |
| Third person, no "you/your" claims about money, family or health | PASS: no "you/your" anywhere. The brand line "Sort your cover…" is the approved line (warm-up README item 3, still open with compliance-qa) |
| No advice (FAIS) | PASS: says who gives advice; gives none |
| No product, insurer, premium, cover amount, rand figure, "2–4×" | PASS |
| Never "guaranteed"; no fear or death imagery | PASS |
| No engagement bait / comment-bait | PASS: the only CTA is the Page message button |
| Facts match the live funnel | PASS: free, 30 min, video/WhatsApp/phone, no obligation are all in WU04, which has passed. No claim about the WhatsApp intro card, which is not live yet |
| Original content (IG recommendation rule) | PASS: code-rendered, no reposts, no licensed music |
| Ends with DISC-S97-v1 verbatim | PASS (caption and end card) |

**Flags for compliance-qa / visual-producer.** (1) **RESOLVED 5 Oct (visual-producer):** the end card now uses the opt-in `disc` layout in `reels-endcard.html`, which raises the block so the fine print sits at about y 1380-1470, above IG's bottom 340 px overlay (the pill stays clear of it too). Original issue:  The template's fine print sits at y 1500 and its three lines reach about y 1635. That is inside the bottom 340 px, where IG's caption overlay can cover it. The disclosure is still always present in the caption. If an on-video disclosure fully clear of the overlay is needed, visual-producer re-cuts the end card through `engine/engine.js` (EC 9x16 fine print at y 1460). This task could not change the template. (2) The end-card pill "Questions? Send a message." is NEW. (3) **Not used:** the rendered ad C15 (same idea). Its end card says "Tap to check your cover", which has nowhere to go on an organic Reel. **Fallback** if R01 isn't rendered by Day 3: swap Day 3 and Day 7 (post WU04 on Day 3, R01 on Day 7).
