# Thandi: conversation state machine (4.6 CTWA steps 1-7, 4.11, 4.12, 4.12a)

| | |
|---|---|
| Version | `state-machine-v1.0.0` (2026-10-02) |
| Implemented by | automation-engineer in W03, W05-W10, W12, W13, W15, W28, W35. The free-text decisions are code in `conversation/logic.mjs` (`decide()`), tested by `evals/run.mjs`. |
| Stored as | `leads.conv_state` + `facts` (every answer, never asked twice) + `conversations` (redacted transcript) |
| Order of steps | Matches the approved design references (`docs/design/sortmycover-end-to-end.html`, `sortmycover-chat-replay.html`) where they are explicit. |

**L1** = Layer 1, deterministic: buttons, lists, Flow screens, templates, fixed lines. Zero generated text. About 90% of turns.
**L2** = Layer 2, LLM: the lead typed free text. Intent/slot (Haiku) → `decide()` → reply (Haiku) → `outputGate` → guardrail classifier → `toneCheck` → send. About 10% of turns.

## 1. Entry points

| Entry | Trigger | First state | First message (< 60 s) |
|---|---|---|---|
| **Web, booked on page** | W01 → route (1.3) → W05 | `booked_await_commit` | `broker_intro_booked` template (L1). Commitment ask: in the session if the window is open; otherwise the lead's first reply opens it and Thandi's first reply carries `DISCLOSE` + `COMMIT_ASK` (see section 6). |
| **Web, not booked** | W01 → route | `unbooked` | `broker_intro_slots` (or `_v2` with the Flow button when `brands.booking_ui = flow`) (L1) |
| **Meta instant form** | W02 | as web | as web |
| **Click-to-WhatsApp** | W03, prefilled "Hi, I'd like to check my life cover" + CTWA referral (ad id stored) | `consent_pending` | `DISCLOSE_PRE_ROUTE` + `CTWA-*-v1` consent (L1, session message; the lead opened a 72-h free entry window) |

## 2. States

| State | What the lead sees | Layer | Leaves on | Next |
|---|---|---|---|---|
| `consent_pending` | Disclosure + consent, `Yes, continue` · `No thanks` | L1 (typed text → L2) | Yes / No / STOP | `q_age` / `closed_no_consent` / `opted_out` |
| `q_age` | "Great. Four quick taps… which age band are you in?" list | L1 | band tapped or typed | `q_budget`, or `closed_oob` if `Under 35` / `51 or over` |
| `q_budget` | "Roughly what could you put towards cover each month?" list | L1 | band | `q_bond`; `Under R750` → `closed_oob`; `Not sure yet` → `q_budget_clarify` |
| `q_budget_clarify` | "No problem, a rough idea is fine…" | L1 | band | `q_bond`; `Under R750` / `Really not sure` → `closed_oob` |
| `q_bond` | "Do you have a bond or people who depend on your income?" list (bond and dependants in one tap) | L1 | tapped or typed | `q_method` (`q_dependants` is kept only for rows written before NH-59 and also moves to `q_method`) |
| `q_method` | "How would you like to talk to {adviser_first}?" (only the broker's `methods_supported`) | L1 | tapped or typed | route → `unbooked` |

Order note (NH-59, default applied 2026-10-03): the questions follow master prompt 4.6 step 3, age → budget → bond/dependants → method, so a budget non-fit ends one question earlier; W03 asks every question and writes `leads.conv_state.state`, W07 hands typed answers to W03 (CONTRACTS.md "Inbound ownership").
| *(route, 1.3)* | nothing; code picks the broker before any adviser is named. Capacity ≥ 80% for 7 days → later dates offered (4.6) | code | | |
| `unbooked` | `broker_intro_slots` (3 slots + `Other times`) or `_v2` (Flow button "Pick a time"); intro card = disclosure (adviser, practice, FSP) | L1 | slot tapped / Flow opened / free text with a day/time | `booking` |
| `booking` | WhatsApp Flow (W28): method → CalendarPicker → slots (W04 `data_exchange`) → email only for Teams/Zoom/Meet → summary. Fallback: list of the next 10 slots; last resort: L2 asks for a preferred day and offers 3. | L1 | Flow complete / slot picked | W05 → `booked_await_commit`; slot gone → next 3 offered |
| `booked_await_commit` | `booking_confirmed` (W05), or `broker_intro_booked` for page bookings. Commitment ask (4.12) | L1 (+ L2 for the typed reply) | lead types date/time | match → `COMMIT_OK` → `contact_confirm` (call methods) or `booked`; mismatch → `COMMIT_CHECK` buttons |
| `contact_confirm` | Only for WhatsApp-call and phone: "Is this the number {adviser_first} should call you on?" → optional alt number → optional best time (4.6 contact table). Teams/Zoom/Meet skip it. | L1 | taps / typed number (Twilio Lookup, max 2 tries) | `booked` |
| `booked` | W09 sequence: T0+10 min `what_to_expect` (+ .ics) · T-48 h `intro_media` (or straight after booking if the call is < 3 days away) · T-24 h `reminder_24h` + `prep_nudge` · T-2 h `reminder_2h` · T-10 min `reminder_10m`. Booked < 24 h ahead: compressed (confirmation + T-2 h + T-10 min). | L1 | `Confirm` / `Reschedule` / `Cancel` / free text | `confirmed` / `rescheduling` / cancel confirm |
| `confirmed` | `CONFIRM_THANKS` (session message after the tap) | L1 | time passes | `meeting_due` |
| `rescheduling` | `SAME_METHOD` buttons if a method is stored, then `reschedule_offer` (3 slots) or `reschedule_offer_v2` (Flow pre-filled). Event moved, not duplicated (W10). Second reschedule → console flag. | L1 | new slot | `booked_await_commit` (commitment asked again, short form) |
| `meeting_due` | T-10 min link / "calling you now" | L1 | slot time | `outcome_pending` |
| `outcome_pending` | Broker: `broker_outcome_check` at T+15 → `broker_disposition` → `broker_quality` → optional voice note (4.12a). Lead: `reach_check` at T+30. | L1 | both sides | `attended` / `no_show` / `broker_no_show` |
| `attended` | `attended_thanks`; W35 `lead_pulse` after the reach-check (attended + 30 min, never before the reach-check is settled; reach-check `no` = no pulse; session `PULSE_ASK` inside the 24-h window, template `lead_pulse` outside). Tap → `PULSE_LINE_ASK_UP`/`_DOWN` once; the next free text within 24 h is the optional line (`conversation/pulse.mjs` `isPulseLine`; advice questions, person, STOP, complaints go the normal W07 way) → `PULSE_LINE_THANKS`. Then **nothing else from us** (FAIS). | L1 | | `closed_attended` |
| `no_show` | `missed_you` (3 new times, zero guilt, one offer) | L1 | slot tapped / 48 h silence | `booking` / W13 `replacement_due` |
| `broker_no_show` | Lead tapped "No, not yet" **and** the broker marked No-show/nothing by his +3 h nudge (R6-03; if the broker marks *Attended* or *Rescheduled*, no apology is sent and KG reviews the conflict): `BROKER_NO_SHOW_APOLOGY` + new times (W10); Schedule D path, KG alerted (W12/W13) | L1 | broker mark / broker-nudge time | `booking` |
| `handoff` | One fixed handoff line; bot paused (see `handoff.md`) | human | console "Hand back" | previous state |
| `closed_*` / `opted_out` | nothing further | | | |

## 3. Global interrupts (checked first, every inbound message, every state)

Priority order, exactly as `decide()` implements it:

1. **STOP** (`prefilter().stop` or intent `stop`) → W15: opt-out flag, cancel every scheduled send, notify the broker, send `STOP_ACK` once (or `STOP_ACK_CANCELLED` when the default cancel mode cancelled a live booking, R6-04; `STOP_ACK_BOOKED` only in keep mode), then nothing. Any later inbound from an opted-out lead goes to the console (`human_review`), no bot reply.
2. **Handoff paused** → no bot reply; forward to the human.
3. **Person / complaint** → `handoff`.
4. **Frustrated** → `handoff`.
5. **Prompt injection or impersonation** (`prefilter().injection` / `.impersonation`) → `STAY_IN_LANE` (+ `DEFER` if it also asked for advice). Nothing else in that message is acted on.
6. **Advice topic or health/ID** → the allowed parts are answered, then `DEFER` + `DEFER_NOTED` (+ `ID_WARNING`). The question is logged for the pre-call brief (health: "has a health question for you").

## 4. Free-text decision table (L2; what `decide()` returns)

| State | What they typed | Actions |
|---|---|---|
| `consent_pending` | "yes ok" / "ja" | `consent_yes` → Q1 |
| `consent_pending` | "no" / "nee dankie" | `consent_no` → `CLOSE_NO_CONSENT` |
| `consent_pending` | a question | `answer:FAQ-xx` (+ `defer`) + `consent_reask` (buttons again) |
| `q_*` | a typed answer ("I'm 42", "yes we have a bond") | `record_answer` + `next_question` (out of band → `close_oob`) |
| `q_*` | something else | answer/defer + `repeat_question` |
| `unbooked`, `booking`, `no_show`, `closed_unbooked` | "can we do friday after 2" | `offer_slots` (W04 slots for Friday afternoon, 3 buttons) |
| same | "book me" / "when can he do" | `send_slots` |
| same | "not interested anymore" | `close_unbooked` |
| `booked_await_commit` | "Thursday 8 Oct 11am 👍" (matches) | `commitment_ok` |
| `booked_await_commit` | "Friday 10am right?" (doesn't match) | `commitment_check` |
| booked states | "can we move it to next week" | `reschedule_slots` (or `reschedule` with no day given), `SAME_METHOD` first |
| booked states | "cancel" / "I can't anymore" | `cancel_confirm` |
| booked states | "can he phone me instead" | `change_method` (W10 moves the event; Teams link removed; number confirm asked if not stored) |
| any | email / phone number typed | `capture_contact` (Lookup / MX check as 4.6) |
| any | FAQ question | `answer:FAQ-xx` |
| any | advice / health / ID | `defer` (+ `id_warning`) |
| `attended`, `closed_attended` | advice / health | `defer_after_call` (`DEFER_AFTER_CALL`: the adviser follows up directly; the 4.11 line would point to a call that already happened) |
| any | bank, branch or card number | `bank_warning` (digits masked before any LLM, in storage and the brief) |
| any | photo, document, video or sticker (W07 `message.type`) | `media_not_opened` (never downloaded, never sent to a model; the brief says "has a document to show you"); a caption is read like text, so "is this good?" also gets `defer` |
| any | voice note | transcribed (W07, Whisper-class, `lang` hint from the lead), the audio deleted after transcription, and the transcript is read like typed text; low transcription confidence → `clarify` |
| any | self-harm or bereavement ("better off with the payout", "my late husband…") | `handoff_urgent`: **nothing automated is sent**, the bot pauses, Jonathan and KG are alerted together (`handoff.md` trigger 6). Beats every rule below STOP. |
| any | an existing claim being refused or not paid | `defer` + `handoff` |
| `opted_out` | anything (including an advice question) | `human_review` only: nothing automated after STOP (distress still alerts a person) |
| any, after a deferred turn | "so for me then?", "yes or no?", "just roughly" | `defer` again (`prefilter(…, { prev_deferred })`: the crescendo is the same question) |
| any | "can we chat in Afrikaans" | `set_language` (language stored; templates stay EN until AF templates exist, 6B.11) |
| any | "thanks" / "great" / 👍 | `none` (no reply: "Great thanks" got no reply in the approved replay) |
| any | unclear | `clarify`; second unclear in a row → `handoff` |
| pre-booking | typed age/budget outside the bands | `close_oob` |
| booked | typed age/budget that contradicts the stored band | `flag_band_conflict` (booking kept, adviser told in the brief, console flag; see SUMMARY `needs_human`) |

Multi-intent: answers first, then the deferral, then the operational action (its buttons go last). One question per message: if an operational action needs a choice, the buttons are the question and the generated text has none.

## 5. Stall rules and timers

| Where | Rule | Source |
|---|---|---|
| CTWA, mid-qualification, no reply | nudge +1 h, +20 h, +68 h (inside the 72-h free entry window), then `closed_unbooked` | 4.6 step 7 |
| Unbooked (web or CTWA after qualifying) | `unbooked_nudge_2h` → `unbooked_nudge_24h` (intro video; `_text` if none) → `unbooked_nudge_72h` (last; "we will not message again") → `closed_unbooked` | 4.6 W08, 4.12 |
| Booked, no commitment reply | no chasing; the T-24 h `Confirm` button is the second commitment chance | 4.12 (design for a reply, not a read) |
| Booked (Teams/Zoom/Meet), invite email bounced | `EMAIL_BOUNCED` once (session) or template `invite_email_bounced` (outside 24 h); the next typed email → `capture_contact` → invite re-sent; no second ask, booking stands either way | I-45i (W17 → W05 `invite_bounced`) |
| Contact confirm ignored | nothing further ("no nagging", 4.6) | 4.6 |
| Broker outcome unmarked | +3 h nudge; 24 h → `attended` + `unconfirmed` flag | 4.12a |
| No-show, no reply 48 h | `replacement_due` (per-cycle cap, 0.1) | W13 |
| Handoff not taken | 15 min → backup; 2 h → both, Red | `handoff.md` |
| Verified | first reply or tap within 72 h of first contact sets `verified_at` (3.3) | 3.3 |

## 6. Channel rules that shape the machine (respond.io / Gupshup / Clickatell; Meta Cloud API)

- **24-h customer-service window.** Free-form (L2) and session interactive messages only go out inside a window the lead opened by messaging or tapping. Everything scheduled is a utility template. A template sent by us does not open the window, so on a web lead Thandi cannot send the replay's proactive intro until the lead replies or taps; the first such reply carries `DISCLOSE`.
- **CTWA leads** open a 72-h free entry window, which is why the CTWA stall nudges fit inside 72 h.
- **Buttons**: reply buttons max 3, list rows max 10, button text max 20 characters (lists 24): the fixed lists in `deferral-lines.md` respect this.
- **No typing delay is added.** The typing indicator (sent with the read receipt) shows only during real LLM latency.

## 7. Memory (4.11: never ask twice)

- Every answer is written to `facts` the moment it arrives (taps and typed). Before any question, code checks `facts`; a known value is skipped.
- The intent prompt receives `KNOWN:` (keys only), so the reply never asks again.
- Reschedule keeps context: `SAME_METHOD` ("Same as before, by Teams?"), the same email, the same call number.
- Language: stored on first inference; one tap only if ambiguous (4.6 contact table).
- Health and ID content is never in memory: only `health_question = true`.

## 8. Out-of-band close (3.3, 2.1.7)

- Tapped or typed age `Under 35` / `51 or over` → `CLOSE_OOB_AGE`. Budget `Under R750` (or `Really not sure` after the clarify step) → `CLOSE_OOB_BUDGET`. No hand-over to any broker, no adviser named.
- Data: deleted within 24 h; for CTWA "no consent", only a hashed number is kept for suppression.
- After booking, a contradiction is not auto-closed: it is flagged for a human (SUMMARY `needs_human`).

## Untrusted inputs that are not the lead's message (red-team gaps 10, 11)

- **Stored fields.** `first_name` (from the form or the WhatsApp profile name) and any stored quote are run through `sanitiseField()` before they reach a reply, a template variable or the pre-call brief. A value that is not a plain name (or carries instruction-like text, digits, advice, health, ID or bank content) is stored as `null` with a console flag; replies use no name and the brief shows "first name withheld (failed check)". `briefCheck()` fails a brief that carries instruction-like text or the unsanitised name.
- **CTWA referral.** `referralCheck()` keeps only `source_id` (digits) and `ctwa_clid` (opaque token) from Meta's `referral` object. `headline`, `body` and any `ref` are never put into a prompt; an injection there is logged and dropped. The prefilled first message is the lead's message and goes through `prefilter()` like any other.
