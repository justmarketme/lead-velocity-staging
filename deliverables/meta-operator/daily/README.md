# 14-day daily calendar: SortMyCover FB + IG (Wed 7 – Tue 20 Oct 2026)

Playbook: `../content-engine.md` (principles §3, ICP interest map §6a). One feed post a day at **18:00 SAST**, FB + IG together in Business Suite; Story at 07:00 next day with a link sticker to sortmycover.co.za. Jonathan schedules; NEW posts need compliance-qa first.
Every post: CTA `Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za` · closing `SortMyCover gives no financial advice, product comparisons or premium quotes.` · no "Lead Velocity" in copy or pixels · `{{WA_LINK}}` line ready in each file. **Nothing with the domain goes out until sortmycover.co.za serves the live landing page.**

| Day | Date | Format | Post | ICP interest | Status |
|---|---|---|---|---|---|
| D01 | Wed 7 Oct | Still | C03 How to check an adviser is licensed | Scams | **Scheduled** (edit copy to new CTA) |
| D02 | Thu 8 Oct | Still | C02 Prime is now 10.75% | Bond rates | **Scheduled** (edit copy) |
| D03 | Fri 9 Oct | Still | C01 94.1% of death claims were paid | Claims trust | **Scheduled** (edit copy) |
| D04 | Sat 10 Oct | Reel | R01 Who gives the advice? (reuse) | Trust | Re-render f7 first |
| D05 | Sun 11 Oct | Carousel | FAQ Four straight answers (reuse) | Trust | Re-render card 4 first |
| D06 | Mon 12 Oct | Carousel | **K01** Tax deadline: 23 October. Same papers, two jobs. | SARS tax season | NEW, render pending |
| D07 | Tue 13 Oct | Reel | **R02** Leaving a job? One question for HR first. | Job changes | NEW, render pending |
| D08 | Wed 14 Oct | Carousel | **K02** Myth: the nomination form decides who gets paid. | Extended family | NEW, render pending |
| D09 | Thu 15 Oct | Reel | **R03** New life policy? There is a 31-day window. | Contracts / big buys | NEW, render pending; PPR text check blocking |
| D10 | Fri 16 Oct | Still | **S01** Two free places to take a financial complaint. | Consumer rights | NEW, render pending |
| D11 | Sat 17 Oct | Still 1:1 | WU04 What happens on a free 30-minute call (reuse) | Behind the process | Re-render footer first |
| D12 | Sun 18 Oct | Still | WU03 New bond. New baby. New job. (reuse) | Family milestones | Ready |
| D13 | Mon 19 Oct | Carousel | **K03** Stokvel, burial society, life cover: three different jobs. | Stokvels | NEW, render pending; label check |
| D14 | Tue 20 Oct | Reel | **R04** How to check an adviser is licensed. | Scams | NEW, render pending |

Mix: week 1 (D01–D07) 2 Reels, 2 carousels, 3 stills; week 2 (D08–D14) 2 Reels, 2 carousels, 3 stills. New posts on weekdays; weekends re-run proven posts (Sprout 2026: weekends lowest).

## Render (data only, existing templates)

```bash
cd brand
# PLAYWRIGHT_PATH = global n8n playwright-core folder; CHROMIUM_PATH = Edge msedge.exe; ffmpeg on PATH
node scripts/build-daily.mjs D06 D07      # days 1-7 first (only K01 + R02 are new in that window)
node scripts/build-daily.mjs              # then the rest
node scripts/build-warmup.mjs             # WU04 footer without Lead Velocity
node scripts/build-week1.mjs              # FAQ card 4 + R01 end card without Lead Velocity
```
Outputs: `brand/exports/feed/daily/`. After rendering, view every frame: hook lines must not wrap past 3–4 lines on Reels, paper-note values must not overflow, end-card fine print must sit above y 1580.

## Next batch (from the interest map)
Two-pot withdrawals (refresh SARS figure first) · payday re-run of WU02 on 25 Oct · self-employed / no group cover · glossary carousel ("5 words that come up on a cover call") · late-Nov Black Friday / December angle.
