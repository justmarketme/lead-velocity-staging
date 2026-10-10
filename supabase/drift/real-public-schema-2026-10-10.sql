-- =============================================================================
-- MIRROR of the LIVE public schema of Supabase project cmsylaupctrbsvzrgzwy ("lead-velocity-staging"),
-- captured 2026-10-10 with READ-ONLY SELECTs (pg_catalog / information_schema) through the Supabase MCP.
-- Postgres 17.6. Purpose: a LOCAL, throwaway Postgres can recreate what production really looks like, so the
-- smc_* chain can be rehearsed against it. Schema only, NO data, no secrets. Never apply to the live project.
--
-- Fidelity:
--   * tables, columns (type / NOT NULL / default), PK / UNIQUE / FK / CHECK constraints, indexes, RLS flags,
--     ALL policies (public + storage.objects), triggers, grants (default Supabase: anon/authenticated/service_role
--     get ALL on every table, via default privileges) and function ACLs are exact.
--   * function BODIES: has_role, update_updated_at_column, calculate_next_schedule, update_next_schedule, fn_audit,
--     fn_onboarding_to_pipeline, handle_new_user_master are exact (handle_new_user_master trimmed to the
--     same effects); the order/broker RPCs are signature-exact STUBS (same name, args, SECURITY DEFINER,
--     search_path, ACL; return type simplified to jsonb) because no smc migration touches their bodies.
--   * Run AFTER automation/tests/fixtures/pg-stub.sql (auth / storage / vault / roles stub) and
--     real-public-prelude.sql (default privileges, extra roles).
-- =============================================================================

SET check_function_bodies = off;
CREATE TYPE public.app_role AS ENUM ('admin','broker');

-- ---- functions needed by policies / triggers --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $f$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $f$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $f$;

CREATE OR REPLACE FUNCTION public.calculate_next_schedule(p_frequency text, p_day_of_week integer, p_day_of_month integer, p_time_of_day time without time zone)
 RETURNS timestamp with time zone LANGUAGE plpgsql SET search_path TO 'public'
AS $f$
DECLARE next_run timestamp with time zone; current_time_tz timestamp with time zone := now();
BEGIN
  CASE p_frequency
    WHEN 'daily' THEN next_run := date_trunc('day', current_time_tz) + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN next_run := next_run + interval '1 day'; END IF;
    WHEN 'weekly' THEN next_run := date_trunc('week', current_time_tz) + (p_day_of_week || ' days')::interval + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN next_run := next_run + interval '1 week'; END IF;
    WHEN 'monthly' THEN next_run := date_trunc('month', current_time_tz) + ((p_day_of_month - 1) || ' days')::interval + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN next_run := next_run + interval '1 month'; END IF;
  END CASE;
  RETURN next_run;
END; $f$;

CREATE OR REPLACE FUNCTION public.update_next_schedule() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $f$ BEGIN
  NEW.next_scheduled_at := calculate_next_schedule(NEW.frequency, COALESCE(NEW.day_of_week, 1), COALESCE(NEW.day_of_month, 1), NEW.time_of_day);
  NEW.updated_at := now(); RETURN NEW; END; $f$;

-- ---- tables (alphabetical; FKs added after) -------------------------------------------------------------------------
CREATE TABLE public.admin_documents (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, description text, file_path text NOT NULL, file_type text, file_size bigint, category text DEFAULT 'general', uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), content_data jsonb);
CREATE TABLE public.admin_invites (id uuid NOT NULL DEFAULT gen_random_uuid(), token text NOT NULL, created_by uuid NOT NULL, email text, used_at timestamptz, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE public.ai_call_requests (id uuid NOT NULL DEFAULT gen_random_uuid(), recipient_type text NOT NULL, recipient_id uuid NOT NULL, recipient_name text NOT NULL, recipient_phone text NOT NULL, call_purpose text NOT NULL, call_purpose_details text, call_status text NOT NULL DEFAULT 'pending', call_sid text, call_duration integer, call_recording_url text, call_summary text, proposed_changes jsonb, changes_approved boolean, changes_approved_by uuid, changes_approved_at timestamptz, admin_notes text, requested_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), opener_index integer, conversation_history jsonb DEFAULT '[]'::jsonb, join_url text);
CREATE TABLE public.appointments (id uuid NOT NULL DEFAULT gen_random_uuid(), broker_id uuid, client_id uuid, appointment_date timestamptz NOT NULL, status text DEFAULT 'Scheduled', reason text, reason_notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.audit_log (id uuid NOT NULL DEFAULT gen_random_uuid(), table_name text NOT NULL, record_id uuid, action text NOT NULL, changed_fields text[], old_data jsonb, new_data jsonb, changed_by uuid, changed_by_email text, changed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.broker_activities (id uuid NOT NULL DEFAULT gen_random_uuid(), broker_id uuid NOT NULL, activity_type text NOT NULL DEFAULT 'note', outcome text, body text, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.broker_analysis (id uuid NOT NULL DEFAULT gen_random_uuid(), response_id uuid, broker_id uuid, operational_score integer NOT NULL DEFAULT 0, budget_score integer NOT NULL DEFAULT 0, growth_score integer NOT NULL DEFAULT 0, intent_score integer NOT NULL DEFAULT 0, success_probability integer NOT NULL DEFAULT 0, risk_flags text[] DEFAULT '{}'::text[], primary_sales_angle text NOT NULL DEFAULT ''::text, success_band text NOT NULL DEFAULT 'Low Probability', ai_explanation text, status text DEFAULT 'pending', admin_notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.broker_feedback (id uuid NOT NULL DEFAULT gen_random_uuid(), broker_id uuid, order_id uuid, lead_id uuid, message text, created_at timestamptz DEFAULT now(), status text DEFAULT 'open');
CREATE TABLE public.broker_followups (id uuid NOT NULL DEFAULT gen_random_uuid(), broker_id uuid NOT NULL, due_at timestamptz NOT NULL, title text NOT NULL, notes text, status text NOT NULL DEFAULT 'open', created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);
CREATE TABLE public.broker_invites (id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(), email text NOT NULL, token text NOT NULL, broker_name text, firm_name text, created_at timestamptz DEFAULT now(), expires_at timestamptz NOT NULL, used_at timestamptz, created_by uuid, portal_type text DEFAULT 'referral');
CREATE TABLE public.broker_notes (id uuid NOT NULL DEFAULT gen_random_uuid(), lead_id uuid, author_id uuid, author_role text, content text NOT NULL, is_read boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE public.broker_onboarding_responses (id uuid NOT NULL DEFAULT gen_random_uuid(), broker_id uuid, full_name text, email text, phone_number text, firm_name text, crm_usage text NOT NULL, speed_to_contact text NOT NULL, team_size text NOT NULL, follow_up_process text NOT NULL, monthly_lead_spend text NOT NULL, cpl_awareness text NOT NULL, pricing_comfort text NOT NULL, desired_leads_weekly integer NOT NULL, max_capacity_weekly integer NOT NULL, product_focus_clarity text NOT NULL, geographic_focus_clarity text NOT NULL, growth_goal_clarity text NOT NULL, timeline_to_start text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), company_name text, preferred_call_time text, whatsapp_number text, whatsapp_consent boolean DEFAULT false, receives_leads_currently boolean, current_lead_provider text, current_monthly_spend numeric, current_cpl numeric, current_conversion_rate text, monthly_sales_target numeric, product_focus text[] DEFAULT '{}'::text[], pipeline_broker_id uuid);
CREATE TABLE public.broker_reset_requests (id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(), email text NOT NULL, status text DEFAULT 'pending', created_at timestamptz DEFAULT now(), resolved_at timestamptz, resolved_by uuid);
CREATE TABLE public.broker_security_questions (id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(), user_id uuid NOT NULL, question_1 text NOT NULL, answer_1 text NOT NULL, question_2 text NOT NULL, answer_2 text NOT NULL, question_3 text NOT NULL, answer_3 text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.brokers (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid, firm_name text NOT NULL, contact_person text NOT NULL, phone_number text, status text DEFAULT 'Active', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), email text, portal_style text DEFAULT 'Standard', tier text DEFAULT 'Pilot', is_lead_loading boolean DEFAULT true, portal_type text DEFAULT 'referral', mgmt_stage text NOT NULL DEFAULT 'New', next_follow_up_at timestamptz);
CREATE TABLE public.call_coaching (id uuid NOT NULL DEFAULT gen_random_uuid(), call_request_id uuid, broker_id uuid, client_name text, summary_bullets jsonb, scorecard jsonb, total_score integer, coach_feedback jsonb, fsca_compliance jsonb, whatsapp_sent text, appointment_confirmed boolean DEFAULT false, fee_triggered boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE public.call_transcripts (id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL, call_id text, conversation_id text, note text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE public.clients (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL, whatsapp text, website_url text, industry text, revenue_range text, monthly_budget integer, status text NOT NULL DEFAULT 'blueprint-submitted', company text, next_action text, assigned_to text, last_active_at timestamptz, activated_at timestamptz, churn_date timestamptz, created_by text, challenges jsonb NOT NULL DEFAULT '[]'::jsonb, competitors jsonb NOT NULL DEFAULT '[]'::jsonb, current_marketing jsonb NOT NULL DEFAULT '[]'::jsonb, tools_used jsonb NOT NULL DEFAULT '[]'::jsonb, success_goals jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), blueprint_markdown text, owner_id uuid, sop_project_id uuid, package_intent text, primary_intent text, preferred_contact_time text, social_instagram text, social_tiktok text, social_facebook text, social_x text, social_youtube text, social_insights jsonb, serve_area text, team_size text, biggest_frustration text, package_preference text, client_acquisition text, sub_niche text, industry_custom_description text, industry_classified text, previous_vendor_exp text[], conversion_rate text, speed_to_contact text, avg_transaction_value text, urgency_timeline text, primary_social_handle text, hours_lost_per_week text, site_conversion_status text, website_exists text, google_business_data jsonb, enquiry_volume text, follow_up_method text, missed_call_handling text, google_maps_status text, biggest_time_waste text[], website_goal text[], current_website_status text);
CREATE TABLE public.communications (id uuid NOT NULL DEFAULT gen_random_uuid(), channel text NOT NULL, direction text NOT NULL, sender_type text NOT NULL, sender_id uuid, recipient_type text NOT NULL, recipient_id uuid, recipient_contact text NOT NULL, subject text, content text, status text DEFAULT 'pending', external_id text, call_duration integer, call_recording_url text, lead_id uuid, referral_id uuid, broker_id uuid, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), response_time_seconds integer, responded_to_id uuid);
CREATE TABLE public.contact_submissions (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, email text, phone text, company text, message text, source text NOT NULL DEFAULT 'website_contact', status text NOT NULL DEFAULT 'new', admin_notes text, assigned_to uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.conversation_messages (id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL, conversation_id text NOT NULL, role text NOT NULL, content text NOT NULL, channel text, created_at timestamptz DEFAULT now());
CREATE TABLE public.conversations (id uuid NOT NULL DEFAULT gen_random_uuid(), teams_thread_id text, conversation_ref text, teams_service_url text, teams_tenant_id text, created_at timestamptz DEFAULT now());
CREATE TABLE public.crm_activity (id uuid NOT NULL DEFAULT gen_random_uuid(), action_type text NOT NULL, client_id uuid, user_actor text NOT NULL DEFAULT ''::text, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.deals (id uuid NOT NULL DEFAULT gen_random_uuid(), client_id uuid NOT NULL, proposal_status text NOT NULL, deal_value integer NOT NULL DEFAULT 0, service_type text NOT NULL, created_at timestamp without time zone NOT NULL DEFAULT now(), sent_at timestamptz, accepted_at timestamptz);
CREATE TABLE public.document_shares (id uuid NOT NULL DEFAULT gen_random_uuid(), document_id uuid NOT NULL, broker_id uuid NOT NULL, shared_by uuid NOT NULL, shared_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.events (id uuid NOT NULL DEFAULT gen_random_uuid(), client_id uuid NOT NULL, event_type text NOT NULL, "timestamp" timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.lead_activities (id uuid NOT NULL DEFAULT gen_random_uuid(), lead_id uuid NOT NULL, agent_id uuid NOT NULL, activity_type text NOT NULL, notes text, created_at timestamptz DEFAULT now());
CREATE TABLE public.lead_conversations (id uuid NOT NULL DEFAULT gen_random_uuid(), lead_id uuid NOT NULL, user_id uuid NOT NULL, message text NOT NULL, sender_role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz, read_by uuid);
CREATE TABLE public.lead_order_items (order_id uuid NOT NULL, lead_id uuid NOT NULL, pipeline_stage text NOT NULL DEFAULT 'New');
CREATE TABLE public.lead_orders (id uuid NOT NULL DEFAULT gen_random_uuid(), broker_id uuid, title text, lead_count integer DEFAULT 0, amount_zar integer DEFAULT 0, currency text DEFAULT 'ZAR', status text NOT NULL DEFAULT 'pending', contract_signed_at timestamptz, contract_doc_id uuid, paystack_reference text, paid_at timestamptz, criteria jsonb, created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), contract_signature text, contract_signature_image text);
CREATE TABLE public.leads (id uuid NOT NULL DEFAULT gen_random_uuid(), email text NOT NULL, phone text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), broker_id uuid, first_name text, last_name text, source text, current_status text DEFAULT 'New', notes text, date_uploaded timestamptz DEFAULT now(), company text, role text, address text, vibe integer DEFAULT 0);
CREATE TABLE public.message_templates (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, channel text NOT NULL, subject text, content text NOT NULL, category text NOT NULL DEFAULT 'general', created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.notification_preferences (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, ai_call_email boolean NOT NULL DEFAULT true, ai_call_in_app boolean NOT NULL DEFAULT true, ai_call_sound boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.profiles (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, full_name text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), security_question_1 text, security_answer_1 text, security_question_2 text, security_answer_2 text, telegram_chat_id text, telegram_enabled boolean DEFAULT false, telegram_pairing_code text, discord_user_id text, discord_enabled boolean DEFAULT false, discord_pairing_code text);
CREATE TABLE public.referrals (id uuid NOT NULL DEFAULT gen_random_uuid(), parent_lead_id uuid NOT NULL, first_name text NOT NULL, phone_number text NOT NULL, will_status text DEFAULT 'Pending', appointment_date timestamptz, broker_appointment_scheduled boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.report_history (id uuid NOT NULL DEFAULT gen_random_uuid(), scheduled_report_id uuid, sent_at timestamptz NOT NULL DEFAULT now(), recipients text[] NOT NULL, status text NOT NULL, error_message text, report_data jsonb);
CREATE TABLE public.reports (id uuid NOT NULL DEFAULT gen_random_uuid(), client_id uuid NOT NULL, health_score integer, video_url text, report_generated boolean NOT NULL DEFAULT false, video_complete boolean NOT NULL DEFAULT false, sent_at timestamptz, report_markdown text, share_token text, delivery_complete boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.research_notes (id uuid NOT NULL DEFAULT gen_random_uuid(), conversation_id text NOT NULL DEFAULT 'emma-global', query text NOT NULL DEFAULT ''::text, note text NOT NULL DEFAULT ''::text, source_url text, created_at timestamptz DEFAULT now());
CREATE TABLE public.scheduled_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, report_type text NOT NULL, frequency text NOT NULL, day_of_week integer, day_of_month integer, time_of_day time NOT NULL DEFAULT '09:00:00', enabled boolean NOT NULL DEFAULT true, recipient_type text NOT NULL, recipient_ids uuid[] DEFAULT '{}'::uuid[], broker_id uuid, include_sections text[] DEFAULT ARRAY['summary','channel_breakdown','response_times'], last_sent_at timestamptz, next_scheduled_at timestamptz, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.sla_alerts (id uuid NOT NULL DEFAULT gen_random_uuid(), communication_id uuid, channel text NOT NULL, severity text NOT NULL, response_time_seconds integer NOT NULL, threshold_seconds integer NOT NULL, recipient_type text NOT NULL, recipient_id uuid, acknowledged boolean NOT NULL DEFAULT false, acknowledged_by uuid, acknowledged_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.sla_thresholds (id uuid NOT NULL DEFAULT gen_random_uuid(), channel text NOT NULL, warning_seconds integer NOT NULL DEFAULT 1800, critical_seconds integer NOT NULL DEFAULT 3600, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid);
CREATE TABLE public.system_logs (id uuid NOT NULL DEFAULT gen_random_uuid(), event_type text NOT NULL, message text, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.tasks (id uuid NOT NULL DEFAULT gen_random_uuid(), client_id uuid, task_type text NOT NULL, status text NOT NULL DEFAULT 'pending', due_date date, assigned_to text, priority text, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.tunnel_config (id integer NOT NULL DEFAULT 1, url text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.upsells (id uuid NOT NULL DEFAULT gen_random_uuid(), client_id uuid NOT NULL, service_name text NOT NULL, projected_revenue integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending', sent_at timestamptz, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.user_roles (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role app_role NOT NULL, created_at timestamptz DEFAULT now());

-- ---- primary keys / unique -----------------------------------------------------------------------------------------
ALTER TABLE public.admin_documents ADD CONSTRAINT admin_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_invites ADD CONSTRAINT admin_invites_pkey PRIMARY KEY (id), ADD CONSTRAINT admin_invites_token_key UNIQUE (token);
ALTER TABLE public.ai_call_requests ADD CONSTRAINT ai_call_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_activities ADD CONSTRAINT broker_activities_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_analysis ADD CONSTRAINT broker_analysis_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_feedback ADD CONSTRAINT broker_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_followups ADD CONSTRAINT broker_followups_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_invites ADD CONSTRAINT broker_invites_pkey PRIMARY KEY (id), ADD CONSTRAINT broker_invites_token_key UNIQUE (token);
ALTER TABLE public.broker_notes ADD CONSTRAINT broker_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_onboarding_responses ADD CONSTRAINT broker_onboarding_responses_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_reset_requests ADD CONSTRAINT broker_reset_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.broker_security_questions ADD CONSTRAINT broker_security_questions_pkey PRIMARY KEY (id), ADD CONSTRAINT broker_security_questions_user_id_key UNIQUE (user_id);
ALTER TABLE public.brokers ADD CONSTRAINT brokers_pkey PRIMARY KEY (id), ADD CONSTRAINT brokers_email_key UNIQUE (email), ADD CONSTRAINT brokers_user_id_key UNIQUE (user_id);
ALTER TABLE public.call_coaching ADD CONSTRAINT call_coaching_pkey PRIMARY KEY (id);
ALTER TABLE public.call_transcripts ADD CONSTRAINT call_transcripts_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id), ADD CONSTRAINT clients_email_key UNIQUE (email);
ALTER TABLE public.communications ADD CONSTRAINT communications_pkey PRIMARY KEY (id);
ALTER TABLE public.contact_submissions ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id), ADD CONSTRAINT conversations_teams_thread_id_key UNIQUE (teams_thread_id);
ALTER TABLE public.crm_activity ADD CONSTRAINT crm_activity_pkey PRIMARY KEY (id);
ALTER TABLE public.deals ADD CONSTRAINT deals_pkey PRIMARY KEY (id);
ALTER TABLE public.document_shares ADD CONSTRAINT document_shares_pkey PRIMARY KEY (id), ADD CONSTRAINT document_shares_document_id_broker_id_key UNIQUE (document_id, broker_id);
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_activities ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_conversations ADD CONSTRAINT lead_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_order_items ADD CONSTRAINT lead_order_items_pkey PRIMARY KEY (order_id, lead_id);
ALTER TABLE public.lead_orders ADD CONSTRAINT lead_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id), ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id), ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.referrals ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);
ALTER TABLE public.report_history ADD CONSTRAINT report_history_pkey PRIMARY KEY (id);
ALTER TABLE public.reports ADD CONSTRAINT reports_pkey PRIMARY KEY (id);
ALTER TABLE public.research_notes ADD CONSTRAINT research_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.scheduled_reports ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.sla_alerts ADD CONSTRAINT sla_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.sla_thresholds ADD CONSTRAINT sla_thresholds_pkey PRIMARY KEY (id), ADD CONSTRAINT sla_thresholds_channel_key UNIQUE (channel);
ALTER TABLE public.system_logs ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tunnel_config ADD CONSTRAINT tunnel_config_pkey PRIMARY KEY (id);
ALTER TABLE public.upsells ADD CONSTRAINT upsells_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id), ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- ---- foreign keys --------------------------------------------------------------------------------------------------
ALTER TABLE public.appointments ADD CONSTRAINT appointments_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE CASCADE, ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.broker_activities ADD CONSTRAINT broker_activities_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE CASCADE;
ALTER TABLE public.broker_analysis ADD CONSTRAINT broker_analysis_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.broker_onboarding_responses(id) ON DELETE CASCADE;
ALTER TABLE public.broker_feedback ADD CONSTRAINT broker_feedback_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id);
ALTER TABLE public.broker_followups ADD CONSTRAINT broker_followups_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE CASCADE;
ALTER TABLE public.broker_invites ADD CONSTRAINT broker_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.broker_notes ADD CONSTRAINT broker_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id), ADD CONSTRAINT broker_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.broker_onboarding_responses ADD CONSTRAINT broker_onboarding_responses_pipeline_broker_id_fkey FOREIGN KEY (pipeline_broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL;
ALTER TABLE public.broker_reset_requests ADD CONSTRAINT broker_reset_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
ALTER TABLE public.broker_security_questions ADD CONSTRAINT broker_security_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.brokers ADD CONSTRAINT brokers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.call_coaching ADD CONSTRAINT call_coaching_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE CASCADE, ADD CONSTRAINT call_coaching_call_request_id_fkey FOREIGN KEY (call_request_id) REFERENCES public.ai_call_requests(id) ON DELETE CASCADE;
ALTER TABLE public.communications ADD CONSTRAINT communications_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL, ADD CONSTRAINT communications_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL, ADD CONSTRAINT communications_referral_id_fkey FOREIGN KEY (referral_id) REFERENCES public.referrals(id) ON DELETE SET NULL, ADD CONSTRAINT communications_responded_to_id_fkey FOREIGN KEY (responded_to_id) REFERENCES public.communications(id);
ALTER TABLE public.crm_activity ADD CONSTRAINT crm_activity_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD CONSTRAINT deals_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.document_shares ADD CONSTRAINT document_shares_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE CASCADE, ADD CONSTRAINT document_shares_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.admin_documents(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.lead_activities ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_conversations ADD CONSTRAINT lead_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_order_items ADD CONSTRAINT lead_order_items_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE, ADD CONSTRAINT lead_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.lead_orders(id) ON DELETE CASCADE;
ALTER TABLE public.lead_orders ADD CONSTRAINT lead_orders_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD CONSTRAINT leads_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_parent_lead_id_fkey FOREIGN KEY (parent_lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.report_history ADD CONSTRAINT report_history_scheduled_report_id_fkey FOREIGN KEY (scheduled_report_id) REFERENCES public.scheduled_reports(id) ON DELETE CASCADE;
ALTER TABLE public.reports ADD CONSTRAINT reports_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.scheduled_reports ADD CONSTRAINT scheduled_reports_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id), ADD CONSTRAINT scheduled_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.sla_alerts ADD CONSTRAINT sla_alerts_communication_id_fkey FOREIGN KEY (communication_id) REFERENCES public.communications(id);
ALTER TABLE public.sla_thresholds ADD CONSTRAINT sla_thresholds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.upsells ADD CONSTRAINT upsells_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---- check constraints ---------------------------------------------------------------------------------------------
ALTER TABLE public.ai_call_requests
  ADD CONSTRAINT ai_call_requests_call_purpose_check CHECK (call_purpose = ANY (ARRAY['appointment_scheduling','appointment_rescheduling','follow_up','voice_note','general_inquiry','reminder','cold_call'])),
  ADD CONSTRAINT ai_call_requests_call_status_check CHECK (call_status = ANY (ARRAY['pending','in_progress','completed','failed','cancelled'])),
  ADD CONSTRAINT ai_call_requests_recipient_type_check CHECK (recipient_type = ANY (ARRAY['lead','referral','broker']));
ALTER TABLE public.broker_invites ADD CONSTRAINT broker_invites_portal_type_check CHECK (portal_type = ANY (ARRAY['referral','marketing']));
ALTER TABLE public.broker_notes ADD CONSTRAINT broker_notes_author_role_check CHECK (author_role = ANY (ARRAY['broker','admin']));
ALTER TABLE public.broker_reset_requests ADD CONSTRAINT broker_reset_requests_status_check CHECK (status = ANY (ARRAY['pending','resolved','dismissed']));
ALTER TABLE public.brokers
  ADD CONSTRAINT brokers_portal_style_check CHECK (portal_style = ANY (ARRAY['Standard','Elite'])),
  ADD CONSTRAINT brokers_portal_type_check CHECK (portal_type = ANY (ARRAY['referral','marketing'])),
  ADD CONSTRAINT brokers_status_check CHECK (status = ANY (ARRAY['Active','Inactive','Prospect'])),
  ADD CONSTRAINT brokers_tier_check CHECK (tier = ANY (ARRAY['Pilot','Bronze','Silver','Gold']));
ALTER TABLE public.communications
  ADD CONSTRAINT communications_channel_check CHECK (channel = ANY (ARRAY['email','sms','whatsapp','call'])),
  ADD CONSTRAINT communications_direction_check CHECK (direction = ANY (ARRAY['inbound','outbound'])),
  ADD CONSTRAINT communications_recipient_type_check CHECK (recipient_type = ANY (ARRAY['admin','broker','client'])),
  ADD CONSTRAINT communications_sender_type_check CHECK (sender_type = ANY (ARRAY['admin','broker','client'])),
  ADD CONSTRAINT communications_status_check CHECK (status = ANY (ARRAY['pending','sent','delivered','failed','received']));
ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_role_check CHECK (role = ANY (ARRAY['user','assistant']));
ALTER TABLE public.lead_conversations ADD CONSTRAINT lead_conversations_sender_role_check CHECK (sender_role = ANY (ARRAY['broker','admin']));
ALTER TABLE public.lead_orders ADD CONSTRAINT lead_orders_status_check CHECK (status = ANY (ARRAY['pending','contract_signed','paid','delivered','cancelled']));
ALTER TABLE public.leads
  ADD CONSTRAINT leads_current_status_check CHECK (current_status = ANY (ARRAY['New','Contacted','Will Done','Appointment Booked','Rejected'])),
  ADD CONSTRAINT leads_source_check CHECK ((source = ANY (ARRAY['website_form','referral','campaign','cold_call','other','Campaign Lead','Search Lead','Ayanda Prospecting'])) OR (source ~~ 'Ayanda Prospecting | %'));
ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_channel_check CHECK (channel = ANY (ARRAY['email','sms','whatsapp','all']));
ALTER TABLE public.referrals ADD CONSTRAINT referrals_will_status_check CHECK (will_status = ANY (ARRAY['Pending','Done']));
ALTER TABLE public.report_history ADD CONSTRAINT report_history_status_check CHECK (status = ANY (ARRAY['sent','failed','partial']));
ALTER TABLE public.scheduled_reports
  ADD CONSTRAINT scheduled_reports_day_of_month_check CHECK (day_of_month >= 1 AND day_of_month <= 28),
  ADD CONSTRAINT scheduled_reports_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6),
  ADD CONSTRAINT scheduled_reports_frequency_check CHECK (frequency = ANY (ARRAY['daily','weekly','monthly'])),
  ADD CONSTRAINT scheduled_reports_recipient_type_check CHECK (recipient_type = ANY (ARRAY['all_admins','specific_admins','broker','all_brokers'])),
  ADD CONSTRAINT scheduled_reports_report_type_check CHECK (report_type = ANY (ARRAY['admin_summary','broker_client_report']));
ALTER TABLE public.sla_alerts ADD CONSTRAINT sla_alerts_severity_check CHECK (severity = ANY (ARRAY['warning','critical']));

-- ---- indexes (non-constraint) --------------------------------------------------------------------------------------
CREATE INDEX call_transcripts_conv_idx ON public.call_transcripts USING btree (conversation_id, created_at DESC);
CREATE INDEX clients_created_idx ON public.clients USING btree (created_at DESC);
CREATE INDEX clients_status_idx ON public.clients USING btree (status);
CREATE INDEX crm_activity_client_idx ON public.crm_activity USING btree (client_id, created_at DESC);
CREATE INDEX crm_activity_created_idx ON public.crm_activity USING btree (created_at DESC);
CREATE INDEX deals_client_id_idx ON public.deals USING btree (client_id);
CREATE INDEX events_client_time_idx ON public.events USING btree (client_id, "timestamp" DESC);
CREATE INDEX events_type_time_idx ON public.events USING btree (event_type, "timestamp" DESC);
CREATE INDEX idx_admin_invites_token ON public.admin_invites USING btree (token);
CREATE INDEX idx_audit_record ON public.audit_log USING btree (table_name, record_id, changed_at DESC);
CREATE INDEX idx_broker_activities_broker ON public.broker_activities USING btree (broker_id, created_at DESC);
CREATE INDEX idx_broker_followups_broker ON public.broker_followups USING btree (broker_id, due_at);
CREATE INDEX idx_broker_followups_open ON public.broker_followups USING btree (status, due_at) WHERE (status = 'open');
CREATE INDEX idx_brokers_email ON public.brokers USING btree (email);
CREATE INDEX idx_call_coaching_broker_id ON public.call_coaching USING btree (broker_id);
CREATE INDEX idx_call_coaching_call_request_id ON public.call_coaching USING btree (call_request_id);
CREATE INDEX idx_clients_industry ON public.clients USING btree (industry);
CREATE INDEX idx_clients_primary_intent ON public.clients USING btree (primary_intent);
CREATE INDEX idx_clients_status_created ON public.clients USING btree (status, created_at DESC);
CREATE INDEX idx_clients_sub_niche ON public.clients USING btree (sub_niche);
CREATE INDEX idx_clients_urgency_timeline ON public.clients USING btree (urgency_timeline);
CREATE INDEX idx_communications_broker_id ON public.communications USING btree (broker_id);
CREATE INDEX idx_communications_created_at ON public.communications USING btree (created_at DESC);
CREATE INDEX idx_communications_lead_id ON public.communications USING btree (lead_id);
CREATE INDEX idx_communications_recipient ON public.communications USING btree (recipient_id, recipient_type, created_at DESC);
CREATE INDEX idx_communications_referral_id ON public.communications USING btree (referral_id);
CREATE INDEX idx_communications_response_time ON public.communications USING btree (response_time_seconds) WHERE (response_time_seconds IS NOT NULL);
CREATE INDEX idx_contact_submissions_status ON public.contact_submissions USING btree (status, created_at DESC);
CREATE INDEX idx_conversation_messages_lookup ON public.conversation_messages USING btree (conversation_id, created_at DESC);
CREATE INDEX idx_lead_conversations_lead_id ON public.lead_conversations USING btree (lead_id);
CREATE INDEX idx_lead_conversations_unread ON public.lead_conversations USING btree (user_id, read_at) WHERE (read_at IS NULL);
CREATE INDEX idx_leads_current_status ON public.leads USING btree (current_status);
CREATE INDEX idx_leads_updated_at ON public.leads USING btree (updated_at);
CREATE INDEX idx_profiles_discord_pairing_code ON public.profiles USING btree (discord_pairing_code);
CREATE INDEX idx_profiles_discord_user_id ON public.profiles USING btree (discord_user_id);
CREATE INDEX idx_profiles_telegram_chat_id ON public.profiles USING btree (telegram_chat_id);
CREATE INDEX idx_profiles_telegram_pairing_code ON public.profiles USING btree (telegram_pairing_code);
CREATE INDEX idx_report_history_report ON public.report_history USING btree (scheduled_report_id, sent_at DESC);
CREATE INDEX idx_scheduled_reports_broker ON public.scheduled_reports USING btree (broker_id) WHERE (broker_id IS NOT NULL);
CREATE INDEX idx_scheduled_reports_next_scheduled ON public.scheduled_reports USING btree (next_scheduled_at) WHERE (enabled = true);
CREATE INDEX idx_sla_alerts_unacknowledged ON public.sla_alerts USING btree (acknowledged, created_at DESC) WHERE (acknowledged = false);
CREATE INDEX lead_order_items_lead_id_idx ON public.lead_order_items USING btree (lead_id);
CREATE INDEX lead_orders_broker_id_idx ON public.lead_orders USING btree (broker_id);
CREATE INDEX research_notes_conv_idx ON public.research_notes USING btree (conversation_id, created_at DESC);
CREATE INDEX tasks_client_idx ON public.tasks USING btree (client_id);
CREATE INDEX tasks_status_idx ON public.tasks USING btree (status, due_date);
CREATE INDEX upsells_client_idx ON public.upsells USING btree (client_id);
CREATE UNIQUE INDEX reports_client_id_uidx ON public.reports USING btree (client_id);

-- ---- remaining functions (bodies exact where noted in the header; others signature-exact stubs) -------------------
CREATE OR REPLACE FUNCTION public.fn_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE
  v_old jsonb; v_new jsonb; v_changed text[]; k text; v_actor uuid; v_email text;
  v_old_sub jsonb := '{}'::jsonb; v_new_sub jsonb := '{}'::jsonb;
BEGIN
  v_actor := auth.uid();
  BEGIN SELECT email INTO v_email FROM auth.users WHERE id = v_actor; EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_log(table_name, record_id, action, new_data, changed_by, changed_by_email) VALUES (TG_TABLE_NAME, (NEW).id, 'INSERT', to_jsonb(NEW), v_actor, v_email); RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_log(table_name, record_id, action, old_data, changed_by, changed_by_email) VALUES (TG_TABLE_NAME, (OLD).id, 'DELETE', to_jsonb(OLD), v_actor, v_email); RETURN OLD;
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF k = 'updated_at' THEN CONTINUE; END IF;
      IF (v_old->k) IS DISTINCT FROM (v_new->k) THEN
        v_changed := array_append(v_changed, k); v_old_sub := v_old_sub || jsonb_build_object(k, v_old->k); v_new_sub := v_new_sub || jsonb_build_object(k, v_new->k);
      END IF;
    END LOOP;
    IF v_changed IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.audit_log(table_name, record_id, action, changed_fields, old_data, new_data, changed_by, changed_by_email) VALUES (TG_TABLE_NAME, (NEW).id, 'UPDATE', v_changed, v_old_sub, v_new_sub, v_actor, v_email);
    RETURN NEW;
  END IF;
END; $f$;

CREATE OR REPLACE FUNCTION public.fn_onboarding_to_pipeline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_bid uuid; v_email text;
BEGIN
  v_email := nullif(btrim(NEW.email), '');
  IF v_email IS NOT NULL THEN SELECT id INTO v_bid FROM public.brokers WHERE lower(email) = lower(v_email) LIMIT 1; END IF;
  IF v_bid IS NULL THEN
    INSERT INTO public.brokers (user_id, firm_name, contact_person, email, phone_number, status, tier, portal_style, portal_type, mgmt_stage)
    VALUES (NULL, coalesce(nullif(btrim(NEW.firm_name), ''), nullif(btrim(NEW.company_name), ''), 'Independent'), coalesce(nullif(btrim(NEW.full_name), ''), 'Unknown'), v_email,
            coalesce(nullif(btrim(NEW.phone_number), ''), nullif(btrim(NEW.whatsapp_number), '')), 'Prospect', 'Pilot', 'Standard', 'referral', 'New')
    RETURNING id INTO v_bid;
  END IF;
  UPDATE public.broker_onboarding_responses SET pipeline_broker_id = v_bid WHERE id = NEW.id AND pipeline_broker_id IS DISTINCT FROM v_bid;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $f$;

CREATE OR REPLACE FUNCTION public.handle_new_user_master() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $f$
BEGIN  -- STUB: the live body creates profiles / brokers / user_roles / broker_security_questions rows and logs to system_logs
  INSERT INTO public.system_logs (event_type, message, metadata) VALUES ('TRIGGER_INVOKED', 'Trigger fired for ' || NEW.id::text, jsonb_build_object('email', NEW.email));
  RETURN NEW;
END; $f$;

CREATE OR REPLACE FUNCTION public.on_reset_request_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ BEGIN RETURN NEW; END; $f$;  -- STUB (live body calls net.http_post; pg_net is NOT installed on the live project)

-- signature-exact stubs of the order / broker / invite RPCs (bodies not touched by any smc migration)
CREATE OR REPLACE FUNCTION public.admin_bulk_insert_leads(p_rows jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.admin_list_orders_activity() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.admin_mark_order_paid(p_order_id uuid) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::text $f$;
CREATE OR REPLACE FUNCTION public.broker_add_lead_note(p_order_id uuid, p_lead_id uuid, p_note text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.broker_delete_lead_note(p_note_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.broker_get_order_notes(p_order_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.broker_get_pipeline(p_order_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.broker_send_feedback(p_order_id uuid, p_message text, p_lead_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::uuid $f$;
CREATE OR REPLACE FUNCTION public.broker_set_lead_stage(p_order_id uuid, p_lead_id uuid, p_stage text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::text $f$;
CREATE OR REPLACE FUNCTION public.broker_update_lead_status(p_order_id uuid, p_lead_id uuid, p_status text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::text $f$;
CREATE OR REPLACE FUNCTION public.get_admin_invite_by_token(p_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.get_broker_invite_by_token(invite_token text) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE result json; BEGIN SELECT to_json(b) INTO result FROM public.broker_invites b WHERE b.token = invite_token AND b.used_at IS NULL AND b.expires_at > now(); RETURN result; END; $f$;
CREATE OR REPLACE FUNCTION public.get_order_leads(p_order_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.get_order_summary(p_order_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.sign_order_contract(p_order_id uuid, p_signature text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.sign_order_contract_drawn(p_order_id uuid, p_signature_name text, p_signature_image text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.submit_broker_analysis(p_response_id uuid, p_broker_id uuid, p_operational_score integer, p_budget_score integer, p_growth_score integer, p_intent_score integer, p_success_probability integer, p_risk_flags text[], p_primary_sales_angle text, p_success_band text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE v_id uuid; BEGIN
  INSERT INTO broker_analysis (response_id, broker_id, operational_score, budget_score, growth_score, intent_score, success_probability, risk_flags, primary_sales_angle, success_band)
  VALUES (p_response_id, p_broker_id, p_operational_score, p_budget_score, p_growth_score, p_intent_score, p_success_probability, p_risk_flags, p_primary_sales_angle, p_success_band) RETURNING id INTO v_id; RETURN v_id; END; $f$;
CREATE OR REPLACE FUNCTION public.submit_broker_onboarding(p_broker_id uuid, p_full_name text, p_email text, p_phone_number text, p_firm_name text, p_preferred_call_time text, p_whatsapp_number text, p_whatsapp_consent boolean, p_receives_leads_currently boolean, p_current_lead_provider text, p_current_monthly_spend numeric, p_current_cpl numeric, p_current_conversion_rate text, p_crm_usage text, p_speed_to_contact text, p_team_size text, p_follow_up_process text, p_monthly_lead_spend text, p_cpl_awareness text, p_pricing_comfort text, p_desired_leads_weekly integer, p_max_capacity_weekly integer, p_product_focus_clarity text, p_geographic_focus_clarity text, p_growth_goal_clarity text, p_timeline_to_start text, p_monthly_sales_target numeric, p_product_focus text[])
 RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT NULL::uuid $f$;  -- STUB: live body is a plain INSERT into broker_onboarding_responses
CREATE OR REPLACE FUNCTION public.use_admin_invite(invite_token text, new_user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.validate_admin_invite(invite_token text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT false $f$;

-- ---- triggers --------------------------------------------------------------------------------------------------------
CREATE TRIGGER update_admin_documents_updated_at BEFORE UPDATE ON public.admin_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_call_requests_updated_at BEFORE UPDATE ON public.ai_call_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_audit_analysis AFTER INSERT OR DELETE OR UPDATE ON public.broker_analysis FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_followups AFTER INSERT OR DELETE OR UPDATE ON public.broker_followups FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_onboarding AFTER INSERT OR DELETE OR UPDATE ON public.broker_onboarding_responses FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_onboarding_to_pipeline AFTER INSERT ON public.broker_onboarding_responses FOR EACH ROW EXECUTE FUNCTION fn_onboarding_to_pipeline();
CREATE TRIGGER update_broker_security_questions_updated_at BEFORE UPDATE ON public.broker_security_questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_audit_brokers AFTER INSERT OR DELETE OR UPDATE ON public.brokers FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON public.brokers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_communications_updated_at BEFORE UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_audit_contact AFTER INSERT OR DELETE OR UPDATE ON public.contact_submissions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_update_next_schedule BEFORE INSERT OR UPDATE ON public.scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_next_schedule();
CREATE TRIGGER on_auth_user_created_master AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_master();

-- ---- RLS ------------------------------------------------------------------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP; END $$;

CREATE POLICY "Admins can manage all documents" ON public.admin_documents FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can view shared documents" ON public.admin_documents FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM document_shares ds JOIN brokers b ON b.id = ds.broker_id WHERE ds.document_id = admin_documents.id AND b.user_id = auth.uid()));
CREATE POLICY "Admins can create invites" ON public.admin_invites FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete invites" ON public.admin_invites FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update invites" ON public.admin_invites FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage admin invites" ON public.admin_invites FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage AI call requests" ON public.ai_call_requests FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage all appointments" ON public.appointments FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can see their appointments" ON public.appointments FOR SELECT USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
CREATE POLICY "Brokers can update their appointments" ON public.appointments FOR UPDATE USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
CREATE POLICY "Admins read audit log" ON public.audit_log FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage broker activities" ON public.broker_activities FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read broker analysis" ON public.broker_analysis FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can insert broker analysis" ON public.broker_analysis FOR INSERT WITH CHECK (true);
CREATE POLICY broker_feedback_admin_all ON public.broker_feedback FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY broker_feedback_broker_insert ON public.broker_feedback FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM brokers b WHERE b.id = broker_feedback.broker_id AND b.user_id = auth.uid()));
CREATE POLICY broker_feedback_broker_select ON public.broker_feedback FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM brokers b WHERE b.id = broker_feedback.broker_id AND b.user_id = auth.uid()));
CREATE POLICY "Admins manage broker followups" ON public.broker_followups FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage broker invites" ON public.broker_invites FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage broker invites" ON public.broker_invites FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Token holder can update invite" ON public.broker_invites FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage all notes" ON public.broker_notes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can insert notes for their leads" ON public.broker_notes FOR INSERT WITH CHECK (lead_id IN (SELECT leads.id FROM leads WHERE leads.broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid())));
CREATE POLICY "Brokers can see notes for their leads" ON public.broker_notes FOR SELECT USING (lead_id IN (SELECT leads.id FROM leads WHERE leads.broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid())));
CREATE POLICY "Admins read onboarding responses" ON public.broker_onboarding_responses FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can submit onboarding" ON public.broker_onboarding_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage reset requests" ON public.broker_reset_requests FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can create reset requests" ON public.broker_reset_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anyone to insert security questions" ON public.broker_security_questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete for users for their own rows" ON public.broker_security_questions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable select for users for their own rows" ON public.broker_security_questions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable update for users for their own rows" ON public.broker_security_questions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all brokers" ON public.brokers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all brokers" ON public.brokers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Allow authenticated users to insert broker profile" ON public.brokers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can update their own profile" ON public.brokers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Brokers can view their own profile" ON public.brokers FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all call coaching" ON public.call_coaching FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can view their own call coaching" ON public.call_coaching FOR SELECT TO authenticated USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
CREATE POLICY "Admins only" ON public.clients FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert communications" ON public.communications FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Admins can update communications" ON public.communications FOR UPDATE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Admins can view all communications" ON public.communications FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Admins read communications" ON public.communications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can view their communications" ON public.communications FOR SELECT USING (EXISTS (SELECT 1 FROM brokers b WHERE b.user_id = auth.uid() AND (communications.broker_id = b.id OR communications.lead_id IN (SELECT leads.id FROM leads WHERE leads.broker_id = b.id))));
CREATE POLICY "Brokers read own communications" ON public.communications FOR SELECT TO authenticated USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
CREATE POLICY "Admins delete contact submissions" ON public.contact_submissions FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read contact submissions" ON public.contact_submissions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update contact submissions" ON public.contact_submissions FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins only" ON public.crm_activity FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins only" ON public.deals FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage document shares" ON public.document_shares FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can view their shares" ON public.document_shares FOR SELECT USING (EXISTS (SELECT 1 FROM brokers WHERE brokers.id = document_shares.broker_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Admins only" ON public.events FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can create any activities" ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete activities" ON public.lead_activities FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update activities" ON public.lead_activities FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all activities" ON public.lead_activities FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Agents can create their own activities" ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents can view their own activities" ON public.lead_activities FOR SELECT TO authenticated USING (agent_id = auth.uid());
CREATE POLICY "Admins can manage all conversations" ON public.lead_conversations FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can insert conversations on their leads" ON public.lead_conversations FOR INSERT WITH CHECK (sender_role = 'broker' AND EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = lead_conversations.lead_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Brokers can view conversations on their leads" ON public.lead_conversations FOR SELECT USING (EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = lead_conversations.lead_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Users can mark messages as read" ON public.lead_conversations FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = lead_conversations.lead_id AND brokers.user_id = auth.uid())) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = lead_conversations.lead_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Admins full access to lead_order_items" ON public.lead_order_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers view own lead_order_items" ON public.lead_order_items FOR SELECT USING (order_id IN (SELECT o.id FROM lead_orders o JOIN brokers b ON b.id = o.broker_id WHERE b.user_id = auth.uid()));
CREATE POLICY "Admins full access to lead_orders" ON public.lead_orders FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers view own lead_orders" ON public.lead_orders FOR SELECT USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
CREATE POLICY "Admins have full access to leads" ON public.leads FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role)) WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Brokers can insert their own leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM brokers WHERE brokers.id = leads.broker_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Brokers can update their own leads" ON public.leads FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM brokers WHERE brokers.id = leads.broker_id AND brokers.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM brokers WHERE brokers.id = leads.broker_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Brokers can view their own leads" ON public.leads FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM brokers WHERE brokers.id = leads.broker_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Admins can manage templates" ON public.message_templates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view templates" ON public.message_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can view all preferences" ON public.notification_preferences FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert their own preferences" ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own preferences" ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can delete any profile" ON public.profiles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can delete own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all referrals" ON public.referrals FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can insert referrals for their leads" ON public.referrals FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = referrals.parent_lead_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Brokers can update referrals for their leads" ON public.referrals FOR UPDATE USING (EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = referrals.parent_lead_id AND brokers.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = referrals.parent_lead_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Brokers can view referrals from their leads" ON public.referrals FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM leads JOIN brokers ON leads.broker_id = brokers.id WHERE leads.id = referrals.parent_lead_id AND brokers.user_id = auth.uid()));
CREATE POLICY "Admins can view all report history" ON public.report_history FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins only" ON public.reports FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage all scheduled reports" ON public.scheduled_reports FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can view their own report schedules" ON public.scheduled_reports FOR SELECT USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
CREATE POLICY "Admins can update SLA alerts" ON public.sla_alerts FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all SLA alerts" ON public.sla_alerts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage SLA thresholds" ON public.sla_thresholds FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Allow authenticated read access" ON public.system_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert logs" ON public.system_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admins only" ON public.tasks FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "anon can read tunnel_config" ON public.tunnel_config FOR SELECT TO anon USING (true);
CREATE POLICY "service_role can upsert tunnel_config" ON public.tunnel_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins only" ON public.upsells FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---- storage: buckets + policies (live) --------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('admin-documents','admin-documents',false), ('signed-contracts','signed-contracts',false) ON CONFLICT DO NOTHING;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'admin-documents');
CREATE POLICY "Admin Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'admin-documents' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all documents" ON storage.objects FOR SELECT USING (bucket_id = 'admin-documents' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can upload documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'admin-documents' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update documents" ON storage.objects FOR UPDATE USING (bucket_id = 'admin-documents' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete documents" ON storage.objects FOR DELETE USING (bucket_id = 'admin-documents' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Brokers can download shared documents" ON storage.objects FOR SELECT USING (bucket_id = 'admin-documents' AND (has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM admin_documents ad JOIN document_shares ds ON ds.document_id = ad.id JOIN brokers b ON b.id = ds.broker_id WHERE ad.file_path = ad.name AND b.user_id = auth.uid())));
CREATE POLICY signed_contracts_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'signed-contracts' AND (has_role(auth.uid(), 'admin'::app_role) OR (storage.foldername(name))[1] IN (SELECT o.id::text FROM lead_orders o JOIN brokers b ON b.id = o.broker_id WHERE b.user_id = auth.uid())));
CREATE POLICY signed_contracts_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'signed-contracts' AND (has_role(auth.uid(), 'admin'::app_role) OR (storage.foldername(name))[1] IN (SELECT o.id::text FROM lead_orders o JOIN brokers b ON b.id = o.broker_id WHERE b.user_id = auth.uid())));

-- ---- function ACLs as live (hardened by 20260929080638_harden_function_exposure) ----------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_audit(), public.fn_onboarding_to_pipeline(), public.on_reset_request_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_insert_leads(jsonb), public.admin_list_orders_activity(), public.admin_mark_order_paid(uuid) FROM PUBLIC, anon;
