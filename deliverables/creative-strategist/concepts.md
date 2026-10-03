# SortMyCover — 15 ad concepts (cycle 1)

**Owner:** creative-strategist · **Status:** v1.1.1 (v1.1 fix wave 1 + compliance review 3 follow-up: the myth-bust page serves C12 / H18; C13 has its own H1, H16), fix wave 1 applied (compliance-qa `phase4-review-2.md` §1 + `performance-creative-director/hook-library-v2.md`). Next: compliance-qa re-check of the two new texts (C02 H12, C12 H18), then visual-producer re-renders C01, C02, C03, C05, C12, C14 (4D.5 code pipeline), then meta-operator submits. **Date:** 2026-10-02
**Rules applied:** broker-neutral (1.2). No product, insurer, premium, cover amount or broker. No second-person money, family, age or health claims (2.1.8). No unsourced "most / never" statistics (2.1.5). No fear, no price hook, no price anchor, no testimonial. No exclamation marks. Grade ≤ 7. Hooks ≤ 8 words. Primary text ≤ 90 words. CTA from the "Check my cover" family, never "get a quote".

## Fix wave 1 — what changed (v1.0 → v1.1 → v1.1.1)

| Concept | Change | Source |
|---|---|---|
| C01 | "Most bonds are bigger than that." → "Many bonds are bigger than that." Video beat 2 → "The bond and the bills don't." (the bond + school + bills bar runs past the work-cover bar) | compliance-qa C-1; hook-library-v2 H1 |
| C02 | Cycle 1 runs H12 "3 lines on a payslip worth a look." (new copy). The R1.4m H2 version moves to reserve as **C02-R, hold: NH-PCD-02** | compliance-qa C-7 / 1b; hook-library-v2 H2, H12 |
| C03 | Hook → "Bond approved. Champagne open. Cover checked?" Unsourced "most new owners skip… never check" → "one job that is easy to skip: checking the life cover still fits the new debt." | compliance-qa C-2; hook-library-v2 H3, NH-PCD-03 |
| C04 | "It happens a lot." deleted. Headline → "New family. Check the old cover." | compliance-qa C-4, C-5 |
| C05 | Hook and first line → "Cover set up at 28. Life at 40." Repeated "Cover set up at 28" later in the text → "That cover". | hook-library-v2 H5 |
| C12 | Ships H18 "No price in this ad. On purpose." The MYTH/FACT card is gone. The H8 claim version moves to reserve as **C12-R, hold: NH-PCD-04** | compliance-qa C-6 / 1a; hook-library-v2 H8, H18 |
| C13 | In for cycle 1. **v1.1.1:** C13 no longer supplies the myth-bust page H1. The page serves C12 / H18 (landing `myth-bust.json` keeps H18), and C13's own H1 is its hook-library-v2 hook H16 "Checking cover is not the same as buying." | compliance-qa 1a; compliance review 3 (coordinator decision) |
| C14 | "name, photo and licence number" → "name and licence number" (copy and caption) | compliance-qa C-3 |
| All | Everyday-spend price anchor removed from every file (declined, NH-PCD-05) | compliance-qa 1b |

## Submit first, and test first

| Mark | Concepts | Why |
|---|---|---|
| **First 3 for Meta approval (2.1.8), confirmed by compliance-qa** | **C01** (employer-cover gap), **C03** (trigger: bond), **C14** (what the call is) | They cover the riskiest pattern we rely on (a number in the hook), the life-event pattern, and the plain explainer. If all three pass, the other 12 follow the same patterns. **C01 condition:** the "2–4× salary" guide URL and quote must be in `deliverables/verified-facts.md` before GATE-ADS-APPROVE-3. If it is not on file at submission, C01's hook becomes "Work cover is often a few times salary." |
| **Two strongest hooks for the 4D.4a test matrix** | **C01 / H1** "Most work life cover stops at 2–4× salary." and **C03 / H3** "Bond approved. Champagne open. Cover checked?" | These are the H1 and H3 slots in 4D.4a. Arms: amber vs teal × static vs video, one variable per arm (Loomer method). |

## Angle map (15 concepts, at least 2 per angle)

| Angle (4.2) | Concepts | Hook ID (hook-library-v2) |
|---|---|---|
| 1. Employer-cover gap | C01, C02 | H1, H12 |
| 2. Trigger events | C03 (new bond), C04 (new baby), C05 (turned 40) | H3, H4, H5 |
| 3. Extended-family responsibility | C06, C07 | H9, H13 |
| 4. Virtual convenience | C08, C09 | H6, H14 |
| 5. Self-employed / no group cover | C10, C11 | H7, H15 |
| 6. Myth-bust | C12, C13 | H18, H16 |
| 7. What the call is | C14, C15 | H10, H17 |
| **Reserve (rendered, not uploaded)** | **C02-R** (H2, hold: NH-PCD-02) · **C12-R** (H8, hold: NH-PCD-04) | H11 only once real, consenting quotes exist. |

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
| Primary text (65 words) | Most work life cover stops at 2 to 4 times salary. Many bonds are bigger than that. Add school fees, the car and the monthly bills. The gap is easy to miss. A licensed adviser can look at the real numbers with you in 30 minutes. On video, WhatsApp or phone. It costs nothing to check, and you decide after. Tap to check your cover. |
| Headline | Work cover vs the bond. Check the gap. |
| CTA | Check my cover (button LEARN_MORE) |
| Visual brief | **Style G.** Charcoal field. Frame 1: hook in off-white, with "2–4×" in amber. Below it, a short amber bar labelled "Work cover". **Motion 0.3 s:** the amber bar grows from 0 and stops short. At 2.5 s a long outlined bar labelled "Bond + school + bills" slides out past the amber bar and off the right edge. Bracket and label "the gap" appear between the bar ends. **Type:** hook 800 / labels 500 / caption 500. **Caption:** "Most work life cover stops at 2–4× salary." **End card:** "Sort your cover. 30 minutes. A real adviser." + "Tap to check your cover". |
| Variants | **9:16** full script below. **4:5** same script, with the bars stacked vertically to fit. **1:1** static: hook top, the two bars and the "the gap" bracket in the middle, headline bottom, tick bottom-left. |
| Video (22 s) | 0.0 Hook on screen (K slam) · 0.3 amber "Work cover" bar grows and stops short. CAP "Most work life cover stops at 2–4× salary." · 2.5 cut: the "Bond + school + bills" bar runs past it. CAP "The bond and the bills don't." **(payoff by 3 s)** · 5.0 cut: bracket "the gap" appears and pulses once. CAP "That space is the gap." · 8.0 cut: tick icon. CAP "A licensed adviser can check it in 30 minutes." · 12.0 cut: three chips "Video · WhatsApp · Phone". CAP "From home. Free to check." · 16.0 cut: CAP "You decide after." · 19.0 end card. |
| Reading grade | 8 sentences, 65 words, 84 syllables → **FK 2.8** |
| Compliance self-check | No product / insurer / premium / cover amount / broker / second-person money claim / fear / price hook / testimonial: **PASS.** "Many bonds" replaces the unsourced "most" (C-1). **Condition (compliance-qa 1a):** the "2–4× salary" guide URL and quote go into `deliverables/verified-facts.md` before submission; fallback hook "Work cover is often a few times salary." |

## C02 — Employer-cover gap · H12 (cycle 1)
| Field | Copy |
|---|---|
| Hook (8) | 3 lines on a payslip worth a look. |
| Primary text (85) | 3 lines on a payslip worth a look. Line 1: gross pay and net pay. Line 2: the retirement fund. Line 3: group life cover. How many times salary does it pay? If the payslip does not say, HR can tell. That line shows what work cover pays, not what the bond and the bills need. A licensed adviser can look at the real numbers in 30 minutes. On video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | Line 3 is the cover line |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (checklist on a document).** A plain payslip outline in off-white on charcoal, with three blank line slots and no figures. It is drawn wider and shorter than the C07 payslip, and an amber highlight bar moves down it (C07 fills names; C02 is a checklist), so the two stay distinct. **Motion 0.3 s:** the outline draws and line 1 highlights "Gross vs net". Line 2 "Retirement fund". Line 3 "Group life cover: how many × salary?" in amber. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full script. **4:5** same, payslip at 85%. **1:1** static: the payslip with line 3 highlighted in amber + headline + tick. |
| Video (18 s) | 0.0 Payslip outline + hook on screen · 0.3 line 1 highlights "Gross vs net" · 2.0 line 2 "Retirement fund" · 4.5 line 3 turns amber "Group life cover: how many × salary?" **(payoff by 5 s)** · 7.5 cut: CAP "Work cover vs the bond and the bills." · 10.5 cut: CAP "A licensed adviser checks the real numbers. 30 minutes." · 13.0 cut: CAP "Video, WhatsApp or phone. Free to check." · 15.0 end card. |
| Reading grade | 11 / 85 / 110 → **FK 2.7** |
| Compliance self-check | **PASS (self).** No rand figure, no cover amount, no premium, no statistic. "A payslip", never "your payslip". Items 1–2 are neutral payslip lines. Message-matches the learn page `how-to-read-your-payslips-cover-line.html`. **New copy: needs compliance-qa re-check before upload.** |

### C02-R — reserve · H2 · **hold: NH-PCD-02** (rendered, not uploaded)
| Field | Copy |
|---|---|
| Hook (8) | R1.4m bond. 3× salary cover. Do the maths. |
| Primary text (78) | Here is one made-up example. A family has a R1.4 million bond. Work cover pays 3 times salary. For many salaries, that is less than the bond. And the bond is only one cost. Kids, school and monthly bills come on top. This is an example, not advice. Every family's numbers are different. A licensed adviser can work out the real gap in 30 minutes. On video, WhatsApp or phone. Free to check. Tap to check your cover. |
| Headline | An example, not advice. Check the real gap. |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Static + 6-s motion, style K.** A "sum" layout set in type: "R1.4m bond", "3× salary cover", a rule line, then "= ?" in amber, which turns into "= a gap". Corner tag: "Illustrative example. Not advice." |
| Variants | **9:16** 6-s loop + end card. **4:5** same. **1:1** static maths stack + tag + tick. |
| Video (15 s) | 0.0 Maths stack. CAP "R1.4m bond. 3× salary cover." · 0.4 rule line draws · 2.0 "= a gap". CAP "For many salaries, that is less than the bond." · 5.0 CAP "An example. Every family's numbers differ." · 8.0 CAP "A licensed adviser works out the real gap in 30 minutes." · 12.0 end card. |
| Reading grade | 12 / 78 / 112 → **FK 3.9** |
| Status | **Not approved for cycle 1** (compliance-qa 1b: a rand figure on the gap sits too close to a cover-amount recommendation, 2.1.1 / 4.5 row 4). Revisit only after the practitioner opinion. |

## C03 — Trigger: new bond · H3 · **SUBMIT FIRST · TEST MATRIX**
| Field | Copy |
|---|---|
| Hook (6) | Bond approved. Champagne open. Cover checked? |
| Primary text (68) | Bond approved. Champagne open. Keys next week. Then there is one job that is easy to skip: checking the life cover still fits the new debt. A bond can be the biggest number a family ever signs. A licensed adviser can check the full picture in 30 minutes. On video, WhatsApp or phone, from home. Free to check, and you decide after. Tap to check your cover. |
| Headline | The one job after bond approval |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style K (Reels POV in type).** A three-item checklist on charcoal: "☑ Bond approved", "☑ Champagne open", "☐ Cover checked?", with the last box outlined in amber. **Motion 0.2 s:** the ticks draw on lines 1 and 2 in sequence. Box 3 stays empty. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full script. **4:5** checklist centred, smaller type. **1:1** static: the checklist with box 3 empty, headline under it. |
| Video (22 s) | 0.0 Checklist on screen. Ticks draw on lines 1–2. CAP "Bond approved. Champagne open." · 2.5 cut: line 3 pulses. CAP "Cover checked?" · 4.5 cut: CAP "A new bond can outgrow old cover." **(payoff by 5 s)** · 7.5 cut: big type "The biggest number a family ever signs." · 10.5 cut: tick icon. CAP "A licensed adviser checks it in 30 minutes." · 14.0 cut: chips "Video · WhatsApp · Phone". CAP "From home. Free to check." · 17.0 cut: CAP "You decide after." · 19.0 end card. |
| Reading grade | 9 / 68 / 90 → **FK 3.0** |
| Compliance self-check | **PASS.** Third-person scene, no "you have a bond", no figures, no fear. The unsourced "most / never" clause is gone (C-2, NH-PCD-03). "Cover checked?" is part of the scene's checklist, not a question about the viewer. |

## C04 — Trigger: new baby · H4
| Field | Copy |
|---|---|
| Hook (7) | New baby. New bond. Same old cover? |
| Primary text (70) | New baby. New bond. Same old cover. Cover gets set up once, often years ago, and then nobody looks at it again. But a new child changes who depends on an income, and for how long. A licensed adviser can check if the old cover still fits the new family. 30 minutes on video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | New family. Check the old cover. |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Carousel, 3 cards (4D.4a H4) + a K-style video.** Card 1 "New baby." Card 2 "New bond." Card 3 "Same old cover?", with "old" struck through in amber and "→ check it" added. Each card has an amber word and a simple line icon (pram, house outline, tick). **Motion 0.3 s (video):** the three words drop in one per beat. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** video. **4:5** video. **1:1** carousel (3 cards plus an end card as card 4). |
| Video (18 s) | 0.0 "New baby." on screen, pram icon draws · 1.0 "New bond." · 2.0 "Same old cover?" CAP the hook · 3.5 cut: CAP "Cover often gets set up once, then left." · 5.5 cut: CAP "A new child changes who depends on an income." **(payoff by 6 s)** · 8.5 cut: CAP "A licensed adviser checks if it still fits. 30 minutes." · 12.0 cut: CAP "Video, WhatsApp or phone. Free to check." · 15.0 end card. |
| Reading grade | 9 / 70 / 94 → **FK 3.3** |
| Compliance self-check | **PASS.** No "your baby". The question sits on a scene, not the viewer. No figures. Unsourced "It happens a lot." removed (C-4). Headline no longer a question to the viewer (C-5). |

## C05 — Trigger: turned 40 · H5
| Field | Copy |
|---|---|
| Hook (8) | Cover set up at 28. Life at 40. |
| Primary text (62) | Cover set up at 28. Life at 40. A bond. Kids in school. Maybe parents to help. That cover was built for a smaller life. Nobody sends a reminder to check it. A licensed adviser can look at what still fits, in 30 minutes. On video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | At 40, check what still fits |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Style G (growth).** A small amber box labelled "Cover at 28" sits inside a frame labelled "Life at 40". **Motion 0.3 s:** the outer frame grows in steps labelled "bond", "kids", "school", "parents", while the amber box stays the same size. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same, with the steps stacked. **1:1** static: the final state (small amber box in a big frame) + hook. |
| Video (20 s) | 0.0 Hook on screen. The frame starts growing · 2.0 cut: labels "Bond. Kids. School." step in. CAP "Life got bigger." · 4.5 cut: amber box "Cover at 28" stays small. CAP "The cover did not grow with it." **(payoff by 5 s)** · 7.0 cut: CAP "Nobody sends a reminder to check." · 10.0 cut: CAP "A licensed adviser looks at what still fits. 30 minutes." · 14.0 cut: CAP "Video, WhatsApp or phone. Free." · 17.0 end card. |
| Reading grade | 11 / 62 / 82 → **FK 2.2** |
| Compliance self-check | **PASS.** Ages appear as life stages, not "you are 40". No figures beyond the ages. "The cover did not grow" is generic, not a claim about the viewer. |

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
| Compliance self-check | **PASS.** No label ever used for the practice. Third person. Respectful, factual. **Flag:** watch comment sentiment (A6). |

## C07 — Extended-family responsibility · H13
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

## C08 — Virtual convenience · H6
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

## C09 — Virtual convenience · H14
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

## C10 — Self-employed / no group cover · H7
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

## C11 — Self-employed / no group cover · H15
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

## C12 — Myth-bust · H18 (cycle 1)
| Field | Copy |
|---|---|
| Hook (7) | No price in this ad. On purpose. |
| Primary text (59) | No price in this ad. On purpose. The real cost of life cover depends on age, health, smoking and what the cover must do. A licensed adviser works it out with the real numbers in about 30 minutes. On video, WhatsApp or phone. Every family is different. Free to check, and you decide after. Tap to check your cover. |
| Headline | Life cover: check the real cost |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Static + video, style K (blank price tag).** A blank price-tag outline in off-white on charcoal, with nothing written on it. **Motion 0.3 s:** an amber strike draws through the empty tag. Then "On purpose." lands under it. No currency symbols, no figures, no MYTH/FACT card anywhere. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full. **4:5** same. **1:1** static: the struck blank tag + hook + tick. |
| Video (18 s) | 0.0 Blank price tag + hook. 0.3 amber strike draws · 2.5 cut: big type "The real cost depends on…" CAP "Age, health, smoking and what the cover must do." **(payoff by 3 s)** · 6.0 cut: CAP "Every family is different." · 8.5 cut: CAP "A licensed adviser works it out. 30 minutes." · 11.5 cut: CAP "Video, WhatsApp or phone." · 13.0 cut: CAP "Free to check. You decide after." · 15.0 end card. |
| Reading grade | 8 / 59 / 82 → **FK 3.7** |
| Compliance self-check | **PASS (self).** No premium, no figure, no comparative claim. The hook is literally true: the ad has no price. **New copy: needs compliance-qa re-check before upload.** For message match, the myth-bust landing page H1 is this ad's hook, H18 (landing `myth-bust.json`; decided in compliance review 3). |

### C12-R — reserve · H8 · **hold: NH-PCD-04** (not rendered for upload)
| Field | Copy |
|---|---|
| Hook (8) | Life cover costs less than most people think. |
| Status | **Held.** The claim has no source on file (2.1.5). It runs only if Jonathan files a source (an SA source preferred) and compliance-qa clears it. The old MYTH card ("Cover costs a fortune") is retired with it, because it makes the same claim. If it comes back, the primary text is the C12 text above with the hook as its first sentence. |

## C13 — Myth-bust · H16 · **cycle 1 (own H1: H16 "Checking cover is not the same as buying."; the myth-bust page serves C12 / H18)**
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
| Primary text (72) | Here's exactly what happens. Step 1: answer a few quick questions. Step 2: a WhatsApp message arrives in about a minute, with the adviser's name and licence number. Step 3: pick a time in WhatsApp. Step 4: a 30-minute call on video, WhatsApp or phone. The adviser looks at the real numbers and explains the gap. Step 5: you decide after. No sales visit. Free to check. Tap to check your cover. |
| Headline | See every step before booking |
| CTA | Check my cover (LEARN_MORE) |
| Visual brief | **Screen-walkthrough video, code-rendered (not a real screen recording).** A phone frame on charcoal shows: (1) a 3-question form, (2) a WhatsApp intro card mock. The card shows **grey placeholder bars and a tick avatar, labelled "Example screen"**: no real or AI face, no name, no FSP number, because the broker's face is reserved for the real intro card (F5). Then (3) a time-picker mock and (4) a call screen with "30:00". Step numbers in amber circles. **Motion 0.3 s:** the phone slides up and step 1 lights. **Caption:** the hook. **End card:** the line + "Tap to check your cover". |
| Variants | **9:16** full walkthrough. **4:5** phone at 85%. **1:1** static: 5 numbered steps as a list beside a small phone. |
| Video (28 s) | 0.0 Phone + hook. Step 1 lights. CAP "Here's exactly what happens." · 2.5 form mock. CAP "1. A few quick questions." · 5.0 cut: intro-card mock, "Example screen". CAP "2. A WhatsApp in about a minute: adviser name and licence number." **(payoff by 5 s)** · 9.0 cut: time-picker. CAP "3. Pick a time in WhatsApp." · 12.0 cut: call screen. CAP "4. 30 minutes. Video, WhatsApp or phone." · 15.5 cut: CAP "The adviser looks at the real numbers and explains the gap." · 19.5 cut: CAP "5. You decide after." · 22.0 cut: CAP "No sales visit. Free to check." · 25.0 end card. |
| Reading grade | 10 / 72 / 103 → **FK 4.1** |
| Compliance self-check | **PASS.** No broker named or shown. "Photo" removed, because the headshot is not a go-live requirement (C-3). The disclosure promise (name, licence number) matches 1.2 and the WhatsApp disclosure. "In about a minute" matches the < 60-s target and is not a promise of a set time. **Note for automation-engineer/landing-page-builder:** "a few quick questions" must stay true to the live form. |

## C15 — What the call is · H17
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
| Compliance self-check | **PASS.** It carries the 4D.2 rule-8 disclosure in short form. compliance-qa (C-9) does not want it added to every static. No broker. |

---

## DRAFT concepts C16 and C17 (added 2026-10-03, pending compliance-qa, not for upload)

**Why these two:** Jonathan's direction is clients who would easily pay for cover and are looking for it now. C16 is the bond-paperwork moment (best on both signals in `angle-ranking.md`). C17 reaches people who already pay for cover and are open to a review. Both are educational and third person, with no premium, product, insurer, comparison or "cheaper / save" claim. Disclosure on the end card, short form as in the rendered assets: "A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes." The full footer line comes from `landing/config/consent.json`. CTA goes to the quiz. Landing configs: `landing/angles/_draft/bond-paperwork.json` and `policy-review.json` (a sub-folder so the angle build does not pick them up; move up one level once cleared).

### C16 — Trigger: bond paperwork · DRAFT, pending compliance-qa
| Field | Copy |
|---|---|
| Hook H1 (7) | Bond signing day is busy. |
| Hook H2 (8) | Signing day is busy. Cover is a separate job. |
| Hook H3 (7) | Bond signing day is busy. |
| Primary text (61) | Bond signing day is busy. There are pages to read and papers to sign. Checking life cover is a separate job, and it is easy to leave for later. A licensed adviser can look at the actual numbers in 30 minutes. On video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | Bond signing day is busy |
| Description | A free 30-minute check with a licensed adviser. |
| CTA | Check my cover (LEARN_MORE; quiz) |
| Visual brief | **Style K (document stack).** Charcoal field. A stack of plain off-white paper outlines with tabs: "Offer", "Bond", "Cover check". **Motion 0.3 s:** the "Cover check" tab slides out and turns amber. Lines on it are blank bars, no figures. No bank name, no logo, no insurer, no cover amount. **Caption:** the hook. **End card:** the line + "Tap to check your cover" + the short disclosure. |
| Variants | **9:16** full script. **4:5** stack centred, type x0.85. **1:1** static: the stack with the amber tab, hook, tick bottom-left. |
| Video (20 s, 9:16, code-rendered) | 0.0 Stack on screen, hook readable. CAP the hook · 0.3 "Cover check" tab slides out, amber · 2.5 cut: pages flick past. CAP "Signing day is busy." · 5.0 cut: the "Cover check" page fills the frame with blank bars. CAP "Checking life cover is a separate job." **(payoff by 5 s)** · 8.0 cut: tick icon. CAP "A licensed adviser can look at the actual numbers. 30 minutes." · 12.0 cut: chips "Video · WhatsApp · Phone". CAP "Free to check." · 15.0 cut: CAP "You decide after." · 17.0 end card + disclosure. |
| Landing angle wording | **H1:** "Bond signing day *is busy.*" · **Sub:** "Checking life cover is a separate job. A licensed adviser can look at the actual numbers in 30 minutes." · **Gap line:** "Signing day is busy. Checking life cover is a separate job, and a licensed adviser can look at the actual numbers." |
| Reading grade | 8 sentences, 61 words → about **FK 3** (hand estimate). Re-run `fk_check.py`. |
| Compliance self-check | **Third person, no figure, no premium, no insurer, no bank, no comparison, no "cheaper / save".** The v1 idea "banks ask for life cover" and "most people sign whatever comes" are **not used**: the first can read as a requirement, the second is an unsourced "most" (C-2 precedent). **For compliance-qa:** (1) "bond paperwork often includes a cover form" is a factual claim and needs a source in `deliverables/verified-facts.md`. If none, the concept stays out of the live set and the fallback is C03. (2) The adviser "goes through" the form; the ad says nothing about what the form contains, whether it is good, or what to do about it. Please confirm that wording does not read as a product comparison. (3) H2 is an imperative; it asserts nothing about the viewer. (4) A scene of paperwork shows no real bank or broker. |

### C17 — Policy review for existing payers · DRAFT, pending compliance-qa
| Field | Copy |
|---|---|
| Hook H1 (8) | Cover from 10 years ago. Life moved on. |
| Hook H2 (8) | Old cover. New life. A 30-minute check. |
| Hook H3 (7) | Life changes. Cover can stay put. |
| Primary text (59) | Cover taken out 10 years ago. Life looks different now. Jobs change. Homes change. Families grow. Cover can be left as it was set up. A licensed adviser can look at what is in place and what has changed. 30 minutes, on video, WhatsApp or phone. Free to check, and you decide after. Tap to check your cover. |
| Headline | Old cover. New life. A free review. |
| Description | A free 30-minute review with a licensed adviser. Video, WhatsApp or phone. |
| CTA | Check my cover (LEARN_MORE; quiz) |
| Visual brief | **Style K (document with a date stamp).** One plain document outline on charcoal. A faded stamp reads "Set up 10 years ago". Beside it a field "Last looked at:" stays blank. Different from C05 (no growing frame and no ages). **Motion 0.3 s:** the stamp thuds in. Then life words drop beside the document one per beat: "New job." "New home." "New family." **Caption:** the hook. **End card:** the line + "Tap to check your cover" + the short disclosure. |
| Variants | **9:16** full script. **4:5** document left, words stacked right. **1:1** static: document, stamp, blank "Last looked at:" field, hook, tick. |
| Video (20 s, 9:16, code-rendered) | 0.0 Document + stamp "Set up 10 years ago", hook readable. CAP the hook · 0.3 stamp thuds in · 2.5 cut: "New job." "New home." "New family." drop in, one per beat. CAP "Life looks different now." **(payoff by 3 s)** · 6.0 cut: the "Last looked at:" field stays blank. CAP "Cover can be left as it was set up." · 9.0 cut: tick icon. CAP "A licensed adviser can look at what is in place and what has changed." · 13.0 cut: CAP "30 minutes. Video, WhatsApp or phone. Free." · 15.5 cut: CAP "You decide after." · 17.0 end card + disclosure. |
| Landing angle wording | **H1:** "Cover from 10 years ago. *Life moved on.*" · **Sub:** "Jobs, homes and families change. A licensed adviser can look at what is in place, in 30 minutes. No obligation." · **Gap line:** "Cover can be left as it was set up. A review looks at what is in place and what has changed." |
| Reading grade | 11 sentences, 59 words → about **FK 2 to 3** (hand estimate). Re-run `fk_check.py`. |
| Compliance self-check | **Third person, no premium, no insurer, no product, no comparison, no "cheaper / save", no advice to keep, cancel or replace anything.** "10 years" is a scene, not a claim about the viewer. **For compliance-qa:** (1) "Cover is often left exactly as it was set up" is a soft frequency claim, the same kind as C04 ("often years ago") which cleared. (2) H3 "Nobody sends a reminder" is the C05 line; it is an absolute, so cut it if you now read it as unsourced. (3) The adviser "looks at what is in place": please confirm that does not reach into replacement advice. Keep any replacement talk out of the ad and the landing page. (4) "Still a fit?" was considered for H2 and dropped, because a question aimed at the viewer implies they hold cover (C-5 precedent). |

---

## Reading-grade table (hand-computed, primary text, cycle-1 set)
| C01 | C02 | C03 | C04 | C05 | C06 | C07 | C08 | C09 | C10 | C11 | C12 | C13 | C14 | C15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.8 | 2.7 | 3.0 | 3.3 | 2.2 | **4.3** | 2.9 | 3.4 | 2.3 | 2.8 | 4.0 | 3.7 | 3.1 | 4.1 | 2.6 |

All are ≤ 7 (the hard rule). All sit below the Grade 5–7 band, because ad copy is short sentences. The Unbounce finding is about not going above it. Headlines and captions are shorter still.

## Cross-concept compliance notes for compliance-qa
1. The only figures in any cycle-1 asset: "2–4×" (salary multiple, C01), "×" as a symbol in C02's "how many × salary?", "30 minutes", "28" and "40" (ages as life stage), step and line numbers. **No rand figure, no premium and no cover amount appear in any cycle-1 asset.** The R1.4m figure lives only in reserve C02-R (hold: NH-PCD-02).
2. "you" appears only in "you decide after", "Tap to check your cover" (the mandated end-card line) and "your own time". None of these asserts anything about the viewer's money, family, age or health.
3. Claims needing a source on file: C01 "2–4× salary" (1.1 guide → `verified-facts.md`). "Many bonds are bigger" is a soft, non-numeric statement per C-1. The H8 claim is held in C12-R (NH-PCD-04).
4. Assets that show the booking/intro mechanic (C08, C09, C14) use placeholder bars and a tick avatar labelled "Example screen". No face, name or FSP number of any broker, real or invented.
5. The disclaimer line "SortMyCover does not sell cover or give advice" appears in C15 only (C-9).
6. No price anchor of any kind (everyday-spend comparison declined, NH-PCD-05).
