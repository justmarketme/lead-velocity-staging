# Week 1 organic schedule: SortMyCover FB Page + Instagram

Status: DRAFT · 5 Oct 2026 · Spec: `../page-optimisation-research.md` §3 · Profile rules: `../profile-kit.md` v1.1 §4.
This replaces the 5-post plan in `../warmup-posts/README.md` with 7 posts over 7 days: the 5 WU stills (unchanged, compliance PASS) plus 2 NEW posts (a Reel and a carousel).
**Who posts:** Jonathan, scheduled in Meta Business Suite (FB + IG in one post). No posting scripts. NEW posts need a compliance-qa pass first (G8 #1).

Day 1 is the first full day after both the Page and IG exist (G2 done). Same time every day, **18:00 SAST**, to match the paid Reach window. Times are only tested later (research #8).

| Day | Time | Format | Post | File | Status |
|---|---|---|---|---|---|
| 1 | 18:00 | Static 4:5 | WU05 Who gives the advice? Not SortMyCover. **Pin FB + IG #1** | [D1-WU05.md](D1-WU05.md) | PASS |
| 2 | 18:00 | Static 4:5 | WU01 Life cover gap | [D2-WU01.md](D2-WU01.md) | PASS |
| 3 | 18:00 | **Reel 9:16, 21 s** | R01 "Who gives the advice?" **IG pin #2** | [D3-reel-R01.md](D3-reel-R01.md) | NEW → compliance-qa; render pending |
| 4 | 18:00 | Static 4:5 | WU02 Payslip cover line | [D4-WU02.md](D4-WU02.md) | PASS |
| 5 | 18:00 | **Carousel 5 × 4:5** | FAQ "Four straight answers" **IG pin #3** | [D5-faq-carousel.md](D5-faq-carousel.md) | NEW → compliance-qa; render pending |
| 6 | 18:00 | Static 4:5 | WU03 Life events | [D6-WU03.md](D6-WU03.md) | PASS |
| 7 | 18:00 | Static 1:1 | WU04 What happens on a free 30-minute call | [D7-WU04.md](D7-WU04.md) | PASS |

**Every post (changed 5 Oct by Jonathan):** third person, one idea, CTA `Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za` (WhatsApp version with `{{WA_LINK}}` once click-to-WhatsApp is live), ≤ 5 hashtags (IG), last line `SortMyCover gives no financial advice, product comparisons or premium quotes.` **No "Lead Velocity" in any social copy or image.** Never imply the call happens now ("booked for a time that suits"). Share each to Stories the same day. Superseded schedule: the live 14-day plan is `../daily/README.md`.
**Images that still show "Lead Velocity" (data fixed 5 Oct, re-render needed):** `warmup/WU04-…png` (footer), `week1/W1D5-faq-4-who-pays-…png` (body), `week1/R01-frames/R01-f7-…png` + the R01 MP4 (fine print). Run `node scripts/build-warmup.mjs` and `node scripts/build-week1.mjs` from `brand/`.
**Daily, all week:** DMs answered in < 15 min from 07:00 to 22:00 (badge target). Comments get one public reply and one private reply (profile-kit §4 #2). No engagement-bait asks.

## Render (new assets only; data only, no template changes)

```bash
cd brand
# Same Playwright setup as build-warmup.mjs: set PLAYWRIGHT_PATH (global n8n playwright-core) + CHROMIUM_PATH (Edge) if `playwright` isn't installed
node scripts/build-week1.mjs
```
Outputs go to `brand/exports/feed/week1/`: 5 carousel PNGs, `R01-frames/` (7 PNGs + `concat.txt`), and `W1D3-reel-R01-who-gives-advice-1080x1920.mp4` (needs ffmpeg on PATH or `FFMPEG_PATH`; without it the script prints the exact ffmpeg command).
**Not yet run.** This session had no shell, so the PNGs/MP4 don't exist yet and the script hasn't been run. Run it, then do a visual check (line wraps at 96 px on the Reel frames; sub-copy on the carousel cards must not hit the paper notes).

## Open
1. compliance-qa: the NEW strings listed in D3 and D5, plus the away message (profile-kit §1 #11).
2. R01 end-card fine print overlaps the bottom 340 px Reels overlay zone (template y 1500). See the D3 flag. The disclosure is also in the caption.
3. The Paid Reach part of G8 (about R50/day) is unchanged and still waits on NH-MO-01 / NH-31a.
