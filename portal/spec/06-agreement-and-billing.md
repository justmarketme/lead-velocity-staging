# 06 Agreement and billing

**Route:** `/broker/agreement` (wizard step 5), later `/broker/billing` (same page, billing section first once signed). **Prototype:** `portal/prototype/agreement.html`. **Inspired by:** Intercom/Appcues (one short task, clear finish), Lemonade (plain words, says what happens next). Legal text is **not** written here: it is `deliverables/contracts-drafter/broker-services-agreement.md` (draft for practitioner review). This page renders it and records the signature.

## Part A: Sign (step 5 `agreement`, blocking)
**Q7 default (gates-batch): in-portal e-sign** (typed name + timestamp + IP + document hash, copy emailed from howzit@). Agreement clause 16.5: "Signing electronically in the portal is valid. The portal records who signed, when, and from which device." A DocuSign-style tool is the alternative if Jonathan or the practitioner prefers it (needs_human NH-BS-04); this page's contract stays the same (signature evidence fields), only the signing widget changes.

### What it shows
1. Heading "Sign your agreement". Sub: "It is written in plain words. Flat price per 30-day cycle, month to month, no lock-in. Read it, tick the boxes, type your name. Done."
2. A scrollable preview of the agreement (rendered from the contracts-drafter file with the broker's values: `{{practice_legal_name}}`, `{{fsp_number}}`, Schedule A from `pricing`), plus "Open the full agreement" and "Download PDF". Plain-English summary above it (5 bullets, not legal text): flat price per cycle never linked to policies; month to month, no notice; leads are yours to use exclusively, we keep the campaign data, pages and ad account; replacements for no-shows, unreachable and outside-criteria leads, up to your tier limit; shortfall: cycle extends up to 14 days then a pro-rata credit.
3. The signing block, exactly as the agreement's "Signatures" section:
   - [ ] "I have read clauses 1 to 16 and Schedules A to D." (required)
   - [ ] "I agree to clause 11.2: you may use my photo, voice and video to introduce me to leads." (**optional**; "You can sign without it and change your mind later in the portal.")
   - [ ] "I sign Annex 1: you may run ads from my Facebook Page if Meta needs that. I approve every ad first and I can withdraw it any time." (required; this is the authorisation letter for the 2.1.3 fallback)
   - Facebook Page name and Page ID (for Annex 1; Page ID optional). If the broker has no Page: tick "I do not have a Facebook Page yet" and the letter keeps `{{broker_page_name}}` blank for Jonathan to complete (needs_human NH-BS-05).
   - Full name (`signatory_name`) and role (`signatory_role`), pre-filled from `adviser_name`; the broker confirms or edits.
   - Hint: "By tapping Sign you sign for your practice. We record your name, the date and time, your device and a fingerprint of the exact document. Copies go to you and to howzit@leadvelocity.co.za."
4. **Sign agreement** button, disabled until the two required ticks are set and the name has at least 3 characters.

### On Sign (server side, one transaction)
| Writes | Where |
|---|---|
| `signed_at`, `signed_by_name`, `signer_ip`, `signed_user_agent`, `doc_sha256`, `version` | `admin_documents` row `kind = agreement` (crm-gap A2) |
| Acceptances `{read:true, clause_11_2:bool, annex_1:true}` | `admin_documents.metadata` |
| A second row `kind = authorisation_letter` (Annex 1 rendered with the Page and FSCA check date) | `admin_documents` |
| `signatory_name`, `signatory_role`, `fb_page_name`, `fb_page_id`, `practice_legal_name` | `brokers` |
| `onboarding_progress.agreement = done` | `brokers` |
| Event `agreement.signed` | W20 sends the signed copy from howzit@ to the broker (bcc howzit@) with the PDF and the SHA-256 in the body |
- **Version guard:** if the agreement version changed since the page loaded, signing is refused with "We updated the agreement while you were reading. Please read it again." No silent re-signing.
- **Lead Velocity's signature:** the LV block is pre-completed by Jonathan's standing authority when the document is generated (`lv_signed_at`), so the broker's signature completes it instantly. If Jonathan prefers to countersign, the page shows "Signed by you. Waiting for Lead Velocity to countersign" and `agreement` stays `doing` (needs_human NH-BS-04).
- Signed documents are immutable, kept in the private bucket (`admin-documents` must be private; NH-15), and visible afterwards under Documents (`BrokerDocuments.tsx`, reuse as-is).
- Confirmation copy: "Signed. A copy is on its way to your email and to howzit@leadvelocity.co.za."

## Part B: Cycle, invoices and how to pay (always visible; blocking nothing)
Payment already happened at checkout (6.1 step 0) before the account existed. This section is the broker's billing home.
| Shown | Source |
|---|---|
| Current cycle: dates, tier, committed leads, price (excl. VAT; a VAT line appears only once registered), status (Paid/Due/Not renewed) | `cycles`, `pricing`, `invoices` |
| Invoices and receipts list (PDF per row, reference `LV-{broker_id}-{tier}-{YYYYMM}`) | `invoices` -> `admin_documents` |
| **Next cycle: pick how you want to pay**, three options linking to `billing/checkout` (the same component as the renewal offer, W19): (a) **Instant EFT** (default, recommended: one cycle, instant confirmation), (b) **EFT with a reference** (zero fee; the checkout shows the reference and our bank details), (c) **Card, renews automatically** (optional) | `/checkout?tier=...&pay=instant_eft|manual_eft|card_autorenew&cycle=next` |
| Card auto-renew toggle (visible only once opted in): "Renew by card each cycle: On. Switch off any time." | `card_autorenew` |
| Tier change: "Move to Silver/Gold for the next cycle" | Checkout with a different `tier_code` |
- Copy under the buttons: "Same price. No lock-in. You pick again each cycle. We show the renewal offer 7 days before your cycle ends." and "Card renewal is a choice, not a requirement."
- There is **no grace period** and no dunning (0.1): an unpaid cycle simply is not renewed; the page says "Your next cycle starts when you pay."
- Prices come only from `pricing` (W25 diff check). Never hard-code R16,500 in the page. <!-- price-diff:allow -->

## Step clip: "Signing and paying" (35 s)
| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Agreement summary bullets | "Here's your agreement in plain words: one flat price per 30 days, no lock-in, and the leads are yours to use." |
| 0:12 | Scroll the document; tick the boxes | "Read it, tick the boxes, and type your name. Your photo and video tick is optional." |
| 0:22 | Tap Sign; confirmation | "Tap Sign. You and howzit@ get a copy straight away." |
| 0:28 | Billing section, three pay buttons | "When your cycle ends, you pick how to pay: Instant EFT, EFT with a reference, or card. Card is optional." |

## Events and measures
Events: `agreement.signed`, `step.completed(agreement)`. Measures: time from login to signed; share who open the full document; share who tick 11.2; support questions tagged "agreement".
