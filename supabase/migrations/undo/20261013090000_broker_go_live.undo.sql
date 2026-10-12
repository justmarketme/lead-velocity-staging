-- UNDO of 20261013090000_broker_go_live.sql. Run in one transaction.
-- Dropping the columns loses go-live stamps (who/when), FSCA check results and W20 onboarding clocks. Brokers already live
-- stay live (status / routing_on are not touched). The guard goes back to its 20261011 definition.
BEGIN;
DROP FUNCTION IF EXISTS public.admin_broker_go_live(uuid);
DROP FUNCTION IF EXISTS public.admin_broker_pause(uuid, text);
DROP FUNCTION IF EXISTS public.admin_broker_go_live_check(uuid);
DROP FUNCTION IF EXISTS public.admin_attach_payment_and_mark_paid(uuid, uuid);
DROP FUNCTION IF EXISTS public.smc_set_calendar_mailbox(uuid, text);

CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'smc: no session' USING ERRCODE = '42501';
  END IF;
  IF public.smc_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.brand_id               IS DISTINCT FROM OLD.brand_id
  OR NEW.routing_on             IS DISTINCT FROM OLD.routing_on
  OR NEW.accepts_low_budget     IS DISTINCT FROM OLD.accepts_low_budget
  OR NEW.handles_wills          IS DISTINCT FROM OLD.handles_wills
  OR NEW.consent_mode           IS DISTINCT FROM OLD.consent_mode
  OR NEW.licence_categories     IS DISTINCT FROM OLD.licence_categories
  OR NEW.verified_credentials   IS DISTINCT FROM OLD.verified_credentials
  OR NEW.calendar_provider      IS DISTINCT FROM OLD.calendar_provider
  OR NEW.ms_tenant_id           IS DISTINCT FROM OLD.ms_tenant_id
  OR NEW.calendar_token_ref     IS DISTINCT FROM OLD.calendar_token_ref
  OR NEW.calendar_mode          IS DISTINCT FROM OLD.calendar_mode
  OR NEW.calendar_status        IS DISTINCT FROM OLD.calendar_status
  OR NEW.calendar_connected_at  IS DISTINCT FROM OLD.calendar_connected_at
  OR NEW.calendar_scopes        IS DISTINCT FROM OLD.calendar_scopes
  OR NEW.calendar_status_at     IS DISTINCT FROM OLD.calendar_status_at
  OR NEW.calendar_status_detail IS DISTINCT FROM OLD.calendar_status_detail
  OR NEW.next_free_slot_at      IS DISTINCT FROM OLD.next_free_slot_at
  OR NEW.intro_card_url         IS DISTINCT FROM OLD.intro_card_url
  OR NEW.intro_voice_url        IS DISTINCT FROM OLD.intro_voice_url
  OR NEW.intro_video_url        IS DISTINCT FROM OLD.intro_video_url
  OR NEW.onboarding_progress    IS DISTINCT FROM OLD.onboarding_progress THEN
    RAISE EXCEPTION 'smc: brokers cannot change routing (incl. the low-budget switch), consent, licence, verification, calendar connection or approved media fields'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.brand_id IS NULL THEN
    IF NEW.fsp_number IS DISTINCT FROM OLD.fsp_number THEN
      RAISE EXCEPTION 'smc: the FSP number is set during SortMyCover onboarding' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'smc: brokers cannot change their SortMyCover status' USING ERRCODE = '42501';
  END IF;
  IF OLD.routing_on AND (
       NEW.firm_name       IS DISTINCT FROM OLD.firm_name
    OR NEW.fsp_number      IS DISTINCT FROM OLD.fsp_number
    OR NEW.contact_person  IS DISTINCT FROM OLD.contact_person
    OR NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number) THEN
    RAISE EXCEPTION 'smc: practice name, FSP number, adviser and WhatsApp number are locked while you receive leads; ask Lead Velocity to change them'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

ALTER TABLE public.brokers DROP CONSTRAINT IF EXISTS brokers_go_live_shapes;
ALTER TABLE public.brokers
  DROP COLUMN IF EXISTS approved_live_by,
  DROP COLUMN IF EXISTS approved_live_at,
  DROP COLUMN IF EXISTS fsp_check,
  DROP COLUMN IF EXISTS fsp_verified_at,
  DROP COLUMN IF EXISTS first_login_at,
  DROP COLUMN IF EXISTS last_seen_at,
  DROP COLUMN IF EXISTS onboarding_last_progress_at,
  DROP COLUMN IF EXISTS onboarding_completed_at,
  DROP COLUMN IF EXISTS onboarding_nudges,
  DROP COLUMN IF EXISTS preflight_run_id,
  DROP COLUMN IF EXISTS preflight_card;
COMMIT;
