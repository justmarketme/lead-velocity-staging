# DRAFT - research for writers and the attorney; not legal advice

# Compliance (South Africa): what the SortMyCover website and ads may say

Lens: compliance-sa. Researched 10 Oct 2026. Builds on `deliverables/contracts-drafter/lead-generation-agreement/research-memo.md` (5 Oct 2026), which already holds the authorities on *Raspberry Academy v Oaksure* [2026] ZAGPJHC 388, FAIS s1/s7, GCoC s3A/s14, POPIA s11-s72, CPA s5/s11/s17/s48-s54 and ECT s12/s13/s22. Those are not repeated; this file applies them to website and ad copy and adds what the memo did not cover.

Grades: **A** = statute, regulator document, code or court judgment read at source. **B** = practitioner or press report. **UNVERIFIED** = could not read the primary. Anything dated before 2024 is marked **STALE?**. Quotes are short phrases only.

## 0. What is new since the 5 Oct memo

- **NCC opt-out registry launched 7 Oct 2026** (A, NCC statement). Direct marketers register 15 Sep to Dec 2026; cleansing runs Dec 2026 to Apr 2027; consumers can start blocking from May 2027. The memo said no deadline had been announced. See F9.
- **FSCA Regulatory Actions Report 2025/26 read at source** (A, published 3 Aug 2026). The memo had it as UNVERIFIED (press only). Para 24.1-24.3 and the Equitos case are quoted below. See F1 and F2.
- **Information Regulator briefing 31 Aug 2026** (B, ITLawCo report): OUTsurance and MTN telephone-marketing matters are before the Enforcement Committee; the Regulator holds that calls are "electronic communication" under POPIA s69. See F6.
- **ARB Code v2026-04-07 is current** (A). The clauses used below (3.1, 4.1, 4.2, 4.4, 7, 10; Section III 6.1) were re-read in that version.
- **No FSCA standard on lead generation or referral fees found as at 10 Oct 2026** (absence not proven). The COFI Bill was introduced to Parliament on 17 Apr 2026 and is not law (B, Masthead).

## 1. Bottom line for the build

1. The website and ads are **directly regulated even though Lead Velocity is not an FSP**: FAIS s8(9) and s4(3) reach "no person" / "that person" who publishes misleading statements about financial services, and s7(1) catches anyone who "offers to act" as an FSP (F1).
2. The line between a lead-gen site and an intermediary is mostly **what the site does with a person's answers and what it says about cover** (F2). The safest design is: collect, route, book, disclose; never assess, explain, compare or suggest.
3. The three words that carry most legal risk in the current copy are **"free"**, **"independent"/"authorised"** and **any "most people"/"typical" statistic** (F3, F4, F5).
4. Before launch the site needs a **visible identity block, a PAIA manual link, a registered Information Officer, NCC direct-marketer registration** and a correction to the Terms sentence about the opt-out registry (F7-F9).
5. Anything beyond the rules below (named-adviser ads, quiz data beyond age and budget, cookie default) is a **decision for the attorney**, listed in section 8.

---

## 2. Findings (highest impact first)

### F1. FAIS reaches a non-FSP's ads and copy: "offer to act", holding out, and misleading statements (impact: high)
- **Claim.** FAIS s7(1) bars any person from acting *or offering to act* as an FSP without a licence. s8(9)(b) bars any person from doing any act that indicates they render, or are authorised to render, financial services unless authorised. s8(9)(c) bars any person from publishing any statement or advertisement relating to a financial service, a provider's business or a financial product that they know or ought to know is misleading, false, deceptive or contrary to the public interest. s4(3)(a) lets the registrar direct "that person" (the publisher, not only the FSP) to stop or change a misleading advertisement. (A, FAIS Act text, FAIS Ombud copy dated 25 Jun 2018; **STALE?**, check for later amendment. s8(9) text in force since 28 Feb 2014.)
- **FSCA's current stance** (A, Regulatory Actions Report, 3 Aug 2026, para 24.1-24.3): a pure referral limited to introducing a client to a product supplier "typically falls outside licensing", but explaining products, assisting with documentation or onboarding, or engaging with client queries can be intermediary services, judged on substance not label. The Equitos case (R1m penalty, 10-year debarment, Tribunal dismissed reconsideration 15 Jun 2026) shows the sanction. Unauthorised intermediaries "under the guise of referral models" are a stated enforcement priority.
- **Implication.** The brand name "SortMyCover", the tagline "Sort your cover", and the CTA "Check my cover in 60 seconds" (landing template, pixel README row 2) say that SMC itself sorts or checks cover. That is an "offer to act" and a CPA s41(3)(e)/(j) risk (see F2). The serp-plan decision to avoid Insurance/Broker categories on Google Business Profile is supported by s8(9)(b). Keep the brand; fix the verbs. Suggested CTA: "Answer 5 questions to book a free call" or "Book my free adviser call".

### F2. Personalised output and needs-framing are what turn a quiz into "advice" or "intermediary service" (impact: high)
- **Claim.** FAIS "advice" is a recommendation, guidance or proposal of a financial nature to a **"client"**, and "client" means a specific person or group, **excluding the general public** (A, FAIS s1). A generic article is promotional or factual material (s1(3)(a)(i)(ee)); an analysis without an express or implied recommendation that a transaction suits the person is also excluded (s1(3)(a)(ii)). Once the page responds to *this person's* answers, the "general public" shield is gone. "Intermediary service" requires an act whose result is that a client may enter into a transaction with a product supplier (s1), and the court treated the referrer's consent and "discuss appropriate cover" scripting, "to market" appointment and product control as indicators (*Raspberry* [26]-[29], as pinned in the memo; SAFLII returned HTTP 403 on re-fetch, so pins not re-checked today).
- **What in the current build is at risk** (landing template, 10 Oct 2026):
  - Quiz helper "A bond is usually the biggest thing cover needs to carry" is a needs statement.
  - Budget question "If the numbers made sense, what could you comfortably set aside each month?" implies a price calculation (the approved consent doc uses a neutral version, CP-v0.2 1.4).
  - Out-of-band screen "a call is not the right fit right now" reads as a suitability decision, and for "Under R750" it is a decision about affordability of cover.
  - Hero bars "Typical work cover 2-4x salary" vs "Often much more" present a gap; fine as generic, but must never become a per-person result.
  - The quiz collects bond, dependants and work-cover answers, which goes beyond the "age band + budget band" pre-qualification the agreement describes (memo section 2). Attorney to confirm (Q2).
- **Implication.** Rules S21-S24 below. No score, gap size, "you may be under-insured", or recommended cover; result screens say only booked / not available / thank you.

### F3. "Free" is safe for the call, not for "advice", "review", "check" or "quote" (impact: high)
- **Claim.** ARB Section II 4.4.1 says products (which includes services, Section I 4.23) should not be described as "free" where there is any cost to the consumer. GCoC s14(3)(p)(iii) says an advertisement relating to a financial service must not mislead about cost, "including that it is 'free'" if the client pays directly or indirectly through other costs or charges. CPA s41(1)(b) bars exaggeration, innuendo or ambiguity on a material fact and omission that amounts to deception (A: ARB v2026-04-07; GCoC as amended by BN 706 of 2020, effective 26 Dec 2020; CPA text).
- **Why it bites here.** The call *is* free. But if the person later buys, the adviser is paid by commission or fee, which is an indirect cost built into the product; GCoC s7(1)(c)(vi) requires the adviser to disclose that. "Free cover check" (Terms s2, angle c13-check-not-buy) and "free advice" describe the adviser's service as a whole and can read as "no one gets paid". "No commission, ever" on the How we make money page is true of SMC but, unscoped, can be read as covering the adviser.
- **Implication.** Say "The call costs you nothing". Scope every "no commission" line to SortMyCover. Add one balanced sentence: "If you later choose a product, your adviser tells you how they are paid." (S13-S14.)

### F4. Status words: "independent", "authorised", "licensed", "regulated", "panel" and the FSCA logo (impact: high)
- **Claim.** GCoC s3(4)(a) bars a provider from indicating or implying FSCA authorisation or supervision for business it does not have; s3(5) bars a provider from describing itself or its services as "independent" if it or an associate owns a product supplier (or vice versa), receives a financial interest from a supplier beyond the listed categories, or has any other material conflict. CPA s41(3)(a) bars falsely implying any status, affiliation, connection, sponsorship or approval. The FSCA FAQ answers "May I use the FSCA logo ... to signal ... authorised?" with "No" (A, accessed 10 Oct 2026). GCoC amendments of 2 Dec 2022 did not touch s14, s3(5) or s3A (B, Moonstone).
- **Implication.**
  - SMC and Lead Velocity must never be called licensed, authorised, approved, registered with or regulated by the FSCA, and no FSCA logo may appear anywhere.
  - "Independent adviser" may be used only for an adviser who has confirmed in writing that s3(5) allows it; SMC is paid by the advisers and should not call itself independent. "Not an insurer, not owned or paid by any insurer" is the safer form, if true.
  - With one adviser live (named mode), "panel", "network", "matched with the best adviser", "compare advisers" are false (CPA s41(1)(a)). The site already says "one adviser"; keep it.
  - Verify the adviser on the FSCA register and confirm the licence covers risk-only life (long-term insurance subcategory B1 per B-grade sources; **UNVERIFIED** against the Determination).

### F5. Statistics need a named source and date; the "2-4x salary" claim has only a 2007 source (impact: high)
- **Claim.** ARB Section II 4.1.1 requires documentary evidence in hand *before* publication for all direct or implied claims capable of substantiation; 4.1.2 requires it to be up to date and of market relevance; 4.2.5 bars statistics presented as more valid than they are. GCoC s14(3)(b) (a provider duty, good practice here) requires the source and date for statistics. (A.)
- **Evidence found.** The only citable primary I found is Treasury-commissioned research (Genesis Analytics, v1.1, 17 Oct 2007; **STALE?**) that reports group death benefits of 2-3x salary and an average of 3.2x (Sanlam Survey 2006; Anderson 2007). That is 19 years old and not "2-4x". `verified-facts.md` row 17 still has no URL. The claim appears in the hero bars, the employer-gap angle, the home FAQ ("often only a few times"), and the learn pages ("about two to four times salary").
- **Implication.** Until a current source is filed, use a hedged form that the reader can check themselves: "Work cover is often a multiple of your yearly salary. Your benefits statement shows yours." Any figure goes in with source and month. Hooks that make the number the headline (C01 / employer-gap) wait for the source.

### F6. Direct-marketing consent must cover calls and the web trackers the Regulator already treats as electronic marketing (impact: high)
- **Claim.** The Information Regulator's Direct Marketing Guidance Note (3 Dec 2024, A, advisory) lists telephone calls and "use of cookies" among s69 electronic methods (para 7.1(a), (h)); requires consent via Form 4 or substantially similar (7.2.3) with the responsible party carrying the onus; treats sharing contact details with another responsible party as s15/s18 further processing (10.1); and says non-compliance in lead generation is a breach (10.4). The cookie item's footnote cites UK ICO and EU Working Party sources, so SA has no cookie-specific rule (A). At the 31 Aug 2026 briefing the Regulator maintained that calls fall under s69 and referred OUTsurance and MTN to the Enforcement Committee; court resolution is expected (B, ITLawCo, 28 Sep 2026).
- **Implication.** The consent line must keep naming WhatsApp, calls, SMS and email (CONSENT-INTRO-v2 does). Calls by the adviser are the exposed channel. Pixel and CAPI design is covered in `meta-pixel-capi.md` F1-F3, F7 and not repeated; this file only adds that, on the Regulator's own list, the default "Pixel on at load with no pop-up" is the weakest position and `SMC_CONSENT_ANALYTICS=false` until opt-in is the conservative one.

### F7. A visible identity and contact block is a legal baseline, not a nicety; the holding About page hides the company (impact: medium)
- **Claim.** ECT Act s43(1) lists what a supplier offering goods or services by electronic transaction must show on the site: full name and legal status, physical address and telephone number, website and email address, registration number, office bearers and place of registration, the address for service of documents, any self-regulatory body or code, the terms, and the privacy policy (A, Act 25 of 2002 as gazetted; whether s43 binds a free service is arguable, see Q4). CPA s41(3)(j) covers falsely stating that a communication is for a particular purpose.
- **Current state.** `about.html` says "The privacy notice and the terms name the company" instead of naming it; the Terms page holds the name, number, address and phone; the complaints page has only Messenger and WhatsApp; the FAIS Ombud (A, accessed 10 Oct 2026) hears complaints against authorised FSPs and representatives, so it is the route for the *adviser*, not for SMC. For SMC the routes are the NCC (CPA), the Information Regulator (POPIA) and the ARB (advertising).
- **Implication.** Put the block (Lead Velocity (Pty) Ltd, registration number, physical address, phone, hello@ email, directors' names) in the footer of **every** page including each campaign subdomain, and give the complaints page the three escalation routes. The registration number shown in Terms (2025/637858/07) was not checked against CIPC (**UNVERIFIED**).

### F8. PAIA manual and a registered Information Officer are due before launch (impact: medium)
- **Claim.** From 1 Jan 2022 every private body, including every company, must have a PAIA manual; at minimum it must be freely available on the body's website, at its principal place of business and to the Regulator on request (A, Information Regulator PAIA Guide, 5 Sep 2021, paras 9.2.2.2 and 9.2.4; **STALE?** but statutory). The Regulator's Guidance Note on Information Officers (1 Apr 2021) says an Information Officer takes up duties only after registration (POPIA s55(2)). At the 31 Aug 2026 briefing the Regulator called registration "the first thing an assessment looks for" and said inaccessible manuals need immediate remediation (B, ITLawCo).
- **Current state.** Nothing in `landing/holding` links a PAIA manual; the Terms name an Information Officer and Deputy; registration status is "planned" in MASTER-PROMPT.
- **Implication.** Add "PAIA manual" to the footer on every page; confirm registration before the first ad.

### F9. The NCC opt-out registry is not yet operational for consumer blocks; Terms s6 promises more than can be done today (impact: medium)
- **Claim.** NCC statement, 7 Oct 2026 (A): Phase 1, direct marketers register from 15 Sep 2026 until Dec 2026, and failing to register afterwards "may constitute a contravention of section 11" read with the CPA Amendment Regulations 2026; Phase 2, free cleansing from Dec 2026 to Apr 2027; from May 2027 consumers can pre-emptively block marketers.
- **Current state.** Terms s6 (TU-v1.0) says "You can also join the National Consumer Commission opt-out registry. We check our records against it every month." and that a block "always wins". The first part is a promise about a process that cannot run until the cleansing phase; the memo's R12 position (a block overrides earlier consent) is the NCC position as reported by Bowmans and Mayet Law (30 May 2026, B) but the Regulations text is still read via secondary sources.
- **Implication.** Reword to the true state ("The NCC is rolling out a national opt-out registry. When it opens to consumer blocks we check it before we message anyone, and a block overrides earlier consent.") and register Lead Velocity as a direct marketer in the Phase 1 window. The adviser registers separately. Registration scope for lead generators is not stated in the statement (**UNVERIFIED**).

### F10. Testimonials, ratings and awards: none until real, then with the ARB and GCoC formalities (impact: medium)
- **Claim.** ARB Section II clause 10: a testimonial must be genuine and based on the person's own experience over a reasonable period (10.1); signed and dated copies must be held for inspection (10.7); fictitious characters must not be framed as real people (10.6); persons depicted need prior express permission (clause 11.1). GCoC s14(12) (provider duty, adopt as practice): genuine opinion and actual experience, properly attributed, pseudonym allowed if stated; any financial interest or compensation disclosed; every endorsement must clearly state it is not financial advice. CPA s41(1). (A.)
- **Implication.** Keep `proof: []` until real, consented quotes exist. Show rating badges only from a third-party platform, with count and date, and never filter who is asked to review. Do not use stock photos or invented first names as "customers". A named-adviser photo needs the adviser's permission.

### F11. No superlatives, comparisons, savings, price anchors, fear or manufactured urgency (impact: medium)
- **Claim.** "Best", "cheapest", "leading", "#1", "trusted by" are objective claims needing a file (ARB 4.1.1); puffery is allowed only where clearly opinion and not objectively checkable (4.2.2). Comparative claims need verifiable, fairly chosen criteria (ARB 7.1) and, for financial services, an independent survey with published method (GCoC s14(10)). Savings and value claims need cash-terms proof (ARB 4.3.1.2). Ads must not play on fear without justifiable reason (ARB 3.1), and must not be designed to exaggerate urgency (GCoC s14(3)(n)). Headlines cannot be rescued by body copy (ARB 4.2.6). The whole-ad test applies (GCoC s14(3)(i)). A premium reference triggers escalation and guarantee disclosure (s14(3)(c)). ARB Section III 6.1 adds that financial advertising must take special care that people understand any commitment they may enter and must not exploit lack of experience or knowledge (with Section II 2.1). (A.)
- **Implication.** No price, "from R", "cheaper", "affordable", "save", cover amount, ranking, or "unlike other sites". Hooks stay on paperwork, life events and the free call. No coffin, orphan or "what if you died tomorrow" imagery. Slot-scarcity messages only if read live from the booking calendar. Subdomain names and slugs are part of the message: avoid quote, compare, cheap, best, rates, claims, fsca, insurer, bank (inference from CPA s41 "words or conduct" and GCoC s14(3)(i); no direct authority).

### F12. The age gate is one footer sentence, and the first quiz band "Under 35" includes minors (impact: medium)
- **Claim.** POPIA s34 prohibits processing personal information of a child (under 18) unless s35 applies, for example prior consent of a competent person (A, popia.co.za). ARB Section II clause 14 requires care with advertisements likely to influence children.
- **Current state.** "You must be 18 or older" appears in the form footer line (FOOTER-v2) and Terms s8; the age question has no 18+ confirmation and the first band is "Under 35".
- **Implication.** Add an "I am 18 or older" element inside the consent step; target ads at adults only (the personas are 35-50); delete a record and stop contact if a minor is identified. Fix is small.

---

## 3. Who is bound by what (so writers know why a rule exists)

| Instrument | Binds | Reaches SMC through |
|---|---|---|
| FAIS Act s7(1), s8(9), s4(3)(a) | "A person" / "no person" / "that person" | Directly (F1) |
| FAIS GCoC s3(4), 3(5), 14 | Authorised FSPs and representatives | The adviser (s14(2)(d): must ensure or mitigate ads made by others that relate to its business); the agreement; good practice |
| CPA s5(1)(b), s41 | Suppliers, including promotion where no sale occurs | Directly (A, acts.co.za) |
| ARB Code v2026-04-07 | All commercial advertising (Section I 2.1); members bound; a non-member advertiser is "invited" to proceedings and may decline (Section I 4.22) | Directly, as a self-regulatory standard (voluntary for non-members) |
| POPIA s11-s18, s34-s35, s55, s69 | Responsible parties | Directly |
| PAIA s51 | Private bodies | Directly |
| ECT Act s43 | Suppliers by electronic transaction | Arguable (Q4) |
| ASISA standards | ASISA members (insurers) | None found; **UNVERIFIED** whether any lead-generation standard exists |

---

## 4. What turns content into advice or intermediary services

| Content or feature | Verdict | Why |
|---|---|---|
| General education page: how group life usually works, with source, labelled as information | Green if no per-person output | s1(3)(a)(i)(ee); "client" excludes the general public |
| Same page that ends "check your cover after a new bond" / "a good time to look at cover" | Amber | Guidance-style nudge toward reviewing or replacing cover; keep to neutral statements of what happens |
| Quiz collecting age band, budget band, consent, name, number | Green | Routing data, self-declared |
| Quiz collecting bond, dependants, work cover | Amber | Needs-analysis data; confirm purpose with attorney (Q2) |
| Any screen computing from answers (gap score, "under-insured", suggested cover) | Red | Personal recommendation to a "client" |
| "Not the right fit" tied to budget | Amber | Reads as affordability or suitability judgment |
| Handing details to a named FSP with specific, disclosed consent | Green if flat-fee and no control (memo section 1) | FSCA RAR 24.1; *Raspberry* [26]-[27] |
| WhatsApp booking, reminders, reschedule | Green | Routine administrative service (s1(3)(a)(i)(cc)) |
| Answering "what does it cost / is X covered / which insurer" | Red | Explaining or pricing a product; defer line only |
| Helping with forms, ID, debit orders, medicals | Red | Equitos pattern (RAR box 9) |
| Telling someone to keep, cancel, replace or top up any cover | Red | Advice incl. replacement or termination (s1 "advice"(d)) |
| Choosing an adviser by product preference or need | Red | Control over product or adviser selection is an intermediary indicator (*Raspberry* [29a]) |
| Routing by availability, language or region | Green | No product judgment |

---

## 5. Safe-content rules for writers

Tag shows the authority. "Never" items are blockers at review; "Instead" gives the compliant form (suggested wording, for attorney sign-off).

**A. What SortMyCover is**
- S1. Describe SMC only as a service of Lead Velocity (Pty) Ltd that introduces people to an authorised financial services provider and books the call. Never "check", "review", "sort", "arrange", "find", "match" or "recommend" cover as something *we* do. [F1; CPA s41(3)(e),(j)]
- S2. Never say or imply SMC or Lead Velocity is licensed, authorised, approved, registered with or regulated by the FSCA or any financial regulator. No FSCA logo. State the opposite in the footer line. [GCoC 3(4)(a); FAIS 8(9)(b); CPA 41(3)(a); FSCA FAQ]
- S3. FSP details (firm, individual, FSP number, link to the FSCA FSP search) appear for the adviser only, after the register check. No sample or placeholder FSP number on any public asset (the repo's "00000 SAMPLE" renders stay internal). [FAIS 8(9)(c); GCoC s5]
- S4. "Independent" is never used about SMC. About an adviser, only with written confirmation under GCoC s3(5). Instead: "We are not an insurer and no insurer owns or pays us." (only if true) [F4]
- S5. While one adviser is live: no panel, network, matched, best-for-you, compare. Say "one adviser". [F4]
- S6. How we make money is stated in plain words and linked from every page; every "no commission" line is scoped to SortMyCover. [F3]

**B. The call and the adviser**
- S7. Describe the call in process terms: time, length, channel, that the adviser gives their name, FSP number and how they are paid. No outcomes or benefits ("fix your gap", "find the right cover", "know exactly what you need"). [Raspberry [28c]; memo R6]
- S8. Describe only adviser conduct the adviser is bound to by GCoC s5-s7 or by the signed agreement. Otherwise use "may" or leave it out. ("No pressure to decide" needs a contract term.)
- S9. Never explain products, insurers, exclusions, underwriting, premiums, payouts, tax or claims, and never answer such questions; use the fixed deferral line. [FSCA RAR 24.2]
- S10. Never help with applications, documents, ID, debit orders or medicals. [Equitos]
- S11. Never suggest keeping, cancelling, replacing, lapsing or topping up any existing cover, including employer cover. [FAIS s1 "advice"(d)]
- S12. Never say what a person needs, should have or is short by. General facts only, sourced and dated, with the "general information, not advice" label. [F2, F5]

**C. Free and cost**
- S13. Write "The call costs you nothing." Never "free advice", "free review", "free check", "free quote", "free assessment". Pair with: "If you later choose a product, your adviser tells you how they are paid." [F3]
- S14. No premium, price, "from R", "cheaper", "affordable", "save", cover amount, or rand example, even as an illustration. The budget question is neutral (CP-v0.2 1.4 wording) and never echoed back. [F11; GCoC 14(3)(c)]

**D. Claims and proof**
- S15. Every factual or statistical claim has a written evidence file before publication, current, with source and month shown on the page for statistics. "Most", "many", "often", "typical" without data become "can be" or "check your benefits statement". [F5; ARB 4.1]
- S16. No "best", "cheapest", "leading", "#1", "top-rated", "trusted by", "thousands of South Africans", awards, or "unlike other sites". Counts ("calls booked") only from the booking database with a date. [F11]
- S17. Testimonials and ratings: real, consented, current, signed and dated copies on file, pseudonym stated, "not financial advice" label, no results claims, no review gating, no stock-photo customers. Until then `proof: []`. [F10]

**E. Quiz and personalisation**
- S18. Ask only what routing and booking need: age band, budget band, consent, first name, mobile (email only for Teams/Zoom/Meet). Bond, dependants and work-cover questions wait for Q2. [F2]
- S19. No on-screen or message output computed from answers: no score, gap size, "you may be under-insured", "recommended". Results are booked / not available / thank you only. [F2]
- S20. Helper text must not teach needs ("a bond is usually the biggest thing cover needs to carry") or imply pricing ("if the numbers made sense"). Use: "Roughly what monthly budget could you set aside for life cover? This is not a quote." [F2]
- S21. Not-available screen: "We can't arrange a call from these answers." Nothing about budget, fit, suitability or affordability. Only say "we have not saved your details" if the client-side gate really sends nothing (README says it does not).
- S22. No pre-ticked boxes. Introduction consent (required) and ad-measurement consent (optional) are separate "I give / I do not give" questions. [memo; GCoC 14(8) spirit]
- S23. Include "I am 18 or older" in the consent step. [F12]

**F. Ads, campaign pages and subdomains**
- S24. Ads follow every page rule; the headline cannot rely on body copy to correct it. [ARB 4.2.6]
- S25. Fear: no death, coffin, orphan or "what if you died tomorrow" imagery or lines. Urgency: no countdowns or "only N slots" unless read live from the calendar. [ARB 3.1; GCoC 14(3)(n)]
- S26. Message match: the landing H1 repeats the ad hook; every claim in the ad is also on the page and evidenced. [GCoC 14(3)(i)]
- S27. Ad identity: the ad and page name SortMyCover and Lead Velocity. Do not name the adviser in ad copy until the attorney decides whether the ad is the adviser's advertisement (Q1). The adviser is named at the consent step and in the first WhatsApp.
- S28. Subdomain names and slugs avoid quote, compare, cheap, best, rates, claims, fsca, insurer, bank. [F11, inference]
- S29. Keep every published ad version, its evidence file and the approval record for at least 5 years (GCoC s14(7) is a provider duty; adopt as practice).
- S30. People shown in creative: real, with written permission (ARB 11.1); never a stock "adviser" presented as the real one.

**G. Every page**
- S31. Footer on every page, including each campaign subdomain: legal name, registration number, physical address, phone, hello@ email, directors' names, "not an FSP / no advice / we are paid a flat fee by advisers" line, and links to Privacy, Terms, How we make money, Complaints, Opt-out, PAIA manual. [F7, F8]
- S32. Collection points state who collects (Lead Velocity), purpose, recipient (the named FSP), channels (WhatsApp, call, SMS, email), STOP, and the privacy link. [POPIA s18; GN 7.2, 10.1]
- S33. Terms and privacy use plain language (grade 7 or lower, already the house limit); CPA s22. Statements about registries or registrations are written only when true on the day (F9).

**H. Interactivity (Motion) and accessibility**
- S34. Animation and interaction must not hide, delay or obscure required disclosures: the identity block, FOOTER-v2 line, adviser details, consent text and "how we make money" link must be visible without any interaction, scroll trigger or accordion, and sit close to the claim they qualify. [GCoC 14(3)(l),(m),(14)]
- S35. Respect `prefers-reduced-motion`; all quiz steps keyboard-operable with visible focus; alt text and captions for any image or film (the explainer); contrast and 16px minimum text. No statute mandates WCAG for a private-sector site (Constitution s9 and PEPUDA s9, failure to "reasonably accommodate", are the legal hooks; sources are B-grade, see gaps), so treat WCAG 2.2 AA as the expectation and keep the existing axe and Lighthouse gates.

---

## 6. Before / after for copy already in the repo

| Where | Current | Problem | Suggested (attorney to sign off) |
|---|---|---|---|
| Landing CTA, hero, sticky | "Check my cover in 60 seconds" | SMC appears to check cover (F1, F2) | "Book my free adviser call" or "Answer 5 questions to book your call" |
| Landing tag | "Free 30-min call, pick your time" | Acceptable for the call; no pointer to adviser pay | "Your call costs nothing. 30 minutes, pick your time." |
| Quiz Q2 helper | "A bond is usually the biggest thing cover needs to carry." | Needs statement (S20) | "This helps your adviser prepare." |
| Quiz Q5 | "If the numbers made sense, what could you comfortably set aside each month?" | Implies price calculation | "Roughly what monthly budget could you set aside for life cover? This is not a quote." |
| Not-available screen | "a call is not the right fit right now" | Suitability or affordability judgment | "We can't arrange a call from these answers." |
| Hero bars and angle hook | "Typical work cover 2-4x salary" | Unsourced statistic (F5) | Hedged form until a current source is filed |
| Terms s2, angle c13 | "free cover check" | F3 | "a call with an authorised adviser, which costs you nothing" |
| How we make money | "No commission, ever." | Unscoped; reads as covering the adviser | "SortMyCover takes no commission and no share of any premium. If you later choose a product, your adviser tells you how they are paid." |
| About page | "The privacy notice and the terms name the company" | Hides the company (F7) | Name Lead Velocity (Pty) Ltd and the identity block on the page |
| Terms s6 | "We check our records against it every month." | Registry not yet open to consumer blocks (F9) | True-state wording above |
| Learn pages | "A job change is a good time to look at what cover is in place." | Guidance-style nudge | "Group life cover is usually tied to the employer, so it normally ends when the job ends." |

---

## 7. Per-page checklist (tick before publish)

- [ ] Identity block and FOOTER-v2 line present, no placeholder text
- [ ] Links: Privacy, Terms, How we make money, Complaints, Opt-out, PAIA manual
- [ ] No FSCA logo; no status words about SMC (S2)
- [ ] Words scan clean: check, review, sort, arrange, match, compare, best, cheapest, independent, free (only "costs you nothing"), guarantee, approved, regulated
- [ ] Every number has a source and month on file
- [ ] No output computed from quiz answers
- [ ] Adviser name, practice, FSP number verified on the FSCA register (named mode)
- [ ] 18+ confirmation present; consent unticked; optional ad consent separate
- [ ] Pixel and cookies off until opt-in (decision Q3)
- [ ] Disclosures visible with animation disabled and with reduced motion
- [ ] Hook, H1 and claims match; evidence file linked in the ad log

---

## 8. Questions for the attorney

- **Q1.** In named mode, is an SMC ad or landing page the adviser's "advertisement" relating to a financial service (so GCoC s14(5)(a) identification and s14(3)(e),(p) content apply, and s14(2)(d) puts the duty on the adviser), or SMC's own marketing? The agreement frames SMC as marketing its own service; the consent line already names the adviser and FSP number. See memo R2 and R14.
- **Q2.** Do the bond, dependants and work-cover questions stay within "mechanical" lead generation given the agreement limits pre-qualification to age band and budget band?
- **Q3.** Opt-in or opt-out default for the Meta Pixel in SA (no SA cookie-specific rule; the Regulator's cookie item rests on UK/EU sources).
- **Q4.** Does ECT s43 apply to a service that costs the consumer nothing? (Show the information regardless.)
- **Q5.** Is "licensed adviser" acceptable lay shorthand beside "authorised financial services provider"?
- **Q6.** Who is the "direct marketer" for NCC registration: Lead Velocity, the adviser, or both? Do both register?
- **Q7.** Do the OUTsurance/MTN matters change the consent evidence needed for the adviser's calls (recorded consent, para 7.2.9 of the Guidance Note)?
- **Q8.** Is the 2018 FAIS Act copy still current for s4(3), s7(1), s8(8)-(9)?

## 9. Gaps and UNVERIFIED items

- *Raspberry* paragraph pins come from the memo (SAFLII returned HTTP 403 today).
- No FSCA lead-generation or referral-fee standard found; absence not proven. COFI Bill is only introduced (17 Apr 2026).
- ARB rulings database not searched for "free" or lead-generation rulings; whether the ARB would take a complaint against a non-member lead generator is not tested.
- ASISA: page lists standards dynamically; none confirmed as binding a non-member lead generator. UNVERIFIED.
- Meta's financial-services advertiser verification for South Africa: only vendor blogs found. UNVERIFIED.
- CPA Reg 4 contact-hours rule (weekday 08:00-20:00, Saturday 09:00-13:00, none Sundays or public holidays "at home") read via secondary sources only (PwC, De Rebus); relevant to adviser calls and non-logistics WhatsApp; not covered above.
- ECT Act s45 repealed by POPIA from 30 Jun 2021 (secondary source only).
- Subcategory B1 as the right licence for risk-only life: secondary sources only.
- Accessibility: no statute found; Constitution and PEPUDA s9 hooks (s9 read at acts.co.za); WCAG-in-SA sources are vendor blogs.
- GCoC copy hosted 2022 (June 2020 consolidation); 2 Dec 2022 amendments do not touch the sections used. The FAIS Act copy is dated 2018.
- Registration number 2025/637858/07 and the Information Officer registration were not verified.

## 10. Sources

- FAIS Act 37 of 2002 (copy printed 25 Jun 2018): https://www.faisombud.co.za/wp-content/uploads/2018/06/FINANCIAL-ADVISORY-AND-INTERMEDIARY-SERVICES-ACT-37-OF-2002.pdf
- FAIS General Code of Conduct, BN 80 of 2003 as amended by BN 706 of 2020 (consolidated June 2020): https://www.masthead.co.za/wp-content/uploads/2022/10/BN-80-of-2003-FAIS-GCOC-June-2020.pdf ; amendments of 2 Dec 2022: https://www.moonstone.co.za/fsca-publishes-amendments-to-the-general-code-of-conduct/
- FSCA Regulatory Actions Report 1 Apr 2025 - 31 Mar 2026 (published 3 Aug 2026), para 24 and box 9: https://www.moonstone.co.za/wp-content/uploads/library/newsletter/FSCA_Regulatory_Actions_Report_2026.pdf ; coverage: https://www.moonstone.co.za/fsca-sharpens-focus-on-online-harm-and-unauthorised-advice/
- FSCA FAQs (logo answer; accessed 10 Oct 2026): https://www.fsca.co.za/FAQs/ ; FSP search: https://www.fsca.co.za/FSB-Search/
- ARB Code v2026-04-07, Sections I, II, III: https://arb.org.za/code-file-downloads/Section_II_General_Principles-v2026-04-07.pdf ; https://arb.org.za/code-file-downloads/Section_III_Specific_Categories_of_advertising-v2026-04-07.pdf ; https://arb.org.za/code-file-downloads/Section_I_Introduction-v2026-04-07.pdf
- CPA s41 and s5: https://www.acts.co.za/consumer-protection-act-2008/41_false_misleading_or_deceptive_representations ; https://www.acts.co.za/consumer-protection-act-2008/5_application_of_act
- NCC opt-out registry statement, 7 Oct 2026: https://thencc.org.za/ncc-launches-the-national-opt-out-registry-to-curb-unwanted-direct-marketing/ ; Mayet Law, 30 May 2026: https://mayet.law/the-2026-opt-out-registry-three-legal-axes-that-now-govern-direct-marketing-in-south-africa/
- Information Regulator Guidance Note on Direct Marketing (3 Dec 2024): https://inforegulator.org.za/wp-content/uploads/2020/07/GUIDANCE-NOTE-ON-DIRECT-MARKETING-IN-TERMS-OF-THE-PROTECTION-OF-PERSONAL-INFORMATION-ACT-4-OF-2013-POPIA.pdf
- Information Regulator PAIA Guide (5 Sep 2021): https://inforegulator.org.za/wp-content/uploads/2020/07/PAIA-Guide-English_20210905.pdf ; Information Officer Guidance Note (1 Apr 2021): https://inforegulator.org.za/wp-content/uploads/2020/07/InfoRegSA-GuidanceNote-IO-DIO-20210401.pdf
- Information Regulator briefing 31 Aug 2026 (ITLawCo): https://itlawco.com/information-regulator-briefing-2026/ ; s69 and telephone marketing (ITLawCo, 28 Sep 2026): https://itlawco.com/popia-section-69-and-telephone-marketing/
- ECT Act 25 of 2002 (gazetted text): https://www.gov.za/sites/default/files/gcis_document/201409/a25-02.pdf
- POPIA s35: https://popia.co.za/section-35-general-authorisation-concerning-personal-information-of-children/
- PEPUDA s9: https://www.acts.co.za/promotion-of-equality-and-prevention-of-unfair-discrimination-act-2000/9_prohibition_of_unfair_discrimination_on_ground_of_disability
- FAIS Ombud (jurisdiction, accessed 10 Oct 2026): https://www.faisombud.co.za/
- Treasury-commissioned group risk research (Genesis, 17 Oct 2007): https://www.treasury.gov.za/publications/other/ssrr/session%20one%20papers/group%20risk%20benefits%20-%20genesis%20report%2020071018.pdf
- COFI Bill introduction (17 Apr 2026): https://www.masthead.co.za/newsletter/conduct-of-financial-institutions-bill-introduced-in-national-assembly/
