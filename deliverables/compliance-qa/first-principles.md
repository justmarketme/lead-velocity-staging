# compliance-qa: first-principles memo (4B)

Date: 2026-10-02 · Agent: compliance-qa (Compliance & QA Lead) · Inputs: MASTER-PROMPT 0.1, 0.3, 1.2, 2.1, 2.3, 3.3, 4.6 (W06, W15, W24), 4.8, 4.11 guardrail, 6B.1/6B.7/6B.9, Section 7; contracts-drafter `compliance-register.md`, `ncc-direct-marketer-pack.md`, `practitioner-brief.md`; `build/crm-gap.md`.
Written from the prompt only. No web research. This memo is a QA design, not legal advice. Where the practitioner's opinion differs, the opinion wins (2.3).

---

## 1. The irreducible goal

**No lead or viewer ever receives an advice-type statement from us, and every lead has a stored consent record plus disclosure evidence before an adviser meets them.**

The number: **0** advice-type statements in public assets and live conversations; **100%** of leads with consent and disclosure evidence. Two operational counters back it. Consent is `leads.consent_text` + `consent_at` + `consent_page_url` + `consent_source` + `consent_mode_at_capture`, all non-null. Disclosure is `leads.disclosure_msg_id` + `disclosure_delivered_at`, both non-null before `bookings.appointment_date`.

Both counters must be computable by a query. A rule we cannot count is a rule we are only hoping is followed.

## 2. Fixed constraints vs conventions

**Fixed. This is law, platform physics or money, and the design must obey it.**

| # | Constraint | Source (grade) | What it forces |
|---|---|---|---|
| F1 | No advice, product comparison, premium or cover quote, or insurer/product name from Lead Velocity | FAIS GCC (A) | A gate in front of every outbound sentence, human or LLM |
| F2 | Fee flat per cycle, in advance, never tied to policies | *Raspberry Academy v Oaksure* (A) | The fee and credit logic never reads a policy or premium field. The voluntary `cycles.policies_written_reported` feeds the ROI view only |
| F3 | The adviser's identity (adviser, practice, FSP number) reaches the lead before any meeting | FAIS GCC disclosure (A); 1.2 | Disclosure message ID and delivery logged per lead |
| F4 | Opt-in consent for electronic direct marketing to non-customers, with the wording stored. STOP is honoured everywhere | POPIA s69 / Form 4 (A) | An unticked box, the exact text stored per lead, and one suppression list checked before every send |
| F5 | NCC registration, annual renewal, monthly cleanse against the opt-out registry. A registry block overrides consent | CPA 2026 Amendment Regs, as stated in 2.3 (A, as given) | W24, dated reminders, and a monthly evidence file |
| F6 | Meta enforces policy automatically: personal-attribute rule, 18+, AI labelling, template categories, quality rating | Meta Ad Standards / WhatsApp Business policy (A) | Pre-submission checks. Rejection or restriction is an alert, not a surprise |
| F7 | Phone numbers and consent records are personal information. Security is part of compliance | OWASP ASVS + POPIA s19 (A) | RLS, secrets only in `.env`, log redaction, no PII in n8n execution data, tested backups |
| F8 | The IO is registered, a PAIA manual is published, DSRs are answered within 30 days, and a breach is notified | POPIA / PAIA (A) | Obligations register rows with evidence links |
| F9 | Nothing is spent before first payment except ~R250 for domains | 0.1 | No paid compliance SaaS. Use tables, n8n and the console |

**Conventions. What the industry usually does. Each is kept only if it beats the first-principles version.**

| Convention | Verdict | Reason |
|---|---|---|
| Walls of disclaimers on every ad and page | **Dropped** | Nobody reads them, and they add Meta review surface. Disclosure goes where it is read: the personal WhatsApp in < 60 s (1.2). One short, plain consent line at the tick |
| FSP number on the ad | **Dropped** | The educational ad involves no FSP. Disclosure is needed when an FSP is involved (4B worked example). Practitioner Q1 confirms |
| A retained compliance officer / monthly compliance subscription | **Dropped** | That is an FSP requirement, and we stay outside FAIS (2.3). Instead: the virtual function, plus a once-off opinion |
| Manual pre-publication legal review of every asset | **Replaced** | A deterministic banned-term check plus the classifier gate plus W33 sampling catches more and costs less. A human (Jonathan) still taps the publish gate (2.2) |
| Consent as a checkbox boolean | **Dropped** | A boolean is not evidence. We store the text, version, time, URL, source and mode |
| Separate opt-out lists per channel or per broker | **Dropped** | One `suppression` table, LV-wide, checked before every send (2.3, C3) |
| Policy PDF "compliance manual" | **Kept, small** | The obligations register (`obligations` table, seeded from `compliance-register.md`) is the manual. The quarterly memo is the one page Jonathan signs |
| Red-team before launch | **Kept** | It is the only way to test the gate against adversarial input (4.11, Section 7: 50 prompts, zero leaks) |

## 3. Mechanisms with A/B evidence (everything else is a hypothesis)

| Mechanism | Evidence | Grade | Kept as |
|---|---|---|---|
| A % of premium or a contingent fee makes a lead generator an unlicensed intermediary | *Raspberry Academy v Oaksure* | A | Flat-fee rule F1/F2 in the register. A code search for any policy/premium field in fee code (register F2) |
| Advice = a recommendation or guidance about a financial product. Deferral is not advice | FAIS GCC | A | The fixed deferral line ("That's exactly what {adviser} will go through with you on the call") replaces any draft that trips the gate |
| Consent must be specific, informed, opt-in, and provable | POPIA s69 / Form 4 | A | The consent record (gate 2) |
| A registry block overrides consent. Monthly cleanse | CPA 2026 regs (2.3) | A (as given) | W24 + `suppression` |
| Meta rejects or restricts automatically on personal attributes, unlabelled AI and miscategorised templates | Meta policies | A | The pre-submission checklist (4.8 checks). W27 health alerts |
| Security controls on PI (access control, logging without PII, secret management) | OWASP ASVS | A | RLS, `audit_log`, redaction, `.env` |
| Golden set + CI eval stops prompt drift | 6B.1 (prompt's own engineering rule) | B (practice, not peer-reviewed) | Gate 1 runs in CI. FAIS pass rate must be 100% |

C/D items (e.g. "a WhatsApp disclosure is read more carefully than small print") are **hypotheses**. They are measured in the assumptions register below, not researched.

## 4. The simplest design that satisfies the fixed constraints

Four gates. Each is a table or a check, has a counter, and is visible on the console compliance tile (crm-gap, screen "Compliance").

### Gate 1: the classifier gate (zero advice-type statements)
- **Where:** in front of every outbound sentence we generate or publish: W07 LLM replies, W30/W31 comment and DM replies, the FAQ corpus (6B.9), ad and page copy, and intro-video scripts.
- **How:** two layers.
  1. **Deterministic banned-term pass:** insurer and product names, `R` + digits near "cover/premium/pay", "best/cheapest/guarantee*", "you should", "recommend", comparison words, second-person finance/health assertions (2.1.8). It is cheap, explainable, and runs on every deploy (register F8).
  2. **LLM classifier** (4.11): does the draft mention premiums, cover amounts, products, insurers, comparisons, suitability or tax, or say "you should…"? If yes, send the fixed deferral line instead and log the question for the pre-call brief.
- **Fail-closed:** if the classifier errors or times out, the deferral line goes out. A draft never ships.
- **Evidence:** `communications.guardrail_trip`, `guardrail_rule`. CI eval on the golden set (6B.1), with a 100% FAIS pass required to merge. Red-team: 50 prompts, zero leaks (Section 7). W33 daily sample of 20 conversations.
- **Counter:** advice-type statements found by W33 or a complaint = **0**. Any non-zero result is a Red alert and stops the prompt version.

### Gate 2: the consent record (100% stored consent)
- **What is stored per lead:** `consent_text` (exact rendered string), `consent_text_version`, `consent_at`, `consent_page_url`, `consent_source` (page/lead_ad/ctwa), `consent_mode_at_capture` (`named` default while one broker, 0.1), `consent_ads_at` (advertising sentence, 4.4a).
- **Rule:** a lead without a complete consent record is never routed and never messaged. W01–W03 reject it at intake. CTWA "No thanks" stores only a hashed number in `suppression`.
- **Prescribed form:** the record must reproduce what the person saw. A version ID points to the immutable text. Consent records are kept 5 years (2.1.7). They are in the nightly off-server `pg_dump` (Section 7).
- **Counter:** `count(leads where any consent field is null and brand_id is not null) = 0`. Plus the monthly audit of 20 records (register P1).

### Gate 3: the disclosure log (100% disclosure evidence)
- **What:** W06 sends `broker_intro_booked` / `broker_intro_slots`, which name the adviser, practice and FSP number. It writes `leads.disclosure_msg_id` (= `communications.external_id`, the wamid) and `disclosure_delivered_at` from the delivery webhook.
- **Rule:** no booking reminder or meeting goes ahead on an undelivered disclosure. If there is no delivery receipt within 60 s, retry once, then fall back (SMS per 4.6) and alert. The broker's `brokers.fsp_verified_at` must be current (register F5) before routing.
- **Counter:** `count(bookings where lead.disclosure_delivered_at is null or > appointment_date) = 0`. P95 time to disclosure < 60 s (the same SLA tile as the first message).

### Gate 4: the obligations register (the virtual compliance function)
- **What:** the `obligations` table (`code, description, owner, due_at, last_done_at, evidence_url, status`), seeded from `compliance-register.md` (F1–F8, P1–P16, C1–C5, M1–M6).
- **Driven by:** W24 (cleanse, IO/NCC/PAIA reminders, monthly evidence file), W34 (DSRs, retention, incidents), and the quarterly memo.
- **Rule:** any row past `due_at` without evidence turns amber. Past due + 7 days turns red. Red on a Section 7 compliance line blocks the Go-live button.
- **Counter:** register rows red = 0. Cleanse evidence present for every month since launch.

**Conventions kept after comparison:** the red-team (cheaper than finding leaks live), the quarterly signed memo (one page, so not theatre), and NCC registration despite a consent-based model (2.3: a cheap hedge against an R1m / 10%-of-turnover exposure; practitioner Q5 decides).

## 5. Assumptions register and kill criteria

### 5.1 Assumptions (measured, not researched)

| # | Assumption | Grade | Test | Metric | Date |
|---|---|---|---|---|---|
| A1 | Generic vs named consent: `named` is safe as the default while there is one broker | Practitioner Q2 | Written opinion | Opinion received; `consent_mode` set | ≤ 30 days after launch (2.3) |
| A2 | The broker-neutral funnel (no FSP on the ad, named disclosure < 60 s) satisfies FAIS GCC | Practitioner Q1 | Written opinion | Opinion | ≤ 30 d after launch |
| A3 | Flat per-cycle fee, replacements and shortfall credits create no policy linkage | Practitioner Q3, Q12 | Opinion + code search for policy/premium fields in fee code | 0 hits; opinion | Opinion date; code search quarterly |
| A4 | Booking + reminders + an AI that answers logistics is not "any act" under FAIS | Practitioner Q4 | Opinion + red-team | 0 leaks in 50 prompts; opinion | Before go-live (red-team); opinion ≤ 30 d |
| A5 | Our model is "direct marketing" under the CPA 2026 regs, so we register | Practitioner Q5 | Opinion | Registered either way until advised | ≤ 30 d |
| A6 | A registry block overrides a same-day request (booking confirmation suppressed) | Practitioner Q6 | Opinion | Default: suppress | ≤ 30 d |
| A7 | One tick + the separate advertising sentence covers Pixel/CAPI/lookalikes | Practitioner Q8, Q9 | Opinion | — | ≤ 30 d |
| A8 | The s72 basis for overseas processors is sufficient | Practitioner Q10 | Opinion | — | ≤ 30 d |
| A9 | 12 months / 5 years retention is right | Practitioner Q11 | Opinion | — | ≤ 30 d |
| A10 | Redaction + "has a health question" is enough for special PI | Practitioner Q17 | Opinion + W33 redaction sample | 0 health details in stored transcripts | Daily (W33); opinion ≤ 30 d |
| A11 | The NCC registry is checkable by a machine mechanism (API or bulk file) | Unknown offline (D) | Read the mechanism at NCC registration (pack A2.6) | W24 mode set (`api`/`csv`) | At registration |
| A12 | The WhatsApp disclosure is read (C) | C | Read receipts on disclosure messages | ≥ 80% read before the meeting | Day 14 |
| A13 | The deterministic banned-term pass has a < 5% false-positive rate on approved copy (D) | D | Run it on the 15 approved ads + pages | FP rate | Before the batch of 15 (2.1.8) |
| A14 | Disclosure is delivered < 60 s for ≥ 99% of leads (C) | C | SLA tile | P95, P99 | Day 14 |

The practitioner answers are applied as they arrive. Until then, each is logged in the register as **pending**, with the default from `practitioner-brief.md` in force. Build and launch do not wait (2.3).

### 5.2 Kill criteria for this design

| If… | …by | Then the design is wrong. Do this |
|---|---|---|
| W33 or a complaint finds **any** advice-type statement in production | Any day | Stop that prompt/asset version (rollback is one commit, 6B.1). Add the case to the golden set. Root cause within 24 h. Two in 30 days → narrow the assistant to booking-only, with no free-text answers (practitioner Q4 alternative) |
| Consent-complete < 100% on any day | Day 1 onward | Intake is leaking. Block routing for the source that leaks until it is fixed |
| Disclosure delivered before the meeting < 100%, or P95 > 60 s | Day 14 | Move disclosure to a synchronous step in W01 before routing completes. Alert automation-engineer |
| Banned-term pass false positives > 10% on approved copy | Before the batch of 15 | Shrink the term list to the 2.1 categories only; rely on the LLM classifier + human gate |
| The W24 cleanse fails 3 months running, or there is no machine mechanism | 3rd month | Switch to the CSV fallback permanently and escalate to Jonathan |
| The practitioner opinion contradicts a default | On receipt | The opinion wins. Change the default and record it in the register |
| Meta rejects ≥ 2 of the first 3 ads on policy | Before the batch of 15 | Stop. Re-check the ads against personal attributes and the AI label. Media-buyer + creative-strategist rewrite. No appeal-spam |

## 6. Deliberately not built

| Not built | Why |
|---|---|
| Disclaimer blocks on ads and pages beyond the consent line and footer | Compliance theatre. Disclosure lives in the WhatsApp the lead reads (1.2) |
| A paid compliance or consent-management platform (OneTrust-class, Self-Comply) | Self-Comply is built for FSPs. Spend is zero before payment (0.1). Tables + n8n do the job |
| A human compliance reviewer in the live conversation loop | It cannot meet the 60 s SLA. The fail-closed classifier gate + daily W33 sampling + human handoff do the job |
| A second suppression list per broker or per channel | One list, LV-wide (2.3) |
| Legal opinions from this agent | It flags. The practitioner opines (2.3 hard line) |
| Blanket blocks on the build while the opinion is pending | 2.3: build and launch do not wait. `consent_mode` flips in one click |
| Re-researching the NCC registry mechanism | Not on the 4.0a list. W24 models it as a configurable endpoint plus a CSV fallback, and the real mechanism is read at registration (A11) |
| Automatic cancellation of a broker's calendar event on a registry block | The broker owns the client relationship after hand-over (agreement 9). We stop our messages and tell the broker. Practitioner Q6 decides on transactional messages |

---

**needs_human raised by this memo** (for the orchestrator; `build/tasks.json` not edited, per instruction):
1. **NH-CQ-FP-1:** 2.3 states the CPA 2026 registry facts (Annexure P, monthly cleanse, registry overrides consent) at grade A "as given". The registry's technical mechanism is not in the prompt, so W24 ships with `api` and `csv` modes and Jonathan picks one at registration (A11).
