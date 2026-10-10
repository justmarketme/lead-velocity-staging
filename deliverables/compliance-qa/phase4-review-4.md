# Phase 4 review 4: fix wave 3 re-check, new automation drafts (W03/W07/W08/W10/W11/W14/W19/W29), show-rate claims

Date: 2026-10-02 · Reviewer: compliance-qa · Mode: read-only. I edited no reviewed file, and I did not edit `build/tasks.json`, `decisions.md`, `gates.jsonl` or any SUMMARY.md. No web research was done. W34 (POPIA ops) is being drafted in parallel, so it is out of scope here.
This is a QA flag list, not legal advice. Anything marked **(practitioner)** belongs in the external opinion (GATE-OPINION).
Severity: **H** = fix before Meta submission or any publish · **M** = fix before go-live (Section 7) · **L** = tidy-up.

Tools run during this review (all green):
- `node automation/templates/check.mjs`: 50 templates, 0 errors, 6 button-count notes.
- `node --test automation/billing/fais-boundary.test.js`: 3/3 pass.
- `node --test automation/tests/{W03,W07,W08,W10,W11,W14,W19,W29}.test.mjs`: 13/20/11/11/10/17/1/11 pass, 0 fail.
- `node evals/run.mjs --dry-run`: **PASS** (prefilter false positives 0.0%).

---

## 1. Review-3 FAILs, as now applied

| # | Item (review-3 ref) | File:line · what is there now | Result |
|---|---|---|---|
| 1 | "no contract" in a broker template (#18) | `automation/templates/broker_cycle_end.json:13` "…your current tier selected and no lock-in." | **PASS** |
| 2 | "no contract" in a broker template (#19) | `broker_onb_nudge_72h.json:19` "It's per 30-day cycle, with no lock-in." | **PASS** |
| 3 | Checkout description (#24) | `automation/billing/paystack.js:46` "No lock-in; card auto-renew only if you opt in. Prices excl. VAT." | **PASS** |
| 4 | Tier-card line (#25) | `automation/billing/render.js:12` "Per 30-day cycle. No lock-in. Pay for a cycle, get your leads, decide again next cycle." | **PASS**. W25 diffs this against website-wording.md l.135, which still says "Pay for a month…" (review-3 §4f, NH-new-A). Align that line when Jonathan signs it, or W25 will flag a mismatch. |
| 5 | Schedule A line (#26) | `render.js:94` "Price: … per 30-day cycle, {vat}. Paid in advance. Per 30-day cycle, no lock-in." | **PASS** (L tidy: "per 30-day cycle" appears twice. Make the end "No lock-in.") |
| 6 | Manual-EFT page (#27) | `automation/billing/build-workflows.mjs:484` "No lock-in: if you don't renew…" | **PASS** |
| 7 | No "no contract" anywhere in copy | Repo grep: the only hits are `Reports.tsx:21-22` (a defensive rewrite to "No lock-in.") and the email script's BANNED list (`scripts/build-broker-report-email.mjs:41`) | **PASS** |
| 8 | Sample FSP in template examples (#21, §4e) | `broker_intro_booked.json:23`, `broker_intro_slots.json:23`, `broker_intro_slots_v2.json:23` → "00000" | **PASS** |
| 9 | Sample FSP in brand templates (§4e) | `brand/templates/intro-card.html:38`, `lower-third.html:12`, `reminder-card.html:21` → `fsp:"00000 (SAMPLE: fictional adviser)"`. `intro-video.html:23,27` say "FSP 00000 (SAMPLE: fictional adviser)". `what-to-expect-card.html` shows no FSP. | **PASS** |
| 10 | Sample FSP in the render defaults (§4e: "every sample, template example and render default") | `brand/exports/render.mjs:10` still `fsp: '12345'`. That object feeds `whatsapp/intro-card-1080x1080_sample.png` and `…1200x628_sample.png` (l.35-36), so the rendered PNGs still show "FSP 12345". Also `brand/scripts/build-logos.mjs:171,175` writes "FSP 12345" into `lockup-cobrand-sample.svg`. | **FAIL (M; H if either intro-card PNG is uploaded as a template header sample)**. Set `fsp: '00000 (SAMPLE: fictional adviser)'` in render.mjs:10 and "FSP 00000" in build-logos.mjs:171/175, then re-render. Owner: visual-producer. |
| 11 | Intro-video SAMPLE tag visible on the frame Meta sees (wave 3 row) | `intro-video.html:16,42` tag opacity 0 until t ≥ 0.2 s. The lower third `.lt` (l.9) also starts at opacity 0, and l.27 `#who` carries "(SAMPLE…)". | **OPEN (L)**. intro-media-producer / visual-producer to confirm that frame 0 of the exported MP4 shows `#who` or the tag. The simplest fix is to start `.tag` at opacity 1. |
| 12 | Fee payer on public pages (#29) | `landing/holding/how-we-make-money.html:7,16` "Lead Velocity, which runs SortMyCover, is paid a flat fee by advisers." `learn/what-happens-on-a-30-minute-call.html:58` "Advisers pay Lead Velocity, which runs SortMyCover, a flat fee." `learn/how-sortmycover-works.html:48` names Lead Velocity. | **PASS** |
| 13 | faq.md v1.0.2 FAQ-23 (review-3 §2) | `knowledge/faq.md:178` "No, only {practice} gets your details. The firms that handle data for us (hosting, WhatsApp, the AI model and Meta) are listed at /privacy." The AF line at l.179 matches. | **PASS on substance**: the provider line is present, so the l.201 rule holds. **FAIL (L)**: "/privacy" is not a link in WhatsApp. Use "sortmycover.co.za/privacy" (as FAQ-05 l.52 already does) in EN and AF, and bump to v1.0.3. |
| 14 | Portal ROI privacy pill (review-3 portal M) | `src/pages/portal/Reports.tsx:147` "optional · stored on your broker record" | **PASS** |
| 15 | Profile show-rate claim | `src/pages/portal/Profile.tsx:139` "Leads see these before they meet you." | **PASS** |
| 16 | Calendar promise to leads | `src/pages/portal/Calendar.tsx:153` "Meetings already booked stay booked. While paused, no new times with you are offered." | **PASS**. It no longer promises anything to leads on the broker's behalf. |
| 17 | `policies_reported` in the FAIS boundary test (#30) | `automation/billing/fais-boundary.test.js:17-21` FORBIDDEN still holds only policies_written, close_rate, commission and fact_broker_roi | **FAIL (L)**. Add `['policies','reported'].join('_')` and `['tracking','to'].join('_')` (see §2h). Owner: platform-architect. |
| 18 | Landing #12: "and a short intro from them" | `landing/template/index.html:186` "You get their name, practice and FSP number straight away." | **PASS** |
| 19 | Landing #13: "calendar invite on its way" | `index.html:165` and `config/strings.json:23` "Your adviser's details are on their way. Add the call to your calendar below." | **PASS** |
| 20 | Landing #14: "Work cover is a start." | `strings.json:32` "A licensed adviser can check what your work cover includes, and what it does not." | **PASS** |
| 21 | Landing #15: "What most employers provide" | `index.html:51` "Typical employer cover" | **PASS** |
| 22 | Landing #16: "Within a minute" | `index.html:141` and `strings.json:27` "In about a minute…" / "named in your WhatsApp in about a minute" | **PASS** |
| 23 | Absolute opt-out URL (#9) | `landing/config/site.json:9` "https://sortmycover.co.za/privacy.html#opt-out" | **PASS** |
| 24 | self-employed "often have none" | `landing/angles/self-employed.json:10` "Self-employed people have no work cover to start with." | **PASS** |
| 25 | C13 gets its own page H1 (review-3 §4f) | `landing/RECONCILE.md:72` records the decision (myth-bust stays H18/C12; C13 gets H16 "Checking cover is not the same as buying."), but no angle file or `?h=` override exists yet | **OPEN (L)**. Do not send C13 traffic to `myth-bust` until the angle variant exists. Owner: landing-page-builder. |
| 26 | Privacy page behind the Pixel (#34) | `landing/holding/privacy.html` now renders PN-v1. It has a Pixel/CAPI section (l.~80-86), a processor table (l.69-77), and `#opt-out` (l.88) with off/on controls that call `smc.adsOff()`/`adsOn()` or fall back to the same `smc_ads_off` flag (l.144). STOP, the NCC registry, retention, rights, the IO and the FAIS Ombud route are all present. | **PASS (structure)**. This now meets the precondition for GATE-PIXEL test traffic on staging. It is still a "DRAFT for practitioner review" (l.39) with {{placeholders}}, which is correct until GATE-OPINION. Three content FAILs follow in #27-29. |
| 27 | Privacy: email sent to Meta | `privacy.html:72,84` "Measures our ads using your coded (hashed) number and email" / "Before we send your number and email to Meta…". The code does this: `automation/capi/capi.js:46` `put('em', …)` and audience schema l.136-138 `EMAIL`. | **FAIL (M)**. This conflicts with 0.1 (Email: "used only for that invite") and with the page's own l.~50 "We use it only for the invite". 0.1 wins, so remove `em` from CAPI and `EMAIL` from the audience schema, and drop "and email" from PN-v1 (here and in `deliverables/contracts-drafter/consent-and-privacy.md:98,109,121`). Owners: ads-api-engineer, contracts-drafter. No Jonathan input needed. |
| 28 | Privacy: "No thanks" retention | `privacy.html:105` "If you say 'No thanks' on WhatsApp: we keep only a coded copy of your number". That is true for W03 consent-stage No thanks (`automation/ctwa/w03.js:133-136`: suppress hash, origin dropped). It is not true for the W08 nurture "No thanks" (`automation/lib/w08.mjs:107`), which keeps the full lead row as `unbooked_closed` and adds no suppression. | **FAIL (M)**. Preferred fix: make W08 `no_thanks` also push `{kind:'suppress', mobile_hash, source:'no_thanks_nurture'}`. A No thanks to further messages is an objection under POPIA s69/s11 and must hold across every workflow. Then either schedule minimisation of the row, or scope the PN line to "before you agree". Owners: automation-engineer, contracts-drafter. |
| 29 | Privacy: adviser feedback and transcription not disclosed | W29 stores the adviser's disposition, 1-5 rating and a voice-note transcript and summary about the lead (`automation/lib/w29.mjs:66-71`). It transcribes through an unnamed `TRANSCRIBE_URL` ("Whisper-class") in `automation/W29.json`. PN-v1 "What we collect" lists only what the lead gives, and the processor table names no transcription vendor. | **FAIL (M)**. Add under "What we collect": "From the adviser after your call: how it went, a 1 to 5 rating and a short note. We use these to improve our ads and questions." Name the transcription provider in the processor table, or keep W29 voice notes off until it is named. POPIA s18 applies to information from another source. Owners: contracts-drafter, automation-engineer. |
| 30 | W01 rebuilds the consent text from `consent_version` (#11) | `automation/tests/W01.test.mjs`: 0 references to `consent_version` | **FAIL (M), carried**. Waits on GATE-TEST-W01 (automation-engineer). The same applies to W03: the test should rebuild `ctwa-named-v1` from version + broker row (§2a). |

**Section 1 tally: 23 PASS · 7 FAIL (#10, #13-link, #17, #27, #28, #29, #30) · 2 OPEN (#11, #25).** Review-3 had 16 FAILs; 14 of them now pass. The two still failing are #10, where render.mjs was missed in the 12345 sweep, and #17. #27-29 are new findings on the new privacy page.

---

## 2. New drafts: FAIS / POPIA / 2.1.x check of lead- and broker-facing strings

### 2a. W03 CTWA intake (`automation/ctwa/w03.js`, inlined into `automation/W03.json`)

| Line | String / behaviour | Result |
|---|---|---|
| l.53-57 `ctwa-named-v1` | "Before we start: if it's a fit, we'll share your details with {practice} (FSP {n}), an authorised financial services provider who'll contact you about life cover. OK to continue?" Buttons: Yes, continue / No thanks | **PASS (FAIS)**: names the practice and FSP, says "authorised FSP", gives no advice and no product. **FAIL (M, POPIA)**: there is no identity of the responsible party, no privacy link and no opt-out route at the point of consent. The landing named consent carries these, so the two consent records are not equivalent evidence. Add one line, with no wall of text: "SortMyCover (Lead Velocity) · Reply STOP any time · Privacy: sortmycover.co.za/privacy". Bump to `ctwa-named-v2` and store the full text, as l.143 already does. The body stays under 1,024 chars. |
| l.47-50 generic `ctwa-v1` | Generic text exists in code | **PASS** only because 0.1 keeps `generic` off until the practitioner approves it. `consentFor` reads `brand.consent_mode`, so a mis-set brand row would switch it on silently. Add a test that the brand row is `named` while one broker exists. L. |
| l.51, 123-125 no named broker | "Thanks for getting in touch. We can't take new enquiries right now. Please try again in a few days." | **PASS**. Nothing is stored and no consent is asked. |
| l.133-136 "No thanks" | Suppress hash, "No problem. We won't contact you again. Take care.", origin and answers dropped | **PASS**. This is the right pattern; W08 should copy it (§1 #28). |
| l.137-150 consent_yes | Stores consent text, version, mode, time and source. A CAPI `Lead` is sent only after consent. | **PASS** |
| l.155-157 free text before consent | Re-asks; the text is not stored | **PASS** |
| l.77-79 questions | "Roughly what could you put towards cover each month?" with bands; age/budget bands match 0.1 (45-50 qualifies, both upper budget bands qualify) | **PASS** |
| l.207 out of band | "…we're not the right fit for you right now, so we won't pass your details on." The row is deleted after 24 h. | **PASS**. L: PN-v1 l.109 promises "You can ask a person to look again". Add "If you think we got it wrong, reply PERSON." so the promise can be reached in the channel. |

### 2b. W07 conversation agent (`automation/lib/w07.mjs` + `conversation/lines.mjs`)

| Item | Result |
|---|---|
| Order: taps/STOP/brokers never reach an LLM; LLM draft only if outputGate + classifier (sees the question, I-27) + toneCheck pass; blocked advice-shaped question → DEFER + DEFER_NOTED (l.255) | **PASS** |
| `parseVerdict` fails closed (l.231-236) | **PASS** |
| Fallbacks l.211-221: "Here are the next open times with {adviser}." / "No problem, here are some other times." / "Do you want me to cancel your call on {date} at {time}?" / "I'll change it to {method}." / "Thanks, I've saved that." / language switch / booking status | **PASS**. They are factual and carry no advice, no product and no promise. |
| First reply prefixes DISCLOSE / DISCLOSE_PRE_ROUTE (l.205): "I'm Thandi, Lead Velocity's booking assistant… I'm an AI assistant, and you can ask for a person at any time." | **PASS** (AI disclosure, Meta + 2.1) |
| Handoff lines (lines.mjs l.43-46): in hours "shortly"; out of hours "by 09:00 {open_time_word}"; complaint "within 48 hours" + email | **PASS**. L: `HOURS.open = 8` in w07.mjs l.16 says "every day". The 09:00 promise therefore covers Sundays and public holidays, so someone must be rostered. Confirm, or make `open_time_word` skip days that are not staffed. |
| Contact confirms l.271-302: "Is this the number {adviser} should call you on?", "If we can't reach you, is there another number?", "Best time…" | **PASS**. They are asked only for call methods, ignored questions are not re-asked, and email is never asked here (0.1). |
| `inWindow` guard: free-form text only inside 24 h (l.262) | **PASS** (Meta) |

### 2c. W08 nurture (`automation/lib/w08.mjs`)

| Item | Result |
|---|---|
| Stops on booking, opt-out, suppression, handoff, No thanks or a closed stage; cap of 12 outbound; quiet hours 20:00-08:00 SAST; idempotency key; session vs template by window (l.55-66, 92-102) | **PASS** |
| Buttons "See open times" / "Not now" / "No thanks" (l.103); "Not now" sends nothing (no nagging) | **PASS** |
| 24 h text variant injects `brokers.bio_short` into a consumer message (l.95) | **PASS with condition (M)**. bio_short must be the same FAIS-checked bio approved in Profile/IntroMedia (compliance-qa spot-checks the first per broker, 4.10c step 7). Add a guard: no approved bio, no send. |
| "No thanks" (l.107) closes, but there is no suppression | **FAIL (M)**. See §1 #28. |
| CTWA stall track: `STALL_STATES` includes `consent_pending` (l.27), but `stopReason` returns `not_disclosed` when `broker_id` is null (l.63). Pre-route CTWA stalls therefore never send from W08, while W03 schedules its own stall nudges (`w03.js:72` STALL_HOURS). | **FAIL (L, functional)**. Pick one owner of CTWA stall nudges. Any nudge to a `consent_pending` number may only ask the consent question again. It is not marketing, because no consent exists yet. |

### 2d. W10 reschedule / cancel (`automation/lib/w10.mjs`)

| Item | Result |
|---|---|
| "No problem, here are some other times." (l.50); slots only from W04; one rebooking offer after cancel; no offer if opted out (l.93) | **PASS** |
| Broker-side reschedule or cancel = Schedule D, no replacement (l.113) | **PASS**. Matches agreement Schedule C2 "You missed the call". |
| `replacementEffect('lead_cancel')` → "lead choice is not a contract trigger (0.1, Schedule C)" (l.112) | **needs_human (money)**. Schedule C (`broker-services-agreement.md:247-252`) does not say this. A verified lead who cancels and never rebooks has no meeting, so W29 never asks for a disposition. Such a lead counts as delivered and has no replacement path, unless it meets "Uncontactable" (no reply through the full follow-up sequence) or "would not take a call". Decide which applies. My recommendation: after the one rebooking offer and the W08 sequence with no reply → `uncontactable`; with an explicit "don't want a call" → `nofit_criteria/would_not_take_call`. Either way, write it into Schedule C1. |

### 2e. W11 digest + pre-call brief (`automation/lib/w11.mjs`, templates `broker_daily_digest`, `precall_brief`)

| Item | Result |
|---|---|
| Digest "Good morning {1}. You have {2} SortMyCover calls today: {3}. You will get a short brief 15 minutes before each one." Leads are shown as first name + initial (l.28-33). No meetings, no message. | **PASS** |
| Brief fallback (l.66-79): age band, budget band ("R750 to R1,250 a month"), what was asked with "(deferred to you)", BRIEF_HEALTH_LINE instead of health detail, number to call marked "(not the WhatsApp number)" | **PASS**. Health detail never leaves Postgres (l.53). It holds no advice or product, and the budget band is the lead's own answer, not a quote. |
| Unmarked backstop: attended + auto_marked + unconfirmed at +24 h, ON CONFLICT DO NOTHING; if the lead said "No, not yet", it is queued, not auto-attended | **PASS** (0.1 broker feedback; Schedule C2) |

### 2f. W29 feedback loop (`automation/lib/w29.mjs`, `broker_feedback_thanks`, `broker_fit_followup`)

| Item | Result |
|---|---|
| `broker_feedback_thanks` "Logged, thank you. {1} Your feedback shapes the next leads we send you." with {1} from `thanksLine` (l.106-110) "That ad is now rated 4.2 from 6 of your calls." (n ≥ 5) / "That is 3 of your calls rated from this ad so far." | **PASS**. It is true, promises no spend, and n ≥ 5 is respected. |
| `broker_fit_followup` "…The follow-up is yours; this is only a reminder." | **PASS**. We do not act as intermediary in the sale. |
| Voice note: "Thanks. Please keep voice notes under a minute." (l.67); transcript redacted; health → "[health detail removed]"; audio not kept | **PASS** (2.1.7). The PN gap is §1 #29. |
| Replacement claims only from `unreachable` / `nofit_criteria` | **PASS** (Schedule C1). L, functional: `applyDisposition` requires `outcome === 'attended'` (l.53), yet `unreachable` is one of its codes. Check that W12's "not reached" path opens the `uncontactable` claim without needing an attended outcome. |
| Tuning texts (l.95, 101) | Internal (insights), not sent. **PASS** |

### 2g. W19 billing messages (`automation/billing/build-workflows.mjs`, `broker_autorenew_off`)

| Item | Result |
|---|---|
| `broker_autorenew_off` "…card auto-renew is now off, so we will not charge your card again. Your current cycle carries on as normal… manual EFT… (no fees). No lock-in: if you don't renew, the cycle simply ends and your delivered leads stay yours." | **PASS** (0.1 payment default, lead ownership, no grace) |
| Auto-renew opt-in only; token in Vault via wrapper; portal off-switch takes the broker from the JWT only (l.233, 536-544) | **PASS** (OWASP ASVS: no IDOR) |
| T-3/T-1 reminder l.499 "…Card auto-renew: on, we charge your card at cycle end." | **FAIL (L)**. A recurring card charge notice should state the amount and how to stop it: "on: we will charge R{total} (excl. VAT{vat}) at cycle end. Switch it off in the portal any time." Template `broker_renewal_reminder` is still pending (NH-BA-08), so fold this in there. |
| Note l.572 "Day 7 after a lapse: one…" win-back | **PASS**. One message to a business is not dunning, and 0.1 "no grace" holds. |

### 2h. W14 weekly report (`automation/W14-broker.md`, `scripts/build-broker-report-email.mjs`)

| Item | Result |
|---|---|
| WhatsApp mapping: six lines, aggregates only, no lead names; "No lock-in." enforced by `assertClean`; BANNED list covers spend/CPL/guarantee/best/cheapest/"no contract"/appointments (l.41) | **PASS** |
| Mid-cycle status "A little behind: we are adding leads and your cycle can extend up to 14 days." | **PASS** (0.1 shortfall; "committed", never "guaranteed") |
| Email body = sections 1, 2, 3, 4, 7, 8 (no ROI) | **PASS** |
| **Emailed PDF includes s6 ROI** (`renderPrint` l.203-206): "Your close rate: 30%. On your numbers you are tracking to about 3 policies this cycle. … Policies you report are for your view only." The email is bcc'd to howzit@ ("copy retained", W14-broker.md Email). | **FAIL (M)**. (a) "for your view only" is false once Lead Velocity keeps a copy. This is the same defect review-3 fixed in Reports.tsx. (b) A retained Lead Velocity record of policies per delivered lead is exactly the data the *Raspberry Academy* boundary keeps out of our systems. Fix: leave s6 out of the emailed PDF (keep it in the logged-in portal print only), and drop `policies_reported`/`tracking_to` from the stored `reports.payload_json`, or compute them at view time. Owners: automation-engineer, broker-success. |

### 2i. Section 2 tally

**31 PASS · 7 FAIL (W03 named consent POPIA line; W08 No thanks; W08 stall owner; W14 PDF ROI; W19 reminder amount; plus §1 #27/#29 surfaced through W03/W29 and counted there) · 1 needs_human (W10 lead-cancel replacement).** I found no advice-type, comparison, quote, product or insurer statement in any new lead-facing or broker-facing string.

---

## 3. The two show-rate claims

| Where | Claim | Evidence in our sources | Ruling |
|---|---|---|---|
| `src/lib/smc.ts:136` STEPS "media" | "Not needed to go live, but it lifts show rate." | MASTER-PROMPT 4.10c grades the video/show-rate evidence **C → tested** ("treated as a hypothesis we measure", l.993). The Airbnb photo study is about trust, not show rates. The 4.10b test (first 100 bookings, video vs voice vs none) has not run. No verified-facts row exists. | **Reword (L)**: "Not needed to go live. We're testing whether it helps people turn up." |
| `src/pages/portal/IntroMedia.tsx:31` | "People show up for people. A lead who has seen your face and heard your voice for 25 seconds before the call is far less likely to no-show. It takes 10 minutes once." | The prompt (l.999) supplies this line, but the same section grades the claim C and requires measurement (l.977, l.1024: "If video doesn't move show rate after 100 bookings, the step becomes optional and we say so"). "Far less likely" is a comparative performance claim with no source, so 2.1.5 applies. | **Reword (L)**: "People show up for people. We expect a lead who has seen your face and heard your voice before the call to be more likely to turn up, and we measure it on your first 100 bookings. It takes 10 minutes once." Restore the stronger line only when 4.10b shows a lift, and cite the result. The same applies to the explainer clip line (l.1020) "the one thing that moves your show rate most". Owner: platform-architect (portal), intro-media-producer (clip). This is not a money or legal call, so it is not needs_human. |

---

## 4. Sign-offs and needs_human

**I sign off (compliance-qa):**
- All 3 broker billing templates and 4 billing strings: "no lock-in" wording (§1 #1-7).
- The 3 `broker_intro_*` template examples and the 5 brand templates with FSP 00000 (SAMPLE). This does not cover the rendered intro-card PNGs until render.mjs is fixed (#10).
- Public fee-payer wording (how-we-make-money, learn pages).
- Portal Reports / Profile / Calendar wording.
- Landing review-2 carry-overs #12-16, site.json opt-out URL, self-employed gap line.
- `privacy.html` **structure** (Pixel section, processor table, `#opt-out` control) as the precondition for GATE-PIXEL **staging** test traffic. It is not signed for publication: content FAILs #27-29 remain, and GATE-OPINION is pending.
- W07 fixed lines and fallbacks; W10 lead strings; W11 digest + brief fallback; W29 thanks/follow-up/voice lines; `broker_autorenew_off`; W14 WhatsApp mapping and email body (not the PDF).
- faq.md English: **v1.0.3 once the "/privacy" link is made absolute** (#13). Afrikaans stays unsigned until a native-speaker read.

**Withheld until fixed:** W03 `ctwa-named-v1` (→ v2 with the responsible party, STOP and privacy link), W08 `no_thanks` (suppress), W14 emailed PDF s6, CAPI hashed email, intro-card sample PNGs.

**needs_human (money/legal only):**
1. **W10 lead cancel with no rebook → which Schedule C1 trigger, if any** (money, agreement text). Recommendation in §2d.
2. Carried, not new: whether an opt-out (not opt-in) Pixel is enough under POPIA/ECTA **(practitioner)**. It is already in the practitioner brief, and the control now exists.

Everything else above is pre-decided by 0.1 or 2.1 and goes straight to its owner.

---

## 5. Owner dispatch (for the orchestrator)

| Owner | Items |
|---|---|
| visual-producer | render.mjs:10 + build-logos.mjs:171/175 → 00000 (SAMPLE), re-render intro-card PNGs and cobrand lockup; intro-video frame-0 tag (§1 #10-11) |
| ads-api-engineer | remove `em` / `EMAIL` from `automation/capi/capi.js:46,136-138` (§1 #27) |
| contracts-drafter | PN-v1: drop "and email" to Meta; add adviser-feedback line; add transcription processor; scope or keep the "No thanks" line once W08 suppresses (§1 #27-29) |
| automation-engineer | W03 `ctwa-named-v2` + test that rebuilds it from version; PERSON line on out-of-band close; W08 `no_thanks` suppress + single owner for CTWA stall nudges + bio_short guard; W14 PDF without s6 + payload without policy fields; W19 reminder amount; W29 transcription provider named or voice notes off; W01 consent_version test (§1 #30, §2) |
| platform-architect | `policies_reported` / `tracking_to` in FORBIDDEN; smc.ts:136 + IntroMedia.tsx:31 rewording (§1 #17, §3) |
| conversation-designer | faq.md FAQ-23 EN/AF absolute privacy link → v1.0.3, eval gate (§1 #13); confirm 09:00 handoff staffing every day (§2b) |
| landing-page-builder | C13 / H16 angle variant (§1 #25) |
