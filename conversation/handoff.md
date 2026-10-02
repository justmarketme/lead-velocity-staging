# Human handoff (4.11, 6.8a)

| | |
|---|---|
| Version | `handoff-v1.0.0` (2026-10-02) |
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

Not a trigger: a deferral. The person on our side cannot quote or advise either; the adviser answers it on the call.

## What happens

1. **Lead** gets one fixed line (below). No question, no buttons.
2. **Bot pauses** for this lead: no LLM replies. STOP is still honoured instantly (W15). Scheduled reminder templates (W09) keep running, because they are useful to the lead and independent of the chat.
3. **Alert** (WhatsApp to the primary, interactive buttons `Take it` · `Pass to KG`; console banner): first name + initial, state, trigger, the last 5 messages **redacted** (`redactForStorage`), the booking if any, and a deep link to the conversation in the console.
4. **Not taken in 15 minutes** (in hours) → same alert to the backup. Not taken in 2 hours → both, marked Red (6.8b escalation rule).
5. **Out of hours** → `HANDOFF_OUT_OF_HOURS`, and a callback task for the primary at 08:00, which leaves an hour before the 09:00 promise. The alert goes into the 07:30 digest, not overnight: handoffs are not on the 6.8b do-not-disturb exception list. Complaints go to the top of the 08:00 queue.
6. **Release.** The human taps `Hand back to Thandi` in the console when done. Thandi resumes with memory intact and does not re-send anything the human already covered. A human reply is never generated or rewritten by the LLM, but the console shows the human the same FAIS reminder: no premiums, amounts, products, insurers, comparisons, suitability, tax or health.
7. **Logged** in `conversations` (`handoff_at`, `trigger`, `taken_by`, `released_at`) and counted as the console KPI "handoff rate per 100 conversations".

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
