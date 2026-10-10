-- UNDO of 20261002060000_smc_06_pass2.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP TRIGGER IF EXISTS "smc_brokers_billing_ref" ON "public"."brokers";
DROP TRIGGER IF EXISTS "smc_cycles_fill" ON "public"."cycles";
DROP TRIGGER IF EXISTS "smc_invoices_fill" ON "public"."invoices_smc";
DROP TRIGGER IF EXISTS "notifications_sync_to" ON "ops"."notifications";
DROP TRIGGER IF EXISTS "smc_pricing_notify" ON "public"."pricing";
DROP VIEW IF EXISTS "facts"."fact_ad_day" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_ad_day AS  WITH spend AS (
         SELECT am.date,
            am.brand_id,
            am.ad_id,
            max(am.campaign_id) AS campaign_id,
            max(am.adset_id) AS adset_id,
            max(am.concept) AS concept,
            max(am.angle) AS angle,
            max(am.format) AS format,
            sum(am.spend_zar) AS spend_zar,
            sum(am.impressions) AS impressions,
            sum(am.clicks) AS clicks,
            sum(am.leads_raw) AS leads_meta,
            max(am.frequency) AS frequency,
            avg(am.hook_rate) AS hook_rate,
            avg(am.hold_rate) AS hold_rate,
            max(am.emq) AS emq
           FROM ad_metrics am
          GROUP BY am.date, am.brand_id, am.ad_id
        ), leadside AS (
         SELECT fl.created_date AS date,
            fl.brand_id,
            fl.ad_id,
            count(*) AS leads,
            count(*) FILTER (WHERE fl.verified) AS verified,
            count(*) FILTER (WHERE fl.qualified) AS qualified,
            count(*) FILTER (WHERE fl.booked) AS booked,
            count(*) FILTER (WHERE fl.attended) AS attended,
            count(*) FILTER (WHERE fl.good_fit) AS good_fit,
            count(fl.quality_score) AS quality_n,
            round(avg(fl.quality_score), 2) AS quality_avg,
            count(*) FILTER (WHERE fl.disposition_code = ANY (ARRAY['nofit_budget'::smc_disposition_code, 'nofit_covered'::smc_disposition_code, 'nofit_criteria'::smc_disposition_code])) AS nofit
           FROM facts.fact_lead fl
          WHERE fl.ad_id IS NOT NULL
          GROUP BY fl.created_date, fl.brand_id, fl.ad_id
        )
 SELECT COALESCE(s.date, ls.date) AS date,
    COALESCE(s.brand_id, ls.brand_id) AS brand_id,
    COALESCE(s.ad_id, ls.ad_id) AS ad_id,
    s.campaign_id,
    s.adset_id,
    s.concept,
    s.angle,
    s.format,
    COALESCE(s.spend_zar, 0::numeric) AS spend_zar,
    s.impressions,
    s.clicks,
    s.leads_meta,
    s.frequency,
    s.hook_rate,
    s.hold_rate,
    s.emq,
    COALESCE(ls.leads, 0::bigint) AS leads,
    COALESCE(ls.verified, 0::bigint) AS verified,
    COALESCE(ls.qualified, 0::bigint) AS qualified,
    COALESCE(ls.booked, 0::bigint) AS booked,
    COALESCE(ls.attended, 0::bigint) AS attended,
    COALESCE(ls.good_fit, 0::bigint) AS good_fit,
    COALESCE(ls.quality_n, 0::bigint) AS quality_n,
        CASE
            WHEN COALESCE(ls.quality_n, 0::bigint) >= 5 THEN ls.quality_avg
            ELSE NULL::numeric
        END AS quality_index,
    COALESCE(ls.nofit, 0::bigint) AS nofit
   FROM spend s
     FULL JOIN leadside ls ON ls.date = s.date AND ls.brand_id = s.brand_id AND ls.ad_id = s.ad_id;
DROP VIEW IF EXISTS "facts"."fact_booking" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_booking AS  SELECT a.id AS booking_id,
    facts.lead_key(a.client_id) AS lead_key,
    a.brand_id,
    a.broker_id,
    a.cycle_id,
    facts.sa_date(a.appointment_date) AS slot_date,
    a.appointment_date AS starts_at,
    a.ends_at,
    a.method,
    a.booked_via,
    a.status,
    a.calendar_provider,
    a.graph_event_id IS NOT NULL AS has_calendar_event,
    a.invite_email_status,
    a.reschedule_count,
    a.previous_booking_id IS NOT NULL AS is_reschedule,
    a.confirmed_at IS NOT NULL AS confirmed,
    round(EXTRACT(epoch FROM a.appointment_date - COALESCE(a.booked_at, a.created_at)) / 3600::numeric, 1) AS lead_time_hours,
    facts.sa_date(COALESCE(a.booked_at, a.created_at)) AS booked_date
   FROM appointments a
     JOIN leads l ON l.id = a.client_id
  WHERE a.brand_id IS NOT NULL AND (NOT l.is_synthetic OR facts.include_synthetic());
DROP VIEW IF EXISTS "facts"."fact_broker_day" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_broker_day AS  WITH days AS (
         SELECT b_1.id AS broker_id,
            b_1.brand_id,
            gs.gs::date AS date
           FROM brokers b_1
             CROSS JOIN LATERAL generate_series((( SELECT facts.sa_date(min(c.starts_at)) AS sa_date
                   FROM cycles c
                  WHERE c.broker_id = b_1.id))::timestamp with time zone, (facts.sa_date(now()) + b_1.horizon_days)::timestamp with time zone, '1 day'::interval) gs(gs)
          WHERE b_1.brand_id IS NOT NULL
        )
 SELECT d.broker_id,
    d.brand_id,
    d.date,
    ( SELECT c.id
           FROM cycles c
          WHERE c.broker_id = d.broker_id AND d.date >= facts.sa_date(c.starts_at) AND d.date < facts.sa_date(COALESCE(c.extended_until, c.ends_at))
          ORDER BY c.starts_at DESC
         LIMIT 1) AS cycle_id,
        CASE
            WHEN b.meeting_hours ? lower(to_char(d.date::timestamp with time zone, 'Dy'::text)) AND NOT b.bookings_paused THEN b.max_meetings_per_day
            ELSE 0
        END AS capacity_slots,
    ( SELECT count(*) AS count
           FROM facts.fact_lead fl
          WHERE fl.broker_id = d.broker_id AND fl.created_date = d.date) AS leads_routed,
    ( SELECT count(*) AS count
           FROM facts.fact_booking fb
          WHERE fb.broker_id = d.broker_id AND fb.booked_date = d.date AND NOT fb.is_reschedule) AS bookings_made,
    ( SELECT count(*) AS count
           FROM facts.fact_booking fb
          WHERE fb.broker_id = d.broker_id AND fb.slot_date = d.date AND (fb.status = ANY (ARRAY['booked'::text, 'confirmed'::text, 'attended'::text, 'no_show'::text]))) AS meetings_scheduled,
    ( SELECT count(*) AS count
           FROM facts.fact_outcome fo
          WHERE fo.broker_id = d.broker_id AND fo.slot_date = d.date AND fo.outcome = 'attended'::text) AS meetings_held,
    ( SELECT count(*) AS count
           FROM facts.fact_booking fb
          WHERE fb.broker_id = d.broker_id AND fb.slot_date = d.date AND (fb.status = ANY (ARRAY['booked'::text, 'confirmed'::text])) AND fb.ends_at < now() AND NOT (EXISTS ( SELECT 1
                   FROM outcomes o
                  WHERE o.booking_id = fb.booking_id))) AS outcomes_unmarked,
    (EXISTS ( SELECT 1
           FROM report_history r
          WHERE r.broker_id = d.broker_id AND r.brand_id IS NOT NULL AND d.date >= r.week AND d.date <= (r.week + 6) AND (r.opened_portal_at IS NOT NULL OR r.opened_wa_at IS NOT NULL))) AS report_opened
   FROM days d
     JOIN brokers b ON b.id = d.broker_id;
DROP VIEW IF EXISTS "facts"."fact_broker_roi" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_cost" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_cost AS  WITH raw AS (
         SELECT am.date,
            'media'::text AS kind,
            am.brand_id,
            NULL::uuid AS broker_id,
            sum(am.spend_zar) AS amount_zar,
            'ad_metrics'::text AS source
           FROM ad_metrics am
          GROUP BY am.date, am.brand_id
        UNION ALL
         SELECT c.date,
            c.kind,
            c.brand_id,
            c.broker_id,
            c.amount_zar,
            COALESCE(c.source_ref, 'ops.costs'::text) AS "coalesce"
           FROM ops.costs c
        ), share AS (
         SELECT l.brand_id,
            facts.sa_date(l.created_at) AS date,
            l.broker_id,
            count(*)::numeric / sum(count(*)) OVER (PARTITION BY l.brand_id, (facts.sa_date(l.created_at))) AS share
           FROM leads l
          WHERE l.brand_id IS NOT NULL AND l.broker_id IS NOT NULL AND (NOT l.is_synthetic OR facts.include_synthetic())
          GROUP BY l.brand_id, (facts.sa_date(l.created_at)), l.broker_id
        )
 SELECT r.date,
    r.kind,
    r.brand_id,
    r.broker_id,
    r.amount_zar,
    r.source,
    'direct'::text AS allocation
   FROM raw r
  WHERE r.broker_id IS NOT NULL
UNION ALL
 SELECT r.date,
    r.kind,
    r.brand_id,
    s.broker_id,
    round(r.amount_zar * COALESCE(s.share, 1::numeric), 2) AS amount_zar,
    r.source,
        CASE
            WHEN s.broker_id IS NULL THEN 'unallocated'::text
            ELSE 'lead_share'::text
        END AS allocation
   FROM raw r
     LEFT JOIN share s ON NOT s.brand_id IS DISTINCT FROM r.brand_id AND s.date = r.date
  WHERE r.broker_id IS NULL;
DROP VIEW IF EXISTS "facts"."fact_cycle" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_cycle AS  SELECT c.id AS cycle_id,
    c.broker_id,
    c.brand_id,
    c.tier_code,
    c.cycle_no,
    c.status,
    c.starts_at,
    c.ends_at,
    c.extended_until,
    c.price_zar,
    c.committed_leads,
    c.replacement_cap,
    c.media_share_zar,
    x.delivered,
    x.leads_total,
    x.booked,
    x.attended,
    x.no_show,
    x.good_fit,
    ( SELECT count(*) AS count
           FROM replacements r
          WHERE r.cycle_id = c.id AND r.status <> 'rejected'::text) AS replacements_used,
    GREATEST(c.committed_leads - x.delivered, 0::bigint) AS shortfall_now,
    k.media_zar,
    k.whatsapp_zar,
    k.llm_zar,
    k.infra_zar,
    k.fees_zar,
    k.other_zar,
    k.media_zar + k.whatsapp_zar + k.llm_zar + k.infra_zar + k.fees_zar + k.other_zar AS cost_zar,
    c.price_zar - (k.media_zar + k.whatsapp_zar + k.llm_zar + k.infra_zar + k.fees_zar + k.other_zar) AS margin_zar,
    round((c.price_zar - (k.media_zar + k.whatsapp_zar + k.llm_zar + k.infra_zar + k.fees_zar + k.other_zar)) / NULLIF(c.price_zar, 0::numeric), 4) AS margin_pct,
    c.policies_written_reported
   FROM cycles c
     CROSS JOIN LATERAL ( SELECT count(*) FILTER (WHERE fl.verified AND fl.qualified AND NOT fl.is_replacement_lead) AS delivered,
            count(*) AS leads_total,
            count(*) FILTER (WHERE fl.booked) AS booked,
            count(*) FILTER (WHERE fl.attended) AS attended,
            count(*) FILTER (WHERE fl.no_show) AS no_show,
            count(*) FILTER (WHERE fl.good_fit) AS good_fit
           FROM facts.fact_lead fl
          WHERE fl.cycle_id = c.id) x
     CROSS JOIN LATERAL ( SELECT COALESCE(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'media'::text), 0::numeric) AS media_zar,
            COALESCE(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'whatsapp'::text), 0::numeric) AS whatsapp_zar,
            COALESCE(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'llm'::text), 0::numeric) AS llm_zar,
            COALESCE(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'infra'::text), 0::numeric) AS infra_zar,
            COALESCE(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'fees'::text), 0::numeric) AS fees_zar,
            COALESCE(sum(fc.amount_zar) FILTER (WHERE fc.kind = 'other'::text), 0::numeric) AS other_zar
           FROM facts.fact_cost fc
          WHERE fc.broker_id = c.broker_id AND fc.date >= facts.sa_date(c.starts_at) AND fc.date < facts.sa_date(COALESCE(c.extended_until, c.ends_at))) k;
DROP VIEW IF EXISTS "facts"."fact_lead_theme" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_lead" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_lead AS  SELECT facts.lead_key(l.id) AS lead_key,
    l.brand_id,
    l.broker_id,
    l.cycle_id,
    l.tier_code,
    facts.sa_date(l.created_at) AS created_date,
    l.created_at,
    l.origin,
    l.campaign_id,
    l.adset_id,
    l.ad_id,
    l.concept,
    l.angle,
    l.placement,
    l.utm_source,
    l.utm_medium,
    l.utm_campaign,
    l.utm_content,
    l.consent_mode,
    l.consent_at IS NOT NULL AS consented,
    l.consent_ads_at IS NOT NULL AS consented_ads,
    l.line_type,
    l.age_band,
    l.budget_band,
    l.bond,
    l.dependants,
    l.work_cover,
    l.method_pref,
    l.language,
    l.best_time,
    EXTRACT(epoch FROM l.first_message_at - l.created_at)::integer AS first_message_seconds,
    l.wa_delivered_at IS NOT NULL AS delivered,
    l.verified_at IS NOT NULL AS verified,
    l.verified_at IS NOT NULL AND l.first_message_at IS NOT NULL AND l.verified_at <= (l.first_message_at + '72:00:00'::interval) AS verified_within_72h,
    l.first_message_at IS NOT NULL AND l.first_message_at <= (now() - '72:00:00'::interval) AS verify_window_closed,
    l.qualified_at IS NOT NULL AS qualified,
    l.disqualified_reason,
    bk.lead_id IS NOT NULL AS booked,
    bk.first_booked_at,
    bk.method AS booked_method,
    oc.outcome,
    oc.outcome = 'attended'::text AS attended,
    oc.outcome = 'no_show'::text AS no_show,
    oc.disposition_code,
    oc.disposition_code = ANY (ARRAY['fit_proceeding'::smc_disposition_code, 'fit_followup'::smc_disposition_code]) AS good_fit,
    oc.quality_score,
    lp.thumbs AS lead_pulse,
    l.stage,
    l.stage_entered_at,
    l.opted_out_at IS NOT NULL AS opted_out,
    rp.id IS NOT NULL AS replacement_claimed,
    rp.status AS replacement_status,
    (EXISTS ( SELECT 1
           FROM replacements r2
          WHERE r2.replacement_lead_id = l.id AND r2.status <> 'rejected'::text)) AS is_replacement_lead,
    ( SELECT
                CASE
                    WHEN sum(am.leads_raw) > 0 THEN round(sum(am.spend_zar) / sum(am.leads_raw)::numeric, 2)
                    ELSE NULL::numeric
                END AS "case"
           FROM ad_metrics am
          WHERE am.ad_id = l.ad_id AND am.date = facts.sa_date(l.created_at)) AS attributed_media_zar,
    l.is_synthetic
   FROM leads l
     LEFT JOIN LATERAL ( SELECT a.client_id AS lead_id,
            min(COALESCE(a.booked_at, a.created_at)) AS first_booked_at,
            (array_agg(a.method ORDER BY a.appointment_date DESC))[1] AS method
           FROM appointments a
          WHERE a.client_id = l.id AND a.brand_id IS NOT NULL
          GROUP BY a.client_id) bk ON true
     LEFT JOIN LATERAL ( SELECT o.outcome,
            o.disposition_code,
            o.quality_score
           FROM outcomes o
          WHERE o.lead_id = l.id
          ORDER BY o.marked_at DESC
         LIMIT 1) oc ON true
     LEFT JOIN LATERAL ( SELECT p.thumbs
           FROM lead_pulse p
          WHERE p.lead_id = l.id AND p.answered_at IS NOT NULL
          ORDER BY p.answered_at DESC
         LIMIT 1) lp ON true
     LEFT JOIN LATERAL ( SELECT r.id,
            r.status
           FROM replacements r
          WHERE r.lead_id = l.id AND r.status <> 'rejected'::text
         LIMIT 1) rp ON true
  WHERE l.brand_id IS NOT NULL AND (NOT l.is_synthetic OR facts.include_synthetic());
DROP VIEW IF EXISTS "facts"."fact_outcome" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_outcome AS  SELECT o.id AS outcome_id,
    o.booking_id,
    facts.lead_key(o.lead_id) AS lead_key,
    o.brand_id,
    o.broker_id,
    o.cycle_id,
    facts.sa_date(a.appointment_date) AS slot_date,
    o.outcome,
    o.disposition_code,
    o.disposition_code = ANY (ARRAY['fit_proceeding'::smc_disposition_code, 'fit_followup'::smc_disposition_code]) AS good_fit,
    o.quality_score,
    o.lead_reach_check,
    o.marked_via,
    o.auto_marked,
    o.unconfirmed,
    o.dispute_status,
    o.replacement_eligible,
    round(EXTRACT(epoch FROM o.marked_at - COALESCE(a.ends_at, a.appointment_date)) / 60::numeric, 0) AS marked_minutes_after_slot,
    o.voice_note_url IS NOT NULL AS has_voice_note,
    o.summary AS summary_redacted
   FROM outcomes o
     JOIN appointments a ON a.id = o.booking_id
     JOIN leads l ON l.id = o.lead_id
  WHERE NOT l.is_synthetic OR facts.include_synthetic();
DROP VIEW IF EXISTS "facts"."fact_page_day" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_system_day" CASCADE;
DROP VIEW IF EXISTS "facts"."pulse_daily" CASCADE;
DROP VIEW IF EXISTS "facts"."v_watchlist_daily" CASCADE;
DROP VIEW IF EXISTS "ops"."alert_recipients" CASCADE;
DROP VIEW IF EXISTS "ops"."build_state_latest" CASCADE;
DROP VIEW IF EXISTS "ops"."w22_metrics" CASCADE;
DROP VIEW IF EXISTS "public"."ads" CASCADE;
DROP VIEW IF EXISTS "public"."bookings" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW public.bookings WITH (security_invoker=true) AS  SELECT id,
    brand_id,
    broker_id,
    client_id AS lead_id,
    cycle_id,
    appointment_date AS starts_at,
    ends_at,
    method,
    status,
    calendar_provider,
    graph_event_id,
    graph_calendar_id,
    ical_uid,
    join_url,
    ics_url,
    call_number,
    invite_email_status,
    booked_via AS source,
    booked_at,
    schedule_event_id,
    confirmed_at,
    cancelled_at,
    reschedule_count,
    previous_booking_id,
    created_at,
    updated_at
   FROM appointments a
  WHERE brand_id IS NOT NULL;
DROP VIEW IF EXISTS "public"."smc_reports" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW public.smc_reports WITH (security_invoker=true) AS  SELECT id,
    brand_id,
    broker_id,
    cycle_id,
    week,
    report_kind,
    report_data AS payload_json,
    pdf_url,
    sent_wa_at,
    sent_email_at,
    opened_portal_at,
    opened_wa_at,
    ask,
    ask_done_at,
    judge_passed,
    status,
    created_at
   FROM report_history r
  WHERE brand_id IS NOT NULL;
DROP FUNCTION IF EXISTS ops.judge_samples(p_date date) CASCADE;
DROP FUNCTION IF EXISTS ops.notifications_due() CASCADE;
DROP FUNCTION IF EXISTS ops.notifications_sync_to() CASCADE;
DROP FUNCTION IF EXISTS ops.proposal_actuals(p_date date) CASCADE;
DROP FUNCTION IF EXISTS ops.redact(p text) CASCADE;
CREATE OR REPLACE FUNCTION public.smc_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- column names whose VALUES never enter the audit log (2.1.7, pre-mortem #10)
  pii constant text[] := ARRAY[
    'first_name','last_name','phone','phone_number','email','mobile','call_number','alt_number',
    'whatsapp_number','contact_person','address','firm_address','client_ip','client_user_agent',
    'content','recipient_contact','subject','transcript','summary','voice_note_url','text_redacted',
    'line','notes','conv_state','reference_raw','signer_ip','signed_user_agent','requester',
    'requester_contact','google_calendar_token','calendar_email','author_hash','note'];
  o jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  n jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  r jsonb := coalesce(n, o);
  d jsonb := '{}'::jsonb;
  k text;
  v_role text;
BEGIN
  -- brand-scoped mode for shared legacy tables: only SortMyCover rows are audited
  IF TG_NARGS > 0 AND TG_ARGV[0] = 'brand_scoped'
     AND coalesce(n->>'brand_id', o->>'brand_id') IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k NOT IN ('updated_at') AND (n->k) IS DISTINCT FROM (o->k) THEN
        d := d || jsonb_build_object(k, CASE WHEN k = ANY (pii)
                                             THEN jsonb_build_object('changed', true)
                                             ELSE jsonb_build_object('old', o->k, 'new', n->k) END);
      END IF;
    END LOOP;
    IF d = '{}'::jsonb THEN
      RETURN NULL;   -- no-op update
    END IF;
  ELSE
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF (r->k) IS NOT NULL AND (r->k) <> 'null'::jsonb THEN
        d := d || jsonb_build_object(k, CASE WHEN k = ANY (pii) THEN to_jsonb('[redacted]'::text) ELSE r->k END);
      END IF;
    END LOOP;
  END IF;

  v_role := CASE
              WHEN auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role)  THEN 'admin'
              WHEN auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'broker'::public.app_role) THEN 'broker'
              WHEN coalesce(current_setting('role', true), 'none') NOT IN ('none', '') THEN current_setting('role', true)
              ELSE session_user::text
            END;

  INSERT INTO public.audit_log (actor_uid, actor_role, source, table_name, row_id, action, diff, reason)
  VALUES (auth.uid(), v_role,
          nullif(current_setting('smc.source', true), ''),
          TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          coalesce(r->>'id', r->>'tier_code', r->>'code'),
          TG_OP, d,
          nullif(current_setting('smc.reason', true), ''));
  RETURN NULL;
END $function$;  -- restore previous definition (function was replaced here)
DROP FUNCTION IF EXISTS public.smc_brokers_billing_ref() CASCADE;
CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.brand_id IS NULL OR auth.uid() IS NULL OR public.smc_is_admin() THEN
    RETURN NEW;   -- legacy rows, n8n/service connections and admins are not restricted here
  END IF;
  IF NEW.status            IS DISTINCT FROM OLD.status
  OR NEW.brand_id          IS DISTINCT FROM OLD.brand_id
  OR NEW.tier_code         IS DISTINCT FROM OLD.tier_code
  OR NEW.ref_code          IS DISTINCT FROM OLD.ref_code
  OR NEW.user_id           IS DISTINCT FROM OLD.user_id
  OR NEW.current_cycle_id  IS DISTINCT FROM OLD.current_cycle_id
  OR NEW.approved_live_by  IS DISTINCT FROM OLD.approved_live_by
  OR NEW.approved_live_at  IS DISTINCT FROM OLD.approved_live_at
  OR NEW.fsp_verified_at   IS DISTINCT FROM OLD.fsp_verified_at
  OR NEW.fsp_check         IS DISTINCT FROM OLD.fsp_check
  OR NEW.routing_on        IS DISTINCT FROM OLD.routing_on
  OR NEW.routing_rules     IS DISTINCT FROM OLD.routing_rules
  OR NEW.consent_mode      IS DISTINCT FROM OLD.consent_mode
  OR NEW.paystack_customer_code IS DISTINCT FROM OLD.paystack_customer_code
  OR NEW.calendar_token_ref IS DISTINCT FROM OLD.calendar_token_ref
  OR NEW.intro_card_url    IS DISTINCT FROM OLD.intro_card_url
  OR NEW.intro_voice_url   IS DISTINCT FROM OLD.intro_voice_url
  OR NEW.intro_video_url   IS DISTINCT FROM OLD.intro_video_url THEN
    RAISE EXCEPTION 'smc: brokers cannot change status, tier, routing, consent mode, FSP verification, go-live, billing or approved media fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;  -- restore previous definition (function was replaced here)
DROP FUNCTION IF EXISTS public.smc_cycles_fill() CASCADE;
DROP FUNCTION IF EXISTS public.smc_invoices_fill() CASCADE;
DROP FUNCTION IF EXISTS public.smc_portal_event(p_type text, p_step text, p_payload jsonb, p_event_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_portal_touch() CASCADE;
DROP FUNCTION IF EXISTS public.smc_pricing_notify() CASCADE;
DROP FUNCTION IF EXISTS public.smc_report_ask_done(p_report_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_watchlist_tiles(p_include_synthetic boolean) CASCADE;
ALTER TABLE "public"."appointments" DROP CONSTRAINT IF EXISTS "appointments_intro_arm_check";
ALTER TABLE "public"."bank_credits" DROP CONSTRAINT IF EXISTS "bank_credits_duplicate_of_fkey";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_next_tier_code_fkey";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_smc_pass2_checks";
ALTER TABLE "public"."comments" DROP CONSTRAINT IF EXISTS "comments_status_check";
ALTER TABLE "public"."cycles" DROP CONSTRAINT IF EXISTS "cycles_dates_together";
ALTER TABLE "public"."cycles" DROP CONSTRAINT IF EXISTS "cycles_invoice_id_fkey";
ALTER TABLE "public"."invoices_smc" DROP CONSTRAINT IF EXISTS "invoices_smc_amount_chk";
ALTER TABLE "ops"."notifications" DROP CONSTRAINT IF EXISTS "notifications_pass2_checks";
ALTER TABLE "ops"."notifications" DROP CONSTRAINT IF EXISTS "notifications_proposal_id_fkey";
ALTER TABLE "ops"."proposals" DROP CONSTRAINT IF EXISTS "ops_proposals_verdict_chk";
ALTER TABLE "public"."pricing" DROP CONSTRAINT IF EXISTS "pricing_ref_code_check";
ALTER TABLE "public"."report_history" DROP CONSTRAINT IF EXISTS "report_history_edition_check";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_status_check";
ALTER TABLE "public"."brokers" ADD CONSTRAINT "brokers_status_check" CHECK (((status IS NULL) OR (status = ANY (ARRAY['Active'::text, 'Inactive'::text, 'Prospect'::text, 'onboarding'::text, 'onboarded'::text, 'ready_for_go_live'::text, 'active'::text, 'paused'::text, 'ended'::text]))));  -- previous definition
ALTER TABLE "public"."escalations" DROP CONSTRAINT IF EXISTS "escalations_kind_check";
ALTER TABLE "public"."escalations" ADD CONSTRAINT "escalations_kind_check" CHECK ((kind = ANY (ARRAY['human_handoff'::text, 'comment'::text, 'dm'::text, 'guardrail_trip'::text, 'outcome_unmarked'::text, 'replacement_dispute'::text, 'unmatched_payment'::text, 'fsca_mismatch'::text, 'complaint'::text, 'dsr'::text, 'other'::text])));  -- previous definition
ALTER TABLE "public"."invoices_smc" ADD CONSTRAINT "invoices_smc_check1" CHECK (((kind = 'credit_note'::text) OR (amount_excl_vat > (0)::numeric)));  -- previous definition
ALTER TABLE "public"."obligations" DROP CONSTRAINT IF EXISTS "obligations_status_check";
ALTER TABLE "public"."obligations" ADD CONSTRAINT "obligations_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'overdue'::text, 'not_applicable'::text])));  -- previous definition
ALTER TABLE "ops"."notifications" DROP CONSTRAINT IF EXISTS "notifications_kind_check";
ALTER TABLE "ops"."notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ((kind = ANY (ARRAY['daily_pulse'::text, 'approval'::text, 'red'::text, 'weekly_memo'::text, 'monthly_retro'::text, 'build_gate'::text, 'escalation_call'::text])));  -- previous definition
ALTER TABLE "ops"."quality_grades" DROP CONSTRAINT IF EXISTS "quality_grades_severity_check";
ALTER TABLE "ops"."quality_grades" ADD CONSTRAINT "quality_grades_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'minor'::text, 'major'::text, 'critical'::text])));  -- previous definition
ALTER TABLE "public"."suppression" DROP CONSTRAINT IF EXISTS "suppression_source_check";
ALTER TABLE "public"."suppression" ADD CONSTRAINT "suppression_source_check" CHECK ((source = ANY (ARRAY['stop'::text, 'objection'::text, 'ncc_registry'::text, 'complaint'::text, 'no_consent_ctwa'::text, 'dsr_erase'::text])));  -- previous definition
DROP INDEX IF EXISTS "ops"."notifications_dedupe_idx";
DROP INDEX IF EXISTS "ops"."notifications_open_red_idx";
DROP INDEX IF EXISTS "ops"."notifications_proposal_idx";
DROP INDEX IF EXISTS "ops"."ops_signals_key_uidx";
DROP INDEX IF EXISTS "public"."appointments_graph_event_full_uidx";
DROP INDEX IF EXISTS "public"."appointments_idem_full_uidx";
DROP INDEX IF EXISTS "public"."bank_credits_external_uidx";
DROP INDEX IF EXISTS "public"."bank_credits_graph_msg_full_uidx";
DROP INDEX IF EXISTS "public"."bank_credits_stmt_line_full_uidx";
DROP INDEX IF EXISTS "public"."brokers_billing_ref_uidx";
DROP INDEX IF EXISTS "public"."brokers_paystack_customer_idx";
DROP INDEX IF EXISTS "public"."comments_ad_class_idx";
DROP INDEX IF EXISTS "public"."comments_author_post_idx";
DROP INDEX IF EXISTS "public"."comments_comment_id_uq";
DROP INDEX IF EXISTS "public"."comments_queue_idx";
DROP INDEX IF EXISTS "public"."cycles_invoice_uidx";
DROP INDEX IF EXISTS "public"."dsr_requests_mobile_idx";
DROP INDEX IF EXISTS "public"."invoices_smc_open_idx";
DROP INDEX IF EXISTS "public"."lead_activities_idem_full_uidx";
DROP INDEX IF EXISTS "public"."leads_leadgen_full_uidx";
DROP INDEX IF EXISTS "public"."pricing_ref_code_uidx";
DROP INDEX IF EXISTS "public"."suppression_mobile_source_uidx";
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "acked_by" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "always_send" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "body" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "called_at" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "channel_log" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "error" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "escalation_level" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "external_id" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "first_action" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "first_sent_at" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "impact" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "last_seen_at" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "payload" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "primary_partner" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "proposal_id" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "reminded_at" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "scope" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "seen_count" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "severity" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "signal_key" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "since_label" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "source" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "status" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "to" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "what" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."optimisation_memos" DROP COLUMN IF EXISTS "payload" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "decided_by_label" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "evidence" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "grade_note" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "graded_at" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "ice" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "kill_rule_hit" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "kill_rule" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "mechanism" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "pulse_date" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."proposals" DROP COLUMN IF EXISTS "verdict" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."pulses" DROP COLUMN IF EXISTS "card_markdown" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."pulses" DROP COLUMN IF EXISTS "quiet" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."pulses" DROP COLUMN IF EXISTS "whatsapp_text" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."quality_grades" DROP COLUMN IF EXISTS "exact_text" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."quality_grades" DROP COLUMN IF EXISTS "owner_agent" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."signals" DROP COLUMN IF EXISTS "burning" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."signals" DROP COLUMN IF EXISTS "rule" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."signals" DROP COLUMN IF EXISTS "side" CASCADE;  -- data in this column is lost
ALTER TABLE "ops"."signals" DROP COLUMN IF EXISTS "signal_key" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "intro_arm" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "intro_played_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "intro_read_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "intro_sent_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "late_booking" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."bank_credits" DROP COLUMN IF EXISTS "duplicate_of" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."bank_credits" DROP COLUMN IF EXISTS "external_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."bank_credits" DROP COLUMN IF EXISTS "queue_reason" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."bank_credits" DROP COLUMN IF EXISTS "queue_suggestions" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."bank_credits" DROP COLUMN IF EXISTS "statement_confirmed_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."bank_credits" DROP COLUMN IF EXISTS "statement_external_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brands" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brands" DROP COLUMN IF EXISTS "health_alerts" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brands" DROP COLUMN IF EXISTS "insights_last_fetched_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brands" DROP COLUMN IF EXISTS "status" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."broker_media" DROP COLUMN IF EXISTS "state" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "adviser_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "adviser_whatsapp" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "billing_ref" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "broker_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_connected_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_mode" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_status" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "fb_page_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "fb_page_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "first_login_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "last_seen_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "next_free_slot_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "next_tier_code" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "onboarding_completed_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "onboarding_last_progress_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "onboarding_nudges" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "paystack_authorization_ref" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "paystack_subscription_code" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "paystack_subscription_token_ref" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "practice_legal_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "practice_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "preflight_card" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "preflight_run_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "signatory_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "signatory_role" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."comments" DROP COLUMN IF EXISTS "attempts" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."comments" DROP COLUMN IF EXISTS "decision" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."comments" DROP COLUMN IF EXISTS "due_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."comments" DROP COLUMN IF EXISTS "status" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."cycles" DROP COLUMN IF EXISTS "cycle_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."cycles" DROP COLUMN IF EXISTS "invoice_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."dsr_requests" DROP COLUMN IF EXISTS "mobile_hash" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."escalations" DROP COLUMN IF EXISTS "assigned_agent" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."invoices_smc" DROP COLUMN IF EXISTS "charge_attempts" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."invoices_smc" DROP COLUMN IF EXISTS "last_charge_error" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."invoices_smc" DROP COLUMN IF EXISTS "last_charge_failed_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "qualified" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "rejected_reason" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "status_synced_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."obligations" DROP COLUMN IF EXISTS "note" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."pricing" DROP COLUMN IF EXISTS "ref_code" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "edition" CASCADE;  -- data in this column is lost
-- NOTE: ops.notifications.channel changed type/default here: was text 
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "ops"."notifications" WHERE "recipient" IS NULL) THEN ALTER TABLE "ops"."notifications" ALTER COLUMN "recipient" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on ops.notifications.recipient: rows with NULL exist (written since the migration)'; END IF; END $u$;
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."broker_media" WHERE "url" IS NULL) THEN ALTER TABLE "public"."broker_media" ALTER COLUMN "url" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.broker_media.url: rows with NULL exist (written since the migration)'; END IF; END $u$;
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."cycles" WHERE "ends_at" IS NULL) THEN ALTER TABLE "public"."cycles" ALTER COLUMN "ends_at" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.cycles.ends_at: rows with NULL exist (written since the migration)'; END IF; END $u$;
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."cycles" WHERE "starts_at" IS NULL) THEN ALTER TABLE "public"."cycles" ALTER COLUMN "starts_at" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.cycles.starts_at: rows with NULL exist (written since the migration)'; END IF; END $u$;
-- NOTE: public.invoices_smc.total_zar changed type/default here: was numeric(12,2) default (amount_excl_vat + COALESCE(vat_zar, (0)::numeric))
DROP TABLE IF EXISTS "ops"."backup_runs" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."billing_actions_log" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."billing_reports" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."build_state" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."infra_day" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."judge_runs" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."page_audits" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."page_day" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."secret_inventory" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."settings" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."ad_objects" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."comment_ad_sentiment" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."creative_queue" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."dm_queue" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."dm_threads" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."support_events" CASCADE;  -- all rows lost
COMMIT;
