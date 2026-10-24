-- Ad-likeness consent v3, follow-up (smoke test 21 Oct 2026 #30). 20261018200000 moved the wording constants to v3
-- (name and photo only) but left the two audit summaries in broker_compliance_checks describing the v2 scope ("name,
-- photo, practice name and FSP number"), so the next grant or withdrawal would store a wrong compliance summary.
-- Only those two summary strings change; the function is otherwise identical to 20261018200000, whose body was checked
-- live on 21 Oct 2026 (has the v3 constants and the v2 summaries). Existing audit rows are history and are not rewritten.
-- Keep in step with src/lib/adConsent.ts (src/lib/adConsent.test.mjs compares both migrations).
-- NEEDS JONO'S GO. Apply by hand with the CRM release (no db push), then record BOTH files:
--   npx supabase migration repair --status applied --linked --project-ref cmsylaupctrbsvzrgzwy 20261018200000 20261021150000

CREATE OR REPLACE FUNCTION public.broker_set_ad_likeness_consent(p_consent boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Keep in step with src/lib/adConsent.ts (AD_CONSENT_VERSION / AD_CONSENT_BODY / AD_CONSENT_CHECKBOX).
  c_version  constant text := 'ADS-LIKENESS-v3';
  c_body     constant text := 'We may feature you in some of the SortMyCover ads that send clients to you, using your name and photo only. Your practice name and FSP number never appear on an ad; clients see them in the WhatsApp chat. We won''t run any ad with your face or name until you''ve approved that specific ad here in your portal. You can withdraw this consent at any time.';
  c_checkbox constant text := 'I agree that Lead Velocity may use my name and photo in SortMyCover adverts that refer clients to me, subject to my approval of each such advert in the portal.';
  v_uid     uuid := auth.uid();
  v_n       int;
  v_now     timestamptz := now();
  v_status  text;
  v_prev    jsonb;
  v_state   jsonb;
  v_pulled  jsonb := '[]'::jsonb;
  b         public.brokers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  IF p_consent IS NULL THEN
    RAISE EXCEPTION 'p_consent is required' USING ERRCODE = '22023';
  END IF;

  -- Own row only (auth.uid() = brokers.user_id).
  SELECT count(*) INTO v_n FROM public.brokers WHERE user_id = v_uid;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No broker profile is linked to this login.' USING ERRCODE = 'P0002';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'More than one broker profile is linked to this login; ask Lead Velocity.' USING ERRCODE = '21000';
  END IF;
  SELECT * INTO b FROM public.brokers WHERE user_id = v_uid FOR UPDATE;

  v_prev   := CASE WHEN jsonb_typeof(b.onboarding_progress -> 'ad_consent') = 'object' THEN b.onboarding_progress -> 'ad_consent' ELSE '{}'::jsonb END;
  v_status := CASE WHEN p_consent THEN 'granted' ELSE 'withdrawn' END;

  -- Same state again (double tap, or withdrawing a consent never given): nothing changes, nothing is logged.
  IF coalesce(v_prev ->> 'status', 'withdrawn') = v_status THEN
    RETURN jsonb_build_object('onboarding_progress', b.onboarding_progress, 'ad_consent', nullif(v_prev, '{}'::jsonb), 'changed', false);
  END IF;

  v_state := v_prev || jsonb_build_object('status', v_status, 'at', v_now, 'wording_version', c_version)
                    || CASE WHEN p_consent THEN jsonb_build_object('granted_at', v_now) ELSE jsonb_build_object('withdrawn_at', v_now) END;

  UPDATE public.brokers
     SET onboarding_progress = jsonb_set(coalesce(onboarding_progress, '{}'::jsonb), '{ad_consent}', v_state)
   WHERE id = b.id
  RETURNING * INTO b;

  -- Withdrawal pulls every ad of his that was approved (they must not run any more).
  IF NOT p_consent THEN
    WITH pulled AS (
      UPDATE public.broker_media
         SET approved_at = NULL, approved_by = NULL, is_current = false, updated_at = v_now,
             ai_check = coalesce(ai_check, '{}'::jsonb) || jsonb_build_object('state', 'rejected', 'broker_decision', 'consent_withdrawn', 'decided_at', v_now)
       WHERE broker_id = b.id AND kind = 'ad' AND approved_at IS NOT NULL
      RETURNING id)
    SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_pulled FROM pulled;
  END IF;

  INSERT INTO public.broker_compliance_checks (broker_id, check_type, result, summary, details, source, checked_by, checked_at)
  VALUES (b.id, 'consent', CASE WHEN p_consent THEN 'pass' ELSE 'info' END,
          CASE WHEN p_consent
            THEN 'Broker consented that Lead Velocity may use their name and photo only in SortMyCover ads that refer clients to them, subject to their approval of each ad in the portal. Practice name and FSP number never appear on an ad.'
            ELSE 'Broker withdrew consent for Lead Velocity to use their name and photo in SortMyCover ads.' END,
          jsonb_build_object(
            'event', 'ad_likeness_consent', 'consent', p_consent, 'wording_version', c_version,
            'wording_text', c_checkbox, 'wording_context', c_body,
            'contact_person', b.contact_person, 'firm_name', b.firm_name, 'fsp_number', b.fsp_number,
            'auth_user_id', v_uid, 'previous_status', v_prev ->> 'status', 'ads_pulled', v_pulled,
            'ip', NULL, 'user_agent', NULL,
            'ip_user_agent_note', 'Not available: recorded through a database function called from the portal; the signed-in user id is stored instead.'),
          'Broker portal', 'Broker (portal)', v_now);

  IF to_regclass('public.broker_activities') IS NOT NULL THEN
    INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body)
    VALUES (b.id, 'onboarding', 'n/a', CASE WHEN p_consent
      THEN 'Broker gave consent to be featured in SortMyCover ads, each ad subject to their approval (' || c_version || ')'
      ELSE 'Broker withdrew consent to be featured in SortMyCover ads' END);
  END IF;

  RETURN jsonb_build_object('onboarding_progress', b.onboarding_progress, 'ad_consent', v_state, 'changed', true);
END $function$;
