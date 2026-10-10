-- UNDO of 20261002040000_smc_04_facts.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP VIEW IF EXISTS "facts"."fact_ad_day" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_booking" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_broker_day" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_comment" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_cost" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_cycle" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_lead" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_message" CASCADE;
DROP VIEW IF EXISTS "facts"."fact_outcome" CASCADE;
DROP VIEW IF EXISTS "facts"."v_watchlist" CASCADE;
DROP FUNCTION IF EXISTS facts.include_synthetic() CASCADE;
DROP FUNCTION IF EXISTS facts.lead_key(p_id uuid) CASCADE;
DROP FUNCTION IF EXISTS facts.sa_date(ts timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.smc_watchlist(p_include_synthetic boolean) CASCADE;
DROP TABLE IF EXISTS "smc_private"."pseudonym_key" CASCADE;  -- all rows lost
DROP SCHEMA IF EXISTS "facts" CASCADE;
DROP SCHEMA IF EXISTS "smc_private" CASCADE;
COMMIT;
