-- analytics/watchlist.sql — the owner's watchlist (6A2 item 3): seven tiles + the launch tile (6B.12).
-- Every view returns the same columns:  tile_no, tile (plain name), scope ('ALL' or broker_id), value, unit, target, target_rule,
-- status (green/amber/red/grey), n (sample behind the value), last_period (value 7 days ago), trend_28d (jsonb [{d,v}], one point per day),
-- look_out (one sentence: what to do if it moves).  Definitions, SQL and jargon: knowledge/metrics.md.
-- Depends on: analytics/params.sql and the facts.* contract (analytics/tests/facts-contract.test.sql lists the columns).
-- Timezone: all day buckets are Africa/Johannesburg.
-- Requires facts.as_of() and facts.v_params (params.sql).

create or replace view facts.v_scope_day as
select s.scope, d::date as day
from (select 'ALL'::text as scope union select broker_id from facts.fact_cycle) s
cross join generate_series(facts.as_of() - 70, facts.as_of(), interval '1 day') d;


-- Tile 0: Cost of a lead vs the model (first 14 days)
create or replace view facts.v_watchlist_0_cpl_vs_model as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day where scope = 'ALL'),
num as (
  select sd.scope, sd.day, coalesce(sum(x.spend_zar), 0) as v
  from sd left join facts.fact_ad_day x
    on x.day = sd.day and true 
  group by 1, 2
),
den as (
  select sd.scope, sd.day, coalesce(sum(x.leads_raw), 0) as v
  from sd left join facts.fact_ad_day x
    on x.day = sd.day and true 
  group by 1, 2
),
roll as (
  select n.scope, n.day,
         sum(n.v) over w as snum, sum(d.v) over w as sden
  from num n join den d using (scope, day)
  window w as (partition by n.scope order by n.day rows between 13 preceding and current row)
)
select 0 as tile_no, 'Cost of a lead vs the model (first 14 days)' as tile, r.scope,
       round(snum / nullif(sden, 0), 3) as value, 'ZAR' as unit,
       200 as target, '<=' as target_rule,
       case when r.sden < p.min_dispositions then 'grey'
            else facts.tile_status(round(snum / nullif(sden, 0), 3), 200, false, 250) end as status,
       r.sden::int as n,
       (select round(t.snum / nullif(t.sden, 0), 3) from roll t where t.scope = r.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', round(t.snum / nullif(t.sden, 0), 3)) order by t.day)
          from roll t where t.scope = r.scope and t.day > p.as_of - 28) as trend_28d,
       'If it stays above R250 after R3,000 of spend, run the kill rules (pause the weakest half of the ads, tighten the questions); above R400 per qualified lead after 14 days, escalate.' as look_out
from roll r cross join p
where r.day = p.as_of;

-- Tile 1: Cost per good-fit meeting
create or replace view facts.v_watchlist_1_cost_per_good_fit as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day),
num as (
  select sd.scope, sd.day, coalesce(sum(x.amount_zar), 0) as v
  from sd left join facts.fact_cost x
    on x.day = sd.day and (sd.scope = 'ALL' or x.broker_id = sd.scope) and x.kind = 'media'
  group by 1, 2
),
den as (
  select sd.scope, sd.day, coalesce(sum(case when x.outcome_id is not null then 1 else 0 end), 0) as v
  from sd left join facts.fact_outcome x
    on (x.marked_at at time zone 'Africa/Johannesburg')::date = sd.day and (sd.scope = 'ALL' or x.broker_id = sd.scope) and facts.disp_class(x.disposition_code) = 'fit'
  group by 1, 2
),
roll as (
  select n.scope, n.day,
         sum(n.v) over w as snum, sum(d.v) over w as sden
  from num n join den d using (scope, day)
  window w as (partition by n.scope order by n.day rows between 27 preceding and current row)
)
select 1 as tile_no, 'Cost per good-fit meeting' as tile, r.scope,
       round(snum / nullif(sden, 0), 3) as value, 'ZAR' as unit,
       p.cost_per_good_fit_max_zar as target, '<=' as target_rule,
       case when r.sden < p.min_dispositions then 'grey'
            else facts.tile_status(round(snum / nullif(sden, 0), 3), p.cost_per_good_fit_max_zar, false, null) end as status,
       r.sden::int as n,
       (select round(t.snum / nullif(t.sden, 0), 3) from roll t where t.scope = r.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', round(t.snum / nullif(t.sden, 0), 3)) order by t.day)
          from roll t where t.scope = r.scope and t.day > p.as_of - 28) as trend_28d,
       'If it rises for 7 days, find which angle''s good-fit rate dropped and move its budget to the best angle.' as look_out
from roll r cross join p
where r.day = p.as_of;

-- Tile 2: Leads we could actually reach
create or replace view facts.v_watchlist_2_leads_we_could_reach as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day),
num as (
  select sd.scope, sd.day, coalesce(sum(case when x.lead_key is not null then 1 else 0 end), 0) as v
  from sd left join facts.fact_lead x
    on (x.first_contact_at at time zone 'Africa/Johannesburg')::date = sd.day and sd.day <= (select as_of - verify_lag_days from facts.v_params) and (sd.scope = 'ALL' or x.broker_id = sd.scope) and x.consent_ok and x.first_contact_at is not null and x.verified_at is not null and x.verified_at <= x.first_contact_at + interval '72 hours'
  group by 1, 2
),
den as (
  select sd.scope, sd.day, coalesce(sum(case when x.lead_key is not null then 1 else 0 end), 0) as v
  from sd left join facts.fact_lead x
    on (x.first_contact_at at time zone 'Africa/Johannesburg')::date = sd.day and sd.day <= (select as_of - verify_lag_days from facts.v_params) and (sd.scope = 'ALL' or x.broker_id = sd.scope) and x.consent_ok and x.first_contact_at is not null
  group by 1, 2
),
roll as (
  select n.scope, n.day,
         sum(n.v) over w as snum, sum(d.v) over w as sden
  from num n join den d using (scope, day)
  window w as (partition by n.scope order by n.day rows between 13 preceding and current row)
)
select 2 as tile_no, 'Leads we could actually reach' as tile, r.scope,
       round(snum / nullif(sden, 0), 3) as value, 'ratio' as unit,
       p.reach_target as target, '>=' as target_rule,
       case when r.sden < p.min_dispositions then 'grey'
            else facts.tile_status(round(snum / nullif(sden, 0), 3), p.reach_target, true, null) end as status,
       r.sden::int as n,
       (select round(t.snum / nullif(t.sden, 0), 3) from roll t where t.scope = r.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', round(t.snum / nullif(t.sden, 0), 3)) order by t.day)
          from roll t where t.scope = r.scope and t.day > p.as_of - 28) as trend_28d,
       'If it falls, check the phone-number check and how fast the first message goes out (aim under 60 seconds).' as look_out
from roll r cross join p
where r.day = p.as_of;

-- Tile 3: Booked calls that happen
create or replace view facts.v_watchlist_3_booked_to_attended as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day),
num as (
  select sd.scope, sd.day, coalesce(sum(case when x.outcome_id is not null then 1 else 0 end), 0) as v
  from sd left join facts.fact_outcome x
    on (x.marked_at at time zone 'Africa/Johannesburg')::date = sd.day and (sd.scope = 'ALL' or x.broker_id = sd.scope) and x.outcome = 'attended'
  group by 1, 2
),
den as (
  select sd.scope, sd.day, coalesce(sum(case when x.outcome_id is not null then 1 else 0 end), 0) as v
  from sd left join facts.fact_outcome x
    on (x.marked_at at time zone 'Africa/Johannesburg')::date = sd.day and (sd.scope = 'ALL' or x.broker_id = sd.scope) and x.outcome in ('attended','no_show')
  group by 1, 2
),
roll as (
  select n.scope, n.day,
         sum(n.v) over w as snum, sum(d.v) over w as sden
  from num n join den d using (scope, day)
  window w as (partition by n.scope order by n.day rows between 27 preceding and current row)
)
select 3 as tile_no, 'Booked calls that happen' as tile, r.scope,
       round(snum / nullif(sden, 0), 3) as value, 'ratio' as unit,
       p.show_target as target, '>=' as target_rule,
       case when r.sden < p.min_dispositions then 'grey'
            else facts.tile_status(round(snum / nullif(sden, 0), 3), p.show_target, true, p.show_floor) end as status,
       r.sden::int as n,
       (select round(t.snum / nullif(t.sden, 0), 3) from roll t where t.scope = r.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', round(t.snum / nullif(t.sden, 0), 3)) order by t.day)
          from roll t where t.scope = r.scope and t.day > p.as_of - 28) as trend_28d,
       'Below 50% for 14 days: review the reminder sequence and who we qualify. Check whether the no-shows share one angle or one time slot.' as look_out
from roll r cross join p
where r.day = p.as_of;

-- Tile 4: Meetings the adviser rated a good fit
create or replace view facts.v_watchlist_4_broker_good_fit_rate as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day),
num as (
  select sd.scope, sd.day, coalesce(sum(case when x.outcome_id is not null then 1 else 0 end), 0) as v
  from sd left join facts.fact_outcome x
    on (x.marked_at at time zone 'Africa/Johannesburg')::date = sd.day and (sd.scope = 'ALL' or x.broker_id = sd.scope) and facts.disp_class(x.disposition_code) = 'fit'
  group by 1, 2
),
den as (
  select sd.scope, sd.day, coalesce(sum(case when x.outcome_id is not null then 1 else 0 end), 0) as v
  from sd left join facts.fact_outcome x
    on (x.marked_at at time zone 'Africa/Johannesburg')::date = sd.day and (sd.scope = 'ALL' or x.broker_id = sd.scope) and facts.disp_class(x.disposition_code) in ('fit','nofit')
  group by 1, 2
),
roll as (
  select n.scope, n.day,
         sum(n.v) over w as snum, sum(d.v) over w as sden
  from num n join den d using (scope, day)
  window w as (partition by n.scope order by n.day rows between 27 preceding and current row)
)
select 4 as tile_no, 'Meetings the adviser rated a good fit' as tile, r.scope,
       round(snum / nullif(sden, 0), 3) as value, 'ratio' as unit,
       (1 - p.nofit_max) as target, '>=' as target_rule,
       case when r.sden < p.min_dispositions then 'grey'
            else facts.tile_status(round(snum / nullif(sden, 0), 3), (1 - p.nofit_max), true, null) end as status,
       r.sden::int as n,
       (select round(t.snum / nullif(t.sden, 0), 3) from roll t where t.scope = r.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', round(t.snum / nullif(t.sden, 0), 3)) order by t.day)
          from roll t where t.scope = r.scope and t.day > p.as_of - 28) as trend_28d,
       'If more than 40% are not a fit for an ad, pause that ad even if it is cheap; if budget is the reason, review the budget question.' as look_out
from roll r cross join p
where r.day = p.as_of;

-- ---------------------------------------------------------------------------------------------
-- Cycle economics at a given day (used by tile 5, the W14 reports and the reconcile check).
-- Revenue is the cycle price less any shortfall credit. Variable costs are scaled to what it will take to
-- deliver committed + replacement-cap leads (the 3.5 model buys ~24 qualified for 20 committed). Fixed costs (infra, fees) are not scaled.
-- stress_* re-prices the same raw-lead volume at the 3.5 stress CPL (R250) + R4/raw lead, VAT on media.
create or replace function facts.cycle_margin(p_cycle text, p_day date)
returns table (cycle_id text, broker_id text, price_net numeric, committed int, replacement_cap int,
               gross_verified int, delivered_net int, raw_leads int,
               media_incl_vat numeric, wa_llm numeric, fixed numeric,
               scale numeric, projected_cost numeric, margin_to_date numeric,
               margin_projected numeric, stress_cost numeric, margin_at_stress numeric)
language sql stable as $$
  with p as (select * from facts.v_params),
  c as (select * from facts.fact_cycle where fact_cycle.cycle_id = p_cycle),
  l as (
    select count(*) filter (where qualified and verified_at is not null and (verified_at at time zone 'Africa/Johannesburg')::date <= p_day) as gross_verified,
           count(*) filter (where qualified and verified_at is not null and (verified_at at time zone 'Africa/Johannesburg')::date <= p_day
                            and not coalesce(replaced, false)) as delivered_net,
           count(*) filter (where (created_at at time zone 'Africa/Johannesburg')::date <= p_day) as raw_leads
    from facts.fact_lead where fact_lead.cycle_id = p_cycle),
  k as (
    select coalesce(sum(amount_zar) filter (where kind = 'media'), 0) as media_ex,
           coalesce(sum(amount_zar) filter (where kind in ('whatsapp','llm')), 0) as wa_llm,
           coalesce(sum(amount_zar) filter (where kind in ('infra','fees')), 0) as fixed
    from facts.fact_cost where fact_cost.cycle_id = p_cycle and day <= p_day),
  x as (
    select c.cycle_id, c.broker_id, c.price_zar - coalesce(c.shortfall_credit_zar, 0) as price_net,
           c.committed_leads, c.replacement_cap, l.gross_verified, l.delivered_net, l.raw_leads,
           k.media_ex * (1 + p.vat_media) as media_incl_vat, k.wa_llm, k.fixed,
           case when l.delivered_net >= c.committed_leads then 1.0
                when l.gross_verified = 0 then null
                else greatest(1.0, (c.committed_leads + c.replacement_cap)::numeric / l.gross_verified) end as scale,
           p.stress_cpl_zar, p.vat_media, p.stress_overhead_per_raw_zar
    from c, l, k, p)
  select x.cycle_id, x.broker_id, x.price_net, x.committed_leads, x.replacement_cap, x.gross_verified::int, x.delivered_net::int, x.raw_leads::int,
         round(x.media_incl_vat, 2), round(x.wa_llm, 2), round(x.fixed, 2), round(x.scale, 3),
         round((x.media_incl_vat + x.wa_llm) * x.scale + x.fixed, 2),
         round((x.price_net - (x.media_incl_vat + x.wa_llm + x.fixed)) / nullif(x.price_net, 0), 3),
         round((x.price_net - ((x.media_incl_vat + x.wa_llm) * x.scale + x.fixed)) / nullif(x.price_net, 0), 3),
         round(x.raw_leads * x.scale * (x.stress_cpl_zar * (1 + x.vat_media) + x.stress_overhead_per_raw_zar) + x.fixed, 2),
         round((x.price_net - (x.raw_leads * x.scale * (x.stress_cpl_zar * (1 + x.vat_media) + x.stress_overhead_per_raw_zar) + x.fixed)) / nullif(x.price_net, 0), 3)
  from x
$$;

-- Tile 5: Margin this cycle (projected to the end of the cycle). One row per broker with an active cycle + ALL.
create or replace view facts.v_watchlist_5_margin_this_cycle as
with p as (select * from facts.v_params),
cy as (select * from facts.fact_cycle where status in ('active', 'extended')),
daily as (
  select cy.broker_id, d::date as day, m.price_net, m.projected_cost, m.margin_projected, m.margin_at_stress, m.stress_cost
  from cy cross join p
  cross join lateral generate_series(greatest(cy.starts_at, p.as_of - 27), p.as_of, interval '1 day') d
  cross join lateral facts.cycle_margin(cy.cycle_id, d::date) m),
scoped as (
  select broker_id as scope, day, price_net, projected_cost, stress_cost from daily
  union all
  select 'ALL', day, sum(price_net), sum(projected_cost), sum(stress_cost) from daily group by day),
series as (
  select scope, day, round((price_net - projected_cost) / nullif(price_net, 0), 3) as v,
         round((price_net - stress_cost) / nullif(price_net, 0), 3) as v_stress
  from scoped)
select 5 as tile_no, 'Margin this cycle' as tile, s.scope,
       s.v as value, 'ratio' as unit, p.margin_floor as target, '>=' as target_rule,
       case when s.v is null then 'grey' else facts.tile_status(s.v, p.margin_floor, true) end as status,
       (select count(*) from facts.fact_lead l where l.cycle_id in (select cycle_id from cy where s.scope = 'ALL' or cy.broker_id = s.scope))::int as n,
       (select t.v from series t where t.scope = s.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', t.v) order by t.day) from series t where t.scope = s.scope and t.day > p.as_of - 28) as trend_28d,
       'If it falls under 30%, check cost per qualified lead and leads per ad first; do not change prices mid-cycle.' as look_out,
       s.v_stress as margin_if_cost_per_lead_hits_stress
from series s cross join p
where s.day = p.as_of;

-- Tile 6: Days of broker capacity left (calendar days until the adviser's free slots run out at the current booking pace).
create or replace view facts.v_watchlist_6_capacity_days_left as
with p as (select * from facts.v_params),
pace as (
  select b.broker_id, b.day, b.slots_open_14d, b.slots_total_7d, b.slots_booked_7d, b.media_trimmed,
         (select count(*) from facts.fact_booking k where k.broker_id = b.broker_id
            and (k.booked_at at time zone 'Africa/Johannesburg')::date between b.day - 6 and b.day) / 7.0 as bookings_per_day
  from facts.fact_broker_day b),
v as (
  select broker_id as scope, day, slots_open_14d, slots_total_7d, slots_booked_7d, media_trimmed,
         round(least(99, slots_open_14d / greatest(bookings_per_day, 0.1)), 1) as days_left,
         round(slots_booked_7d::numeric / nullif(slots_total_7d, 0), 3) as fill_7d
  from pace
  union all  -- ALL = the tightest broker (the one that runs out first)
  select 'ALL', day, min(slots_open_14d), sum(slots_total_7d), sum(slots_booked_7d), bool_or(media_trimmed),
         min(round(least(99, slots_open_14d / greatest(bookings_per_day, 0.1)), 1)),
         round(sum(slots_booked_7d)::numeric / nullif(sum(slots_total_7d), 0), 3)
  from pace group by day)
select 6 as tile_no, 'Days of broker capacity left' as tile, v.scope,
       v.days_left as value, 'days' as unit, p.capacity_floor_days as target, '>=' as target_rule,
       facts.tile_status(v.days_left, p.capacity_floor_days, true) as status,
       v.slots_open_14d as n,
       (select t.days_left from v t where t.scope = v.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', t.days_left) order by t.day) from v t where t.scope = v.scope and t.day > p.as_of - 28) as trend_28d,
       'Next 7 days 80% booked or more: trim that adviser''s ad share by 30%; full for 5 working days: offer a bigger plan or add an adviser.' as look_out,
       v.fill_7d as next_7_days_booked_share,
       (v.fill_7d >= p.capacity_trim_at) as trim_ad_share_now
from v cross join p where v.day = p.as_of;

-- Renewal risk per broker at a given day (4.10a "what it gives us": show rate, disposition rate, to-dos ignored, report opened).
-- Points: show rate (<65% = 1, <50% = 2) + marked-by-adviser rate (<90% = 1, <70% = 2) + open to-dos (>=3 = 1, >=6 = 2)
--       + report unopened two weeks running (2) + average quality (<3.0 = 1, <2.5 = 2).  green 0-1, amber 2-3, red 4+.  ASSUMPTION weights: calibrate on cycle-1 renewals.
create or replace function facts.renewal_risk_at(d date)
returns table (broker_id text, score int, level text, reasons jsonb, show_rate numeric, marked_rate numeric, quality_avg numeric, todos_open int, report_unopened_2wk boolean)
language sql stable as $$
  with p as (select * from facts.v_params),
  o as (
    select broker_id,
           count(*) filter (where outcome in ('attended','no_show')) as show_den,
           count(*) filter (where outcome = 'attended') as show_num,
           count(*) as marked_den, count(*) filter (where not coalesce(auto_marked, false)) as marked_num,
           count(quality_score) as q_n, avg(quality_score) as q_avg
    from facts.fact_outcome
    where (marked_at at time zone 'Africa/Johannesburg')::date between d - 27 and d
    group by broker_id),
  t as (select distinct on (broker_id) broker_id, todos_open from facts.fact_broker_day where day <= d order by broker_id, day desc),
  r as (
    select broker_id, (count(*) = 2 and bool_and(report_opened_at is null)) as unopened_2wk
    from (select broker_id, report_opened_at, row_number() over (partition by broker_id order by day desc) rn
          from facts.fact_broker_day where day <= d and report_sent_at is not null) z
    where rn <= 2 group by broker_id),
  b as (select distinct broker_id from facts.fact_cycle where status in ('active', 'extended')),
  s as (
    select b.broker_id,
           o.show_num::numeric / nullif(o.show_den, 0) as show_rate,
           o.marked_num::numeric / nullif(o.marked_den, 0) as marked_rate,
           case when o.q_n >= 3 then o.q_avg end as q_avg,
           coalesce(t.todos_open, 0) as todos, coalesce(r.unopened_2wk, false) as unopened,
           coalesce(o.show_den, 0) as show_den, coalesce(o.marked_den, 0) as marked_den
    from b left join o using (broker_id) left join t using (broker_id) left join r using (broker_id)),
  pts as (
    select s.*, p.show_target, p.show_floor, p.disposition_target,
           (case when show_den >= 3 and show_rate < p.show_floor then 2 when show_den >= 3 and show_rate < p.show_target then 1 else 0 end) as p_show,
           (case when marked_den >= 3 and marked_rate < 0.70 then 2 when marked_den >= 3 and marked_rate < p.disposition_target then 1 else 0 end) as p_marked,
           (case when todos >= 6 then 2 when todos >= 3 then 1 else 0 end) as p_todo,
           (case when unopened then 2 else 0 end) as p_report,
           (case when q_avg < 2.5 then 2 when q_avg < 3.0 then 1 else 0 end) as p_quality
    from s cross join p)
  select broker_id, (p_show + p_marked + p_todo + p_report + p_quality)::int as score,
         case when show_den + marked_den = 0 then 'grey'
              when p_show + p_marked + p_todo + p_report + p_quality >= 4 then 'red'
              when p_show + p_marked + p_todo + p_report + p_quality >= 2 then 'amber' else 'green' end as level,
         (select coalesce(jsonb_agg(x.t), '[]'::jsonb) from (values
            (case when p_show > 0 then 'Show rate ' || round(show_rate * 100) || '% is under target' end),
            (case when p_marked > 0 then 'Only ' || round(marked_rate * 100) || '% of outcomes marked by the adviser' end),
            (case when p_todo > 0 then todos || ' to-dos still open' end),
            (case when p_report > 0 then 'Report unopened two weeks running: Jonathan to call' end),
            (case when p_quality > 0 then 'Average quality ' || round(q_avg, 1) || ' of 5' end)) as x(t) where x.t is not null) as reasons,
         round(show_rate, 3), round(marked_rate, 3), round(q_avg, 2), todos, unopened
  from pts
$$;

-- Tile 7: Renewal risk per broker (green/amber/red). Value = points (0 best). Trend = weekly points (4 weekly values), not daily.
create or replace view facts.v_watchlist_7_renewal_risk as
with p as (select * from facts.v_params),
cur as (select * from facts.renewal_risk_at((select as_of from p))),
wk as (
  select w.broker_id, jsonb_agg(jsonb_build_object('d', w.d, 'v', w.score, 'level', w.level) order by w.d) as trend
  from (select (select as_of from p) - k as d, r.broker_id, r.score, r.level
        from generate_series(0, 21, 7) k cross join lateral facts.renewal_risk_at((select as_of from p) - k) r) w
  group by w.broker_id)
select 7 as tile_no, 'Renewal risk' as tile, c.broker_id as scope,
       c.score as value, 'points' as unit, 1 as target, '<=' as target_rule, c.level as status,
       null::int as n,
       (select r.score from facts.renewal_risk_at((select as_of from p) - 7) r where r.broker_id = c.broker_id) as last_period,
       wk.trend as trend_28d,
       'Amber or red: ring the adviser this week; the reasons column says what to ask about.' as look_out,
       c.reasons
from cur c join wk using (broker_id);
