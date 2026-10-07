# Phase 4 review 3: fix wave 1 re-check, faq v1.0.1, NH-34, NH-35, portal/console spot-check

Date: 2026-10-02 · Reviewer: compliance-qa · Mode: read-only. I edited no reviewed file, and I did not edit `build/tasks.json`, `decisions.md`, `gates.jsonl` or any SUMMARY.md. No web research was done.
This is a QA flag list, not legal advice. Anything marked **(practitioner)** belongs in the external opinion (GATE-OPINION).
Severity: **H** = fix before Meta submission or any publish · **M** = fix before go-live (Section 7) · **L** = tidy-up.
Rule references: docs/MASTER-PROMPT.md 1.2 (l.152), 2.1.1 (l.170), 2.1.5, 2.1.8 (l.187), 4.5 row 4 (l.639), 0.1.

Tools run during this review:
- `node automation/templates/check.mjs`: 48 templates, 0 errors, 6 button-count notes.
- `node evals/run.mjs --dry-run`: **PASS** (STOP 100%, state machine 100%, prefilter false positives 0%).
- `node --test automation/billing/fais-boundary.test.js`: 3/3 pass.

---

## 1. Fix wave 1 as applied

### 1a. Landing

| # | Item (review-2 ref) | File:line | Result |
|---|---|---|---|
| 1 | H1s for the angles match hook-library-v2 (L-1) | `landing/angles/new-bond.json:5`, `turned-40.json:5`, `self-employed.json:5`, `virtual.json:5`, `employer-gap.json:5` | **PASS** |
| 2 | The myth-bust H1 no longer carries the unsourced cost claim (L-2) | `landing/angles/myth-bust.json:4-5` (H18 "No price in this ad. On purpose.") | **PASS**. It uses H18 instead of C13. Both are compliant, and H18 matches the C12A creative. |
| 3 | "Most bonds don't" removed (L-3) | `landing/angles/employer-gap.json:6` ("The bond and the bills don't.") | **PASS** |
| 4 | FAQ privacy answer no longer says "no one else"; processors and the hashed contact sent to Meta are named (L-4) | `landing/config/faq.json:28` | **PASS** |
| 5 | FAQ fee answer says Lead Velocity is the payee, the fee is per 30-day cycle, the consumer pays nothing, and it is never commission (L-11) | `landing/config/faq.json:14` | **PASS** |
| 6 | The l.144 promise "No products, prices or paperwork" removed (L-5) | `landing/template/index.html:144` now reads "No obligation to buy. Any next step is your choice."; `dist/*/index.html:376` | **PASS** |
| 7 | dist rebuilt after the copy fixes (L-12) | `landing/dist/*/index.html` built 12:52, after angles (12:49) and faq.md (12:38). All 7 pages carry the new fee answer; 0 carry "no one else" or "a flat fee to set up calls" | **PASS**. The build check that fails on a FAQ hash mismatch was not verified. |
| 8 | `#opt-out` anchor target exists (L-14) | `landing/holding/privacy.html:52` `<h2 id="opt-out">` | **PASS** |
| 9 | The opt-out link host matches the other footer links | `landing/config/site.json:9` `"optout_url": "/privacy.html#opt-out"` is relative, while privacy, how-we-make-money and complaints are absolute `https://sortmycover.co.za/…` (dist l.438). It breaks if the pages are ever served from a different host than the holding site (for example the staging subdomain or link.sortmycover.co.za). | **FAIL (L)**. Use `https://sortmycover.co.za/privacy.html#opt-out`. |
| 10 | "Check if yours lines up" removed (L-15) | `employer-gap.json:6` | **PASS** |
| 11 | W01 rebuilds the consent text on the server from `consent_version` and rejects a mismatching client copy (L-13) | No test in `automation/tests/W01.test.mjs` and no `consent_version` reference in `automation/tests/` | **FAIL (M)**. This is owed by automation-engineer. |

Review-2 items that were **not dispatched in wave 1** and are still open (these are not regressions; carry them to wave 2 for landing-page-builder):

| # | File:line · quote | Fix | Sev |
|---|---|---|---|
| 12 | `landing/template/index.html:186` "…and a short intro from them." (L-6) | Delete the clause. The intro video never blocks go-live (0.3 #12). | M |
| 13 | `template/index.html:166` + `config/strings.json:23` "…and a calendar invite are on their way." (L-8) | "Your adviser's details are on their way. Add the call to your calendar below." Phone and WhatsApp-call bookings get no invite (0.1 Email). | M |
| 14 | `config/strings.json:32` "Work cover is a start." (L-9) | "A licensed adviser can check what your work cover includes, and what it does not." | M |
| 15 | `template/index.html:51` note "What most employers provide" (L-10) | "Typical employer cover". This matches the "typically" wording in 1.1 l.132. | M |
| 16 | `template/index.html:142` + `strings.json:27` "Within a minute…" (L-7) | "In about a minute…" | L |

### 1b. WhatsApp templates (`automation/templates/*.json`)

| # | Item | File:line | Result |
|---|---|---|---|
| 17 | Hosts | Consumer links use only `https://sortmycover.co.za/c/…` and `/j/…`. Broker and ops links use only `https://leadvelocity.co.za/…`. No staging host and no `leadvelocity` host appears in any consumer template. | **PASS** |
| 18 | "no contract" in broker copy | `broker_cycle_end.json:13` "…with your current tier selected and no contract." | **FAIL (M)**. Use "…and no lock-in." This is a template, so fix it before GATE-TEMPLATES. Once submitted, a change means re-review. |
| 19 | "no contract" in broker copy | `broker_onb_nudge_72h.json:19` "It's month to month, with no contract." | **FAIL (M)**. Use "It's month to month, with no lock-in or notice period." Same timing as #18. |
| 20 | AI disclosure for button-only web leads (NH-19 a) | `broker_intro_booked.json`, `broker_intro_slots.json`, `broker_intro_slots_v2.json` BODY: no AI sentence | **OPEN (H, gate)**. Add "This chat is run by Lead Velocity's AI booking assistant." before GATE-TEMPLATES if Jonathan says yes to NH-19 a. |
| 21 | Sample FSP number | `broker_intro_booked.json:23`, `broker_intro_slots.json:23`, `broker_intro_slots_v2.json:23` example `"12345"` | **FAIL (H, before submission)**. See §4e. |
| 22 | Template lint | `check.mjs` 0 errors | **PASS** |

### 1c. Billing wording

| # | Item | File:line | Result |
|---|---|---|---|
| 23 | Portal agreement screen says "per 30-day cycle" and "no lock-in" | `src/pages/portal/Agreement.tsx:122`, `:125`, `:192` | **PASS** |
| 24 | Checkout description | `automation/billing/paystack.js:46` "No contract, no auto-renew." | **FAIL (M)**. Use "No lock-in." Drop "no auto-renew" too: card auto-renew exists as an opt-in (0.1), so the blanket statement can become untrue. |
| 25 | Tier-card line | `automation/billing/render.js:12` "Month to month. No contract. Pay for a month, get your leads, decide again next month." | **FAIL (M)**. Use "Month to month. No lock-in. Pay for one 30-day cycle, get your leads, decide again." ("Month" for a 30-day cycle also misstates the unit.) |
| 26 | Schedule A / proposal line | `automation/billing/render.js:94` "Month to month, no contract." | **FAIL (M)**. Use "Month to month, no lock-in." |
| 27 | Manual-EFT page | `automation/billing/build-workflows.mjs:497` "No contract: if you don't renew…" | **FAIL (M)**. Use "No lock-in: if you don't renew…" |
| 28 | Public fee-payer wording | `landing/holding/how-we-make-money.html:39` "pays Lead Velocity a flat fee for each 30-day cycle" | **PASS** |
| 29 | Public fee-payer wording | `how-we-make-money.html:7` and `:16` meta/og "SortMyCover is paid a flat fee by advisers"; `learn/what-happens-on-a-30-minute-call.html:58` "Advisers pay SortMyCover a flat fee" (P-4, still open) | **FAIL (L)**. Use "Advisers pay Lead Velocity a flat fee for each 30-day cycle." Lead Velocity (Pty) Ltd is the contracting party. |
| 30 | FAIS boundary CI | `automation/billing/fais-boundary.test.js` passes 3/3. Its forbidden list covers policies_written, close_rate, commission and fact_broker_roi, but **not `policies_reported`** (used in `src/pages/portal/Reports.tsx:141`). | **PASS (L note)**. Add `policies_reported` to FORBIDDEN. |

The `render.js` wording comes from `LINE_UNDER_CARDS` and feeds every price surface (W25 compares them). Fix it once at the source.

### 1d. Pixel (`landing/shared/pixel.js`)

| # | Item | File:line | Result |
|---|---|---|---|
| 31 | Automatic Advanced Matching off | `pixel.js:67` `fbq('set','autoConfig',false,…)` | **PASS** |
| 32 | No PII in the browser: params are stripped by key, and page_url carries no query string | `pixel.js:12` (PII regex), `clean()` l.85-88, `context()` l.79 | **PASS** |
| 33 | Consent gate in code | `pixel.js:19` `consent()` (window flag + stored `smc_ads_off`), checked at l.60, l.96, l.105, and for `_fbp`/`_fbc` at l.72-76 | **PASS** |
| 34 | The gate's precondition is that the privacy notice names the Pixel and offers the off switch (pixel.js l.5 ASSUMPTION) | `landing/holding/privacy.html` is still a placeholder: "[Pending approval]" at l.51 and l.55, no mention of Pixel, cookies or Meta measurement, and no visible control that calls `smc.adsOff()`. The drafted text exists in `deliverables/contracts-drafter/consent-and-privacy.md`. | **FAIL (M; H before any GATE-PIXEL test traffic)**. Render the approved notice into privacy.html and add a "Turn off ad measurement" link that calls `smc.adsOff()`. Whether an opt-out (not opt-in) Pixel is enough under POPIA stays a **(practitioner)** question; it is already in the brief. |

**Section 1 tally: 17 PASS · 16 FAIL · 1 OPEN (gate).** Of the 16 FAILs, 5 are review-2 items that were never dispatched (#12–16). By severity: 1 H (#21), 12 M (#34 becomes H before any GATE-PIXEL traffic), 3 L.

---

## 2. `knowledge/faq.md` v1.0.1 re-review

K-1 to K-7 have landed. FAQ-05 now has the provider line. FAQ-09 says per 30-day cycle and never commission. FAQ-25 names the lead pulse. The unsourced line is gone from FAQ-11. FAQ-02, FAQ-10 and FAQ-16 say "no obligation to buy". DEF-09 to DEF-12 are added, and the self-harm/bereavement route is in place. Everything else in Part A still passes (honest, no advice, STOP everywhere, email limited as 0.1 requires).

**Sign-off: English withheld for one edit. It becomes v1.0.2.**

1. **FAQ-23 (l.~177, M).** "No. We share them with {practice} only, and we never sell them or pass them to other advisers." breaks the file's own rule at l.201 ("Thandi never says 'only to {practice}' without the provider line"), and it disagrees with landing `faq.json:28`, which names Meta. Change it to: "No. {practice} is the only adviser who gets them, and we never sell them. The service providers we use are listed at sortmycover.co.za/privacy." The AF line should match. *(My own K-2 wording caused this; the l.201 rule supersedes it.)*
2. **FAQ-18 (L, verify rather than edit).** "you can join from your phone's browser… and you don't need an account" is a product-behaviour claim about Teams that I cannot verify offline. Check it on the first test call. If the phone browser cannot join, change it to "…join from the Teams app on your phone, and you don't need an account."
3. **DEF-10 / DEF-11 (note, no edit).** The fixed DEFER line ("That's exactly what {adviser_first} will go through with you") is 4.11 verbatim, so I leave it. But medical aid and wills may fall outside the adviser's FSP categories. The brief should tag these topics `scope_check` so the broker can say "that's not something I do" on the call.

When edit 1 lands as v1.0.2, I sign the English text of Parts A and B. **Afrikaans is not signed.** It needs a native reader (NH-28 d / 6B.11), including the "(Edms) Bpk" point in FAQ-08 and FAQ-15.

---

## 3. New landing sub-lines and the employer-gap H1/sub (NH-34): FAIS 2.1.x check

| Angle | Copy (file:line) | 2.1.1 advice | 2.1.5 claims | 2.1.8 second person | Result |
|---|---|---|---|---|---|
| new-bond | sub `new-bond.json:6` "A new bond can outgrow old cover. A licensed adviser can check in 30 minutes." | none | hedged ("can") | none | **PASS** |
| new-bond | gap_p `new-bond.json:10` "Work cover is usually a few times salary. A new bond, school fees and years of income add up to more." | none | relies on the 2–4× source (§4a) | none | **PASS** (sourced via §4a) |
| turned-40 | sub `turned-40.json:6` "Cover set at 28 may not fit life at 40. 30 minutes with a licensed adviser. No obligation." | none | hedged ("may") | none | **PASS** |
| myth-bust | H1/sub `myth-bust.json:5-6` "No price in this ad. On purpose." / "The real cost depends on the person…" | none. It explains why no premium is quoted, which supports 2.1.1. | no claim | none | **PASS**. Note: on the page, "this ad" reads oddly but stays true, and message match with C12A wins. |
| employer-gap | H1 `employer-gap.json:5` "Most work life cover stops at 2–4× salary." | none | sourced at prompt level (§4a) | none | **PASS** |
| employer-gap | sub `employer-gap.json:6` "The bond and the bills don't. A licensed adviser can check the gap in 30 minutes, on WhatsApp or video." | "check the gap" is generic (work cover vs bond), not a statement about the reader | ok | none | **PASS** |
| self-employed (not in NH-34; spotted while there) | gap_p `self-employed.json:10` "Self-employed people often have none to start with." | none | "often have none" is ambiguous (none of *any* cover?) and unsourced | none | **FAIL (L)**. Use "Self-employed people have no work cover to start with." (true by definition) |

**NH-34 ruling: sign-off for all NH-34 copy.** Default "ship as drafted" stands. The only condition is the §4a filing (C01 and the employer-gap page share the 2–4× claim).

---

## 4. Creative renders (NH-35): on-asset copy (`deliverables/visual-producer/engine/art.mjs`) and manifest `concept_flags`

### 4a. NH-PCD-01: is "2–4× salary" sourced?

**Yes, at prompt level.**
- `docs/MASTER-PROMPT.md` l.132 (1.1 Core insight): "employer group life (typically 2–4× salary)".
- l.639 (4.5 row 4): mandates citing "typical employer cover is 2–4× salary".
- l.1984 (Section 9 sources): "SA life cover need case study & employer cover 2–4× salary: SA life cover buying guides (2026)". This entry has **no URL and no named publisher**. Review 2 recorded it as grade C.
- Under 0.1 Research status this is final input, so I do not re-research it.
- "Most … stops at 2–4×" is a fair reading of "typically". The prompt itself uses that construction at l.187, l.451 and l.596.

**Ruling:** the C01 on-asset copy (`art.mjs:7`: hook, "The bond and the bills don't.", "the gap", "Easy to miss.") is **approved for first submission**.

**Source filing**, a ready-to-paste row for `deliverables/verified-facts.md`. That file is orchestrator-owned, so I have not edited it:

| Fact | Owner | Status (2026-10-02) | Value in use | How it gets verified |
|---|---|---|---|---|
| Employer group life is typically 2–4× annual salary (C01 hook, landing gap bar, learn "what-is-a-life-cover-gap") | compliance-qa | **PROMPT SOURCE** (MASTER-PROMPT l.132, l.639, l.1984: "SA life cover buying guides (2026)", grade C, no URL on file) | "Most work life cover stops at 2–4× salary." / "Typical work cover 2–4× salary" | Jonathan pastes the guide URL and the quoted sentence before GATE-ADS-APPROVE-3 (evidence for a Meta/ARB challenge). If none is on file at submission, C01 ships with "Work cover is often a few times salary." |

### 4b. NH-PCD-02: the R1.4m / "3× salary cover" example (C02A, `art.mjs:9-10`)

**Not allowed for cycle 1, labelled or not.**
- "3× salary cover" is a cover amount. Combined with "R1.4m bond" and "= ?" / "= a gap", it invites the viewer to calculate a personal cover shortfall in rands.
- 1.2 (l.152) bans cover amounts. 2.1.8 (l.187) says compliance-qa "rejects any ad or page that names … [a] cover amount". 4.5 row 4 (l.639) keeps rand numbers out of the gap visual.
- The tag "Illustrative example. Not advice." does not change what the viewer does with the numbers. That is disclaimer theatre.
- The 4.2 hook library lists H2 (l.1371). That conflicts with 2.1, and 2.1 is "non-negotiable", so 2.1 wins.

**Ship C02B (H12)** (`art.mjs:11-12`). Its copy passes. "Enough for a bond and the bills?" carries no "you/your" and no figure. C02A stays out of the refresh pool unless the practitioner opinion clears labelled illustrations. That is an optional **(practitioner)** question, not a Jonathan decision.

### 4c. NH-PCD-04: C12B / H8 "Life cover costs less than most people think" (`art.mjs:34`)

**Hold.**
- The prompt mandates the angle (l.456) and lists H8 (l.1377), but cites **no source** anywhere. Section 9 has nothing on cost perception.
- 2.1.5 forbids unverifiable claims, and the claim is also price-adjacent (2.1.1).
- **Ship C12A (H18)** (`art.mjs:32-33`). It makes no comparative claim, and "A guess is not a number." is fine. H8 comes back only with an SA survey source on file.
- The default in NH-35 matches this, so Jonathan has nothing to do here.

### 4d. C01 caption "The adviser looks at the real numbers with you." (`performance-creative-director/creative-briefs/C01.md:25`)

**PASS.**
- 2.1.8 bans second-person **assertions about the viewer's finances, debts, family, health or ethnicity**. This line says what the adviser does on the call. It asserts nothing about the viewer's circumstances.
- My review-2 list of "allowed phrases" described where "you" appeared then. It was not an exhaustive whitelist.
- No change is required. If the team wants zero "you" outside the end card, "The adviser goes through the real numbers on the call." also works.

Spot-check of the rest of `art.mjs`: the other on-asset lines pass on 2.1.1 and 2.1.8. Two L notes:
- C06 "Many families carry more than one household. / Often all on one income." (`art.mjs:20`) uses soft quantifiers with no source. Acceptable as "many/often" (not a statistic), but it is the culturally loaded theme 2.1.8 warns about. Keep the wording neutral, as it is now, and never label it.
- C13 "Real numbers. Where the gaps are." (`art.mjs:37`) presumes gaps exist. That is fine as a generic call description.

### 4e. "FSP 12345" sample check

**Finding:** fictional FSP 12345 is shown as if real in places without a "sample" label.

FSP numbers are numeric and in this range. **12345 may belong to a real, licensed FSP.** I cannot check the FSCA register offline. Paired with the real broker's first name "Mark" and the words "authorised financial services provider", it could misattribute a real licence.

Where it appears:

| Where | Labelled as sample? |
|---|---|
| `automation/templates/broker_intro_booked.json:23`, `broker_intro_slots.json:23`, `broker_intro_slots_v2.json:23` (Meta review examples) | no |
| `brand/templates/intro-card.html:38` | yes, "SAMPLE: fictional adviser" (l.28) |
| `brand/templates/intro-video.html:23,27` | yes; the tag at l.30 starts at opacity 0, so check that it is visible on the frame Meta sees |
| `brand/templates/what-to-expect-card.html:27`, `reminder-card.html:21`, `lower-third.html:12` | **no** |
| `brand/exports/render.mjs:10` | n/a (defaults) |
| `brand/logo/lockup-cobrand-sample.svg` | yes (aria/title) |
| Plus test fixtures and legacy `src/` | internal only |

**Ruling (H before GATE-TEMPLATES):** replace "12345" with "00000" in every sample, template example and render default (00000 is visibly not a real FSP). Keep the "SAMPLE: fictional adviser" tag on the intro card and video, and add it to what-to-expect, reminder and lower-third renders. Test fixtures may keep any value. Owners: automation-engineer (template examples) and visual-producer (brand defaults, re-render the samples). The meta-operator README line flagged in NH-MO-13 should be updated to match.

### 4f. Addendum: creative-strategist v1.1 new copy (source of truth: `deliverables/creative-strategist/concepts.md` v1.1; `art.mjs` shows only what is rendered now, pre-re-render)

**C02 / H12 (`concepts.md` l.75-87; `concepts.csv` C02 rows) — PASS, cleared for upload after re-render.**
- Hook "3 lines on a payslip worth a look." Primary text, headline "Line 3 is the cover line", and the on-screen lines "Gross vs net" / "Retirement fund" / "Group life cover: how many × salary?" / CAP "Work cover vs the bond and the bills." all pass.
- No rand figure, no cover amount, no premium, no statistic, no product or insurer (1.2, 2.1.1, 2.1.5).
- "A payslip", never "your payslip". The only "you/your" are "you decide after" and the end-card line "Tap to check your cover" (2.1.8).
- "How many times salary does it pay?" asks what the document shows, not what the viewer needs. "That line shows what work cover pays, not what the bond and the bills need" is true and makes no judgement.
- Note for the re-render: `art.mjs:12` currently shows "Enough for a bond and the bills?". That line is acceptable, but v1.1 replaces it with "Work cover vs the bond and the bills.", which is better. Use the v1.1 line.

**C12 / H18 (`concepts.md` l.218-230; `concepts.csv` C12 rows) — PASS, cleared for upload after re-render.**
- The hook is literally true. "The real cost of life cover depends on age, health, smoking and what the cover must do" names general pricing factors and asserts nothing about the viewer's health (2.1.8).
- "Every family is different." and "A licensed adviser works it out with the real numbers" both pass: the adviser, not us, does the pricing (2.1.1).
- The headline "Life cover: check the real cost" carries no figure and no anchor, so it is not a price hook.
- No MYTH/FACT card, no comparative claim (NH-PCD-04 respected). The blank, struck price tag carries no currency symbol.
- **Message-match note (L):** `concepts.md` l.229 says "the myth-bust landing page H1 uses C13". But `landing/angles/myth-bust.json:4-5` uses H18, the C12 hook. C12 → myth-bust page therefore matches. C13 ads then need their own page H1 (an angle variant or `?h=` override), or both owners must agree which concept the page serves. This is for creative-strategist and landing-page-builder to align; no Jonathan input is needed.

**website-wording.md v1.1 (3.5a, leadvelocity.co.za B2B) — PASS with one L.**
- Contract FAQ (l.163) "There is a short, plain-language agreement that you sign. But there is no lock-in, no minimum term and no notice period. You pay for one 30-day cycle at a time. If you don't renew, it simply ends." is **PASS**. It is true, CPA s41-safe, and consistent with 0.1 (no grace, no notice).
- "No lock-in" at l.27, l.44, l.62, l.107 and l.135: **PASS**. l.44/l.107 "No commission." and l.31 "extends by up to 14 days": **PASS** (0.1).
- **L:** l.27 "You pay upfront for one month" and l.135 "Pay for a month, get your leads, decide again next month." The unit is a 30-day cycle (0.1). Because these are 3.5a mandated statements, fold the change into Jonathan's NH-new-A sign-off: "for one 30-day cycle" / "Pay for one 30-day cycle, get your leads, decide again." `automation/billing/render.js:12` (#25) must carry the same final wording, because W25 diffs them.

---

## 5. Console/portal copy spot-check (`src/pages/portal`, `src/pages/smc`)

**Grep results:**
- "guarantee", "cheapest", "risk-free": **0 hits.**
- "no contract": 0 in copy. `Reports.tsx:20-21` *rewrites* it to "No lock-in." (a defensive filter; fine).
- "best": `Profile.tsx:145` is a rule hint ("no 'best'"), `Leads.tsx:23` is a `best_time` field, and `smc/Ask.tsx:16` is an internal question ("best adviser rating"). None are claims.

**Second-person benefit claims and other wording issues:**

| File:line | Quote | Issue | Fix | Sev |
|---|---|---|---|---|
| `src/pages/portal/Reports.tsx:137` | "Your ROI view · optional · only you see this" | Not true. The inputs are written to the `brokers` row (l.60 `update({close_rate, avg_commission_zar})`), which Lead Velocity staff and the console can read, and S10/NH-15 RLS is still open. A false privacy statement to the broker. | "Optional. Used only for this view, never for pricing." Or move the fields to a broker-only table with RLS that excludes ops reads. Add `policies_reported` to the FAIS boundary test (#30). | M |
| `src/pages/portal/Profile.tsx:139` | "A real face lifts show rate." | Unsourced performance claim to the broker (2.1.5 applies to all deliverables). | "Leads see these before they meet you." (drop the claim), or cite the 4.12 evidence line if one exists. | L |
| `src/pages/portal/Calendar.tsx:153` | "Leads still arrive and are told you'll be in touch." | A promise made on the broker's behalf to leads. It holds only if W-flow actually sends that message and the broker follows up. | Confirm the paused-booking template exists. Otherwise: "Leads still arrive; we tell them a time will follow." | L |
| `src/pages/portal/Help.tsx:16`, `Start.tsx:46` | "Jonathan taps Go live" | Fine: accurate description of the gate. | — | — |

No "guaranteed", "best/cheapest" or income/close-rate promises appear in portal or console copy. The ROI view states its own method (`Reports.tsx:152`) and never forecasts as a promise. **PASS with 1 M + 2 L.**

---

## 6. Sign-off now vs NH for Jonathan

**Signed off now (compliance-qa):**
1. NH-34: the new-bond, turned-40 and myth-bust sub-lines and the employer-gap H1/sub, as drafted.
2. Landing fix-wave-1 items #1–8 and #10 (H1s, myth-bust, "many/the bond and the bills", FAQ info/fee, l.144, dist rebuild, opt-out anchor).
3. C01 on-asset copy and the C01 caption "with you" (§4a, §4d), with the 2–4× filing row recorded.
4. C02 (H12) and C12 (H18) **v1.1 new copy** (§4f), cleared for upload once re-rendered from concepts.md v1.1. website-wording.md v1.1 contract FAQ and "no lock-in" lines (§4f). C13 and the other `rendered` rows in `art.mjs`.
5. NH-PCD-02 decided: C02A **not** approved (2.1.1/1.2/4.5). NH-PCD-04 decided: C12B **held**. Both match the NH-35 defaults, so Jonathan has no action.
6. Pixel code (autoConfig off, PII strip, consent gate). Template hosts.
7. Portal agreement screen wording. how-we-make-money l.39.

**Not signed (owner fixes, no Jonathan input needed):**
- faq.md: English signs at v1.0.2 after the FAQ-23 edit (§2).
- "no contract" in 2 templates and 4 billing strings (#18, #19, #24–27).
- FSP 12345 → 00000 plus sample labels (§4e).
- privacy.html real notice + ads-off control before GATE-PIXEL (#34).
- W01 consent rebuild test (#11).
- Carried landing L-6 to L-10 and the opt-out absolute URL.
- Fee-payer wording at how-we-make-money l.7/16 and the learn page l.58.
- Reports.tsx "only you see this".
- self-employed gap_p.

**Stays NH for Jonathan (money/legal only):**
- **NH-PCD-01 / NH-new-C (legal evidence):** paste the "SA life cover buying guide (2026)" URL and the quoted sentence before GATE-ADS-APPROVE-3. Default if silent: C01 ships with "Work cover is often a few times salary."
- **NH-19 a (legal disclosure):** yes/no on the AI sentence in the three `broker_intro_*` templates before GATE-TEMPLATES. My recommendation remains yes.
- **NH-new-A (mandated 3.5a text, legal wording):** approve "no lock-in" in statement 1 / under-cards line, and in the same sign-off "one month" → "one 30-day cycle" (§4f). Default if silent: "no lock-in" ships, "month" stays.
- **NH-28 d:** name the native Afrikaans reader. Nothing in Afrikaans goes live until then.
- **(practitioner, via GATE-OPINION, not a Jonathan decision):** opt-out Pixel adequacy under POPIA; whether labelled rand illustrations (C02A) could ever run.
