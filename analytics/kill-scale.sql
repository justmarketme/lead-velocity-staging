-- analytics/kill-scale.sql — the 3.4 kill / scale rules as READ-ONLY candidate actions.
-- This file never pauses, scales or edits anything. Every row is a candidate for the optimisation-advisor, who writes it to ops.proposals
-- (source = 'kill_rule') for Approve / Snooze / Decline; ads-api-engineer applies approved changes with confirm-to-apply (6.2).
-- Reads the real facts layer (smc_04): fact_ad_day, fact_lead, fact_outcome, v_capacity_day (watchlist.sql, over fact_booking + brokers) + facts.v_params (params.sql).
-- Ad name comes from public.ad_metrics (no personal data). Ad status is DERIVED (active = spent in the last 2 days) until ads-api-engineer's ad_objects
-- table (integration I-04) lands; then point `ad.status` at it.
-- Window: the last verdict_days (14) ending verify_lag_days (3) before today, so "qualified" (which needs a 72 h reply) is read on leads old enough to have been verified.
-- Evidence discipline (Binet & Field / 3.4): no rule fires before its spend gate or sample minimum; the gates view shows why a rule has not fired.

create or replace view facts.v_ks_ad_window as
with p as (select * from facts.v_params),
w as (select p.as_of - p.verify_lag_days as w_end, p.as_of - p.verify_lag_days - (p.verdict_days - 1) as w_start from p),
nm as (select ad_id, max(ad_name) as ad_name from public.ad_metrics group by ad_id),
ad as (
  select a.campaign_id, a.ad_id, coalesce(max(nm.ad_name), a.ad_id) as ad_name, max(a.angle) as angle,
         (select case when max(x.date) filter (where x.spend_zar > 0) >= (select as_of from p) - 1 then 'active' else 'paused' end from facts.fact_ad_day x where x.ad_id = a.ad_id) as status,   -- all days, not just the verdict window (pass 3 fix: the window ends verify_lag_days ago so every ad read 'paused')
         sum(a.spend_zar) as spend, sum(a.leads_meta) as raw_leads
  from facts.fact_ad_day a join w on a.date between w.w_start and w.w_end
  left join nm on nm.ad_id = a.ad_id
  group by a.campaign_id, a.ad_id),
q as (
  select l.ad_id, count(*) filter (where l.qualified and l.verified) as qualified
  from facts.fact_lead l, w
  where l.created_date between w.w_start and w.w_end group by l.ad_id)
select ad.campaign_id, ad.ad_id, ad.ad_name, ad.angle, ad.status, ad.spend, ad.raw_leads, coalesce(q.qualified, 0) as qualified,
       round(ad.spend / nullif(ad.raw_leads, 0), 0) as raw_cpl,
       round(ad.spend / nullif(q.qualified, 0), 0) as cost_per_qualified,
       round(coalesce(q.qualified, 0)::numeric / nullif(ad.raw_leads, 0), 3) as qualify_rate
from ad left join q using (ad_id);

create or replace view facts.v_ks_campaign_window as
select c.campaign_id, sum(spend) as spend, sum(raw_leads) as raw_leads, sum(qualified) as qualified,
       round(sum(spend) / nullif(sum(raw_leads), 0), 0) as raw_cpl,
       round(sum(spend) / nullif(sum(qualified), 0), 0) as cost_per_qualified,
       round(sum(qualified)::numeric / nullif(sum(raw_leads), 0), 3) as qualify_rate,
       (select (select as_of from facts.v_params) - min(a.date) + 1 from facts.fact_ad_day a where a.campaign_id = c.campaign_id) as campaign_days
from facts.v_ks_ad_window c group by c.campaign_id;

create or replace view facts.v_ks_ad_quality as   -- cumulative (not windowed): "once n >= 5 dispositions" (3.4, 4.12a)
select l.ad_id, max(l.angle) as angle,
       count(*) filter (where facts.disp_class(o.disposition_code) in ('fit', 'nofit')) as n_dispositions,
       count(*) filter (where facts.disp_class(o.disposition_code) = 'nofit') as n_nofit,
       count(o.quality_score) as n_scores,
       round(avg(o.quality_score), 2) as quality_index,
       round(count(*) filter (where facts.disp_class(o.disposition_code) = 'nofit')::numeric
             / nullif(count(*) filter (where facts.disp_class(o.disposition_code) in ('fit', 'nofit')), 0), 3) as nofit_rate
from facts.fact_outcome o join facts.fact_lead l on l.lead_key = o.lead_key
where l.ad_id is not null
group by l.ad_id;

create or replace view facts.v_ks_capacity as
select b.broker_id::text as broker_id, b.slots_booked_7d, b.slots_total_7d, b.media_trimmed,
       round(b.slots_booked_7d::numeric / nullif(b.slots_total_7d, 0), 3) as fill_7d,
       (select bool_and(z.slots_booked_7d >= z.slots_total_7d and z.slots_total_7d > 0) and count(*) = 5
          from (select * from facts.v_capacity_day y where y.broker_id = b.broker_id and y.day <= p.as_of order by y.day desc limit 5) z) as full_five_days
from facts.v_capacity_day b cross join facts.v_params p
where b.day = p.as_of;

create or replace view facts.v_kill_scale_candidates as
with p as (select * from facts.v_params),
cap as (select * from facts.v_ks_capacity),
-- K1 (3.4): after R3,000 spend, raw CPL > R250 or qualify rate < 60% -> pause the bottom 50% of creatives
k1c as (
  select c.* from facts.v_ks_campaign_window c, p
  where c.spend >= p.spend_gate_zar and (c.raw_cpl > p.raw_cpl_max_zar or c.qualify_rate < p.qualify_min)),
k1a as (
  select a.*, row_number() over (partition by a.campaign_id order by a.cost_per_qualified desc nulls first, a.spend desc) as worst_rank,
         count(*) over (partition by a.campaign_id) as rankable
  from facts.v_ks_ad_window a join k1c using (campaign_id), p
  where a.status = 'active' and a.spend >= p.min_ad_spend_zar),
r_k1 as (
  select 'K1_PAUSE_BOTTOM_HALF' as rule_id, '3.4 bullet 1' as rule_cite, 'ad' as scope_type, a.ad_id as scope_id, a.ad_name as scope_name,
         jsonb_build_object('campaign_spend', c.spend, 'campaign_raw_cpl', c.raw_cpl, 'campaign_qualify_rate', c.qualify_rate,
                            'ad_spend', a.spend, 'ad_raw_leads', a.raw_leads, 'ad_qualified', a.qualified, 'ad_cost_per_qualified', a.cost_per_qualified,
                            'worst_rank', a.worst_rank, 'of', a.rankable) as evidence,
         'pause_ad' as proposed_action, null::numeric as proposed_pct, a.qualified::int as n, 'media' as faculty,
         'Pause ' || a.ad_name || ' (bottom half on cost per qualified lead)' as title, 'cost_per_qualified_lead' as metric
  from k1a a join k1c c using (campaign_id) where a.worst_rank <= floor(a.rankable / 2.0)
  union all
  select 'K1_TIGHTEN_QUESTIONS', '3.4 bullet 1', 'campaign', c.campaign_id, c.campaign_id,
         jsonb_build_object('spend', c.spend, 'raw_cpl', c.raw_cpl, 'qualify_rate', c.qualify_rate), 'tighten_qualifying_questions', null, c.raw_leads::int, 'page_flow',
         'Tighten the qualifying questions on ' || c.campaign_id, 'qualify_rate' from k1c c
  union all
  select 'K1_NEW_CONCEPT_BATCH', '3.4 bullet 1', 'campaign', c.campaign_id, c.campaign_id,
         jsonb_build_object('spend', c.spend, 'raw_cpl', c.raw_cpl, 'qualify_rate', c.qualify_rate), 'launch_new_concept_batch', null, c.raw_leads::int, 'media',
         'Launch a new concept batch for ' || c.campaign_id, 'raw_cpl' from k1c c),
-- K2 (3.4): after 14 days, cost per QUALIFIED lead > R400 -> stop and escalate to Jonathan
r_k2 as (
  select 'K2_ESCALATE_QUALIFIED_CPL', '3.4 bullet 2', 'campaign', c.campaign_id, c.campaign_id,
         jsonb_build_object('campaign_days', c.campaign_days, 'spend', c.spend, 'qualified', c.qualified, 'cost_per_qualified', c.cost_per_qualified),
         'stop_spend_and_escalate_to_jonathan', null::numeric, c.qualified::int, 'media',
         'Cost per qualified lead is above the limit on ' || c.campaign_id || ': stop and decide', 'cost_per_qualified_lead'
  from facts.v_ks_campaign_window c, p
  where c.campaign_days >= p.verdict_days and c.spend >= p.spend_gate_zar
    and (c.qualified = 0 or c.spend / c.qualified > p.qualified_cpl_max_zar)),
-- K3 (3.4): show rate < 50% over 14 days -> review reminder sequence and qualification (per adviser and overall)
k3 as (
  select s.scope, s.den, s.num, round(s.num::numeric / s.den, 3) as show_rate from (
    select coalesce(broker_id::text, 'ALL') as scope, count(*) filter (where outcome in ('attended','no_show')) as den, count(*) filter (where outcome = 'attended') as num
    from facts.fact_outcome o, p where o.slot_date between p.as_of - (p.verdict_days - 1) and p.as_of
    group by grouping sets ((broker_id), ())) s),
r_k3 as (
  select 'K3_REVIEW_SHOW_RATE', '3.4 bullet 3', 'broker', k3.scope, k3.scope,
         jsonb_build_object('show_rate', k3.show_rate, 'attended', k3.num, 'held', k3.den), 'review_reminder_sequence_and_qualification', null::numeric, k3.den::int, 'nurture_show',
         'Show rate is under 50% for 14 days (' || k3.scope || '): review reminders and who we qualify', 'booked_to_attended'
  from k3, p where k3.den >= p.min_booked_for_show_rule and k3.show_rate < p.show_floor),
-- K4 (3.4 / 4.12a): n >= 5 dispositions and (quality index < 2.5 or not-a-fit > 40%) -> pause that ad regardless of CPL
r_k4 as (
  select 'K4_PAUSE_LOW_QUALITY', '3.4 bullet 4', 'ad', q.ad_id, coalesce(w.ad_name, q.ad_id),
         jsonb_build_object('n_dispositions', q.n_dispositions, 'quality_index', q.quality_index, 'nofit_rate', q.nofit_rate, 'angle', q.angle),
         'pause_ad', null::numeric, q.n_dispositions::int, 'broker',
         'Pause ' || coalesce(w.ad_name, q.ad_id) || ': the adviser rates its leads low', 'quality_index'
  from facts.v_ks_ad_quality q left join facts.v_ks_ad_window w using (ad_id), p
  where q.n_dispositions >= p.min_dispositions and (q.quality_index < p.quality_floor or q.nofit_rate > p.nofit_max)
    and coalesce(w.status, 'active') = 'active'),
-- K5 (3.4): quality index >= 4 (n >= 5) and CPL within threshold -> +20% budget. Not while any adviser's ad share is trimmed for capacity.
r_k5 as (
  select 'K5_SCALE_PLUS_20', '3.4 bullet 4', 'ad', q.ad_id, w.ad_name,
         jsonb_build_object('quality_index', q.quality_index, 'n_dispositions', q.n_dispositions, 'raw_cpl', w.raw_cpl, 'cost_per_qualified', w.cost_per_qualified, 'ad_spend', w.spend),
         'increase_budget', (p.scale_step * 100)::numeric, q.n_dispositions::int, 'media',
         'Add 20% budget to ' || w.ad_name || ': good-fit leads at a fair cost', 'cost_per_good_fit_meeting'
  from facts.v_ks_ad_quality q join facts.v_ks_ad_window w using (ad_id), p
  where q.n_dispositions >= p.min_dispositions and q.quality_index >= p.quality_scale_min
    and w.status = 'active' and w.spend >= p.min_ad_spend_zar and w.raw_cpl <= p.raw_cpl_max_zar and w.cost_per_qualified <= p.qualified_cpl_max_zar
    and not exists (select 1 from cap where cap.fill_7d >= p.capacity_trim_at or cap.media_trimmed)),
-- K6 (line 758): next 7 days >= 80% booked -> trim that adviser's media share 30%; restore below 60%; full for 5 working days -> upsell / add adviser
r_k6 as (
  select 'K6_TRIM_MEDIA_SHARE', 'line 758', 'broker', cap.broker_id, cap.broker_id,
         jsonb_build_object('fill_7d', cap.fill_7d, 'booked', cap.slots_booked_7d, 'slots', cap.slots_total_7d), 'trim_media_share', (p.trim_share * 100)::numeric, cap.slots_total_7d, 'broker',
         'Trim ad share for ' || cap.broker_id || ' by 30%: next week is nearly full', 'days_of_capacity_left'
  from cap, p where cap.fill_7d >= p.capacity_trim_at and not coalesce(cap.media_trimmed, false)
  union all
  select 'K6_RESTORE_MEDIA_SHARE', 'line 758', 'broker', cap.broker_id, cap.broker_id,
         jsonb_build_object('fill_7d', cap.fill_7d), 'restore_media_share', (p.trim_share * 100)::numeric, cap.slots_total_7d, 'broker',
         'Restore ad share for ' || cap.broker_id || ': capacity is back under 60%', 'days_of_capacity_left'
  from cap, p where cap.media_trimmed and cap.fill_7d < p.capacity_restore_at
  union all
  select 'K6_UPSELL_OR_ADD_ADVISER', 'line 758', 'broker', cap.broker_id, cap.broker_id,
         jsonb_build_object('fill_7d', cap.fill_7d, 'days_full', 5), 'offer_bigger_tier_or_add_adviser', null, cap.slots_total_7d, 'billing',
         'Calendar full for 5 working days (' || cap.broker_id || '): offer a bigger plan or add an adviser', 'days_of_capacity_left'
  from cap where cap.full_five_days)
select * from r_k1 union all select * from r_k2 union all select * from r_k3 union all select * from r_k4 union all select * from r_k5 union all select * from r_k6;

-- Why has a rule not fired? One row per rule gate, so "nothing to do" is explainable (Binet: say "too early", do not guess).
create or replace view facts.v_kill_scale_gates as
select c.campaign_id, 'K1 spend gate' as gate, c.spend as value, p.spend_gate_zar as needed, c.spend >= p.spend_gate_zar as open from facts.v_ks_campaign_window c, facts.v_params p
union all select c.campaign_id, 'K2 campaign days', c.campaign_days, p.verdict_days, c.campaign_days >= p.verdict_days from facts.v_ks_campaign_window c, facts.v_params p
union all select c.campaign_id, 'K2 qualified cost vs limit (open = over limit)', c.cost_per_qualified, p.qualified_cpl_max_zar, c.cost_per_qualified > p.qualified_cpl_max_zar from facts.v_ks_campaign_window c, facts.v_params p
union all select c.campaign_id, 'K1 raw cost vs limit (open = over limit)', c.raw_cpl, p.raw_cpl_max_zar, c.raw_cpl > p.raw_cpl_max_zar from facts.v_ks_campaign_window c, facts.v_params p
union all select c.campaign_id, 'K1 qualify rate vs floor (open = under floor)', c.qualify_rate, p.qualify_min, c.qualify_rate < p.qualify_min from facts.v_ks_campaign_window c, facts.v_params p
union all select q.ad_id, 'K4/K5 dispositions', q.n_dispositions, p.min_dispositions, q.n_dispositions >= p.min_dispositions from facts.v_ks_ad_quality q, facts.v_params p;
