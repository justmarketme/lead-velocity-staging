-- analytics/W14-lv.sql — the query set W14 runs Sunday 23:00 for the Lead Velocity internal weekly (4.6 W14, 4.9).
-- Template and narrative rules: analytics/weekly-lv-report.md. W14 stores the result of facts.w14_lv_payload() in report_history
-- (report_kind = 'lv_weekly', report_data = payload) and hands it to Sonnet for the 3 insights + 1 recommendation (the SQL only seeds them).
-- Never selects policies/close rate (facts.fact_broker_roi): FAIS, 3.7. Never selects personal fields (facts holds none).
-- Requires: params.sql, watchlist.sql (cycle_margin, renewal_risk_at), kill-scale.sql.

-- Section 1. Funnel per adviser: this week vs last week, event-dated flows (7-day windows ending today / 7 days ago).
create or replace view facts.v_w14_lv_funnel as
with p as (select * from facts.v_params),
wk as (select 0 as wk_no, p.as_of - 6 as d0, p.as_of as d1 from p union all select 1, p.as_of - 13, p.as_of - 7 from p),
b as (select distinct broker_id from facts.fact_cycle),
j as (select b.broker_id, wk.* from b cross join wk)
select j.broker_id, case j.wk_no when 0 then 'this_week' else 'last_week' end as period,
  (select count(*) from facts.fact_lead l where l.broker_id = j.broker_id and (l.created_at at time zone 'Africa/Johannesburg')::date between j.d0 and j.d1) as raw_leads,
  (select count(*) from facts.fact_lead l where l.broker_id = j.broker_id and l.qualified and (l.verified_at at time zone 'Africa/Johannesburg')::date between j.d0 and j.d1) as qualified_verified,
  (select count(*) from facts.fact_booking k where k.broker_id = j.broker_id and k.status <> 'cancelled' and (k.booked_at at time zone 'Africa/Johannesburg')::date between j.d0 and j.d1) as booked,
  (select count(*) from facts.fact_outcome o where o.broker_id = j.broker_id and o.outcome = 'attended' and (o.marked_at at time zone 'Africa/Johannesburg')::date between j.d0 and j.d1) as attended,
  (select count(*) from facts.fact_outcome o where o.broker_id = j.broker_id and o.outcome = 'no_show' and (o.marked_at at time zone 'Africa/Johannesburg')::date between j.d0 and j.d1) as no_show,
  (select count(*) from facts.fact_outcome o where o.broker_id = j.broker_id and facts.disp_class(o.disposition_code) = 'fit' and (o.marked_at at time zone 'Africa/Johannesburg')::date between j.d0 and j.d1) as good_fit,
  (select count(*) from facts.fact_outcome o where o.broker_id = j.broker_id and facts.disp_class(o.disposition_code) = 'nofit' and (o.marked_at at time zone 'Africa/Johannesburg')::date between j.d0 and j.d1) as not_a_fit
from j;

-- Section 2. Margin vs 3.5 per active cycle (projected, to date, and at the stress cost per lead).
create or replace view facts.v_w14_lv_margin as
select c.cycle_id, c.broker_id, c.tier_code, c.price_zar, m.committed, m.delivered_net, m.replacement_cap,
       (select count(*) from facts.fact_lead l where l.cycle_id = c.cycle_id and l.replaced) as replacements_used,
       m.media_incl_vat, m.wa_llm, m.fixed, m.projected_cost, m.margin_to_date, m.margin_projected, m.margin_at_stress,
       (m.margin_at_stress >= (select margin_floor from facts.v_params)) as clears_30_at_stress,
       (c.ends_at - (select as_of from facts.v_params)) as days_left, c.extended_until
from facts.fact_cycle c cross join lateral facts.cycle_margin(c.cycle_id, (select as_of from facts.v_params)) m
where c.status in ('active', 'extended');

-- Section 3. Renewal risk per adviser (same function the watchlist tile uses).
create or replace view facts.v_w14_lv_renewal as select * from facts.renewal_risk_at((select as_of from facts.v_params));

-- Section 4. Cost per attended meeting and per good-fit meeting, per creative (cumulative since each ad launched; n shown, never judged below n = 5).
create or replace view facts.v_w14_lv_creative as
with p as (select * from facts.v_params),
sp as (select ad_id, max(ad_name) as ad_name, max(angle) as angle, sum(spend_zar) as spend, sum(leads_raw) as raw_leads from facts.fact_ad_day group by ad_id),
qv as (select ad_id, count(*) filter (where qualified and verified_at is not null) as qualified from facts.fact_lead group by ad_id),
oc as (select ad_id, count(*) filter (where outcome = 'attended') as attended,
              count(*) filter (where facts.disp_class(disposition_code) = 'fit') as good_fit,
              count(*) filter (where facts.disp_class(disposition_code) in ('fit','nofit')) as dispositions,
              round(avg(quality_score), 2) as quality_index from facts.fact_outcome group by ad_id)
select sp.ad_id, sp.ad_name, sp.angle, sp.spend, sp.raw_leads, coalesce(qv.qualified, 0) as qualified,
       coalesce(oc.attended, 0) as attended, coalesce(oc.good_fit, 0) as good_fit, oc.quality_index,
       round(sp.spend / nullif(sp.raw_leads, 0), 0) as raw_cpl,
       round(sp.spend / nullif(qv.qualified, 0), 0) as cost_per_qualified,
       round(sp.spend / nullif(oc.attended, 0), 0) as cost_per_attended,
       round(sp.spend / nullif(oc.good_fit, 0), 0) as cost_per_good_fit,
       (coalesce(oc.dispositions, 0) >= p.min_dispositions) as enough_data
from sp left join qv using (ad_id) left join oc using (ad_id) cross join p;

-- Section 5. Insight seeds (deterministic; Sonnet words them, never invents a number). Ranked by how far each is from its target.
create or replace view facts.v_w14_lv_insight_seeds as
with p as (select * from facts.v_params),
t as (select tile_no, tile, scope, value, target, status, n, last_period from (
        select * from (select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_2_leads_we_could_reach
                       union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_3_booked_to_attended
                       union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_4_broker_good_fit_rate) z) y
      where scope = 'ALL' and n >= (select min_dispositions from p)),
leak as (select 'funnel_leak' as kind, tile as headline, jsonb_build_object('value', value, 'target', target, 'last_period', last_period, 'n', n) as numbers,
                round((target - value) / nullif(target, 0), 3) as gap, 1 as pri
         from t where value < target order by gap desc limit 1),
best as (select 'best_creative' as kind, ad_name as headline, jsonb_build_object('cost_per_attended', cost_per_attended, 'cost_per_good_fit', cost_per_good_fit, 'attended', attended, 'angle', angle) as numbers, null::numeric as gap, 2 as pri
         from facts.v_w14_lv_creative where attended >= 1 order by cost_per_attended asc nulls last limit 1),
worst as (select 'worst_creative' as kind, ad_name as headline, jsonb_build_object('cost_per_qualified', cost_per_qualified, 'qualified', qualified, 'spend', spend, 'angle', angle) as numbers, null::numeric as gap, 3 as pri
          from facts.v_w14_lv_creative, p where spend >= p.min_ad_spend_zar order by cost_per_qualified desc nulls first limit 1),
mg as (select 'margin' as kind, 'Margin this cycle' as headline, jsonb_build_object('projected', margin_projected, 'at_stress', margin_at_stress, 'floor', (select margin_floor from p)) as numbers, null::numeric as gap, 4 as pri
       from facts.v_w14_lv_margin order by margin_at_stress asc limit 1),
rk as (select 'renewal_risk' as kind, broker_id as headline, jsonb_build_object('level', level, 'reasons', reasons) as numbers, null::numeric as gap, 5 as pri from facts.v_w14_lv_renewal where level in ('amber', 'red'))
select kind, headline, numbers, pri from leak union all select kind, headline, numbers, pri from best union all select kind, headline, numbers, pri from worst
union all select kind, headline, numbers, pri from mg union all select kind, headline, numbers, pri from rk;

-- Section 6. The one recommendation is the highest-priority kill/scale candidate (escalate > pause > scale > capacity), else "no change".
create or replace view facts.v_w14_lv_recommendation_seed as
select rule_id, scope_type, scope_id, scope_name, title, proposed_action, proposed_pct, evidence,
       case when rule_id like 'K2%' then 1 when rule_id like 'K1_PAUSE%' or rule_id like 'K4%' then 2 when rule_id like 'K3%' then 3
            when rule_id like 'K5%' then 4 when rule_id like 'K6%' then 5 else 6 end as priority
from facts.v_kill_scale_candidates order by priority limit 1;

-- The payload W14 stores. All numbers come from the views above; keys are stable (the judge W33 diffs them against the console).
create or replace function facts.w14_lv_payload() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'week_ending', (select as_of from facts.v_params),
    'funnel', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from facts.v_w14_lv_funnel f),
    'margin', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from facts.v_w14_lv_margin m),
    'renewal_risk', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from facts.v_w14_lv_renewal r),
    'creatives', (select coalesce(jsonb_agg(to_jsonb(c) order by c.cost_per_attended nulls last), '[]') from facts.v_w14_lv_creative c),
    'watchlist', (select coalesce(jsonb_agg(jsonb_build_object('tile_no', tile_no, 'tile', tile, 'scope', scope, 'value', value, 'target', target, 'status', status, 'n', n, 'last_period', last_period)), '[]')
                  from (select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_0_cpl_vs_model
                        union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_1_cost_per_good_fit
                        union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_2_leads_we_could_reach
                        union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_3_booked_to_attended
                        union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_4_broker_good_fit_rate
                        union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_5_margin_this_cycle
                        union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_6_capacity_days_left
                        union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_7_renewal_risk) w),
    'insight_seeds', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'headline', headline, 'numbers', numbers) order by pri), '[]') from facts.v_w14_lv_insight_seeds),
    'candidates', (select coalesce(jsonb_agg(jsonb_build_object('rule_id', rule_id, 'scope_id', scope_id, 'action', proposed_action, 'pct', proposed_pct, 'title', title)), '[]') from facts.v_kill_scale_candidates),
    'recommendation_seed', (select to_jsonb(r) from facts.v_w14_lv_recommendation_seed r)
  )
$$;
