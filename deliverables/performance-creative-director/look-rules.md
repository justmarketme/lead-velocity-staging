# Look rules: what makes something recognisably SortMyCover (one page)

**Applies to:** every ad (Feed, Reels, Stories), every landing-page header and OG card, every WhatsApp header/card. **Owner:** performance-creative-director. **Enforced by:** compliance-qa (any surface that breaks the kit fails, 4D.4b.5 item 7). **Source of values:** `/brand/tokens.css`. These rules name tokens, not hex.

## The five assets on every surface (Binet & Field: distinctive assets on every frame; one human truth per concept)
1. **The tick.** The amber disc with the accent-text tick (`brand/logo/tick-mark.svg`) is the "o" in Cover, or stands alone. Every frame of every video carries it: tick mark top-left in 9:16, wordmark bottom-left in 1:1 and 4:5. It is the only device. It **draws** (400 ms) only on the end card and on site load. Everywhere else it is static.
2. **The name.** "SortMyCover", one word, camel-case, always from the SVG wordmark and never typed in a font.
3. **The colours.** `--sm-charcoal` field, `--sm-off-white` text, `--sm-amber` for **one** thing per frame: the key number, the bar, the strike or the button. Text on amber uses `--sm-accent-text`. The teal-on-cream set is a **test arm only** (C01 in cycle 1; see test-matrix.md) and never appears anywhere else until it wins.
4. **The type.** DM Sans. 800 for hooks, 500 for captions and body. Tabular numerals. Hook sizes: 9:16 = 96 px, 4:5 = 84–88 px, 1:1 = 76–78 px. Captions are 44 px (9:16) and 40 px (4:5 / 1:1). Grade ≤ 7.
5. **The line.** "Sort your cover. 30 minutes. A real adviser." appears **once** per asset, verbatim, with no variants (it is eight words; the mock-up's "seven" is a typo). Videos carry it on the end card. Stills carry it above the wordmark. The tap line is "Tap to check your cover". The Meta button is "Learn more" (or "Send WhatsApp message" for CTWA). **Never** "Get a quote".

## Layout physics (Meta creative docs: first frame carries the message, captions carry the sound)
- **The hook is readable at 0.0 s.** Motion starts by 0.5 s. The payoff is on screen by 6 s. One idea per asset. A cut every 2–3 s. Video length is 15–30 s, and the last 3 s are the end card.
- **The cut rule, measurable (v1.1.1 ruling, no per-concept exceptions):** a *cut* is any change of the frame's focal element: new ON text, a new screen or visual, a line landing in a kinetic build, or a caption entering. **No gap between cuts may exceed 3.0 s** before the end card. Checked on the `tl` row times in `engine/art.mjs` (max of consecutive differences ≤ 3.0, and E − last row ≤ 3.0). Fix an over-long row by splitting it with copy that is already approved (move the caption to the split, or build the ON text line by line), never by writing new words.
- **Sound-off first.** Every line that matters is on screen. Captions are burned in. There is no voiceover in cycle 1.
- **Caption dedupe (accepted):** a caption that repeats the frame's ON text word for word is dropped. Each approved line appears on screen **once** per beat, as ON or as CAP, never both (two copies of one line cost reading time and break the two-element / 12-word rule). The `.srt` sidecar carries the union of ON and CAP lines. compliance-qa confirms nothing approved went missing.
- **Reels/Stories 1080×1920:** no text in the top 250 px or the bottom 340 px (`--sm-safe-top` / `--sm-safe-bottom`). Side margin 72 px. Captions keep 160 px clear on the right between y 1100 and 1580, so the action rail can sit there (ASSUMPTION: confirm in Ads Manager preview).
- **Feed 1080×1350 and 1080×1080:** 72 px margins. Wordmark bottom-left. The bottom-right is reserved for the AI label, which stays empty in cycle 1.
- **At most two text elements per frame** (the hook or kinetic word, plus one caption), plus the tick. **At most 12 words on screen per frame. At most 20 words on a still,** excluding the line and the wordmark.
- **Each still is under 120 KB** (4D.2 rule 7). Each 9:16 MP4 is H.264, 30 fps, under 4 MB.

## WhatsApp header and profile
- **Profile:** the tick mark alone (640²). **1:1 header cards:** the tick + "SortMyCover" + the card's one job (intro / what to expect / reminder). That is all.
- The **real adviser's face and FSP number appear only here** (intro card, 4.10), using the co-brand lock-up. They never appear in an ad or on a page header.

## Page headers and OG cards
- The wordmark is 140 px on the off-white header. The hero is the same hook as the ad that sent the visitor (message match).
- The OG 1200×630 card carries the wordmark, the hook and the line, and nothing else.

## Banned (each ban has its reason)
| Banned | Why |
|---|---|
| Shields, umbrellas, family silhouettes, padlocks, handshakes | Insurer clichés with zero uniqueness (Romaniuk). They also imply that we are an insurer (4D.2 rule 2) |
| Blue or navy anywhere in brand surfaces | Every SA insurer is blue or green, so blue buys no distinctiveness (4D.4a colour finding). Teal appears only as the C01 test arm |
| Stock photography, especially stock families on white | Ad Library survivorship: real rooms and real moments last. Stock gloss reads as an ad. My five ban it outright |
| AI humans of any kind in cycle 1. AI people presented as clients, advisers or testimonials at any time | 2.1.5 and Meta's AI-content rules. Faces wait for the week-3 Flow trigger, and even then they are labelled scene extras only |
| Testimonials, star ratings, "X people booked" counters | 2.1.5. These are allowed only when the quote and the number are real and consented |
| Urgency theatre: countdowns, "limited spots", "today only", red badges | My five forbid it. 4D.4b.5 item 10 allows honest urgency only |
| Exclamation marks, emoji in ad text, ALL-CAPS sentences | Plain, warm, direct voice (4D.4b.4). They read as sales noise |
| "You/your" claims about money, cover, debt, family, age or health | 2.1.8. Only the line ("Sort your cover…"), "Tap to check your cover", "you decide after" and "your own time" are allowed |
| Premiums, cover amounts, insurer or product names, broker names, "best/cheapest/#1/guaranteed" | 1.2, 2.1.1, 2.1.8, and the 3.5a banned words |
| Fear and mortality imagery: coffins, hospital beds, empty chairs, "what if" | Fear-led ads churn (Ad Library survivorship) and carry a Meta risk |
| Gradients, drop shadows, outlines on the logo. Recolouring the tick outside the palette | Logo rules (4D.4b.1) |
| Text-heavy slides (paragraphs on screen) | The physics: nobody reads paragraphs in a scrolling feed. One line per beat |

## Test-arm palette (in `tokens.json` under `experiment.tealOnCream`, never as roles)
**Ruling (v1.1.1, closes NH-36 a): palette B** = teal #0F6E6A-range on cream #F6EFE0-range (5.30:1, AA, per `brand/tokens.md`), not A (#0F766E on the brand off-white, 5.16:1). Why: 4D.4a names the arm "teal-on-cream", and colour is chosen for contrast in the feed. The brand off-white sits too close to Facebook's white light-mode feed for the light arm to show an edge; cream does. The arm tests a palette that could replace the brand, so it has to be the best version of that palette. Cost: the C01 teal set is re-rendered in the same batch as the C01 cut delta (C01.md), so no extra render. tokens.json role values do not change. The swap is mechanical:
- the field becomes cream;
- off-white text becomes charcoal;
- every amber element becomes teal;
- text on the teal button becomes cream;
- the tick disc becomes teal with a cream tick.

Everything else is identical: tick shape, wordmark letterforms, type, layout, copy and timing. visual-producer generates `tick-mark-teal.svg` and `wordmark-charcoal-teal-tick.svg` from the same build script.

## Template fixes owed by visual-producer (found while writing these rules)
- `brand/templates/feed.html`: the default `sub` "Check **yours** in 30 minutes…" is a second-person cover claim. The default becomes "A licensed adviser can check it in 30 minutes." The default `prop2` "R 1 420 000" and `prop1` "3× annual salary" are figures on screen. C01 uses "2–4× salary" (the sourced hook claim) and a blank amount line "R _ _ _ _ _ _ _". See C01.md.
- A **4:5 end card** layout is needed. Only 9:16 (`reels-endcard.html`) and 16:9 exist. Add `layout:"r4x5"` to the Reels end-card template.
- The **teal variants** of the tick and wordmark (see above).
- A **9:16 motion template** (hook zone, visual zone, caption lane, tick top-left), driven by the per-concept timeline JSON in each brief.
