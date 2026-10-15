-- Column names/types read from the project catalog on 14 Oct 2026. No production rows or credentials.
-- Isolated fixture: real broker column shape, selected RLS policies and actual existing functions loaded by the runner.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE n8n_app NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role, n8n_app;
CREATE TABLE public.user_roles(user_id uuid, role text);
CREATE FUNCTION public.smc_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') $$;
CREATE TABLE public.brokers (id uuid PRIMARY KEY, user_id uuid, firm_name text, contact_person text, phone_number text, status text, created_at timestamptz, updated_at timestamptz, email text, portal_style text, tier text, is_lead_loading boolean, portal_type text, mgmt_stage text, next_follow_up_at timestamptz, calendar_email text, google_calendar_token jsonb, whatsapp_number text, firm_address text, preferred_language text, brand_id uuid, fsp_number text, consent_mode text, routing_on boolean, accepts_low_budget boolean, handles_wills boolean, calendar_provider text, ms_tenant_id text, calendar_token_ref text, calendar_mode text, calendar_status text, calendar_connected_at timestamptz, calendar_scopes text, calendar_status_at timestamptz, calendar_status_detail jsonb, next_free_slot_at timestamptz, methods_supported text[], meeting_hours jsonb, timezone text, slot_minutes integer, buffer_minutes integer, min_notice_hours integer, horizon_days integer, max_meetings_per_day integer, max_meetings_per_week integer, bookings_paused boolean, add_client_as_attendee boolean, headshot_url text, bio_short text, languages text[], years_advising integer, intro_card_url text, intro_voice_url jsonb, intro_video_url jsonb, intro_media_pref text, positioning_answers jsonb, verified_credentials jsonb, licence_categories text[], onboarding_progress jsonb, broker_id uuid GENERATED ALWAYS AS (id) STORED, adviser_name text GENERATED ALWAYS AS (contact_person) STORED, practice_name text GENERATED ALWAYS AS (firm_name) STORED, adviser_whatsapp text GENERATED ALWAYS AS (whatsapp_number) STORED, active boolean GENERATED ALWAYS AS (status = 'active') STORED, whatsapp_confirmed_at timestamptz, approved_live_by uuid, approved_live_at timestamptz, fsp_check jsonb, fsp_verified_at timestamptz, first_login_at timestamptz, last_seen_at timestamptz, onboarding_last_progress_at timestamptz, onboarding_completed_at timestamptz, onboarding_nudges jsonb, preflight_run_id text, preflight_card jsonb);
CREATE FUNCTION public.smc_current_broker_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT b.id FROM public.brokers b WHERE b.user_id=auth.uid() LIMIT 1 $$;
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON public.brokers TO authenticated;
GRANT SELECT,UPDATE ON public.brokers TO service_role,n8n_app;
CREATE POLICY "Brokers can view their own profile" ON public.brokers FOR SELECT TO authenticated USING(auth.uid()=user_id OR public.smc_is_admin());
CREATE POLICY "Brokers can update their own profile" ON public.brokers FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Admins can manage all brokers" ON public.brokers FOR ALL TO authenticated USING(public.smc_is_admin());
CREATE POLICY "smc n8n_app brand rows" ON public.brokers FOR ALL TO n8n_app USING(brand_id IS NOT NULL) WITH CHECK(brand_id IS NOT NULL);
