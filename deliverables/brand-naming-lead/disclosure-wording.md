# SortMyCover: disclosure line and approved short forms

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

## 5. Change control

Any change to the full line starts in CP-v0.1 (contracts-drafter) and then flows here. Short forms are regenerated from it, and compliance-qa re-checks every surface listed in §3. Version every change (`DISC-*-v2`) and keep the old text for the consent and disclosure evidence trail.
