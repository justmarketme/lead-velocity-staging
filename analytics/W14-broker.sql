-- analytics/W14-broker.sql — the numbers behind the broker weekly report (4.10a), one query for three surfaces
-- (WhatsApp 6-liner, portal Reports tab, email/PDF). W14 runs facts.w14_broker_payload(broker_id) Sunday 23:00, stores it in
-- report_history.report_data (= `payload_json` in 4.10a), runs facts.w14_reconcile(), and HOLDS the report if any check fails.
-- automation/W14-broker.md (broker-success) was not present when this was written, so the payload follows 4.10a sections 1-8 and the
-- `broker_weekly` template variables ({{1}}..{{6}} -> payload.whatsapp). Align field names when that file lands.
-- Rules baked in: no spend / cost per lead / margin / creative names / other advisers (4.10a "deliberately not copied"); Grade 7 wording;
-- every number is value + target + last week; traffic lights only on show rate and replacements; no personal fields (facts is pseudonymised):
-- lists carry lead_key and the renderer resolves "first name + initial" from the operational tables (full name only inside the portal; never on WhatsApp).
-- Policies / close rate come from facts.fact_broker_roi, shown only to that adviser, never in any fee, ranking or LV report (FAIS, 3.7).

create or replace function facts.kv(v numeric, t numeric, lw numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('value', v, 'target', t, 'last_week', lw) $$;

-- Cycle-to-date counts at a given day (path A: counts by sub-select, used by the report).
create or replace function facts.cycle_counts(p_cycle text, p_day date)
returns table (verified_gross int, delivered int, replacements_used int, booked int, attended int, no_show int, held int, good_fit int, not_a_fit int, quality_avg numeric, quality_n int, pulse_up int, pulse_n int)
language sql stable as $$
  select
   (select count(*) from facts.fact_lead l where l.cycle_id = p_cycle and l.qualified and (l.verified_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select count(*) from facts.fact_lead l where l.cycle_id = p_cycle and l.qualified and (l.verified_at at time zone 'Africa/Johannesburg')::date <= p_day and not coalesce(l.replaced, false))::int,
   (select count(*) from facts.fact_lead l where l.cycle_id = p_cycle and coalesce(l.replaced, false))::int,
   (select count(distinct k.lead_key) from facts.fact_booking k where k.cycle_id = p_cycle and k.status <> 'cancelled' and (k.booked_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select count(*) from facts.fact_outcome o where o.cycle_id = p_cycle and o.outcome = 'attended' and (o.marked_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select count(*) from facts.fact_outcome o where o.cycle_id = p_cycle and o.outcome = 'no_show' and (o.marked_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select count(*) from facts.fact_outcome o where o.cycle_id = p_cycle and o.outcome in ('attended','no_show') and (o.marked_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select count(*) from facts.fact_outcome o where o.cycle_id = p_cycle and facts.disp_class(o.disposition_code) = 'fit' and (o.marked_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select count(*) from facts.fact_outcome o where o.cycle_id = p_cycle and facts.disp_class(o.disposition_code) = 'nofit' and (o.marked_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select round(avg(o.quality_score), 1) from facts.fact_outcome o where o.cycle_id = p_cycle and (o.marked_at at time zone 'Africa/Johannesburg')::date <= p_day),
   (select count(o.quality_score) from facts.fact_outcome o where o.cycle_id = p_cycle and (o.marked_at at time zone 'Africa/Johannesburg')::date <= p_day)::int,
   (select count(*) from facts.fact_lead l where l.cycle_id = p_cycle and l.lead_pulse_thumbs = 1)::int,
   (select count(*) from facts.fact_lead l where l.cycle_id = p_cycle and l.lead_pulse_thumbs is not null)::int
$$;

-- The console's own cycle line (path B: one join, grouped). Mark's "committed 20 · verified X · booked Y · attended Z · replacements N/4".
-- If platform-architect's public.v_cycle_progress (crm-gap A1) lands, point w14_reconcile's `console` CTE at it instead.
create or replace view facts.v_cycle_progress as
select c.cycle_id, c.broker_id, c.committed_leads as committed, c.replacement_cap as cap,
       count(distinct l.lead_key) filter (where l.qualified and l.verified_at is not null and not coalesce(l.replaced, false)) as delivered,
       count(distinct l.lead_key) filter (where l.qualified and l.verified_at is not null) as verified_gross,
       count(distinct l.lead_key) filter (where l.replaced) as replacements_used,
       count(distinct k.lead_key) filter (where k.status <> 'cancelled') as booked,
       count(distinct o.outcome_id) filter (where o.outcome = 'attended') as attended,
       count(distinct o.outcome_id) filter (where o.outcome in ('attended', 'no_show')) as held,
       count(distinct o.outcome_id) filter (where facts.disp_class(o.disposition_code) = 'fit') as good_fit,
       round(count(distinct o.outcome_id) filter (where o.outcome = 'attended')::numeric
             / nullif(count(distinct o.outcome_id) filter (where o.outcome in ('attended', 'no_show')), 0), 3) as show_rate,
       (c.ends_at - (select as_of from facts.v_params)) as days_left
from facts.fact_cycle c
left join facts.fact_lead l on l.cycle_id = c.cycle_id and (l.verified_at is null or (l.verified_at at time zone 'Africa/Johannesburg')::date <= (select as_of from facts.v_params))
left join facts.fact_booking k on k.lead_key = l.lead_key
left join facts.fact_outcome o on o.booking_id = k.booking_id and (o.marked_at at time zone 'Africa/Johannesburg')::date <= (select as_of from facts.v_params)
where c.status in ('active', 'extended')
group by c.cycle_id, c.broker_id, c.committed_leads, c.replacement_cap, c.ends_at;

create or replace function facts.w14_broker_payload(p_broker text) returns jsonb language plpgsql stable as $$
declare
  p facts.v_params%rowtype; c facts.fact_cycle%rowtype;
  n record; w record;               -- counts now / a week ago
  elapsed int; cycle_len int; pace numeric; week_no int; edition text; on_track boolean;
  unmarked jsonb; followups jsonb; not_reached jsonb; nxt jsonb; lastwk jsonb;
  todo_ct int; ask jsonb; cap_days numeric; mix jsonb; themes jsonb; new_angles jsonb;
  roi jsonb; r facts.fact_broker_roi%rowtype; held_now int; show_now numeric; show_prev numeric; booked_upcoming int;
  light_show text; light_rep text; one_liner text; wa jsonb;
begin
  select * into p from facts.v_params;
  select * into c from facts.fact_cycle where broker_id = p_broker and status in ('active', 'extended') order by starts_at desc limit 1;
  if not found then return jsonb_build_object('error', 'no_active_cycle', 'broker_id', p_broker); end if;
  select * into n from facts.cycle_counts(c.cycle_id, p.as_of);
  select * into w from facts.cycle_counts(c.cycle_id, p.as_of - 7);
  elapsed := (p.as_of - c.starts_at) + 1; cycle_len := (c.ends_at - c.starts_at) + 1;
  pace := round(c.committed_leads * least(elapsed, cycle_len)::numeric / cycle_len);
  week_no := ceil(elapsed / 7.0)::int;
  on_track := n.delivered >= round(pace * 0.9);       -- ASSUMPTION: within 10% of straight-line pace = on track
  show_now := round(n.attended::numeric / nullif(n.held, 0), 3);
  show_prev := round(w.attended::numeric / nullif(w.held, 0), 3);
  light_show := case when show_now is null then 'grey' when show_now >= p.show_target then 'green' when show_now >= p.show_floor then 'amber' else 'red' end;
  light_rep  := case when n.replacements_used >= c.replacement_cap then 'red' when n.replacements_used >= 0.75 * c.replacement_cap then 'amber' else 'green' end;
  edition := case when (c.ends_at - p.as_of) <= 7 then 'cycle_end'
                  when elapsed + 1 between 15 and 21 then 'midcycle' else 'weekly' end;   -- Monday = elapsed + 1

  -- 3. Meetings and to-dos (lead_key only; names are resolved by the renderer inside the portal)
  select coalesce(jsonb_agg(jsonb_build_object('lead_key', k.lead_key, 'slot_start', k.slot_start, 'method', k.method, 'outcome', o.outcome,
                                               'disposition', facts.disp_class(o.disposition_code), 'disposition_code', o.disposition_code) order by k.slot_start), '[]') into lastwk
    from facts.fact_booking k left join facts.fact_outcome o on o.booking_id = k.booking_id
    where k.broker_id = p_broker and k.cycle_id = c.cycle_id and (k.slot_start at time zone 'Africa/Johannesburg')::date between p.as_of - 6 and p.as_of;
  select coalesce(jsonb_agg(jsonb_build_object('lead_key', k.lead_key, 'slot_start', k.slot_start, 'method', k.method) order by k.slot_start), '[]') into nxt
    from facts.fact_booking k where k.broker_id = p_broker and k.status in ('booked', 'confirmed', 'rescheduled')
      and (k.slot_start at time zone 'Africa/Johannesburg')::date between p.as_of + 1 and p.as_of + 7;
  select coalesce(jsonb_agg(jsonb_build_object('lead_key', k.lead_key, 'booking_id', k.booking_id, 'slot_start', k.slot_start) order by k.slot_start), '[]') into unmarked
    from facts.fact_booking k left join facts.fact_outcome o on o.booking_id = k.booking_id
    where k.broker_id = p_broker and k.cycle_id = c.cycle_id and (k.slot_start at time zone 'Africa/Johannesburg')::date <= p.as_of
      and k.status not in ('cancelled', 'rescheduled') and (o.outcome_id is null or coalesce(o.unconfirmed, false));
  select coalesce(jsonb_agg(jsonb_build_object('lead_key', o.lead_key, 'due', (o.marked_at at time zone 'Africa/Johannesburg')::date + 7) order by o.marked_at), '[]') into followups
    from facts.fact_outcome o where o.broker_id = p_broker and o.disposition_code in ('fit_followup', 'good_fit_follow_up', 'good_fit_followup')
      and (o.marked_at at time zone 'Africa/Johannesburg')::date + 7 between p.as_of - 13 and p.as_of + 7;
  select coalesce(jsonb_agg(jsonb_build_object('lead_key', o.lead_key)), '[]') into not_reached
    from facts.fact_outcome o where o.broker_id = p_broker and o.cycle_id = c.cycle_id and o.lead_reach_check = 'no';
  todo_ct := jsonb_array_length(unmarked) + jsonb_array_length(followups);

  -- 4. Quality in his words
  select coalesce(jsonb_object_agg(coalesce(o.disposition_code, 'not_marked_yet'), ct), '{}') into mix
    from (select disposition_code, count(*) ct from facts.fact_outcome where cycle_id = c.cycle_id and outcome = 'attended' group by 1) o;
  select coalesce(jsonb_agg(jsonb_build_object('theme', t.theme, 'leads', t.ct) order by t.ct desc, t.theme), '[]') into themes
    from (select theme, count(*) ct from facts.fact_lead_theme where broker_id = p_broker and cycle_id = c.cycle_id group by theme order by count(*) desc, theme limit 3) t;
  -- 5. What you'll notice: angles that started delivering this week (codes only; renderer words them). Other notices come from broker-success's notice table.
  select coalesce(jsonb_agg(a.angle), '[]') into new_angles
    from (select angle from facts.fact_ad_day group by angle having min(day) between p.as_of - 6 and p.as_of) a;
  -- 6. ROI view (voluntary)
  select * into r from facts.fact_broker_roi where cycle_id = c.cycle_id;
  select count(*) into booked_upcoming from facts.fact_booking k where k.broker_id = p_broker and k.status in ('booked', 'confirmed', 'rescheduled') and k.cycle_id = c.cycle_id and k.slot_start > (p.as_of + 1)::timestamp;
  roi := case when r.close_rate is null then jsonb_build_object('shown', false)
              else jsonb_build_object('shown', true, 'close_rate', r.close_rate, 'policies_reported', r.policies_written_reported,
                     'meetings_held', n.attended,
                     'tracking_to_policies', floor(r.close_rate * (n.attended + booked_upcoming * coalesce(show_now, 0)))) end;
  -- 7. One ask
  select days_left_val into cap_days from (select value as days_left_val from facts.v_watchlist_6_capacity_days_left where scope = p_broker) z;
  ask := case when jsonb_array_length(unmarked) > 0
                then jsonb_build_object('code', 'mark_outcomes', 'text', format('Mark the %s open outcome%s', jsonb_array_length(unmarked), case when jsonb_array_length(unmarked) = 1 then '' else 's' end), 'count', jsonb_array_length(unmarked))
              when cap_days is not null and cap_days < p.capacity_floor_days
                then jsonb_build_object('code', 'open_more_times', 'text', 'Open a few more meeting times next week')
              else null end;

  one_liner := format('Week %s of your %s cycle: %s of %s leads delivered, %s booked, %s showed up, %s you rated a good fit. %s',
                 week_no, to_char(c.starts_at, 'FMMonth'), n.delivered, c.committed_leads, n.booked, n.attended, n.good_fit,
                 case when on_track then 'On track.' else 'A bit behind. If we fall short your cycle extends until we deliver.' end);
  wa := jsonb_build_object(
    '1', format('Week %s of your %s cycle. %s', week_no, to_char(c.starts_at, 'FMMonth'), case when on_track then 'On track.' else 'A bit behind.' end),
    '2', format('%s of %s (target %s by now, last week %s)', n.delivered, c.committed_leads, pace::int, w.delivered),
    '3', format('%s (last week %s)', n.booked, w.booked),
    '4', coalesce(format('%s%% (target %s%%, last week %s)', round(show_now * 100), round(p.show_target * 100), coalesce(round(show_prev * 100)::text || '%', 'n/a')), 'Not enough meetings yet'),
    '5', case when todo_ct = 0 then 'Nothing waiting' else format('%s to do', todo_ct) end,
    '6', coalesce(ask ->> 'text', 'Nothing to do this week'));

  return jsonb_build_object(
    'meta', jsonb_build_object('broker_id', p_broker, 'cycle_id', c.cycle_id, 'week_ending', p.as_of, 'week_no', week_no, 'edition', edition),
    'one_liner', one_liner,
    'progress', jsonb_build_object(
      'delivered', facts.kv(n.delivered, pace, w.delivered), 'committed', c.committed_leads,
      'verified', facts.kv(n.verified_gross, null, w.verified_gross),
      'booked', facts.kv(n.booked, round(n.delivered * p.booking_target), w.booked),
      'attended', facts.kv(n.attended, null, w.attended),
      'show_rate', facts.kv(show_now, p.show_target, show_prev), 'show_rate_light', light_show,
      'good_fit', facts.kv(n.good_fit, null, w.good_fit),
      'replacements', jsonb_build_object('used', n.replacements_used, 'cap', c.replacement_cap, 'last_week', w.replacements_used, 'light', light_rep),
      'days_left', (c.ends_at - p.as_of), 'extension', jsonb_build_object('extended_until', c.extended_until, 'status', case when c.extended_until is not null then 'extended' else 'none' end)),
    'meetings', jsonb_build_object('last_week', lastwk, 'next_week', nxt,
      'todos', jsonb_build_object('unmarked_outcomes', unmarked, 'followups_due', followups, 'lead_says_not_reached', not_reached, 'count', todo_ct)),
    'quality', jsonb_build_object('quality_avg', jsonb_build_object('value', n.quality_avg, 'last_week', w.quality_avg, 'n', n.quality_n),
      'disposition_mix', mix, 'top_themes', themes,
      'lead_pulse', jsonb_build_object('worth_it', n.pulse_up, 'answered', n.pulse_n, 'shown', n.pulse_n >= 3)),
    'notices', jsonb_build_object('new_angles', new_angles),
    'roi', roi,
    'ask', ask,
    'cycle_line', jsonb_build_object('tier', c.tier_name, 'cycle_start', c.starts_at, 'cycle_end', c.ends_at, 'renewal_offer_date', c.starts_at + 14),
    'whatsapp', wa);
end $$;

-- Reconcile: the report's numbers must tie to the console. Any false row = hold the report and alert (W14 failure path, 4.6).
create or replace function facts.w14_reconcile(p_broker text, p_payload jsonb default null)
returns table (check_name text, report_value text, console_value text, ok boolean)
language plpgsql stable as $$
declare pl jsonb := coalesce(p_payload, facts.w14_broker_payload(p_broker)); co facts.v_cycle_progress%rowtype; td int;
        banned text := '(spen[dt]|cpl|cost per|margin|creative|campaign|adset|ad_id|ad_name|price_zar|emq|capi|attribution|\mR ?[0-9]{3,})';
begin
  select * into co from facts.v_cycle_progress where broker_id = p_broker;
  select todos_open into td from facts.fact_broker_day where broker_id = p_broker and day = (select as_of from facts.v_params);
  return query select 'delivered', pl #>> '{progress,delivered,value}', co.delivered::text, (pl #>> '{progress,delivered,value}')::int = co.delivered;
  return query select 'committed', pl #>> '{progress,committed}', co.committed::text, (pl #>> '{progress,committed}')::int = co.committed;
  return query select 'verified', pl #>> '{progress,verified,value}', co.verified_gross::text, (pl #>> '{progress,verified,value}')::int = co.verified_gross;
  return query select 'booked', pl #>> '{progress,booked,value}', co.booked::text, (pl #>> '{progress,booked,value}')::int = co.booked;
  return query select 'attended', pl #>> '{progress,attended,value}', co.attended::text, (pl #>> '{progress,attended,value}')::int = co.attended;
  return query select 'good_fit', pl #>> '{progress,good_fit,value}', co.good_fit::text, (pl #>> '{progress,good_fit,value}')::int = co.good_fit;
  return query select 'replacements_used', pl #>> '{progress,replacements,used}', co.replacements_used::text, (pl #>> '{progress,replacements,used}')::int = co.replacements_used;
  return query select 'show_rate', pl #>> '{progress,show_rate,value}', co.show_rate::text,
                      (pl #>> '{progress,show_rate,value}') is not distinct from co.show_rate::text;
  return query select 'todo_count_vs_console_todos', pl #>> '{meetings,todos,count}', td::text, td is null or (pl #>> '{meetings,todos,count}')::int = td;
  return query select 'dispositions_add_up', (select coalesce(sum(value::int), 0) from jsonb_each_text(pl #> '{quality,disposition_mix}'))::text, (co.attended)::text,
                      (select coalesce(sum(value::int), 0) from jsonb_each_text(pl #> '{quality,disposition_mix}')) = co.attended;
  return query select 'one_liner_matches_progress', pl ->> 'one_liner', null,
                      (pl ->> 'one_liner') like format('%% %s of %s leads delivered, %s booked, %s showed up, %s you rated a good fit.%%', co.delivered, co.committed, co.booked, co.attended, co.good_fit);
  return query select 'one_ask_or_none', coalesce(pl #>> '{ask,code}', 'none'), null, (pl -> 'ask') is null or jsonb_typeof(pl -> 'ask') in ('object', 'null');
  -- 4.10a: never spend, cost per lead, margin, creative names, other advisers; no jargon.
  return query select 'no_cost_or_jargon_in_payload', null, null, (pl - 'whatsapp')::text !~* banned and pl ->> 'one_liner' !~* banned;
  return query select 'no_other_adviser_ids', null, null,
                      not exists (select 1 from facts.fact_cycle x where x.broker_id <> p_broker and pl::text like '%' || x.broker_id || '%');
  return query select 'whatsapp_has_no_lead_keys', null, null,
                      not exists (select 1 from facts.fact_lead l where (pl -> 'whatsapp')::text like '%' || l.lead_key || '%');
end $$;

-- W14's gate: true = HOLD the report (do not send), alert Jonathan with the failing check names.
create or replace function facts.w14_hold(p_broker text) returns boolean language sql stable as $$
  select exists (select 1 from facts.w14_reconcile(p_broker) where not ok) $$;
