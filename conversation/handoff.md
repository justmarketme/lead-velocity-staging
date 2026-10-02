# Human handoff (4.11, 6.8a)

| | |
|---|---|
| Version | `handoff-v1.1.0` (2026-10-02: trigger 6 self-harm / bereavement; trigger 7 refused claims; compliance-qa phase4-review-2 §3b gap 6, K-7) |
| Inspired by | **Conversica / Verse.ai**: hand hot or stuck leads to a human at the right moment, and tell the human why. |
| Who | **Jonathan (primary), KG (backup)**, per 6.8a |
| Hours | **08:00-20:00 SAST** (6.8a). Outside hours the agent says a person will reply by 09:00 and books a callback task. Weekends and public holidays: not stated in 6.8a; we apply the same hours every day until Jonathan says otherwise (SUMMARY `needs_human`). |

## Triggers (any one)

| # | Trigger | Detected by | Line sent |
|---|---|---|---|
| 1 | Asks for a person ("speak to a person", "human", "real person", "manager", "praat met 'n mens") | `prefilter().person` OR intent `person` | `HANDOFF_IN_HOURS` / `HANDOFF_OUT_OF_HOURS` |
| 2 | Complaint (the keyword `COMPLAINT`, "I want to complain", topic `complaint`) | `prefilter().complaint` OR topic | `HANDOFF_COMPLAINT` (48-h SLA, 2.1.7; logged in the obligations register) |
| 3 | Frustration (sentiment `frustrated`: swearing at us, "this is useless", "I've asked three times") | intent model `sentiment` | `HANDOFF_FRUSTRATED` |
| 4 | Unanswered twice: two turns in a row where Thandi could only send `CLARIFY` | `decide()` with `ctx.unanswered >= 1` | `HANDOFF_IN_HOURS` / `HANDOFF_OUT_OF_HOURS` |
| 5 | Lead says the adviser didn't call (`reach_check` = `No, not yet`) | W12 | handled by W12/W13 (broker no-show path, Schedule D); KG is alerted, not a chat handoff |
| 6 | **Self-harm or bereavement**: any hint of self-harm or not wanting to live ("my family would be better off with the payout"), or that someone close has died ("my late husband", "passed away", "oorlede") | `prefilter().distress` OR topic `distress` (the intent model is told: when unsure, include it) | **None.** No automated text at all: no deferral line, no handoff line, no buttons. See "Trigger 6" below. |
| 7 | A refused or unpaid claim on an existing policy ("my claim was rejected") | `prefilter().claim_problem` OR topic `claim_problem` | `DEFER` (+ `DEFER_NOTED`), then `HANDOFF_IN_HOURS` / `HANDOFF_OUT_OF_HOURS`. The person points them to the insurer and the ombud's complaint route; they never judge the claim. |

Not a trigger: a deferral. The person on our side cannot quote or advise either; the adviser answers it on the call. (Exception: trigger 7, a claim already being refused, also gets a person, because the adviser's call is not where that gets resolved.)

## What happens

1. **Lead** gets one fixed line (below). No question, no buttons.
2. **Bot pauses** for this lead: no LLM replies. STOP is still honoured instantly (W15). Scheduled reminder templates (W09) keep running, because they are useful to the lead and independent of the chat.
3. **Alert** (WhatsApp to the primary, interactive buttons `Take it` · `Pass to KG`; console banner): first name + initial, state, trigger, the last 5 messages **redacted** (`redactForStorage`), the booking if any, and a deep link to the conversation in the console.
4. **Not taken in 15 minutes** (in hours) → same alert to the backup. Not taken in 2 hours → both, marked Red (6.8b escalation rule).
5. **Out of hours** → `HANDOFF_OUT_OF_HOURS`, and a callback task for the primary at 08:00, which leaves an hour before the 09:00 promise. The alert goes into the 07:30 digest, not overnight: handoffs are not on the 6.8b do-not-disturb exception list. Complaints go to the top of the 08:00 queue.
6. **Release.** The human taps `Hand back to Thandi` in the console when done. Thandi resumes with memory intact and does not re-send anything the human already covered. A human reply is never generated or rewritten by the LLM, but the console shows the human the same FAIS reminder: no premiums, amounts, products, insurers, comparisons, suitability, tax or health.
7. **Logged** in `conversations` (`handoff_at`, `trigger`, `taken_by`, `released_at`) and counted as the console KPI "handoff rate per 100 conversations".

## Trigger 6: self-harm or bereavement (no automated content)

1. `decide()` returns `handoff_urgent` in every state (only STOP outranks it). Nothing is sent to the lead by the bot. Scheduled reminders for this lead are **paused** too, until a person releases them.
2. Jonathan **and** KG get the alert at the same time (not primary-then-backup), marked Red, with the last 5 messages redacted and a deep link. It is not batched into the 07:30 digest.
3. A person replies personally from the console in the same chat. The console shows the human a short care note: acknowledge, do not discuss cover or payouts, and share a support line if it fits (for example SADAG; the number is in the console, verified by Jonathan).
4. Logged as `trigger = distress`; counted separately from the handoff rate; every case is in the weekly 30-sample review.

**needs_human (not decided here):** (a) whether the distress alert goes out at night, which would mean adding it to the 6.8b do-not-disturb exception list (recommended: yes); (b) whether, if no human has replied within N minutes, a single pre-approved, non-automated-sounding support-line message is sent. compliance-qa asked for "no automated content", so the default is (b) = no.

## Lines (verbatim from `conversation/lines.mjs`)

| Key | English | Afrikaans |
|---|---|---|
| `HANDOFF_IN_HOURS` | Sure, I've asked a person from our team to message you here shortly. | Seker, ek het iemand van ons span gevra om jou binnekort hier te boodskap. |
| `HANDOFF_OUT_OF_HOURS` | Our team is offline right now, so a person will message you here by 09:00 {open_time_word}. | Ons span is nou nie aanlyn nie, so iemand sal jou {open_time_word} teen 09:00 hier boodskap. |
| `HANDOFF_FRUSTRATED` | I'm sorry this has been frustrating. I've asked a person from our team to message you here shortly. | Jammer dat dit frustrerend was. Ek het iemand van ons span gevra om jou binnekort hier te boodskap. |
| `HANDOFF_COMPLAINT` | I'm sorry to hear that. A person from our team will reply within 48 hours, and you can also email howzit@leadvelocity.co.za. | Jammer om dit te hoor. Iemand van ons span sal binne 48 uur antwoord, en jy kan ook na howzit@leadvelocity.co.za e-pos. |

`{open_time_word}` is "today" between 00:00 and 08:00 and "tomorrow" between 20:00 and 24:00 (AF: "vandag" / "môre").

## Why the human answers in the same chat

Chili Piper and Conversica agree that every hand-off between tools leaks. The human replies from the console into the same WhatsApp thread (Cloud API, inside the 24-h window the lead opened), so the lead never has to repeat themselves or move channel.
