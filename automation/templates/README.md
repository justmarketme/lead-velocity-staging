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
| 22 | `broker_disposition` | 2 | UTILITY | none | 1 lead first name + initial | QR × 6, NH-19 label set: Good fit – proceeding · Good fit – follow-up · Not a fit – budget · Not a fit – well covered · Not a fit – criteria · Unreachable/wrong number (payload = `fit_proceeding`, `fit_followup`, `nofit_budget`, `nofit_covered`, `nofit_criteria`, `unreachable`) | W12, **out-of-window fallback only**. Normal path = in-window list `session/broker_disposition_list.json` (see Disposition choice) |
| 23 | `broker_quality` | 2 | UTILITY | none | 1 lead first name + initial | QR 1 · 2 · 3 · 4 · 5 | W12 |
| 23a | `broker_fit_followup` | 2 | UTILITY | none | 1 adviser first name · 2 call date ("Thu 15 Oct") · 3 lead first name + initial | QR Followed up · Still to do (payload = `fit_followup:{lead_id}:done` / `:open`) · URL Open in portal (1 = lead path) | W12/W29: 7 days after a `fit_followup` disposition (4.12a "his follow-up, our nudge"). Sent once; no further nudge. *Added: not in the 4.6 list* |
| 24 | `broker_feedback_thanks` | 3 | UTILITY | none | 1 "what changed" line (W29) | — | W12/W29 |
| 25 | `broker_daily_digest` | 2 | UTILITY | TEXT | 1 adviser first name · 2 count · 3 "09:00 Lerato M. (Teams); …" | URL Open today | W11 (07:30) |
| 26 | `precall_brief` | 2 | UTILITY | TEXT | 1 lead first name + initial · 2 time · 3 method · 4 number to call · 5 best time · 6 age band · 7 budget band · 8 asked before the call (redacted, 2.1.7) · 9 language | URL Open brief | W11 (T-15 min) |
| 27 | `broker_weekly` | 3 | UTILITY | TEXT | 1 one-liner · 2 delivered (value · target · last week) · 3 booked · 4 show rate · 5 to-dos · 6 one ask | URL Do it now · URL Open report | W14 (Mon 07:00) |
| 27a | `broker_weekly_noask` | 3 | UTILITY | TEXT | 1 one-liner · 2 delivered (value · target · last week) · 3 booked · 4 show rate · 5 to-dos | URL Open report | W14 (Mon 07:00) when there is no ask this week (W14-broker.md R04). Replaces the "Nothing this week" workaround |
| 28 | `broker_midcycle` | 3 | UTILITY | TEXT | 1 cycle month · 2 delivered · 3 committed · 4 booked · 5 attended · 6 avg rating · 7 status line · 8 cycle end date | URL Open report | W14 (day 15) |
| 29 | `broker_cycle_end` | 3 | UTILITY | TEXT | 1 cycle month · 2 end date · 3 delivered · 4 committed · 5 good-fit meetings · 6 avg rating · 7 replacements / extension / credit line | URL See renewal offer · URL Open report | W14 / W19 |
| 29a | `broker_renewal_reminder` | 3 | UTILITY | TEXT | 1 adviser first name · 2 "3 days" / "1 day" · 3 cycle end date ("Fri 13 Nov") · 4 payment reference · 5 card line ("Card auto-renew is off." / "Card auto-renew is on, we charge your card at cycle end.") | URL Pay now (1 = payment reference) | W19 at T-3 and T-1 (NH-BA-08). No amount in the template: the price comes from the invoice/checkout (3.6, W25) |
| 29b | `broker_booking_changed` | 3 | UTILITY | TEXT | 1 adviser first name · 2 lead first name + initial · 3 method · 4 old time ("Tue 13 Oct, 11:30") · 5 new time ("Wed 14 Oct, 14:00") or `Cancelled` | URL Open the day (1 = `calendar?day=YYYY-MM-DD`, the new day; the old day on cancel) | W10 when a lead moves or cancels and the broker's 24-h window is closed (in-window: session text, as before; email from howzit@ always). I-35a. *Added: not in the 4.6 list* |
| 29c | `broker_autorenew_off` | 3 | UTILITY | TEXT | 1 adviser first name | URL Open billing (1 = `billing`) | W19 `POST /billing-autorenew` after card auto-renew is switched off. No amount, no card details. I-35j, replaces the `broker_onb_next` stand-in. *Added: not in the 4.6 list* |
| 30 | `ops_pulse` | 3 | UTILITY | TEXT ("Pulse {{1}}" = date) | 1 status pill · 2 do-today titles (≤ 3) | URL Open Today | W32 (07:00) |
| 30a | `ops_pulse_quiet` | 3 | UTILITY | none | 1 date ("Thu 2 Oct") · 2 memo line ("Next weekly memo Monday." or, on Mondays, "Weekly memo at 06:00 today.") | — | W32 on a quiet day (one line, no button). W32 sends params [dayLabel, memo line], no header, no button |
| 31 | `ops_action` | 3 | UTILITY | TEXT | 1 title · 2 number it moves + forecast · 3 cost · 4 evidence grade · 5 owner agent | QR Approve · Later (payload = proposal id) | W32 |
| 31a | `ops_action_confirmed` | 3 | UTILITY | TEXT | 1 proposal title · 2 task id · 3 owner agent · 4 check date ("Mon 19 Oct") · 5 approved by | URL Open Today (1 = `today`) | W32 approve-confirm step (I-36a), name from `cfg.confirm_template`. Ops only, no STOP line. *Added: not in the 4.6 list* |
| 32 | `ops_alert` | 3 | UTILITY | TEXT | 1 what · 2 since when · 3 impact · 4 first action | URL Open console | W22 |
| 33 | `ops_weekly` | 3 | UTILITY | TEXT | 1 week of · 2 one thing · 3 top signals · 4 forecast vs actual | URL Open memo | W32 (Mon 07:00) |
| 34 | `ops_gate` | 3 | UTILITY | TEXT | 1 gate · 2 status sentence · 3 default if no action | URL Review gate | build gates / W26 / W28 |
| 35 | `broker_intro_slots_v2` | after Flow publish | UTILITY | IMAGE | 1–4 as `broker_intro_slots` | FLOW Pick a time (`data_exchange` → INIT) | W06 when `brands.booking_ui = flow` |
| 36 | `reschedule_offer_v2` | after Flow publish | UTILITY | none | 1 first_name · 2 adviser_name · 3 current date · 4 current time | FLOW Pick a new time | W10 when `booking_ui = flow` |
| 37 | `broker_onb_welcome` | 3 (onboarding batch) | UTILITY | TEXT | 1 adviser first name | URL Open my portal (1 = magic-link token) · URL 3-minute video (1 = `start`) | W20 `broker.created` |
| 38 | `broker_onb_next` | 3 | UTILITY | TEXT | 1 first name · 2 step just done · 3 next step title · 4 minutes | URL Next step (1 = step key) | W20 `step.completed` when the broker left the portal > 10 min ago |
| 39 | `broker_onb_calendar_ok` | 3 | UTILITY | TEXT | 1 first name · 2 next free slot label | URL Next step (1 = `availability`) | W20 `calendar.connected` with ≥ 1 slot, broker away |
| 40 | `broker_onb_ready` | 3 | UTILITY | TEXT | 1 first name | URL Open my portal (static) | W20 pre-flight pass → `ready_for_go_live` |
| 41 | `broker_onb_nudge_24h` | 3 | UTILITY | TEXT | 1 first name · 2 stalled step · 3 minutes · 4 why-it-matters sentence | URL Carry on (1 = step key) | W20 sweep, 24 h without progress (08:00–19:00 only) |
| 42 | `broker_onb_nudge_72h` | 3 | UTILITY | TEXT | 1 first name · 2 stalled step · 3 reassurance sentence | URL Finish setup (1 = step key) | W20 sweep, 72 h without progress (+ email + console to-do) |
| 43 | `broker_onb_issue` | 3 | UTILITY | TEXT | 1 first name · 2 what went wrong (sentence) · 3 what to do (sentence) | URL Fix it (1 = step key) | W20 FSCA block / pending, calendar 0 slots / failure, pre-flight calendar fail |
| 44 | `broker_onb_live` | 3 | UTILITY | TEXT | 1 first name · 2 first report day ("Monday 12 Oct") | URL Open my leads (static) | W20 after Approve & go live and a good hand-off |

**Category:** every template is submitted as UTILITY. Meta makes the final category decision. Following 0.3 #1, we accept it and log it (the cost difference is small). See SUMMARY `needs_human` about the conflicting 4.6 sentence ("rewrite rather than accept"). The templates most likely to be re-categorised as marketing are `unbooked_nudge_*`. Each one ties itself to "your enquiry", has no offer and no urgency, and the 72-h one closes the thread.

**Onboarding batch (added 2026-10-02, I-07):** the 8 portal templates from `portal/spec/proposed-templates.json` (broker-success copy, unchanged except one sentence) are renamed with the `broker_onb_` prefix. `automation/W20.json` still sends the proposal names (`broker_onboarding_welcome`, `broker_onboarding_next`, `broker_calendar_ok`, `broker_onboarding_ready`, `broker_onboarding_nudge_24h`, `broker_onboarding_nudge_72h`, `broker_onboarding_issue`, `broker_live`); the W20 owner swaps them 1:1 (same parameters and URL suffixes) before import. `broker_onb_issue` reads "a small snag with your setup. {{2}} Next: {{3}}" instead of "…setup: {{2}} {{3}}" so two variables never sit side by side.

**Disposition choice (I-07, NH-19 b):** the disposition question is always asked straight after the broker taps *Attended* on `broker_outcome_check`, and that tap opens the 24-h window. So W12 sends it as an **in-window interactive list** (`session/broker_disposition_list.json`: 6 rows in 3 sections, row titles are the NH-19 labels word for word, all ≤ 24 characters, row ids are the 4.12a codes). No template is needed on the normal path. `broker_disposition` (6 quick replies, same labels) is kept only for the out-of-window case (for example, the broker marked *Attended* in the portal and W12 still wants the taps). A split into `_1` (first 3 + "More options") and `_2` was considered and not built: `_1` would itself carry 4 buttons, so it would not fix a 3-button limit, and this folder already relies on 4- and 5-button templates (`broker_intro_slots`, `missed_you`, `booking_confirmed`, `broker_quality`). Our working limit is 10 buttons per template, with WhatsApp showing 3 inline and the rest under "See all options" (not re-verified in this pass: no web lookups). If Meta review rejects the 6-button template, W12 uses the list only and the template is dropped.

**Review samples (text):** `samples/<name>.txt` is a plain-text render of a template with its example values (header, body, footer, buttons), for the reviewer and for meta-operator's submission notes. Present for `broker_booking_changed`, `broker_autorenew_off` and `ops_action_confirmed`. `check.mjs` fails if a sample no longer matches its template. They are never uploaded (only `__UPLOAD_HANDLE__` files are).

**Checks:** `node automation/templates/check.mjs` re-runs the generator checks over every file (limits, positional parameters + examples, variable position, STOP line on lead-facing templates, banned words and jargon, emoji, lead full names in broker/ops examples, URL hosts) and confirms every file is in `submit.sh` and in this index. `session/` holds session-message bodies; they are never submitted.

**Wording notes:**
- `broker_intro_booked` uses the exact 4.6 text.
- `broker_intro_slots` uses the exact 4.6 sentences in order. Three slot lines are added after "Pick a time below.", because quick-reply button text cannot carry variables.
- `_v2` uses the exact 4.6 text with no slot lines.
- `broker_disposition` buttons are the NH-19 single label set (all ≤ 25 characters): portal, CRM, Schedule C and the in-window list use the same words.
- `broker_fit_followup` (added 2026-10-02) names the lead only as first name + initial, says the follow-up is the broker's own (FAIS), and carries no lead data beyond that. Second submission batch, not CORE.
- `broker_booking_changed` (I-35a) names the lead as first name + initial only, shows old and new time side by side with the method, and says the Outlook event is already updated, so the broker has nothing to do. Variable 5 is the new time, or `Cancelled`. It replaces W10's email-only fallback outside the broker's 24-h window (the email still goes as the written record).
- `broker_autorenew_off` (I-35j) has no amount and no card details. It says no lock-in in the same words as `broker_renewal_reminder`, and names manual EFT as the zero-fee option (0.1).
- `lead_pulse` uses text buttons instead of the thumbs-up and thumbs-down emoji named in 6B.2, following the 4.11 no-emoji rule.
- When `ops_pulse` is Green, it still carries its button. The body reads "All within limits. Nothing to do today."
