# evals/ : Thandi eval gate (6B.1)

Any change to a Thandi prompt, `conversation/*.mjs`, `knowledge/faq.md` or these fixtures runs this eval in CI and **cannot merge** below FAIS 100%, tone 95%, STOP 100%, or below the rates in `baseline.json`. Rollback is one commit.

## Files

| File | What |
|---|---|
| `golden-set.json` | 238 synthetic turns (≥ 200 required): expected intent, secondary intents, topics, slots, deferral, redaction and the actions `decide()` must return. EN + AF (38), typos, voice-note text, multi-intent, STOP variants and controls, out-of-band answers, health/ID, "speak to a person", reschedule context, commitment echoes. 7 are tagged `llm_only` (paraphrases the regex is not expected to catch; scored live). |
| `red-team.json` | 50 adversarial prompts (premium 8, cover amount 6, product 6, comparison/insurer 6, tax 4, health 5, jailbreak 5, prompt injection 6, impersonation 4), each with the route and actions expected and an `unsafe_draft` the gate must block. compliance-qa signs off (4.11). |
| `scripts.json` | 20 intro-video scripts (8 compliant, 12 that must be blocked) for the 4.10b script gate |
| `briefs.json` | 5 pre-call briefs (2 compliant, 3 leaking health/surname/email/exact age) |
| `rubric.md` | what "good" means, rule by rule, and which check enforces it |
| `run.mjs` | the harness (Node 18+, zero dependencies) |
| `baseline.json` | last accepted rates per mode (`dry`, `live`); a PR may not go below them |
| `results/` | per-run JSON output (git-ignored) |

## Run it

```bash
node evals/run.mjs --dry-run              # offline, no key, ~1 s. This is what CI always runs.
node evals/run.mjs --dry-run --verbose    # list every failing check
ANTHROPIC_API_KEY=... node evals/run.mjs  # dry-run checks + live Haiku checks
node evals/run.mjs --limit 40             # live on the first 40 golden cases only
node evals/run.mjs --dry-run --update-baseline   # after a reviewed improvement
```

Behind the outbound proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1` (and `NODE_EXTRA_CA_CERTS` pointing at the proxy CA bundle).

## What the dry run proves (no API calls)

1. **Fixtures and documents are valid and consistent**: every intent, topic, slot value and action is in the vocabulary of `conversation/logic.mjs`; the intent prompt lists every intent, topic and slot; every fixed line in `conversation/lines.mjs` appears verbatim in `deferral-lines.md` / `handoff.md`; `knowledge/faq.md` has 25 answers + the defer entries, each mapped to a topic.
2. **FAIS (deterministic layer)**: the prefilter flags every non-`llm_only` advice/health question (golden + red-team); the output gate blocks all 50 unsafe drafts; FAQ answers and fixed lines pass the gate unchanged; defer entries are the verbatim deferral line; health/ID redaction leaves nothing behind; the script gate and brief check agree with every fixture.
3. **STOP**: exact on 230 cases, including negated controls.
4. **State machine**: `decide()` returns the documented actions for all 238 golden and 49 red-team turns.
5. **Tone**: reference replies, fixed lines and FAQ answers pass `toneCheck` (sentences, questions, emoji, "!", reading grade).
6. **Precision**: the prefilter false-positive rate on harmless questions (0% now; max 5%).

The dry run cannot prove what the LLMs will do. That is the live run's job.

## What the live run adds (only when `ANTHROPIC_API_KEY` is set and `--dry-run` is not passed)

On `claude-haiku-4-5-20251001`, temperature 0: intent accuracy, slot accuracy and JSON validity on the golden set; **deferral recall of the whole system** (prefilter OR model topics) including the `llm_only` paraphrases, which must be 100%; live reply generation for cases with a reference reply, scored by the same output gate and `toneCheck`; the guardrail classifier must block all 50 red-team drafts and pass the fixed lines and FAQ answers. Cost of a full live run is roughly 900 calls, well under US$1 at Haiku prices; the harness prints token usage.

## CI (6B.1, devops-security wires it)

GitHub Actions is used only for this gate (NH-06 default). Job on every PR touching `conversation/**`, `knowledge/faq.md` or `evals/**`:

```yaml
- run: node evals/run.mjs --dry-run
- run: node evals/run.mjs --limit 80        # only when the ANTHROPIC_API_KEY secret is available (protected branches)
```

Merge is blocked if either step exits non-zero. Baselines are raised only by a reviewed commit that runs `--update-baseline`.

## Adding a case

Every production failure (W33 judge finding, weekly review, guardrail trip) becomes a golden or red-team case **before** the fix, so the fix is proven and can never regress. Synthetic data only: no real names, numbers or messages (0.3 #10).
