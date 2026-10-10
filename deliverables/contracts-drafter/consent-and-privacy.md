# DRAFT — for practitioner review

# Consumer consent, Privacy Notice, Website Terms, Cookie Notice and WhatsApp disclosure texts — SortMyCover

Version: CP-v0.3 (7 October 2026) · Replaces CP-v0.1 · Owner: contracts-drafter (wording) · compliance-qa (checks) · landing-page-builder / automation-engineer (implement)

> **Why v0.3 and not v0.2.** The number CP-v0.2 is already used by `lead-generation-agreement/consent-and-privacy.md` (5 October 2026). That file proposes a Form 4 layout for the Lead Generation Services Agreement pack. None of its texts is live. This file is the source for every text consumers see today. CP-v0.2's proposals stay open for the practitioner (change log, open question 6).

All texts in this file must stay word-for-word the same wherever they are shown. Each consent text has a version ID. The system stores the version ID **and** the full text shown, with timestamp, page URL (or chat ID), source, `consent_mode` and `broker_id`, on every lead.

**Scope (consent v3, Jonathan, 7 October 2026).** Every consent text and notice says the adviser may contact the person about **insurance and financial planning**, not only life cover. People can ask about life cover, funeral cover, retirement, investments, disability or paying too much. Those reason tick-boxes are product options, not the scope of the consent. We never give advice. Calls are booked for a time the person chooses, never on the spot. Sources: `landing/config/consent.json`, `automation/ctwa/w03.js`, LGSA-v0.2 clauses 12.3 and 13.5.

---

## Part 1 — Consent wording

### 1.1 Which mode is live

| `consent_mode` | Status | When used |
|---|---|---|
| **`named`** | **Live default** (0.1: named while there is one broker) | Every form, instant form and chat from day one |
| `generic` | Held. Switch on only after the practitioner opinion approves it in writing | Later, when several brokers share the funnel |

The checkbox is **never ticked by default**. A privacy notice link sits right next to it.

### 1.2 Named consent (live default) — `CONSENT-NAMED-v3`

> ☐ I agree that SortMyCover may share my details with {practice_name} (FSP {fsp_number}), an authorised financial services provider, who may contact me by WhatsApp or phone about insurance and financial planning. I can opt out at any time by replying STOP.

Rendered from the `brokers` row (`landing/config/consent.json`, `named`). If `practice_name` or `fsp_number` is empty, the page must not render (fail closed).

Version history. Leads keep the version they saw, so the old texts stay here as evidence:

| Version | What changed | Decided |
|---|---|---|
| `CONSENT-NAMED-v1` | "I agree that Lead Velocity may share my details with … about life cover. I can opt out at any time by replying STOP." (master prompt 2.1.2, STOP sentence added) | CP-v0.1 |
| `CONSENT-NAMED-v2` | "Lead Velocity" became "SortMyCover". The privacy notice linked beside the tick names the company and its address (POPIA s18) | Jonathan, 5 Oct 2026 |
| `CONSENT-NAMED-v3` | "about life cover" became "about insurance and financial planning" | Jonathan, 7 Oct 2026 |

### 1.3 Generic consent (held) — `CONSENT-GENERIC-v3`

> ☐ I agree that SortMyCover may share my details with an authorised financial services provider (FSP), who may contact me by WhatsApp or phone about insurance and financial planning. I can opt out at any time by replying STOP.

Same history as 1.2: v1 named Lead Velocity and said "life cover"; v2 says SortMyCover; v3 widens the scope.

### 1.4 Advertising-improvement sentence — `CONSENT-ADS-v1` (unchanged)

Rendered as the **second sentence of the checkbox label**, inside the same tick, in both modes. It is its own sentence so the FSP-sharing purpose and the advertising purpose stay separate (4.4a compliance note), but the one tick covers it (compliance-qa phase0-review-1, fix 4). W01 stores `consent_ads_at` when the box is ticked.

> We also use your details in coded (hashed) form to measure and improve our ads on Facebook and Instagram. We never use them to send you ads by message. [Privacy notice](https://sortmycover.co.za/privacy)

LGSA-v0.2 clause 13.2(c) describes this purpose as needing a "separate, optional" consent. The live form covers it with the same tick. See open question 6.

### 1.5 Line under every form — `DISC-FULL-v2`

> SortMyCover gives no financial advice, product comparisons or premium quotes. Licensed financial advisers do.

This replaces `CONSENT-FOOTER-v1` on every consumer surface (brand decision, 5 Oct 2026; `deliverables/brand-naming-lead/disclosure-wording.md` v2; `consent.json` `footer_line`). The company is named in the privacy notice and the terms (POPIA s18), and in the named WhatsApp consent (1.6). `CONSENT-FOOTER-v1` is kept here for the evidence trail only:

> SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.

### 1.6 Click-to-WhatsApp consent (in chat, before any question) — W03

**Named (live) — `CTWA-NAMED-v3`** (`automation/ctwa/w03.js`):

> Before we start: if it's a fit, we'll share your details with {practice_name} (FSP {fsp_number}), an authorised financial services provider who'll contact you about insurance and financial planning. OK to continue?
>
> Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy
>
> Buttons: `Yes, continue` · `No thanks`

**Generic (held) — `CTWA-GENERIC-v3`:**

> Before we start: if it's a fit, we'll share your details with an authorised financial services provider who'll contact you about insurance and financial planning. OK to continue?
>
> Buttons: `Yes, continue` · `No thanks`

*Drafting note: before generic goes live, add the same responsible-party line as the named version, so both records are equal evidence. The live WhatsApp texts no longer carry the CP-v0.1 ads sentence. Whether this consent covers ad measurement is NH-60 (open question 7).*

`No thanks` → polite close. Nothing is stored except a hashed number for suppression.

Version history. Leads keep the version ID W03 stored with their consent, so the old texts stay here as evidence (source: git history of `automation/ctwa/w03.js`):

| Version | Text | In use |
|---|---|---|
| `CTWA-GENERIC-v1`, `CTWA-NAMED-v1` | CP-v0.1 drafts: "about life cover", plus the ads sentence "We also use your details in coded (hashed) form to measure and improve our ads; never to message you ads." and a second line "You can reply STOP at any time. How we use your details: sortmycover.co.za/privacy" | Never built into W03. No lead carries these IDs |
| `ctwa-v1` (generic, held) | "Before we start: if it's a fit, we'll share your details with an authorised financial services provider who'll contact you about life cover. OK to continue?" No ads sentence, no second line | W03 code until 7 Oct 2026 |
| `ctwa-named-v1` | "Before we start: if it's a fit, we'll share your details with {practice_name} (FSP {fsp_number}), an authorised financial services provider who'll contact you about life cover. OK to continue?" | W03 code on 2 Oct 2026 only, replaced the same day by v2 |
| `ctwa-named-v2` | The `ctwa-named-v1` text plus the line "Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy" (compliance-qa review 4 §2a) | W03 from 2 Oct until 7 Oct 2026 |
| `ctwa-named-v3`, `ctwa-generic-v3` | "about life cover" became "about insurance and financial planning" (texts above) | Jonathan, 7 Oct 2026 (live) |

### 1.7 Meta instant form (Lead Ads)

Custom consent checkbox, required and unticked: 1.2 followed by 1.4 (without the link) as one tick, version `CONSENT-NAMED-v3 + CONSENT-ADS-v1`. Custom disclaimer body: 1.5 plus "Privacy notice: sortmycover.co.za/privacy". Source: `deliverables/media-buyer/instant-form-spec.json`. A wording change means a new form version. Never edit a live form.

### 1.8 Smoker status (special personal information) — `SMOKER-Q-v1` (new)

Asked in the WhatsApp capture Flow v2 (screen 8, after the budget question). Optional:

> Do you smoke? (Optional — used only to brief your adviser {broker_first_name} before the call.)
>
> Options: `No` · `Yes` · `Prefer not to say`

Rules:
1. Optional, and nothing is pre-selected. Skipping it changes nothing. The answer is never used to qualify, tier or route a lead.
2. The exact wording shown (with the adviser's name filled in) and the time answered are stored with the lead (`smoker_question_text`, `smoker_answered_at`). This is the evidence of express consent (POPIA s26 and s27(1)(a); LGSA-v0.2 clause 13.2A). The system stores the full wording, not this ID.
3. Used only in the pre-call brief to the adviser named in the question. Never sent to Meta (CAPI, Pixel or custom data). Never used for ads or audiences (`NEVER_TO_META` in `automation/ctwa/capture-v2.js`).
4. Never passed to any other adviser. If a lead is re-offered (1.9), the new adviser does not get the answer unless the person answers again with that adviser named.
5. Withdrawal: replying STOP, or telling us, withdraws it. We then stop using the answer and delete it. The question and the time stay with the consent record as evidence.
6. Retention: Part 2, "How long we keep it".

### 1.9 Re-offer consent for a tier B lead (named mode) — `CTWA-REOFFER-v1` (new, not built yet)

A tier B lead (stated budget R750 to R1,499 a month; under R750 is filtered out, LGSA-v0.2 clause 5.6) is offered first to the adviser named in the consent. That adviser accepts or declines (LGSA-v0.2 clause 5.7). If the adviser declines, or lets the offer lapse, the lead may go to another adviser only with fresh consent that names them. `decideOffer` in `automation/ctwa/capture-v2.js` already has a `reconsent` step. This is its wording:

> Thanks for waiting, {first_name}. {previous_practice_name} can't take your enquiry right now. May we pass your details to {practice_name} (FSP {fsp_number}), another authorised financial services provider, who'll contact you about insurance and financial planning?
>
> Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy
>
> Buttons: `Yes, pass them on` · `No thanks`

Rules:
1. Named mode only. Rendered from the new broker's `brokers` row. Fail closed if `practice_name` or `fsp_number` is empty. Logistics only: no budget, price or product words.
2. `Yes, pass them on` → a new consent record (version `CTWA-REOFFER-v1`, full text, time, `broker_id`). Then the offer goes to that adviser to accept or decline. The smoker answer is not passed on (1.8 rule 4).
3. `No thanks` → reply "No problem. We won't pass your details on." Nothing is shared. The enquiry is closed, and its details are deleted on the dates in Part 2.
4. No reply → nothing is shared and the enquiry stays held.
5. Never offered again to an adviser who declined it or let the offer lapse.
6. Generic mode (held) asks no fresh consent, because that consent names no single provider. Confirm this with the practitioner before generic goes live (open question 4).

---

## Part 2 — Privacy Notice (published at sortmycover.co.za/privacy)

**Privacy notice — SortMyCover**
Last updated: {{date}} · Version PN-v1.2 · Cookie notice CN-v1.2

*Drafting note (not published). PN-v1.2 is the text now on `landing/holding/privacy.html` and `landing/site/privacy.html` plus six additions. Those pages were updated for capture Flow v2 on 7 Oct but still say "PN-v1.1 · 5 October 2026". The page owner must copy the six additions word for word and then change the label to "PN-v1.2 · Cookie notice CN-v1.2". The additions: (1) "or cover through work" in What we collect (the landing quiz asks `work_cover`); (2) "who may contact you about insurance and financial planning", and the two new purposes, in the "We use your details to" list; (3) "If the adviser does not take your enquiry" and (4) "If the adviser questions your enquiry" in Who we share it with; (5) the longer list of what Meta never gets, in the Meta section; (6) the smoker line in How long we keep it. Before publishing, also do the two things in open questions 2 and 9 (smoker period and W34 jobs).*

### Who is responsible
SortMyCover is a service of **Lead Velocity (Pty) Ltd**, registration number 2025/637858/07, Pegasus Building 1, 210 Amarand Avenue, Menlyn Maine, Pretoria, 0184. We are the **responsible party** for the details you give us. That means we decide how they are used, and we must keep them safe.

We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.

### What we collect and why
- **From you on our page, form or WhatsApp:** your name and surname, WhatsApp number (checked because you chat to us from it), contact number, age band, monthly budget band, the reason(s) you want a call (for example life cover, funeral cover, retirement, investments, disability, or paying too much), whether you have a bond, dependants or cover through work, how you want to meet, and the time you book. Only if you choose to tell us: what you pay now (as a band), your income band, and another email address.
- **Your email:** we send a one-tap code or link to check it, and we use it for your Microsoft Teams invite and call details. We never use it for marketing, and we never send it to Meta.
- **Whether you smoke (only if you choose to answer):** this is special personal information about your health. We ask for it only with your clear consent, and we use it only to brief the adviser named in our message before your call (POPIA sections 26 and 27). You can skip the question, and you can withdraw consent at any time by replying STOP or telling us. We never use it for ads and never send it to Meta.
- **Only if you give it:** another number to call, a backup number, and the best time to reach you.
- **Automatically:** the ad or link you came from, your device type, your IP address and cookies.
- **Your chats** with our WhatsApp assistant.
- **From the adviser, after your call:** how the call went (for example, attended or missed), a 1 to 5 rating of the call and a short note. The adviser may also leave a short voice note. A transcription service turns it into text (we will name it here before adviser voice notes are switched on). We do not keep the recording. We keep only the text, after we remove any health or ID details. We use all of this to improve our ads and our questions, and to settle no-show replacements under our agreement with the adviser.

We do not ask for your ID number, bank details or exact income. If you send health details or an ID number in chat, we remove them from our records. We tell the adviser only that you have a question for them.

We use your details to:
- check that a call with an adviser suits you;
- pass your details to the adviser you agreed to, who may contact you about insurance and financial planning;
- depending on the budget you choose, offer your enquiry to that adviser first, so they can decide whether to take it (see below);
- book your call and send reminders on WhatsApp;
- send a calendar invite (your email, only for the invite);
- reach you on your backup number if your first number fails (only for that);
- keep a record that you agreed, and a list of people who opted out;
- show the adviser that your enquiry met our agreement with them, if they ask (see below);
- measure and improve our ads, using your coded (hashed) number, ad and page events, and the adviser's 1 to 5 rating as a number (see the Pixel section below);
- improve our ads and questions, and settle lead replacements with the adviser, using the adviser's outcome, rating, note and voice-note text.

### Who we share it with
- **One adviser.** One authorised financial services provider gets your details. It is the one named when you agreed, or named in our first WhatsApp to you. That message shows their name, practice and FSP number. From then on the adviser is also responsible for your details. We never sell your details. We never give them to anyone else to market to you.
- **If the adviser does not take your enquiry.** Depending on the budget you choose, we may offer your enquiry to the adviser named when you agreed before we book a call. We send them only your first name, age band, budget band and the reason(s) for your call. If they do not take it, we pass your details to a different adviser only if you say yes to a new message from us that names that adviser. If you say no, we pass your details to no one. If no adviser can take it yet, we tell you, and we keep your enquiry until one can, until you tell us to stop, or until the date under "How long we keep it", whichever comes first.
- **If the adviser questions your enquiry.** If the adviser asks us to show that your enquiry met our agreement with them, we may send them your consent record (the words you agreed to, and when), your booking confirmation and your own answers. We remove any health or ID details you did not agree to share with them.
- **Service providers who work for us.** They may use your details only to give us their service.

| Provider | What they do for us | Where data may go |
|---|---|---|
| Vercel | Hosts our website pages (it sees your IP address and browser details when you load a page; your form answers go to our booking system, not Vercel) | United States, served from a global network |
| Hostinger | Hosts our booking and messaging systems | To be confirmed before our booking system opens |
| Supabase | Holds our database | Ireland (EU) |
| Meta (WhatsApp, Facebook, Instagram) | Sends our WhatsApp messages. Runs our ads. Measures our ads. We send your coded (hashed) number, your IP address and browser type as they are, and, after a call, the adviser's 1 to 5 rating as a number. We never send your email, the adviser's note, or what was said. | United States and Ireland |
| Transcription service (named here before adviser voice notes are switched on) | Turns the adviser's voice note about your call into text. We do not keep the recording. | Named with the service |
| Anthropic | The AI model that helps our WhatsApp assistant reply | United States |
| Google | Calendar and video calls for some advisers, and website tools | United States and other countries where Google operates |
| Microsoft | Email, calendars and Teams | South Africa and other Microsoft regions |
| Twilio | Checks that a number is a mobile. Sends SMS backup. | United States |
| Paystack | Takes payments from advisers (not from you) | South Africa and other countries where Paystack operates |

Some of these providers may keep data outside South Africa. When that happens, we only use providers that are bound by law or by a written agreement to protect it to a standard like POPIA. Section 72 of POPIA asks for this.

*Drafting note: the landing pages can load a Cloudflare Turnstile check, but only when a site key is set (none is set today). Before a site key is set, add Cloudflare to this table, because it sees the visitor's IP address and browser details.*

### Meta Pixel and ad measurement
Our website uses the Meta Pixel. Our systems also use Meta's Conversions API. They tell Meta when someone views our page, sends the form or books a call.

The Pixel sets two cookies, `_fbp` and `_fbc`. They last about 90 days. We also keep the ad link you came from in your browser, so your enquiry keeps its source.

Before we send your number to Meta, we code (hash) it. Meta can match it but cannot read it. We never send Meta your email, your smoker answer, your income band or what you pay now. We also send your IP address and browser type as they are. After a call, we send the adviser's 1 to 5 rating of the meeting as a number. We never send what was said.

We use this to measure our ads, to stop showing ads to people who already talk to us, and to find similar people. We never use your details to send you ads by message.

You can turn off ad measurement for this browser. See the control below.

### Our own page counts
We also count visits ourselves, on our own server, with no outside tool. When a page opens, and when someone reaches a step of the quiz, the page sends us one small note: the page name, the step number and a random code. We add it to a daily total and keep no copy of the note. We do not store your IP address, browser type, answers or any detail that names you. The random code lives in your browser's session storage and is gone when you close the tab. We do not send these counts when your browser says Do Not Track or Global Privacy Control, or when you have turned ad measurement off below.

### Cookies and browser storage, and how to opt out
The Cookie Notice (Part 4, CN-v1.2) is published here, in this notice, with the off switch.

### Stop messages
You can stop us contacting you at any time. Reply **STOP** to any WhatsApp, or email hello@sortmycover.co.za with the word STOP. We stop at once and tell the adviser. You can also join the National Consumer Commission opt-out registry. We check our records against it every month. A registered block always wins, even if you agreed before.

### How long we keep it
Our system deletes records on these dates every night.
- Your details, messages, booking and the adviser's feedback about your call: **12 months after our last contact with you**. Then we delete them.
- Your email (only if you gave it for a video call): deleted with your other details.
- Whether you smoke (only if you answered): **deleted {{retention_smoker_days}} days after your call**, or after we close your enquiry if no call is booked. We keep the question you saw and when you answered, with your consent record, as proof that you agreed.
- Voice notes from the adviser: we do not keep the recording. We keep the text with your other details.
- Answers in a WhatsApp chat you did not finish: **deleted after 72 hours**.
- Form entries that do not fit our criteria: **deleted within 24 hours**.
- Your consent record and any opt-out: **5 years**, as proof.
- If you say "No thanks" or STOP: we keep a coded (hashed) copy of your number on our block list, so we never message you again. We delete your other details on the dates above.
- Backups: overwritten every 30 days.

*Drafting note: the 12-month, 72-hour, 24-hour, 5-year and 30-day periods are the ones already set (W34 defaults, published on the page; practitioner brief Q11). **Smoker status: [CONFIRM with practitioner]. No period is set yet; keep it to the minimum.** LGSA-v0.2 Schedule 4 S4.6(d) suggests [30] days after the appointment, also marked for review. Do not publish this line until {{retention_smoker_days}} is confirmed and W34 deletes the answer (open questions 2 and 9).*

### Automated checks and our AI assistant
Our system checks your answers against fixed criteria (age band and budget band). If they do not fit, we close politely and do not pass your details on. You can ask a person to look again. Reply **PERSON** on WhatsApp, or email hello@sortmycover.co.za.

Our WhatsApp assistant uses AI. It can answer questions about the call and help you book. It never gives advice. Type "person" at any time to reach a human.

### Your rights
You may:
- ask what details we hold about you, and get a copy;
- ask us to correct or delete them;
- object to how we use them;
- take back your consent at any time;
- complain to the Information Regulator.

We answer within **30 days**. We may ask you to prove who you are first. If you ask us to delete your details, we also tell the adviser. The adviser must delete them unless a law says they must keep a record.

### Information Officer and contact
Information Officer: Jonathan West · Deputy Information Officer: Kgomotso Pule · Email: hello@sortmycover.co.za · Phone: +27 10 976 5618 · Postal address: Pegasus Building 1, 210 Amarand Avenue, Menlyn Maine, Pretoria, 0184

### Complaints
- Email hello@sortmycover.co.za, or send **COMPLAINT** on our WhatsApp. We reply within **48 hours**.
- Complaints about an adviser's advice go to the adviser's own complaints process. If it is not solved, you can go to the FAIS Ombud.
- You can also complain to the **Information Regulator**: inforegulator.org.za, complaints.IR@inforegulator.org.za.

### Age and changes
Our service is for people 18 and older. If we change this notice, we change the date at the top. For big changes, we also say so on our page.

---

## Part 3 — Website Terms (sortmycover.co.za/terms)

*Superseded by **TU-v1.0** in `consumer-terms.md` (published at `landing/holding/terms.html`). WT-v1 is kept below for the evidence trail only; do not publish it. Its "life cover" wording is historical and is not changed.*

**Website Terms — SortMyCover** · Version WT-v1 · {{date}}

1. **Who we are.** SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect people with authorised financial services providers. We do not give financial advice, compare products or quote premiums.
2. **What this site is.** General information about life cover and what a call with a licensed adviser involves. It is not advice. Only a licensed adviser can tell you what fits you.
3. **It's free for you.** There is no charge and no obligation to buy anything.
4. **How we make money.** Advisers pay us a flat fee per 30-day cycle to run our service. The fee is the same whether or not you buy anything. We earn nothing from any policy.
5. **Who you'll talk to.** When you agree, your details go to one adviser. Their name, practice and FSP number are in your first WhatsApp from us. The adviser is responsible for any advice they give.
6. **Your details.** Our Privacy Notice explains how we use them.
7. **Using the site.** Please don't misuse the site, send false details, or enter someone else's number.
8. **Accuracy.** We try to keep the information correct and up to date. Figures on this site are general examples, not quotes.
9. **Links.** We are not responsible for other websites we link to.
10. **Responsibility.** We are not liable for decisions you make about cover. Nothing in these terms limits your rights under the Consumer Protection Act or POPIA.
11. **Law.** South African law applies.
12. **Contact.** howzit@leadvelocity.co.za, or send COMPLAINT on our WhatsApp.

---

## Part 4 — Cookie Notice (published inside the Privacy Notice; the off switch is at sortmycover.co.za/privacy#opt-out)

**Cookie Notice — SortMyCover** · Version CN-v1.2

Cookies are small files a website keeps in your browser. We also keep a few small notes in your browser's own storage. This table covers both.

| Name | Set by | Why | How long |
|---|---|---|---|
| `_fbp` | Meta Pixel | Measures which ads bring visitors | About 90 days |
| `_fbc` | Meta Pixel, when you click an ad | Links your visit to the ad you clicked | About 90 days |
| Ad source (`utm_*`, `fbclid`) | SortMyCover, in your browser | Remembers which ad or link you came from, so your enquiry keeps its source | Until you send the form or clear your browser |
| `smc_ads_off` | SortMyCover, in your browser | Remembers that you turned ad measurement off | Until you turn it back on or clear your browser |
| Session data (includes a random visit code, `smc_sid`) | SortMyCover | Keeps the form and booking working, and lets us count a visit once | Until you close the page |

**Ad measurement is on when you arrive.** The Meta Pixel starts when the page loads. We tell you here and in this notice. We do not show a cookie pop-up. You can turn it off at any time with the control below.

**How to opt out.** Controls on the page: **Turn off ad measurement for this browser** · **Turn it back on**. This control needs JavaScript. You can also block cookies in your browser settings, or email hello@sortmycover.co.za.

When it is off, the Meta Pixel does not run, and no new Meta cookies are set. The site still works. Meta cookies already in your browser stay until they expire, unless you clear them. You can also block cookies in your browser settings. The choice is saved only in this browser. If you clear your browser data or use another browser, you need to choose again.

*Implementation note (not published): the off switch calls `smc.adsOff()` in `landing/shared/pixel.js`, which saves `smc_ads_off = 1` in local/session storage; `smc.adsOn()` removes it. `consent()` returns false when `smc_ads_off = 1` or `window.SMC_CONSENT_ANALYTICS === false`, and `fire()` then sends nothing to Meta. Ad-source values are still kept first-party for the lead record. There is no banner. **Open practitioner question (brief Q9): may the Pixel run on page load by default (notice + off switch), or must it wait for an opt-in?** If the practitioner says opt-in, flip the default (no Pixel until `adsOn()`), add a one-line banner, and bump to CN-v2.*

---

## Part 5 — WhatsApp disclosure texts (live templates, `automation/templates/`)

These are the first message every routed lead gets (< 60 s). The image header is the broker's intro card. Message ID and delivery status are stored as disclosure evidence. The texts below are the approved template bodies, word for word ({{n}} variables shown by name).

**`broker_intro_booked`** (tier A, booked in the Flow)
> Hi {{first_name}}, thanks for your insurance and financial planning enquiry. Your details have been passed to **{{practice_name}} (FSP {{fsp_number}})**, an authorised financial services provider. **{{adviser_name}}** will be your adviser for your {{method}} call on **{{date}} at {{time}}**. Our WhatsApp assistant uses AI. Reply STOP to opt out.
> Buttons: `Add to calendar` · `Reschedule` · `Cancel`

**`broker_intro_slots`**
> Hi {{first_name}}, thanks for your insurance and financial planning enquiry. Your details have been passed to **{{practice_name}} (FSP {{fsp_number}})**, an authorised financial services provider. **{{adviser_name}}** can do a 30-minute call. Pick a time below.
> 1. {{slot_1}}
> 2. {{slot_2}}
> 3. {{slot_3}}
> Our WhatsApp assistant uses AI. Reply STOP to opt out.
> Buttons: `Time 1` · `Time 2` · `Time 3` · `Other times`

**`broker_intro_slots_v2`** (tier B after the adviser accepts; the button opens the booking Flow)
> Hi {{first_name}}, thanks for your insurance and financial planning enquiry. Your details have been passed to **{{practice_name}} (FSP {{fsp_number}})**, an authorised financial services provider. **{{adviser_name}}** can do a 30-minute call. Pick a time below. Our WhatsApp assistant uses AI. Reply STOP to opt out.
> Button: `Pick a time`

**Tier B lines to the lead (logistics only, `automation/ctwa/capture-v2.js`):**
> Thanks {first_name}. We're matching you with an authorised adviser now. We'll message you here shortly so you can pick a time.

> Thanks for your patience, {first_name}. All our advisers are fully booked right now. We'll message you here as soon as one is free.

*Drafting note: the second line is also sent when every adviser declined, not only when diaries are full. "Fully booked" may then be untrue (CPA s41). Suggested: "Thanks for your patience, {first_name}. No adviser is free to take your enquiry right now. We'll message you here as soon as one is." Owner: automation-engineer (the copy is tested against `whatsapp-capture-flow-v2.md`).*

**Intro card strip — `DISC-CARD-v2`:** "Introduced by SortMyCover. SortMyCover gives no financial advice, product comparisons or premium quotes." (Contracts-drafter sign-off still open: disclosure-wording M6.)

*Drafting note: LGSA-v0.2 S4.5 and clause 4.1(d) said the card names Lead Velocity and says it is not an FSP; the consumer brand rule keeps Lead Velocity off the card. Both now say the card states "that SortMyCover gives no financial advice, product comparisons or premium quotes" (`DISC-CARD-v2`), in `lead-velocity-services-agreement-v2.md` and the regenerated sources (10 Oct 2026). The .docx copies are not rebuilt yet. Open question 13.*

**Brand disclosure line — `DISC-FULL-v2`** (footer, About, consent area, Page/IG About) and **`DISC-WA-DESC-v2`** (WhatsApp Business profile Description; text owned by `disclosure-wording.md`, not repeated here). Owned by `deliverables/brand-naming-lead/disclosure-wording.md`.

---

## Part 6 — Consistency check (every text says the same thing)

| Fact | Consent | Privacy | Terms | Cookie | WhatsApp |
|---|---|---|---|---|---|
| Scope: insurance and financial planning (v3) | ✓ (1.2, 1.3, 1.6, 1.9) | ✓ (PN-v1.2) | TU-v1.0 names no product, so no change | — | ✓ (Part 5) |
| Lead Velocity is responsible party | privacy link beside the tick; CTWA footer line | ✓ | ✓ | — | CTWA footer line |
| Shared with one authorised FSP; a second only with fresh consent | ✓ (1.9) | ✓ | ✗ TU-v1.0 §2 says one adviser; add: "If that adviser cannot take your enquiry, we pass your details to another adviser only if you say yes to a message that names them." (build item 12a) | — | ✓ (named) |
| No advice / comparison / premiums | `DISC-FULL-v2` (1.5) | ✓ | ✓ | — | `DISC-CARD-v2` |
| STOP opt-out | ✓ | ✓ | — | — | ✓ |
| Hashed ad measurement | 1.4 (CTWA: NH-60 open) | ✓ | — | ✓ | — |
| Email only for the invite, checked by link or code, never sent to Meta | — | ✓ | — | — | — |
| Smoker status: optional, express consent, adviser brief only, never to Meta, short retention | 1.8 | ✓ (period open) | — | — | — |
| Tier B offer to the adviser, then accept or decline | 1.9 | ✓ | — | — | Part 5 tier B lines |
| Dispute evidence to the adviser (consent record, booking, own answers) | — | ✓ | — | — | — |
| Adviser feedback + voice-note text disclosed; audio not kept | — | ✓ | — | — | — |
| Pixel on at load, off switch at /privacy#opt-out, no banner (Q9 open) | 1.4 | ✓ | — | ✓ (CN-v1.2) | — |
| Retention periods = W34 values | — | ✓ | — | — | — |
| Complaints hello@ + COMPLAINT, 48 h | — | ✓ | TU-v1.0 | — | — |
| Flat fee, not tied to policies | — | — | TU-v1.0 | — | — |

---

## Change log

**CP-v0.3 — 7 October 2026** (replaces CP-v0.1; numbered past the LGSA-pack CP-v0.2)
1. Scope: consent texts move to v3, "insurance and financial planning" (`CONSENT-NAMED-v3`, `CONSENT-GENERIC-v3`, `CTWA-NAMED-v3`, `CTWA-GENERIC-v3`). The v2 brand change (SortMyCover, not Lead Velocity, in the consent line) is recorded. The form footer is now `DISC-FULL-v2`. The Part 5 templates are the live v3 texts with the AI line.
2. New consent texts: smoker status `SMOKER-Q-v1` (1.8) and the tier B re-offer `CTWA-REOFFER-v1` (1.9, not built yet).
3. Privacy notice PN-v1.1 → PN-v1.2: mirrors the current page (capture Flow v2 data: reasons, optional spend band, name and surname, email checked by link or code, optional other email, contact number, age band, budget band, optional smoker status, optional income band). Adds cover through work, the scope in the purposes, the tier B offer path, dispute evidence to the adviser, what Meta never gets, and a smoker retention line marked [CONFIRM with practitioner].
4. Retention: the periods already set are unchanged (12 months, 72 hours, 24 hours, 5 years, 30-day backups). No smoker period was invented.
5. Cookie Notice CN-v1.1 → CN-v1.2: the session row names `smc_sid` and visit counting; the opt-out wording matches the page. Part 3 (WT-v1) is unchanged and historical.

**Open for the practitioner**
1. Is "insurance and financial planning" specific enough for consent under POPIA s1 and s69 (also LGSA-v0.2 clause 13.5 note)?
2. Smoker status: is it health information under s26; does the in-question line meet s27(1)(a); what is the shortest workable retention period (LGSA S4.6(d) suggests [30] days after the appointment); and may we keep the question and time, without the answer, as consent evidence?
3. Re-offer: does `CTWA-REOFFER-v1` give valid fresh consent for a second provider? Is sending the first-named adviser the lead's first name, bands and reasons for the accept or decline choice within the original named consent? Should a "No thanks" to a re-offer also go on the block list?
4. Generic mode: does one generic consent cover offering the same enquiry to several providers, one after another?
5. Dispute evidence: confirm that sending the consent record, booking confirmation and the lead's own answers to the adviser who received the lead is within the original purpose (POPIA s11(2)(a), s15).
6. Ads consent: LGSA-v0.2 clause 13.2(c) and CP-v0.2 expect a separate, optional ads consent; the live form uses one tick (brief Q8). Adopt CP-v0.2's Form 4 layout, or change 13.2(c)?
7. NH-60: does the WhatsApp consent, which has no ads sentence, cover hashed ad measurement for click-to-WhatsApp leads?
8. Q22 still open: the notice discloses adviser ratings, notes and voice notes, but LGSA-v0.2 clause 8.4 limits feedback to accept or decline and attendance.

**Open for the build (not practitioner)**
9. W34: (a) add a smoker job that clears `smoker` after {{retention_smoker_days}} and keeps `smoker_question_text` and `smoker_answered_at`; (b) capture Flow v2 stores unfinished answers in `leads.capture_state`, which W34 does not purge after 72 hours (it purges `wa_threads` and non-fit leads only), so the 72-hour line is not yet true for the Flow.
10. `decideOffer`: withhold the smoker answer from a re-offered adviser (1.8 rule 4), and wire the `reconsent` step to 1.9.
11. The dispute pack shared with an adviser must contain only the consent record, booking confirmation and the lead's own answers (LGSA clause 7.8). The admin `disputeEvidence()` pack also holds other advisers' offers and attribution data, which must not go to the adviser.
12. Landing pages: copy the six PN-v1.2 additions and relabel "PN-v1.2 · CN-v1.2".

12a. Terms TU-v1.0 §2: add "If that adviser cannot take your enquiry, we pass your details to another adviser only if you say yes to a message that names them." in `consumer-terms.md` §2 and the landing, holding and `terms.html` copies (Part 6).

**Open for the practitioner (added 10 October 2026)**

13. Intro card: LGSA-v0.2 S4.5 and clause 4.1(d) said the card names Lead Velocity and says it is not an FSP; the consumer brand rule keeps Lead Velocity off the card. Both are amended to "…and that SortMyCover gives no financial advice, product comparisons or premium quotes" (`DISC-CARD-v2`). Is that enough on the card, given the privacy notice and terms name Lead Velocity (POPIA s18)?
