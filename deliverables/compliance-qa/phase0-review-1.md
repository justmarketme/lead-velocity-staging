# Phase 0 review 1: compliance-qa evaluator (4C.4)

Date: 2026-10-02 · Reviewer: compliance-qa · Scope: templates, holding site, Pixel/CAPI, contracts-drafter set.
Nothing reviewed was edited. This is a QA flag list, not legal advice. Items marked **(practitioner)** go to the external opinion.
Severity: **H** = fix before Meta submission or any publish · **M** = fix before go-live (Section 7) · **L** = tidy-up.
Grade check: a heuristic Flesch-Kincaid run puts the lead-facing template bodies at 2.4 (worst `unbooked_nudge_24h_text` 5.3) and the holding pages at 5.8 to 6.6. The orchestrator's run on the agreement gave 6.7. All are at or below 7.

---

## 1. WhatsApp templates: `automation/templates/*.json` (36) + `README.md`

| # | Check | Result | Evidence |
|---|---|---|---|
| 1.1 | Every lead-facing template says STOP | PASS | All 21 lead-facing bodies end "Reply STOP to opt out." Broker and ops templates have no STOP line, which is fine because they are B2B or internal. |
| 1.2 | `broker_intro_booked` / `_slots` / `_v2` carry practice, FSP number and adviser before any meeting | PASS | The 4.6 text is used verbatim: `*{{2}} (FSP {{3}})*` … `*{{4}}*`. |
| 1.3 | No premiums, cover amounts, products, insurers, comparisons, advice, "you should", best/cheapest/guaranteed | PASS | Banned-word scan is clean. "best" appears only in a broker prompt ("Which best describes") and in `precall_brief` ("Best time"), and neither is a claim. |
| 1.4 | Money in third person (2.1.8) | PASS | `prep_nudge`: "some people like to have a recent payslip…" |
| 1.5 | Grade 5–7 | PASS | Lead-facing templates average FK 2.4. |
| 1.6 | No emojis | PASS | No non-ASCII characters apart from the en dash and the middle dot. |
| 1.7 | No lead full names to brokers or ops | PASS (send-time) | Every example uses "Lerato M.". The constraint can only be enforced when the message is sent. **Fix (M):** add a W05/W11/W12/W14 unit test that rejects any broker or ops parameter that does not match `^\p{L}+ \p{L}\.$`. |
| 1.8 | No marketing content; honest urgency only | PASS with 2 fixes | No offers, countdowns or discounts. See F1-5 and F1-6. |
| 1.9 | AI-assistant disclosure at first contact (4.11) | **FAIL** | None of the 36 templates say an AI assistant is involved. See F1-1. |
| 1.10 | `lead_pulse` / `reach_check` never ask about the advice | PASS | "was your call with {{2}} worth your time?" and "did {{2}} reach you today for your call?" The aggregate-only line matches 6B.2. |
| 1.11 | `broker_disposition` codes match 4.12a | Codes PASS · labels **FAIL** | All six codes and their meanings match. **Four** labels are shortened, not two. See F1-3. |
| 1.12 | Other wording | FAIL (1) | `broker_outcome_check` implies replacements depend on the sales outcome. See F1-2. |

**Fixes**

- **F1-1 (H) AI disclosure missing.** Rule 4.11: the assistant "discloses it's an AI assistant on first contact". The same promise appears in 3.5a.3, and the privacy notice says "Our WhatsApp assistant uses AI". First contact happens in two places: W06 (`broker_intro_booked`, `broker_intro_slots`, `broker_intro_slots_v2`) and W03 (the CTWA consent message). **Fix:** add one sentence just before "Reply STOP to opt out." in the three intro templates: *"This chat is run by Lead Velocity's AI booking assistant."* Add the same sentence to the CTWA consent message (consent-and-privacy 1.6). Also keep W07's first free-text reply introducing "{name}, Lead Velocity's AI booking assistant for {adviser}". **needs_human:** 4.6 calls the intro text "exact", so adding a sentence conflicts with 4.11. The orchestrator should log this. My recommendation is to add the sentence, because 4.11 is a disclosure rule and the 4.6 text is not changed, only extended. Keep the assistant booking-only (Meta WhatsApp Business policy allows business-specific bots, not general-purpose AI chat).
- **F1-2 (M) `broker_outcome_check.json:8`**: "One tap helps us replace leads that did not work out." Rule 2.1.1 says replacements are never tied to "didn't buy", and *Raspberry Academy* is the reason. "Did not work out" reads as a sales outcome. **Fix:** "Hi {{1}}, how did your {{2}} call with {{3}} go? One tap logs it. Calls not marked within 24 hours count as attended." This also makes NH-CD-15 visible to the broker.
- **F1-3 (H) `broker_disposition.json:30/38/42/46`**: four labels differ from 4.12a, and all four full labels are over 25 characters: "Good fit – needs follow-up" (26), "Not a fit – already well covered" (32), "Not a fit – outside criteria" (28), "Unreachable / wrong number" (26). The automation-engineer's needs_human mentions only two. "Not a fit – covered" also changes the meaning (has any cover vs already well covered), and that matters because one code is replacement-eligible and the other is not. **Fix:** adopt one canonical set and use it in the buttons, the portal, the CRM and Schedule C: `fit_proceeding` "Good fit – proceeding" (21) · `fit_followup` "Good fit – follow-up" (20) · `nofit_budget` "Not a fit – budget" (18) · `nofit_covered` **"Not a fit – well covered"** (24) · `nofit_criteria` "Not a fit – criteria" (20) · `unreachable` **"Unreachable/wrong number"** (24). The orchestrator should amend the 4.12a table to this set (needs_human, prompt text).
- **F1-4 (L) `README.md:39`** says the in-window interactive list will carry "the full 4.12a labels". WhatsApp list row titles allow only 24 characters, so the full labels would not fit there either. **Fix:** use the canonical set (F1-3) as row titles. The longer explanation can go in the row description (72 characters).
- **F1-5 (M) `intro_media.json:17`, `intro_media_voice.json:18`**: "recorded this short video for people booking a call this week". The recording is generic (4.12) and may be months old, so the sentence is an unverifiable claim. **Fix:** "…recorded this short video so you know who you will be speaking to."
- **F1-6 (L) `broker_cycle_end.json:13/37`**: "Your renewal offer is ready" with a "See renewal offer" button. This is the most likely utility template to be re-categorised as marketing. **Fix:** "Your payment link for the next cycle is ready, with your current tier selected and no contract." Change the button to "Pay next cycle".
- **F1-7 (M) `unbooked_nudge_24h_text.json:23`**: the example bio "Mark has helped families in Gauteng for 12 years" is wrong, because Mark is in Cape Town (Section 1), and it is an unverified performance claim shown to Meta's reviewers. **Fix:** "Mark is a licensed adviser in Cape Town and speaks English and Afrikaans." Also add to the README that `bio_short` is broker-signed and goes through the guardrail scan (no claims, no best/cheapest, no years-of-experience unless verified on the FSCA register).
- **F1-8 (H, platform) Portal and console hostnames.** Ten broker and ops templates hard-code `https://portal.leadvelocity.co.za/` or `https://console.leadvelocity.co.za/` as the URL-button base. 6.7 and the agreement (clause 2) use `app.leadvelocity.co.za` (portal/console static). The base URL is fixed when Meta approves the template, so getting it wrong means resubmitting later. **Fix:** change the base to `https://app.leadvelocity.co.za/{{1}}`, or have devops-security confirm both subdomains before submission.
- **Note:** `reach_check` (W12 T+30) and `lead_pulse` (W35, after Attended) can arrive within minutes of each other. That is fine for compliance. W35 should only fire after the `reach_check` reply, as 6B.2 says.

**Verdict (1): PASS WITH FIXES.** Before submission: F1-1, F1-3, F1-8. Before go-live: F1-2, F1-5, F1-7 and the 1.7 test. Tidy-up: F1-4, F1-6.

---

## 2. Holding site: `landing/holding/*.html`

| # | Check | Result | Evidence |
|---|---|---|---|
| 2.1 | Educational only | PASS with 1 fix | See F2-1. |
| 2.2 | Footer disclosure verbatim (4D.2 rule 8) | PASS | On all 6 pages, e.g. `index.html:53`. |
| 2.3 | No broker named | PASS | — |
| 2.4 | FAQ gives no advice | PASS | Third person ("Most work cover…", "Many bonds…"). No figures. JSON-LD matches the visible text. |
| 2.5 | How we make money matches 0.1/2.1.1 | PASS | "flat fee for each 30-day cycle… same whether or not anyone buys a product… No commission, ever. No share of any premium." |
| 2.6 | Complaints page matches 2.1.7 | PASS with 2 fixes | howzit@leadvelocity.co.za, the COMPLAINT keyword and the 48-hour SLA are all present. See F2-2 and F2-3. |
| 2.7 | Privacy page is a marked stub | PASS | Shows "[Pending approval]". It has `noindex` and is left out of `sitemap.xml`. `deploy.md` §0 requires it to be filled before indexing. |
| 2.8 | No data capture | PASS | No `<form>`, `<input>` or `<script>`, and no Pixel. |
| 2.9 | 3.5a banned words | PASS | "financial advice" and "premiums" appear only inside the mandated disclosure sentence (footer, About l.39, and the index FAQ l.45 / JSON-LD, which reuse the same sentence verbatim). "commission/premium" on the money page are negations, not figures. |

**Fixes**

- **F2-1 (M) `about.html:37`**: "We help people find out if their cover has a gap." This says we assess a person's own cover, and that is needs analysis, which belongs to the adviser (FAIS). **Fix:** "We explain what a cover gap is. When a person asks, we connect them with…"
- **F2-2 (L) `complaints.html:42`**: "…to that adviser's firm and to the regulator." This is vague, and the privacy notice already names the bodies. **Fix:** "…to that adviser's firm and, if not resolved, to the FAIS Ombud. Privacy complaints can go to the Information Regulator."
- **F2-3 (M) `complaints.html:37`**: "send the word COMPLAINT on WhatsApp in any SortMyCover chat" does not work for someone who has no chat. **Fix:** add the SortMyCover WhatsApp number (or a `wa.me` link) when the WABA number exists.
- **F2-4 (M) Footer (all pages, e.g. `index.html:55`)**: 4.5 row 13 requires an Opt-out link, and consent-and-privacy defines Terms and Cookies pages. **Fix:** when the privacy text lands, add `terms.html`, `cookies.html` and an "Opt out" anchor (STOP, the registry, email), and link all three from the footer.
- **F2-5 (H, pre-publish)**: the `{{CIPC_REG_NO}}` and `{{ADDRESS_*}}` placeholders. The index FAQ claims "The company registration number is in the footer of every page", which is false until they are filled. hello@sortmycover.co.za must also be a live, monitored mailbox ("which a person reads"). `deploy.md` §0 already gates the placeholders. Add the mailbox check there.

**Verdict (2): PASS WITH FIXES.** Before publish: F2-5. Before indexing or go-live: F2-1, F2-3, F2-4 and the privacy fill. Tidy-up: F2-2.

---

## 3. Pixel and CAPI: `landing/shared/pixel.js`, `pixel.README.md`, `automation/capi/event-spec.md`

| # | Check | Result | Evidence |
|---|---|---|---|
| 3.1 | No unhashed PII leaves the browser | PASS with 2 fixes | `clean()` strips name, phone and email keys from event params, and `init` passes no user data. See F3-1 and F3-2. |
| 3.2 | Hashing server-side only | PASS (code) · config risk | `capi.js` hashes with SHA-256. Meta's Automatic Advanced Matching would hash form fields *in the browser*. See F3-2. |
| 3.3 | Consent assumption stated and consistent with the privacy notice | PASS with 2 fixes | Stated in `pixel.js` l.4–7 and the README. Privacy notice PN-v1 names the Pixel, CAPI and cookies (consent-and-privacy l.120–121, 184–201). See F3-3 and F3-4. |
| 3.4 | Audiences only for exclusion and lookalike seeding | PASS | `event-spec.md` POPIA note. Pixel retargeting (Campaign B) uses on-Meta pixel audiences, which 4.4a allows. |
| 3.5 | Advertising-improvement sentence in the consent line (4.4a) | Present · **placement FAIL** | `consent-and-privacy.md` exists, and CONSENT-ADS-v1 (l.36–40) is shown *under* the checkbox and says it is "not part of the sharing consent", so the tick does not cover it. It is also missing from the CTWA consent (1.6). See F4-3. |

**Fixes**

- **F3-1 (M) `pixel.js` `context()`**: `page_url: w.location.href` sends the whole query string to our server, and the Pixel sends the URL to Meta. **Fix:** strip the query to an allowlist (`utm_*`, `fbclid`, `ref`) before storing. landing-page-builder must never put name, phone or email in a URL (thank-you states are in-page, which is good).
- **F3-2 (H, before GATE-PIXEL)**: browser-side matching. **Fix:** meta-operator sets Events Manager → *Automatic advanced matching = OFF* and checks in Test Events that no `ud[...]` parameters arrive. Add `fbq('set','autoConfig',false,pixelId)` before `init` in `pixel.js`. Swap the PII denylist in `clean()` for an allowlist (`content_name`, `value`, `currency`).
- **F3-3 (M) Off switch is not persistent.** The cookie notice (consent-and-privacy l.199–201) promises a "Cookie settings → Ad measurement off" control. `pixel.js` only reads a window variable that nothing sets. **Fix:** read a stored choice (`localStorage smc_ads_off === '1'`, set by the banner or settings) and `navigator.globalPrivacyControl === true` as consent=false. Keep the default "on with notice" until practitioner answers Q9.
- **F3-4 (L) Retention mismatch.** The cookie notice says the utm/fbclid store lasts "until you send the form or clear your browser", but `pixel.js` keeps `smc_attr` in localStorage forever. **Fix:** clear `smc_attr` after a 2xx from `POST /lead`, and expire it after 30 days.
- **F3-5 (M) `event-spec.md` / `capi.js`**: there is a `consent_ads_at` column but no gate in the code. **Fix:** `sendEvent`/`sendOffline`/`hashAudienceRow` callers (W01, W05, W12, W29, the nightly audiences) skip `user_data` for any lead with a null `consent_ads_at` (fail closed). Then the Q8 alternative (a second tick) becomes a flag flip.
- **F3-6 (M) Privacy notice accuracy** (consent-and-privacy l.98 and l.121): CAPI also sends the IP address and browser type unhashed, plus offline `Attended`/`GoodFit` with the adviser's 1–5 rating as `value`. **Fix:** in the "Measure and improve our ads" row, add "IP address and browser type, and whether a booked call took place". Add the rating-to-Meta point to practitioner Q8.

**Verdict (3): PASS WITH FIXES.** Before GATE-PIXEL: F3-2. Before go-live: F3-1, F3-3, F3-5, F3-6 and F4-3. Tidy-up: F3-4.

---

## 4. contracts-drafter set: `deliverables/contracts-drafter/`

| # | Check | Result | Evidence |
|---|---|---|---|
| 4.1 | Flat fee per cycle, never tied to policies (2.1.1 / *Raspberry Academy*) | PASS | Agreement 4.1, 4.2, Sch A (l.212–229). Term sheet l.12. Policies-written data is used for the ROI view only (4.2). |
| 4.2 | No grace, no notice, no auto-renew obligation | PASS | Agreement 4.4–4.5, 13.1. Term sheet l.16, 18. |
| 4.3 | "Committed", never "guaranteed" | PASS | Grep finds no "guarantee" in any of the three documents. |
| 4.4 | Per-cycle replacement caps | PASS | Sch A `{{replacement_cap_cycle}}`. Term sheet "Up to 4 per cycle". No weekly cap. |
| 4.5 | Shortfall: 14-day extension, then pro-rata credit or refund; liability capped | PASS | 5.2 (price ÷ committed, refund within 10 business days, NH-CD-09), 13.3, 14.1. Term sheet R825 = 16,500/20. |
| 4.6 | Schedule C codes match 4.12a and the template buttons | Codes PASS · labels **FAIL** | See F4-1 and F4-2. |
| 4.7 | Both consent_mode texts match 2.1.2, plus the separate advertising sentence | PASS · ads sentence **FAIL** | Generic text (l.34) is verbatim. Named text (l.26) is verbatim plus the STOP sentence, which I agree with (NH-CD-04). Ads sentence: see F4-3. |
| 4.8 | Privacy notice names all processors and the 2.1.7 retention periods | PASS with fix | 8 processors (more than 2.1.7's five). 12 months / 5 years / 24 hours / hashed suppression. See F4-4. |
| 4.9 | STOP/opt-out and complaints channel | PASS | Privacy l.145–152 (STOP, NCC registry, howzit@ + COMPLAINT, 48 h, FAIS Ombud, Information Regulator). Agreement 9.5. |
| 4.10 | Authorisation letter | PASS | Annex 1 (l.286–299): broker approves each ad, access limited, withdrawable. Agreement 12.2 makes the ads the broker's advertising under the GCoC. |
| 4.11 | Reading level | PASS | Orchestrator FK 6.7 over 3,643 words. This resolves NH-CD-24 for the agreement only. Re-run on consent-and-privacy and the term sheet. |
| 4.12 | Portal host | PASS | `app.leadvelocity.co.za` matches 6.7. The templates are the ones that are wrong (F1-8). |

**Fixes**

- **F4-1 (H) Schedule C/D labels ≠ 4.12a ≠ buttons.** 4.12a requires the same words in the buttons, the CRM and the contract. Mismatches: `broker-services-agreement.md:257` "Good fit, going ahead" (4.12a: "Good fit – proceeding") · l.258 "Good fit, needs follow-up" · l.260 "Not a fit – already well covered" (button: "Not a fit – covered") · l.251 "Not a fit – outside criteria" (button: "Not a fit – criteria") · l.250 "Unreachable / wrong number" (button: "Unreachable / wrong no."). **Fix:** put the F1-3 canonical label next to each code in C1 and C2, word for word. Schedule D item 1 should name the same three-tap sequence.
- **F4-2 (M) `broker-services-agreement.md:251`**: `nofit_criteria` "choose a reason: age band, budget band, not their number, would not take a call, or duplicate". No template or flow captures that reason. "Not their number" is the `unreachable` code, and "duplicate" is caught at intake (W01). **Fix:** limit the reasons to age band / budget band / would not take a call. automation-engineer adds a follow-up reason list in the 24-hour window (and in the portal). Remove "not their number" and "duplicate", or map them to `unreachable` and an intake error.
- **F4-3 (H) Advertising sentence placement (`consent-and-privacy.md:36–40, 46–60`).** 4.4a says the consent line itself carries "to measure and improve our advertising" as its own sentence. The draft puts it outside the tick ("not part of the sharing consent") and leaves it out of the CTWA consent entirely, even though CTWA leads feed business-messaging and offline events. **Fix:** make it the last sentence *inside* the checkbox label in both modes: *"I also agree that Lead Velocity may use my details in coded (hashed) form to measure and improve its ads on Facebook and Instagram."* Add the same sentence to the CTWA second line. Store it under `CONSENT-ADS-v1` with `consent_ads_at`. Whether it needs a second, optional tick stays with practitioner Q8.
- **F4-4 (M) Processor list (`consent-and-privacy.md:107–116`)**: the regions are `{{… — confirm}}` and must be filled before privacy.html is published. 4.12a names "Whisper/Claude transcription" for broker voice notes, which can mention the lead. If OpenAI Whisper is used, add OpenAI. Otherwise state "Claude only". Cloudflare (0.3 #7 tunnel) must not carry real lead data, or it has to be listed.
- **F4-5 (L) `consent-and-privacy.md:172`** Terms s4 says "flat monthly fee". **Fix:** "a flat fee for each 30-day cycle", to match 0.1 and the money page.
- **F4-6 (L) CTWA consent (1.6)** also needs the F1-1 AI sentence.

**Views on NH-CD-10 to NH-CD-15 (money rules next to compliance)**

| ID | My view | Compliance-relevant? |
|---|---|---|
| NH-CD-10 | **Agree with the draft.** No-show is a replacement trigger under 2.1.1, 0.1 and 3.2 ("~4 no-show replacements"). 4.12a's "nothing else does" is about the *dispositions* after Attended, and no-show is an *outcome*. There is no real conflict. The orchestrator can close this and reword 4.12a. | Yes (2.1.1 triggers) |
| NH-CD-11 | **Acceptable.** It is evidence-based (message log), time-boxed, gives written reasons and escalates under clause 15. One addition: a claim under dispute should not count against the cap until it is decided. Fairness under CPA s48 stays with practitioner Q12. | Yes (practitioner) |
| NH-CD-12 | **needs_human stays (money).** As drafted, any lead who replies once and then goes silent before booking can be replaced. That quietly makes the *booked* lead the unit, which goes against 0.1 ("booking is a service") and the 3.2 margin warning. Recommendation: limit "uncontactable" to (a) messages undelivered after verification or (b) the broker marking `unreachable` on the booked call, backed by the log. Not "no reply to nurture". The cap limits the exposure either way. | Yes (unit-sold integrity) |
| NH-CD-13 | **needs_human stays (money).** The literal reading of 3.3 means we deliver an attended meeting for free. Recommendation: amend 3.3.3 to "replied/tapped within 72 h **or** attended the booked call (broker-marked `Attended`, or `Yes, we spoke` on `reach_check`)". Attendance proves the number is real better than a tap does. This is a contract change, so Jonathan decides and the practitioner does not need to. | Low |
| NH-CD-14 | **Agree.** The cycle starts when routing goes on after payment clears, which is fair and auditable. W16/W20 must store `cycle_start = routing_on_at`, and the console and term sheet must read that field. Confirm. | No (billing) |
| NH-CD-15 | **Agree.** It matches 0.1 (unmarked at 24 h → attended, flagged). Make it visible to the broker in `broker_outcome_check` (F1-2) and Schedule D item 1 (already there). | Low |

**Verdict (4): PASS WITH FIXES.** Before signature or publish: F4-1, F4-3. Before go-live: F4-2, F4-4. Tidy-up: F4-5, F4-6. Jonathan decides NH-CD-12 and NH-CD-13 before Mark signs.

---

## 5. `needs_human:` lines from other agents' SUMMARYs: my view

**automation-engineer** (`deliverables/automation-engineer/SUMMARY.md`)
1. *broker_intro_slots slot lines + Time 1/2/3 buttons count as "exact wording"?* Yes. The 4.6 sentences are intact, and the added lines are data, not claims. Not a compliance issue. Close.
2. *Disposition labels over 25 characters.* It is **four** labels, not two. Resolve with the F1-3 canonical set across buttons, portal, CRM and Schedule C (F4-1). Compliance-relevant (contract alignment).
3. *4.6 "rewrite rather than accept" vs 0.3 #1 "accept".* 0.3 #1 wins for launch, because it is pre-decided and the cost difference is small. After launch, rewrite any lead-facing template Meta re-categorises, because marketing-category messages fall under the NCC registry and consent rules more clearly. Compliance-relevant (low).
4. *Replacement cap 3/week vs 0.1 per-cycle.* 0.1 wins (per cycle 4/6/9). The contract already does this. Fix the 4.6 text. Compliance-relevant (money).
5. *lead_pulse emoji vs 4.11.* Agree with text buttons. 4.11 and the Meta-safe choice win. Fix the wording in W35 and 6B.2. Not compliance.
6. *verified-facts.md location.* Housekeeping. Not compliance.
7. *No templates for reach_check / fit_followup nudge.* `reach_check` is fine (it never asks about advice). The fit_followup nudge goes to the broker only, so it is low risk, and it must not include a full lead name. Not compliance.
8. *Image/video samples dependency.* Not a contradiction. The samples must be compliant (4.8 intro card check) before submission.

**search-findability-lead** (`deliverables/search-findability-lead/SUMMARY.md`): **no `needs_human:` lines** in the SUMMARY. One sits in `landing/holding/deploy.md` §8 (Google Business Profile category). View: do not pick any insurance, financial-planner or broker category (4D.2 rule 2 misleading-name exposure, and we are not an FSP). If no honest non-financial category fits, delay GBP until practitioner Q1. Compliance-relevant.

**attribution-analyst** (`deliverables/attribution-analyst/SUMMARY.md`)
1. *`node --test` directory form fails on Node 22.* Tooling. Not compliance. Pin the file form in CI.
2. *`value` = quality score with ZAR currency.* Technical, to verify at GATE-PIXEL. **Compliance-relevant:** sending the adviser's rating of a person to Meta must be in the privacy notice (F3-6) and in Q8.
3. *business_messaging Schedule / offline via dataset /events / v23.0 are assumptions.* Verify on test events. Not compliance.
4. *ViewContent/Contact browser-only.* Agree. It is the least data sent. Not compliance (it reduces PII flow).

**New needs_human raised by this review (for the orchestrator to log in `build/tasks.json`):**
- NH-QA-01: 4.6 "exact" intro text vs the 4.11 AI disclosure at first contact (F1-1).
- NH-QA-02: amend the 4.12a label table to the canonical 25-character set (F1-3, F4-1).
- NH-QA-03: NH-CD-12 and NH-CD-13 recommendations above (money, Jonathan).

## Overall verdicts
| Deliverable | Verdict | Blocking fixes |
|---|---|---|
| 1 Templates | **PASS WITH FIXES** | F1-1, F1-3, F1-8 before submission. F1-2, F1-5, F1-7 before go-live. |
| 2 Holding site | **PASS WITH FIXES** | F2-5 before publish. F2-1, F2-3, F2-4 and the privacy fill before indexing. |
| 3 Pixel/CAPI | **PASS WITH FIXES** | F3-2 before GATE-PIXEL. F3-1, F3-3, F3-5, F3-6, F4-3 before go-live. |
| 4 Contracts set | **PASS WITH FIXES** | F4-1, F4-3 before signature or publish. F4-2, F4-4 before go-live. NH-CD-12/13 decided. |
