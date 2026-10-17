-- Branch coverage for kill-scale.sql / watchlist / W14 hold, written against the REAL operational tables (public.outcomes / leads / appointments /
-- ad_metrics / report_history) and read back through facts.* (pass 3, I-18). Run after synthetic-seed.sql in a database with
-- `smc.include_synthetic = 'on'` (run-all.sh sets it). Each block is one transaction and rolls back. Dates are relative to today (the seed shifts to today).
-- Synthetic data only. The seed adviser is 00000000-0000-4000-8000-0000000b0002, cycle ...0c0002; ad ids A1..A5.
\set b '00000000-0000-4000-8000-0000000b0002'
\set c '00000000-0000-4000-8000-0000000c0002'

\echo === S1: K4 pause (A3: 5 dispositions, 3 not-a-fit, low quality) and K5 scale (A1: 5 dispositions, quality >= 4, cheap)
begin;
select set_config('smc.source', 'test', true), set_config('smc.reason', 'scenario S1', true);
create temp table pick as
  select l.id as lead_id, l.ad_id, row_number() over (partition by l.ad_id order by l.id) as n from public.leads l where l.broker_id = :'b' and l.ad_id in ('A1','A3');
delete from pick where n > 5;
create temp table appt as
  select gen_random_uuid() as id, p.* , now() - interval '2 days' + p.n * interval '1 hour' + (p.ad_id = 'A3')::int * interval '10 minutes' as at from pick p;
insert into public.appointments (id, broker_id, client_id, appointment_date, ends_at, status, method, brand_id, cycle_id, booked_via, booked_at)
  select a.id, :'b', a.lead_id, a.at, a.at + interval '30 minutes', 'attended', 'phone', (select id from public.brands where code = 'SMC'), :'c', 'chat', a.at - interval '2 days' from appt a;
insert into public.outcomes (booking_id, lead_id, broker_id, cycle_id, brand_id, outcome, disposition_code, quality_score, marked_via, marked_at)
  select a.id, a.lead_id, :'b', :'c', (select id from public.brands where code = 'SMC'), 'attended',
         (case when a.ad_id = 'A3' then (array['fit_proceeding','nofit_budget','nofit_covered','nofit_budget','fit_followup'])[a.n]
               else (array['fit_proceeding','fit_proceeding','fit_followup','fit_proceeding','fit_proceeding'])[a.n] end)::public.smc_disposition_code,
         (case when a.ad_id = 'A3' then (array[3,1,2,1,3])[a.n] else (array[4,5,4,5,4])[a.n] end), 'whatsapp', now() from appt a;
select * from facts.v_ks_ad_quality;
select rule_id, scope_id, proposed_action, proposed_pct, evidence ->> 'quality_index' as qi, evidence ->> 'nofit_rate' as nofit
  from facts.v_kill_scale_candidates where rule_id in ('K4_PAUSE_LOW_QUALITY','K5_SCALE_PLUS_20') order by 1, 2;
rollback;

\echo === S2: K3 show rate under 50% (8+ matured meetings), K6 trim at >= 80% booked, restore
begin;
select set_config('smc.source', 'test', true), set_config('smc.reason', 'scenario S2', true);
update public.outcomes set outcome = 'no_show' where id in (select id from public.outcomes where outcome = 'attended' and cycle_id = :'c' order by id limit 3);
select rule_id, scope_id, evidence from facts.v_kill_scale_candidates where rule_id = 'K3_REVIEW_SHOW_RATE';
-- fill every open slot in the next 7 days (capacity is brokers.max_meetings_per_day on the days in brokers.meeting_hours)
create temp table fill as
  select gen_random_uuid() as id, cd.day, g, (select id from public.leads where broker_id = :'b' order by id limit 1 offset (g - 1)) as lead_id
    from facts.v_capacity_day cd cross join lateral generate_series(1, cd.capacity_slots - cd.meetings_scheduled) g
   where cd.broker_id = :'b' and cd.day between facts.as_of() + 1 and facts.as_of() + 7;
insert into public.appointments (id, broker_id, client_id, appointment_date, ends_at, status, method, brand_id, cycle_id, booked_via, booked_at)
  select f.id, :'b', f.lead_id, f.day::timestamp at time zone 'Africa/Johannesburg' + interval '12 hours 13 minutes' + f.g * interval '1 hour', f.day::timestamp at time zone 'Africa/Johannesburg' + interval '12 hours 33 minutes' + f.g * interval '1 hour',
         'booked', 'phone', (select id from public.brands where code = 'SMC'), :'c', 'chat', now() from fill f;
select rule_id, scope_id, proposed_action, proposed_pct from facts.v_kill_scale_candidates where rule_id like 'K6%';
select 'K5 blocked while the 7-day calendar is full' as note, count(*) as k5_rows from facts.v_kill_scale_candidates where rule_id = 'K5_SCALE_PLUS_20';
-- trimmed (brokers.media_share_pct, I-22, added inside this rolled-back block if the column is not there yet) and the calendar back to half full -> restore
alter table public.brokers add column if not exists media_share_pct numeric;
update public.brokers set media_share_pct = 70 where id = :'b';
update public.appointments set status = 'cancelled' where id in (select id from fill where g > 1);
select rule_id, proposed_action from facts.v_kill_scale_candidates where rule_id like 'K6%';
rollback;

\echo === S3: K2 escalate (qualified cost over R400 after 14 days)
begin;
select set_config('smc.source', 'test', true), set_config('smc.reason', 'scenario S3', true);
update public.leads set qualified_at = null where id in (select id from public.leads where broker_id = :'b' and qualified_at is not null order by id limit 5);
select rule_id, scope_id, evidence from facts.v_kill_scale_candidates where rule_id = 'K2_ESCALATE_QUALIFIED_CPL';
rollback;

\echo === S4: below the spend gate nothing fires; Binet gate view says why
begin;
select set_config('smc.source', 'test', true), set_config('smc.reason', 'scenario S4', true);
update public.ad_metrics set spend_zar = spend_zar / 4;
select count(*) as candidates_when_spend_is_a_quarter from facts.v_kill_scale_candidates where rule_id like 'K1%' or rule_id like 'K2%';
select campaign_id, gate, value, needed, open from facts.v_kill_scale_gates where gate = 'K1 spend gate';
rollback;

\echo === S5: renewal risk goes red (poor show rate, few marked, 6 to-dos, report unopened twice, low quality)
begin;
select set_config('smc.source', 'test', true), set_config('smc.reason', 'scenario S5', true);
update public.outcomes set outcome = 'no_show' where id in (select id from public.outcomes where outcome = 'attended' and cycle_id = :'c' order by id limit 3);
update public.outcomes set auto_marked = true, unconfirmed = true where id in (select id from public.outcomes where cycle_id = :'c' and outcome = 'attended' order by id limit 4);
update public.outcomes set quality_score = 2 where quality_score is not null;
update public.outcomes set unconfirmed = true where id in (select id from public.outcomes where cycle_id = :'c' order by id limit 6);   -- 6 open to-dos
update public.report_history set opened_portal_at = null, opened_wa_at = null where broker_id = :'b';
insert into public.report_history (status, brand_id, broker_id, cycle_id, week, report_kind, sent_wa_at)
  select 'sent', (select id from public.brands where code = 'SMC'), :'b', :'c', facts.as_of() - 14 + n, 'broker_weekly', now() - n * interval '7 days' from generate_series(1, 2) n;
select broker_id, score, level, reasons from facts.renewal_risk_at(facts.as_of());
rollback;

\echo === S6: W14 broker report is HELD when a number does not tie to the console
select check_name, report_value, console_value, ok from facts.w14_reconcile(:'b', jsonb_set(facts.w14_broker_report(:'b'), '{s2_progress,delivered,v}', '99')) where not ok;
select 'contains spend word -> hold' as note, ok from facts.w14_reconcile(:'b', jsonb_set(facts.w14_broker_report(:'b'), '{s1_one_line}', '"We spent R4,900 on ads this week"')) where check_name = 'no_cost_or_jargon_in_payload';
select 'close rate set (0.30, a fraction) -> ROI shown' as note, facts.w14_broker_report(:'b') #>> '{s6_roi,close_rate}' as close_rate, facts.w14_broker_report(:'b') #>> '{s6_roi,tracking_to}' as tracking_to;
