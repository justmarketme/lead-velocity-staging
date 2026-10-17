select tile_no, tile, case when scope = 'ALL' then 'ALL' else 'broker' end as scope, value, target, status, n, last_period
from (select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_0_cpl_vs_model
      union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_1_cost_per_good_fit
      union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_2_leads_we_could_reach
      union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_3_booked_to_attended
      union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_4_broker_good_fit_rate
      union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_5_margin_this_cycle
      union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_6_capacity_days_left
      union all select tile_no, tile, scope, value, target, status, n, last_period from facts.v_watchlist_7_renewal_risk) t
where scope = 'ALL' or tile_no = 7 order by tile_no;
select tile_no, 'stretch' as what, stretch_target as value from facts.v_watchlist_1_cost_per_good_fit where scope = 'ALL'
union all select 5, 'margin at stress cost per lead', margin_if_cost_per_lead_hits_stress from facts.v_watchlist_5_margin_this_cycle where scope = 'ALL';
