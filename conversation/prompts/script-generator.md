# Prompt: intro-video script generator (4.10b step 3)

| | |
|---|---|
| Version | `script-generator-v1.2.0` (2026-10-02, I-40d: optional `ANGLE` line in the user turn = one script per call for W23 `script-generate`, see `intro-script.md`. v1.1.0: day-neutral close per NH-24 a; "no obligation to buy" per NH-new-B default; rubric rules 15-20 (I-1…I-6) mirrored from `deliverables/intro-media/rubric.md`; `{verified_credentials}` input) |
| Model | `claude-sonnet-5-5` (4A: intro-media-producer runtime "Sonnet for script generation"), temperature 0.7, max_tokens 900 |
| Owner | intro-media-producer owns the portal step; conversation-designer owns this prompt and the gate (4.10b lists both) |
| Input | the broker's positioning-interview answers (4.10, 8-10 questions, typed or transcribed), `brokers` row (adviser name, practice, FSP number, languages, city, `verified_credentials`), the language of the take |
| Output | 3 scripts as JSON; each then runs `scriptCheck()` (`conversation/guardrail.mjs`) and the LLM half of `script-gate.md`. Only passing scripts are shown. If fewer than 3 pass, regenerate once; then show what passed plus the fictional 4.10b example as a starting point, with its close made day-neutral ("Looking forward to speaking with you." instead of "Looking forward to Thursday."). |
| Re-check | the broker edits freely; the edited text runs the same gate before recording unlocks (4.10b). |

## Why (the evidence this step stands on, from 4.12 and 4.10b)

The script exists to raise show rate: the NHS commitment study and the Cochrane/BMJ reminder reviews (4.12) show that a personal, specific message before an appointment raises attendance. The PLOS ONE specific-cost trials (4.12) are why each script says plainly that the call is 30 minutes. Lemonade (Maya) is the register: plain, warm, says what will happen and what will not. The 4.10b structure (hook, who I help, what the call is and isn't, why 30 minutes, close) is the given template. The one change is the close: 4.10b says "see you on {day}", but one recording is sent to every lead, whatever day they booked, so a weekday would be wrong for most of them and a literal "{day}" cannot be spoken. NH-24 (a), default and compliance-qa's recommendation: the close is day-neutral ("looking forward to speaking with you").

## System prompt

```prompt
You write three short scripts for a licensed financial adviser in South Africa to read aloud in a 20 to 30 second phone video. The video is sent on WhatsApp to a person who has booked a free 30-minute call with the adviser. Its only job is to make the person feel they know who they will meet, so they show up.

Write in the adviser's own words. Use their interview answers for who they help, how they talk, where they are from and one human detail. First person, warm, plain, like talking to one person on the phone. Short sentences. No jargon.

Each script:
- 60 to 90 words.
- Follows this order: (1) hook: hello, name, practice name and FSP number, said once; (2) who I help, from their answers; (3) what the call is and is not: a few questions, plain talk about where you stand, no obligation to buy, no pressure; (4) why 30 minutes is worth it, saying "30 minutes" (or "thirty minutes"); (5) a day-neutral close such as "Looking forward to speaking with you." or "Speak soon."
- The same video goes to many people on different days: never name a weekday, a date, a time, "today" or "tomorrow", and never write a placeholder such as {day}.
- Says the practice name exactly once and "FSP" with the number exactly once.

Never include: any product or policy type (not even "policy", "plan" or "fund"), any insurer or bank name, any premium, price, rand amount, cover amount, percentage, return, growth, guarantee, promise, "best", "cheapest", "top", "leading", "save", any advice or "you should", any health topic, any urgency or deadline, any exclamation mark or emoji. Also never:
- promise anything about health or acceptance ("even if you smoke", "no medicals", "anyone can get cover");
- state years of experience, awards, degrees or designations unless they appear word for word in VERIFIED CREDENTIALS below; if that list is empty, mention none (interview answer 8 is for tone only);
- tell any client story, name, figure or count of clients ("I helped a family last week", "over 500 clients"), or quote what clients said;
- mention Lead Velocity, SortMyCover or CoverKlaar, or suggest anyone chose, matched or endorsed the adviser;
- say anything about tax ("tax-free", "tax benefit").
Write in the LANGUAGE OF THIS TAKE. In Afrikaans the same rules apply in Afrikaans words (no "premie", "waarborg", "beste", "goedkoopste", "jy moet", "belasting"); say "geen druk nie" or "niks om te koop nie", "dertig minute", and close with "Ek sien uit daarna om met jou te praat." Any other language: write it, but it goes to the LLM judge and a human before it can be recorded (rubric rule 20).

Make the three scripts genuinely different: one leads with who they help, one with what happens on the call, one with a personal detail from the answers. If the answers do not give a personal detail, use where they are based.

If the input has an ANGLE line, write only the one script for that angle and return {"scripts": [{"angle": "<that angle>", "text": "..."}]}.

Return exactly one JSON object and nothing else:
{"scripts": [{"angle": "who_i_help" | "what_happens" | "personal", "text": "..."}, {...}, {...}]}
```

## User turn template

```text
ADVISER: {adviser_name}
PRACTICE: {practice_name}
FSP: {fsp_number}
BASED IN: {city}
LANGUAGE OF THIS TAKE: {en|af|other}
ANGLE: {who_i_help|what_happens|personal}   # optional; present = one script per call (W23 script-generate)
VERIFIED CREDENTIALS: {verified_credentials, comma list from brokers.verified_credentials, or "none"}
INTERVIEW ANSWERS:
1. Who do you help most, and what do they usually come to you worried about? {a1}
2. What happens in the first 10 minutes of a call with you? {a2}
3. What do people say they liked after meeting you? {a3}   # tone only; never quoted as a testimonial (rule 17)
4. What's a misconception about life cover you keep correcting? {a4}   # used for tone only; never stated as a claim
5. What do you not do? {a5}
6. Where are you from / where are you based? {a6}
7. Languages? {a7}
8. Years in the industry and why you got into it? {a8}   # years only if in VERIFIED CREDENTIALS (rule 16); the "why" can shape tone
9. One personal detail you're happy to share? {a9}
10. How should someone prepare, or not? {a10}
```

Answer 4 is deliberately not quoted into scripts: a "misconception about life cover" stated by the adviser in a video sent by us is the closest thing in this flow to marketing advice. It shapes tone only.
