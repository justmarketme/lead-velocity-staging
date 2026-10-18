-- UNDO of 20261011060000_smc_06_storage_calendar.sql
-- Generated 2026-10-11 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP POLICY IF EXISTS "smc broker-media admin read all" ON "storage"."objects";
DROP POLICY IF EXISTS "smc broker-media broker delete own" ON "storage"."objects";
DROP POLICY IF EXISTS "smc broker-media broker insert own" ON "storage"."objects";
DROP POLICY IF EXISTS "smc broker-media broker read own" ON "storage"."objects";
DROP POLICY IF EXISTS "smc broker-media broker update own" ON "storage"."objects";
DROP POLICY IF EXISTS "smc broker-media n8n_app read" ON "storage"."objects";
DROP FUNCTION IF EXISTS public.smc_ms_disconnect(p_broker_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_set_calendar_status(p_broker_id uuid, p_status text, p_detail jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.smc_vault_ms_refresh(p_broker_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.smc_vault_store_ms_refresh(p_broker_id uuid, p_refresh_token text, p_tenant_id text, p_scopes text) CASCADE;
-- NOTE: storage bucket "broker-media" was created here. Supabase blocks DELETE on storage tables from SQL: empty and delete it with the Storage API or the dashboard.
COMMIT;
