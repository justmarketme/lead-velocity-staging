# ux-cro: UI/UX and conversion research for the SortMyCover funnel

Lens: mobile-first lead-gen funnel (ad -> landing page -> 6-step tap quiz -> WhatsApp booking), audience 35-50 in South Africa, many on mid-range Android.
Written 10 Oct 2026. Everything below was fetched or computed on that date unless a date is given. Anything dated before 2024 is marked **STALE**. Anything I could not verify at a primary source is marked **UNVERIFIED**.
Evidence grades: **A** primary (vendor docs, standards bodies, platform docs, peer-reviewed); **B** well-documented but observational or from a self-selected dataset; **C** vendor marketing or blog (directional only).
Read first (not re-derived): `landing/README.md`, `landing/RECONCILE.md`, `landing/holding/deploy.md`, `deliverables/verified-facts.md`, `deliverables/search-findability-lead/{SUMMARY,serp-plan}.md`, `docs/MASTER-PROMPT.md` section 4.5, `landing/shared/pixel.README.md`, `landing/template/*`.

## Ranked findings (12)

### 1. The "page conversion >= 18%" KPI is not a like-for-like benchmark; plan on a lower band and track stages (HIGH)
- The 18.2% is Unbounce's median for its **insurance subcategory** (2024 Conversion Benchmark Report: 41,000 pages, 57M conversions, 464M pageviews). Same dataset: financial services 8.3%, paid social to finance and insurance 9.3% (Facebook 10.1%, Instagram 15.5%, TikTok 10.8%), mobile 11.5%. Grade B: Unbounce's own text explains the high number by high intent and says to weigh "the complexity of your conversion action" before comparing. Pages are Unbounce customers, "conversion" is whatever goal each page set (a click or signup counts), and the median is of pages, not of traffic.
- Independent, vendor-neutral-ish numbers are much lower and measure different things. WordStream (Google Ads search, 16,000+ US campaigns, Apr 2024 to Mar 2025, page updated 18 May 2026): Finance & Insurance conversion rate **2.55%**, cost per lead **US$83.93** (all-industry 7.52% / $70.11). LocaliQ (Facebook, page updated 23 Sep 2026): lead-objective campaigns average **8.54%** across industries (7.72% the year before), but Finance & Insurance is **not in the lead-campaign table**; its traffic-campaign CTR is 1.46% and CPC US$0.86. Facebook "lead" conversion is leads/clicks and is largely instant-form, not a landing-page quiz. Both are US small-business data (grade B/C).
- Planning band (my synthesis, **UNVERIFIED**, replace with week-1 measurements): visit -> submitted details about **3-10%**; treat >12% as a good outcome and 18% as a stretch. Qualified (R750+) share multiplies that down.
- Implication: replace the single 18% gate in 4.5 with stage KPIs (PageView -> quiz start -> quiz complete -> details submitted -> qualified -> booked -> attended) and judge campaigns on cost per qualified lead and cost per attended call (already the 4.9 method). No SA landing-page benchmark was found; V8 Media (SA agency, undated) says only that SA leads cost "R40 to R400" depending on offer (**C, UNVERIFIED**).
- Check: open the two Unbounce pages and the WordStream/LocaliQ pages listed below and read the definitions.

### 2. At low traffic, the repo's test rule can only detect ~27-29% relative lifts, while real winning lifts are small (HIGH)
- Computed (two-proportion normal approximation, alpha 0.05 two-sided, power 80%; cross-checked to the textbook 20% -> 25% = 1,094 per arm vs ~1,091). Appendix A has the full table. At a 10% baseline: 20% relative lift needs **3,841** visitors per arm; 30% needs 1,774; 50% needs 686. The 4.5 rule ">= 200 conversions per arm" equals ~2,000 visitors per arm at 10% and detects only a **~28%** relative lift (5% baseline: 29%, 15% baseline: 27%).
- Real effects are smaller: in 1,001 tests on one platform (Analytics-Toolkit, Oct 2022, **STALE**, grade B) 33.5% had a significant winner, the median winner lift was **7.5%** (mean 15.9%), median sample 60,342 users, median duration 30 days. Win-rate compilations put it at 10-36% depending on definition (Optimizely, Convert, VWO figures are quoted second-hand: **UNVERIFIED** at source).
- The 4.5 rule says "or 14 days, whichever first", which ends a test at perhaps 30 conversions per arm. At ~15 leads per R3,000 at the R200 target CPL (the spend gate in 3.4/4.4), no page test can be powered by the first budget tranche.
- Peeking: stopping when a test first looks significant inflates false positives (Evan Miller, 2010, **STALE** but the statistics are timeless: testing after every observation reached a 26.1% false-positive rate at a 5% threshold).
- Meta's own A/B tool: secondary sources say it needs >= 7 days, shows an "estimated power" figure and declares winners at a low confidence level (65% quoted). **UNVERIFIED** (Meta help pages did not render for the fetcher); read it in Ads Manager before relying on it.
- Implication (method): (a) run page tests only for structural changes expected to move the metric >= 50% relative (quiz-first vs form-first, WhatsApp-first vs booking widget, hook vs generic H1); (b) test UI polish against a higher-base-rate micro metric (quiz start rate, step completion; ~50% base needs ~1,565 per arm for +5 points) with booked or qualified as a guard rail, never as the only judge; (c) pool traffic across campaign pages that share a template and randomise 50/50 inside each page, so one test accrues sample from all campaigns; (d) fix sample size before launch, no peeking, or use a sequential or Bayesian rule; (e) until ~1,400 visitors per arm exist, ship best practice and learn from five-person usability sessions (already in `docs/MASTER-PROMPT.md` section 6B, row 3) instead of underpowered tests; (f) randomise server/edge-side or by URL: web.dev warns that A/B libraries hiding the page delay LCP.
- Check: re-run `node` with the formula in Appendix A; open the Evan Miller calculator and compare (its method can differ slightly).

### 3. The Meta Pixel is ~70% of first-load bytes; the stated JS budget is already broken by it alone (HIGH)
- Measured 10 Oct 2026 from `connect.facebook.net/en_US/fbevents.js`: **112,816 bytes transferred (gzip), 428,904 bytes decoded**. SortMyCover's own first load is about 50 KB compressed (HTML ~10 KB gz per README, page.js 8.1 KB gz, pixel.js 2.7 KB gz, two woff2 fonts ~28 KB). `serp-plan.md` budgets "JS <= 100 KB gz"; the Pixel alone is 113 KB. `landing/shared/pixel.js` injects it async at DOMContentLoaded.
- Budget anchor: Alex Russell, 24 Nov 2025 (grade A for method): P75 mobile = Samsung Galaxy A24 4G on 9 Mbps down / 3 up / 100 ms RTT; for a 3 s load, **JS-light 2.0 MiB total with 0.3 MiB JS; JS-heavy 1.2 MiB with 0.62 MiB JS**; budgets assume two TLS connections; cheap phones are ~9x slower than current iPhones and not faster than 2022. HTTP Archive Web Almanac 2025 (July 2025 crawl): median mobile page 2,164 KB, median JS 646 KB, mobile Core Web Vitals pass rate 48% (LCP good 62%, CLS 81%, INP 77%).
- SA context: Android 81.4%, iOS 18.6%; Chrome 73.5%, Safari 13.1%, Samsung Internet 8.3%, Opera 3.5% (StatCounter, Sep 2026, grade B). Ookla median mobile download 66 Mbps (late 2025, median favours good coverage, not P75). Vodacom's site lists 1 GB prepaid at R85 and 500 MB at R69 (fetched 10 Oct 2026; page undated): a 300 KB page costs ~2.6 cents, the Pixel ~1 cent. So bytes are not a price barrier; CPU and main-thread time on cheap phones are the binding constraint, and 429 KB of Pixel JS to parse competes with the first taps (INP).
- Evidence the speed matters is observational: Deloitte/Google "Milliseconds make millions" (37 brands, 30M sessions, late 2019, **STALE**): for lead-gen sites a 0.1 s improvement in four speed metrics went with +5.5% homepage -> form step 1 and +21.6% form step 1 -> submission. Portent (100M page views, 20 sites, updated Apr 2022, **STALE**, correlation only): B2B lead-gen sites loading in 1 s converted ~3x better than at 5 s.
- Implication: set the budget as **own assets <= 60 KB compressed on first view; all third-party <= ~120 KB; no render-blocking third party**. Load `fbevents.js` on first quiz tap or after load + idle, not at DOMContentLoaded, and compare Meta's link-clicks to landing-page-views ratio before and after (landing-page-view definition is **UNVERIFIED**: Meta help page did not render). Re-check consent/measurement impact with the attribution lens before changing PageView timing.
- Check: `curl -sI -H "Accept-Encoding: gzip" https://connect.facebook.net/en_US/fbevents.js`; sum `landing/dist` sizes after `node landing/build-site.mjs`.

### 4. Search Console and CrUX will not show the ad traffic's real speed; add your own field measurement (MEDIUM)
- CrUX counts Chrome only and **explicitly excludes Android WebView**; Chrome Custom Tabs are included (Chrome for Developers CrUX methodology; web.dev "CrUX vs RUM", updated 17 Dec 2025). Meta's Facebook and Instagram apps on Android use their own Chromium-based WebView, not Chrome (Engineering at Meta, 30 Sep 2022, **STALE**; current state **UNVERIFIED**; no iOS statement found).
- So the paid-social visitors, most of the funnel, are probably invisible to Search Console's Core Web Vitals report and PageSpeed Insights field data. The Lighthouse gate in `landing/README.md` is lab data only. Web Almanac says INP is the hardest metric on mobile (20-point mobile/desktop gap).
- Implication: add a tiny first-party RUM beacon (LCP, CLS, INP, page-view-to-first-tap, and a flag for `FBAN/FBAV/Instagram` user agents) posted to n8n within the CSP `connect-src`; test every release in the real Facebook and Instagram in-app browsers on one cheap Android (Galaxy A-series class) and one iPhone, not just Chrome. Cookie and storage behaviour in those browsers affects `_fbp/_fbc` and `sessionStorage` (`smc_lt`) too (**UNVERIFIED**, secondary blogs only).
- Check: read the CrUX methodology page; load the site from a Facebook post link on a phone and inspect `navigator.userAgent`.

### 5. Motion: use it sparingly, gate it, self-host it, and never let it touch the H1 or CTA first paint (HIGH)
- Facts from Motion docs: `animate()` mini = **2.3 kb**, hybrid = **18 kb** (another Motion page says 17 kb); exports include `animate`, `scroll`, `stagger`, `inView`. The quickstart imports from `cdn.jsdelivr.net`; that is blocked by the repo's CSP stance (`default-src 'self'`; planned quiz CSP `script-src 'self'` + hashes), so it must be bundled and self-hosted. The `reducedMotion="user"` behaviour (disables transform and layout animation, keeps opacity and colour) is documented for **Motion for React** only; the vanilla pages I read do not document an equivalent, so gate with `matchMedia('(prefers-reduced-motion: reduce)')` yourself (**UNVERIFIED** that vanilla ignores the preference automatically). The AI Kit page (motion.dev/ai-kit) is a paid Motion+ add-on ($399/year) of context, MCP and a `/motion` skill; it says nothing about accessibility or performance.
- Platform rules that decide what is safe: INP good <= 200 ms (75th percentile; web.dev, updated 2 Sep 2025). CLS good <= 0.1; animate with `transform` rather than size or position; shifts within 500 ms of a tap are excluded from CLS (web.dev CLS, 2023). Chromium **excludes `opacity:0` elements from LCP candidates** and web.dev lists JS that hides the LCP element (for example an A/B library) as a cause of render delay, so a fade-in of the H1 delays LCP until the script runs (web.dev LCP, 4 Sep 2025; optimise-LCP, 31 Mar 2025). NN/g: UI animation 100-500 ms, simple feedback ~100 ms, panels 200-300 ms, avoid >= 500 ms, ease-out for entries (Feb 2020, **STALE** but stable).
- WCAG: 2.2.2 Pause, Stop, Hide (**A**) for auto-moving content over 5 s; 2.3.3 Animation from Interactions (**AAA**) points to `prefers-reduced-motion`. Not AA, but Android's "Remove animations" setting maps to the media query, so honour it.
- Evidence that decoration lifts lead-form conversion: **none found**; searches returned only blog and Medium case studies. Treat motion as polish that must not cost the first paint or INP. The template already has a 250 ms CSS entrance guarded by `prefers-reduced-motion:no-preference` (`page.css` line 153): the baseline is good, so Motion should earn its bytes.
- Implication: allowed uses (each CSS-impossible or clearly better with Motion): spring or ease-out feedback on option tap (<= 150 ms), animated progress fill, step-to-step slide/fade of the quiz card (<= 250 ms, transform and opacity only, height reserved to avoid CLS), staggered reveal of the slot grid after `/slots` returns. Forbidden: scroll-linked hero effects, parallax, looping or auto-playing motion, any animation on the H1/hero CTA/sticky CTA before first paint, animating `height/top/left`, or anything that delays an option becoming tappable. Ship mini (2.3 kb) in the main bundle, lazy-load hybrid only on the booking step if independent transforms are needed, and feature-flag Motion off for the first 2 weeks as the control in the pooled test (finding 2).
- Check: build with and without Motion; compare lab LCP/INP and the beacon from finding 4 on a cheap Android.

### 6. Multi-step and quiz forms: evidence is mostly vendor anecdotes; keep the quiz for qualification, test it against form-first (MEDIUM)
- Zuko (form analytics vendor): "neither single-page nor multi-step forms consistently convert better"; it cites no controlled experiment of its own and says the only way to know is to test (grade C but candid). Venture Harbour's "up to 300% more" article: anecdotes without visitor counts or significance, author sells a form builder, examples from 2014-2020 (**STALE**, C). Conversion Sciences (published 20 Jul 2023): one quiz-style form beat a stacked form by 61% on quote requests, no sample size or significance stated (C). HubSpot's "86% higher" and Formstack's 13.9% vs 4.5% appear second-hand and are **UNVERIFIED** at source.
- Baymard (grade A for checkout, not lead-gen): the 2024 benchmark of 344 e-commerce sites found 11.3 form fields on average and recommends about 8 in total; it does not publish a per-field conversion percentage on that article.
- The master prompt's "multi-step ~14% better; 23.1% at 3 fields -> 11.4% at 7; mobile 32% lower" come from a vendor blog (Digital Applied) and are **C**.
- Implication: the quiz-then-details design is justified by qualification (budget band, age band) and by a smaller first ask, not by a proven lift. Keep it; test **quiz-first vs details-first with the same questions after** (finding 2). Make the early-exit proposal D1 in `RECONCILE.md` (stop out-of-band visitors at the age question instead of after five) a standing default because it is kinder and costs nothing; the budget question as the last tap is the one place order is worth testing. Do not claim "2-10x" for quizzes (repo already says so).
- Check: read the Zuko, Venture Harbour and Conversion Sciences pages for sample sizes; there are none.

### 7. At least nine numbers in the 4.5 "evidence" table do not match, or cannot be traced to, their cited primary sources (MEDIUM)
See Appendix B for the audit. Highlights: "3 fields ~ 25% completion" is attributed to Baymard but Baymard's field article gives 11.3 vs 8 fields and no such percentage; "message match up to 39%" does not appear on four Unbounce pages I read (message-match glossary, case studies, benchmark pages); NN/g's "20-28% of words" and "111 words" come from 2005 browsing data published 2008 (**STALE**), and "57% / 74%" is 2018 **desktop** eyetracking (120 participants); "0.1 s -> +8.4%" is the Deloitte retail figure while lead-gen was +5.5% / +21.6% on different steps; "1 s 3.05% vs 3 s 1.12%" is Portent's B2C e-commerce slice (2019).
- Implication: keep the design rules (they are cheap and sensible) but stop citing these numbers in briefs and client material; cite the corrected figures in Appendix B or say "UNVERIFIED".

### 8. WCAG 2.2 AA essentials mapped to this funnel; the sticky bottom CTA is the main risk (MEDIUM)
- 2.4.11 Focus Not Obscured (Minimum), **AA** (new in 2.2, published 5 Oct 2023): W3C names sticky footers and non-modal banners as typical failures. `page.css` line 149 makes `.sticky` a bottom-fixed bar; with keyboard or switch focus, form fields and the Send button can sit under it. Fix: `scroll-padding-bottom` = bar height, and hide the bar while the quiz card is on screen (RECONCILE proposal D3).
- 2.5.8 Target Size (Minimum), **AA**: 24x24 CSS px or spacing; the options already use `min-height:52px` and the sticky button 44px (also meets the AAA 2.5.5 44 px). Keep the Back and "I'll pick a time on WhatsApp" links at 24 px minimum with spacing.
- 1.3.5 Identify Input Purpose, **AA**: the markup already uses `autocomplete="given-name"` and `"tel"`; keep it on the email field (`email`).
- 4.1.3 Status Messages, **AA**: `role="status"` and `role="alert"` are present; make sure step changes, slot loading, 409 collisions and booking success are announced through them.
- 3.3.7 Redundant Entry, **A**: never ask age band, budget or contact method twice; the booking step already receives them. 3.2.6 Consistent Help, **A**: put the same "need help? email" link in the same place on every campaign page.
- 2.2.2 Pause, Stop, Hide (A) and 2.3.3 (AAA) apply to motion (finding 5). 4.1.1 Parsing was removed in 2.2.
- Check: tab through the quiz at 360 px width with the sticky bar visible; run axe or Lighthouse; test with TalkBack on Android.

### 9. Phone-number explanation and WhatsApp opt-in wording belong right at the field (MEDIUM)
- Baymard (quantitative survey, n = 1,026 online shoppers, 2025, grade A for method, e-commerce context): **14% would never give a phone number to an online store**; 39% of sites require it without saying why; short inline reasons placed next to the field worked in tests. This funnel *requires* a mobile number and the current label is "Mobile number (WhatsApp)" with the purpose carried by the hint above the step.
- WhatsApp Business Messaging Policy (dated 23 Sep 2026): the business needs opt-in "confirming that they wish to receive subsequent messages or calls", recommends scoping opt-in to the message categories and a **separate opt-in to initiate a call**, and clear opt-out instructions. The booking methods include "WhatsApp call".
- Implication: add a one-line reason under the phone input in plain words (what the number is used for, who will message, how to stop), keep it truthful to the flow, and have compliance-qa approve the wording; make sure the consent line names WhatsApp messages and, if the call method stays, calls. Do not hide the reason in a tooltip (Baymard found inline better).
- Check: compare the consent line in `landing/config/consent.json` with the policy wording above (not legal advice).

### 10. WhatsApp is the right channel for the 35+ audience; the weak point is the first message from an unknown number (MEDIUM)
- DataReportal Digital 2026 Global Overview (GWI survey): WhatsApp is the world's most-named favourite platform (17.4%) and "only tops the charts once users pass 35"; Instagram wins under 35 (grade B, global, not SA). SA connectivity (DataReportal Digital 2026 South Africa): 51.7M internet users; 127M mobile connections. The "~90% of SA internet users use WhatsApp" figure in the master prompt is **not on the DataReportal text page**; secondary sources say 93.8-96% (**UNVERIFIED** primary).
- Trust risk: SABRIC (4 Nov 2025) warns of WhatsApp impersonation scams and AI-assisted fraud; the FSCA's own name was used in a fake WhatsApp investment video in 2025 (secondary press). The adviser's first WhatsApp comes from an unfamiliar number minutes after the form.
- Platform mechanics: a user-initiated chat opens a 24 h customer service window; Click-to-WhatsApp ad entry opens a 72 h free window (Meta pricing doc, effective 1 Jul 2025; the 1 Oct 2026 service-message billing change is described by secondary vendors only: **UNVERIFIED**, already tracked in `verified-facts.md`). `wa.me` links tapped inside in-app browsers sometimes stall instead of opening the app (secondary blogs, **C/UNVERIFIED**).
- Implication: on the thank-you state show the exact business name and WhatsApp number the message will come from, with a "Save this number" and a prefilled `wa.me` button "Message us first" (user-initiated is free and gives the lead control); test it against the form-only path (finding 2). Offer a plain "Call/email instead" fallback for the many who distrust WhatsApp contact from strangers. Verify the `wa.me` tap inside Facebook and Instagram on real phones before launch.
- Check: read DataReportal's global overview paragraph on age; try a `wa.me` link from an Instagram story on Android and iOS.

### 11. Progress indicator: a step counter is fine; avoid anything that makes early progress feel slow (LOW)
- Meta-analysis of 32 randomised web-survey experiments (Villar, Callegaro and Yang, Social Science Computer Review, 2013, **STALE**, grade A for method, surveys not lead forms): a constant progress indicator did **not** significantly reduce drop-off; fast-to-slow (early progress looks quick) reduced it; slow-to-fast increased it; with a small incentive, a constant indicator raised drop-off.
- Current build: a 7-segment bar over 5 taps plus details plus booking, with the typing and consent step late. That is naturally fast-to-slow, which is the safer shape. The risk is promising "60 seconds" in the CTA: if median completion is longer, the claim becomes a trust liability.
- Implication: keep the step counter and labels ("Question 2 of 5"), keep the typing-heavy step last, never smooth the bar by time, and measure median time from first tap to submit before keeping "in 60 seconds" on all pages. The generalisation from surveys to this quiz is **UNVERIFIED**; it is test-worthy but not a priority.
- Check: open the Villar abstract; check the CTA claim against the beacon's tap-to-submit time.

### 12. Message match, hero and campaign pages: keep the discipline, drop the unsourced numbers, do not justify many pages with the HubSpot study (MEDIUM)
- NN/g's information-scent idea (Feb 2020) supports matching the landing headline to the clicked ad: a clear match keeps people moving, a vague one makes them leave. Google Ads grades "landing page experience" as one of three Quality Score parts (Google Ads Help, undated), relevant only if Google brand ads run. No quantified, independent message-match lift was found: the "up to 39%" is not on Unbounce's own pages that I checked (finding 7).
- HubSpot's "more landing pages -> up to 12x more leads" (4,000 customers; undated PDF, circa 2012-13, **STALE**) is correlational and confounded by company size and spend; do not use it to justify more campaign subdomains.
- NN/g (31 Oct 2010, last reviewed Aug 2026, **STALE** data): decorative stock photos are ignored; photos of real people and product details are looked at. The current text-only hero is defensible (LCP is the H1). Add imagery only if it is real (SA, consented, with the AI-image disclosure from RECONCILE B9) and <= ~30 KB; do not assume a family photo lifts conversion (4.5 plans to test it).
- Scroll and reading facts used to justify the 110-word rule are old or desktop-only (finding 7); keep the rule as a discipline, not as proof.
- Implication: per campaign page, change only what the ad changed (H1 = ad hook, sub, one proof element) so that template-level tests can pool traffic (finding 2); run H1-equals-hook vs generic H1 as one pooled test rather than per page; keep pages indexed or noindexed per the SEO lens, not for CRO reasons.
- Check: view-source of the page against the ad copy; confirm `build.mjs` warns when `h1` differs from `ad_hook`.

---

## Appendix A: sample-size tables (computed 10 Oct 2026)
Two-proportion z-test, alpha 0.05 two-sided, power 80%, equal arms. Formula: n = (z_a * sqrt(2 * pbar * (1 - pbar)) + z_b * sqrt(p1 * (1 - p1) + p2 * (1 - p2)))^2 / (p2 - p1)^2, with z_a = 1.96, z_b = 0.84. Validation: 20% -> 25% gives 1,094 per arm (textbook ~1,091); 50% -> 55% gives 1,565 (textbook ~1,565). Online calculators (Evan Miller, Optimizely) can differ slightly.

Visitors needed per arm to detect a relative lift:
| Baseline | +20% | +30% | +50% | +100% |
|---|---|---|---|---|
| 5% | 8,158 | 3,780 | 1,471 | 435 |
| 10% | 3,841 | 1,774 | 686 | 199 |
| 15% | 2,402 | 1,106 | 424 | 121 |

Smallest relative lift detectable at 80% power with n per arm:
| Baseline | 500 | 1,000 | 2,000 | 4,000 |
|---|---|---|---|---|
| 5% | 92% | 62% | 42% | 29% |
| 10% | 59% | 41% | 28% | 20% |
| 15% | 46% | 32% | 22% | 15% |

"200 conversions per arm" is n = 200/baseline: 4,000 (5%), 2,000 (10%), 1,333 (15%) per arm, detecting 29%, 28%, 27%.

## Appendix B: audit of CRO numbers in `docs/MASTER-PROMPT.md` 4.5 (lines 587-625)
| Claim in repo | What I found | Status |
|---|---|---|
| Insurance 18.2% / finance 8.3% median (Unbounce, 41k pages) | Both figures are on Unbounce's finance page; 2024 report; self-selected platform pages; see finding 1 | Verified as quoted, misapplied as a target |
| Grade 5-7 converts best (18.1% in finance) | Finance page says 18.1%; Unbounce's all-industry page says 11.1% (56% better than 8th-9th grade); finance data is non-monotonic (8th-9th grade lowest 6.5%, "professional" 14.4%) | Directional, correlational (B) |
| Message match "up to 39%" (Unbounce) | Not found on Unbounce's message-match glossary, case studies, average-conversion or benchmark pages | UNVERIFIED |
| "3 fields ~ 25% completion" (Baymard) | Baymard: 11.3 average checkout fields, ~8 recommended, no per-field % in that article | Misattributed or UNVERIFIED |
| "Proof beside the ask ~ 18%" (Baymard) | Not found in what I read | UNVERIFIED |
| NN/g: 20-28% of words read; +4.4 s per 100 words; half read only at <= 111 words | Weinreich et al. data collected 2005, NN/g article 5 May 2008 | STALE, true to source |
| NN/g: 57% above fold, 74% in first two screens | 2018, 120 participants, desktop only | STALE-ish, desktop only |
| "Single CTA 31% higher" (CXL/Leadpages) | Not located | UNVERIFIED |
| "1 s pages 3.05% vs 3 s 1.12%" (CXL/Portent) | Portent B2C e-commerce slice, 2019, correlation; B2B lead-gen slice reported as ~3x at 1 s vs 5 s (updated Apr 2022) | STALE, observational |
| "0.1 s -> +8.4% conversions" (Deloitte/Google) | 8.4% is retail; lead-gen: +5.5% to form step 1, +21.6% step 1 -> submit; observational, late 2019 | STALE, misapplied |
| "Each extra second +32% bounce" | Not re-checked here (Google/SOASTA 2017-era) | UNVERIFIED |
| Multi-step ~14% better, field-count conversion table (Digital Applied 2026) | Vendor blog | C |
| "Only ~1/3 of changes win" | 33.5% in one 1,001-test set (2022); 10-20% at large web firms in other sources | Plausible upper end |
| Five users find ~85% of problems (NN/g) | Classic result, not re-fetched | Not checked |
| WhatsApp ~90% of SA internet users (DataReportal) | Not on the DataReportal Digital 2026 SA text page | UNVERIFIED |

## Appendix C: motion rules for the Motion integration (summary of finding 5)
Allowed: tap feedback <= 150 ms; quiz step transition <= 250 ms with `transform` and `opacity` only and reserved height; progress fill; slot-grid stagger after data arrives.
Forbidden: anything before first paint on H1 or CTAs; scroll-linked or looping effects; `height/top/left` animation; motion that blocks tapping; hidden-until-JS content.
Always: bundle `motion/mini` (2.3 kb) from `'self'`, honour `prefers-reduced-motion` via `matchMedia`, test INP on a Galaxy A-class phone, keep a no-Motion control.

## Gaps and UNVERIFIED items
- No SA-specific landing-page conversion benchmark, CPC, or quiz-funnel benchmark found; first 2 weeks of production data replace everything in finding 1.
- Meta help-centre pages (A/B test confidence level, landing-page-views definition) did not render for the fetcher; read them in Ads Manager.
- Newer Unbounce edition than 2024 not confirmed to exist; WordStream and LocaliQ are US small-business samples.
- Behaviour of `sessionStorage`, cookies and `wa.me` taps inside Facebook and Instagram in-app browsers on current Android and iOS needs a device test.
- Cloudflare Radar P75 network figures for South Africa were not retrieved; Alex Russell's global P75 (9/3/100) is used as a proxy.
- Whether Motion's vanilla `animate()` respects `prefers-reduced-motion` automatically is not documented in the pages read; gate it manually.
- CSP interaction: Motion's WAAPI and CSSOM style writes should not need `'unsafe-inline'`, but this was not tested against the planned quiz CSP.

## Sources (fetched 10 Oct 2026 unless dated)
- Unbounce, Finance & Insurance benchmarks (2024 report): https://unbounce.com/conversion-benchmark-report/finance-insurance-conversion-rate/
- Unbounce, What's a good conversion rate (updated 25 Jul 2025): https://unbounce.com/landing-pages/whats-a-good-conversion-rate/
- WordStream, Google Ads benchmarks 2025 (updated 18 May 2026): https://www.wordstream.com/blog/2025-google-ads-benchmarks
- LocaliQ, Facebook ads benchmarks (updated 23 Sep 2026): https://localiq.com/blog/facebook-advertising-benchmarks/
- Alex Russell, Performance Inequality Gap 2026 (24 Nov 2025): https://infrequently.org/2025/11/performance-inequality-gap-2026/
- HTTP Archive Web Almanac 2025, Page Weight and Performance: https://almanac.httparchive.org/en/2025/page-weight , https://almanac.httparchive.org/en/2025/performance
- Chrome for Developers, CrUX methodology: https://developer.chrome.com/docs/crux/methodology ; web.dev CrUX vs RUM (17 Dec 2025): https://web.dev/articles/crux-and-rum-differences
- Engineering at Meta, Chromium-based WebView (30 Sep 2022): https://engineering.fb.com/2022/09/30/android/launching-a-new-chromium-based-webview-for-android/
- web.dev INP (2 Sep 2025), CLS (12 Apr 2023), LCP (4 Sep 2025), Optimize LCP (31 Mar 2025): https://web.dev/articles/inp , https://web.dev/articles/cls , https://web.dev/articles/lcp , https://web.dev/articles/optimize-lcp
- Motion docs: https://motion.dev/docs/animate , https://motion.dev/docs/quick-start , https://motion.dev/docs/react-accessibility , https://motion.dev/ai-kit
- NN/g: How Little Do Users Read (5 May 2008) https://www.nngroup.com/articles/how-little-do-users-read/ ; Scrolling and Attention (15 Apr 2018) https://www.nngroup.com/articles/scrolling-and-attention/ ; Animation duration (9 Feb 2020) https://www.nngroup.com/articles/animation-duration/ ; Information scent (2 Feb 2020) https://www.nngroup.com/articles/information-scent/ ; Photos as web content (31 Oct 2010) https://www.nngroup.com/articles/photos-as-web-content/
- W3C: WCAG 2.2 what is new (5 Oct 2023) https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ ; Focus Not Obscured https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html ; Target Size https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ; Identify Input Purpose https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html ; Status Messages https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html ; Pause Stop Hide https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html ; Animation from Interactions https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- Baymard, Explain why the phone field is required (2025 survey n = 1,026): https://baymard.com/blog/explain-phone-number-field ; Checkout form fields (2024): https://baymard.com/research-articles/checkout-flow-average-form-fields
- Zuko, single page or multi-step: https://www.zuko.io/blog/single-page-or-multi-step-form ; Venture Harbour: https://ventureharbour.com/multi-step-lead-forms-get-300-conversions/ ; Conversion Sciences (20 Jul 2023): https://conversionsciences.com/ab-test-form-versus-quiz/
- Villar, Callegaro, Yang, progress indicators meta-analysis (2013): https://openaccess.city.ac.uk/id/eprint/14427/
- Analytics-Toolkit, 1,001 A/B tests (18 Oct 2022): https://blog.analytics-toolkit.com/2022/what-can-be-learned-from-1001-a-b-tests/ ; Evan Miller, How not to run an A/B test (18 Apr 2010): https://www.evanmiller.org/how-not-to-run-an-ab-test.html ; Evan Miller sample size: https://www.evanmiller.org/ab-testing/sample-size.html
- Deloitte/Google, Milliseconds make millions (24 Jun 2020): https://web.dev/case-studies/milliseconds-make-millions ; Portent speed study (updated Apr 2022): https://portent.com/blog/analytics/research-site-speed-hurting-everyones-revenue.htm
- DataReportal: https://datareportal.com/reports/digital-2026-south-africa , https://datareportal.com/reports/digital-2026-global-overview-report ; StatCounter SA OS and browser (Sep 2026): https://gs.statcounter.com/os-market-share/mobile/south-africa , https://gs.statcounter.com/browser-market-share/mobile/south-africa
- Vodacom prepaid data page: https://www.vodacom.co.za/vodacom/shopping/data/data-for-your-smartphone ; MyBroadband data price article (16 Feb 2026): https://mybroadband.co.za/news/cellular/628846-the-price-of-1gb-of-data-in-south-africa-versus-the-rest-of-world.html
- WhatsApp Business Messaging Policy (23 Sep 2026): https://whatsappbusiness.com/policy/ ; Meta WhatsApp pricing: https://developers.facebook.com/docs/whatsapp/pricing ; SABRIC (4 Nov 2025): https://www.sabric.co.za/ai-powered-scams-expected-to-increase-during-festive-season/
- Google Ads Help, Quality Score: https://support.google.com/google-ads/answer/6167118 ; HubSpot, Lead generation lessons from 4,000 businesses: https://knowledge.hubspot.com/hubfs/docs/ebooks/lead-generation-lessons-from-4000-businesses.pdf
