# I-43c migration note for platform-architect

Rule (compliance-qa W35-pulse-visibility.md, residual risk): the broker never sees a week-on-week pulse change and never a figure whose answer count moved by fewer than 5 since the last figure he was sent. Per cycle only; hidden under 5 answers; held until 5 new answers. Admin / console figures (`facts.cycle_counts.pulse_up / pulse_n`, `fact_lead.lead_pulse_thumbs`) are unchanged and must never reach a broker payload.

Where to change (migrations are not edited by analytics-reporter):

1. `supabase/migrations/20261002_smc_10_pass4.sql` is where `facts.cycle_counts` lives (the broker-facing pulse is not in it, nothing to change there). Add the function below to the same file or to the next migration, right after `facts.cycle_counts`, with `ALTER FUNCTION facts.broker_pulse(uuid, date, int) SECURITY DEFINER SET search_path = public, facts, pg_temp;` and the same revoke / grant pattern as the other `facts.w14_*` helpers (service_role / n8n_app only).
2. `supabase/migrations/20261002_smc_12_pass6.sql` carries `facts.w14_broker_report` "verbatim @ 76f3f7d". Replace that body with `analytics/W14-broker-payload.sql` as it now stands. The exact diff against the current body is three edits:
   - declare: `d date; tier text; n record; w record;` becomes `d date; tier text; n record; w record; pu record;`
   - after `select * into w from facts.cycle_counts(c.id, d - 7);` add the `select * into pu from facts.broker_pulse(c.id, d, (select ... report_history ...));` statement (copy it from the file, 4 lines).
   - in `'s4_quality'` add `'lead_pulse', case when pu.shown then jsonb_build_object('shown', true, 'n', pu.n, 'up', pu.up, 'text', format(...)) else jsonb_build_object('shown', false, 'n', null, 'up', null, 'text', 'Fewer than 5 answers yet.') end` after `'themes', themes`.

Exact function (copy of analytics/W14-broker.sql, last block):

```sql
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
```

Notes:
- `p_prev_n` is read inside `w14_broker_report` from the broker's latest earlier `report_history` row for the same cycle (`status in ('sent','partial','generated')`, `week < d - 3`, `report_data #>> '{s4_quality,lead_pulse,n}'` not null). A held or failed report is therefore never counted as "seen".
- `w14_reconcile` needs no change (banned-word and ROI checks pass on the new text). Optional extra row for the W33 judge: payload `s4_quality.lead_pulse` is either `shown = false` or `n >= 5`, and `last`/`target` keys are absent.
- Not run against a database: the local stub was not reachable, so only a static check was done (every column used exists in smc_03 `lead_pulse` and `report_history`). Run `analytics/tests/run-all.sh` and `analytics/tests/metrics-sql.test.sh` (M31's new block calls `facts.broker_pulse`) once the stub is free.
- Out of this agent's remit: `automation/W14-broker.md` (the payload shape spec, broker-success) and `automation/tests/W14.test.mjs` should add `lead_pulse` to the `s4_quality` key list; `src/pages/portal/Reports.tsx` and `smc-types.ts` already read it as an optional field.
