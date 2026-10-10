-- UNDO of 20261002010000_smc_01_security.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
DROP POLICY IF EXISTS "smc_sec admins manage appointments" ON "public"."appointments";
DROP POLICY IF EXISTS "smc_sec admins manage broker analysis" ON "public"."broker_analysis";
DROP POLICY IF EXISTS "smc_sec admins manage notes" ON "public"."broker_notes";
DROP POLICY IF EXISTS "smc_sec admins manage onboarding responses" ON "public"."broker_onboarding_responses";
DROP POLICY IF EXISTS "smc_sec broker reads own onboarding response" ON "public"."broker_onboarding_responses";
DROP POLICY IF EXISTS "smc_sec admins read system logs" ON "public"."system_logs";
DROP POLICY IF EXISTS "smc_sec brokers download shared documents" ON "storage"."objects";
CREATE POLICY "Admins can manage all appointments" ON "public"."appointments" FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Token holder can update invite" ON "public"."broker_invites" FOR UPDATE
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Admins can manage all notes" ON "public"."broker_notes" FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Allow anyone to insert security questions" ON "public"."broker_security_questions" FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow authenticated read access" ON "public"."system_logs" FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Brokers can download shared documents" ON "storage"."objects" FOR SELECT
  USING (((bucket_id = 'admin-documents'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR (EXISTS ( SELECT 1 FROM ((admin_documents ad JOIN document_shares ds ON ((ds.document_id = ad.id))) JOIN brokers b ON ((b.id = ds.broker_id))) WHERE ((ad.file_path = ad.name) AND (b.user_id = auth.uid())))))));
CREATE POLICY "Public Access" ON "storage"."objects" FOR SELECT
  USING ((bucket_id = 'admin-documents'::text));
-- Privileges this migration revoked from pre-existing tables (restoring them RE-OPENS the earlier, weaker posture):
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."admin_documents" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."admin_invites" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."ai_call_requests" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."appointments" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."audit_log" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_activities" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_analysis" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_feedback" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_followups" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_invites" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_notes" TO anon;
GRANT DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_onboarding_responses" TO anon;
GRANT DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_reset_requests" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."broker_security_questions" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."brokers" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."call_coaching" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."communications" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."document_shares" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."lead_activities" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."lead_conversations" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."lead_order_items" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."lead_orders" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."leads" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."message_templates" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."notification_preferences" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."profiles" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."referrals" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."report_history" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."scheduled_reports" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."sla_alerts" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."sla_thresholds" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."system_logs" TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON "public"."user_roles" TO anon;
COMMIT;
