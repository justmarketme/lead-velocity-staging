-- UNDO of 20261002030000_smc_03_ops_reporting.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."message_templates";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."report_history";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."sla_thresholds";
DROP VIEW IF EXISTS "public"."smc_reports" CASCADE;
DROP FUNCTION IF EXISTS public.smc_erase_lead(p_lead_id uuid, p_action text, p_policy text, p_dsr_id uuid) CASCADE;
ALTER TABLE "public"."message_templates" DROP CONSTRAINT IF EXISTS "message_templates_brand_id_fkey";
ALTER TABLE "public"."report_history" DROP CONSTRAINT IF EXISTS "report_history_brand_id_fkey";
ALTER TABLE "public"."report_history" DROP CONSTRAINT IF EXISTS "report_history_broker_id_fkey";
ALTER TABLE "public"."report_history" DROP CONSTRAINT IF EXISTS "report_history_cycle_id_fkey";
ALTER TABLE "public"."report_history" DROP CONSTRAINT IF EXISTS "report_history_smc_checks";
ALTER TABLE "public"."sla_thresholds" DROP CONSTRAINT IF EXISTS "sla_thresholds_brand_id_fkey";
ALTER TABLE "public"."message_templates" DROP CONSTRAINT IF EXISTS "message_templates_channel_check";
ALTER TABLE "public"."message_templates" ADD CONSTRAINT "message_templates_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text, 'all'::text])));  -- previous definition
ALTER TABLE "public"."report_history" DROP CONSTRAINT IF EXISTS "report_history_status_check";
ALTER TABLE "public"."report_history" ADD CONSTRAINT "report_history_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'partial'::text])));  -- previous definition
DROP INDEX IF EXISTS "public"."message_templates_wa_uidx";
DROP INDEX IF EXISTS "public"."report_history_smc_week_uidx";
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "approved_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "has_flow_button" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "header_type" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "language" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "meta_category" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "meta_status" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "meta_template_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "submitted_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "version" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."message_templates" DROP COLUMN IF EXISTS "wa_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."profiles" DROP COLUMN IF EXISTS "notify_dnd" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."profiles" DROP COLUMN IF EXISTS "whatsapp_number" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "ask_done_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "ask" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "broker_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "created_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "cycle_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "judge_passed" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "opened_portal_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "opened_wa_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "pdf_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "report_kind" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "sent_email_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "sent_wa_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "updated_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."report_history" DROP COLUMN IF EXISTS "week" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."sla_thresholds" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."sla_thresholds" DROP COLUMN IF EXISTS "metric" CASCADE;  -- data in this column is lost
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."report_history" WHERE "recipients" IS NULL) THEN ALTER TABLE "public"."report_history" ALTER COLUMN "recipients" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.report_history.recipients: rows with NULL exist (written since the migration)'; END IF; END $u$;
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."report_history" WHERE "sent_at" IS NULL) THEN ALTER TABLE "public"."report_history" ALTER COLUMN "sent_at" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.report_history.sent_at: rows with NULL exist (written since the migration)'; END IF; END $u$;
DROP TABLE IF EXISTS "ops"."costs" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."notifications" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."optimisation_memos" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."proposals" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."pulses" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."quality_grades" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "ops"."signals" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."ad_metrics" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."broker_media" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."capi_log" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."comments" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."dsr_requests" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."escalations" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."incidents" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."insights" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."lead_pulse" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."obligations" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."retention_log" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."suppression" CASCADE;  -- all rows lost
DROP SCHEMA IF EXISTS "ops" CASCADE;
-- Rows inserted into pre-existing tables by this migration:
DELETE FROM public.sla_thresholds WHERE channel = 'smc_first_message';
COMMIT;
