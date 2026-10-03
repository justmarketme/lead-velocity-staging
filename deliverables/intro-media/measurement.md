# Measurement plan: does the intro move show rate?

Position (the five): Martin et al. (2012) and the Cochrane reminder reviews say a personal, specific reminder lifts attendance; the vendor figures (Vidyard, BombBomb, Loom) are a hypothesis (grade C). We test it on our own bookings and drop the step if it does not move the number.

## The test
- **Arms** (assigned per booking, at booking time, by W09 from a seeded hash of `booking_id`, roughly one third each): `video` (T-48 h `intro_media` template), `voice` (T-48 h `intro_media_voice`), `none` (the normal reminder only). Everything else in the sequence is identical across arms.
- **Eligibility**: only brokers with an approved video **and** voice. Bookings from a broker without one are not randomised and are excluded from the comparison (otherwise "none" is just "broker didn't record").
- **Window**: the first 100 randomised bookings, then a decision. Bookings made less than 48 h before the slot get the intro straight after booking and are tagged `late_booking` (analysed separately).
- **Outcome**: show rate = attended / booked, counting a booking if the slot has passed and it was not cancelled more than 2 h before. Reschedules count against the final slot. Attendance is the broker's disposition (4.12a), `attended` by default at 24 h, flagged.
- **Needs** on `bookings`: `intro_arm` (`video|voice|none|not_randomised`), `intro_sent_at`, `intro_read_at`, `intro_played_at`. (To be added by platform-architect; see needs_human.)

## Honest power note
At 100 bookings that is about 33 per arm. With a baseline near 60%, the standard error of a difference between two arms is about 12 points, so only a large effect can be seen with confidence. Treat the 100-booking review as a **go / no-go on direction and size, not proof**: keep collecting and re-read at 200 and 300 before any final claim. Report the interval, not just the point estimate.

## Decision rule
At 100 randomised bookings, with-intro (video + voice) vs none:
- difference >= +5 points: keep the step required in onboarding (still never blocking go-live), ask every broker to re-record quarterly, keep collecting for the video vs voice split.
- difference between 0 and +5 points: keep it recommended, keep collecting to 200.
- difference <= 0: the step becomes optional and we say so in the portal and to brokers (master 4.10b). Re-test once with a better script before giving up.
Then, once a broker has both and 100 bookings are in, video vs voice decides which is sent by default.

## Metrics (all weekly in the pulse, per broker and overall)
| Metric | Definition | Target / use |
|---|---|---|
| Show rate by arm | attended / booked, per arm, with a 95% interval | the decision above |
| Step completion <= 48 h | brokers with `onboarding_progress.intro_media = done` within 48 h of first login / brokers who logged in | the number this agent moves; target set after broker #2 |
| Time to complete | first login to approve | find the stalled sub-step |
| Funnel | started -> 8 answers -> script picked -> first take -> approved | where brokers stall (the explainer is rebuilt on the top drop) |
| Takes per broker | takes recorded before approve | more than 2 on average = the checklist or prompter needs work |
| Re-record rate | approved versions per broker per quarter | quarterly refresh rate |
| First-time-pass rate | takes passing server checks first time / takes | check thresholds too tight or too loose |
| Rejection reasons | counts by `ai_check.code` (raw_check, spoken_gate, picture, pipeline_check, system) | script and checklist fixes |
| Intro view rate | `intro_read_at` and `intro_played_at` / sent, per arm | does the lead actually watch |
| Delivery fallback rate | video fell back to voice (failure or low data) | template and size problems |
| Broker show-rate view | the broker's own show rate with vs without once he has 20 bookings (shown in the portal) | the reason the step matters |

## Report
After 100 randomised bookings: `deliverables/intro-media/show-rate-split.md` with the table by arm, intervals, the late-booking split, view rates, and the decision from the rule above. Produced by analytics-reporter's query; this file defines the query.

```sql
select intro_arm,
       count(*) filter (where status in ('attended','no_show')) as resolved,
       count(*) filter (where status = 'attended') as attended,
       round(100.0 * count(*) filter (where status = 'attended') / nullif(count(*) filter (where status in ('attended','no_show')),0), 1) as show_rate_pct
from bookings
where intro_arm in ('video','voice','none') and not late_booking
group by 1;
```
(Column and status names follow the gap map and may differ; the definition above is what counts.)
