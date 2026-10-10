# Metric dictionary (6A2 item 2)

Every number any surface shows (console, pulse, broker report, Ask the data, LV weekly) must resolve to an entry here; the W33 judge flags a number with no entry.
Each entry: plain name (goes on the tile) / what it means / SQL / target and why / what to do if it moves / jargon (goes in the tooltip only).
SQL is Postgres against the real schema (pass 3, aligned to `supabase/migrations/20261002_smc_04_facts.sql` and `..._smc_06_pass2.sql`): `facts.fact_*` views for the funnel, ads, costs, cycles and outcomes; `public.*` operational tables where `facts` holds no personal field or no row (`public.v_cycle_progress`, `public.invoices_smc`, `public.brokers`). Physical column names only: `facts.fact_ad_day.date` (also `day`) and `leads_meta` (also `leads_raw`), `facts.fact_outcome.slot_date`, booleans `fact_lead.qualified / verified / booked / attended / good_fit`, `fact_cost.date` (also `day`), `fact_comment.date`. Dual naming (schema.md, integration I-23): `brokers.broker_id / adviser_name / practice_name / adviser_whatsapp`, `brands.brand_id / status` and `cycles.cycle_id` are read-only generated aliases; read them freely, write only the physical names (`brokers.id`, `brokers.contact_person`, `brokers.firm_name`, `cycles.id`). Money: `public.invoices_smc.total_zar` is trigger-enforced (= `amount_excl_vat` + `vat_zar`), no longer a generated column. `close_rate` is a FRACTION everywhere (0.30 = 30%): stored in `public.brokers.close_rate`, carried in the W14 payload as `s6_roi.close_rate`, shown as a percent only at display time (I-30k). The column is `numeric(5,2)` with a 0-100 check, so a value like 30 would be accepted by mistake: needs_human, tighten the check to 0-1 (see build/needs-human-log.md). The example adviser uuid in the SQL below is the synthetic fixture adviser (`analytics/tests/synthetic-seed.sql`); swap in the real `brokers.id`. Every SQL block here is run against the fixture by `analytics/tests/metrics-sql.test.sh`. `facts.as_of()`, `facts.disp_class()` and thresholds live in `analytics/params.sql`.
Tiles show value, target and last period. The tile name is the plain name; never put the jargon on the tile. Percent figures are stored as ratios (0.65 = 65%). Ad spend is ex VAT; margin includes 15% VAT on media until VAT-registered (3.1). Day buckets are Africa/Johannesburg.

Sample-size rule: a rate or average on fewer than 5 events shows grey ("not enough data yet") on tiles; Ask the data refuses below 20 (6A2 item 4); kill/scale rules use their own minimums (3.4).

Traffic lights: green = on target; amber = within 20% of target; red = beyond (show rate red below 50%, 3.4).

Disposition spelling: this file uses 4.12a codes (fit_proceeding, nofit_budget...). crm-gap A1 spells them good_fit_* / not_fit_*; `facts.disp_class()` accepts both (needs_human).


## M01 Cost per good-fit meeting
- **Means:** What we pay in ads for one meeting the adviser rated a good fit.
- **Target and why:** Up to R1,300 (target (default pending NH-25); stretch R900, the 6A2 item 2 example). **needs_human:** the 3.5/3.7 model implies about R1,100 to R1,600 per good-fit meeting at full-cycle volume, so R900 may be unreachable. It is the one number that joins what we spend to what the adviser actually valued; a cheap lead rated 1 out of 5 is an expensive lead (3.4, 4.12a). Ad spend excludes 15% VAT.
- **If it moves:** If it rises for 7 days, find the angle whose good-fit rate dropped (M15) and move budget to the best angle; under 5 good-fit meetings the tile shows grey, not a verdict.
- **Tooltip (jargon):** CPA on an offline conversion; cost per qualified meeting.
- **Shown on:** Watchlist tile 1; LV weekly; Ask the data
- **SQL:**

```sql
select round((select sum(amount_zar) from facts.fact_cost where kind = 'media' and day > facts.as_of() - 28)
             / nullif((select count(*) from facts.fact_outcome where facts.disp_class(disposition_code) = 'fit' and (marked_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28), 0), 0) as cost_per_good_fit_zar,
       (select count(*) from facts.fact_outcome where facts.disp_class(disposition_code) = 'fit' and (marked_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28) as n;
```

## M02 Leads we could actually reach
- **Means:** Share of leads who answered us on WhatsApp within 3 days of our first message.
- **Target and why:** At least 85% (6A2 item 2 example). Only a lead who replies proves the number is theirs and reachable; it counts toward the commitment only then (3.3 item 3). Leads under 3 days old are left out because they have not had time to reply.
- **If it moves:** If it falls, check the phone-number check at sign-up and how fast the first message goes out (M12).
- **Tooltip (jargon):** Verified rate; 72-hour verification window.
- **Shown on:** Watchlist tile 2; LV weekly
- **SQL:**

```sql
select round(count(*) filter (where verified_at is not null and verified_at <= first_contact_at + interval '72 hours')::numeric / nullif(count(*), 0), 3) as reach_rate, count(*) as n
from facts.fact_lead where consent_ok and first_contact_at is not null
  and (first_contact_at at time zone 'Africa/Johannesburg')::date between facts.as_of() - 16 and facts.as_of() - 3;
```

## M03 Booked calls that happen
- **Means:** Of the calls that were booked and have now taken place or been missed, the share the lead attended.
- **Target and why:** At least 65% (3.7, cold Meta leads; 75% is the upper bound). Review below 50% for 14 days (3.4). Reminders and the adviser's prep are the levers; below 50% the economics break.
- **If it moves:** Below 50% for 14 days: review the reminder sequence and who we qualify (rule K3). Check whether no-shows share an angle or a time slot. Calls the adviser never marked count as attended after 24 hours and are flagged.
- **Tooltip (jargon):** Show rate; attendance rate.
- **Shown on:** Watchlist tile 3; broker report (traffic light); LV weekly
- **SQL:**

```sql
select round(count(*) filter (where outcome = 'attended')::numeric / nullif(count(*), 0), 3) as show_rate, count(*) as n
from facts.fact_outcome where outcome in ('attended', 'no_show') and (marked_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28;
```

## M04 Meetings the adviser rated a good fit
- **Means:** Of the meetings the adviser rated good fit or not a fit, the share rated good fit.
- **Target and why:** At least 60% (target (default pending NH-25)), the mirror of the 40% not-a-fit pause line (3.4, 4.12a). The adviser is the only person who knows if a lead was good (4.12a).
- **If it moves:** If it falls, look at M16 by ad: pause any ad above 40% not-a-fit with 5 or more ratings; if budget is the reason, review the budget question.
- **Tooltip (jargon):** Lead quality rate; disposition mix.
- **Shown on:** Watchlist tile 4; broker report
- **SQL:**

```sql
select round(count(*) filter (where facts.disp_class(disposition_code) = 'fit')::numeric / nullif(count(*) filter (where facts.disp_class(disposition_code) in ('fit', 'nofit')), 0), 3) as good_fit_rate,
       count(*) filter (where facts.disp_class(disposition_code) in ('fit', 'nofit')) as n
from facts.fact_outcome where (marked_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28;
```

## M05 Margin this cycle
- **Means:** What is left of the cycle price after media (with VAT), WhatsApp, AI, hosting and payment fees, projected to the end of the cycle.
- **Target and why:** At least 30% at the stress cost per lead, every cycle (3.5 guardrail). Below 30% at R250 the tier must not be sold (3.5). Projection scales the costs so far to the leads still needed to reach committed plus the replacement cap.
- **If it moves:** Check qualify rate (M10) and raw cost per lead (M08) first; do not change prices mid-cycle; if under 30% for 14 days apply the kill rules (3.4) before selling any new tier.
- **Tooltip (jargon):** Gross margin; contribution margin.
- **Shown on:** Watchlist tile 5; LV weekly
- **SQL:**

```sql
select cycle_id, margin_to_date, margin_projected, margin_at_stress from facts.cycle_margin((select cycle_id from facts.fact_cycle where broker_id = '00000000-0000-4000-8000-0000000b0002' and status in ('active','extended') limit 1), facts.as_of());
```
- **Note:** Needs fact_cost rows allocated to the adviser's cycle (platform-architect).

## M06 Days of broker capacity left
- **Means:** How many calendar days until the adviser's free meeting times run out at the recent booking pace.
- **Target and why:** At least 5 days (line 758: full for 5 working days triggers an alert; floor reused as the target). A full diary means leads wait and shows fall; empty times mean paying for leads we cannot book.
- **If it moves:** Next 7 days 80% booked or more: trim that adviser's ad share by 30% (K6); full for 5 working days: offer a bigger plan or add an adviser; under 60% again: restore.
- **Tooltip (jargon):** Capacity utilisation; run-rate.
- **Shown on:** Watchlist tile 6; LV weekly
- **SQL:**

```sql
select round(least(99, (select slots_open_14d from facts.fact_broker_day where broker_id = '00000000-0000-4000-8000-0000000b0002' and day = facts.as_of())
        / greatest((select count(*) from facts.fact_booking where broker_id = '00000000-0000-4000-8000-0000000b0002' and (booked_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 7) / 7.0, 0.1)), 1) as days_left;
```

## M07 Renewal risk
- **Means:** Whether an adviser is likely to renew: green, amber or red, with the reasons in words.
- **Target and why:** Green (0 or 1 points). Amber 2 to 3, red 4 or more. **Weights are an assumption** (calibrate on cycle-1 renewals; 3.7 plans for 50% cycle-1 churn). Built from what 4.10a lists: show rate, outcomes marked by the adviser, open to-dos, report unopened two weeks, average quality.
- **If it moves:** Amber or red: ring the adviser this week and use the reasons as the agenda. Report unopened two weeks running means Jonathan calls.
- **Tooltip (jargon):** Churn risk score; health score.
- **Shown on:** Watchlist tile 7; LV weekly
- **SQL:**

```sql
select broker_id, score, level, reasons from facts.renewal_risk_at(facts.as_of());
```

## M08 Cost of a lead (raw)
- **Means:** What we pay in ads for each sign-up, qualified or not.
- **Target and why:** Aim at R200 or less; kill rules act above R250 after R3,000 of spend (3.2, 3.4). Break-even raw cost per lead is about R397 at 60% qualify (3.2); R250 is the stress cost the pricing is built to survive (3.5).
- **If it moves:** Above R250 after R3,000 spend: pause the weakest half of the ads, tighten the questions, launch a new concept batch (K1). No panic changes before 14 days unless a service-level target is burning (0.3 #13).
- **Tooltip (jargon):** CPL; cost per form submission.
- **Shown on:** Watchlist tile 0; LV weekly; pulse
- **SQL:**

```sql
select round(sum(spend_zar) / nullif(sum(leads_raw), 0), 0) as raw_cpl_zar, sum(leads_raw) as n from facts.fact_ad_day where day > facts.as_of() - 14;
```

## M09 Cost of a qualified lead
- **Means:** What we pay in ads for each lead that met the contract definition and replied on WhatsApp.
- **Target and why:** At most R400 after 14 days (3.4; qualified CPL escalation R400, target (default pending NH-25)); with R200 raw cost and 70% qualify it is about R290 (3.2). **needs_human:** the pulse list in 6.8 says R250, which conflicts with 3.4's R400 (a raw R250 at 65% qualify is already about R385); this file uses 3.4. Raw CPL flatters; this is what margin runs on (3.2). Read on leads at least 3 days old so the 72-hour reply has happened.
- **If it moves:** Above R400 after 14 days: stop and escalate to Jonathan (K2). Between R290 and R400: look at the qualify rate (M10) before the cost.
- **Tooltip (jargon):** Qualified CPL; CPQL.
- **Shown on:** LV weekly; kill/scale; pulse
- **SQL:**

```sql
select round((select sum(spend_zar) from facts.fact_ad_day where day > facts.as_of() - 14)
        / nullif((select count(*) from facts.fact_lead where qualified and verified_at is not null and (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 14), 0), 0) as cost_per_qualified_zar;
```

## M10 Qualify rate
- **Means:** Share of sign-ups that meet the contract definition and reply on WhatsApp.
- **Target and why:** At least 60% (3.4); goal 70% (3.2). Each point of qualify rate is worth more than a point of cost per lead because it sets how many sign-ups we must buy (3.2).
- **If it moves:** Below 60% after R3,000 spend: tighten the questions and pause the bottom half of ads (K1). Check which angle attracts the wrong age or budget.
- **Tooltip (jargon):** Lead qualification rate.
- **Shown on:** LV weekly; kill/scale
- **SQL:**

```sql
select round((select count(*) from facts.fact_lead where qualified and verified_at is not null and (created_at at time zone 'Africa/Johannesburg')::date between facts.as_of() - 16 and facts.as_of() - 3)::numeric
        / nullif((select sum(leads_raw) from facts.fact_ad_day where day between facts.as_of() - 16 and facts.as_of() - 3), 0), 3) as qualify_rate;
```

## M11 Qualified leads who book
- **Means:** Of leads who qualified, the share who booked a meeting.
- **Target and why:** At least 60% (3.4, 3.7 models 70%). Booking is a service we perform; the stage between a reply and a diary entry is where WhatsApp wording and slot choice matter.
- **If it moves:** If it falls, check the booking step: slot list vs calendar flow, slot availability, the unbooked nudges (24 h, 72 h).
- **Tooltip (jargon):** Booking rate; conversion to appointment.
- **Shown on:** LV weekly; broker report
- **SQL:**

```sql
select round(count(*) filter (where exists (select 1 from facts.fact_booking b where b.lead_key = l.lead_key and b.status <> 'cancelled'))::numeric / nullif(count(*), 0), 3) as booking_rate, count(*) as n
from facts.fact_lead l where qualified and verified_at is not null and (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 14;
```

## M12 Time to first message
- **Means:** How many seconds pass between a lead signing up and our first WhatsApp message arriving.
- **Target and why:** Every lead within 60 seconds (6.3, 3.5a). Speed is the promise on the pricing page and the first thing a lead judges.
- **If it moves:** Any lead over 60 seconds raises an alert; look at the intake workflow, message-service delays and the database round trip.
- **Tooltip (jargon):** First-response SLA; speed to lead.
- **Shown on:** Pulse (conversation); LV weekly
- **SQL:**

```sql
select round(percentile_cont(0.5) within group (order by first_message_seconds)::numeric, 0) as median_seconds,
       round(count(*) filter (where first_message_seconds <= 60)::numeric / nullif(count(first_message_seconds), 0), 3) as share_within_60s, count(first_message_seconds) as n
from facts.fact_lead where (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 14;
```

## M13 Outcomes the adviser marked himself
- **Means:** Share of held meetings where the adviser tapped the outcome rather than the system filling it in after 24 hours.
- **Target and why:** At least 90% (6.8 broker faculty). Without his 10 seconds we cannot judge lead quality or replacements (4.12a).
- **If it moves:** Below 90%: the report's one ask becomes 'mark your open outcomes'; below 70% it adds a point to renewal risk.
- **Tooltip (jargon):** Disposition rate; feedback completion rate.
- **Shown on:** Broker report; renewal risk; pulse
- **SQL:**

```sql
select round(count(*) filter (where not coalesce(auto_marked, false))::numeric / nullif(count(*), 0), 3) as marked_by_adviser, count(*) as n
from facts.fact_outcome where (marked_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28;
```

## M14 Replacement requests
- **Means:** How many replacement requests the adviser has made this Calendar Week (Monday to Sunday) out of the weekly maximum of 3, with the number of replacements this cycle beside it for context.
- **Target and why:** At or under 3 requests a Calendar Week on every plan (agreement clause 7, Jonathan 10 Oct 2026). Replacements are goodwill at Lead Velocity's discretion, never a right: a request can follow a no-show or a lead the adviser could not reach, both sharing one counter, each with proof sent 10 to 30 minutes after the start. Not buying never counts (2.1). There is no per-cycle allowance: the old Bronze 4 / Silver 6 / Gold 9 (0.1) survive only as data columns (`replacement_cap`, `replacement_cap_cycle`) and drive nothing.
- **If it moves:** Several requests in one week: check whether one angle, source or time slot produces the no-shows or unreachable leads. A fourth request in a week is never accepted; anything beyond that is Jonathan's call, never automatic.
- **Tooltip (jargon):** Replacement claims; credit rate.
- **Shown on:** Broker report (a plain count, no traffic light); LV weekly
- **SQL:**

```sql
select replacement_requests_this_week, replacement_weekly_max, replacements_used from public.v_cycle_progress where broker_id = '00000000-0000-4000-8000-0000000b0002' order by starts_at desc limit 1;
```

## M15 Lead quality score per ad angle
- **Means:** Average of the adviser's 1 to 5 rating for leads from each ad angle.
- **Target and why:** At least 4 earns more budget (+20%) when cost is within the limit; under 2.5 pauses the ad; both need 5 or more ratings (3.4). A cheap lead rated 1 out of 5 is an expensive lead (3.4).
- **If it moves:** Under 2.5: pause the ad regardless of cost (K4). 4 or over with cost within limit: propose +20% (K5).
- **Tooltip (jargon):** Lead quality index.
- **Shown on:** Kill/scale; LV weekly; pulse
- **SQL:**

```sql
select angle, count(quality_score) as n, round(avg(quality_score), 2) as quality_index from facts.fact_outcome group by angle order by quality_index desc nulls last;
```

## M16 Not-a-fit rate
- **Means:** Of the meetings the adviser rated, the share rated not a fit (budget, already covered, outside criteria).
- **Target and why:** At most 40% per ad (3.4). Budget-based not-fits above 15% mean the budget question needs rewording (4.12a). Unreachable leads are not counted: they are a replacement matter, not a fit judgement.
- **If it moves:** Above 40% with 5 or more ratings: pause the ad (K4). One angle full of 'already covered': add a pre-filter line to that angle's copy.
- **Tooltip (jargon):** Disposition mix; not-a-fit share.
- **Shown on:** Kill/scale; broker report
- **SQL:**

```sql
select angle, count(*) filter (where facts.disp_class(disposition_code) in ('fit','nofit')) as n,
       round(count(*) filter (where facts.disp_class(disposition_code) = 'nofit')::numeric / nullif(count(*) filter (where facts.disp_class(disposition_code) in ('fit','nofit')), 0), 3) as nofit_rate
from facts.fact_outcome group by angle;
```

## M17 Leads who started from a comment
- **Means:** Leads whose first contact was a public comment on one of our ads.
- **Target and why:** No target set in the prompt: trend only. Public replies within 15 minutes (6.8). Comments are free reach; each one answered well can become a booked meeting.
- **If it moves:** If the count is zero for 14 days while comments arrive, check the private-reply step; if reply time passes 15 minutes, check the comment workflow.
- **Tooltip (jargon):** Comment-origin leads; social conversion.
- **Shown on:** Pulse (comments); LV weekly
- **SQL:**

```sql
select count(*) filter (where origin = 'comment') as comment_origin_leads, count(*) as all_leads from facts.fact_lead where (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28;
```

## M18 Tracking quality (event match)
- **Means:** How well Meta can match our sign-up and meeting signals to real people, out of 10.
- **Target and why:** At least 6 of 10; 8 is 'great' (4.4a, 6.8). Better matching teaches Meta which clicks become meetings, not just forms.
- **If it moves:** Below 6: check that the phone, email and browser identifiers are sent and hashed on every event, and that events are not duplicated.
- **Tooltip (jargon):** EMQ (Event Match Quality); CAPI.
- **Shown on:** Pulse (media); go-live checklist
- **SQL:**

```sql
select round(avg(emq), 1) as emq from facts.fact_ad_day where day > facts.as_of() - 7 and emq is not null;
```

## M19 WhatsApp cost per lead
- **Means:** What WhatsApp messages cost us for each lead.
- **Target and why:** About R2 per lead, less under the free monthly allowance (3.1). About 12 messages per lead at the post-October rate card (3.1).
- **If it moves:** Above R2.50: check for marketing-category templates or message loops; keep to utility templates.
- **Tooltip (jargon):** Per-message pricing; template category.
- **Shown on:** Console cost line; LV weekly
- **SQL:**

```sql
select round(sum(amount_zar) filter (where kind = 'whatsapp') / nullif((select count(*) from facts.fact_lead where (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28), 0), 2) as whatsapp_zar_per_lead from facts.fact_cost where day > facts.as_of() - 28;
```

## M20 AI cost per lead
- **Means:** What the AI assistant costs us for each lead.
- **Target and why:** R0.50 to R2 per lead (3.1 assumption, measured in production). About 12 turns on a small model (3.1).
- **If it moves:** Above R2: check conversation length, the model used per step, and prompt size.
- **Tooltip (jargon):** LLM token cost; inference cost.
- **Shown on:** Console cost line; LV weekly
- **SQL:**

```sql
select round(sum(amount_zar) filter (where kind = 'llm') / nullif((select count(*) from facts.fact_lead where (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28), 0), 2) as llm_zar_per_lead from facts.fact_cost where day > facts.as_of() - 28;
```

## M21 System up-time
- **Means:** Share of time the lead-handling system was running.
- **Target and why:** At least 99.5% (6.8, devops). Every minute down is a lead who got no reply within 60 seconds.
- **If it moves:** Below target: check the server monitor, then the last deploy; restore from backup if needed (drill in 6B.10).
- **Tooltip (jargon):** Uptime; availability SLO.
- **Shown on:** Pulse (infra)
- **SQL:**

```sql
select round(avg(uptime_pct), 2) as uptime_pct from facts.fact_system_day where day > facts.as_of() - 30;
```

## M22 Slowest 1 in 20 message arrivals
- **Means:** How long the slowest 5% of incoming webhook messages (WhatsApp, Meta, payments) take to be handled.
- **Target and why:** No number in the prompt: devops-security sets control limits from the first 14 days of production (6.8b). **needs_human** to name a number. If the slowest 5% are slow, the 60-second first message breaks first.
- **If it moves:** Rising for 3 days: look at database round trips and queue depth.
- **Tooltip (jargon):** p95 latency; webhook latency.
- **Shown on:** Pulse (infra)
- **SQL:**

```sql
select max(webhook_p95_ms) as worst_p95_ms, round(avg(webhook_p95_ms), 0) as avg_p95_ms from facts.fact_system_day where day > facts.as_of() - 14;
```

## M23 Leads delivered against promised
- **Means:** Verified qualified leads delivered to the adviser this cycle (replaced leads removed) against the number committed.
- **Target and why:** Reach the committed number by cycle end; straight-line pace is shown as 'target by now' (committed x days elapsed / cycle days). 'On track' = within 90% of pace (assumption). Delivered counts only verified leads (3.3, 0.1).
- **If it moves:** Behind pace: check cost per qualified lead and ad volume; the cycle extends up to 14 days and any remaining shortfall is credited (0.1).
- **Tooltip (jargon):** Committed volume; fulfilment.
- **Shown on:** Broker report; LV weekly
- **SQL:**

```sql
select verified as delivered, committed, committed - verified as still_to_deliver, days_left from public.v_cycle_progress where broker_id = '00000000-0000-4000-8000-0000000b0002';
```

## M24 Days the cycle is extended
- **Means:** How many extra days a cycle runs past 30 to deliver the committed number.
- **Target and why:** At most 14 days (0.1); zero is the goal. Shortfall clause: the cycle extends, then any remainder is credited on the next cycle or refunded.
- **If it moves:** Any extension: tell the adviser in the report; more than 7 days: review volume planning and cost per qualified lead.
- **Tooltip (jargon):** Cycle extension; shortfall credit.
- **Shown on:** Broker report; LV weekly
- **SQL:**

```sql
select cycle_id, case when extended_until is null then 0 else facts.sa_date(extended_until) - facts.sa_date(ends_at) end as extension_days from facts.fact_cycle where status in ('active','extended');
```

## M25 Cost per attended meeting
- **Means:** What we pay in ads for each meeting that actually took place.
- **Target and why:** About R850 or less at the stress cost per lead (derived from 3.5 and 3.7: 37 sign-ups at R250 over about 11 meetings). This is the number Meta's own dashboard cannot show; it picks the creative that brings people who turn up.
- **If it moves:** Rising: check M03 for the ad, then M15; shift budget to the cheapest ad per attended meeting once 5 or more attended.
- **Tooltip (jargon):** Cost per attended meeting; CPA on offline conversion.
- **Shown on:** LV weekly; creative review
- **SQL:**

```sql
select ad_name, round(spend / nullif(attended, 0), 0) as cost_per_attended_zar, attended as n from facts.v_w14_lv_creative order by 2 nulls last;
```

## M26 Margin if cost per lead hits the stress level
- **Means:** What the margin would be at R250 per sign-up with today's qualify rate.
- **Target and why:** At least 30% (3.5). Shows how much room we have if cost per lead rises. A low qualify rate (M10) pushes it down fast.
- **If it moves:** Below 30%: improve qualify rate or lower cost per lead before the next cycle is sold.
- **Tooltip (jargon):** Stress-test margin.
- **Shown on:** Watchlist tile 5 (second line); LV weekly
- **SQL:**

```sql
select cycle_id, margin_at_stress from facts.cycle_margin((select cycle_id from facts.fact_cycle where broker_id = '00000000-0000-4000-8000-0000000b0002' and status in ('active','extended') limit 1), facts.as_of());
```

## M27 Ad spend today against the daily limit
- **Means:** What we have spent on ads today against the budget set for the day.
- **Target and why:** At or under the daily budget set for the cycle (Campaign A starts at R350 a day, 6B.12). A cap protects the margin if a campaign over-delivers.
- **If it moves:** Over the cap: the ad-budget workflow should have stopped it; raise an alert.
- **Tooltip (jargon):** Daily budget pacing.
- **Shown on:** Console daily monitoring (6.8)
- **SQL:**

```sql
select sum(spend_zar) as spend_today_ex_vat from facts.fact_ad_day where day = facts.as_of();
```

## M28 Ad hook rate
- **Means:** Share of ad views where people watched at least the first 3 seconds.
- **Target and why:** At least 30% overall (Feed 25 to 30%, Reels 30 to 40%; 0.1 week-3 experiment trigger). Hook rate tells us if the first second works before we judge the offer.
- **If it moves:** Below 30%: new first-second concepts; test the week-3 AI-video experiment only if it stays low (0.1, 4D.5).
- **Tooltip (jargon):** Hook rate; 3-second view rate.
- **Shown on:** Pulse (media)
- **SQL:**

```sql
select round(sum(hook_rate * impressions) / nullif(sum(impressions), 0), 3) as hook_rate from facts.fact_ad_day where day > facts.as_of() - 7;
```

## M29 How often the same person sees an ad
- **Means:** Average number of times each person saw our ads in the last 7 days.
- **Target and why:** At most 3 in 7 days (6.8). Above 3, people tire of the ad and cost rises.
- **If it moves:** Above 3: refresh the creative or widen the audience.
- **Tooltip (jargon):** Ad frequency; creative fatigue.
- **Shown on:** Pulse (media)
- **SQL:**

```sql
select round(avg(frequency), 2) as frequency from facts.fact_ad_day where day > facts.as_of() - 7;
```

## M30 Landing-page sign-up rate
- **Means:** Share of landing-page visits that become a sign-up.
- **Target and why:** At least 18% (6.8; the 9.3% finance median is the floor Unbounce quotes in 3.2). Every point here lowers the cost of a lead.
- **If it moves:** Below 18%: check page speed (under 2.5 seconds), the quiz step where people drop off, and the page-to-ad message match.
- **Tooltip (jargon):** Conversion rate; LCP (page speed); quiz step drop-off; Flow completion.
- **Shown on:** Pulse (page & Flow)
- **SQL:**

```sql
select round(sum(leads_raw)::numeric / nullif(sum(page_visits), 0), 3) as signup_rate, sum(page_visits) as visits from facts.fact_page_day where day > facts.as_of() - 14;
```
- **Note:** `facts.fact_page_day` (smc_06) is fed by `ops.page_day`, written by devops-security / landing-page-builder (I-22); until that feeder runs the value is empty and the tile shows grey. Page speed is `lcp_p75_s` in the same view; quiz step drop-off is not in `facts` yet.

## M31 Leads who said the call was worth their time
- **Means:** Of the leads who answered 'Was the call worth your time?' after an attended call, how many tapped yes. The adviser sees it for the current cycle only, from 5 answers, and the figure is held until 5 new answers arrive.
- **Target and why:** No target in the prompt: show the trend (Lead Velocity view). Hears the lead's side without sharing names with the adviser (6B.2). The adviser's view has no target, no last week and no week-on-week change, so he cannot work out one named lead's answer by comparing two reports (compliance-qa W35-pulse-visibility.md; I-43c).
- **If it moves:** A fall with a stable show rate means call quality, not reminders: tell the adviser in prep notes. Read it in the Lead Velocity view, never from the adviser's report.
- **Tooltip (jargon):** Lead pulse; post-call satisfaction.
- **Shown on:** Broker report and portal Reports tab (adviser view: the held per-cycle figure below); Lead Velocity console and LV weekly (live figure, unchanged)
- **Adviser display rule (I-43c):**
  1. Under 5 answers so far this cycle: show "Fewer than 5 answers yet". No number.
  2. From 5 answers: show "X of N people (answers so far this cycle)". Per cycle only. Never a change since last week, never a target.
  3. Hold the figure at the last one he was sent (the stored "X of N" in his last report, any edition: weekly, midcycle or cycle-end) until 5 new answers have arrived. The held figure is read from that report, never recounted from today's answers, so a late answer cannot change it and neither can a POPIA erase (R6-05): if one answered row is deleted, he still sees the stored figure until 5 new answers sit on top of N (the count is against today's total, so an erase delays the next update, it never changes the held figure). Midcycle and cycle-end editions look back at every earlier report up to that day (R6-01), so a Monday weekly and a Wednesday midcycle show the same figure.
  4. Worked example: he first sees 7 of 9. A 10th answer (a thumbs-down) arrives that week: he still sees 7 of 9, not 7 of 10, so he cannot tell that the new answer was a no. The 11th, 12th and 13th answers arrive: still 7 of 9. The 14th arrives (5 new): he now sees the figure for those 14 answers, 11 of 14 if 4 of the 5 new ones were yes. Any two figures he sees are at least 5 answers apart.
  5. A new cycle starts again from "Fewer than 5 answers yet".
- **SQL (adviser view, `facts.broker_pulse`, analytics/W14-broker.sql; p_prev_n and p_prev_up = the stored n and up of the last figure sent):**

```sql
select * from facts.broker_pulse((select id from public.cycles order by starts_at desc limit 1), facts.as_of(), null);   -- shown, n, up; third and fourth arguments = the stored n and up of the last figure sent (null if none)
```
- **SQL (Lead Velocity view, live, admin only):**

```sql
select count(*) filter (where lead_pulse_thumbs = 1) as worth_it, count(lead_pulse_thumbs) as answered, round(count(*) filter (where lead_pulse_thumbs = 1)::numeric / nullif(count(lead_pulse_thumbs), 0), 3) as worth_it_rate from facts.fact_lead;
```

## M32 AI guardrail trips
- **Means:** Number of times the AI assistant tripped a safety rule in a live chat.
- **Target and why:** Zero (6.8; any trip in a live conversation alerts both partners). The assistant must never advise, compare products or quote premiums (2.1).
- **If it moves:** Any trip: read the message, fix the prompt through the eval gate (6B.1).
- **Tooltip (jargon):** Guardrail trip; FAIS gate.
- **Shown on:** Pulse (conversation); alerts
- **SQL:**

```sql
select count(*) as trips from facts.fact_message where guardrail_trip and (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 7;
```

## M33 Adviser calendar fill
- **Means:** Share of the adviser's next-7-day meeting slots that are already booked.
- **Target and why:** Between 60% and 80% (6.8; above 80% trims ad share, line 758). Too empty wastes leads; too full loses them.
- **If it moves:** Above 80%: trim (K6). Below 60% for a week: ask the adviser to open more times or raise the ad share.
- **Tooltip (jargon):** Capacity utilisation.
- **Shown on:** Pulse (broker); broker report
- **SQL:**

```sql
select round(slots_booked_7d::numeric / nullif(slots_total_7d, 0), 3) as fill_7d from facts.fact_broker_day where broker_id = '00000000-0000-4000-8000-0000000b0002' and day = facts.as_of();
```

## M34 Public reply time on comments
- **Means:** Seconds between a public comment and our first reply.
- **Target and why:** Under 15 minutes (6.8). Fast replies lift reach and trust.
- **If it moves:** Over 15 minutes: check the comment workflow and the escalations queue.
- **Tooltip (jargon):** SLA; response time.
- **Shown on:** Pulse (comments)
- **SQL:**

```sql
select round(percentile_cont(0.5) within group (order by sla_seconds)) as median_seconds from facts.fact_comment where date > facts.as_of() - 14;
```

## M35 Cycles renewed
- **Means:** Share of advisers whose cycle was followed by another paid cycle.
- **Target and why:** At least 50% in cycle 1 (6.8 billing; 3.7 plans 50% churn). Renewal is earned on his own meetings and quality (4.12a).
- **If it moves:** Below target: read the renewal-risk reasons (M07) and the end-of-cycle report he received.
- **Tooltip (jargon):** Renewal rate; churn.
- **Shown on:** Pulse (billing); LV weekly
- **SQL:**

```sql
select round(count(*) filter (where renewed)::numeric / nullif(count(*), 0), 3) as renewal_rate, count(*) as cycles_closed from facts.fact_cycle where cycle_no = 1 and (extended_until is null and ends_at <= now() or status = 'closed');
```
- **Note:** `facts.fact_cycle.renewed` is live (smc_06). Needs at least 5 closed first cycles before it is a verdict.

## M36 Days to pay
- **Means:** Days between the renewal offer and the payment.
- **Target and why:** No target in the prompt; trend only. Late payment delays the cycle start.
- **If it moves:** Rising: send the reminder earlier; offer instant EFT.
- **Tooltip (jargon):** Days sales outstanding.
- **Shown on:** Pulse (billing)
- **SQL:**

```sql
select round(avg(extract(epoch from (paid_at - issued_at)) / 86400)::numeric, 1) as days_to_pay, count(*) as n, sum(total_zar) as paid_zar from public.invoices_smc where kind = 'cycle' and paid_at is not null and issued_at > now() - interval '90 days';
```
- **Note:** `public.invoices_smc` (billing-automation), money from `total_zar` (= amount + VAT, trigger-enforced). Not in `facts`: invoices carry no lead data and the view would only copy them.

## M37 Compliance line
- **Means:** Five numbers: consent stored, disclosure delivered, STOP honoured, days since last database cleanse, advice statements found.
- **Target and why:** 100% / 100% / 100% / at most 31 days / zero (6.8b). These are legal evidence; any miss is Red.
- **If it moves:** Anything off: stop sending, fix, tell compliance-qa.
- **Tooltip (jargon):** Consent record; disclosure evidence; suppression cleanse.
- **Shown on:** Pulse compliance line
- **SQL:** not in `facts` yet.
- **Note:** Owned by compliance-qa (`ops.*`); not in `facts`.

## M38 All-in system cost per lead
- **Means:** Rand per lead for WhatsApp, AI and hosting together.
- **Target and why:** About R4 per raw lead plus R450 hosting per adviser (3.5 model). Overhead stays inside the margin model only if it stays near the model.
- **If it moves:** Above R6: break out WhatsApp, AI and hosting (M19, M20).
- **Tooltip (jargon):** Unit cost; cost to serve.
- **Shown on:** Pulse (infra & cost); LV weekly
- **SQL:**

```sql
select round(sum(amount_zar) filter (where kind in ('whatsapp','llm','infra')) / nullif((select count(*) from facts.fact_lead where (created_at at time zone 'Africa/Johannesburg')::date > facts.as_of() - 28), 0), 2) as system_cost_per_lead from facts.fact_cost where day > facts.as_of() - 28;
```

## M39 Adviser's policies written (his own view)
- **Means:** The number of policies the adviser tells us he wrote, and what his own close rate implies for this cycle.
- **Target and why:** No target: shown to him only, and only once he enters a close rate (4.10a). Never used in any fee, price or ranking (FAIS, 2.1.1, 3.7); not available to Ask the data.
- **If it moves:** If he has not entered a close rate, the report skips this section.
- **Tooltip (jargon):** Conversion to policy; close rate.
- **Shown on:** Broker report (his ROI view only)
- **SQL:**

```sql
select r.close_rate, r.policies_written_reported from facts.fact_broker_roi r  -- close_rate is a fraction: 0.30 = 30%;  where r.broker_id = '00000000-0000-4000-8000-0000000b0002';
```

## M40 Search and build lines
- **Means:** Branded search trend, tasks blocked, tests failing, human gates waiting.
- **Target and why:** Per 6.8 pulse faculties: branded search rising; no tasks blocked beyond pre-mortem answers; zero tests failing. Owned elsewhere: shown on the pulse only.
- **If it moves:** See the owning agent's file.
- **Tooltip (jargon):** SERP ownership; acceptance test.
- **Shown on:** Pulse (brand & search, build line)
- **SQL:** not in `facts` yet.
- **Note:** Sources: search-findability-lead (SERP), `build/tasks.json` (orchestrator). Not in `facts`.

## Index
- M01 Cost per good-fit meeting
- M02 Leads we could actually reach
- M03 Booked calls that happen
- M04 Meetings the adviser rated a good fit
- M05 Margin this cycle
- M06 Days of broker capacity left
- M07 Renewal risk
- M08 Cost of a lead (raw)
- M09 Cost of a qualified lead
- M10 Qualify rate
- M11 Qualified leads who book
- M12 Time to first message
- M13 Outcomes the adviser marked himself
- M14 Replacement requests
- M15 Lead quality score per ad angle
- M16 Not-a-fit rate
- M17 Leads who started from a comment
- M18 Tracking quality (event match)
- M19 WhatsApp cost per lead
- M20 AI cost per lead
- M21 System up-time
- M22 Slowest 1 in 20 message arrivals
- M23 Leads delivered against promised
- M24 Days the cycle is extended
- M25 Cost per attended meeting
- M26 Margin if cost per lead hits the stress level
- M27 Ad spend today against the daily limit
- M28 Ad hook rate
- M29 How often the same person sees an ad
- M30 Landing-page sign-up rate
- M31 Leads who said the call was worth their time
- M32 AI guardrail trips
- M33 Adviser calendar fill
- M34 Public reply time on comments
- M35 Cycles renewed
- M36 Days to pay
- M37 Compliance line
- M38 All-in system cost per lead
- M39 Adviser's policies written (his own view)
- M40 Search and build lines
