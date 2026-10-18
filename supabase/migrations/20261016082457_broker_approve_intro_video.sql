-- Approve a prepared intro video directly from the broker portal. This also supports
-- videos received on WhatsApp and uploaded by operations, which have no W23 take_id.
-- The signed-in broker must own the media; neither broker_id nor approved_by is accepted from the browser.
CREATE OR REPLACE FUNCTION public.broker_approve_intro_video(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_delivery_ready boolean;
  b public.brokers%ROWTYPE;
  m public.broker_media%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO m FROM public.broker_media WHERE id = p_media_id FOR UPDATE;
  IF NOT FOUND OR m.kind <> 'video' THEN
    RAISE EXCEPTION 'That intro video was not found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO b FROM public.brokers WHERE id = m.broker_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That intro video was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF m.approved_at IS NOT NULL AND m.is_current THEN
    RETURN jsonb_build_object('media_id', m.id, 'approved_at', m.approved_at, 'changed', false);
  END IF;
  IF m.state <> 'ready' OR btrim(coalesce(m.url, '')) = '' THEN
    RAISE EXCEPTION 'This video is not ready to approve yet.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.broker_media newer
    WHERE newer.broker_id = m.broker_id AND newer.kind = 'video'
      AND newer.language = m.language AND newer.version > m.version
      AND newer.state IN ('ready', 'approved')
  ) THEN
    RAISE EXCEPTION 'A newer video is available. Please review that one.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.broker_media SET is_current = false, updated_at = v_now
    WHERE broker_id = m.broker_id AND kind = 'video' AND language = m.language
      AND id <> m.id AND is_current;
  UPDATE public.broker_media
    SET approved_at = v_now, approved_by = v_uid, is_current = true, updated_at = v_now
    WHERE id = m.id RETURNING * INTO m;

  -- A private storage object key is playable by the broker through a short-lived
  -- signed URL, but must never be put into W09's client-facing media field.
  v_delivery_ready := m.url ~* '^https://';

  UPDATE public.brokers
    SET intro_video_url = CASE WHEN v_delivery_ready
          THEN coalesce(intro_video_url, '{}'::jsonb) || jsonb_build_object(m.language, m.url)
          ELSE coalesce(intro_video_url, '{}'::jsonb) - m.language END,
        onboarding_progress = coalesce(onboarding_progress, '{}'::jsonb) || jsonb_build_object('intro_media', 'done'),
        onboarding_last_progress_at = v_now
    WHERE id = b.id;

  INSERT INTO public.broker_compliance_checks
    (broker_id, check_type, result, summary, details, source, checked_by, checked_at)
  VALUES
    (b.id, 'consent', 'pass',
     format('Broker approved intro video version %s for client introduction.', m.version),
     jsonb_build_object('event', 'intro_video_approved', 'media_id', m.id,
       'version', m.version, 'language', m.language, 'url', m.url,
       'client_delivery_ready', v_delivery_ready, 'auth_user_id', v_uid),
     'Broker portal', 'Broker (portal)', v_now);

  RETURN jsonb_build_object('media_id', m.id, 'approved_at', m.approved_at,
    'client_delivery_ready', v_delivery_ready, 'changed', true);
END
$function$;

COMMENT ON FUNCTION public.broker_approve_intro_video(uuid) IS
  'Broker portal: approve a ready intro video owned by the signed-in broker, including a WhatsApp-sourced upload without a W23 take ID. Idempotent and audited.';
REVOKE ALL ON FUNCTION public.broker_approve_intro_video(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_approve_intro_video(uuid) TO authenticated;
