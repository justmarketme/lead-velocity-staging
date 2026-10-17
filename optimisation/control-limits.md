# Control limits, signals and SLO burn (how the daily pulse decides what is news)

Owner: `optimisation-advisor` · Code: `spc.js` · Tests: `spc.test.js` (`cd optimisation && node --test spc.test.js`, 14 tests) · SLO table: `slos.json`.
Inspired by (and only by): Shewhart/Deming statistical process control (judge today against limits from the last 28 days, not against yesterday) and Google SRE (burn rate, not every wobble).

## 1. The idea in one paragraph
Every metric wobbles. A single day outside "normal" is a question; a week on the wrong side of normal is an answer; and a service level being missed faster than its budget allows is an emergency. The pulse therefore reports three different things and nothing else: **out-of-limit points**, **7-point runs**, and **SLO burn above 2x**. A day with none of them is the one-line quiet day.

## 2. Limits (`limits`, `pLimits`)
- **Window:** the 28 days before the day under test (28 is four full weeks, so weekday effects average out).
- **Chart type:** individuals chart (I-MR) for money, seconds and scores; p-chart for proportions (`chart: "p"` in `slos.json`), because a day with 3 leads has far wider limits than a day with 60. Without the p-chart a "1 of 3 booked" day would look like a collapse.
- **Sigma** = mean moving range / 1.128 (the standard I-MR constant), not the plain standard deviation. A slow drift inside the baseline then does not inflate the limits and hide the very change we want to see.
- **Limits** = centre ± 3 sigma. (The console sparkline draws ±2 sigma as a visual guide, as in `pulse-mock.html`; only ±3 sigma raises a signal.)
- **Warming up:** fewer than 14 baseline points means no control limits (`status: "warming_up"`). In the first 14 days the pulse judges only against the SLO and says so in one clause. Seed limits come from `SYNTHETIC-FIRST-PULSE.md` and are labelled `seed`; they are dropped the moment 14 real points exist.

## 3. Signals (`detect`, `detectConfirmed`)
| Signal | Rule | Baseline used | Notes |
|---|---|---|---|
| **Out of limit** | latest point above UCL or below LCL | the 28 points before it | Headline metrics raise it on one day. **Input metrics** use `detectConfirmed`: the same side two days running (keeps a quiet day quiet). |
| **7-point run** | the last 7 points all above, or all below, the centre line | the 28 points before those 7 | The baseline deliberately excludes the 7 points being tested, otherwise a real shift drags its own yardstick with it and hides. |
| **SLO burn > 2x** | `sloBurn`: share of days in the last 7 that missed the SLO, divided by the share allowed to miss (default 10%) | last 7 days | One bad day in 7 = 1.4x (not burning). Two = 2.9x (Red). A zero-tolerance control (compliance, guardrail trips) burns at infinity on the first miss and is Red at once. |

Every signal carries `side`: **adverse**, **favourable** or neutral. Direction comes from `slos.json` (`higher`, `lower`, `band`). Favourable signals never colour a tile; they go to *Working* ("show rate has run above its normal for 7 days: 78% vs 70%"). Band metrics (calendar fill 60-80%) treat both sides as adverse.

## 4. Status of a faculty tile (`facultyStatus`)
- **Red:** an SLO is burning above 2x, or a zero-tolerance control failed. Red is pinned to the top of the pulse.
- **Amber:** at least one adverse signal, no SLO burning.
- **Green:** nothing adverse.
The overall pill is the worst tile. A tile with no data says "no data yet", never green.

## 5. Evidence before a proposal (`evidenceOk`)
A signal is shown from day 1. A **proposal** is only written when the metric's `min_evidence` is met (default 14 days; media adds R3,000 spend; rate experiments add 300 conversions of the denominator event), unless an SLO is burning. Below the gate the pulse says what is missing ("9 of 14 days, R2,100 of R3,000"). Section 3.4 kill/scale rules are deterministic and run from R3,000 as written (`ops.proposals.source = kill_rule`); they are not advisor proposals.

## 6. What this will cost in noise (measured on synthetic data, 2,000 pure-noise series)
Pure noise raised an out-of-limit on the latest day 0.9% of the time and a 7-point run 2.4% (3.3% either). Across the 11 headline metrics that is about one false amber every three days if everything were reported, which is too many. Three things bring it to roughly one a fortnight: (1) only **adverse** signals count (halves it); (2) input metrics need two-day confirmation; (3) a signal alone never creates a proposal, it needs the evidence gate and a stated cause. These rates are in the test (`< 5%`).

## 7. Known limits (say them, do not hide them)
- With about 20 qualified leads per cycle, many rates have n of 3-10 per day. The p-chart widens limits for that, and the 7-point run is the better detector. Treat anything on `n < 5` as "watch", not "act".
- Weekends and public holidays shift lead volume and broker-side metrics; the 28-day window averages this, but the first Monday after a holiday can look odd. The cause hypothesis must say "holiday" when true.
- Control limits describe the process as it is, not as we want it. A process in control can still miss its SLO; that is the burn-rate rule's job, not the limits'.
- Billing renewal and cycle margin have one observation per cycle and cannot be charted; they are judged at cycle end against the SLO.

## 8. Low-volume rule (found while seeding from the synthetic cycle)
At one broker's volume (about 1-2 leads a day) the daily p-chart limits for qualify, booking, show and reach run from about 0% to 100%, so a single day can never be out of limit; first-message-under-60-s is the exception (limits collapse to exactly 100%). See `SYNTHETIC-FIRST-PULSE.md` section 1. For cycle 1 the 7-point run and SLO burn do the work; `facts.pulse_daily` should supply rolling 7-day numerator and denominator for p-metrics so `detectP` can run on weekly points (not yet implemented, NH-AD-06).
