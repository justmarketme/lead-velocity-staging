-- UNDO of 20261007180000_smc_18_ms_oauth_edge.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP FUNCTION IF EXISTS public.smc_ms_disconnect(p_broker_id uuid) CASCADE;
COMMIT;
