# DRAFT - desk research for the creative strategist and media buyer; not legal advice

# Meta angles for long-term insurance and wills/estate leads, ages 35-50, South Africa

Researched 10 Oct 2026 (all pages retrieved that day). Builds on, and does not repeat: `deliverables/creative-strategist/angle-ranking.md`, `concepts.md`, `deliverables/media-buyer/campaign-spec.md`, `docs/research/high-premium-client-meta-targeting.md`, `deliverables/market-research-analyst/research.md`, `deliverables/verified-facts.md`, `deliverables/website/research/compliance-sa.md`, `deliverables/meta-operator/competitor-intel-2026-10.md`.

**Scope (coordinator update, 10 Oct 2026):** long-term insurance other than funeral (life, disability, severe illness, income protection, retirement products) PLUS wills and estate planning. Extended-family and funeral-led angles are out.

**Evidence grades.** A = primary document, Meta/regulator/statute page that I read. B = press, practitioner or industry body reported second-hand. C = vendor or agency marketing. D = my inference or arithmetic (labelled). Section 10 says for each source whether I READ the page or only saw a SEARCH SUMMARY of it; a search summary is never graded above B. Anything before 2024 is marked **STALE?**. Nothing below is invented; what I could not source is **UNVERIFIED**.

---

## 0. The three most decision-relevant facts

1. **At about 9 leads a week (about 36 a cycle) you cannot rank angles on cost per lead.** Exact binomial test, equal spend, lead split 15:8 gives p = 0.21; 20:10 gives p = 0.10; 30:15 gives p = 0.04 (D, my calculation). Simulating Poisson counts, a true 2x-better angle is detected at p < 0.10 about 80% of the time only when the weaker arm has about 20 leads (stronger about 40). A true 1.5x gap needs more than 30 in the weaker arm to reach even 47% power (D). Six ads in a 36-lead cycle is about 6 leads each. Angle choice must be read from upstream signals (hook rate, outbound click, form-start) and from pooled "angle families" over several cycles, not from lead counts per ad. Section 8.
2. **No public, independent study compares angles by cost per qualified lead for life or financial-protection offers.** What exists is vendor or agency prose with US dollar CPL ranges and no method (section 1). The rankings below are hypotheses built from (a) solid demand-side South African data (ASISA gap study, Sanlam wills survey, SARS), (b) what Meta says about creative diversification, and (c) what competitors keep running. They are not performance rankings, and the internal scores in `angle-ranking.md` have the same status.
3. **Wills and estate planning split cleanly in regulation, and the headline statistic is unreliable.** The Master's page says anyone aged 16 or over may make a will, and the Legal Practice Act s33 as I read it does not reserve will drafting to attorneys (A; conclusion D). But recommending that someone buy a policy (for example cover to fund an estate) is FAIS "advice" and needs an authorised provider. "Most South Africans die without a will" has three figures behind it: under 15% have a will at death (Master's 2022 data, quoted second-hand, B), 28% of survey respondents have a valid signed, witnessed, stored will and 65% none (Sanlam Legacy 2026, n = 1,200 online convenience sample, B), and about 70% without (M&G opinion piece, B). Use the Sanlam figure with its sample caveat, or file the Master's primary first. Section 6.

**Two flags that could break the build, each a 10-minute check in Ads Manager before launch:**
- Secondary sources say Meta's Lead Ad terms bar collecting financial or insurance information in instant forms (B, section 2.5). `campaign-spec.md` A1 asks a monthly-budget question inside the form. If Meta rejects it, move that question to the WhatsApp opener or landing page. I could not read the Lead Ad Terms.
- Advantage+ creative can rewrite headline text by default (B, section 2). For regulated copy it must be switched off per ad, or the approved wording is not what runs.

---

## 1. What is published about angles that work (life and financial protection, Meta)

**Honest summary: thin, mostly US, mostly vendor.** Every row is a hypothesis source, not a result.

| Claim | Source (URL, date) | Grade | Use |
|---|---|---|---|
| Life-insurance Facebook ads do best "when tied to specific life milestones" (new parents, first-time homeowners, engaged couples, job changers); family scenes beat stock; 15-30 s video with on-screen text; 3-5 form fields; lead forms give volume, landing pages give qualification; CPL USD 15-75; judge after at least 2 weeks; refresh when frequency exceeds 3 | https://clicksgeek.com/life-insurance-facebook-ad/ (18 Mar 2026), read | C | Supports trigger-event angles. US CPLs do not transfer to ZA. "Frequency above 3" is practitioner folklore |
| Five formats: lead-form quiz ("Answer 3 questions to see if you're overpaying"), sub-45 s video explainer, carousel self-selection, testimonial, deadline urgency; no numbers | https://www.gethookd.ai/learn/5-insurance-facebook-ad-examples-in-2026/ (2026, Oct), read | C | Quiz and self-selection fit our funnel. Urgency and testimonial are blocked by our rules (compliance-sa S17, S25) |
| "Self-selecting hooks": the ad says who it is for so the wrong person scrolls past; UK Facebook/Instagram CPL GBP 15-60 across industries, protection leads GBP 5-20; "a USD 9 lead that never answers loses to a USD 28 lead that books" | https://lurvodigital.com/guides/life-insurance-lead-generation-uk/ and other UK 2026 guides, search summary | C | Supports hook-as-filter (already adopted in `high-premium-client-meta-targeting.md`). UK CPL not transferable |
| Estate planning lead-form CPL USD 35-70; "qualified" CPL USD 150-300 | https://localiq.com/blog/facebook-advertising-benchmarks/ , search summary, 2026 | C | Order of magnitude only; method unknown |
| Creative hit rates (share of ads reaching 10x the account-median spend): text-only 11.6%, product image plus text 8.75%, UGC 7.56%; about 5% of ads are winners; for finance the report says "credibility-forward formats and explanatory visuals"; 550,000+ ads, about USD 1.3bn, Sept 2025 to Jan 2026 | https://motionapp.com/thumbstop-pulse/creative-benchmarks-2026/ , read | B (large, but e-commerce and holiday weighted; not a life-insurance dataset) | Text-led static creative is not a handicap. UGC is a volume play, not a hit-rate play |
| Click-to-WhatsApp versus lead forms: "lead-to-qualified" 20-40% (forms) versus 45-70% (CTWA) | https://www.wati.io/en/blog/click-to-whatsapp-ads-vs-lead-form-ads-roas/ , read (no dates, no sample sizes, vendor) | C | The page has no independent or Meta-sourced benchmark. Treat as marketing |
| Meta: Advantage+ leads campaigns "14% lower cost per lead" and "10% lower cost per qualified lead"; with first-party data "15% lower cost per quality lead and 44% increase in rate of converting a lead to a quality lead". No test dates or regions on the page | https://web.facebook.com/business/ads/meta-advantage-plus/leads , read; first announced 30 Oct 2025 per https://www.socialmediatoday.com/news/meta-lead-gen-ad-updates-ai-targeting-verification-crm-expansion/804301/ , read | A for "Meta says"; method unknown | Meta self-reports; "average" across all verticals |
| Australia and UK angle-versus-CPL studies | searches 10 Oct 2026 returned product pages only | - | **Not found / UNVERIFIED** |

**ZA competitor behaviour** is already in `competitor-intel-2026-10.md` (not repeated): a wills funnel runs "South Africans without a valid Will NEED THIS" and "free will"; a life lead-gen runs a price anchor and the same call-out; the longest-running ads are plain statics with instant forms. The Ad Library shows no spend or CPL for ZA (that file, 1.3), so this shows persistence, not profit.

---

## 2. What changed in Meta in 2025-2026 that matters for creative

### 2.1 Creative diversification replaced audience targeting
- Meta's retrieval system "Andromeda" rewards genuinely different creatives; visually similar ads are not diversification; Meta's line "creative differentiation effectively replaces what audience targeting used to do". The old "six ads per ad set" guidance is called outdated; the author says 10, 20 or more with real variety (Jon Loomer relaying Meta resources, https://www.jonloomer.com/meta-andromeda-creative-diversification/ , 20 Oct 2025, read; B, because Meta's own two articles were not read).
- Claims that a Meta test found one ad set with 25 diverse creatives beat five ad sets of five (17% more conversions, 16% lower cost), and that "similarity above 60%" collapses ads into one: search summary only (https://confect.io/tactics/meta-andromeda-2026 ; B/C). **UNVERIFIED at Meta.**
- 26 Aug 2026: an Ads Manager "Creative Diversity" rating (Low/Medium/High on format variety), "estimated and in development"; practitioners report healthy sets still rating Low (https://adsuploader.com/blog/meta-ads-updates , read; C).
- **For our budget:** diversification means different concepts and formats, not ad count. R8,492 cannot feed 20 creatives. Four to six distinct concepts in one ad set is the realistic floor. Colour variants of one concept do not count (the internal files already say so).

### 2.2 Targeting levers shrank
- Detailed-targeting exclusions removed 31 Mar 2025; interests consolidated 23 Jun 2025 (already cited in `high-premium-client-meta-targeting.md`, grade C).
- **19 Aug 2026 test:** "Excluding placements, platforms, devices and operating systems will no longer be available", currently for Sales and Leads objectives (adsuploader, C). The plan to exclude Audience Network may not be possible. Check on the screen.
- 7 Aug 2026: exclusion-only custom audiences (one-way; cannot seed lookalikes), suited to "existing clients and old leads" (same source, C).

### 2.3 Special Ad Category and financial-ad policy
- Meta developer docs: Financial Products and Services is required from 14 Jan 2025 for advertisers "based in the United States or showing ads to audiences in the United States"; restrictions: age 18-65+, all genders, no saved or lookalike audiences, minimum 15-mile (25 km) radius. **South Africa is not mentioned** (A, https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category , read). A practitioner summary says the rules "cover ... Africa" (search summary of https://leadsync.me/blog/special-ad-category-meta/); that conflicts with Meta's page and is **UNVERIFIED**. The `campaign-spec.md` section 10 procedure (record what Ads Manager shows; declare if prompted) stays correct.
- Meta ad standard: ads for credit cards, loans or insurance "must be targeted to people 18 years or older"; advertisers "may be required to verify their business and/or individual identity" and show regulator authorisation where required (A, https://transparency.meta.com/policies/ad-standards/restricted-goods-services/financial-services/ , read). Whether verification is mandatory for South Africa: **UNVERIFIED**. A blog says verification expanded from 12 to 38 countries in 2026 without a list I could read (C, https://dhruboduti.com/blog/financial-advertiser-verification-on-meta-now-required-in-38-countries-what-this-means-for-fintech-and-finance-ads).
- Meta's AI lead-capture agent for instant forms excludes regulated verticals including financial, at launch on 9 Jul 2026 (adsuploader, C). No AI-chat form for us yet.

### 2.4 Format, UGC, founder-led
- No source found showing video beating static for life or financial-protection leads. Motion's data favours text-led and explanatory creative for finance (section 1). Our rules block testimonials and fear imagery. A founder or adviser on camera is compliance-neutral only if they make no product claim and are a real, consenting adviser (compliance-sa S17). No performance evidence either way: **UNVERIFIED**.

### 2.5 Instant form versus landing page versus WhatsApp
- New verification options on instant forms: SMS phone verification, work-email verification, address validation test (announced 30 Oct 2025; socialmediatoday, read; B). Fits the WhatsApp verification in `campaign-spec.md`.
- "Higher Intent forms cut volume 20-40% for cleaner leads" is practitioner-only (already in the internal file, C).
- **Financial questions in instant forms.** A search summary says Meta's Lead Ad terms and Advertising Standards prohibit collecting financial or insurance information on an instant form; the competitor file inferred the same, which would explain why most competitors route to quiz pages. I could not read the terms. **UNVERIFIED, high impact** (section 0).
- **CTWA free window.** A practitioner log says the free window was extended from 72 hours to 7 days on 28 Sep 2026, and service messages are billed beyond 1,000 free per number per month from 1 Oct 2026 (adsuploader, C). `verified-facts.md` still carries the 72-hour assumption; check Meta's WhatsApp pricing page (owner already assigned).
- CTWA versus forms evidence is vendor case studies only (section 1). **No independent evidence that CTWA lowers cost per qualified lead in financial services.**

### 2.6 Cost context
- Q2 2026 average price per ad up 12% year on year globally (adsuploader relaying Meta; C). Not ZA-specific. The only ZA CPL on file remains the single-source R200-R500 in `research.md` S4.

---

## 3. South African behaviour and context

| Point | Evidence (URL, date) | Grade | Creative implication |
|---|---|---|---|
| Large documented protection gap: R50.4 trillion shortfall at 31 Dec 2024; 16.1m formally employed earners hold cover for about 39% of the income their families would need; average earner has R0.8m death cover vs R2.1m needed, R1.2m disability cover vs R3m; closing it costs 5.2% (death) plus 3% (disability) of earnings; a family would cut living expenses by up to 37%; released 28 Oct 2025 | https://www.asisa.org.za/media-releases/south-africa-s-life-and-disability-insurance-shortfall-widens-to-r504-trillion/ , read | A | A dated, named, sourceable replacement for the unsourced "2-4x salary" hook (A2) |
| ASISA expects 440 earner deaths and 145 earner disabilities a day | same page | A | **Does not support the common line "more likely to be disabled than die".** Do not use that line without a source that does |
| Under-35s are about 24% of living-benefit claims (Sanlam risk chief) | https://www.dailymaverick.co.za/article/2025-11-02-insurance-gap-death-and-disability-cover-insufficient-in-sa/ (2 Nov 2025), read | B | Quote only with speaker and date, if at all |
| 8.7 million risk policies lapsed in 2025 vs 8.2m in 2024 | search summary of https://businessreport.co.za/personal-finance/financial-planning/2025-10-30-south-africas-life-and-disability-insurance-shortfall-widens-to-r504-trillion-says-asisa/ | B, S | Supports the review angle once confirmed at source |
| WhatsApp used by 92.5% of SA internet users 16+ in the past month; Facebook ad reach 27.9m (42.9% of population, 61.7% of adults) late 2025; 51.7m internet users | DataReportal Digital 2026 South Africa (8 Nov 2025). The page I read confirmed the Facebook figures and mobile speed but **not** the WhatsApp line; 92.5% is from a search summary of the report | A for Facebook; B for WhatsApp | Say "about nine in ten" until read. The internal 90% vs 94% inconsistency stays open |
| Measured triggers for making a will: death in the family 41%, having a child 32%, financial advice 27%, marriage/partnership 25%, buying property 18% (among those with a will) | https://www.moonstone.co.za/this-is-what-finally-prompts-south-africans-to-make-a-will/ and https://www.fanews.co.za/article/life-insurance/9/estates-wills/1001/sanlam-survey-shows-a-nation-that-cares-without-a-plan-only-28-of-south-africans-have-a-completed-will/44602 , both read (Sanlam Legacy 2026, released 1 Sep 2026) | B; n = 1,200 online, 67% women, 70% aged 25-49, "not nationally representative" | Only measured trigger ranking found. For wills, not life cover; use as a prior for both |
| Retrenchment cover is for permanent employees; the self-employed do not qualify; group life ends on leaving the employer | https://settlemybond.co.za/how-it-works/retrenchment-cover/ and https://www.bondcover.co.za/retrenchment-cover/ (search summaries; vendor pages) | C | Supports self-employed and between-jobs angles. Retrenchment cover itself is out of scope |
| A bank home-loan protection plan said active credit life or own life insurance is a loan condition | Standard Bank Home Loan Protection Plan PDF, 2020 (search result) | C, **STALE?** | Do not say "the bank requires life cover" without a current bank source. Already gates concept C16 |
| Spam-call fatigue: 17.47bn spam calls Jan-Jun 2026 (+25.2% on a year earlier); 30bn in 2025; unknown numbers "carry a trust deficit" | search summary of https://www.bizcommunity.com/article/south-africas-spam-call-era-is-over-and-call-centres-must-evolve-or-die-390108a (2026) | B, S | Supports a "WhatsApp, your time, not a cold call" trust element |
| NCC opt-out registry launched 7 Oct 2026; blocking from May 2027 | `compliance-sa.md` section 0 | A | Do not promise "no calls"; describe the real process |
| Data-resale distrust is real: Consumer Advice's privacy policy says leads are "to be sold to our clients" | `competitor-intel-2026-10.md` 2.1 | A | "Your details go to one adviser" differentiates **only if true** under our contract and consent mode |
| Data cost: 10 GB bundles June 2026 R4.95-R39.90 per GB; average about R20.50/GB in 2025 | search summaries of datacost.co.za and mybroadband.co.za | C | Short captioned video still sensible; data cost is a weak reason to avoid video |
| Load-shedding: 504 consecutive days without it to 2 Oct 2026 | https://furtherafrica.com/2026/10/06/eskom-load-shedding-ends-for-504-straight-days/ , search summary | B | **Drop load-shedding as a creative constraint** |
| University of Pretoria CEI 2025 (6,384 consumers, 28 Jan 2026): direct short-term insurers lead satisfaction; complaints driven by speed and first-time-right | https://www.fanews.co.za/article/non-life/15/general/1217/survey-spotlights-the-direct-versus-intermediated-insurance-divide/43232 , read | B | Short-term insurance only. Supports the 60-second reply rule; not evidence on life advice |

Distrust of "free quote" spam: no consumer survey measuring it for ZA life cover found. Proxies are the spam-call and data-sale evidence above. **UNVERIFIED as a measured attitude.**

---

## 4. Compliance patterns (builds on `compliance-sa.md`; not repeated)

Read at source there (A): ARB Code v2026-04-07 (4.1, 4.2, 4.4, 7, 10); FAIS s7(1), s8(9); GCoC s3, s14; Raspberry Academy; CPA. What I add or confirm:
- The ARB Section III PDF URL I tried returned 404, so I did not re-read Section III. A search summary quotes the financial-services rule that ads "take special care to ensure that the public are fully aware of the nature of any commitment" (B). Already reflected by the "a call, not a product" framing.
- Meta side: third-person situational copy (personal-attributes standard), 18+, no financial questions in instant forms (2.5).
- **Statistics in ads** need a named, dated source in hand before publication (ARB 4.1.1; compliance-sa F5). The ASISA and Sanlam figures qualify as named and dated, but must be quoted as what they are ("ASISA, Oct 2025: ..."; "an online survey of 1,200 people, Sanlam, Sept 2026").
- **Replacing an existing policy.** The policy-review angle (A6) invites replacement. I did not read the rule governing replacement in long-term insurance: **UNVERIFIED**; ask compliance-qa. Until then A6 must never imply the viewer overpays or should switch.
- **How a broker-neutral lead-gen brand stays inside:** third-person situations; promise a call, not a result; no product, insurer, premium or cover amount; no "independent", "licensed" or "authorised" about SMC; disclosure in the first WhatsApp from the named adviser. This is the existing funnel design (`research.md` section 2); nothing here changes it.

---

## 5. Long-term insurance (non-funeral): ranked candidate angles (List A)

Scores are my judgement, 1-5, **not data**. Fit = likelihood the person reached is 35-50 and can afford R1,500+. Safe = compliance risk is low (5 = lowest). Evid = quality of demand-side evidence found. Hook lines are third person, carry no product, premium or cover amount, and use no fear imagery. Statistics in hooks must be quoted exactly with source and date.

| Rank | Angle | Fit | Safe | Evid | Total |
|---|---|---|---|---|---|
| A1 | New bond / bond paperwork | 5 | 4 | 3 | 12 |
| A2 | Cover gap with the ASISA average (replaces "2-4x salary") | 4 | 4 | 4 | 12 |
| A3 | Income and illness protection ("if the salary stopped") | 4 | 4 | 4 | 12 |
| A4 | Self-employed, directors, owners: no employer cover | 4 | 4 | 3 | 11 |
| A5 | New baby | 3 | 5 | 3 | 11 |
| A6 | Existing cover review ("set and forget") | 4 | 2 | 3 | 9 |
| A7 | Turning 40 / mid-life check | 4 | 5 | 1 | 10 |
| A8 | Retirement annuity and tax season | 3 | 3 | 2 | 8 |
| A9 | The call itself: WhatsApp, one adviser, your time | 3 | 5 | 2 | 10 |
| A10 | Self-check quiz (a format, not an angle) | 3 | 3 | 2 | 8 |

(Ranks follow the total, then judgement on risk; A6 sits below A7 and A9 in the table order only for readability of the build sequence - treat A7 and A9 as ahead of A6 until compliance-qa clears replacement.)

### A1. New bond / bond paperwork (internal C03, C16)
- **Mechanism:** a salient decision moment (implementation intention); the bond is a visible obligation the cover has to carry.
- **Hooks:** "Bond approved. Some families add one more item to the checklist." / "Signing day is busy. The cover conversation does not have to be." / "A bond runs for 20 years. A call can take 30 minutes."
- **Format:** 15-25 s captioned video or single static; one scene (kitchen table, keys, papers).
- **Objections:** "My bank already sold me something at signing" (the call can explain what that does and does not do, which is advice-adjacent, so it is the adviser's job); "cash-tight after transfer costs".
- **Evidence:** first-time homeowners named as a life-event audience (clicksgeek, C, 18 Mar 2026); buying property prompts 18% of will-holders to make a will (Sanlam, B). Internal ranking puts it top on both signals (judgement). **Gate:** the "bank requires cover" claim has only a 2020 source (STALE?); keep it out until a current source is filed.

### A2. Cover gap with an ASISA number (internal C01, C02)
- **Mechanism:** curiosity gap plus a checkable task; a named benchmark anchors the comparison.
- **Hooks:** "ASISA's 2025 study: the average earner holds R0.8m death cover against R2.1m needed. What does yours say?" / "Your benefits statement shows your work cover. Many people have never read it." / "Work cover and bond: two numbers that rarely get compared."
- **Format:** static with one large number, or 15 s video reading a benefits-statement line. Highest checkability and lowest production cost.
- **Objections:** "I have group cover" (the point of the hook); "designed to frighten", so keep the tone neutral.
- **Evidence:** ASISA release (A, 28 Oct 2025). It replaces C01's unsourced "2-4x salary" hook, which `verified-facts.md` already holds on a missing source. Figures are national averages: the copy must not say or imply the viewer is short.

### A3. Income and illness protection (new vs the internal set)
- **Mechanism:** reframes from death to the household losing the pay while alive; loss aversion on income rather than mortality, which is less taboo and suits professionals and owners.
- **Hooks:** "Some people insure the car before the salary that pays for it." / "Not only if you die: what the household runs on if the pay stops." / "The pay cheque is the biggest asset many households have. It rarely has its own page in the paperwork."
- **Format:** 20 s video or static; sound-off captions.
- **Objections:** "disability is unlikely", "too expensive". Do not answer with "more likely to be disabled than die" (ASISA's daily counts do not support it).
- **Evidence:** ASISA per-earner disability cover R1.2m vs R3m (A, 28 Oct 2025); 24% of living-benefit claims from under-35s (B, Daily Maverick 2 Nov 2025). A search summary quotes ">85% of breadwinners have no critical illness cover"; I did not find it in the ASISA release I read, so **UNVERIFIED, do not use**. No health imagery or named conditions (Meta sensitive-attribute risk).

### A4. Self-employed, directors, owners (internal C10, C11)
- **Mechanism:** identity self-selection plus a structural gap (no employer fund; no retrenchment cover for the self-employed).
- **Hooks:** "No employer, no group cover. For people who are their company's biggest asset." / "Directors and owners often have the least personal cover set up. A short call can map what exists." / "When the business depends on one person, so does the household."
- **Format:** static or short adviser monologue; professional home-office scenes.
- **Objections:** "my money is in the business", "variable income", "my accountant handles it".
- **Evidence:** retrenchment-cover pages and group-cover-ends-on-leaving (C). No performance data. Do not name key-person or buy-and-sell products.

### A5. New baby (internal C04)
- **Mechanism:** strongest life-event salience; identity shift to provider. US and UK practitioners call new parents among the highest-converting segments (C, search summaries).
- **Hooks:** "A new baby changes the budget and the list of things to sort." / "Between feeds and nappies, one 30-minute call to put cover on the list." / "Three questions worth asking an adviser when a baby arrives."
- **Format:** warm static or adviser-parent voiceover (actor and consent rules apply).
- **Objections:** cash squeeze (lower affordability fit, as the internal file says); no time.
- **Evidence:** having a child prompts 32% of will-holders to make a will (Sanlam, B); clicksgeek (C). Not tested on cost per lead anywhere I found.

### A6. Existing cover review (internal C17, DRAFT)
- **Mechanism:** status-quo audit; people who already pay are open to a review. Highest intent, highest regulatory exposure.
- **Hooks:** "Cover set up ten years ago was sized for a different life. A review call looks at what changed." (no price, no "overpaying", no switching language)
- **Format:** static checklist or 15 s video.
- **Objections:** "I'm tied in / waiting periods"; "I don't want to be pushed to switch".
- **Evidence:** lapse numbers (B, section 3); a Sept 2026 article titled "The True Cost of 'Set-and-Forget' Life Insurance" at https://www.insurancechat.co.za/2026-09/the-true-cost-of-set-and-forget-life-insurance/ (title seen in a search result; not read). **Hold until compliance-qa clears the replacement question.**

### A7. Turning 40 (internal C05)
- Age as a milestone prompt; weak intent, strong demographic fit. **Hook:** "Forty tends to prompt a look at the paperwork. A short call can sort what is there." **Evidence:** only life-stage practitioner prose (C). Refresh-pool filler.

### A8. Retirement annuity and tax season (new)
- **Mechanism:** loss framing on tax already paid; calendar salience (tax year ends in February).
- **Hook:** "Retirement contributions can reduce taxable income, within limits. A short call explains the limits." Keep to the limit, not a saving amount.
- **Evidence:** deduction is 27.5% of the greater of remuneration or taxable income, capped at R430,000 from 1 Apr 2026 (up from R350,000, first change since 2016) (A, https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/ , read). No Meta performance evidence; **broker appetite and licence sub-categories for retirement products are UNVERIFIED**. Window: Jan-Feb. Test only if a broker confirms it wants these leads.

### A9. The call itself: WhatsApp, one adviser, your time (internal C13, C14)
- **Mechanism:** risk reversal against cold calls and resale.
- **Hooks:** "A WhatsApp message first, then a call at a time you choose. Not a call centre." / "One adviser, not a list of callers." (true only if the contract and consent mode make it true)
- **Evidence:** spam-call data (B); competitor data-sale policy (A). Works best as a second line inside another angle: it fixes an objection, not a trigger.

### A10. Self-check quiz (format)
- Commitment and personalised feel; competitors and practitioners use it (C). **Risk:** a personalised result is advice territory (compliance-sa F2). Only a non-evaluative "three questions so the adviser can prepare" is safe. A landing-page design choice, not an angle.

---

## 6. Wills and estate planning: regulation, honest description, statistics

### 6.1 Who may do what
| Question | Finding | Source | Grade |
|---|---|---|---|
| Must an attorney draft a will? | No. "Any person of 16 years and over is free to make a will"; the Master says a will "should preferably be drawn up by an expert like an attorney, trust company etc." | https://www.justice.gov.za/master/deceased.html , read | A |
| Formalities | Signed at the end by the testator (or another in their presence and direction) before two or more competent witnesses present at the same time, who attest and sign in the presence of the testator and each other; each earlier page also signed | Wills Act 7 of 1953 summarised at https://www.golegal.co.za/valid-will-codicil/ (fetch returned 403; text seen in a search summary); statute at https://lawlibrary.org.za/akn/za/act/1953/7/eng@1964-06-24/source (not read; 1964 consolidation, **STALE?**) | B |
| Does the Legal Practice Act reserve will drafting? | s33(1) reserves, for fee or reward, appearing in court or before bodies where only practitioners may appear, and drawing up instruments "for use in any action, suit or other proceedings in a court"; s33(2) bars holding oneself out as a legal practitioner; s33(3) bars doing for reward anything another law reserves to an advocate, attorney, conveyancer or notary. Contravening s33 is an offence (fine or up to two years). Wills are not named in what I read | Legal Practice Act 28 of 2014 (assented 20 Sep 2014; s33(1), (3) amended 2017), https://www.justice.gov.za/legislation/acts/2014-028.pdf , read via text extraction | A |
| So can a non-attorney sell will drafting? | On that text s33(1) does not reserve it, and I found no other law that does (the Wills Act does not). Two secondary sources agree (https://globallawexperts.com/how-to-draw-up-a-will-without-a-lawyer-south-africa/ ; https://www.conviction.co.za/legal-consultancy-professional-fees/ ; search summaries). **Inference, not an opinion.** Attorney to confirm before any wording such as "we draft your will" | - | D |
| Is will drafting a FAIS "financial service"? | FAIS "advice" is a recommendation, guidance or proposal of a financial nature to a client about buying or varying a financial product; factual product information is excluded (s1, s1(3)). A will is not a financial product, so drafting one is not itself FAIS advice | `compliance-sa.md` F2 (FAIS s1 read there); Obiter 2007 note https://www.obiter.mandela.ac.za/article/download/14289/18673/84906 , read (**STALE?** 2007; confirms the definition only) | A (definition), D (application) |
| Estate planning that recommends a policy | Recommending that a person buy life cover (for example to fund estate costs) is advice on a financial product and needs an authorised provider with the right sub-category. A source claiming an estate-duty calculation before drafting can itself be advice appeared in a search summary only | **UNVERIFIED** (estate-duty point); D (product point) | D |
| Fiduciary practitioners | FISA runs a voluntary "Fiduciary Practitioner of South Africa" designation (2011) | https://en.wikipedia.org/wiki/Fiduciary_Institute_of_Southern_Africa , read | C. **Whether "fiduciary" or "estate planner" is a protected title: UNVERIFIED** |
| Who must the person on the call be for us to say "estate planning call"? | **Not established.** At minimum a FAIS-authorised representative for any product conversation. If the call also offers will drafting, the drafter must be identified (attorney, trust company, fiduciary firm) and the page must not imply SMC drafts. Competitor model: Consumer Advice names a provider (Capital Legacy) on its thank-you page (competitor file). We do not yet know whether our brokers draft wills, use an attorney, or refer | - | Open question for the broker agreement |

### 6.2 Claims that need care
- **"Most South Africans die without a valid will."** Use a dated figure with its caveat; do not use the competitor's borrowed "1.6 million wills". Master's 2022 data: "less than 15% of South Africans have a Will when they die", quoted by a PPS fiduciary specialist on an undated page (https://www.pps.co.za/business-brief/less-15-south-africans-have-will-when-they-pass-away , read; B; the Master's underlying data **not located**). Sanlam Legacy 2026: 28% valid, 65% none (B). M&G, 21 Sep 2026: about 70% lack a valid will (opinion piece; B).
- **Guardian's Fund and minor children.** M&G (read, 21 Sep 2026): the fund held R18.8bn for beneficiaries at 31 Mar 2025; unclaimed money is forfeited to the state after 30 years; where a parent dies with no provision for minors the money may be paid into the fund (B; primary report not read). Fear framing around the fund is a competitor tactic and conflicts with our no-fear rule.
- **Retirement benefits are not governed by the will.** M&G: death benefits bypass the estate under s37C of the Pension Funds Act and trustees allocate them (B; Act not read). A strong myth-bust fact that edges toward advice ("so you need a nomination"); state as information only.
- **Estate duty and executor fees.** Secondary sources: 20% up to R30m after a R3.5m abatement, 25% above; executor fee maximum 3.5% of gross asset value plus VAT; Master's fee cap R7,000 (C: https://law-trust.com/blog/estate-duty-south-africa-guide-2026.html ; https://www.arborinc.co.za/insights/executor-fees-south-africa ; search summaries). The SARS page I read does not cover estate duty. **UNVERIFIED at primary: no estate-duty or fee figure in any ad until a SARS or Gazette source is filed.**
- **"Free will".** Competitors use it. Compliance-sa F3 limits "free" to what is truly free. 48% in the Sanlam survey say free or low-cost drafting would help (B), so demand is real, but "free" only works if a named provider truly drafts at no cost; **not established**.
- **National Wills Week** ran 14-18 Sep 2026 with free basic will drafting through Law Society members (M&G, B). The seasonal peak has passed; expect the next in Sept 2027.

### 6.3 How a broker-neutral brand can honestly describe an "estate and will" call
Safe pattern (all subject to attorney review):
- "A 30-minute call with a licensed financial adviser about how cover, a will and beneficiary nominations fit together." The adviser explains how they are paid before any product (compliance-sa S13-S14).
- Say what the call is not: it does not itself draft a will, unless a named drafter is part of the offer.
- Third person; no personalised result: no "you need a trust", no "your estate would owe R...", no "your family would lose...".
- No legal-sounding titles for SMC (s33(2)); do not call the adviser an "estate planner" or "fiduciary" until the title question is answered and the person qualifies.

---

## 7. Wills and estate planning: ranked candidate angles (List B)

Scoring as in section 5. Evid reflects the Sanlam 2026 survey (B, convenience sample), ASISA and SARS where relevant.

| Rank | Angle | Fit | Safe | Evid | Total |
|---|---|---|---|---|---|
| B1 | "Not wealthy enough for a will?" myth | 4 | 5 | 4 | 13 |
| B2 | Who looks after the children | 5 | 3 | 4 | 12 |
| B3 | Winding up an estate: what people who did it say | 4 | 4 | 4 | 12 |
| B4 | "Does anyone know where it is?" will check | 4 | 5 | 3 | 12 |
| B5 | A will, a nomination, life cover: three jobs | 4 | 4 | 3 | 11 |
| B6 | Bond and property: the biggest asset | 5 | 3 | 2 | 10 |
| B7 | Business owners and directors | 4 | 3 | 2 | 9 |
| B8 | Blended families, second marriages | 3 | 3 | 1 | 7 |
| B9 | "Free will" offer | 3 | 1 | 3 | 7 |

### B1. "Not wealthy enough for a will?"
- **Mechanism:** belief correction. 44% of people without a will believe they lack enough assets, yet 76% own at least one significant asset (savings, vehicle, property or retirement account) (Sanlam Legacy 2026, B).
- **Hooks:** "Think a will is for the wealthy? In one survey, three in four people without a will still owned a significant asset (Sanlam, Sept 2026)." / "Car, bond, pension: a will is about who gets them, not how much they are worth."
- **Format:** static myth/fact card or 20 s video. **Objection:** "I'll deal with it later" (34% procrastinate, same survey).
- **Why first:** the one angle with a dated, named number that attacks the stated barrier, in a safe third-person form.

### B2. Who looks after the children
- **Mechanism:** parental protectiveness; a will can name a guardian (the internal CI-05 note still needs its Wills Act/Master source pinned). Having a child prompts 32% to make a will (B).
- **Hooks:** "A will can say who looks after the children. A short call covers where to start." / "Two questions parents of young children often leave open." No Guardian's Fund fear framing.
- **Format:** warm static or parent voiceover. **Objections:** discomfort (9% in the survey), cost. **Risk:** easy to slide into fear; keep a calm "question to settle" tone.

### B3. Winding up an estate: lived experience
- **Mechanism:** vicarious social proof. 47% have helped wind up a loved one's estate; only 22% of those found it smooth; top problems: disputes 26%, delays 23%, costs 18%, frozen accounts 12% (Sanlam, B).
- **Hooks:** "Nearly half of respondents in one survey have helped wind up a loved one's estate. One in five called it smooth (Sanlam, 2026)." / "What people who have been through an estate wish had been ready."
- **Format:** stat card, or interview video with a real consenting person (testimonial rules, compliance-sa S17). **Objection:** gloomy; keep it factual.

### B4. "Does anyone know where it is?" (will check)
- **Mechanism:** completion and audit for people who already have a will. 39% of will-holders have not told loved ones where it is or what it says; only 28% of respondents hold a signed, witnessed, stored will (Sanlam, B).
- **Hooks:** "Having a will is one step. Does the family know where it is?" / "A will from ten years ago was written for a different life."
- **Format:** static checklist. **Fit:** 35-50 with an older will after marriage, a child or a bond. Survey evidence only.

### B5. A will, a nomination, life cover: three jobs (internal CI-05)
- **Mechanism:** clarity; moves from "I have a policy so I'm covered" to a map. A will does not govern retirement-fund death benefits (s37C, M&G, B); a nomination tells an insurer who to pay.
- **Hook:** "A will says who inherits. A nomination says who an insurer pays. They are different jobs." Leave out "so you need all three" (advice-adjacent).
- **Format:** three-card carousel. Leads naturally from will to cover, but the bridge to a product must happen on the adviser's call, not in the ad.

### B6. Bond and property
- **Mechanism:** the home is usually the biggest asset; pairs with A1. **Hook:** "The bond, the house and who it passes to: three things worth putting on one page." **Evidence:** Sanlam: buying property prompts 18%. Keep estate duty out until sourced.

### B7. Business owners and directors
- **Mechanism:** identity plus control (succession, liquidity). **Hook:** "For owners: what happens to the business and the people in it if the owner cannot sign?" **Evidence:** none specific found; estate-duty and executor-fee mechanics are secondary-sourced. Avoid trust or structure products by name. **UNVERIFIED as an angle.**

### B8. Blended families
- High stakes, narrow audience; no measured ZA evidence. **UNVERIFIED.** Reserve only; gentle third-person copy; no divorce-status implication (Meta personal-attributes standard).

### B9. "Free will" offer
- Used by the most visible ZA competitor and the demand is measured (48%). But it is price-led, competes with an incumbent pay-per-lead operator, carries the "free" compliance risk (F3), and cannot be offered until a drafter and fee model exist. **Not recommended for cycle 1.**

### 7.1 Angles to drop
- **Extended-family responsibility (C06, C07):** already held internally; skews to stretched households and is culturally loaded. Stays out.
- **Funeral-led angles** (funeral cost, "cost of dying can exceed R100,000", funeral cost versus premium): premiums sit outside our R750+ band and uncapped funeral commission funds competitors (competitor file); fear and death imagery break compliance-sa S25. Stays out.
- **"More likely to be disabled than die":** not supported by ASISA's own daily counts (section 3).
- **"Free" as the lead word; "2-4x salary" as a headline; "bank requires cover"** until current sources exist.

---

## 8. Experiment design at about R8,500 media per Bronze cycle

**Budget facts (internal, `campaign-spec.md` sections 9 and 12):** R7,384 entered (about R8,492 billed incl. VAT) per 30 days, R246/day entered, one ad set, "Learning limited" accepted; about 9 leads a week; about 65% qualify (about 6 qualified a week; `research.md`).

**Learning phase.** Secondary sources: an ad set exits learning at about 50 optimisation events in 7 days; "Learning limited" when Meta forecasts it will not; budget, targeting, creative or optimisation edits reset it; Meta cut the threshold to 10 events for Purchase and App Install only in June 2024 (https://lebesgue.io/facebook-ads/facebook-ads-learning-phase-what-you-need-to-know-2024-update and https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/ ; search summaries; B/C). **I could not read Meta's help page** (fetch failed), so the 50-event rule stays an **ASSUMPTION**, exactly as in `campaign-spec.md` 9. At 9 leads a week the ad set sits at about 18% of 50 and will stay Learning limited. The internal decision (one ad set; do not raise budget to chase it) is consistent with everything I saw.

**Meta's A/B tool.** Practitioner summaries say Meta calls a result a winner at 65% confidence (not classical significance), want at least 7 days, and say fewer than 100 events is not meaningful (https://coinis.com/how-to/statistical-significance-facebook-ads ; https://en-gb.facebook.com/business/help/1376548572415613 ; search summaries; B/C). **Not usable at our volume.**

**What the maths allows (D, my calculation).**
- Weekly leads are roughly Poisson. At 9 a week one standard deviation is 3 (about 33%), so a week-to-week CPL swing of plus or minus 30% is noise. Read 14-day windows at minimum.
- Two arms, equal spend; observed split vs p (two-sided): 10:5 gives 0.30; 15:8 gives 0.21; 20:10 gives 0.10; 30:15 gives 0.04; 40:20 gives 0.01.
- Power at p < 0.10, true 2x gap, by expected leads in the weaker arm: 5 gives 28%; 8, 42%; 12, 58%; 20, 81%; 30, 94%. True 1.5x gap: 5 gives 12%; 8, 19%; 12, 22%; 20, 34%; 30, 47%.
- Clicks and impressions carry far more counts. Relative error of a Poisson count n is 1/sqrt(n): 30 outbound clicks gives about 18%; 100 gives 10%.

**Design (proposed; thresholds are mine, not from a source).**
1. **How many angles at once: four concepts, one execution each, in one ad set,** from different families so Meta sees them as distinct: one trigger (A1), one gap (A2 or A3), one identity (A4), and, if the wills offer is live, one will concept (B1). Two executions of one concept are one concept. This honours the diversification guidance as far as the budget allows. Six ads at about 6 leads each cannot be ranked; four at about 9 barely can. Keep the internal C01 colour pair as one concept.
2. **No edits on days 1-2.** Then judge in three layers:
   - *Layer 1, attention:* hook rate (3-second plays over impressions) and outbound CTR. Judge an ad only after about 3,000 impressions and at least 30 outbound clicks (about 18% relative error). Below that, no decision.
   - *Layer 2, funnel:* form-open or landing-view to submission, and WhatsApp verification rate. Judge after at least 10 submissions per ad.
   - *Layer 3, money:* cost per **qualified** lead, then per attended meeting. Judge only on pooled families or across cycles (point 5).
3. **Kill rules.**
   - Immediate: two disapprovals of one ad for the same reason; comments reading the ad as a promise or product offer; a broker complaint that a lead was misled.
   - Soft kill (pause, do not delete): after 3,000 impressions, outbound CTR under half the ad-set median; or R1,000 spent with no form submission. The internal "no lead-cost verdict before R3,000 or 14 days" still governs lead-cost verdicts.
   - Never kill on lead count alone (internal rule stands).
4. **Scale rules.** Budget is capped by the broker ladder, so "scale" means reallocation: pause losers so delivery concentrates; carry the winning family into new executions next cycle. Raise budget only when a broker adds a cycle, not to exit learning.
5. **Reading about 9 leads a week.** Report weekly, decide fortnightly; show counts with a range, not a CPL to the rand. A concept is "ahead" only if its cost per qualified lead is at least 2x better than the median **and** layers 1-2 agree; at 1.5x say "unclear". Over three cycles (about 108 leads) four concepts give about 27 each, which reaches roughly 80% power for a 2x gap only for the stronger pairings (D).
6. **Order across cycles.** Cycle 1: trigger vs gap vs identity vs (will or trust). Cycle 2: keep the top two families, add two new concepts. Cycle 3: executions inside the winning family (hook line, format). Do not test colour, font or CTA wording before the family is known.
7. **Cheaper tests that are not underpowered:** (a) form vs WhatsApp opener for the budget question if the instant-form check fails; (b) first-reply speed (already a 60 s rule).

---

## 9. What we still do not know (explicit)

1. Whether any published study ranks angles by **cost per qualified lead** for life or income protection on Meta in the UK, US, AU or ZA. I found none; all ranges are vendor prose.
2. A real **ZA CPL, CTR and CPM** for life cover in 2026. The only figure on file is the single-source R200-R500 (`research.md` S4). The Ad Library shows no ZA spend.
3. Whether Meta treats SA life-insurance ads as **Special Ad Category** (Meta's page names the US only), and whether **financial-services advertiser verification** is mandatory for South Africa.
4. Whether the **Lead Ad Terms** forbid the budget question in the instant form, and whether the **Advantage+ text rewrite** can be switched off on every placement.
5. Meta's own **learning-phase** text (threshold, what counts as a significant edit). The help page would not load.
6. Whether **CTWA** gives a lower cost per qualified lead than forms or pages in financial services. Vendor claims only.
7. The **WhatsApp usage figure** (92.5%) in the DataReportal report itself; the **CTWA free-window length** (72 hours or 7 days) and **service-message billing** on Meta's pricing page.
8. The primary source for **"under 15% of South Africans have a will when they die"** (Master of the High Court, 2022), and whether the Master publishes it.
9. Whether **non-attorney will drafting** is reserved by any law I did not find (attorney opinion), and whether **"estate planner" or "fiduciary"** are protected titles.
10. Whether any of our brokers **draft wills themselves, use an attorney or trust company, or only refer**. This decides what the "estate and will" call can honestly promise and whose name is on the thank-you page.
11. The rule governing **replacement of an existing long-term policy** and its effect on A6.
12. A current bank source for **"home loan requires life cover"** and a current source for **employer group life multiples** (`verified-facts.md` already open).
13. Whether **estate-duty rates, abatement and executor-fee cap** from secondary sites match SARS and the Government Gazette.
14. Whether the **Sanlam Legacy 2026** trigger ranking (mostly women, 25-49, online) transfers to our R1,500+ 35-50 audience.
15. Any measured **consumer attitude** to "free quote" and callback spam for ZA life cover specifically.
16. Whether **UGC or founder-led** creative lifts quality in this vertical.
17. The **retirement-annuity** angle: broker appetite, product sub-categories on each licence, and any performance evidence.

---

## 10. Source list (all retrieved 10 Oct 2026)

R = page read this session; S = search summary only (grade capped at B); X = fetch failed.

| Ref | URL | Page date | R/S/X |
|---|---|---|---|
| Meta special ad category docs | https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category | current | R |
| Meta financial and insurance ad standard | https://transparency.meta.com/policies/ad-standards/restricted-goods-services/financial-services/ | current | R |
| Meta Advantage+ leads | https://web.facebook.com/business/ads/meta-advantage-plus/leads | current | R |
| Meta Conversion Leads requirements | https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration | current | R |
| Meta learning phase help | https://www.facebook.com/business/help/112167592222536 | - | X |
| Meta A/B results help | https://en-gb.facebook.com/business/help/1376548572415613 | - | S |
| Jon Loomer, Andromeda diversification | https://www.jonloomer.com/meta-andromeda-creative-diversification/ | 20 Oct 2025 | R |
| Social Media Today, Meta lead gen updates | https://www.socialmediatoday.com/news/meta-lead-gen-ad-updates-ai-targeting-verification-crm-expansion/804301/ | 30 Oct 2025 | R |
| AdsUploader, Meta 2026 changes log | https://adsuploader.com/blog/meta-ads-updates | Sept 2026 | R |
| Common Thread, Meta 2026 changes | https://commonthreadco.com/blogs/coachs-corner/meta-ads-changes-2026 | 2026 | R |
| Confect, Andromeda | https://confect.io/tactics/meta-andromeda-2026 | 2026 | S |
| LeadSync, special ad category | https://leadsync.me/blog/special-ad-category-meta/ | 2026 | S |
| Financial advertiser verification (38 countries) | https://dhruboduti.com/blog/financial-advertiser-verification-on-meta-now-required-in-38-countries-what-this-means-for-fintech-and-finance-ads | 2026 | S |
| Learning phase, Lebesgue | https://lebesgue.io/facebook-ads/facebook-ads-learning-phase-what-you-need-to-know-2024-update | 2025 update | S |
| Learning phase, Jetfuel | https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/ | 2026 | S |
| A/B significance, Coinis | https://coinis.com/how-to/statistical-significance-facebook-ads | 2026 | S |
| ClicksGeek, life insurance Facebook ads | https://clicksgeek.com/life-insurance-facebook-ad/ | 18 Mar 2026 | R |
| Hookd, 5 insurance ad formats | https://www.gethookd.ai/learn/5-insurance-facebook-ad-examples-in-2026/ | Oct 2026 | R |
| Lurvo, UK life lead gen | https://lurvodigital.com/guides/life-insurance-lead-generation-uk/ | undated | S |
| LocalIQ benchmarks | https://localiq.com/blog/facebook-advertising-benchmarks/ | 2026 | S |
| Motion Creative Benchmarks 2026 | https://motionapp.com/thumbstop-pulse/creative-benchmarks-2026/ | data Sept 2025 to Jan 2026 | R |
| Wati, CTWA vs forms | https://www.wati.io/en/blog/click-to-whatsapp-ads-vs-lead-form-ads-roas/ | undated | R |
| DataReportal Digital 2026 South Africa | https://datareportal.com/reports/digital-2026-south-africa | 8 Nov 2025 | R (WhatsApp line absent) |
| ASISA gap study release | https://www.asisa.org.za/media-releases/south-africa-s-life-and-disability-insurance-shortfall-widens-to-r504-trillion/ | 28 Oct 2025 | R |
| Daily Maverick, insurance gap | https://www.dailymaverick.co.za/article/2025-11-02-insurance-gap-death-and-disability-cover-insufficient-in-sa/ | 2 Nov 2025 | R |
| Business Report, ASISA gap (lapses) | https://businessreport.co.za/personal-finance/financial-planning/2025-10-30-south-africas-life-and-disability-insurance-shortfall-widens-to-r504-trillion-says-asisa/ | 30 Oct 2025 | S |
| UP CEI 2025, FAnews | https://www.fanews.co.za/article/non-life/15/general/1217/survey-spotlights-the-direct-versus-intermediated-insurance-divide/43232 | 28 Jan 2026 | R |
| Sanlam Legacy 2026, FAnews | https://www.fanews.co.za/article/life-insurance/9/estates-wills/1001/sanlam-survey-shows-a-nation-that-cares-without-a-plan-only-28-of-south-africans-have-a-completed-will/44602 | Sept 2026 (released 1 Sep) | R |
| Sanlam Legacy 2026, Moonstone | https://www.moonstone.co.za/this-is-what-finally-prompts-south-africans-to-make-a-will/ | Sept 2026 | R |
| M&G, wills and children | https://mg.co.za/thought-leader/2026-09-21-why-most-south-africans-wills-won-t-protect-their-children-s-inheritance/ | 21 Sep 2026 | R |
| PPS, under 15% have a will | https://www.pps.co.za/business-brief/less-15-south-africans-have-will-when-they-pass-away | undated (data 2022) | R |
| Master of the High Court, deceased estates | https://www.justice.gov.za/master/deceased.html | current | R |
| Legal Practice Act 28 of 2014 | https://www.justice.gov.za/legislation/acts/2014-028.pdf | assented 20 Sep 2014 | R |
| Wills Act formalities summary | https://www.golegal.co.za/valid-will-codicil/ | undated | X (seen in search summary) |
| Wills Act text (1964 consolidation) | https://lawlibrary.org.za/akn/za/act/1953/7/eng@1964-06-24/source | 1964 version, **STALE?** | S |
| Obiter 2007 note on FAIS advice | https://www.obiter.mandela.ac.za/article/download/14289/18673/84906 | 2007, **STALE?** | R |
| FISA | https://en.wikipedia.org/wiki/Fiduciary_Institute_of_Southern_Africa | undated | R |
| SARS Budget 2026 FAQ | https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/ | Feb 2026 | R |
| Estate duty and executor fees (secondary) | https://law-trust.com/blog/estate-duty-south-africa-guide-2026.html ; https://www.arborinc.co.za/insights/executor-fees-south-africa | 2026 | S |
| Spam calls, Bizcommunity | https://www.bizcommunity.com/article/south-africas-spam-call-era-is-over-and-call-centres-must-evolve-or-die-390108a | 2026 | S |
| Load-shedding streak | https://furtherafrica.com/2026/10/06/eskom-load-shedding-ends-for-504-straight-days/ | 6 Oct 2026 | S |
| Retrenchment cover pages | https://settlemybond.co.za/how-it-works/retrenchment-cover/ ; https://www.bondcover.co.za/retrenchment-cover/ | undated | S |
| Set-and-forget article | https://www.insurancechat.co.za/2026-09/the-true-cost-of-set-and-forget-life-insurance/ | Sept 2026 | S (title only) |
| ARB Section III 2026 | https://www.arb.org.za/code-file-downloads/Section%20III%20Specific%20Categories%20of%20advertising%20v2026-04-07.pdf | v2026-04-07 | X (404; read earlier in compliance-sa.md) |
| Internal files | see header | 2-10 Oct 2026 | R |
