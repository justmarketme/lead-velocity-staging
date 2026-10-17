# Phase 4 review 6: core-path drafts, pulse per-cycle rule, consumer terms, explainer, loader/n8n findings, readiness

Date: 2026-10-03 · Reviewer: compliance-qa · Mode: read-only. Window: 2026-10-02 23:00 → 2026-10-03 04:30 (commits 5834dea … 6ef5e0b). I edited no reviewed file, and I did not touch `build/tasks.json`, `decisions.md`, `gates.jsonl` or any SUMMARY.md. No web research, no DDL, no n8n run, nothing sent.
This is a QA flag list, not legal advice. Items marked **(practitioner)** go to GATE-OPINION.
Severity: **H** = fix before Meta submission or any publish · **M** = fix before go-live (Section 7) / before the named workflow is activated · **L** = tidy-up.
Note: this review was cut short by the turn limit. Areas I did not finish are listed under "Not reviewed in review 6".

Tools run (all green):
- `node automation/templates/check.mjs`: 52 templates, 0 errors, 6 button-count notes.
- `node --test`: fais-boundary (`automation/billing/fais-boundary.test.js`; the `automation/tests/fais-boundary*` glob in the brief matches nothing) 3/3 · capi 12/12 · W01 24/24 · W15 15/15 · W13 17/17 · W12 19/19 · build-broker-report-email 23/23 (combined run 110/110).
- `node evals/run.mjs --dry-run`: **PASS** (FAIS 100%, STOP 100%, tone 100%, prefilter FP 0%).
- `python3 landing/tests/reading_level.py landing/holding/terms.html`: grade 4.0 (prose 4.2), **PASS** (max 7.0).
- ffmpeg frames from `explainer_9x16.mp4` and `explainer_1x1.mp4` at 6 s, 12 s and 36 s.

---

## 1. Core-path drafts (W01, W04, W05, W06, W09, W12, W13, W15)

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | Consent text stored verbatim, with its version (W01) | `lib/w01.mjs` `decide()` row: `consent_text`, `consent_text_version`, `consent_mode`, `consent_at`, `consent_source`. The insert in `W01.json` "Insert lead + timeline" writes them. The page text is stored as posted. Lead Ads text comes from the registry (`consentRegistry`/`withRegistryText`). `consentAudit` logs a `consent_audit` timeline row on mismatch or an unknown version. | **PASS** |
| 2 | Consent required to proceed | `screen()` rejects when the box is not ticked or there is no text (`consent_required`). In named mode `routingFor()` holds a lead whose text names another practice. | **PASS** |
| 3 | Email only for Teams/Zoom/Meet | `EMAIL_METHODS = {teams, zoom, meet}`. The row keeps `email` only for those methods, with `email_purpose = 'meeting_invite'`. | **PASS** |
| 4 | Digits-only hashes | `w01.hashContact` and `w15.hashMobile` hash the digits only. SQL uses `smc_hash_contact`. W01 rate keys are an HMAC of the IP or the digits hash, so no raw IP is stored. | **PASS** (holds on live data once migration 12 is applied, as in review 5) |
| 5 | No email to Meta in the CAPI calls | `capiLead()` returns ids only. The W01 node "CAPI payload (ids only, no email)" forwards six id fields. W05 "CAPI Send (Schedule, no email)" and W12 `capiAttended` carry ids only. `capi.test.js` 12/12. | **PASS**. The `smc-capi-send` callee is not built yet (I-47c). Re-check when it lands. |
| 6 | Bands (0.1) | `QUAL_AGE = {35_44, 45_50}`, `QUAL_BUDGET = {750_1250, 1250plus}`. Out-of-band leads are stored with a 24-h `retention_delete_after`, never routed, never messaged, and get no CAPI event. | **PASS** |
| 7 | Disclosure first touch (W06) | All three `TEMPLATE_BODY` texts name the practice, the FSP number and the adviser, and include "Our WhatsApp assistant uses AI. Reply STOP to opt out." Page leads wait 45 s; the deadline is 60 s. The wamid and delivery are logged as evidence. A failed WhatsApp falls back to SMS with the same words. The card is blocked for opted-out, suppressed, duplicate and out-of-band leads. | **PASS** |
| 8 | FAIS boundary in lead-facing strings (W06, W12, W13, W15 libs and the templates they name: broker_intro_*, reach_check, attended_thanks, missed_you, STOP_ACK*, BROKER_NO_SHOW_APOLOGY) | No advice, comparison, quote, product or insurer name. The template checker and the fais-boundary test are green. | **PASS** |
| 9 | W15 suppression on every opt-out path | `planOptOut` always builds a `suppression` row when there is a number. For a console, DSR or email opt-out that carries only a `lead_id`, the W15 "Load" SQL takes the number from the lead (`COALESCE($1, leads.phone)`). WhatsApp, SMS (`/sms-inbound`, signed), console and W07 opt-out intent all go through the same claim statement. A repeat STOP does nothing. | **PASS** |
| 10 | STOP cancels the booking (NH-52) | Default `cancel` (`bookingMode`). It cancels the W09 jobs, the booking and the Graph event, and tells the broker by WhatsApp or email using the first name only. | **PASS in the 0.1/CONTRACTS direction.** Gap: the lead is not told that the call was cancelled (R6-04). |
| 11 | Retention / `last_contact_at` (I-38d) | Lead-facing sends that Meta accepts update `last_contact_at`: W05, W06 (`sentUpdate`), W09, W12, W13, W15. Dry runs do not update it. | **PASS** |
| 12 | Replacement caps 4/6/9 and "committed" (W13) | `pricing` seed: Bronze 20/4, Silver 30/6, Gold 45/9. The cap is snapshotted onto the cycle. The claim runs under an advisory lock. Nothing in `lib/w13.mjs` or `W13.json` says "guarantee" (the test asserts this). The alert text says "the committed number is unchanged". Credit is capped at the cycle price. "Didn't buy" (nofit_budget / nofit_covered) never triggers a replacement. A broker no-show never triggers one (Schedule D). | **PASS** |
| 13 | Broker feedback flow (W12) | The broker is asked at +15 min, with one nudge at +3 h 15. Attended leads to the 4.12a disposition list, then W29 for the 1–5 rating and the voice note. Unmarked at 24 h → `attended`, `auto_marked`, `unconfirmed`. Two unconfirmed outcomes in a cycle alert Jonathan. Voice notes are stored as a reference only. | **PASS** |
| 14 | L03 / NH-54 reading | Broker unmarked + lead "No, not yet" → `broker_no_show` (Schedule D: apology, rebook at our cost, no replacement, KG alert). This matches CONTRACTS l.139 and the Schedule C reading in needs-human-log row 23. | **PASS (reading)**. Timing and wording issue in R6-03. |
| 15 | W10 R5-11 order | `W10-notes.md`: the cancel is applied only after `cancel_yes`, and the test asserts it. R5-01 (`no_call_c1a` suppression) is now in `lib/w10.mjs` and `W10.test.mjs`. | **PASS** (closes R5-01 / R5-11 in code) |

**GATE-TEST fixture contradictions (needs-human-log l.61):**

| Item | Resolution | In the 0.1/CONTRACTS direction? |
|---|---|---|
| (a) `/lead` duplicate status | The body is the same as for a new lead (`status: 'accepted'`), so the page never learns it was a duplicate | **Yes** |
| (b) Hash with or without "+" | Digits only, everywhere in the libs | **Yes** |
| (c) CTWA consent `ctwa-v1` vs named | `ctwa-named-v2` (review 5 §1 #5) | **Yes** |
| (d) Slot payload `slot:` vs `slot_` | `slot_{ISO}` in W06 and W13, matching the W07 router | **Yes** |

(e)–(h) are build follow-ups (I-45h/o/p), not contradictions. (f) is NH-52, check #10 above.

## 2. Lead pulse per cycle (W14-broker.sql, pulse.mjs, M31, email builder)

| # | Check | Result |
|---|---|---|
| 1 | `facts.broker_pulse`: hidden under 5 answers, per cycle only, held until 5 new answers, computed on the first m answers. `brokerLine` mirrors it. The email `pulseText` refuses n < 5. M31 has no target and no week-on-week change. The portal Reports tab renders the stored payload only. `cycle_counts.pulse_*` never reaches a broker payload. | **PASS (design)** |
| 2 | The `p_prev_n` lookup in `analytics/W14-broker-payload.sql:46-48` uses `rh.week < d - 3`. `week` is the send day (d+1). Midcycle and cycle-end editions can fall 1–3 days after a Monday weekly. The lookup then skips that weekly and holds against an older figure, so the broker can see, for example, 14 of N on Monday and 15 of N on Wednesday in the portal's report list, and difference them to one lead's answer. | **FAIL (M)**: R6-01. This blocks W35 activation under my W35-pulse-visibility ruling. |
| 3 | A POPIA erase removes a `lead_pulse` row, which shifts the "first m answers" set, so a held figure can move by one | **FAIL (L)**: R6-05 |

## 3. Consumer Terms of Use (TU-v1.0)

| # | Check | Result |
|---|---|---|
| 1 | Disclosure wording | §1 and the footer are `DISC-FULL-v1`, verbatim. **PASS** |
| 2 | Claims | No advice, quote, product or insurer. "Flat fee for each 30-day cycle… We earn nothing from any policy" follows 0.1 and *Raspberry Academy*. The 48-h complaint reply matches complaints.html and privacy.html. "Type 'person'" works: `prefilter('person').person === true`. The NCC registry sentence is the same as PN-v1.1 and W24. **PASS** (the NCC claim is only true once W24 evidence exists; see S7-28 below) |
| 3 | Same text as `consumer-terms.md` | A sentence diff shows formatting differences only. **PASS** |
| 4 | Consistent with PN-v1.1 | STOP, AI assistant, IO block and complaints all mirror privacy.html. **PASS** |
| 5 | Reading level | Grade 4.0. **PASS** |
| 6 | Q25–Q29 **(practitioner)** | CPA applicability, s48–51 limit, ECTA s43, how the terms bind, and "not our employee or agent" against BSA 6.4. All five are reasonable, each with a default and an alternative. Q28's default keeps CONSENT-NAMED-v1 unchanged. **PASS** |
| 7 | Privacy page footer link | `privacy.html` links to `/terms.html` (2 links). Every holding page does. **PASS** |

The DRAFT banner and the `{{…}}` placeholders stay until GATE-OPINION and NH-41. This is expected.

## 4. Explainer clip

| # | Check | Result |
|---|---|---|
| 1 | `.srt` and VO script against the storyboard | Word for word. The storyboard l.9 and the clip use "the step we're testing to help people turn up… we expect… and we measure it". This meets the review-5 show-rate rule (closes the clip half of R5-03). "People show up for people" now sits inside hedged framing and makes no quantified claim, so I accept it. **PASS** |
| 2 | Mocks at 12 s and 36 s (both ratios) and at 6 s | Each card carries a "SAMPLE" badge. The 36 s frame shows "Sam Example · FSP 00000 (SAMPLE)". No real FSP, no broker named, no advice. **PASS** |
| 3 | Portal slot | `.clip.square` uses `object-fit: contain`, so the burned-in captions are not cropped. The manifest note "16:9 with object-fit:cover" is stale. | **FAIL (L)**: R6-10 |

## 5. Loader and real n8n findings

| # | Check | Result |
|---|---|---|
| 1 | W07↔W03 loop before the fix (55 round trips) | Cost: 55 Haiku intent calls on a single inbound message, unbounded per message in production (pre-mortem #16). Could the lead have received 55 replies? On this path, probably not: the plan held only W03 delegates (record_answer/next_question), and the W03 forward sends nothing ("merge, no new WhatsApp card"). The smoke also ran with `DRY_RUN_SENDS=true` on a synthetic number, and every send node sits behind "Live send?". **But** nothing structural caps it. The wamid is claimed once, and the W03 hand-back is "No wamid re-claim". `Send WhatsApp (session)` has no one-reply-per-inbound-wamid claim and no hop limit. Any loop variant whose plan carries reply text would send one reply per pass, which is spam to a person and a WhatsApp quality-rating risk (platform restriction). The fix (`explodeDelegations` drops W03 delegates when the origin is w03) closes only this one edge. | **PASS (this loop fixed, tested)** · **FAIL (M)** defence in depth: R6-02 |
| 2 | NH-56 egress | The call that left the box was the intent-slot request. Its body is the system prompt plus `intentUserTurn`: state, field **names** only, booking date/method, and `redactForLLM(text)` of the synthetic message ("I'm 47"). It carries no phone number, no name and no email. It was refused on a synthetic key. Anthropic is a listed processor (privacy.html:78). RUN-LOCAL-NO-DOCKER §6 now proves zero egress (stub, socket guard, /proc watcher, positive control). | **PASS**: no PII left the box |
| 3 | `ANTHROPIC_BASE_URL` in production | `($env.ANTHROPIC_BASE_URL || "https://api.anthropic.com")`. If the variable is unset or empty (`.env.example` leaves it empty), production uses api.anthropic.com. W07.test asserts the expression for every Anthropic node. Nothing stops a local `http://127.0.0.1:18080` value from being copied into the VPS `.env`. That would send lead text over plain HTTP, or make the guardrail fail closed. | **PASS (default)**, **FAIL (L)**: R6-09 |

## 6. Readiness checker (`scripts/readiness.mjs`)

| Line | Assessment | Result |
|---|---|---|
| S7-17 | Good: at least 50 red-team cases, the FAIS rate is 1, the output gate blocked every case, there is a live classifier run, and there are evidence keys for the gate and both hand-offs. Weak: the compliance-qa sign-off passes on **any** non-"PENDING" string (`:695`), so "REJECTED" would show green. `latest-live.json` is not checked for age or for the case count. | **FAIL (L)**: R6-06 |
| S7-28 | It encodes the Section 7 text (IO, PAIA, privacy, NCC submitted, W24 scheduled, register, opinion as info only). It does not check what my true-north list requires: W24 monthly cleanse **evidence** (`compliance/evidence/YYYY-MM.md`), NCC renewal dated (`obligations` C1 `due_at`), breach drill done (P14), and the terms page (S7-15). | **FAIL (L)**: R6-07 |
| S7-05 | "Bot protection on /lead and /book" only greps the page for Turnstile and checks that W01/W05 exist. The /book guard is still open (I-45h). | **FAIL (L)**: R6-08 |

---

## 7. Findings table (for the orchestrator)

| ID | Sev | File:line | What | Owner | Mechanical |
|---|---|---|---|---|---|
| R6-01 | **M** | `analytics/W14-broker-payload.sql:47` | The `p_prev_n` lookup `rh.week < d - 3` skips reports sent 1–3 days earlier (a Monday weekly before a midcycle or cycle-end edition), so two figures fewer than 5 answers apart can reach the broker. Change to `rh.week <= d` (every report with an earlier send day than this one, `send_day = d+1`), and add a weekly-Monday + midcycle-Wednesday test case. Blocks W35 activation. | analytics-reporter | **yes** (one predicate) + test |
| R6-02 | **M** | `automation/W07.json` "Send WhatsApp (session, in 24-h window)"; `automation/lib/w07.mjs` | Nothing caps lead-facing replies per inbound message. Add (a) a `w07:reply:{inbound wamid}` claim before the send (one bot reply per inbound) and (b) a hop counter on `msg` across W03/W05/W07 hand-backs (stop at 2 and log). Optional: a per-lead outbound rate limit. | automation-engineer | no |
| R6-03 | **M** | `automation/lib/w12.mjs` `resolveOutcome` (reach `no` branch), `BROKER_NO_SHOW_APOLOGY` | NH-54 reading is correct, but the lead's "No, not yet" at T+30 resolves a broker no-show **at once**, while the broker has until his +3 h 15 nudge to mark. A late call or a different number then leads to a wrong apology, a KG urgent alert and a paid rebook. The apology also states fault ("should have called you today and didn't"). Suggest: resolve when the broker marks, or at the broker-nudge time if he still has not. Then use neutral wording, such as "Sorry your call with {adviser_first} didn't happen today. That isn't on you." Fold this into the NH-54 confirmation. | automation-engineer + conversation-designer | no |
| R6-04 | **M** | `automation/lib/w15.mjs` confirmation (cancel mode); `conversation/lines.mjs` | Under the NH-52 default, the booking is cancelled, but the lead gets only `STOP_ACK` and is never told the call is off. Add `STOP_ACK_CANCELLED` (EN/AF), for example "Done. You won't get any more messages from us, and we've cancelled your call on {date} at {time}.", used when `booking_cancels` is not empty, plus a W15 test. | conversation-designer + automation-engineer | no (new approved line) |
| R6-05 | L | `analytics/W14-broker.sql` `facts.broker_pulse`; `conversation/pulse.mjs` `brokerLine` | An erased pulse row shifts the first-m set, so a held figure can change by one. Hold the stored `{n, up}` from the last report when `total - p_prev_n < 5`, rather than recomputing. | analytics-reporter | no |
| R6-06 | L | `scripts/readiness.mjs:693-696` (S7-17) | Sign-off passes on any non-PENDING string. Require `/^(PASS|SIGNED)/` and the reviewer `compliance-qa`. Check `latest-live.json` for age and a case count of at least 50. | orchestrator / platform-architect | **yes** |
| R6-07 | L | `scripts/readiness.mjs:909-923` (S7-28) | Add checks for the W24 monthly evidence file, a dated C1 NCC renewal, a P14 breach drill, and `landing/holding/terms.html`. | orchestrator / platform-architect | **yes** |
| R6-08 | L | `scripts/readiness.mjs:403-405` (S7-05) | Add a /book guard check (Turnstile and rate limit in W05, I-45h). | orchestrator | **yes** |
| R6-09 | L | `automation/vps/check-credentials.mjs` or the readiness S7-26 line | Assert that in production `ANTHROPIC_BASE_URL` is unset or `https://api.anthropic.com`. | devops-security | **yes** |
| R6-10 | L | `portal/intro-media/assets/explainer/manifest.json` notes[4] | The note "slot is 16:9 with object-fit:cover… cropped" is stale; the slot is square with `contain`. Update the note. NH-51 can drop the crop concern. | visual-producer | **yes** |
| R6-11 | L | `automation/lib/w01.mjs:383` (`held` path) | A held lead (consent names another practice, or no capacity) still sends a CAPI `Lead`. The person consented to measurement, so this is not a breach, but the lead may never be handed over. Optimising on held leads is noise. Set `capi: null` on held. | automation-engineer | **yes** |

## 8. Totals

**PASS 33 · FAIL 11 (0 H · 4 M · 7 L).** No new string gives advice, compares products, quotes, or names a product or insurer.

**Mechanical (orchestrator can apply):** R6-01 (the predicate, plus a test from analytics-reporter), R6-06, R6-07, R6-08, R6-09, R6-10, R6-11.
**Owner-dispatched:** R6-02 (automation-engineer), R6-03 (automation-engineer + conversation-designer), R6-04 (conversation-designer + automation-engineer), R6-05 (analytics-reporter).

**I sign off (compliance-qa):** W01 consent capture, email gating, hashing, bands and CAPI payloads. W06 disclosure plan. W13 caps and wording. W12 feedback flow (except R6-03). W15 suppression (except R6-04). Terms TU-v1.0 as a **draft for the practitioner**. Explainer clip wording and mocks. NH-56 (no PII left the box). The four fixture resolutions.
**Withheld:** W35 activation until R6-01 is fixed. GATE-TEST-W12 until R6-03/NH-54 is settled. GATE-TEST-W15 until R6-04 is fixed.

**needs_human (money/legal only):**
1. **NH-54 (carried, money + wording):** confirm the broker no-show reading with the R6-03 timing (Schedule D rebooking at our cost) and the neutral apology.
2. **NH-42 (carried):** C1A option.
3. **(practitioner)** Q25–Q29 (terms), carried from contracts-drafter. No new questions.

## Not reviewed in review 6
- W04 and W05 libs and the CONTRACTS §215 request/response, line by line (only CAPI and last_contact_at were spot-checked). W09 lib strings (covered only by the template checker).
- The W04/W05/W06/W09 test suites (not in the named run).
- The Afrikaans lines (native-speaker read still carried).
- The `smc-whatsapp-send` / `smc-capi-send` sub-workflows (not built, I-47c).
- A transaction check on W13's claim SQL against staging (I-45m, Phase 5).
- The readiness lines other than S7-05, S7-17 and S7-28.
