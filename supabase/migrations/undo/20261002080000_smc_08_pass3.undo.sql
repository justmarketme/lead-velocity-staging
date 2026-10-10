-- UNDO of 20261002080000_smc_08_pass3.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP VIEW IF EXISTS "facts"."fact_broker_day" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.fact_broker_day AS  WITH days AS (
         SELECT b.id AS broker_id,
            b.brand_id,
            gs.gs::date AS date
           FROM brokers b
             CROSS JOIN LATERAL generate_series((( SELECT facts.sa_date(min(c.starts_at)) AS sa_date
                   FROM cycles c
                  WHERE c.broker_id = b.id))::timestamp with time zone, (facts.sa_date(now()) + b.horizon_days)::timestamp with time zone, '1 day'::interval) gs(gs)
          WHERE b.brand_id IS NOT NULL
        ), base AS (
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
             JOIN brokers b ON b.id = d.broker_id
        )
 SELECT broker_id,
    brand_id,
    date,
    cycle_id,
    capacity_slots,
    leads_routed,
    bookings_made,
    meetings_scheduled,
    meetings_held,
    outcomes_unmarked,
    report_opened,
    date AS day,
    COALESCE(sum(capacity_slots) OVER w7, 0::bigint)::integer AS slots_total_7d,
    COALESCE(sum(meetings_scheduled) OVER w7, 0::numeric)::integer AS slots_booked_7d,
    COALESCE(sum(GREATEST(capacity_slots - meetings_scheduled, 0::bigint)) OVER w14, 0::numeric)::integer AS slots_open_14d,
    outcomes_unmarked::integer AS todos_open,
    false AS media_trimmed,
    round(COALESCE(sum(meetings_scheduled) OVER w7, 0::numeric) / NULLIF(sum(capacity_slots) OVER w7, 0)::numeric, 4) AS calendar_fill_7d
   FROM base
  WINDOW w7 AS (PARTITION BY broker_id ORDER BY date ROWS BETWEEN 1 FOLLOWING AND 7 FOLLOWING), w14 AS (PARTITION BY broker_id ORDER BY date ROWS BETWEEN 1 FOLLOWING AND 14 FOLLOWING);
DROP VIEW IF EXISTS "facts"."v_watchlist" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW facts.v_watchlist AS  WITH win AS (
         SELECT 'cur'::text AS w,
            facts.sa_date(now()) - 27 AS d0,
            facts.sa_date(now()) AS d1
        UNION ALL
         SELECT 'prev'::text,
            facts.sa_date(now()) - 55,
            facts.sa_date(now()) - 28
        ), scopes AS (
         SELECT NULL::uuid AS broker_id
        UNION ALL
         SELECT b.id
           FROM brokers b
          WHERE b.brand_id IS NOT NULL
        ), base AS (
         SELECT s.broker_id,
            w.w,
            ( SELECT COALESCE(sum(fc.amount_zar), 0::numeric) AS "coalesce"
                   FROM facts.fact_cost fc
                  WHERE fc.kind = 'media'::text AND fc.date >= w.d0 AND fc.date <= w.d1 AND (s.broker_id IS NULL OR fc.broker_id = s.broker_id)) AS media_zar,
            ( SELECT count(*) AS count
                   FROM facts.fact_outcome fo
                  WHERE fo.good_fit AND fo.outcome = 'attended'::text AND fo.slot_date >= w.d0 AND fo.slot_date <= w.d1 AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id)) AS good_fit_meetings,
            ( SELECT count(*) AS count
                   FROM facts.fact_lead fl
                  WHERE fl.verify_window_closed AND fl.created_date >= w.d0 AND fl.created_date <= w.d1 AND (s.broker_id IS NULL OR fl.broker_id = s.broker_id)) AS leads_matured,
            ( SELECT count(*) AS count
                   FROM facts.fact_lead fl
                  WHERE fl.verify_window_closed AND fl.verified_within_72h AND fl.created_date >= w.d0 AND fl.created_date <= w.d1 AND (s.broker_id IS NULL OR fl.broker_id = s.broker_id)) AS leads_reached,
            ( SELECT count(*) AS count
                   FROM facts.fact_outcome fo
                  WHERE fo.outcome = 'attended'::text AND fo.slot_date >= w.d0 AND fo.slot_date <= w.d1 AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id)) AS attended,
            ( SELECT count(*) AS count
                   FROM facts.fact_outcome fo
                  WHERE fo.outcome = 'no_show'::text AND fo.slot_date >= w.d0 AND fo.slot_date <= w.d1 AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id)) AS no_show,
            ( SELECT count(*) AS count
                   FROM facts.fact_outcome fo
                  WHERE fo.outcome = 'attended'::text AND fo.disposition_code IS NOT NULL AND fo.slot_date >= w.d0 AND fo.slot_date <= w.d1 AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id)) AS dispositioned,
            ( SELECT count(*) AS count
                   FROM facts.fact_outcome fo
                  WHERE fo.outcome = 'attended'::text AND fo.good_fit AND fo.slot_date >= w.d0 AND fo.slot_date <= w.d1 AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id)) AS good_fit_dispositions,
            ( SELECT count(*) AS count
                   FROM facts.fact_outcome fo
                  WHERE fo.unconfirmed AND fo.slot_date >= w.d0 AND fo.slot_date <= w.d1 AND (s.broker_id IS NULL OR fo.broker_id = s.broker_id)) AS unconfirmed
           FROM scopes s
             CROSS JOIN win w
        ), cyc AS (
         SELECT s.broker_id,
            sum(fc.price_zar) AS price_zar,
            sum(fc.margin_zar) AS margin_zar,
            sum(fc.delivered) AS delivered,
            sum(fc.committed_leads::numeric * LEAST(1.0, GREATEST(0.0, EXTRACT(epoch FROM now() - fc.starts_at) / NULLIF(EXTRACT(epoch FROM fc.ends_at - fc.starts_at), 0::numeric)))) AS expected_by_now
           FROM scopes s
             JOIN facts.fact_cycle fc ON (s.broker_id IS NULL OR fc.broker_id = s.broker_id) AND (fc.status = ANY (ARRAY['active'::text, 'extended'::text]))
          GROUP BY s.broker_id
        ), cap AS (
         SELECT s.broker_id,
            ( SELECT COALESCE(sum(GREATEST(bd.capacity_slots - bd.meetings_scheduled, 0::bigint)), 0::numeric) AS "coalesce"
                   FROM facts.fact_broker_day bd
                  WHERE bd.date > facts.sa_date(now()) AND (s.broker_id IS NULL OR bd.broker_id = s.broker_id)) AS free_slots,
            ( SELECT sum(bd.bookings_made) / 14::numeric
                   FROM facts.fact_broker_day bd
                  WHERE bd.date >= (facts.sa_date(now()) - 13) AND bd.date <= facts.sa_date(now()) AND (s.broker_id IS NULL OR bd.broker_id = s.broker_id)) AS bookings_per_day,
            ( SELECT count(DISTINCT r.week) AS count
                   FROM report_history r
                  WHERE r.brand_id IS NOT NULL AND r.report_kind = 'broker_weekly'::text AND r.week >= (facts.sa_date(now()) - 20) AND r.opened_portal_at IS NULL AND r.opened_wa_at IS NULL AND (s.broker_id IS NULL OR r.broker_id = s.broker_id)) AS reports_unopened_3w
           FROM scopes s
        ), m AS (
         SELECT c.broker_id,
            c.w,
                CASE
                    WHEN c.good_fit_meetings > 0 THEN round(c.media_zar / c.good_fit_meetings::numeric, 2)
                    ELSE NULL::numeric
                END AS m1,
            c.good_fit_meetings AS n1,
                CASE
                    WHEN c.leads_matured > 0 THEN round(c.leads_reached::numeric / c.leads_matured::numeric, 4)
                    ELSE NULL::numeric
                END AS m2,
            c.leads_matured AS n2,
                CASE
                    WHEN (c.attended + c.no_show) > 0 THEN round(c.attended::numeric / (c.attended + c.no_show)::numeric, 4)
                    ELSE NULL::numeric
                END AS m3,
            c.attended + c.no_show AS n3,
                CASE
                    WHEN c.dispositioned > 0 THEN round(c.good_fit_dispositions::numeric / c.dispositioned::numeric, 4)
                    ELSE NULL::numeric
                END AS m4,
            c.dispositioned AS n4,
                CASE
                    WHEN c.attended > 0 THEN round(c.dispositioned::numeric / c.attended::numeric, 4)
                    ELSE NULL::numeric
                END AS disposition_rate,
            c.unconfirmed
           FROM base c
        )
 SELECT metric_no,
    metric_code,
    plain_name,
    broker_id,
    value,
    value_label,
    target,
    floor,
    unit,
    value_prev,
    n,
    what_to_watch
   FROM ( SELECT 1 AS metric_no,
            'cost_per_good_fit_meeting'::text AS metric_code,
            'Cost per good-fit meeting'::text AS plain_name,
            cur.broker_id,
            cur.m1 AS value,
            NULL::text AS value_label,
            900::numeric AS target,
            NULL::numeric AS floor,
            'ZAR'::text AS unit,
            prev.m1 AS value_prev,
            cur.n1 AS n,
            'What we pay in ads for one meeting the broker rated a good fit. If it rises for 7 days, check which angle''s good-fit rate dropped.'::text AS what_to_watch
           FROM m cur
             JOIN m prev ON NOT prev.broker_id IS DISTINCT FROM cur.broker_id AND prev.w = 'prev'::text
          WHERE cur.w = 'cur'::text
        UNION ALL
         SELECT 2,
            'leads_reached_pct'::text,
            'Leads we could actually reach'::text,
            cur.broker_id,
            cur.m2,
            NULL::text,
            0.85,
            NULL::numeric,
            'ratio'::text,
            prev.m2,
            cur.n2,
            'Share of leads who replied on WhatsApp within 72 hours. If it falls, check number validation and first-message timing.'::text
           FROM m cur
             JOIN m prev ON NOT prev.broker_id IS DISTINCT FROM cur.broker_id AND prev.w = 'prev'::text
          WHERE cur.w = 'cur'::text
        UNION ALL
         SELECT 3,
            'booked_to_attended_pct'::text,
            'Booked calls that happened'::text,
            cur.broker_id,
            cur.m3,
            NULL::text,
            0.65,
            0.50,
            'ratio'::text,
            prev.m3,
            cur.n3,
            'Share of booked calls the lead attended. Below 50% for 14 days: review the reminder sequence and qualification.'::text
           FROM m cur
             JOIN m prev ON NOT prev.broker_id IS DISTINCT FROM cur.broker_id AND prev.w = 'prev'::text
          WHERE cur.w = 'cur'::text
        UNION ALL
         SELECT 4,
            'broker_good_fit_pct'::text,
            'Calls the broker rated a good fit'::text,
            cur.broker_id,
            cur.m4,
            NULL::text,
            NULL::numeric,
            NULL::numeric,
            'ratio'::text,
            prev.m4,
            cur.n4,
            'Share of attended calls the broker marked good fit. If it drops, look at which angle or budget band the not-a-fit calls came from.'::text
           FROM m cur
             JOIN m prev ON NOT prev.broker_id IS DISTINCT FROM cur.broker_id AND prev.w = 'prev'::text
          WHERE cur.w = 'cur'::text
        UNION ALL
         SELECT 5,
            'margin_this_cycle_pct'::text,
            'What we keep this cycle'::text,
            s.broker_id,
            round(cy.margin_zar / NULLIF(cy.price_zar, 0::numeric), 4) AS round,
            NULL::text,
            0.43,
            0.30,
            'ratio'::text,
            NULL::numeric,
            NULL::bigint,
            'Price minus ads, WhatsApp, AI, hosting and fees, as a share of price. Below 30% means the kill rules apply before selling more.'::text
           FROM scopes s
             LEFT JOIN cyc cy ON NOT cy.broker_id IS DISTINCT FROM s.broker_id
        UNION ALL
         SELECT 6,
            'days_capacity_left'::text,
            'Days before the broker''s diary is full'::text,
            s.broker_id,
                CASE
                    WHEN cp.bookings_per_day > 0::numeric THEN round(cp.free_slots / cp.bookings_per_day, 1)
                    ELSE NULL::numeric
                END AS "case",
            NULL::text,
            5,
            NULL::numeric,
            'days'::text,
            NULL::numeric,
            cp.free_slots::integer AS free_slots,
            'Free meeting slots ahead divided by bookings per day. Under 5 working days: offer an upgrade or add a broker.'::text
           FROM scopes s
             JOIN cap cp ON NOT cp.broker_id IS DISTINCT FROM s.broker_id
        UNION ALL
         SELECT 7,
            'renewal_risk'::text,
            'Chance the broker does not renew'::text,
            s.broker_id,
            r.score,
                CASE r.score
                    WHEN 2 THEN 'red'::text
                    WHEN 1 THEN 'amber'::text
                    ELSE 'green'::text
                END AS "case",
            0,
            NULL::numeric,
            'level'::text,
            NULL::numeric,
            NULL::bigint,
            'Red if calls happen less than half the time, delivery is behind pace, or reports go unopened 2 weeks; amber if outcomes go unmarked. Red means Jonathan calls the broker.'::text
           FROM scopes s
             JOIN m cur ON NOT cur.broker_id IS DISTINCT FROM s.broker_id AND cur.w = 'cur'::text
             LEFT JOIN cyc cy ON NOT cy.broker_id IS DISTINCT FROM s.broker_id
             JOIN cap cp ON NOT cp.broker_id IS DISTINCT FROM s.broker_id
             CROSS JOIN LATERAL ( SELECT
                        CASE
                            WHEN cur.m3 IS NOT NULL AND cur.m3 < 0.50 OR cy.expected_by_now > 0::numeric AND (cy.delivered / cy.expected_by_now) < 0.70 OR cp.reports_unopened_3w >= 2 THEN 2
                            WHEN cur.disposition_rate IS NOT NULL AND cur.disposition_rate < 0.90 OR cur.m3 IS NOT NULL AND cur.m3 < 0.65 OR cur.unconfirmed >= 2 THEN 1
                            ELSE 0
                        END AS score) r) wl;
CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.brand_id IS NULL OR auth.uid() IS NULL OR public.smc_is_admin()
     OR current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;   -- legacy rows, n8n/service connections, admins, and the SECURITY DEFINER portal RPCs below
                  -- (they run as the function owner, so current_user is not 'authenticated') are not restricted here
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
  OR NEW.intro_video_url   IS DISTINCT FROM OLD.intro_video_url
  -- pass 2 additions
  OR NEW.onboarding_progress          IS DISTINCT FROM OLD.onboarding_progress
  OR NEW.onboarding_step              IS DISTINCT FROM OLD.onboarding_step
  OR NEW.onboarding_completed_at      IS DISTINCT FROM OLD.onboarding_completed_at
  OR NEW.onboarding_last_progress_at  IS DISTINCT FROM OLD.onboarding_last_progress_at
  OR NEW.onboarding_nudges            IS DISTINCT FROM OLD.onboarding_nudges
  OR NEW.first_login_at               IS DISTINCT FROM OLD.first_login_at
  OR NEW.preflight_card               IS DISTINCT FROM OLD.preflight_card
  OR NEW.preflight_run_id             IS DISTINCT FROM OLD.preflight_run_id
  OR NEW.calendar_mode                IS DISTINCT FROM OLD.calendar_mode
  OR NEW.calendar_status              IS DISTINCT FROM OLD.calendar_status
  OR NEW.calendar_connected_at        IS DISTINCT FROM OLD.calendar_connected_at
  OR NEW.next_free_slot_at            IS DISTINCT FROM OLD.next_free_slot_at
  OR NEW.billing_ref                  IS DISTINCT FROM OLD.billing_ref
  OR NEW.next_tier_code               IS DISTINCT FROM OLD.next_tier_code
  OR NEW.card_autorenew               IS DISTINCT FROM OLD.card_autorenew
  OR NEW.paystack_subscription_code   IS DISTINCT FROM OLD.paystack_subscription_code
  OR NEW.paystack_subscription_token_ref IS DISTINCT FROM OLD.paystack_subscription_token_ref
  OR NEW.paystack_authorization_ref   IS DISTINCT FROM OLD.paystack_authorization_ref
  OR NEW.explainer_watched_at         IS DISTINCT FROM OLD.explainer_watched_at THEN
    RAISE EXCEPTION 'smc: brokers cannot change status, tier, routing, consent mode, FSP verification, go-live, onboarding state, calendar state, billing or approved media fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;  -- restore previous definition (function was replaced here)
DROP FUNCTION IF EXISTS public.smc_console_assert_admin(p_fn text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_build_state() CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_decide_proposal(p_proposal_id uuid, p_decision text, p_reason text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_judge_runs(p_limit integer) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_proposal_from_grade(p_grade_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_proposals(p_pulse_date date) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_pulses(p_limit integer) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_quality_grades(p_hours integer, p_limit integer) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_set_watchlist_target(p_metric_no integer, p_target numeric, p_stretch_target numeric, p_floor numeric, p_reason text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_signals_open(p_limit integer) CASCADE;
DROP FUNCTION IF EXISTS public.smc_console_watchlist_targets() CASCADE;
DROP FUNCTION IF EXISTS public.smc_faculty_tiles(p_days integer, p_include_synthetic boolean) CASCADE;
DROP FUNCTION IF EXISTS public.smc_report_policies_written(p_count integer, p_cycle_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_request_ip(OUT ip text, OUT ip_source text) CASCADE;
CREATE OR REPLACE FUNCTION public.smc_sign_document(p_document_id uuid, p_signed_by_name text, p_doc_sha256 text, p_signer_ip text, p_user_agent text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('smc.source', 'portal', true);
  PERFORM set_config('smc.reason', 'e-sign', true);
  UPDATE public.admin_documents
     SET signed_at = now(), signed_by_name = p_signed_by_name, doc_sha256 = p_doc_sha256,
         signer_ip = p_signer_ip, signed_user_agent = p_user_agent
   WHERE id = p_document_id AND brand_id IS NOT NULL AND signed_at IS NULL
     AND broker_id = public.smc_current_broker_id()
     AND kind IN ('agreement','authorisation_letter','addendum');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'smc_sign_document: not found, not yours, or already signed' USING ERRCODE = '42501';
  END IF;
END $function$;  -- restore previous definition (function was replaced here)
DROP FUNCTION IF EXISTS public.smc_sign_document(p_document_id uuid, p_signed_by_name text, p_doc_sha256 text, p_signer_ip text, p_user_agent text, p_acceptances jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.smc_vault_paystack_auth_code(p_broker_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_vault_store_paystack_auth(p_broker_id uuid, p_authorization_code text, p_customer_code text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_vault_store_paystack_sub(p_customer_code text, p_subscription_code text, p_email_token text) CASCADE;
ALTER TABLE "public"."admin_documents" DROP CONSTRAINT IF EXISTS "admin_documents_acceptances_check";
ALTER TABLE "public"."broker_media" DROP CONSTRAINT IF EXISTS "broker_media_one_current_x";
ALTER TABLE "public"."escalations" DROP CONSTRAINT IF EXISTS "escalations_kind_check";
ALTER TABLE "public"."escalations" ADD CONSTRAINT "escalations_kind_check" CHECK ((kind = ANY (ARRAY['human_handoff'::text, 'comment'::text, 'dm'::text, 'guardrail_trip'::text, 'outcome_unmarked'::text, 'replacement_dispute'::text, 'unmatched_payment'::text, 'fsca_mismatch'::text, 'complaint'::text, 'dsr'::text, 'other'::text, 'hostile_thread'::text, 'needs_human'::text, 'classifier_invalid'::text, 'comment_sentiment'::text, 'webhook_signature_invalid'::text])));  -- previous definition
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "acceptances" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "signer_ip_source" CASCADE;  -- data in this column is lost
DROP TABLE IF EXISTS "ops"."watchlist_targets" CASCADE;  -- all rows lost
COMMIT;
