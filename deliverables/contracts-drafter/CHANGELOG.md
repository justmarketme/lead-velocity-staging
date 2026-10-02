# CHANGELOG — contracts-drafter

All documents are **DRAFT — for practitioner review**. Markdown only; PDF rendering is a later step.

## Review-4 fixes — 2026-10-02 (compliance-qa phase4-review-4 #27–#29, NH-42)

### Changed
- `consent-and-privacy.md` Privacy Notice **PN-v1 → PN-v1.1**: email used only for the video-call invite and never sent to Meta (removed "and email" from the purposes table, Meta processor row and Pixel/CAPI section; #27); new "From the adviser, after your call" line (outcome, 1–5 rating, short note, voice note transcribed by `{{TRANSCRIPTION_PROVIDER}}`, audio not kept, redacted text only; #29, POPIA s18); `{{TRANSCRIPTION_PROVIDER}}` row in the processor table; retention list aligned with W34 (lead data incl. feedback, unfinished chats, non-fit, consent, block list, backups) with periods as placeholders + defaults for practitioner confirmation (Q11); "No thanks" line scoped to the block-list hash for both CTWA and nurture (#28, depends on the W08 suppress fix); PERSON route added to "Automated checks". Mirror owner must update `landing/holding/privacy.html`.
- Cookie Notice **CN-v1 → CN-v1.1**: banner removed (none exists); `smc_ads_off` row added; off switch described as `adsOff()`/`adsOn()` at /privacy#opt-out; Pixel on at load marked as the open practitioner question (Q9), with the CN-v2 switch-over if opt-in is required.
- `broker-services-agreement.md` Schedule C: new **C1A "When the person cancels"** (default (a)+(b)), options (a) and (b) in a drafting note for Jonathan (NH-42); C2 row "cancelled and booked again".
- `practitioner-brief.md`: Q9 and Q11 rewritten to the real mechanism and W34 periods; Q10 adds the transcription provider; new Q22 (adviser feedback / s18) and Q23 (C1A cancellations).
- `compliance-register.md`: F4, P8, P10 updated; new P17 (adviser feedback + transcription) and P18 (opt-out switch); retention schedule 1.5 rows for feedback, voice audio, `wa_threads`, nurture "No thanks", placeholders.

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
