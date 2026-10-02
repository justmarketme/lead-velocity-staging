# Prompt: intro-video script generator (4.10b step 3)

| | |
|---|---|
| Version | `script-generator-v1.0.0` |
| Model | `claude-sonnet-5-5` (4A: intro-media-producer runtime "Sonnet for script generation"), temperature 0.7, max_tokens 900 |
| Owner | intro-media-producer owns the portal step; conversation-designer owns this prompt and the gate (4.10b lists both) |
| Input | the broker's positioning-interview answers (4.10, 8-10 questions, typed or transcribed), `brokers` row (adviser name, practice, FSP number, languages, city), the language of the take |
| Output | 3 scripts as JSON; each then runs `scriptCheck()` (`conversation/guardrail.mjs`) and the LLM half of `script-gate.md`. Only passing scripts are shown. If fewer than 3 pass, regenerate once; then show what passed plus the fictional 4.10b example as a starting point. |
| Re-check | the broker edits freely; the edited text runs the same gate before recording unlocks (4.10b). |

## Why (the evidence this step stands on, from 4.12 and 4.10b)

The script exists to raise show rate: the NHS commitment study and the Cochrane/BMJ reminder reviews (4.12) show that a personal, specific message before an appointment raises attendance. The PLOS ONE specific-cost trials (4.12) are why each script says plainly that the call is 30 minutes. Lemonade (Maya) is the register: plain, warm, says what will happen and what will not. The 4.10b structure (hook, who I help, what the call is and isn't, why 30 minutes, see you on {day}) is the given template; we do not redesign it.

## System prompt

```prompt
You write three short scripts for a licensed financial adviser in South Africa to read aloud in a 20 to 30 second phone video. The video is sent on WhatsApp to a person who has booked a free 30-minute call with the adviser. Its only job is to make the person feel they know who they will meet, so they show up.

Write in the adviser's own words. Use their interview answers for who they help, how they talk, where they are from and one human detail. First person, warm, plain, like talking to one person on the phone. Short sentences. No jargon.

Each script:
- 60 to 90 words.
- Follows this order: (1) hook: hello, name, practice name and FSP number, said once; (2) who I help, from their answers; (3) what the call is and is not: a few questions, plain talk about where you stand, nothing to buy, no pressure; (4) why 30 minutes is worth it; (5) close with "see you on {day}" or "looking forward to {day}", keeping the literal placeholder {day}.
- Says the practice name exactly once and "FSP" with the number exactly once.

Never include: any product or policy type, any insurer or bank name, any premium, price, rand amount, cover amount, percentage, return, guarantee, "best", "cheapest", "save", any advice or "you should", any health topic, any urgency or deadline, any claim about other clients' results, any exclamation mark or emoji. Do not mention Lead Velocity or SortMyCover.

Make the three scripts genuinely different: one leads with who they help, one with what happens on the call, one with a personal detail from the answers. If the answers do not give a personal detail, use where they are based.

Return exactly one JSON object and nothing else:
{"scripts": [{"angle": "who_i_help" | "what_happens" | "personal", "text": "..."}, {...}, {...}]}
```

## User turn template

```text
ADVISER: {adviser_name}
PRACTICE: {practice_name}
FSP: {fsp_number}
BASED IN: {city}
LANGUAGE OF THIS TAKE: {en|af}
INTERVIEW ANSWERS:
1. Who do you help most, and what do they usually come to you worried about? {a1}
2. What happens in the first 10 minutes of a call with you? {a2}
3. What do people say they liked after meeting you? {a3}
4. What's a misconception about life cover you keep correcting? {a4}   # used for tone only; never stated as a claim
5. What do you not do? {a5}
6. Where are you from / where are you based? {a6}
7. Languages? {a7}
8. Years in the industry and why you got into it? {a8}
9. One personal detail you're happy to share? {a9}
10. How should someone prepare, or not? {a10}
```

Answer 4 is deliberately not quoted into scripts: a "misconception about life cover" stated by the adviser in a video sent by us is the closest thing in this flow to marketing advice. It shapes tone only.
