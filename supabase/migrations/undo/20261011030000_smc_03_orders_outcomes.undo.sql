-- UNDO of 20261011030000_smc_03_orders_outcomes.sql
-- Generated 2026-10-11 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP TRIGGER IF EXISTS "smc_count_on_confirm" ON "public"."appointments";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."lead_orders";
DROP TRIGGER IF EXISTS "smc_count_on_email_verified" ON "public"."leads";
DROP TRIGGER IF EXISTS "smc_leads_attach_order" ON "public"."leads";
DROP TRIGGER IF EXISTS "smc_leads_release_reservation" ON "public"."leads";
DROP TRIGGER IF EXISTS "smc_leads_route_check" ON "public"."leads";
DROP VIEW IF EXISTS "public"."smc_order_capacity" CASCADE;
DROP FUNCTION IF EXISTS public.smc_broker_ready(p_broker_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_count_lead(p_lead_id uuid, p_booking_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_count_on_confirm() CASCADE;
DROP FUNCTION IF EXISTS public.smc_count_on_email_verified() CASCADE;
DROP FUNCTION IF EXISTS public.smc_leads_attach_order() CASCADE;
DROP FUNCTION IF EXISTS public.smc_leads_release_reservation() CASCADE;
DROP FUNCTION IF EXISTS public.smc_leads_route_check() CASCADE;
DROP FUNCTION IF EXISTS public.smc_open_order_for(p_broker_id uuid, p_brand_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_outcome_release_reservation() CASCADE;
DROP FUNCTION IF EXISTS public.smc_replacements_cap() CASCADE;
DROP FUNCTION IF EXISTS public.smc_request_noshow_replacement(p_booking_id uuid, p_proof_path text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_request_replacement(p_booking_id uuid, p_proof_path text, p_kind text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_week_start(p_ts timestamp with time zone) CASCADE;
ALTER TABLE "public"."lead_orders" DROP CONSTRAINT IF EXISTS "lead_orders_brand_id_fkey";
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_lead_order_id_fkey";
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_smc_order_state_check";
DROP INDEX IF EXISTS "public"."lead_orders_smc_open_idx";
DROP INDEX IF EXISTS "public"."leads_smc_order_reserved_idx";
ALTER TABLE "public"."lead_orders" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "lead_order_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "order_attached_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "order_counted_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "order_release_reason" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "order_released_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "order_state" CASCADE;  -- data in this column is lost
DROP TABLE IF EXISTS "public"."outcomes" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."replacements" CASCADE;  -- all rows lost
DROP TYPE IF EXISTS public."smc_disposition_code" CASCADE;
COMMIT;
