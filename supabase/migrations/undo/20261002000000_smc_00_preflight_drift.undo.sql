-- UNDO of 20261002000000_smc_00_preflight_drift.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_email" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "firm_address" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "google_calendar_token" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "preferred_language" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "whatsapp_number" CASCADE;  -- data in this column is lost
COMMIT;
