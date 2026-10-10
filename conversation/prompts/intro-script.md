# Intro-script generator contract (4.10b step 3, I-40d)

| | |
|---|---|
| Version | `intro-script-v1.0.0` (2026-10-02) |
| Owner | conversation-designer (prompts + gate); intro-media-producer owns the portal step and `automation/W23.json` |
| What this file is | The **contract** for W23 `script-generate` / `script-recheck`. It adds no new prompt text. Generation uses `script-generator.md` (v1.2.0, `ANGLE` mode = one variant per call), and the gate is `scriptCheck()` + `script-gate.md`. One generator and one gate, never a second copy (0.2 reuse first). |
| Model | generation `claude-sonnet-5-5` (4A: intro-media-producer runtime), temperature 0.7, max_tokens 400 per variant; gate LLM `claude-haiku-4-5-20251001`, temperature 0; a `pass` with confidence < 0.8 is re-checked on Sonnet |

## When it runs

Generation runs only when `brokers.positioning_answers.interview_complete_at` is set. W23 `script-generate` returns `409 interview_incomplete` otherwise. A re-generate is allowed once per hour (cost cap) and overwrites `positioning_answers.script_variants`.

## The 4.10b positioning rules (what the generator is held to)

1. **Structure:** hook (hello, first name, practice name, "FSP {number}") → who I help (answer 1) → what the call is and isn't (answers 2 and 5: a few questions, plain talk, no obligation to buy, no pressure) → why 30 minutes → day-neutral close.
2. **Length:** 60-90 words. That is 20-30 s spoken, and the 25-s target from the 4.10b broker line is the middle of the band. `scriptCheck` enforces the word count, because the take is measured on the transcript (I-7).
3. **Identity line:** the adviser's first name (full name allowed), the practice name exactly once and "FSP" + the number exactly once, matching the `brokers` row. No other identity claims: no years, awards, degrees or designations unless they are word for word in `brokers.verified_credentials` (I-2), no client counts or stories (I-3), and no mention of Lead Velocity, SortMyCover or CoverKlaar (I-4).
4. **FAIS boundary** (the same lists as `conversation/guardrail.mjs` `outputGate` and `guardrail.md` categories 1-10):
   - no product or policy type, including "policy", "plan" and "fund";
   - no insurer or bank;
   - no premium, quote, rand amount, cover amount, percentage, return or growth;
   - no comparison, "best", "cheapest", "top" or "leading";
   - no suitability ("you should", "you need");
   - no tax and no health or underwriting promise;
   - no guarantee, urgency or scarcity;
   - no "!" and no emoji.
5. **Answer 4** (the misconception) and **answer 3** (what clients say) shape tone only and are never stated or quoted.
6. **Language:** EN and AF are auto-gated. Any other language returns `review` (LLM judge plus a human, never auto-pass, rubric rule 20).

## Output shape (stored in `brokers.positioning_answers.script_variants`, returned to the portal)

```json
[
  {"id": "v1", "label": "Who I help",        "angle": "who_i_help",   "text": "...", "gate_pass": true,  "rule": null, "issues": []},
  {"id": "v2", "label": "What happens on the call", "angle": "what_happens", "text": "...", "gate_pass": true,  "rule": null, "issues": []},
  {"id": "v3", "label": "A bit about me",    "angle": "personal",     "text": "...", "gate_pass": false, "rule": "I-2", "issues": ["I-2 unverified credential or years (\"20 years\")"]}
]
```

- There are always exactly three entries, one per angle. `gate_pass` is true only when `scriptCheck().verdict === 'pass'` **and** the gate LLM says `pass` with confidence ≥ 0.8.
- A failed variant is regenerated **once** with the same angle. If it still fails, it is returned with `gate_pass: false`, and the portal shows it greyed out with the rule. The broker can edit it (→ `recheck`), but it cannot be recorded as it stands.
- If no variant passes after the retry, a fourth item is added: `{"id":"example","label":"Example to adapt","text":<the fictional 4.10b example with the day-neutral close>,"gate_pass":true}`.
- `rule` is the first failing rule code, mapped from the issue text: `FAIS:<category>`, `rule 5`, `rule 12`, `rule 14`, `I-1`…`I-6`, `length`, `practice_once`, `fsp_once`, `first_person`, `call_is_not`, `30_minutes`, `close`, or `llm:<category>` from the gate LLM.

## The gate (both halves, every variant, generated or edited)

1. `scriptCheck(text, { practice, fsp, verified_credentials }, { lang })` is deterministic and already contains `outputGate()` plus rules 5-20 and I-1…I-6. It is free and cannot be persuaded, and the eval proves it (`evals/scripts.json`, `fais.script_gate`).
2. Only if (1) passes: the gate LLM `script-gate.md`, which fails closed.

**Why `script-gate.md` and not the WhatsApp classifier via `classifierInput()`.** The WhatsApp classifier (`guardrail.md`) is written for Thandi's chat replies. On an adviser script it would wrongly block:
- category 11, persona_break: a script says "I'm Mark" in the first person;
- category 12, off_scope: "who I help";
- category 13 is defined for public replies.

`script-gate.md` holds the same FAIS categories (product, insurer, price, comparison, suitability, tax, health, guarantee, urgency) and is phrased for a spoken script. Its user turn is fenced the same way `classifierInput()` fences a draft: `redactForLLM`, triple quotes collapsed, at most 1,200 characters. W23 builds it with `classifierInput({ draft: text, question: '', lang, surface: 'whatsapp' })`, and only the **system prompt** differs. That keeps one fencing function for every gate, as the I-40d brief asked, without the false blocks. The I-40d brief named the WhatsApp classifier; using `script-gate.md` instead is listed as a needs_human item below.

## `recheck` mode (broker-edited text)

The input is `{ text, lang }` for the logged-in broker (JWT). It runs the same two halves on the edited text and returns:

```json
{"pass": false, "rule": "FAIS:insurer", "issues": ["FAIS: insurer (\"Old Mutual\")"], "warnings": [], "verdict": "block"}
```

- `pass: true` only when both halves pass. The portal then unlocks Record and stores `positioning_answers.chosen_script = { text, checked_at, gate_version }`.
- An API error or timeout returns `{"pass": false, "rule": "gate_unavailable"}`, and the portal shows "We couldn't check this script right now, try again in a minute." (fails closed).
- `verdict: 'review'` (a language other than EN/AF) returns `pass: false, rule: "review"`, and compliance-qa is alerted.

## Evidence in the eval

`evals/scripts.json` S37-S42 (I-40d) cover three passes (who_i_help, what_happens, Afrikaans personal) and three blocks:
- S40: insurer + premium figure;
- S41: weekday close + urgency;
- S42: unverified years + client count + "you should".

`node evals/run.mjs --dry-run` → `fais.script_gate` 42/42.
