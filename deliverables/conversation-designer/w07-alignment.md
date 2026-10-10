# W07 / W08 / W29 alignment with the conversation spec (I-35e) — conversation-designer, 2026-10-02

Scope: `automation/lib/w07.mjs`, `automation/W07.json`, `automation/lib/w08.mjs` + `automation/W08.json`, `automation/lib/w29.mjs`, checked against `conversation/prompts/guardrail.md` (gate order), `conversation/prompts/reply.md` (now `reply-v1.0.2`), `conversation/lines.mjs`, `docs/MASTER-PROMPT.md` 4.11 / 4.12 / 4.12a and FAQ-25. I did not edit any W0x.json or lib file; everything below is for automation-engineer. Line numbers are as of this commit.

## Verdict

| Question | Verdict |
|---|---|
| W07 runs the pipeline in the order guardrail.md specifies | **Mostly.** prefilter → redactForLLM → intent → `decide()` → reply → classifier → toneCheck → send is in place, every LLM draft passes all three gates, and the classifier fails closed. Two gaps: `outputGate` runs *after* the classifier instead of before it (change 3), and a classifier `pass` with confidence < 0.8 is accepted instead of being re-checked (change 4). |
| `classifierInput()` is called with the right shape | **Yes.** `classifierTurn(draft, question, lang)` (`lib/w07.mjs:224`) calls `classifierInput({ draft, question, lang, surface: 'whatsapp' })`. The question is the raw `msg.text`, and `classifierInput` redacts and fences it itself, so it matches guardrail.md "User turn template". The only issue is the `first_name_raw` given to `outputGate` (change 5). |
| send_slots / reschedule / cancel_confirm / change_method go to W04/W10 with reply.md fallback wording, one message and never two | **Accepted as the design** (reply.md v1.0.2 now says this). **Not yet true in the wiring.** `Carry plan` fans out to both `Explode delegations` and `Needs reply LLM?`. So a turn that delegates to W04/W10 and also carries a fixed line (DISCLOSE on first free text, DEFER + DEFER_NOTED on a multi-intent turn, ID/BANK warning) sends **two** messages: W07's text and the delegate's list (change 1). |
| W08 nurture lines match 4.12 and the persona | Timing, buttons, STOP handling and honesty match. One wording drift (change 9). The +72 h touch adds no new useful context (change 10, recommended). Afrikaans leads get English (change 11). |
| W29 thank-you and follow-up lines match 4.12a and the persona | **Yes.** `thanksLine` states only true numbers (n ≥ 5 before an index is shown) and deliberately drops 4.12a's "we're putting more behind it". That is correct under "urgency that's honest": W29 never moves spend. `broker_fit_followup` says the follow-up is the broker's. Both pass the gate and tone checks (eval `fais.template_copy`). One small wording fix (change 12). |

## Required changes (numbered, file:line)

1. **One message, never two (I-35e).** `automation/W07.json` node `Carry plan` (≈ line 1207) → `Explode delegations` + `Needs reply LLM?`, and `automation/lib/w07.mjs:195-196`.
   - When `plan.delegate` contains a W04 (`send_slots`/`offer_slots`) or W10 (`reschedule*`/`cancel_confirm`/`change_method`) entry, `planActions` must:
     - fill `prefix` + `suffix` with `plan.vars`;
     - attach them as `delegate.lead_lines` (in reply.md assembly order);
     - set `plan.send = false` for W07's own text.
   - W04/W10 then build ONE interactive body: `lead_lines.join(' ') + ' ' + <fallback line>`. The fallback lines are `LINES[lang].SLOTS_INTRO` / `RESCHED_INTRO` / `CANCEL_CONFIRM_Q` / `METHOD_CHANGED`, and the body must stay ≤ 1,024 characters.
   - Test to add in `automation/tests/W07.test.mjs`: first free-text turn "can we do Friday after 2" (not disclosed) → `plan.send === false`, one W04 delegate, `lead_lines[0] === DISCLOSE`. Then "book me Friday, and what would it cost?" → the delegate carries DEFER + DEFER_NOTED and W07 sends nothing itself.
2. **Fallback wording from lines.mjs, in both languages.** `automation/lib/w07.mjs:210-221` (`replyFallback`) hard-codes English.
   - Use `LINES[lang]`: `SLOTS_INTRO`, `RESCHED_INTRO`, `CANCEL_CONFIRM_Q`, `METHOD_CHANGED` (`{method}` = new method label), `SAVED`, `LANG_SWITCH`, `BOOKING_STATUS`.
   - Same in `automation/lib/w10.mjs:50` (`'No problem, here are some other times.'` → `LINES[lang].RESCHED_INTRO`, plus `SAME_METHOD` buttons when a method is stored, per reply.md).
   - Same in `automation/W10.json` (`'Here are the next open times.'` → `SLOTS_INTRO`, which names the adviser).
   - W10 needs a body for `cancel_confirm` (`CANCEL_CONFIRM_Q` + `Yes, cancel` · `Keep it`, then `CANCEL_DONE` + `See open times`) and for `change_method` (`METHOD_CHANGED`). I could not find either in `lib/w10.mjs`; please confirm W10.json handles the two delegated actions.
3. **Gate order: outputGate before the classifier.** `automation/W07.json` node `outputGate + classifierInput (I-27)` (≈ line 1671) only builds the classifier request; `outputGate` actually runs later inside `gateAndAssemble` (`lib/w07.mjs:247`).
   - Run `outputGate(draft, { fixed_lines, question, first_name_raw })` in that node.
   - On fail, skip the `Guardrail classifier LLM` call and go to `Assemble` with `verdict = { verdict: 'block', categories: ['outputGate:…'] }`.
   - The result is the same, but this saves a paid call per regex trip, and guardrail.md says the classifier "runs on every generated draft that already passed outputGate()".
4. **Low-confidence pass is not a pass.** `automation/lib/w07.mjs:250`: `v.verdict === 'pass'` must also require `v.confidence >= 0.8`, or else trigger the one Sonnet re-check (`ANTHROPIC_MODEL_STRONG`) that guardrail.md specifies.
   - Until that node exists, treat `confidence < 0.8` as `block` (fails closed).
   - A `block` is never appealed.
5. **`first_name_raw` must be the raw stored name.** `automation/lib/w07.mjs:247` passes `plan.vars.first_name`, which is the *sanitised* value (empty when the name failed `sanitiseField`). That means the `injected_field` check in `outputGate` can never fire. Pass `ctx.lead.first_name` through the plan (for example `plan.first_name_raw`) and use that.
6. **Reply request is missing its facts.** `automation/W07.json` node `Build reply request (Haiku)` (≈ line 1611): `facts` has only `adviser_first` and `booking`. reply.md requires:
   - `facts.faq` = the approved `knowledge/faq.md` answer for each `answer:FAQ-xx` action, in the lead's language. Without it the model writes an FAQ answer from nothing, against the "you do not add facts" rule.
   - `KNOWN:` (slots already stored), so the model never asks twice (4.11 memory).
   - `booking` as `"{day} {date} {time} by {method_label}"`. Today it has no time.
7. **Fallback context is incomplete.** `automation/W07.json` node `Assemble (verdict + toneCheck + fallbacks)` (≈ line 1731):
   - `replyFallback` gets `booking: { time: '' }`, so `BOOKING_STATUS` / `CANCEL_CONFIRM_Q` would read "at ." Pass the real `HH:MM`.
   - It gets no `faq` map, so a blocked `answer:FAQ-xx` draft sends nothing (or only DEFER) instead of the verbatim FAQ answer.
8. **`greet` / `booking_status` never reach the model.** `automation/lib/w07.mjs:200` pushes them into `reply_actions`, but reply.md does not list them and `greet` has no fallback (an empty message if the draft is dropped). Per reply.md v1.0.2:
   - `booking_status` → `BOOKING_STATUS` (no LLM call);
   - `greet` → `BOOKING_STATUS` when booked, otherwise delegate `send_slots` to W04.
9. **W08 +2 h nudge wording (FAQ consistency, faq-v1.0.1 K-6).** `automation/templates/unbooked_nudge_2h.json` and the hard-coded session copy in `automation/W08.json:211` say "there is nothing to buy on the call". The approved wording everywhere else is "there's no obligation to buy anything".
   - Template edit + resubmission is meta-operator's call (0.3 #1: never block on it).
   - Keep the session copy identical to whatever is approved.
   - The eval prints this as a warning, not a failure, until it is fixed.
10. **W08 +72 h touch should add one useful fact (4.12 last row). Recommended, not blocking.** The +72 h body only says "last message". Suggested (passes the gate and tone checks): "Hi {{1}}, this is our last message about your life cover enquiry. On the call, {{2}} goes through where you are now, and any next step is your choice. Tap below to pick a time, or if not, no problem, we won't message again. Reply STOP to opt out." This changes the template, so it is meta-operator's call.
11. **W08 language.** `automation/W08.json:211` always sends `language: { code: 'en' }` and English session words. Inside the 24-h window an Afrikaans lead should get Afrikaans words. No Afrikaans nudge copy exists yet, so I can supply it if wanted. The same applies to `lead_pulse`: W35 already sends Afrikaans inside the window and the English template outside it.
12. **Hard-coded lead-facing strings → lines.mjs.** `automation/lib/w07.mjs:273, 275, 276, 301, 302, 316, 317, 320` duplicate text that now lives in `LINES` (`CONTACT_CALL_NUMBER`, `CONTACT_ALT`, `CONTACT_BEST_TIME`, `CONTACT_TYPE_NUMBER`, `CONTACT_TYPE_ALT`, `CONTACT_KEEP_NUMBER`, `CONTACT_USE_WA`, `CONTACT_BAD_NUMBER`, `SAVED`). They are English-only today.
    - `BEST_Q` at :276 has also drifted from the approved Layer 1 text in `deferral-lines.md` ("Best time, if we ever need to reach you?" vs "When is the best time to reach you, if we ever need to?").
    - Import the lines and use `LINES[lang]` so the eval's drift guard covers them.
    - W29 (`automation/lib/w29.mjs:109`): "That is 3 of your calls rated from this ad so far." reads awkwardly. Suggest "So far 3 of your calls from this ad have a rating." This is optional and both versions pass the gate.
13. **W07 must route the W35 optional line.** `automation/lib/w07.mjs:81`, in `routeInbound` before `return { route: 'nlu' }`: if `isPulseLine(msg.text, ctx.lead.conv_state, now)` from `conversation/pulse.mjs` is true → `{ route: 'W35', reason: 'lead pulse line' }`.
    - Advice questions, person, STOP, complaint wording, claims and distress return false and keep the normal W07 path (`DEFER_AFTER_CALL`, handoff, W15).
    - W07 must pass `{ lead (with conv_state, brand_id, broker_id, cycle_id), msg }` to W35's Execute Workflow Trigger.
    - Taps `pulse_yes` / `pulse_no` already route to W35 (`lib/w07.mjs:50`).
14. **`disclosed` is set even when nothing was sent.** `automation/W07.json` node `Save conv_state / language / stage / health_flag` (≈ line 1930) always writes `disclosed: true`. It must be `previous || (sent && text includes DISCLOSE/DISCLOSE_PRE_ROUTE)`, so a silent turn (`none`, `handoff_urgent`, a delegated-only turn after change 1) does not skip the 4.11 first-contact disclosure. After change 1, a delegate that carried DISCLOSE in `lead_lines` sets it.

## For other owners (not automation-engineer)

- **optimisation-advisor / platform-architect:** `ops.judge_samples(current_date)` (W33) should add every `lead_pulse.thumbs = 'down'` from the previous day on top of the random 20, with the redacted line as context (`conversation/pulse.mjs` `judgeHints`). The judge grades our conversation, never the adviser.
- **analytics-reporter (W14):** the broker report uses `brokerLine()` (aggregate only, n ≥ 5, never lines or names). `facts.fact_lead.lead_pulse` / `lead_pulse_thumbs` already read `public.lead_pulse`.
- **meta-operator:** an Afrikaans `lead_pulse` template is optional. W35 sends Afrikaans as a session message inside the 24-h window, which covers almost every case because the reach-check tap opens the window.
