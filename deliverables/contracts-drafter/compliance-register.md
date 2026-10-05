# DRAFT — for practitioner review

# Compliance register, quarterly self-assessment memo and breach runbook — Lead Velocity (Pty) Ltd

**Kept by:** compliance-qa (virtual compliance function, 2.3) · **Accountable:** Jonathan (IO) · **Backup:** KG (Deputy IO)
**Live copy:** the console's obligations register (this file is the seed). Every row has an owner, a cadence and the evidence that proves it was done.

---

## Part 1 — Obligations register

### 1.1 FAIS boundary (we stay outside intermediary services)

| # | Obligation | Owner | Cadence | Evidence |
|---|---|---|---|---|
| F1 | Fee is a flat price per cycle, paid in advance; never per policy, % of premium, or contingent on a sale | billing-automation; contracts-drafter | Every price change; quarterly | `pricing` table diff; W25 build log; Schedule A merge |
| F2 | No "policies written" figure is used in any fee or credit calculation | billing-automation | Quarterly | Code search report; invoice sample |
| F3 | Ads, pages, comments and WhatsApp never advise, compare, name insurers/products, or quote premiums or cover | compliance-qa | Every new asset; W33 daily sample | Approval log; W33 grades; red-team results |
| F4 | Replacements only for no-show / uncontactable / disqualified — never "didn't buy". Lead cancellations per Schedule C1A (default: `cancel_no_rebook` → uncontactable; `no_call` → disqualified; pending NH-42 / brief Q23) | automation-engineer (W10, W13) | Monthly | Replacement log by reason code, incl. `cancel_no_rebook` and `no_call` |
| F5 | Broker's FSP verified on the FSCA register before routing; re-checked monthly | broker-success (W20) | Onboarding + monthly | FSCA check record |
| F6 | Every lead receives the named disclosure (adviser, practice, FSP) before any meeting | automation-engineer (W06) | Continuous; monthly audit of 20 | WhatsApp message ID + delivery status per lead |
| F7 | ~~Ads from a broker's Page under Annex 1~~ WITHDRAWN: the broker's Page is never used (Jonathan 2026-10-05). Annex 1 not needed for ads | — | — | — |
| F8 | Banned words absent on site and in reports ("guaran…", "appointments" as unit sold, "best/cheapest", insurer names) | compliance-qa | Every deploy | W25 diff check; W33 |

### 1.2 POPIA

| # | Obligation | Owner | Cadence | Evidence |
|---|---|---|---|---|
| P1 | Unticked consent box; exact consent text, version, timestamp, URL, source, `consent_mode` stored per lead | landing-page-builder; automation-engineer | Every deploy; monthly audit of 20 records | Audit sheet |
| P2 | `consent_mode = named` while one broker; `generic` only with written practitioner approval | Jonathan | On change | Practitioner opinion; config change log |
| P3 | STOP honoured instantly; scheduled messages cancelled; broker told within 24 h | automation-engineer (W15) | Continuous; monthly test | Synthetic STOP test log |
| P4 | IO and DIO registered; details current | Jonathan | Once; annual check | IO pack evidence |
| P5 | PAIA manual published and reviewed | Jonathan | Annual + on change | Published URL, version |
| P6 | Privacy notice current (processors, transfers, retention) | contracts-drafter; compliance-qa | Quarterly + on change | Version history |
| P7 | Data-subject requests answered within 30 days | Jonathan; W34 | Per request; weekly SLA check | `dsr_requests` |
| P8 | Retention per 1.5 (single source); the PN-v1.1 placeholders and the W34 purge use the same values; periods confirmed by the practitioner (brief Q11) | devops-security (W34); contracts-drafter | Nightly purge; check on any change | `retention_log`; PN version vs W34 config diff |
| P9 | Health / ID details redacted from transcripts and briefs | conversation-designer | Continuous; W33 sample | Redaction test results |
| P10 | Email used only for `meeting_invite` and never sent to Meta (no `em` in CAPI, no `EMAIL` in audience uploads); alt number only for `reach_fallback` | automation-engineer; ads-api-engineer | Quarterly + every CAPI change | Purpose-field audit; CAPI payload sample; audience schema |
| P11 | Operator terms in place with every processor; broker agreement clause 9.3 signed | Jonathan | On new processor | Contract file |
| P12 | Cross-border transfer basis recorded for each processor (s72) | compliance-qa | Quarterly | Processor list |
| P13 | Security safeguards: role access, secrets in `.env`, backups off-server, restore tested | devops-security | Monthly | Restore test log; access review |
| P14 | Breach runbook ready; drill held | Jonathan; devops-security | Twice a year | Drill note |
| P15 | Consumer complaints (howzit@ + COMPLAINT) answered within 48 h | Jonathan; KG | Weekly check | Complaints log |
| P16 | Hashed (SHA-256) uploads only; customer lists used only for exclusion and lookalike seeding | media-buyer; attribution-analyst | Monthly | Upload log |
| P17 | Adviser feedback (outcome, 1–5 rating, note, voice-note text) disclosed in the Privacy Notice (s18); voice audio not stored; transcript redacted; transcription provider named in the processor table **before** W29 voice notes are switched on | contracts-drafter; automation-engineer (W29) | On change; quarterly | PN version; W29 config flag; redaction test results |
| P19 | Retention clock `last_contact_at` moves only on messages sent to the lead and messages, taps or bookings from the lead; broker-facing W11 digests and pre-call briefs never move it (default, pending brief Q24) | automation-engineer (W11); devops-security (W34) | Quarterly + on W11 change | Code search of writes to `last_contact_at`; synthetic test |
| P18 | Ad-measurement off switch at /privacy#opt-out works (`smc_ads_off` set → no Pixel events); Pixel default matches the practitioner answer to Q9 | landing-page-builder | Every deploy | Synthetic browser test log |

### 1.3 CPA / NCC

| # | Obligation | Owner | Cadence | Evidence |
|---|---|---|---|---|
| C1 | Registered with the NCC as a direct marketer (Annexure P) | Jonathan | Once; annual renewal | NCC confirmation |
| C2 | Monthly cleanse against the national opt-out registry | W24 | 1st of month | Monthly evidence file |
| C3 | One suppression list reconciling STOP, objections, deletions and registry blocks; registry block overrides consent | W24 | Monthly | Reconciliation counts |
| C4 | Plain-language documents (CPA s22) — Grade 7 target | contracts-drafter | Every new document | Reading-level check note |
| C5 | No auto-renew trap: card auto-renew opt-in only, switch-off in portal | billing-automation | Quarterly | Checkout screenshot; portal test |

### 1.4 Meta / WhatsApp policy

| # | Obligation | Owner | Cadence | Evidence |
|---|---|---|---|---|
| M1 | Business Verification complete; two admins with 2FA | meta-operator | Once; quarterly check | W27 health |
| M2 | Ads target 18+; Special Ad Category decision recorded | media-buyer | Per campaign | Campaign spec |
| M3 | No second-person assertions about finances, health, family (personal attributes) | compliance-qa | Every ad | Approval log |
| M4 | AI-generated imagery labelled; no fake people presented as clients | visual-producer | Every asset | Asset register |
| M5 | Templates utility-category; opt-out honoured; quality rating monitored | automation-engineer | Continuous | W27 / W22 |
| M6 | Privacy notice names the Pixel and CAPI; domain verified | landing-page-builder | Every deploy | Page check |

### 1.5 Retention schedule (single source)

| Record | Keep for | Then | Where |
|---|---|---|---|
| Lead details, messages, bookings, outcomes (incl. adviser rating, note, voice-note transcript and summary), email | {{retention_lead_months}} (default 12) months after last contact | Delete / pseudonymise via `smc_erase_lead()` (W34) | `leads`, `conversations`, `bookings`, `outcomes` |
| Adviser voice-note audio | Not stored | — | — |
| Unfinished WhatsApp quiz threads | {{retention_unfinished_hours}} (default 72) hours | Purge after `expires_at` (W34) | `wa_threads` |
| Out-of-band (not qualified) submissions | {{retention_nonfit_hours}} (default 24) hours | Delete | `leads` |
| "No thanks" / STOP (CTWA and nurture) | Hashed number only, indefinitely; rest of the row on the lead schedule | — | `suppression` |
| Consent records and opt-outs | {{retention_consent_years}} (default 5) years | Delete | consent store |
| Suppression list (hashes) | Indefinitely | — | `suppression` |
| Broker agreements, invoices | 5 years after the relationship ends | Delete | contracts, `invoices` |
| Broker intro media | Until 30 days after the relationship ends (clause 11.5) | Delete | storage |
| Compliance evidence (cleanse, IO, NCC, memos) | 5 years | Delete | `/compliance/` |
| Backups | Rolling {{backup_days}} days | Overwrite | off-server |

---

## Part 2 — Quarterly self-assessment memo (template)

> **Lead Velocity (Pty) Ltd — Compliance self-assessment, Q{{n}} {{year}}**
> Prepared by: compliance-qa · Reviewed and signed by: Jonathan {{surname}}, Information Officer · Date: {{date}}
>
> **1. Summary in three lines.** {{what is green, what is not, the one thing to fix}}
>
> **2. Register status.** {{n}} obligations · {{green}} green · {{amber}} amber · {{red}} red. Table of every amber/red row with reason and fix date.
>
> **3. FAIS boundary.** Any change to pricing or fees this quarter? {{yes/no}}. Any asset that advised, compared or quoted? {{count, links}}. Replacement reasons by code: {{table}}.
>
> **4. POPIA.** Consent audit (20 records): {{pass/fail}}. DSRs: {{received / answered in 30 days}}. Complaints: {{received / answered in 48 h}}. Retention purge ran every night? {{yes/no}}. Incidents: {{count}}.
>
> **5. CPA / NCC.** Cleanses run: {{3/3}}. Registry matches: {{n}}. Renewal date: {{date}}.
>
> **6. Meta / WhatsApp.** Restrictions, rejections, quality drops: {{list}}.
>
> **7. Changes in the business.** New broker, channel, processor, brand, or `consent_mode` switch? If yes, PIIA updated? {{yes/no}}.
>
> **8. Practitioner opinion.** Status: {{not commissioned / commissioned / received}}. Any defaults changed because of it: {{list}}.
>
> **9. Actions.** Up to 3, each with owner and date.
>
> I confirm this is a fair picture of our compliance this quarter.
> Signed: ______________ (Information Officer)

---

## Part 3 — Breach runbook outline (POPIA section 22)

**Trigger:** reasonable grounds to believe personal information has been accessed or acquired by someone not authorised (lost device, leaked key, wrong-recipient message, hacked account, processor breach).

| Step | What | Who | When |
|---|---|---|---|
| 1 | **Contain.** Revoke or rotate keys, lock accounts, pause the affected workflow. A leaked secret = halt + rotate (0.3 #10). | devops-security | At once |
| 2 | **Alert.** Both phones + email to Jonathan and KG (W34 / W22). Open an `incidents` row. | System | At once |
| 3 | **Assess.** What data, how many people, which brokers, which processors, is it still exposed, can identity be established? | Jonathan; devops-security | Within 24 h |
| 4 | **Tell brokers** whose leads are affected (agreement clause 9.8). Ask processors for their incident report. | Jonathan | Within 24 h of finding it |
| 5 | **Notify the Information Regulator** on the prescribed security-compromise form / portal. | Jonathan (IO) | As soon as reasonably possible |
| 6 | **Notify affected people** in writing (WhatsApp and/or email): what happened, what data, what we have done, what they can do, who to contact. Template in W34. Unless a public body responsible for crime prevention or the Regulator says to delay. | Jonathan | As soon as reasonably possible after step 5 |
| 7 | **Fix the cause.** Root cause, fix, test. | devops-security | Within 7 days |
| 8 | **Record.** Timeline, decisions, notifications sent, evidence. Update the register and the next quarterly memo. | compliance-qa | Within 14 days |
| 9 | **Drill.** Run a table-top drill twice a year with a synthetic incident. | Jonathan; KG | Twice a year |

Notification templates (Regulator, data subject, broker) live in W34 and must be checked by the practitioner before first use.
