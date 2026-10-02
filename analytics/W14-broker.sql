-- analytics/W14-broker.sql — the NUMBERS behind the broker weekly report (4.10a): cycle-to-date counts at a given day, read from the OPERATIONAL
-- tables (public.leads / appointments / outcomes / replacements / lead_pulse), not from facts, because the report needs exact timestamps and
-- the adviser's own leads' first names (portal and email only; WhatsApp never carries a name).
-- The JSON that W14 stores in report_history.report_data (= payload_json) and sends is built in analytics/W14-broker-payload.sql from these counts,
-- in the exact shape broker-success specified in automation/W14-broker.md. This file only supplies counts and the console cross-check.
-- The console's own cycle line is public.v_cycle_progress (smc_02). R01 of the report judge: every figure in the payload equals it.
-- Policies / close rate: public.brokers.close_rate and public.cycles.policies_written_reported. Shown only to that adviser, never in any fee,
-- ranking or Lead Velocity report (FAIS, 3.7). Run these functions as service_role / n8n_app; they are not exposed to brokers.

drop function if exists facts.kv(numeric, numeric, numeric);
drop function if exists facts.cycle_counts(text, date);
drop function if exists facts.broker_pulse(uuid, date, int);

-- Cycle-to-date counts at a given SA day. "delivered" = verified + qualified, replacement leads excluded (= v_cycle_progress.verified).
create or replace function facts.cycle_counts(p_cycle uuid, p_day date)
returns table (verified_gross int, delivered int, replacements_used int, booked int, attended int, no_show int, held int,
               good_fit int, not_a_fit int, rated int, quality_avg numeric, quality_n int, pulse_up int, pulse_n int)
language sql stable as $$
  select
   (select count(*) from public.leads l where l.cycle_id = p_cycle and l.brand_id is not null and l.verified_at is not null and l.qualified_at is not null
       and facts.sa_date(l.verified_at) <= p_day)::int,
   (select count(*) from public.leads l where l.cycle_id = p_cycle and l.brand_id is not null and l.verified_at is not null and l.qualified_at is not null
       and facts.sa_date(l.verified_at) <= p_day
       and not exists (select 1 from public.replacements rp where rp.replacement_lead_id = l.id and rp.status <> 'rejected'))::int,
   (select count(*) from public.replacements r where r.cycle_id = p_cycle and r.status <> 'rejected' and facts.sa_date(r.claimed_at) <= p_day)::int,
   (select count(distinct a.client_id) from public.appointments a where a.cycle_id = p_cycle and a.brand_id is not null
       and a.status in ('booked','confirmed','attended','no_show') and facts.sa_date(coalesce(a.booked_at, a.created_at)) <= p_day)::int,
   (select count(*) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and o.outcome = 'attended' and facts.sa_date(a.appointment_date) <= p_day)::int,
   (select count(*) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and o.outcome = 'no_show' and facts.sa_date(a.appointment_date) <= p_day)::int,
   (select count(*) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and o.outcome in ('attended','no_show') and facts.sa_date(a.appointment_date) <= p_day)::int,
   (select count(*) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and o.disposition_code in ('fit_proceeding','fit_followup') and facts.sa_date(a.appointment_date) <= p_day)::int,
   (select count(*) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and o.disposition_code in ('nofit_budget','nofit_covered','nofit_criteria') and facts.sa_date(a.appointment_date) <= p_day)::int,
   (select count(*) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and o.outcome = 'attended' and o.quality_score is not null and facts.sa_date(a.appointment_date) <= p_day)::int,
   (select round(avg(o.quality_score), 1) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and facts.sa_date(a.appointment_date) <= p_day),
   (select count(o.quality_score) from public.outcomes o join public.appointments a on a.id = o.booking_id
     where o.cycle_id = p_cycle and facts.sa_date(a.appointment_date) <= p_day)::int,
   (select count(*) from public.lead_pulse lp where lp.cycle_id = p_cycle and lp.thumbs = 'up' and lp.answered_at is not null and facts.sa_date(lp.answered_at) <= p_day)::int,
   (select count(*) from public.lead_pulse lp where lp.cycle_id = p_cycle and lp.thumbs is not null and lp.answered_at is not null and facts.sa_date(lp.answered_at) <= p_day)::int
$$;

-- I-43c: the lead pulse AS THE BROKER MAY SEE IT (compliance-qa W35-pulse-visibility.md, residual risk). Per cycle only, never week-on-week.
-- Hidden (shown = false, "Fewer than 5 answers yet") until 5 answers exist. Once shown, the figure is HELD at the last one the broker saw until 5 new
-- answers have arrived (p_prev_n = the answer count behind that figure, read from his last report). Computed on the FIRST shown_n answers (oldest first),
-- so a late answer cannot move a held figure. Example: 7 of 9 shown; a 10th answer arrives: still 7 of 9; the 14th arrives: new figure on 14.
-- So no two figures a broker sees have denominators fewer than 5 apart, and he cannot difference them to one lead's answer.
-- cycle_counts.pulse_up / pulse_n above are the live internal figures (admin / console only) and must NEVER be put in a broker payload.
create or replace function facts.broker_pulse(p_cycle uuid, p_day date, p_prev_n int default null)
returns table (shown boolean, n int, up int)
language sql stable as $$
  with a as (
    select lp.thumbs, row_number() over (order by lp.answered_at, lp.id) as rn
      from public.lead_pulse lp
     where lp.cycle_id = p_cycle and lp.thumbs is not null and lp.answered_at is not null and facts.sa_date(lp.answered_at) <= p_day),
  t as (select count(*)::int as total from a),
  k as (select case when t.total < 5 then null
                    when p_prev_n >= 5 and t.total - p_prev_n < 5 then least(p_prev_n, t.total)
                    else t.total end as m from t)
  select k.m is not null, k.m, case when k.m is not null then (select count(*) from a where a.rn <= k.m and a.thumbs = 'up')::int end from k
$$;
comment on function facts.broker_pulse(uuid, date, int) is 'Broker-facing lead pulse (I-43c): per cycle, held until 5 new answers, null below 5. Never use cycle_counts.pulse_* in a broker surface.';
