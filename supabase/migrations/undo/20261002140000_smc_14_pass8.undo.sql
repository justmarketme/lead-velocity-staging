-- UNDO of 20261002140000_smc_14_pass8.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
CREATE OR REPLACE FUNCTION public.smc_brokers_guard_pass7()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END $function$;  -- restore previous definition (function was replaced here)
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_media_share_pct_check";
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "media_share_pct" CASCADE;  -- data in this column is lost
COMMIT;
