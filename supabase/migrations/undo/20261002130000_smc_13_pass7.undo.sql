-- UNDO of 20261002130000_smc_13_pass7.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP TRIGGER IF EXISTS "smc_brokers_guard_pass7" ON "public"."brokers";
DROP POLICY IF EXISTS "smc hide lead pulse from brokers" ON "public"."communications";
DROP POLICY IF EXISTS "smc broker read own timeline" ON "public"."lead_activities";
CREATE POLICY "smc broker read own timeline" ON "public"."lead_activities" FOR SELECT TO authenticated
  USING (((brand_id IS NOT NULL) AND (broker_id = smc_current_broker_id())));
DROP FUNCTION IF EXISTS facts.broker_pulse(p_cycle uuid, p_day date, p_prev_n integer, p_prev_up integer) CASCADE;
CREATE OR REPLACE FUNCTION facts.w14_broker_report(p_broker uuid, p_day date DEFAULT NULL::date, p_edition text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'facts', 'pg_temp'
AS $function$
declare
  pr facts.v_params%rowtype; c public.cycles%rowtype; b public.brokers%rowtype;
  d date; tier text; n record; w record;
  start_d date; end_d date; elapsed int; cycle_len int; pace int; week_no int; weeks_in int; send_day date; edition text; on_track boolean;
  show_now numeric; show_prev numeric; rated_now numeric; rated_prev numeric; light_show text;
  lastwk jsonb; nxt jsonb; unmarked jsonb; followups jsonb; not_reached jsonb; mix jsonb; themes jsonb; notices jsonb := '[]'::jsonb;
  n_unmarked int; n_follow int; n_missed int; todo_words text;
  roi jsonb;
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

  -- 6. ROI view: compliance review 4 - policies_reported, tracking_to and every close-rate figure are NOT stored in the payload.
  -- The portal reads cycles.policies_written_reported / brokers.close_rate directly for the broker's own view; reports.payload_json carries only {shown:false}.
  roi := jsonb_build_object('shown', false);

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
            'v7', format('Replacements used: %s.', n.replacements_used) || end_note)
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
      'replacements', jsonb_build_object('used', n.replacements_used, 'last_used', w.replacements_used),   -- no cap, no light: goodwill, 3 requests a calendar week (LGSA 7.2), not a per-cycle allowance
      'days_left', greatest(0, facts.sa_date(coalesce(c.extended_until, c.ends_at)) - d - 1)),
    's3_meetings', jsonb_build_object('last_week', lastwk, 'next_week', nxt,
      'todos', jsonb_build_object('unmarked', unmarked, 'followups_due', followups, 'not_reached', not_reached)),
    's4_quality', jsonb_build_object('avg_rating', facts.vtl(n.quality_avg, 4.0, w.quality_avg), 'ratings_given', facts.vtl(rated_now, 0.90, rated_prev), 'mix', mix, 'themes', themes),
    's5_notice', notices,
    's6_roi', roi,
    's7_ask', ask,
    's8_cycle', jsonb_build_object('line', cycle_line),
    'wa', wa);
end $function$;  -- restore previous definition (function was replaced here)
DROP FUNCTION IF EXISTS public.smc_brokers_guard_pass7() CASCADE;
DROP FUNCTION IF EXISTS public.smc_set_calendar_status(p_broker_id uuid, p_status text, p_detail jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.smc_vault_ms_refresh(p_broker_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_vault_store_ms_refresh(p_broker_id uuid, p_refresh_token text, p_tenant_id text, p_scopes text) CASCADE;
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_smc_calendar_token_ref_name";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_smc_verified_credentials_array";
ALTER TABLE "ops"."notifications" DROP CONSTRAINT IF EXISTS "notifications_kind_check";
ALTER TABLE "ops"."notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ((kind = ANY (ARRAY['daily_pulse'::text, 'approval'::text, 'red'::text, 'weekly_memo'::text, 'monthly_retro'::text, 'build_gate'::text, 'escalation_call'::text, 'pulse'::text, 'action'::text, 'action_reminder'::text, 'confirm'::text, 'red_email'::text, 'red_resend'::text, 'banner'::text, 'pulse_red_email'::text, 'weekly'::text, 'weekly_email'::text, 'monthly_email'::text, 'alert'::text, 'lead_routed_out'::text, 'ads_audit'::text, 'ads_reminder'::text, 'billing'::text, 'go_live'::text, 'portal'::text, 'dsar'::text, 'approval_confirmed'::text, 'approval_stuck'::text, 'card_autorenew_off'::text, 'dsar_received'::text, 'dsar_due'::text, 'dsar_overdue'::text, 'dsar_erased'::text, 'broker_dsr_erase'::text, 'w34_retention_failure'::text, 'w34_monthly_report'::text])));  -- previous definition
ALTER TABLE "ops"."proposals" DROP CONSTRAINT IF EXISTS "proposals_source_check";
ALTER TABLE "ops"."proposals" ADD CONSTRAINT "proposals_source_check" CHECK ((source = ANY (ARRAY['advisor'::text, 'manual'::text, 'kill_rule'::text, 'pricing'::text, 'routing'::text, 'judge'::text])));  -- previous definition
ALTER TABLE "public"."webhook_events" DROP CONSTRAINT IF EXISTS "webhook_events_source_check";
ALTER TABLE "public"."webhook_events" ADD CONSTRAINT "webhook_events_source_check" CHECK ((source = ANY (ARRAY['meta_leadgen'::text, 'whatsapp'::text, 'meta_feed'::text, 'meta_messages'::text, 'paystack'::text, 'graph'::text, 'flow'::text, 'other'::text])));  -- previous definition
DROP INDEX IF EXISTS "public"."communications_smc_send_correlation_uidx";
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "decided_via" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_scopes" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_status_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_status_detail" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "verified_credentials" CASCADE;  -- data in this column is lost
COMMIT;
