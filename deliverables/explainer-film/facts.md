# SortMyCover explainer film: fact sheet

Fact-checked 18 Oct 2026, 07:30 to 07:50 SAST. Every fact has a source. Paths are relative to the worktree `C:\tmp\lv-w07-fix` (branch `fix/w07-twilio-recipient`, HEAD `f3f3716`) unless they start with `EMMA/` (`C:\Users\Jono\Desktop\EMMA\`), `lv-site/` (`C:\Users\Jono\lv-site\`) or `memory/` (`C:\Users\Jono\.claude\projects\C--Users-Jono-Desktop-EMMA\memory\`).

The work was read-only. Live checks were SSH to the n8n VPS, read-only SELECTs on the Lead Velocity CRM (Supabase `cmsylaupctrbsvzrgzwy`), plain GETs on sortmycover.co.za, and a read of the launch checklist artifact.

**Source labels:**
- **HO** = `EMMA/checklist/HANDOVER-2026-10-17-EVENING.md`.
- **CL xN** = task row xN in the live checklist artifact (claude.ai/artifact/JccX7b52ooU4brtX68Gdiy, collection `tasks`, read 18 Oct).
- **LIVE-n8n**, **LIVE-db** and **LIVE-web** = checks run for this sheet.

Flags: **[UNCERTAIN]** means not proven. **[CONFLICT]** means two sources disagree. **[GAP]** means something the film should not claim as working.

---

## 0. The people and the plumbing

| Fact | Source |
|---|---|
| SortMyCover covers life, disability, income protection and severe illness, plus wills through Capital Legacy. No car or home cover. | `memory/feedback_smc_no_short_term.md`; persona `supabase/functions/_shared/smc_receptionist_persona.ts:53` |
| Lead Velocity (Pty) Ltd runs SortMyCover. SortMyCover is not an FSP: it introduces people to an authorised adviser. | `automation/ctwa/w03.js:54`; `supabase/functions/smc-client-email/render.ts:211`; `knowledge/faq.md:122` |
| The adviser is Mark Weston, FSP 28418. The CRM row stores the practice name as **"Oracle Private Wealth"**. | LIVE-db `brokers` 306062a1 |
| **[CONFLICT] Practice name.** The CRM row says **"Oracle Private Wealth"**, and that name is what the consent text, the emails and the WhatsApp templates fill in (`{practice}` comes from `brokers.practice_name`). The FSCA register says **"ORACLE BROKER SERVICES (PTY) LTD"**, authorised since 12 Jun 2007, with Mark listed as representative (CL c5). The ads chip and the voice persona say **"Oracle Brokers"** (`EMMA/checklist/NEXT-SESSION-SMC-2026-10-17.md:7`; persona `:15`). Pick one name for the film. | as cited |
| Wills go to Capital Legacy Solutions (FSP 43826). On WhatsApp, a wills enquiry is handed to a person because there is no wills calendar yet. | persona `:39-41`; `automation/ctwa/w03.js:347-350` |
| The WhatsApp and phone number is +27 60 015 6480. It runs on the Twilio subaccount "Lead Velocity - SortMyCover", WABA 1370588024885127, and is ONLINE. | `docs/SMC-WHATSAPP-STATUS.md:81`; CL w2 |
| n8n runs on the EMMA VPS (n8n.sortmycover.co.za). There is one shared send path (`smc-whatsapp-send`), with `WHATSAPP_PROVIDER=twilio` and `DRY_RUN_SENDS=false`. | LIVE-n8n `.env` |
| The data lives in the Lead Velocity CRM (Supabase `cmsylaupctrbsvzrgzwy`). The SMC brand row is code `SMC`, `booking_ui = list` and `phone_number_id = 27600156480`. | LIVE-db `brands` |
| A test adviser is routed right now: **"Jono Jettoo / SortMyCover test practice", FSP "TEST 0000"**, active with routing on. Mark is `status 'Active'` with `routing_on false`, so he is **not routable**. | LIVE-db `brokers`; HO:99-100 |

## 1. The client's WhatsApp journey (click-to-WhatsApp ad to booked call)

### 1a. Tapping the ad
- The ad CTA is **"Send WhatsApp message"** and the headline is **"Book a 30-minute call on WhatsApp"**. (CL x3; HO:85)
- The ad's chat template is named **"SMC CTWA - Lindi greeting - check my life cover"**. (HO:85)
  - Welcome message, as Meta shows it in the chat: **"Hi, I'm Lindi from SortMyCover. Send the message below and I'll help you book a 30-minute call with an authorised adviser."**
  - Pre-filled message: **"Hi, I'd like to check my life cover"**.
  - Source: Ads Manager page text read in the 17 Oct build session (transcript `2e0a68b6…jsonl`), and CL x3.
- n8n routes the pre-filled text, or any first message from an unknown number, to W03, the click-to-WhatsApp intake. (`automation/lib/w07.mjs:149`)
- Website visitors get a different first message, the "opener": "Hi Lindi, I'd like to chat about <topic>. I agree that SortMyCover may message me on WhatsApp about this and share my details with <who>. Ref <code>". An unchanged opener counts as consent (version CONSENT-GENERIC-v5web). (`lv-site/sites/sortmycover/docs/WHATSAPP-OPENERS.md:14-19`; `automation/ctwa/w03.js:69-77`)

### 1b. Consent (W03, first reply to an ad chat)
- Consent mode is `named` for both brokers (LIVE-db `brokers.consent_mode`). The message carries two buttons, **"Yes, continue"** and **"No thanks"** (`automation/ctwa/w03.js:64, 271`):
  > "Before we start: if it's a fit, we'll share your details with {practice} (FSP {fsp}), an authorised financial services provider who'll contact you about insurance and financial planning. OK to continue?
  >
  > Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy"
- A "No thanks" tap sends "No problem. We won't contact you again. Take care.", suppresses the number and stores nothing else. (`w03.js:278-281`)
- A "Yes" tap creates the lead with the consent text, version `ctwa-named-v3`, a timestamp and provenance. If Meta's `ctwa_clid` is present, a CAPI Lead event fires. (`w03.js:283-299`)
- Free text before consent repeats the consent question. (`w03.js:319`)
- Jono's 16 Oct decision: the first WhatsApp message carries no disclosure block, and the who-pays-whom detail goes in the intro card after booking. (`EMMA/checklist/NEXT-SESSION-SMC-2026-10-17.md:13`)

### 1c. Qualifying questions (tap lists, in this order)
The order is set in `conversation/logic.mjs:44-45` and `automation/ctwa/w03.js:167-170`.
1. **Age band.** "Which age group are you in?" with the button "Choose age". Rows: Under 35 / 35 to 44 / 45 to 50 / 51 or older. Under 35 or 51+ closes the chat politely, and the details are set to be deleted after 24 h. (`w03.js:147, 209, 389-391, 473-481`)
2. **Budget band.** "Roughly what could you put towards cover each month?" with the button "Choose amount". Rows: Under R500 a month / R500 to R750 / R750 to R1,250 / R1,250 to R1,499 / R1,500 or more. (`w03.js:148, 210`)
   - Under R750 is tier C: it is recorded and the questions go on. Such a lead goes only to an adviser who accepts low budgets, otherwise it is held. Mark has `accepts_low_budget = false`. (`w03.js:156-158`; `automation/ctwa/capture-v2.js:7-12`; LIVE-db)
   - "Not sure" gets one clarifying re-ask. (`w03.js:369-376`)
3. **Bond and dependants**, as one question: "Do you have a bond or people who depend on your income?" Rows: Bond and dependants / Bond, no dependants / Dependants, no bond / Neither. (`w03.js:152, 211`)
4. **How to meet.** "How would you like to talk to {adviser first name}?" Only methods the adviser offers are shown. Mark and the test adviser offer Teams and phone, so the buttons are "Teams video call" and "Phone call". (`w03.js:153, 212-217`; LIVE-db `methods_supported`)
- Typed answers are accepted and mapped to the bands (`w03.js:180-191`). Free text in the middle of a question gets "Please tap one of the options." and the question again (`w03.js:378-384`).
- After the last tap, W01 routes the lead and W06 sends the first touch within 60 s. (`w03.js:420-423`; `automation/lib/w06.mjs:1-21`)

### 1d. How times are offered
- **Inside the 24-h chat window: a list of up to 10 times** (`LIST_MAX = 10`).
  - The body reads "Here are the next open times with {adviser_first}. Times are South African time.", or Lindi's own lead-in followed by that time line.
  - The list button is "See times", the section is "Next free times", and the footer is "Reply STOP to opt out".
  - Sources: `automation/lib/w04.mjs:36`; `automation/flows/w28-endpoint.js:214-228`; `conversation/lines.mjs:61, 74`.
  - The list is spread across days (`w04.mjs:8-9`).
- **3 time buttons** appear only in templates sent outside the window:
  - the `broker_intro_slots` intro card (3 times + "Other times");
  - `missed_you` ("Time 1/2/3", "Other times");
  - `reschedule_offer`.
  - Sources: `automation/lib/w06.mjs:44, 136-143`; `automation/templates/missed_you.json`; `automation/lib/w10.mjs:60-66`.
- Slot rules when the broker has no settings of his own (`w04.mjs:12-15, 41-44`):
  - Mon to Fri, 09:00 to 17:00;
  - 30-minute slots with a 15-minute buffer;
  - at least 2 hours' notice, up to 14 days ahead;
  - at most 3 calls a day and 12 a week.
- Live proof (LIVE-db `communications`, 18 Oct 00:03-00:04): the client typed "I would like to book a call please", got an interactive list, and tapped "Mon 19 Oct, 15:30".

### 1e. Email: asked only at booking, confirmed by link only (since 18 Oct)
- The email is asked for only at the booking step, never in ads, forms or the first questions. (`memory/feedback_smc_email_at_booking_only.md`)
- When a lead with no verified email taps a time, W05 **holds** the slot and the client is asked for an email. (`automation/lib/w05.mjs:19-25, 661-684`)
  - The fixed wording is "Where should we send the {method} invite? Reply with your email address." (`conversation/lines.mjs:73`)
  - Lindi may phrase it herself. A live example, 17 Oct 22:11: "Great, so Thursday 22 October at 09:00 by phone is held for you. Could you share your email so I can send the invite?" (LIVE-db `communications`)
- The typed address is checked for syntax, typos, disposable domains and a mail server. The reply is **"Thank you. We've emailed a confirmation link to {email}. Please tap it to confirm your email."** (`automation/lib/w07.mjs:79-90`)
- The verification email comes from SortMyCover <hello@sortmycover.co.za> through Resend. (`automation/lib/sub-email-verify.mjs:10-17`; `automation/ctwa/capture-v2.js:110-111`)
  - Subject: "Confirm your email for your call with {adviser}".
  - Body: "Hi {first_name}, Please confirm this is your email address so {adviser} can send you your meeting details: {link}. The link works for 24 hours. If you did not ask for this, ignore this email. SortMyCover".
- The link page says **"Your email is confirmed"** / "Thank you. You can close this page." (`sub-email-verify.mjs:91-98`)
- **Link only since 18 Oct 01:00** (commit 754db74). There is no 6-digit code in the email or in any message, and a typed 6-digit number is treated as an ordinary message. (HO:35; `w07.mjs:151-156`; `sub-email-verify.mjs:7-10`; CL x21)
  - The verify workflow's n8n name still reads "Email Verify (Resend code + link…)". That is a label only. (LIVE-n8n)
- **What "held" means:**
  - The appointment is stored as `pending_verification`, so nobody else can take the time.
  - Nothing goes to the adviser until the email is confirmed: no Outlook event, invite, notice, reminders or ad-tracking event.
  - The deadline is the earlier of 24 h from now and 2 h before the call. A time with under 15 minutes left to verify is not held.
  - Confirmed in time: the hold becomes a booking. Not confirmed: the hold is released and the client gets `booking_hold_released`: "Hi {{1}}, we couldn't confirm your email in time, so we've released the time we were holding for you ({{2}} at {{3}}). Tap below to pick a new time." with a "See open times" button.
  - Sources: `w05.mjs:21-25, 60-63`; `automation/templates/booking_hold_released.json`.
- If the email is already known, the held-slot WhatsApp is `booking_held_verify_email`: "Hi {{1}}, we're holding {{2}} at {{3}} for your call with {{4}}. To confirm the booking, please tap the confirmation link we sent to your email address. If it isn't confirmed by {{5}}, we'll release the time. Reply STOP to opt out." The live version is `smc_booking_held_verify_email_v2` (approved). (`automation/templates/booking_held_verify_email.json`; `docs/SMC-WHATSAPP-STATUS.md:77`; HO:35)

### 1f. Booking confirmation
- The WhatsApp template **`booking_confirmed`** (approved, amber-header v2) reads (`automation/templates/booking_confirmed.json`; CL x18; live send LIVE-db 18 Oct 00:04):
  > "Hi {{1}}, you are booked. *{{2}}* will meet you on *{{3}} at {{4}}* by {{5}}. Please reply with the day and time so we know it is in your diary. Reply STOP to opt out."
  - Header: "Booking confirmed". Buttons: "Add to calendar" (URL), "Confirm", "Reschedule", "Cancel".
- **[GAP] The "Add to calendar" button goes to a 404 page.** It points to `https://sortmycover.co.za/c/{booking_id}`. On 18 Oct, `/c/<real booking id>` returned Hostinger's 404 (`platform: hostinger`). No `/c/` rewrite exists on the live site or in the new site zip. The contract assumed Traefik routes `/c/*` to W05, but the site is on Hostinger. `what_to_expect` has the same button. (LIVE-web; `automation/CONTRACTS.md:271-272`; `lv-site/smc-dist-redesign-2026-10-17.zip` `.htaccess`)
- For phone or WhatsApp calls, a short contact check follows (`conversation/lines.mjs:82-89`; `automation/lib/w07.mjs:496-563`; live 18 Oct 00:04):
  1. "Is this the number {adviser_first} should call you on?" with "Yes, this one" / "Use another number".
  2. "If we can't reach you, is there another number?" with "Add one" / "No thanks".
  3. "When is the best time to reach you, if we ever need to?" with Mornings / Lunchtime / Afternoons / Evenings / Any time.
  4. "Thanks, I've saved that."
- A **client email** goes out too (section 5).
- The fan-out was proven live with test booking cf9069c2 (Mon 19 Oct 15:30, phone, test adviser): Outlook event, WhatsApp confirmation, reminders scheduled, adviser email (HTTP 200). The client "booked" email was not separately confirmed in that run. (HO:47-53; CL x19)

### 1g. Reminder schedule (W09); timings confirmed in code and live
Sources: `automation/lib/w09.mjs:4-20, 48-74`; LIVE-db `lead_activities` `reminder_job` rows for cf9069c2.

| Touch | When | Live job for cf9069c2 |
|---|---|---|
| `what_to_expect` | 10 min after booking (moved to 08:00 if that falls in quiet hours) | Sun 18 Oct 08:00 |
| `intro_media` (adviser video or voice note) | 48 h before if booked at least 3 days out, otherwise 15 min after booking; only if the adviser has intro media | not scheduled |
| `reminder_24h` (Confirm / Reschedule) + `prep_nudge` | 24 h before; skipped if booked less than 24 h ahead | Sun 18 Oct 15:30 (both) |
| `reminder_2h` | 2 h before | Mon 19 Oct 13:30 |
| `reminder_10m` | 10 min before; exempt from quiet hours | Mon 19 Oct 15:20 |

- Quiet hours are 20:00 to 08:00 SAST. A lead gets at most about 12 messages; the three meeting reminders still go out at that cap. (`w09.mjs:15-17, 26-29`)
- A Confirm tap replies "Thanks, {first_name}, you're confirmed. If you have a payslip or your current policy schedule handy tomorrow, it helps, but it isn't needed." when the call is within 36 h, otherwise "Perfect, it's in {adviser_first}'s diary too." (`w09.mjs:202-207`; `lines.mjs:28, 57`). A live Confirm tap at 07:06 today got a W09 reply (LIVE-db), and cf9069c2 is now `confirmed`.
- Template wording (`automation/templates/*.json`):
  - `what_to_expect`: "Hi {{1}}, here is what to expect on your call with {{2}}: It takes about 30 minutes, by {{3}}. The adviser will ask a few simple questions to understand what matters to you. There is no obligation to buy anything on the call."
  - `prep_nudge`: "…one optional tip … some people like to have a recent payslip or any existing policy schedule nearby. It helps, but it is not needed."
  - `reminder_24h`: "…your {{2}} call with *{{3}}* is tomorrow at *{{4}}*. Most people find 30 minutes is all it takes. Tap Confirm…"
  - `reminder_2h`: "{{2}} has set aside 30 minutes for you today at *{{3}}*…"
  - `reminder_10m`: "…your call with {{2}} starts in 10 minutes."
- **[GAP] Only 2 of the 5 reminders can send today.** The live `TWILIO_CONTENT_SIDS` map holds `reminder_24h` and `reminder_2h` but **not** `what_to_expect`, `prep_nudge` or `reminder_10m` (LIVE-n8n, keys listed). With Twilio, a template with no Content SID is skipped, with no text fallback (`automation/lib/wa-provider.mjs:174, 195`; `automation/lib/sub-whatsapp-send.mjs:158, 193`). The handover's "these WILL message 072…" is true only for the 24 h and 2 h touches.

### 1h. Key approved wording (verbatim, `conversation/lines.mjs`)
1. Disclosure, first free-text reply (`:23`): "Hi {first_name}, I'm Lindi from SortMyCover, here to book your call with {adviser_first}. You can ask for a person at any time."
2. Advice deferral (`:11, :13`): "That's exactly what {adviser_first} will go through with you on the call." + "I've made a note so {adviser_first} comes prepared for it."
3. Times intro (`:61`): "Here are the next open times with {adviser_first}."
4. Cancel question (`:63`): "Do you want me to cancel your call on {date} at {time}?"
5. Cancel done (`:65`): "Done, your call is cancelled. If you'd like another time, pick one below or just tell me."
6. STOP (`:35`): "Done. You won't get any more messages from us."
7. Handoff in hours (`:52`): "Sure, I've asked a person from our team to message you here shortly."
8. Safety (`:17`): "For your safety, please don't send ID numbers in this chat."

## 2. How Lindi writes replies

- **One model call per inbound message.** The "Lindi turn" (`lindi-turn-v1.0.0`, 17 Oct, "option 1") returns the booking labels and her reply in one JSON object. It replaced three calls: intent, reply and classifier. (`conversation/prompts/lindi-turn.md:5-10`; `automation/lib/w07.mjs:634-641`)
- **Model and endpoint:**
  - Lindi on WhatsApp = ElevenLabs agent 'Lindi SortMyCover on WhatsApp' via smc-lindi-chat; there is no Anthropic API in this system (Jono, 19 Oct 2026). W07 posts each turn to `$env.LINDI_BRAIN_URL`, the Supabase edge function **`smc-lindi-chat`** (LIVE-db: edge function `smc-lindi-chat` ACTIVE, v1), with `x-api-key = $env.LINDI_RELAY_TOKEN` and no fallback. Unset = no model call: the never-silent holding line goes out and Jono is alerted. (`automation/patch-w07-elevenlabs-only.mjs`; `automation/CONTRACTS.md` "LLM calls")
  - The function opens a text-only session on the **ElevenLabs agent "Lindi SortMyCover on WhatsApp"** (`agent_8201m54p8d5red0t08t1kgxv5b0m`, text-only twin of the call agent, no tools). Our system prompt overrides the agent prompt, and replies come back in the relay's message shape (kept for compatibility). (`supabase/functions/smc-lindi-chat/index.ts:1-17, 47-86`; HO:93)
  - No Anthropic API is used anywhere (Jono's rule; `automation/tests/no-anthropic.test.mjs`). The `model` field is `elevenlabs:lindi-whatsapp` and the relay ignores it. (`lib/w07.mjs` `LINDI_MODEL`; `lindi-turn.md:7`)
  - **[UNCERTAIN]** The repo does not record which LLM the WhatsApp twin runs. The phone agent is set to `glm-52`, hosted by ElevenLabs (`supabase/functions/sync-voice-agents/index.ts:153`), but the twin was not checked live.
  - Each call has a 12 s timeout and auth by relay-token hash in `public.relay_tokens` (`smc-lindi-chat/index.ts:11-19, 88-92`).
- **What the model sees** (`lindi-turn.md:76-96`; `w07.mjs:692-713`):
  - the state, consent and disclosure flags, and what the system does next;
  - the time in SAST, the first name and the adviser's first name;
  - the booking, the slots already known (names only), and the approved FAQ answers;
  - the last 10 turns, and the message with ID, bank and health detail redacted (`w07.mjs:641`; `conversation/guardrail.mjs:1-12`).
- **The model never decides actions.** The deterministic `decide()` in `conversation/logic.mjs:58-177` picks every action from the labels: STOP, distress, handoff, consent, qualifying, booking, rescheduling, cancelling. (`lindi-turn.md:9`)
- **Gates on her words**, in `applyModelReply`, `w07.mjs:741-782`:
  - an output gate blocks prices, insurers, advice and injection echoes (`guardrail.mjs:13-16`);
  - a tone check allows at most 4 sentences, 480 characters and grade 10;
  - any mention of "Lead Velocity" is blocked unless the client asked who runs SortMyCover;
  - a reply that fails is dropped and the approved fixed lines go out instead. There is no second model call.
- **Turns that always stay scripted:** STOP, distress, handoff, closes, consent, the qualifying taps, contact capture and the cancel-confirm question. ID, bank and media warnings are always kept. (`w07.mjs:727-733`)
- **Never-silent guard:** if a hand-off to W03, W04, W05 or W10 sends nothing within **45 s**, W07 sends one fallback and opens an escalation. (`w07.mjs:610-632`; HO:95) The fallback reads: "Thanks for your message, {first}! I'm Lindi from SortMyCover. Something went wrong on my side just now (or: I couldn't pull up the adviser's open times just now), so a person from our team will message you here shortly."
- **FAQ:** answers come only from `knowledge/faq.md` (25 entries, `faq-v1.0.3`), filled from the brokers row. A sentence with an unfilled placeholder is dropped. (`w07.mjs:644-672`; `knowledge/faq.md:1-14`)
  - Examples: FAQ-01 "About 30 minutes. You can join from your phone." (`faq.md:24`); FAQ-02 "You don't pay for the call. Advisers pay SortMyCover a fee for the service, and that fee doesn't depend on whether you buy anything." (`:31`)
  - **[UNCERTAIN]** The FAQ file still says compliance sign-off `PENDING` (`faq.md:9-10`).
- **Never "AI assistant":** the prompt's must-never list includes calling herself an "AI assistant" (`lindi-turn.md:73`). If asked "bot or person?", she says she is SortMyCover's **automated booking assistant** and that a person is available on request (`lindi-turn.md:71`; FAQ-04 `faq.md:45`). Jono's rule: she is "Lindi from SortMyCover" (`memory/project_smc_lindi_whatsapp_live.md`; `automation/ctwa/w03.js:106`).
  - Earlier replies on 17 Oct (16:31) said "an AI booking assistant run by Lead Velocity" and were later fixed (LIVE-db; CL x9).
- **Adviser by first name**, never "he", "she" or "they" (`lindi-turn.md:61`; HO:81, commit f91c8e1).
- **Other behaviour:**
  - a typing indicator and a human-like pause before free-text replies: 1.2 s + 35 ms per character, at most 7 s (`memory/project_smc_golive_state_17_oct.md`);
  - handoff hours 08:00 to 20:00 SAST every day; out of hours: "a person will message you here by 09:00 {today/tomorrow}" (`w07.mjs:19`; `lines.mjs:53`).

## 3. Cancel, reschedule, change of method (W10) and STOP (W15)

- **Cancel:**
  1. A typed cancel asks first: "Do you want me to cancel your call on {date} at {time}?" with "Yes, cancel" / "Keep it". A tapped Cancel button cancels at once. (`automation/lib/w10.mjs:121, 334-336`)
  2. "Yes, cancel" deletes the Outlook event, marks the booking cancelled and cancels the reminders. (HO:57-60; `w10.mjs:102-119`; CL x20)
  3. The client gets "Done, your call is cancelled. If you'd like another time, pick one below or just tell me." with the open times, offered **once** (`lines.mjs:64-65`; `w10.mjs:47-63`). A time picked from that list makes a new booking through W05 (`w10.mjs:52-54`).
  4. The client also gets a `booking_cancelled` email with a cancelling calendar file, and the adviser gets a SortMyCover notice email (`w10.mjs:300-321`; HO:60).
  - Live-tested 18 Oct 00:02 (LIVE-db `communications`). Appointments 547678e2 and 997c6752 are `cancelled` (LIVE-db `appointments`).
- **Reschedule:** "No problem, here are some other times." plus the list (`lines.mjs:62`). (`w10.mjs:4-8, 73-100`)
  - The move keeps the same appointment and the same Outlook event, with new reminders, a new `booking_confirmed` WhatsApp and a `booking_updated` email.
  - A second reschedule is allowed but flagged.
  - A held slot can be moved and stays held, with the same deadline rule (`w10.mjs:20-24, 75-82`).
- **Change of method:** only methods the adviser offers. The reply is "I'll change it to {method}." or "{adviser_first} doesn't offer that way of meeting…". Teams, Zoom or Meet need an email. The Outlook event is patched and a `booking_updated` email goes out. (`w10.mjs:124-131`; `lines.mjs:76-77`; `w05.mjs:784-799`)
- **"No thanks / I don't want a call"** while a booking is live goes to W10 `no_call`: messages stop and no rebooking is offered. (`w07.mjs:338-347, 352`; `w10.mjs:111-112`)
- **STOP (W15)**, which works anywhere in the chat:
  - What counts: STOP, unsubscribe, opt out, "stop all", plus a broader net that catches phrasings like "stop messaging me" (`automation/lib/w07.mjs:65, 148`; `automation/lib/w15.mjs:33-39`).
  - What happens (`w15.mjs:61-100`):
    - a suppression row (hash of the number) and `opted_out_at` on the lead;
    - all reminders paused and cancelled;
    - **live bookings cancelled** (the default mode `cancel`, because `W15_STOP_BOOKING_MODE` is unset, LIVE-n8n; `w15.mjs:41`);
    - the adviser told, by first name only: "{first} has opted out of contact. Please do not call or message them. Their booking has been removed from your calendar." (`w15.mjs:47-51`).
  - Exactly **one** confirmation (`w15.mjs:106-120`): `STOP_ACK` "Done. You won't get any more messages from us.", or `STOP_ACK_CANCELLED` "…and your call with {adviser_first} on {date} at {time} is cancelled. If you change your mind, just send us a message here." (`lines.mjs:35-39`)
  - After STOP, inbound messages are logged only, with no reply (`w07.mjs:150`).
  - Every template ends with "Reply STOP to opt out." (`automation/templates/*.json`)

## 4. What the adviser gets

- **Outlook event in his own calendar**, through Microsoft Graph with his delegated token (`automation/lib/w05.mjs:528-566`):
  - title "SortMyCover call – {first name} – {method}", category SortMyCover, busy, reminder 15 min;
  - the body holds the first name and number, age band, budget band, method, "Call {first} on {number}", consent reference, source, and a pre-call brief link `leadvelocity.co.za/l/{lead}`;
  - a Teams meeting is created for Teams calls.
- For Teams, Zoom or Meet, the client is a required attendee, so **Exchange sends the invite from the adviser's own mailbox** (`w05.mjs:26-29, 525`). Both brokers have `add_client_as_attendee = true` (LIVE-db).
- Mark's Outlook has been connected since 15 Oct, status ok (CL c2; LIVE-db `calendar_status = ok`).
- **Notice email from SortMyCover**, sent through `smc-email-send` (Resend) from SortMyCover <hello@sortmycover.co.za> (`w05.mjs:753-756, 820-831, 892`; HO:72; proven HTTP 200, HO:51):
  - Subject: "New booking: {first} on {date} at {time}".
  - Body: "{first} booked a {method} call with you on {date} at {time}. Age band …, budget band …. It is in your Outlook calendar; the pre-call brief follows 15 minutes before the call. SortMyCover by Lead Velocity".
  - **[GAP]** The pre-call brief is sent by W11, which is **inactive** (LIVE-n8n; `automation/lib/w11.mjs:4`).
- **WhatsApp template `broker_new_booking`:** "New booking for you, {{1}}: *{{2}}* on *{{3}} at {{4}}* by {{5}}. Age band {{6}}, budget band {{7}}. It is in your Outlook calendar, and the pre-call brief will follow 15 minutes before the call." with the button "Open in portal". (`automation/templates/broker_new_booking.json`)
  - **[GAP]** It cannot send today: `broker_new_booking`, `broker_booking_changed` and `broker_lead_opted_out` are not in the live `TWILIO_CONTENT_SIDS` map (LIVE-n8n), so the adviser gets the Outlook event and the email only.
- **Broker portal**, leadvelocity.co.za/broker (the broker login is `/broker`; `memory/project_lv_broker_password_setup.md`):
  - **Calendar connect** at leadvelocity.co.za/broker/calendar, then Connect (CL x11).
  - **"Verified by Lead Velocity" badge** with products, plus bio review (a suggested bio and Approve) (CL c6). Mark's bio is **not approved** yet: it promised "saving money", and a replacement was sent (CL a1).
  - Intro card approval. Mark's card is approved (CL c7).
  - Ad-likeness consent: Mark granted ADS-LIKENESS-v2 on 14 Oct (CL a1).
  - **Per-ad approval:** 8 feed ads with Mark's face (4 angles x photo or text-only) are in his portal under "Ads featuring you: waiting for your approval". He has not approved them, and no automatic notification goes to him (CL x7).
  - "Message Lead Velocity" box and change requests (CL c9, c11).
  - The new SMC broker pages (`VITE_SMC_ENABLED`) are off, so brokers use the older portal, where all of the above works (CL k11).

## 5. The emails

- **Client booking email** from the `smc-client-email` edge function (ACTIVE, LIVE-db). It goes through Resend from **SortMyCover <hello@sortmycover.co.za>**, Reply-To hello@ (`supabase/functions/smc-client-email/render.ts:13-20, 292-299`). Three kinds: `booking_confirmed`, `booking_updated`, `booking_cancelled` (`render.ts:22`).
  - Subjects: "Booked: / Updated: / Cancelled: your call with {adviser first} on {Tue 21 Oct at 10:00}" (`render.ts:188`).
  - Confirmed intro: "SortMyCover has introduced you to {adviser} from {practice}, an authorised financial services provider (FSP {fsp}), and your call is booked." (`render.ts:189-190`)
  - Details panel: When ("Tuesday 21 October 2026, 10:00 to 10:30 (South African time)"), How, Adviser (`render.ts:123-126, 210`).
  - **Calendar** (`render.ts:195-200, 284-288`; `automation/lib/w05.mjs:771-779`):
    - If the adviser's Outlook invited the client (Teams, Zoom, Meet): "A calendar invite is on its way from {adviser first}'s own calendar. Please accept it so the time is held for you."
    - Otherwise, including **every phone or WhatsApp call**: the **.ics file `sortmycover-call.ics` is attached**.
  - Joining (`render.ts:202-206`): phone, "{adviser} will phone you at that time on the number you gave us"; WhatsApp, "…will call you on WhatsApp"; Teams, the join link.
  - Change: "Need another time? Reply to SortMyCover on WhatsApp on +27 60 015 6480 and we will move it for you." with a "Message us on WhatsApp" button (`render.ts:207-209, 228`).
  - Footer (`render.ts:211-213, 263-268`): "SortMyCover is not a financial services provider. We introduce you to an authorised financial adviser and give no financial advice, product comparisons or premium quotes. Licensed financial advisers do." Also the POPIA line, "never sold", and the privacy link. It never names the operating company. Copy rules: no price or "free" wording and no AI or Lead Velocity wording (`render.ts:5-11`).
- **Cancellation and update emails:**
  - W10 sends `booking_cancelled` (with a CANCELLED .ics) and `booking_updated` to the client, and a SortMyCover notice to the adviser (`automation/lib/w10.mjs:300-321`; HO:60-61; CL x19).
  - **[CONFLICT, minor]** `automation/CONTRACTS.md:345` still says "W10 sends the client no cancel email today". That doc is stale against the code and the handover.
- **Verification email:** see 1e. It is relayed through `smc-email-send`, because n8n holds no Resend key (LIVE-n8n: `RESEND_API_KEY` absent; `sub-email-verify.mjs:51-63`).
- **Ops alert email:** see 8.
- Resend: sortmycover.co.za is a verified domain (CL x13).

## 6. Voice: Lindi on +27 60 015 6480

Sources: `docs/SMC-VOICE-RECEPTIONIST.md:9-19`; `smc_receptionist_persona.ts`.
- The ElevenLabs agent is `agent_7501m4v9sez3eb9b26ge4ykdvqwt`, now named "Lindi SortMyCover on call" (HO:93).
- Voice "Linet - African & Friendly" (en-ZA) on Eleven v4 Turbo with Expressive mode. The LLM is `glm-52`, hosted by ElevenLabs. 20 sortmycover.co.za pages form her knowledge base.
- Inbound calls ring about twice (about 5.5 s) before Lindi answers. (`SMC-VOICE-RECEPTIONIST.md:23`)
- **Opening line** (persona `:17-19`): "Hi, thanks for calling SortMyCover, you're speaking to Lindi, SortMyCover's automated assistant. Just so you know, this call is recorded and transcribed. I don't give financial advice, but I can set you up with a free call with a licensed adviser. How can I help?"
- **The call** (`SMC-VOICE-RECEPTIONIST.md:24-31`; persona `:35-37, 101-108`):
  1. She explains why she asks questions.
  2. She asks for the first name, age band (35 to 50 only), the topic, a rough budget band and the mobile number.
  3. She reads a consent line word for word, naming Mark Weston, "Oracle Brokers", FSP 28418 (or Capital Legacy, FSP 43826, for wills).
  4. **WhatsApp first:** she asks permission to WhatsApp and waits for a clear yes. She then sends the approved `smc_qualify_budget` template, at most once per call, and the booking continues on WhatsApp.
  5. **No booking on the call.** The booking tools exist but are not attached to the agent.
  6. If the caller declines WhatsApp, she offers an adviser call-back (with consent).
  7. She never mentions calendars or failures (`memory/feedback_lindi_whatsapp_first.md`).
- **Records:** a `communications` row per call (transcript, summary, outcome) and lead timeline entries. Audio is kept at ElevenLabs for 365 days (`SMC-VOICE-RECEPTIONIST.md:15, 34-40, 69-75`).
- **Missed-call callbacks:** built, but OFF until `SMC_CALLBACKS_ENABLED=true` (`SMC-VOICE-RECEPTIONIST.md:50-51`; CL v7 still todo). **[UNCERTAIN]** The secret's live value was not read. The docs and the checklist say off.
- **[CONFLICT]** The voice script says "virtual assistant" and "free call". The WhatsApp and email copy rules ban "free" and price wording (`render.ts:8-9`; `EMMA/checklist/NEXT-SESSION-SMC-2026-10-17.md:14`).

## 7. n8n workflows ACTIVE now (LIVE-n8n, `workflow_entity`, 18 Oct 07:31 SAST)

15 active out of 43.

| Workflow | What it does |
|---|---|
| `smc-w03` W03 click-to-WhatsApp intake | First message from an unknown number: consent (or website opener), then the 4 qualifying taps, then route and first touch (`automation/ctwa/w03.js`) |
| `smc-w07` W07 conversation agent (Lindi) | Every inbound WhatsApp: routes taps, STOP and emails; Lindi's one-call reply; hands off to the other workflows; never-silent guard (`automation/lib/w07.mjs`) |
| `smc-w04` W04 Slots API | Free times from the adviser's Outlook and our bookings; slot rules (`automation/lib/w04.mjs`) |
| `smc-w05` W05 Book | Books or holds the slot; Outlook event; client and adviser emails; hands to W06 and W09 (`automation/lib/w05.mjs`) |
| `smc-w06` W06 First touch (< 60 s) | Disclosure intro card after routing, or `booking_confirmed` after a booking (`automation/lib/w06.mjs`) |
| `smc-w08` W08 Unbooked nurture | Nudges at 2 h, 24 h and 72 h to routed leads with no booking, then closes (W08 sticky note) |
| `smc-w09` W09 Reminder sequence | Client reminders (section 1g) and the Confirm tap (`automation/lib/w09.mjs`) |
| `smc-w10` W10 Reschedule / cancel | Cancel, move and change-method, with emails (`automation/lib/w10.mjs`) |
| `smc-w15` W15 Opt-out | STOP handling (section 3) |
| `smc-w22` W22 Alerts | Failure and signal alerts with a 24 h dedupe (section 8) |
| `smc-w28` W28 Booking Flow endpoint | Sends the 10-slot list and the email ask outside Flow screens; the Flow itself is off (`booking_ui = list`) (`automation/flows/w28-endpoint.js:178-228`; CL c4) |
| `smc-email-verify` Email Verify | Sends the link email and serves the link page; a confirmed email turns the hold into a booking (`automation/lib/sub-email-verify.mjs`) |
| `smc-whatsapp-send` WhatsApp Send | The one send path: suppression, 24 h window rule, Twilio Content SIDs, logging (`automation/lib/sub-whatsapp-send.mjs`) |
| `smc-w01` W01 Lead intake (web) | Website quiz leads; sends the `qualify_budget` template (`docs/SMC-WHATSAPP-STATUS.md:80-83`). Still labelled "DRAFT pending GATE-TEST-W01" |
| `smc-w36` W36 Capital Legacy watch | Weekly (Mon 07:00) check of the Capital Legacy pages the wills content relies on; emails Jono on a change (`automation/build-w36-capital-legacy-watch.mjs:1-9`). **[UNCERTAIN]** It emails through the howzit@ Graph credential, which the handover says has an expired token (HO:72) |

Inactive and relevant: **W02** (Instant Form intake), **W11** (adviser reminders and pre-call brief), W12 and W13 (outcome, no-show), W35 (lead pulse), W34 (POPIA operations), W21 and W27 (ads sync and health), W30 and W31 (comments and DMs).

## 8. Compliance

- **POPIA consent capture:**
  - The consent text, version, mode, timestamp and source are stored on the lead (`w03.js:285-296, 334-341`).
  - Every consent also writes one row to **`public.lead_optins`**, which is append-only (rows can't be edited). The row records the door (website opener, ad, post or direct), page ref, referral fields and ctwa_clid, consent version and text, the opener text, the inbound message id and the time (`w03.js:110-144`; CL x16).
  - The table exists (LIVE-db). The CRM screens that show it are on branch `feat/optin-provenance`, **not deployed** (CL x17).
- **Information Officer:** registration **2026-069309**, issued by the Information Regulator on 15 Oct 2026 to Lead Velocity (Pty) Ltd (2025/637858/07). The IO is **Kgomotso Ntsugi Michael Pule (KG)** (`memory/reference_lv_information_officer.md`; CL k4).
  - KG is named on the live privacy page (CL k1).
  - The registration number is on the new site's privacy, terms, About and PAIA pages (CL x5). **[GAP] Not live:** the live privacy page has no "2026-069309" (LIVE-web).
- **STOP and suppression:** see section 3. A "No thanks" at consent also suppresses the number (`w03.js:279`). Out-of-band leads are set to be deleted after 24 h (`w03.js:474-479`).
- **No AI labels:**
  - Ads: no "AI-generated" line (Jono, 16 Oct; `NEXT-SESSION-SMC-2026-10-17.md:11`). The reels were re-rendered without the AI label and without "costs you nothing" (HO:85). All Meta AI enhancements are off (CL x3).
  - Lindi never calls herself an "AI assistant" on WhatsApp (section 2).
  - **[CONFLICT]** The website chat widget introduces "Lindi as SortMyCover's AI booking assistant" (`WHATSAPP-OPENERS.md:8`).
  - **[CONFLICT]** The intro-card templates end with "Our WhatsApp assistant uses AI." (`automation/lib/w06.mjs:44-46`). Those templates are not live on Twilio (section 10).
- **Recorded-calls notice:**
  - Lindi says it in the opening line (section 6).
  - The new privacy section "Phone calls and recordings" covers the automated voice assistant, recording and transcription, 365 days, ElevenLabs as operator, and access through the IO. It is built in site commit ef59aa6 (CL k8).
  - **[GAP] Not live:** the live privacy page has no "recorded" wording and still shows "DRAFT for practitioner…" (LIVE-web, 18 Oct).
- **Link-only email verification:** see 1e (754db74).
- **Alerts (W22, live since 18 Oct 07:20, commit f3f3716)** (`automation/lib/w22.mjs:1-16, 95-150`; HO:21-31; CL x22):
  - Inputs: every n8n workflow failure and every workflow signal.
  - At most one alert per signal, scope and severity per **24 h**.
  - **Email** for every alert to `OPS_ALERT_EMAIL` (jono@vantagestack.co.za, LIVE-n8n) from SortMyCover through `smc-email-send`.
  - **WhatsApp** for red alerts with the `ops_alert` template. The template is **pending**: Meta recategorised it as MARKETING, so alerts are email only until it is approved.
  - Alerts mask emails, phone numbers and ID numbers.
  - KG gets nothing yet: `OPS_WHATSAPP_KG` is unset (LIVE-n8n; the Jono number is set).
  - Not built: quiet hours, escalation, threshold sweeps and probes.
- **Other protections:**
  - ID and bank numbers are masked before any model call, with a warning line (`guardrail.mjs:1-12`; `lines.mjs:17-19`).
  - Photos and files are never opened (`lines.mjs:21`).
  - Broker notices use the first name only (`w15.mjs:46-51`).

## 9. Campaign facts

| Fact | Source |
|---|---|
| Campaign "SMC \| Leads \| Cycle 1 \| WhatsApp vs Instant Form" (id 120248625965480618) in ad account SortMyCover 1651253736358759 | HO:85, 111; `memory/reference_meta_ads_manager_gotchas.md` |
| Ad set "SMC \| WhatsApp \| ZA metros \| 35-50" (id 120248625965470618) | CL x3; memory as above |
| Budget **R75/day**; age **35-50** as a hard limit; **78 suburbs** (cities set to city only, 12 pins at 2 mi, location expansion off); Page Sort My Cover; destination WhatsApp | HO:85; CL x3; Ads Manager notes in the build transcript |
| Placements are manual: FB and IG Feed, Profile feed, Stories, Reels. No Explore, Audience Network, Marketplace, Threads or WhatsApp Status | build transcript; CL x3 |
| **[CONFLICT] Budget.** Older plans said R150/day (13 Oct draft website campaign, CL a3; 13 Oct decision of a R1,050 lifetime over 7 days, `memory/project_smc_ads_launch_state.md`). The current WhatsApp ad set is R75/day (Jono: small weekend budget, full run from Mon 19 Oct, HO:15) | as cited |
| Account spending limit R3,000 (about R3,450 with VAT); Pixel 1088568384160686 | CL m7, m6 |
| **4 ads**, one per angle: new-bond, salary-stops, owners-directors, adviser-conversation. Each has a clean 9:16 reel for Stories and Reels plus a 4:5 cut for feeds; headline "Book a 30-minute call on WhatsApp"; CTA Send WhatsApp message | HO:85; CL x3 |
| Primary text example (new-bond): "Bond approved. One more question: what protects the bond if an income stops? Credit life and life cover do different jobs. Book a 30-minute call with an authorised adviser on WhatsApp. Read more: …/learn/life-cover-and-a-home-loan/ SortMyCover is not an FSP; it arranges introductions to an authorised adviser." | `EMMA/checklist/creative/blog/meta-primary-texts.md:11-23` |
| Chat template: Lindi greeting + "Hi, I'd like to check my life cover" (section 1a) | as above |
| **Status: draft, not published.** "Review and publish" shows no errors and all 4 ads render in Stories (18 Oct 01:00). The editor's score of 28 only reflects Advantage+ options that are deliberately off | HO:36; CL x3 |
| **Instant Form arm not built.** It needs Meta's Lead Ads Terms accepted and a Meta system-user token for W02 (Jono's call). W02 is inactive. Meta's terms also bar a financial or income question in the form, so the budget would be asked on WhatsApp | HO:85; LIVE-n8n; `automation/ctwa/w03.js:433-441` |
| **Mark paid R16,500 for 20 leads:** CRM order "SortMyCover Bronze (20 leads)", status paid, paid 12 Oct 2026, `price_zar 16500`, `lead_count 20`. A lead counts only once it is booked and attendance is confirmed | LIVE-db `lead_orders`; `memory/project_smc_ads_launch_state.md`; `automation/ctwa/capture-v2.js:12, 559-561` |
| Adviser approval of ads in the portal: 8 ads waiting, none approved, and Mark is not notified automatically | CL x7 |
| **[UNCERTAIN]** Whether the 4 click-to-WhatsApp reels are the same creative Mark is approving. His portal holds 8 feed images; the campaign uses reels plus 4:5 cuts | CL x7 vs HO:85 |
| **[GAP]** The reels still use the Edge placeholder voice, but Jono chose ElevenLabs voice-overs | CL x4; `NEXT-SESSION-SMC-2026-10-17.md:16` |
| **[GAP]** All four ads' "Read more" links are 404 today: /learn/life-cover-and-a-home-loan/, /learn/income-protection-vs-disability-cover/, /learn/cover-for-business-owners-and-directors/, /learn/questions-to-ask-a-financial-adviser/ | LIVE-web 18 Oct |

## 10. Not done, or gated before launch

The first three are blocked for Claude (auto-mode classifier): production deploys, DNS edits and key creation (HO:17-18).

1. **Site upload to Hostinger:** `lv-site/smc-dist-redesign-2026-10-17.zip`.
   - Until it is uploaded, the /learn/ ad links are 404 and the live privacy page keeps the DRAFT line, with no call-recording section and no IO number. (HO:86, 104-105; CL x15; LIVE-web)
2. **GoDaddy DNS for leadvelocity.co.za:** remove the duplicate DMARC and fix SPF for Outlook. (HO:108; CL x8 blocked)
3. **CRM production deploy** of the unmerged branches: hotfix/mark-video-approval, fix/password-reset, chore/remove-login, fix/crm-types-lint, feat/client-emails-split and feat/optin-provenance. (HO:120; CL x17)
4. **Revert the test adviser and route to Mark** (HO:99-100, 122; CL x10, x11; LIVE-db):
   - test practice routing off, and `brokers.user_id` back to edddd539;
   - Mark set to `active` with routing on, via CRM Broker Management, then Go live;
   - **cancel test booking cf9069c2.** It is now `confirmed` for Mon 19 Oct 15:30, so its reminders would go to Jono's phone.
5. **Mark approves each ad in his portal:** 8 waiting, and he is not notified automatically. (CL x7)
6. **Instant Form arm:** Lead Ads Terms plus a system-user token, then W02. Not built. (HO:85)
7. **Jono taps Publish and confirms the budget, then Meta approves the ads.** (CL g1, g2; HO:122)
8. **"Notify Mark last":** **[UNCERTAIN]** No source in the handover, the checklist or memory says this. The handover only orders "revert test adviser, Go live on Mark, Jono taps Publish" (HO:122).
9. **`ops_alert` template approval:** pending at Meta, recategorised as MARKETING. (HO:28)
10. **Missing Twilio templates (my live finding, not in the handover).**
    - The live `TWILIO_CONTENT_SIDS` map has 23 keys: `booking_confirmed`, `booking_held_verify_email`, `booking_hold_released`, `lead_low_budget_closed`, `lead_low_budget_held`, `missed_you`, `ops_alert`, `qualify_budget`, `reminder_24h`, `reminder_2h`, plus 13 generic session list and button templates.
    - Missing, and therefore skipped when sent:
      - `what_to_expect`, `prep_nudge`, `reminder_10m` (client reminders);
      - `broker_intro_slots` and `broker_intro_booked` (the disclosure intro card; CL w4 "Mark's intro-card templates (2)" is still todo);
      - `broker_new_booking`, `broker_booking_changed`, `broker_lead_opted_out` (adviser WhatsApp);
      - the `unbooked_nudge_*` set (W08 outside the window).
    - Source: LIVE-n8n; `automation/lib/wa-provider.mjs:195`.
    - **[UNCERTAIN]** For a brand-new ad lead, after the 4 qualifying taps W06 tries `broker_intro_slots`, which has no SID. W06.json then falls back to an SMS of the same disclosure ("WhatsApp rejected? -> SMS now"). The **fresh-number click-to-WhatsApp path end to end has not been proven live** (`memory/project_smc_lindi_whatsapp_live.md`: "Live proof from an unknown number still pending"). The live tests used Jono's existing test lead.
11. **"Add to calendar" link 404:** `/c/{id}` is not routed on Hostinger (section 1f).
12. **Pre-call brief:** W11 is inactive, yet the adviser email and template promise a brief 15 minutes before the call (section 4).
13. **Voice callbacks off** (CL v7); **ElevenLabs voice-overs** on the reels (CL x4); **KG alerts** need `OPS_WHATSAPP_KG` (LIVE-n8n).
14. **Code not merged:** `fix/w07-twilio-recipient` (deployed from the branch, pushed, not merged); site PR #6 unmerged. (HO:54, 91, 103)
15. **Smaller open items:**
    - Microsoft publisher verification (CL c12);
    - two email-function security gaps (CL k9);
    - the decision on the new broker pages, `VITE_SMC_ENABLED` (CL k11);
    - Mark's bio approval (CL a1);
    - FAQ compliance sign-off `PENDING` (`knowledge/faq.md:9`);
    - W36 emails through the expired howzit@ credential (HO:72).
