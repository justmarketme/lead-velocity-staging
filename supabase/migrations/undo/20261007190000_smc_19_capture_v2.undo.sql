-- UNDO of 20261007190000_smc_19_capture_v2.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_capture_v2_checks";
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "licence_categories" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "alt_email_same" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "alt_email" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "call_number_verified" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "capture_state" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "counts_toward_cycle" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "declined_broker_ids" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "delivered" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_unverified_flagged_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_unverified_flag" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_verified_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_verified_via" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_verified" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_verify_attempts" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_verify_code_hash" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_verify_expires_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_verify_sent_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "income_band" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "lead_tier" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "licence_flag" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "offer_broker_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "offer_decided_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "offer_expires_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "offer_status" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "offered_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "reasons" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "smoker_answered_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "smoker_question_text" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "smoker" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "spend_band" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "wa_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "wa_verified" CASCADE;  -- data in this column is lost
DROP TABLE IF EXISTS "public"."lead_offers" CASCADE;  -- all rows lost
COMMIT;
