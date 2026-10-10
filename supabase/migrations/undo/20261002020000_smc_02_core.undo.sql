-- UNDO of 20261002020000_smc_02_core.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
-- Remove the audit rows the smc chain wrote (the 41 legacy rows have actor_role NULL and stay). This also erases the audit history of any SMC activity since the apply.
DELETE FROM public.audit_log WHERE actor_role IS NOT NULL;
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."admin_documents";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."appointments";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."brokers";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."communications";
DROP TRIGGER IF EXISTS "smc_audit" ON "public"."leads";
DROP TRIGGER IF EXISTS "smc_leads_stage_stamp" ON "public"."leads";
DROP VIEW IF EXISTS "public"."bookings" CASCADE;
DROP VIEW IF EXISTS "public"."smc_conversations" CASCADE;
DROP VIEW IF EXISTS "public"."v_cycle_progress" CASCADE;
DROP FUNCTION IF EXISTS public.smc_audit() CASCADE;
DROP FUNCTION IF EXISTS public.smc_current_broker_id() CASCADE;
DROP FUNCTION IF EXISTS public.smc_hash_contact(p text) CASCADE;
DROP FUNCTION IF EXISTS public.smc_is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.smc_leads_stage_stamp() CASCADE;
DROP FUNCTION IF EXISTS public.smc_replacements_cap() CASCADE;
ALTER TABLE "public"."admin_documents" DROP CONSTRAINT IF EXISTS "admin_documents_brand_id_fkey";
ALTER TABLE "public"."admin_documents" DROP CONSTRAINT IF EXISTS "admin_documents_broker_id_fkey";
ALTER TABLE "public"."admin_documents" DROP CONSTRAINT IF EXISTS "admin_documents_smc_checks";
ALTER TABLE "public"."appointments" DROP CONSTRAINT IF EXISTS "appointments_brand_id_fkey";
ALTER TABLE "public"."appointments" DROP CONSTRAINT IF EXISTS "appointments_cycle_id_fkey";
ALTER TABLE "public"."appointments" DROP CONSTRAINT IF EXISTS "appointments_previous_booking_id_fkey";
ALTER TABLE "public"."appointments" DROP CONSTRAINT IF EXISTS "appointments_smc_checks";
ALTER TABLE "public"."appointments" DROP CONSTRAINT IF EXISTS "appointments_smc_no_overlap";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_approved_live_by_fkey";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_brand_id_fkey";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_current_cycle_id_fkey";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_smc_checks";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_tier_code_fkey";
ALTER TABLE "public"."communications" DROP CONSTRAINT IF EXISTS "communications_brand_id_fkey";
ALTER TABLE "public"."communications" DROP CONSTRAINT IF EXISTS "communications_smc_checks";
ALTER TABLE "public"."lead_activities" DROP CONSTRAINT IF EXISTS "lead_activities_brand_id_fkey";
ALTER TABLE "public"."lead_activities" DROP CONSTRAINT IF EXISTS "lead_activities_broker_id_fkey";
ALTER TABLE "public"."lead_activities" DROP CONSTRAINT IF EXISTS "lead_activities_cycle_id_fkey";
ALTER TABLE "public"."lead_activities" DROP CONSTRAINT IF EXISTS "lead_activities_smc_checks";
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_brand_id_fkey";
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_cycle_id_fkey";
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_duplicate_of_fkey";
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_smc_checks";
ALTER TABLE "public"."leads" DROP CONSTRAINT IF EXISTS "leads_tier_code_fkey";
ALTER TABLE "public"."brokers" DROP CONSTRAINT IF EXISTS "brokers_status_check";
ALTER TABLE "public"."brokers" ADD CONSTRAINT "brokers_status_check" CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text, 'Prospect'::text])));  -- previous definition
ALTER TABLE "public"."communications" DROP CONSTRAINT IF EXISTS "communications_channel_check";
ALTER TABLE "public"."communications" ADD CONSTRAINT "communications_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text, 'call'::text])));  -- previous definition
ALTER TABLE "public"."communications" DROP CONSTRAINT IF EXISTS "communications_recipient_type_check";
ALTER TABLE "public"."communications" ADD CONSTRAINT "communications_recipient_type_check" CHECK ((recipient_type = ANY (ARRAY['admin'::text, 'broker'::text, 'client'::text])));  -- previous definition
ALTER TABLE "public"."communications" DROP CONSTRAINT IF EXISTS "communications_sender_type_check";
ALTER TABLE "public"."communications" ADD CONSTRAINT "communications_sender_type_check" CHECK ((sender_type = ANY (ARRAY['admin'::text, 'broker'::text, 'client'::text])));  -- previous definition
ALTER TABLE "public"."communications" DROP CONSTRAINT IF EXISTS "communications_status_check";
ALTER TABLE "public"."communications" ADD CONSTRAINT "communications_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'received'::text])));  -- previous definition
DROP INDEX IF EXISTS "public"."appointments_smc_graph_event_uidx";
DROP INDEX IF EXISTS "public"."appointments_smc_idem_uidx";
DROP INDEX IF EXISTS "public"."appointments_smc_lead_idx";
DROP INDEX IF EXISTS "public"."appointments_smc_no_double_booking";
DROP INDEX IF EXISTS "public"."audit_log_at_idx";
DROP INDEX IF EXISTS "public"."audit_log_table_row_idx";
DROP INDEX IF EXISTS "public"."brokers_brand_status_idx";
DROP INDEX IF EXISTS "public"."brokers_ref_code_uidx";
DROP INDEX IF EXISTS "public"."communications_smc_external_uidx";
DROP INDEX IF EXISTS "public"."communications_smc_lead_time_idx";
DROP INDEX IF EXISTS "public"."lead_activities_broker_time_idx";
DROP INDEX IF EXISTS "public"."lead_activities_idem_uidx";
DROP INDEX IF EXISTS "public"."lead_activities_lead_time_idx";
DROP INDEX IF EXISTS "public"."leads_lead_event_id_uidx";
DROP INDEX IF EXISTS "public"."leads_leadgen_id_uidx";
DROP INDEX IF EXISTS "public"."leads_smc_ad_idx";
DROP INDEX IF EXISTS "public"."leads_smc_broker_cycle_idx";
DROP INDEX IF EXISTS "public"."leads_smc_dedupe_idx";
DROP INDEX IF EXISTS "public"."leads_smc_retention_idx";
DROP INDEX IF EXISTS "public"."leads_smc_stage_idx";
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "broker_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "doc_sha256" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "kind" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "signed_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "signed_by_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "signed_user_agent" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "signer_ip" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."admin_documents" DROP COLUMN IF EXISTS "version" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "booked_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "booked_via" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "calendar_provider" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "call_number" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "cancelled_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "confirmed_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "cycle_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "ends_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "graph_calendar_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "graph_event_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "ical_uid" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "ics_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "idempotency_key" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "invite_email_status" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "join_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "method" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "previous_booking_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "reschedule_count" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."appointments" DROP COLUMN IF EXISTS "schedule_event_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "actor_role" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "actor_uid" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "diff" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "reason" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "row_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "source" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "active" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "add_client_as_attendee" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "approved_live_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "approved_live_by" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "avg_commission_zar" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "bio_short" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "bookings_paused" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "buffer_minutes" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_provider" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "calendar_token_ref" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "card_autorenew" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "close_rate" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "consent_mode" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "current_cycle_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "explainer_watched_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "fsp_check" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "fsp_number" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "fsp_verified_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "headshot_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "horizon_days" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "intro_card_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "intro_media_pref" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "intro_video_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "intro_voice_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "languages" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "max_meetings_per_day" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "max_meetings_per_week" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "meeting_hours" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "methods_supported" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "min_notice_hours" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "ms_tenant_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "onboarding_progress" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "onboarding_step" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "paystack_customer_code" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "positioning_answers" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "ref_code" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "routing_on" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "routing_rules" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "slot_minutes" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "status_changed_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "tier_code" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "timezone" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."brokers" DROP COLUMN IF EXISTS "years_advising" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "author" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "cost_zar" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "delivered_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "failed_reason" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "guardrail_rule" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "guardrail_trip" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "handoff" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "intent" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "latency_ms" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "llm_model" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "read_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "redacted" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "template_category" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "template_name" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."communications" DROP COLUMN IF EXISTS "workflow" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "actor_type" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "broker_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "cycle_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "idempotency_key" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "occurred_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "payload" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."lead_activities" DROP COLUMN IF EXISTS "workflow" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "ad_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "adset_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "age_band" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "alt_number" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "alt_purpose" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "angle" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "best_time" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "bond" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "brand_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "budget_band" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "call_number_line_type" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "call_number" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "campaign_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "client_ip" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "client_user_agent" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "concept" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "consent_ads_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "consent_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "consent_mode" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "consent_page_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "consent_source" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "consent_text_version" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "consent_text" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "conv_state" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "ctwa_clid" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "cycle_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "dedupe_hash" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "dependants" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "disclosure_delivered_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "disclosure_msg_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "disqualified_reason" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "duplicate_of" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_purpose" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "email_status" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "fbclid" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "fbc" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "fbp" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "first_message_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "health_flag" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "is_synthetic" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "language" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "last_contact_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "lead_event_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "leadgen_id" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "line_type" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "method_pref" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "opted_out_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "origin" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "page_url" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "placement" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "qualified_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "ref" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "retention_delete_after" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "routed_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "routing_reason" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "stage_entered_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "stage" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "tier_code" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "utm_campaign" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "utm_content" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "utm_medium" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "utm_source" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "utm_term" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "verified_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "wa_delivered_at" CASCADE;  -- data in this column is lost
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "work_cover" CASCADE;  -- data in this column is lost
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."lead_activities" WHERE "agent_id" IS NULL) THEN ALTER TABLE "public"."lead_activities" ALTER COLUMN "agent_id" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.lead_activities.agent_id: rows with NULL exist (written since the migration)'; END IF; END $u$;
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."lead_activities" WHERE "lead_id" IS NULL) THEN ALTER TABLE "public"."lead_activities" ALTER COLUMN "lead_id" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.lead_activities.lead_id: rows with NULL exist (written since the migration)'; END IF; END $u$;
DO $u$ BEGIN IF NOT EXISTS (SELECT 1 FROM "public"."leads" WHERE "email" IS NULL) THEN ALTER TABLE "public"."leads" ALTER COLUMN "email" SET NOT NULL; ELSE RAISE NOTICE 'not restoring NOT NULL on public.leads.email: rows with NULL exist (written since the migration)'; END IF; END $u$;
DROP TABLE IF EXISTS "public"."bank_credits" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."brands" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."cycles" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."invoices_smc" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."outcomes" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."pricing" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."replacements" CASCADE;  -- all rows lost
DROP TABLE IF EXISTS "public"."webhook_events" CASCADE;  -- all rows lost
DROP TYPE IF EXISTS public."smc_disposition_code" CASCADE;
-- Rows written by the smc_audit trigger (seeds and every later SMC write) are in the live public.audit_log; they carry actor_role, legacy fn_audit rows do not.
COMMIT;
