# RECONCILE: approved reference vs the 4.5 spec table vs what was built

Source: `landing/reference/sortmycover-landing.html` (approved design, wins on layout and flow) and 4.5 "Full page spec" (wins on rules). The page is built FROM the reference.
Anything below marked PROPOSAL is not in the page: it is a change for Jonathan/KG with its evidence line (4.5: "any proposed change to layout or flow is a PR with the evidence line it rests on").

## A. Kept from the reference unchanged (layout, flow, look)
Sticky top bar, charcoal hero with amber emphasis and gradient, chips, gap bars (HTML bars, 28% vs 100%, no rand figures), white card with 7-segment progress, tap cards, combined result + details screen (heading changes with the work-cover answer), "What happens next" box beside the ask, slot grid look, method chips, done / not-a-fit states, "How it works", FAQ accordion, footer, sticky bottom CTA, dark mode. Quiz options and answer values (3 bond answers, 4 dependants answers, 3 work-cover answers incl. "Not sure").

## B. Changed to meet a hard rule (build now; each has the rule it rests on)
| # | Reference | Built | Rule / evidence |
|---|---|---|---|
| B1 | Google Fonts `<link>` | Self-hosted DM Sans 500 + 800 woff2 from `brand/fonts` (via `brand/tokens.css`, urls rewritten to `/fonts/`), 800 preloaded | 4.5 "self-hosts the font", Google/Deloitte speed, no third-party scripts but Pixel |
| B2 | Consent text "SortMyCover (a service of Lead Velocity (Pty) Ltd) may share my details with **Mark Williams Financial Planning (FSP 00000)**" hard-coded | Verbatim `CONSENT-NAMED-v1` ("Lead Velocity may share my details with {practice_name} (FSP {fsp_number})...") + `CONSENT-ADS-v1` sentence inside the same tick + privacy link; rendered from config (brokers row); generic mode on one flag; build fails closed in production | 2.1.2, consent-and-privacy.md 1.2-1.4 ("word for word the same wherever shown"), docs/design/README note |
| B3 | Hero + sticky CTA "Check my cover" | "Check my cover in 60 seconds" in both | 4.5 rows 2 and "one CTA, repeated, same words" |
| B4 | Top-bar text "Free 30-min call · licensed adviser" | "Free 30-min call with a licensed adviser" | 4.5 row 1 |
| B5 | Copy before first tap ~136 words | 102-107 words (gap paragraph and bar notes shortened, hero sub shortened, "Nothing to buy on the call" dropped: chip says No obligation, FAQ repeats it) | NN/g half-read threshold (<= 110 words), enforced by the build |
| B6 | 4 chips ("60 s to check", Licensed adviser, No obligation, Video...) | 3 chips: Licensed adviser, Video, WhatsApp or phone, No obligation ("60 s" is now in the CTA) | 4.5 row 3 (3 trust chips) |
| B7 | Result headings in second person ("Your work cover is a start...", "Without work cover, this is worth 30 minutes") | Third-person / process wording; no claim about the viewer's cover | 2.1.8, 4.5 copy rules ("every claim third-person-general or about our own process") |
| B8 | FAQ cost answer ends "...nothing is added to your premium" | Clause removed (we cannot speak for the adviser's pricing). The flat-fee disclosure is kept, now using FAQ-09 wording from knowledge/faq.md ("Advisers pay Lead Velocity a flat fee to set up calls, and you pay nothing."): **compliance-qa to confirm** (needs_human) | 2.1.1, 3.5a |
| B9 | Footer "Imagery on this page may be AI-generated" | Removed: the page has no imagery. Restore with any AI image | 2.1.5 (disclosure follows the image) |
| B10 | Footer links dead (`#`) | Privacy notice, How we make money, Complaints (holding-site URLs from config), Opt-out | 4.5 row 13 (Opt-out), 2.1.2 |
| B11 | Quiz cards are JS-only buttons; form has no action | Radio inputs inside a real `<form method="post" action="{api}/lead">`, same look; honeypot; hidden consent text/version/mode/angle/lang; with JS off every field is visible and posts | 4.5 Technical "forms work without JS for the capture step", 6B.5 |
| B12 | `name` / `phone` field names; no live validation | `first_name` / `mobile`, inputmode `tel`, E.164 normalisation, live validation on input/blur, error text tied with `aria-describedby` | 4.5 row 8 |
| B13 | Illustrative slot list, 3 hard-coded methods, no email | `GET /slots` grouped by day (5 days), methods from the routed broker's `methods_supported`, email field only for Teams/Zoom/Meet with typo suggestion, 409 collision shows the next 3, `POST /book`, .ics link | 4.5 row 9, 4.6, 0.1 (Email) |
| B14 | No back button on quiz questions 1-5 | Back on questions 2-5 (and on details); keyboard "Next" appears after a keyboard selection | 4.5 row 5 (back button), WCAG 2.2 (no auto-advance on keyboard input) |
| B15 | Focus ring amber on white (about 2:1), input borders #DCD6CB (about 1.4:1) | Charcoal focus ring; control borders #8A94A0 (3.1:1); dark-mode error colour lightened | WCAG 2.2 AA 1.4.11 / 2.4.7, 6B.4 |
| B16 | `<title>` inside `<body>`, preview-only safe-area CSS on `:root`, hidden "FSP 00000" | Proper head: title, description, canonical, robots, OG, `smc-pixel-id`, `facebook-domain-verification`, FAQPage JSON-LD; skip link; landmarks; `lang` per page | 4.5 Technical, Google YMYL |
| B17 | Weight 700 used | Only the two self-hosted weights (500, 800) | speed (two font files) |

## C. Reference differs from the spec table; reference kept (flag for confirmation)
| # | Spec | Reference / built | Note |
|---|---|---|---|
| C1 | H1 <= 10 words | Resolved (fix-wave-1): every H1 is now 6-8 words. employer-gap H1 = frame-1 hook only (8 words); beat 2 "The bond and the bills don't." opens the sub, because hook + beat 2 is 14 words (> 12 cap) | hook-library-v2 H1 |
| C2 | Result screen, then details screen (rows 7, 8) | One screen: result heading + 3 fields | Reference wins; fewer taps |
| C3 | Children/dependants yes/no; work cover yes/no; bond yes/no | Reference options (bond: yes / not yet / no; dependants: 4; work cover: yes / not sure / no) | Reference wins; richer for the adviser; `soon` suits the new-bond angle |
| C4 | Age "50+" (row 5), "51+" (0.1, 3.3) | "51 or older" | 0.1 wins (no overlap with 45-50) |
| C5 | FAQ (5): how long, cost, who, my info, cancel | 6: those 5 + "Is SortMyCover an insurer?" ("Do I have to buy anything?" merged into the cost answer; "Can I cancel" added) | `knowledge/faq.md` (faq-v1.0.0, compliance sign-off PENDING) now feeds how-long (FAQ-01) and cost (FAQ-02 + FAQ-09); who/info/cancel/insurer keep page-level wording because the corpus entries use {adviser}/{city} placeholders or speak as Thandi (6B.9) |
| C6 | Hero real SA family image | None (text hero, as in the reference); no images means LCP is text | Test T3 in `tests/test-log.md` |
| C7 | Gap picture "inline SVG bars" | HTML/CSS bars (reference) | Same look; labels are real text, tracks `aria-hidden` |
| C8 | Sticky footer carries privacy link (flow step 9) vs "no footer links above the thank-you" (step 4) | Sticky bar = CTA only; privacy link sits in the consent line and the footer | Trust layer is next to the ask |
| C9 | Proof block (row 11) | Data-driven, renders nothing until `proof[]` has real quotes | |
| C10 | "Endorsement lock-up" (step 9) | Not built: no endorsement asset exists | brand-naming-lead to supply |

## E. Fix wave 1 (2026-10-02, landing-page-builder row of build/fix-wave-1.md)
| # | Change | Source |
|---|---|---|
| E1 | H1 = ad hook for new-bond (H3), turned-40 (H5), self-employed (H7), virtual (H6), myth-bust (H18, until H8 is sourced), employer-gap (beat 2 in sub); `ad_hook` equals the H1 text, so the message-match warning is gone | hook-library-v2 |
| E2 | `config/faq.json` aligned to faq-v1.0.1: how-long (FAQ-01) and cost (FAQ-02 + FAQ-09, flat fee per cycle, never commission) are pulled from the corpus at build; privacy answer = one adviser + listed processors + hashed contact for ad measurement, no "no one else" (K-1, K-2) | faq.md v1.0.1 |
| E3 | "No products, prices or paperwork on the call" replaced with "No obligation to buy. Any next step is your choice." (K-6) | phase4-review-2 |
| E4 | (superseded by F5) Opt-out link was host-relative: `/privacy.html#opt-out` | holding page anchor |
| E5 | `/lead` and `/book` send `started_at` (page load, ISO) and `request_id` (uuid; /book id is reused on a retry, renewed after a 409 or success); `/book` re-runs an invisible Turnstile with `action=book` (`turnstile_token`); stubbed (empty token) while `turnstile_sitekey` is empty | automation/W03-notes.md B.3 |
| E6 | `new-bond` sub no longer says "Many bonds are bigger than work cover" (unsourced); uses the ad's own beat 2 | 2.1.5 |
| OPEN | W03-notes B.3 #6: `/slots` and `/book` need the `lead_token` returned by `/lead`. Not wired: header/field name is not in the contract. Page still sends `broker` + `lead_id` on /slots | needs_human (automation-engineer) |

## D. Proposals (NOT in the page)
| # | Proposal | Evidence line | Test |
|---|---|---|---|
| D1 | Exit as soon as the age band is out of range instead of after five questions | Baymard: every extra field/step costs completion; also kinder to out-of-band visitors | Compare qualified-submit rate and Lead-event rate |
| D2 | Hint under question 1 says "Tap one. Takes about a minute in total." (cut for the word budget) | Reduces abandonment? Unproven | T4 family |
| D3 | Make the sticky bar hide while the quiz card is on screen (IntersectionObserver) | Avoids two CTAs competing (CXL single goal) | Click-through on both CTAs |
| D4 | Move the "What happens next" box above the consent line on small screens | Baymard: proof beside the ask | Details-step completion |
| D5 | Pre-select no contact method (currently the broker's first method is pre-selected, so a Teams-first broker shows the email field straight away) | Baymard: fewer visible fields; email asked only when needed (0.1) | Booked rate by method |

## F. Fix wave 3 (2026-10-02; I-34b, I-34e, review-3 carry-overs)
| # | Change | Source |
|---|---|---|
| F1 | `/lead` response field `lead_token` is kept in memory and `sessionStorage` (`smc_lt`, never a cookie or URL). `/slots?days=5` and `/book` send `X-Lead-Token`. `broker=` and `lead_id=` query params and `broker_id` in the `/book` body are gone; the page no longer needs `broker_id` in the `/lead` response. Booking starts only if a token came back, else the not-booked thank-you. `started_at`, `request_id` and Turnstile unchanged. CORS on `API_HOST` must allow `X-Lead-Token` (I-34c). Closes the E-wave OPEN row. | CONTRACTS lead_token, I-34b |
| F2 | Quiz codes are the schema set (`leads_smc_checks`): age `lt35 / 35_44 / 45_50 / 51plus`, budget `lt750 / 750_1250 / 1250plus`. The schema has one band below R750, so the two low budget cards ("Under R500", "R500 to R750") are merged into one card "Under R750" (both were exits). Template, page.js and quiz.spec.ts follow. **Fixtures and W01 must follow** (automation-engineer; I-34e): the old codes `<35`, `51+`, `<500`, `500-750`, `750-1250`, `1250+` are no longer sent. | I-34e |
| F3 | Copy: delete "and a short intro from them" (step 2); done-booked "Your adviser's details are on their way. Add the call to your calendar below."; result_yes "A licensed adviser can check what your work cover includes, and what it does not."; gap note "Typical employer cover"; "In about a minute" (index.html, strings.json). | review-3 §1 #12-16 |
| F4 | self-employed gap_p: "Self-employed people have no work cover to start with." | review-3 §3 |
| F5 | `site.json` `optout_url` is `https://sortmycover.co.za/privacy.html#opt-out`. | review-3 §1 #9 |
| F6 | Myth-bust page keeps H18 ("No price in this ad. On purpose.") and serves C12. C13 gets its own H1 from creative-strategist (angle variant to be added once given). | review-3 message-match note |

## G. C13 landing variant (creative-strategist v1.1.1, review 4 #25)
`angles/c13-check-not-buy.json` is the page for **C13** (H16 "Checking cover is not the same as buying."). C13 traffic goes to `/c13-check-not-buy/`, not `/myth-bust/`, which keeps H18 and serves C12. The sub-line is taken from the C13 primary text (no new claims). Same quiz, config and FAQ as the other angles.

Two more angle pages (media-buyer first-batch.csv MISSING rows):
- `/extended-family/` (`angles/extended-family.json`) serves **C06 and C07**. H1 is the C06 hook (H9) "Many families carry more than one household."; the sub is taken from the C06 primary text. C07 (H13) shares this page, so its message match is the same idea, not the same words. Split to its own page if C07 is scaled and tested alone.
- `/what-the-call/` (`angles/what-the-call.json`) serves **C14 and C15**. H1 is C14's H10 "Here's exactly what happens on the call."; the sub is taken from the C14 primary text. C15 (H17) shares it.
