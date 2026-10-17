-- Compares facts.v_watchlist (smc_04, the console's plain feed, always "include synthetic" off unless set) with the analytics tile views, tile by tile.
-- Differences are EXPECTED where the definition differs; the "why" column says which. Anything marked UNEXPLAINED is a bug to chase.
set smc.include_synthetic = 'on';
with a as (
  select 1 as no, value, target from facts.v_watchlist_1_cost_per_good_fit where scope = 'ALL'
  union all select 2, value, target from facts.v_watchlist_2_leads_we_could_reach where scope = 'ALL'
  union all select 3, value, target from facts.v_watchlist_3_booked_to_attended where scope = 'ALL'
  union all select 4, value, target from facts.v_watchlist_4_broker_good_fit_rate where scope = 'ALL'
  union all select 5, value, target from facts.v_watchlist_5_margin_this_cycle where scope = 'ALL'
  union all select 6, value, target from facts.v_watchlist_6_capacity_days_left where scope = 'ALL'
  union all (select 7, value, target from facts.v_watchlist_7_renewal_risk order by value desc limit 1)),
w as (select metric_no, value, target from facts.v_watchlist where broker_id is null)
select w.metric_no as tile, (select metric_code from facts.v_watchlist x where x.metric_no = w.metric_no limit 1) as metric, w.value as smc04_value, a.value as analytics_value, w.target as smc04_target, a.target as analytics_target,
       case when w.value is not distinct from a.value and w.target is not distinct from a.target then 'same'
            when w.metric_no = 1 then 'target: NH-25 default R1,300 (smc_04 has R900)'
            when w.metric_no = 2 then 'window: analytics = 14-day cohort of sign-ups older than 3 days; smc_04 = 28 days by verify_window_closed'
            when w.metric_no = 4 then 'target: NH-25 default 60% (smc_04 has none); denominator: analytics leaves unreachable out, smc_04 counts it'
            when w.metric_no = 5 then 'analytics = projected to end of cycle at stress scaling; smc_04 = actual to date, target 43%'
            when w.metric_no = 6 then 'analytics caps at 99 and uses a 7-day booking pace; smc_04 uses 14 days'
            when w.metric_no = 7 then 'analytics = points (0-9) with reasons; smc_04 = 0/1/2'
            else 'UNEXPLAINED' end as why
from w join a on a.no = w.metric_no order by 1;

-- v_capacity_day (one pass) must agree with the platform's facts.fact_broker_day on the three columns they share. Expect zero rows.
select 'capacity drift' as problem, bd.broker_id, bd.date, bd.capacity_slots as smc04_capacity, cd.capacity_slots, bd.meetings_scheduled as smc04_sched, cd.meetings_scheduled, bd.bookings_made as smc04_made, cd.bookings_made
from facts.fact_broker_day bd join facts.v_capacity_day cd on cd.broker_id = bd.broker_id and cd.day = bd.date
where (bd.capacity_slots, bd.meetings_scheduled, bd.bookings_made) is distinct from (cd.capacity_slots, cd.meetings_scheduled, cd.bookings_made::bigint);
