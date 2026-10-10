# 07 My leads

**Route:** `/broker/leads` (default landing once `active`). **Prototype:** `portal/prototype/leads.html`. **Inspired by:** Intercom/Appcues (the next action is obvious and short), Lemonade (one tap, says what it did). Extends `BrokerLeads.tsx` (crm-gap B2); legacy lead views stay for legacy brokers.

## Sections (top to bottom, same order always)
1. **Your cycle** (`v_cycle_progress`): "{delivered} of {committed} delivered . day {d} of {n}", progress bar, "booked . attended (show rate, target 65%) . replacements {used} this cycle". Traffic light only on show rate. (10 Oct 2026: no "of cap" is shown. The per-cycle cap is an internal W13 allowance; the published rule is goodwill, 3 requests per calendar week on every plan, so a "used of cap" figure would contradict it.)
2. **Today: {n} meetings.** One row per booking: time, lead full name (inside the portal only), method, language, age band, budget band, **Brief** button. Join link (Teams/Meet/Zoom) or "Number to call" only where the method is a call method (as in the `precall_brief` template).
3. **Pre-call brief** (expands in place; same content as the WhatsApp `precall_brief` T-15): what the lead asked before the call, preferences (method, best time, language), contact number for call methods, bond/dependants answers if given, and "Has a health question for you." when flagged. **Never the health detail or any ID number** (2.1.7). A "Not my kind of lead" link is not offered (replacements run through dispositions only).
4. **Meetings to mark** (the disposition flow below), unconfirmed ones first.
5. **Leads who said they weren't reached** (W12 lead side "No, not yet"): a flagged row "{First name L.} says they haven't heard from you. Please call today." with a "Called" button. Feeds the report's to-dos.
6. **Coming up** (next 7 days) and **Past** (this cycle, with outcome, disposition, rating).
7. **Replacements** (read-only): used this cycle and the goodwill rule (up to 3 requests per calendar week on every plan, for no-shows and leads the broker could not reach, with proof); each replacement with its state (`due / disputed / approved / fulfilled`). "What counts as a replacement" link to Help.

## The mark-an-outcome flow (4.12a; same words in the portal, WhatsApp, CRM and Schedule C; NH-19 label set)
Max 3 taps plus an optional note; under 20 s.
1. **Outcome** buttons: `Attended` / `No-show` / `Rescheduled`.
   - No-show: "We'll offer {first name} a new time. If they don't rebook within 48 hours it can become a replacement." (W13)
   - Rescheduled: nothing more to mark.
2. **Disposition** (only after Attended), six buttons, one tap:
   | Code | Button label (25 chars max) | Replacement-eligible |
   |---|---|---|
   | `fit_proceeding` | Good fit - proceeding | No |
   | `fit_followup` | Good fit - follow-up | No (a reminder in 7 days for his own follow-up) |
   | `nofit_budget` | Not a fit - budget | No |
   | `nofit_covered` | Not a fit - well covered | No |
   | `nofit_criteria` | Not a fit - criteria | Yes, if age or budget was misdeclared (after the 48-hour check) |
   | `unreachable` | Unreachable/wrong number | Yes (after the 48-hour check) |
   The two eligible buttons carry a small "(replacement-eligible)" tag. (Prototype uses `rep` styling.)
3. **Quality 1 to 5** ("How was this lead? 1 poor, 5 great").
4. **Optional voice note** ("Anything we should know? Hold to record", up to 60 s; transcribed, summarised to 2 lines; stored on the lead; never sent to the lead).
5. Confirmation: "Logged." plus the W29 "what changed" line when available ("That ad angle is now rated 4.2 from 6 of your calls. We're putting more behind it.") and "{n} more to mark."
- **Unmarked at 24 h:** recorded as `attended` with `unconfirmed = true`; shown as "Unconfirmed" with a "Mark now" button. Two unconfirmed in a cycle: Jonathan calls the broker (4.12a). Copy on screen: "Not marked within 24 hours? We record it as attended and flag it, so please mark in time."
- **Edits:** a marked outcome can be changed by the broker until the cycle ends, except once a replacement claim exists for it (then Jonathan decides). **ASSUMPTION** (4.12a is silent); needs_human NH-BS-06.

## Writes (RLS: broker INSERT/UPDATE on own bookings only, via a function so the status rules cannot be bypassed)
`outcomes(booking_id, lead_id, broker_id, cycle_id, outcome, disposition_code, quality_score, voice_note_url, transcript, summary, marked_by='broker', marked_at, auto_marked=false, unconfirmed=false)`. Fires W29 (feedback loop) and W13 (replacement logic). The codes follow 4.12a and the already-built templates (`fit_proceeding`...). crm-gap A1 lists `good_fit_proceeding`-style codes: one set must win, see needs_human NH-BS-07.

## Copy (Grade 7)
- Heading when meetings are waiting: "{n} meetings to mark". Sub: "Takes about 20 seconds each. Same buttons you get on WhatsApp."
- Empty: "No meetings today. Your next one is {Tue 10:00} with {Pieter B.}."
- Nothing yet (new broker): "Your first lead will land here. We'll WhatsApp you the moment someone books."

## Step clip: "Marking outcomes" (35 s)
| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Today list, tap Brief | "Today's meetings are here. Tap Brief to see what the lead asked before the call." |
| 0:10 | Meeting to mark; tap Attended | "After each meeting, tap what happened." |
| 0:17 | Disposition buttons, then 1 to 5 | "Then tap how the lead was, and give it a score from one to five. That's it, about twenty seconds." |
| 0:27 | Replacements line | "No-shows, numbers we can't reach and leads outside the age or budget we agreed can become replacements. 'Didn't buy' never does." |

## Events and measures
Measures: **disposition rate (dispositions / attended) target 90% or more**, time from meeting end to mark, unconfirmed count per cycle, brief opens before the call.
