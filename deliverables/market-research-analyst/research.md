# research.md: compiled research input for every agent

Compiled from `docs/MASTER-PROMPT.md` only (0.1: research is DONE; no re-research). Written 2026-10-02 by market-research-analyst (Head of Consumer Insight). Grades: A regulator/platform/peer-reviewed, B controlled test or audited benchmark, C vendor/practitioner, D opinion.

Rule used throughout: every claim carries a Section 9 source key (S-keys below) or the words `ASSUMPTION - validate by <when/metric>`. Items the web would be needed for are marked `PENDING - production/laptop lookup`.

## 0. Source key (maps to Section 9 lines)

| Key | Section 9 source |
|---|---|
| S1 | SA life insurer rankings: Axco (axcoinfo.com), Futuregrowth "Life insurance: covering our bases" |
| S2 | SA social media: DataReportal Digital 2026 South Africa; NapoleonCat; Statista |
| S3 | Landing page benchmarks: Unbounce finance/insurance and conversion-rate pages; NN/g; Baymard; CXL; web.dev |
| S4 | SA Meta CPL: "Social Media Advertising Costs South Africa" 2026 guide (single source) |
| S5 | SA life cover need case study and employer cover 2-4x salary: SA life cover buying guides (2026) |
| S6 | Instant form vs website A/B: Jon Loomer testing-quality-leads; AdFirm 2026; Insurance Marketing Co |
| S7 | LeadSync: custom audiences, Higher Intent, CAPI ~19% claim |
| S8 | Form field benchmarks: Digital Applied 2026 |
| S9 | Landing-page funnel evidence: NN/g reading studies; Leadpages (cites NN/g, HubSpot, VWO, Deloitte/Google, Portent, HBR) |
| S10 | Reminders and commitment: Martin, Bassi and Dunbar-Rees 2012; PLOS ONE RCTs; Cochrane; BMJ Open |
| S11 | Speed to lead: HBR 2011, "The Short Life of Online Sales Leads" |
| S12 | WhatsApp pricing, 1 Oct 2026 change (fcb.ai, ManyChat, chatmaxima) |
| S13 | Creative performance data: adlibrary.com hook-rate and best-financial-ads-2026; Romaniuk; Labrecque and Milne 2012; "Trustworthy Blue" IAT |
| S14 | Brand/creative science: Binet and Field; Ehrenberg-Bass; Meta Search Lift |
| S15 | Andromeda / creative diversification: jonloomer.com; Meta |
| S16 | Conversion Leads >= 200 leads/month (Meta developer docs) |
| S17 | Google financial-services verification (SA: crypto, loans, BNPL; insurance list EEA only) |
| S18 | Meta financial and insurance ad policy (18+, licensing) |
| S19 | FAIS ruling: Raspberry Academy v Oaksure (CDH alert 5 Aug 2026; Moonstone) |
| S20 | Compliance operating model: POPIA IO, CPA 2026 regs, Information Regulator |
| S21 | WhatsApp in SA: growthpulsemedia.co.za (agency source); adlibrary.com CTWA guide |
| S22 | SA payment gateway fees, Sept 2026 |
| S23 | Hostinger n8n VPS plans and prices |
| S24 | Sprout Social Index 2025 |
| S25 | Supabase free tier (500 MB) is stated in 6.6 of the prompt; no external source in Section 9 |

**Gap found:** Stats SA is one of my five inspirations (4.1) but Section 9 has no Stats SA entry. I have no Stats SA figure to cite. See assumption A-02 and the `needs_human` list in SUMMARY.md.

## 1. Ideal client profile (1.1) and what backs it

| Element | Value in the prompt | Source / grade | Status |
|---|---|---|---|
| Age | 35-50 | 1; qualify bands <35 / 35-44 / 45-50 / 51+ (3.3, 0.1) | Brief decision |
| Life stage | Employed or self-employed, partnered, children at home, bond and/or vehicle finance | 1.1 | Hypothesis (C) |
| Affordable premium | R750-R1,250/month; R1,250+ also qualifies (0.1, 3.3) | 1 | Brief decision |
| **Affordability floor** | About R30,000+/month personal or R45,000+/month household income | S5: one published guide's worked case (34-year-old, R35,000, spouse R20,000, two children, R1.4m bond, cover gap about R5.6m) | **ASSUMPTION - validate with broker (1.1). Single source, grade C. The case person is 34, one year below the 35 band. No Stats SA figure supports the floor. Validate by Mark's income-band feedback in week 1 and qualify rate by budget band.** |
| Implied premium share of income | R750-R1,250 on R30,000 is 2.5-4.2%; on R45,000 household 1.7-2.8% | Arithmetic on the assumption above | ASSUMPTION (derived) |
| Core insight | Most have employer group life of 2-4x salary and think they are covered | S5 (C) | Hypothesis; angle H1 tests it |
| Dependency load | Extended-family support means true dependants exceed the nuclear household | 1.1 (C) | Hypothesis. Never labelled in ads (2.1.8). |
| Trigger events | New bond, new baby, marriage, job change/promotion, new business | 1.1 (C) | Drives hooks H3-H5 |
| Channels | Facebook most-used social platform in SA; WhatsApp in top-used group; Instagram ad reach about 8.6m (late 2025); LinkedIn about 18m; under 20% of SA brands use TikTok | S2 (A/B) | Supported |
| WhatsApp reach | About 90% of SA internet users (agent identity) vs about 94% monthly (4.4, 4B) | S2 / S21 (agency source, C) | **Inconsistent figures; use "about 90%" until DataReportal is read. See needs_human in SUMMARY.md.** |
| Not a lead | Under 35, over 50, below R750 band, VoIP/landline, unreachable on WhatsApp in 72 h, duplicate within 90 days | 3.3 | Contract definition |

Validation done from the prompt alone (task 4): the age and budget bands are consistent across 1, 1.1, 3.3 and the page quiz. The page quiz (4.5) uses "50+" where 3.3 uses "51+"; pick one in the build. No contradiction with the market data in the prompt, but the prompt holds no Stats SA or Axco band data to confirm it. Status: **PENDING - production/laptop lookup** (Stats SA QLFS income distribution for the 35-50 band; DataReportal age split).

## 2. Funnel model (1.2) and why

| Stage | Brand | Broker named? | FSP shown? |
|---|---|---|---|
| Meta ad | SortMyCover (own Page) | No | No |
| Landing page | SortMyCover | No ("a licensed financial adviser") | No, unless `consent_mode=named` |
| Consent checkbox | Generic: "an authorised financial services provider" | No | No |
| First WhatsApp (< 60 s) | Broker intro card plus disclosure | Yes | Yes |
| Booking, reminders, meeting | Broker | Yes | Yes in confirmation |

| Why | Evidence |
|---|---|
| One creative set and page set serves every broker | 1.2 (design reasoning) |
| Disclosure is needed only when an FSP is involved; educational ads involve none | 4B worked example; 2.1.1, 2.1.6 (A) |
| Disclosure inside a timestamped personal WhatsApp is read more carefully than small print | 1.2 (D; to be checked by practitioner opinion, 2.3) |
| Speed matters: first contact inside an hour about 7x qualification odds; our rule is 60 s | S11 (A) |
| Booking happens in WhatsApp or on the page, not on a third-party page | 0.1, 4.5 (design decision) |

**Flag:** 0.1 says `consent_mode = named` by default while one broker. 1.2 and 4.5 say no broker name or FSP number on the page. These conflict while `named` is the default. See SUMMARY.md.

## 3. Unit economics (restated, with sources)

### 3.1 Cost inputs

| Input | Value | Source / status |
|---|---|---|
| Revenue Bronze / Silver / Gold per 30-day cycle | R16,500 / R24,500 / R35,500 | 3.5 decision |
| Meta CPL, SA financial services | **R200-R500** | S4, single SA source. **ASSUMPTION - validate in first 14 days.** Confidence: low. |
| Infrastructure | About R450/month (VPS about $9 about R165, SMS fallback, buffer) | S23 (C) |
| LLM cost per lead | About R0.50-R2 | **ASSUMPTION** (Haiku-class, about 12 turns) |
| WhatsApp per message from 1 Oct 2026 | About US$0.0076-0.0095 (about R0.14-0.17) service/utility; first 1,000 service messages per number/month free; about 12 messages per lead gives about R2/lead | S12 (C, BSP-reported). Re-check is a 4.0a item owned by automation-engineer. |
| Marketing-category template | About US$0.038-0.044 | S12. Avoid. |
| Click-to-WhatsApp | 72-hour free messaging window after click | S12/S21. Worth testing. |
| VAT on Meta media | +15% until VAT-registered | 3.1. Verify on first Meta invoice. |
| Payment fee | Instant EFT about R250; card about R480; manual EFT R0 per cycle | S22 (C) |
| Compliance opinion | R5k-R15k once | ASSUMPTION (2.3) |

### 3.2 Funnel math (raw leads are not qualified leads)

| Qualify rate (ASSUMPTION) | Raw leads to buy for about 24 qualified | Page visits at 9.3% conversion |
|---|---|---|
| 60% | about 40 | about 430 |
| 70% | about 34 | about 370 |

| Raw CPL | Profit at 60% (40 raw) | Profit at 70% (34 raw) |
|---|---|---|
| R150 | R9,890 (60%) | R10,814 (66%) |
| R200 | R7,890 (48%) | R9,114 (55%) |
| R250 | R5,890 (36%) | R7,414 (45%) |
| R300 | R3,890 (24%) | R5,714 (35%) |
| R400 | -R110 (-1%) | R2,314 (14%) |

Break-even raw CPL: about R397 at 60% qualify, about R468 at 70% (3.2; I re-derived: (16,500 - 450)/40 - 4 = R397). Basis: Bronze R16,500, R450 infra, R4 per raw lead for WhatsApp and LLM; **no VAT and no payment fee** in this table. 3.5 adds both. Source for the 9.3% page conversion: S3 (B, Unbounce paid-social finance/insurance median).
Target in 3.2 is qualify >= 70%; my agent target and the 3.5 model use 65%. See SUMMARY.md.

### 3.5 Pricing ladder (modelled at 65% qualify, replacements 20%, R4 per raw lead, 15% VAT on media, R250 Instant-EFT fee, R450 infra)

| Tier | Price/cycle | Committed qualified | With replacements | Raw to buy | Media at R200 (incl. VAT) | Profit at R200 | Profit at R250 | Price per committed lead |
|---|---|---|---|---|---|---|---|---|
| Bronze | R16,500 | 20 | about 24 | about 37 | R8,492 | R7,160 (43%) | R5,037 (31%) | R825 |
| Silver | R24,500 | 30 | about 36 | about 55 | R12,738 | R10,840 (44%) | R7,655 (31%) | R817 |
| Gold | R35,500 | 45 | about 54 | about 83 | R19,108 | R15,360 (43%) | R10,583 (30%) | R789 |

Replacement caps per cycle: Bronze 4, Silver 6, Gold 9 (0.1). Guardrail: no tier below 30% margin at the R250 stress CPL with VAT and fees. Realism: Gold needs about 83 raw leads, about R16.6k media, about R550/day. **This realism claim has no Stats SA or Meta reach figure behind it; see A-02 and A-14.** Note 3.5's website bullet says "replacements up to X/week"; 0.1 says per cycle with no weekly cap. Use per cycle.

### 3.7 Broker ROI (ASSUMPTION - replace with Mark's numbers in week 1)

| Stage | Assumption | Bronze (20) |
|---|---|---|
| Verified qualified leads | committed | 20 |
| Booked | 70% | 14 |
| Attended | 65% of booked (medical-RCT 75% is an upper bound) | about 9 |
| Policies written | broker close rate 25-35% of attended | 2-3 |
| Cycle-1 churn modelled | 50% | - |

Targets in 3.4/3.7: booking >= 60% of verified, show >= 65% of booked. Policies written is broker-reported, voluntary, and never used in any fee (2.1.1, S19).

## 4. Qualified lead (3.3) and kill/scale (3.4)

| # | Qualified lead definition (contract) |
|---|---|
| 1 | Age 35-50 (self-declared; bands <35 / 35-44 / 45-50 / 51+) |
| 2 | Monthly budget band R750-R1,250 or R1,250+ (band, not exact income) |
| 3 | Valid SA mobile (not VoIP/landline); POPIA consent captured; verified: replied or tapped a button on WhatsApp within 72 h of first contact |
| 4 | Agrees to a video, WhatsApp or phone call |
| 5 | Not a duplicate within 90 days |

| Rule | Trigger | Action |
|---|---|---|
| Spend gate | After R3,000: raw CPL > R250 or qualify < 60% | Pause bottom 50% of creatives, tighten qualifying questions, new concept batch |
| 14-day stop | Cost per qualified lead > R400 | Stop and escalate to Jonathan |
| Funnel health | Booking >= 60% of verified; show >= 65% of booked; show < 50% for 14 days | Review reminder sequence and qualification |
| Broker quality (n >= 5 dispositions per ad/angle) | Quality index < 2.5/5 or "not a fit" > 40% | Pause that ad regardless of CPL |
| Scale | Quality index >= 4 and CPL within threshold | +20% budget |

## 5. Reference sets and graded evidence per discipline

### 5.1 Top-5 reference set per agent (4.0 table; given, not re-ranked)

| Agent | Top-5 reference set | Strongest A/B evidence |
|---|---|---|
| market-research-analyst | Axco and Statista, DataReportal, Meta Ad Library, Stats SA, Unbounce | A Axco; A Ad Library; B Unbounce |
| creative-strategist | Meta Andromeda, Jon Loomer, Unbounce reading level, long-running SA ads, Ethos/Ladder-style DTC | A Meta; B Loomer; B Unbounce |
| visual-producer | Meta creative docs, Google Flow docs, Ad Library top performers, Binet and Field, Meta AI labelling | A Meta docs |
| media-buyer | Meta Business Help Center, Loomer, AdFirm/LeadSync, Meta CAPI docs, CXL | A Meta docs; B Loomer |
| landing-page-builder | NN/g, Unbounce, Baymard, CXL/Leadpages, Google CWV/YMYL | B Unbounce; A NN/g, Baymard, CWV |
| automation-engineer | Chili Piper, Calendly/Cal.com, n8n, WhatsApp Cloud API docs, HBR | A HBR 2011; A Meta docs; C Chili Piper |

### 5.2 Evidence on format choice (4.4; no SA-insurance study exists; decide on own data by week 2-4)

| Source | Test | Raw CPL | Qualified rate | Cost per qualified lead |
|---|---|---|---|---|
| Jon Loomer (controlled A/B, non-insurance) S6 | Instant form vs website form | $2.04 vs $3.77 | 29.1% vs 29.0% | **$7.03 vs $13.01, instant wins** (83.7% vs 92.4% deliverable contacts) |
| AdFirm 2026 case S6 | Instant form vs landing page | $4.20 vs $14.80 | 22% vs 64% | **$19.10 vs $23.10, instant narrowly wins** |
| Insurance Marketing Co S6 (no numbers, C) | - | - | Landing pages qualify harder | Higher-commission lines justify the page step |
| Meta via LeadSync S7 | Higher Intent / quality optimisation | - | 44% higher quality-lead rate | 19% lower cost per quality lead (21% for instant forms) |

Conclusion kept: instant form (Higher Intent) is the primary bet if contact happens in < 60 s and junk is filtered. The landing page stays a funded test because one data set shows about 3x its qualified rate. Cycle 1 runs Campaign A only (about R300/day, about 40 raw leads); B and C switch on at monthly media >= R20k or if A's qualify rate < 50% (4.4). Conversion Leads needs >= 200 leads/month (S16, A); not available at 25-50.

### 5.3 Pixel, CAPI, audiences, lookalikes (4.4a, 4.4b)

| Layer | Value | Grade |
|---|---|---|
| Pixel events: PageView, ViewContent, Lead, Schedule, Contact with `event_id` | Optimisation and pixel audiences without PII | A |
| CAPI from n8n (hashed); Event Match Quality aim >= 6/10, "Great" >= 8 | Attribution survives browser blocking; Meta claims about 19% lower cost per quality lead | A; claim C (S7) |
| Offline stages Qualified / Attended / GoodFit | Teaches Meta which clicks become meetings | A |
| Exclusions (Lead 90 d, booked, attended) | Stops paying to re-reach people in the funnel | A |
| Lookalike seed: >= 100 people (Meta), we wait for >= 300; quality seed beats size | LAL-1 in week 2; LAL-Q at cycle 2+; kill LAL-Q if it loses to broad twice | A (Meta minimum), B/C (practitioner) |
| Broad plus creative diversity (Andromeda) | Core targeting from day 1 | A (S15) |

### 5.4 Landing-page evidence (4.5)

| Fact | Value | Grade |
|---|---|---|
| Unbounce medians | Financial services 8.3%; insurance 18.2%; paid social to finance/insurance 9.3%; Instagram 15.5%; Facebook 10.1%; all-industry 4.3%; top 10% >= 11.7% | B (S3) |
| Message match | Up to +39% conversion | B (S3) |
| Reading level | Grade 5-7 converts best | B (S3) |
| NN/g reading | Users read about 20-28% of words; 57% of viewing above the fold; 74% in first two screens; half the text read only on pages <= 111 words | A (S9) |
| Form fields | 23.1% at 3 fields, 17.0% at 5, 11.4% at 7; finance/insurance forms 5.4-5.9%; multi-step about 14% better; mobile about 32% below desktop | B (S8) |
| Single CTA | +31% vs 3+ CTAs; 1-s page 3.05% vs 3-s 1.12% | B (S9) |
| Speed | 0.1 s mobile gain +8.4% conversions; each extra second +32% bounce | A/B (S9) |
| "Quizzes convert 2-10x better" | Unsourced vendor claim; do not use | C/D |
| Page target | >= 18% at LCP < 2.5 s on 4G (agent identity) | See flag below |

**Flag:** the 18.2% insurance median is a median across all Unbounce insurance pages and traffic types. 3.2 funnel math uses 9.3% (paid social). Plan on 9.3% for volume, treat 18% as a stretch target. Validate by landing-page conversion in week 1-2 (A-09).

### 5.5 Nurture and show-rate evidence (4.12, all peer-reviewed except where noted)

| Mechanism | Effect | Our use | Grade |
|---|---|---|---|
| Write details down (Martin et al. 2012, NHS) | 18% fewer missed appointments; repeat aloud 3.5% | Ask lead to type date/time back | A (S10) |
| Plus social-norm message | 31.7% fewer misses | "Most people find 30 minutes is all it takes" | A (S10) |
| Specific-cost framing (two PLOS ONE RCTs, about 10,000 each) | No-shows 11.1% to 8.4% | "{adviser} sets aside 30 minutes for you" | A (S10) |
| Multiple text reminders (BMJ Open meta-analysis; Cochrane) | No-show 15% vs 21% | Sequence T0, +10 min, -48 h, -24 h, -2 h, -10 min | A (S10) |
| Reply before meeting predicts show (about 3x) | Unsourced agency practice | Design for a reply | C |
| Speed (HBR 2011) | About 7x qualification odds within an hour | 60-second first contact | A (S11) |

### 5.6 Creative benchmarks (4D.1, 4D.4a)

| Benchmark | Value | Grade |
|---|---|---|
| Hook rate (3-s views / impressions) | Feed 25-30%, Reels 30-40% | B (S13) |
| Sound-off | 80%+ of Feed/Stories plays | B (S13) |
| Hook levers | Text in first 0.5 s +4-9 pts; payoff promise in frame 1 +5-12; motion in 0.5 s +3-8; close-up face with eye contact +4-10; pattern interrupt +3-7 | B (S13) |
| Finance numeric claim in first 3 s | 31% above category hook average | B (S13) |
| Named-fee comparison statics | 2.1x CTR vs generic savings copy | B (S13). **Not usable here: we may not compare or name fees (1.2, 2.1.1).** |
| Our targets | Hook >= 30% Reels, >= 25% Feed; hold >= 35%; replace anything under after 2,000 impressions | 4D.4a decision |
| Colour | Weak, context-dependent signal; blue helps trust in US lab studies but SA insurers all use blue/green so it buys no distinctiveness; chosen amber #F5A623 on charcoal #1F2933 | B with caveats (S13). Week-1 amber vs teal test. |
| Distinctive assets | Logos and characters rank highest for recall; about 4% of brand colours and about 6% of taglines are uniquely tied to their brand | B (S13/S14) |
| Binet and Field | Consistency compounds; new brands skew brand-heavy | B (S14) |
| Meta Search Lift | About +4% paid-search traffic average; cases +39% organic brand searches | B (S14) |
| Platform facts | Insurance-inclusive Google verification is EEA only; SA covers crypto, loans, BNPL only | A (S17) |

### 5.7 Format and angle conventions from the Meta Andromeda guidance (4.2, S15, A)

| Fact | Value |
|---|---|
| Creative diversification replaced niche targeting as the main lever (Meta, March 2025) | The creative is the targeting |
| Volume | 10-15 conceptually distinct assets, refreshed every 2-3 weeks (practitioners, B/C) |
| Count to produce | 15 concepts, min 2 per angle; get 3 approved by Meta before the full batch (2.1.8) |

## 6. The five angles from the hook library, mapped to mechanism (4D.4a)

Note: these are the prompt's pre-decided angles. They are **hypotheses** (grade B/C mechanism, no SA Ad Library proof yet). The competitor scan that would show which survive 30/90 days is `PENDING - production/laptop lookup`.

| # | Angle (hooks) | Hook text (frame 1) | Mechanism | Evidence | Risk to check |
|---|---|---|---|---|---|
| 1 | Employer-cover gap (H1, H2) | "Most work life cover stops at 2-4x salary." then "Most bonds don't." | Numeric claim in the first 3 s lifts hook rate; "most" keeps it third person | S13 (+31% category); S5 (2-4x salary, C); 2.1.8 (A) | H2 shows "R1.4m bond. 3x salary cover." Check against "no cover amounts" and personal-attributes rule. |
| 2 | Trigger events (H3, H4, H5) | "New baby. New bond. Same old cover?" etc. | Life-event call-out through creative; moment-based category entry points | S15 (A), S14 Sharp (B), 1.1 | H3 "Just got bond approval?" is a viewer-directed question; compliance-qa to confirm. |
| 3 | Virtual convenience / what the call is (H6, H10) | "No sales visit. No jargon. 30 minutes on WhatsApp or video." | Objection-busting; removes fear of the unknown, the main no-show driver | S10 (A), 4.12 | None noted |
| 4 | Self-employed / no group cover (H7) | "No company. No group cover. Your family, your call." | Audience call-out with no finance claim | 4.2 | "Your family, your call" is second person; compliance-qa to confirm. |
| 5 | Myth-bust and checklist (H8, H12) | "Life cover costs less than most people think. Most never check." / "3 things to check on your payslip this month." | Myth-bust and value-first, save-worthy content | 4D.4a (B/C) | No premium numbers (2.1.1) |

Also in the library: extended family (H9), social norm (H11, only once real quotes exist). Hard avoid: fear/mortality ads, "from R99/month" price hooks, invented testimonials, insurer or product names (4.2).

## 7. SA market context (4.1)

Insurers are context, not competitors. We compete with independent brokers/advisers and the agencies or lead providers who advertise for them (4.1).

| Rank | Insurer | Written premium | Share | Source |
|---|---|---|---|---|
| 1 | Sanlam Life | R94.5bn | 13.1% | S1 (A, Axco 2024) |
| 2 | Old Mutual Life | R38.6bn | 5.4% | S1 |
| 3 | Liberty Group | R35.9bn | 5.0% | S1 |
| 4 | **PENDING - production/laptop lookup** | between R21.6bn and R35.9bn by rank | - | Not shown in the source. Momentum is named in 4.1 as the retail-affluent IFA-channel leader, but the prompt does not say it is #4; do not enter it until cited. |
| 5 | Discovery Life | R21.6bn | 3.0% | S1 |

Consistency check: R94.5bn / 13.1% implies about R721bn market; 38.6, 35.9 and 21.6 give 5.4%, 5.0%, 3.0% on that base. The table is internally consistent.

| Context | Fact | Source |
|---|---|---|
| Channel leaders | Momentum leads retail-affluent IFA channel; Discovery and Sanlam lead retail-affluent new-business margins | S1 (Futuregrowth) |
| Direct players | 1Life, OUTsurance Life, Hippo (aggregator), BrightRock, Capital Legacy | 4.1 |
| Colour landscape | Sanlam, Old Mutual, Liberty, Momentum, Discovery all use blue/green | 4D.4a (S13) |
| Brand names to avoid | Naked, Pineapple, Simply, Hippo, 1Life, King Price, BrightRock | 4D.3 |

### Competitor set (to scan at launch)

Status for every row: `PENDING - production/laptop lookup` (the sandbox blocks the Ad Library and the web). Method from 4.1: Meta Ad Library keyword search for SA ("life cover", "life insurance", "financial adviser"); else Google Ads Transparency Center, Serper/Exa/Tavily for broker funnel pages, then Ad Library per Page. Log for each ad: advertiser type, start date, days running, format, hook, angle, offer, CTA, destination, FSP number shown (yes/no). Weight ads running 30+ days (identity says 90+ for the strongest proof).

| Player (named in 4.1, unverified) | Type | What to log | Flag |
|---|---|---|---|
| Mashilo Digital | Agency / lead provider | Who they advertise for, funnel, FSP shown, pricing model | Flat vs per-policy; flag anything like Raspberry Academy (S19) |
| ReachDigital | Agency / lead provider | Same | Same |
| COMM Marketing | Agency / lead provider | Same | Same |
| MegaLeads | Lead provider | Same | Same |
| Hippo broker-facing lead programme | Aggregator / lead programme | Same | Same |

Apollo is for finding more brokers as Lead Velocity clients only; never a consumer lead source (POPIA s69, 4.1).

### CPL benchmark status

| Source | Range | Confidence |
|---|---|---|
| S4: SA 2026 advertising-costs guide | R200-R500 per raw lead, SA financial services | Low (single source, grade C) |
| 3+ more SA sources | **PENDING - production/laptop lookup** | - |
| Our own data | First 14 days of Campaign A | Replaces the range (A-01) |

## 8. Compliance rules that shape research outputs

| Rule | Source |
|---|---|
| Flat fee, never tied to policies; replacements for no-show/uncontactable/disqualified only | 2.1.1, S19 (A) |
| Unticked consent; partial submissions can never be contacted | 2.1.2, 3.2, S20 (A) |
| Out-of-band form submissions deleted within 24 h | 2.1.7 |
| Insurance ads 18+; design for no age targeting | 2.1.3, 2.1.4, S18 (A) |
| No second-person claims about finances; "black tax" never in an ad | 2.1.8 |
| No fake testimonials; AI people never presented as real clients/advisers | 2.1.5, 4D.1 (A) |

## 9. Reading-level and tone rule for all agents

Grade 5-7 English (S3 B), one idea per sentence, no exclamation marks, no scarcity theatre (4.5, 4.12).
