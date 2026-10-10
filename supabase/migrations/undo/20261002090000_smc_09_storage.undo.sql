-- UNDO of 20261002090000_smc_09_storage.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
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
-- NOTE: storage bucket "broker-media" was created here. Supabase blocks DELETE on storage tables from SQL: empty and delete it with the Storage API or the dashboard.
COMMIT;
