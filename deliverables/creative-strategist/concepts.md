# SortMyCover — 15 ad concepts (cycle 1)

**Owner:** creative-strategist · **Status:** DRAFT. For compliance-qa review, then visual-producer renders (4D.5 code pipeline), then meta-operator submits. **Date:** 2026-10-02
**Rules applied:** broker-neutral (1.2). No product, insurer, premium, cover amount or broker. No second-person money, family, age or health claims (2.1.8). No fear, no price hook, no testimonial. No exclamation marks. Grade ≤ 7. Hooks ≤ 8 words. Primary text ≤ 90 words. CTA from the "Check my cover" family, never "get a quote".

## Submit first, and test first

| Mark | Concepts | Why |
|---|---|---|
| **First 3 for Meta approval (2.1.8)** | **C01** (employer-cover gap), **C03** (trigger: bond), **C14** (what the call is) | C01 and C03 are the test-matrix hooks, so they launch first anyway. C14 is the lowest-risk explainer and shows the whole mechanic. Together they cover the riskiest pattern we rely on (a number in the hook), the life-event pattern, and the plain explainer. If all three pass, the other 12 follow the same patterns. |
| **Two strongest hooks for the 4D.4a test matrix** | **C01 / H1** "Most work life cover stops at 2–4× salary." and **C03 / H3 (adapted)** "Bond approved. Champagne open. One thing left." | These are the H1 and H3 slots in 4D.4a. Arms: amber vs teal × static vs video, one variable per arm (Loomer method). |

## Angle map (15 concepts, at least 2 per angle)

| Angle (4.2) | Concepts | Hook source |
|---|---|---|
| 1. Employer-cover gap | C01, C02 | H1, H2 |
| 2. Trigger events | C03 (new bond), C04 (new baby), C05 (turned 40) | H3, H4, H5 (H3 and H5 adapted) |
| 3. Extended-family responsibility | C06, C07 | H9, new (consistent with H9) |
| 4. Virtual convenience | C08, C09 | H6 (adapted), new |
| 5. Self-employed / no group cover | C10, C11 | H7 (adapted), new |
| 6. Myth-bust | C12, C13 | H8, new |
| 7. What the call is | C14, C15 | H10, new (4.2 task 7 line) |
| Reserve (refresh in weeks 2–3) | — | H12 payslip checklist. H11 only once real, consenting quotes exist. |

**Hook adaptations (for performance-creative-director, who owns 4D.4a):**
- H3 "Just got bond approval? Read this before the champagne." is 9 words, and the question implies the viewer has a bond (personal attribute, 2.1.8). → "Bond approved. Champagne open. One thing left." (scene, 7 words).
- H5 "At 40, 30 minutes can sort what you've put off for 10 years." is 12 words, and "Turned 40?"-style lines touch age as a personal attribute. → "At 40, life is bigger than the cover." (8 words). It avoids an unsourced "most people" statistic.
- H6 → "No sales visit. No jargon. 30 minutes." (7 words).
- H7 "…Your family, your call." asserts the viewer's family (2.1.8). → "No boss. No payslip. No group cover." (7 words).

## Shared production spec (applies to every concept, so the per-concept briefs only list what changes)

- **Pipeline:** HTML/SVG from `/brand/tokens.json`. Stills via headless Chromium. Motion via Playwright frames → ffmpeg (4D.5). No photography, no people, no AI imagery, so no AI label is needed.
- **Palette:** charcoal #1F2933 background. Off-white #FBF8F2 for body and caption text. Amber #F5A623 only for the one key word, bar or device in each frame, and only at large sizes on charcoal (AA large only). On amber blocks, text is #2A1B02.
- **Type:** DM Sans/Inter class. Hook 800 weight: 9:16 ≈ 96 px, 4:5 ≈ 84 px, 1:1 ≈ 76 px. Caption 500 weight 44 px. Tabular numerals for figures.
- **Two motion styles:** **K** = kinetic type (words slam or slide in, one beat each). **G** = gap bars (a short amber bar against a longer charcoal-outline bar, with a bracket labelled "the gap").
- **Motion in the first 0.5 s:** every video starts with the hook already readable at 0.0 s, with movement starting by 0.2–0.5 s.
- **Captions:** burned in, bottom third, inside safe zones. 9:16 safe area is y 250–1580 px, so no text in the top 250 px or bottom 340 px.
- **Cuts:** every 2–3 s. Payoff of the hook delivered by second 6.
- **Brand lock:** tick-mark watermark bottom-left on every frame (Feed). Stacked wordmark on the end card. The line "Sort your cover. 30 minutes. A real adviser." appears once per asset, on the end card, verbatim.
- **End card (all videos, last 3 s):** the tick "draws" (400 ms, the only allowed tick animation) → wordmark → the line → amber button block "Tap to check your cover".
- **Ratios:**
  - **9:16** (1080×1920) = video for Reels and Stories.
  - **4:5** (1080×1350) = the same video re-laid out for Feed. Type is scaled about 0.85 and the bars are shortened.
  - **1:1** (1080×1080) = a static key frame (hook + gap visual + tick, bottom-left). It is also WhatsApp-share safe. Under 120 KB (4D.2 rule 7).
- **CTA:**
  - On-asset text: "Check my cover" or "Tap to check your cover".
  - Meta button: `LEARN_MORE` for instant-form and landing-page ads, `WHATSAPP_MESSAGE` for Click-to-WhatsApp. Never `GET_QUOTE`.
- **Reading grade:** hand-computed Flesch-Kincaid on the primary text, because no shell or python3 was available to this agent. Formula: 0.39 × (words ÷ sentences) + 11.8 × (syllables ÷ words) − 15.59. Re-run `fk_check.py` (in this folder) on `concepts.csv` before publish. Expect ±1 grade from the script's syllable heuristic.

---

## C01 — Employer-cover gap · H1 · **SUBMIT FIRST · TEST MATRIX**
| Field | Copy |
|---|---|
| Hook (8) | Most work life cover stops at 2–4× salary. |
| Primary text (65 words) | Most work life cover stops at 2 to 4 times salary. Most bonds are bigger than that. Add school fees, the car and the monthly bills. The gap is easy to miss. A licensed adviser can look at the real numbers with you in 30 minutes. On video, WhatsApp or phone. It costs nothing to check, and you decide after. Tap to check your cover. |
| Headline | Work cover vs the bond. Check the gap. |
| CTA | Check my cover (button LEARN_MORE) |
| Visual brief | **Style G.** Charcoal field. Frame 1: hook in off-white, with "2–4×" in amber. Below it, a short amber bar labelled "Work cover". **Motion 0.3 s:** a long outlined bar labelled "The bond" slides out past the amber bar and off the right edge. Bracket and label "the gap" appear between the bar ends. **Type:** hook 800 / labels 500 / caption 500. **Caption:** "Most work life cover stops at 2–4× salary." **End card:** "Sort your cover. 30 minutes. A real adviser." + "Tap to check your cover". |
| Variants | **9:16** full script below. **4:5** same script, with the bars stacked vertically to fit. **1:1** static: hook top, the two bars and the "the gap" bracket in the middle, headline bottom, tick bottom-left. |
| Video (25 s) | 0.0 Hook on screen (K slam) · 0.4 amber "Work cover" bar grows. CAP "Most work life cover stops at 2–4× salary." · 2.5 cut: "The bond" bar runs past it. CAP "Most bonds are bigger." **(payoff by 3 s)** · 5.0 cut: small bars stack on the bond bar: "School fees", "The car", "Monthly bills". CAP "Add school, the car, the bills." · 8.0 cut: bracket "the gap" pulses once. CAP "That space is the gap." · 11.0 cut: tick icon. CAP "A licensed adviser can check it in 30 minutes." · 15.0 cut: three chips "Video · WhatsApp · Phone". CAP "From home. Free to check." · 19.0 cut: CAP "You decide after." · 22.0 end card. |
| Reading grade | 8 sentences, 65 words, 84 syllables → **FK 2.8** |
| Compliance self-check | No product / insurer / premium / cover amount / broker / second-person money claim / fear / price hook / testimonial: **PASS.** **Flag for compliance-qa:** "2–4× salary" and "most bonds are bigger" are general claims. Their source is the published SA life cover guide cited in 1.1, which must be on file (2.1.5). |

## C02 — Employer-cover gap · H2
| Field | Copy |
|---|---|
| Hook (8) | R1.4m bond. 3× salary cover. Do the maths. |
| Primary text (78) | Here is one made-up example. A family has a R1.4 million bond. Work cover pays 3 times salary. For many salaries, that is less than the bond. And the bond is only one cost. Kids, school and monthly bills come on top. This is an example, not advice. Every family's numbers are different. A licensed adviser can work out the real gap in 30 minutes. On video, WhatsApp or phone. Free to check. Tap to check your cover. |
| Headline | An example, not advice. Check the real gap. |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Static + 6-s motion (4D.4a H2 format), style K.** Frame 1 shows a "sum" layout like handwritten maths, set in type: line 1 "R1.4m bond", line 2 "3× salary cover", a rule line, then "= ?" in amber. **Motion 0.3 s:** the "= ?" blinks to "= a gap". Small off-white tag in the corner: "Illustrative example. Not advice." **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** 6-s motion loop + end card (9 s total). **4:5** same. **1:1** static: the maths stack + tag + tick. |
| Video (15 s) | 0.0 Maths stack on screen. CAP "R1.4m bond. 3× salary cover." · 0.4 rule line draws · 2.0 "= a gap" in amber. CAP "For many salaries, that is less than the bond." **(payoff by 3 s)** · 5.0 cut: CAP "An example. Every family's numbers differ." · 8.0 cut: CAP "A licensed adviser works out the real gap in 30 minutes." · 12.0 end card. |
| Reading grade | 12 / 78 / 112 → **FK 3.9** |
| Compliance self-check | No product / insurer / premium / broker / second-person claim / fear / price hook / testimonial: **PASS.** **Flag for compliance-qa:** R1.4m and 3× are an **illustrative gap only** (allowed by brief, 1.1 worked case). It is labelled "made-up example" and "not advice" on screen and in copy. It must not read as a cover recommendation. If compliance-qa rejects it, swap in H12 from reserve. |

## C03 — Trigger: new bond · H3 adapted · **SUBMIT FIRST · TEST MATRIX**
| Field | Copy |
|---|---|
| Hook (7) | Bond approved. Champagne open. One thing left. |
| Primary text (69) | Bond approved. Champagne open. Keys next week. Then there is one job most new owners skip. They never check if their life cover still fits the new debt. A bond can be the biggest number a family ever signs. A licensed adviser can check the full picture in 30 minutes. On video, WhatsApp or phone, from home. Free to check, and you decide after. Tap to check your cover. |
| Headline | The one job after bond approval |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (Reels POV in type).** A three-item checklist on charcoal: "☑ Bond approved", "☑ Champagne open", "☐ One thing left", with the last box outlined in amber. **Motion 0.2 s:** the ticks draw on lines 1 and 2 in sequence. **Caption:** the hook. Item 3 resolves to "☐ Check the cover still fits". **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full script. **4:5** checklist centred, smaller type. **1:1** static: the checklist with box 3 empty, headline under it. |
| Video (22 s) | 0.0 Checklist on screen. Ticks draw on lines 1–2. CAP "Bond approved. Champagne open." · 2.5 cut: line 3 pulses. CAP "One thing left." · 4.5 cut: line 3 becomes "Check the cover still fits the new debt." **(payoff by 5 s)** · 7.5 cut: big type "The biggest number a family ever signs." · 10.5 cut: tick icon. CAP "A licensed adviser checks it in 30 minutes." · 14.0 cut: chips "Video · WhatsApp · Phone". CAP "From home. Free to check." · 17.0 cut: CAP "You decide after." · 19.0 end card. |
| Reading grade | 10 / 69 / 92 → **FK 2.8** |
| Compliance self-check | **PASS.** Third-person scene, no "you have a bond", no figures, no fear. "Most new owners skip" is a soft generalisation. compliance-qa may cut it to "one job that is easy to skip". |

## C04 — Trigger: new baby · H4
| Field | Copy |
|---|---|
| Hook (7) | New baby. New bond. Same old cover? |
| Primary text (73) | New baby. New bond. Same old cover. It happens a lot. Cover gets set up once, often years ago, and then nobody looks at it again. But a new child changes who depends on an income, and for how long. A licensed adviser can check if the old cover still fits the new family. 30 minutes on video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | New family, old cover? Check it. |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Carousel, 3 cards (4D.4a H4) + a K-style video.** Card 1 "New baby." Card 2 "New bond." Card 3 "Same old cover?", with "old" struck through in amber and "→ check it" added. Each card has an amber word and a simple line icon (pram, house outline, tick). **Motion 0.3 s (video):** the three words drop in one per beat. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** video. **4:5** video. **1:1** carousel (3 cards plus an end card as card 4). |
| Video (18 s) | 0.0 "New baby." on screen, pram icon draws · 1.0 "New bond." · 2.0 "Same old cover?" CAP the hook · 3.5 cut: CAP "Cover often gets set up once, then left." · 5.5 cut: CAP "A new child changes who depends on an income." **(payoff by 6 s)** · 8.5 cut: CAP "A licensed adviser checks if it still fits. 30 minutes." · 12.0 cut: CAP "Video, WhatsApp or phone. Free to check." · 15.0 end card. |
| Reading grade | 10 / 73 / 99 → **FK 3.3** |
| Compliance self-check | **PASS.** No "your baby". The question sits on a scene, not the viewer. No figures. |

## C05 — Trigger: turned 40 · H5 adapted
| Field | Copy |
|---|---|
| Hook (8) | At 40, life is bigger than the cover. |
| Primary text (64) | At 40, life is bigger than it was. A bond. Kids in school. Maybe parents to help. Cover set up at 28 was built for a smaller life. Nobody sends a reminder to check it. A licensed adviser can look at what still fits, in 30 minutes. On video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | At 40, check what still fits |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style G (growth).** A small amber box labelled "Cover at 28" sits inside a frame. **Motion 0.3 s:** the outer frame grows in steps labelled "bond", "kids", "school", "parents", while the amber box stays the same size. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same, with the steps stacked. **1:1** static: the final state (small amber box in a big frame) + hook. |
| Video (20 s) | 0.0 Hook on screen. The frame starts growing · 2.0 cut: labels "Bond. Kids. School." step in. CAP "Life got bigger." · 4.5 cut: amber box labelled "Cover at 28" stays small. CAP "The cover did not grow with it." **(payoff by 5 s)** · 7.5 cut: CAP "Nobody sends a reminder to check." · 10.0 cut: CAP "A licensed adviser looks at what still fits. 30 minutes." · 14.0 cut: CAP "Video, WhatsApp or phone. Free." · 17.0 end card. |
| Reading grade | 10 / 64 / 87 → **FK 3.0** |
| Compliance self-check | **PASS.** Age appears as a general life stage ("At 40, life…"), not "you are 40". No figures beyond the age. "The cover did not grow" is generic, not a claim about the viewer. |

## C06 — Extended-family responsibility · H9
| Field | Copy |
|---|---|
| Hook (7) | Many families carry more than one household. |
| Primary text (70) | Many families carry more than one household. A parent's rent. A sibling's school fees. A cousin who stays for a while. That support often runs on one income. Cover is often set up for the people under one roof only. A licensed adviser can count everyone who relies on that income. 30 minutes on video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | Count everyone one income carries |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style G (households).** Two simple house outlines on charcoal, joined by one amber line labelled "one income". **Motion 0.3 s:** a third outline fades in, linked by the same line. Labels: "rent", "school fees", "a cousin for a while". No people, no cultural symbols, no labels for the practice itself (2.1.8). **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** houses stacked vertically. **4:5** houses in a row. **1:1** static: three houses, one amber line, hook. |
| Video (22 s) | 0.0 Hook + two houses. Amber line draws · 2.5 cut: third house. CAP "A parent's rent. A sibling's fees." · 5.0 cut: CAP "Often all on one income." **(payoff by 5 s)** · 7.5 cut: CAP "Cover is often set up for one roof only." · 10.5 cut: CAP "A licensed adviser counts everyone who relies on it." · 14.5 cut: CAP "30 minutes. Video, WhatsApp or phone. Free." · 19.0 end card. |
| Reading grade | 10 / 70 / 102 → **FK 4.3** (highest of the 15) |
| Compliance self-check | **PASS.** No label ("black tax" never used). Third person. Respectful, factual. **Flag:** watch comment sentiment (A6). |

## C07 — Extended-family responsibility · new (consistent with H9)
| Field | Copy |
|---|---|
| Hook (7) | Parents, kids, a sister's fees. One payslip. |
| Primary text (73) | Parents. Kids. A sister's study fees. All on one payslip. In many homes that is normal, and it is done with love. It also means more people rely on one income than a form might show. A licensed adviser can map out who depends on that income, and what the cover needs to do. 30 minutes on video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | One payslip. Many people. Check it. |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (list).** A plain payslip shape in off-white outline. **Motion 0.3 s:** lines on the payslip fill in one by one with the words "Parents", "Kids", "Sister's fees", each with a small amber dot. No figures on the payslip. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** payslip at 80% scale. **1:1** static: the filled payslip + headline. |
| Video (20 s) | 0.0 Payslip on screen, line 1 fills · 1.5 line 2 · 3.0 line 3. CAP the hook · 4.5 cut: CAP "More people rely on one income than a form might show." **(payoff by 6 s)** · 8.0 cut: CAP "Done with love. Worth counting." · 10.5 cut: CAP "A licensed adviser maps out who depends on it." · 14.0 cut: CAP "30 minutes. Free to check." · 17.0 end card. |
| Reading grade | 10 / 73 / 97 → **FK 2.9** |
| Compliance self-check | **PASS.** Third person. No figures. No label. |

## C08 — Virtual convenience · H6 adapted
| Field | Copy |
|---|---|
| Hook (7) | No sales visit. No jargon. 30 minutes. |
| Primary text (56) | No sales visit. No jargon. Nobody at the front door. Just 30 minutes with a licensed adviser, on video, WhatsApp or phone. Pick a time that suits, right inside WhatsApp. The adviser looks at the real numbers and explains the gap in plain words. Free to check, and you decide after. Tap to check your cover. |
| Headline | 30 minutes. No sales visit. |
| CTA | Check my cover (WHATSAPP_MESSAGE for the CTWA version, LEARN_MORE otherwise) |
| Visual brief | **Static + motion, style K (strike-through).** Three lines on charcoal: "Sales visit", "Jargon", "Front-door knock". **Motion 0.3 s:** each is struck through in amber, one per beat. Then "30 minutes" lands large in amber. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same. **1:1** static: three struck lines + "30 minutes" + tick. |
| Video (18 s) | 0.0 Lines on screen. The first strike draws · 1.0 second strike · 2.0 third strike · 3.0 "30 minutes" lands. CAP the hook · 4.5 cut: chips "Video · WhatsApp · Phone". CAP "With a licensed adviser." **(payoff by 5 s)** · 7.5 cut: a mock WhatsApp time-picker (generic, no names). CAP "Pick a time inside WhatsApp." · 11.0 cut: CAP "Plain words. Real numbers." · 13.5 cut: CAP "Free to check. You decide after." · 15.5 end card. |
| Reading grade | 8 / 56 / 77 → **FK 3.4** |
| Compliance self-check | **PASS.** No promise about the broker's behaviour beyond the call format. The mock picker shows no adviser identity (F5). |

## C09 — Virtual convenience · new
| Field | Copy |
|---|---|
| Hook (7) | Lunch break. Phone or video. 30 minutes. |
| Primary text (69) | Lunch break. Phone or video. 30 minutes. That is all a cover check takes. No office visit, no traffic, no one in the lounge. A licensed adviser calls at the time picked in WhatsApp. They look at the real numbers and talk through the gap. A reminder comes before the call, and moving it is one tap. Free to check, and you decide after. Tap to check your cover. |
| Headline | A cover check in a lunch break |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (clock).** A simple clock face on charcoal. **Motion 0.3 s:** an amber 30-minute wedge sweeps from 12:30 to 13:00. Text: "Lunch break." / "Phone or video." / "30 minutes." It uses a midday slot on purpose, because broker default hours are 09–17 (0.3 #12), so the ad never implies evenings. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same. **1:1** static: clock with the wedge + hook. |
| Video (20 s) | 0.0 Clock + hook. The wedge sweeps · 2.5 cut: CAP "That is all a cover check takes." **(payoff by 3 s)** · 5.0 cut: CAP "No office. No traffic. No one in the lounge." · 8.0 cut: CAP "A licensed adviser calls at the time picked in WhatsApp." · 11.5 cut: a reminder bubble mock. CAP "A reminder first. Moving it is one tap." · 14.5 cut: CAP "Free to check. You decide after." · 17.0 end card. |
| Reading grade | 10 / 69 / 89 → **FK 2.3** |
| Compliance self-check | **PASS.** Reminder and reschedule match 3.5a statement 3 (the automated system). |

## C10 — Self-employed / no group cover · H7 adapted
| Field | Copy |
|---|---|
| Hook (7) | No boss. No payslip. No group cover. |
| Primary text (74) | No boss. No payslip. No group cover. People who work for themselves do not get the life cover that comes with a job. The only cover is the cover they set up. It is easy to put off when the business comes first. A licensed adviser can look at the real numbers in 30 minutes. On video, WhatsApp or phone, between jobs. Free to check, and you decide after. Tap to check your cover. |
| Headline | No group cover? Check the gap. |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (three nos).** Three stacked lines, each beginning "No" in amber. **Motion 0.3 s:** each line slides in from the left, one per beat. Then the three lines collapse to one: "The only cover is the cover they set up." **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same. **1:1** static: three "No" lines + headline. |
| Video (20 s) | 0.0 "No boss." · 1.0 "No payslip." · 2.0 "No group cover." CAP the hook · 3.5 cut: CAP "Self-employed means no work cover comes with it." **(payoff by 5 s)** · 6.5 cut: CAP "The only cover is the one they set up." · 9.5 cut: CAP "Easy to put off when the business comes first." · 12.5 cut: CAP "A licensed adviser checks it in 30 minutes. Between jobs." · 16.5 end card. |
| Reading grade | 10 / 74 / 97 → **FK 2.8** |
| Compliance self-check | **PASS.** Third person throughout ("people who work for themselves", "self-employed means…"). No figures. |

## C11 — Self-employed / no group cover · new
| Field | Copy |
|---|---|
| Hook (7) | Business owners: nobody sets up their cover. |
| Primary text (76) | Business owners plan stock, staff, tax and cash flow. Nobody plans their life cover for them. There is no HR team and no group scheme. If the owner is the business, the family relies on one person. A licensed adviser can look at the real numbers in 30 minutes, on video, WhatsApp or phone. Pick a time in WhatsApp that fits around the work. Free to check, and you decide after. Tap to check your cover. |
| Headline | When the owner is the business |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (to-do list).** A business to-do list on charcoal: "☑ Stock", "☑ Staff", "☑ Tax", "☑ Cash flow", "☐ Own cover" (the last one in amber). **Motion 0.3 s:** the ticks run down the list fast, then stop at the empty amber box. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same. **1:1** static: the list with the empty last box. |
| Video (20 s) | 0.0 List + hook. Ticks run · 2.5 stop at "☐ Own cover". CAP "Nobody plans it for them." **(payoff by 3 s)** · 5.0 cut: CAP "No HR team. No group scheme." · 7.5 cut: CAP "When the owner is the business, a family relies on one person." · 11.0 cut: CAP "A licensed adviser checks the real numbers. 30 minutes." · 14.5 cut: CAP "Book around the work, in WhatsApp. Free." · 17.0 end card. |
| Reading grade | 8 / 76 / 102 → **FK 4.0** |
| Compliance self-check | **PASS.** Calm, not fear: no death imagery, no "what if". |

## C12 — Myth-bust · H8
| Field | Copy |
|---|---|
| Hook (8) | Life cover costs less than most people think. |
| Primary text (74) | Life cover costs less than most people think. The only way to know is to check. The real cost depends on age, health, smoking and what the cover must do. A licensed adviser works it out with the real numbers in about 30 minutes. On video, WhatsApp or phone. There is no price in this ad, on purpose. Every family is different. Free to check, and you decide after. Tap to check your cover. |
| Headline | Life cover: check the real cost |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Static + video, style K (myth/fact card).** A card on charcoal with "MYTH" in off-white and a strike line: "Cover costs a fortune." **Motion 0.3 s:** the strike draws in amber and "FACT" flips in: "It costs less than most people think." Small line: "No price here, on purpose." No currency symbols anywhere. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same. **1:1** static: myth struck, fact shown. |
| Video (18 s) | 0.0 MYTH card + hook. Strike draws · 2.0 FACT flips. CAP "Costs less than most people think." · 4.0 cut: CAP "The real cost depends on age, health, smoking and the cover." **(payoff by 6 s)** · 7.5 cut: CAP "No price in this ad. On purpose." · 10.0 cut: CAP "A licensed adviser works it out. 30 minutes." · 13.0 cut: CAP "Free to check. You decide after." · 15.0 end card. |
| Reading grade | 9 / 74 / 100 → **FK 3.6** |
| Compliance self-check | No premium, no figure, no price hook: **PASS.** **Flag for compliance-qa:** "costs less than most people think" is a comparative claim. It needs a source on file (2.1.5 no fabricated statistics), or it must be dropped. The line is mandated in 4.2, so the decision sits with compliance-qa. Fallback hook if rejected: "Most guesses about cover cost are just guesses." |

## C13 — Myth-bust · new
| Field | Copy |
|---|---|
| Hook (8) | Checking cover is not the same as buying. |
| Primary text (62) | Checking cover is not the same as buying it. A cover check is a 30-minute talk with a licensed adviser. They look at the real numbers and show where the gaps are. Then the choice is yours, in your own time. Saying not now is a normal answer. The check is free, on video, WhatsApp or phone. Tap to check your cover. |
| Headline | A check, not a sale |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (two columns).** Two columns: "Checking" (amber tick) and "Buying" (grey). **Motion 0.3 s:** an amber "≠" drops between them. Under "Checking": "30 minutes", "real numbers", "free". Under "Buying": "later, if ever, your call", in grey. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** columns stacked vertically. **4:5** side by side. **1:1** static: two columns + "≠". |
| Video (18 s) | 0.0 Two words + "≠" drops. CAP the hook · 2.5 cut: CAP "A check is a 30-minute talk with a licensed adviser." **(payoff by 3 s)** · 5.5 cut: CAP "Real numbers. Where the gaps are." · 8.5 cut: CAP "Then the choice is yours." · 11.0 cut: CAP "'Not now' is a normal answer." · 13.5 cut: CAP "Free. Video, WhatsApp or phone." · 15.5 end card. |
| Reading grade | 7 / 62 / 80 → **FK 3.1** |
| Compliance self-check | **PASS.** Promises no outcome, only the structure of the call. "Your call" is about the decision, not money. |

## C14 — What the call is · H10 · **SUBMIT FIRST**
| Field | Copy |
|---|---|
| Hook (7) | Here's exactly what happens on the call. |
| Primary text (73) | Here's exactly what happens. Step 1: answer a few quick questions. Step 2: a WhatsApp message arrives in about a minute, with the adviser's name, photo and licence number. Step 3: pick a time in WhatsApp. Step 4: a 30-minute call on video, WhatsApp or phone. The adviser looks at the real numbers and explains the gap. Step 5: you decide after. No sales visit. Free to check. Tap to check your cover. |
| Headline | See every step before booking |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Screen-walkthrough video, code-rendered (not a real screen recording).** A phone frame on charcoal shows: (1) a 3-question form, (2) a WhatsApp intro card mock. The card shows **grey placeholder bars and a tick avatar, labelled "Example screen"**: no real or AI face, no name, no FSP number, because the broker's face is reserved for the real intro card (F5). Then (3) a time-picker mock and (4) a call screen with "30:00". Step numbers in amber circles. **Motion 0.3 s:** the phone slides up and step 1 lights. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full walkthrough. **4:5** phone at 85%. **1:1** static: 5 numbered steps as a list beside a small phone. |
| Video (28 s) | 0.0 Phone + hook. Step 1 lights. CAP "Here's exactly what happens." · 2.5 form mock. CAP "1. A few quick questions." · 5.0 cut: intro-card mock, "Example screen". CAP "2. A WhatsApp in about a minute: adviser name, photo, licence number." **(payoff by 5 s)** · 9.0 cut: time-picker. CAP "3. Pick a time in WhatsApp." · 12.0 cut: call screen. CAP "4. 30 minutes. Video, WhatsApp or phone." · 15.5 cut: CAP "The adviser looks at the real numbers and explains the gap." · 19.5 cut: CAP "5. You decide after." · 22.0 cut: CAP "No sales visit. Free to check." · 25.0 end card. |
| Reading grade | 10 / 73 / 105 → **FK 4.2** |
| Compliance self-check | **PASS.** No broker named or shown. The disclosure promise (name, licence number) matches 1.2 and the WhatsApp disclosure. "In about a minute" matches the < 60-s target without guaranteeing it. **Note for automation-engineer/landing-page-builder:** "a few quick questions" must stay true to the live form. |

## C15 — What the call is · new (4.2 task 7 line)
| Field | Copy |
|---|---|
| Hook (7) | Real numbers. A licensed adviser. Decide after. |
| Primary text (67) | Real numbers. A licensed adviser. Decide after. That is the whole call. SortMyCover does not sell cover or give advice. We find a time with a licensed adviser, and they do the check. They look at the bond, the income and who depends on it. They explain the gap in plain words. 30 minutes, on video, WhatsApp or phone. Free to check. Tap to check your cover. |
| Headline | Real numbers. Licensed adviser. |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (three beats).** Three words, one per beat, centred: "Real numbers." / "A licensed adviser." / "Decide after." The amber underline moves under each. Then a small off-white disclosure line: "SortMyCover does not sell cover or give advice." **Motion 0.3 s:** the first phrase slides up as the underline draws. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same. **1:1** static: three lines + disclosure + tick. |
| Video (18 s) | 0.0 "Real numbers." · 1.0 "A licensed adviser." · 2.0 "Decide after." CAP the hook · 3.5 cut: CAP "That is the whole call." **(payoff by 4 s)** · 5.5 cut: CAP "SortMyCover does not sell cover or give advice." · 8.5 cut: CAP "A licensed adviser looks at the bond, the income, who depends on it." · 12.0 cut: CAP "30 minutes. Video, WhatsApp or phone. Free." · 15.0 end card. |
| Reading grade | 11 / 67 / 90 → **FK 2.6** |
| Compliance self-check | **PASS.** It carries the 4D.2 rule-8 disclosure in short form. No broker. |

---

## Reading-grade table (hand-computed, primary text)
| C01 | C02 | C03 | C04 | C05 | C06 | C07 | C08 | C09 | C10 | C11 | C12 | C13 | C14 | C15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.8 | 3.9 | 2.8 | 3.3 | 3.0 | **4.3** | 2.9 | 3.4 | 2.3 | 2.8 | 4.0 | 3.6 | 3.1 | 4.2 | 2.6 |

All are ≤ 7 (the hard rule). All sit below the Grade 5–7 band, because ad copy is short sentences. The Unbounce finding is about not going above it. Headlines and captions are shorter still.

## Cross-concept compliance notes for compliance-qa
1. The only figures in any asset: "2–4×" and "3×" (salary multiples), "R1.4m" (illustrative bond, C02 only), "30 minutes", "28" and "40" (ages as life stage), step numbers. **No premium and no cover amount appear anywhere.**
2. "you" appears only in "you decide after", "Tap to check your cover" (the mandated end-card line) and "your own time". None of these asserts anything about the viewer's money, family, age or health.
3. Claims needing a source on file: C01 "2–4× salary" and "most bonds are bigger" (1.1 guide); C12 "costs less than most people think" (4.2 mandated, unsourced in the prompt).
4. Assets that show the booking/intro mechanic (C08, C09, C14) use placeholder bars and a tick avatar labelled "Example screen". No face, name or FSP number of any broker, real or invented.
5. The disclaimer line "SortMyCover does not sell cover or give advice" appears in C15. It can be added as a 1:1 footer line on every static if compliance-qa wants it.
