-- UNDO of 20261011040000_smc_04_engagement.sql
-- Generated 2026-10-11 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP TABLE IF EXISTS "public"."broker_media" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."capi_log" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."escalations" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."incidents" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."lead_offers" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."suppression" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."wa_threads" CASCADE;  -- all rows lost
COMMIT;
