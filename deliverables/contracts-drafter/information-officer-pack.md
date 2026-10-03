# DRAFT — for practitioner review

# Information Officer registration pack — Lead Velocity (Pty) Ltd

**Information Officer (IO):** Jonathan {{jonathan_surname}} (head of the private body, by default under POPIA s55 / PAIA s1)
**Deputy Information Officer (DIO):** KG {{kg_full_name}} — designated in writing by the IO
**Where:** inforegulator.bizportal.gov.za (CIPC login) · **Cost:** none · **Time:** about 30 minutes
**Owner of this pack:** compliance-qa (virtual compliance function) · **Section 7 line:** "Information Officer registered"

---

## 1. What to have ready before you start

| # | Item | Who has it | Done |
|---|---|---|---|
| 1 | CIPC customer code and password (the company's BizPortal / CIPC login) | Jonathan | ☐ |
| 2 | Company registration number: {{lv_cipc_number}} | Jonathan | ☐ |
| 3 | Company name, physical and postal address, phone, email (howzit@leadvelocity.co.za) | Jonathan | ☐ |
| 4 | IO details: full name, ID number, designation (director), direct phone, email | Jonathan | ☐ |
| 5 | DIO details: full name, ID number, role, phone, email | KG | ☐ |
| 6 | Signed **designation letter** for the DIO (template in section 4 below) | Jonathan signs, KG accepts | ☐ |
| 7 | If Jonathan delegates the IO role to someone else: signed **authorisation letter** from the head of the body | Jonathan | Only if needed |
| 8 | A short description of the business ("marketing and lead-generation services to authorised FSPs; consumer brand SortMyCover") | — | ☐ |

**Never** paste ID numbers or passwords into chat or the repo. Jonathan types them into the portal himself.

## 2. Steps (Jonathan, in the laptop session — HUMAN GATE)

1. Go to **inforegulator.bizportal.gov.za**.
2. Log in with the company's CIPC customer code and password.
3. Choose the option to register an Information Officer.
4. Select Lead Velocity (Pty) Ltd from the list of companies linked to the login.
5. Enter the IO details (item 4).
6. Add the Deputy IO (item 5). Upload the designation letter if asked.
7. Check every field. Submit.
8. Save the confirmation page as a PDF and note the reference number.
9. Watch howzit@leadvelocity.co.za for the Regulator's confirmation email. Save it.
10. Tell compliance-qa: "IO registered, ref {{ref}}". The Section 7 line turns green.

If the portal flow differs from these steps, follow the portal and record what differed in the evidence note.

## 3. What to store as evidence (`/compliance/io/` — private, not in the public repo)

| Evidence | File name |
|---|---|
| Portal confirmation PDF | `io-registration-confirmation-{{date}}.pdf` |
| Regulator confirmation email (saved as .eml or PDF) | `io-registration-email-{{date}}.pdf` |
| Signed DIO designation letter | `dio-designation-letter-signed.pdf` |
| Evidence note: who, when, ref number, anything that differed | `io-registration-note.md` |
| Date for annual check of details (set in W24 reminders) | in compliance register |

## 4. Deputy Information Officer designation letter (template)

> **Lead Velocity (Pty) Ltd — Designation of Deputy Information Officer**
> I, Jonathan {{jonathan_surname}}, Information Officer of Lead Velocity (Pty) Ltd (registration {{lv_cipc_number}}), designate **{{kg_full_name}}** as Deputy Information Officer under section 56 of POPIA and section 17 of PAIA, with effect from {{date}}.
> The Deputy Information Officer may perform the Information Officer's duties listed in the Duties Register when the Information Officer is unavailable, and must report to the Information Officer.
> This designation remains in force until withdrawn in writing.
> Signed: ____________ (Information Officer) Date: ______
> Accepted: ____________ ({{kg_full_name}}) Date: ______

## 5. IO duties register

| # | Duty (POPIA / PAIA) | What it means for us | Owner | Cadence | Evidence |
|---|---|---|---|---|---|
| 1 | Compliance framework (POPIA reg 4) | Keep the compliance register, privacy notice and processing register current | IO; compliance-qa drafts | Quarterly review | Signed quarterly memo |
| 2 | Personal information impact assessment (reg 4) | Assess risks of the SortMyCover funnel; redo on any big change (new channel, new processor, `consent_mode` switch) | IO | Once now, then on change | PIIA document |
| 3 | PAIA manual (PAIA s51) | Publish and keep current | IO | Annual + on change | Published URL, version |
| 4 | Data-subject requests (POPIA s23–25) | Answer access, correction, deletion, objection within 30 days (W34) | IO; DIO backup | Per request | `dsr_requests` log |
| 5 | PAIA requests | Decide within 30 days | IO | Per request | Request log |
| 6 | Direct-marketing consent (s69) | Consent records complete; STOP honoured instantly | IO; automation-engineer | Monthly audit of 20 records | Audit sheet |
| 7 | Security safeguards (s19) | Access control, backups, redaction | IO; devops-security | Monthly | Backup restore test, access review |
| 8 | Operator agreements (s20–21) | Written terms with every processor; broker agreement clause 9.3 | IO | On new processor | Contract file |
| 9 | Cross-border transfers (s72) | List of processors and basis, kept current | IO | Quarterly | Privacy notice version |
| 10 | Security compromises (s22) | Breach runbook; notify Regulator and people affected | IO; DIO | On incident; drill twice a year | Incident log, notifications |
| 11 | Training and awareness | Everyone who touches lead data knows the rules (Jonathan, KG, contractors) | IO | Annual | Attendance note |
| 12 | Complaints | Consumer complaints answered within 48 h | IO; DIO | Weekly check | Complaints log |
| 13 | Registration details | Keep IO / DIO details current on the portal | IO | Annual + on change | Portal screenshot |
| 14 | NCC direct-marketer registration and monthly cleanse | See ncc-direct-marketer-pack.md | IO | Monthly / annual | Monthly evidence file |
