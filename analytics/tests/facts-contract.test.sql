-- analytics/tests/facts-contract.test.sql — CONTRACT TEST against the REAL schema (supabase/migrations/20261002040000_smc_04_facts.sql and the tables it reads).
-- This file used to be a stand-in DDL; the real facts layer now exists, so it only CHECKS that every column analytics/*.sql reads is there.
-- Run after the smc migrations and before params.sql. Raises an exception listing anything missing. Prints the OPTIONAL objects that were
-- requested from platform-architect (integration I-04 / smc_06) and are not yet present, so nothing is silently assumed.
do $$
declare missing text;
begin
  with need(schema_name, rel, col) as (values
    ('facts','fact_lead','lead_key'),('facts','fact_lead','brand_id'),('facts','fact_lead','broker_id'),('facts','fact_lead','cycle_id'),('facts','fact_lead','created_date'),
    ('facts','fact_lead','created_at'),('facts','fact_lead','origin'),('facts','fact_lead','campaign_id'),('facts','fact_lead','adset_id'),('facts','fact_lead','ad_id'),
    ('facts','fact_lead','concept'),('facts','fact_lead','angle'),('facts','fact_lead','placement'),('facts','fact_lead','consented'),('facts','fact_lead','first_message_seconds'),
    ('facts','fact_lead','verified'),('facts','fact_lead','verified_within_72h'),('facts','fact_lead','qualified'),('facts','fact_lead','disqualified_reason'),('facts','fact_lead','booked'),
    ('facts','fact_lead','attended'),('facts','fact_lead','no_show'),('facts','fact_lead','disposition_code'),('facts','fact_lead','good_fit'),('facts','fact_lead','quality_score'),
    ('facts','fact_lead','lead_pulse'),('facts','fact_lead','is_replacement_lead'),('facts','fact_lead','replacement_claimed'),('facts','fact_lead','is_synthetic'),
    ('facts','fact_booking','booking_id'),('facts','fact_booking','lead_key'),('facts','fact_booking','broker_id'),('facts','fact_booking','cycle_id'),('facts','fact_booking','slot_date'),
    ('facts','fact_booking','starts_at'),('facts','fact_booking','ends_at'),('facts','fact_booking','status'),('facts','fact_booking','method'),('facts','fact_booking','booked_date'),('facts','fact_booking','is_reschedule'),
    ('facts','fact_outcome','outcome_id'),('facts','fact_outcome','booking_id'),('facts','fact_outcome','lead_key'),('facts','fact_outcome','broker_id'),('facts','fact_outcome','cycle_id'),
    ('facts','fact_outcome','slot_date'),('facts','fact_outcome','outcome'),('facts','fact_outcome','disposition_code'),('facts','fact_outcome','good_fit'),('facts','fact_outcome','quality_score'),
    ('facts','fact_outcome','lead_reach_check'),('facts','fact_outcome','auto_marked'),('facts','fact_outcome','unconfirmed'),
    ('facts','fact_ad_day','date'),('facts','fact_ad_day','brand_id'),('facts','fact_ad_day','ad_id'),('facts','fact_ad_day','campaign_id'),('facts','fact_ad_day','angle'),
    ('facts','fact_ad_day','spend_zar'),('facts','fact_ad_day','impressions'),('facts','fact_ad_day','leads_meta'),('facts','fact_ad_day','frequency'),('facts','fact_ad_day','hook_rate'),
    ('facts','fact_ad_day','emq'),('facts','fact_ad_day','leads'),('facts','fact_ad_day','qualified'),('facts','fact_ad_day','good_fit'),
    ('facts','fact_broker_day','broker_id'),('facts','fact_broker_day','date'),('facts','fact_broker_day','cycle_id'),('facts','fact_broker_day','capacity_slots'),
    ('facts','fact_broker_day','bookings_made'),('facts','fact_broker_day','meetings_scheduled'),('facts','fact_broker_day','meetings_held'),('facts','fact_broker_day','outcomes_unmarked'),('facts','fact_broker_day','report_opened'),
    ('facts','fact_cycle','cycle_id'),('facts','fact_cycle','broker_id'),('facts','fact_cycle','brand_id'),('facts','fact_cycle','tier_code'),('facts','fact_cycle','cycle_no'),('facts','fact_cycle','status'),
    ('facts','fact_cycle','starts_at'),('facts','fact_cycle','ends_at'),('facts','fact_cycle','extended_until'),('facts','fact_cycle','price_zar'),('facts','fact_cycle','committed_leads'),
    ('facts','fact_cycle','replacement_cap'),('facts','fact_cycle','delivered'),('facts','fact_cycle','replacements_used'),('facts','fact_cycle','margin_pct'),
    ('facts','fact_cost','date'),('facts','fact_cost','kind'),('facts','fact_cost','brand_id'),('facts','fact_cost','broker_id'),('facts','fact_cost','amount_zar'),
    ('facts','fact_message','message_id'),('facts','fact_message','lead_key'),('facts','fact_message','date'),('facts','fact_message','channel'),('facts','fact_message','direction'),
    ('facts','fact_message','template_name'),('facts','fact_message','llm_model'),('facts','fact_message','latency_ms'),('facts','fact_message','guardrail_trip'),('facts','fact_message','cost_zar'),
    ('facts','fact_comment','comment_row_id'),('facts','fact_comment','ad_id'),('facts','fact_comment','date'),('facts','fact_comment','sla_seconds'),('facts','fact_comment','origin_lead_key'),
    ('public','ad_metrics','ad_name'),('public','cycles','shortfall_credit_zar'),('public','cycles','policies_written_reported'),('public','brokers','close_rate'),('public','brokers','contact_person'),
    ('public','report_history','report_kind'),('public','report_history','week'),('public','report_history','opened_portal_at'),('public','report_history','opened_wa_at'),('public','report_history','ask'),
    ('public','insights','text'),('public','insights','n'),('public','broker_media','approved_at'),('public','broker_media','is_current'),
    ('public','v_cycle_progress','verified'),('public','v_cycle_progress','replacements_used'),('public','v_cycle_progress','good_fit'),
    ('facts','v_watchlist','metric_code'),('facts','v_watchlist','value'))
  select string_agg(n.schema_name || '.' || n.rel || '.' || n.col, ', ') into missing
    from need n left join information_schema.columns c on c.table_schema = n.schema_name and c.table_name = n.rel and c.column_name = n.col
   where c.column_name is null;
  if missing is not null then raise exception 'facts contract broken, missing: %', missing; end if;
  raise notice 'facts contract OK: every column analytics/*.sql reads exists';
end $$;

-- Requested in integration I-04 (smc_06) and read by optional metrics only. Listed so a missing one is visible, never assumed.
select o.what, case when exists (select 1 from information_schema.columns c where c.table_schema = o.s and c.table_name = o.t and (o.c is null or c.column_name = o.c)) then 'present' else 'MISSING (needs smc_06)' end as status, o.used_by
from (values ('facts.fact_system_day', 'facts', 'fact_system_day', null, 'M21 uptime, M22 webhook p95'),
             ('facts.fact_lead_theme', 'facts', 'fact_lead_theme', null, 'Ask the data: themes (W14 uses public.insights instead)'),
             ('facts.fact_broker_roi', 'facts', 'fact_broker_roi', null, 'M39 (W14 reads public.brokers.close_rate / public.cycles instead)'),
             ('facts.fact_page_day', 'facts', 'fact_page_day', null, 'M30 landing-page sign-up rate'),
             ('facts.fact_cycle.renewed', 'facts', 'fact_cycle', 'renewed', 'M35 cycles renewed'),
             ('facts.fact_ad_day.status', 'facts', 'fact_ad_day', 'status', 'kill rules (derived from spend until ad_objects lands)'),
             ('public.brokers.media_share_pct', 'public', 'brokers', 'media_share_pct', 'K6 trim state (false until it exists)')) o(what, s, t, c, used_by);
