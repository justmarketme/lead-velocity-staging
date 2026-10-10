-- UNDO of 20261008200000_smc_20_feedback_firewall.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP VIEW IF EXISTS "public"."v_cycle_progress" CASCADE;  -- restore previous definition (view was replaced here; dependents are dropped and are restored or removed by the earlier undo files)
CREATE VIEW public.v_cycle_progress WITH (security_invoker=true) AS  SELECT id AS cycle_id,
    broker_id,
    brand_id,
    tier_code,
    cycle_no,
    status,
    starts_at,
    ends_at,
    extended_until,
    committed_leads AS committed,
    ( SELECT count(*) AS count
           FROM leads l
          WHERE l.cycle_id = c.id AND l.verified_at IS NOT NULL AND l.qualified_at IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM replacements rp
                  WHERE rp.replacement_lead_id = l.id AND rp.status <> 'rejected'::text))) AS verified,
    ( SELECT count(DISTINCT a.client_id) AS count
           FROM appointments a
          WHERE a.cycle_id = c.id AND a.brand_id IS NOT NULL AND (a.status = ANY (ARRAY['booked'::text, 'confirmed'::text, 'attended'::text, 'no_show'::text]))) AS booked,
    ( SELECT count(*) AS count
           FROM outcomes o
          WHERE o.cycle_id = c.id AND o.outcome = 'attended'::text) AS attended,
    ( SELECT count(*) AS count
           FROM outcomes o
          WHERE o.cycle_id = c.id AND (o.disposition_code = ANY (ARRAY['fit_proceeding'::smc_disposition_code, 'fit_followup'::smc_disposition_code]))) AS good_fit,
    ( SELECT count(*) AS count
           FROM replacements r
          WHERE r.cycle_id = c.id AND r.status <> 'rejected'::text) AS replacements_used,
    replacement_cap,
    GREATEST(0::numeric, ceil(EXTRACT(epoch FROM COALESCE(extended_until, ends_at) - now()) / 86400::numeric))::integer AS days_left
   FROM cycles c;
CREATE OR REPLACE FUNCTION public.smc_replacements_cap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cap  integer;
  v_used integer;
BEGIN
  SELECT c.replacement_cap INTO v_cap FROM public.cycles c WHERE c.id = NEW.cycle_id;
  SELECT count(*) INTO v_used
    FROM public.replacements r
   WHERE r.cycle_id = NEW.cycle_id
     AND r.status <> 'rejected'
     AND r.id <> NEW.id;
  NEW.cap_position := v_used + 1;
  NEW.over_cap := (v_cap IS NOT NULL AND v_used + 1 > v_cap);
  RETURN NEW;
END $function$;  -- restore previous definition (function was replaced here)
-- NOTE: ACL/config of public.smc_report_policies_written(p_count integer, p_cycle_id uuid) changed here: was secdef=true cfg=search_path=public, pg_temp anon=false auth=true svc=true
DROP FUNCTION IF EXISTS public.smc_request_noshow_replacement(p_booking_id uuid, p_proof_path text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_week_start(p_ts timestamp with time zone) CASCADE;
ALTER TABLE "public"."outcomes" DROP CONSTRAINT IF EXISTS "outcomes_outcome_kind_check";
ALTER TABLE "public"."replacements" DROP CONSTRAINT IF EXISTS "replacements_booking_id_fkey";
ALTER TABLE "public"."outcomes" ADD CONSTRAINT "outcomes_outcome_check" CHECK ((outcome = ANY (ARRAY['attended'::text, 'no_show'::text, 'rescheduled'::text, 'broker_no_show'::text])));  -- previous definition
DROP INDEX IF EXISTS "public"."replacements_broker_week_idx";
ALTER TABLE "public"."replacements" DROP COLUMN IF EXISTS "booking_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."replacements" DROP COLUMN IF EXISTS "missed_start_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."replacements" DROP COLUMN IF EXISTS "proof_path" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."replacements" DROP COLUMN IF EXISTS "proof_sent_at" CASCADE;  -- data in this column is lost
COMMIT;
