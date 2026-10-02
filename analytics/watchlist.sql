-- analytics/watchlist.sql — the owner's watchlist (6A2 item 3): seven tiles + the launch tile (6B.12).
-- Every tile view returns the same first columns:  tile_no, tile (plain name), scope ('ALL' or broker uuid as text), value, unit, target, target_rule,
-- status (green/amber/red/grey), n (sample behind the value), last_period (value 7 days ago), trend_28d (jsonb [{d,v}], one point per day),
-- look_out (one sentence: what to do if it moves).  Definitions, SQL and jargon: knowledge/metrics.md.
-- Reads the REAL facts layer (supabase/migrations/20261002_smc_04_facts.sql); the column contract is analytics/tests/facts-contract.test.sql.
-- Event dates use the real columns: leads by created_date, meetings and outcomes by slot_date, bookings by booked_date, costs and ads by date.
-- facts has no verified_at / qualified_at timestamps, so lead-side numbers are COHORT-dated (by sign-up day), which is how 3.4 reads them anyway.
-- Overlap with facts.v_watchlist (smc_04): that view is the console's plain value-and-target feed; these views add trend, traffic light, n and
-- the what-to-do sentence. analytics/tests/watchlist-reconcile.test.sql compares the two and prints the definition differences.
-- Requires facts.as_of() and facts.v_params (params.sql).

create or replace view facts.v_scope_day as
select s.scope, d::date as day
from (select 'ALL'::text as scope union select broker_id::text from facts.fact_cycle) s
cross join generate_series((facts.as_of() - 70)::timestamp, facts.as_of()::timestamp, interval '1 day') d;

-- Capacity per broker per day, forward-looking windows. Same rule as facts.fact_broker_day (smc_04): capacity_slots = brokers.max_meetings_per_day on days
-- listed in brokers.meeting_hours unless bookings are paused; meetings_scheduled = bookings in status booked/confirmed/attended/no_show on that SA day.
-- It is rebuilt here from facts.fact_booking + public.brokers because fact_broker_day evaluates facts.fact_lead (with its laterals) once per broker per day
-- per column, which is O(days x leads) and took 2 s on 30 leads (14 s for the renewal tile); this version is one pass. tests/watchlist-reconcile.test.sql
-- checks the two agree on capacity_slots, meetings_scheduled and bookings_made, so they cannot drift unseen.
-- media_trimmed: no column holds the trim state yet; reads brokers.media_share_pct if platform-architect adds it (requested), else false.
drop view if exists facts.v_capacity_day cascade;   -- column set changed between drafts; re-running the file rebuilds every dependant below and in kill-scale.sql / W14-lv.sql
create view facts.v_capacity_day as
with b as (select id as broker_id, meeting_hours, bookings_paused, max_meetings_per_day, horizon_days, to_jsonb(br) as j from public.brokers br where br.brand_id is not null),
days as (
  select b.*, g::date as day
  from b cross join lateral generate_series((facts.as_of() - 70)::timestamp, (facts.as_of() + b.horizon_days)::timestamp, interval '1 day') g),
sched as (select broker_id, slot_date as day, count(*) filter (where status in ('booked','confirmed','attended','no_show')) as meetings_scheduled
          from facts.fact_booking group by 1, 2),
made as (select broker_id, booked_date as day, count(*) filter (where not is_reschedule) as bookings_made from facts.fact_booking group by 1, 2),
base as (
  select d.broker_id, d.day,
         case when d.meeting_hours ? lower(to_char(d.day, 'Dy')) and not d.bookings_paused then d.max_meetings_per_day else 0 end as capacity_slots,
         coalesce(s.meetings_scheduled, 0) as meetings_scheduled, coalesce(m.bookings_made, 0) as bookings_made,
         (coalesce((d.j ->> 'media_share_pct')::numeric, 100) < 100) as media_trimmed
  from days d left join sched s on s.broker_id = d.broker_id and s.day = d.day left join made m on m.broker_id = d.broker_id and m.day = d.day)
select bd.broker_id, bd.day, bd.capacity_slots, bd.meetings_scheduled, bd.bookings_made,
       coalesce(sum(greatest(bd.capacity_slots - bd.meetings_scheduled, 0)) over w14, 0)::int as slots_open_14d,
       coalesce(sum(bd.capacity_slots) over w7, 0)::int                                         as slots_total_7d,
       coalesce(sum(bd.meetings_scheduled) over w7, 0)::int                                     as slots_booked_7d,
       (sum(bd.bookings_made) over (partition by bd.broker_id order by bd.day rows between 6 preceding and current row))::numeric / 7 as bookings_per_day,
       bd.media_trimmed
from base bd
window w7  as (partition by bd.broker_id order by bd.day rows between 1 following and 7 following),
       w14 as (partition by bd.broker_id order by bd.day rows between 1 following and 14 following);

-- Open to-dos per broker as of facts.as_of(): meetings that have ended with no outcome tapped + outcomes the system auto-marked and the adviser has not confirmed.
create or replace view facts.v_broker_todos as
select b.id as broker_id,
       (select count(*) from facts.fact_booking fb
         where fb.broker_id = b.id and fb.status in ('booked','confirmed') and fb.ends_at < least(now(), ((facts.as_of() + 1)::timestamp at time zone 'Africa/Johannesburg'))
           and not exists (select 1 from facts.fact_outcome fo where fo.booking_id = fb.booking_id))::int as unmarked,
       (select count(*) from facts.fact_outcome fo where fo.broker_id = b.id and fo.unconfirmed)::int as unconfirmed
from public.brokers b where b.brand_id is not null;

-- Tile 0: Cost of a lead vs the model (first 14 days)
create or replace view facts.v_watchlist_0_cpl_vs_model as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day where scope = 'ALL'),
num as (
  select sd.scope, sd.day, coalesce(sum(x.spend_zar), 0) as v
  from sd left join facts.fact_ad_day x on x.date = sd.day
  group by 1, 2
),
den as (
  select sd.scope, sd.day, coalesce(sum(x.leads_meta), 0) as v
  from sd left join facts.fact_ad_day x on x.date = sd.day
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

-- Tile 1: Cost per good-fit meeting.  Target (default pending NH-25): R1,300; stretch R900 (params.sql).
create or replace view facts.v_watchlist_1_cost_per_good_fit as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day),
num as (
  select sd.scope, sd.day, coalesce(sum(x.amount_zar), 0) as v
  from sd left join facts.fact_cost x
    on x.date = sd.day and (sd.scope = 'ALL' or x.broker_id::text = sd.scope) and x.kind = 'media'
  group by 1, 2
),
den as (
  select sd.scope, sd.day, count(x.outcome_id) as v
  from sd left join facts.fact_outcome x
    on x.slot_date = sd.day and (sd.scope = 'ALL' or x.broker_id::text = sd.scope) and x.good_fit
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
       'If it rises for 7 days, find which angle''s good-fit rate dropped and move its budget to the best angle.' as look_out,
       p.cost_per_good_fit_stretch_zar as stretch_target
from roll r cross join p
where r.day = p.as_of;

-- Tile 2: Leads we could actually reach (cohort: sign-ups old enough to have had their 72 hours)
create or replace view facts.v_watchlist_2_leads_we_could_reach as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day),
num as (
  select sd.scope, sd.day, count(x.lead_key) as v
  from sd left join facts.fact_lead x
    on x.created_date = sd.day and sd.day <= (select as_of - verify_lag_days from facts.v_params)
   and (sd.scope = 'ALL' or x.broker_id::text = sd.scope)
   and x.consented and x.first_message_seconds is not null and x.verified_within_72h
  group by 1, 2
),
den as (
  select sd.scope, sd.day, count(x.lead_key) as v
  from sd left join facts.fact_lead x
    on x.created_date = sd.day and sd.day <= (select as_of - verify_lag_days from facts.v_params)
   and (sd.scope = 'ALL' or x.broker_id::text = sd.scope)
   and x.consented and x.first_message_seconds is not null
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
  select sd.scope, sd.day, count(x.outcome_id) as v
  from sd left join facts.fact_outcome x
    on x.slot_date = sd.day and (sd.scope = 'ALL' or x.broker_id::text = sd.scope) and x.outcome = 'attended'
  group by 1, 2
),
den as (
  select sd.scope, sd.day, count(x.outcome_id) as v
  from sd left join facts.fact_outcome x
    on x.slot_date = sd.day and (sd.scope = 'ALL' or x.broker_id::text = sd.scope) and x.outcome in ('attended','no_show')
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

-- Tile 4: Meetings the adviser rated a good fit.  Target (default pending NH-25): 60%.
-- Unreachable is a replacement matter, not a fit judgement, so it is left out of the denominator (see watchlist-reconcile.test.sql).
create or replace view facts.v_watchlist_4_broker_good_fit_rate as
with p as (select * from facts.v_params),
sd as (select * from facts.v_scope_day),
num as (
  select sd.scope, sd.day, count(x.outcome_id) as v
  from sd left join facts.fact_outcome x
    on x.slot_date = sd.day and (sd.scope = 'ALL' or x.broker_id::text = sd.scope) and facts.disp_class(x.disposition_code) = 'fit'
  group by 1, 2
),
den as (
  select sd.scope, sd.day, count(x.outcome_id) as v
  from sd left join facts.fact_outcome x
    on x.slot_date = sd.day and (sd.scope = 'ALL' or x.broker_id::text = sd.scope) and facts.disp_class(x.disposition_code) in ('fit','nofit')
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
       p.good_fit_target as target, '>=' as target_rule,
       case when r.sden < p.min_dispositions then 'grey'
            else facts.tile_status(round(snum / nullif(sden, 0), 3), p.good_fit_target, true, null) end as status,
       r.sden::int as n,
       (select round(t.snum / nullif(t.sden, 0), 3) from roll t where t.scope = r.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', round(t.snum / nullif(t.sden, 0), 3)) order by t.day)
          from roll t where t.scope = r.scope and t.day > p.as_of - 28) as trend_28d,
       'If more than 40% are not a fit for an ad, pause that ad even if it is cheap; if budget is the reason, review the budget question.' as look_out
from roll r cross join p
where r.day = p.as_of;

-- ---------------------------------------------------------------------------------------------
-- Cycle economics at a given day (used by tile 5, the W14 reports and the reconcile check).
-- Revenue is the cycle price less any shortfall credit (public.cycles.shortfall_credit_zar; not in facts.fact_cycle). Variable costs are scaled to
-- what it will take to deliver committed + replacement-cap leads (the 3.5 model buys ~24 qualified for 20 committed). Fixed costs (infra, fees) are not scaled.
-- stress_* re-prices the same raw-lead volume at the 3.5 stress CPL (R250) + R4/raw lead, VAT on media.
-- delivered_net = verified + qualified, replacement leads excluded: the same rule as facts.fact_cycle.delivered and public.v_cycle_progress.verified.
-- Costs: facts.fact_cost for the broker from the cycle's first day to p_day (shared media is allocated by lead share inside fact_cost).
create or replace view facts.v_cycle_margin_day as
with p as (select * from facts.v_params),
cy as (select c.id as cycle_id, c.broker_id, c.starts_at, c.committed_leads, c.replacement_cap, c.price_zar - coalesce(c.shortfall_credit_zar, 0) as price_net
         from public.cycles c where c.brand_id is not null),
days as (
  select cy.*, g::date as day
  from cy cross join p cross join lateral generate_series(greatest(facts.sa_date(cy.starts_at), p.as_of - 40)::timestamp, p.as_of::timestamp, interval '1 day') g),
ld as (select fl.cycle_id, fl.created_date as day, count(*) as raw_leads, count(*) filter (where fl.qualified and fl.verified) as gross_verified,
              count(*) filter (where fl.qualified and fl.verified and not fl.is_replacement_lead) as delivered_net
         from facts.fact_lead fl where fl.cycle_id is not null group by 1, 2),
cd as (select cy.cycle_id, fc.date as day,
              sum(fc.amount_zar) filter (where fc.kind = 'media') as media_ex,
              sum(fc.amount_zar) filter (where fc.kind in ('whatsapp','llm')) as wa_llm,
              sum(fc.amount_zar) filter (where fc.kind in ('infra','fees','other')) as fixed
         from facts.fact_cost fc join cy on fc.broker_id = cy.broker_id and fc.date >= facts.sa_date(cy.starts_at) group by 1, 2),
cum as (
  select d.*,
    (select coalesce(sum(l.raw_leads), 0) from ld l where l.cycle_id = d.cycle_id and l.day <= d.day) as raw_leads,
    (select coalesce(sum(l.gross_verified), 0) from ld l where l.cycle_id = d.cycle_id and l.day <= d.day) as gross_verified,
    (select coalesce(sum(l.delivered_net), 0) from ld l where l.cycle_id = d.cycle_id and l.day <= d.day) as delivered_net,
    (select coalesce(sum(k.media_ex), 0) from cd k where k.cycle_id = d.cycle_id and k.day <= d.day) as media_ex,
    (select coalesce(sum(k.wa_llm), 0) from cd k where k.cycle_id = d.cycle_id and k.day <= d.day) as wa_llm,
    (select coalesce(sum(k.fixed), 0) from cd k where k.cycle_id = d.cycle_id and k.day <= d.day) as fixed
  from days d),
x as (
  select cum.*, cum.media_ex * (1 + p.vat_media) as media_incl_vat,
         case when cum.delivered_net >= cum.committed_leads then 1.0
              when cum.gross_verified = 0 then null
              else greatest(1.0, (cum.committed_leads + cum.replacement_cap)::numeric / cum.gross_verified) end as scale,
         p.stress_cpl_zar, p.vat_media, p.stress_overhead_per_raw_zar
  from cum cross join p)
select x.cycle_id, x.broker_id, x.day, x.price_net, x.committed_leads as committed, x.replacement_cap,
       x.gross_verified::int as gross_verified, x.delivered_net::int as delivered_net, x.raw_leads::int as raw_leads,
       round(x.media_incl_vat, 2) as media_incl_vat, round(x.wa_llm, 2) as wa_llm, round(x.fixed, 2) as fixed, round(x.scale, 3) as scale,
       round((x.media_incl_vat + x.wa_llm) * x.scale + x.fixed, 2) as projected_cost,
       round((x.price_net - (x.media_incl_vat + x.wa_llm + x.fixed)) / nullif(x.price_net, 0), 3) as margin_to_date,
       round((x.price_net - ((x.media_incl_vat + x.wa_llm) * x.scale + x.fixed)) / nullif(x.price_net, 0), 3) as margin_projected,
       round(x.raw_leads * x.scale * (x.stress_cpl_zar * (1 + x.vat_media) + x.stress_overhead_per_raw_zar) + x.fixed, 2) as stress_cost,
       round((x.price_net - (x.raw_leads * x.scale * (x.stress_cpl_zar * (1 + x.vat_media) + x.stress_overhead_per_raw_zar) + x.fixed)) / nullif(x.price_net, 0), 3) as margin_at_stress
from x;

-- Thin wrapper kept for callers (W14-lv, tests): one cycle on one SA day (within 40 days of facts.as_of()).
create or replace function facts.cycle_margin(p_cycle uuid, p_day date)
returns table (cycle_id uuid, broker_id uuid, price_net numeric, committed int, replacement_cap int,
               gross_verified int, delivered_net int, raw_leads int,
               media_incl_vat numeric, wa_llm numeric, fixed numeric,
               scale numeric, projected_cost numeric, margin_to_date numeric,
               margin_projected numeric, stress_cost numeric, margin_at_stress numeric)
language sql stable as $$
  select m.cycle_id, m.broker_id, m.price_net, m.committed, m.replacement_cap, m.gross_verified, m.delivered_net, m.raw_leads,
         m.media_incl_vat, m.wa_llm, m.fixed, m.scale, m.projected_cost, m.margin_to_date, m.margin_projected, m.stress_cost, m.margin_at_stress
  from facts.v_cycle_margin_day m where m.cycle_id = p_cycle and m.day = p_day
$$;

-- Tile 5: Margin this cycle (projected to the end of the cycle). One row per broker with an active cycle + ALL.
create or replace view facts.v_watchlist_5_margin_this_cycle as
with p as (select * from facts.v_params),
cy as (select c.id as cycle_id, c.broker_id from public.cycles c where c.brand_id is not null and c.status in ('active', 'extended')),
daily as (
  select cy.broker_id::text as broker_id, m.day, m.price_net, m.projected_cost, m.stress_cost, m.raw_leads
  from cy join facts.v_cycle_margin_day m on m.cycle_id = cy.cycle_id),
scoped as (
  select broker_id as scope, day, price_net, projected_cost, stress_cost, raw_leads from daily
  union all
  select 'ALL', day, sum(price_net), sum(projected_cost), sum(stress_cost), sum(raw_leads) from daily group by day),
series as (
  select scope, day, raw_leads, round((price_net - projected_cost) / nullif(price_net, 0), 3) as v,
         round((price_net - stress_cost) / nullif(price_net, 0), 3) as v_stress
  from scoped)
select 5 as tile_no, 'Margin this cycle' as tile, s.scope,
       s.v as value, 'ratio' as unit, p.margin_floor as target, '>=' as target_rule,
       case when s.v is null then 'grey' else facts.tile_status(s.v, p.margin_floor, true) end as status,
       s.raw_leads::int as n,
       (select t.v from series t where t.scope = s.scope and t.day = p.as_of - 7) as last_period,
       (select jsonb_agg(jsonb_build_object('d', t.day, 'v', t.v) order by t.day) from series t where t.scope = s.scope and t.day > p.as_of - 28) as trend_28d,
       'If it falls under 30%, check cost per qualified lead and leads per ad first; do not change prices mid-cycle.' as look_out,
       s.v_stress as margin_if_cost_per_lead_hits_stress
from series s cross join p
where s.day = p.as_of;

-- Tile 6: Days of broker capacity left (calendar days until the adviser's free slots run out at the current booking pace).
create or replace view facts.v_watchlist_6_capacity_days_left as
with p as (select * from facts.v_params),
pace as (select * from facts.v_capacity_day where day <= (select as_of from p)),
v as (
  select broker_id::text as scope, day, slots_open_14d, slots_total_7d, slots_booked_7d, media_trimmed,
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
-- NOTE: facts.v_watchlist #7 (smc_04) uses a simpler 0/1/2 rule; this one gives the reasons the console shows. See watchlist-reconcile.test.sql.
-- Report opened = public.report_history (broker_weekly) opened_portal_at / opened_wa_at on either of the last two sent reports.
create or replace function facts.renewal_risk_at(d date)
returns table (broker_id text, score int, level text, reasons jsonb, show_rate numeric, marked_rate numeric, quality_avg numeric, todos_open int, report_unopened_2wk boolean)
language sql stable as $$
  with p as (select * from facts.v_params),
  o as (
    select fo.broker_id::text as broker_id,
           count(*) filter (where fo.outcome in ('attended','no_show')) as show_den,
           count(*) filter (where fo.outcome = 'attended') as show_num,
           count(*) as marked_den, count(*) filter (where not coalesce(fo.auto_marked, false)) as marked_num,
           count(fo.quality_score) as q_n, avg(fo.quality_score) as q_avg
    from facts.fact_outcome fo
    where fo.slot_date between d - 27 and d
    group by fo.broker_id),
  t as (select bt.broker_id::text as broker_id, (bt.unmarked + bt.unconfirmed) as todos_open from facts.v_broker_todos bt),   -- as of facts.as_of() (outcomes have no history of being open)
  r as (
    select z.broker_id::text as broker_id, (count(*) = 2 and bool_and(not z.opened)) as unopened_2wk
    from (select rh.broker_id, (rh.opened_portal_at is not null or rh.opened_wa_at is not null) as opened,
                 row_number() over (partition by rh.broker_id order by rh.week desc) rn
          from public.report_history rh
          where rh.brand_id is not null and rh.report_kind = 'broker_weekly' and rh.week <= d
            and (rh.sent_wa_at is not null or rh.sent_email_at is not null)) z
    where z.rn <= 2 group by z.broker_id),
  b as (select distinct fc.broker_id::text as broker_id from facts.fact_cycle fc where fc.status in ('active', 'extended')),
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
