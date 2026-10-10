-- UNDO of 20261002070000_smc_07_pass2_rls.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP TRIGGER IF EXISTS "smc_touch_updated_at" ON "public"."ad_objects";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."creative_queue";
DROP TRIGGER IF EXISTS "smc_touch_updated_at" ON "public"."creative_queue";
DROP TRIGGER IF EXISTS "smc_touch_updated_at" ON "public"."dm_threads";
DROP TRIGGER IF EXISTS "smc_audit" ON "ops"."billing_actions_log";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."support_events";
DROP TRIGGER IF EXISTS "smc_touch_updated_at" ON "public"."support_events";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."backup_runs";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."backup_runs";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."billing_actions_log";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."billing_actions_log";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."billing_reports";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."billing_reports";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."build_state";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."build_state";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."infra_day";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."infra_day";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."judge_runs";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."judge_runs";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."page_audits";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."page_audits";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."page_day";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."page_day";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."secret_inventory";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."secret_inventory";
DROP POLICY IF EXISTS "smc admin all" ON "ops"."settings";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "ops"."settings";
DROP POLICY IF EXISTS "smc admin all" ON "public"."ad_objects";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "public"."ad_objects";
DROP POLICY IF EXISTS "smc admin all" ON "public"."comment_ad_sentiment";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "public"."comment_ad_sentiment";
DROP POLICY IF EXISTS "smc admin all" ON "public"."creative_queue";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "public"."creative_queue";
DROP POLICY IF EXISTS "smc admin all" ON "public"."dm_queue";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "public"."dm_queue";
DROP POLICY IF EXISTS "smc admin all" ON "public"."dm_threads";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "public"."dm_threads";
DROP POLICY IF EXISTS "smc admin all" ON "public"."support_events";
DROP POLICY IF EXISTS "smc broker read own" ON "public"."support_events";
DROP POLICY IF EXISTS "smc n8n_app rw" ON "public"."support_events";
ALTER TABLE "ops"."backup_runs" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."billing_actions_log" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."billing_reports" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."build_state" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."infra_day" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."judge_runs" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."page_audits" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."page_day" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."secret_inventory" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "ops"."settings" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "public"."ad_objects" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "public"."comment_ad_sentiment" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "public"."creative_queue" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "public"."dm_queue" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "public"."dm_threads" DISABLE ROW LEVEL SECURITY;  -- was rls=false
ALTER TABLE "public"."support_events" DISABLE ROW LEVEL SECURITY;  -- was rls=false
-- NOTE: ACL/config of ops.judge_samples(p_date date) changed here: was secdef=false cfg=search_path=public, ops, facts anon=true auth=true svc=true
-- NOTE: ACL/config of ops.notifications_due() changed here: was secdef=false cfg=search_path=public, ops anon=true auth=true svc=true
-- NOTE: ACL/config of ops.notifications_sync_to() changed here: was secdef=false cfg= anon=true auth=true svc=true
-- NOTE: ACL/config of ops.proposal_actuals(p_date date) changed here: was secdef=false cfg=search_path=public, ops, facts anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_brokers_billing_ref() changed here: was secdef=false cfg= anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_cycles_fill() changed here: was secdef=false cfg= anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_invoices_fill() changed here: was secdef=false cfg= anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_portal_event(p_type text, p_step text, p_payload jsonb, p_event_id uuid) changed here: was secdef=true cfg=search_path=public anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_portal_touch() changed here: was secdef=true cfg=search_path=public anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_pricing_notify() changed here: was secdef=false cfg= anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_report_ask_done(p_report_id uuid) changed here: was secdef=true cfg=search_path=public anon=true auth=true svc=true
-- NOTE: ACL/config of public.smc_watchlist_tiles(p_include_synthetic boolean) changed here: was secdef=true cfg=search_path=public, facts anon=true auth=true svc=true
-- Privileges this migration revoked from pre-existing tables (restoring them RE-OPENS the earlier, weaker posture):
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."ad_objects" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."ads" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."comment_ad_sentiment" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."creative_queue" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."dm_queue" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."dm_threads" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."support_events" TO anon;
COMMIT;
