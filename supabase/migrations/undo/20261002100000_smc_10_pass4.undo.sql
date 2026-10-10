-- UNDO of 20261002100000_smc_10_pass4.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP FUNCTION IF EXISTS facts.vtl(v numeric, t numeric, l numeric) CASCADE;
DROP FUNCTION IF EXISTS facts.w14_broker_report(p_broker uuid, p_day date, p_edition text) CASCADE;
DROP FUNCTION IF EXISTS facts.w14_hold(p_broker uuid, p_payload jsonb) CASCADE;
DROP FUNCTION IF EXISTS facts.w14_lv_payload() CASCADE;
DROP FUNCTION IF EXISTS facts.w14_reconcile(p_broker uuid, p_payload jsonb) CASCADE;
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_smc_close_rate_fraction";
DROP TABLE IF EXISTS "ops"."ctwa_clicks" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."wa_threads" CASCADE;  -- all rows lost
COMMIT;
