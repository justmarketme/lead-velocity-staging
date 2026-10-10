# W35 lead pulse: what the broker sees (I-42a ruling)

**Date:** 2026-10-02 · **By:** compliance-qa · **Question (build/integration-pass2.md I-42a):** platform-architect's pass 8 (`supabase/migrations/20261002130000_smc_13_pass7.sql` §3, test `supabase/tests/rls-lead-pulse.test.sql`) hides every W35 row from the broker. That covers the timeline rows, and also the pulse ask, the lead's tap, the optional one-line answer and W35's reply in `communications`, through the RESTRICTIVE policy "smc hide lead pulse from brokers". Is this the right reading of "never with your name", or should the broker see a redacted "a pulse happened" marker?

## Ruling: keep pass 8 as written. Hide the whole W35 message set from the broker, with no redacted marker. No policy change for platform-architect.

## What the lead was promised
- `lead_pulse` template and `PULSE_ASK` (`conversation/lines.mjs:78`, AF l.144) say: "Answers are only shared as a total, never with your name."
- FAQ-25 (`knowledge/faq.md:192`) says: "Apart from one quick question about how the call went, we won't send you anything else."
- `conversation/pulse.mjs` A4 says the broker sees only an aggregate, from 5 answers up (`brokerLine`), and never sees the lines.

## Why there should be no redacted view
1. **A redacted marker still gives the answer away.** Suppose the broker can see which leads answered, even with no text. The aggregate needs only n ≥ 5. If all 5 answers are the same (5 of 5, or 0 of 5), he knows every named lead's answer. The marker also leaks two things on its own:
   - Whether a lead sent a one-line answer. The follow-up prompt differs for up and down (`PULSE_LINE_ASK_UP` / `_DOWN`), and people write more when they are unhappy.
   - The reply's wording, which differs for up and down. That is why the reply has to be hidden too.

   So "answered, text hidden" counts as "with your name" for anyone looking at a small book. POPIA s69 frames consent as evidence: the words we stored are the terms. A design that lets the answer be inferred breaks those terms.
2. **The ask alone tells the broker nothing he needs.** The outbound ask carries no answer. But the broker has no FAIS or servicing use for it. He already knows which calls he held, and the pulse is Lead Velocity's quality check on its own service, not part of his advice record. Under POPIA minimality, he does not get data he does not need. Showing only the ask would also add a predicate on `template_name` / direction that has to stay correct as W35 changes. That is fragile, and it buys nothing.
3. **The broker is told at product level, not per lead.** He is not kept in the dark. The broker report and the portal Reports tab show "X of N people said the call was worth their time" from 5 answers (`brokerLine`). That is the transparency the promise allows, and it is enough. (One line of portal copy saying "one question after each attended call; you see totals from 5 answers" is optional. It belongs to broker-success. It is not a compliance requirement.)
4. **Complaints are not hidden, and that is correct.** `isPulseLine` (`pulse.mjs:143-147`) sends any complaint wording to W07 (route ≠ W35). It therefore takes the normal complaint path (`HANDOFF_COMPLAINT`) and stays visible in the thread. A complaint about the adviser's service has to reach the FSP. The lead raised it as a complaint, not as a pulse answer. No change is needed.
5. **The aggregate, admin and erase paths are unaffected.** W14/`facts` read `public.lead_pulse` as n8n_app or admin. Admins keep the full view (the RLS test asserts this). `broker_id` stays on the rows, so the per-broker facts and the POPIA erase cascade still work.

## One residual risk (not I-42a; flag for the owner, not blocking W35)
Even with every row hidden, a broker can work out an individual answer by comparing reports. If his weekly total moves from 7/9 to 7/10, and he held one attended call that week, that lead said "Not really". **Recommendation for analytics-reporter + broker-success (W14):** show the pulse total per cycle (cycle-end edition) only, or suppress the week-on-week change when fewer than 5 new answers arrived in the period. Owner's call. If they want a decision, mark it `needs_human`. It does not block W35 activation, because the ≥ 5 floor already holds.

## Items for platform-architect
None. Pass 8 §3 (both policies) and `rls-lead-pulse.test.sql` stand as the accepted fix for R5-02 / I-41d. Please do not add a redacted view.
