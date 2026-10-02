# WhatsApp message templates: index

Each `*.json` file is the exact body for `POST /{WABA_ID}/message_templates`: `name`, `language: en`, `category: UTILITY`, `components`. Variables are positional (`{{1}}`) and every file includes `example` values. **Nothing has been submitted.** Template submission is a HUMAN GATE (2.2). Jonathan runs `./submit.sh --submit --core` first, then `./submit.sh --submit`. The default is `--dry-run`.

**Rules the copy follows:** 2.1.8 (money only in the third person, for example "some people like to have a recent payslip nearby"). Grade 5–7 English. No product, insurer, premium, cover amount or advice. Every lead-facing template ends with **"Reply STOP to opt out."** Templates to brokers and ops show a lead only as first name + initial ("Lerato M."), never the full name (POPIA, 4.10a). No emoji (4.11).

**Placeholders resolved by `submit.sh`:** `__UPLOAD_HANDLE__:<file>` uploads review samples from `samples/` (`intro_card_sample.png` 1080×1080 from visual-producer, `intro_video_sample.mp4` 9:16 under 16 MB). `__BOOKING_FLOW_ID__` / `__RESCHEDULE_FLOW_ID__` are filled from `.env` after the Flow is published (W28). The `samples/` folder does not exist yet. Submitting the IMAGE/VIDEO templates is blocked until visual-producer puts the two files there.

**Send-time notes for the workflows:**
- Quick-reply button text is fixed at review. The payload (slot ISO time, disposition code, booking id) is set when the message is sent, as `{"type":"button","sub_type":"quick_reply","index":N,"parameters":[{"type":"payload","payload":"..."}]}`.
- Parameter values must not contain newlines, tabs or more than 4 spaces in a row. Digest lists are joined with `; `.
- URL buttons: `https://sortmycover.co.za/c/{{1}}` (`.ics` download and "add to calendar" page). devops-security must route `/c/` and `/j/` on the consumer domain.

## Index (submit order: CORE first)

| # | Name | Priority | Category | Header | Variables (meaning) | Buttons | Sent by |
|---|---|---|---|---|---|---|---|
| 1 | `broker_intro_booked` | **CORE** | UTILITY | IMAGE (broker intro card, 4.10) | 1 first_name · 2 practice_name · 3 fsp_number · 4 adviser_name · 5 method · 6 date · 7 time | URL Add to calendar (1 = booking ref) · QR Reschedule · QR Cancel | W06 (first touch, page-booked), W05 |
| 2 | `broker_intro_slots` | **CORE** | UTILITY | IMAGE (intro card) | 1 first_name · 2 practice_name · 3 fsp_number · 4 adviser_name · 5–7 slot labels ("Tue 7 Oct, 10:00") | QR Time 1 · Time 2 · Time 3 · Other times | W06 (not booked), W03 |
| 3 | `booking_confirmed` | **CORE** | UTILITY | TEXT | 1 first_name · 2 adviser_name · 3 date · 4 time · 5 method | URL Add to calendar · QR Confirm · Reschedule · Cancel | W05 (booked in WhatsApp), W10 |
| 4 | `reminder_24h` | **CORE** | UTILITY | TEXT | 1 first_name · 2 method · 3 adviser_name · 4 time | QR Confirm · Reschedule | W09 |
| 5 | `reminder_2h` | **CORE** | UTILITY | none | 1 first_name · 2 adviser_name · 3 time · 4 method detail (join link or "Mark will call you on …") | QR Reschedule | W09 |
| 6 | `missed_you` | **CORE** | UTILITY | none | 1 first_name · 2 adviser_name · 3–5 slot labels | QR Time 1 · Time 2 · Time 3 · Other times | W13 |
| 7 | `reminder_10m` | 2 | UTILITY | none | 1 first_name · 2 adviser_name · 3 join link or "calling you from {number}" | — | W09 |
| 8 | `what_to_expect` | 2 | UTILITY | TEXT | 1 first_name · 2 adviser_name · 3 method | URL Add to calendar | W09 (T0+10 min) |
| 9 | `reschedule_offer` | 2 | UTILITY | none | 1 first_name · 2 adviser_name · 3–5 slot labels | QR Time 1 · Time 2 · Time 3 · Other times | W10 |
| 10 | `attended_thanks` | 2 | UTILITY | none | 1 first_name · 2 adviser_name | — | W12 → attended path |
| 11 | `prep_nudge` | 2 | UTILITY | none | 1 first_name · 2 adviser_name | — | W09 (T-24 h) |
| 12 | `intro_media` | 2 | UTILITY | VIDEO (broker intro video, captions burned in) | 1 first_name · 2 adviser_name · 3 date · 4 time | QR Looking forward to it · Reschedule | W09 (T-48 h, or straight after booking if < 3 days) |
| 13 | `intro_media_voice` | 2 | UTILITY | TEXT ("A voice note from {{1}}" = adviser_name) | 1 first_name · 2 adviser_name · 3 date · 4 time | QR Play voice note · Reschedule | W09, when there is no video or the lead is on low data. Templates cannot have an audio header, so the tap opens the 24-h window and W09 then sends the OGG/Opus note as a session message |
| 14 | `unbooked_nudge_2h` | 2 | UTILITY | none | 1 first_name · 2 adviser_name | QR See open times · Not now | W08 (+2 h; CTWA stall path +1 h) |
| 15 | `unbooked_nudge_24h` | 2 | UTILITY | VIDEO (intro video) | 1 first_name · 2 adviser_name | QR See open times · Not now | W08 (+24 h; CTWA +20 h) |
| 16 | `unbooked_nudge_24h_text` | 2 | UTILITY | TEXT ("Meet {{1}}" = adviser_name) | 1 first_name · 2 bio_short sentence | QR See open times · Not now | W08 when the broker has no approved video (0.3 #12) |
| 17 | `unbooked_nudge_72h` | 2 | UTILITY | none | 1 first_name · 2 adviser_name | QR See open times · No thanks | W08 (+72 h, last message; CTWA +68 h) |
| 18 | `reach_check` | 2 | UTILITY | none | 1 first_name · 2 adviser_name | QR Yes, we spoke · No, not yet | W12 lead side (T+30). *Added: not in the 4.6 list* |
| 19 | `lead_pulse` | 3 | UTILITY | none | 1 first_name · 2 adviser_name | QR Yes, worth it · Not really | W35 |
| 20 | `broker_new_booking` | 2 | UTILITY | TEXT | 1 adviser first name · 2 lead first name + initial · 3 date · 4 time · 5 method · 6 age band · 7 budget band | URL Open in portal (1 = path) | W05 |
| 21 | `broker_outcome_check` | 2 | UTILITY | none | 1 adviser first name · 2 time · 3 lead first name + initial | QR Attended · No-show · Rescheduled | W12 (T+15 min) |
| 22 | `broker_disposition` | 2 | UTILITY | none | 1 lead first name + initial | QR × 6 (payload = `fit_proceeding`, `fit_followup`, `nofit_budget`, `nofit_covered`, `nofit_criteria`, `unreachable`) | W12. Inside the 24-h window, send an interactive list instead, with the full 4.12a labels |
| 23 | `broker_quality` | 2 | UTILITY | none | 1 lead first name + initial | QR 1 · 2 · 3 · 4 · 5 | W12 |
| 24 | `broker_feedback_thanks` | 3 | UTILITY | none | 1 "what changed" line (W29) | — | W12/W29 |
| 25 | `broker_daily_digest` | 2 | UTILITY | TEXT | 1 adviser first name · 2 count · 3 "09:00 Lerato M. (Teams); …" | URL Open today | W11 (07:30) |
| 26 | `precall_brief` | 2 | UTILITY | TEXT | 1 lead first name + initial · 2 time · 3 method · 4 number to call · 5 best time · 6 age band · 7 budget band · 8 asked before the call (redacted, 2.1.7) · 9 language | URL Open brief | W11 (T-15 min) |
| 27 | `broker_weekly` | 3 | UTILITY | TEXT | 1 one-liner · 2 delivered (value · target · last week) · 3 booked · 4 show rate · 5 to-dos · 6 one ask | URL Do it now · URL Open report | W14 (Mon 07:00) |
| 28 | `broker_midcycle` | 3 | UTILITY | TEXT | 1 cycle month · 2 delivered · 3 committed · 4 booked · 5 attended · 6 avg rating · 7 status line · 8 cycle end date | URL Open report | W14 (day 15) |
| 29 | `broker_cycle_end` | 3 | UTILITY | TEXT | 1 cycle month · 2 end date · 3 delivered · 4 committed · 5 good-fit meetings · 6 avg rating · 7 replacements / extension / credit line | URL See renewal offer · URL Open report | W14 / W19 |
| 30 | `ops_pulse` | 3 | UTILITY | TEXT ("Pulse {{1}}" = date) | 1 status pill · 2 do-today titles (≤ 3) | URL Open Today | W32 (07:00) |
| 31 | `ops_action` | 3 | UTILITY | TEXT | 1 title · 2 number it moves + forecast · 3 cost · 4 evidence grade · 5 owner agent | QR Approve · Later (payload = proposal id) | W32 |
| 32 | `ops_alert` | 3 | UTILITY | TEXT | 1 what · 2 since when · 3 impact · 4 first action | URL Open console | W22 |
| 33 | `ops_weekly` | 3 | UTILITY | TEXT | 1 week of · 2 one thing · 3 top signals · 4 forecast vs actual | URL Open memo | W32 (Mon 07:00) |
| 34 | `ops_gate` | 3 | UTILITY | TEXT | 1 gate · 2 status sentence · 3 default if no action | URL Review gate | build gates / W26 / W28 |
| 35 | `broker_intro_slots_v2` | after Flow publish | UTILITY | IMAGE | 1–4 as `broker_intro_slots` | FLOW Pick a time (`data_exchange` → INIT) | W06 when `brands.booking_ui = flow` |
| 36 | `reschedule_offer_v2` | after Flow publish | UTILITY | none | 1 first_name · 2 adviser_name · 3 current date · 4 current time | FLOW Pick a new time | W10 when `booking_ui = flow` |

**Category:** every template is submitted as UTILITY. Meta makes the final category decision. Following 0.3 #1, we accept it and log it (the cost difference is small). See SUMMARY `needs_human` about the conflicting 4.6 sentence ("rewrite rather than accept"). The templates most likely to be re-categorised as marketing are `unbooked_nudge_*`. Each one ties itself to "your enquiry", has no offer and no urgency, and the 72-h one closes the thread.

**Wording notes:**
- `broker_intro_booked` uses the exact 4.6 text.
- `broker_intro_slots` uses the exact 4.6 sentences in order. Three slot lines are added after "Pick a time below.", because quick-reply button text cannot carry variables.
- `_v2` uses the exact 4.6 text with no slot lines.
- `broker_disposition` buttons are shortened to fit Meta's 25-character limit (see SUMMARY `needs_human`).
- `lead_pulse` uses text buttons instead of the thumbs-up and thumbs-down emoji named in 6B.2, following the 4.11 no-emoji rule.
- When `ops_pulse` is Green, it still carries its button. The body reads "All within limits. Nothing to do today."
