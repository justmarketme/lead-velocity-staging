-- UNDO of 20261011080000_smc_08_email_verified_guard.sql
-- Generated 2026-10-11 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
CREATE OR REPLACE FUNCTION public.smc_lead_email_verified(p_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT coalesce((SELECT l.email_verified FROM public.leads l WHERE l.id = p_lead_id), false) $function$;  -- restore previous definition (function was replaced here)
COMMIT;
