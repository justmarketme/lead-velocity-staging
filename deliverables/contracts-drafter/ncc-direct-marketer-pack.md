# DRAFT — for practitioner review

# NCC direct-marketer registration pack and suppression / cleanse policy — Lead Velocity (Pty) Ltd

**Basis (from master prompt 2.3, not re-researched):** CPA 2026 Amendment Regulations, in force 15 April 2026; registrations opened July 2026. Anyone who "engages in direct marketing" must register with the National Consumer Commission (NCC) using **Annexure P**, **renew every year**, and **cleanse their database every month** against the national opt-out registry. **A registered block overrides prior consent.** Penalties up to R1 million or 10% of turnover.
**Our position:** our contact is requested and consent-based. But reminders and nudges may still count as marketing to the regulator. So we **register and cleanse monthly anyway** (W24). Whether we strictly must is practitioner-brief Q5.
**Owner:** compliance-qa · **Signs:** Jonathan (IO) · **Section 7 line:** "NCC direct-marketer registration submitted; W24 cleanse scheduled".

---

## Part A — Registration checklist (Annexure P)

*The exact Annexure P fields and fee must be read off the NCC form on the day of filing. This list is what we expect to need; record any difference in the evidence note.*

### A1. Documents and details to have ready

| # | Item | Source | Done |
|---|---|---|---|
| 1 | Company name, registration number {{lv_cipc_number}}, CIPC registration certificate | CIPC | ☐ |
| 2 | Directors' names and contact details | CIPC | ☐ |
| 3 | Physical and postal address; phone; howzit@leadvelocity.co.za | — | ☐ |
| 4 | Trading names: Lead Velocity, SortMyCover (and CoverKlaar, reserved) | — | ☐ |
| 5 | Contact person for the NCC (Jonathan) and alternate (KG) | — | ☐ |
| 6 | Description of direct-marketing activity: "Consent-based contact by WhatsApp (and SMS fallback) with consumers who ask to be connected to an authorised financial services provider about insurance and financial planning. Booking confirmations and reminders. No cold calling. No bought lists." | this pack | ☐ |
| 7 | Channels used: WhatsApp, SMS fallback, email (meeting invites only), phone (by the broker, not us) | 4.6 | ☐ |
| 8 | Expected monthly volume of consumers contacted: {{volume_estimate}} (Bronze ≈ 40 raw leads/month per broker) | 3.2 | ☐ |
| 9 | Information Officer registration reference | IO pack | ☐ |
| 10 | Description of how we cleanse against the registry and honour opt-outs (Part B summary) | this pack | ☐ |
| 11 | Registration fee, if any: {{ncc_fee — read off form}} | NCC | ☐ |
| 12 | Proof of payment of fee (if any) | FNB | ☐ |

### A2. Steps (Jonathan, laptop session — HUMAN GATE, may involve payment)
1. Open the NCC registration channel for direct marketers ({{ncc_registration_url — confirm on the day}}).
2. Complete Annexure P with the details above.
3. Attach documents. Pay any fee (Jonathan enters payment details himself).
4. Submit. Save the confirmation and reference number.
5. Record the **registration date** and the **renewal date** (12 months later) in the compliance register. W24 sends reminders 60, 30 and 7 days before renewal.
6. Get access to the opt-out registry check (bulk file or API, per the NCC's published mechanism). Store any credentials in `.env` only.

### A3. Evidence (`/compliance/ncc/`, private)
- `ncc-annexure-p-submitted-{{date}}.pdf`
- `ncc-confirmation-{{ref}}.pdf`
- `ncc-fee-pop-{{date}}.pdf` (if any)
- `ncc-registration-note.md` (who, when, ref, renewal date, anything that differed)

---

## Part B — Suppression and cleanse policy (implemented by W24)

### B1. One suppression list
We keep **one** suppression list in the `suppression` table. It reconciles every reason a person must not get marketing from us:

| Source | Trigger | Added within |
|---|---|---|
| STOP | The person replies STOP (or a clear equivalent) anywhere | Instantly (W15) |
| POPIA objection | Objection by email, WhatsApp, form or Form 1 | 24 hours |
| Deletion request | Person asks us to delete their data (we keep only a hashed number to suppress) | 24 hours |
| NCC registry block | Number found on the national opt-out registry during the cleanse | At the monthly cleanse (or sooner if the registry offers a live check) |
| CTWA "No thanks" | Person declines consent in WhatsApp | Instantly (hashed number only) |
| Complaint asking for no contact | From the complaints channel | 24 hours |

Each row stores: hashed number (SHA-256), reason, source, date, and the broker it was passed to (if any). **No other personal information is kept on the suppression list.**

### B2. Rules
1. **A registered registry block overrides prior consent.** If a person's number is on the registry, we do not send any marketing message, even if they ticked our consent box.
2. **Requested-contact messages** (the booking confirmation the person just asked for) are treated the same way until the practitioner advises otherwise (practitioner-brief Q6). Default: suppress.
3. Every outbound WhatsApp and SMS checks the suppression list **before** sending.
4. We tell the broker about every suppression for their leads within 24 hours (portal + WhatsApp). The broker must stop marketing (Broker Services Agreement clause 9.5).
5. New leads are checked against the suppression list at intake (W01–W03). A suppressed number is not routed.
6. Suppression never expires, unless the person gives fresh, specific consent **and** is no longer on the registry.

### B3. Monthly cleanse (W24 — 1st of every month, 06:00 SAST)
1. Take every active lead number (not deleted, not suppressed).
2. Check them against the NCC opt-out registry using its published mechanism.
3. Add every match to the suppression list with reason `ncc_registry`.
4. Cancel scheduled messages for matches. Notify the broker.
5. Re-run the reconciliation: STOP + objections + deletions + registry blocks = one list; no duplicates; counts logged.
6. Produce the **monthly evidence file** (below).
7. If the registry is unavailable, retry daily and alert compliance-qa. After 3 failed days, alert Jonathan.

### B4. Monthly evidence file (`/compliance/ncc/cleanse/{{YYYY-MM}}.md` + CSV of hashes, private)
- Date and time of the check, and the registry mechanism used
- Number of active leads checked
- Number of registry matches, STOPs, objections, deletions added this month
- Total suppression list size
- Confirmation that scheduled messages to matches were cancelled
- Brokers notified (count)
- Any errors and how they were fixed
- Signed off by the IO (tap in the console)

### B5. Annual renewal
- Renewal date: {{ncc_registration_date + 12 months}}.
- W24 reminders: 60, 30 and 7 days before.
- Renewal evidence filed as in A3.

### B6. Review
compliance-qa reviews this policy each quarter in the self-assessment memo, and at once if the NCC changes the registry mechanism.
