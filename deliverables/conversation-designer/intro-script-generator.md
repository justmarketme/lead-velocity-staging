# Intro-script generator for W23 (I-40d): spec for intro-media-producer / automation-engineer

The rules, the output shape and the gate are in `conversation/prompts/intro-script.md`. Generation uses `conversation/prompts/script-generator.md` v1.2.0, whose new `ANGLE` line produces one variant per call. The gate is `scriptCheck()` in `conversation/guardrail.mjs` plus `conversation/prompts/script-gate.md`, with the user turn fenced by `classifierInput()`. This file is the n8n shape for **W23**. I did not edit `automation/W23.json`.

## 1. `script-generate` (browser, Bearer JWT; same auth pattern as the existing `Intro interview` / `Intro script-select` webhooks)

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | `Intro script-generate (browser, Bearer JWT)` | webhook POST `/intro/script-generate` | body `{ lang }` (`en`/`af`/other) |
| 2 | `Verify broker JWT (script-generate)` → `JWT valid?` → `Respond 401` | code / if / respond | copy of the interview trio |
| 3 | `Load broker + answers` | postgres (`LV Supabase Postgres`) | `SELECT id, adviser_name, practice_name, fsp_number, city, languages, verified_credentials, positioning_answers FROM brokers WHERE user_id::text = $1` |
| 4 | `Interview complete?` | if | `positioning_answers->>'interview_complete_at'` not null, else `Respond 409 {error:'interview_incomplete'}`. Also 429 if `script_generated_at` < 1 h ago (cost cap). |
| 5 | `Explode 3 angles` | code | returns 3 items `{angle:'who_i_help',id:'v1',label:'Who I help'}`, `{what_happens,v2,'What happens on the call'}`, `{personal,v3,'A bit about me'}`. Builds the generator user turn from `script-generator.md` "User turn template" + `ANGLE: {angle}`; system = the ```prompt block of `script-generator.md` (read from `$env.REPO_DIR`, like W07). |
| 6 | `Generate variant (Sonnet)` | httpRequest → `https://api.anthropic.com/v1/messages` | **one call per item** (n8n runs it per item), `model: $env.ANTHROPIC_MODEL_STRONG` (`claude-sonnet-5-5`), temperature 0.7, max_tokens 400, `x-api-key: {{$env.ANTHROPIC_API_KEY}}`, timeout 30 s, `neverError` |
| 7 | `scriptCheck (deterministic)` | code | parse `{"scripts":[{angle,text}]}` (invalid → `{text:'', gate_pass:false, rule:'invalid_output'}`); `scriptCheck(text, {practice, fsp, verified_credentials}, {lang})`; sets `det` |
| 8 | `Det pass?` | if | false → step 11 with `rule` from the first issue |
| 9 | `Script gate LLM (Haiku, fails closed)` | httpRequest | system = ```prompt block of `script-gate.md`; user = `classifierInput({ draft: text, question: '', lang, surface: 'whatsapp' })`; temperature 0, max_tokens 250, timeout 8 s, `neverError` |
| 10 | `Parse gate (+ Sonnet re-check if pass < 0.8)` | code (+ optional httpRequest) | invalid/timeout = block; a pass below 0.8 confidence is re-run once on Sonnet; a block is final |
| 11 | `Variant result` | code | `{id,label,angle,text,gate_pass,rule,issues}`; if `gate_pass` false and `retry` not set → back to 6 once (same angle, `retry:true`) |
| 12 | `Collect 3 (+ example if none pass)` | code (runOnceForAllItems) | always exactly 3 in `v1,v2,v3` order; adds the fictional 4.10b example (day-neutral close) as `id:'example'` when all 3 fail |
| 13 | `Store variants` | postgres | `UPDATE brokers SET positioning_answers = coalesce(positioning_answers,'{}'::jsonb) || jsonb_build_object('script_variants', $2::jsonb, 'script_generated_at', now(), 'script_gate_version', $3) WHERE user_id::text = $1` |
| 14 | `Log cost` | postgres / file | one `ops.costs` row per LLM call (agent `intro-media-producer`, model, tokens) |
| 15 | `Respond 200 (script-generate)` | respond | `{ variants: [...] }` |

## 2. `script-recheck` (broker-edited text)

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | `Intro script-recheck (browser, Bearer JWT)` | webhook POST `/intro/script-recheck` | body `{ text, lang }`, text ≤ 1,500 chars, else 400 |
| 2 | JWT trio | as above | |
| 3 | `Load broker facts` | postgres | practice_name, fsp_number, verified_credentials |
| 4 | `scriptCheck (deterministic)` → `Det pass?` | code / if | |
| 5 | `Script gate LLM (Haiku, fails closed)` + parse | httpRequest / code | as generate steps 9-10 |
| 6 | `Recheck result` | code | `{pass, rule, issues, warnings, verdict}` (shape in `intro-script.md`); `gate_unavailable` on error |
| 7 | `Store chosen script?` | if → postgres | only when `pass` and the body says `choose: true`: `positioning_answers.chosen_script = {text, checked_at, gate_version}` (this is what the existing `Select script` step reads) |
| 8 | `Respond 200 (script-recheck)` | respond | result JSON (never 4xx for a failed check: a failed check is a normal answer) |

## Conventions

- Inactive and credentials referenced by name only (`LV Supabase Postgres`). Secrets come only from `$env` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_STRONG`, `ANTHROPIC_MODEL_FAST`). `errorWorkflow: W22 Alerts`.
- The script text is never logged in full in `ops.costs` or alerts. The answers are broker data, not lead PII, but they are still kept out of logs.
- After recording, the take still runs `transcriptCheck` (I-7). That is unchanged and already in W23 (`Spoken-word FAIS gate + transcript file`).

## Tests to add (W23 owner)

1. `script-generate` with an incomplete interview → 409.
2. Three mocked Sonnet outputs using `evals/scripts.json` S37 / S38 / S42 → `gate_pass` [true, true, false], `rule` 'FAIS:suitability' or 'I-2', and one retry call on v3.
3. All three blocked → four items including `example`.
4. `script-recheck` on S40 → `{pass:false, rule:'FAIS:premium' | 'FAIS:insurer'}`.
5. Gate LLM timeout → `pass:false, rule:'gate_unavailable'`.
6. Gate pass at confidence 0.6 → Sonnet re-check is called.
