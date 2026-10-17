# Lines for R6-03, R6-04 and I-45i (2026-10-03)

Owner: conversation-designer (Head of Conversational AI). Wiring: automation-engineer (W12, W15, W05) and billing-automation (W17).
Source of truth: `conversation/lines.mjs` (`lines-v1.2.0`); human copy in `conversation/deferral-lines.md`.
Which of my five: Lemonade (plain words, say what happens next), Conversica (politely persistent, never blames), respond.io/Clickatell (utility template outside the 24-h window, session text inside).

## 1. `STOP_ACK_CANCELLED` (R6-04 / I-48d)
- EN: "Done. You won't get any more messages from us, and your call with {adviser_first} on {date} at {time} is cancelled. If you change your mind, just send us a message here."
- AF: "Klaar. Jy sal nie weer boodskappe van ons kry nie, en jou oproep met {adviser_first} op {date} om {time} is gekanselleer. As jy van plan verander, stuur net vir ons 'n boodskap hier."
- W15 wiring: in cancel mode, when `booking_cancels` is not empty, send this line **instead of** `STOP_ACK` as the one confirmation. `{date}`/`{time}` = the cancelled booking (the earliest one if several), same `dateLabel`/`timeLabel` as `STOP_ACK_BOOKED`; `{adviser_first}` = that booking's broker. Keep mode still uses `STOP_ACK_BOOKED`. Add the W15 test R6-04 asks for (cancel mode + live booking → text equals the filled `STOP_ACK_CANCELLED`).
- "Send us a message here" is true: a later inbound from an opted-out lead goes to the console (`human_review`), a person answers, the bot stays silent.

## 2. `BROKER_NO_SHOW_APOLOGY` (R6-03 / I-45n)
- EN: "Sorry, {first_name}, it looks like your call with {adviser_first} didn't happen today. I'll send you some new times now, and there's still nothing to pay."
- AF: "Jammer, {first_name}, dit lyk of jou oproep met {adviser_first} nie vandag plaasgevind het nie. Ek stuur nou vir jou 'n paar nuwe tye, en daar is steeds niks om te betaal nie."
- Neutral: states what happened ("it looks like"), no fault on the adviser or the lead. "Nothing to pay" is FAQ-02 (the call is free), not an offer. W10 follows with the times (Schedule D, at our cost to the broker; not mentioned to the lead).
- W12 wiring: replace the draft `BROKER_NO_SHOW_APOLOGY` export in `automation/lib/w12.mjs` with `LINES[lang].BROKER_NO_SHOW_APOLOGY` from `conversation/lines.mjs` (same key, same placeholders `{first_name}`, `{adviser_first}`).

## 3. Recommendation for W12 timing (R6-03 / I-48c)
The lead's "No, not yet" at T+30 must **not** resolve `broker_no_show` on its own. The broker has until his +3 h nudge (`broker_nudge_at`, T+3 h 15 after the slot end) to mark.
1. Lead taps "No, not yet": record `reach = no` and send nothing yet (no apology, no new times, no KG urgent alert, no W10 rebook).
2. Resolve when the first of these happens:
   - Broker marks **No-show** → this is a lead no-show from his side, but the lead says they were not reached: treat as a conflict (below), not as either side automatically.
   - Broker marks **Attended** or **Rescheduled** → no apology. Conflict with the lead's "No" → KG reviews in the console (amber); nothing to the lead until KG decides.
   - Broker taps **Unreachable/wrong number** disposition → normal W13 replacement path; no apology.
   - **`broker_nudge_at` passes with no broker mark** → resolve `broker_no_show`: send `BROKER_NO_SHOW_APOLOGY` (session text; the lead's tap opened the window, still inside 24 h), then W10 new times (Schedule D, `schedule_d: true`), KG alert, no replacement.
3. If the broker marks after the apology was sent, keep the lead-side result and log the conflict for KG; never send the lead a second, contradicting message.
4. Implementation note: `resolveOutcome()` should return `pending` for (`reach = no`, broker unmarked, `now < broker_nudge_at`); the existing W12 schedule already wakes at `broker_nudge_at`, so no new timer is needed.
The NH-54 confirmation (money: Schedule D rebook at our cost) stays with Jonathan/KG; this note covers timing and wording only.

## 4. `EMAIL_BOUNCED` (I-45i) + template `invite_email_bounced`
- EN session line: "The {method} invite we sent didn't reach your inbox. When you have a moment, please reply with the email address you'd like us to use."
- AF session line: "Die {method}-uitnodiging wat ons gestuur het, het nie jou e-pos bereik nie. Wanneer jy 'n oomblik het, antwoord asseblief met die e-posadres wat ons moet gebruik."
- Template (outside 24 h), `automation/templates/invite_email_bounced.json`, UTILITY, EN: "Hi {{1}}, the {{2}} invite for your call with {{3}} didn't reach your inbox, so when you have a moment, please reply with the email address you'd like us to use. Reply STOP to opt out." Variables: 1 first_name · 2 method label · 3 adviser_name. No buttons. Sample in `automation/templates/samples/invite_email_bounced.txt`.
- Wiring: W17 forwards the bounce → W05 `invite_bounced` → session line if the 24-h window is open, otherwise the template. Asked once; the booking stands either way; the next typed email goes through `capture_contact` (MX check) and the invite is re-sent. Teams/Zoom/Meet only (0.1 Email rule).
- Registered in `submit.sh` REST and the templates README index (#19a). **Template count is now 53** (for meta-operator's runbook and GATE-TEMPLATES). `build/progress-page.mjs` still says "52 templates" (lines 46, 55): orchestrator to update.

## Checks
`node evals/run.mjs --dry-run` PASS (fixed lines 110/110 tone, FAIS 100%). `node automation/templates/check.mjs`: 53 templates, 0 errors. W12/W15 suites still green (draft not yet switched). No `conversation/*.test.mjs` exists.
Afrikaans: needs the same native-speaker read as the rest of the AF set (6B.11).
