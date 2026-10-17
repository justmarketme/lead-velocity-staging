-- R6-01 / R6-05 (I-48a): the broker-facing pulse is HELD on the stored {n, up} of his last report.
-- Run after synthetic-seed.sql + W14-broker.sql + W14-broker-payload.sql (run-all.sh FIXTURE database). One transaction, rolls back. Synthetic data only.
-- Prints one line per check, "ok" or "FAIL"; any FAIL raises. Not run against a database when written (stub down): chain validation runs it.
\set b '00000000-0000-4000-8000-0000000b0002'
\set c '00000000-0000-4000-8000-0000000c0002'
\set ON_ERROR_STOP on
begin;
select set_config('smc.source', 'test', true), set_config('smc.reason', 'pulse-hold R6-01 R6-05', true);
create temp table chk (name text, ok boolean);
delete from public.lead_pulse where cycle_id = :'c';
-- 14 answers, oldest first: the first 9 are 7 up + 2 down (7 of 9); #10 down; #11-#14 up
create temp table lp as
  select l.id as lead_id, row_number() over (order by l.id) as n from public.leads l where l.cycle_id = :'c' and l.broker_id = :'b' limit 14;
insert into public.lead_pulse (lead_id, broker_id, cycle_id, brand_id, thumbs, answered_at)
  select lp.lead_id, :'b', :'c', (select id from public.brands where code = 'SMC'),
         case when lp.n in (8, 9, 10) then 'down' else 'up' end, now() - interval '10 days' + lp.n * interval '1 hour' from lp where lp.n <= 9;

-- pure function checks (p_prev_n, p_prev_up = the stored figure of the last report)
insert into chk select 'first figure at 9 answers = 7 of 9', (select (shown, n, up) = (true, 9, 7) from facts.broker_pulse(:'c', current_date, null, null));
insert into public.lead_pulse (lead_id, broker_id, cycle_id, brand_id, thumbs, answered_at)
  select lp.lead_id, :'b', :'c', (select id from public.brands where code = 'SMC'), 'down', now() - interval '9 days' from lp where lp.n = 10;
insert into chk select '10 answers, stored 9/7: still 7 of 9 (R6-01)', (select (shown, n, up) = (true, 9, 7) from facts.broker_pulse(:'c', current_date, 9, 7));

-- R6-05: erase one answered row (W34); 9 rows left, stored figure 9/7 must stand, for every erased position
delete from public.lead_pulse where lead_id = (select lead_id from public.lead_pulse where cycle_id = :'c' and thumbs = 'up' order by answered_at limit 1);
insert into chk select 'erase one up row (8 left): still stored 7 of 9 (R6-05)', (select (shown, n, up) = (true, 9, 7) from facts.broker_pulse(:'c', current_date, 9, 7));
delete from public.lead_pulse where lead_id = (select lead_id from public.lead_pulse where cycle_id = :'c' and thumbs = 'down' order by answered_at limit 1);
insert into chk select 'erase an up and a down (8 rows left): still 7 of 9', (select (shown, n, up) = (true, 9, 7) from facts.broker_pulse(:'c', current_date, 9, 7));
insert into chk select 'stored figure stands with under 5 rows left', (select (shown, n, up) = (true, 9, 7) from facts.broker_pulse(:'c', current_date - 20, 9, 7));
insert into chk select 'nothing stored and under 5 rows: hidden', (select not shown and n is null from facts.broker_pulse(:'c', current_date - 20, null, null));

-- 5 new answers on top of the stored 9 (total >= 14) release the hold and recompute on all current answers
insert into public.lead_pulse (lead_id, broker_id, cycle_id, brand_id, thumbs, answered_at)
  select lp.lead_id, :'b', :'c', (select id from public.brands where code = 'SMC'), 'up', now() - interval '1 hour' + lp.n * interval '1 minute'
    from lp where lp.lead_id not in (select lead_id from public.lead_pulse where cycle_id = :'c') limit 4;
insert into chk select '4 new answers on 8 live rows (12): held', (select (n, up) = (9, 7) from facts.broker_pulse(:'c', current_date, 9, 7));
insert into public.lead_pulse (lead_id, broker_id, cycle_id, brand_id, thumbs, answered_at)
  select l.id, :'b', :'c', (select id from public.brands where code = 'SMC'), 'up', now() from public.leads l
   where l.cycle_id = :'c' and l.broker_id = :'b' and l.id not in (select lead_id from public.lead_pulse where cycle_id = :'c') limit 2;
insert into chk select '14 live rows (5 new on 9): recomputed on all', (select n = (select count(*) from public.lead_pulse where cycle_id = :'c' and thumbs is not null) from facts.broker_pulse(:'c', current_date, 9, 7));

-- R6-01 through facts.w14_broker_report: weekly (Monday) stored 7 of 9, midcycle two days later with 10 answers shows the same
delete from public.lead_pulse where cycle_id = :'c';
insert into public.lead_pulse (lead_id, broker_id, cycle_id, brand_id, thumbs, answered_at)
  select lp.lead_id, :'b', :'c', (select id from public.brands where code = 'SMC'), case when lp.n in (8, 9, 10) then 'down' else 'up' end, now() - interval '10 days' + lp.n * interval '1 hour'
    from lp where lp.n <= 10;
delete from public.report_history where broker_id = :'b' and cycle_id = :'c';
insert into public.report_history (status, brand_id, broker_id, cycle_id, week, report_kind, sent_wa_at, report_data)
  values ('sent', (select id from public.brands where code = 'SMC'), :'b', :'c', current_date - 2, 'broker_weekly', now() - interval '2 days',
          jsonb_build_object('s4_quality', jsonb_build_object('lead_pulse', jsonb_build_object('shown', true, 'n', 9, 'up', 7))));
insert into chk select 'w14_broker_report two days after a weekly: same held 7 of 9 (R6-01)',
  (select (p #>> '{s4_quality,lead_pulse,n}', p #>> '{s4_quality,lead_pulse,up}') = ('9', '7') from (select facts.w14_broker_report(:'b', current_date, 'midcycle') as p) x);
-- erase one answered row, report again: still 7 of 9 from the stored row, not 6 of 9 / 7 of 9 recounted
delete from public.lead_pulse where lead_id = (select lead_id from public.lead_pulse where cycle_id = :'c' and thumbs = 'up' order by answered_at limit 1);
insert into chk select 'w14_broker_report after a POPIA erase: still 7 of 9 (R6-05)',
  (select (p #>> '{s4_quality,lead_pulse,n}', p #>> '{s4_quality,lead_pulse,up}') = ('9', '7') from (select facts.w14_broker_report(:'b', current_date, 'cycle_end') as p) x);

select name, case when ok then 'ok' else 'FAIL' end as result from chk;
do $f$ begin if exists (select 1 from chk where ok is not true) then raise exception 'pulse-hold: a check failed'; end if; end $f$;
rollback;
