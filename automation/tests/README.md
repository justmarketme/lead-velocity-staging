# Core-path acceptance tests (DRAFT, for Jonathan: GATE-TEST-W01 … W15)

4C.2 "Spec and test first" says Jonathan writes or approves the acceptance tests for the 8 core-path nodes, and **no workflow is built until its test is approved**. Each file below is that test. Edit any expected value and the rule changes with it.

## How to run
Node 18+ is needed. No `npm install`.

```bash
# Offline: runs today against the small reference implementation inside each file
for f in W01 W04 W05 W06 W09 W12 W13 W15; do node --test automation/tests/$f.test.mjs; done
# or all eight at once (file form; note automation/tests/ also holds W22.test.mjs from devops-security, which W*.test.mjs would pick up)
node --test automation/tests/W0{1,4,5,6,9}.test.mjs automation/tests/W1{2,3,5}.test.mjs
```
- Do **not** use `node --test automation/tests/` (the directory form). On Node 22 it fails with "Cannot find module". The attribution-analyst found the same problem for `automation/capi/`.
- **Online mode:** start local n8n (`docker compose -f automation/docker-compose.yml up -d`) and the tunnel. Then set the variables and run the same command:
  - `N8N_PUBLIC_URL=https://<tunnel>`
  - `TEST_HOOKS_TOKEN=…`
  - `META_APP_SECRET=…` (signs the fake WhatsApp webhooks)
  - `N8N_WEBHOOK_PREFIX` (default `/webhook`)

  To force offline mode, set `SMC_TEST_OFFLINE=1`. Tests that need real phones or fault injection are skipped online with a reason, and are covered by the rehearsal below.
- **Test hooks (staging only, built with the workflows):** `GET /test/state?lead_id|mobile`, `POST /test/tick`, `/test/reset`, `/test/seed-calendar`, `/test/seed-lead`, `/test/seed-booking`, `/test/seed-outcome`, `/test/leadgen`, `/test/suppress`, `/test/bounce`. They are guarded by `TEST_HOOKS_ENABLED` + token + `is_synthetic`. See `fixtures/time-shift.md`.

## Files
- `fixtures/synthetic-leads.json`: 10 synthetic leads, the broker (adviser "Mark Smith", practice and FSP = the seeded broker in `supabase/seed/smc_synthetic.sql`), the cycle, the pricing caps, and the expected outcome per workflow. The `_meta.assumptions` block lists every assumption.
- `fixtures/align-fixture.mjs` (I-52b): renders every named consent text from `landing/config/consent.json` (current named version) for the seeded practice + FSP, and keeps lead numbers at +27 60 000 01xx, clear of the seed's leads (00xx) and broker (0099), so a real `POST /lead` with a fixture body passes W01's registry check. `--check` fails if the fixture drifted; never hand-edit those texts.
- `fixtures/time-shift.md`: how timing is tested without waiting.
- `_harness.mjs`: loads the fixtures and holidays, has the SAST time helpers, the online client, and renders real template bodies.
- `_slots.mjs`: the shared slot rules (owned by W04; reused by W05/W06).
- W09, W12, W13 no longer carry a reference implementation: they import the real logic (`automation/lib/w09.mjs`, `w12.mjs`, `w13.mjs`) and run the Code nodes of the real `automation/W09.json`, `W12.json`, `W13.json` (`_n8ncode.mjs` executes a node's `jsCode` the way n8n does). Every original assertion and fixture is unchanged. Regenerate the workflows with `node automation/build-w09-w12-w13.mjs`.

## What each test protects (plain English)
| Test | The money rule it protects | It passes when |
|---|---|---|
| **W01** intake | We only count and message real, consented SA mobile leads that are not duplicates, and the broker is chosen before any WhatsApp | Numbers normalise to +27…. Landline/VoIP get "Please use a mobile number." Consent wording, time, page and source are stored word for word. A repeat within 90 days merges with no new WhatsApp and no new Meta event (day 91 is a new lead). broker_id and cycle are written before the first-touch job exists. The Meta `Lead` event reuses the browser's event id. Out-of-band leads are not handed over and are deleted within 24 h. CTWA "No thanks" stores only a hashed number. A STOPped number is never messaged |
| **W04** slots | We only offer times the broker can keep, and his week fills evenly | Every slot is inside his hours, on the 30-min grid, at least 2 h ahead and no more than 14 days out. There are 15 min clear around every Outlook event and every booking. A day with 3 meetings or a week with 12 offers nothing. Holidays are blocked. The 3 offers are on 3 different days. A calendar error falls back to "pick on WhatsApp". Two hand-computed offer lists (L02, L03) match exactly |
| **W05** book | **Zero double-bookings**; email is used only for invites | Two people tapping the same slot at the same moment produce exactly one booking, and the other gets 3 new times. A slot taken in Outlook after it was offered returns the next 3. A retried request returns the same booking. The Outlook event has the right title, Teams link, number and consent reference, and the client is not an attendee. Email is checked (typo, MX, disposable), is only asked for Teams/Zoom/Meet, is sent from howzit@, and a bounce prompts the lead on WhatsApp |
| **W06** first touch | Every routed lead gets the disclosure (practice, FSP, adviser) **within 60 s** | 100% of the fixture leads are inside 60 s. The template is right (booked vs slots vs Flow v2). The real template text renders with practice, FSP number, adviser and the STOP line. Message id and delivery are logged as evidence. A failed WhatsApp falls back to SMS with the same disclosure. No message goes to out-of-band, duplicate, suppressed or opted-out leads |
| **W09** reminders | Show rate: several useful reminders, each sent once, at the right time | The hand-computed schedules for 5 leads match (full, mid-range, compressed). Every touch falls between booking and meeting. The intro video goes at T-48 h only if booked 3+ days out. The Confirm tap sets "confirmed". A reschedule cancels and rebuilds without repeating the intro. STOP cancels everything. Each job is sent once even if the scheduler runs twice. Each lead gets 12 messages or fewer |
| **W12** outcome | A no-show counts only when the lead's side agrees; nothing sits in limbo | Broker check at slot end + 15 min, lead check at + 30 min, one nudge at + 3 h. Broker "No-show" with the lead saying "No, not yet" is a **broker** no-show (apologise and rebook, no replacement). Broker silent and lead silent at 24 h is attended + unconfirmed. A lead no-show is confirmed only after the 2-h reach window. When the two sides disagree, it goes to the console queue. The disposition buttons map 1:1 to the six codes |
| **W13** replacement | A replacement is goodwill, at Lead Velocity's discretion, and only on a broker's proof request (clause 7) | A lead no-show gets one missed_you offer and nothing else. The broker sends a photo or screenshot 10 to 30 minutes after the start: a no-show (the place and time, or the empty call) or a lead he could not reach (call log or chat showing at least 2 attempts and no reply, or a wrong number). At most 3 requests per Calendar Week per broker, both kinds combined; the per-cycle cap in the pricing row stays in the data and drives nothing. Lead Velocity decides each request. Never for a broker no-show, never for "didn't buy". A short cycle extends up to 14 days, and the rest is credited pro rata, capped at the price |
| **W15** STOP | POPIA: the licence to operate | STOP in any case, anywhere (quiz, nurture, reminders), is caught; "don't stop" and the booking "Cancel" are not. The lead is opted out, every future job is cancelled, the booking is released, the broker is told by WhatsApp and email (first name only), and the number is suppressed LV-wide as a hash. Exactly one confirmation goes out and nothing after. A second STOP is a no-op |

## 6B.10 day-in-the-life rehearsal (Phase 5, 60 minutes, production URLs) — outline
Jonathan is the lead on his own phone. KG is the broker in the portal and on a test broker WhatsApp. The broker row is a copy of Mark's config with KG's calendar.
1. **(0:00) Ad to page.** Open a staging ad preview, do the quiz, submit, and book Teams on the page. Check: intro card under 60 s with practice/FSP/adviser, Teams invite from howzit@, Outlook event (amber category), `broker_new_booking` to KG, Meta Events Manager shows `Lead` + `Schedule` deduplicated. Pass = W01/W05/W06.
2. **(0:10) Reschedule** from the card, then **cancel and rebook** once. Check: one event moved (not two), KG notified each time. Pass = W10.
3. **(0:15) Reminders at speed.** On staging hooks, book a slot 2 h 15 min out and tick the virtual clock. Check: what_to_expect, intro media, T-2 h, T-10 min arrive in order on the real phone, and the Confirm tap shows "confirmed" in the console. Pass = W09.
4. **(0:25) Outcome.** KG taps Attended, then a disposition, then a quality score, and records a voice note. Jonathan answers the reach-check. Check: outcome row, `Attended` offline event, thank-you to the lead, lead pulse. Pass = W12/W35.
5. **(0:35) No-show path.** A second booking. KG taps No-show and Jonathan stays silent. Check: missed_you after the window and no replacement opened by itself; then the broker sends proof 10 to 30 minutes after the start and one request shows in the console for Lead Velocity to decide (3 a Calendar Week, no-shows and unreachables combined). Then repeat with Jonathan answering "No, not yet": broker no-show, apology, no replacement. Pass = W12/W13.
6. **(0:45) CTWA.** Click-to-WhatsApp from a test ad: consent, then taps, then routed, then booked from the 10-slot list (the Flow if it is published). Repeat with "No thanks": nothing stored but the hash. Pass = W03.
7. **(0:50) STOP.** Jonathan replies STOP mid-sequence. Check: confirmation, no further messages after ticking past the meeting, KG notified, event removed, console shows suppression. Pass = W15.
8. **(0:55) Drills and failure.** Kill the Graph token (W04 must fall back to "pick on WhatsApp"). Send to a number with WhatsApp off (SMS fallback). Send an email bounce (prompt in chat). Review the 60-s latency tile and the error log. Anything red becomes a task before Go live.
