**DRAFT — for attorney review. Not legal advice.**

# SortMyCover — consumer consent, privacy notice and first WhatsApp disclosure

Version: CP-v0.2 (5 October 2026). Goes with the Lead Generation Services Agreement LGSA-v0.1 (clauses 3.8, 4.1, 13 and Schedule 4). Replaces `../consent-and-privacy.md` (CP-v0.1) Parts 1, 2 and 5 for this agreement; Parts 3 (website terms) and 4 (cookie notice) of CP-v0.1 are unchanged and still apply.

**Status, 7 October 2026: a proposal, not live.** No consumer has seen these texts. The live texts, and the current privacy notice, are in `../consent-and-privacy.md` (CP-v0.3), which carries this file's open proposals (Form 4 layout, separate optional ads consent) as practitioner questions. On 7 October the consent scope in 1.1, 1.5 and Part 3 rule 7 was widened from "life cover" to "insurance and financial planning" (consent v3; LGSA-v0.2 clauses 12.3 and 13.5). The text IDs were kept because the texts were never used. If any text here is adopted, it gets a new ID in the CP series (`CTWA-NAMED-v2` here is not the `ctwa-named-v2` that W03 used until 7 October 2026; the live ID is now `ctwa-named-v3`). The qualifying questions in 1.4 are replaced by WhatsApp capture Flow v2 (`../../automation-engineer/whatsapp-capture-flow-v2.md`).

**Two kinds of blanks.** [SQUARE BRACKETS] are filled once, before go-live. {{double braces}} are merge fields the system fills for each Consumer or broker from the CRM. A page or message must not render if any broker merge field is empty (fail closed).

**Rules for every text in this file.**
1. Word-for-word the same wherever shown. Each text has a version ID. The system stores the version ID, the full text shown, the time stamp, the page URL or chat ID, the Campaign and UTM data and the broker ID with every lead (the "Origin Records" in the agreement).
2. Logistics only. No benefit statements, no "right / best / appropriate cover", no insurer names, no premium or cover figures (agreement clause 3.8).
3. Every message names SortMyCover as the sender and gives the STOP opt-out (POPIA s69(4)).

---

## Part 1 — Consent on the SortMyCover form (named-broker mode)

Named mode is the live default while there is one broker (MASTER-PROMPT 0.1). The consent names the broker, the practice and the FSP number, so handing the lead over is a disclosed purpose (POPIA s15 and s18; Information Regulator Direct Marketing Guidance Note para 10.1). The layout follows Information Regulator Form 4 (POPIA Regulation 6): the service is named, the channels are named, and the Consumer chooses "I give" or "I do not give". Nothing is pre-selected.

### 1.1 Introduction consent (required to continue) — `CONSENT-INTRO-v2`

> **Your call with an adviser**
>
> SortMyCover is a service of Lead Velocity (Pty) Ltd. If you fit our criteria, we will introduce you to **{{client_full_name}}** of **{{practice_name}}**, an authorised financial services provider (**FSP {{fsp_number}}**).
>
> ( ) **I give my consent** for Lead Velocity to use my details to check whether a call fits me, to book and remind me about that call by WhatsApp, and to share my details with {{client_full_name}} of {{practice_name}} (FSP {{fsp_number}}), who may contact me by WhatsApp, phone call, SMS or email about my insurance and financial planning enquiry.
>
> ( ) **I do not give my consent.**
>
> You can withdraw at any time by replying STOP. [How we use your details](https://sortmycover.co.za/privacy)

If "I do not give" is chosen, the form shows: "No problem. We won't contact you or keep your details." Nothing is stored except what the law needs (none, for an unsent form).

### 1.2 Marketing-optimisation consent (optional, separate) — `CONSENT-OPTIMISE-v1`

Shown below 1.1 as its own question. The Consumer can send the form whichever option they pick. It feeds purpose 3 in the privacy notice and agreement clause 13.2(c) only when "I give" is chosen.

> **Optional: helping us improve our ads**
>
> ( ) **I give my consent** for SortMyCover to share my mobile number in coded (hashed) form with Meta (Facebook and Instagram) so we can measure our ads, show our ads to people like me, and show me SortMyCover ads. This is not needed for your call.
>
> ( ) **I do not give my consent.**

### 1.3 Line under every form — `FOOTER-v2`

> SortMyCover is a service of Lead Velocity (Pty) Ltd. We introduce you to authorised financial services providers. We are not a financial services provider. We do not give financial advice, compare products or quote premiums. You must be 18 or older.

### 1.4 Qualifying questions (neutral wording)

The two qualifying questions are asked as neutral self-declarations. The budget answer is never repeated back to the Consumer as a price (agreement clause 3.8; research-memo.md R6).

> How old are you? · Under 35 · 35 to 44 · 45 to 50 · 51 or older
>
> Roughly what monthly budget could you set aside for life cover? · Under R750 · R750 to R1,499 · R1,500 or more

Only "35 to 44" and "45 to 50" meet the age criterion. For budget, only "Under R750" fails: R750 to R1,499 and R1,500 or more both meet Schedule 2 (R750 or more). Campaigns are aimed at people who choose R1,500 or more (agreement clause 5.6), but that is a targeting aim, not a requirement. Always say "budget for cover", never "premium": Lead Velocity does not discuss premiums (FAIS; agreement clause 3.2).

### 1.5 Click-to-WhatsApp version (before any question) — `CTWA-NAMED-v2`

> Hi, this is SortMyCover, a service of Lead Velocity (Pty) Ltd. If a call fits you, we'll introduce you to {{client_full_name}} of {{practice_name}}, an authorised financial services provider (FSP {{fsp_number}}), who may contact you by WhatsApp, call, SMS or email about insurance and financial planning. We'll also book and remind you about the call here. OK to continue?
>
> Buttons: `I give consent` · `I do not give consent`

Then, as a separate message:

> Optional: may we share your number in coded (hashed) form with Meta to measure and improve our ads? This isn't needed for your call.
>
> Buttons: `Yes` · `No`
>
> Reply STOP at any time. How we use your details: sortmycover.co.za/privacy

### 1.6 Meta instant form (Lead Ads)

Use 1.1 as the custom consent question and 1.2 as a separate optional question, with the privacy notice URL. Neither may be pre-selected.

---

## Part 2 — Privacy notice (sortmycover.co.za/privacy) — `PN-v2`

**SortMyCover privacy notice** · Last updated [DATE] · Version PN-v2

**Who we are.** SortMyCover is a service of Lead Velocity (Pty) Ltd (registration [LV REG NO]), 210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria, 0184. We are the responsible party for the details you give us under the Protection of Personal Information Act (POPIA). We are not a financial services provider and we do not give financial advice, compare products or quote premiums.

**What we collect.** Your name, mobile number, age band, budget band, the call time and method you choose, and your messages with us. Your email address only if you choose a Teams, Zoom or Meet call (for the invite). Automatically: the ad or link you came from, and device and cookie data (see our Cookie Notice). We do not ask for your ID number, bank details, health details or exact income. If you send us health or ID details in chat, we remove them.

**Why we use your details — three purposes.**

| # | Purpose | What we use | When |
|---|---|---|---|
| 1 | **Introduce you to the adviser you agreed to**, and book and remind you about your call by WhatsApp | Name, number, age and budget bands, call time and method, any question for the adviser | When you give consent 1.1 |
| 2 | **Keep a record of your consent and where your enquiry came from**, for audits, disputes and regulators | The consent text you saw, the time, the ad or campaign you clicked, tracking (UTM) data, your form submission and our message log | Always, when you send the form |
| 3 | **Improve our ads**, including showing our ads to people like you and showing you our ads | Coded (hashed) mobile number, ad and page events (never your email) | Only if you gave the optional consent 1.2 |

**Who we share with.**
- **The adviser named when you agreed.** Once they receive your details, the adviser is a separate responsible party and is responsible for how they use them and for any advice they give you. We never give the same enquiry to another adviser, and we never sell your details.
- **Our service providers**, only to provide their service to us: Meta (WhatsApp, Facebook, Instagram), [HOSTING PROVIDER], [DATABASE PROVIDER], [AI PROVIDER FOR THE WHATSAPP ASSISTANT], Microsoft and Google (calendars and video calls). Some of them process data outside South Africa. We only use providers bound by law or a written agreement to protect your details to a standard like POPIA (POPIA s72).

**How long we keep it.** Your details and messages: [12] months after our last contact with you. Consent and origin records (purpose 2): [5] years. If you say no or reply STOP, we keep a coded copy of your number on our block list so we never message you again.

**Our WhatsApp assistant.** It uses AI to help you book and move your call. It only handles logistics and never gives advice. Questions about cover or cost go to your adviser on the call. Reply PERSON to reach a human.

**Your rights.** You may ask what details we hold and get a copy, ask us to correct or delete them, object to how we use them, and withdraw consent at any time. We reply within [30] days. If you ask us to delete your details, we tell the adviser. We may keep our consent and origin records (purpose 2) as evidence where the law allows.

**Stopping messages.** Reply **STOP** to any WhatsApp, or email howzit@leadvelocity.co.za. We stop at once and tell the adviser within 2 business days. You can also register on the National Consumer Commission's opt-out registry; we check it before we first contact you.

**Complaints.** Email howzit@leadvelocity.co.za. Complaints about advice go to the adviser's own complaints process and then the FAIS Ombud. You may also complain to the Information Regulator: [INFORMATION REGULATOR CONTACT — CONFIRM].

**Information Officer.** Jonathan West, howzit@leadvelocity.co.za.

---

## Part 3 — Direct marketing and POPIA s69 handling (internal rules, not published)

| # | Rule | Source |
|---|---|---|
| 1 | Consent is asked once, Form 4 style, with the service and channels named and "I give / I do not give" options, none pre-selected. A Consumer who said "I do not give" is never asked again. | POPIA s69(2); Regulation 6 and Form 4 |
| 2 | Before the first message, the number is checked against the NCC opt-out registry and our own suppression list. A registered block wins over consent. A lead later found blocked does not count as Delivered (agreement clause 13.5). | CPA s11; research-memo.md R12 |
| 3 | Every message names SortMyCover / Lead Velocity as sender and gives STOP. | POPIA s69(4) |
| 4 | STOP, "no", or any objection: stop at once, add to suppression list, tell the Client within 2 Business Days (agreement clause 13.4). | POPIA s11(3), s69 |
| 5 | Purpose 3 (ads) uses only Consumers who gave consent 1.2. | POPIA s13, s15; research-memo.md R5 |
| 6 | Consent text, version, time stamp and source are kept as Origin Records for [5] years; the Client cannot require their deletion (agreement clause 13.3). | POPIA s11(2)(a), s14(1) |
| 7 | The Client's consent covers contact about this insurance and financial planning enquiry only. Any other marketing by the Client needs its own basis (agreement clause 13.5). | POPIA s69 |
| 8 | Messages are logistics only: no product, benefit, insurer or price content (agreement clause 3.8). | FAIS s1; research-memo.md R6 |

---

## Part 4 — First WhatsApp message: broker disclosure — `WA-INTRO-v2`

Sent within 60 seconds of the booking being confirmed. Image header: the Client's Intro Card (name, practice, "Authorised financial services provider · FSP {{fsp_number}}", photo, 2-line bio). Message ID and delivery status are stored as disclosure evidence.

> Hi {{first_name}}, this is SortMyCover, a service of Lead Velocity (Pty) Ltd.
>
> As you agreed, we have passed your details to **{{client_full_name}}** of **{{practice_name}}**, an authorised financial services provider (**FSP {{fsp_number}}**).
>
> SortMyCover and Lead Velocity are **not** financial services providers and **do not give financial advice**. {{client_first_name}} will answer any questions about cover on your call.
>
> Your call: **{{date}} at {{time}}** by {{method}}. {{join_link_if_any}}
>
> Reply STOP to opt out.
>
> Buttons: `I'll be there` · `Reschedule` · `Cancel`

Tapping `I'll be there` (or a written "yes") is the attendance confirmation that makes the lead Delivered (agreement clause 5.2, Schedule 2 criterion 5).

### 4.1 Reminder (logistics only) — `WA-REMIND-v1`

> Hi {{first_name}}, a reminder from SortMyCover: your call with {{client_full_name}} ({{practice_name}}, FSP {{fsp_number}}) is at **{{time}}** today by {{method}}. {{join_link_if_any}} Need a new time? Tap Reschedule. Reply STOP to opt out.
>
> Buttons: `On my way` · `Reschedule`

The last reminder goes no later than 10 minutes before the start time (agreement clause 5.4).

### 4.2 Deferral line for product, cost or advice questions — `WA-DEFER-v1`

> Good question. {{client_first_name}} is the licensed adviser and will answer it on your call. We only help with booking.

---

## Part 5 — What changed from CP-v0.1 (`../consent-and-privacy.md`)

| # | CP-v0.1 | CP-v0.2 (this file) | Why |
|---|---|---|---|
| 1 | One tick covered both the introduction and hashed ad measurement (CONSENT-NAMED-v1 + CONSENT-ADS-v1 "inside the same tick") | Two separate questions: required introduction consent (1.1) and **optional** ad consent (1.2) | Unbundled, specific consent for lookalike and retargeting use (research-memo.md R5; coordinator instruction) |
| 2 | Single checkbox "I agree…" | Form 4 style "I give / I do not give", nothing pre-selected | POPIA Regulation 6, Form 4; Guidance Note 7.2.5 |
| 3 | Named consent showed practice and FSP number only | Also names the individual adviser ({{client_full_name}}) and the channels (WhatsApp, call, SMS, email) | s69 consent should name the service and channels; brief asks for broker name, practice and FSP number |
| 4 | First WhatsApp (`broker_intro_booked`) named the practice but did not say SortMyCover is not an FSP | Adds "SortMyCover and Lead Velocity are not financial services providers and do not give financial advice" and the sender line | Brief requirement; FAIS firewall (agreement clause 3.8) |
| 5 | Privacy notice disclosed adviser feedback (1-5 rating, notes, transcribed voice notes) used for ads and replacements | Removed. Feedback is limited to attendance and contactability (agreement clauses 8.4 and 14.3(c)) | Raspberry [29b] issue-reporting indicator (research-memo.md R8). Conflicts with MASTER-PROMPT 0.1 "Broker feedback"; see open-items.md |
| 6 | Purposes listed in an 8-row table | Three purposes, matching agreement clause 13.2 | Brief: privacy notice covers the three purposes |
| 7 | Budget bands Less than R750 / R750–R1,250 / More than R1,250 ("R750–R1,250 or R1,250+ both qualify") | Bands Under R750 / R750–R1,499 / R1,500 or more; R750 or more qualifies; Campaigns target R1,500 or more | Jonathan's decision, 5 Oct 2026 (open-items.md D5, resolved). Same qualifying rule as 0.1; the band edges moved to show the R1,500 target |
| 8 | Website Terms (Part 3) and Cookie Notice (Part 4) | Not repeated; CP-v0.1 versions (TU-v1.0 in consumer-terms.md, CN-v1.1) still apply | Out of scope for this brief. The Cookie Notice's "Pixel on at load" default (open question Q9) should be rechecked against the new optional consent 1.2 |
| 9 | Consent scope "life cover" | 7 Oct 2026 amendment: "insurance and financial planning" in 1.1, 1.5 and Part 3 rule 7 | Consent v3 (Jonathan, 7 Oct 2026): people can ask about funeral, retirement, investments and disability too; matches LGSA-v0.2 clauses 12.3 and 13.5 and CP-v0.3 |
