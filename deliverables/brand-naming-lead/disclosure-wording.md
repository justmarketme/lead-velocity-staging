# SortMyCover: disclosure line and approved short forms

Version: **DW-v2 · 5 Oct 2026** (supersedes DW-v1 of 2 Oct 2026; v1 is kept below in Appendix A as the disclosure evidence trail, per §5) · Owner: brand-naming-lead (form and placement) · **contracts-drafter owns the legal wording** · compliance-qa checks every surface

## V2-0. The decision (Jonathan, 5 Oct 2026)

**Competitors must not be able to see that SortMyCover belongs to Lead Velocity.** From today, Lead Velocity (Pty) Ltd is named on a consumer surface only where the law requires it.

| Placement | Names Lead Velocity? | Why |
|---|---|---|
| `privacy.html` | **Yes**: name, registration number, address, Information Officer | POPIA s18(1)(b): the responsible party's name and address must be given where personal information is collected |
| `terms.html` | **Yes**: legal party and address | The terms need a named counterparty |
| Consent text beside any form or WhatsApp opt-in | **No**: it says "SortMyCover". The privacy notice link beside it names the company | The consent wording may use the brand while the notice carries the legal name. New versions `CONSENT-NAMED-v2` and `CONSENT-GENERIC-v2` |
| Everything else: site footer, About, How we make money, Learn, 404, Complaints, landing pages and thank-you pages, ad end-cards, Page and profile fields, WhatsApp profile, consumer email signature, intro card | **No** | Not required |
| schema.org JSON-LD | **No**: Organization `name` is "SortMyCover" only. No `parentOrganization`, `legalName`, `identifier` or address | Structured data must match the visible text, and the visible text no longer names the company |

Rules that go with it:
1. Fact 1 of DW-v1 ("a service of Lead Velocity (Pty) Ltd") is dropped from every form outside the two legal pages. Facts 2 and 3 become one line (`DISC-FULL-v2`).
2. The line says what SortMyCover does not do, and who does. It adds no claim about price, product or outcome.
3. **No surface may say or imply that no company stands behind SortMyCover.** If a consumer asks who is responsible, the answer is the privacy notice and the terms. Hiding the name from competitors must never mislead a consumer.
4. One inbox on consumer surfaces: `hello@sortmycover.co.za` (resolves M1 for the holding pages; see V2-4).
5. Broker-facing documents (agreements, invoices, the weekly report, the broker portal) are not consumer surfaces. Lead Velocity stays the contracting party there.

## V2-1. Approved forms

Character counts are hand-counted, including spaces and punctuation. The person pasting re-checks them in the platform field.

| ID | Surface | Text (verbatim) | Chars |
|---|---|---|---|
| `DISC-FULL-v2` | Site footer (every page), About, How we make money, Learn, 404, Complaints, landing pages and their thank-you pages, Facebook Page "About → details", A4 consumer documents | SortMyCover gives no financial advice, product comparisons or premium quotes. Licensed financial advisers do. | 109 |
| `DISC-S91-v2` | **Ad end-card** small print (the brand is already on the card) | No financial advice, product comparisons or premium quotes. Licensed financial advisers do. | 91 |
| `DISC-WA-DESC-v2` | WhatsApp Business profile: Description | SortMyCover gives no financial advice, product comparisons or premium quotes. Licensed financial advisers do. Our WhatsApp assistant uses AI. Type "person" at any time to reach a human. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy.html | 248 |
| `DISC-CARD-v2` | Broker intro card, strip under the broker's details | Introduced by SortMyCover. SortMyCover gives no financial advice, product comparisons or premium quotes. | 104 |
| `DISC-EMAIL-v2` | Consumer email signature (below) | `DISC-FULL-v2` plus a privacy link | n/a |
| `BIO-FB-v4`, `BIO-IG-v5` | Facebook intro, Instagram bio | Bios describe the service and carry no disclosure (copy workflow 2026-10-05) | 99, 145 |
| `DISC-S97-v1`, `DISC-S148-v1` | Old short forms | **Withdrawn.** They named Lead Velocity. Use `DISC-S91-v2` on end-cards. Bios use `BIO-FB-v4` / `BIO-IG-v5` | n/a |
| `CONSENT-NAMED-v2` | Named consent, beside the form | I agree that SortMyCover may share my details with {practice_name} (FSP {fsp_number}), an authorised financial services provider, who may contact me by WhatsApp or phone about life cover. I can opt out at any time by replying STOP. + `CONSENT-ADS-v1` sentence + "Privacy notice" link | n/a |
| `CONSENT-GENERIC-v2` | Generic consent (only if the practitioner approves it) | I agree that SortMyCover may share my details with an authorised financial services provider (FSP), who may contact me by WhatsApp or phone about life cover. I can opt out at any time by replying STOP. + `CONSENT-ADS-v1` sentence + link | n/a |

`DISC-CARD-v2` keeps the third person ("SortMyCover gives…", not "we") because the card carries the adviser's face. It still needs contracts-drafter sign-off (M6).

### `DISC-EMAIL-v2` (consumer-facing sends from hello@sortmycover.co.za)
```
{Sender first name} · SortMyCover
hello@sortmycover.co.za · sortmycover.co.za
Sort your cover. 30 minutes. A real adviser.

SortMyCover gives no financial advice, product comparisons or premium quotes. Licensed financial advisers do.
Privacy: sortmycover.co.za/privacy.html
```
Broker-facing mail keeps the Lead Velocity signature from howzit@leadvelocity.co.za.

### Footer pattern (built on the holding site and the landing template)
`DISC-FULL-v2` · `hello@sortmycover.co.za` · links: Learn, About, How we make money, **Privacy, Terms**, Complaints (landing pages: Privacy notice, Terms, How we make money, Complaints, Opt-out). No company name, no registration number, no address. Privacy and Terms are on every page, so the legal party is one click away.

## V2-2. Where each form goes (placement map, v2)

| Surface | Form | Notes |
|---|---|---|
| Site footer, every page | `DISC-FULL-v2` | Endorsement lock-up, `hello@`, links incl. Privacy and Terms. **No Reg No** |
| About page | `DISC-FULL-v2` | Says SortMyCover is a South African service and points to the privacy notice and terms for the responsible company. No address, Reg No or Information Officer |
| Form / consent area | `CONSENT-*-v2` | Privacy link always beside it |
| `privacy.html`, `terms.html` | Legal text, **names Lead Velocity** | The only two places. The footer on these two pages is the same `DISC-FULL-v2` |
| Facebook Page | `DISC-FULL-v2` in About → details; intro = `BIO-FB-v4` | |
| Instagram | `BIO-IG-v5` | |
| WhatsApp Business profile | `DISC-WA-DESC-v2` + `DISC-WA-ABOUT-v1` | Privacy link in the Description |
| WhatsApp templates and assistant | No company name | Needs automation-engineer and conversation-designer to align (V2-3) |
| Ad end-card | `DISC-S91-v2` | Line + "Tap to check your cover". No broker, no FSP number (1.2) |
| Consumer email | `DISC-EMAIL-v2` | |
| A4 consumer documents | `DISC-FULL-v2` in the footer | |
| Broker intro card | `DISC-CARD-v2` | |

## V2-3. Files that still carry the v1 line (found 5 Oct; not changed by this decision's author)

Done in this change set: `landing/holding/*` (all pages except the privacy and terms bodies), `landing/template`, `landing/config` (consent, faq, site), `landing/angles`, `landing/reference`, `landing/tests`.

Still on v1. Each owner updates their own files and bumps their own version:
| Owner | Files |
|---|---|
| visual-producer / brand | `brand/templates/{endcard-16x9,reels-endcard,a4-document,intro-card}.html`, `brand/tokens.json`, `brand/brand-bible.md`, `brand/scripts/build-bible-pdf.mjs`, `brand/scripts/build-week1.mjs`, `deliverables/visual-producer/**` (assets manifest, engine, render and review scripts) |
| meta-operator | `deliverables/meta-operator/{profile-kit,setup-checklist,jonathan-clicks,appeal-playbook,existing-assets-inventory,setup-existing-lv-account,template-submission-runbook,first-principles}.md`, `warmup-posts/`, `current-posts/`, `week1-posts/`, `daily/` |
| media-buyer | `deliverables/media-buyer/instant-form-spec.json` (consent text on the Instant Form) |
| automation-engineer / conversation-designer | `automation/W03.json`, `automation/lib/w05.mjs`, `conversation/persona.md`, `knowledge/faq.md` (Thandi's intro line, FAQ-09, FAQ-15 and their Afrikaans lines; the landing FAQ no longer reads FAQ-09), `community/reply-corpus.md`, `evals/golden-set.json` (run the eval gate after the edit) |
| contracts-drafter | `deliverables/contracts-drafter/consent-and-privacy.md` (CP-v0.1 consent text and Part 5 footer: align to `CONSENT-*-v2`), `consumer-terms.md`, `information-officer-pack.md`, `paia-manual.md`, `compliance-register.md` |
| orchestrator | `docs/MASTER-PROMPT.md`: 2.1.2 default consent line, 2.1.3 ("Lead Velocity appears only in the footer/privacy notice"), 4.5 trust copy, 4D.2 rule 8 |
| search-findability-lead | `deliverables/search-findability-lead/serp-plan.md` (Organization schema `parentOrganization`, "named author entity (Lead Velocity)") |
| compliance-qa | Re-check every surface in V2-2 after the owners above finish. The `deliverables/compliance-qa/*` review notes are history and stay as written |

## V2-4. Flags for the owners (nothing decided here)

| # | Flag | Owner |
|---|---|---|
| F1 | **Consent version change.** `CONSENT-NAMED/GENERIC-v1` read "Lead Velocity may share…". v2 reads "SortMyCover may share…". CP-v0.1 asks for word-for-word text with a version ID, and every stored lead carries the exact wording shown. Align CP-v0.1 and re-sign before the quiz pages go live. Ask the practitioner (2.3) about brand-only consent plus a privacy link | contracts-drafter, compliance-qa |
| F2 | **YMYL trust.** Google's guidance wants a named responsible entity. It is now on Privacy and Terms only (linked from every footer), no longer in the footer or About. Watch the Search Console brand queries and any Meta review for a "who is behind this" objection; the About page carries the pointer | search-findability-lead |
| F3 | **Meta review.** If Meta asks who runs the Page, answer truthfully (Lead Velocity is the advertiser of record, 2.1.3). This decision is about competitor visibility, not about hiding from the platform or the regulator | meta-operator |
| F4 | `privacy.html` and `terms.html` still give `howzit@leadvelocity.co.za` as the contact. It is the same inbox as `hello@sortmycover.co.za` (M1). Pick one; the legal pages are contracts-drafter's | contracts-drafter |
| F5 | **Google Business Profile and any directory listing** must follow the footer: brand name only, no Lead Velocity name in the NAP block. The business address is no longer on the site (it is in the privacy notice), so a service-area listing is the fit | search-findability-lead |

## V2-5. Change control
Unchanged from v1 §5: any change to the full line starts in CP-v0.1 (contracts-drafter) and flows here; short forms are regenerated from it; compliance-qa re-checks every surface; version every change (`DISC-*-v3`) and keep the old text. v2 is a **brand decision by Jonathan**, so CP-v0.1 follows this file for the wording of the public line until the practitioner opinion says otherwise.

---

# Appendix A: DW-v1 (superseded 5 Oct 2026, kept as the evidence trail)

Version: DW-v1 · 2 Oct 2026 · Owner: brand-naming-lead (form and placement) · **contracts-drafter owns the legal wording** · compliance-qa checks every surface

**Source of truth:** 4D.2 rule 8, as already adopted word for word by contracts-drafter in `deliverables/contracts-drafter/consent-and-privacy.md` (CP-v0.1, `CONSENT-FOOTER-v1` §1.5 and Part 5). This file adds **no new claims**. It only fits the same three facts into shorter fields:
1. **Who:** SortMyCover is a service of Lead Velocity (Pty) Ltd.
2. **What we do:** we connect you with authorised financial services providers.
3. **What we don't:** no financial advice, no product comparisons, no premium quotes.

A short form may drop words. It may not drop fact 1 or fact 3, and it may not add a claim. Character counts are hand-counted, including spaces and punctuation. The person pasting re-checks them in the platform field, because field limits move (they are not looked up here, per 0.1).

---

## 1. Full line: `DISC-FULL-v1` (182 characters)

> SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.

**Used on:** site footer (every page), About page, under every form and consent box (`CONSENT-FOOTER-v1`), Facebook Page "About → details", WhatsApp Business description, email signature, A4 document footers, and the bottom of the "How SortMyCover makes money" page.

## 2. Short forms

| ID | Surface | Text (verbatim) | Chars | Notes |
|---|---|---|---|---|
| `DISC-S148-v1` | **Instagram bio** (150 max) | A service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. No advice, product comparisons or premium quotes. | 148 | "financial" dropped from "advice" to fit. "We connect you with authorised FSPs" stays, so it is clear advice comes from them. Link field = `sortmycover.co.za`. The name shows above the bio, so it is not repeated. |
| `DISC-S97-v1` | **Facebook Page intro / bio** (short field) and **ad end-card small print** | A service of Lead Velocity (Pty) Ltd. No financial advice, product comparisons or premium quotes. | 97 | On the Page, the full line also goes in About → details. On the end-card it sits under the line and CTA, in 12–14 px off-white on charcoal, outside the Reels safe-zone margins. |
| `DISC-WA-DESC-v1` | **WhatsApp Business profile: Description** | SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums. Our WhatsApp assistant uses AI. Type "person" at any time to reach a human. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy | ≈ 316 | Full line plus three sentences already in the Privacy Notice ("Our AI assistant") and the consent (STOP). No new claims. |
| `DISC-WA-ABOUT-v1` | **WhatsApp Business profile: About** (short status) | Sort your cover. 30 minutes. A real adviser. | 44 | The brand line, verbatim. The disclosure is in Description. |
| `DISC-EMAIL-v1` | **Email signature** (M365, consumer-facing sends from hello@sortmycover.co.za) | See the block below | — | Graphic header = horizontal lock-up (600 px). The plain-text fallback is identical. |
| `DISC-CARD-v1` | **Broker intro card**, bottom strip under the broker's details | Introduced by SortMyCover, a service of Lead Velocity (Pty) Ltd. SortMyCover does not give financial advice, compare products or quote premiums. | 144 | **Needs contracts-drafter sign-off** (M6). "We" changes to "SortMyCover" because on a card carrying the adviser's face, "we do not give financial advice" could be read as the adviser speaking. The broker's own line ("Authorised financial services provider · FSP {number}", 4.10) is unchanged and sits above. |

### Email signature block: `DISC-EMAIL-v1`

```
{Sender first name} · SortMyCover
hello@sortmycover.co.za · sortmycover.co.za
Sort your cover. 30 minutes. A real adviser.

SortMyCover is a service of Lead Velocity (Pty) Ltd (Reg. {{CIPC_REG_NO}}). We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.
```
*Note:* the registration number is a parenthesis in the first sentence (trust item 1). The three facts are unchanged. **Broker-facing mail** (agreements, invoices, reports) stays on the Lead Velocity signature from howzit@leadvelocity.co.za (4.10 onboarding #0). This block is for consumer-facing mail only (calendar invites, replies to hello@).

## 3. Where each form goes (placement map)

| Surface | Form | Also carries |
|---|---|---|
| Site footer, every page | FULL | Endorsement lock-up, Reg No, hello@, links to Privacy / How we make money / Complaints |
| About page | FULL | Address, Information Officer, complaints route |
| Form / consent area | FULL (`CONSENT-FOOTER-v1`) | The consent text from CP-v0.1 §1.2 / §1.3, word for word |
| Facebook Page | S97 (intro) + FULL (About details) | Category "Website" or "Education" (4.7) |
| Instagram | S148 | Link = sortmycover.co.za |
| WhatsApp Business profile | WA-DESC + WA-ABOUT | Tick mark profile image |
| WhatsApp intro templates | No change: `broker_intro_booked` / `broker_intro_slots` stay verbatim from 4.6 / CP-v0.1 Part 5 | Intro card image header with `DISC-CARD-v1` |
| Ad end-card | S97 | Line + "Tap to check your cover". No broker, no FSP number (1.2) |
| Email (consumer) | EMAIL | Horizontal lock-up header |
| A4 documents | FULL in the footer | Endorsement lock-up |

## 4. Consistency check against contracts-drafter (CP-v0.1). Flagged, not changed

I read `deliverables/contracts-drafter/consent-and-privacy.md` and the live holding pages. **The rule-8 line matches word for word** in CP-v0.1 §1.5, Part 5, Privacy "Who we are" (facts 2–3), Terms §1, and every `landing/holding/*.html` footer. The mismatches below are left as they are for the owner to decide:

| # | Where | Mismatch | Brand recommendation | Owner |
|---|---|---|---|---|
| M1 | CP-v0.1 Privacy "Complaints" + "Information Officer" + Terms §12; `landing/holding/complaints.html` | Consumers are told to write to **howzit@leadvelocity.co.za**, while every holding-page footer, About and trust item 8 (4D.4b.5) use **hello@sortmycover.co.za** (an M365 alias to howzit@, per 4.7). Two addresses on consumer surfaces break trust item 7, and the `leadvelocity.co.za` domain leads consumers towards the B2B brand (2.1.3) | Use hello@sortmycover.co.za on all consumer documents. It is the same inbox, so the 48-hour SLA and audit trail are unchanged | contracts-drafter (+ landing-page-builder for complaints.html) |
| M2 | `landing/reference/sortmycover-landing.html` line 225 | The consent reads "I agree that **SortMyCover (a service of Lead Velocity (Pty) Ltd)** may share…". `CONSENT-NAMED-v1` reads "I agree that **Lead Velocity** may share…". CP-v0.1 requires word-for-word consent text with a version ID | Brand preference: the reference wording, because the consumer only knows SortMyCover by that point. Legally, one version must be chosen and versioned (`CONSENT-NAMED-v2` if adopted) | contracts-drafter decides; landing-page-builder implements |
| M3 | Master prompt 4.5 page spec row 13 | The footer is given as "We connect you with authorised financial services providers; we do not give financial advice", which is shorter than rule 8 and drops "compare products or quote premiums" | Keep the full rule-8 line (as built). Fix the prompt text | orchestrator (prompt text) |
| M4 | CP-v0.1 Terms §4 vs `landing/holding/how-we-make-money.html` and 0.1 | "flat **monthly** fee" vs "flat fee for each **30-day cycle**" | Use "30-day cycle" everywhere (0.1 commercial model) | contracts-drafter |
| M5 | 2.1.2 vs 0.1 | Already raised by contracts-drafter as NH-CD-04 (named consent is the default) | No brand action | — |
| M6 | `DISC-CARD-v1` (new short form, above) | A third-person variant of rule 8 for the intro card | Approve or replace before the intro card template is final | contracts-drafter + broker approves the card in writing (4.10 #5) |

## 4a. Bios are not disclosures (Jonathan, 2026-10-05)

Facebook Page intro and Instagram bio describe what SortMyCover does for consumers. They no longer carry S97/S148:
- `BIO-FB-v4` (99): Sort your cover: free 30-min call with a licensed adviser at a time you pick. We book. They advise.
- `BIO-IG-v5` (145): Sort your cover. 30 minutes. A real adviser. / Free call, licensed adviser, a time you pick. / We book the call. They advise. You decide. / Message us.

DISC-FULL-v1 stays in Facebook Page About → details, the site footer and the WhatsApp description. S97 stays on the ad end-card. compliance-qa to confirm the bios (they claim no advice, no products, no prices).

## 5. Change control

Any change to the full line starts in CP-v0.1 (contracts-drafter) and then flows here. Short forms are regenerated from it, and compliance-qa re-checks every surface listed in §3. Version every change (`DISC-*-v2`) and keep the old text for the consent and disclosure evidence trail.
