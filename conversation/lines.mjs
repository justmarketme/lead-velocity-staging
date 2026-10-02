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
    // 2.1.7: an ID number was typed. Sent once, after DEFER.
    ID_WARNING: "For your safety, please don't send ID numbers in this chat.",
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
    SAME_METHOD: "Same as before, by {method}?"
  },
  af: {
    DEFER: "Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.",
    DEFER_NOTED: "Ek het 'n nota gemaak sodat {adviser_first} daarvoor voorbereid is.",
    ID_WARNING: "Vir jou veiligheid, moet asseblief nie ID-nommers in hierdie klets stuur nie.",
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
    SAME_METHOD: "Dieselfde as voorheen, per {method}?"
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
