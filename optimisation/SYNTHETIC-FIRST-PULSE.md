# Synthetic first pulse and first weekly memo (hand-generated; seeds SLOs and control limits)

Section 7 "Optimisation loop" line. Written by hand, not by a model (no API key here). Source data: `supabase/seed/smc_synthetic.sql` (one broker, 13 days of ad rows at R700/day, 10 leads) and `automation/tests/fixtures/synthetic-leads.json`. Labels: **(fixture)** from those files, **(model)** from Section 3, **(illustrative)** invented only to exercise the template. Nothing here is a real result.

## 1. What the synthetic cycle can and cannot seed
The seed has 10 leads and 13 days of data. The detector needs 14 baseline days (`spc.js MIN_BASELINE`), and each day has 0-3 leads. So:
- **No control limit can be derived from this data.** Every metric is `warming_up`; the pulse judges only against SLOs, and says so.
- **Seed limits come from the model, not the data** (Section 3.2: qualify 70%, booking 60%, show 65%, raw CPL R200). They are stored as `seed = true` and dropped when 14 real days exist.
- **Daily p-chart limits are useless at one broker's volume.** At about 2 leads a day the 3-sigma limits for qualify, booking and show run from 0% to 100% (computed with `spc.js`; first-message-under-60-s collapses to exactly 100%). Even at 12 visitors a day the page-conversion limits are 0%-51%. Consequence: for cycle 1 the useful detectors are the **7-point run** (on rolling 7-day sums) and **SLO burn**, not single-day out-of-limit points. Recommendation recorded as NH-AD-06.

| Metric (headline) | Seed centre (model) | Expected n / day | Daily 3-sigma limits | Used in cycle 1 |
|---|---|---|---|---|
| Qualify rate | 70% | 2 | 0%-100% | rolling 7-day, SLO >= 60% |
| Booking rate | 60% | 1.5 | 0%-100% | rolling 7-day, SLO >= 60% |
| Show rate | 65% | 1 | 0%-100% | rolling 7-day, SLO >= 65%, 3.4 floor 50% for 14 d |
| Leads we could reach | 85% | 2 | 9%-100% | rolling 7-day, SLO >= 85% |
| Page conversion | 18% | 12 | 0%-51% | SLO >= 18% after 300 visitors |
| First message < 60 s | 100% | 2 | 100%-100% | any miss out of limit; SLO 100% |
| Cost per qualified lead | R286 (R200 / 0.7) (model) | n/a | from data after 14 d | SLO <= R250 conflicts with model (NH-AD-02) |

## 2. First pulse (worked example: day 14 of the synthetic cycle)
Status: **Amber** (a build gate and one judge finding; no SLO burning). Computed inputs: 0 out-of-limit points (all warming up), 0 runs, 0 burning.

> **Pulse, day 14 (synthetic) - Amber, 1 signal, no SLO burning**
> Limits are still warming up (13 of 14 days); judged against targets only.
>
> **Working**
> - First message: 100% of 10 leads within 60 s (target 100%) - the speed everything else depends on. (fixture: first touch at +40 s)
> - Consent and disclosure evidence: 100% / 100%, STOP honoured on the one STOP (target 100%). (fixture L10)
> - Out-of-band, landline and duplicate leads (L06-L09) were stopped before any WhatsApp message went out. (fixture)
>
> **Not working**
> - Judge sample (10 of 20 possible chats, only 10 exist): 2 of 10 bot messages asked two questions at once ("Which day suits you, and would you prefer Teams or a call?"), rule W-01. (illustrative) Owner: conversation-designer. Cause not established; the slot message and the method question are in one template turn.
> - Cost per qualified lead cannot be judged: R9,100 spend (seed) over 5 qualified leads is R1,820, but this is synthetic spend on a 10-lead fixture and the kill rule needs R3,000 and real traffic. Not a signal.
>
> **Do today (1)**
> 1. Split the slot-and-method turn into two messages, one question each. Moves: two-question messages 20% -> 0%. Cost R0. Grade C (judge sample, n=10, 1 day). Test: 7 days, re-run the 20-chat sample daily, kill if any new W-01 failure appears. Owner: conversation-designer. Check date: day 21. **[Approve] [Snooze 7 d] [Decline]**
> Held back (evidence gate): no change to the quiz or ads; 13 of 14 days and R0 real spend.
>
> **Compliance:** consent 100% - disclosure 100% - STOP 100% - last cleanse 1 Oct - advice statements 0. All green.
> **Build:** 1 gate waiting (publish booking Flow v1).
> **What this means for the business:** the booking turn may be costing some leads a clear answer; at 60% booking on about 24 verified leads a cycle, each lost booking is roughly R700 of ad spend. (illustrative, using the model funnel)
> **Cost:** R0.41 per lead system cost (illustrative), AI spend R4 of R15.

WhatsApp (`ops_pulse`): "Status: Amber. Do today: 1) split the slot and method question into two messages. Open Today in the console for the detail."

The quiet-day version, used when all of the above is clean, is exactly: `All faculties within limits. Nothing to do today. Next weekly memo Monday.`

## 3. First weekly memo (worked example: Monday after day 14)
**If you do one thing this week:** approve the two-question fix (conversation faculty): two-question messages 20% to 0%, R0, owner conversation-designer, check Monday 19 Oct.

**The week in one paragraph (north star first).** No real cycle has run, so cost per attended meeting and margin are model values only: R733 per attended meeting at R200 raw CPL (model), 43% margin target, 30% floor at R250 (NH-04). Lead experience: first message is 100% inside 60 s. Broker value: not measurable yet (one fictional broker, no dispositions). Compliance: all controls at target.

**Watchlist (7):** cost per attended meeting n/a (model R733, SLO R900) - leads we could reach n/a (SLO 85%) - booked to attended n/a (SLO 65%) - good-fit rate n/a - margin n/a (target 43%, floor 30%) - broker capacity n/a - renewal risk n/a. "Not enough data yet" is the correct reading, not green.

**Faculties:** media, page and Flow, nurture, comments, broker, billing, brand: no data yet (one line each). Conversation: Amber (above), one proposal. Compliance, infra, build: green except one gate waiting.

**Actual versus forecast:** none yet (no change approved in the last 4 weeks).

**Technology Radar** (scan not run; no network here, caps and source list in `fixed-sources.md`): items would be classified at run time. Default classes before any scan: WhatsApp Flows / CalendarPicker: **Trial** (already in W28, version is an ASSUMPTION in verified-facts.md); Anthropic model price changes: **Assess** (monthly, golden-set gate 6B.1); Google Flow/Veo: **Hold** (4D.5: only if hook rate < 30% or fatigue); regulator items: never below **Assess**.

**Stop doing:** nothing yet.

**Terms you'll see this week:** *control limit* - the normal range for a number, worked out from the last 28 days; outside it for a day, or on one side of normal for 7 days, means something changed. *SLO burn* - how fast a service level is being missed; above 2x means act now.

**Open decisions:** none.

## 4. Seeds to load (what "seeded from synthetic data" means in practice)
1. `ops.settings`: `usd_zar` 18 (ASSUMPTION), `opt_daily_cap_zar` 15, `opt_weekly_cap_zar` 40, `build_active` true.
2. `slos.json` SLO values as written; every limit is `seed` until 14 real days exist.
3. Re-run `node --test optimisation/spc.test.js` after changing `spc.js`; re-run `node optimisation/build-workflows.cjs` after changing any prompt, rubric, SLO or Code node, then `node optimisation/build-workflows.cjs --check`.
