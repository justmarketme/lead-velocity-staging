# 10 Nudges, prompts and the go-live gate (W20 copy)

Where the words live for everything W20 sends and shows. Channel rule: **WhatsApp first, email second, always from and copied to howzit@leadvelocity.co.za** (4.10 item 0). WhatsApp is read; email is filed. New WhatsApp templates are in `proposed-templates.json` (UTILITY, no emoji, no "guaranteed", no marketing); they are **proposals for automation-engineer** to add to `automation/templates` (needs_human NH-BS-08). Meta may re-categorise; accept it (0.3 #1).

## Sending rules
1. **Prompt on progress, not on a timer, but only when the broker has left the portal.** On `step.completed`, W20 sends the next-step prompt only if `last_seen_at` is more than 10 minutes ago (otherwise the broker is already looking at the next screen: Intercom's lesson, don't talk over the product).
2. **Nudges at 24 h and 72 h of no progress** (clock = `onboarding_last_progress_at`). Each fires once per stall, names the one stalled step, says how long it takes and why. After the 72-h nudge W20 stops: no third nudge, no nagging. Jonathan gets a console to-do ("{broker} has stalled at {step} for 72 h"), and he decides (a WhatsApp from him; a call only if the broker prefers).
3. **Quiet hours:** nothing sent 19:00-08:00 SAST; due nudges go at 08:00. Weekends are not skipped (a broker who just paid is most motivated now).
4. **Idempotent:** `onboarding_nudges jsonb` `{ "24h": ts, "72h": ts, "since": progress_at }`; a replayed event does not resend.
5. **Broker #1 (assisted):** Jonathan drives the same wizard on a 30-minute call (6.1). While `assisted = true`, nudges are suppressed until the call ends (`suppress_until`); after the call, the normal clock applies. Self-serve brokers never get a call by default.
6. **After `onboarded`:** only the video step remains. A softer media nudge at 24 h and 72 h after `onboarded_at` with the show-rate line. Never blocks.
7. **A broker who replies to any message** with a question: the reply goes to howzit@ and the WhatsApp inbox (human handoff owner: Jonathan, backup KG); the nudge clock does not reset until a step completes.

## Message bank

### Welcome (on `broker.created`; WhatsApp `broker_onboarding_welcome` + email)
- **WhatsApp:** "Hi {first_name}, welcome to SortMyCover. Your account is ready. Setup takes about 12 minutes, and the 3-minute video shows every step. Tap Open my portal, then watch the video first." Buttons: **Open my portal** (magic link), **3-minute video**.
- **Email** subject: "Welcome to SortMyCover: 3 minutes to see what to do next". Body: "Hi {first_name}, your account is ready. 1. Open your portal with the button below (no password needed). 2. Watch the 3-minute video. It has captions, so you can watch it on mute. 3. Follow the seven steps. Most people finish in about 12 minutes. If you get stuck, reply to this email or message us on WhatsApp. You don't need a call. [Open my portal] [Watch the video]. Lead Velocity (Pty) Ltd . SortMyCover . howzit@leadvelocity.co.za" (One-page checklist PDF attached? No: linked in the portal.)

### Next-step prompt (on `step.completed`, when the broker has left the portal; WhatsApp `broker_onboarding_next`)
"Nice one, {first_name}. {done_step} is done. Next: {next_step}. It takes about {minutes}. Tap below to carry on." Button: **Next step**. Email: none (the portal and WhatsApp are enough; email only on welcome, 72 h, agreement copy, go-live).

### 24-hour nudge (WhatsApp `broker_onboarding_nudge_24h`; no email)
"Hi {first_name}, a quick reminder. Next for you: {next_step}. It takes about {minutes}. {reason} Tap below to carry on, or reply here if you want a hand."

| Stalled step | `{next_step}` | `{minutes}` | `{reason}` |
|---|---|---|---|
| profile | Your details and FSP number | 3 minutes | It also shows leads you're on the FSCA register. |
| calendar | Connect your Outlook calendar | 1 minute | One tap. It lets leads book real free times with you. |
| availability | Check your hours | 1 minute | We've used standard hours (Mon-Fri 9 to 5, 3 a day). Change them any time. |
| agreement | Sign your agreement | 3 minutes | It's in plain words, and you get a copy straight away. |
| card | Approve your intro card | 1 minute | It's the picture leads see before they meet you. |
| media (after `onboarded`) | Record your 25-second intro | 10 minutes | We're testing whether a 25-second intro helps people turn up. Not needed to go live. |

### 72-hour nudge (WhatsApp `broker_onboarding_nudge_72h` + email; plus Jonathan's console to-do)
- **WhatsApp:** "Hi {first_name}, your SortMyCover setup is still waiting on one thing: {next_step}. {reason72} Leads can't be sent to you until it's done. Reply here and we'll help, no call needed." Button: **Finish setup**.
- `{reason72}`: profile: "We check every FSP number before any lead is sent to you." . calendar: "If Microsoft asks for admin approval, the portal has a link for your IT person, or a shared-calendar option." . agreement: "You can read it first. It's month to month, with no lock-in." . card: "Leads see this on WhatsApp the moment they book." . media: "No rush. You can go live without it and add it later." (For media the middle sentence "Leads can't be sent to you until it's done." is dropped; the template variant `...72h` is therefore sent only for blocking steps, and media uses `broker_onboarding_nudge_24h` wording at 72 h.)
- **Email** subject: "Your SortMyCover setup: one step left ({next_step})". Body: "Hi {first_name}, you're nearly there. The one thing left is: {next_step}. It takes about {minutes}. {reason72} Open your portal: [Finish setup]. Prefer to ask something first? Reply to this email or WhatsApp us. We answer the same day. No call needed."

### Issue messages (WhatsApp `broker_onboarding_issue`; sent immediately)
| Trigger | `{what}` | `{fix}` |
|---|---|---|
| FSP blocked | We could not match your FSP number to your practice name. | Check the number and try again. After three tries we'll check it by hand. |
| FSP pending manual | We could not reach the FSCA register just now. | We're checking it by hand and will message you today. Nothing for you to do. |
| Calendar connected, no slots | Your calendar is connected, but we can't see any free time in the next 14 days. | Check your hours in the portal, or your Outlook working hours. |
| Calendar admin consent | Microsoft needs your IT admin to approve the calendar connection. | The portal has a link you can send them, or you can use a shared calendar instead. |
| Calendar disconnected later | Your calendar has disconnected. | Reconnect it so leads can keep booking. It takes one tap. |

### Calendar connected (async path, WhatsApp `broker_calendar_ok`)
"Hi {first_name}, your calendar is connected. Your next free slot is Tue 6 Oct, 10:00. Leads are only ever booked into free times like this one." Button: **Next step**.

### Agreement copy (email only, from howzit@, bcc howzit@; on `agreement.signed`)
Subject "Your signed SortMyCover agreement". Body: "Hi {first_name}, thanks. Your signed agreement is attached. Signed by {signatory_name} on {date} at {time}. Document fingerprint (SHA-256): {hash}. We keep a copy for both of us. Next: {next_step}. [Next step]" (Attachment: signed PDF and the authorisation letter.)

### Ready-for-go-live (WhatsApp `broker_onboarding_ready`; on `ready_for_go_live`)
"Hi {first_name}, your setup is done and checked. Jonathan will switch you on shortly, and we will message you the moment you are live." (No time promised.)

### You're live (on `go_live.approved`; WhatsApp `broker_live` + email)
- **WhatsApp:** "Hi {first_name}, you're live. New leads can now be booked into your calendar. Each one reaches you as a WhatsApp message with the time and method. You'll get a morning list at 07:30, a short brief 15 minutes before each call, and your first report on {first_report_day} at 07:00." Button: **Open my leads**.
- **Email** subject "You're live on SortMyCover: what to expect in week 1". Body: "What to expect: (1) Bookings appear in your Outlook calendar on their own. (2) After each meeting we'll ask you three quick taps: what happened, how the lead was, a score. It takes about 20 seconds. (3) Replacements: a no-show, a number we can't reach, or a lead outside the age or budget we agreed can be replaced, up to your limit. (4) Your weekly report arrives Monday at 07:00. Questions? Reply to this email."

## Go-live gate

**Pre-flight (compliance-qa; 6.1 step 3).** Triggered once by W20 when `onboarded`. Returns a pass/fail card.
| # | Check | Pass when |
|---|---|---|
| 1 | `fsp_verified` | `fsp_check.status = verified`, checked within 30 days |
| 2 | `consent_mode_set` | `consent_mode` is `named` (0.1 default) or `generic` with the opinion recorded |
| 3 | `intro_card_gate` | Card details match the `brokers` row and the FSCA register; broker approval on file; if any script exists it passed the no-advice gate; else "no script submitted: pass" |
| 4 | `calendar_slots` | W04 returns at least 3 free slots in the horizon and a test event can be created and deleted |
| 5 | `test_lead_e2e` | A synthetic lead (`is_synthetic`) runs intake -> disclosure with this broker's name -> booking -> reminder (time-shifted) -> outcome, delivered only to Jonathan's test number |

Result card shape: `{run_id, broker_id, ran_at, checks:[{id,label,pass,detail}], all_pass}` stored in `brokers.preflight_card`.
- **All pass:** status `ready_for_go_live`; Jonathan gets the `ops_gate` WhatsApp ("Gate waiting: Go live for {broker}. 5 of 5 checks passed. Default if nothing is done: waits. Tap below to review.") with a deep link to the console card **Approve & go live** (one tap, HUMAN GATE; the pre-flight result expires after 24 h and is re-run if stale).
- **Any fail:** status stays `onboarded`; alert to Jonathan and KG with the failed check; if the fix is the broker's (calendar, card), the broker gets an issue message above.
- **Approve & go live:** console calls W20 `go_live.approved` (admin role only). W20 sets `status = active`, `approved_live_by/at`, `routing_on = true`, then hands off to W26/W16's go-live step (`GO_LIVE_HANDOFF_URL`): media budget raised by the broker's `media_share_zar` via the Meta Marketing API, routing capacity applied, CAPI/offline event sets confirmed (ads-api-engineer + automation-engineer). Then the "You're live" message. A failed hand-off leaves `ready_for_go_live` with an alert; nothing is announced to the broker until the hand-off succeeds.

**What the broker sees while waiting:** Start here shows "Everything is checked. Jonathan will switch you on shortly. We'll WhatsApp you."
