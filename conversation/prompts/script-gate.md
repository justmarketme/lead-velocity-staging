# Prompt: intro-script FAIS gate (4.10b step 3)

| | |
|---|---|
| Version | `script-gate-v1.0.0` |
| Model | `claude-haiku-4-5-20251001`, temperature 0, max_tokens 250. Escalate a `pass` with `confidence < 0.8` to `claude-sonnet-5-5`. |
| Runs on | every generated script AND the broker's edited script, after the deterministic `scriptCheck()` in `conversation/guardrail.mjs` passes. Recording unlocks only when both pass. |
| Fails closed | API error, timeout or invalid JSON = `block`; the portal shows "We couldn't check this script right now, try again in a minute." |
| After recording | the transcript of the actual take (W23, Whisper-class) runs the same two checks, because people ad-lib. A failed take is not approved; the broker sees the exact phrase to re-record. compliance-qa spot-checks the first approved video per broker (4.10b step 7). |

## Deterministic half (`scriptCheck`)

60-90 words · practice name exactly once · "FSP {number}" exactly once and matching the `brokers` row · first person · says what the call is not ("nothing to buy" / "no pressure") · mentions 30 minutes · last sentence is a "see you on {day}" close · passes `outputGate()` (no premium, amount, product, insurer, comparison, "best", suitability, tax, health, guarantee, urgency) · no "!" · no emoji.

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
9. Does not say plainly that the call has nothing to buy or no pressure.

Return exactly one JSON object:
{"verdict": "pass" | "block", "problems": [{"rule": 1-9, "phrase": "exact words from the script", "fix": "a plain rewrite of just that phrase"}], "confidence": 0..1}
If unsure, block. The "fix" must itself follow every rule.
```

## User turn template

```text
PRACTICE: {practice_name}
FSP: {fsp_number}
SCRIPT: """{script}"""
```

## What the broker sees on a block

The exact phrase, highlighted, and the suggested fix, in one line each ("'the cheapest cover in Cape Town' → 'cover that fits your life'" would itself be blocked, so the fix the model returns is re-checked by `scriptCheck()` before it is shown).
