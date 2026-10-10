# Lens top5-sites: the five best consumer insurance / financial-advice sites, and what SortMyCover can and cannot copy

Author: research agent (lens `top5-sites`) · Date: 2026-10-10 · Scope: research only, nothing deployed or committed.
Inputs read first: `deliverables/verified-facts.md`, `deliverables/search-findability-lead/{SUMMARY,serp-plan}.md`, `deliverables/creative-strategist/website-wording.md`, `landing/README.md`, `landing/holding/*` (home, about, how-we-make-money, complaints, terms), `docs/MASTER-PROMPT.md` sections 1.2 and 2.1. Not duplicated here: brand SERP plan, CWV budgets, banned-word list, consent wording.

How to read the "Allowed under FAIS?" verdicts: they are a design risk rating from published law-firm commentary, not legal advice. Labels used throughout:
- ALLOWED: no FAIS trigger found.
- ALLOWED-IF: allowed with the stated condition.
- NOT ALLOWED: would be advice, a comparison, a quote, a recommendation, or marketing a specific product. Only a licensed FSP/broker may do it.
- ASK: needs the compliance practitioner (MASTER-PROMPT 1.2 already commissions one opinion; extend it to the live site and quiz, not only the contract).

---

## 0. Evidence quality, stated up front

- Page observations come from an automated fetch plus summariser (WebFetch), not a human viewing a browser. Where two fetches or sources disagreed I say so. Several sites returned HTTP 403 to the fetcher (ethos.com, comparethemarket.com, lemonade.com, insurify.com, saflii.org, cliffedekkerhofmeyr.com). For those, I used search-result snippets, Trustpilot, and third-party reviews, and I mark the claim as such.
- Traffic = Similarweb free pages, data month September 2026, fetched 2026-10-10. The visit-count lines on those pages were ambiguous ("last 3 months" vs month), so I use **global rank, pages per visit and bounce rate only**, and treat them as indicative.
- Reviews = Trustpilot profile pages fetched 2026-10-10.
- No site publishes its own conversion rate. I found no published A/B-test or CRO case study for any of the five. The conversion evidence below is third-party benchmark (Unbounce 2024), usability research (Baymard, 25 Aug 2026; NN/g 2017 and 2018, so possibly stale), and vendor-grade blog tests. Magnitudes from the last group are UNVERIFIED.
- Anything dated before 2024 is flagged "(pre-2024)".

---

## 1. How the five were chosen

"Best in the world" is not one thing, and the biggest sites are mostly licensed comparators whose core feature SortMyCover cannot legally have. So the rule was: **one site per archetype that SortMyCover can learn from, taking the best-evidenced site in each archetype** (scale by Similarweb rank, independent review score and volume, engagement, and how well-documented its trust/disclosure design is).

| Archetype SortMyCover needs | Winner | Why it beat the others in its archetype | Not chosen (and why) |
|---|---|---|---|
| Trust, disclosure and scale benchmark (comparison) | **Compare the Market** (UK) | Global rank #3,858; 8.86 pages/visit, 34.0% bounce; Trustpilot 4.9 from 148,077 reviews; FCA-authorised, FRN shown | MoneySuperMarket: global #6,253, 5.33 pages/visit, Trustpilot 4.8 from 62,776. Same model, weaker on every measure. Kept as runner-up. |
| Content hub, information architecture, editorial trust | **NerdWallet** (US) | Global rank #2,756, the highest of any candidate; most documented editorial-standards and advertiser-disclosure system | Bankrate, Investopedia: not checked (UNVERIFIED). Trustpilot 3.4 from 3,581 is weak, but I could not tell whether that is insurance-related. |
| Fast, low-friction life-cover funnel | **Ethos** (US) | ethoslife.com global #30,490; 7.94 pages/visit, 25.2% bounce; Trustpilot 4.9 from 7,727 (4,582 in last 12 months) | Lemonade: higher rank (#13,385) but property/casualty-led, Trustpilot 4.2 from 7,340. Ladder: rank #140,403. |
| Human-assisted, free-to-the-customer broker | **Policygenius** (US) | Life-first; best-documented "how we make money / licensed / real person" FAQ and disclosures page; Trustpilot 4.5 from 5,920 | Insurify: stronger numbers (rank #10,857, Trustpilot 4.7 from 17,701) but auto-led and page blocked (403), so not analysable. SelectQuote: Trustpilot 4.5 from 12,592, rank #219,279, call-centre model. Policygenius.com's low rank (#157,558, down 36.6% month on month) may be split with its visit.policygenius.com subdomain (search snippet, UNVERIFIED). |
| Free adviser-matching quiz, advisers pay (closest business model) | **Unbiased** (UK) | Purest example of the SortMyCover model; Trustpilot 4.5 from 12,534; rank #217,902 (UK #10,724) | SmartAsset AdvisorMatch: more traffic overall, but it is a tab on a calculator site and Trustpilot is 4.0 from 43. VouchedFor: rank #654,327. Zoe Financial: rank #2,147,478. |

South African reference only (not in the five):

| Site | Global rank (ZA rank) | What it adds |
|---|---|---|
| Discovery | #9,215 (ZA #88) | Footer states legal entity, registration number and credit-provider number; phone with opening hours; "speak to your financial adviser" routing |
| Hippo.co.za | #134,189 (ZA #1,411) | FSP number in the footer; one-line "partners pay us a referral fee, so comparing is free" explanation; Feefo rating badge; no visible phone or WhatsApp |
| Dial Direct | #631,511 (ZA #7,365) | HelloPeter 4.7 shown twice (the SA review norm); own FSP number plus the underwriter's FSP number; `Let us call you` callback form in the hero |

---

## 2. The five, one by one

### 2.1 Compare the Market (UK): trust and disclosure benchmark
Evidence it is a leader: Similarweb Sep 2026 global #3,858, UK #131; 8.86 pages/visit; Trustpilot 4.9 from 148,077. FCA-authorised for insurance distribution (FRN 778488, per FCA register listing and search snippets). Page fetch was blocked, so layout claims below are from snippets and are UNVERIFIED as to placement.
- Seen: a Trustpilot rating with a count and an "as of" date; a market-coverage statement (more than 662 providers, 1,296 products on the panel); a statement that results are ordered by price paid, not by what CTM earns; a published money model (flat fee, percentage commission, or share of a partner's commission); the FRN in the footer; about-us, "how we operate" and "why use a comparison site" pages; permanent life-cover segment pages (over-50s, joint, family, level term, mortgage protection) and a 4-minute needs calculator.
- Why the disclosure design exists: the CMA's 2017 market study (pre-2024) set "CARE" principles for comparison tools, including being clear about how they make money, how many deals are shown, and how results are ordered.
- Copy: dated rating with a count; one plain page on "how we operate"; a coverage statement (for SortMyCover this becomes "we do not compare or rank anyone"); segment pages under the main domain.
- Avoid: price-led titles (life results titled `from £3.52`), quote CTAs, ranking, the calculator. FAIS verdict: NOT ALLOWED for quotes, ranking, price claims and calculators; ALLOWED for the disclosure pages and segment explainers.

### 2.2 NerdWallet (US): content hub and editorial trust
Evidence: global #2,756; 2.83 pages/visit, 54.3% bounce (content-led, so high bounce is expected); Trustpilot 3.4 from 3,581 (low; cause UNVERIFIED).
- Seen (life-insurance hub and one article, fetched 2026-10-10): an advertiser-disclosure block near the top of the page; separate pages for editorial guidelines, star-rating methodology (four scored areas) and advertiser disclosure; each article shows author, editor and a named expert reviewer with credentials, an "Updated" date (29 May 2026 on the article checked), a fact-checked badge and an "On this page" contents list. The hub has category cards, tools, learn-more guides, "dive deeper" topics, reasons to buy and latest news. Primary CTA is a "compare rates" button, shown twice.
- Copy: disclosure above the fold of every educational page; named, credentialed, dated authorship; hub structure; editorial-standards page.
- Avoid: star ratings, "best of" lists, insurer reviews, compare CTA. FAIS verdict: NOT ALLOWED for ratings, best-of and compare; ALLOWED-IF for bylines and reviewer (Section 4, row 33).

### 2.3 Ethos (US): speed and low-friction funnel
Evidence: ethoslife.com global #30,490; 7.94 pages/visit; 25.2% bounce; Trustpilot 4.9 from 7,727 (92% five-star, 4,582 reviews in the last 12 months, replies to 99% of negative reviews). Pages blocked (403); details are from search snippets and third-party reviews.
- Seen: a three-step explainer (get a quote, apply, get covered) with a stated time promise (ethos.com snippet says about 10 minutes; third-party reviews say about 5, so the current figure is UNVERIFIED); no medical exam; a dedicated "How do I know Ethos is legit?" page citing licences, BBB A+ and carrier credentials; a reviews page; rate-by-age and versus-competitor pages; a learning centre.
- Copy: a plain "is this legit?" page; a stated time promise; a steady flow of fresh reviews (4,582 in 12 months shows reviews are actively requested, which SortMyCover can do after real, consented calls); a three-step explainer.
- Avoid: rate tables, versus pages, carrier/insurer names, instant-decision application. FAIS verdict: NOT ALLOWED (these are product marketing and intermediary acts by a licensed agency).

### 2.4 Policygenius (US): free, human, licensed, and says so
Evidence: Trustpilot 4.5 from 5,920 (homepage says 4.7 from 5,775+, a different snapshot), Google 4.6 from 1,200+ (self-reported). Low Similarweb rank, see Section 1.
- Seen (homepage, life-insurance page, disclosures page, one explainer; homepage numbers confirmed on two fetches): headline about a "human approach"; first step is a tap to choose insurance type; four-step "how it works" (type, about you, connect to licensed expert, choose plan); self-reported 30M+ served, $290B+ life cover in force, 320k+ policies placed, human support 363 days a year; a phone number labelled for reaching a licensed expert, in the nav and footer; eight FAQ items that include how it makes money, whether it is licensed, whether the customer pays, and whether they will work with a real person; a disclosures page listing every state licence and explaining that commission is built into the policy price, with a statement that no insurer is favoured because of commission (page updated 18 March 2026); explainer articles written by a licensed agent and reviewed by a named financial planner; a coverage calculator (date of birth, income, dependants, debt, savings in; a recommended amount and term out).
- Copy: the same five trust questions (how do you make money, are you licensed or who regulates you, do I pay, will I speak to a real person, are you owned by an insurer); a visible human-support line; a how-it-works strip; a disclosures page with the compensation explanation.
- Avoid: quote CTAs, the calculator, "policies placed / coverage in force" stats (they tie the brand to policy conclusion), "no insurer favoured" claims (SortMyCover compares nothing). FAIS verdict: NOT ALLOWED for quotes, calculator, and policy-conclusion stats; ALLOWED for the FAQ set, human-support line and how-it-works.

### 2.5 Unbiased (UK): the nearest business model
Evidence: Trustpilot 4.5 from 12,534 (63% five-star, 717 in last 12 months); global #217,902; 49.7% bounce; 2.33 pages/visit. Self-reported: 10M+ people helped, 27,000 professionals.
- Seen: headline about clear honest advice from an expert adviser; CTAs `Get matched now` and `Take our 2 minute quiz`; a three-step strip (answer questions, get matched, free consultation with the adviser contacting within about 24 hours); free to the consumer, advisers pay Unbiased a subscription plus a per-lead fee (adviser-side pricing not verified, old trade-press figures only); a six-question FAQ (cost, choice of adviser, location, response time, data security, adviser benefits); five guide categories and nine tools including calculators, checklists, a retirement quiz, a cost-of-advice tool and a glossary. Review write-ups say the quiz asks service type, sums involved and a short situation, then name, phone and postcode **last**, and that matched advisers show qualifications, reviews and response ratings.
- Regulatory structure (verified on its terms page): Unbiased Group Services Limited (FRN 980150) is an **appointed representative of an FCA-authorised principal (Richdale, FRN 769876)** for lead generation and introductions in mortgages, insurance and investments. The closest working model to SortMyCover sits inside a licensed firm's permissions.
- Copy: time-promise CTA; three-step strip; contact details last; consumer-free / adviser-pays explanation; checklists, glossary; adviser answers within a stated time.
- Avoid: pre-booking adviser profiles unless the adviser's firm consents (Section 4, row 11); any claim to be unbiased or whole-of-market. FAIS verdict: mostly ALLOWED-IF, but the structure itself is an ASK (Finding 2).

---

## 3. Findings (12, highest impact first)

**F1 (high). The leaders' conversion engine is a licensed activity; SortMyCover must not copy their CTA or results page.**
Compare the Market is FCA-authorised; Policygenius states it is a licensed independent broker with state licences; Hippo states it is an authorised FSP (number in footer). Their primary CTAs are get-quotes / compare / apply. Under FAIS, "advice" is any recommendation, guidance or proposal of a financial nature, and the carve-out for factual advice is narrow (procedure, product description, routine administrative queries, objective information, promotional material). In *Raspberry Academy v Oaksure* [2026] ZAGPJHC 388 (14 Apr 2026) a lead generator paid a percentage of premium on policies concluded, which also marketed the product and obtained consent, was held to render an unlicensed intermediary service. Commentary agrees labels do not decide it and a flat-fee, mechanical contact hand-over may stay outside, but one commentator treats "warming a lead" by marketing as crossing the line. SortMyCover does collect consent, pre-qualify and book, so it should design so that no page markets a product.
Implication: outcome CTAs only ("book a free 30-minute call"); no results page that prices, ranks or recommends; the quiz routes, it does not assess; ask the practitioner to review the live site and quiz.

**F2 (high). The closest model, Unbiased, runs lead generation as an appointed representative of a licensed principal.**
Free to consumers, advisers pay, quiz then match then adviser contact in about 24 hours; Trustpilot 4.5 from 12,534. Its footer says it is an appointed representative for lead generation and introductions.
Implication: copy the consumer-facing flow. Put one question to the practitioner: does SortMyCover stay a flat-fee outside-FAIS marketer, or operate under a licensed FSP's representative appointment? The answer changes what the site may show (for example named advisers, product detail).

**F3 (high). Every one of the five explains "free / how we make money" in at least two places; SortMyCover has the page but not the placement.**
MoneySuperMarket puts a two-sentence version on the homepage; Policygenius has an FAQ and a disclosures page; NerdWallet puts the disclosure at the top of each article; Unbiased states "no charge" at the CTA; the CMA's CARE principles ask comparison sites to be clear about how they make money. SortMyCover's `how-we-make-money.html` is good, but the homepage hero, quiz consent step and FAQ do not carry a one-line version.
Allowed: yes. Wording constraint: state "advisers pay a flat fee; it is the same whether or not you buy". Do not copy Hippo's "fee if you accept a policy" (contingent, Raspberry risk) or any "unbiased / independent / whole-of-market" claim.

**F4 (high). The leaders' quiz pattern is low-effort first, contact details last, time promise on the button, working Back and edit.**
Unbiased: `2 minute quiz`, 3-step strip, name/phone/postcode last. Baymard (25 Aug 2026; 220 sessions, 20 insurance sites): friction in quote flows compounds abandonment (no way to edit, broken Back, surprise changes); early eligibility screening saves wasted effort. NN/g wizard guidance (June 2017, pre-2024): show step position, descriptive button labels. Multi-step lift figures online (for example 11% to 46% on one financial lead site) are first-party blog tests, UNVERIFIED. Unbounce 2024 (57M conversions): insurance median 18.2%, top performers around 20.6%; these are form conversions, not qualified bookings.
Implication: the current 5-tap quiz already follows this. Add a step counter, outcome-named buttons ("Book my call" instead of a bare Next), an edit-answers review step, and keep the contact fields last. Allowed-if: questions only route; the "not a fit" screen must not give guidance.

**F5 (high). Above the fold, the leaders carry seven things; SortMyCover's hero carries four.**
NN/g (2018, pre-2024; 120 people, 130,000+ fixations): 57% of viewing time is above the fold, 74% in the first two screens. Policygenius, Unbiased and MoneySuperMarket each show outcome headline, one CTA, a free statement, a trust number or rating, and a human or contact route. SortMyCover's hero has headline, lead, CTA and three chips.
Missing: how it is paid (one line), who is behind it (company name), a human contact route (WhatsApp or email), and a way to verify the adviser (FSCA lookup). A rating or count is missing and must stay missing until it is real.

**F6 (high). Legal identity, regulator status and a "is this legit?" route sit in the footer or a dedicated page on every leader; SortMyCover's footer has none of them.**
CTM shows its FRN; Unbiased shows both FRNs and the principal; Hippo shows its FSP number; Discovery shows registration and credit-provider numbers; Dial Direct shows its own and its underwriter's FSP numbers; Ethos has a dedicated legitimacy page. SortMyCover's company name, registration number and address appear only in `terms.html`; the footer on other pages points to Messenger only. ECTA s43 (2002, pre-2024) asks online suppliers to publish legal name, registration number, office-bearers, physical address, phone and email; its application to a free service is ASK.
Rule: SortMyCover is not an FSP, so the footer must say that and must **not** show an FSP number as if it were its own. Add the FSCA register link so a visitor can check any adviser. The FSCA warns about impersonation; its public lookup is the cheap trust device.

**F7 (medium). Human presence is a phone or WhatsApp line, not an adviser portrait.**
Policygenius shows a phone number labelled for a licensed expert and `363 days a year` of human support; Discovery shows a phone number with hours; Dial Direct puts a callback form in the hero; Hippo has no visible phone or WhatsApp, a gap. Unbiased shows adviser profiles, but only after matching. MASTER-PROMPT 1.2 keeps the broker unnamed until the first WhatsApp.
Allowed: a SortMyCover support line (WhatsApp click-to-chat plus hello@sortmycover.co.za) is ALLOWED if staff never advise. Named adviser profiles before booking are ALLOWED-IF the adviser's firm consents and its FSP number appears with it; that contradicts the broker-neutral decision, so do not build it without Jonathan's call.

**F8 (medium). Social proof on the leaders is dated, counted and third-party; SortMyCover has none yet and must not fake it.**
CTM states its rating with count and an as-of date; Policygenius shows Trustpilot and Google counts; Dial Direct shows HelloPeter twice; Ethos collected 4,582 reviews in 12 months. Baymard (Aug 2026) finds external validation raises confidence in less-known brands. Policygenius's "policies placed" and "coverage in force" headlines tie the brand to policy conclusion and should not be copied.
Plan: show no rating until real; replace with verifiable facts (company number, 48-hour complaints SLA, flat-fee page, FSCA lookup); after real calls, ask consenting participants for Google/HelloPeter reviews; only ever publish "calls booked" style stats that are true.

**F9 (medium). All four non-SA comparators feature a life-cover calculator that outputs an amount; SortMyCover cannot.**
Policygenius's takes date of birth, income, dependants, debt and savings and returns a recommended amount and term; CTM has a 4-minute needs calculator; MoneySuperMarket and NerdWallet list one. A recommended cover amount is advice. NOT ALLOWED.
Allowed substitutes: a "what to bring to your call" checklist, a plain-English explainer of the cover gap with no user-specific figures, and a glossary. The `2-4x salary` line in the current pages is flagged in `verified-facts.md` as prompt-level only; do not lean on it for a tool.

**F10 (medium). The leaders' information architecture is hub, guides, tools, trust pages, with credentialed, dated authorship; SortMyCover has six articles and no tools or glossary.**
NerdWallet hub sections and bylines; Unbiased five guide categories and nine tools (checklists, glossary, quiz); Policygenius explainers by a licensed agent with a reviewer. Google (page updated 5 Oct 2026): trust is the most important of the E-E-A-T qualities; for money topics show who wrote it, how it was made (disclose automation) and why.
Allowed: educational hub, glossary, checklists, "how we write and check" page, "updated" dates. ALLOWED-IF the reviewer is not a broker SortMyCover routes leads to (serp-plan NH-30 D). NOT ALLOWED: best-of lists, star ratings and methodology, insurer reviews, versus pages.

**F11 (medium). Segment and life-event pages live permanently under the main domain on the leaders, with no price in the page body.**
CTM's life segment pages sit in folders of the main domain (over-50s, joint, family, level term); its titles carry a price, which SortMyCover cannot. This maps onto SortMyCover's campaign pages (new-baby, turned-40, self-employed and so on).
Implication: educational segment pages are ALLOWED; price, "from", "cheap" and product names are NOT. For organic evergreen angles prefer folders on the apex domain; use subdomains only for paid-campaign variants. Checking the apex-vs-subdomain SEO effect is outside this lens (UNVERIFIED).

**F12 (low-medium). Mobile and WhatsApp are the default channel in South Africa, and the leaders keep scripts light.**
DataReportal: 51.7 million internet users in SA (79.6%), October 2025. A search summary of the 2026 reports gives WhatsApp use at 92.5% of internet users and mobile at 72.7% of web traffic; the primary page did not show those two numbers (UNVERIFIED). Google/Deloitte (2020, pre-2024): a 0.1-second faster mobile site cut lead-gen bounce 8.3% across 37 brands. Hippo shows neither phone nor WhatsApp on its homepage.
Implication for Motion: use it only for functional motion (step transitions, progress, accordion, reveal), self-hosted under the `'self'` CSP, small, and off under `prefers-reduced-motion`.

---

## 4. Pattern matrix with FAIS verdicts

Source column = where the pattern was seen.

**A. Content that must be visible**

| # | Pattern | Seen on | FAIS verdict | SortMyCover action |
|---|---|---|---|---|
| 1 | Outcome headline plus one primary CTA above the fold | All five | ALLOWED | Keep; make the CTA name what happens (a call), not an assessment |
| 2 | "Free to you" next to the CTA | MoneySuperMarket, Unbiased | ALLOWED | Add to hero and consent step |
| 3 | One-line how-we-make-money above the fold plus full page plus FAQ | MSM, Policygenius, NerdWallet, Unbiased | ALLOWED | Wording: flat fee, same whether or not you buy |
| 4 | Legal identity block (name, reg no., address, phone, email) in footer | CTM, Unbiased, Discovery, Hippo | ALLOWED (also expected under ECTA s43; applicability ASK) | Add to footer of every page |
| 5 | Regulator / FSP number | CTM, Unbiased, Hippo, Dial Direct | ALLOWED-IF it is true: SortMyCover is **not** an FSP, so show "not a financial services provider", never an FSP number | State the adviser's FSP number only in the WhatsApp intro or on the call |
| 6 | Link to the regulator's public register | Unbiased (FCA wording), SA norm | ALLOWED | Link FSCA lookup: "check any adviser" |
| 7 | "Is this legit?" page | Ethos | ALLOWED | Merge About, complaints and fee page into one trust hub section |
| 8 | Trust FAQ set (money, regulated, pay?, real person?, owned by insurer?) | Policygenius | ALLOWED | Add to home and quiz pages |
| 9 | Dated rating with review count | CTM, Policygenius, Dial Direct | ALLOWED-IF real and from consented participants | None until real |
| 10 | Named testimonials | Policygenius, Discovery | ALLOWED-IF real, consented, no product/insurer/premium in the text | None until real |
| 11 | Adviser name, photo, qualifications before booking | Unbiased | ALLOWED-IF adviser's firm consents and FSP number shown; conflicts with broker-neutral rule | Do not build without Jonathan's decision |
| 12 | Human support line (phone, WhatsApp) | Policygenius, Discovery, Dial Direct | ALLOWED-IF staff never advise | Add WhatsApp support link plus email |
| 13 | "Policies placed / coverage in force" counters | Policygenius | NOT ALLOWED in spirit (ties brand to policy conclusion; Raspberry causal-link risk) | Never |
| 14 | Complaints route with a stated reply time | Ethos (BBB), SortMyCover already | ALLOWED | Keep; link from footer |
| 15 | Privacy / consent summary beside the form | Unbiased | ALLOWED and required (POPIA s69 opt-in) | Keep verbatim consent from `consent.json` |

**B. Layout and conversion**

| # | Pattern | Seen on | FAIS verdict | SortMyCover action |
|---|---|---|---|---|
| 16 | Hero: headline, sub, single CTA, 3 chips | Policygenius, Unbiased | ALLOWED | Keep |
| 17 | Three-step "how it works" strip | Ethos, Unbiased, Policygenius | ALLOWED | Add: pick answers, book a time, talk to an adviser |
| 18 | Multi-step tap-card quiz | Unbiased, Policygenius | ALLOWED-IF questions only route and the end state gives no guidance | Keep |
| 19 | Step counter and progress | NN/g, Baymard | ALLOWED | Add "Question 2 of 5" |
| 20 | Descriptive button labels, Back, edit answers | NN/g, Baymard | ALLOWED | Add review-your-answers step |
| 21 | Contact details last | Unbiased | ALLOWED | Keep |
| 22 | Time promise on the CTA | Unbiased, Ethos | ALLOWED | Keep "60 seconds"; make sure it is true |
| 23 | Callback form in the hero | Dial Direct | ALLOWED-IF POPIA consent | Same as the booking step |
| 24 | Sticky mobile CTA | Common | ALLOWED | Keep |
| 25 | "Get quotes", "Compare", "Apply" CTAs | Policygenius, CTM, Hippo, NerdWallet, Ethos | NOT ALLOWED | Never |
| 26 | Price-led titles, rate-by-age tables | CTM, Ethos | NOT ALLOWED | Never |
| 27 | Instant-decision application | Ethos | NOT ALLOWED (intermediary act) | N/A |
| 28 | Urgency timers, scarcity | Not seen on the five | ALLOWED but avoid (CMA "Responsible"; raises the "warming" risk) | Do not add |

**C. Page types and information architecture**

| # | Pattern | Seen on | FAIS verdict | SortMyCover action |
|---|---|---|---|---|
| 29 | Learn hub of generic educational guides | All | ALLOWED (no product marketing) | Group the six articles into categories |
| 30 | Life-event / segment pages | CTM | ALLOWED if no price or product | Align with campaign pages |
| 31 | Glossary of terms | Unbiased | ALLOWED (objective description of terms) | Add; no insurer-specific entries |
| 32 | Checklists ("what to bring") | Unbiased | ALLOWED | Add |
| 33 | Byline, editor, credentialed reviewer, "updated" date | NerdWallet, Policygenius | ALLOWED-IF reviewer is not a broker we route to | Add "How we write and check" page; disclose any AI help |
| 34 | Needs calculator returning an amount | Policygenius, CTM, MSM, NerdWallet | NOT ALLOWED (advice) | Never |
| 35 | Cost-of-advice tool | Unbiased | ASK | Defer |
| 36 | Rankings, star ratings, methodology | NerdWallet | NOT ALLOWED | Never |
| 37 | Insurer reviews and versus pages | NerdWallet, Ethos | NOT ALLOWED | Never |
| 38 | Editorial standards and advertiser-disclosure pages | NerdWallet | ALLOWED | Fold into "How we make money" and the writing page |

---

## 5. Gap check of the current SortMyCover site against the benchmark

From `landing/holding/` and `landing/template/index.html` as read on 2026-10-10.
1. Home hero has headline, lead, CTA, chips. Missing: how paid (one line), company name, human contact route, regulator lookup.
2. `about.html` defers to the privacy and terms pages for who is responsible; company name, registration number and address appear in `terms.html` only. Footer has no identity block.
3. Contact is Facebook Messenger only. The brief names hello@sortmycover.co.za and a WhatsApp assistant exist; neither is in the footer.
4. Trust FAQ on the home page covers the cover gap, the call, what SortMyCover does and does not do, who is behind it, and data. It does not answer "how do you make money" or "do I pay" on that page (the link is in the footer).
5. Learn hub has six articles; no categories, glossary, checklists or "how we write" page.
6. Quiz CTA reads "Check my cover in 60 seconds". The output of the quiz is a booked call, not a check of cover. Flag for compliance-qa (misleading-claim and advice-adjacent risk); the leaders name the real outcome (match, call).
7. Quiz template has Back/Next and tap cards; no step counter and no answer review.
8. Template text shows "Typical work cover 2-4x salary", flagged in `verified-facts.md` as prompt-level only. Do not extend it into a tool until sourced.

## 6. What to build first (evidence order, FAIS-safe)
1. Footer identity block plus FSCA lookup link plus "not a financial services provider" line, on every page.
2. One-line fee explanation in the hero and consent step; five-question trust FAQ on the home page.
3. Quiz: step counter, named buttons, review step. Keep contact last.
4. Learn hub: categories, glossary, checklists, "How we write and check" page.
5. WhatsApp support link and email in header or footer.
6. Ratings and testimonials only after real, consented calls.

## 7. Sources (all fetched or searched 2026-10-10 unless a date is given)

Traffic (Similarweb, data month Sep 2026): policygenius.com, nerdwallet.com, ethoslife.com, lemonade.com, moneysupermarket.com, comparethemarket.com, hippo.co.za, unbiased.co.uk, smartasset.com, ladderlife.com, selectquote.com, vouchedfor.co.uk, zoefinancial.com, insurify.com, dialdirect.co.za, discovery.co.za, all under `https://www.similarweb.com/website/<domain>/`.
Reviews (Trustpilot): `https://www.trustpilot.com/review/` plus policygenius.com, ethoslife.com, nerdwallet.com, lemonade.com, www.unbiased.co.uk, hippo.co.za, smartasset.com, selectquote.com, insurify.com, ladderlife.com, vouchedfor.co.uk; and `https://uk.trustpilot.com/review/www.comparethemarket.com`, `.../www.moneysupermarket.com`.
Site pages: https://www.policygenius.com/ · https://www.policygenius.com/life-insurance/ · https://www.policygenius.com/about/disclosures/ (updated 18 Mar 2026) · https://www.policygenius.com/life-insurance/life-insurance-broker/ · https://www.nerdwallet.com/insurance/life · https://www.nerdwallet.com/insurance/life/learn/what-is-term-life-insurance (updated 29 May 2026) · https://www.nerdwallet.com/advertiser-disclosure · https://www.nerdwallet.com/nerdwallet-editorial-guidelines · https://www.moneysupermarket.com/ · https://www.unbiased.co.uk/ · https://www.unbiased.co.uk/legals/terms-of-use · https://www.nutsaboutmoney.com/reviews/unbiased (18 Jan 2026) · https://www.hippo.co.za/ · https://www.discovery.co.za/life-insurance · https://www.dialdirect.co.za/ · https://www.ethos.com/ (search snippets only) · https://www.comparethemarket.com/ (search snippets only).
Research and regulation: https://baymard.com/research-articles/insurance-ux-research-launch (25 Aug 2026) · https://baymard.com/audits/insurance · https://unbounce.com/conversion-benchmark-report/finance-insurance-conversion-rate/ (2024 edition) · https://www.nngroup.com/articles/scrolling-and-attention/ (2018, pre-2024) · https://www.nngroup.com/articles/wizards/ (25 Jun 2017, pre-2024) · https://ventureharbour.com/multi-step-lead-forms-get-300-conversions/ (updated 4 Apr 2026; vendor blog) · https://developers.google.com/search/docs/fundamentals/creating-helpful-content (updated 5 Oct 2026) · https://www.gov.uk/cma-cases/digital-comparison-tools-market-study (26 Sep 2017, pre-2024) · https://www.tradingstandards.uk/news-policy-campaigns/news-room/2017/cma-publish-study-on-price-comparison-services/ (2017) · https://web.dev/case-studies/milliseconds-make-millions (2020, pre-2024) · https://datareportal.com/reports/digital-2026-south-africa (Oct 2025 data).
FAIS and lead generation: https://www.saflii.org/za/cases/ZAGPJHC/2026/388.html (14 Apr 2026; could not be opened, cited via commentary) · https://www.moonstone.co.za/referral-fees-and-fais-when-a-lead-becomes-intermediation/ (18 May 2026) · https://www.fanews.co.za/article/legal-affairs/10/general/1120/cautionary-tale-of-illegal-commission/43949 (14 May 2026) · https://www.moonstone.co.za/when-does-a-lead-become-intermediation-four-views-on-a-judgment/ (23 Sep 2026) · https://www.cliffedekkerhofmeyr.com/en/news/publications/2026/South-Africa/Corporate-Commercial/corporate-commercial-alert-5-august-is-your-lead-generation-model-about-to-become-illegal (5 Aug 2026; fetch blocked, search summary only) · https://www.fanews.co.za/article/legal-affairs/10/general/1120/when-does-conduct-constitute-financial-advice/26744 (20 May 2019, pre-2024) · https://www.moonstone.co.za/court-rules-on-fais-act-exception-argument-in-dispute-over-commission/ (29 Aug 2024) · https://www.horizoncompliance.co.za/complianceblog/fais-and-adverts (undated) · https://www.fsca.co.za/FSB-Search/ (FSCA public lookup, from search result) · https://www.internet.org.za/ect_act.html (ECTA s43, 2002, pre-2024) · https://www.cliffedekkerhofmeyr.com/en/news/publications/2025/Sectors/Technology-Communications/Technology-and-Communications-Alert-29-january-Navigating-the-Information-Regulators-guidance-note-on-direct-marketing (29 Jan 2025; POPIA s69 guidance).
Context: https://coverager.com/massmutual-to-shut-down-haven-life-by-the-end-of-the-year/ (Haven Life stopped taking applications 3 Jan 2024, so it is excluded) · https://www.carriermanagement.com/news/2023/04/26/247646.htm (Zinnia acquired Policygenius, Apr 2023).

## 8. Gaps and UNVERIFIED
- Above-the-fold layout of Compare the Market, Ethos, Lemonade and Insurify was not seen (403). Claims about them come from snippets and third-party reviews.
- The judgment text and the FAIS Act text (section 1(1), 1(3)(a)) could not be read directly (blocked or scanned-image PDF). The FAIS reading rests on law-firm summaries; the practitioner must check the Act and the judgment.
- No FSCA guidance specific to lead-generator websites was found. The only authority located is the Raspberry judgment and commentary, which disagree on how far "warming a lead" goes.
- MoneySuperMarket's homepage showed a Trustpilot count (562,774) that does not match its Trustpilot profile (62,776); I used the profile.
- Whether Policygenius's low rank reflects traffic split with a subdomain is a search-snippet inference.
- No conversion data published by any of the five; vendor-blog lift figures are UNVERIFIED in magnitude.
- WhatsApp penetration and mobile traffic share for SA come from a search summary, not the primary page.
- Motion or animation use on the five sites was not checked (needs a real browser).
