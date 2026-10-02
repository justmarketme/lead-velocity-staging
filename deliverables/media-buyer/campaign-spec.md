# campaign-spec.md — exact settings for the meta-operator (SortMyCover)

Owner: media-buyer (Head of Paid Social). Reader: meta-operator (enters), ads-api-engineer (API equivalents), optimisation-advisor / analytics-reporter (rules). Date: 2026-10-02. Status: DRAFT until Jonathan confirms the rand figures in section 13.

How to read: every value is either a literal to type or a lookup named in `{braces}` (read from the CRM `brands` / `pricing` / `brokers` rows, never hard-coded). Anything marked **RECORD** means "write down what Meta actually shows" in `/deliverables/meta-operator/` with a screenshot. Anything marked **ASSUMPTION** is verified on the screen; if the screen differs, do not guess: record it and mark `needs_human`.

Human gates (2.2): publish, any budget entry, any payment screen, any account-level setting. Stop and ask at each. Never enter card details. Nothing spends before first payment: all campaigns are built **paused at R0** and approved by Meta first (MASTER-PROMPT Section 7, Acquisition lines).

---

## 0. Order of operations (cycle 1)

| Step | What | Gate |
|---|---|---|
| 1 | Confirm assets (section 1) | ★ Jonathan |
| 2 | Create Day-0 audiences (section 7) | |
| 3 | Create the instant form A1 (and A2 paused) (section 3; `instant-form-spec.json`) | |
| 4 | Create Campaign A, one ad set, **3 pre-approval ads** (section 4.4) paused | ★ Special Ad Category decision recorded (section 10) |
| 5 | Wait for Meta review; if all 3 approved, add the remaining matrix ads (2.1.8: 3 approved before the full batch) | |
| 6 | Build Campaign B and Test C **paused**; they are switched on only by the section 11 triggers | |
| 7 | At Go-live (6.1 step 5, Jonathan taps) Campaign A budget goes from R0 to R350/day | ★ budget |

---

## 1. Business / portfolio and asset checklist (references 4.7)

Tick each against the `brands` row; the ID goes in the CRM, not in chat. Any unticked line blocks step 4.

| # | Asset (4.7 item) | Required setting | Stored as |
|---|---|---|---|
| 1 | Business Portfolio "Lead Velocity (Pty) Ltd" | Jonathan + KG admins, 2FA; Business Verification submitted | `business_id` |
| 2 | Facebook Page "SortMyCover" | Category Website or Education (never Insurance/Financial service); About = brand disclosure line | `page_id` |
| 3 | Instagram @sortmycover | Business account linked to the Page | `ig_user_id` |
| 4 | WhatsApp Business Account + number | Display name "SortMyCover"; standby number registered | `waba_id`, `phone_number_id` |
| 5 | Ad account (ZAR, Africa/Johannesburg) + standby ad account | Page, IG, WABA assigned; payment added by Jonathan only | `ad_account_id` |
| 6 | Pixel / dataset "SortMyCover" | Domain sortmycover.co.za verified; CAPI system-user token in `.env`; Lead Ads webhook subscribed to the Page (`leadgen`) with `leads_retrieval`, `pages_manage_ads` | `pixel_id`, `dataset_id`, `app_id` |
| 7 | Page warm-up (2.1.3) | 7 days organic posts first. See `needs_human` 7: the R50/day "boost" in 2.1.3 conflicts with my no-boosting rule | n/a |
| 8 | Event priority (aggregated events, domain sortmycover.co.za) | `Lead` > `Schedule` > `Contact` (then ViewContent, PageView). Applies to Campaign B only; Campaign A is on-Meta | see event-spec.md |
| 9 | Test events | `META_TEST_EVENT_CODE` on during staging; removed for production; EMQ >= 6/10 on test Lead and Schedule | |

Consumer-facing hostnames: only `sortmycover.co.za` (and `.com` redirect). Never `sortmycover.leadvelocity.co.za` (staging only, 0.1).

---

## 2. Naming convention

Ads: `C{concept}_{angle}_{format}_{date}` (6.2). `{concept}` two digits; `{angle}` = hook ID from 4D.4a (H1, H3, ...); `{format}` = `{sta|vid|car}-{amb|teal}` (colour is a test variable so it lives in the format token); `{date}` = YYYYMMDD of upload.

| Object | Pattern | Example |
|---|---|---|
| Campaign | `SMC_{A|B|C}_{objective}_{ZA}_c{cycle}` | `SMC_A_LEADS-IF_ZA_c1` |
| Ad set | `SMC_{A|B|C}_BROAD_ZA_35-50` | `SMC_A_BROAD_ZA_35-50` |
| Ad | `C{concept}_{angle}_{format}_{date}` | `C01_H1_vid-amb_20261015` |
| Form | `SMC_A1_HI_v{n}_{named|generic}_{date}` / `SMC_A2_RC_...` | `SMC_A1_HI_v1_named_20261015` |
| Audience | `SMC_{EXC|ENG|LAL}_{description}_{window}` | `SMC_EXC_leads_90d_pix` / `SMC_EXC_leads_90d_list` |

URL parameters (Campaign B ads; the instant form needs none because W02 reads campaign/adset/ad IDs from the lead object):
`utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{placement}}&cid={{campaign.id}}&asid={{adset.id}}&adid={{ad.id}}`

---

## 3. The instant form (Campaign A)

Machine-readable: `instant-form-spec.json`. Screen-by-screen for the UI parts:

**3.1 Form type and settings (screen "Form type")**
| Field | A1 (primary) | A2 (paused variant) |
|---|---|---|
| Form type | **Higher intent** (adds review screen) | **Rich creative** (landing-page style sections) |
| Name | `SMC_A1_HI_v1_named_{date}` | `SMC_A2_RC_v1_named_{date}` |
| Language | English | English |
| Page | `{page_id}` (SortMyCover) | same |

Not "More volume". We trade volume for quality (Meta Help Center / Loomer test lens).

**3.2 Intro / context card:** title "A free 30-minute call with a licensed adviser"; three short lines (tagline "Sort your cover. 30 minutes. A real adviser.", what happens, brand disclosure line). Button "Continue".

**3.3 Questions, in this order** (qualifiers first, contact details last so people routed out never give a number or consent):

| # | Field | Question text | Options (exact) | Qualifies | Routes out |
|---|---|---|---|---|---|
| 1 | Custom, multiple choice | Which age band are you in? | Under 35 / 35-44 / 45-50 / 51 or older | 35-44, 45-50 | Under 35, 51 or older |
| 2 | Custom, multiple choice | Roughly what monthly amount could you set aside for life cover? | Under R500 / R500-R750 / R750-R1,250 / R1,250 or more | **R750-R1,250 and R1,250 or more (both qualify)** | Under R500, R500-R750 |
| 3 | Custom, multiple choice | Is a video, WhatsApp or phone call fine for your 30-minute chat? | Yes / No | Yes | No |
| 4 | Custom, multiple choice | Does your household have a bond or children at home? | A bond / Children / Both / Neither | all (never disqualifies; pre-call brief only) | none |
| 5 | Full name | prefilled | | | |
| 6 | Phone number | prefilled; label "Mobile number (WhatsApp)" | | | |

Do not add: email (collected only inside WhatsApp, and only for Teams/Zoom/Meet), ID number, income, health, bank details (2.1.3, 4.6). Bands match 3.3 (no overlap).

**3.4 Conditional logic and routing (UI, exact rules)**
- Rule 1: if Q1 is "Under 35" or "51 or older" -> disqualified ending.
- Rule 2: if Q2 is "Under R500" or "R500-R750" -> disqualified ending.
- Rule 3: if Q3 is "No" -> disqualified ending.
- Otherwise continue to Q4, name, phone, consent, thank-you.
- Disqualified ending text: Title "Thanks for your time". Body "Based on your answers, a call with an adviser is not the right fit at the moment, so we have not shared your details with anyone. You can read more at sortmycover.co.za." Button "Visit SortMyCover" -> `https://sortmycover.co.za/`.
- Backstop (not Meta's job): W02 re-checks every answer and the consent box; any out-of-band or no-consent lead never enters the automation and is deleted within 24 h (2.1.7). **ASSUMPTION A4**: whether a routed-out person creates a lead record and a `Lead` event. Test with two staging submissions (one in-band, one out-of-band) and record. If routed-out submissions DO count as leads, the optimisation signal is polluted: tell me; mitigation is the offline `Qualified` feedback and the Higher Intent review step, and it moves the form-vs-page question forward.

**3.5 Privacy and consent (screen "Privacy policy")**
- Privacy policy link text "SortMyCover privacy notice"; URL `https://sortmycover.co.za/privacy` (must be live and name Pixel/CAPI/cookies before submission).
- Custom disclaimer title: "How we use your details". Body: the brand disclosure line (CONSENT-FOOTER-v1) + "Privacy notice: sortmycover.co.za/privacy".
- **Custom consent checkbox, required, unticked.** Text, quoted from `deliverables/contracts-drafter/consent-and-privacy.md` sections 1.2 (CONSENT-NAMED-v1, the live default per 0.1) + 1.4 (CONSENT-ADS-v1) as one tick (1.4, 1.7):

> I agree that Lead Velocity may share my details with {practice_name} (FSP {fsp_number}), an authorised financial services provider, who may contact me by WhatsApp or phone about life cover. I can opt out at any time by replying STOP. We also use your details in coded (hashed) form to measure and improve our ads on Facebook and Instagram. We never use them to send you ads by message.

- `{practice_name}` and `{fsp_number}` are read from the `brokers` row at entry time and typed literally into the form (a Meta form cannot merge). **Fail closed:** if either is empty or the FSP number is not marked verified, do not create the form. The consent file's source is DRAFT for practitioner review: re-read it before entry and use its current text; if it differs from the quote above, the file wins.
- Switching `consent_mode` to `generic` (CONSENT-GENERIC-v1) means a new form version; never edit a live form's consent text.
- Named consent makes the form broker-specific: with a second broker the form must be duplicated per broker (or generic mode must be approved). `needs_human` 6.
- **ASSUMPTION**: checkbox text length limit. If the combined text is too long, put the 1.4 sentence in the disclaimer body and mark `needs_human` for compliance-qa (the sentence is meant to sit inside the same tick).

**3.6 Thank-you screen:** Title "Thanks. Check WhatsApp." Body "Check WhatsApp. Your adviser's details and times are on their way." Button "What happens next" -> `https://sortmycover.co.za/what-happens-next` (placeholder: confirm the page exists, else the home page).

**3.7 A2 Rich Creative sections (paused; same questions/consent/endings as A1):** How it works (3 steps) / cover-gap carousel (3 cards: "Most work life cover stops at 2-4x salary." / "The bond and the bills don't." / "A licensed adviser can look at the gap on a 30-minute call.") / trust points / what happens on the call. Exact draft text in `instant-form-spec.json` `_rich_creative_a2`; compliance-qa must pass it (no second-person finance claims) before it is submitted.

**3.8 Lead delivery:** webhook only (W02, `leadgen`); no CSV download, no CRM connector, no Meta notification emails with PII. Test with Meta's Lead Ads Testing Tool before publish; confirm W02 returns the lead in < 5 s and W03/W01 send `broker_intro_slots` in < 60 s end to end.

---

## 4. Campaign A (primary; the only campaign live in cycle 1)

### 4.1 Campaign level
| Setting | Value |
|---|---|
| Name | `SMC_A_LEADS-IF_ZA_c1` |
| Buying type | Auction |
| Objective | **Leads** (API `OUTCOME_LEADS`) |
| **Special ad categories** | **Leave unticked ONLY IF the procedure in section 10 shows it is not required.** Do the section 10 check on this screen first. RECORD what Meta shows. |
| A/B test | Off |
| Campaign budget (Advantage campaign budget) | **On** (budget lives at campaign level so Meta spreads across the ad set's ads; one ad set so no practical difference). Daily budget: section 12 (R0 until Go-live, then R350) |
| Campaign spending limit | Monthly cap per section 12 |
| Bid strategy | Highest volume (lowest cost, **no cost cap, no bid cap**). Cost cap only after day 14 with >= 30 leads of data, as a proposed single-variable test |
| Status when created | **Paused** |

### 4.2 Ad set level (exactly one ad set)
| Setting | Value |
|---|---|
| Name | `SMC_A_BROAD_ZA_35-50` |
| Conversion location | **Instant forms** |
| Performance goal | **Maximise number of leads** (API `LEAD_GENERATION`). Not "Conversion leads" (needs >= 200/month; not available to us, 4.4) |
| Facebook Page | `{page_id}` |
| Instant form | A1 (Higher Intent) set at ad level; ad set default = A1 |
| Budget | inherits campaign (section 12) |
| Schedule | Start on Go-live; no end date; no dayparting |
| Attribution setting | Default (7-day click, 1-day view). Do not change |
| Locations | **South Africa**, people living in or recently in. No province or city splits |
| Age | **Min 35, Max 50** where Meta lets the field be set (floor 18 is Meta's policy). RECORD whether Meta labels age as "suggestion" under Advantage+ audience (4.4 says suggestion; 4.4a says hard: contradictory, so record the screen). The design does not depend on it (form routing filters age) |
| Gender | All |
| Languages | Leave empty (do not restrict; SA is multilingual) |
| Audience control | **Advantage+ audience ON.** Audience suggestions: **none in cycle 1** (no interests, no lookalike). Optional suggestion later per section 11 |
| Detailed targeting | **None** (no interest stacking) |
| **Exclusions (hard, custom audiences)** | `SMC_EXC_leads_90d_pix` (pixel/CAPI `Lead`, 90 d), `SMC_EXC_leads_90d_list` (hashed customer list, 90 d), `SMC_EXC_booked`, `SMC_EXC_attended` (section 7). All four, always |
| Placements | **Advantage+ placements, with Audience Network excluded** (and Messenger inbox, if the screen lists it). Everything else automatic. RECORD the final list. ASSUMPTION: Audience Network adds junk submissions; revisit with placement-level cost per qualified lead after 14 days, not before |
| Optimisation and delivery | Impressions billing; default delivery |
| Dynamic creative | Off (we test as separate ads for clean attribution) |

### 4.3 Ads (all in the one ad set)
All ads: Page identity `{page_id}`, Instagram `{ig_user_id}`, destination = Instant form (A1, unless stated), call to action **Learn more** (never "Get quote"/"Get offer"), primary text / headline / description exactly as in the creative-strategist ad manifest keyed by concept ID, assets from the visual-producer manifest (9:16, 1:1, 4:5), AI disclosure per 2.1.5 where applicable, no boosting, no tags that imply financial status. Reject any asset naming a product, insurer, premium, cover amount or broker (compliance-qa gate).

**4.4 Pre-approval trio (publish first; 2.1.8):** `C01_H1_vid-amb`, `C03_H3_vid-amb`, `C14_H10_vid-amb` (concept ids and hooks per `deliverables/performance-creative-director/test-matrix.md`; hook wording per `hook-library-v2.md`). Together they clear the three riskiest Meta patterns: a number in the hook (C01), a life-event scene (C03), the plain explainer with UI mocks (C14). All three must be approved by Meta before anything else is added. If any is disapproved, see section 10 and 11 (do not re-submit blindly).

### 4.5 Cycle-1 test: one colour pair on H1 video, plus the diversity set (10 ads live, all video, same ad set)
Basis: NH-22 (d) default. Cycle 1 tests colour on H1 video only; the full 2x2 on H1 and H3 is not run (arithmetic in test-matrix.md: ~50 raw leads/month cannot power 8 arms). If Jonathan picks the full 2x2, the cycle-2 arms start on day 1 and nothing else changes.

| Step | Ad name (date = upload date) | Hook (frame-1 text, exactly) | Colour |
|---|---|---|---|
| 1. Trio | `C01_H1_vid-amb_{date}` | H1 "Most work life cover stops at 2-4x salary." Beat 2: "The bond and the bills don't." | amber on charcoal |
| 1. Trio | `C03_H3_vid-amb_{date}` | H3 "Bond approved. Champagne open. Cover checked?" | amber |
| 1. Trio | `C14_H10_vid-amb_{date}` | H10 "Here's exactly what happens on the call." | amber |
| 2. Matrix arm (after trio approved) | `C01_H1_vid-teal_{date}` | H1, identical to `C01_H1_vid-amb` except palette | teal on cream |
| 3. Diversity (after trio approved) | `C04_H4_vid-amb_{date}` | H4 "New baby. New bond. Same old cover?" | amber |
| 3. Diversity | `C05_H5_vid-amb_{date}` | H5 "Cover set up at 28. Life at 40." | amber |
| 3. Diversity | `C06_H9_vid-amb_{date}` | H9 "Many families carry more than one household." | amber |
| 3. Diversity | `C08_H6_vid-amb_{date}` | H6 "No sales visit. No jargon. 30 minutes." | amber |
| 3. Diversity | `C10_H7_vid-amb_{date}` | H7 "No boss. No payslip. No group cover." | amber |
| 3. Diversity | `C13_H16_vid-amb_{date}` | H16 "Checking cover is not the same as buying." | amber |

That is 10 ads (the cap), one per angle plus the colour pair, so all 7 angles are live. Each video carries its 9:16 (Reels/Stories) and 4:5 (Feed) through placement asset customisation. Not live (pool, replacements and the week 2-3 refresh): C02 (H12 Variant B; H2 on hold, NH-PCD-02), C07, C09, C11, C12 (H18; H8 on hold, NH-PCD-04), C15, all stills, 6-s motion stills, the C04 carousel. Statics are not live in cycle 1; static vs video is a cycle-2 test (`C01_H1_sta-{col}` vs `C01_H1_vid-{col}`), and the H3 teal twin (`C03_H3_vid-teal`) enters in cycle 2 if Jonathan keeps that arm. Replacement mapping after the 2,000-impression rule is in test-matrix.md (e.g. C06 -> C07, C08 -> C09, C10 -> C11, C13 -> C12, C14 -> C15; C01 arms are never swapped mid-test). Same copy within the C01 pair so colour is the only variable (single-variable discipline); upload both on the same day and never edit either.

**Delivery-split note (NH-PCD-06):** Meta does not split delivery evenly between the two colour ads inside one ad set. **Default: accept this for cycle 1.** If either arm gets < 25% of the pair's impressions over 7 days, record that week as inconclusive. Alternative, decided at cycle-1 close: run the C01 pair as a Meta A/B test (two ad sets, even split) in cycle 2, once Campaign A has >= 30 leads.

**Reading the colour test (CXL discipline):**
- Compare the pair (`C01_H1_vid-amb` vs `C01_H1_vid-teal`). Leading read once each has >= 2,000 impressions: hook, hold, CTR, WhatsApp reply rate, booking rate. This informs the *next batch* only; it never pauses an arm.
- Verdict only at **>= 30 leads per arm**. Teal wins only if its cost per qualified lead is >= 20% lower and hook rate points the same way; any smaller difference or a split signal means amber stays. At ~R350/day the pair draws roughly 10-15 leads in cycle 1, so the verdict lands in cycle 2 or 3 (needs_human 4 is answered by the NH-22 (d) default). Never kill an arm on lead count.
- Creative hygiene (4D.4a): any ad under hook < 30% (Reels) / < 25% (Feed) or hold < 35% after 2,000 impressions is replaced in the *next batch*, not mid-flight.
- The 3.4 R3,000 rule still applies as written (pause bottom 50% on raw CPL or qualify rate). If it removes a matrix arm, record that arm as "inconclusive" and the matrix is re-run in the next batch. 3.4 wins over matrix completeness.

### 4.6 A2 (Rich Creative) test, built paused
Duplicate the single best ad by cost per qualified lead (or `C01_H1_vid-amb` if none yet) with form A2, in the same ad set. Activate only when A1 has >= 30 leads on that creative, then run both forms at equal exposure for 14 days. Decide on cost per qualified lead and reply rate, not raw CPL. Not before.

---

## 5. Campaign B (website conversions, quiz landing page) — built, paused

| Setting | Value |
|---|---|
| Name | `SMC_B_LEADS-WEB_ZA_c1` |
| Objective | Leads |
| Special ad category | same decision as A (section 10) |
| Conversion location | **Website** |
| Performance goal | Maximise number of conversions; **conversion event `Lead`**; pixel `{pixel_id}`; dataset `{dataset_id}` |
| Ad set | one: `SMC_B_BROAD_ZA_35-50`; same location, age, Advantage+ audience, placements and **exclusions** as A |
| Destination URL | `https://sortmycover.co.za/q/{angle}` (placeholder: landing-page-builder owns one page per angle with message match; confirm paths). URL parameters from section 2 |
| Ads | 5 concepts (4.4): reuse H1, H3, H5, H10, H12 hooks with message match to the page |
| Conversion event health | `Lead` (browser + W01 CAPI, deduped by `event_id`), `Schedule`, `Contact` priority per section 1 item 8; EMQ >= 6 |
| Switch-on | section 11 triggers (monthly media >= R20,000 or A qualify rate < 50%). Budget at switch-on: 30% of total media |
| Second ad set (Phase 2) | Retargeting: quiz-starters not submitted 14 d, page visitors 30 d, form-openers (section 11). Not in cycle 1 |

## 6. Test C (Click-to-WhatsApp) — built, paused

| Setting | Value |
|---|---|
| Name | `SMC_C_LEADS-CTWA_ZA_c1` |
| Objective | Leads (ASSUMPTION: the messaging variant of Leads; if Meta shows only Engagement/Sales for WhatsApp destination, RECORD it and use the option that allows messaging-lead optimisation; do not use Engagement "post engagement") |
| Conversion location | **Messaging apps -> WhatsApp**; WhatsApp number `{phone_number_id}` (Cloud API number) |
| Performance goal | Maximise number of conversations (default); ASSUMPTION: "Leads" via Conversions API for business messaging becomes available once `Lead`/`Schedule` business-messaging events flow (W03, event-spec.md). RECORD |
| Ad set | one: `SMC_C_BROAD_ZA_35-50`; same location/age/audience/exclusions/placements (Facebook and Instagram only; no Messenger-only) |
| Pre-filled message | **Hi, I'd like to check my life cover** (exact; W03 recognises it) |
| Greeting / icebreakers | Keep the default greeting off; W03 sends the consent buttons (CTWA-NAMED-v1 + STOP line) as the first reply. Do not add promotional quick replies |
| Ads | 1–2 Stories/Reels concepts, single tap-through to WhatsApp (4D.4a platform notes); CTA "Send WhatsApp message" |
| Join key | `ctwa_clid` and referral data captured by W03; CTWA click ads carry no `ref`; comment-originated links use `ref=cmt_{ad_id}` (4.14) |
| Switch-on | section 11 triggers. Budget at switch-on: 10% of total media. 72 h free window applies |

---

## 7. Audiences (create on Day 0 so clocks start; meta-operator creates, automation-engineer uploads)

Hashing: SHA-256 in n8n only (event-spec POPIA note). Consent gate: only rows with `consent_ads_at IS NOT NULL` are uploaded (compliance-qa phase0-review-1). Customer lists are used only for exclusion and lookalike seeding, never messaging.

| Name | Type | Source | Use in cycle 1 | Refresh |
|---|---|---|---|---|
| `SMC_EXC_leads_90d_pix` | Website/pixel + CAPI `Lead` 90 d | pixel and CAPI `Lead` events, last 90 d | **Exclude in A, B, C** | automatic |
| `SMC_EXC_leads_90d_list` | Customer list | `leads` consented, last 90 d (hashed phone, email only when collected) | **Exclude in A, B, C** | nightly upload |
| `SMC_EXC_booked` | Customer list | leads with a booking | **Exclude** | nightly |
| `SMC_EXC_attended` | Customer list | leads with outcome attended | **Exclude** | nightly |
| `SMC_ENG_video75_30d` | Engagement | Reel/video viewers >= 75% | none yet (accumulating seed; 4.4b Day 0) | automatic |
| `SMC_ENG_igpage_90d` | Engagement | IG + Page engagers 90 d | none yet | automatic |
| `SMC_ENG_formopen_90d` | Engagement | people who opened the instant form (and, separately, opened but did not submit) | none yet; Phase 2 only, **audience-only, never contacted** | automatic |
| `SMC_PIX_quizstart_14d` / `SMC_PIX_visitors_30d` | Website (pixel) | `ViewContent` minus `Lead`; all PageViews | none yet; Phase 2 | automatic |
| `SMC_LAL-1_lead_1pct` ... | Lookalike | per 4.4b gates | **not created until the seed gate is met** (section 11) | per source |

Engagement audiences depend on the Page and IG existing; create them the day the assets are linked, before any spend.

---

## 8. Optimisation events and what is sent back (what actually teaches Meta)

| Campaign | Optimises for | Why |
|---|---|---|
| A | `Lead` (instant form submit; Meta-native) | only option at < 200 leads/mo; Conversion Leads not available (4.4) |
| B | pixel/CAPI `Lead` (deduped by `event_id`); AEM priority `Lead` > `Schedule` > `Contact` | event-spec.md |
| C | conversations -> business-messaging `Lead` when available | event-spec.md |

Fed back for learning and seeds (not optimisation targets in cycle 1): `Schedule` (booked), `Qualified` (offline, after verified + bands met), `Attended`, `GoodFit` (value = broker quality score 1-5), daily via W12/W29. **Recommendation to attribution-analyst (unverified, test on test events):** for leads that originated in a Meta instant form, include the `leadgen_id` as `user_data.lead_id` on offline events in addition to the hashed `ph`/`fn`/`external_id` in event-spec.md, to improve matching; if it is not accepted by the dataset endpoint, drop it. Only send for rows with `consent_ads_at` set.

---

## 9. Learning-phase rules (apply all of them; this is test discipline, not caution)

1. **One campaign, one ad set, one form** for cycle 1. Do not add ad sets.
2. **ASSUMPTION (standard Meta guidance, confirm on the screen):** an ad set exits learning at about 50 optimisation events in 7 days. At R350/day and R200 CPL that is ~12 leads a week, so expect the ad set to sit in **"Learning limited"**. 4.4 says cycle 1 should exit learning: it will not at this budget (needs_human 5). This is acceptable: consolidation (one ad set) is the mitigation, and the leading indicators drive decisions.
3. **No edits in days 1–14 except:** adding the matrix ads after the trio is approved (day 1–3), pausing a disapproved ad, an SLO burn (first message < 60 s breached, token/policy problem), or the R3,000 rule. Every edit logged with who/when/why and confirm-to-apply (6.2).
4. Budget changes: **no more than +/-20% per change, not more than once per 48 h**, and never during days 1–2 (no day-2 panic changes).
5. No changes to the form, consent text or targeting once live; make a new version instead.
6. A pause > 7 days resets learning: if the campaign must be paused (non-payment at cycle end), resume at the same settings and budget.
7. Do not read the pulse as a verdict before R3,000 spend. Before then, only policy and technical alarms act.

---

## 10. Special Ad Category: decision procedure (2.1.4) — do not assume

1. At campaign creation (Ads Manager), on the "Special ad categories" step, **RECORD** (screenshot): is the category prompt shown? Is "Financial products and services" pre-selected, optional, or mandatory? What targeting options remain visible (age, gender, ZIP/location, detailed targeting, lookalike, Advantage+)?
2. If Meta shows the category as **optional/not required** for South Africa: do not select it. Proceed. Also RECORD the wording of any warning when the age field is set.
3. If Meta **prompts or requires** the declaration: **declare it honestly** ("Financial products and services"). Do not avoid it to keep age targeting. Declaring is correct even if it removes features.
4. If we publish without the category and Meta later disapproves or flags an ad for it: stop, do not appeal blindly, re-create the campaign under the category (the setting cannot be edited on a live campaign), and escalate (human gate).
5. **If the category applies (or age targeting is unavailable for any reason), the design still works:** location South Africa only; no age/gender/ZIP targeting; no lookalikes (Phase 3 is then cancelled in favour of broad + CAPI feedback); creative call-outs and the form's age/budget routing do the filtering; min age 18 applies. Expect a higher routed-out share, so judge on cost per qualified lead. Campaign names get the suffix `_SAC`.
6. Campaigns A, B, C all follow the same decision; record it once in `campaign-spec` results and in the Section 7 readiness line.
7. Policy (not category) disapprovals (personal attributes, 2.1.8): fix copy to third person, resubmit once; two disapprovals on the same ad for the same reason = stop and mark `needs_human` for creative-strategist and compliance-qa.

### 10b. 2.1.3 fallback (broker's Page + authorisation letter): trigger conditions
Stop all spend and escalate to Jonathan (never argue with Meta in review chat) if ANY of these occurs:
- Meta requests proof of licensing/authorisation, an FSP number or "financial services license" for the Page, ad account or an ad.
- Two or more of the first three pre-approval ads are disapproved citing licensing/authorisation for financial products.
- The ad account or Page is restricted with a reason referring to financial services/insurance authorisation, and one appeal (per the meta-operator appeal playbook) fails.
- Special Ad Category requirement appears that requires a licence attestation we cannot truthfully make.

Action: do not switch pages on my own. The fallback (same creative from the **broker's Page**, Lead Velocity's ad account paying, under the signed broker authorisation letter) changes who the advertiser of record is and the funnel's disclosure (1.2): it requires Jonathan's approval and compliance-qa re-review. Prepare nothing public until then.

---

## 11. Decision tables

### 11.1 Kill / scale rules (3.4, 4.12a, CXL)
`Spend` = media spend on the object since it last got a change (excl. VAT). Metrics are computed by analytics-reporter / W29; optimisation-advisor proposes; **Jonathan confirms every budget or pause action** (2.2 human gate; confirm-to-apply 6.2). A cheap lead rated 1/5 by the broker is expensive.

| Trigger (all conditions) | Evidence needed | Action | Who proposes | Who confirms |
|---|---|---|---|---|
| Days 1–14, spend < R3,000, no policy/tech alarm | none | **No action.** Report only | optimisation-advisor | n/a |
| Policy disapproval of an ad | Meta status | Pause that ad; fix per section 10.7 | meta-operator | Jonathan |
| Spend >= R3,000 and (raw CPL > R250 or qualify rate < 60%) | per-ad CPL and qualify % over the spend window | Pause the **bottom 50% of creatives** by cost per qualified lead; tighten qualifying questions; launch a new concept batch | media-buyer + optimisation-advisor | Jonathan |
| Spend >= R3,000 and qualify rate < 50% (instant form) | qualify rate | Also switch on Campaign B (section 11.2 trigger) | media-buyer | Jonathan |
| Day 14 and cost per **qualified** lead > R400 | verified qualified count | **Stop and escalate** to Jonathan (all spend paused until he decides) | optimisation-advisor | Jonathan |
| Day 14 and cost per qualified lead between R250 and R400 | same | Hold budget; proposals: tighten questions, new batch; no scale | media-buyer | Jonathan |
| Ad/angle with n >= 5 broker dispositions and quality index < 2.5/5, or "not a fit" > 40% | W29 | Pause that ad regardless of CPL | analytics-reporter | Jonathan |
| Ad/angle with quality index >= 4 and CPL within threshold (raw CPL <= R250, cost per qualified <= R250) | W29 | **+20% budget** (single step, once per 48 h) | optimisation-advisor | Jonathan |
| Hook < 30% (Reels) / < 25% (Feed) or hold < 35% after 2,000 impressions | Meta metrics | Mark for replacement in the next creative batch (not paused mid-flight) | analytics-reporter | creative-strategist |
| Show rate < 50% of booked for 14 days | outcomes | Review reminder sequence and qualification (not an ad-pause trigger by itself) | optimisation-advisor | Jonathan |
| Routed-out (out-of-band) share > 30% at day 14 | W02 counts | Test Original audience hard age 35–50 vs Advantage+ (single variable, 14 days, equal budget) | media-buyer | Jonathan |
| Console / pulse SLO burn (first message > 60 s, CAPI errors, token expiry, policy flag) | W22/W27 | Act immediately (this is the only exception to "no changes before 14 days") | optimisation-advisor | Jonathan |

Targets: cost per qualified lead <= R250 at 14 days, trending to <= R200; raw CPL model R200 (break-even R397 at 60% qualify / R468 at 70%, 3.2).

### 11.2 Switching on B and C; Phase 2/3 triggers (4.4, 4.4a, 4.4b)
| Trigger | What happens | Budget |
|---|---|---|
| Monthly media >= R20,000 (about 2 brokers) **or** Campaign A qualify rate < 50% | Switch on Campaign B (30%) and Test C (10%); A drops to 60% | A 60 / B 30 / C 10 of total daily media |
| Decision once >= 2 campaigns run | Move budget toward the lowest cost per **qualified** lead and cost per **attended meeting**; never raw CPL; >= 30 leads per arm | per section 12 |
| **Phase 2:** pixel audience >= 1,000 (or week 3) | Add Campaign B second ad set: quiz-starters not submitted 14 d, 50% video viewers, form-openers; a *different* creative ("finish your 60-second check"); frequency cap 3 per 7 days; excluded once they submit. Meta audiences only; no direct contact | inside B's 30% |
| **Week 2 (300+ `Lead` events)** | Add **LAL-1 (1%)** from pixel/CAPI `Lead` 90 d + CTWA `Lead` as an Advantage+ **suggestion** in Campaign A (never a new campaign) | no change |
| **Week 4–6 (300+ `Qualified`)** | Replace the LAL-1 seed with `Qualified`; keep 1% | no change |
| **Cycle 2+ (>= 300 `Attended`/`GoodFit`)** | LAL-Q value-based (value = broker score 1-5), 1% and 3% as suggestions | no change |
| **Phase 3 (>= 1,000 `Attended`/`GoodFit` or >= 200 leads/mo) and A has >= 50 qualified/mo** | Split-test broad vs LAL-Q 1% for 14 days, equal budget and creative; winner on cost per **attended meeting**. Conversion Leads optimisation becomes available | equal split |
| LAL-Q loses to broad twice | Retire it; spend attention on creative | |
| Special Ad Category applies | No lookalikes at all (section 10.5) | |

Customer-list seeds are re-uploaded weekly (automated, hashed, consent-gated). Pixel/offline seeds refresh themselves.

---

## 12. Budgets

All figures ex-VAT as Meta shows them in the ad account unless stated; Meta bills 15% VAT on top (3.1). Currency ZAR. **Every rand figure here is a default for Jonathan to confirm (listed in SUMMARY.md).**

| Phase | Campaign A daily budget | Notes |
|---|---|---|
| Before Go-live / before first payment | **R0** (all paused, ads approved) | nothing spends pre-payment (0.1) |
| Cycle 1, days 1–14 | **R350/day** (6B.12) | R4,900 over 14 days. A is the only campaign |
| After day 14 (and from cycle 2) | **`sum over active brokers of media_share_zar` ÷ 30** per day, changed in <= 20% steps, once per 48 h | `media_share_zar` read from the `pricing` table (3.6), never typed from this document |

Reference values from 3.5 (VAT-inclusive media at R200 CPL; for sanity only, the table is the source): Bronze R8,492 -> R283/day; Silver R12,738 -> R425/day; Gold R19,108 -> R637/day. Check: R350/day for 30 days = R10,500, which is above Bronze's R8,492; see needs_human 2.

**Daily cap and monthly cap rule**
- Daily: the campaign daily budget is the cap on average. Meta may spend up to ~25% above the daily budget on a day while keeping the weekly total; do not "fix" that. A guardrail in the console alerts if any single day's spend > 1.5x the daily budget.
- Monthly: set the campaign **spending limit** = the sum of `media_share_zar` of active brokers for the cycle, except in cycle 1, where the default limit is R10,500 (R350 x 30) and the shortfall against the tier's media share is Jonathan's decision (needs_human 2). If a broker pauses or does not renew, routing is off and budget is lowered at cycle end (6.1 step 7); the limit is lowered in the same step.
- Pause on cap: when 100% of the monthly cap is spent, delivery stops; alert at 80% (WhatsApp to Jonathan/KG, 6.3).
- When B and C are on: A 60%, B 30%, C 10% of the same total. At R20,000/month (about R667/day) that is about R400 / R200 / R67 per day; the R67 for C is very small and will not exit learning, so C is run as a measured test and reported on reply rate, not CPL, until it has >= 30 leads (needs_human 3).

---

## 13. What the console must show (6.2, 6.3; platform-architect / analytics-reporter)

Per campaign, ad set, ad, and **by origin** (`leads.origin`: `lead_ad` = instant form, `page` = quiz page, `ctwa` = Click-to-WhatsApp, `comment` = comment-originated link) and per `utm`/placement:
1. **Cost per qualified lead** (headline; spend ÷ verified qualified) and **cost per attended meeting**. Raw CPL shown smaller, labelled secondary.
2. Raw leads, qualify %, verified %, booked %, show %, replacements used/cap, broker quality index (1-5) per ad (W29).
3. Hook rate, hold rate, WhatsApp reply rate, booking rate (leading indicators), by creative, colour and format (matrix pooled view with an n = leads counter and "needs 30 per arm" progress).
4. Routed-out (out-of-band) share from the instant form and from W02 backstop.
5. Spend vs daily budget and vs monthly cap; learning status (Learning / Learning limited) RECORD from Meta.
6. EMQ per event (target >= 6/10, Great >= 8) and dedupe health; offline event upload status; audience sizes and seed counts versus the section 11.2 gates.
7. Pinned for 14 days: "CPL vs model" tile (6B.12) **and** "cost per qualified vs R250".
8. Alerts per 6.3 plus: first message > 60 s, token expiring, spend > 1.5x daily budget.

Every write action (pause, budget, duplicate) logs who/when/why and is confirm-to-apply.

---

## 14. Things I will not do (for the meta-operator's awareness)
Interest or lookalike ad sets in cycle 1; boosting; messaging or retargeting anyone who did not submit with consent (audiences only); marketing-category WhatsApp templates; budget or creative changes in days 1–2; cost caps before day 14; editing a live form's consent text; naming a broker, FSP, insurer, premium or cover amount in any ad.
