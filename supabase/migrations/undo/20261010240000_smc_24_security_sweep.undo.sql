-- UNDO of 20261010240000_smc_24_security_sweep.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
-- Privileges this migration revoked from pre-existing tables (restoring them RE-OPENS the earlier, weaker posture):
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."ad_objects" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."ads_launch_plan" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."ads_write_log" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."ads" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."comment_ad_sentiment" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."creative_queue" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."dm_queue" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."dm_threads" TO authenticated;
GRANT REFERENCES, TRIGGER, TRUNCATE ON "public"."support_events" TO authenticated;
COMMIT;
