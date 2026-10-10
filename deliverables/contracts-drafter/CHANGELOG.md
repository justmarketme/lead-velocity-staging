# CHANGELOG — contracts-drafter

All documents are **DRAFT — for practitioner review**. Markdown only; PDF rendering is a later step.

## LGSA-v0.3 repair pass — 2026-10-10 (after independent checks)

### Changed (edit the draft, then `node make-sources.mjs` and `node build-docx.mjs template`)
- 9.5, 9.7: a move on from the Pilot is made only under 9.7 (pay the next Plan's Fee in advance, no 9.5 notice). S1.3 states the Fee and Committed Leads of Silver and Gold instead of bracketed placeholders; the CRM generator lists Bronze there for a Pilot Client.
- 1.1.28, S1.1: the weekly maximum (3 requests per Calendar Week) is stated next to the definition and in Schedule 1. 1.1.35: same two calls as S3.4(a).
- 6.3, 11.6, S1.1: refunds are never more in total than the Client paid (rounded Effective Lead Price over-refunded a full Silver or Gold cycle by R10 or R5).
- D11 and D12 lawyer notes corrected; D10 row added to the change log. 8.3, 8.4 and 6.1 untouched (open-items.md section 7, questions 7 and 9).
- `make-sources.mjs` fails if these drop out; `src/lib/contract/agreement.ts` warns when the 1.1.14 prices, the weekly cap or an S1.3 Plan row drift from `pricing.seed.json`. `build-docx.mjs`: the two Silver and Gold substitutions for the old placeholders are gone.
- `open-items.md`: questions 9 and 10, and section 8 (what this pass fixed, and the system work it deliberately did not do).

## Lead Generation Services Agreement LGSA-v0.3 — 2026-10-10 (Pilot restored)

### Changed (Jonathan's 10 Oct decisions; edit `lead-velocity-services-agreement-v2.md`, then `node make-sources.mjs`)
- Pilot Plan restored (reverses the 7 Oct withdrawal): R8,500 once-off, 10 Qualified Leads (R850 each), first-time clients only, one introductory cycle, then Bronze or higher. 1.1.24, 9.6, 9.7, S1.3; "minimum Plan is Bronze" removed.
- Replacements: 3 requests per Calendar Week for every Plan (no separate Pilot cap); an Uncontactable Lead ("couldn't reach them") also earns one, inside the same 3. New definition 1.1.35; 1.1.28, 7.1 to 7.7, 9.7, 14.3(c), S4.3; Schedule 3 rewritten (S3.4 and S3.5 new, S3.1 to S3.3 unchanged). Clause 7 stays goodwill ("may"): "will" vs "may" is open.
- Refunds of undelivered leads, Top-Up Leads included, at the Effective Lead Price of the Client's Plan (Pilot R850, Bronze R825, Silver R817, Gold R789): 1.1.14, 6.3, 6.6, 11.6, S1.1, S1.2.
- Notice stays 7 days (11.1). Clauses 8.3 and 8.4 untouched.
- Tooling: `make-v02-sources.mjs` renamed `make-sources.mjs` (now v0.3, fails if a decided term drops out); `lead-velocity-services-agreement-v0.2-marked.md` renamed `-v0.3-marked.md` (v0.2 was never issued); `build-docx.mjs` footer reads the version from the source and numbers clauses with a letter suffix (1.1.3A).
- `open-items.md`: sections 6 (decided) and 7 (open questions) added.

### Open
- `mark-whatsapp-reply.md` and the Mark copy describe v0.1/v0.2 and need redrafting; `node build-docx.mjs mark` already fails on the generic Parties placeholders.

## Lead Generation Services Agreement LGSA-v0.2 — 2026-10-07 (Mark Weston amendments)

### Added
- `lead-generation-agreement/mark-amendments-2026-10-07.md`: findings on Mark's 9 requests (contract, repo economics, law, industry), with sources.
- `lead-generation-agreement/lead-velocity-services-agreement-v2.md`: LGSA-v0.2, with changed clauses marked. Replacements become an obligation within the 0.1 per-cycle cap; Invalid Leads (5.7) are never Delivered; dispute evidence (5.8); force majeure capped at cycle + 14 days; Schedule 3 replaced.
- `lead-generation-agreement/mark-whatsapp-reply.md`: draft reply (not sent).

### Declined
- Attendance in the Qualified Lead definition, R1,500 floor, income verification, 70% show-rate trigger.

### Open
- NH-67: Jonathan to approve v0.2; Pilot cap 2 and Top-Up cap (20%) are gap-fills; 11.1 notice vs 0.1; pricing.seed.json `terms` to be updated; .docx/PDF client copy not rebuilt yet.

## Consumer Terms TU-v1.0 — 2026-10-02 (S7-15)

### Added
- `consumer-terms.md`: SortMyCover consumer Terms of Use **TU-v1.0 (DRAFT)**, 12 sections, source text with (practitioner) markers, reading-level check and its own change log. Supersedes **WT-v1** (`consent-and-privacy.md` Part 3).
- `landing/holding/terms.html`: published form, same head/header/footer/tokens and `{{…}}` placeholders as `privacy.html`; no practitioner markers on the page.
- `practitioner-brief.md`: Q25–Q29 (CPA application to a free service, §10 limit under s48–s51/s49, ECTA s43, how the terms bind, adviser "not our employee or agent").

### Changed
- `landing/holding/privacy.html`: Terms link added to the footer nav (no header nav exists).
- `consent-and-privacy.md` Part 3: pointer to TU-v1.0 (WT-v1 text kept for the evidence trail).

## Review-4 fixes — 2026-10-02 (compliance-qa phase4-review-4 #27–#29, NH-42)

### Changed
- `consent-and-privacy.md` Privacy Notice **PN-v1 → PN-v1.1**: email used only for the video-call invite and never sent to Meta (removed "and email" from the purposes table, Meta processor row and Pixel/CAPI section; #27); new "From the adviser, after your call" line (outcome, 1–5 rating, short note, voice note transcribed by `{{TRANSCRIPTION_PROVIDER}}`, audio not kept, redacted text only; #29, POPIA s18); `{{TRANSCRIPTION_PROVIDER}}` row in the processor table; retention list aligned with W34 (lead data incl. feedback, unfinished chats, non-fit, consent, block list, backups) with periods as placeholders + defaults for practitioner confirmation (Q11); "No thanks" line scoped to the block-list hash for both CTWA and nurture (#28, depends on the W08 suppress fix); PERSON route added to "Automated checks". Mirror owner must update `landing/holding/privacy.html`.
- Cookie Notice **CN-v1 → CN-v1.1**: banner removed (none exists); `smc_ads_off` row added; off switch described as `adsOff()`/`adsOn()` at /privacy#opt-out; Pixel on at load marked as the open practitioner question (Q9), with the CN-v2 switch-over if opt-in is required.
- `broker-services-agreement.md` Schedule C: new **C1A "When the person cancels"** (default (a)+(b)), options (a) and (b) in a drafting note for Jonathan (NH-42); C2 row "cancelled and booked again".
- `practitioner-brief.md`: Q9 and Q11 rewritten to the real mechanism and W34 periods; Q10 adds the transcription provider; new Q22 (adviser feedback / s18) and Q23 (C1A cancellations).
- `compliance-register.md`: F4, P8, P10 updated; new P17 (adviser feedback + transcription) and P18 (opt-out switch); retention schedule 1.5 rows for feedback, voice audio, `wa_threads`, nurture "No thanks", placeholders.

### Follow-up (I-39i, NH-42 addendum)
- `practitioner-brief.md`: new Q24, which events restart the retention clock `last_contact_at`. Three options are listed; the default and our recommendation is (2), only outbound to and inbound from the lead, so W11 no longer touches it.
- `broker-services-agreement.md` C1A drafting note: addendum for a lead who cancels and then replies STOP. Default: no replacement claim. The alternative is to treat it as Uncontactable. Jonathan decides this with the main C1A choice (NH-42).
- `compliance-register.md`: new P19 (retention clock not moved by broker-facing W11 messages).

## v0.1 — 2026-10-02

### Added
- `broker-services-agreement.md` (BSA-v0.1): 16 clauses + Schedule A (merged from `pricing`: `tier_code`, `name`, `price_zar`, `committed_leads`, `replacement_cap_cycle`), Schedule B (3.3 bands), Schedule C (no-show / uncontactable / disqualified, 4.12a codes by name, 48-h dispute, never-replaced list), Schedule D (service levels), Annex 1 (Meta fallback authorisation, 2.1.3), e-sign block.
- `term-sheet-mark.md`: one page, Bronze 20 @ R16,500 excl. VAT, 4 replacements/cycle, shortfall, payment, inputs, 3.7 ROI view with blanks.
- `consent-and-privacy.md`: named (live) + generic (held) consent, advertising-measurement sentence, CTWA consent (generic verbatim + named variant), instant-form use, Privacy Notice, Website Terms, Cookie Notice, WhatsApp disclosure templates (4.6 verbatim), 4D.2 rule-8 line, consistency table.
- `paia-manual.md`: Regulator's private-body structure; POPIA s51 processing section; fees/forms as confirm-placeholders.
- `information-officer-pack.md`: IO + Deputy IO checklist, portal steps, evidence list, DIO designation letter, IO duties register.
- `ncc-direct-marketer-pack.md`: Annexure P checklist and W24 suppression/cleanse policy.
- `compliance-register.md`: obligations register (FAIS boundary, POPIA, CPA/NCC, Meta/WhatsApp), retention schedule, quarterly memo template, s22 breach runbook outline.
- `practitioner-brief.md`: one-page table of 20 questions with default and alternative, plus detail.
- `needs-human.md`: 24 conflicts/gaps.

### Decisions applied from 0.1 (overriding other text)
- No grace period, no notice period, no auto-renew obligation (supersedes 4.13 "7-day grace").
- Replacement caps per cycle (Bronze 4 / Silver 6 / Gold 9); no weekly cap.
- Unit sold = verified qualified lead; booking is a service.
- Shortfall: up to 14-day extension, then pro-rata credit or refund; liability capped at the cycle price; "committed", never the banned word.
- `consent_mode = named` live while one broker; generic held for practitioner approval.
- Instant EFT default; manual EFT zero-fee; card auto-renew opt-in.
- Leads exclusive to the broker; Lead Velocity keeps campaign data, pages, ad account and anonymised performance data.
- Consumer URLs on sortmycover.co.za.

### Drafting choices to confirm (see needs-human.md)
- Cycle 1 starts when routing is switched on after payment clears (NH-CD-14).
- Shortfall refund paid within 10 business days (NH-CD-09).
- Dispute flow after the 48-h window (NH-CD-11).
- Name/practice/FSP number in disclosure required; photo/voice/video optional and withdrawable (clause 11).
- Broker deletes on request within 30 days unless FAIS record-keeping requires retention (clause 9.6).
- Lead Velocity is the broker's operator only for calendar/invite work (clause 9.3).

### Not done this session
- PDF rendering.
- Full-text Flesch-Kincaid run (no shell available to this agent; hand-sampled estimate reported).

## 2026-10-02 — orchestrator, after compliance-qa phase0-review-1
- `consent-and-privacy.md` §1.4: advertising-improvement sentence moved inside the consent tick (second sentence of the checkbox label), still separate from the FSP-sharing purpose; `consent_ads_at` stored on tick.
- §1.6: the same sentence added to both Click-to-WhatsApp consent messages.
- Processor table: Meta row now names the unhashed IP address / browser type and the adviser's 1–5 rating sent for measurement.
- `SUMMARY.md` for this folder was not written by the drafter (its write was refused by the harness); the orchestrator's session report carries the summary.

## 2026-10-03 — billing-automation, NH-61 (wording only)
- `broker-services-agreement.md` clause 4.4 and Schedule A "Payment", and `term-sheet-mark.md` "How to pay": now "payment by EFT, in advance, per 30-day cycle; payment details and the reference are on your invoice". No bank account details anywhere. Instant EFT and card are no longer promised at launch (card renewal stays opt-in only if it is ever offered).
- `needs-human.md` NH-CD-06 notes the supersession. No clause numbers changed.
