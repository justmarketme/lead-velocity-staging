-- Ads featuring the broker: (1) a standing, timestamped consent that Lead Velocity MAY feature him in SortMyCover ads, and
-- (2) approval of EACH ad that uses his face or name before it runs. E.g. Mark Weston, Oracle Brokers.
-- POPIA: consent is specific, informed, recorded with a timestamp and the exact wording, withdrawable at any time; every
-- grant, withdrawal, ad approval and ad decline is a permanent row in public.broker_compliance_checks (append-only).
--
-- 1. Consent. No new columns. Current state in brokers.onboarding_progress -> 'ad_consent':
--      {status: 'granted'|'withdrawn', at, wording_version: 'ADS-LIKENESS-v2', granted_at?, withdrawn_at?}
--    onboarding_progress is in smc_brokers_guard's locked list (a broker cannot forge it with a direct UPDATE); changes go
--    through broker_set_ad_likeness_consent(boolean) (SECURITY DEFINER, own row only). Repeating the current state changes
--    and logs nothing; every real change logs one row (check_type 'consent', result 'pass' granted / 'info' withdrawn).
--    Withdrawing also takes every approved ad of his off the approved list (logged in the same row).
--    Optional step: not in STEPS / go-live rules.
--
-- 2. Per-ad approval reuses public.broker_media with a new kind 'ad'. Lead Velocity inserts the ad (admin / n8n_app);
--    it shows in the portal as "waiting for your approval" (state 'ready'); the broker decides through
--    broker_decide_ad(media_id, approve, note):
--      approve -> approved_at/approved_by set, is_current = true            (state 'approved')
--      decline -> approved_at cleared, is_current = false, ai_check.state = 'rejected', ai_check.broker_decision = 'declined'
--                 (state 'rejected'); an approved ad can be declined later too, which pulls it.
--    Approval needs a current 'granted' consent. Logged: check_type 'consent', event 'ad_approved' / 'ad_declined'.
--    ANY AD PIPELINE MUST ONLY RUN a broker ad whose broker_media.state = 'approved' AND whose broker's
--    onboarding_progress->'ad_consent'->>'status' = 'granted'.
--
--    CONSTRAINT CHANGES on broker_media (live on 13 Oct 2026: one row, Mark's card; no data is touched):
--      a. broker_media_kind_check: adds 'ad' (was voice | video | card | headshot).
--      b. broker_media_one_current_x: excludes kind 'ad' (several approved ads may run at once; "one current" stays for
--         voice / video / card / headshot).
--      c. policy "smc broker add own": a broker may not insert kind 'ad' himself (only Lead Velocity prepares ads, so a
--         broker cannot create and approve an "ad" of his own).
--
-- Portal: src/lib/adConsent.ts, src/components/broker/smc/AdConsentCard.tsx, src/components/broker/smc/AdApprovals.tsx.
-- Additive and re-runnable. Undo: supabase/migrations/undo/20261013190000_broker_ad_consent_and_approval.undo.sql
--
-- ------------------------------------------------------------------------------------------------------------------
-- Admin snippet (NOT executed by this migration): send an ad to Mark for approval. Upload the creative to the private
-- broker-media bucket under <broker_id>/ads/... first (or use an https URL). script_text = the ad copy he approves.
--
--   INSERT INTO public.broker_media (broker_id, kind, language, version, url, thumbnail_url, script_text)
--   SELECT '306062a1-c271-4ae1-8b1e-bb9aed10a5f6', 'ad', 'en',
--          coalesce(max(version), 0) + 1,
--          'broker-media/306062a1-c271-4ae1-8b1e-bb9aed10a5f6/ads/funeral-cover-v1.jpg', NULL,
--          'Headline / primary text / CTA exactly as it will run'
--     FROM public.broker_media WHERE broker_id = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6' AND kind = 'ad' AND language = 'en';
--
-- Check:
--   SELECT onboarding_progress->'ad_consent' FROM public.brokers WHERE id = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6';
--   SELECT id, version, state, approved_at, url FROM public.broker_media WHERE broker_id = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6' AND kind = 'ad';
--   SELECT checked_at, result, summary, details->>'event' FROM public.broker_compliance_checks
--    WHERE broker_id = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6' AND check_type = 'consent' ORDER BY checked_at;
-- ------------------------------------------------------------------------------------------------------------------
BEGIN;

-- ------------------------------------------------------------------------------------------------------------------
-- 0. broker_media: allow kind 'ad' (constraint changes a, b, c above)
-- ------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.broker_media DROP CONSTRAINT IF EXISTS broker_media_kind_check;
ALTER TABLE public.broker_media ADD CONSTRAINT broker_media_kind_check
  CHECK (kind = ANY (ARRAY['voice'::text, 'video'::text, 'card'::text, 'headshot'::text, 'ad'::text]));

ALTER TABLE public.broker_media DROP CONSTRAINT IF EXISTS broker_media_one_current_x;
ALTER TABLE public.broker_media ADD CONSTRAINT broker_media_one_current_x
  EXCLUDE USING btree (broker_id WITH =, kind WITH =, language WITH =) WHERE (is_current AND kind <> 'ad')
  DEFERRABLE INITIALLY DEFERRED;

DROP POLICY IF EXISTS "smc broker add own" ON public.broker_media;
CREATE POLICY "smc broker add own" ON public.broker_media FOR INSERT TO authenticated
  WITH CHECK (broker_id = public.smc_current_broker_id() AND approved_at IS NULL AND is_current = false AND kind <> 'ad');

COMMENT ON COLUMN public.broker_media.kind IS
  'voice | video | card | headshot | ad. ad = a SortMyCover advert featuring the broker, prepared by Lead Velocity; runs only when state = approved (broker_decide_ad) and onboarding_progress.ad_consent.status = granted.';

-- ------------------------------------------------------------------------------------------------------------------
-- 1. Standing consent
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_set_ad_likeness_consent(p_consent boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Keep in step with src/lib/adConsent.ts (AD_CONSENT_VERSION / AD_CONSENT_BODY / AD_CONSENT_CHECKBOX).
  c_version  constant text := 'ADS-LIKENESS-v2';
  c_body     constant text := 'We may feature you in some of the SortMyCover ads that send clients to you, using your name, photo, practice name and FSP number. We won''t run any ad with your face or name until you''ve approved that specific ad here in your portal. You can withdraw this consent at any time.';
  c_checkbox constant text := 'I agree that Lead Velocity may use my name, photo, practice name and FSP number in SortMyCover adverts that refer clients to me, subject to my approval of each such advert in the portal.';
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
            THEN 'Broker consented that Lead Velocity may use their name, photo, practice name and FSP number in SortMyCover ads that refer clients to them, subject to their approval of each ad in the portal.'
            ELSE 'Broker withdrew consent for Lead Velocity to use their name, photo, practice name and FSP number in SortMyCover ads.' END,
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

COMMENT ON FUNCTION public.broker_set_ad_likeness_consent(boolean) IS
  'Broker portal: give (true) or withdraw (false) consent that Lead Velocity may feature the broker (name, photo, practice name, FSP number) in SortMyCover ads, each ad subject to approval (ADS-LIKENESS-v2). Own row only; state in onboarding_progress.ad_consent; every change logged to broker_compliance_checks (consent); withdrawal pulls approved ads.';

REVOKE ALL ON FUNCTION public.broker_set_ad_likeness_consent(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_set_ad_likeness_consent(boolean) TO authenticated;

-- ------------------------------------------------------------------------------------------------------------------
-- 2. Approve or decline one ad
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_decide_ad(p_media_id uuid, p_approve boolean, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_now     timestamptz := now();
  v_note    text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_prev    text;
  b         public.brokers%ROWTYPE;
  m         public.broker_media%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'p_approve is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM public.broker_media WHERE id = p_media_id FOR UPDATE;
  IF NOT FOUND OR m.kind <> 'ad' THEN
    RAISE EXCEPTION 'That ad was not found.' USING ERRCODE = 'P0002';
  END IF;
  -- Own ad only (auth.uid() = brokers.user_id).
  SELECT * INTO b FROM public.brokers WHERE id = m.broker_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ad was not found.' USING ERRCODE = 'P0002';
  END IF;
  v_prev := m.state;

  IF p_approve THEN
    IF m.approved_at IS NOT NULL AND m.is_current THEN   -- already approved: nothing changes, nothing is logged
      RETURN jsonb_build_object('media_id', m.id, 'state', m.state, 'approved_at', m.approved_at, 'changed', false);
    END IF;
    IF coalesce(b.onboarding_progress -> 'ad_consent' ->> 'status', '') <> 'granted' THEN
      RAISE EXCEPTION 'Please give your consent to be featured in ads first.' USING ERRCODE = '22023';
    END IF;
    IF btrim(coalesce(m.url, '')) = '' OR m.state = 'processing' THEN
      RAISE EXCEPTION 'This ad is not ready to approve yet.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.broker_media
       SET approved_at = v_now, approved_by = v_uid, is_current = true, updated_at = v_now,
           ai_check = coalesce(ai_check, '{}'::jsonb) || jsonb_build_object('broker_decision', 'approved', 'decided_at', v_now, 'note', v_note)
     WHERE id = m.id
    RETURNING * INTO m;
  ELSE
    IF m.approved_at IS NULL AND m.ai_check ->> 'broker_decision' = 'declined' THEN   -- already declined
      RETURN jsonb_build_object('media_id', m.id, 'state', m.state, 'approved_at', NULL, 'changed', false);
    END IF;
    UPDATE public.broker_media
       SET approved_at = NULL, approved_by = NULL, is_current = false, updated_at = v_now,
           ai_check = coalesce(ai_check, '{}'::jsonb) || jsonb_build_object('state', 'rejected', 'broker_decision', 'declined', 'decided_at', v_now, 'note', v_note)
     WHERE id = m.id
    RETURNING * INTO m;
  END IF;

  INSERT INTO public.broker_compliance_checks (broker_id, check_type, result, summary, details, source, checked_by, checked_at)
  VALUES (b.id, 'consent', CASE WHEN p_approve THEN 'pass' ELSE 'info' END,
          CASE WHEN p_approve
            THEN format('Broker approved SortMyCover ad %s (version %s) featuring their name and photo, to run as shown.', left(m.id::text, 8), m.version)
            ELSE format('Broker declined SortMyCover ad %s (version %s)%s; it must not run.', left(m.id::text, 8), m.version,
                        CASE WHEN v_prev = 'approved' THEN ', previously approved' ELSE '' END) END,
          jsonb_build_object(
            'event', CASE WHEN p_approve THEN 'ad_approved' ELSE 'ad_declined' END,
            'media_id', m.id, 'url', m.url, 'thumbnail_url', m.thumbnail_url, 'version', m.version, 'language', m.language,
            'script_text', m.script_text, 'previous_state', v_prev, 'note', v_note,
            'consent_wording_version', b.onboarding_progress -> 'ad_consent' ->> 'wording_version',
            'auth_user_id', v_uid),
          'Broker portal', 'Broker (portal)', v_now);

  IF to_regclass('public.broker_activities') IS NOT NULL THEN
    INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body)
    VALUES (b.id, 'onboarding', 'n/a', format('Broker %s a SortMyCover ad featuring them (version %s)',
      CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, m.version));
  END IF;

  RETURN jsonb_build_object('media_id', m.id, 'state', m.state, 'approved_at', m.approved_at, 'changed', true);
END $function$;

COMMENT ON FUNCTION public.broker_decide_ad(uuid, boolean, text) IS
  'Broker portal: approve (true) or decline (false) one SortMyCover ad featuring the broker (broker_media kind ad). Own ad only; approval needs a granted ad_consent; idempotent; every decision logged to broker_compliance_checks (consent, ad_approved / ad_declined).';

REVOKE ALL ON FUNCTION public.broker_decide_ad(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_decide_ad(uuid, boolean, text) TO authenticated;

COMMIT;
