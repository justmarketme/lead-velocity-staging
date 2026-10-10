# SortMyCover website: build specification

Version 1.2 (patched twice after critic review, 10 Oct 2026; see section N). First written 10 Oct 2026. Status: specification only. Nothing here has been built, deployed, committed or installed.
Companion file: `deliverables/website/fact-check.md` (the evidence ledger: 96 claims, each checked twice).
Scope: the new sortmycover.co.za (an apex site plus campaign landing pages on subdomains), built on what already exists in `landing/`.

## How to read this spec

- `[T1]`, `[S7]`, `[G2]`, `[U2]`, `[P3]`, `[C5]`, `[D1]`, `[M3]`: rows of `fact-check.md` (T top5-sites, S seo-google, G geo-llm-search, U ux-cro, P meta-pixel-capi, C compliance-sa, D subdomain-architecture, M motion-library). Only the corrected form of a PARTLY row is used here. The 60 traps in ledger section 2 are not repeated.
- `rule S13`: a writer rule from `research/compliance-sa.md` section 5 (rules S1 to S35). They are written "rule S13" so they do not clash with ledger rows such as `[S7]`.
- `[DJ]`: design judgement. No ledger row proves it. The owner may overrule it. Each one says why.
- `[HYP]`: a hypothesis that must be tested before it is relied on. `(H12)` points at the number in ledger section 3.
- `[RAW]`: taken from a research file but not in the ledger, so it was not adversarially checked.
- Anything dated before 2024 is marked STALE-RISK.
- Nothing here is legal advice. Every legal conclusion goes to the compliance practitioner (section L, questions Q1 to Q8).
- Money, DNS, account and legal actions are gates for Jonathan (section M). Nothing in this spec authorises an agent to take them.

## 0. Decisions at a glance

| # | Decision | Rests on |
|---|---|---|
| DEC-1 | One Vercel project (`sortmycover`, Root Directory `landing`). The apex is the trust, education and generic-booking site. Each ad angle with a live ad gets a subdomain whose label equals the angle slug. Each page lives on exactly one host. | [D1] [D2] [D3] [D7] [D10] |
| DEC-2 | Folder URLs with a trailing slash (`/about/`). No `cleanUrls`, no `trailingSlash` setting. Every old `.html` URL gets a 301. Done now because nothing is indexed yet. | [S7] |
| DEC-3 | The quiz shrinks to two taps (age band, budget band), then first name, mobile and consent. Out-of-band answers exit at once with a neutral line. Bond, dependants and work-cover questions are dropped until the attorney answers Q2. | [C2] rule S18 rule S19 |
| DEC-4 | The ad-measurement consent becomes its own optional control, `CONSENT-OPTIMISE` of CP-v0.2, unticked, with "I give" and "I do not give". The Pixel loads only after "I give" (opt-in default). One flag switches to notice mode after the attorney answers Q3. The choice and the opt-out are one cookie on `sortmycover.co.za`. The cookieless, count-only first-party beacon runs separately from that choice. | [P1] [P2] [P3] [C6] |
| DEC-5 | No page says SortMyCover checks, sorts, reviews, arranges or matches cover. CTA: "Book my adviser call". Cost line: "The call costs you nothing." The "2 to 4x salary" bars and lines are removed until a dated, ARB-acceptable source is filed. | [C1] [C3] [C5] |
| DEC-6 | The legal identity block (name, registration number, address, phone, email, directors) goes in every footer, with the "not a financial services provider" line. This reverses decision A of 5 Oct 2026. Jonathan must say yes. The FOOTER-v2 line is quoted in full in C.1 item 7. | [T6] [S3] [C7] |
| DEC-7 | Motion: the free MIT `motion` 14.1.0, vendored as one pinned, tree-shaken file (mini `animate` + `inView`, about 3.2 KB brotli; `scroll` adds about 3.5 KB on the home page only). **Four** recipes use it (F.3 recipes 1, 2, 5 and 7): scroll reveal with stagger on non-disclosure blocks, quiz step transition, slot-grid stagger, how-it-works scroll line. The sticky CTA (recipe 6) is a native `IntersectionObserver`, and the progress bar, tap feedback, FAQ and tick are CSS. Nothing needs Motion+ or the AI Kit. Reduced motion is gated by our own code, because vanilla `animate()` does not honour it. The 3.2 KB figure is the vendored file alone; the two-hop load (`fx.js`, then the vendored file) sits below the fold and its LCP and INP effect is an acceptance test (B-08, F.2), not an assumption. The gate and the failsafe are untested until that test passes (H23, H24). | [M1] [M2] [M3] [M4] [M9] |
| DEC-8 | `/learn/` becomes four hubs, a glossary and a FAQ, with 26 article titles in three waves. Every article carries a byline, dated sources, a scope sentence and a "last reviewed" date, and needs no JavaScript to read (the only script on an article is the 0.5 KB count-only beacon of J.4). | [S8] [T10] [G5] [G8] |
| DEC-9 | Search: campaign hosts get a header-level noindex plus a self-canonical, an allow-all robots.txt and no sitemap. Google Business Profile is off the launch gate. FAQPage JSON-LD is dropped. No llms.txt. AI crawlers stay allowed. | [S1] [S2] [S6] [G2] [G3] [G12] |
| DEC-10 | Stage KPIs replace the single 18% gate. Page A/B tests are only for structural changes expected to move a metric by 50% or more. Hooks are tested at ad level. A first-party RUM beacon covers Meta in-app browsers. | [U1] [U2] [U5] |
| DEC-11 | Confirm the Vercel plan and move to Pro before the first paid click. No wildcard. One CNAME per host at Hostinger. `routes`, not `rewrites`, for host roots. Test with a Host header before DNS. | [D1] [D2] [D3] [D4] [D11] |
| DEC-12 | Meta: business-messaging events become `LeadSubmitted` and `QualifiedLead`. Graph v25.0. QA on a throwaway dataset. No event-priority step. The Meta-facing `content_name` is a neutral code. | [P4] [P6] [P12] [P5] |
| DEC-13 | The compliance practitioner reviews the live site and quiz, not only the contract, before the first paid click. | [T1] [C1] |
| DEC-14 | Scope decisions made explicitly (L.4, with owner, trigger and cost): English only at launch; an accessibility statement page is added; cookies stay a section of Privacy with an anchor; there is no adviser-facing area on this site, only an optional footer link to the Lead Velocity site; no GA4 (G.5). | [DJ] |

### 0.1 Synthesis by lens

One page: what each research lens concluded, the fact that countered the first draft of it, and what the spec decided. "Most-cited sources" are the five source families the ledger cites most often for that lens (counted from `fact-check.md` section 4), not a ranking of quality. The traps (ledger section 2) are not repeated here.

| Lens | Benchmark set or most-cited sources | Finding adopted | Counter-fact that corrected it | Decision |
|---|---|---|---|---|
| T top5-sites | Compare the Market, NerdWallet, Ethos, Policygenius, Unbiased (UK and US; none is licensed in South Africa) | Free-and-how-we-are-paid placed in several spots; low-effort quiz first, contact last; legal identity visible | Their quotes, rankings and results are licensed activity, but a neutral hand-over is "not established as safe" (T1, T2); SortMyCover already had more disclosure than claimed (T3, T4) | DEC-3, DEC-5, DEC-6, Q1, Q4 |
| S seo-google | developers.google.com, support.google.com, Search Engine Journal, web.dev, vercel.com | Folder URLs, self-canonicals, long-tail trust content, byline and dated sources | FAQ rich results gone since 7 May 2026 (S6); a Business Profile is not available to lead generators (S2) | DEC-2, DEC-8, DEC-9, G.1 to G.4 |
| G geo-llm-search | developers.google.com, Ahrefs, SE Ranking, Search Engine Journal, vercel.com | Stay indexed and crawlable, answer first with a scope sentence, build a real entity | No causal evidence that bot blocking, schema or llms.txt moves citations (G2, G11, G12); AI referral value unproven either way (G6) | DEC-9, G.5; no llms.txt, no GA4 |
| U ux-cro | web.dev, W3C, Nielsen Norman Group, Unbounce, WordStream | Message match, two-tap quiz, 48 px targets, reserve space, WCAG 2.2 AA | The 18% gate is Unbounce's own-customer median (U1); almost no page test is powerable at our traffic (U2) | DEC-10, J.1 to J.3 |
| P meta-pixel-capi | developers.facebook.com, facebook.com, Jon Loomer, Information Regulator, MDN | One `event_id`, server and browser, hashed only with consent, neutral parameters | Opt-in vs notice is unsettled (P2); the "separate" consent was not separate in the code (P1); event priority is gone (P6) | DEC-4, DEC-12, H.1 to H.6 |
| C compliance-sa | Masthead, ARB, FAIS Ombud, acts.co.za, Information Regulator | Educate never advise; no price, ranking, "check" or "licensed" about SortMyCover | Raspberry Academy is one unopposed ruling and does not clear a flat hand-over (T1, C2); the GCoC binds advisers, not us directly | DEC-5, DEC-13, section I, Q1 to Q8 |
| D subdomain-architecture | vercel.com, developers.google.com, sortmycover.co.za (live checks), RFC Editor, dns.google | One project, one CNAME per host, header-level noindex, `routes` for host roots | The `routes` shape is unproven on this project (D1, H1); n8n CORS takes exact origins (D8) | DEC-1, DEC-11, C.3 to C.5, B-00A |
| M motion-library | motion.dev, GitHub and unpkg (package files), web.dev, npm registry | Free `motion` 14.1.0 vendored, four recipes, CSS or native for the rest | `animate()` ignores reduced motion since 13.3.0 (M4); official sizes are not brotli (M3) | DEC-7, F.1 to F.3 |

South African peer set: Hippo.co.za, Discovery and Dial Direct were looked at only through search snippets and the Hippo contact page (T7, trap 11). That is a stated gap, not an analysis; see L.4.

What stays as built: the brand tokens and DM Sans, the approved quiz look, the in-page booking widget, the n8n contracts (`/lead`, `/slots`, `/book`, `/lead/skip`, `/beacon`), the honeypot, the Turnstile slot, the lead token, and the Playwright tests (updated, not discarded).

---

## A. Goals and the single job of each page type

### A.1 Goals

| Goal | How it is measured | Notes |
|---|---|---|
| 1. Turn paid-social clicks into booked, attended calls (primary). | Stage KPIs, section J.1. Judged on cost per qualified lead and cost per attended call. | The 18% page gate is not a like-for-like target [U1]. The 3 to 10% visit-to-submitted band is a planning figure only [HYP] (H36). |
| 2. Convince a sceptical visitor (a brand searcher, a reader of a learn page) that SortMyCover is real, costs them nothing and is safe. | Brand SERP positions for `sortmycover`, `sortmycover reviews`, `sortmycover scam`; the share of home visitors who reach `/book/`. | Position 1 to 3 for `sortmycover` by week 4 is the serp-plan target. Judge on 4-week rolling windows, never the first 4 to 8 weeks [S10]. |
| 3. Earn organic and AI-answer visibility on education queries. | Search Console impressions and clicks, Search Console Generative AI report (impressions only), Bing AI Performance (citations), a monthly brand-query audit across five engines. | Slow. A new YMYL domain starts at zero authority [G4]. |
| 4. Stay inside FAIS, POPIA, CPA and the ARB code. | Zero blocker findings at review (section I). | The site must never recommend, rank, price, compare or transact [T1] [C1]. |

### A.2 The single job of each page type

| Page type | Single job | One primary action | Must not |
|---|---|---|---|
| Home `/` | Make a sceptical visitor sure this is real, and send them to book. | "Book my adviser call" to `/book/`. | Ask a quiz question, show a rating or a counter, or make a claim about the visitor's cover. |
| Generic booking `/book/` | Convert organic and brand-search visitors with the same quiz as the campaign pages. | Answer Q1. | Carry an ad hook it cannot support. |
| Campaign page `<slug>.sortmycover.co.za` | Convert one ad's click into a booked call. One ad hook, one goal. | The quiz. | Repeat the home page, link out to other angles, or carry navigation. |
| Thank-you `/thanks/` | Confirm what happens next and which WhatsApp number the message comes from. | Save the number. | Echo the budget answer or compute anything from answers (rule S19). |
| How it works | Remove surprise from the three steps and the call. | "Book my adviser call". | Describe outcomes or benefits of the call (rule S7). |
| How we make money | Answer "what is the catch?" in full. It is the strongest trust page. | Read it. | Say "no commission" without scoping it to SortMyCover (rule S6). |
| Advisers | Show who the adviser is, how to check them on the FSCA register and what they must tell you. | Open the FSCA lookup. | Use "independent" about SortMyCover (rule S4), or name an adviser in ad context (rule S27). |
| About | Show who is legally responsible. | Read the identity block. | Withhold the company name [C7]. |
| Learn hub | Route a reader to the right article. | Open an article. | Rank, recommend or compare anything. |
| Learn article | Answer one question accurately, with sources and a date, and point to the next factual step. | Read, then optionally book. | Say what a person needs, should have or is short by (rule S12). |
| Glossary | Define terms objectively. | Jump to an article. | Define any insurer-specific or product-brand term. |
| FAQ | Answer the top objections in one place. | Book. | Hold a disclosure that appears nowhere else (rule S34). |
| Contact | Give human routes. | Email or WhatsApp. | Offer staff who advise. |
| Complaints | Give a real route and the escalation order. | Send the complaint. | Name the FAIS Ombud as the route for SortMyCover itself [C7]. |
| Privacy, Terms, PAIA | Meet the legal duty in plain language. | Read. | Promise a process that cannot run yet [C9]. |
| 404 | Recover the visitor. | Go home or book. | Show a quiz. |

---

## B. Information architecture and sitemap

### B.1 Sitemap (apex)

```
sortmycover.co.za
  /                          Home
  /book/                     Generic booking page (the quiz, no ad hook)         index, in sitemap
  /book/thanks/              Thank-you                                            noindex
  /how-it-works/
  /how-we-make-money/
  /advisers/                 Who your adviser is, how to check them, independence
  /about/                    Legal identity, what we do and do not do
  /contact/
  /complaints/
  /faq/
  /learn/                    Hub
    /learn/life-events/              Hub 1
    /learn/reading-your-cover/       Hub 2
    /learn/the-call-and-trust/       Hub 3
    /learn/myths-and-definitions/    Hub 4
    /learn/<article>/                26 articles (B.4)
    /learn/glossary/
  /editorial-policy/         How we write and check
  /accessibility/            Accessibility statement (DEC-14)
  /privacy/   /terms/   /paia/      (cookies are a section of /privacy/, anchor #cookies; opt-out anchor #opt-out)
  /404.html   /robots.txt   /sitemap.xml   /manifest.webmanifest

<slug>.sortmycover.co.za     Campaign pages. Only "/" and "/thanks/" exist. noindex.
link.sortmycover.co.za       Reserved: consumer /c/ and /j/ links at the VPS (automation/dns/DNS.md). Not a Vercel host.
```

Indexing: every apex page above is indexable except the thank-you pages and the 404. `/book/` is indexable because it is one page, not eleven near-duplicates [S1] [DJ]. Privacy and Terms flip from noindex to indexable only after compliance sign-off and the removal of the DRAFT marks (`serp-plan.md` section 2).

### B.2 Navigation

- Header (desktop): wordmark, How it works, How we make money, Learn, About, Contact, and a button "Book my adviser call". Header (mobile): wordmark, a `<details>` menu with the same links (no JavaScript), and the button.
- Footer, three groups. Understand: How it works, How we make money, Advisers, Learn, Glossary, FAQ. Trust: About, Contact, Complaints, Editorial policy, Accessibility. Legal: Privacy, Terms, PAIA manual, "Opt out of ad measurement" (links to `/privacy/#opt-out`; on every campaign host too [P3]).
- The Learn hub is linked from the header and the home body, not only the footer [RAW] (Google "crawlable links" and descriptive anchors).
- Campaign pages have no navigation (one page, one goal). Their footer carries the identity block and the same legal links.

### B.3 URL rules and the old-URL map

Rules: lowercase, hyphens, trailing slash, no file extensions, no dates in URLs, every canonical absolute and self-referencing, and one URL form per page [S7]. Avoid `cleanUrls` combined with `trailingSlash`: a reported 308 loop and an untested interaction (H32). The build writes `<page>/index.html`, which already serves with and without the slash.

| Old URL (live since 5 Oct 2026) | New URL | Status |
|---|---|---|
| `/about.html` | `/about/` | 301 |
| `/book.html` | `/book/` | 301 |
| `/how-we-make-money.html` | `/how-we-make-money/` | 301 |
| `/complaints.html` | `/complaints/` | 301 |
| `/privacy.html` | `/privacy/` | 301 |
| `/terms.html` | `/terms/` | 301 |
| `/learn/what-is-a-life-cover-gap.html` | `/learn/what-is-a-life-cover-gap/` | 301 |
| `/learn/what-happens-on-a-30-minute-call.html` | `/learn/what-happens-on-a-30-minute-call/` | 301 |
| `/learn/how-to-read-your-payslips-cover-line.html` | `/learn/how-to-read-your-payslips-cover-line/` | 301 |
| `/learn/how-sortmycover-works.html` | `/learn/how-sortmycover-works/` | 301 |
| `/learn/life-events-that-change-what-you-need.html` | `/learn/life-events/` | 301 (becomes the Hub 1 introduction) |

Several external references use the old URLs: the Instant Form `opt-out` link (`optout_url` in `config/site.json`), `landing/README.md`, the Facebook Page, and the media-buyer `first-batch.csv` `landing_url` column. The generator keeps the 301s forever (cheap), but update the sources too.

### B.4 Content cluster (26 articles)

Principles. Educate, never advise: the boundary is FAIS s1(3)(a) factual advice plus analysis with no recommendation. A personal cover-amount calculator probably falls outside it, so none is built [S8] [T9]. Do not chase "life cover" head terms: a new unlicensed domain will not win them, and the incumbents publish rules of thumb and calculators SortMyCover must not copy [S8]. Target long-tail and trust queries. One substantive article per ad angle gives every paid angle an indexable organic twin [S1]. No keyword volumes exist; size from Search Console after four weeks [HYP] (H30).

Compliance flag: G = green (general education), A = amber (needs a sentence-level check against rules S11, S12, S15), R = red until a blocker clears.

| # | Working title | Slug under `/learn/` | Hub | Twin of angle | Primary sources to cite (type) | Flag | Wave |
|---|---|---|---|---|---|---|---|
| 1 | New home loan: how it connects to life cover, in plain words | `new-home-loan-and-life-cover` | 1 | new-bond | Lender and bank plain-language explainers (dated); FSCA plain-language pages | A | 2 |
| 2 | Bond signing day: the cover paperwork that is separate from the bond | `bond-signing-day-cover-paperwork` | 1 | bond-paperwork | Same | A | 2 |
| 3 | A new baby: what changes for the people who depend on your income | `new-baby-and-who-depends-on-you` | 1 | new-baby | Stats SA household data (dated) | A | 2 |
| 4 | Cover set up at 28, life at 40: what usually changes in twelve years | `cover-set-up-years-ago` | 1 | turned-40 | None needed; process facts only | A | 2 |
| 5 | Self-employed: what group cover is and why it may not apply | `self-employed-and-group-cover` | 1 | self-employed | Plain definition; FSCA | G | 2 |
| 6 | Supporting more than one household: what "dependants" means in cover | `supporting-more-than-one-household` | 1 | extended-family | Plain definition. Never use the phrase "black tax" in copy meant for ads [RAW] (MASTER-PROMPT 2.1.8) | A | 3 (angle on hold, NH-64) |
| 7 | Changing jobs or leaving work: what usually happens to work cover | `changing-jobs-and-work-cover` | 1 | none | "Group life cover is usually tied to the employer, so it normally ends when the job ends" (compliance lens wording) | G | 3 |
| 8 | Getting married or moving in together: who is named on cover | `marriage-and-who-is-named` | 1 | none | Plain definition of a nomination | G | 3 |
| 9 | How to read the cover line on your payslip | `how-to-read-your-payslips-cover-line` | 2 | none | Existing article; rewrite to remove the unsourced multiple | A | 1 |
| 10 | Work cover and personal cover: the difference in plain words | `work-cover-and-personal-cover` | 2 | none | Plain definition | G | 3 |
| 11 | What is a life cover gap, in plain words? | `what-is-a-life-cover-gap` | 2 | employer-gap (organic twin) | Existing article. May cite the ASISA/True South 2025 gap study with source and month, never as a per-person figure [C5] | A | 1 |
| 12 | What surveys say about employer life cover in South Africa | `employer-cover-surveys` | 2 | employer-gap | Sanlam Benchmark 2025 (death-benefit averages 2.80x to 3.35x depending on fund type; disability 2.11x to 2.35x). HOLD until ARB 4.1.3 and 4.1.4 are checked, because Sanlam is an insurer and BDRC Africa's accreditation is unconfirmed (H18) [C5] | R | 3 |
| 13 | What a beneficiary nomination is and why it matters | `beneficiary-nomination` | 2 | none | Plain definition | G | 3 |
| 14 | Where to find your benefits statement and policy schedule | `where-to-find-your-documents` | 2 | none | Process facts | G | 3 |
| 15 | Life cover, funeral cover and credit life: three different things | `life-funeral-and-credit-life` | 2 | none | Objective product description (s1(3)(a)(i)(dd)) | A | 3 |
| 16 | What happens on the 30-minute call | `what-happens-on-a-30-minute-call` | 3 | what-the-call | Existing article. Process terms only (rule S7) | G | 1 |
| 17 | How to check that an adviser is authorised: the FSCA register, step by step | `how-to-check-an-adviser` | 3 | none | FSCA public register (`fsca.co.za/FSB-Search/`). It is a form-based search, so link to the form, not to a person [S3] | G | 1 |
| 18 | How SortMyCover works and makes money | `how-sortmycover-works` | 3 | none | Existing article | G | 1 |
| 19 | How advisers are paid in South Africa: commission and fees, in plain words | `how-advisers-are-paid` | 3 | none | GCoC s7(1)(c) disclosure duty; FSCA Retail Distribution Review (dated). Do not describe any fee as "free" [C3] | A | 3 |
| 20 | How to complain: who to contact, in what order | `how-to-complain` | 3 | none | Own complaints page; NCC; Information Regulator; ARB; FAIS Ombud for advisers | G | 1 |
| 21 | What to bring to your call: a checklist | `what-to-bring-to-your-call` | 3 | none | Process facts | G | 1 |
| 22 | What happens to your details when you ask for a call | `what-happens-to-your-details` | 3 | none | Own privacy notice | G | 1 |
| 23 | Checking cover is not the same as buying it | `checking-cover-is-not-buying` | 4 | c13-check-not-buy | Process facts. The word "checking" here is about the reader, not about SortMyCover (H37, Q1, Q5) | A | 2 |
| 24 | No sales visit, no jargon: what a virtual call means | `what-a-virtual-call-means` | 4 | virtual | Process facts | G | 2 |
| 25 | Does booking a call commit you to anything? | `does-a-call-commit-you` | 4 | none | Own terms | G | 3 |
| 26 | Why you will not see prices on this site | `why-there-are-no-prices` | 4 | myth-bust | FAIS boundary stated plainly | A | 2 |

Waves. Wave 1 (before the first ad): 9, 11, 16, 17, 18, 20, 21, 22, plus the Hub 1 introduction (the old "life events" article). Wave 2 (as each host goes live): 1, 2, 3, 4, 5, 23, 24, 26. Wave 3: the rest. Each wave ships only after the editor and the independent reviewer (B.6) have signed it. Grow an article beyond its first draft only when Search Console shows impressions for it [S8].

### B.5 Glossary starter list (36 terms)

authorised, adviser, beneficiary, bond, cover gap, commission, conflict of interest, credit life, dependant, disability cover, estate, exclusion, FAIS, FAIS Ombud, financial advice (versus information), financial services provider (FSP), FSCA, fee (advice fee), funeral cover, group life cover, income protection, intermediary, key individual, licensed, life cover, medical underwriting, nomination, personal cover, policy schedule, premium, representative, severe illness cover, sum assured, term, waiting period, work cover.

Defined terms (one meaning site-wide): **authorised** = holds FSCA authorisation as a financial services provider (FSP) under FAIS; **adviser** (on this site) = a representative of an FSCA-authorised FSP, acting under that FSP's authorisation; **licensed** is a glossary entry that points to "authorised" and is not used in page copy. Rules: objective, one to three sentences each, no insurer or product-brand names, no "you should", a "last reviewed" date on the page, and `DefinedTerm` markup is optional [DJ].

### B.6 Article template and the answer-first pattern

Every article, in order:

1. H1 (the question or topic, plain words).
2. Byline: named editor, "Last reviewed" date equal to JSON-LD `dateModified` and to the sitemap `lastmod`. A reviewer line appears only after a real review by someone who is not a broker SortMyCover routes leads to; the build refuses a reviewer block without `reviewer.verified_on` and an FSCA register link [S3] (NH-30 D in `serp-plan.md`). An `Organization` author is allowed but weaker than a human byline for YMYL [S3].
3. Answer block, 40 to 60 words, plus the scope sentence in the same block ("This is information, not advice."). A passage extracted on its own then carries its own caveat [G5] [G8].
4. Sections with question-style H2s. No fixed length: an early direct answer has the most consistent support, while 120 to 180 words per section is not an established optimum [G8].
5. "Sources" list: primary sources with the date each page showed (rule S15).
6. "Related" links: up to `/learn/<hub>/`, two sideways articles, How we make money, About (descriptive anchors).
7. A single quiet call to action block ("Book my adviser call", with "The call costs you nothing.").
8. JSON-LD: `Article` (author `Person` once the editor consents, otherwise `Organization`) and `BreadcrumbList`. No `FAQPage`, no `HowTo`, no `Product`, `Offer` or `AggregateRating` [S6] [G11].

Example answer block for `how-sortmycover-works` (46 words): "SortMyCover makes money from a fee that advisers pay us for the introduction and booking service. The fee does not depend on whether you buy anything. We take no commission and no share of any premium. SortMyCover gives no financial advice. This is information, not advice." The fee sentences follow the fee-statement rule in C.1 item 5.

Editorial controls, enforced by the build (task B-05): `fact_checked_by` and `fact_checked_on` in front matter; `sources[]` non-empty; any `%`, multiple of salary or rand figure must map to an entry in `config/evidence.json` with a URL and the month shown (rule S15); AI assistance is disclosed on `/editorial-policy/` and every AI-assisted draft has a named human fact-check [G5].

---

## C. Campaign landing pages

### C.1 Template (one page, one goal)

A campaign page is the existing quiz page (`landing/template/`) with the changes in section K. Contents, top to bottom:

1. Brand strip: wordmark only, no navigation, no links out except the footer.
2. H1 = the ad hook, verbatim from `angles/<slug>.json` `ad_hook`. One sub line of at most 25 words. One proof element only if it is real (today: none, `proof: []`) [U11] [C10].
3. The quiz card, open in the first viewport on a 360 px phone (D.2).
4. "What happens next" in three steps (answer two taps, pick a time, talk to the adviser).
5. Cost line and who-we-are block: "The call costs you nothing. Advisers pay SortMyCover a fee for the service. The fee does not depend on whether you buy anything. SortMyCover is not a financial services provider and gives no advice." [T3] [C3]
   - **Fee-statement rule (used verbatim on every page that states how SortMyCover is paid).** Public copy says only what the contract says. The draft Lead Generation Services Agreement (LGSA-v0.2, `deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement-v2.md`) says in clause 8.2 that the Fee is payable whether or not an appointment, advice, application or purchase follows and is not contingent on any Financial Product, and in clause 8.3 that no commission, success fee or share of premium is ever payable. Clause 8.1 sets the Fee per Billing Cycle, clause 9.1 allows optional per-lead Top-Ups, and clause 8.7 lets prices change for a future cycle. So the words "flat", "flat monthly" and "the same" are **not** used in public copy: they are not exactly what the contract says. The earlier "flat fee ... each 30-day cycle" and "flat monthly fee" wordings are withdrawn. The LGSA is a DRAFT and is not evidence of a signed term. Before the sentence goes live, `config/evidence.json` needs an entry `fee-model` that cites the clause numbers of the **signed** agreement for the first adviser, and the build refuses the page if it is missing. The attorney checks the sentence "The fee does not depend on whether you buy anything" under CPA s41 and FAIS s8(9) (Q5). No ledger row covers this rule: it is [RAW] until the signed clause is filed.
   - **Disclosure elements.** The cost line, the scope sentence, the identity block, the FOOTER-v2 line and the consent text are disclosures. They are never a reveal target (F.3, rule S34).
6. Five visible FAQ items (cost, who pays us, who is the adviser, what happens to my details, am I committed). Native `<details>`; the answer text is in the HTML, not fetched.
7. Footer: the identity block of DEC-6, the FOOTER-v2 line, links to apex Privacy, Terms, How we make money, Complaints, PAIA, and "Opt out of ad measurement" to `https://sortmycover.co.za/privacy/#opt-out` [P3] [C7] rule S31.
   - **FOOTER-v2, exact text** (from `deliverables/contracts-drafter/lead-generation-agreement/consent-and-privacy.md` section 1.3; stored once as `footer_line` in `config/site.json` and rendered from there, never retyped): "SortMyCover is a service of Lead Velocity (Pty) Ltd. We introduce you to authorised financial services providers. We are not a financial services provider. We do not give financial advice, compare products or quote premiums. You must be 18 or older." The source file is a draft for attorney review (Q7), so the line changes only by editing that one field, and the build fails if any built page carries different text.

Sticky CTA bar: shown only after the quiz card has left the viewport and hidden while it is on screen; the page has `scroll-padding-bottom` equal to the bar height so a focused field is never fully hidden (WCAG 2.2 SC 2.4.11, AA) [U8].

### C.2 Message-match rules

1. The H1 repeats the ad hook. The page promises nothing the ad did not, and the ad promises nothing the page cannot evidence [U11] rule S26. A hook that needs a number needs an evidence file first [C5].
2. Per campaign page change only what the ad changed: H1, sub line, one proof element. Everything else comes from the shared template, so template-level tests can pool traffic across pages [U2] [U11].
3. Ad and page both name SortMyCover and Lead Velocity (Pty) Ltd. Neither names an adviser until Q1 is answered rule S27.
4. Blocker words in an ad or page: check, review, sort, arrange, match, compare, best, cheapest, independent, free (except "the call costs you nothing"), guarantee, approved, regulated [C1] [C3] [C4] rules S1, S13, S16. The brand name and tagline "Sort your cover" are open question Q5; until it is answered the tagline is not used as an H1 or a CTA.
5. Two existing angles are held: `employer-gap` (the "2 to 4x salary" claim has no ARB-acceptable current source [C5]) and `extended-family` (angle on hold, NH-64 [RAW]). `new-bond`, `c13-check-not-buy` and `myth-bust` use "check" or price language and need Q1 and Q5 before their first approved ad (H37).
6. Hooks are tested at ad level (J.3). The landing page is the control, not the experiment.

### C.3 Subdomain scheme

Rule: host label equals the angle slug, one host per landing page, campaign identity carried in `utm_campaign`, never renamed after an ad has run [D10]. Label regex `^[a-z]([a-z0-9-]{0,28}[a-z0-9])?$`, no consecutive hyphens. The research regex wrongly allowed a trailing hyphen; this one does not [D10]. Labels avoid quote, compare, cheap, best, rates, claims, fsca, insurer, bank rule S28. A new optional `host` key in the angle file overrides the slug where the slug breaks rule S28 or the word list in C.2.

| Angle slug | Host | Status | Note |
|---|---|---|---|
| bond-paperwork | bond-paperwork.sortmycover.co.za | attach first | LIVE ad set slot 6 in the `media-buyer` CSV [RAW]. Hook is a plain statement. |
| new-bond | new-bond.sortmycover.co.za | after Q1 and Q5 | "Cover checked?" is the question (H37) |
| new-baby | new-baby.sortmycover.co.za | attach with ad | |
| turned-40 | turned-40.sortmycover.co.za | attach with ad | |
| self-employed | self-employed.sortmycover.co.za | attach with ad | |
| virtual | virtual.sortmycover.co.za | attach with ad | |
| what-the-call | what-the-call.sortmycover.co.za | attach with ad | |
| myth-bust | myth-bust.sortmycover.co.za | after Q1 and Q5 | "No price in this ad" is fine; check the sub line |
| c13-check-not-buy | looking-is-not-buying.sortmycover.co.za | after Q1 and Q5 | `host` override because the slug contains "check" [DJ] |
| employer-gap | reserved, not attached | HOLD | [C5] |
| extended-family | reserved, not attached | HOLD | NH-64 [RAW] |
| _draft/policy-review | not created | BLOCKED | practitioner s14 answer; no keep, cancel or replace wording [RAW] |

A host is attached only when an approved ad points at it, so a retired angle leaves no orphan CNAME. Takeover handling of orphaned CNAMEs at Vercel is undocumented (H5): delete DNS the same day a host is removed [D3].

Reserved labels, never used as campaign hosts: www, mail, autodiscover, hello, howzit, api, n8n, app, go, link, staging, stage, preview, dev, cdn, status, ftp, smtp, imap, pop, webmail. One exception already true today: `www` is a CNAME to the apex that answers with a Vercel 301 to the apex [D10]. `autodiscover` is a CNAME to Outlook and `link` is reserved for the VPS consumer links.

### C.4 Indexing and canonical rules

- Every campaign host: `X-Robots-Tag: noindex` at header level (one host-regex rule, so a host is noindexed from its first request) plus `<meta name="robots" content="noindex">` in the page [S1] [D6]. Google says a page that is noindex from its first crawl never enters the index, while removal of an already indexed page "may take months". So the header is live before the CNAME [S1].
- Canonical: self-referencing, `https://<host>/`, absolute. Never noindex plus a canonical to another URL. The rule comes from John Mueller (2018), not from Google's docs, and Google publishes no precedence between the two, so keep signals consistent [S1] [D6].
- robots.txt per host: `User-agent: *` and `Allow: /`. No `Disallow: /`: noindex needs crawling, and Meta-ExternalAds honours robots.txt (Meta says blocking it may limit ads features; ad-review failure is an inference, not documented) [S1] [D6] [G10]. Each host serves its own file because robots.txt is per host.
- No sitemap on a campaign host, and campaign URLs never appear in the apex sitemap [S1] [D6].
- Search Console will show "Excluded by noindex tag" for these hosts. That is expected. A Domain property covers all subdomains [S9].
- The organic twin of each angle is the matching `/learn/` article on the apex (B.4). Campaign pages do not link to it from the body.
- Existing apex `/<slug>/` URLs: the `landing_url` column of the media-buyer CSV points at them. During a one-week overlap they stay 200 with `noindex` and a self-canonical (never a canonical to the subdomain). After the overlap, 307 to the host with the query string kept (confirmed live for www on 10 Oct 2026). Moving 307 to 308 later has no sourced timeline [DJ] [D7]. Update the CSV `landing_url` and the Instant Form `optout_url` in the same change.
- Doorway risk: Google lists "multiple websites with slight variations" as a doorway example. That eleven hosts match it is a judgement, not a documented finding; noindex is the cheap precaution [D6].

### C.5 Exact `vercel.json` and DNS shapes

Plan: a generator (`landing/scripts/gen-hosts.mjs`, task B-06) reads `landing/angles/*.json` and writes the host blocks between marker comments in `landing/vercel.json`. The file stays committed, because Vercel reads it before the build and its docs show build-time generation only for bulk-redirect files [D9]. A guard in `build-site.mjs` fails the build if the committed blocks drift from the angle files.

Why `routes` and not `rewrites`: Vercel serves a matching file before it applies `rewrites`, and `/` is the apex `index.html`, so a host rewrite for `/` never fires. `routes` run before the filesystem [D1]. The shape was observed working on a different project (outlet-mall, 14 hosts, `src: ^/$`) and is unobserved on this one (H1). Current docs allow `routes` together with `redirects`, `headers` and `rewrites` [D1], but legacy `routes` has historically conflicted with them, and that reading of the docs is untested on this project. A sibling Vercel project of Jonathan's (the Next.js clinics site) reportedly saw `vercel.json` host rewrites ignored (project memory, [RAW], unverified). So `routes` is the single point of failure of the subdomain plan, and **the very first build task after B-00 is a throwaway proof (B-00A), before B-06**: deploy a throwaway deployment with one `routes` host entry, one `redirects` entry, one `headers` entry and one `rewrites` entry in the same `vercel.json`, point an alias such as `routes-proof-sortmycover.vercel.app` at it with `vercel alias set` (the host condition matches the Host header, so no DNS is needed; UNVERIFIED that an alias host matches `has`), and curl it. Pass means: the alias returns the proof page for `/` while the default URL returns the apex page, the redirect and header still apply, and the deployment has no config warnings. If it fails, take a fallback below (costed in K) before any other task.

Per live host the generator emits (example `bond-paperwork`):

```json
"routes": [
  { "src": "^/$",
    "has": [{ "type": "host", "value": { "eq": "bond-paperwork.sortmycover.co.za" } }],
    "dest": "/c/bond-paperwork/index.html" },
  { "src": "^/thanks/?$",
    "has": [{ "type": "host", "value": { "eq": "bond-paperwork.sortmycover.co.za" } }],
    "dest": "/c/bond-paperwork/thanks/index.html" },
  { "src": "^/robots\\.txt$",
    "has": [{ "type": "host", "value": { "re": "^[a-z0-9-]+\\.sortmycover\\.co\\.za$" } }],
    "dest": "/c/robots.txt" }
]
```

- Campaign pages build to `site/c/<slug>/`, so no campaign folder can collide with an apex path. Quiz assets stay at `/assets/`, `/shared/` and `/fonts/` and are served from the filesystem on every host.
- Use `{ "eq": ... }` for host values: a bare string is treated as a regex, so the dots match any character [D1]. Test the first entry on a preview deployment before adding the rest. No named host capture is used in `dest`, because captures are documented only generically for `has` [D1].
- The last route also matches `www`, which is harmless because `www` redirects first. The apex `robots.txt` is a filesystem file and the pattern cannot match the bare apex.
- `/sitemap.xml` on a campaign host routes to `/404.html` with status 404.

Headers. Every response gets exactly one CSP. The CSP rules must **partition** the URL space, because the apex hosts two pages that run the quiz, the Pixel and Turnstile (`/book/` and `/book/thanks/`), and the strict apex policy (`default-src 'self'`) would block the n8n calls, the Turnstile script and `fbevents.js` there. The generic booking page for organic and brand-search visitors would be broken. Three header groups:

1. **Strict apex CSP**, for everything except campaign hosts and the two apex quiz paths. A path regex excludes `/book`, and the `missing` host condition keeps campaign hosts out. Previews and `sortmycover.vercel.app` keep the strict policy on every path except `/book`:

```json
{ "source": "/((?!book(?:/|$)).*)",
  "missing": [{ "type": "host", "value": "^(?!www\\.).+\\.sortmycover\\.co\\.za$" }],
  "headers": [{ "key": "Content-Security-Policy", "value": "<strict apex CSP>" }] }
```

2. **Campaign CSP on campaign hosts** (`has` the same host pattern): `X-Robots-Tag: noindex` plus the campaign CSP below.
3. **Campaign CSP on the apex quiz paths**: two entries, `source: "/book"` and `source: "/book/:path*"`, each with `missing` set to the same campaign-host pattern (so a campaign host never receives the header twice) and the same campaign CSP value. `/book/` is indexable and carries no `X-Robots-Tag`. `/book/thanks/` gets a separate entry with `X-Robots-Tag: noindex` only (a different header key, so there is still exactly one CSP).

The campaign CSP value is defined once in the generator and written into groups 2 and 3:

- `Content-Security-Policy: default-src 'self'; script-src 'self' https://connect.facebook.net https://challenges.cloudflare.com; connect-src 'self' https://<n8n-host> https://www.facebook.com; img-src 'self' data: https://www.facebook.com; frame-src https://challenges.cloudflare.com; style-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`. `<n8n-host>` is a placeholder until Jonathan supplies it.
- **The Meta and Cloudflare origins are unconfirmed.** They come from the README draft [RAW]. Turnstile may also need `challenges.cloudflare.com` under `connect-src`; the Meta Pixel may need `connect.facebook.net` under `connect-src`. Do not guess. Before any ad points at a page (task B-11, "CSP origin proof"), load a preview with the real Pixel (throwaway dataset, Test Events), the Turnstile test site key and the n8n test webhook, with the policy first delivered as `Content-Security-Policy-Report-Only`, record every violation in the console, and add exactly the origins and directives the browser reports. An unverified origin would make the page fail silently at launch, so zero console violations on `/book/`, `/book/thanks/` and one campaign host is an acceptance criterion.
- **No inline script, no inline style, no `<style>` element.** `style-src 'self'` and `script-src 'self'` block them. The current template (`landing/template/index.html`) has things that break under this policy, and the build must fix all of them: (a) `<style>{{{css}}}</style>` at line 23, so page CSS ships as `/assets/page.css` [D5]; (b) the inline script `document.documentElement.className+=' js'` at line 24, which moves to a tiny same-origin file `/shared/js-flag.js` loaded in `<head>` with no `defer` (about 60 bytes; the alternative is a `sha256` entry in `script-src`, rejected because the hash must be regenerated on every edit); and (c) the inline `style=` attributes on the SVG sprite (line 30, `position:absolute`), on the `mLab` hint (line 154, `margin:14px 0 8px`) and on the closing paragraph (line 176, `font-size:14px`), which become classes in `page.css`. The `html.js` class gates the reveal, failsafe and reduced-motion design (F.2); if the flag script were blocked, the hidden-until-revealed rules would never apply, and the design would be silently untested. Motion writes through the CSSOM (`element.style`, WAAPI), which CSP allows [M6]. `<script type="application/ld+json">` is a data block and is allowed.
- **Build check (task B-07, enforced again in B-11):** the build fails on any `style=` attribute, any `<style>` element, any inline `<script>` without `src` (except `type="application/ld+json"`), and any `on*=` event-handler attribute in a built page.
- Exactly one CSP header on every response, verified by curl for each partition (test matrix, task B-11): a campaign host `/`, a campaign host `/thanks/`, the apex `/`, the apex `/book/`, the apex `/book/thanks/`, and a preview `/book/`. Overlapping CSP rules are not relied on, because later-rule precedence is unverified in production [D5].
- Header rules match the incoming path, not the resolved path [D5]. The live apex serves the holding-only `vercel.json` written by `prepare-holding-deploy.mjs`, not `landing/vercel.json`; the two differ (CSP in the global block, a `js` cache rule). The new build retires that second generator so one file serves everything [D5] [D9].
- HSTS stays `max-age=86400` with no `includeSubDomains` until every host and the mail path are confirmed; raise it after a stable month [DJ].

Redirects. The two existing redirects (`sortmycover.com` and `www` to the apex, 301) stay. New: 11 apex `.html` 301s from B.3; per live host, apex `/<slug>/` 307 to the host after the overlap week. The catch-all "any other path on a campaign host goes to the same path on the apex" is optional in v1. Redirects run before the filesystem, so its negative-lookahead source must exclude `/assets/`, `/shared/`, `/fonts/`, `/thanks`, `/robots.txt`, `/favicon`, `/manifest`. Negative lookahead is documented for redirects but untested with this host condition (H3). Ship it only if the curl matrix passes; otherwise leave it out, because host-wide noindex already neutralises duplicate paths [D7] [DJ].

DNS at Hostinger (zone editor, not hPanel Subdomains) [D3]:

| Field | Value |
|---|---|
| Type | CNAME |
| Name | the label only, for example `bond-paperwork` |
| Target | the project-specific value on the Vercel domain card, shaped `<hash>.vercel-dns-0NN.com`. Copy it exactly. The `017` in Vercel's docs is an example, not our value. All hosts in this project share one target [D3]. |
| TTL | 300 if Hostinger accepts it (H6), otherwise the default (14400) |
| AAAA | none |
| CAA | none. The apex CAA is empty and a CNAME'd host follows Vercel's target, which already allows Let's Encrypt [D3] |

Vercel issues one single-name Let's Encrypt certificate per host by HTTP-01 once DNS resolves. Let's Encrypt limits: 50 new certificates per registered domain per 7 days, 5 per identical name set per 7 days [D3]. No wildcard: it needs DNS-01, which means Vercel nameservers or an `_acme-challenge` NS delegation, and Hostinger does not allow NS records on subdomains. Moving nameservers is doable (Hostinger exports a BIND zone, Vercel can import it, the live zone is about seven records) but it puts the mail records (MX, SPF, the MS= TXT, autodiscover) at risk and is not worth it below about 30 hosts [D2]. Before touching DNS, export the Hostinger zone as a BIND file and keep a copy. Adjacent finding outside this lens: no DMARC or DKIM records were found on 10 Oct 2026, and `hello@` deliverability needs them [RAW].

Runbook per host (nothing here has been applied):

1. Merge the generated `vercel.json` blocks first and deploy to production with no host attached. **How production is deployed:** the project is not assumed to have a Git integration (the sibling projects in Jonathan's memory do not; check Settings > Git; UNVERIFIED for this project), so merging or pushing deploys nothing. Deploy is an explicit step, task B-14A: `npx vercel --prod`, run by Jonathan or by an agent he tells to, from the directory the project's Root Directory setting expects, after `vercel link` confirms the project. It needs a Vercel login or token, which is a Jonathan gate (M).
2. Add the host in Settings > Domains.
3. Pre-DNS test: `curl -sI --resolve <host>:443:76.76.21.21 https://<host>/`, or a Host-header request to the apex IP if the edge rejects it. Expect 200, the quiz title, `x-robots-tag: noindex`, one CSP, `/assets/page.js` 200 and `/robots.txt` allow-all. Previews cannot test host routing [D11].
4. Add the CNAME. Wait for the certificate. Repeat the checks without `--resolve`.
5. Run one Meta Test Events conversion (H.6).
6. Only then switch the ad's destination URL.
7. Rollback: remove the host in Settings > Domains, or revert and redeploy, then delete the CNAME last. `vercel rollback` only repoints production and does not remove a host [D12].

Fallbacks if B-00A or step 3 fails (H1), costed in K: (1) Vercel project-level routing rules (host condition plus rewrite, staged and rolled back from the dashboard; keep an export in git), about 1 working day [DJ]; (2) Routing Middleware with a pure host-to-slug lookup [D1], about 1.5 working days [DJ], and UNVERIFIED that it runs on a plain static project with no framework. The generator (B-06) keeps its output target swappable (`vercel.json` blocks, a dashboard-rules export, or a middleware map). A branch-assigned staging domain works on all plans and `vercel alias set <preview> <host>` can test a non-production build [D11].

The Vercel plan must be Pro before the first paid click: the team looks like an auto-created personal team and Hobby is non-commercial. Pro is US$20 a month [D4] (plan unverified, H2).

Third-party allow-lists are set once at the registrable domain: Meta domain verification by TXT on `sortmycover.co.za`, Pixel traffic permissions for `sortmycover.co.za`, Turnstile hostname `sortmycover.co.za` with no wildcards [D8]. n8n's Webhook "Allowed Origins (CORS)" takes `*` or exact origins only, so the generator emits the list `https://sortmycover.co.za,https://<host>,...` and it is updated with each host. If that becomes tedious, answer CORS at the proxy in front of n8n (H38) [D8].

---

## D. Page-by-page wireframes in words

### D.1 Home `/`

Job: make a sceptical visitor sure this is real, and send them to book. Copy is written at Grade 5 to 7 as a house rule; the evidence that this lifts conversion is correlational [U7] [DJ].

Above the fold on a 360 px phone, in order, in one screen:

1. Header: wordmark left, `<details>` menu right.
2. H1: "Book a 30-minute call with an adviser from an FSCA-authorised provider." [DJ] "Adviser" and "authorised" are the defined terms of B.5: an adviser is a representative of an FSP that holds FSCA authorisation, and no adviser is routed until the FSP is verified on the FSCA register (rule S2, I.2). The word "licensed" is not used in copy. The attorney checks the phrase under Q5. It replaces "Sort your cover. 30 minutes. A real adviser." pending Q5, because SortMyCover must not be described as sorting or checking cover [C1].
3. Lead, two short sentences: "SortMyCover introduces you and books the time. The adviser, not us, talks to you about your cover."
4. Primary button "Book my adviser call" to `/book/`. Under it: "The call costs you nothing. Advisers pay us a fee for the service. It does not depend on whether you buy anything." [T3] [C3] rule S13, fee-statement rule in C.1 item 5.
5. Who is behind this, three short lines: "SortMyCover is run by Lead Velocity (Pty) Ltd, registration 2025/637858/07. Not a financial services provider. We give no advice." and a link "Check any adviser on the FSCA register" [C7] [T6] rule S2. The registration number is unverified at CIPC (H14); it is not published until verified.
6. Human route: "Questions? WhatsApp us or email hello@sortmycover.co.za. We answer questions about how this works, not about cover." The WhatsApp number is a Jonathan input and is the number defined in D.3 (the same number the assistant messages from). A user-initiated `wa.me` chat opens only the standard 24-hour service window, and Cloud API business replies in it are chargeable from 1 Oct 2026 after 1,000 free service messages per number per month [U10].

No rating, counter, "trusted by", portrait or insurer logo. Nothing here is invented [T8] [C10] rules S16, S17. The hero contains the cost line, the company name, a human route and the FSCA lookup link, which answers the research gap in [T5] without copying a competitor's seven-item claim (that claim is a trap).

Below the fold, each a section with an H2 that is a plain label or question:

- "How it works": three numbered steps (answer two questions; pick a time; talk to the adviser for 30 minutes). A line between the steps draws on scroll (F.3 recipe 7). Under the steps, process facts only: the adviser gives their name, FSP number and how they are paid [C1] rule S7.
- "What SortMyCover is, and is not": two columns. Is: an introduction and booking service run by Lead Velocity (Pty) Ltd, free to you, paid a fee by advisers that does not depend on what you buy. Is not: an insurer, a financial services provider, an adviser or a comparison site; we do not quote, rank or recommend.
- "How we make money": four sentences from the existing page, the full page one tap away, "no commission" scoped to SortMyCover, followed by "If you later choose a product, your adviser tells you how they are paid." [C3] rule S6.
- "Who your adviser is": one paragraph and a link to `/advisers/`. No adviser portrait until the adviser's firm consents, its FSP number shows and Jonathan decides, because it conflicts with the broker-neutral decision [T7].
- "Read first": three Learn teasers (how the call works, how to check an adviser, what happens to your details).
- FAQ, eight items, visible in the HTML: Is it really free? How do you make money? Who is the adviser? Is the adviser authorised? What do you do with my details? Do I have to buy anything? Can I stop? Who do I complain to? These cover the five trust questions in the Policygenius pattern (how it makes money, who regulates it, does the user pay, will they speak to a real person, is it owned by an insurer) [T4 pattern]. No answer holds a disclosure that appears nowhere else rule S34.
- Final CTA repeating the button, then the footer (DEC-6).

Mobile behaviour: one column, 16 px side gutters, 18 px body text, buttons at least 48 px high with 8 px spacing, a `<details>` menu that works without JavaScript, no horizontal scroll, no sticky bar on the home page. Budget: HTML under 20 KB gzip, CSS under 12 KB gzip, two woff2 fonts (28.7 KB), zero third-party requests, and no Pixel on this page unless the visitor has already given the ad-measurement choice [U3].

### D.2 Campaign landing page: `bond-paperwork.sortmycover.co.za`

Why this angle: it is the live set slot 6 and its hook is a plain statement of fact [RAW].

First viewport on a 360 px phone:

1. Small wordmark, no menu.
2. H1: "Bond signing day is busy." (the ad hook, verbatim).
3. Sub, replacing "Checking life cover is a separate job...": "Cover is a separate job. Book a 30-minute call with an adviser from an FSCA-authorised provider, at a time you pick. The call costs you nothing." [C1] [C3] rules S1, S13.
4. Quiz card with step 1 open: a numeric label "Step 1 of 2" next to the existing segmented `role="progressbar"` [T4]. Question "How old are you?" with age-band tap buttons from `config/strings.json`; no band may include minors (see the 18+ rule below). Helper line: "This only decides if we can book a call." The bands are fixed in the quiz flow table below.
5. Under the card: "Run by Lead Velocity (Pty) Ltd. Not a financial services provider." and the cost line.

Quiz flow (DEC-3) [C2] rules S18 to S23 [U6]:

| Step | Screen | Rule |
|---|---|---|
| 1 | Age band, single tap, auto-advance. Four bands, taken from CP-v0.2 section 1.4 with the first band changed so that none can include a minor: **18 to 34**, **35 to 44**, **45 to 50**, **51 or older**. Only 35 to 44 and 45 to 50 qualify (Lead Velocity's criterion; the ads target 35 to 50). A person under 18 has no band to tap; the 18+ line sits under the question ("You must be 18 or older") and is confirmed again in step 4. An out-of-band answer (18 to 34, 51 or older) exits at once with the neutral exit screen below and no budget question. Nothing is sent to the server. | Exit early (RECONCILE D1). Neutral line, rule S21. Band edges are [DJ] built on CP-v0.2; whether over-50s and under-35s should be served by a different offer is a commercial decision for Jonathan (M). |
| 2 | Budget band: Under R750, R750 to R1,499, R1,500 or more. Label: "Roughly what monthly budget could you set aside for life cover? This is not a quote." Under R750 exits with the same neutral exit screen. | Rule S20. Never echoed back. |
| 3 | First name and mobile number. Reason line under the phone field: "SortMyCover (a service of Lead Velocity) will message this number on WhatsApp about your call. The adviser you are booked with will also have it. Reply STOP to end it." `autocomplete="given-name"` and `"tel"`, correct input types. | 14% of shoppers say they would never give a phone number; explain the reason inline [U9]. SC 1.3.5 [U8]. The line names the real sender and the second recipient; see D.3. |
| 4 | Consent with two separate controls, both unticked. Required: "I agree that SortMyCover, a service of Lead Velocity (Pty) Ltd, may message me on WhatsApp to book and remind me about my call, and may share my details with an adviser from an FSCA-authorised financial services provider (FSP), who may contact me by WhatsApp or phone about that call. I am 18 or older. I can opt out at any time by replying STOP." Optional, with its own heading and an "I give" / "I do not give" pair: the CONSENT-OPTIMISE text of CP-v0.2. Button: "Book my adviser call". | [P1] [C12] rules S22, S23. The first clause names the sender of the first message (Lead Velocity, as SortMyCover), the second names the FSP's later contact; the draft in `config/consent.json` names only the FSP and is replaced. Wording is for Q8. |
| 5 | The existing slot picker. Slots appear after the `/slots` response; a fixed-height skeleton shows until then. | Reserve height to avoid layout shift [M8]. |
| 6 | Thank-you: "You are booked for <day, time>." Then the exact business name and number the WhatsApp message will come from, "Save this number", a prefilled `wa.me` "Message us first" button and an email fallback [U10]. Nothing computed from answers. | Rule S19. |

**Neutral exit screen** (age or budget out of band). Heading: "We can't arrange a call from these answers." Body: "Nothing you entered has been saved or sent. You are welcome to read our plain-language guides." One link, "Read our guides", to `https://sortmycover.co.za/learn/`, and the footer. No other offer, no product, no reason given, no echo of the answer (rule S21). This one onward link is the single exception to "no links out" in C.1 item 1 [DJ]. The link is a plain page load with no parameters, so nothing about the answer travels with it.

**What the adviser loses** by DEC-3: the earlier bond, dependants and work-cover questions are dropped until the attorney answers Q2. The adviser receives only age band, budget band, name, mobile, and call time and method. This is accepted as a cost: less context on the call, in exchange for a shorter form and a smaller data-minimisation exposure [C2] [DJ].

The pre-submit answer review that the benchmark gap list suggested is dropped: with two taps and one form there is nothing worth reviewing [T4] [DJ].

Microcopy rules: sentence case; buttons name the outcome ("Book my adviser call", "Pick this time"); errors say what to do ("Enter a South African mobile number, for example 082 123 4567"); `role="status"` announces step changes, slot loading, slot collisions (409) and booking success [U8]; never ask age, budget or contact method twice (SC 3.3.7) [U8].

Mobile behaviour: the card sits directly under the H1; the on-screen keyboard must not hide the next button (add `scroll-margin` only if the Android test shows it does); tap targets are at least 48 px and never under 24 px (SC 2.5.8); the Back link keeps 24 px of space around it; the sticky bar appears only after the card leaves the viewport and never overlaps a focused field [U8]. Cookies, storage and `wa.me` hand-offs behave differently inside Facebook and Instagram in-app browsers (H11), so the thank-you card also shows a plain copyable number and an email link [U10].

JavaScript failure: the quiz needs JavaScript. Without it the card shows "To book, WhatsApp us or email hello@sortmycover.co.za" plus the cost and identity lines. Learn pages and the home page need no JavaScript [DJ].

### D.3 The WhatsApp hand-off: who messages, from which number, under which template

The funnel is quiz, then a WhatsApp assistant, then the adviser call. The first message after the web form is **business-initiated**: the visitor has not messaged first, so no 24-hour service window is open. Sources: ledger [U9], [U10]; `consent-and-privacy.md` Parts 1, 3 and 4; `docs/MASTER-PROMPT.md` risks 1 and 2. Everything below is a design for the attorney (Q8) and for Jonathan's Meta gates (M), not a legal conclusion.

| Question | Answer in this spec |
|---|---|
| Who sends the first message? | **SortMyCover, a service of Lead Velocity (Pty) Ltd** (the assistant). Not the FSP and not the adviser. The consent text (D.2 step 4) and the reason line (step 3) say so. |
| From which number? | One dedicated WhatsApp Business number on a WhatsApp Business Account owned by Lead Velocity (Pty) Ltd. Jonathan supplies it (M). The same number is the human route on the home page (D.1 item 6) and is shown on the thank-you card (D.2 step 6). It is not an FSP's number and not Jonathan's personal number. |
| Under which template? | `WA-INTRO-v2` (booking confirmation, within 60 seconds of booking, names the adviser, practice and FSP number, says SortMyCover and Lead Velocity are not FSPs and give no advice, offers STOP) and `WA-REMIND-v1`, both submitted as **UTILITY** templates and approved by Meta before any ad points at a page. A template is the only way to message a person outside the 24-hour window. The booking confirmation is logistics, not marketing; nothing in either template mentions cover, price or products. |
| Template category and cost | Meta may re-categorise a utility template as marketing on review (MASTER-PROMPT risk 1). Working figures in the repo are an **ASSUMPTION** (Meta's pricing page could not be fetched): about US$0.0076 to 0.0095 per utility message against about US$0.038 to 0.044 per marketing message, and 1,000 free service messages per number per month (`deliverables/verified-facts.md`, [U10]). Settle the real South African rates in WhatsApp Manager before the first paid click and re-run the cost per lead. If a template lands in marketing, the cost rises about fourfold per message, which the budget must absorb. |
| Which opt-in covers it? | The required consent in D.2 step 4, stored verbatim with a version string, timestamp, page URL and angle. WhatsApp's Business Messaging Policy (23 Sep 2026) requires opt-in permission confirming the person wants subsequent messages [U9]. The same sentence names Lead Velocity / SortMyCover as the WhatsApp sender, so the consent matches the actual sender. |
| Before the first message | The number is checked against the NCC opt-out registry and Lead Velocity's own suppression list; a block wins over consent (`consent-and-privacy.md` Part 3, row 2). |
| Display name | The WhatsApp display name must be approved in WhatsApp Manager and the business verified (MASTER-PROMPT risk 2, an external clock of days). Whether Meta accepts "SortMyCover" as the display name for a business whose legal name is Lead Velocity (Pty) Ltd is **UNVERIFIED**; settle it in WhatsApp Manager. Until the name is approved and the first template is approved, no ad destination is switched (M row 19). |
| Later contact | The adviser, or their firm, may contact the person by WhatsApp or phone from their own number, as the consent says. That is the FSP's message, under the FSP's own duties; SortMyCover's assistant handles booking logistics only and never gives advice (AI use is disclosed in the privacy notice). |
| User-initiated messages | A visitor who taps "Message us first" (the prefilled `wa.me` link) opens a standard 24-hour service window; replies in it are free-form. Cloud API replies in that window are chargeable from 1 Oct 2026 after 1,000 free service messages per number per month [U10]. A `wa.me` chat does not open the free entry-point window [U10]. |

Acceptance (task B-09): both templates approved on the production WhatsApp Business Account; a throwaway lead receives `WA-INTRO-v2` from the displayed number inside 60 seconds; the consent text stored with that lead is the D.2 step 4 version; the thank-you page shows the same number and business name.

---

## E. Design system

### E.1 Type
DM Sans, the two woff2 files already in `brand/fonts/` (500 and 800), preloaded, `font-display: swap` with a size-matched fallback so the swap causes no layout shift. Scale in rem: 0.875 small, 1 body (16 px minimum; 18 px for phone body copy), 1.25, 1.5, 2 (H2), clamp 2.25 to 3 (H1). Line length 60 to 70 characters; line height 1.5 for body and 1.15 for headings. No text on images. The `*...*` amber highlight in angle H1s is kept.

### E.2 Colour tokens
Reuse `brand/tokens.css` unchanged: `--sm-amber #F5A623`, `--sm-charcoal #1F2933`, `--sm-off-white #FBF8F2`, `--sm-accent-text #2A1B02`, `--sm-charcoal-2 #2B3845`, `--sm-off-white-2 #F1ECE2`, `--sm-muted #5C6672`, `--sm-rule #DCD6CB`, `--sm-amber-dark #B86E0A`, plus the semantic aliases (`--sm-bg`, `--sm-text`, `--sm-accent`, `--sm-border`). Amber is a fill, never text on off-white. All pairs are checked by `landing/tests/contrast.py` at AA (4.5:1 for text, 3:1 for large text and UI). Light scheme only at launch; a dark scheme is not worth the contrast re-test for a one-minute visit [DJ].

### E.3 Components
Wordmark; header with `<details>` menu; hero; primary button (48 px); text link; quiz card (fieldset per step, segmented progress, numeric step label, Back); consent block; slot grid; thank-you card; step list; two-column "is and is not"; FAQ `<details>`; identity block; article layout (byline, answer block, sources list, related list); glossary list; callout ("This is information, not advice."); footer. CSS lives in one `site.css` for the apex and the existing `page.css` for campaign pages, each under 12 KB gzip.

### E.4 Accessibility rules
Target WCAG 2.2 AA as the expectation. No statute mandates WCAG for a private-sector site; the legal hooks are Constitution s9 and PEPUDA s9, from B-grade sources rule S35.

- SC 2.4.11 Focus Not Obscured (AA): sticky bar plus `scroll-padding-bottom`. At AA only a fully hidden focus fails, and the sticky footer is a plausible risk, not a proven failure [U8].
- SC 2.5.8 Target Size (AA): 24 px minimum; primary controls are 48 px [U8].
- SC 1.3.5 Input Purpose (AA): `autocomplete` tokens [U8].
- SC 4.1.3 Status Messages (AA): `role="status"` regions [U8].
- SC 3.3.7 Redundant Entry (A) and SC 3.2.6 Consistent Help (A): the help link sits in the same place on every page and host [U8].
- Keyboard-only quiz, visible focus ring at 3:1, labels tied to inputs, errors linked by `aria-describedby`, `lang="en-ZA"`, alt text and captions for any image or film.
- Disclosures (cost line, scope sentence, identity block, FOOTER-v2 line, consent text, how-we-make-money link) are visible without interaction, scroll trigger, accordion or animation rule S34. They are `data-disclosure` elements and are excluded from every Motion reveal (F.3); the B-08 test checks them with JavaScript off and at t=0.
- Reduced motion: F.2.
- Tests: `landing/tests/a11y.mjs`, `contrast.py` and `reading_level.py` (house limit Grade 7) run in CI (task B-11); one TalkBack run at 360 px by hand [U8].

---

## F. Interactivity with Motion

### F.1 What Motion is, what it costs, what needs the paid tier

- Motion (motion.dev, npm `motion`) core is free and MIT. Version 14.1.0 was published 9 Oct 2026 [M2]. Release churn is high (seven releases in 15 days), so pin the exact version [M11].
- Motion+ Solo is a one-time US$399 payment (not per year). Only Motion+ Team is an annual per-seat subscription; the Team price is unpublished (H20). The AI Kit is part of Motion+ and includes MotionScore, an audit tool that grades animation cost and checks `prefers-reduced-motion`. Parts of the AI Kit are free (the `/motion` skill, the docs MCP server) [M2] [U4].
- **Nothing in this specification needs Motion+ or the AI Kit.** Motion+ adds `splitText`, `scrambleText`, `curtains` and React-oriented components; none is planned, and splitting the H1 into characters would hurt LCP anyway [M10]. The AI Kit's MotionScore is an optional audit aid we do not need; the Lighthouse, INP and device tests in J.4 replace it [DJ].
- The free `motion` package also contains `animateLayout` (28.3 KB brotli, measured) and `animateView`. We use neither: `animateView` injects an inline `<style id="motion-view">` and is blocked by our `style-src 'self'` [M6]; `animateLayout` costs 28 KB for decoration [M12].
- No source shows that decorative motion lifts lead-form conversion. The recipes below are justified by function (feedback, orientation) and by cost, not by a conversion forecast [U4] [M9].

### F.2 Delivery, CSP safety and reduced motion

Delivery (DEC-7):
1. A laptop-only script, `landing/vendor/build-motion.mjs`, runs once: it installs `motion@14.1.0` in a temporary directory, bundles a small entry file with esbuild (minified, ESM, tree-shaken), and writes `landing/shared/vendor/motion-14.1.0.min.js` with a banner naming the package versions, the esbuild version and the date. The file is committed. The Vercel build does not run npm and nothing is installed on Vercel [M1] [D9]. No bundle was built or installed for this specification.
2. The entry file exports only what the recipes use: mini `animate`, `inView`, and, for the home page only, `scroll`. No single ESM file can be copied out of the npm package (the entry is a 35-byte re-export chain), which is why the bundling step exists [M1].
3. Fallback if the laptop route is blocked: the UMD file `dist/motion.js` (144,870 B raw, 47,934 B gzip, 42,757 B brotli, global `window.Motion`) can be vendored with no build, at about ten times the bytes. Not recommended [M1]. A third-party pre-built ESM (esm.sh) is not tree-shaken (145 KB) and adds a trust dependency [M1].
4. The `html.js` class that gates the reveal, failsafe and reduced-motion CSS is set by `/shared/js-flag.js`, a same-origin file in `<head>` with no `defer` (C.5), not by an inline script. `landing/shared/fx.js` is a small module loaded with `<script type="module" src="/shared/fx.js" defer>`. It checks `matchMedia('(prefers-reduced-motion: reduce)')` first and only then dynamic-imports the vendored file, so reduced-motion visitors download zero Motion bytes.
5. CSP: `script-src 'self'` already allows same-origin modules. No CDN: the quick-start `cdn.jsdelivr.net/npm/motion@latest/+esm` import would add an origin to the CSP and track `@latest` [M1] [M11]. Animation writes go through `element.style` and WAAPI, which CSP permits; the free bundle makes no network calls and uses no `eval` or `new Function` [M6].

Reduced motion, because vanilla `animate()` does not honour it automatically:
- In motion 13.3.0 to 14.1.0, `animate()` ignores `prefers-reduced-motion`. It did honour it up to 13.2.0; 13.3.0 (14 Sep 2026) dropped that without a changelog entry. `animateLayout` does honour it. React and Vue `MotionConfig` have `reducedMotion="user"` (default "never") [M4].
- Do not use the undocumented `reduceMotion` or `skipAnimations` options (H21).
- Our rule: every Motion call sits behind the `matchMedia` check; the hidden-until-revealed CSS lives inside `@media (prefers-reduced-motion: no-preference)` and under `html.js`, so reduced-motion and no-JS visitors see everything at once. Opacity and transform animations the browser runs natively through CSS also stop under the same media query.
- Failsafe: below-the-fold reveals carry a CSS animation that forces them visible after 3 seconds if the module never runs (H23, untested; test with JS disabled and blocked). Nothing in the first viewport ever starts hidden or JS-gated [M8] [S4].

LCP, CLS and INP contract [S4] [M8] [U4]:
- No H1, hero paragraph, hero CTA or quiz card starts at opacity 0 or waits for JS. Chrome has ignored opacity-0 paints for LCP since version 86, and an element faded in from 0 may not register as the LCP candidate until a later repaint.
- Update quiz state and enable the next tap first, then animate. Exit at most 150 ms, entry at most 250 ms, transform and opacity only. A compositor-only exit does not raise INP; a JS-driven or layout-affecting one can [M8].
- Reserve space for anything that appears late (slot grid, thank-you card) so layout shift stays under 0.1 (shifts within 500 ms of a tap are excluded but scroll is not) [M8].
- Learn articles ship no JavaScript.
- Real-device check before launch: a Galaxy A-class phone, Motion on versus off, LCP and INP (H24).
- **Acceptance test for the payload (task B-08).** The 3.2 KB figure is the vendored file alone. The real cost includes the two-hop load (`fx.js`, then the dynamic import of the vendored file) and the work the effects do. Measure on a built preview, mid-tier phone profile or real device, five runs each, Motion on (default) versus Motion blocked (route the vendored file to 404): LCP, CLS and INP at the median. Pass: LCP at most 2.5 s and INP at most 200 ms with Motion on, CLS at most 0.1, and Motion-on LCP no more than 100 ms worse than Motion-off [DJ: the 100 ms margin is our own threshold, not a published one]. Fail: ship the CSS-only fallback (all content visible, quiz steps swap instantly, no Motion file) and re-test later.
- The reduced-motion gate (H23) and the 3-second failsafe (H24) are untested design until the B-08 runs pass: reduced motion on (zero Motion bytes fetched), JavaScript off, and the vendored file blocked (every below-fold block visible within 3 seconds). Recipes 1, 2, 5 and 7 do not ship on a page until all three pass on it.

### F.3 The recipes

Kilobyte figures are measured brotli sizes of tree-shaken Motion 14.1.0: mini `animate` 3.0 KB, `inView` 0.38 KB, `stagger()` 0.7 KB, `scroll` 3.5 KB; mini plus inView 3.2 KB; mini plus stagger, inView and scroll 6.9 KB; hybrid `animate` 18.7 KB [M3]. Motion's own docs state 2.3 KB for mini and 5.1 KB for scroll with no compression basis; do not use those [M3].

| # | Interaction | API and entry point | Added KB (brotli) | Reduced-motion fallback | Where |
|---|---|---|---|---|---|
| 1 | Scroll reveal with stagger for below-fold **non-disclosure** blocks only: the three "how it works" steps, the Learn hub cards and the FAQ list wrapper. Never a disclosure (see the exclusion list under the table) | `inView(selector, cb)` then `animate(el, { opacity: [0, 1], transform: ['translateY(12px)', 'none'] }, { duration: 0.3, delay: (i) => i * 0.05 })`. Mini accepts a function for `delay`, which avoids the 0.7 KB `stagger()` helper [M9]. Entry: `fx.js` `reveal()`. | 3.2 (shared with 2 and 5) | Block visible at once; no call made | Home, campaign pages (below the card, steps only), Learn hubs |
| 2 | Quiz step transition: old step out, new step in | `animate(oldStep, { opacity: [1, 0], transform: ['none', 'translateX(-8px)'] }, { duration: 0.12 })` then the same in reverse for the new step. Native `element.animate().finished` would also do it at 0 KB [M9]. Entry: `page.js` `go(step)` calls `fx.step(from, to)`. State change first. | 0 extra | Instant swap | Campaign pages, `/book/` |
| 3 | Progress bar fill | CSS `transition: transform 200ms` on `scaleX`. Not Motion. | 0 | `transition: none` in the media query | Campaign pages |
| 4 | Tap feedback on buttons and options | CSS `:active { transform: scale(0.98) }`, at most 150 ms. Not Motion. | 0 | none | Everywhere |
| 5 | Slot-grid stagger once `/slots` returns | `animate(slots, { opacity: [0, 1] }, { delay: (i) => i * 0.03, duration: 0.2 })` after the skeleton has the final height. Entry: `page.js` after the slots render. | 0 extra | All slots shown at once | Campaign pages, `/book/` |
| 6 | Sticky CTA appears after the quiz card leaves the viewport and hides while it is on screen | Native `IntersectionObserver` on a sentinel; class toggle with a CSS transition. Not Motion, because it is a thin wrapper over a browser API [M9]. | 0 | no transition | Campaign pages |
| 7 | "How it works" line draws as the section scrolls | `scroll(animate(line, { scaleY: [0, 1] }), { target: section, offset: ['start end', 'end end'] })`. Native `ViewTimeline` in Chrome 115 and Safari 26; scroll-event fallback elsewhere (Firefox keeps this off by default, 0.79% of SA mobile) [M7]. The offsets are among those that map to a native timeline [M5]. Loaded by dynamic import on the home page only. | +3.5 on the home page only | Line drawn in full, no call | Home |
| 8 | FAQ open and close | Native `<details>`. Smooth height uses CSS `::details-content` plus `interpolate-size` as progressive enhancement (Chrome 129 or 131, Firefox 143 for the pseudo-element; Safari Technology Preview 254 adds `interpolate-size`) [M9]. Without them it just opens. If a Motion height animation is wanted, use an explicit `[0, el.scrollHeight + 'px']`; `'auto'` snaps in mini [M9] [M12]. | 0 | No animation | Home, FAQ, campaign |
| 9 | Booked tick | CSS `stroke-dashoffset` on an inline SVG. Not Motion (SVG `pathLength` via Motion would need the 18.7 KB hybrid build) [M12]. | 0 | Tick shown drawn | Thank-you |

**Excluded from every reveal, stagger or scroll effect (rule S34, E.4):** the cost line and the scope sentence ("The call costs you nothing.", "This is information, not advice."), the "who we are" and identity block, the FOOTER-v2 line, the consent text and the optional ad-measurement control, the "How we make money" link and the article callout. They carry no `data-reveal` attribute; the Motion entry point selects only `[data-reveal]`, and the build fails if a `data-reveal` sits on, or inside, an element marked `data-disclosure` (every disclosure element above carries that marker). Test (task B-08): with JavaScript off, with JavaScript on at t=0 (before any call returns), and with reduced motion on, every `[data-disclosure]` element has computed opacity 1, no transform and is within the page's normal flow. The campaign item 5 block (cost line and who-we-are, below the card) is therefore always visible, never a reveal target.

Total added Motion payload: about 3.2 KB brotli on campaign pages and Learn hubs, about 6.7 KB on the home page, zero on articles and for reduced-motion visitors.

Forbidden: counting-up numbers (money, ratings, call counts), parallax, looping or marquee motion, scroll-hijacking, any first-paint entrance on the H1, hero text or CTA, `animateView`, `animateLayout`, `splitText`, page transitions through Motion (use the CSS `@view-transition` rule if ever wanted: Chrome 126, Safari 18.2, Firefox none) [M9] [M12] rule S34.

Spring easing: the hybrid build emits a native `linear()` easing for `type: 'spring'`; mini supports springs only with the imported `spring` function [M5] [M10]. A hand-written CSS `linear()` curve costs 0 KB. No spring is planned [DJ].

Honest summary: of 14 candidate interactions, two to five justify Motion over CSS and native WAAPI, and only where stagger ergonomics matter or where Firefox and older Safari lack scroll timelines [M9]. The spec uses Motion for recipes 1, 2, 5 and 7, and keeps the rest native.

---

## G. SEO plan and AI-search plan

### G.1 Technical SEO

- URL shape: folder URLs with a trailing slash, 301s from every `.html` URL, decided before anything is indexed. Current state: `/about` returns 404 and only `/about.html` works; the canonical, JSON-LD and sitemap hard-code `.html` on every page except `/` and `/learn/` [S7]. Avoid `cleanUrls` plus `trailingSlash` together (a reported 308 loop, H32).
- Canonicals absolute and self-referencing on every indexable page; the campaign-host rules are in C.4 [S1] [S5].
- `robots.txt` (apex): allow all; the dead `Disallow: /staging/` line goes. The `staging` folder is already excluded from the build (`SKIP`) [D12].
- `sitemap.xml`: generated by the build for apex indexable pages only, with `lastmod` on every entry taken from the page's `last_reviewed` field. Today 4 of 13 entries lack it [S7]. Campaign URLs, thank-you pages and the 404 are excluded [S1].
- hreflang: the current self-only `en-ZA` tags are harmless noise at best (Google gives no statement either way). Remove them. Add hreflang `en-ZA` and `af-ZA` pairs, reciprocal, only when an Afrikaans version exists (the CoverKlaar case) [S12].
- Country targeting: the `.co.za` ccTLD is a strong country signal and server location is a weak, non-definitive one. No geotargeting work is needed [S12].
- Core Web Vitals: thresholds LCP 2.5 s, INP 200 ms, CLS 0.1 at the 75th percentile. The holding site's tiny HTML and 0.35 s server response make passing very likely but unmeasured; confirm with Lighthouse on a staging build, then CrUX after launch [S4]. Search Console and CrUX exclude Android WebView and iOS in-app views, so Meta in-app visitors are invisible to them; the first-party RUM beacon (J.4) covers them [U5].
- Google Business Profile: not eligible (lead-generation companies and online-only businesses are excluded). It is off the launch gate. Local signals come from consistent legal name, address and email across About, the footer and Organization schema, plus real Facebook and LinkedIn pages [S2] [S12] (the NAP guidance is our practice, not Google's).
- Page weight and speed budget: own assets at most 60 KB compressed on first view, third-party at most about 120 KB, nothing render-blocking [U3].

### G.2 Content SEO

- Targets: long-tail and trust queries, not "life cover" head terms (B.4) [S8]. No South African keyword volumes were found (H30); size the cluster from Search Console after four weeks and grow an article only when it shows impressions.
- One substantive article per ad angle gives each angle an indexable organic twin [S1]. Every article follows B.6.
- E-E-A-T for an unlicensed YMYL site, as our own practice and not a Google checklist [S3]: legal entity, registered address and a working email on About and in the footer; a named editor; a named independent reviewer once one exists, with an FSCA register link; cited primary sources with dates; an `/editorial-policy/` page with a correction route; plain funding disclosure. Google tells raters to look at the About page, contact details and reputation, and E-E-A-T is not itself a ranking factor [S3].
- Guard: AI-assisted drafting is allowed and disclosed on `/editorial-policy/`, with a named human fact-check on every page; mass-produced low-value pages are scaled content abuse [G5].

### G.3 Structured data

Ship, matching visible text: `Organization` (legalName, address, email, `sameAs` filled with real profiles, today an empty array [G4]), `WebSite` (name for site name), `Article` with a `Person` or `Organization` author, `BreadcrumbList` (desktop only). Drop `FAQPage` (no rich results for any site since 7 May 2026; the visible FAQ stays) and never add `Product`, `Offer`, `AggregateRating` or `HowTo` [S6] [G11]. Schema is not an AI-citation lever: one controlled study of already well-cited pages found no uplift, which says nothing about low-visibility sites or Bing, so keep markup accurate and stop there [G11].

### G.4 Search Console, Bing and measurement

1. Verify a Search Console Domain property with a TXT record at Hostinger (the zone is hosted there, not at GoDaddy as `serp-plan.md` says), added as a separate record beside the SPF and MS= TXT records. Submit the sitemap [S9].
2. Import the property into Bing Webmaster Tools [S9].
3. Check Settings > Search generative AI is "Include" (the default) [G1].
4. Organic brand tracking: a Search Console regex filter for `sortmycover` (the branded-queries filter needs volume a new site lacks, H30) [S9].
5. Expect volatility. Google ran core updates on 11 Dec 2025, 27 Mar 2026 and 21 May 2026 and spam updates on 24 Mar, 24 Jun, 18 Aug and 24 Sep 2026. Judge on 4-week rolling trends, not the first 4 to 8 weeks, and make no changes during an update window [S10].
6. Target: brand search position 1 to 3 for "sortmycover" by week 4 (serp-plan). It is a target, not a forecast.

### G.5 AI-search plan

Facts to act on [G1] [G2] [G3] [G12]:
- Google AI Overviews and AI Mode need no special optimisation: the page must be indexed and snippet-eligible, and the site must not have opted out in Search Console. Never set `nosnippet` on `/learn/`.
- Allow the retrieval crawlers: OAI-SearchBot, PerplexityBot, Claude-SearchBot, Googlebot, and bingbot (bingbot as a Bing and Copilot hedge only). The training tokens (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended) are separate switches; no causal evidence says blocking or allowing them changes citation (H27). Leave `robots.txt` as is, and re-check 24 hours after any change.
- Claude's reported backend is Brave, which will not crawl what Googlebot cannot, so Googlebot access matters for Claude too (H25).
- Vercel Firewall > Bot Management > AI Bots: set Allow or Log (Log also shows crawler visits). Deny would stop live retrieval for the search and user-fetch bots [G3]. Add it to the go-live checklist.
- No `llms.txt`: Google says it is not needed and retrieval bots almost never fetch it [G12].
- Answer-first writing: the B.6 pattern, an early direct answer with the scope sentence in the same block. Early-page answers have the most consistent observational support; section length and freshness rest on single studies [G8].
- Entity build over 90 days, with real and consistent profiles only: Facebook page, YouTube channel for the explainer film, LinkedIn page for Lead Velocity (Pty) Ltd, one identical one-line description of what SortMyCover is and is not, then fill `sameAs`. The highest correlations in Ahrefs' study (YouTube mentions about 0.74, branded web mentions 0.66 to 0.71) come from established brands (DR above 40), so expect slow results and treat the numbers as correlation only [G4].
- Do not buy "mentions": Google says seeking inauthentic ones "isn't as helpful as it might seem" [G4].
- YMYL safety: AI engines get money and sourcing questions wrong often (Which?, a UK test of 40 questions; Saturn's 57% is vendor-run and UK; EBU/BBC is news). That is why every passage carries its own scope sentence and every number a dated source. No test shows that self-contained passages reduce misquoting, so it is a prudent design, not an evidenced fix [G5].
- Measurement [G6]: (1) a monthly audit of five engines asking "What is SortMyCover?", "Is SortMyCover legit?", "How does SortMyCover make money?" and logging answer, sources and errors (the baseline is unknown, H28); (2) Search Console Generative AI report (impressions only, global since 31 Aug 2026; South African data unconfirmed, H29); (3) Bing AI Performance (citations); (4) referrals counted by the existing first-party count-only beacon, not by GA4: on landing the beacon adds two fields, `ref_host` (the hostname of `document.referrer`, no path, no query) and `utm_source` (the value only, cut to 40 characters), so n8n can bucket visits whose source is `chatgpt.com` (ChatGPT adds `utm_source=chatgpt.com` and sets no `utm_medium`) or an AI-assistant referrer host [G6]. **GA4 is dropped (DEC-14):** it would be a second tracking tool needing its own POPIA consent and Q3 treatment, a privacy-notice entry, a cookie-table row and Google Tag Manager and Google Analytics origins in the CSP, none of which is planned. The two new beacon fields are within Q3 (does the count-only beacon need notice?) and are listed in the privacy notice's beacon entry. Referrer capture on `/book/` and the apex can only see a referrer the browser sends; in-app browsers may send none, so treat the count as a floor. AI referrals are about 0.3% of traffic on global averages; their conversion quality is unproven both ways, so report them as an indicator, not a lead source [G6].

---

## H. Meta Pixel and Conversions API plan

### H.1 Principles
Measure only what the optimisation needs: the Lead and Schedule events, plus offline stage events. Send no age band, budget band or other sensitive-looking value. Keep angle attribution in our own tables. Browser and server events share one `event_id`. Everything that touches personal data follows the consent design in H.4. This is a plan for the attorney to approve (Q3, Q8), not a legal conclusion [P2] [P5].

### H.2 Events

| Event | Fired by | When | Notes |
|---|---|---|---|
| `PageView` | Pixel | Only after "I give" (H.4) | No PageView for visitors who have not chosen; so no site-visitor audiences. Accepted cost (see H.4). |
| `Lead` | Pixel + CAPI | On successful `/lead` for a lead with the optional tick | Same `event_id` in both. Custom data: neutral `content_name` code only. |
| `Schedule` | Pixel + CAPI | On successful `/book` | Same `event_id`. Fires after the response, not before: today `Schedule` and `Lead` fire in the browser before `/book` and `/lead` succeed (page.js lines 202 and 313), contrary to the pixel README; fix [RAW]. |
| `LeadSubmitted` | CAPI business-messaging | Click-to-WhatsApp lead in chat | `Lead` is rejected for messaging events (error subcode 2804066). |
| `QualifiedLead` | CAPI business-messaging | WhatsApp-qualified stage | There is no listed booked-slot event for the CTWA arm, so booking stays an internal signal there [P4]. |
| Custom `Qualified`, `Attended`, `GoodFit` | CAPI `sendOffline`, `action_source=system_generated` | When the stage happens | `event_time` is the real stage time. Meta fails a request when `event_time` is more than 7 days old, and `capi.js` has no age guard: drop and log anything older than about 6.5 days (`capi_log.status='expired'`), batch at most 1,000, and alert on expired counts [P9]. |

CRM Conversion Leads optimisation is Instant Form only and needs 200 leads a month; it does not apply to website-quiz leads (Campaign B). Quality optimisation for website leads reportedly exists through a "maximize qualified leads" goal with sequenced events (trade coverage Aug 2026; Meta has not documented it officially) [P10]. Until it is documented, optimise Campaign B on `Lead`; use the stage events as custom events for reporting and seeds. A broker score sent as `value` would be read as rand (`value` must be monetary), so send quality as a custom parameter or a real rand value [P10].

Delete the "set event priority Lead > Schedule > Contact" launch step. Event ranking was removed in May 2023 [P6].

### H.3 Parameters and deduplication
- `event_id`: a UUID generated in the browser at the moment of the action and posted to `/lead` or `/book` so n8n sends the same ID server-side.
- `event_source_url`: the page URL including the host.
- `fbp`, `fbc`: read from the cookies Meta's own pixel sets; sent unhashed. Do not hand-write `_fbc` once fbevents.js is loaded. If a hand-written value is ever needed, it is `fb.<subdomainIndex>.<ms>.<fbclid>` with the fbclid case unchanged and the cookie at `Domain=sortmycover.co.za`; for a `.co.za` name the index is likely 2, not 1 (H12). `pixel.js` today writes a host-only `_fbc` with `fb.1`; stop that [P7].
- `client_ip_address`, `client_user_agent`: from the request, unhashed.
- `external_id`: hashed lead ID. `ph`, `fn`: hashed (SHA-256, normalised), sent only for leads with the optional tick.
- `content_name`: a neutral code (for example `A01`), not a slug such as `new-bond`, because Meta screens custom parameters and URLs on restricted datasets (H8). `value` and `currency` only when a real rand value exists [P5].
- Never send budget, age band, bond, dependants or work-cover answers.
- Deduplication needs the same `event_name` and `event_id` within 48 hours of Meta receiving the first. When the browser event carries no PII and the CAPI event does, whether Meta keeps the first, merges, or discards the second's data is undocumented (H7). Test it in Test Events and read which parameters the event lists. If there is no benefit: rely on `fbp`, `fbc`, IP and user agent; or send `Lead` server-side only for ticked leads [P8].
- Event Match Quality is a web-only score out of 10 with a target of 6 or higher; CTWA and CRM events get none [P8].
- Graph API version: raise `META_API_VERSION` to v25.0 after a clean Test Events run [P12].

### H.4 Consent and cookie scope
Facts: POPIA has no cookie section, but the Information Regulator's 3 Dec 2024 Direct Marketing Guidance Note lists "use of cookies" among electronic direct-marketing methods under s69 (para 7.1(h)). The note is advisory, the listing is contested, and no ruling exists. Meta's terms defer to local law and name no South African rule [P2].

Design (DEC-4):
1. At the quiz consent step, the ad-measurement choice is its own optional control, unticked, "I give" or "I do not give". The text is CONSENT-OPTIMISE of CP-v0.2 (a separate optional consent is promised in LGSA clause 13.2(c)); the current text is a sentence inside the single required tick, so `consent_ads_at` is set for every web lead and the CAPI gate excludes nobody. `consent_ads_at` is set only from the new flag, with its own version string [P1].
2. `fbevents.js` is loaded only after "I give", from the same handler that records the choice. Before that, the only measurement is the cookieless first-party count-only beacon (page loaded, quiz started, step reached, submitted), with no identifier, no cookie and no cross-site data. Whether that beacon needs notice is for Q3.
3. The choice and the opt-out are one first-party cookie `smc_ads=1` (give) or `smc_ads=0` (opt-out), `Domain=sortmycover.co.za; Path=/; Max-Age=31536000; SameSite=Lax; Secure`, with localStorage as a fallback. localStorage is per origin and will not follow a visitor from `/privacy/` to a campaign subdomain. A leading dot in `Domain` is ignored, and the cookie reaches every `*.sortmycover.co.za` host but not `leadvelocity.co.za` [P3]. `privacy.js` writes it; `pixel.js` reads it first. The privacy cookie table is updated; the opt-out link is in every footer on every host.
4. One flag, `consent_mode: 'optin' | 'notice'`, switches to "load the Pixel on page view with a notice" if the attorney decides conversion-only measurement under notice is acceptable (H10).

Cost of opt-in, stated plainly: Meta will see no PageView or ViewContent from visitors who have not chosen, so site-visitor audiences will be thin and Ads Manager link clicks will exceed landing-page views. The campaign optimises on `Lead`, which depends on the choice, and lookalikes depend on ticked leads. If volume of ticked leads is too small to learn, the lever is the notice flag, which is a legal call, not an engineering one [DJ].

Loading cost: `fbevents.js` is 112,816 B gzip (428,904 B decoded), about 70% of a first-view page and more than the `serp-plan` "JS at most 100 KB gz" budget. It is async and off the LCP path, but loading it only after the choice (not at `DOMContentLoaded`) removes it from every visit that has not chosen. Its config request adds about 8 KB. Today the pixel is inert (no pixel ID) [U3].

### H.5 Restrictions and platform checks
- Meta's Business Tools Terms (3 Nov 2025) bar sending health, financial or other sensitive information, and custom audiences and conversions suggesting financial status have been flagged from 2 Sep 2025. After creating the dataset check "Manage data source categories" to see whether Meta applies "core setup". Life and funeral cover would most plausibly be "Financial service", but Meta publishes no mapping and health-insurance wording lands in the heavier "Health and wellness" bucket (H8). Name audiences and conversions neutrally. Under data restrictions custom events are blocked until reviewed and confirmed in Events Manager [P5].
- No Special Ad Category applies to South Africa-only financial or insurance targeting, and Meta's financial-services advertiser verification does not list South Africa. Have the partner brokers' FSP numbers and the How-we-make-money page ready anyway (H9). Age 35 to 50 and lookalikes stay available [P11].
- Meta domain verification: TXT on the root at Hostinger. The root verification covers subdomains per secondary sources (Meta's page did not render) [P6] [D8].
- Test events use `test_event_code` but are still used for targeting and measurement: run QA on a throwaway dataset or Pixel ID, never against production with fake Attended or Qualified rows [P12].
- `wa.me` and in-app browsers: open the link from inside the Facebook and Instagram apps on a real Android and a real iPhone before launch (H11) [U10].

### H.6 Test plan (Test Events, per host, before an ad points at it)
1. Throwaway dataset. `test_event_code` on every server call.
2. Opt-in off: load the page, answer, submit. Expect zero requests to `facebook.com` or `connect.facebook.net` (network tab), the count-only beacon present, and no `_fbp` or `_fbc` cookie.
3. Opt-in on: expect `PageView` and `Lead` in Test Events as browser, `Lead` as server, deduplicated by `event_id`. Record which parameters Events Manager lists (H7).
4. Book a slot: `Schedule` browser plus server, same `event_id`.
5. Opt-out via `/privacy/#opt-out`: visit a campaign host; expect no pixel load (cookie scope check across hosts) [P3].
6. Expired-stage guard: a stage event dated 8 days ago is dropped and logged.
7. CTWA throwaway conversation: `LeadSubmitted` accepted; `Lead` rejected (H35).
8. Cookie check on two origins: apex and one campaign host; one `_fbp`, one `_fbc` (H12).
9. Real-device pass in Facebook and Instagram in-app browsers (H11).
10. Console: no CSP violations; exactly one CSP header.

---

## I. Compliance guardrails: checklist for writers and reviewers

Source: the compliance lens (`research/compliance-sa.md`, rules S1 to S35, per-page checklist) as corrected by ledger rows C1 to C12. Nothing here is legal advice; the practitioner signs off (L, Q1 to Q8). Who is bound by what: the FAIS General Code of Conduct binds authorised providers and their representatives, not SortMyCover or Lead Velocity directly. SortMyCover is bound by CPA s41 (false, misleading or deceptive representations, including false status or affiliation), FAIS s7(1) (acting or offering to act as an FSP without a licence), FAIS s8(9) (indicating authorisation; misleading statements that it knows or ought to know are misleading), POPIA, the ECT Act (arguable for a free service) and, as an advertiser, the ARB Code (self-regulatory). The GCoC reaches SortMyCover's wording only through the adviser's duty for ads others publish, and as the standard SortMyCover copy should meet [C1] [C3] [C4].

### I.1 Writer rules (blockers at review)

| Rule | What | Ledger |
|---|---|---|
| S1 | SortMyCover introduces people to an authorised provider and books the call. It never checks, reviews, sorts, arranges, finds, matches or recommends cover. | [C1] |
| S2 | Never say or imply SortMyCover or Lead Velocity is licensed, authorised, approved, registered with or regulated by the FSCA. No FSCA logo. The footer says the opposite. A truthful FSP statement is allowed only for the adviser. | [C4] |
| S3 | FSP details appear for the adviser only, after a register check. No sample FSP number on any public asset. | [C4] |
| S4 | "Independent" is never used for SortMyCover. For an adviser only with written confirmation under GCoC s3(5). | [C4] |
| S5 | While one adviser is live: no panel, network, matched, best-for-you, compare. | [C4] |
| S6 | How we make money is plain and linked from every page; every "no commission" line is scoped to SortMyCover. | [C3] |
| S7 | Describe the call in process terms only. No outcomes or benefits. | [C2] |
| S9 to S11 | Never explain products, help with documents, or suggest keeping, cancelling or replacing cover. | [C1] |
| S12 | Never say what a person needs, should have or is short by. General facts only, sourced and dated, labelled "general information, not advice". | [C2] |
| S13 | Write "The call costs you nothing." Never "free advice, review, check, quote or assessment". Pair with "If you later choose a product, your adviser tells you how they are paid." | [C3] |
| S14 | No premium, price, "from R", cheaper, affordable, save, cover amount or rand example. | [C11] |
| S15 | Every factual or statistical claim has an evidence file, current, with source and month shown. | [C5] |
| S16 | No best, cheapest, leading, #1, top-rated, "trusted by", "thousands of South Africans", awards, "unlike other sites". Counts only from the booking database, dated. | [C11] |
| S17 | Testimonials and ratings: real, consented, current, signed copies on file, "not financial advice" label, no review gating, no stock customers. Until then `proof: []`. | [C10] |
| S18 to S21 | Quiz asks only what routing needs. No output computed from answers. Helper text teaches no needs and implies no price. Neutral not-available screen. | [C2] |
| S22, S23 | No pre-ticked boxes. Required and optional consents are separate. "I am 18 or older" in the consent step. | [C12] [P1] |
| S24 to S30 | Ads follow page rules; no fear or manufactured urgency (slot scarcity only if read live); landing H1 repeats the hook; no adviser named in ads until Q1; slugs avoid word list; keep ad versions and evidence five years; real, permitted people only. | [C11] |
| S31 | Footer on every page and host: legal name, registration number, physical address, phone, hello@, directors' names, FOOTER-v2 line, links to Privacy, Terms, How we make money, Complaints, Opt-out, PAIA manual. | [C7] [C8] |
| S32, S33 | Collection points state who collects, purpose, recipient, channels, STOP, privacy link. Statements about registries or registrations are written only when true that day. | [C9] |
| S34 | Animation and interaction never hide, delay or obscure a disclosure. | [M8] |
| S35 | Respect reduced motion; keyboard operable; WCAG 2.2 AA expectation. | [U8] |

Corrections to carry into the rules (from the ledger): ECT s43(1) runs (a) to (r), not (a) to (g), and whether it binds a free service is open [C7]; the Regulator's wording on Information Officer registration is "compulsory requirement" [C8]; blocks on the NCC registry can already be registered and what starts later is marketer cleansing from December 2026 and enforcement from 15 April 2027 [C9]; ARB clause 10 covers testimonials and endorsements, while awards need source, date and grantor under GCoC s14(3)(b) [C10]; the ARB code has no urgency clause, GCoC s14(3)(n) does [C11]; ARB 4.4.1 says "any cost to the consumer", and "directly or indirectly" is GCoC s14(3)(p)(iii) [C3].

### I.2 Reviewer checklist per page (tick before publish)

- [ ] Identity block and FOOTER-v2 line present, no placeholder text, registration number verified (H14).
- [ ] Links present: Privacy, Terms, How we make money, Complaints, Opt-out, PAIA manual.
- [ ] No FSCA logo, no status word about SortMyCover (S2).
- [ ] Word scan clean: check, review, sort, arrange, match, compare, best, cheapest, independent, free (only inside "costs you nothing" and never with advice, review, check or quote), guarantee, approved, regulated, licensed (only about a verified adviser).
- [ ] Every number has a source and month on file (`config/evidence.json`).
- [ ] No output computed from quiz answers; not-available screen is the neutral line.
- [ ] Adviser name, practice and FSP number verified on the FSCA register before they appear (named mode).
- [ ] 18+ confirmation present; both consents unticked; optional ad consent separate.
- [ ] Pixel and ad cookies off until "I give" (Q3).
- [ ] Disclosures visible with JavaScript off and with reduced motion on.
- [ ] Hook, H1 and claims match; evidence file linked in the ad log; ad names SortMyCover and Lead Velocity.
- [ ] Reading level at or below Grade 7 (`reading_level.py`).
- [ ] AI-assisted text has a named human fact-check (G.2).

The build runs the word scan and the evidence check automatically (task B-05); a human still signs.

### I.3 Content that must wait for a blocker
- Anything with the "2 to 4x salary" claim, until a current, ARB-acceptable source is filed. The Sanlam Benchmark supports "about three times for people whose employer provides group life", not "most work cover stops at 2 to 4x"; Sanlam is an insurer, so ARB 4.1.3 and 4.1.4 must be checked and BDRC Africa's accreditation is unconfirmed (H18) [C5].
- Terms s6 (registry): reword to the true state (registered marketers cleanse lists from December 2026 and enforcement is announced for 15 April 2027) [C9].
- Any "keep, cancel, replace" or policy-review content: blocked on the practitioner's s14 answer [RAW].
- Adviser portraits and names on public pages: Jonathan's decision plus Q4 [T7].
- A cover-amount calculator: not built. A personal cover amount probably falls outside FAIS s1(3)(a), and the comparators frame results as a guide while an unlicensed site risks unlicensed advice [C2] [T9] [S8].

---

## J. Measurement and A/B test plan

### J.1 Stage KPIs
The single 18% page gate is replaced. 18.2% is Unbounce's insurance median for its own customers (data to Jul 2024) and not a like-for-like target; neighbouring benchmarks run from 2.55% (US Finance and Insurance search, Google Ads) to 8.54% (all-industry Facebook lead campaigns); the 3 to 10% visit-to-submitted band is a planning figure only (H36) [U1]. Measure each stage and judge on cost per qualified lead and cost per attended call.

| Stage | Source | Definition |
|---|---|---|
| Landing view | Count-only beacon | Page loaded on a campaign host |
| Quiz start | Beacon | First tap on step 1 |
| Quiz complete | Beacon | Reached the contact step |
| Details submitted | `/lead` success | Server-side |
| Qualified | n8n | Budget band R750 or more and age in band |
| Booked | `/book` success | Server-side |
| Attended | Adviser record | Call took place |

Per campaign host, per ad. Replace every benchmark with the first two weeks of production data (H36).

### J.2 Realistic sample sizes
Two-sided test, alpha 0.05, power 80%: n per arm = 7.849 x (p1(1-p1) + p2(1-p2)) / (p2-p1)^2.

| Baseline | Relative lift to detect | Visitors needed per arm |
|---|---|---|
| Visit to quiz start 40% | +20% (to 48%) | about 600 |
| Visit to submitted 5% | +50% (to 7.5%) | about 1,470 |
| Visit to submitted 5% | +25% (to 6.25%) | about 5,330 |
| Visit to submitted 5% | +10% (to 5.5%) | about 31,200 |
| Visit to submitted 3% | +50% (to 4.5%) | about 2,510 |
| Visit to submitted 10% | +50% (to 15%) | about 680 |

The repo rule "200 conversions per arm or 14 days, whichever first" detects only about a 27 to 29% relative lift at best (at 5% baseline: 4,000 visitors per arm; the minimum detectable lift is about 27%), and the 14-day cap makes it worse at low traffic [U2]. In a set of 1,001 tests the median winning lift was 7.5%; at this traffic a 7.5% lift would be detected only about 11 to 12% of the time (our arithmetic) [U2]. Median estimated lift across all tests in that set was about 0.08% [U2]. So most page tests will return "no significant winner" (many of those stopped for futility are conclusive about a near-zero effect).

Time to read: not forecast. There is no South African CPC or quiz-funnel benchmark (H36). Worked example only: at 1,000 paid visitors a week split across two arms, 1,470 per arm takes about three weeks; 5,330 per arm takes about eleven. Re-do this table with the real week-1 numbers.

### J.3 What to test, and how
1. Test only structural changes expected to move a metric by 50% or more: quiz-first versus details-first; WhatsApp-first versus the in-page booking widget; a hook-matched H1 versus a generic H1 [U2] [U6].
2. Judge visual polish on higher-base-rate micro metrics (quiz start, step completion), with booked and qualified as guardrails.
3. Pool 50/50 randomised traffic across campaign pages that share the template, so hook tests across pages add sample size [U2] [U11].
4. Fix the sample size before launch. No peeking. If a sequential or Bayesian rule is wanted, choose it in advance [U2].
5. Randomise at the edge or by URL, not by hiding the page with client-side code that could delay LCP [U2].
6. Hooks are tested at ad level in Meta, with the landing page as control. Meta's A/B test confidence threshold (65% quoted) and 7-day minimum are unverified (H33).
7. Motion: keep a no-Motion control in the pooled test; expect a null on conversion and use it as an INP and LCP guardrail [U4].
8. Until about 1,400 visitors per arm exist, rely on five-person usability sessions rather than a split test [U2].
9. The quiz-first versus details-first test is the one structural test. Evidence that multi-step beats single-step forms is vendor anecdote without sample sizes; the quiz stays for qualification, not for a proven lift. Never advertise "2 to 10x" quiz uplift [U6].
10. Progress indicator: keep the numeric label and the typing step last; do not smooth the bar by time; measure median first-tap-to-submit before keeping "in 60 seconds" anywhere. A roughly one-minute quiz is far shorter than the 18 to 22 minute surveys in the meta-analysis, so it does not apply [U12].

### J.4 Measurement stack
- First-party count-only beacon (`/beacon`), no identifier.
- First-party RUM beacon: LCP, CLS, INP, tap-to-submit time, an in-app-browser flag from the user agent, posted to n8n within `connect-src`. CrUX and Search Console exclude Android WebView and iOS in-app views, which is where Meta traffic lives [U5].
- Lighthouse on every build (`landing/lighthouse.sh`) and the real-device test of F.2 (H24).
- Search Console, Bing Webmaster, the beacon's `ref_host` and `utm_source` fields (no GA4) and the monthly brand audit of G.4 and G.5.
- Meta Events Manager for event health; Event Match Quality at 6 or higher on web `Lead` and `Schedule` only [P8].

---

## K. Build plan

Principles: keep the no-dependency Node build (`node build-site.mjs`, `installCommand: echo no-install`); one `vercel.json`; content as HTML files with a JSON front-matter comment (no markdown parser to maintain) [DJ]; nothing is deployed, committed or installed by the specification itself. Effort is in working days for one builder plus review; the estimates are mine [DJ], not sourced. Tasks are ordered; a task may start when its "needs" are done.

Paths are under `C:\Users\Jono\lv-site\` (the repo root has `brand/`, `automation/`, `landing/`, `deliverables/`).

| ID | Task | Needs | Files to create or change | Days | Acceptance criteria | Tests |
|---|---|---|---|---|---|---|
| B-00 | Gates and prerequisites (Jonathan, section M) | none | none | 0.5 + waiting | Pro plan confirmed; BIND zone export saved; Q1 to Q8 sent; n8n host and WhatsApp number supplied | none |
| B-00A | `routes` proof on a throwaway deployment (C.5) | B-00 | none in the repo; a scratch `vercel.json` in the scratchpad with one `routes` host entry, one `redirects`, one `headers` and one `rewrites` entry; an alias set with `vercel alias set` | 0.5 | Alias host returns the proof page for `/` while the default URL returns the apex page; redirect and header still apply; no config warnings. **Fallback cost if it fails:** project-level routing rules, about 1 working day, or Routing Middleware, about 1.5 working days, inserted before B-06 and B-06 re-targeted (the generator keeps its output swappable). Schedule slot: contingency of 1.5 days, not in the base total | curl matrix against the alias |
| B-01 | Content engine and templates | B-00 | create `landing/content/pages/*.html`, `landing/content/learn/*.html`, `landing/templates/{base,home,article,hub}.html`, `landing/lib/render.mjs`; change `landing/build-site.mjs` (reads `content/`, writes `site/<page>/index.html`); move `landing/holding/*` bodies into `content/`; delete `holding/` after parity | 2.5 | `node landing/build-site.mjs` builds every B.1 page; no unfilled `{{...}}` (the existing scan passes); output has `<page>/index.html` | build smoke test; diff of rendered text against holding pages |
| B-02 | URL migration, sitemap, robots | B-01 | change `landing/vercel.json` (11 `.html` 301s from B.3; remove the CSP rules keyed to `.html`); create `landing/scripts/gen-sitemap.mjs`; change `landing/holding/robots.txt` to the build output; retire `landing/prepare-holding-deploy.mjs` and fold its checks into `build-site.mjs`; rewrite `landing/holding/deploy.md` as `landing/DEPLOY.md` | 1.5 | Every old URL returns 301 to the folder URL; `/about` returns 200; sitemap lists only indexable apex URLs, each with `lastmod`; one `vercel.json` serves everything (the live apex file differs from the repo file today) [D5] | `tests/redirects.sh` curl matrix; preview deploy |
| B-03 | Footer, identity block and trust pages | B-01 | create `landing/templates/partials/{header,footer,identity}.html`; create `content/pages/{about,advisers,contact,complaints,editorial-policy,accessibility,paia}.html`; edit `privacy`, `terms`, `how-we-make-money`; `config/site.json` gains `legal_name`, `reg_no`, `address`, `phone`, `directors`, `io_registration` | 2 (+ legal wait) | Identity block and FOOTER-v2 line on every page; build fails if `reg_no` is empty in production; complaints page lists SortMyCover routes (Information Regulator, NCC, ARB) separately from the adviser route (FAIS Ombud) [C7]; the physical address is stored once in `config/site.json` and the build fails if any built page carries a different address string (today it is Pegasus Building 1, 210 Amarand Avenue, Menlyn Maine, Pretoria, 0184 in `terms.html` and `privacy.html`, ledger T6) | page checklist I.2; link check |
| B-04 | Home, How it works, Book | B-03 | create `content/pages/{home,how-it-works,book}.html`; `landing/site.css` (apex styles) | 2 | D.1 above-the-fold content present in server HTML at 360 px; no third-party request; no rating or counter | Lighthouse mobile; a11y; word scan |
| B-05 | Editorial controls | B-01 | create `landing/lib/checks.mjs`, `landing/config/evidence.json`, `landing/config/banned-words.json`; change `build-site.mjs` to run them | 1.5 | Build fails on: missing `fact_checked_by`/`fact_checked_on`, empty `sources[]`, a `%`/multiple/rand figure with no evidence entry, any banned word outside the allowed phrase, a reviewer block without `verified_on` and an FSCA register link, `FAQPage` or `Product` markup | unit tests with failing fixtures |
| B-06 | Hosts generator, per-host build, guards | B-02 | create `landing/scripts/gen-hosts.mjs`, `landing/tests/hosts.sh`; change `landing/angles/*.json` (optional `host`, `status`), `landing/build.mjs` (per-host canonical, `og:url`, `thanks_url`, robots; output `site/c/<slug>/`), `landing/vercel.json` (marker-delimited blocks from C.5), `build-site.mjs` (drift guard) | 2 | A host with `host: true` requires noindex and a matching canonical host or the build fails; generated blocks equal the committed ones; no two angles share a host; label regex enforced; reserved labels refused | `gen-hosts` unit tests; drift test |
| B-07 | Quiz rework | B-06 | change `landing/template/{index.html,page.js,page.css}`, `config/{strings,consent,faq}.json`; page CSS becomes a file (no inline `<style>`) | 3 | Two taps then name, mobile, consent; out-of-band exits with the neutral line and sends nothing; numeric step label; two separate consent controls, both unticked; "I am 18 or older"; no output computed from answers; `role="status"` regions; the four age bands and the neutral exit screen with its single `/learn/` link (D.2); `config/consent.json` required text replaced by the D.2 step 4 wording and its `footer_line` by FOOTER-v2; the `result_yes`, `result_unsure` and `result_no` strings are deleted from `strings.json` (they say "licensed adviser" and compute a message from the answers, against rules S2 and S19); the built page has no `style=` attribute, no `<style>`, no inline script and no `on*=` handler (C.5 build check); /lead, /slots and /book are protected as in B-11 (spike test); n8n contracts (`/lead`, `/slots`, `/book`, `/lead/skip`, `/beacon`) unchanged except new fields `consent_ads`, `event_id` | `tests/quiz.spec.ts` updated; `a11y.mjs`; manual TalkBack at 360 px |
| B-08 | Motion vendoring and effects | B-07 | create `landing/vendor/build-motion.mjs` (laptop-only), `landing/shared/vendor/motion-14.1.0.min.js` (committed), `landing/shared/fx.js`, `landing/shared/fx.css` | 1.5 | F.3 recipes 1, 2, 5, 7 work; reduced-motion visitors fetch no Motion bytes; first viewport never starts hidden; payload at most 3.2 KB brotli on campaign pages; the F.2 LCP/INP/CLS acceptance test passes (Motion on versus blocked); every `[data-disclosure]` element is visible with JS off and at t=0 (F.3) | `tests/budget.mjs` size guard; `lcp-check.mjs`; reduced-motion Playwright run; JS-disabled run (H23); vendored-file-blocked run (H24); disclosure-visibility test |
| B-09 | Consent, Pixel and CAPI | B-07 | change `landing/shared/pixel.js` (load after "I give"; stop writing `_fbc`; fire `Lead`/`Schedule` after server success); create `landing/shared/consent.js` (cookie `smc_ads`, replaces `holding/privacy.js` logic); change `automation/lib/w01.mjs` (set `consent_ads_at` only from the new flag), `automation/capi/capi.js` (v25.0, age guard of 6.5 days, `LeadSubmitted`/`QualifiedLead` mapping, `event_id` pass-through, neutral `content_name`); n8n workflows W01, W03, W05; WhatsApp templates `WA-INTRO-v2` and `WA-REMIND-v1` submitted as UTILITY (a Jonathan gate, M) | 3 (+ Meta review wait) | H.6 steps 1 to 10 pass on a throwaway dataset; the CAPI gate excludes a lead with no `consent_ads_at`; expired stage events are logged not sent; the D.3 acceptance holds (WA-INTRO-v2 and WA-REMIND-v1 approved, first message from the displayed number inside 60 seconds, stored consent text is the D.2 step 4 version) | H.6 plan; `capi` unit tests |
| B-10 | RUM and stage beacon | B-07 | create `landing/shared/rum.js`; extend the n8n `/beacon` handler fields (including `ref_host` and `utm_source`, G.5) | 1.5 | LCP, CLS, INP, tap-to-submit time and in-app flag arrive in n8n; no identifier; CSP `connect-src` holds | beacon replay test; real-device in-app test (H11) |
| B-11 | Test and budget harness | B-06 | create `landing/tests/{hosts.sh,budget.mjs,redirects.sh}`; change `lighthouse.sh`, `quiz.spec.ts`, `a11y.mjs` | 2 | Matrix passes, with exactly one CSP header on every row: campaign host `/` and `/thanks/` (200, quiz title, `x-robots-tag: noindex`, campaign CSP, `/assets/page.js` 200, `/robots.txt` allow-all, canonical equals host); apex `/` (strict CSP, no `x-robots-tag`); apex `/book/` (campaign CSP, no `x-robots-tag`, quiz title); apex `/book/thanks/` (campaign CSP, `x-robots-tag: noindex`); a preview `/book/` (campaign CSP) and a preview `/` (strict CSP); zero console CSP violations on `/book/`, `/book/thanks/` and one campaign host; the built-page inline check of C.5 passes; spike test: replay 50 `/lead` submissions a minute for 10 minutes from five source addresses against a staging n8n (numbers are [DJ] sizing for an ad-click spike, to be replaced by the real daily budget) and confirm that Turnstile verification happens before any write, the honeypot drops bots, rate limits answer 429 (the `err_rate` string) rather than failing, and `/slots` is cached or throttled so a spike cannot exhaust the calendar calls; budgets: own assets 60 KB compressed first view, third-party about 120 KB | run in CI or by hand before each host |
| B-12 | Content wave 1 | B-05 | the nine wave-1 articles, Hub pages, glossary, FAQ page | 3 | Each article passes B-05 and I.2 and has a named human fact-check | checks; editor sign-off |
| B-13 | SEO and AI go-live | B-04, B-12 | JSON-LD in `templates/base.html` (Organization with real `sameAs`, WebSite, Article, BreadcrumbList); Search Console, Bing, Vercel AI Bots setting (Jonathan-gated parts in M); no GA4 | 1 | Rich Results/structured-data test shows no errors; Domain property verified; AI Bots set to Allow or Log | manual checklist |
| B-14A | DEPLOY: first production deploy of the generated `vercel.json` with no host attached | B-06 to B-11 | none | 0.25 | Run by Jonathan, or by an agent he tells to: check Settings > Git (UNVERIFIED that the project has no Git link), `vercel link`, then `npx vercel --prod` from the Root Directory the project expects; needs a Vercel login or token (a Jonathan gate, M). Merging or pushing deploys nothing without a Git link. `vercel rollback` is the way back | apex matrix of B-11 on production |
| B-14 | Per-host launch | B-14A | none (runbook C.5) | 0.5 per host | C.5 steps 1 to 7 complete before the ad's destination changes (step 1 is B-14A) | `hosts.sh`, H.6 |
| B-15 | Content waves 2 and 3 | B-12 | remaining articles | 5 | As B-12; wave 2 ships as each host goes live | as B-12 |

Total build effort about 26 working days excluding waits (Meta template and display-name review, legal turnaround), content wave 3 and the 1.5-day `routes` fallback contingency. A minimum launch for the first paid click is B-00 to B-11, B-13 for the first host, B-12 partial (articles 16, 17, 18, 20, 21, 22), B-14A and B-14: about 19 days [DJ].

Do not run `npm install` for the site. The only npm use is the one-off Motion bundling on a laptop (B-08).

Order of risk: B-02 and B-06 change what is live, so each deploys alone with its curl matrix; B-09 touches the n8n production workflows, so it runs on a copy first.

---

## L. Risks and open questions

### L.1 Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| The `routes` host shape does not beat `index.html` on this project | Every campaign host would show the apex home page | Pre-DNS curl test; fallbacks in C.5 (H1) |
| Vercel plan is Hobby | Non-commercial use; a policy pause would take all pages offline at once | Confirm in Settings > Billing; move to Pro (H2) [D4] |
| Opt-in Pixel starves optimisation | Meta sees no PageView; few ticked leads | Optimise on `Lead`; the `notice` flag is the lever, and it is a legal decision (Q3) |
| Unlicensed model sits inside FAIS | Raspberry Academy is a single default-judgment ruling, contested by commentators; a mechanical hand-over for a fee not tied to sales "might prompt a different factual enquiry" | Review the live site, not just the contract (Q1, Q4); design so no page recommends, ranks, prices or transacts [T1] |
| Words in ad hooks ("Cover checked?") read as SortMyCover checking cover | Offer to act risk | Q5; hold those hooks |
| Brand name and tagline contain "sort" | Same | Q5; do not use the tagline as H1 or CTA meanwhile |
| Motion regressions between versions | 13.3.0 silently removed reduced-motion handling; seven releases in 15 days | Pin 14.1.0; gate in our code; re-test before any bump [M4] [M11] |
| JavaScript-dependent quiz fails in in-app browsers | Lost leads | Real-device tests; fallback contact line (H11) |
| New domain has zero authority | Slow organic and AI visibility | Treat as long game; paid funnel does not depend on it [G4] |
| AI engines misstate SortMyCover | Trust damage | Monthly audit; consistent entity profiles; corrections route [G5] |
| `hello@` deliverability | No DMARC or DKIM found on 10 Oct 2026 | Add records (Jonathan, M) [RAW] |
| Orphaned CNAMEs | Takeover handling undocumented | Delete DNS the day a host is removed (H5) |
| Mail records during any nameserver move | MX, SPF, MS= TXT, autodiscover | No wildcard, no nameserver move [D2] |
| Meta classifies the dataset as restricted | Parameters blocked, events held for review | Check data source categories after creation; neutral names (H8) |
| Ad-click spike overwhelms `/lead`, `/slots` or `/book` (n8n host) | Lost leads, bot submissions, a calendar API limit | Turnstile verified before any write, honeypot, rate limits at the proxy (H38), `/slots` cached; B-11 spike test |
| WhatsApp first message blocked or recategorised | The funnel's first contact fails, or costs about four times more | D.3: templates and display name approved before any ad; cost per lead re-run on real rates |
| Public fee sentence does not match the signed contract | CPA s41 and FAIS s8(9) exposure | Fee-statement rule (C.1); `fee-model` evidence entry citing signed clauses; Q5 |
| Hold-over claims creep back | Unsourced statistics | Build-time evidence check B-05 |
| Registration number unverified | Published identity must be true | CIPC check before publishing (H14) |

### L.2 Open questions for the compliance practitioner (Q1 to Q8)

Q1. Does the fee-for-service, mechanical hand-over model (a fee per billing cycle, not tied to any sale, LGSA clauses 8.1 to 8.3), as shown on the live site and quiz, stay outside "offer to act" and intermediary service under FAIS s1 and s7? Is an ad that names an adviser the adviser's advertisement under GCoC s14? [T1] [C1]
Q2. May the quiz ask more than age band and budget band (home loan, dependants, work cover)? Is the neutral not-available screen safe? [C2]
Q3. Pixel consent: opt-in or notice? Is conversion-only measurement, with no retargeting, direct marketing under POPIA s69? Does the cookieless count-only beacon need notice? [P2] [C6]
Q4. Should SortMyCover stay outside FAIS as a fee-for-service marketer, or operate as an appointed representative of an FSP (as Unbiased reportedly does, on its own terms page only)? What does the answer allow on the site (named advisers, product detail)? [T2] [T7]
Q5. Wording: "Cover checked?", the fee sentence "The fee does not depend on whether you buy anything" (CPA s41, FAIS s8(9); it must match the signed LGSA clauses 8.1 to 8.3 and 9.1), the phrase "an adviser from an FSCA-authorised financial services provider" and the word "adviser" for a representative of an FSP (B.5), "Check my cover", the brand tagline "Sort your cover", the H1 in D.1, "Book my adviser call", and "The call costs you nothing" [C1] [C3].
Q6. Which entity registers as a direct marketer on the NCC registry: Lead Velocity, the adviser, or both? [C9]
Q7. Identity block, ECT s43 (does it bind a free service?), PAIA manual, Information Officer registration, and the CIPC number [C7] [C8].
Q8. The WhatsApp opt-in and sender wording of D.2 steps 3 and 4 and D.3: that the required consent names SortMyCover, a service of Lead Velocity (Pty) Ltd, as the sender of the first (business-initiated, template) WhatsApp message and separately names the adviser's FSP for later contact; that the step 3 reason line ("will message this number on WhatsApp about your call. The adviser you are booked with will also have it") is enough notice; and that a utility booking-confirmation template is not direct marketing under POPIA s69. Also the wording and placement of the optional ad-measurement consent (CP-v0.2), and whether "I am 18 or older" in the consent step is enough for POPIA s34 and s35 [P1] [C12].

### L.3 Other open items (hypotheses, section 3 of the ledger)
The `routes` shape (H1), Vercel plan (H2), Hostinger TTL 300 (H6), Meta dedupe merge behaviour (H7), Meta data categorisation (H8), in-app browser behaviour (H11), pixel cookie index for `.co.za` (H12), CIPC registration (H14), Sanlam fieldwork accreditation (H18), real-device INP with Motion (H24), Search Console generative AI data for South Africa (H29), South African conversion benchmarks (H36), and the "Cover checked?" hook (H37).

### L.4 Scope decisions made explicitly (not silence)

These are things a South African reader might expect and the launch does not deliver. Each is a decision for Jonathan (M), with an owner, a trigger to revisit and a rough cost [DJ, estimates ours, not sourced].

| Item | Decision at launch | Owner | Revisit when | Rough cost to add |
|---|---|---|---|---|
| Afrikaans, isiZulu, isiXhosa | English only (`lang="en-ZA"`). The repo already anticipates an Afrikaans variant (`config/strings.json` comment; the CoverKlaar case in G.1), but no copy exists. | Jonathan | Ad data shows a material Afrikaans-speaking audience, or the attorney asks for it | Afrikaans: 3 to 5 days for translation of quiz, consent, five pages and review, plus a **separate attorney review of every consent text** (each language is its own consent version), plus hreflang pairs (G.1). Each further language is a new project, not a toggle |
| Accessibility statement | Added at `/accessibility/` (B.1, B-03); states the WCAG 2.2 AA target, known gaps and a contact route | Editor | Each release | In B-03 |
| Cookie policy | Stays a section of `/privacy/` with anchor `#cookies` and the `#opt-out` control (DEC-4); no separate page | Attorney | If Q3 or the Regulator asks for a standalone notice | 0.25 day |
| Adviser-facing or "for advisers" route | None on this site. Brokers pay Lead Velocity, but a broker-sales route on a consumer site would blur the broker-neutral message. At most an optional footer link to the Lead Velocity company site | Jonathan | When a second broker is onboarded | 1 day for a link and a short page |
| South African peer analysis | Hippo.co.za, Discovery and Dial Direct looked at via snippets only (T7). Not analysed in depth | Editor | Before home page copy is finalised (B-04) | 0.5 day desk review of their disclosure and contact patterns |

---

## M. What is needed from Jonathan

Everything here is a gate: money, DNS, accounts, legal approvals or taste. Nothing in this specification authorises an agent to act on it.

| # | What | Why |
|---|---|---|
| 1 | Confirm the Vercel plan (Settings > Billing) and, if Hobby, upgrade to Pro (US$20 a month) before the first paid click | Hobby is non-commercial; a pause would take every page offline [D4] |
| 2 | Approve the subdomain scheme and the list of hosts to attach first (bond-paperwork first), including the `looking-is-not-buying` override | Reverses the earlier "no go. subdomain" decision in `holding/deploy.md`; one host per ad [D10] |
| 3 | Add the CNAME records at Hostinger for each approved host, after exporting the zone as a BIND file | DNS is yours; a mistake can break mail [D2] [D3] |
| 4 | Add a TXT record for Search Console, a TXT record for Meta domain verification, and DMARC and DKIM records for `hello@` | Verification and mail deliverability; the zone is at Hostinger [S9] [P6] |
| 5 | Say yes or no to showing the company name, registration number, address, phone, email and directors in every footer (DEC-6) | Reverses decision A of 5 Oct 2026; the research says the identity block is a baseline [C7] |
| 6 | Supply: directors' names, a public phone number, and the WhatsApp Business number of D.3. Confirm that the address already in `terms.html` and `privacy.html` (Pegasus Building 1, 210 Amarand Avenue, Menlyn Maine, Pretoria, 0184; ledger T6) is the one to publish in every footer; if it is not, say so, and it changes in all places at once from `config/site.json` | Required by the identity block (S31) and the human route [C7] |
| 7 | Verify the registration number 2025/637858/07 at CIPC and register the Information Officer with the Information Regulator | Cannot publish an unverified number; registration is a compulsory requirement [C8] (H14) |
| 8 | Appoint or confirm the compliance practitioner and send Q1 to Q8 | Several pages and hooks are gated on the answers [L.2] |
| 9 | Decide the Pixel mode: opt-in (default in this spec) or notice, after Q3 | It decides how much Meta can learn [H.4] |
| 10 | Provide the n8n host for the proxy, the Turnstile site key, the Meta Pixel ID and dataset, and the access to create a throwaway test dataset | Needed for the CSP, the Test Events plan and QA [H.5] [P12] |
| 11 | Decide whether any adviser is named or shown publicly, and obtain the adviser's firm's written consent and FSP number | It conflicts with the broker-neutral decision [T7] |
| 12 | Name the editor and, when ready, an independent reviewer who is not a broker SortMyCover routes leads to; consent to a byline | Bylines and review lines are the E-E-A-T and editorial-policy basis [S3] |
| 13 | Create or approve real profiles: Facebook page, YouTube channel, LinkedIn page for Lead Velocity (Pty) Ltd; one agreed description | Entity build and `sameAs` [G4] |
| 14 | Approve the 26 article titles, the waves, and the "hold" decisions (employer-gap, extended-family, article 12) | Content is gated on compliance [B.4] |
| 15 | Set Vercel Firewall > Bot Management > AI Bots to Allow or Log; check Search Console > Search generative AI is Include | Dashboard settings only you can change [G3] [G1] |
| 16 | Decide whether to run the optional Motion+ AI Kit audit (US$399 one-time) | Not needed; listed so the decision is explicit [M2] |
| 17 | Provide assets: any real photos or the explainer film (with alt text and captions), consented testimonials if any exist, the PAIA manual text | Nothing is invented; images must be real, consented and South African [T8] [C10] |
| 18 | Approve a real-device test slot: one cheap Android and one iPhone, Facebook and Instagram in-app browsers | Settles H11 and H24 |
| 18a | Run or authorise the production deploy (B-14A: Vercel login or token); supply the signed LGSA clause numbers for the `fee-model` evidence entry (C.1 item 5); start the WhatsApp display-name approval, business verification and template submission (D.3) | Deploy, fee wording and first-message sending are gated on these |
| 19 | Approve the first ad destination switch per host, after the C.5 checklist passes | Last irreversible step per host |

---

## N. Change log and traceability

- This specification supersedes the live holding-site structure in section B and the quiz design in the 5 Oct 2026 `RECONCILE.md` where they differ (DEC-2, DEC-3, DEC-4, DEC-6).
- Traceability: every `[T/S/G/U/P/C/D/M]` tag points at a row of `deliverables/website/fact-check.md`; every `[DJ]` is a design judgement with its reason stated; `[HYP]` and `(H..)` point at the unverified list in ledger section 3; `[RAW]` items come from the research files or repo without a second check.
- v1.2 (10 Oct 2026, second critic pass): added 0.1 synthesis table, D.3 WhatsApp hand-off, L.4 scope decisions, B-00A and B-14A, age bands and the neutral exit screen, the disclosure exclusion list and test, the Motion LCP/INP acceptance test, referrer capture in place of GA4, the consent sentence naming Lead Velocity as WhatsApp sender, the single published address, and `/book/` partition checks in B-11.
- No file in `landing/` has been changed by this specification.

