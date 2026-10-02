# SortMyCover — Brand Bible v1

Version: BB-v1.0 · 2 Oct 2026 · Owner: `brand-naming-lead` (direction, rules, trust layer) · Build: `visual-producer` (SVG, exports, templates, PDF render) · Checks: `search-findability-lead` (favicon, manifest, OG, schema) · Gate: `compliance-qa`

This Markdown is the source text for `brand/brand-bible.pdf`. `visual-producer` renders the PDF from it and fills every `{{tokens.…}}` placeholder from `brand/tokens.json`. Colour values live in **one place only**: `brand/tokens.json` / `brand/tokens.css` (6B.8). This file gives **no** hex values, so it cannot drift from the tokens. Where this file and `tokens.json` disagree on a value, the tokens are correct and this file gets fixed.

Status words: **Rule** = must. **Proposal** = a default until `visual-producer`'s real-size test confirms it. **Test** = something we measure in production, not something we already know.

---

## 0. The brand on one page

| Asset | What it is | Why we invest in it |
|---|---|---|
| **Name** | SortMyCover (written as one word, capital S, M, C) | The name is the positioning: it states what the customer gets done, in the customer's words (Neumeier). |
| **Shape** | The **tick**, drawn as the "o" in Cover and used alone as the icon | Logos rank highest for recall (Ehrenberg-Bass / Romaniuk). The tick means "sorted" and still reads at 16 px. |
| **Colour** | Amber accent on deep charcoal, with off-white | Picked for contrast in the feed and because no SA insurer uses it. Colour supports the brand. It does not carry it (only ~4% of brands own a colour). |
| **Type** | One geometric sans, weight 800 for headlines and 500 for body | Plain and easy to read on a phone. |
| **Line** | **Sort your cover. 30 minutes. A real adviser.** | Always the exact same words. A line only works if it is repeated without change (Romaniuk: only ~6% of taglines are owned). |
| **Disclosure** | "SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums." | People trust what they can check, not a colour (Labrecque & Milne). |

**The one rule above all:** the same name, tick, colour, line and disclosure go on every ad, page, WhatsApp header, intro card and document, every time (Binet & Field: consistency is the cheapest media). When a surface breaks the kit, compliance-qa fails it.

---

## 1. Brand story (150 words)

Most working parents with a bond have life cover through work and assume it is enough. Work cover usually stops at two to four times salary. Bonds, school fees and the people who rely on one income often add up to more. Few people check, because checking sounds like a sales visit, jargon and a lost morning.

SortMyCover makes checking easy. A short page explains the cover gap in plain words. Within a minute, a WhatsApp message introduces a real, licensed adviser by name, with their practice and FSP number. Then comes a 30-minute call on WhatsApp, video or phone, at a time that suits the person. No sales visit. No jargon. No obligation.

SortMyCover does not sell cover, give advice or compare products. It is a service of Lead Velocity (Pty) Ltd. Advisers pay it a flat fee, never commission.

Sort your cover. 30 minutes. A real adviser.

---

## 2. Why the name is SortMyCover

**Decided** (0.1). This section records why, so nobody reopens it.

1. **The name says what happens, not what we are** (4D.2 rule 2). "Sort my cover" is the job the customer wants done, said the way they would say it. It does not use insure, assure, advisory, broker, financial or "life" on its own, so it never claims to be an insurer, an adviser or an FSP. That limits FAIS and ARB exposure for a misleading name.
2. **The name is the positioning** (Neumeier, *Zag*). In SA life cover, nearly every brand promises protection with shields, umbrellas, families and blue. SortMyCover goes the other way. It promises an action and an outcome, "sorted", which the tick then shows. When everyone else zigs, we zag, so we only have to say it once.
3. **Typable in one go** (4D.2 rule 3, Meta Search Lift). Meta ads raise branded search: about +4% on average, and up to +39% in some cases. People who see the ad will type the name. "sortmycover" is three everyday English words. It has no hyphen, no odd spelling and no number, and the `.co.za` is an exact match.
   - *Honest gap:* rule 3 says ≤ 2 words and ≤ 10 characters is ideal. SortMyCover has 11 characters and three spoken words. We accept this because the name is already decided. We reduce the risk by always writing it as one CamelCase word, by owning the exact `.co.za` and `.com`, and by checking branded search in Search Console from week 1 (misspellings such as "sortmycovers" and "sort-my-cover" go to search-findability-lead's watch list).
4. **No negative meaning in SA languages** is not assumed. It is checked by native-speaker review (see `deliverables/brand-naming-lead/availability-checks.md`, section F).
5. **It must pass every availability check** (CIPC, `.co.za`, `.com`, trademark classes 35/36, Meta Page and handles). If a check fails, that is a `needs_human` stop. We do not quietly pick a new name.

**C-claim to test, not to believe:** "friendly names convert better in finance" (4D.6). With only one name live, we cannot isolate this. We record the WhatsApp reply rate in week 1 against the 4.6 model as a proxy, and we never quote it as proof.

---

## 3. The system: one name, one colour, one shape, one line

| Element | Rule |
|---|---|
| Name | Always "SortMyCover", one word, capitals S-M-C. Never "Sort My Cover", "SMC", "Sortmycover" or "SortMyCover.co.za" in running text. In a URL it is lower case: `sortmycover.co.za`. |
| Shape | The tick in a circle. It is the only device. No shields, umbrellas, family silhouettes, hearts, hands, houses or arrows. |
| Colour | Amber, charcoal and off-white (section 6). Nothing else in brand surfaces. |
| Line | "Sort your cover. 30 minutes. A real adviser." Stated once per asset, exact words, exact punctuation. Never translated in place, shortened, or rewritten as "Get your cover sorted" and the like. |
| Disclosure | The rule-8 line, or one of its approved short forms in `deliverables/brand-naming-lead/disclosure-wording.md`. Never re-worded on the fly. |

*Note:* 4D.4b.4 calls it "the seven-word line". It has eight words if you count "30". Either way it is used verbatim (flagged `needs_human` NH-BN-03 so the text gets fixed).

---

## 4. Logo system

`visual-producer` builds the masters as hand-directed, code-built SVG in `brand/logo/` (PNG @1x/@2x/@3x exports in `brand/exports/`). The reasons: a vector scales from 16 px to 1920 px, a code-built mark has clear human authorship and can be registered at CIPC, and generators give no exclusivity (4D.4b tooling decision). **Never ask Google Flow or any image model for the logo, the tick, icons or any text-bearing brand element.**

The variant names below are the 4D.4b.1 names. File names are whatever `visual-producer` ships in `brand/logo/`, and its README maps them to these names.

| Variant | Use | Colour versions |
|---|---|---|
| **Primary wordmark**, "SortMyCover" with the tick as the "o" in Cover | Site header, ad end-card, documents | Charcoal on off-white · off-white on charcoal · one-colour black · one-colour white |
| **Stacked wordmark**, Sort / My / Cover on three lines, tick in Cover | Square placements, intro card corner, video end-card | Same four |
| **Tick mark alone**, amber circle + charcoal tick | Favicon, app icon, FB/IG/WhatsApp profile, ad watermark corner, loading state | Standard only |
| **Tick mark reversed**, charcoal circle + amber tick | Only on amber backgrounds | — |
| **Horizontal lock-up with line**, wordmark + "Sort your cover. 30 minutes. A real adviser." | Email signature, PDF footer, proposal header | Charcoal on off-white · off-white on charcoal |
| **Endorsement lock-up**, "SortMyCover · a service of Lead Velocity (Pty) Ltd" | Footer, About, legal docs, invoices | Same four as primary |
| **Co-brand lock-up**, SortMyCover tick + "{Practice name} · FSP {number}" | Broker intro card, pre-call brief header, booking confirmation | Standard only |
| **Monochrome favicon glyph** | Browser tabs (light and dark), Windows tiles | Mono, theme-aware |

**Rules for every variant**
- **Clear space** = the height of the tick circle, on all four sides. Nothing (text, edge, other logo, UI) goes inside it.
- **Minimum sizes:** primary wordmark **96 px** wide (Rule). Tick mark alone **16 px** (Rule; the stroke weight is tuned so it still reads as a tick at 16 px). Stacked wordmark **64 px** wide (Proposal). Print: primary wordmark 20 mm wide (Proposal, confirmed on a print proof).
- **Never:** stretch, squash, rotate, recolour outside the palette, add gradients, drop shadows, outlines, glows or bevels, re-type the wordmark in another font, or place it on busy photography without the charcoal scrim.
- **Motion:** the tick animates **only** with the single 400 ms "draw" on site load, on the video end-card and in loading states. No spins, pulses or bounces.
- **Line** is never set without the wordmark next to it.
- **Co-brand lock-up** is the **only** place a broker's identity sits next to ours. The broker's name or FSP number never appears in ads or on public pages (1.2). The co-brand lock-up never uses insurer logos.
- **™** goes after the wordmark on the site footer and documents until CIPC registers it. **Never ®** before registration (trust item 9).

---

## 5. Favicon and app icons

Generated from the tick SVG (4D.4b.2): `favicon.svg` (theme-aware), `favicon.ico` (16/32/48), `favicon-32.png`, `apple-touch-icon.png` 180² (amber circle, no transparency), `icon-192.png`, `icon-512.png`, `manifest.webmanifest` (name and short_name "SortMyCover", `theme_color` = amber token, `background_color` = off-white token), `mask-icon.svg`, `browserconfig.xml` 150² tile. Checked in `brand/favicon-check.html` in Chrome, Safari and Firefox, light and dark tabs. Owner of correctness: search-findability-lead.

---

## 6. Colour

### 6.1 Palette (values come from `brand/tokens.json`)

| Role | Token | HEX | RGB | CMYK (print) | Used for |
|---|---|---|---|---|---|
| Amber (accent) | `{{tokens.color.amber.name}}` | `{{tokens.color.amber.hex}}` | `{{tokens.color.amber.rgb}}` | `{{tokens.color.amber.cmyk}}` | The tick circle, highlights, CTA backgrounds, gap bars |
| Charcoal (ground and ink) | `{{tokens.color.charcoal.name}}` | `{{tokens.color.charcoal.hex}}` | `{{tokens.color.charcoal.rgb}}` | `{{tokens.color.charcoal.cmyk}}` | Backgrounds, body text on light, the tick stroke, scrims |
| Off-white (paper) | `{{tokens.color.offwhite.name}}` | `{{tokens.color.offwhite.hex}}` | `{{tokens.color.offwhite.rgb}}` | `{{tokens.color.offwhite.cmyk}}` | Page background, body text on charcoal |
| Amber ink (CTA text, if kept) | `{{tokens.color.amberInk.name}}` | `{{tokens.color.amberInk.hex}}` | `{{tokens.color.amberInk.rgb}}` | `{{tokens.color.amberInk.cmyk}}` | Text on amber buttons. See NH-BN-02: charcoal does the same job |

CMYK values are a starting point until a print proof confirms them (only needed for the optional business card and A5 leave-behind).

**Console semantic colours** (success, warning, danger) belong to the console tokens. They never appear on a brand surface, and brand amber never means "warning" in the console.

### 6.2 Contrast table (WCAG 2.2)

Calculated by brand-naming-lead on 2 Oct 2026 from the 4D.4b.4 values. `visual-producer`'s axe and contrast check re-computes them from `tokens.json` on every build. Whatever that build reports is what counts.

| Text / foreground | Background | Ratio (approx.) | Normal text AA (4.5) | Large text AA (3.0) | Brand rule |
|---|---|---|---|---|---|
| Off-white | Charcoal | ~13.9 : 1 | Pass | Pass | **Default for text on dark** |
| Charcoal | Off-white | ~13.9 : 1 | Pass | Pass | **Default for text on light** |
| Amber | Charcoal | ~7.3 : 1 | Pass | Pass | Allowed for headline highlights and the device. Body text stays off-white. |
| Charcoal | Amber | ~7.3 : 1 | Pass | Pass | CTA buttons and amber cards |
| Amber ink | Amber | ~8.2 : 1 | Pass | Pass | CTA buttons (only if the token is kept) |
| Amber | Off-white | ~1.9 : 1 | **Fail** | **Fail** | **Never** use amber text or thin amber lines on light backgrounds (6B.4). The amber circle on light is allowed because it is a shape, not text, and the charcoal tick inside carries the meaning. |

**Correction flagged:** 4D.4b.4 says amber on charcoal "passes AA for large text only". By the WCAG formula it is about 7.3:1, which passes AA (and AAA) for normal text. The usage rule (body text off-white or charcoal) stays as a brand choice for readability and restraint. Only the reason given in 4D.4b.4 is wrong (NH-BN-01).

### 6.3 The honest evidence note on colour (from 4D.4a)

Colour is a **weak, context-dependent** signal. In lab studies (Labrecque & Milne 2012 and the "trustworthy blue" IAT work), blue nudges people towards seeing trust. But the same authors note the effect was absent in advertising contexts in earlier work. Saturation and value matter as much as hue. The samples were US online panels. And attitudes are not behaviour. In SA, nearly every insurer is blue or green already, so blue would buy **no** distinctiveness and would read as "another insurer". Ehrenberg-Bass data adds that only ~4% of brands own their colour at all.

So **we did not choose amber for its "psychology".** We chose it because it **contrasts** in Facebook's blue-and-white feed and **no SA financial brand owns it**. Trust comes from what people can check: the named responsible company, the named adviser with an FSP number, and plain disclosure (section 11). Colour psychology is never a reason for a brand decision here.

**Test, cycle 1** (4D.4a test matrix): amber vs **teal-on-cream** on the same ads, at least 30 leads per arm. Measures: hook rate, hold, CPL, WhatsApp reply rate, booking rate. If teal wins, the palette page changes. The tick, wordmark, type and line do not (Romaniuk: shape and name carry recall). Never navy.

---

## 7. Type

- **One family:** a geometric sans of the DM Sans / Inter class, under an open licence that allows self-hosting. Recommendation: **DM Sans** (geometric, has weight 800). If `tokens.json` names a different family, the tokens win. The licence file is kept in `brand/fonts/`. Fonts are **self-hosted** for speed and privacy (no third-party font CDN).
- **Scale:** 32 / 24 / 18 / 16 / 14 px (from `tokens.json`). Nothing under 14 px on a consumer surface, except the AI label and the legal footer, which are never under 12 px.
- **Weights:** 800 for headlines, 500 for body. No italics for emphasis. Use weight or amber highlight on charcoal instead.
- **Figures:** tabular numerals for every figure (times, counts, the "2–4×" in the hooks).
- **Reading level:** Grade 5–7. Short sentences and common words.
- **The wordmark is drawn, not typed.** Never set "SortMyCover" in the body font as a logo.

---

## 8. Voice

**Plain. Warm. Direct.** We sound like a sensible friend who knows how this works, not like an insurer, a bank or a salesperson.

| Rule | Do | Don't |
|---|---|---|
| Third person about money (2.1.8) | "Most work cover is 2–4× salary. Most bonds are bigger." | "Your bond is bigger than your cover." |
| Never tell people what to do with their money | "A licensed adviser can check this with you." | "You should get more cover." |
| No superlatives | "A 30-minute call with a licensed adviser." | "The best / cheapest cover in SA." |
| Name the thing | "30 minutes. WhatsApp, video or phone." | "Quick and convenient solutions." |
| Honest urgency only | "Thursday has two slots left." (only when true) | Countdown timers, "Offer ends tonight" |
| The line, verbatim | "Sort your cover. 30 minutes. A real adviser." | "Get sorted in 30!" |
| Say what we are | "SortMyCover connects you with a licensed adviser." | "Your SortMyCover adviser", "our advisers" (they are the broker's, not ours) |
| The AI assistant says what it is | "I'm SortMyCover's assistant (AI). A person is one message away." | Pretending to be a person |

**Banned words and phrases**

*From 3.5a (site list), verbatim:* "guaranteed sales", "hot/warm leads" (undefined), "best/cheapest cover", any premium or cover figure, "estimated leads", "appointments" as the unit sold, "financial advice", insurer names.

*Consumer-brand additions, each from the section cited:*
- "guarantee", "guaranteed" in any form, and any promise of a payout or approval (4D.3 hard exclusions; 0.1 says "committed", never "guaranteed")
- "best", "cheapest", "#1", "top-rated", "lowest", "save" claims (1.2, 4.10)
- "get a quote", "free quote", "compare quotes", "compare insurers" (1.2, 4D.4a end-card rule)
- product names, insurer names or logos, premiums, cover amounts, returns (1.2, 2.1.6)
- "you should", or any second-person claim about the viewer's finances, debts, family, health or ethnicity (2.1.8)
- "black tax" and other culturally loaded labels in copy (2.1.8)
- describing SortMyCover as an insurer, broker, adviser, FSP, "financial services" or "advisory" (4D.2 rule 2)
- "financial advice" anywhere **except** inside the disclosure sentence "We do not give financial advice…"
- urgency theatre: "only today", "last chance", "hurry", countdowns (4.12, trust item 10)

---

## 9. Imagery

**Cycle 1 is code-rendered** (0.1): typography, gap bars, the tick, charcoal, amber and off-white. **No photoreal humans in cycle 1** (4D.5). Google Flow is only a week-3 experiment, and only if its trigger fires. If it runs:

- **SA-real settings:** kitchen tables, the school run, a payslip, a bond statement, a school bag. Mixed demographics. Warm kitchen light.
- **No AI person is ever presented as a client, adviser or staff member.** The only real faces are the broker's own intro media on WhatsApp (4.10).
- Every still that shows a person carries a small **"AI-generated imagery"** label (bottom-right in ads), even where Meta does not require it.
- A **charcoal scrim** goes behind any text set over imagery. No logo sits on a busy photo without it.
- No insurer logos, no figures on screen, no shields, umbrellas, hospital beds, coffins, crying families or other fear imagery.
- The brand lock (palette tokens, tick, type) is appended to every Flow prompt (`brand/flow-prompts/`) and applied in post. Flow never draws text, logos or icons.

---

## 10. Placements (4D.4b.3), one master to every export

| Surface | Size | Content rule |
|---|---|---|
| Facebook profile | 320×320 (upload 1024²) | Tick mark alone |
| Facebook cover | 851×315 master; **all text inside the 640×360 mobile-safe centre** | Wordmark + line on charcoal. 4D.4b.3 specifies a charcoal Flow scene, but cycle 1 uses a code-rendered charcoal graphic (0.1; NH-BN-05). No product claims. FSP-neutral |
| Instagram profile | 320×320 | Tick mark alone |
| Instagram highlight covers | 1080×1920 → 1:1 crop | Amber icons: "How it works", "What to expect", "FAQ", "Advisers" |
| WhatsApp Business profile | 640×640 | Tick mark alone. Description = the rule-8 disclosure (see disclosure-wording.md) |
| WhatsApp message header images | 1080² (1:1) and 1200×628 (16:9) | Intro card, what-to-expect card, reminder card templates |
| Feed ads | 1080×1080, 1080×1350 | 4D.4a templates. Logo bottom-left. AI label bottom-right **only when AI imagery is present** |
| Reels / Stories | 1080×1920 | Top 250 px and bottom 340 px free of text |
| Landing pages and site | — | Header wordmark 140 px wide. Full favicon set. OG image 1200×630 per page. Schema `Organization.logo` = 512² PNG on our own domain |
| Link previews (OG / WhatsApp link card) | 1200×630 | Wordmark + hook + line. Tested in WhatsApp |
| Broker intro card | 1080×1080 | Co-brand lock-up, real headshot, disclosure (4.10) |
| Explainer / portal video frames | 1920×1080 | Lower-third template, end-card template |
| Email (M365 signature, transactional) | 600 px wide header | Horizontal lock-up, plus a plain-text fallback |
| Documents | A4 PDF | Proposal, agreement, invoice, pre-call brief, weekly report. Endorsement lock-up in the footer |
| Google Business Profile | logo 720², cover 1024×576 | Tick + cover graphic. Eligibility check pending (NH-BN-06) |
| Print (optional) | business card 90×50 mm, A5 leave-behind | CMYK from tokens, after a print proof |
| Loading / empty states (portal, console) | SVG | Tick "draw" animation only |

**Acceptance (4D.4b.6):** every placement rendered and checked at real size on a phone. Favicon visible in light and dark tabs. Contrast table passes. `grep` finds no hex value outside `brand/tokens.css` (this bible deliberately has none).

---

## 11. Trust layer: what makes SortMyCover believable

People trust what they can check, so every item here can be checked (Labrecque & Milne: hue does not do this job).

1. **Who we are, in one line, everywhere.** The endorsement lock-up "a service of Lead Velocity (Pty) Ltd" plus the company registration number in the footer (YMYL: a named responsible entity).
2. **What we do and don't do.** The rule-8 disclosure on About, consent, the WhatsApp intro and the footer, plus a page called **"How SortMyCover makes money"**: a flat fee from advisers, never commission, never a share of the premium, nothing paid by the person who asks for a call. (Live wording: `landing/holding/how-we-make-money.html`.)
3. **The licensed adviser is named before any meeting**: practice, FSP number and FSCA register link, in the WhatsApp intro card and confirmation (1.2).
4. **Real people and real faces on WhatsApp only.** The broker's own recorded intro media (4.10). No AI faces anywhere they could be taken for staff.
5. **Privacy you can read.** A plain-language POPIA notice, retention period, a named Information Officer, and a complaints channel with a 48-hour SLA (2.1.7). Easy to find, not buried.
6. **Proof is never invented.** Testimonials only from consenting real leads (first name, city, date), added once they exist. A "meetings booked this month" counter only if the number is real. No review stars until real reviews exist.
7. **Consistency is trust.** The same mark, colour, line and disclosure from ad to page to WhatsApp to adviser to documents (Ehrenberg-Bass: recognition; Binet & Field: consistency compounds). Any surface that breaks the kit fails compliance-qa.
8. **Technical trust signals.** HTTPS, a Meta-verified domain, a Google Business Profile with the same name, address and number as the footer (if eligible, NH-BN-06), Organization and FAQ schema, fast pages (CWV), and a working **hello@sortmycover.co.za** that a person answers.
9. **Registered mark.** File the SortMyCover word mark and the tick device at CIPC in classes 35 and 36 on Day 0. Show ™ until registered. The class 36 specification must describe introductions and information, **not** insurance brokerage or advice (see availability-checks.md, row D5).
10. **Honest urgency only** (4.12). Real calendar scarcity, never countdowns.

---

## 12. Do / don't gallery (text pairs; visual-producer renders each pair as a side-by-side plate in the PDF)

| # | Do | Don't |
|---|---|---|
| 1 | Primary wordmark, charcoal on off-white, with full clear space | Wordmark squeezed against the edge of the frame or another logo |
| 2 | Tick mark alone as the profile picture on FB, IG and WhatsApp | Wordmark crammed into the round profile crop |
| 3 | Reversed tick (charcoal circle, amber tick) on an amber background | Standard amber tick on amber, so the circle disappears |
| 4 | Amber headline highlight on charcoal | Amber body text on off-white (fails contrast at about 1.9:1) |
| 5 | Wordmark on a photo behind a charcoal scrim | Wordmark straight on a busy kitchen photo |
| 6 | Tick "draw" once, 400 ms, on the end-card | Spinning, pulsing or bouncing tick |
| 7 | "Sort your cover. 30 minutes. A real adviser." | "Get your cover sorted in 30 mins!" |
| 8 | "Most work cover is 2–4× salary. Most bonds are bigger." | "Your work cover isn't enough." |
| 9 | "A licensed adviser can check this with you." | "You should increase your cover." |
| 10 | End-card CTA "Tap to check your cover" | "Get a free quote" |
| 11 | Co-brand lock-up on the intro card: tick + "{Practice} · FSP {number}" | The broker's name or FSP number in an ad or on a public page |
| 12 | The real adviser's own headshot on the intro card | An AI-generated "adviser" or "happy client" face |
| 13 | "AI-generated imagery" label on a Flow still with a person | An unlabelled photoreal AI person |
| 14 | Amber + charcoal + off-white only | Gradients, drop shadows, outlines, extra colours, navy |
| 15 | The tick as the only device | A shield, umbrella, family silhouette or heart added "for trust" |
| 16 | ™ after the wordmark until registered | ® before CIPC registration |
| 17 | "SortMyCover · a service of Lead Velocity (Pty) Ltd" in every footer | A footer with no responsible company named |
| 18 | "Thursday has two slots left" (when true) | "Offer ends in 02:59:59" |
| 19 | A real, consented testimonial credited as "{first name}, {city}, {month year}" | Invented testimonials or 5-star badges |
| 20 | One wordmark drawn from `brand/logo/` | "SortMyCover" typed in the body font and called a logo |

---

## 13. CoverKlaar: the held Afrikaans variant

- **Status:** held (0.1). `coverklaar.co.za` / `.com` registered defensively, @coverklaar handles reserved. No public use until Phase 6 cycle 2 (6B.11), and only after the language-safety review passes (availability-checks.md, F4).
- **If it is used, the kit is the same:** the same tick as the "o" in Cover, the same palette tokens, type, endorsement lock-up and disclosure (translated by a native speaker and approved by contracts-drafter, never machine-translated). The tick carries recognition from one name to the other (Romaniuk: the device is the most portable asset).
- **The Afrikaans line** is written and checked by a native-speaker reviewer. It is not drafted here.
- **Recommendation for Jonathan (NH-BN-07):** a second consumer name splits mental availability and halves the branded-search effect each name gets (Binet & Field, Meta Search Lift). The default proposal is to run Afrikaans as **SortMyCover in Afrikaans** (Afrikaans pages, templates and assistant register under the one brand), keep CoverKlaar as a defensive registration, and switch it on only if the Afrikaans test shows a measured lift. This is your decision before Phase 6.
- **Specific check:** "klaar" means done or finished. In some phrases ("hy is klaar") it can read as "finished off / dead", which matters next to life cover. The Afrikaans reviewer is asked about this directly.

---

## 14. Change control

- Changes to tokens go through `brand/tokens.json` only (6B.8). The screenshot regression test and the W33 judge flag colours that are not tokens.
- Changes to the line, the disclosure or the banned list need sign-off from brand-naming-lead and compliance-qa (and contracts-drafter for the disclosure) and a version bump here.
- Version history: BB-v1.0 (2 Oct 2026), first issue.
