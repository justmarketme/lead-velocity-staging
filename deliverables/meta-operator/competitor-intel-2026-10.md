# SortMyCover competitor intelligence, October 2026

**Status:** v1, 6 Oct 2026. **For:** meta-operator, media-buyer, creative-strategist and compliance-qa. **Saved at:** `deliverables/meta-operator/competitor-intel-2026-10.md`
**Sources:** Meta Ad Library sweep (ZA, active ads, 6 Oct 2026), web research on each operator, a method review, and two independent verification passes per headline claim. Where a claim was refuted, the corrected version is used. Nothing below is legal advice. Where the FAIS/POPIA practitioner's opinion differs, the opinion wins.

**Evidence grades.** These match `content-engine.md`:
- **A**: Meta's own docs or direct observation in the Ad Library, a regulator, a court record or a register.
- **B**: a large dataset or reputable practitioner research.
- **C**: one source only, a vendor blog, self-reported figures, or third-party traffic estimates.
- **Inference**: our own reasoning, labelled as such.

**Our rules, referred to throughout as R1 to R4:**
- **R1. No advice.** No financial advice, product comparisons or premium quotes (FAIS; master prompt 2.1; compliance-qa F1). Every post ends with: `SortMyCover gives no financial advice, product comparisons or premium quotes.`
- **R2. Broker-neutral.** No insurer, product, premium, cover amount or broker named in any ad (2.1.8; campaign-spec §14). Leads go only to the practice named in the consent tick (CONSENT-NAMED-v1).
- **R3. No personal-attribute claims.** Third person only. Nothing in the second person about the viewer's age, finances, debts, family, health or ethnicity (2.1.8; Meta personal-attributes policy).
- **R4. One CTA.** Every post ends with `Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za`. The ad button is "Learn more", never "Get quote".

Supporting rules:
- Flat fee, never tied to policies (2.1.1, F2).
- Named opt-in consent (2.1.2, F4; POPIA s69).
- No fake testimonials, statistics or AI people (2.1.5).
- The banned-hooks list (content-engine §4).
- No "Lead Velocity" in social copy.
- Qualifying bands: age 35-50 and budget R750 a month or more.

---

## 1. Who we looked at and how

### 1.1 The set (Ad Library page IDs, not profile IDs)

| Competitor | Operator | Licence | Active ZA ads, 6 Oct 2026 | Ad Library |
|---|---|---|---|---|
| Consumer Advice | Worldwide Leads (Pty) Ltd, Pretoria | Not an FSP (own disclaimer); register check unreliable, see 1.3 | 7 | [page 110169031786467](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&search_type=page&view_all_page_id=110169031786467) |
| Hippo.co.za | Hippo Comparative Services (FSP 16357) and Hippo Advisory Services (FSP 36088); owned by Telesure Investment Holdings (TIH) | FSP (self-disclosed, not independently confirmed) | 49 | [page 118777064884147](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&search_type=page&view_all_page_id=118777064884147) |
| Get Life Insurance | Lead Guru (Pty) Ltd, Cape Town; also trades as LeadLab and Cover Bokkie | Not an FSP (own statement) | 14 | [page 855258237673328](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&search_type=page&view_all_page_id=855258237673328) |
| Funeral-cover.co.za | First Impressions / CKG Holdings, Cape Town | Not an FSP (own footer) | about 37 (30 cards parsed) | [page 604786562725578](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&search_type=page&view_all_page_id=604786562725578) |
| Assupol Funeral | First Impressions (same operator as above) | Not an FSP; uses Assupol Life's FSP 53 in its copy | 30 cards (Library count 35) | [page 1101873713001974](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&search_type=page&view_all_page_id=1101873713001974) |
| Assupol Cover | Virtusell (Pty) Ltd, Century City; trades as AssupolCover | Not an FSP on name search | 13 | [page 347219071797923](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&media_type=all&search_type=page&view_all_page_id=347219071797923) |
| Medical Aids South Africa | Adjacent Digital group, "Managed by LeadSure & Enex Digital" | Not an FSP (own statement) | 2 | [page 281488278616330](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&search_type=page&view_all_page_id=281488278616330) |
| CompareGuru SA | CompareGuru Financial Services (FSP 47696), owned by SureStart | FSP, **verified on the FSCA register** | 0 | [page 651459861543573](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ZA&search_type=page&view_all_page_id=651459861543573) |

**Also seen, not analysed in depth:**
- Cover Bokkie (Lead Guru): about 30 active ads.
- Funeral Cover SA: page 451467824724008, 5,443 likes.
- Finatic and Go Insurance: also advertise Assupol.
- Dis-Chem Life: page 378173882041442, about 41 active ads. Used for the method check.
- Funeral advertisers using click-to-WhatsApp:
  - Micro Insurance Solutions (Hollard Funeral): ads [1435215781811630](https://www.facebook.com/ads/library/?id=1435215781811630), [29043659531988550](https://www.facebook.com/ads/library/?id=29043659531988550), [1105186208599910](https://www.facebook.com/ads/library/?id=1105186208599910)
  - Metropolitan: [2203082047230641](https://www.facebook.com/ads/library/?id=2203082047230641)
  - MiWayLife: [1063739366243001](https://www.facebook.com/ads/library/?id=1063739366243001)
  - Baroka Funerals: [1906277377002860](https://www.facebook.com/ads/library/?id=1906277377002860)

**Corrections to the brief:**
1. For Get Life Insurance, Funeral-cover.co.za and Assupol Funeral, the brief listed profile IDs (61583677256862, 61575528667371, 61579566620486). Those return "No ads match". Use the page IDs above.
2. Consumer Advice is not at 0 active ads. It had 7 on 6 Oct, one of them started 5 Oct.

### 1.2 How

- **Ad Library.** Advertiser view (`view_all_page_id`), country=ZA, active ads, checked 6 Oct 2026. Default sort is "Impressions: high to low". For each ad we recorded:
  - Library ID, start date, format and "multiple versions"
  - collation ("N ads use this creative and text")
  - CTA, destination and platforms
- **Page signals.** Followers, latest organic post, visible engagement, and whether the Page replies to comments.
- **Web research.** Landing pages, quizzes, thank-you pages, T&Cs, privacy policies, WHOIS, hidden form fields and pixels, the FSCA register, Hellopeter, ARB rulings, court-ruling commentary, and Similarweb, Semrush and HypeStat.
- **Verification.** Every headline claim in section 3 went through two independent verification passes, each re-checking the evidence and testing it against our rules.

### 1.3 What the Ad Library cannot show us (stated plainly)

1. **No SA commercial ad spend, impressions, reach or targeting is shown.** Spend and reach are null on every ad we checked. We cannot see any competitor's budget, CPL or ROAS. (A, direct check; [Meta Ad Library tools](https://transparency.meta.com/researchtools/ad-library-tools/))
2. **Stopped SA ads disappear with no history.** Only ads that are live today are visible. Ads that were killed cannot be seen, so every "long-running" read has survivorship bias. A paused ad that is switched back on keeps its original start date, so a start date plus "active today" does **not** prove the ad ran without a break. The only way to measure run length is our own repeated snapshots. (A)
3. **The official API excludes SA commercial ads.** The [Ad Library API](https://developers.facebook.com/docs/graph-api/reference/ads_archive/) returns commercial ads only if they reached the EU. Scraping breaks Meta's [Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms). Tracking is therefore manual snapshots. (A)
4. **The impression sort ranks only, and only within one advertiser.** It shows no numbers. It reflects lifetime totals, so older ads rank higher partly because they have run longer. It cannot compare advertisers. (A observed; impression-bucket and advertiser-spend claims in 2026 blogs were not visible on SA ads, C)
5. **One "ad" can be many creatives.** A dynamic-creative ad marked "multiple versions" holds many asset combinations under one Library ID. A long run belongs to the container, not to any single creative. (B)
6. **Keyword result counts are noise.** "funeral cover" returned about 1,400 results, including unrelated foreign ads. Count by advertiser view only. (A)
7. **Traffic tools are rough.** Promodo's test of 184 sites found about 50% average error, worst under about 5K visits a month ([Promodo](https://www.promodo.com/blog/data-accuracy-at-similarweb-ahrefs-and-semrush)). Most funnel domains here sit below Similarweb's threshold. (B)
8. **This is one snapshot on one day.** The two research passes disagreed on Funeral-cover.co.za's count (at least 17 against about 37). Treat counts as approximate.
9. **The FSCA register.** CompareGuru (FSP 47696) was verified on the register directly. For Consumer Advice and Worldwide Leads, automated queries failed even for a known positive control, so those need a manual check at [www2.fsca.co.za/Fais/Search_FSP.htm](https://www2.fsca.co.za/Fais/Search_FSP.htm).

---

## 2. Competitor by competitor

### 2.1 Consumer Advice (Worldwide Leads)

A pay-per-lead generator. Its consumer brand fronts a wills funnel. The live thank-you page names Capital Legacy as the provider who will call ([thank-you page](https://consumeradvice.co.za/free-will/thank-you)). Worldwide Leads sells flat cost per lead, with no retainer and a minimum of 75 leads a week ([worldwide-leads.com](https://worldwide-leads.com/lead-generation)).

- **Targeting** (from URL slugs and quiz names):
  - Homeowners and parents of minor children
  - Couples against singles
  - Afrikaans speakers and Muslims (a "shariah will" page)
  - Men and women over 40 in separate flows
  - Life-cover flows split by high and low income
  - The R2m/R5m/R10m estate bands appear only on `/calculator-test`, an **unpublished draft whose CTA does not work** (the config still says "REPLACE-WITH-YOUR-LEADSHOOK-URL"). Targeting middle- and upper-income homeowners is therefore a hypothesis, not observed. The live will landers have no income or property qualifier.
- **Hooks:**
  - "South Africans without a valid Will NEED THIS!" (with a heart emoji; in 4 of 7 ads)
  - "If you don't have a Will… you don't get to decide what happens next."
  - "Get Your Free Will Expertly Drafted"
  - Fear angles on the landers (Guardian's Fund, "cost of dying can exceed R100,000")
  - Borrowed authority ("1.6 million Wills", which is Capital Legacy's figure)
- **Formats:** 4 video, 1 image, 2 dynamic-creative ads (3 card variants each). CTA "Apply now" on 6 ads, "Learn more" on 1. Runs on FB, IG, Messenger and Threads.
- **Funnel:**
  - Traffic: Meta, plus Taboola (last confirmed by a UTM link in Apr 2025; tbl paths updated Sep 2026) and Outbrain (historical). SMS landers exist, but no traffic was verified.
  - Advertorial or short lander, then a LeadsHook quiz pitched as a "22/28/30-second assessment" with "No Contact Details Required" at the start.
  - Opt-in for name, phone and email, then a thank-you page naming Capital Legacy, then a call within "15 minutes to 24 hours".
  - The estate-cost cover upsell happens on Capital Legacy's callback. It is not on Consumer Advice's own pages.
  - About 430 sitemap URLs since 2019 across every product line: about 212 wills, 145 life, 71 funeral, about 43 test pages.
- **Longest-running ads:**
  - [1716498799546340](https://www.facebook.com/ads/library/?id=1716498799546340): video, since 24 Jun 2026
  - [1736238377666046](https://www.facebook.com/ads/library/?id=1736238377666046): image, since 28 Jun 2026, first in its impressions sort
  - [1535798954423068](https://www.facebook.com/ads/library/?id=1535798954423068): video, since 28 Jul 2026
  - New ads followed on 6 Aug, 31 Aug, 28 Sep and 5 Oct.
- **Page engagement:** 6,992 likes, category "Internet company". Latest post around 1 Oct, with no reactions. Logged-out visitors see "This content isn't available". The Page exists to run ads.
- **Compliance risks:**
  1. **Data sold, despite what the lander says.** The [privacy policy](https://consumeradvice.co.za/privacy-policy) lists "To be sold to our clients" and reuse for email/SMS/custom-audience remarketing. The lander says "used for this purpose only". That is a POPIA s69 exposure.
  2. **Borrowed and unsourced social proof.** Capital Legacy's figures are shown as its own. A "4.8 from 5,324 reviews" badge has no source; [Trustpilot](https://www.trustpilot.com/review/consumeradvice.co.za) shows 4 reviews, all from Mar 2021.
  3. **Advice language from a non-FSP.** "Best advice" appears in the disclaimer, and "ConsumerAdvice Insurance" is presented as if it were the insurer.
  4. **FAIS fee risk.** If any buyer pays a premium-linked fee, the *Raspberry Academy* risk applies. The fee terms are not public.
  5. **Downstream reputation.** IOL reported reader complaints about Capital Legacy in Oct 2023, which Capital Legacy disputed ([IOL](https://iol.co.za/personal-finance/2023-10-17-ruan-jooste-rants-and-cents-be-careful-when-planning-your-legacy/); [response](https://www.capitallegacy.co.za/capital-legacys-response-to-article)).

### 2.2 Hippo.co.za (Telesure Investment Holdings)

A comparison site and referral router, plus an in-house brokerage call centre for medical aid and life cover ([ownership blog](https://www.hippo.co.za/blog/insurance/the-truth-about-who-owns-hippo-and-how-it-works/)).

- **Targeting:**
  - Car owners who suspect they overpay (Similarweb: 55% male, mostly aged 25-34; estimate)
  - People switching between direct insurers
  - Afrikaans speakers (Virseker on the panel; Dricus du Plessis in the ads)
  - Families shopping for medical aid or gap cover
  - High-risk life applicants
  - People under credit stress (loans, debt counselling)
- **Hooks:**
  - "When you dunno.. Ask Hippo"
  - "Save R539 per month*" (footnoted to KLA 2025 research)
  - "Compare 13 car insurance quotes"
  - "No spam. No Markup."
  - "Are you paying too much?"
  - A humorous life-dilemma brand skit
- **Formats:** 34 dynamic creative, 15 video, no static images. Creator-partnership ads run under the creators' own handles. CTAs: Get quote 22, Learn more 18, See details 8.
- **Funnel:**
  - Destinations: car-quote form (38 ads), medical-aid form (6), Meta instant form (5).
  - The car flow starts with "Enter your ID number" to pre-fill, then shows 10-13 quotes. Clicking "I'm interested" releases the user's details to that insurer.
  - Health leads get a call-back from Hippo Advisory.
  - Brand and SEO drive most traffic. Semrush (estimate) puts it at about 134K organic of about 151K visits in Aug 2026 ([Semrush](https://www.semrush.com/website/hippo.co.za/overview/)).
- **Longest-running ads:**
  - 4 Aug 2026: 8 creator videos (Mrhowmuch, Juliet McGuire, mzansi_popular_rides).
  - 26 Aug 2026: 5 "Save R539" dynamic ads, first in the impressions sort.
  - 3 Sep 2026: 12 brand "dunno" ads, 2 of them for medical aid.
  - Nothing active is older than about 2 months. New batches arrive every 1-3 weeks.
- **Page engagement:** 73,961 likes, verified. Latest organic post 14 Sep 2026, with 2 reactions and 1 comment. That comment has no reply.
- **Compliance risks:**
  - [Hellopeter](https://www.hellopeter.com/hippocoza): TrustIndex 2.4/10 (33 reviews, Nov 2025-Oct 2026). "Spam calls" is the top mention. There are as many complaints about unauthorised or duplicate debit orders and policies activated without consent.
  - "100% impartial" claims sit beside a car panel where 5 of 13 brands are TIH-owned, and a funeral panel where 5 of 10 are.
  - Leads go into a group-wide data pool: the TIH privacy policy covers 14 entities ([policy](https://www.hippo.co.za/more/PrivacyPolicy2024.pdf)).
  - It is willing to run attack ads. OUTsurance's 2022 urgent interdict was struck off for lack of urgency ([Moonstone](https://www.moonstone.co.za/court-dismisses-outsurance-bid-to-pull-hippo-parody-advert/)).
  - **Self-reported fix for call complaints** ([Salesforce blog, 11 Aug 2025](https://www.salesforce.com/eu/blog/hippo-co-za-digital-marketing-journey/), car insurance only):
    - About 5.5M cold follow-up calls a year were replaced by an automated digital journey. **The post names no channel and says nothing about consent.**
    - The user picks a quote, then a consultant phones back.
    - Hippo reports "27% more effective" (undefined), about 300 more customers a month and R4.2m a year saved. These figures are unaudited (C).
    - Call complaints continued into Sep 2026.

### 2.3 Get Life Insurance (Lead Guru: LeadLab and Cover Bokkie)

A self-described "lead broker and aggregator". Leads are routed via LeadByte to buyers who call ([T&Cs](https://getlifesinsurance.co.za/terms-and-conditions)). Note the extra "s": the real domain is getlifesinsurance.co.za.

- **Targeting:**
  - Mass and middle-market adults aged about 27-67
  - Existing policyholders feeling premium creep
  - Price-sensitive buyers
  - The quiz grades leads: has cover, cover amount, age band, and income band (under R7k to over R50k)
- **Hooks:**
  - "South Africans Born Between 1959 and 1999 Without Life Insurance NEED This!" (with a heart emoji)
  - "R93/month no-medical" life cover
  - "Life insurance shouldn't feel complicated…"
  - Cover Bokkie variants: "Slash your premiums by up to 42%", "My broker never told me there were cheaper options", and an unsourced "40% of South African families lose their homes after a death"
- **Formats:** 12 dynamic creative, 2 image. The headline is the same on all 14 ads ("Life Cover for South Africans"). Only 3 body texts exist. Every ad includes Audience Network.
- **Funnel:**
  - LanderLab page, then an inline 5-step form, then name, mobile and email.
  - Consent is browse-wrap only ("By submitting you agree to the Ts and Cs…"), with no checkbox and no named recipient.
  - Thank-you: "an approved partner will call you within 24 hours".
  - Cover Bokkie retargets people who abandon the quiz.
- **Longest-running ads:**
  - 7 Dec 2025: the "R93/month" dynamic ad (about 10 months)
  - 29 Apr 2026: 2 "born between" ads, positions 1-2 in its own impressions sort ([962593846638121](https://www.facebook.com/ads/library/?id=962593846638121))
  - 4 May 2026: a third "born between" variant
  - 11 May-1 Jun 2026: 7 R93 variants
  - New ads on 7 and 15 Sep 2026
- **Page engagement:** 573 followers, 0 reviews. No organic posting since a 7 Dec 2025 cover photo (4 reactions, 3 comments). One May 2026 comment complains of unsolicited spam calls the commenter did not consent to. It has no reply.
- **Compliance risks:**
  1. **ARB ruling, 2 Oct 2025, against Cover Bokkie.** A pet ad implied Cover Bokkie was the insurer, and a buried disclaimer did not fix that. The complainant was "inundated with calls from multiple insurance providers and banks". Lead Guru is not an ARB member ([Bizcommunity](https://www.bizcommunity.com/article/cover-bokkie-pet-insurance-ad-found-confusing-515440a)).
  2. **It contradicts itself on how it is paid.** The FAQ says a referral fee is paid "when a policy is placed". The footer says it is paid "when you request a call". The first matches the *Raspberry* pattern.
  3. **It contradicts itself on data.** The FAQ says data is "never sold". Its LeadLab [privacy policy](https://getlifesinsurance.co.za/privacy-policy), a UK template, describes the business as "the sale of this personal information to our clients".
  4. **Advice wording from a non-FSP** ("the best advice in your situation"). It also calls itself a "comparison service" but shows no comparison.
  5. **No copy review.** A live ad opens with leftover LLM text: "Here is the updated copy with the feedback incorporated naturally..." ([1640854820545608](https://www.facebook.com/ads/library/?id=1640854820545608)).

### 2.4 Funeral-cover.co.za (First Impressions / CKG Holdings)

A white-label affiliate. The terms say the site "is a service provided by First Impressions" ([terms](https://funeral-covers.co.za/terms-and-conditions/)).
- **Domain note:** the Page is named after funeral-cover.co.za, a parked page they do not appear to control. Their real domains are funeral-covers.co.za (registered 15 Apr 2025, WHOIS "First Impressions") and find-funeral-cover.co.za.
- Each funnel sends leads to one insurer's call centre: Dis-Chem Life (FSP 50594) from Apr 2025, and 1Life since Jun 2026.

- **Targeting:**
  - Mass-market, working-class and lower-middle-income families, mostly Black, covering extended family ("up to 16/20/21 family members")
  - Quiz income bands from "Up to R7,499" to "R30,000+"
  - The 1Life path requires employment and income above R7k
  - Geo-IP town names are inserted into headlines
  - Meta and TikTok pixels
- **Hooks:**
  - "Funerals cost R40,000+. Cover costs R49."
  - "Funerals in SA now cost over R15,000"
  - "Avoid a R40k Funeral Bill"
  - "This site compares the top funeral insurers and finds you the best, and most affordable cover in less than 15 seconds!"
  - "Find the cheapest BUT best cover."
  - A first-person line, "I got mine for under R350…", reported in one dynamic variant. An exact-phrase Ad Library search found no match, so it is **unverified**.
- **Formats (30 cards parsed):** 14 video, 12 dynamic creative, 4 image. CTA "Get quote" on 28. Every ad runs on Audience Network. 8 list WhatsApp as a placement; that is not click-to-chat.
- **Funnel:**
  - Destinations: find-funeral-cover.co.za quiz (14 ads), `/1life` (7), Meta instant forms (9).
  - Quiz: age, who to cover, how many, income, start date.
  - A fake "Matching plans / Checking availability" loader, then name and mobile, then "Phone call incoming..."
  - On the 1Life path, "Congrats, you have pre-qualified!"
- **Longest-running ads:**
  - 4 Aug 2025: 2 dynamic "compare funeral cover" ads
  - 2 Sep 2025: the "compares the top funeral insurers" video, first in its impressions sort
  - 18 Sep 2025: "R40,000+ / R49"
  - 27 Oct and 2 Dec 2025: "over R15,000 / from R70pm"
  - 19 Nov 2025: 3 videos, positions 2-3
  - 1 Dec 2025: "Avoid a R40k Funeral Bill"
  - 1Life co-brand: oldest active ad 14 Jun 2026; a burst of 6 videos on 1 Oct 2026
- **Page engagement:** 977 followers, 0 reviews. Latest feed item is a cover photo from 25 Apr 2025 (16 reactions, 8 comments, 1 share). The Page replied the same day with a templated "Would you like help with a personalized quote?" The web pass reports commenting is switched off on posts.
- **Compliance risks:**
  - Fabricated social proof: a Facebook-style comment widget with invented commenters ("83 / 141 comments / 55 shares").
  - Fake scarcity: "Discounted Rates Are Held Temporarily".
  - "We're completely independent. We don't favour any insurer", while each funnel routes to one insurer.
  - Product claims that conflict: "from R37pm" against Dis-Chem's published R49/R69; "up to R100 000" against "up to R125 000" on the same page.
  - The privacy policy names no responsible party or Information Officer, and consent is bundled.
  - Partner complaints on Hellopeter about Dis-Chem Life: "phoned 23 times in the last 3 days" (Nov 2025), "phone calls every 15 minutes" (Sep 2026) ([review](https://www.hellopeter.com/dis-chem-life-pty-ltd/reviews/watch-out-dischem-once-they-have-your-details-you-get-harassed-6588346)).
  - FAIS perimeter: the model is only lawful as pure referral ([Deneys Law note on *Raspberry*](https://www.deneys.co.za/thinking/marketing-financial-products-not-lead-referral)).

### 2.5 Assupol Funeral (First Impressions) and Assupol Cover (Virtusell)

Two separate affiliates in Assupol Life's co-brand programme. Neither is Assupol itself.

**Linking Assupol Funeral to First Impressions:**
- Hidden form field `FirstImpressions_Campaign_ID="AssupolCobrandedFuneralLLFirstImpressions"`
- WHOIS for assupol-funeral.co.za (registered 9 Mar 2026) names "First Impressions"
- CKG tracker (`trc.ckgholdings.co.za`) and the same GTM container (GTM-5H53HX98) as the funeral funnel
- The cover photo carries the FUNERALCOVERS wordmark with an "AFFILIATE PARTNER" badge

Assupol Cover is Virtusell (Pty) Ltd, which has run AssupolCover since Jun 2024 ([virtusell.io](https://virtusell.io/)).

- **Targeting:**
  - Budget-sensitive families
  - Prepaid, data-poor mobile users: a zero-rated mirror page, `goassupolcover1.datafree.co`, with "Our website is Datafree - saving YOU more money!"
  - Applicants 18-64, extended family to 79
  - Assupol Cover splits cold, video-viewer, warm and retargeting audiences by UTM tag
- **Hooks:**
  - "Assupol Funeral from R70/month" (9 headlines)
  - "from R5 per day"
  - "Funeral Cover With a Cash Back Benefit"
  - "no medical examinations"
  - Assupol Cover: "from R42 p/m" and "Stop overpaying for Funeral Cover!"
  - Link description: "Authorised financial services provider. FSP53"
- **Formats:**
  - Assupol Funeral: 19 video (mostly UGC-style talking heads), 11 image. 22 of 30 share one body text.
  - Assupol Cover: 12 dynamic creative, 1 video.
- **Funnel:**
  - **Assupol Funeral:** a quiz (cover type, age, how many people), then fake "Checking Assupol availability / Matching plans" screens, then name and mobile, then the thank-you page.
    - Thank-you lines: "Expect a call within 10 minutes", "Calls may come from different local numbers", "Missing the call may delay your cover", "You Are Dealing Directly with Assupol".
    - Consent is one line with no privacy link.
  - **Assupol Cover:** instant forms (7 ads), go.assupolcover.co.za (5), the datafree mirror (1).
- **Longest-running ads:**
  - Assupol Funeral: **none long-running.** All 30 cards started 21 Sep-3 Oct 2026 (13 on 22 Sep, 9 on 24 Sep). Earlier ads are gone. This is a fresh replacement batch.
  - Assupol Cover: oldest 17 Aug 2026 (2 dynamic ads, "Funeral cover from R70 p/m", instant form). 9 new ads on 1 Oct.
- **Page engagement:**
  - Assupol Funeral: 8,306 likes. Last item a cover photo on 31 Mar 2026 (11 reactions, 27 comments, 3 shares; probably enquiries). Replies not verified.
  - Assupol Cover: 4,088 likes.
- **Compliance risks:**
  - An affiliate-owned domain telling leads "You Are Dealing Directly with Assupol" (ambiguous, because the footer names Assupol Life FSP 53 as "Affiliate Partner").
  - Caller-ID rotation and pressure ("Missing the call may delay your cover").
  - Price inconsistency (R42 against R70).
  - Virtusell's privacy policy does not name Assupol as a recipient.
  - Insurer level: the SARB/Prudential Authority sanctioned Assupol Life R4m under the FIC Act in Aug 2024 ([SARB](https://www.resbank.co.za/en/home/publications/publication-detail-pages/media-releases/2024/sarb-imposes-administrative-sanctions-on-assupol-life-limed)). Hellopeter's /assupol page now redirects to /sanlam (TrustIndex 3.2).
  - Assupol appears to supply pre-approved copy: Finatic's compliance lines match First Impressions' word for word (inference).

### 2.6 Medical Aids South Africa (Adjacent Digital / LeadSure / Enex)

An affiliate content site that sells leads to "medical schemes, insurers, brokers" ([terms](https://medicalaids.org.za/terms-of-service/)).

- **Targeting:**
  - LSM 6+ adults interested in private healthcare, at every life stage (per LeadSure)
  - Content aimed at pensioners, pregnancy, HIV+, CTC subsidies and the Late Joiner Penalty
- **Hooks:**
  - "Medical aid to suit every stage of life. Compare plans from 12 medical schemes. Optional gap cover."
  - "Over 90 plans from 12 medical aids."
  - Choice and breadth, not a rand saving
- **Formats:** 2 static images. Both are Get quote ads going to Meta instant forms on FB, IG and Audience Network.
- **Funnel:** the instant form is the whole funnel. The website's "Get A Quote" button points to a `#medquote` anchor that does not exist, so it is dead ([get-quote](https://medicalaids.org.za/get-quote/)). Leads are pushed in real time into buyers' CRMs; buyers call.
- **Longest-running ads:** [3859075814340534](https://www.facebook.com/ads/library/?id=3859075814340534) and [528061536915795](https://www.facebook.com/ads/library/?id=528061536915795), both live and unchanged since **22 Jan 2025 (about 20.5 months)**. These are the longest-running creatives in the set.
- **Page engagement:** 5,302 likes. Organic posting is active (latest about 2 Oct 2026, "What is Polyarthritis?") but engagement is near zero: 0 reactions, 1 comment.
- **Compliance risks:**
  - Deemed consent: using the site counts as consent to phone, SMS and AVM contact.
  - Terms allow credit-bureau lookups.
  - Contradictory buyer claims: LeadSure's "only insurers" against its own call-centre-leads page.
  - The "12 schemes" are never named.
  - Advice-like copy ("find you the best medical aid plan").
  - Possible Medical Schemes Act s65/Reg 28 exposure on fees paid by schemes (inference).

### 2.7 CompareGuru SA (dormant)

FSP 47696, **verified** on the FSCA register: authorised 7 Feb 2017, Category I, non-automated advice and intermediary services, 3 representatives. The model is the closest legitimate analogue to a broker call-back: an online estimate, then a licensed "Guru" phones to advise ([compareguru.co.za](https://compareguru.co.za/)).

- **Ads:** 0 active on Meta. 0 in the [Google Ads Transparency Center](https://adstransparency.google.com/?region=ZA&domain=compareguru.co.za).
- **Organic:** dormant since a 2 Nov 2022 post.
- **Page:** 18K followers, 82% recommend (27 reviews).
- **Risks:**
  - The compliance officer named on the site differs from the register.
  - The complaints page omits the National Financial Ombud.
  - "Save up to 75%" is unsubstantiated.
  - The site claims "healthcare benefits" authority, which the register does not show.
- **Relevance:** not a current bidder. Its WhatsApp click-to-chat side door (`wa.me/27212026367`) is the only WhatsApp entry among the core seven.

---

## 3. What has probably been profitable

**Read this first.** The Ad Library cannot show profit. The most it shows is that an ad is **still being funded today**. Long runs are a weak positive signal ([Motion methodology](https://motionapp.com/library/research/creative-benchmarks-2026/methodology); [Jon Loomer](https://www.jonloomer.com/one-ad-gets-all-the-budget/)):
- Meta can starve "active" ads of budget.
- Dynamic-creative containers hide which asset carries the spend.
- Paused-then-reactivated ads keep their old start dates.
- Killed ads are invisible.
- Insurance profit depends on close rate and lapses. ASISA reports about 4.3M recurring risk policies lapsed in H1 2024 against 35.2M in force ([Moonstone](https://www.moonstone.co.za/life-insurers-pay-out-r298bn-as-policy-lapses-remain-a-concern/)).

Confidence below means confidence that **the pattern is still being funded**, not that it is profitable.

| # | Pattern | Run-length and variant evidence | Confidence | Caveats | Use for SortMyCover |
|---|---|---|---|---|---|
| 1 | **Static instant-form evergreens** (Medical Aids SA) | 2 ads unchanged since 22 Jan 2025 (about 20.5 months), **the longest in the set** (A) | Medium that they are funded today; budget unknown | No new creative since; it could be a small evergreen budget or a large one. Start date plus "active today" does not prove continuous delivery | Format lesson: a plain static and an instant form, left unchanged once it works. Static vs video is already our cycle-2 test |
| 2 | **Generic "compare funeral cover" ads** (Funeral-cover.co.za) | About 13 ads, started 4 Aug-2 Dec 2025, still active (10-14 months). Top of its own impressions sort is the 2 Sep 2025 video (A) | Medium that one advertiser keeps investing in this angle | Only one advertiser. The impression sort is cumulative and within one advertiser. Not evidence that comparison ads are the most durable format | **Do not copy the hook** (a product comparison with a best-price claim; R1, R2). The audience is mostly below our R750 band. Lessons: one plain promise, steady running |
| 3 | **Price anchors plus objection removers** (GetLife R93; funeral "from R49/R70") | GetLife's "R93/month no-medical" ad since 7 Dec 2025 (about 10 months) plus 7 variants. Funeral-cover's "R40,000+ / R49" since 18 Sep 2025; its other two cost-anchor ads ran about 1-3 months (A) | Low-medium | Only 1 of the 3 dated funeral cost-vs-premium ads lasted. Insurers anchor on premium alone. "Fast payout" is on landing pages, not in the ads | **Unusable** (R1, R2, banned hooks; recruits people below our band) |
| 4 | **"South Africans [group]… NEED This!" call-out** (GetLife; Cover Bokkie copies it; Consumer Advice for wills) | GetLife: 2 such ads in positions 1-2 of its own sort since 29 Apr 2026 (about 5 months). Consumer Advice: first in its sort since 28 Jun, but the hook is in 4 of 7 ads, so first place would happen about 57% of the time by chance (A observed; inference on meaning) | Low-medium (GetLife), low (Consumer Advice) | Shows where those advertisers put delivery, not cheaper or better leads. Cover Bokkie copying it is imitation, not independent discovery | Adapt only as a third-person life-stage hook (section 4) |
| 5 | **Single-insurer co-brand funnels** (First Impressions; Virtusell) | Funeral-cover's 1Life ads: oldest active 14 Jun 2026; 6 new on 1 Oct. Assupol Funeral: all about 30 cards are 21 Sep-3 Oct (≤15 days). Assupol Cover: oldest 17 Aug (A) | Low; too new to read | Not a new model: First Impressions began with a Dis-Chem Life co-brand in Apr 2025; AssupolCover since Jun 2024. The operator runs generic and co-brand funnels side by side, and the generic creative is the long-lived one | **Do not copy** (R2; see section 4) |
| 6 | **Hippo brand plus creator ads** | Nothing active older than about 2 months; batches every 1-3 weeks; top of sort is "Save R539" (since 26 Aug) (A) | Low for any single creative | Traffic is brand and SEO-led (Semrush estimate, C). The Ad Library says little about Hippo's economics | Lesson from its self-reported follow-up change, not its ads (section 4) |
| 7 | **Video and dynamic creative dominate counts** | Across Hippo, Funeral-cover, Assupol Funeral and GetLife: 106 of 123 Library IDs are video or dynamic; 17 are tagged images (A) | Medium that video is heavily used | Dynamic containers can hold images, so the true static share is anywhere from about 14% to 61%. Assupol Funeral is 37% images. Counts are not spend | Cycle 1 is already all video. Static vs video stays a cycle-2 test. Dynamic creative stays **off** for clean attribution (campaign-spec 4.2) |
| 8 | **Own quiz page rather than instant form** | Quiz-routed ads: Funeral-cover 21/30, Hippo 44/49, Assupol Funeral 30/30. But Assupol Cover has 7/13 on instant forms (a majority), and Medical Aids SA uses instant forms only (A) | Medium that both routes are used; no read on which performs | Likely partly driven by Meta's Lead Ads terms, which forbid income/financial questions inside instant forms | Supports the current plan: A1 Higher Intent form now; Campaign B quiz built and paused; switch on at qualify rate below 50% (campaign-spec §11). Not a reason to flip to quiz-first |
| 9 | **Bursts of new creative** | Consumer Advice adds ads at gaps of 25, 28 and 7 days. Assupol shows single bursts. Medical Aids SA has added nothing since Jan 2025 (A) | Activity signal only | Ad IDs are not unique creatives; bursts in regulated categories follow approval cycles; survivorship bias | **Not a budget proxy and not our cadence.** We launch only on the campaign-spec §11 triggers after a clean compliance-qa pass |

**Context: why funeral affiliates can afford volume.** Our earlier research found SA funeral commission is uncapped, while life commission is capped at about 1.13x year-one premium. That funds insurer cost-per-lead programmes in funeral. Funeral's mass-market premiums sit mostly below our R750 a month band, so funeral run-lengths say little about what will work for SortMyCover's 35-50 life-cover buyer. (Internal research; B/C)

---

## 4. Copy, adapt, avoid

### 4.1 Copy (already consistent with our rules)

| What | Seen at | Our version | Rule tie |
|---|---|---|---|
| Leave a working ad running unchanged | Medical Aids SA (20.5 months); Funeral-cover generics | No edits in days 1-14; verdicts only after R3,000 or 14 days (campaign-spec §4.4, §11) | Process |
| One plain promise per ad, in third person | Medical Aids SA's two-line statics | "A free 30-minute call with a licensed adviser" (form intro title) | R1, R3, R4 |
| Qualifiers first, contact details last, with an honest "can't help" exit that stores nothing | Consumer Advice "cannot-assist" branch; Funeral-cover 1Life screen | Already in A1 (3.3-3.4) and Campaign B (`page.js show(9)`) | POPIA s10 minimality, 2.1.7 |
| Several distinct angles live at once | Hippo, Consumer Advice | 5 concepts / 6 ads in cycle 1 (NH-64) | Process |
| Reply to comments | Funeral-cover replied within about 5 h; Hippo and GetLife left comments unanswered | Within 15 min, 07:00-22:00 (content-engine §7) | R1 (no advice in replies) |

### 4.2 Adapt (keep the mechanism, change the wording)

| Competitor tactic | Why it can't be used as is | Compliant adaptation | Rule tie |
|---|---|---|---|
| "South Africans Born Between 1959 and 1999 Without Life Insurance NEED This!" | States the viewer's age and lack of cover; "NEED" is a recommendation; "!" and the emoji are banned; the 27-67 band falls mostly outside our 35-50 band | Life stage, third person, no cover-status claim: "At 40, life is bigger than the cover." (accepted, phase4-review-2 C-11); "Cover set up at 28. Life at 40." (H5, live slot 5) | R3, R1 |
| "Expect a call within 10 minutes" / "Phone call incoming" | Implies an unrequested call now; leads to call-hammering complaints | "Pick a time that suits." The WhatsApp message names the adviser and FSP number within 60 s; the call is at a time the person chose | R4, F3 |
| "No contact details required" | Untrue for a funnel that books a call | "Four questions first. Contact details last." (true of A1 and Campaign B) | 2.1.5 (honesty) |
| Objection removers ("no medicals", "payout in 48h", "cash back") | These are product claims; we have no product | Process objection removers only: "Free. 30 minutes. Video, WhatsApp or phone. No obligation." | R1, R2 |
| "Consumer champion" framing (Consumer Advice) | Was misleading in their hands | The honest trust pillar: how to check an FSCA licence, where complaints go for free (D01, D10, D14) | R1 |
| Free will as the entry point (Consumer Advice to Capital Legacy) | It was a product offer plus a fear-primed upsell | The topic only: "a will, a nomination and life cover do different jobs" (idea CI-05). No free-product offer, no premium calculator | R1, R2 |
| Hippo's follow-up fix (user chooses, then gets the call) | Its mechanics are quote-picking and nudges to people who didn't finish | Contact only after a consented submit, by the one named practice, through WhatsApp utility templates, at a time the person picks. Never claim "WhatsApp beats calls" | POPIA s69, campaign-spec §14 |
| Click-to-WhatsApp entry (Micro Insurance Solutions, Metropolitan, MiWayLife, Baroka, Go Insurance) | Already common in funeral, so there is no gap to own | Stays **Test C, built and paused**, on Meta's test number until the first payment (NH-31 b). Consent buttons open the chat; the website CTA stays primary (5 Oct rule) | R4, F4 |
| UGC talking heads (Assupol Funeral) | Testimonials need real, consenting people; AI people are never allowed | Cycle-2 hypothesis only: a real, consenting licensed adviser explaining the process. No client stories until real and consented | 2.1.5 |

### 4.3 Avoid

| Tactic seen | Where | Rule it breaks |
|---|---|---|
| Price anchors, "from R…", cover amounts, "save X%" | GetLife, Funeral-cover, Assupol, Hippo, Cover Bokkie | R1, R2, banned hooks. It also recruits people below the R750 band, who are routed out and push up cost per qualified lead |
| "Compare", "best", "cheapest", "finds you the best cover" | Funeral-cover, Hippo, GetLife | R1 (FAIS: product comparison or recommendation from a non-FSP) |
| Insurer co-branding, insurer FSP number in ads, "Affiliate Partner", "You Are Dealing Directly with X" | Assupol affiliates, Funeral-cover 1Life funnel | R2; misleading-identity risk (ARB vs Cover Bokkie, 2 Oct 2025) |
| Routing leads to a single insurer's call centre | First Impressions, Virtusell | R2 (broker-neutral) |
| "Get quote" CTA | Almost everyone | R4 ("Learn more" only) |
| Fear framing ("Avoid a R40k Funeral Bill", "the government takes control", the Guardian's Fund) | Funeral-cover, Consumer Advice | Banned hooks (no fear or death imagery) |
| Second-person or group call-outs; landers aimed at religion, language or age | GetLife, Consumer Advice | R3; POPIA s26 (religion is special information); Meta personal-attributes policy |
| Fabricated or borrowed social proof: comment widgets, unsourced review badges, borrowed statistics, templated testimonials, geo-IP "local families" | Funeral-cover, Consumer Advice, Cover Bokkie | 2.1.5 (no fake testimonials, reviews or statistics) |
| Fake "Matching plans" loaders, "Congrats, you have pre-qualified!" | Funeral-cover, Assupol Funeral | R1 (implies product matching or underwriting); misleading representation |
| False urgency and scarcity ("rates held temporarily", "limited to 100", "missing the call may delay your cover") | Funeral-cover, Cover Bokkie, Assupol Funeral | Brand voice ban on urgency theatre; misleading-advertising risk |
| Browse-wrap or deemed consent, unnamed recipients, data "sold to our clients", remarketing SMS | GetLife, Consumer Advice, Medical Aids SA | POPIA s18/s69; our named, unticked consent tick (CONSENT-NAMED-v1) |
| Caller-ID rotation and repeated calls | Assupol Funeral; buyer complaints for Dis-Chem Life and Hippo | POPIA s69; no cold calling (NCC pack); our brand promise |
| Income questions, quiz answers in Pixel/CAPI/URL | GetLife, Funeral-cover | POPIA minimality (the budget band is enough); Meta Business Tools Terms (no financial info) |
| Audience Network, zero-rated mirror pages | Funeral-cover, GetLife, Assupol | Already excluded (campaign-spec 4.2); these reach people below our band |
| Fees tied to policies ("referral fee… when a policy is placed"); "best advice" wording | GetLife, Consumer Advice | 2.1.1 / F2 ([*Raspberry Academy v Oaksure*](https://www.cliffedekkerhofmeyr.com/en/news/publications/2026/South-Africa/Corporate-Commercial/corporate-commercial-alert-5-august-is-your-lead-generation-model-about-to-become-illegal), [2026] ZAGPJHC 388) |
| Shipping copy nobody read | Lead Guru (leftover LLM text) | compliance-qa gate on every new string (G8 #1) |

**On *Raspberry*.** The court looked at conduct, not just the fee: pay only when a policy was taken up, a "discuss appropriate cover" script, control over which products were offered, and a duty to report back ([Moonstone](https://www.moonstone.co.za/referral-fees-and-fais-when-a-lead-becomes-intermediation/)). Our fee is flat, which covers the first factor. The conduct side needs three things:
- messages limited to logistics, with no "warming";
- no say over the adviser's products;
- a decision on how much adviser feedback flows back to us.

See action 2 in section 7.

---

## 5. Ten ad and post ideas derived from this (all compliant by design)

**Applies to all ten:**
- Every post ends with the CTA `Pick a time for a free 30-minute call with a licensed adviser: sortmycover.co.za` and the closing line `SortMyCover gives no financial advice, product comparisons or premium quotes.`
- No "Lead Velocity" in copy or image.
- Hooks are 9 words or fewer, third person, with no prices, products, insurers or fear images.
- Every number carries a source and date in the post file.
- **Every new string needs a compliance-qa pass before use** (content-engine §9).
- Paid ideas join the refresh pool behind the current order (campaign-spec 4.5). They need Meta approval and Jonathan's go.

| ID | Type and format | Hook (frame 1 / line 1) | Body gist | Derived from | Rule check | Open before use |
|---|---|---|---|---|---|---|
| **CI-01** | Paid video (9:16 + native 4:5), instant form A1, "Learn more" | "One adviser. One call. A time picked first." | Beat 2: "Details go to one named licensed adviser. Nobody else." Beat 3: "Free. 30 minutes. Video, WhatsApp or phone." | Call-hammering complaints (Hippo's top Hellopeter mention; Dis-Chem Life; the ARB complainant "inundated with calls"; "calls may come from different local numbers") | R1-R4. True only while consent is named per broker (CONSENT-NAMED-v1, one form per broker, NH-22 e) | If `consent_mode` ever switches to generic, rewrite beat 2. No competitor named or implied |
| **CI-02** | Organic carousel (5 cards, 4:5); Story follow-up | "Three checks before typing a number into a form." | 1) Is a named practice and FSP number shown next to the tick? 2) Does it say how many will call, one or "partners"? 3) How it stops: reply STOP; POPIA lets a person ask where their details came from; the NCC opt-out registry | GetLife browse-wrap consent; Consumer Advice "to be sold to our clients"; TIH group data pool | R1 (consumer rights, no product). Shows our own named tick as the honest example | Source lines: POPIA s69/s23; NCC registry per [CDH, 26 Aug 2026](https://www.cliffedekkerhofmeyr.com/en/news/publications/2026/South-Africa/Corporate-Commercial/combined-corporate-and-commercial-and-insurance-law-alert-26-august-2026-cpa-direct-marketing-amendments-when-the-cpa-applies-to-fsps-and-insurers). Confirm the Information Regulator contact |
| **CI-03** | Organic Reel (20-25 s, screen recording) | "After the form: every step, shown on screen." | The real flow with test data: four questions, then a WhatsApp within a minute naming the adviser and FSP number, then pick a time, then a reminder. No "matching" or "pre-qualified" language | Competitor thank-you pages ("Phone call incoming…", "within 10 minutes") and fake loaders | R1, R4; no real lead PII on screen | Adviser name and FSP on screen only with the practice's written OK; otherwise a placeholder adviser card |
| **CI-04** | Organic carousel; promote to paid only if top 2 on sends per reach | "Life at 30. Life at 45. Same cover?" | Card 2: "Life at 30: one salary, a car, maybe rent." Card 3: "Life at 45: a bond, school fees, people who rely on the income." Card 4: "A licensed adviser looks at the gap on a free 30-minute call." | The "born between" call-out at the top of GetLife's sort, rebuilt as third-person life stage | R3 (age as life stage, as accepted in C-11; follows the H4 "Same old cover?" pattern); no claim about the viewer's cover | compliance-qa to confirm card 3 is not a family-attribute claim. Keep distinct from H5 in paid |
| **CI-05** | Organic carousel | "A will, a nomination, life cover: three different jobs." | A will says who inherits and can name a guardian for children. A beneficiary nomination tells an insurer who to pay (retirement funds differ: s37C, see D08). Life cover pays money out. Many families use all three | Consumer Advice's free-will funnel into estate-cost cover | R1, R2 (no will service or policy offered) | Source for guardian nomination (Master of the High Court / Wills Act) to pin; reuse D08's s37C sources |
| **CI-06** | Organic Reel | "Myth: a quote call can't start a policy." | A policy should only start with the applicant's clear agreement. Check every new debit order. An unexpected policy can go to the free ombud | The FAIS Ombud's warning on policies issued after "it was just a quote" ([FAIS Ombud](https://www.faisombud.co.za/latest-news/fraudulent-funeral-policies/)); Hippo and Dis-Chem Life debit-order complaints | R1 (consumer rights); no insurer named | Confirm the Ombud's exact wording and the DebiCheck source (PASA) before use; NFO details from D10 |
| **CI-07** | Organic still (4:5) | "What 'from' means in an insurance ad." | A "from" price is the lowest premium on offer. The actual premium depends on age, health, the amount of cover and the insurer's rules, which only a full quote shows. Reads with no numbers on the image | The price anchor used by nearly every funeral and life advertiser (R37, R42, R49, R70, R93) | R1 (education, no comparison); no figures, so it clears the banned-hooks rule | **Needs a sourced line** (FSCA/PPR advertising rule or an insurer's own "premiums are risk-profile dependent" disclosure, unnamed). compliance-qa must confirm this is not a product comparison |
| **CI-08** | Organic still (Fri trust slot) | "How SortMyCover is paid. Never per policy." | Adviser practices pay a flat monthly fee. It never depends on whether anyone takes out a policy. The adviser explains their own fees and disclosures on the call | Competitor fee ambiguity (GetLife: "when a policy is placed" vs "when you request a call"; Consumer Advice "may be paid a referral fee") and the *Raspberry* ruling | 2.1.1 / F2 stated publicly; R1 | Wording check against the Broker Services Agreement; no "Lead Velocity" in copy |
| **CI-09** | Paid static (4:5 and 9:16 still), cycle-2 static arm or Phase 2 retargeting creative | "A free 30-minute call with a licensed adviser." | Line 2: "Four questions. A time that suits. No obligation." Brand lock only | Medical Aids SA's unchanged two-line statics (20.5 months) | R1-R4. Retargeting uses Meta audiences only, never direct messages to people who did not submit (campaign-spec §14) | Slots into the planned `C01_H1_sta` vs `vid` test or the Phase 2 ad set. Not before those gates |
| **CI-10** | Organic Reel | "What a licensed adviser says in minute one." | Their name, practice and FSP number; which insurers they can place with; how they are paid; and that the choice stays with the person. Then: check the FSP number on the FSCA site (D01/D14) | Affiliates borrowing an insurer's FSP number and saying "dealing directly with Assupol"; the ARB ruling on implying insurer identity | R1, R2 (describes adviser duties, names no adviser or insurer) | Cite the exact FAIS General Code of Conduct sections once compliance-qa confirms them |

---

## 6. Spend benchmarks we can use (graded)

**Bottom line.** Competitor spend in SA cannot be observed, and no audited, insurance-specific SA Meta CPL benchmark exists. Our economics must come from our own Campaign A data, read over cycles 1-3, not cycle 1 alone.

| Benchmark | Figure | Grade | Use it for | Don't use it for |
|---|---|---|---|---|
| Competitor Meta spend (all SA commercial ads) | Not shown: spend and reach are null | A | Stating the limit honestly | Any rand figure |
| Lead Guru, all brands | About R100k-R500k a month (analyst inference from about 30 Cover Bokkie ads plus GetLife, with weekly new creative) | Inference, low | Rough sense of scale only | Planning or pitching |
| SA financial-services Meta CPL | **R200-R500 per raw lead** (research.md S4, one 2026 SA guide) | C | Our weak prior; already the basis of the R200 model CPL and R250 stress line | Treating it as proven; replace with our own data by day 14 |
| SA all-industry median Meta CPL | R9.11; monthly swing R3.73-R178.69 ([Superads](https://www.superads.ai/facebook-ads-costs/cost-per-lead/south-africa)) | C | Nothing; not comparable | Any insurance comparison |
| US Finance & Insurance Meta CPL | About $38 ([LocaliQ](https://localiq.com/blog/facebook-advertising-benchmarks/)) | C | Context only | SA planning |
| Creative volume by spend tier | 2.8 new creatives a week under $10K a month, up to 18.9 at $1M+; Finance runs about a third of Health & Wellness volume at the same spend ([Motion](https://motionapp.com/library/research/creative-benchmarks-2026/)) | B (global); C for SA mapping | Ranking SA peers as "testing actively" or "static" | Budget tiers. Every SA operator seen falls in the bottom band (under $10K, about R175K a month) |
| Winner concentration | About 5% of creatives become winners and take about 55% of spend ([Motion](https://motionapp.com/library/research/creative-benchmarks-2026/)) | B | Expect 1-2 of our 6 ads to take most delivery; don't read starved ads as losers | Predicting which ad wins |
| Hippo follow-up economics | About 5.5M calls a year replaced; "27% more effective"; about 300 extra customers a month; R4.2m a year saved ([Salesforce](https://www.salesforce.com/eu/blog/hippo-co-za-digital-marketing-journey/)) | C (self-reported, car only) | The direction: consented, user-led follow-up | A WhatsApp-beats-calls claim |
| Google CPCs (if a search test is ever considered) | "car insurance quotes" $24.86; "insurance quotes" $12.66; "cheap car insurance" $25.19; "medical aid quotes" $2.47; "medical aids in south africa" $1.84 (Similarweb) | C | Order of magnitude for SA insurance search | Life-cover search (not captured) |
| Market size cap | 10.39M new individual recurring-premium risk policies sold in 2024, 6.24M of them funeral ([Moonstone/ASISA](https://www.moonstone.co.za/life-insurers-pay-a-record-r639-billion-in-2024/)) | A (data) | Sanity-checking competitor claims | CPL |
| Traffic-tool accuracy | About 50% average error, worst under about 5K visits a month ([Promodo](https://www.promodo.com/blog/data-accuracy-at-similarweb-ahrefs-and-semrush)) | B | Trends and relative ranking | Absolute traffic for funnel domains |

**Our own numbers.** These are internal targets, not benchmarks. Source: `campaign-spec.md` §11-12 and `ops.watchlist_targets`.
- Budget: R246 a day entered (about R283 including VAT); R7,384 a month entered.
- No verdict before R3,000 spend or 14 days.
- Cost per qualified lead: R250 or less at 14 days, trending to R200.
- Raw CPL model R200. Break-even R397 at 60% qualify, R468 at 70%.
- Cost per good-fit meeting: target R1,300, stretch R900. Readable only after 5 or more broker-rated meetings (about R6,500+ of media).

**How we build a real benchmark.** Take a manual weekly Ad Library snapshot (ToS-compliant) of the eight Pages above plus the click-to-WhatsApp funeral advertisers. Record Library IDs, start dates, status, "multiple versions" and collation. After 8 weeks we will have real run lengths, kill rates and new-ad counts per advertiser. That is the only legitimate way to see a creative stop.

---

## 7. Actions arising

1. **Template blocklist gap (automation-engineer).** `automation/templates/check.mjs` line 24 lists Old Mutual, Sanlam, Discovery, Liberty, Momentum, Hollard, Clientele, OUTsurance, BrightRock, FMI, PPS and Assupol. Insurers seen in this sweep are missing: 1Life, AVBOB, Metropolitan, Dis-Chem Life, King Price, MiWay, Guardrisk, Budget, Dial Direct, First for Women, Auto & General, Virseker, Santam, Naked, and Capital Legacy (wills). Add them so a WhatsApp template naming them fails the automatic check.
2. **Raspberry conduct question (media-buyer and compliance-qa, for the practitioner).** Campaign-spec sends the broker's 1-5 `GoodFit` score to Meta and pauses ads on broker quality ratings (§11, §11.1b). PN-v1.1 already discloses the rating (`consent-and-privacy.md` l.113), so this is **not** a notice gap. The open question is whether a quality-rating feedback loop reads as a *Raspberry* "duty to report" or control indicator, or whether feedback should be limited to attendance and contactability. Add it to the practitioner brief; change nothing until answered.
3. **Weekly Ad Library snapshot (meta-operator).** Start 13 Oct 2026, same Pages, same fields (section 6). Manual only.
4. **Manual FSCA register checks (compliance-qa).** Check Worldwide Leads / Consumer Advice, Lead Guru, First Impressions / CKG Holdings and Virtusell at [www2.fsca.co.za/Fais/Search_FSP.htm](https://www2.fsca.co.za/Fais/Search_FSP.htm). Automated queries were unreliable.
5. **Brief hygiene.** Use the Ad Library page IDs in section 1.1 from now on. Consumer Advice is active (7 ads), not dark.