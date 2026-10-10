-- UNDO of 20261010220000_smc_22_topup.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
ALTER TABLE "public"."cycles" DROP CONSTRAINT IF EXISTS "cycles_shortfall_credit_cap";
ALTER TABLE "public"."cycles" DROP CONSTRAINT IF EXISTS "cycles_topup_leads_check";
ALTER TABLE "public"."invoices_smc" DROP CONSTRAINT IF EXISTS "invoices_smc_topup_chk";
ALTER TABLE "public"."cycles" ADD CONSTRAINT "cycles_check2" CHECK (((shortfall_credit_zar IS NULL) OR (shortfall_credit_zar <= price_zar)));  -- previous definition
DROP INDEX IF EXISTS "public"."invoices_smc_one_open_topup";
ALTER TABLE "public"."cycles" DROP COLUMN IF EXISTS "topup_leads" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."invoices_smc" DROP COLUMN IF EXISTS "topup_leads" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."invoices_smc" DROP COLUMN IF EXISTS "topup_starts_at" CASCADE;  -- data in this column is lost
COMMIT;
