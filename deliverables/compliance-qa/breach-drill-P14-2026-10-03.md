# P14 breach drill, desk exercise, 2026-10-03

Type: table-top on paper. Data: 100% synthetic (Test Lead 01 to 14, numbers +27600000101 to +27600000114, broker "Test Broker", +27600000099). No system touched, nothing sent, no real person. All notification text below is DRAFT, never sent, and needs practitioner review before real use (compliance register Part 3). Runbook under test: `deliverables/contracts-drafter/compliance-register.md` Part 3, plus `automation/security/SECURITY.md` and W22/W34.

## Scenario
Saturday 2026-10-03 09:10 SAST (night-time quiet hours rules do not apply, but a Saturday does). While debugging a staging workflow, an n8n execution export (JSON) holding 14 synthetic leads (name, WhatsApp number, age band, budget band, consent text version) is pasted into a public gist. A third party spots it at 09:10 and emails howzit@ at 09:32. The gist was public for about 3 h 40 min. The export also contains the Supabase anon key but no service key (confirmed in step 3).

## Timeline and decisions (T = 09:32 when received)
| Time | Step (Part 3) | Action and decision | Result |
|---|---|---|---|
| 09:32 | Detect | Email read by Jonathan 09:48 (no alert fires for an inbound email; see gap G1). | T+16 min |
| 09:50 | 1 Contain | Gist deleted; request cache purge from the host; rotate anon key and every credential named in the export; pause the workflow that produced it. Decision: treat as a breach now, assess in parallel, do not wait for certainty. | Contained 10:20 (T+48) |
| 09:55 | 2 Alert | Open `incidents` row: severity high, affected_count 14, `declared_at` 09:55. W22 alert to both phones: strict DND list would delay a night declaration to 07:00 (gap G2). | Alerted |
| 10:30 to 12:00 | 3 Assess | Data: name, number, bands, consent version; no ID numbers, no health data, no bank data. 14 people, 1 broker. Exposure: public, indexed possibly. Identity can be established (name plus number). Processor involved: GitHub (gist host). Decision: reasonable grounds exist, so s22 duties apply. | Done T+2.5 h |
| 12:00 | 4 Tell broker | Test Broker told by WhatsApp and email inside 24 h (agreement 9.8). Draft C below. | T+2.5 h |
| 12:30 | 5 Regulator | Jonathan (IO) files on the Regulator's prescribed security-compromise form/portal. Draft A below. Decision: file the same day, do not wait for the 72 h mark. | Draft ready T+3 h |
| 13:00 | 6 Subjects | Draft B to the 14 people by WhatsApp (inside the 24 h customer window only if they replied; else approved template, gap G3), email as backup. Decision: send after step 5 unless the Regulator says delay. | Draft ready |
| T+1 to T+7 d | 7 Fix | Root cause: debug exports are not redacted. Fix: redaction function on exports, secret-and-PII scan before any paste, staging executions saved without data. | Planned |
| T+14 d | 8 Record | Fill `incidents` (`contained_at`, `regulator_notified_at`, `subjects_notified_at`, `closed_at`), update register and the quarterly memo. | Planned |

Measured against targets: containment T+48 min (target 1 h, met); assessment T+2.5 h (target 24 h, met); both drafts ready T+3 h (internal 72 h target, met).

## DRAFT A: Information Regulator notification (NOT SENT)
> Subject: Notification of security compromise, Lead Velocity (Pty) Ltd
> Responsible party: Lead Velocity (Pty) Ltd, [registration number], Information Officer [name], [contact]. Brand: SortMyCover.
> Date and time discovered: [date, time]. Date and time contained: [date, time].
> What happened: personal information of [14] people was exposed in a publicly accessible web page for about [3 h 40 min] through an internal operational error. No evidence of misuse so far. The page was removed and credentials were rotated.
> Information involved: first name, surname, mobile number, age band, budget band, consent record version. No identity numbers, financial account or health information.
> Possible consequences: unwanted marketing contact or social-engineering messages referring to a life-cover enquiry.
> Measures taken: removal, rotation, workflow paused, broker informed, people informed on [date]. Measures planned: export redaction, pre-publication scan, staff reminder, drill note.
> Contact for follow-up: [Information Officer details].
> (Form fields and wording to be matched to the Regulator's current prescribed form by the practitioner.)

## DRAFT B: message to affected people (NOT SENT)
> Hi [first name]. This is Lead Velocity, who run SortMyCover. On [date] some of your details (your name, mobile number and the cover enquiry answers you gave) were shown on a public web page by mistake for about [3 hours]. We took it down at [time]. We have no sign anyone misused it. Please be careful with unexpected messages that mention your enquiry and never share a code or PIN. We have told the Information Regulator. Questions or to object or delete your details: reply here or write to [IO email]. We are sorry.

## DRAFT C: message to the broker (NOT SENT)
> [Broker], on [date] details of [14] leads you were sent (names, mobile numbers, age and budget bands) were exposed on a public page for about [3 h 40 min] because of an error on our side. It was removed at [time]; credentials are rotated. We are notifying the Regulator and the people affected. Under clause 9.8 please tell us if you see anything on your side. We will send the full incident note within 14 days.

## Gaps found
| # | Gap | Fix | Owner |
|---|---|---|---|
| G1 | No alert when a breach report arrives at howzit@ (only DSR keywords are filtered by W34 B). | Add breach keywords and an unauthorised-disclosure inbox rule to the mailbox filter, alert both phones. | automation-engineer |
| G2 | W22 DND list does not include `popia_breach`; a night declaration waits until 07:00 (W22.md line 204). | Add `popia_breach` to the always-send set (one line in the Policy node). | automation-engineer |
| G3 | Runbook says notification templates live in W34. They do not: no breach template is in W34.json or the template list. | Add Regulator, subject and broker drafts (above) as `docs/` text, and an approved Meta utility template for subject notice outside the 24 h window; practitioner to review. | conversation-designer, contracts-drafter |
| G4 | "72 hours" is an internal target. POPIA s22 says "as soon as reasonably possible", with no fixed hours, and the register should say so. | Reword runbook; ask practitioner for the s22 timing view. | contracts-drafter |
| G5 | `incidents` has no field for exposure window, data categories, or notification wording; no UI to open one. | Add columns (`data_categories`, `exposure_started_at`, `exposure_ended_at`, `notes`) or store the note in `evidence_url`; console button "Declare incident". | platform-architect |
| G6 | Runbook step 3 names no way to prove what was exposed (access logs). | Require saving host or gist access evidence in the incident record. | devops-security |
| G7 | Agreement 9.8 gives the broker 24 h; step 4 matches. Practitioner not yet commissioned for the Regulator form wording. | Keep as pending (GATE-OPINION); do not file anything live without review. | Jonathan |
| G8 | Drill ran as a desk exercise only: no system, W22 route, `incidents` insert or phone alert was exercised. | Next breach drill (2027-01-21) runs the W22 alert and `incidents` insert on staging. | compliance-qa |

## Verdict
Desk drill complete: scenario, timeline, decisions, drafts and gaps recorded. Result: PASS on runbook coverage and timing, with 8 gaps (G1 to G3 should be fixed before first live lead). The system-level drill (G8) is still to be done.
