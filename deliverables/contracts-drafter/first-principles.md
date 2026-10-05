# DRAFT — for practitioner review

# First principles — contracts-drafter

*Commercial & Regulatory Drafter · SortMyCover build · 2 Oct 2026 · written from Sections 0.1, 2.1, 2.3, 3.3, 4.13 and 4B only. No new research. Not legal advice.*

## 1. The goal

**A broker can read our papers in one sitting, pay for one cycle, and never have cause to dispute a replacement or challenge how we are paid.**

The numbers: **0** disputed replacements, **0** fee-structure challenges, every document at **Grade 7** reading level.

## 2. What is fixed, and what is only habit

| Fixed (law, platform, money) | Why it binds us |
|---|---|
| Flat fee, never tied to policies | *Raspberry Academy v Oaksure* (2026): a fee paid as a % of premium, only when policies were written, made the deal unlicensed intermediary work and unenforceable. |
| No advice, no intermediary services | FAIS General Code of Conduct: the duties belong to the FSP. We must never act like one. |
| Opt-in consent for direct marketing | POPIA s69 and Form 4. Unticked box. We keep the exact words, time, page and source. |
| Plain language | CPA s22. Plain language is the law, not a style choice. |
| Register, renew and cleanse monthly | CPA 2026 Amendment Regulations (NCC opt-out registry). A registry block beats earlier consent. |
| Meta policy | Ads target 18+. No questions about sensitive finances in forms. The broker's Page is never used (Jonathan 2026-10-05). |
| Money | Pay per 30-day cycle, in advance. Liability capped at the cycle price. |

| Habit (convention) | What we did |
|---|---|
| Notice periods | Dropped. A cycle simply isn't renewed. |
| Auto-renewal | Dropped. Card auto-renew is opt-in only, for convenience. |
| Grace period / dunning | Dropped (0.1 overrides the "7-day grace" in 4.13). |
| 30-page agreement | Dropped. 16 short clauses plus four schedules. |
| Minimum term | Dropped. No lock-in. |

## 3. The mechanisms we rely on (graded evidence)

| Mechanism | Source | Grade |
|---|---|---|
| Flat price per cycle, paid in advance, no link to policies | *Raspberry Academy v Oaksure* | A |
| How courts read "what makes a referral an intermediary service" | CDH / Moonstone commentary | B |
| The broker owns every FAIS duty, and the agreement says so in writing | FAIS General Code of Conduct | A |
| Consent words, operator clause, retention periods | POPIA s69, Form 4, Information Regulator guidance | A |
| Monthly cleanse and one suppression list, in both the agreement and the privacy notice | CPA 2026 Amendment Regulations / NCC registry | A |
| Short, readable terms a broker actually reads | DMASA Code + plain-language precedents | B / C |

Anything else is a guess to measure in production, not to research.

## 4. The simplest agreement that meets the fixed rules

- **One payment = one 30-day cycle.** Flat rand price from Schedule A. Excl. VAT.
- **The unit is a verified qualified lead** (3.3). Booking is a service.
- **Replacements** only for no-show, uncontactable or disqualified (Schedule C). Never for "didn't buy". Cap per cycle: Bronze 4, Silver 6, Gold 9.
- **Shortfall:** cycle extends up to 14 days. Then a pro-rata credit, or a refund if not renewing. The word is "committed".
- **Clause 6:** we give no advice. The broker is the FSP and gives its own disclosures.
- **Clause 9:** POPIA roles are set out. We collect. The broker is responsible once leads are handed over. We act as operator only for calendar work.
- **Schedule D:** broker marks outcomes in 24 h. Unmarked means attended.

**Conventions we kept, and why:**

| Kept | Why it beats the bare version |
|---|---|
| A 48-hour dispute window with the message log as evidence | Cheap, and the log is objective. It stops arguments before they start. |
| Liability cap at the cycle price | Standard and cheap. It matches what the broker paid. |
| Talk, then mediation, then court | Cheaper than arbitration for a one-cycle deal. |
| Electronic signing in the portal | Cheaper than paper. The portal logs who, when and which device. |
| A one-page term sheet for Mark | Lets cycle 1 start before the full agreement is signed. |

## 5. Assumptions register

| Assumption | Our default | How we check it | Kill rule |
|---|---|---|---|
| Dispute outcome after 48 h | We may dispute within 48 h using the log. If we don't, the replacement is approved. Broker replies in 48 h. A named person decides in 2 business days, with reasons. | Practitioner Q12. Count disputes per cycle. | 1 or more escalated disputes in cycles 1–2 → rewrite Schedule C. |
| When a cycle starts | The day routing is switched on after payment clears (NH-CD-14). | Jonathan confirms. Track days from payment to first lead. | Any broker queries the start date → state it on the payment receipt. |
| "Uncontactable" | System decides: template undelivered, or no reply through the full W08 sequence, after verification (NH-CD-12). | Replacement rate vs the 20% cap. | Rate above 20% by day 14 → tighten the definition with the practitioner. |
| E-signature is valid | Portal signing with a signer, time and device record is enough for this kind of contract. | Practitioner to confirm. (Not yet in the brief. Should be added as Q21.) | Practitioner says no → wet ink or an advanced e-signature for the agreement only. |
| Practitioner questions | Our defaults stand until the opinion lands (20 questions in `practitioner-brief.md`). | One written opinion within 30 days of launch. | Any answer differs → the opinion wins. Change the document and the changelog the same day. |
| Grade 7 reading level | Hand-sampled estimate only (NH-CD-24). | Full Flesch-Kincaid run by script before signing. | Any document above Grade 8 → rewrite before signing. |

**Kill rule for the whole design:** if by day 14 of cycle 1 there is one fee-structure challenge, or more than one disputed replacement, this design is wrong. Stop, take the issue to the practitioner, and change the agreement before cycle 2.

## 6. Deliberately not built

- **Percentage-of-premium, per-policy or success fees** in any form. This is the *Raspberry Academy* risk.
- **Auto-renew traps, notice periods, grace periods, minimum terms.** These add friction, not retention.
- **The word "guaranteed".** We say "committed".
- **Legal opinions.** The external practitioner gives those.
- **Replacements for "didn't buy".** That would tie our price to sales.
- **Arbitration and long boilerplate.** Too costly for a one-month deal.
- **A rewrite of the old CRM contract generator.** Out of scope. It is flagged (NH-CD-17) because its commission and notice wording clash with this design.
