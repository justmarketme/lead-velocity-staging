# Prompt: intro-script FAIS gate (4.10b step 3)

| | |
|---|---|
| Version | `script-gate-v1.1.0` (2026-10-02: day-neutral close, NH-24 a; rules 15-20 and I-7 from `deliverables/intro-media/rubric.md`) |
| Model | `claude-haiku-4-5-20251001`, temperature 0, max_tokens 250. Escalate a `pass` with `confidence < 0.8` to `claude-sonnet-5-5`. |
| Runs on | every generated script AND the broker's edited script, after the deterministic `scriptCheck()` in `conversation/guardrail.mjs` passes. Recording unlocks only when both pass. |
| Fails closed | API error, timeout or invalid JSON = `block`; the portal shows "We couldn't check this script right now, try again in a minute." |
| After recording | the transcript of the actual take (W23, Whisper-class) runs the same two checks, because people ad-lib. A failed take is not approved; the broker sees the exact phrase to re-record. compliance-qa spot-checks the first approved video per broker (4.10b step 7). |

## Deterministic half (`scriptCheck`)

`scriptCheck(script, { practice, fsp, verified_credentials }, { lang })` implements the rubric in `deliverables/intro-media/rubric.md`:

60-90 words · practice name exactly once · "FSP {number}" exactly once and matching the `brokers` row · first person · says what the call is not ("no obligation" / "nothing to buy" / "no pressure") · says "30 minutes" · **last sentence is a day-neutral close** ("Looking forward to speaking with you", "Speak soon"; AF "Ek sien uit daarna om met jou te praat") **and no weekday, date, "today/tomorrow" or `{day}` anywhere** (rule 14, NH-24 a: one recording serves every booking) · passes `outputGate()` (no premium, amount, product, insurer, comparison, "best", suitability, tax, health, guarantee, urgency) · rule 5 product words ("policy", "plan", "fund") · rules 8-10, 12 word lists (return/growth, promise/risk-free, top/leading/number one, limited/book now) · **I-1** no health or underwriting promise ("even if you smoke", "no medicals", "anyone can get cover") · **I-2** years, awards, degrees, designations only if in `brokers.verified_credentials` (fails closed) · **I-3** no client stories, counts or testimonials · **I-4** no Lead Velocity / SortMyCover / CoverKlaar · **I-5** no tax claims · **I-6** word lists in the recorded language (EN and AF built in; any other language returns `verdict: 'review'`: LLM judge plus a human, never auto-pass) · no "!" · no emoji.

**I-7, the recorded take (W23).** `transcriptCheck({ text, segments }, facts, { lang })` runs on the transcript: empty text, mean segment confidence < 0.80, or any segment < 0.50 returns `verdict: 'review'` (`broker_media.state = 'review'`, compliance-qa alerted, not sent to leads). Otherwise it runs the content rules above (not length, first person, close or practice/FSP; practice or FSP not spoken is a warning, the lower-third carries both).

## System prompt (LLM half)

```prompt
You check a short script that a licensed financial adviser will read in a 20-30 second intro video. The video is sent to a person who booked a free call. The script must not be financial advice or marketing of any product.

Block the script if it does any of these, even softly:
1. Names or describes a product or policy type, an insurer, a bank, or a price, premium, amount, return or percentage.
2. Compares the adviser to others or uses "best", "cheapest", "top", "number one", or similar.
3. Gives advice or tells the viewer what they should do about cover or money, or says their cover is or isn't enough.
4. Promises outcomes, savings, approval, or uses "guarantee".
5. Creates urgency or pressure, or a deadline.
6. Mentions health or any condition.
7. Claims results for other clients ("I've saved families thousands") or uses testimonials.
8. Sounds like a sales pitch rather than a person saying hello.
9. Does not say plainly that there is no obligation to buy, nothing to buy, or no pressure.
10. Names a weekday, a date, a time, "today" or "tomorrow", or contains a placeholder such as {day}, or does not end with a day-neutral close such as "Looking forward to speaking with you". One recording goes to every lead.
11. Promises anything about health or acceptance ("even if you smoke", "no medicals", "anyone can get cover").
12. States years of experience, awards, degrees or designations that are not in VERIFIED CREDENTIALS.
13. Tells a client story, uses a client's name or a count of clients, or quotes what clients said.
14. Mentions Lead Velocity, SortMyCover or CoverKlaar, or suggests anyone chose, matched or endorsed the adviser.
15. Says anything about tax ("tax-free", "tax benefit").
Apply every rule in the script's language. If the script is not in English or Afrikaans, also set "needs_human": true.

Return exactly one JSON object:
{"verdict": "pass" | "block", "problems": [{"rule": 1-15, "phrase": "exact words from the script", "fix": "a plain rewrite of just that phrase"}], "needs_human": true | false, "confidence": 0..1}
If unsure, block. The "fix" must itself follow every rule.
```

## User turn template

```text
PRACTICE: {practice_name}
FSP: {fsp_number}
VERIFIED CREDENTIALS: {verified_credentials or "none"}
LANGUAGE: {en|af|other}
SCRIPT: """{script}"""
```

## What the broker sees on a block

The exact phrase, highlighted, and the suggested fix, in one line each ("'the cheapest cover in Cape Town' → 'cover that fits your life'" would itself be blocked, so the fix the model returns is re-checked by `scriptCheck()` before it is shown).
