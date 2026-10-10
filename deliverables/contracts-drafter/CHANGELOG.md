# CHANGELOG — contracts-drafter

All documents are **DRAFT — for practitioner review**. Markdown only; PDF rendering is a later step.

## Consent and privacy CP-v0.3 + consent scope v3 — 2026-10-07

### Changed
- `consent-and-privacy.md` CP-v0.1 → **CP-v0.3**. It is numbered past CP-v0.2 because that number is already used by `lead-generation-agreement/consent-and-privacy.md`. Consent texts move to v3 scope, "insurance and financial planning". New texts: `SMOKER-Q-v1` and `CTWA-REOFFER-v1` (tier B re-offer, not built yet). Privacy notice **PN-v1.2** mirrors the live page and adds cover through work, the tier B offer path, dispute evidence to the adviser, what Meta never gets, and a smoker retention line marked [CONFIRM with practitioner]. Cookie notice **CN-v1.2** (`smc_sid` row). The Part 5 templates are the live v3 texts. The file ends with its own change log and its open questions.
- `broker-services-agreement.md`: **SUPERSEDED** header pointing to LGSA-v0.2. The rest is unchanged, for the record.
- `lead-generation-agreement/consent-and-privacy.md` (CP-v0.2): status note (a proposal, not live). Scope "life cover" → "insurance and financial planning" in 1.1, 1.5 and Part 3 rule 7. Part 5 row 9.
- `paia-manual.md` §10.1 and `ncc-direct-marketer-pack.md` row 6: the processing purpose and the direct-marketing description now say "insurance and financial planning".
- `../media-buyer/campaign-spec.md` §3.5: the quoted instant-form consent is now `CONSENT-NAMED-v3` (it matches `instant-form-spec.json` and `consent.json` word for word). The disclaimer body is `DISC-FULL-v2`.

### Open
- Practitioner: open questions 1 to 8 at the end of CP-v0.3 (scope specificity, smoker status retention and s27 consent, re-offer consent, generic sequential offers, dispute evidence, the separate ads consent in LGSA 13.2(c), NH-60, Q22 against LGSA 8.4).
- Build: open questions 9 to 12 at the end of CP-v0.3 (a W34 smoker job and 72-hour purge of `capture_state`, the smoker answer withheld on re-offer, a narrow dispute pack, the privacy page mirror and relabel).

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
