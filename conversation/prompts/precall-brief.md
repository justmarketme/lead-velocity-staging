# Prompt: pre-call brief for the adviser (W11, T-15 min)

| | |
|---|---|
| Version | `precall-brief-v1.0.0` |
| Model | `claude-sonnet-5-5` (4A: "pre-call brief on Sonnet"), temperature 0.2, max_tokens 600 |
| Trigger | W11 at T-15 min before the slot (also rendered in the portal from booking time onward) |
| Delivered as | utility template `precall_brief` (9 variables, `automation/templates/precall_brief.json`) + the full brief in the portal ("Open brief") + the calendar event body link |
| Checked by | `briefCheck()` in `conversation/guardrail.mjs` before send: no health words beyond the fixed line, no ID digits, no surname, no email address, no exact age, every template variable free of newlines and under 200 characters. Fails closed: on failure the template goes out with variables built by code only (no AI text) and the console gets a flag. |

## Why this is the headline broker feature

Conversica / Verse: the hand-off moment is where an AI follow-up earns its keep, so the human walks in knowing the person. MediaAlpha / EverQuote: quality is what the adviser reports afterwards, and a prepared adviser rates leads higher. Chili Piper: the brief is the last step of "qualify, route, book" in one flow, not a separate export. This brief is the adviser's, not the lead's, so it may summarise what the lead said; it still never contains special personal information.

## Inputs (built by W11 from Postgres; the model sees nothing else)

```json
{
  "lead": {"first_name": "Lerato", "last_initial": "M", "age_band": "35-44", "budget_band": "750-1250", "bond": "yes", "dependants": "yes", "work_cover": "yes"},
  "booking": {"time": "11:00", "date": "Thu 8 Oct", "method": "teams", "link": "https://teams.microsoft.com/l/meetup-join/...", "rescheduled_count": 0},
  "contact": {"call_number": null, "call_number_differs": false, "alt_number": null, "best_time": "afternoons", "language": "English"},
  "asked": [
    {"topic": "sales_pressure", "words": "Will he try sell me something though?"},
    {"topic": "premium", "words": "roughly what would cover cost for someone my age?", "deferred": true}
  ],
  "signals": {"commitment_echo_minutes": 8, "confirmed_t24": true, "intro_media_played": true, "health_question": false},
  "adviser_corpus": ["(per-broker 'what mattered' lines from W29 voice-note summaries, max 5, anonymised)"]
}
```

Code has already applied these rules before the model sees the input: health words replaced by `health_question: true`; ID numbers removed; surname reduced to an initial; email removed (the Teams link is in `booking.link`).

## System prompt

```prompt
You write a short pre-call brief for a licensed financial adviser who is about to have a 30-minute call with a person who booked through SortMyCover. The adviser reads it on a phone 15 minutes before the call. Write in plain English for the adviser. Use only the JSON you are given. Never invent a fact, a feeling or a quote.

Return exactly one JSON object and nothing else:
{
  "template_vars": {
    "1": "<first name + initial, e.g. Lerato M.>",
    "2": "<time>",
    "3": "<method in words, e.g. Teams, phone call, WhatsApp call>",
    "4": "<number to call, add ' (not the WhatsApp number)' if call_number_differs; 'Teams link in the event' for video methods>",
    "5": "<best time, or 'not given'>",
    "6": "<age band>",
    "7": "<budget band in words, e.g. R750 to R1,250 a month>",
    "8": "<what they asked before the call, in their own words where short, separated by '; ', add '(deferred to you)' after deferred items; if health_question is true add 'has a health question for you'; if nothing, 'nothing yet'>",
    "9": "<preferred language>"
  },
  "portal": {
    "who": "<one line: bands and facts only, e.g. 35-44, has a bond, people depend on them, has cover through work, comfortable with R750 to R1,250 a month>",
    "asked": ["<each question in their own words, quoted, with '(deferred to you)' where deferred>"],
    "mattered": "<one or two lines on what seemed to matter, ONLY from what they asked and the signals; if there is too little, write 'Not enough to say yet.'>",
    "practical": "<method, link or number to call, alternative number if any, best time, language>",
    "suggested_opening": "<optional, max 20 words, only if 'asked' gives a clear starting point; otherwise empty string>"
  }
}

Rules:
- Bands only. Never write an exact age, income, salary or amount beyond the band.
- First name and initial only. Never write a surname, ID number or email address.
- Health: if health_question is true, write only "has a health question for you". Never name a condition, even if one appears in the input by mistake. If you see one, leave it out.
- Their words: quote short questions exactly as given in "asked.words". Do not tidy their grammar. Do not quote anything that is not in the input.
- No advice to the adviser about products, insurers or amounts. You may say what the person seemed to care about, if the input shows it.
- Template variables: one line each, no line breaks, no more than 200 characters each.
- Signals: "commitment_echo_minutes" means they typed the date and time back that many minutes after booking; "intro_media_played" means they played the adviser's intro; mention these briefly in "mattered" only if true.
```

## Example output (fictional, matches the approved journey mock)

```json
{
  "template_vars": {
    "1": "Lerato M.", "2": "11:00", "3": "Teams", "4": "Teams link in the event", "5": "afternoons", "6": "35-44",
    "7": "R750 to R1,250 a month",
    "8": "\"Will he try sell me something though?\"; \"roughly what would cover cost for someone my age?\" (deferred to you)",
    "9": "English"
  },
  "portal": {
    "who": "35-44, has a bond, people depend on her income, has cover through work, comfortable with R750 to R1,250 a month.",
    "asked": ["\"Will he try sell me something though?\"", "\"roughly what would cover cost for someone my age?\" (deferred to you)"],
    "mattered": "Reassurance that it is not a sales call. She typed the date and time back within 8 minutes and played your intro video.",
    "practical": "Teams, link in your Outlook event. No alternative number. Afternoons. English.",
    "suggested_opening": "Start by saying there is nothing to sell today, then ask about the bond."
  }
}
```

The budget band appears in the brief because the adviser needs it; it is a band the lead chose, not a quote. The brief goes only to the routed adviser (exclusive lead, 1.3).
