# Human handoff (4.11, 6.8a)

| | |
|---|---|
| Version | `handoff-v1.2.0` (2026-10-21: Lindi on Facebook and Instagram, W40, "Social lines" below). `handoff-v1.1.0` (2026-10-02: trigger 6 self-harm / bereavement; trigger 7 refused claims; compliance-qa phase4-review-2 §3b gap 6, K-7) |
| Inspired by | **Conversica / Verse.ai**: hand hot or stuck leads to a human at the right moment, and tell the human why. |
| Who | **Jonathan (primary), KG (backup)**, per 6.8a |
| Hours | **08:00-20:00 SAST** (6.8a). Outside hours the agent says a person will reply by 09:00 and books a callback task. Weekends and public holidays: not stated in 6.8a; we apply the same hours every day until Jonathan says otherwise (SUMMARY `needs_human`). |

## Triggers (any one)

| # | Trigger | Detected by | Line sent |
|---|---|---|---|
| 1 | Asks for a person ("speak to a person", "human", "real person", "manager", "praat met 'n mens") | `prefilter().person` OR intent `person` | `HANDOFF_IN_HOURS` / `HANDOFF_OUT_OF_HOURS` |
| 2 | Complaint (the keyword `COMPLAINT`, "I want to complain", topic `complaint`) | `prefilter().complaint` OR topic | `HANDOFF_COMPLAINT` (48-h SLA, 2.1.7; logged in the obligations register) |
| 3 | Frustration (sentiment `frustrated`: swearing at us, "this is useless", "I've asked three times") | intent model `sentiment` | `HANDOFF_FRUSTRATED` |
| 4 | Unanswered twice: two turns in a row where Lindi could only send `CLARIFY` | `decide()` with `ctx.unanswered >= 1` | `HANDOFF_IN_HOURS` / `HANDOFF_OUT_OF_HOURS` |
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
6. **Release.** The human taps `Hand back to Lindi` in the console when done. Lindi resumes with memory intact and does not re-send anything the human already covered. A human reply is never generated or rewritten by the LLM, but the console shows the human the same FAIS reminder: no premiums, amounts, products, insurers, comparisons, suitability, tax or health.
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
| `HANDOFF_COMPLAINT` | I'm sorry to hear that. A person from our team will reply within 48 hours, and you can also email hello@sortmycover.co.za. | Jammer om dit te hoor. Iemand van ons span sal binne 48 uur antwoord, en jy kan ook na hello@sortmycover.co.za e-pos. |

`{open_time_word}` is "today" between 00:00 and 08:00 and "tomorrow" between 20:00 and 24:00 (AF: "vandag" / "môre").

## Social lines: Lindi on Facebook and Instagram (W40, 21 Oct 2026)

Source: `Desktop\EMMA\checklist\SOCIAL-AUDIT-LINDI-SMC-2026-10-21.md` sections 3 and 5 (Jono's go, 21 Oct 2026). Code: `automation/lib/social.mjs`, workflow `automation/W40.json`, prompt `conversation/prompts/lindi-social.md`. English only in v1. These lines are copied verbatim from `conversation/lines.mjs` (the eval drift check fails otherwise). Sign-off: Jono and KG (`PENDING`, before go-live).

**How she behaves (summary; the doc is the source).**
- Disclosure: in private messages she is "Lindi, SortMyCover's automated assistant". Never "AI", never a person. Never "free", no licence wording about the adviser (the provider is the one that is FSCA-authorised), never "You don't pay for the call".
- Comments, v1: one public reply of at most 2 sentences with the WhatsApp number (Facebook also the short link). Comments, v2 (after App Review, `SOCIAL_CHANNELS` + `private_replies`): the private reply goes first and the public line is picked from its result.
- Statements (objections, scam claims, competitors): public line only. Spam, scam bait and abuse: hidden at any hour, no reply. Personal details posted: the neutral line, then hidden.
- DMs: Instagram first, then Messenger. Up to 2 FAQ answers, then only the WhatsApp button. At most 4 messages per thread in 24 hours, only inside Meta's 24-hour window, never a message tag.
- Hours: public replies and hides any time; v2 private replies only in CPA hours (weekdays 08:00-20:00, Saturday 09:00-13:00, no Sundays or public holidays; a missing holiday list counts as closed). DMs the person starts: any time.
- Human takeover: a person replying (Page Inbox echo, standby, a hand-over, a Page comment Lindi did not send, a Page reply already under the comment) makes her quiet on that thread for `SOCIAL_HUMAN_PAUSE_HOURS` (24) after the last human message; a comment thread a person joined stays theirs for good.
- STOP is permanent (`public.suppression`, source `stop`, hashed id). Under 18: `SOCIAL_UNDER_18`, no link, no follow-up, ever.
- Distress (self-harm, bereavement): **no automated text** on social either (trigger 6 above). Red `social_distress` alert to Jono and KG; the comment is hidden only if it also carries personal or health details. The SADAG crisis line (0800 567 567) is for the person's own reply, verified by Jono before go-live.
- Alerts (W22 `community_escalation`, `social_distress`, `social_breaker`): a link and a case type only, never the message text or a name.

| Key | English | When |
|---|---|---|
| `SOCIAL_DISCLOSE` | Hi, I'm Lindi, SortMyCover's automated assistant. I can answer quick questions and help you book a call with an adviser, and you can ask for a person at any time. | First message in every Messenger / Instagram DM thread. Lindi is SortMyCover's automated assistant: never "AI", never a person. |
| `SOCIAL_PRIVATE_HELLO` | Hi, it's Lindi here, SortMyCover's automated assistant. Thanks for your comment on our post. | Opens every private reply to a comment (v2, after App Review). |
| `SOCIAL_HOW` | We book a 30-minute call with an adviser from an FSCA-authorised provider, at a time that suits you. | How booking works (DM answer, private-reply body, public answer to "how does it work"). |
| `SOCIAL_COST` | SortMyCover takes no fee from you for the call. There's no obligation to buy anything. | Cost of the call (Jono 21 Oct 2026: never "You don't pay for the call"). |
| `SOCIAL_WHO` | They're advisers from FSCA-authorised financial services providers. You'll see who your adviser is when you book. | "Who are the advisers?" Never names an adviser, firm or FSP. |
| `SOCIAL_ADVICE` | That depends on your situation, so it's one for the adviser to go through with you on the call. | Advice requests in DMs and private replies (FAIS: no yes/no, no advice). |
| `SOCIAL_CTA` | When you're ready, tap below to book your call on WhatsApp. | Body of the WhatsApp button (button template, title "Book on WhatsApp", URL /webhook/wa/dm_messenger or dm_instagram). |
| `SOCIAL_CTA_LINK` | When you're ready, book your call on WhatsApp here: {wa_link} | Private replies (text only): the short link with the comment ref. |
| `SOCIAL_ASK_FIRST` | Anything you'd like to ask first? | Private replies: one open question. |
| `SOCIAL_STOP_FOOTER` | Reply STOP and we won't message you again. | Ends every private reply. |
| `SOCIAL_SCAM` | SortMyCover is run by Lead Velocity (Pty) Ltd, and our only WhatsApp number is {wa_number}. We never ask for payment, banking details or passwords. | Scam questions in DMs. Anti-scam signal. |
| `SOCIAL_WILLS` | Message us on WhatsApp on {wa_number} and we'll help you book a call about wills. | Wills, public and DM: the WhatsApp number only, no link and no hand-off (wills consent wording comes first). Never names the will provider. |
| `SOCIAL_UNDER_18` | Thanks for your interest. This service is only for adults aged 18 and older. | Under 18, public and DM: no link, no follow-up, ever (minor marker). |
| `SOCIAL_PERSON_LATER` | A person from our team will reply here by {open_at}. | DM "I want a person" outside CPA hours; {open_at} is the real next opening ("08:00 on Monday"). |
| `SOCIAL_COMPLAINT_TAIL` | Reply here and a person from our team will pick it up. | DM complaint: after HANDOFF_COMPLAINT. Thread passed to the inbox, Jono and KG alerted. |
| `SOCIAL_PRIVATE_DETAILS` | We've hidden your comment to protect your personal details, so please don't post them in public. | Private reply (v2) when personal details were posted in public. |
| `SOCIAL_PUBLIC_COST` | SortMyCover takes no fee from you for the call. Message us on WhatsApp on {wa_number} and we'll help you book. | Public: cost of the call. |
| `SOCIAL_PUBLIC_ADVICE` | That depends on your situation, so it's one for the adviser to go through with you on the call. Message us on WhatsApp on {wa_number} to book. | Public: any advice question ("Should I cancel my funeral policy?"). No yes/no. |
| `SOCIAL_PUBLIC_INTEREST` | Thanks for your interest. Message us on WhatsApp on {wa_number} and we'll help you book your call. | Public: interest ("Interested", "How do I book?"). |
| `SOCIAL_PUBLIC_QUESTION` | Good question. Message us on WhatsApp on {wa_number} and we'll help you with that. | Public: fallback for a question when the brain fails, times out or its draft fails the gate. |
| `SOCIAL_PUBLIC_WA` | Message us on WhatsApp on {wa_number} to book. | Public: follows a one-sentence brain answer that passed the gate. |
| `SOCIAL_PUBLIC_SCAM` | Fair question. SortMyCover is run by Lead Velocity (Pty) Ltd, and our only WhatsApp number is {wa_number}. | Public: "Is this a scam?". Statement only, no DM follow-up. |
| `SOCIAL_PUBLIC_COMPLAINT` | We're sorry to hear this. Please message us on WhatsApp on {wa_number} or email hello@sortmycover.co.za so our team can help. | Public complaint. No timed promise in public. |
| `SOCIAL_PUBLIC_PERSON` | A person from our team can help you on WhatsApp on {wa_number}. | Public "I want a person". |
| `SOCIAL_PUBLIC_STATEMENT` | Thanks for sharing your view. If you'd ever like to talk it through, message us on WhatsApp on {wa_number}. | Public: objections and competitor statements. No DM follow-up. |
| `SOCIAL_PUBLIC_THANKS` | Thank you, we appreciate it. | Public: praise. |
| `SOCIAL_PUBLIC_DETAILS` | We've hidden this comment to protect your personal details. Please message us on WhatsApp on {wa_number} instead. | Public: personal details were posted. Sent first, then the comment is hidden. Never repeats the details. |
| `SOCIAL_PUBLIC_SENT_PRIVATE` | Thanks for your comment. We've sent you a message with the details. | Public (v2): only when the private reply went through, so it is never false. |
| `SOCIAL_LINK_FB` | Book here: {wa_link} | Facebook public replies only (Instagram comments cannot carry a clickable link): the short link with ref cmt_org_<page>_<post>. |

## Why the human answers in the same chat

Chili Piper and Conversica agree that every hand-off between tools leaks. The human replies from the console into the same WhatsApp thread (Cloud API, inside the 24-h window the lead opened), so the lead never has to repeat themselves or move channel.
