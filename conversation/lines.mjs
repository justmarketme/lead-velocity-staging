// conversation/lines.mjs
// Every fixed, pre-approved line Thandi can send. Code inserts these verbatim; the reply LLM never writes them.
// Human-readable copy + rationale: conversation/deferral-lines.md and conversation/handoff.md.
// evals/run.mjs checks that every line here appears verbatim in those two files (drift guard) and passes
// the output gate and tone check.
// Placeholders: {first_name} {adviser} {adviser_first} {practice} {fsp} {date} {time} {method} {open_time_word}

export const LINES = {
  en: {
    // 4.11 core deferral (FAIS). Verbatim. Never paraphrased, never merged into a generated sentence.
    DEFER: "That's exactly what {adviser_first} will go through with you on the call.",
    // Lemonade: say what you will do with the answer (approved chat replay, 21:31).
    DEFER_NOTED: "I've made a note so {adviser_first} comes prepared for it.",
    // Post-call variant (states attended / closed_attended): there is no upcoming call. 4.12 attended wording.
    DEFER_AFTER_CALL: "That's one for {adviser_first}, who will follow up with you directly.",
    // 2.1.7: an ID number was typed. Sent once, after DEFER.
    ID_WARNING: "For your safety, please don't send ID numbers in this chat.",
    // 2.1.7: bank or card numbers were typed. Digits are masked before any LLM call and in storage.
    BANK_WARNING: "For your safety, please don't send bank or card details in this chat.",
    // A photo, file or video was sent. It is never downloaded, opened or sent to an LLM.
    MEDIA_NOT_OPENED: "I can't open photos or files in this chat, so please keep it for your call with {adviser_first}.",
    // 4.11 disclosure on first free-text contact (approved chat replay, 21:15).
    DISCLOSE: "Hi {first_name}, I'm Thandi, Lead Velocity's booking assistant for {adviser_first}. I'm an AI assistant, and you can ask for a person at any time.",
    // Disclosure before an adviser is routed (CTWA consent step, no adviser named yet).
    DISCLOSE_PRE_ROUTE: "Hi, I'm Thandi, the SortMyCover booking assistant run by Lead Velocity. I'm an AI assistant, and you can ask for a person at any time.",
    // 4.12 commitment ask (NHS: writing the details down yourself -> 18% fewer missed appointments).
    COMMIT_ASK: "Could you reply with the date and time of your call so I know it's in your diary?",
    COMMIT_OK: "Perfect, it's in {adviser_first}'s diary too.",
    COMMIT_CHECK: "Just checking: your call is on {date} at {time}. Does that still work for you?",
    // Prompt injection / impersonation / off-scope.
    STAY_IN_LANE: "I can only help with your call with {adviser_first} in this chat.",
    // Free text Thandi could not place. Second miss on the same turn type -> handoff (4.11).
    CLARIFY: "Sorry, I didn't quite follow. Could you say that another way?",
    // W15 / POPIA. One message, then silence.
    STOP_ACK: "Done. You won't get any more messages from us.",
    STOP_ACK_BOOKED: "Done. You won't get any more messages from us. Your call with {adviser_first} on {date} at {time} stays booked unless you reply CANCEL.",
    // Out-of-band close (3.3, 4.6 step 3). No reason that judges the person; no advice; nothing stored after 24 h.
    CLOSE_OOB_AGE: "Thanks for your time. The advisers on this service work with people aged 35 to 50 at the moment, so we won't set up a call, and we'll delete your details. You're welcome to contact any licensed financial adviser directly.",
    CLOSE_OOB_BUDGET: "Thanks for your time. The advisers on this service aren't able to take this on at the moment, so we won't set up a call, and we'll delete your details. You're welcome to contact any licensed financial adviser directly.",
    CLOSE_NO_CONSENT: "No problem, we won't keep your details. Take care.",
    CLOSE_UNBOOKED: "No problem. We won't message you about this again.",
    // Handoff (6.8a). Bot pauses after sending.
    HANDOFF_IN_HOURS: "Sure, I've asked a person from our team to message you here shortly.",
    HANDOFF_OUT_OF_HOURS: "Our team is offline right now, so a person will message you here by 09:00 {open_time_word}.",
    HANDOFF_FRUSTRATED: "I'm sorry this has been frustrating. I've asked a person from our team to message you here shortly.",
    HANDOFF_COMPLAINT: "I'm sorry to hear that. A person from our team will reply within 48 hours, and you can also email howzit@leadvelocity.co.za.",
    // After a confirm tap at T-24 h (approved chat replay, 12:47) - Layer 1, session message.
    CONFIRM_THANKS: "Thanks, {first_name}, you're confirmed. If you have a payslip or your current policy schedule handy tomorrow, it helps, but it isn't needed.",
    // Reschedule memory (4.11): never ask twice.
    SAME_METHOD: "Same as before, by {method}?",
    // reply.md fallbacks (W04/W10 interactive bodies and W07 when a draft is dropped). Fixed, pre-approved (I-35e).
    SLOTS_INTRO: "Here are the next open times with {adviser_first}.",
    RESCHED_INTRO: "No problem, here are some other times.",
    CANCEL_CONFIRM_Q: "Do you want me to cancel your call on {date} at {time}?",
    CANCEL_DONE: "Done, your call is cancelled. If you'd like another time later, just say.",
    // I-39k: W05/W10 slot re-check failed (getSchedule) -> list of the next open times follows in the same message.
    SLOT_TAKEN: "Sorry, that time was just taken. Here are the next open times with {adviser_first}.",
    // I-39k: lead asked for a method the adviser does not offer. Buttons: Keep {method} / Choose another.
    METHOD_NOT_OFFERED: "{adviser_first} doesn't offer that way of meeting. You can keep {method} or pick another option.",
    METHOD_CHANGED: "I'll change it to {method}.",
    SAVED: "Thanks, I've saved that.",
    LANG_SWITCH: "Sure, we can chat in English.",
    BOOKING_STATUS: "Your call with {adviser_first} is on {date} at {time}.",
    // Post-booking contact confirms (4.6 "Flow in practice", W07 contactStep). Layer 1 button/list bodies.
    CONTACT_CALL_NUMBER: "Is this the number {adviser_first} should call you on?",
    CONTACT_ALT: "If we can't reach you, is there another number?",
    CONTACT_BEST_TIME: "When is the best time to reach you, if we ever need to?",
    CONTACT_TYPE_NUMBER: "Sure, please type the number.",
    CONTACT_TYPE_ALT: "Sure, please type the other number.",
    CONTACT_BAD_NUMBER: "That doesn't look like a South African mobile number. Please try again, for example 082 123 4567.",
    CONTACT_KEEP_NUMBER: "No problem, we'll keep the number we have.",
    CONTACT_USE_WA: "No problem, we'll use this WhatsApp number.",
    // W35 lead pulse (6B.2, FAQ-25): the ONE question after an attended call. Session twin of template lead_pulse
    // (+ STOP_HINT = the template's words, like W08). Buttons: pulse_yes "Yes, worth it" / pulse_no "Not really".
    PULSE_ASK: "Hi {first_name}, one quick question: was your call with {adviser_first} worth your time? Answers are only shared as a total, never with your name.",
    PULSE_LINE_ASK_UP: "Thanks for letting us know. If you like, tell us in one line what made it worth it.",
    PULSE_LINE_ASK_DOWN: "Thanks for letting us know. If you like, tell us in one line what could have been better.",
    PULSE_LINE_THANKS: "Thanks, that helps us improve.",
    // Opt-out reminder appended to proactive session messages that twin a template (W08 nudges, W35 pulse).
    STOP_HINT: "Reply STOP to opt out.",
    // Button titles / list rows (<= 20 / 24 chars, Meta limits). W08 nurture buttons, W07 contact buttons and best-time rows (I-39e).
    BTN_SEE_TIMES: "See open times",
    BTN_NOT_NOW: "Not now",
    BTN_NO_THANKS: "No thanks",
    BTN_CALL_YES: "Yes, this one",
    BTN_CALL_OTHER: "Use another number",
    BTN_ALT_ADD: "Add one",
    BTN_ALT_NO: "No thanks",
    BEST_MORNINGS: "Mornings",
    BEST_LUNCHTIME: "Lunchtime",
    BEST_AFTERNOONS: "Afternoons",
    BEST_EVENINGS: "Evenings",
    BEST_ANY: "Any time"
  },
  af: {
    DEFER: "Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.",
    DEFER_NOTED: "Ek het 'n nota gemaak sodat {adviser_first} daarvoor voorbereid is.",
    DEFER_AFTER_CALL: "Dit is 'n vraag vir {adviser_first}, wat self met jou sal opvolg.",
    ID_WARNING: "Vir jou veiligheid, moet asseblief nie ID-nommers in hierdie klets stuur nie.",
    BANK_WARNING: "Vir jou veiligheid, moet asseblief nie bank- of kaartbesonderhede in hierdie klets stuur nie.",
    MEDIA_NOT_OPENED: "Ek kan nie foto's of lêers in hierdie klets oopmaak nie, so hou dit asseblief vir jou oproep met {adviser_first}.",
    DISCLOSE: "Hallo {first_name}, ek is Thandi, Lead Velocity se besprekingsassistent vir {adviser_first}. Ek is 'n KI-assistent, en jy kan enige tyd vra om met 'n mens te praat.",
    DISCLOSE_PRE_ROUTE: "Hallo, ek is Thandi, die SortMyCover-besprekingsassistent van Lead Velocity. Ek is 'n KI-assistent, en jy kan enige tyd vra om met 'n mens te praat.",
    COMMIT_ASK: "Kan jy asseblief die datum en tyd van jou oproep terugstuur sodat ek weet dit is in jou dagboek?",
    COMMIT_OK: "Perfek, dit is ook in {adviser_first} se dagboek.",
    COMMIT_CHECK: "Net om seker te maak: jou oproep is op {date} om {time}. Pas dit jou nog?",
    STAY_IN_LANE: "Ek kan net help met jou oproep met {adviser_first} in hierdie klets.",
    CLARIFY: "Jammer, ek het jou nie mooi verstaan nie. Kan jy dit anders stel?",
    STOP_ACK: "Klaar. Jy sal nie weer boodskappe van ons kry nie.",
    STOP_ACK_BOOKED: "Klaar. Jy sal nie weer boodskappe van ons kry nie. Jou oproep met {adviser_first} op {date} om {time} bly bespreek, tensy jy CANCEL antwoord.",
    CLOSE_OOB_AGE: "Dankie vir jou tyd. Die adviseurs op hierdie diens werk tans met mense van 35 tot 50, so ons sal nie 'n oproep reël nie, en ons sal jou besonderhede uitvee. Jy is welkom om enige gelisensieerde finansiële adviseur self te kontak.",
    CLOSE_OOB_BUDGET: "Dankie vir jou tyd. Die adviseurs op hierdie diens kan dit tans nie aanneem nie, so ons sal nie 'n oproep reël nie, en ons sal jou besonderhede uitvee. Jy is welkom om enige gelisensieerde finansiële adviseur self te kontak.",
    CLOSE_NO_CONSENT: "Geen probleem nie, ons hou nie jou besonderhede nie. Mooi bly.",
    CLOSE_UNBOOKED: "Geen probleem nie. Ons sal jou nie weer hieroor boodskap nie.",
    HANDOFF_IN_HOURS: "Seker, ek het iemand van ons span gevra om jou binnekort hier te boodskap.",
    HANDOFF_OUT_OF_HOURS: "Ons span is nou nie aanlyn nie, so iemand sal jou {open_time_word} teen 09:00 hier boodskap.",
    HANDOFF_FRUSTRATED: "Jammer dat dit frustrerend was. Ek het iemand van ons span gevra om jou binnekort hier te boodskap.",
    HANDOFF_COMPLAINT: "Jammer om dit te hoor. Iemand van ons span sal binne 48 uur antwoord, en jy kan ook na howzit@leadvelocity.co.za e-pos.",
    CONFIRM_THANKS: "Dankie, {first_name}, jy is bevestig. As jy môre 'n salarisstrokie of jou huidige polisskedule byderhand het, help dit, maar dit is nie nodig nie.",
    SAME_METHOD: "Dieselfde as voorheen, per {method}?",
    SLOTS_INTRO: "Hier is die volgende oop tye met {adviser_first}.",
    RESCHED_INTRO: "Geen probleem nie, hier is 'n paar ander tye.",
    CANCEL_CONFIRM_Q: "Wil jy hê ek moet jou oproep op {date} om {time} kanselleer?",
    CANCEL_DONE: "Klaar, jou oproep is gekanselleer. As jy later 'n ander tyd wil hê, sê net.",
    SLOT_TAKEN: "Jammer, daardie tyd is pas gevat. Hier is die volgende oop tye met {adviser_first}.",
    METHOD_NOT_OFFERED: "{adviser_first} bied nie daardie manier van vergader aan nie. Jy kan by {method} bly of 'n ander opsie kies.",
    METHOD_CHANGED: "Ek sal dit na {method} verander.",
    SAVED: "Dankie, ek het dit gestoor.",
    LANG_SWITCH: "Reg so, ons kan in Afrikaans gesels.",
    BOOKING_STATUS: "Jou oproep met {adviser_first} is op {date} om {time}.",
    CONTACT_CALL_NUMBER: "Is dit die nommer waarop {adviser_first} jou moet bel?",
    CONTACT_ALT: "As ons jou nie kan bereik nie, is daar 'n ander nommer?",
    CONTACT_BEST_TIME: "Wanneer is die beste tyd om jou te bereik, as ons ooit moet?",
    CONTACT_TYPE_NUMBER: "Seker, tik asseblief die nommer.",
    CONTACT_TYPE_ALT: "Seker, tik asseblief die ander nommer.",
    CONTACT_BAD_NUMBER: "Dit lyk nie soos 'n Suid-Afrikaanse selnommer nie. Probeer asseblief weer, byvoorbeeld 082 123 4567.",
    CONTACT_KEEP_NUMBER: "Geen probleem nie, ons hou die nommer wat ons het.",
    CONTACT_USE_WA: "Geen probleem nie, ons gebruik hierdie WhatsApp-nommer.",
    PULSE_ASK: "Hallo {first_name}, net een vinnige vraag: was jou oproep met {adviser_first} jou tyd werd? Antwoorde word net as 'n totaal gedeel, nooit met jou naam nie.",
    PULSE_LINE_ASK_UP: "Dankie dat jy ons laat weet. As jy wil, vertel ons in een reël wat dit die moeite werd gemaak het.",
    PULSE_LINE_ASK_DOWN: "Dankie dat jy ons laat weet. As jy wil, vertel ons in een reël wat beter kon gewees het.",
    PULSE_LINE_THANKS: "Dankie, dit help ons om te verbeter.",
    STOP_HINT: "Antwoord STOP as jy nie meer boodskappe wil kry nie.",
    // I-39e: Afrikaans session twins of the W08 nudge templates (EN stays the approved template text in lib/w08.mjs).
    // NUDGE_24H_TEXT takes {first_name} + {bio_short} only (sessionWords maps both {adviser_first} and {bio_short} to vars[1]).
    NUDGE_2H: "Hallo {first_name}, ons volg op oor jou navraag oor lewensdekking. 'n Oproep met {adviser_first} neem omtrent 30 minute, en jy is nie verplig om iets te koop nie. Tik hieronder om oop tye te sien.",
    NUDGE_24H: "Hallo {first_name}, hier is {adviser_first} in omtrent 25 sekondes, sodat jy weet met wie jy oor jou navraag sal praat. Tik hieronder om oop tye te sien.",
    NUDGE_24H_TEXT: "Hallo {first_name}, 'n bietjie oor die adviseur vir jou navraag: {bio_short} Tik hieronder om oop tye te sien.",
    NUDGE_72H: "Hallo {first_name}, dit is ons laaste boodskap oor jou navraag oor lewensdekking. As jy steeds 'n oproep van 30 minute met {adviser_first} wil hê, tik hieronder om 'n tyd te kies. Indien nie, geen probleem nie, ons sal nie weer boodskap nie.",
    BTN_SEE_TIMES: "Sien oop tye",
    BTN_NOT_NOW: "Nie nou nie",
    BTN_NO_THANKS: "Nee dankie",
    BTN_CALL_YES: "Ja, hierdie een",
    BTN_CALL_OTHER: "Ander nommer",
    BTN_ALT_ADD: "Voeg een by",
    BTN_ALT_NO: "Nee dankie",
    BEST_MORNINGS: "Oggende",
    BEST_LUNCHTIME: "Middagete",
    BEST_AFTERNOONS: "Middae",
    BEST_EVENINGS: "Aande",
    BEST_ANY: "Enige tyd"
  }
};

export function fill(line, vars = {}) {
  return String(line).replace(/\{([a-z_]+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** All fixed lines for a language, filled, for outputGate/toneCheck allow-lists. */
export function fixedLines(lang = 'en', vars = {}) {
  const set = LINES[lang] || LINES.en;
  return Object.values(set).map((l) => fill(l, vars));
}
