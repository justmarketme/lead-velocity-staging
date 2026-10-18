-- Additive guard: no broker rows rewritten; existing SMC and approved-media triggers stay installed.
BEGIN;
CREATE OR REPLACE FUNCTION public.broker_profile_permissions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  generated_columns text[];
  editable text[] := ARRAY[
    'updated_at','firm_name','contact_person','phone_number','firm_address','preferred_language',
    'whatsapp_number','email','fsp_number','headshot_url','bio_short','languages','years_advising',
    'practice_legal_name','signatory_name','signatory_role','fb_page_name','fb_page_id',
    'meeting_hours','methods_supported','max_meetings_per_day','max_meetings_per_week',
    'slot_minutes','buffer_minutes','min_notice_hours','horizon_days','bookings_paused',
    'close_rate','avg_commission_zar','intro_media_pref'
  ];
BEGIN
  -- Preserve authenticated admins and trusted service/definer/workflow paths.
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE='42501'; END IF;
  IF public.smc_is_admin() THEN RETURN NEW; END IF;
  IF OLD.user_id IS DISTINCT FROM auth.uid() OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only your own broker profile can be edited' USING ERRCODE='42501';
  END IF;
  -- Compare all columns, including future additions. Only actual profile/availability fields are broker-editable.
  -- Stored generated values are unavailable in BEFORE triggers. PostgreSQL itself rejects direct writes to them.
  SELECT coalesce(array_agg(a.attname::text), ARRAY[]::text[]) INTO generated_columns
    FROM pg_catalog.pg_attribute a WHERE a.attrelid=TG_RELID AND a.attgenerated<>'' AND NOT a.attisdropped;
  IF (to_jsonb(NEW) - editable - generated_columns) IS DISTINCT FROM (to_jsonb(OLD) - editable - generated_columns) THEN
    RAISE EXCEPTION 'Broker management, identity, delivery and verification fields are managed by Lead Velocity' USING ERRCODE='42501';
  END IF;
  -- Apply to legacy rows too: OLD.brand_id being NULL must not bypass the routing lock.
  IF OLD.routing_on IS TRUE AND (
    NEW.firm_name IS DISTINCT FROM OLD.firm_name OR NEW.fsp_number IS DISTINCT FROM OLD.fsp_number
    OR NEW.contact_person IS DISTINCT FROM OLD.contact_person OR NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number
    OR NEW.email IS DISTINCT FROM OLD.email
  ) THEN
    RAISE EXCEPTION 'These details are locked while you receive leads; ask Lead Velocity to change them' USING ERRCODE='42501';
  END IF;
  IF NEW.firm_name IS DISTINCT FROM OLD.firm_name AND
     (NEW.firm_name IS NULL OR length(btrim(NEW.firm_name)) NOT BETWEEN 2 AND 120) THEN
    RAISE EXCEPTION 'Practice name: 2 to 120 characters' USING ERRCODE='22023';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email AND
     (NEW.email IS NULL OR NEW.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
    RAISE EXCEPTION 'Please check your email address' USING ERRCODE='22023';
  END IF;
  -- Existing smc_brokers_guard keeps the legacy FSP rule; broker_approved_items_guard keeps bio/photo approval locks.
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.broker_profile_permissions_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS broker_profile_permissions_guard ON public.brokers;
CREATE TRIGGER broker_profile_permissions_guard BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.broker_profile_permissions_guard();
-- Explicit ownership check for new row values (admins retain their independent ALL policy).
ALTER POLICY "Brokers can update their own profile" ON public.brokers
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
COMMIT;
