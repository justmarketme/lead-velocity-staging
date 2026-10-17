# Breach notification drafts (POPIA s22)

**DRAFT. PRACTITIONER REVIEW REQUIRED before any real use (GATE-OPINION). Nothing here has been sent or filed.** Source: breach drill P14, 2026-10-03 (`deliverables/compliance-qa/breach-drill-P14-2026-10-03.md`), gap G3. Square brackets are filled in by the Information Officer at the time. Wording and form fields must be matched by the practitioner to the Regulator's current prescribed form. Runbook: `deliverables/contracts-drafter/compliance-register.md` Part 3. The WhatsApp utility template for notice B outside the 24-h window is `automation/templates/breach_subject_notice.json` (HELD, not submitted, GATE-TEMPLATES). No lead data goes into these files; use the incident record.

## A. Information Regulator notification (DRAFT, NOT SENT)
> Subject: Notification of security compromise, Lead Velocity (Pty) Ltd
> Responsible party: Lead Velocity (Pty) Ltd, [registration number], Information Officer [name], [contact]. Brand: SortMyCover.
> Date and time discovered: [date, time]. Date and time contained: [date, time].
> What happened: personal information of [number] people was exposed in a publicly accessible web page for about [duration] through an internal operational error. No evidence of misuse so far. The page was removed and credentials were rotated.
> Information involved: first name, surname, mobile number, age band, budget band, consent record version. No identity numbers, financial account or health information.
> Possible consequences: unwanted marketing contact or social-engineering messages referring to a life-cover enquiry.
> Measures taken: removal, rotation, workflow paused, broker informed, people informed on [date]. Measures planned: export redaction, pre-publication scan, staff reminder, drill note.
> Contact for follow-up: [Information Officer details].

## B. Message to affected people (DRAFT, NOT SENT)
In-window (the person replied in the last 24 h): send as a session message. Outside the window: use the template `breach_subject_notice` once approved. Email as backup.
> Hi [first name]. This is Lead Velocity, who run SortMyCover. On [date] some of your details (your name, mobile number and the cover enquiry answers you gave) were shown on a public web page by mistake for about [duration]. We took it down at [time]. We have no sign anyone misused it. Please be careful with unexpected messages that mention your enquiry and never share a code or PIN. We have told the Information Regulator. Questions or to object or delete your details: reply here or write to [IO email]. We are sorry.

## C. Message to the broker (DRAFT, NOT SENT)
Due inside 24 h (agreement clause 9.8).
> [Broker], on [date] details of [number] leads you were sent (names, mobile numbers, age and budget bands) were exposed on a public page for about [duration] because of an error on our side. It was removed at [time]; credentials are rotated. We are notifying the Regulator and the people affected. Under clause 9.8 please tell us if you see anything on your side. We will send the full incident note within 14 days.

## Open points for the practitioner
- Timing: POPIA s22 says "as soon as reasonably possible"; the 72 h figure is an internal target only (drill G4).
- Whether notice B must be individual (WhatsApp/email) or may be by another s22(5) method; whether the "STOP" line belongs on a breach notice (the template checker requires it for lead-facing templates).
- Category: Meta may classify the template as marketing; if so, rewrite rather than accept.
