-- =============================================================================
-- 20261002130000_smc_13_pass7.sql  —  SortMyCover build, migration 13: integration pass 7 (I-40b)
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 still gate 01–13).
-- Additive and idempotent, same conventions as 01–12.
--   1. ops.proposals.decided_via (optimisation/sql-additions.sql; W32 Decide writes it).
--   2. Microsoft Graph refresh token in Vault through n8n_app-only SECURITY DEFINER wrappers (same pattern as
--      the Paystack wrappers, 08 §1), plus smc_set_calendar_status() for W20 (I-40c /ms/callback).
--      calendar_status keeps the vocabulary already in use since 06 (W20, portal Calendar/Start):
--      ok | needs_reconnect | blocked_admin_consent. The RPC also accepts the I-40b names and maps them:
--      connected → ok, disconnected / error → needs_reconnect, consent_pending → blocked_admin_consent;
--      the original word and any detail go to calendar_status_detail (needs_human: pick one vocabulary).
--   6. I-49g (pass 2): proposals.source + ads_budget; notification kinds for smc-w26 / W03 / W20 signal keys;
--      unique smc-whatsapp-send correlation; verified_credentials object shape (I-43b); facts.broker_pulse 4-arg +
--      facts.w14_broker_report with the held lead pulse (I-43c).
--   7. I-52a (REHEARSAL-L01 F2): webhook_events_source_check widened to every source the workflows write
--      (w01_ip / w01_num rate counters, w20 Graph-notification dedupe). Superset of 02; guarded by
--      automation/tests/webhook-sources.test.mjs.
-- Inventory lines extended: INV-T03 (brokers), 0.3 #4 (Graph consent fallback).
-- =============================================================================

-- 1. decided_via
ALTER TABLE ops.proposals ADD COLUMN IF NOT EXISTS decided_via text;
COMMENT ON COLUMN ops.proposals.decided_via IS 'SMC: where the decision was taken (console | whatsapp | email); written by W32 Decide and the console RPC.';

-- 2. calendar connection metadata (token VALUE stays in Vault; the row holds the secret NAME only)
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS calendar_scopes         text,
  ADD COLUMN IF NOT EXISTS calendar_status_at      timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_status_detail  jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_smc_calendar_token_ref_name'
                  AND conrelid = 'public.brokers'::regclass) THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_smc_calendar_token_ref_name CHECK (
          (calendar_token_ref IS NULL OR calendar_token_ref ~ '^ms_refresh_[0-9a-f-]{36}_[0-9]+$')   -- Vault NAME, never a token
      AND (calendar_status_detail IS NULL OR jsonb_typeof(calendar_status_detail) = 'object'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.smc_vault_store_ms_refresh(p_broker_id uuid, p_refresh_token text,
                                                             p_tenant_id text DEFAULT NULL, p_scopes text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF p_broker_id IS NULL OR coalesce(p_refresh_token, '') = '' THEN
    RAISE EXCEPTION 'smc_vault_store_ms_refresh: broker and refresh token required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brokers b WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL) THEN
    RAISE EXCEPTION 'smc_vault_store_ms_refresh: unknown SMC broker' USING ERRCODE = '22023';
  END IF;
  -- a new name per connect (Graph rotates refresh tokens); the previous secret stays until W34 key hygiene removes it
  v_name := 'ms_refresh_' || p_broker_id::text || '_' || extract(epoch FROM clock_timestamp())::bigint;
  PERFORM vault.create_secret(p_refresh_token, v_name);
  UPDATE public.brokers b
     SET calendar_token_ref    = v_name,
         ms_tenant_id          = coalesce(nullif(p_tenant_id, ''), b.ms_tenant_id),
         calendar_scopes       = coalesce(nullif(p_scopes, ''), b.calendar_scopes),
         calendar_provider     = 'outlook',
         calendar_mode         = 'oauth',
         calendar_status       = 'ok',
         calendar_status_at    = now(),
         calendar_status_detail = NULL,
         calendar_connected_at = coalesce(b.calendar_connected_at, now())
   WHERE b.id = p_broker_id;
  RETURN v_name;
END $$;
COMMENT ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text) IS
  'SMC I-40b (W20 /ms/callback): stores the Microsoft Graph refresh token in Vault, sets calendar_token_ref (name), tenant, scopes, status ok. n8n_app only.';

CREATE OR REPLACE FUNCTION public.smc_vault_ms_refresh(p_broker_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.decrypted_secret
    FROM public.brokers b
    JOIN vault.decrypted_secrets s ON s.name = b.calendar_token_ref
   WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL AND b.calendar_status = 'ok'
   LIMIT 1
$$;
COMMENT ON FUNCTION public.smc_vault_ms_refresh(uuid) IS
  'SMC I-40b (W04/W05/W20 Graph calls): decrypted refresh token, only while brokers.calendar_status = ''ok'' (connected). n8n_app only.';

CREATE OR REPLACE FUNCTION public.smc_set_calendar_status(p_broker_id uuid, p_status text, p_detail jsonb DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  v_status := CASE p_status
    WHEN 'ok' THEN 'ok' WHEN 'connected' THEN 'ok'
    WHEN 'needs_reconnect' THEN 'needs_reconnect' WHEN 'disconnected' THEN 'needs_reconnect' WHEN 'error' THEN 'needs_reconnect'
    WHEN 'blocked_admin_consent' THEN 'blocked_admin_consent' WHEN 'consent_pending' THEN 'blocked_admin_consent'
  END;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'smc_set_calendar_status: status must be connected, disconnected, consent_pending or error' USING ERRCODE = '22023';
  END IF;
  IF p_detail IS NOT NULL AND jsonb_typeof(p_detail) <> 'object' THEN
    RAISE EXCEPTION 'smc_set_calendar_status: detail must be a JSON object' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('smc.source', 'n8n', true);
  PERFORM set_config('smc.reason', 'calendar ' || p_status, true);
  UPDATE public.brokers b
     SET calendar_status        = v_status,
         calendar_status_at     = now(),
         calendar_status_detail = coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('reported', p_status),
         calendar_connected_at  = CASE WHEN v_status = 'ok' THEN coalesce(b.calendar_connected_at, now()) ELSE b.calendar_connected_at END
   WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smc_set_calendar_status: unknown SMC broker' USING ERRCODE = '22023';
  END IF;
  RETURN v_status;
END $$;
COMMENT ON FUNCTION public.smc_set_calendar_status(uuid, text, jsonb) IS
  'SMC I-40b (W20): set calendar_status (ok | needs_reconnect | blocked_admin_consent; accepts connected/disconnected/error/consent_pending) + detail. n8n_app only.';

REVOKE ALL ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                       public.smc_vault_ms_refresh(uuid),
                       public.smc_set_calendar_status(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                          public.smc_vault_ms_refresh(uuid),
                          public.smc_set_calendar_status(uuid, text, jsonb) TO n8n_app;

-- =============================================================================
-- 3. I-41d / R5-02 — the lead pulse never reaches the broker by name (W35, FAQ-25, knowledge/faq.md).
--    Option chosen: exclude pulse rows from the broker read policies (W35 keeps writing broker_id).
--    Why: the broker's aggregate pulse (W14-broker.sql pulse_up / pulse_n, facts.fact_lead.lead_pulse*) is read by
--    n8n_app / admin from public.lead_pulse by cycle_id, never through the broker's RLS, so it is unaffected; keeping
--    broker_id on the activity rows keeps admin per-broker facts and the POPIA erase cascade unchanged, while a
--    NULL broker_id would still leave lead_id on a row joined to the broker's own lead.
--    (a) timeline: "smc broker read own timeline" (05 §4) re-created without lead_pulse / lead_pulse_line / any W35 row.
--    (b) communications: the legacy "Brokers can view their communications" (20260114101603) also exposed the
--        pulse tap / one-line answer (W07 stores it with metadata.route = 'W35') and W35's reply (whose words
--        differ for up / down). A RESTRICTIVE SELECT policy hides W35 rows from every non-admin API caller.
-- =============================================================================
DROP POLICY IF EXISTS "smc broker read own timeline" ON public.lead_activities;
CREATE POLICY "smc broker read own timeline" ON public.lead_activities FOR SELECT TO authenticated
  USING (brand_id IS NOT NULL AND broker_id = public.smc_current_broker_id()
         AND coalesce(activity_type, '') NOT IN ('lead_pulse', 'lead_pulse_line')
         AND coalesce(workflow, '') <> 'W35');
COMMENT ON POLICY "smc broker read own timeline" ON public.lead_activities IS
  'SMC (05, re-created 13 I-41d): broker reads own SMC timeline rows EXCEPT lead pulse rows (lead_pulse, lead_pulse_line, workflow W35): aggregate only, never by name.';

DROP POLICY IF EXISTS "smc hide lead pulse from brokers" ON public.communications;
CREATE POLICY "smc hide lead pulse from brokers" ON public.communications AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin()
         OR (coalesce(workflow, '') <> 'W35' AND coalesce(metadata->>'route', '') <> 'W35'
             AND coalesce(template_name, '') <> 'lead_pulse'));
COMMENT ON POLICY "smc hide lead pulse from brokers" ON public.communications IS
  'SMC 13 I-41d: lead pulse ask, answer (W07 route W35) and W35 replies are never readable by a broker; admins and n8n_app unaffected.';

-- =============================================================================
-- 4. I-41k — brokers.verified_credentials (W23 reads it via to_jsonb(b)->'verified_credentials').
-- =============================================================================
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS verified_credentials jsonb;
COMMENT ON COLUMN public.brokers.verified_credentials IS
  'SMC I-41k: JSON array of strings: designations / credentials Lead Velocity has verified (FSP register result, etc.); the only identity claims an intro script may use word for word (conversation/guardrail.mjs I-2, automation/media/intro-script.mjs). Admin-set; NULL = none.';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_smc_verified_credentials_array'
                  AND conrelid = 'public.brokers'::regclass) THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_smc_verified_credentials_array
      CHECK (verified_credentials IS NULL OR jsonb_typeof(verified_credentials) = 'array');
  END IF;
END $$;

-- 5. Field-level guard for the columns added in 13 (smc_brokers_guard in 08 §12 predates them).
--    A broker may not self-declare credentials, nor plant an admin-consent link / calendar state on his own row.
CREATE OR REPLACE FUNCTION public.smc_brokers_guard_pass7()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') OR OLD.brand_id IS NULL THEN
    RETURN NEW;   -- n8n/service connections, SECURITY DEFINER RPCs, legacy rows (same order as 08 §12)
  END IF;
  IF auth.uid() IS NULL OR public.smc_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.verified_credentials   IS DISTINCT FROM OLD.verified_credentials
  OR NEW.calendar_status_detail IS DISTINCT FROM OLD.calendar_status_detail
  OR NEW.calendar_status_at     IS DISTINCT FROM OLD.calendar_status_at
  OR NEW.calendar_scopes        IS DISTINCT FROM OLD.calendar_scopes THEN
    RAISE EXCEPTION 'smc: brokers cannot change verified credentials or calendar connection state'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_brokers_guard_pass7 ON public.brokers;
CREATE TRIGGER smc_brokers_guard_pass7 BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.smc_brokers_guard_pass7();

-- =============================================================================
-- 6. I-49g (integration pass 2) — additive, idempotent; validated on the local stub only (never the live project).
-- =============================================================================

-- 6a. I-48i / I-49i: ops.proposals.source gains 'ads_budget' (smc-ads-budget: faculty media, source ads_budget; the
--     W32 outbox never reads it as a decision because source <> 'console'). 'build' is NOT added: smc-w26 to-dos keep
--     source 'manual' and are already classed by faculty 'build' (03), so a second word for the same thing is not needed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_source_check'
                  AND conrelid = 'ops.proposals'::regclass
                  AND pg_get_constraintdef(oid) LIKE '%ads_budget%') THEN
    ALTER TABLE ops.proposals DROP CONSTRAINT IF EXISTS proposals_source_check;
    ALTER TABLE ops.proposals ADD CONSTRAINT proposals_source_check
      CHECK (source IN ('advisor','manual','kill_rule','pricing','routing','judge','ads_budget'));
  END IF;
END $$;
COMMENT ON COLUMN ops.proposals.source IS
  'SMC: advisor | manual (console, smc-w26 go-live to-dos with faculty build) | kill_rule | pricing | routing | judge | ads_budget (smc-ads-budget raise/lower, I-48i).';

-- 6b. I-49g: notification kinds. smc-w26 writes kind 'go_live' (allowed since 06) with signal_key go_live_vps_gate /
--     go_live_pending / go_live_ready; W03 (w03_no_brand), W20 (ms_client_secret_invalid) and smc-w26 (workflow_failed)
--     reach W22 as kind 'alert' + signal_key. The signal keys are also listed as kinds so a direct insert never fails
--     (same reasoning as 12 §1). The list keeps 'lead_routed_out' and 'w34_monthly_report', so 06 and 12 skip on a re-run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_kind_check'
                  AND conrelid = 'ops.notifications'::regclass
                  AND pg_get_constraintdef(oid) LIKE '%ms_client_secret_invalid%') THEN
    ALTER TABLE ops.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
    ALTER TABLE ops.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN
      ('daily_pulse','approval','red','weekly_memo','monthly_retro','build_gate','escalation_call',
       'pulse','action','action_reminder','confirm','red_email','red_resend','banner','pulse_red_email','weekly','weekly_email','monthly_email',
       'alert','lead_routed_out','ads_audit','ads_reminder','billing','go_live','portal',
       'dsar','approval_confirmed','approval_stuck','card_autorenew_off',
       'dsar_received','dsar_due','dsar_overdue','dsar_erased','broker_dsr_erase',
       'w34_retention_failure','w34_monthly_report',
       -- pass 7 (I-49g): smc-w26 go-live signal keys, W03 / W20 / smc-w26 W22 signal keys
       'go_live_ready','go_live_vps_gate','go_live_pending','w03_no_brand','ms_client_secret_invalid','workflow_failed'));
  END IF;
END $$;

-- 6c. I-49g: smc-whatsapp-send idempotency. The sub-workflow claims public.communications (workflow 'smc-whatsapp-send',
--     metadata = {correlation, kind, sent_as, dry_run, skip_reason}) with INSERT ... WHERE NOT EXISTS (same workflow +
--     metadata->>'correlation'); this index makes the claim race-proof. Scoped to that workflow, the exact predicate the
--     check uses, so another writer's metadata.correlation can never collide with a send claim.
CREATE UNIQUE INDEX IF NOT EXISTS communications_smc_send_correlation_uidx
  ON public.communications ((metadata->>'correlation'))
  WHERE workflow = 'smc-whatsapp-send' AND (metadata->>'correlation') IS NOT NULL;
COMMENT ON INDEX public.communications_smc_send_correlation_uidx IS
  'SMC I-49g: one smc-whatsapp-send claim per correlation / idempotency_key (SUB-whatsapp-send "Record communications row").';

-- 6d. I-43b: verified_credentials shape (the array check from §4 stays; legacy string entries are still read as labels
--     by automation/media/intro-script.mjs credLabels()).
COMMENT ON COLUMN public.brokers.verified_credentials IS
  'SMC I-43b (was I-41k): JSON array of objects {type, number, register_name, verified_at}. W20 appends {type:''fsp'', number, register_name, verified_at} when the FSCA check returns verified; the admin console may add others (designations). The only identity claims an intro script may use word for word (conversation/guardrail.mjs I-2, automation/media/intro-script.mjs). Brokers cannot write it (smc_brokers_guard_pass7). NULL = none.';

-- 6e. I-43c / I-48a / R6-01 / R6-05: broker-facing lead pulse (verbatim from analytics/W14-broker.sql, last block) and
--     facts.w14_broker_report (verbatim from analytics/W14-broker-payload.sql as it now stands; the 12 body + three edits).
drop function if exists facts.broker_pulse(uuid, date, int);
create or replace function facts.broker_pulse(p_cycle uuid, p_day date, p_prev_n int default null, p_prev_up int default null)
returns table (shown boolean, n int, up int)
language sql stable as $$
  with a as (
    select lp.thumbs, row_number() over (order by lp.answered_at, lp.id) as rn
      from public.lead_pulse lp
     where lp.cycle_id = p_cycle and lp.thumbs is not null and lp.answered_at is not null and facts.sa_date(lp.answered_at) <= p_day),
  t as (select count(*)::int as total from a),
  k as (select (p_prev_n >= 5 and t.total - p_prev_n < 5) as held,
               case when p_prev_n >= 5 and t.total - p_prev_n < 5 then p_prev_n
                    when t.total < 5 then null
                    else t.total end as m from t)
  select k.m is not null, k.m,
         case when k.held and p_prev_up between 0 and p_prev_n then p_prev_up
              when k.m is not null then (select count(*) from a where a.rn <= k.m and a.thumbs = 'up')::int end
    from k
$$;
comment on function facts.broker_pulse(uuid, date, int, int) is 'Broker-facing lead pulse (I-43c, R6-05): per cycle, held on the stored n and up of the last report until 5 new answers, null below 5. A POPIA erase never moves a held figure. Never use cycle_counts.pulse_* in a broker surface.';

SET check_function_bodies = off;
-- >>> verbatim from analytics/W14-broker-payload.sql (facts.w14_broker_report)
create or replace function facts.w14_broker_report(p_broker uuid, p_day date default null, p_edition text default null)
returns jsonb language plpgsql stable as $$
declare
  pr facts.v_params%rowtype; c public.cycles%rowtype; b public.brokers%rowtype;
  d date; tier text; n record; w record; pu record; pv_n int; pv_up int;
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
  -- I-43c: broker-facing pulse = per cycle, hidden under 5 answers, held until 5 new answers; never n.pulse_* (live) and never a week-on-week figure.
  -- p_prev_n = the answer count behind the last pulse figure this broker was sent this cycle (any earlier edition up to today, incl. midcycle/cycle-end; not held/failed). R6-01: never skip a report 1-3 days old.
  -- R6-05: hold on the STORED n and up of that report, never a recount (a POPIA erase must not shift a held figure).
  select (rh.report_data #>> '{s4_quality,lead_pulse,n}')::int, (rh.report_data #>> '{s4_quality,lead_pulse,up}')::int into pv_n, pv_up
    from public.report_history rh
   where rh.broker_id = p_broker and rh.cycle_id = c.id and rh.brand_id is not null and rh.status in ('sent','partial','generated') and rh.week <= d
     and (rh.report_data #>> '{s4_quality,lead_pulse,n}') is not null order by rh.week desc limit 1;
  select * into pu from facts.broker_pulse(c.id, d, pv_n, pv_up);
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
    's4_quality', jsonb_build_object('avg_rating', facts.vtl(n.quality_avg, 4.0, w.quality_avg), 'ratings_given', facts.vtl(rated_now, 0.90, rated_prev), 'mix', mix, 'themes', themes,
      'lead_pulse', case when pu.shown then jsonb_build_object('shown', true, 'n', pu.n, 'up', pu.up,
          'text', format('%s of %s people said the call was worth their time (answers so far this cycle).', pu.up, pu.n))
        else jsonb_build_object('shown', false, 'n', null, 'up', null, 'text', 'Fewer than 5 answers yet.') end),
    's5_notice', notices,
    's6_roi', roi,
    's7_ask', ask,
    's8_cycle', jsonb_build_object('line', cycle_line),
    'wa', wa);
end $$;
comment on function facts.w14_broker_report(uuid, date, text) is 'W14 broker report payload in the broker_report/1 shape (automation/W14-broker.md). One payload feeds WhatsApp, portal, email and PDF.';
-- <<< end verbatim
RESET check_function_bodies;
-- CREATE OR REPLACE resets SECURITY DEFINER / search_path: re-pin both, same revoke / grant as the other facts.w14_* helpers.
ALTER FUNCTION facts.broker_pulse(uuid, date, int, int)  SECURITY DEFINER SET search_path = public, facts, pg_temp;
ALTER FUNCTION facts.w14_broker_report(uuid, date, text) SECURITY DEFINER SET search_path = public, facts, pg_temp;
REVOKE ALL ON FUNCTION facts.broker_pulse(uuid, date, int, int), facts.w14_broker_report(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION facts.broker_pulse(uuid, date, int, int), facts.w14_broker_report(uuid, date, text) TO n8n_app;

-- =============================================================================
-- 7. I-52a — webhook_events.source CHECK covers every writer (REHEARSAL-L01 F2: every page lead 500'd).
--    02 §13 created the inline CHECK (auto-named webhook_events_source_check); no later migration touched it
--    (06 only reads webhook_events in facts.fact_system_day). Widened here, superset of 02, nothing removed.
--    Values and their writers (literal `source` in INSERT INTO public.webhook_events, automation/W*.json + SUB-*.json):
--      meta_leadgen, meta_feed, meta_messages, graph, flow, other  — 02 reserved values (no workflow literal today)
--      whatsapp  — W07 wamid claim, W07 + W03 reply claim (external_id 'w07:reply:{wamid}'),
--                  W03 'w03:no_brand:{phone_number_id}', W03/W07 'hop_limit:{wamid}' (prefixes are external_id, not source)
--      paystack  — W16 Paystack webhook idempotency
--      w01_ip    — W01 per-IP rate counter (HMAC of IP, no raw IP)
--      w01_num   — W01 per-number rate counter (digits-only hash)
--      w20       — W20 Microsoft Graph change-notification dedupe
--    automation/tests/webhook-sources.test.mjs re-extracts the literals and fails if one is missing from this list.
--    Idempotent: re-created only when the live definition lacks the newest value.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.webhook_events'::regclass
                    AND conname  = 'webhook_events_source_check'
                    AND pg_get_constraintdef(oid) LIKE '%w01_num%'
                    AND pg_get_constraintdef(oid) LIKE '%''w20''%') THEN
    ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_source_check;
    ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_source_check CHECK (source IN
      ('meta_leadgen','whatsapp','meta_feed','meta_messages','paystack','graph','flow','other',   -- 02
       'w01_ip','w01_num',                                                                        -- W01 rate counters
       'w20'));                                                                                   -- W20 Graph dedupe
  END IF;
END $$;
COMMENT ON CONSTRAINT webhook_events_source_check ON public.webhook_events IS
  'SMC 13 §7 (I-52a): 02 values + w01_ip/w01_num (W01 rate counters) + w20 (W20 Graph dedupe). W03/W07 claim keys use source whatsapp. Guarded by automation/tests/webhook-sources.test.mjs.';
