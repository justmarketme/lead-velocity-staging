# DRAFT — for practitioner review

# Consumer consent, Privacy Notice, Website Terms, Cookie Notice and WhatsApp disclosure texts — SortMyCover

Version: CP-v0.1 · Owner: contracts-drafter (wording) · compliance-qa (checks) · landing-page-builder / automation-engineer (implement)

All texts in this file must stay word-for-word the same wherever they are shown. Each consent text has a version ID. The system stores the version ID **and** the full text shown, with timestamp, page URL (or chat ID), source, `consent_mode` and `broker_id`, on every lead.

---

## Part 1 — Consent wording

### 1.1 Which mode is live

| `consent_mode` | Status | When used |
|---|---|---|
| **`named`** | **Live default** (0.1: named while there is one broker) | Every form, instant form and chat from day one |
| `generic` | Held. Switch on only after the practitioner opinion approves it in writing | Later, when several brokers share the funnel |

The checkbox is **never ticked by default**. A privacy notice link sits right next to it.

### 1.2 Named consent (live default) — `CONSENT-NAMED-v1`

Base text verbatim from master prompt 2.1.2, with the STOP sentence added for consistency (see needs-human list, NH-CD-04):

> ☐ I agree that Lead Velocity may share my details with {practice_name} (FSP {fsp_number}), an authorised financial services provider, who may contact me by WhatsApp or phone about life cover. I can opt out at any time by replying STOP.

Rendered from the `brokers` row. If `practice_name` or `fsp_number` is empty, the page must not render (fail closed).

### 1.3 Generic consent (held) — `CONSENT-GENERIC-v1`

Verbatim from master prompt 2.1.2:

> ☐ I agree that Lead Velocity may share my details with an authorised financial services provider (FSP), who may contact me by WhatsApp or phone about life cover. I can opt out at any time by replying STOP.

### 1.4 Advertising-improvement sentence — `CONSENT-ADS-v1`

Shown directly under the checkbox, as its own sentence, in both modes (4.4a compliance note). It is not part of the sharing consent above.

> We also use your details in coded (hashed) form to measure and improve our ads on Facebook and Instagram. We never use them to send you ads by message. [Privacy notice](https://sortmycover.co.za/privacy)

### 1.5 Line under every form — `CONSENT-FOOTER-v1`

> SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.

### 1.6 Click-to-WhatsApp consent (in chat, before any question) — 4.6 step 2

**Generic — `CTWA-GENERIC-v1`** (verbatim from 4.6 step 2):

> Before we start: if it's a fit, we'll share your details with an authorised financial services provider who'll contact you about life cover. OK to continue?
> Buttons: `Yes, continue` · `No thanks`

**Named — `CTWA-NAMED-v1`** (live while `consent_mode = named`; see NH-CD-05):

> Before we start: if it's a fit, we'll share your details with {practice_name} (FSP {fsp_number}), an authorised financial services provider, who'll contact you about life cover. OK to continue?
> Buttons: `Yes, continue` · `No thanks`

**Second line, sent with either version:**

> You can reply STOP at any time. How we use your details: sortmycover.co.za/privacy

`No thanks` → polite close. Nothing is stored except a hashed number for suppression.

### 1.7 Meta instant form (Lead Ads)

Use the same text as 1.2 (or 1.3) as the custom consent checkbox, with 1.4 as the custom disclaimer and the privacy notice URL. The checkbox must be optional-to-tick, and unticked by default where Meta allows.

---

## Part 2 — Privacy Notice (published at sortmycover.co.za/privacy)

**Privacy Notice — SortMyCover**
Last updated: {{date}} · Version PN-v1

### Who we are
SortMyCover is a service of **Lead Velocity (Pty) Ltd** (registration {{lv_cipc_number}}), {{lv_address}}. We are the **responsible party** for the details you give us. That means we decide how they are used, and we must protect them under the Protection of Personal Information Act (POPIA).

We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.

### What we collect
- **From you on our page, form or WhatsApp:** first name, mobile number, age band, budget band, whether you have a bond or dependants, how you'd like to meet, and the time you book.
- **Only if you choose a Teams, Zoom or Meet call:** your email address.
- **Only if you give it:** a different number to call you on, a backup number, and the best time to reach you.
- **Automatically:** the ad or link you came from, your device type and IP address, and cookies (see the Cookie Notice).
- **Your messages** with our WhatsApp assistant.

We do **not** ask for your ID number, bank details or exact income. If you send us health details or an ID number in chat, we remove them from our records. We tell the adviser only that you have a question for them.

### Why we use it

| Purpose | What we use |
|---|---|
| Check that a call with an adviser fits you | Age band, budget band, call method |
| Pass your details to the adviser you agreed to | Name, number, bands, booking, your questions |
| Book your call and send reminders on WhatsApp | Name, number, booking time |
| Send a calendar invite | Email — **only for the invite**, never for marketing |
| Reach you if your first number fails | Backup number — **only for this**, never for marketing |
| Measure and improve our ads | Coded (hashed) number and email, ad and page events |
| Keep a record that you agreed, and of opt-outs | Consent text, time, page, suppression list |

### Who we share it with
- **The adviser.** One authorised financial services provider (FSP) gets your details: the one named when you agreed, or named in your first WhatsApp from us. That message shows their name, practice and FSP number. From then on the adviser is also responsible for your details. We never sell your details or give them to anyone else to market to you.
- **Service providers who work for us** (below). They may use your details only to provide their service to us.

### Service providers and data sent outside South Africa

| Provider | What they do for us | Where data may go |
|---|---|---|
| Meta (WhatsApp, Facebook, Instagram) | Messages, ads, ad measurement | {{meta_regions — confirm}} |
| Anthropic | AI that helps our WhatsApp assistant reply | {{anthropic_regions — confirm}} |
| Google | Calendar and video calls (for some advisers), website tools | {{google_regions — confirm}} |
| Microsoft | Email, calendars and Teams | {{microsoft_regions — confirm}} |
| Twilio | Checks that a number is a mobile; SMS backup | {{twilio_regions — confirm}} |
| Paystack | Payments from advisers (not from you) | {{paystack_regions — confirm}} |
| Hostinger | Hosts our website and systems | {{hostinger_region — confirm}} |
| Supabase | Database | {{supabase_region — confirm}} |

When your details go outside South Africa, we only use providers bound by law or a written agreement to protect them to a standard like POPIA, as section 72 requires.

### Facebook and Instagram measurement (Pixel and Conversions API)
Our website uses the **Meta Pixel**. Our systems also use Meta's **Conversions API**. These tell Meta when someone views our page, sends the form or books a call. We code (hash) your number and email before we send them, so Meta can match them but not read them. We use this to measure our ads, to stop showing ads to people already talking to us, and to find similar people. We never use your details to send you ads by message.

### How long we keep it
- Your details and messages: **12 months after our last contact with you**, then deleted.
- Your consent record and opt-out: **5 years**, as evidence.
- Form entries that do not fit our criteria: **deleted within 24 hours**.
- If you say "No thanks" in WhatsApp: we keep only a coded copy of your number so we never message you again.

### Automated checks
Our system checks your answers against fixed criteria (age band, budget band). If they don't fit, we close politely and don't pass your details on. You can ask a person to look again by emailing howzit@leadvelocity.co.za.

### Our AI assistant
Our WhatsApp assistant uses AI. It can answer questions about the call and help you book. It never gives advice. Type "person" at any time to reach a human.

### Your rights
You may:
- ask what details we hold about you, and get a copy;
- ask us to correct or delete them;
- object to us using them;
- withdraw your consent at any time;
- complain to the Information Regulator.

We answer within **30 days**. We may ask you to confirm who you are first. If you ask us to delete your details, we also tell the adviser, who must delete them unless a law requires them to keep a record.

### How to stop messages
- Reply **STOP** to any WhatsApp. We stop at once and tell the adviser.
- You can also register on the National Consumer Commission's opt-out registry. We check our records against it every month. A registered block always wins, even if you agreed before.

### Complaints
- Email **howzit@leadvelocity.co.za**, or send **COMPLAINT** on our WhatsApp. We reply within **48 hours**.
- Complaints about advice from the adviser go to the adviser's own complaints process. If unresolved, you can go to the FAIS Ombud.
- You can also complain to the **Information Regulator**: {{regulator_contact — confirm current address and email}}.

### Information Officer
{{io_name}} (Information Officer) and {{deputy_io_name}} (Deputy), howzit@leadvelocity.co.za.

### Age
Our services are for people 18 and older.

### Changes
If we change this notice, we update the date at the top. Big changes are also shown on our page.

---

## Part 3 — Website Terms (sortmycover.co.za/terms)

**Website Terms — SortMyCover** · Version WT-v1 · {{date}}

1. **Who we are.** SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect people with authorised financial services providers. We do not give financial advice, compare products or quote premiums.
2. **What this site is.** General information about life cover and what a call with a licensed adviser involves. It is not advice. Only a licensed adviser can tell you what fits you.
3. **It's free for you.** There is no charge and no obligation to buy anything.
4. **How we make money.** Advisers pay us a flat monthly fee to run our service. The fee is the same whether or not you buy anything. We earn nothing from any policy.
5. **Who you'll talk to.** When you agree, your details go to one adviser. Their name, practice and FSP number are in your first WhatsApp from us. The adviser is responsible for any advice they give.
6. **Your details.** Our Privacy Notice explains how we use them.
7. **Using the site.** Please don't misuse the site, send false details, or enter someone else's number.
8. **Accuracy.** We try to keep the information correct and up to date. Figures on this site are general examples, not quotes.
9. **Links.** We are not responsible for other websites we link to.
10. **Responsibility.** We are not liable for decisions you make about cover. Nothing in these terms limits your rights under the Consumer Protection Act or POPIA.
11. **Law.** South African law applies.
12. **Contact.** howzit@leadvelocity.co.za, or send COMPLAINT on our WhatsApp.

---

## Part 4 — Cookie Notice (sortmycover.co.za/cookies, and a one-line banner)

**Banner text:** "We use cookies to measure our ads and keep the site working. [Cookie settings] [OK]"

**Cookie Notice — SortMyCover** · Version CN-v1

Cookies are small files a website stores in your browser.

| Name | Set by | Why | How long |
|---|---|---|---|
| `_fbp` | Meta Pixel (first-party) | Measure which ads bring visitors | About 90 days |
| `_fbc` | Meta Pixel (first-party, when you click an ad) | Link your visit to the ad you clicked | About 90 days |
| Ad source (`utm_*`, `fbclid`) | SortMyCover (stored in your browser) | Remember which ad or link you came from, so your enquiry keeps its source | Until you send the form or clear your browser |
| Essential session data | SortMyCover | Keep the form and booking working | Until you close the page |

**Your choice.** Press **Cookie settings** and turn off "Ad measurement". Meta cookies will then not be set. The site still works. You can also block cookies in your browser.

*Implementation note: "Ad measurement off" sets `window.SMC_CONSENT_ANALYTICS = false` before `pixel.js` loads (see `landing/shared/pixel.README.md`). The default (on, with notice) is a practitioner question — see practitioner-brief Q9.*

---

## Part 5 — WhatsApp disclosure template texts (restated from 4.6 for consistency)

These are the first message every lead gets (< 60 s). Wording is verbatim from master prompt 4.6. Image header = the broker's intro card. Message ID and delivery status are stored as disclosure evidence.

**`broker_intro_booked`**
> Hi {{first_name}}, thanks for your life cover enquiry. Your details have been passed to **{{practice_name}} (FSP {{fsp_number}})**, an authorised financial services provider. **{{adviser_name}}** will be your adviser for your {{method}} call on **{{date}} at {{time}}**. Reply STOP to opt out.
> Buttons: `Add to calendar` · `Reschedule` · `Cancel`

**`broker_intro_slots`**
> Hi {{first_name}}, thanks for your life cover enquiry. Your details have been passed to **{{practice_name}} (FSP {{fsp_number}})**, an authorised financial services provider. **{{adviser_name}}** can do a 30-minute call. Pick a time below. Reply STOP to opt out.
> Buttons: 3 slot options + `Other times`

**Intro card text (from 4.10):** adviser name · practice name · "Authorised financial services provider · FSP {number}" · 2-line bio · languages · "30-min {methods} call · No obligation".

**Brand disclosure line (4D.2 rule 8) — footer, About, consent area, Page/IG About, WhatsApp business profile:**
> **SortMyCover is a service of Lead Velocity (Pty) Ltd. We connect you with authorised financial services providers. We do not give financial advice, compare products or quote premiums.**

---

## Part 6 — Consistency check (every text says the same thing)

| Fact | Consent | Privacy | Terms | Cookie | WhatsApp |
|---|---|---|---|---|---|
| Lead Velocity is responsible party | ✓ (named in consent) | ✓ | ✓ | — | footer line |
| Shared with one authorised FSP | ✓ | ✓ | ✓ | — | ✓ (named) |
| No advice / comparison / premiums | footer 1.5 | ✓ | ✓ | — | rule-8 line |
| STOP opt-out | ✓ | ✓ | — | — | ✓ |
| Hashed ad measurement | 1.4 | ✓ | — | ✓ | — |
| Email only for invite | — | ✓ | — | — | — |
| Retention 12 m / 5 y | — | ✓ | — | — | — |
| Complaints howzit@ + COMPLAINT, 48 h | — | ✓ | ✓ | — | — |
| Flat fee, not tied to policies | — | — | ✓ (s4) | — | — |
