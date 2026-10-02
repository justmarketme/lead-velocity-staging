# Deferral and other fixed lines (EN + AF)

| | |
|---|---|
| Version | `lines-v1.1.0` (2026-10-02): + `BANK_WARNING`, `MEDIA_NOT_OPENED`; DEF-09..12 topics (compliance-qa phase4-review-2 K-7, red-team gaps 7-8) |
| Source of truth for code | `conversation/lines.mjs`. This file is the human copy. `node evals/run.mjs --dry-run` fails if a line in `lines.mjs` is not here (or in `handoff.md`) verbatim. |
| Sign-off | compliance-qa: `PENDING` (the deferral line itself is quoted from 4.11 and needs no new approval; the Afrikaans rendering does) |
| Afrikaans | written to the same Grade 5-7 level; needs one native-speaker read before CoverKlaar / Phase 6 (6B.11). See SUMMARY `needs_human`. |

## The deferral line (4.11, verbatim)

> **That's exactly what {adviser_first} will go through with you on the call.**
>
> **Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.**

**Rules.**
1. Code inserts it. The reply model never writes it, never paraphrases it ("The cost question is exactly what…" in the approved replay is replaced by the verbatim line; see `persona.md` conflicts), and is told to leave the topic out entirely.
2. It is always followed by `DEFER_NOTED` ("I've made a note so {adviser_first} comes prepared for it."). Lemonade's rule: say what you'll do with the answer. The note is true: the question goes into the pre-call brief.
3. It is sent for every advice topic: premium, cover amount, product, insurer, comparison, suitability, switching, tax, health, claims, investments / retirement annuities / medical aid, wills and estate, adviser commission, and any message carrying an ID number. It is also the replacement for any draft that fails `outputGate()` or the guardrail classifier when the turn was an advice question.
4. Health and ID: same line. Nothing about the condition is repeated, stored or briefed; the brief says only "has a health question for you" (2.1.7). An ID number adds `ID_WARNING`.
5. If the same lead gets the deferral 3 times in one conversation, the third is followed by nothing else, and the conversation is flagged for the weekly 30-sample review (4.11 evaluation) as a possible "wants a quote now" lead. We do not hand off for this: Jonathan and KG cannot quote either.
6. `{adviser_first}` is the routed adviser's first name. Before routing (CTWA consent and qualifying), the line reads "That's exactly what the adviser will go through with you on the call." (code substitutes "the adviser").

## Every fixed line

| Key | English | Afrikaans | Why |
|---|---|---|---|
| `DEFER` | That's exactly what {adviser_first} will go through with you on the call. | Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan. | 4.11 fixed deferral line. Replaces any draft that touches premium, cover amount, product, insurer, comparison, suitability, switching, tax or health. Never paraphrased. |
| `DEFER_NOTED` | I've made a note so {adviser_first} comes prepared for it. | Ek het 'n nota gemaak sodat {adviser_first} daarvoor voorbereid is. | Lemonade: say what you will do with the answer. The question goes to the pre-call brief (approved replay 21:31). |
| `DEFER_AFTER_CALL` | That's one for {adviser_first}, who will follow up with you directly. | Dit is 'n vraag vir {adviser_first}, wat self met jou sal opvolg. | Post-call deferral (states `attended` / `closed_attended`): the 4.11 line points to a call that has already happened, so it would be untrue. Uses the 4.12 attended wording ("{adviser} will follow up directly"). Not followed by `DEFER_NOTED`; the question is stored on the lead for the adviser's console. Needs compliance-qa sign-off as a new FAIS line. |
| `ID_WARNING` | For your safety, please don't send ID numbers in this chat. | Vir jou veiligheid, moet asseblief nie ID-nommers in hierdie klets stuur nie. | 2.1.7: an ID number was typed. Digits are masked before any LLM call and in storage. |
| `BANK_WARNING` | For your safety, please don't send bank or card details in this chat. | Vir jou veiligheid, moet asseblief nie bank- of kaartbesonderhede in hierdie klets stuur nie. | 2.1.7: account, branch or card numbers were typed. Digits are masked before any LLM call, in storage and in the brief (`[bank detail removed]`). |
| `MEDIA_NOT_OPENED` | I can't open photos or files in this chat, so please keep it for your call with {adviser_first}. | Ek kan nie foto's of lêers in hierdie klets oopmaak nie, so hou dit asseblief vir jou oproep met {adviser_first}. | A photo, document or video (e.g. a policy schedule). W07 never downloads the media id, never sends it to a model, and the brief notes only "has a document to show you". A caption is read like text (an advice caption also gets `DEFER`). True as written: we do not open it. |
| `DISCLOSE` | Hi {first_name}, I'm Thandi, Lead Velocity's booking assistant for {adviser_first}. I'm an AI assistant, and you can ask for a person at any time. | Hallo {first_name}, ek is Thandi, Lead Velocity se besprekingsassistent vir {adviser_first}. Ek is 'n KI-assistent, en jy kan enige tyd vra om met 'n mens te praat. | 4.11: AI disclosure on first free-text contact. Wording from the approved chat replay (21:15), split into two sentences. |
| `DISCLOSE_PRE_ROUTE` | Hi, I'm Thandi, the SortMyCover booking assistant run by Lead Velocity. I'm an AI assistant, and you can ask for a person at any time. | Hallo, ek is Thandi, die SortMyCover-besprekingsassistent van Lead Velocity. Ek is 'n KI-assistent, en jy kan enige tyd vra om met 'n mens te praat. | CTWA consent step, before an adviser is routed. Goes before contracts-drafter CTWA-*-v1 consent text. |
| `COMMIT_ASK` | Could you reply with the date and time of your call so I know it's in your diary? | Kan jy asseblief die datum en tyd van jou oproep terugstuur sodat ek weet dit is in jou dagboek? | 4.12 NHS commitment effect (writing it down yourself: 18% fewer missed appointments). |
| `COMMIT_OK` | Perfect, it's in {adviser_first}'s diary too. | Perfek, dit is ook in {adviser_first} se dagboek. | Commitment matched the booking (approved replay 21:22). |
| `COMMIT_CHECK` | Just checking: your call is on {date} at {time}. Does that still work for you? | Net om seker te maak: jou oproep is op {date} om {time}. Pas dit jou nog? | Typed date/time does not match the booking. Buttons: Yes, that works / Reschedule. |
| `STAY_IN_LANE` | I can only help with your call with {adviser_first} in this chat. | Ek kan net help met jou oproep met {adviser_first} in hierdie klets. | Prompt injection, impersonation, off-scope. No engagement with the content. |
| `CLARIFY` | Sorry, I didn't quite follow. Could you say that another way? | Jammer, ek het jou nie mooi verstaan nie. Kan jy dit anders stel? | Free text Thandi could not place. A second miss in a row hands off (4.11). |
| `STOP_ACK` | Done. You won't get any more messages from us. | Klaar. Jy sal nie weer boodskappe van ons kry nie. | W15 / POPIA. One acknowledgement, then nothing. |
| `STOP_ACK_BOOKED` | Done. You won't get any more messages from us. Your call with {adviser_first} on {date} at {time} stays booked unless you reply CANCEL. | Klaar. Jy sal nie weer boodskappe van ons kry nie. Jou oproep met {adviser_first} op {date} om {time} bly bespreek, tensy jy CANCEL antwoord. | STOP while booked: messages stop, the booking stays unless they cancel (see needs_human in SUMMARY). |
| `CLOSE_OOB_AGE` | Thanks for your time. The advisers on this service work with people aged 35 to 50 at the moment, so we won't set up a call, and we'll delete your details. You're welcome to contact any licensed financial adviser directly. | Dankie vir jou tyd. Die adviseurs op hierdie diens werk tans met mense van 35 tot 50, so ons sal nie 'n oproep reël nie, en ons sal jou besonderhede uitvee. Jy is welkom om enige gelisensieerde finansiële adviseur self te kontak. | Out-of-band age (3.3). Honest, no judgement, no advice; details deleted within 24 h (2.1.7). |
| `CLOSE_OOB_BUDGET` | Thanks for your time. The advisers on this service aren't able to take this on at the moment, so we won't set up a call, and we'll delete your details. You're welcome to contact any licensed financial adviser directly. | Dankie vir jou tyd. Die adviseurs op hierdie diens kan dit tans nie aanneem nie, so ons sal nie 'n oproep reël nie, en ons sal jou besonderhede uitvee. Jy is welkom om enige gelisensieerde finansiële adviseur self te kontak. | Out-of-band budget (3.3). Does not state the threshold, so it never reads as a price signal. |
| `CLOSE_NO_CONSENT` | No problem, we won't keep your details. Take care. | Geen probleem nie, ons hou nie jou besonderhede nie. Mooi bly. | CTWA No thanks. Only a hashed number is kept for suppression (2.1.7). |
| `CLOSE_UNBOOKED` | No problem. We won't message you about this again. | Geen probleem nie. Ons sal jou nie weer hieroor boodskap nie. | Lead says not interested before booking. |
| `CONFIRM_THANKS` | Thanks, {first_name}, you're confirmed. If you have a payslip or your current policy schedule handy tomorrow, it helps, but it isn't needed. | Dankie, {first_name}, jy is bevestig. As jy môre 'n salarisstrokie of jou huidige polisskedule byderhand het, help dit, maar dit is nie nodig nie. | After Confirm at T-24 h: thanks + the optional prep line (4.12), approved replay 12:47. |
| `SAME_METHOD` | Same as before, by {method}? | Dieselfde as voorheen, per {method}? | Reschedule memory: never ask twice (4.11). Buttons: Yes / Change. |

Handoff lines (`HANDOFF_*`) are in `handoff.md`.

## Layer 1 button messages (no LLM; wording from the approved design references)

These are session messages (inside the 24-h window) or templates owned by automation-engineer. Listed so the whole lead-facing text set is reviewable in one place.

| Step | Text | Buttons / list |
|---|---|---|
| CTWA consent (W03) | `DISCLOSE_PRE_ROUTE` + contracts-drafter `CTWA-GENERIC-v1` or `CTWA-NAMED-v1` verbatim, then its second line "You can reply STOP at any time. How we use your details: sortmycover.co.za/privacy" | `Yes, continue` · `No thanks` |
| Q1 age (list) | Great. Four quick taps and I'll match you with an adviser. First, which age band are you in? | list "Choose age band": `Under 35` · `35–44` · `45–50` · `51 or over` |
| Q2 bond | Do you have a bond on your home? | `Yes` · `No` |
| Q3 dependants | Does anyone depend on your income, like kids, a partner or parents? | `Yes` · `No` |
| Q4 budget (list) | Last one: what monthly amount would you be comfortable putting towards cover? | list "Choose a range": `Under R750` · `R750 – R1,250` · `R1,250 or more` · `Not sure yet` |
| Q4b budget clarify (only after `Not sure yet`) | No problem, a rough idea is fine. Would it be closer to under R750, or R750 or more? | `Under R750` · `R750 or more` · `Really not sure` |
| Commitment check mismatch | `COMMIT_CHECK` | `Yes, that works` · `Reschedule` |
| Number to call (call methods) | Is this the number {adviser_first} should call you on? | `Yes, this one` · `Use another number` |
| Alternative number | If we can't reach you, is there another number? | `Add one` · `No thanks` |
| Best time (list) | When is the best time to reach you, if we ever need to? | list: `Mornings` · `Lunchtime` · `Afternoons` · `Evenings` · `Any time` |
| Reschedule memory | `SAME_METHOD` | `Yes` · `Change` |
| Cancel confirm | Do you want me to cancel your call on {date} at {time}? | `Yes, cancel` · `Keep it` |
| Cancel, rebook offer (once) | Done, your call is cancelled. If you'd like another time later, just say. | `See open times` |
| Reach check (W12, T+30) | template `reach_check` | `Yes, we spoke` · `No, not yet` (approved replay shows `Yes` · `No`; see SUMMARY) |

Budget amounts appear only in these fixed, tap-only lists (they are our qualifying bands, not a quote). The reply model never repeats them; `outputGate()` blocks any rand amount it writes.

**Note on "match you with an adviser".** The end-to-end mock says "the right adviser". We drop "right": it implies a suitability judgement, and with one broker it is not a match at all. Needs no gate: wording only.


## Fixed lines added 2026-10-02 (W07 alignment, W35 lead pulse)

| Key | English | Afrikaans | When |
|---|---|---|---|
| `SLOTS_INTRO` | Here are the next open times with {adviser_first}. | Hier is die volgende oop tye met {adviser_first}. | reply.md fallback for send_slots/offer_slots; body of the W04 10-slot list (I-35e). |
| `RESCHED_INTRO` | No problem, here are some other times. | Geen probleem nie, hier is 'n paar ander tye. | reply.md fallback for reschedule/reschedule_slots; body of the W10 list (+ SAME_METHOD buttons if stored). |
| `CANCEL_CONFIRM_Q` | Do you want me to cancel your call on {date} at {time}? | Wil jy hê ek moet jou oproep op {date} om {time} kanselleer? | reply.md fallback for cancel_confirm; W10 buttons Yes, cancel / Keep it. |
| `CANCEL_DONE` | Done, your call is cancelled. If you'd like another time later, just say. | Klaar, jou oproep is gekanselleer. As jy later 'n ander tyd wil hê, sê net. | W10 after Yes, cancel. One rebook offer, button See open times. |
| `METHOD_CHANGED` | I'll change it to {method}. | Ek sal dit na {method} verander. | reply.md fallback for change_method (W10). {method} = the new method label. |
| `SAVED` | Thanks, I've saved that. | Dankie, ek het dit gestoor. | reply.md fallback for capture_contact; W07 contactStep after a best-time tap. |
| `LANG_SWITCH` | Sure, we can chat in English. | Reg so, ons kan in Afrikaans gesels. | reply.md fallback for set_language (each language says it in its own words). |
| `BOOKING_STATUS` | Your call with {adviser_first} is on {date} at {time}. | Jou oproep met {adviser_first} is op {date} om {time}. | W07 fallback for booking_status. |
| `CONTACT_CALL_NUMBER` | Is this the number {adviser_first} should call you on? | Is dit die nommer waarop {adviser_first} jou moet bel? | W07 contactStart (call methods only). Buttons Yes, this one / Use another number. |
| `CONTACT_ALT` | If we can't reach you, is there another number? | As ons jou nie kan bereik nie, is daar 'n ander nommer? | W07 contactStep. Buttons Add one / No thanks. |
| `CONTACT_BEST_TIME` | When is the best time to reach you, if we ever need to? | Wanneer is die beste tyd om jou te bereik, as ons ooit moet? | W07 contactStep list: Mornings, Lunchtime, Afternoons, Evenings, Any time. |
| `CONTACT_TYPE_NUMBER` | Sure, please type the number. | Seker, tik asseblief die nommer. | W07 contactStep after Use another number. |
| `CONTACT_TYPE_ALT` | Sure, please type the other number. | Seker, tik asseblief die ander nommer. | W07 contactStep after Add one. |
| `CONTACT_BAD_NUMBER` | That doesn't look like a South African mobile number. Please try again, for example 082 123 4567. | Dit lyk nie soos 'n Suid-Afrikaanse selnommer nie. Probeer asseblief weer, byvoorbeeld 082 123 4567. | W07 contactStep: typed number is not a SA mobile (max 2 tries). |
| `CONTACT_KEEP_NUMBER` | No problem, we'll keep the number we have. | Geen probleem nie, ons hou die nommer wat ons het. | W07 contactStep: 2nd failed alt number; prefix to the best-time list. |
| `CONTACT_USE_WA` | No problem, we'll use this WhatsApp number. | Geen probleem nie, ons gebruik hierdie WhatsApp-nommer. | W07 contactStep: 2nd failed call number; prefix to the alt-number question. |
| `PULSE_ASK` | Hi {first_name}, one quick question: was your call with {adviser_first} worth your time? Answers are only shared as a total, never with your name. | Hallo {first_name}, net een vinnige vraag: was jou oproep met {adviser_first} jou tyd werd? Antwoorde word net as 'n totaal gedeel, nooit met jou naam nie. | W35 lead pulse, session twin of template lead_pulse (FAQ-25: the one question after the call). Buttons Yes, worth it / Not really. |
| `PULSE_LINE_ASK_UP` | Thanks for letting us know. If you like, tell us in one line what made it worth it. | Dankie dat jy ons laat weet. As jy wil, vertel ons in een reël wat dit die moeite werd gemaak het. | W35 after Yes, worth it. Optional, asked once, no question mark so it never reads as a second question. |
| `PULSE_LINE_ASK_DOWN` | Thanks for letting us know. If you like, tell us in one line what could have been better. | Dankie dat jy ons laat weet. As jy wil, vertel ons in een reël wat beter kon gewees het. | W35 after Not really. Optional, asked once. |
| `PULSE_LINE_THANKS` | Thanks, that helps us improve. | Dankie, dit help ons om te verbeter. | W35 after the optional line. Then nothing else from us (4.12 attended row). |
| `STOP_HINT` | Reply STOP to opt out. | Antwoord STOP as jy nie meer boodskappe wil kry nie. | Appended to proactive session messages that twin a template (W08 nudges, W35 `PULSE_ASK`), same as the template's last sentence. |

## Afrikaans nudges, button titles and list rows (I-39e, 2026-10-02)

| Key | English | Afrikaans | When |
|---|---|---|---|
| `NUDGE_2H` | (approved template text, `lib/w08.mjs` SESSION_EN) | Hallo {first_name}, ons volg op oor jou navraag oor lewensdekking. 'n Oproep met {adviser_first} neem omtrent 30 minute, en jy is nie verplig om iets te koop nie. Tik hieronder om oop tye te sien. | W08 +2 h session twin (how long; K-6 no-obligation wording). |
| `NUDGE_24H` | (approved template text, `lib/w08.mjs` SESSION_EN) | Hallo {first_name}, hier is {adviser_first} in omtrent 25 sekondes, sodat jy weet met wie jy oor jou navraag sal praat. Tik hieronder om oop tye te sien. | W08 +24 h session twin with intro video header. |
| `NUDGE_24H_TEXT` | (approved template text, `lib/w08.mjs` SESSION_EN) | Hallo {first_name}, 'n bietjie oor die adviseur vir jou navraag: {bio_short} Tik hieronder om oop tye te sien. | W08 +24 h session twin without video; {bio_short} is the broker's approved bio. |
| `NUDGE_72H` | (approved template text, `lib/w08.mjs` SESSION_EN) | Hallo {first_name}, dit is ons laaste boodskap oor jou navraag oor lewensdekking. As jy steeds 'n oproep van 30 minute met {adviser_first} wil hê, tik hieronder om 'n tyd te kies. Indien nie, geen probleem nie, ons sal nie weer boodskap nie. | W08 +72 h last nudge session twin. |
| `BTN_SEE_TIMES` | See open times | Sien oop tye | Button title / list row (W08 nurture, W07 contact step). |
| `BTN_NOT_NOW` | Not now | Nie nou nie | Button title / list row (W08 nurture, W07 contact step). |
| `BTN_NO_THANKS` | No thanks | Nee dankie | Button title / list row (W08 nurture, W07 contact step). |
| `BTN_CALL_YES` | Yes, this one | Ja, hierdie een | Button title / list row (W08 nurture, W07 contact step). |
| `BTN_CALL_OTHER` | Use another number | Ander nommer | Button title / list row (W08 nurture, W07 contact step). |
| `BTN_ALT_ADD` | Add one | Voeg een by | Button title / list row (W08 nurture, W07 contact step). |
| `BTN_ALT_NO` | No thanks | Nee dankie | Button title / list row (W08 nurture, W07 contact step). |
| `BEST_MORNINGS` | Mornings | Oggende | Button title / list row (W08 nurture, W07 contact step). |
| `BEST_LUNCHTIME` | Lunchtime | Middagete | Button title / list row (W08 nurture, W07 contact step). |
| `BEST_AFTERNOONS` | Afternoons | Middae | Button title / list row (W08 nurture, W07 contact step). |
| `BEST_EVENINGS` | Evenings | Aande | Button title / list row (W08 nurture, W07 contact step). |
| `BEST_ANY` | Any time | Enige tyd | Button title / list row (W08 nurture, W07 contact step). |

## Booking edge lines (I-39k, 2026-10-02)

| Key | English | Afrikaans | When |
|---|---|---|---|
| `SLOT_TAKEN` | Sorry, that time was just taken. Here are the next open times with {adviser_first}. | Jammer, daardie tyd is pas gevat. Hier is die volgende oop tye met {adviser_first}. | W05/W10: the slot re-check failed; body of the one interactive list with the next open times. |
| `METHOD_NOT_OFFERED` | {adviser_first} doesn't offer that way of meeting. You can keep {method} or pick another option. | {adviser_first} bied nie daardie manier van vergader aan nie. Jy kan by {method} bly of 'n ander opsie kies. | W10 change_method to a method the adviser does not offer; {method} = the booked method label. Buttons: `Keep {method}` · `Choose another`. |
| `EMAIL_Q` | Where should we send the {method} invite? Reply with your email address. | Waarheen moet ons die {method}-uitnodiging stuur? Antwoord met jou e-posadres. | W28 / W05: only when the chosen method needs an invite (Teams, Zoom, Meet); never for WhatsApp-call or phone (0.1 Email). Moved from `automation/flows/w28-endpoint.js` (I-40d); Afrikaans draft approved as written. |
| `TZ` | Times are South African time. | Die tye is in Suid-Afrikaanse tyd. | W28 slot list / Flow footer line. Afrikaans corrected from the draft "Tye is Suid-Afrikaanse tyd." (missing article and "in"; reads as a fragment). |
