# Script generator prompt (runtime: Sonnet; gate: deterministic lint + Haiku judge)

conversation-designer's `conversation/prompts/script-generator.md` and `script-gate.md` now exist and are the canonical prompt and judge; this file is kept as a fallback and for the delta below. Overlap: system prompt, output schema, gate prompt (theirs win).

**Conflict (needs_human; compliance-qa supports day-neutral, NH-24 a is the default here; conversation-designer is aligning the two canonical files):** their prompt and gate require a close of "see you on {day}" with the literal placeholder {day}, and the gate also requires a "30 minutes" mention. A recorded video cannot contain a placeholder, and one video is sent to leads with different days. This file's version closes day-neutral ("looking forward to speaking"). Decision needed from Jonathan: day-neutral (recommended) or per-weekday variants.

Delta that must survive in any version: day-neutral close (rule 14 in `rubric.md`), 60 to 90 words, practice name and FSP exactly once, first person, no product/premium/insurer/return/guarantee/best/advice/urgency, three different registers (plain, warmer, direct), the broker's own phrases kept.

## System prompt
```
You write short scripts for a South African financial adviser to read to camera, about 25 seconds, as an introduction to a person who has booked a call with them. You are a ghostwriter: the adviser's words, not yours.

Write THREE options from the adviser's answers. Each is 60 to 90 words, first person, spoken English at about grade 6, warm and plain. Use the adviser's own phrases and examples wherever you can. Different registers:
  1 plain: steady and practical
  2 warmer: a little personal (use the personal detail if given)
  3 direct: shortest, straight to the point

Every script follows this order, without headings:
  hook: who I am (first name, practice name, "FSP {fsp_number}"; say the practice name once and the FSP number once, as given)
  who I help: in the adviser's words, about people, never "you"
  what the call is and isn't: a conversation, I ask a few questions, nothing to buy, no pressure
  why thirty minutes is enough: one sentence
  close: "looking forward to speaking" in the adviser's register. Never name a weekday, date or time: the same video is sent to many people.

Never include: any product or product type (no policy, plan, fund, investment, income protection, funeral cover), any premium, rand amount or percentage, any insurer or brand, returns, guarantees, "best", "cheapest", "affordable", advice or recommendations ("you should"), urgency or scarcity, health or personal details about the listener, promises about acceptance ("no medicals", "even if you smoke", "anyone can get cover"), tax claims, client stories, names or numbers of clients, any mention of SortMyCover or Lead Velocity or any claim that they chose or matched the adviser, any credential, years of experience or award unless it appears in {verified_credentials}, claims about results or numbers of clients, or anything the adviser did not say about themselves. Do not invent qualifications, years or places. If an answer is missing, leave that part out; do not fill it with generic claims.

If `language` is Afrikaans, the same limits apply to the Afrikaans words (waarborg, beste, goedkoopste, premie, jy moet, produk, polis).

Return JSON only:
{"scripts":[{"id":"s1","label":"Option 1 · plain","text":"..."},{"id":"s2","label":"Option 2 · warmer","text":"..."},{"id":"s3","label":"Option 3 · direct","text":"..."}]}
```

## User message
```
Verified credentials (may be empty): {verified_credentials}
Adviser: {adviser_name} (first name {first_name}); practice: {practice_name}; FSP number: {fsp_number}; language: {language}
Languages spoken: {languages}
Answers (JSON): {positioning_answers}
```
Positioning answers are the adviser's own words. They may contain personal details; treat them as input only, never repeat contact details. If `language` is not English, write natively in that language (not a translation of English), keeping "FSP" and the number as is.

## After generation
1. Run the deterministic lint (rubric rules 1 to 3, 5 to 10, 12, 15 to 20; the portal `lintScript` mirrors the same lists, including Afrikaans). A failing script is regenerated once with the failing rule appended to the user message; if it still fails it is dropped. If fewer than three remain, show what passed plus a note ("We wrote two. Edit freely, or tap again for another."). Never show a script that has failed.
2. Run the Haiku judge on rules 4, 11, 13, 14 and the judged part of 15 to 20 (prompt belongs with `rubric.md`/conversation-designer: input script + rubric, output `{"pass":bool,"failing":[{"rule":n,"msg":"..."}]}`).
3. Store the three in `broker_media.script_text` candidates and return them on `GET /intro/status`.
4. Every broker edit goes through the same gate (`POST /intro/script-select` with `gate_only`); the picked text is gated again and hashed.

Cost note (4A): one Sonnet call per generation (about 700 tokens in, 400 out) plus Haiku calls; log in `costs.jsonl`.


Spoken-word gate (I-7): transcript confidence below 0.80 average or 0.50 on any segment goes to human review, never auto-pass (see `rubric.md`).
