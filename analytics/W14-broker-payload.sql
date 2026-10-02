-- analytics/W14-broker-payload.sql — emits EXACTLY the JSON shape in automation/W14-broker.md (broker-success owns the words and the shape;
-- integration-pass2 I-02). Keys such as s1_one_line, s2_progress ... s8_cycle and wa; every figure is {v, target, last}.
-- Counts come from analytics/W14-broker.sql (facts.cycle_counts, operational tables); the console cross-check is public.v_cycle_progress.
-- W14 (Sunday 23:00): payload := facts.w14_broker_report(broker_id); if facts.w14_hold(broker_id, payload) then hold + alert, else store in
-- report_history.report_data (payload_json), ask := payload->'s7_ask'->>'code', and send Monday 07:00. The same payload feeds WhatsApp (wa), portal, email, PDF.
-- Run as service_role / n8n_app. Not exposed to brokers. Words are Grade 7; no spend, cost per lead, creative names or other advisers (R03, R11).
-- Needs: params.sql (facts.v_params, facts.as_of), W14-broker.sql, smc_02/03 tables (cycles, leads, appointments, outcomes, replacements, insights, broker_media, report_history).
--
-- Edition (weekly | midcycle | cycle_end): derived from the SEND day (= generation day + 1): cycle day 15 -> midcycle; the cycle's last day (extended end if running) -> cycle_end;
-- otherwise weekly. report_history.report_kind spells them broker_weekly / midcycle / cycle_end; `edition` in the payload is the short form.
-- Not computable yet (needs_human): ask `reconnect_calendar` (no brokers.calendar_status column) and `confirm_holiday_hours` (no holiday table). They are skipped, not guessed.

drop function if exists facts.w14_hold(text);
drop function if exists facts.w14_reconcile(text, jsonb);
drop function if exists facts.w14_broker_payload(text);

create or replace function facts.vtl(v numeric, t numeric, l numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('v', v, 'target', t, 'last', l) $$;

create or replace function facts.w14_broker_report(p_broker uuid, p_day date default null, p_edition text default null)
returns jsonb language plpgsql stable as $$
declare
  pr facts.v_params%rowtype; c public.cycles%rowtype; b public.brokers%rowtype;
  d date; tier text; n record; w record;
  start_d date; end_d date; elapsed int; cycle_len int; pace int; week_no int; weeks_in int; send_day date; edition text; on_track boolean;
  show_now numeric; show_prev numeric; rated_now numeric; rated_prev numeric; light_show text; light_rep text;
  lastwk jsonb; nxt jsonb; unmarked jsonb; followups jsonb; not_reached jsonb; mix jsonb; themes jsonb; notices jsonb := '[]'::jsonb;
  n_unmarked int; n_follow int; n_missed int; todo_words text;
  booked_upcoming int; roi jsonb; tracking numeric; prev_ratio numeric; held_total int;
  ask jsonb := null; ask_code text; ask_short text; recent_asks text[]; free7 int; has_intro boolean; intro_old boolean; week_key text;
  one_line text; quiet boolean; offer_on date; cycle_line text; wa jsonb; status_line text; end_note text; cap_row record; ang record;
begin
  select * into pr from facts.v_params;
  d := coalesce(p_day, pr.as_of);
  select * into b from public.brokers where id = p_broker;
  if not found then return jsonb_build_object('error', 'no_such_broker', 'broker_id', p_broker); end if;
  select * into c from public.cycles where broker_id = p_broker and status in ('active','extended') order by starts_at desc limit 1;
  if not found then return jsonb_build_object('error', 'no_active_cycle', 'broker_id', p_broker); end if;
  select name into tier from public.pricing where tier_code = c.tier_code;

  select * into n from facts.cycle_counts(c.id, d);
  select * into w from facts.cycle_counts(c.id, d - 7);
  start_d := facts.sa_date(c.starts_at); end_d := facts.sa_date(c.ends_at) - 1;   -- ends_at is the exclusive boundary (as in facts.fact_broker_day); end_d = the cycle's last day
  elapsed := d - start_d + 1; cycle_len := end_d - start_d + 1;
  pace := round(c.committed_leads * least(elapsed, cycle_len)::numeric / cycle_len);
  week_no := ceil(elapsed / 7.0)::int; weeks_in := case when c.extended_until is not null then 5 else 4 end;
  on_track := n.delivered >= round(pace * 0.9);                      -- ASSUMPTION: within 10% of straight-line pace = on track
  show_now := round(n.attended::numeric / nullif(n.held, 0), 2); show_prev := round(w.attended::numeric / nullif(w.held, 0), 2);
  rated_now := round(n.rated::numeric / nullif(n.attended, 0), 2); rated_prev := round(w.rated::numeric / nullif(w.attended, 0), 2);
  light_show := case when show_now is null then 'grey' when show_now >= pr.show_target then 'green' when show_now >= pr.show_floor then 'amber' else 'red' end;
  light_rep  := case when n.replacements_used >= c.replacement_cap then 'red' when n.replacements_used >= 0.75 * c.replacement_cap then 'amber' else 'green' end;
  send_day := d + 1;
  edition := coalesce(p_edition, case when send_day = facts.sa_date(coalesce(c.extended_until, c.ends_at)) - 1 then 'cycle_end'
                                      when send_day - start_d + 1 = 15 then 'midcycle' else 'weekly' end);
  week_key := 'rp_' || to_char(d, 'IYYY"w"IW');
  offer_on := coalesce(facts.sa_date(c.renewal_offer_sent_at), end_d - 7);   -- default: 7 days before the last day (automation/W14-broker.md example)

  -- 3. Meetings and to-dos. Names are first name + last initial (WhatsApp never carries a name; the renderer decides where full_name shows).
  select coalesce(jsonb_agg(jsonb_build_object(
           'lead_ref', l.id, 'first_name', l.first_name, 'initial', upper(left(l.last_name, 1)), 'full_name', btrim(coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'')),
           'when', to_char(a.appointment_date at time zone 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI') || '+02:00', 'method', a.method,
           'outcome', coalesce(o.outcome, 'not_marked'), 'unconfirmed', coalesce(o.unconfirmed, false),
           'disposition', o.disposition_code::text, 'quality', o.quality_score) order by a.appointment_date), '[]'::jsonb) into lastwk
    from public.appointments a join public.leads l on l.id = a.client_id left join public.outcomes o on o.booking_id = a.id
   where a.broker_id = p_broker and a.cycle_id = c.id and a.brand_id is not null and a.status not in ('cancelled','rescheduled')
     and facts.sa_date(a.appointment_date) between d - 6 and d;
  select coalesce(jsonb_agg(jsonb_build_object(
           'first_name', l.first_name, 'initial', upper(left(l.last_name, 1)),
           'when', to_char(a.appointment_date at time zone 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI') || '+02:00', 'method', a.method) order by a.appointment_date), '[]'::jsonb) into nxt
    from public.appointments a join public.leads l on l.id = a.client_id
   where a.broker_id = p_broker and a.brand_id is not null and a.status in ('booked','confirmed') and facts.sa_date(a.appointment_date) between d + 1 and d + 7;
  select coalesce(jsonb_agg(jsonb_build_object('booking_id', a.id, 'first_name', l.first_name, 'initial', upper(left(l.last_name, 1))) order by a.appointment_date), '[]'::jsonb) into unmarked
    from public.appointments a join public.leads l on l.id = a.client_id left join public.outcomes o on o.booking_id = a.id
   where a.broker_id = p_broker and a.cycle_id = c.id and a.brand_id is not null and a.status not in ('cancelled','rescheduled')
     and a.ends_at < least(now(), ((d + 1)::timestamp at time zone 'Africa/Johannesburg'))
     and (o.id is null or o.unconfirmed);
  select coalesce(jsonb_agg(jsonb_build_object('first_name', l.first_name, 'initial', upper(left(l.last_name, 1)), 'due', (facts.sa_date(o.marked_at) + 7)) order by o.marked_at), '[]'::jsonb) into followups
    from public.outcomes o join public.leads l on l.id = o.lead_id
   where o.broker_id = p_broker and o.disposition_code = 'fit_followup' and facts.sa_date(o.marked_at) + 7 between d - 13 and d + 7;   -- ASSUMPTION: due = tap date + 7 days
  select coalesce(jsonb_agg(jsonb_build_object('first_name', l.first_name, 'initial', upper(left(l.last_name, 1)))), '[]'::jsonb) into not_reached
    from public.outcomes o join public.leads l on l.id = o.lead_id where o.broker_id = p_broker and o.cycle_id = c.id and o.lead_reach_check = 'no';
  n_unmarked := jsonb_array_length(unmarked); n_follow := jsonb_array_length(followups); n_missed := jsonb_array_length(not_reached);

  -- 4. Quality, in his words
  select jsonb_build_object(
           'fit_proceeding', count(*) filter (where disposition_code = 'fit_proceeding'), 'fit_followup', count(*) filter (where disposition_code = 'fit_followup'),
           'nofit_budget', count(*) filter (where disposition_code = 'nofit_budget'), 'nofit_covered', count(*) filter (where disposition_code = 'nofit_covered'),
           'nofit_criteria', count(*) filter (where disposition_code = 'nofit_criteria'), 'unreachable', count(*) filter (where disposition_code = 'unreachable')) into mix
    from public.outcomes where cycle_id = c.id;
  select coalesce(jsonb_agg(jsonb_build_object('text', t.text, 'count', t.ct, 'of', n.delivered) order by t.ct desc, t.text), '[]'::jsonb) into themes
    from (select i.text, sum(i.n)::int as ct from public.insights i
           where i.source = 'precall_question' and i.kind = 'theme' and i.broker_id = p_broker and (i.cycle_id = c.id or i.cycle_id is null)
           group by i.text order by sum(i.n) desc, i.text limit 3) t;

  -- 5. What you'll notice: one true line per angle that started running this week (never names, spend or targeting). Other notices: broker-success's notice table.
  for ang in select f.angle, min(f.date) as first_day from facts.fact_ad_day f where f.angle is not null group by f.angle having min(f.date) between d - 6 and d order by min(f.date) loop
    if ang.angle in ('bond','bond_b') then
      notices := notices || to_jsonb(format('A new ad about bond cover went live %s. Expect more leads mentioning a bond.', to_char(ang.first_day, 'FMDay')));
    elsif ang.angle = 'work_cover' then
      notices := notices || to_jsonb(format('A new ad about cover through your work went live %s. Expect more leads asking about work cover.', to_char(ang.first_day, 'FMDay')));
    elsif ang.angle = 'family' then
      notices := notices || to_jsonb(format('A new ad about protecting your family went live %s. Expect more leads with dependants.', to_char(ang.first_day, 'FMDay')));
    elsif ang.angle = 'income' then
      notices := notices || to_jsonb(format('A new ad about income cover went live %s. Expect more leads asking about income.', to_char(ang.first_day, 'FMDay')));
    end if;
  end loop;

  -- 6. ROI view (voluntary). Formula (analytics-reporter): tracking_to = round(close_rate x (attended + upcoming booked meetings x his own show rate)).
  select count(*) into booked_upcoming from public.appointments a where a.broker_id = p_broker and a.cycle_id = c.id and a.brand_id is not null
     and a.status in ('booked','confirmed') and facts.sa_date(a.appointment_date) > d;
  held_total := n.held;
  tracking := case when b.close_rate is null or held_total = 0 then null else round(b.close_rate * (n.attended + booked_upcoming * show_now)) end;
  select round(c2.policies_written_reported::numeric / nullif((select count(*) from public.outcomes o2 where o2.cycle_id = c2.id and o2.outcome = 'attended'), 0), 2) into prev_ratio
    from public.cycles c2 where c2.id = c.previous_cycle_id;
  roi := case when b.close_rate is null then jsonb_build_object('shown', false)
              else jsonb_build_object('shown', true, 'close_rate', b.close_rate, 'policies_reported', c.policies_written_reported, 'tracking_to', tracking,
                     'basis', jsonb_build_object('attended', n.attended, 'committed', c.committed_leads, 'delivered', n.delivered,
                                                 'booked_upcoming', booked_upcoming, 'show_rate', show_now),
                     'meetings_to_policies', jsonb_build_object('v', round(c.policies_written_reported::numeric / nullif(n.attended, 0), 2), 'last', prev_ratio)) end;

  -- 7. One ask: first eligible in the broker-success order; the same non-priority-0/1 ask is not repeated three weeks running.
  select array_agg(x.ask) into recent_asks from (select rh.ask from public.report_history rh where rh.broker_id = p_broker and rh.brand_id is not null
        and rh.report_kind = 'broker_weekly' and rh.week < d - 3 order by rh.week desc limit 2) x;
  select coalesce(sum(cd.slots_total_7d - cd.slots_booked_7d), 0)::int into free7 from facts.v_capacity_day cd where cd.broker_id = p_broker and cd.day = d;
  select exists (select 1 from public.broker_media m where m.broker_id = p_broker and m.kind in ('video','voice') and m.is_current and m.approved_at is not null) into has_intro;
  select exists (select 1 from public.broker_media m where m.broker_id = p_broker and m.kind in ('video','voice') and m.is_current and m.approved_at < (d - 90)::timestamp) into intro_old;
  ask_code := case
    when n_unmarked >= 1 then 'mark_outcomes'
    when n_missed >= 1 then 'not_reached'
    when not has_intro and n.booked >= 5 then 'record_intro'
    when free7 < 3 and n.delivered < c.committed_leads and exists (select 1 from facts.v_capacity_day cd where cd.broker_id = p_broker and cd.day = d and cd.slots_total_7d > 0) then 'open_capacity'
    when intro_old then 'rerecord_intro'
    when n.attended >= 5 and b.close_rate is null then 'add_close_rate'
    when n_follow >= 1 then 'followup_due'
    else null end;
  if ask_code is not null and ask_code <> 'mark_outcomes' and recent_asks is not null and coalesce(array_length(recent_asks, 1), 0) = 2 and recent_asks[1] = ask_code and recent_asks[2] = ask_code then
    ask_code := case when n_follow >= 1 and ask_code <> 'followup_due' then 'followup_due' else null end;   -- cooldown: skip a repeated nudge; fall to the next one that is true
  end if;
  if ask_code is not null then
    ask := case ask_code
      when 'mark_outcomes' then jsonb_build_object('code', ask_code, 'text', format('Mark your %s open outcome%s. It keeps your replacements accurate and your pre-call briefs sharp.', n_unmarked, case when n_unmarked = 1 then '' else 's' end), 'button', format('Mark outcomes (%s)', n_unmarked))
      when 'not_reached' then jsonb_build_object('code', ask_code, 'text', format('%s lead%s told us no one reached them. Please call %s today.', n_missed, case when n_missed = 1 then '' else 's' end, case when n_missed = 1 then 'them' else 'them' end), 'button', 'Call them now')
      when 'record_intro' then jsonb_build_object('code', ask_code, 'text', 'A short intro video helps people turn up to their call. It takes two minutes.', 'button', 'Record my intro')
      when 'open_capacity' then jsonb_build_object('code', ask_code, 'text', 'Your diary is almost full next week. Open a few more times so new leads can book.', 'button', 'Open more times')
      when 'rerecord_intro' then jsonb_build_object('code', ask_code, 'text', 'Your intro is over 90 days old. A fresh one takes two minutes.', 'button', 'Re-record my intro')
      when 'add_close_rate' then jsonb_build_object('code', ask_code, 'text', 'Tell us your usual close rate. We will show where this cycle is likely to land for you.', 'button', 'Add my close rate')
      when 'followup_due' then jsonb_build_object('code', ask_code, 'text', format('You have %s good-fit follow-up%s due this week. A quick call keeps them warm.', n_follow, case when n_follow = 1 then '' else 's' end), 'button', 'See follow-ups')
    end || jsonb_build_object('deep_link', 'ask/' || week_key);
    ask_short := case ask_code
      when 'mark_outcomes' then format('Mark the %s open outcome%s', n_unmarked, case when n_unmarked = 1 then '' else 's' end)
      when 'not_reached' then 'Call the leads who were missed' when 'record_intro' then 'Record a short intro'
      when 'open_capacity' then 'Open more meeting times' when 'rerecord_intro' then 'Re-record your intro'
      when 'add_close_rate' then 'Add your close rate' else 'See your follow-ups due' end;
  end if;

  -- Words
  quiet := (n.delivered = w.delivered) and jsonb_array_length(lastwk) = 0 and jsonb_array_length(nxt) = 0 and n_unmarked = 0;
  one_line := case when quiet then 'A quiet week: no new leads or meetings. Nothing for you to do.'
    else format('%s of %s leads delivered, %s booked, %s showed up, %s you rated a good fit. %s', n.delivered, c.committed_leads, n.booked, n.attended, n.good_fit,
                case when on_track then 'On track for the cycle.' else 'A bit behind. If we fall short, your cycle extends until we deliver.' end) end;
  if quiet then ask := null; ask_short := null; end if;
  todo_words := case when n_unmarked = 0 and n_follow = 0 then 'Nothing to mark'
                     else concat_ws(' and ', case when n_unmarked > 0 then format('%s outcome%s to mark', n_unmarked, case when n_unmarked = 1 then '' else 's' end) end,
                                             case when n_follow > 0 then format('%s follow-up%s due', n_follow, case when n_follow = 1 then '' else 's' end) end) end;
  cycle_line := format('Cycle %s (%s) ends %s. Your renewal offer arrives %s. No lock-in.', c.cycle_no, tier, to_char(end_d, 'FMDy FMDD FMMon'), to_char(offer_on, 'FMDy FMDD FMMon'));
  status_line := case when on_track then format('On track to deliver all %s.', c.committed_leads)
                      else 'A little behind: we are adding leads and your cycle can extend up to 14 days.' end;
  end_note := case when coalesce(c.shortfall_credit_zar, 0) > 0 then format(' A credit of R%s goes to your next cycle.', trim(to_char(c.shortfall_credit_zar, 'FM999G999G990'))) 
                   when c.extended_until is not null then format(' Your cycle ran %s extra days.', facts.sa_date(c.extended_until) - 1 - end_d) else '' end;

  wa := case edition
    when 'midcycle' then jsonb_build_object('v1', to_char(start_d + 14, 'FMMonth'), 'v2', n.delivered::text, 'v3', c.committed_leads::text, 'v4', n.booked::text, 'v5', n.attended::text,
            'v6', coalesce(n.quality_avg::text, 'not rated yet'), 'v7', status_line, 'v8', to_char(end_d, 'FMDy FMDD FMMon'))
    when 'cycle_end' then jsonb_build_object('v1', to_char(start_d + 14, 'FMMonth'), 'v2', to_char(facts.sa_date(coalesce(c.extended_until, c.ends_at)) - 1, 'FMDy FMDD FMMon'), 'v3', n.delivered::text,
            'v4', c.committed_leads::text, 'v5', (n.good_fit)::text, 'v6', coalesce(n.quality_avg::text, 'not rated yet'),
            'v7', format('Replacements used: %s of %s.', n.replacements_used, c.replacement_cap) || end_note)
    else jsonb_build_object(
            'v1', format('Week %s of your %s cycle. %s', case when week_no > 4 then week_no || ' (extension)' else week_no::text end, to_char(start_d + 14, 'FMMonth'), case when on_track then 'On track.' else 'A bit behind.' end),
            'v2', format('%s of %s (target %s by now, last week %s)', n.delivered, c.committed_leads, pace, w.delivered),
            'v3', format('%s (last week %s)', n.booked, w.booked),
            'v4', case when show_now is null then 'Not enough calls yet' else format('%s%% (target %s%%, last week %s)', round(show_now * 100), round(pr.show_target * 100), coalesce(round(show_prev * 100)::text || '%', 'n/a')) end,
            'v5', todo_words,
            'v6', left(coalesce(ask_short, 'Nothing this week. You are all caught up.'), 60)) end;

  return jsonb_build_object(
    'schema', 'broker_report/1', 'edition', edition, 'week', to_char(d, 'IYYY"-W"IW'), 'week_of_cycle', week_no, 'weeks_in_cycle', weeks_in,
    'broker', jsonb_build_object('id', b.id, 'first_name', split_part(b.contact_person, ' ', 1), 'practice', b.firm_name, 'fsp', b.fsp_number),
    'cycle', jsonb_build_object('id', c.id, 'label', to_char(start_d + 14, 'FMMonth'), 'tier', tier, 'day', elapsed, 'days_total', cycle_len,
               'starts', start_d, 'ends', end_d, 'renewal_offer_on', offer_on,
               'extension', jsonb_build_object('active', c.extended_until is not null, 'until', facts.sa_date(c.extended_until) - 1)),
    's1_one_line', one_line,
    's2_progress', jsonb_build_object(
      'delivered', facts.vtl(n.delivered, pace, w.delivered) || jsonb_build_object('committed', c.committed_leads),
      'verified', facts.vtl(n.verified_gross, null, w.verified_gross),
      'booked', facts.vtl(n.booked, pr.booking_target, w.booked) || jsonb_build_object('rate', round(n.booked::numeric / nullif(n.delivered, 0), 2)),
      'attended', facts.vtl(n.attended, null, w.attended),
      'show_rate', facts.vtl(show_now, pr.show_target, show_prev) || jsonb_build_object('light', light_show),
      'replacements', jsonb_build_object('used', n.replacements_used, 'cap', c.replacement_cap, 'last_used', w.replacements_used, 'light', light_rep),
      'days_left', greatest(0, facts.sa_date(coalesce(c.extended_until, c.ends_at)) - d - 1)),
    's3_meetings', jsonb_build_object('last_week', lastwk, 'next_week', nxt,
      'todos', jsonb_build_object('unmarked', unmarked, 'followups_due', followups, 'not_reached', not_reached)),
    's4_quality', jsonb_build_object('avg_rating', facts.vtl(n.quality_avg, 4.0, w.quality_avg), 'ratings_given', facts.vtl(rated_now, 0.90, rated_prev), 'mix', mix, 'themes', themes),
    's5_notice', notices,
    's6_roi', roi,
    's7_ask', ask,
    's8_cycle', jsonb_build_object('line', cycle_line),
    'wa', wa);
end $$;
comment on function facts.w14_broker_report(uuid, date, text) is 'W14 broker report payload in the broker_report/1 shape (automation/W14-broker.md). One payload feeds WhatsApp, portal, email and PDF.';

-- Reconcile-and-hold (R01-R05, R09, R11 of the W33 report rubric that SQL can check). Any false row = hold the report and alert (W14 failure path).
create or replace function facts.w14_reconcile(p_broker uuid, p_payload jsonb default null)
returns table (check_name text, report_value text, console_value text, ok boolean)
language plpgsql stable as $$
declare
  pl jsonb := coalesce(p_payload, facts.w14_broker_report(p_broker)); co public.v_cycle_progress%rowtype; cyc uuid := (pl #>> '{cycle,id}')::uuid;
  d date := coalesce((select as_of from facts.v_params), current_date); td int; show_c numeric; ver_c int; mix_c int;
  banned text := '(spen[dt]|\mcpl\M|\mcpc\M|\mctr\M|cost per|margin|creative|campaign|adset|ad_id|ad_name|price_zar|\memq\M|\mcapi\M|attribution|\mroas\M|guarantee|\mcheapest\M|\mbest\M|appointments|\mR ?[0-9]{3,})';
  slim jsonb; names text[];
begin
  if pl ? 'error' then return query select 'payload_built', pl ->> 'error', null, false; return; end if;
  select * into co from public.v_cycle_progress where cycle_id = cyc;
  select round(count(*) filter (where o.outcome = 'attended')::numeric / nullif(count(*) filter (where o.outcome in ('attended','no_show')), 0), 2) into show_c from public.outcomes o where o.cycle_id = cyc;
  select count(*) into ver_c from public.leads l where l.cycle_id = cyc and l.brand_id is not null and l.verified_at is not null and l.qualified_at is not null;
  select count(*) into mix_c from public.outcomes o where o.cycle_id = cyc and o.disposition_code is not null;
  select bt.unmarked + bt.unconfirmed into td from facts.v_broker_todos bt where bt.broker_id = p_broker;
  slim := pl - 'wa' - 's3_meetings' - 's4_quality' || jsonb_build_object('s4_quality', (pl -> 's4_quality') - 'themes');
  select array_agg(distinct x) into names from (select l.first_name as x from public.leads l where l.broker_id = p_broker and length(l.first_name) > 2
                                                union select l.last_name from public.leads l where l.broker_id = p_broker and length(l.last_name) > 2) q;

  return query select 'delivered_ties_to_console', pl #>> '{s2_progress,delivered,v}', co.verified::text, (pl #>> '{s2_progress,delivered,v}')::int = co.verified;
  return query select 'committed', pl #>> '{s2_progress,delivered,committed}', co.committed::text, (pl #>> '{s2_progress,delivered,committed}')::int = co.committed;
  return query select 'verified_all_leads', pl #>> '{s2_progress,verified,v}', ver_c::text, (pl #>> '{s2_progress,verified,v}')::int = ver_c;
  return query select 'booked', pl #>> '{s2_progress,booked,v}', co.booked::text, (pl #>> '{s2_progress,booked,v}')::int = co.booked;
  return query select 'attended', pl #>> '{s2_progress,attended,v}', co.attended::text, (pl #>> '{s2_progress,attended,v}')::int = co.attended;
  return query select 'replacements_used', pl #>> '{s2_progress,replacements,used}', co.replacements_used::text, (pl #>> '{s2_progress,replacements,used}')::int = co.replacements_used;
  return query select 'replacements_cap', pl #>> '{s2_progress,replacements,cap}', co.replacement_cap::text, (pl #>> '{s2_progress,replacements,cap}')::int = co.replacement_cap;
  return query select 'show_rate', pl #>> '{s2_progress,show_rate,v}', show_c::text, (pl #>> '{s2_progress,show_rate,v}')::numeric is not distinct from show_c;
  return query select 'good_fit_in_one_line_and_mix', (pl #>> '{s4_quality,mix,fit_proceeding}')::int + (pl #>> '{s4_quality,mix,fit_followup}')::int || '', co.good_fit::text,
                      (pl #>> '{s4_quality,mix,fit_proceeding}')::int + (pl #>> '{s4_quality,mix,fit_followup}')::int = co.good_fit;
  return query select 'dispositions_add_up', (select coalesce(sum(value::int), 0) from jsonb_each_text(pl #> '{s4_quality,mix}'))::text, mix_c::text,
                      (select coalesce(sum(value::int), 0) from jsonb_each_text(pl #> '{s4_quality,mix}')) = mix_c;
  return query select 'todo_count_vs_console', jsonb_array_length(pl #> '{s3_meetings,todos,unmarked}')::text, td::text, td is null or jsonb_array_length(pl #> '{s3_meetings,todos,unmarked}') = td;
  return query select 'one_liner_matches_progress', pl ->> 's1_one_line', null,
                      (pl ->> 's1_one_line') like format('%s of %s leads delivered, %s booked, %s showed up, %s you rated a good fit.%%', co.verified, co.committed, co.booked, co.attended, co.good_fit)
                      or (pl ->> 's1_one_line') like 'A quiet week%';
  return query select 'one_ask_or_none', coalesce(pl #>> '{s7_ask,code}', 'none'), null, (pl -> 's7_ask') is null or jsonb_typeof(pl -> 's7_ask') in ('object', 'null');
  return query select 'every_figure_has_target_and_last', null, null,
                      (pl #> '{s2_progress,delivered}') ?& array['v','target','last'] and (pl #> '{s2_progress,booked}') ?& array['v','target','last']
                      and (pl #> '{s2_progress,show_rate}') ?& array['v','target','last'] and (pl #> '{s4_quality,avg_rating}') ?& array['v','target','last'];
  return query select 'roi_hidden_without_close_rate', null, null, (pl #>> '{s6_roi,shown}')::boolean or not (pl -> 's6_roi') ? 'policies_reported';
  return query select 'no_cost_or_jargon_in_payload', null, null, slim::text !~* banned;
  return query select 'no_cost_or_jargon_in_whatsapp', null, null, (pl -> 'wa')::text !~* banned;
  return query select 'no_other_adviser_ids', null, null, not exists (select 1 from public.brokers x where x.id <> p_broker and pl::text like '%' || x.id::text || '%');
  return query select 'whatsapp_has_no_lead_names', null, null, not exists (select 1 from unnest(coalesce(names, '{}')) nm where (pl -> 'wa')::text ilike '%' || nm || '%');
  return query select 'whatsapp_at_most_six_values', null, null, (select count(*) from jsonb_object_keys(pl -> 'wa')) <= 8 and (pl ->> 'edition' <> 'weekly' or (select count(*) from jsonb_object_keys(pl -> 'wa')) = 6);
end $$;

-- W14's gate: true = HOLD the report (do not send), alert Jonathan with the failing check names.
create or replace function facts.w14_hold(p_broker uuid, p_payload jsonb default null) returns boolean language sql stable as $$
  select exists (select 1 from facts.w14_reconcile(p_broker, p_payload) where not ok) $$;
