-- UNDO of 20261002110000_smc_11_pass5.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP FUNCTION IF EXISTS public.smc_vault_paystack_sub_token(p_broker_id uuid) CASCADE;
ALTER TABLE "ops"."notifications" DROP CONSTRAINT IF EXISTS "notifications_attempts_nonneg";
ALTER TABLE "ops"."notifications" DROP COLUMN IF EXISTS "attempts" CASCADE;  -- data in this column is lost
COMMIT;
