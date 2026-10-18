-- Bio review + intro card approval. Lead Velocity suggests a compliant bio, the broker approves it (or rewrites his own) in the portal.
-- No new columns. The review lives in the existing jsonb brokers.onboarding_progress under the key 'bio_review':
--   {status: 'changes_suggested'|'accepted'|'declined', original, suggested, reason, suggested_at, decided_at}
-- onboarding_progress is already in smc_brokers_guard's locked list, so a broker cannot forge or clear a review himself;
-- W20 only ever jsonb_set()s its own step keys, so it never overwrites 'bio_review'. The broker's decision goes through
-- the SECURITY DEFINER function below (it runs as the owner, so the guard lets its single bio_short write through).
-- Portal: src/lib/brokerReview.ts + src/components/broker/smc/LvReview.tsx. Additive and re-runnable.
-- Undo: supabase/migrations/undo/20261013160000_broker_bio_review_card_approval.undo.sql
--
-- ------------------------------------------------------------------------------------------------------------------
-- Admin snippet (NOT executed by this migration). Run in the SQL editor / service role to suggest a bio, e.g. Mark Weston
-- (Oracle Brokers), whose own bio promises "saving money" (agreement 3.8: no benefit statements). 'original' is copied
-- from his live bio so the portal can show it with the "Not approved" chip; re-running replaces the open suggestion.
--
--   UPDATE public.brokers
--      SET onboarding_progress = jsonb_set(coalesce(onboarding_progress, '{}'::jsonb), '{bio_review}', jsonb_build_object(
--            'status',       'changes_suggested',
--            'original',     bio_short,
--            'suggested',    'With 26 years'' experience, I help families protect the people they love and plan for retirement, before and at retirement.',
--            'reason',       'We can''t include promises such as ''saving money'' in anything we send to clients.',
--            'suggested_at', now(),
--            'decided_at',   NULL))
--    WHERE id = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6';
--
-- Check:  SELECT bio_short, onboarding_progress->'bio_review' FROM public.brokers WHERE id = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6';
-- ------------------------------------------------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION public.broker_decide_bio_suggestion(p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_n      int;
  b        public.brokers%ROWTYPE;
  v_review jsonb;
  v_status text;
  v_sugg   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'p_accept is required' USING ERRCODE = '22023';
  END IF;

  -- Only the broker who owns the row (auth.uid() = brokers.user_id), and only a row Lead Velocity put a review on.
  SELECT count(*) INTO v_n FROM public.brokers
   WHERE user_id = v_uid AND jsonb_typeof(onboarding_progress -> 'bio_review') = 'object';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'There is no bio suggestion waiting for you.' USING ERRCODE = 'P0002';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'More than one broker profile is linked to this login; ask Lead Velocity.' USING ERRCODE = '21000';
  END IF;
  SELECT * INTO b FROM public.brokers
   WHERE user_id = v_uid AND jsonb_typeof(onboarding_progress -> 'bio_review') = 'object'
   FOR UPDATE;

  v_review := b.onboarding_progress -> 'bio_review';
  v_status := v_review ->> 'status';
  v_sugg   := btrim(coalesce(v_review ->> 'suggested', ''));

  -- Re-runs are safe: an accepted review is final (he can still edit his bio himself), a repeated decline changes nothing.
  IF v_status = 'accepted' OR (v_status = 'declined' AND NOT p_accept) THEN
    RETURN jsonb_build_object('bio_short', b.bio_short, 'onboarding_progress', b.onboarding_progress);
  END IF;
  IF v_status NOT IN ('changes_suggested', 'declined') THEN
    RAISE EXCEPTION 'There is no bio suggestion waiting for you.' USING ERRCODE = 'P0002';
  END IF;

  IF p_accept THEN
    -- same bounds the portal enforces on a bio he types (40 to 220 characters)
    IF char_length(v_sugg) < 40 OR char_length(v_sugg) > 220 THEN
      RAISE EXCEPTION 'The suggested bio is not ready yet; ask Lead Velocity.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.brokers
       SET bio_short = v_sugg,
           onboarding_progress = jsonb_set(onboarding_progress, '{bio_review}',
             v_review || jsonb_build_object('status', 'accepted', 'decided_at', now()))
     WHERE id = b.id
    RETURNING * INTO b;
  ELSE
    -- bio_short stays as it is; the portal keeps the intro card waiting until he saves a different bio.
    UPDATE public.brokers
       SET onboarding_progress = jsonb_set(onboarding_progress, '{bio_review}',
             v_review || jsonb_build_object('status', 'declined', 'decided_at', now()))
     WHERE id = b.id
    RETURNING * INTO b;
  END IF;

  INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body)
  VALUES (b.id, 'onboarding', 'n/a',
          CASE WHEN p_accept THEN 'Broker approved the bio suggested by Lead Velocity'
               ELSE 'Broker chose to rewrite his bio himself (suggestion declined)' END);

  RETURN jsonb_build_object('bio_short', b.bio_short, 'onboarding_progress', b.onboarding_progress);
END $function$;

COMMENT ON FUNCTION public.broker_decide_bio_suggestion(boolean) IS
  'Broker portal: accept (bio_short := suggested) or decline the bio Lead Velocity suggested in onboarding_progress.bio_review. Own row only; idempotent.';

REVOKE ALL ON FUNCTION public.broker_decide_bio_suggestion(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_decide_bio_suggestion(boolean) TO authenticated;

-- ------------------------------------------------------------------------------------------------------------------
-- 2. Intro card approval. Lead Velocity prepares the card (a broker_media row: kind 'card', state 'ready', url set);
--    the broker's only action is "Approve my intro card". One SECURITY DEFINER call does everything the approval means:
--    broker_media approved_at / approved_by / is_current (state is GENERATED, never written), brokers.intro_card_url, onboarding_progress.card and an
--    audit row in broker_compliance_checks (admin-only insert by RLS; this function runs as the owner).
--    onboarding_progress.card uses status 'done' (not 'approved') because W20's readiness query and the portal step list
--    (src/lib/smc.ts DONEISH) treat 'done' as complete; approved_at / by / media_id carry the approval itself.
--    Refused while a Lead Velocity bio review is open or declined: the card may only be approved once the bio is accepted.
--
-- Admin snippet (NOT executed): register Mark's prepared card once the PNG is stored (url = the https link W06 sends):
--   INSERT INTO public.broker_media (broker_id, brand_id, kind, language, version, url, is_current, compliance_checked_by)
--   SELECT id, brand_id, 'card', 'en', coalesce((SELECT max(version) FROM public.broker_media WHERE broker_id = b.id AND kind = 'card'), 0) + 1,
--          '<https url of mark-weston-intro-card.png>', false, 'Lead Velocity'   -- state is generated ('ready' once url is set)
--     FROM public.brokers b WHERE id = '306062a1-c271-4ae1-8b1e-bb9aed10a5f6';
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_approve_intro_card(p_media_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  b        public.brokers%ROWTYPE;
  m        public.broker_media%ROWTYPE;
  v_review jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.broker_media WHERE id = p_media_id FOR UPDATE;
  IF NOT FOUND OR m.kind <> 'card' THEN
    RAISE EXCEPTION 'That intro card was not found.' USING ERRCODE = 'P0002';
  END IF;
  -- Only the broker who owns the card (auth.uid() = brokers.user_id).
  SELECT * INTO b FROM public.brokers WHERE id = m.broker_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That intro card was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Re-runs are safe: approving the card that is already approved and current changes nothing.
  IF m.approved_at IS NOT NULL AND m.is_current AND b.intro_card_url IS NOT DISTINCT FROM m.url THEN
    RETURN jsonb_build_object('intro_card_url', b.intro_card_url, 'onboarding_progress', b.onboarding_progress,
                              'media_id', m.id, 'approved_at', m.approved_at);
  END IF;
  IF coalesce(m.state, '') IN ('processing', 'rejected', 'superseded') OR btrim(coalesce(m.url, '')) = '' THEN
    RAISE EXCEPTION 'This card is not ready to approve yet.' USING ERRCODE = '22023';
  END IF;
  v_review := b.onboarding_progress -> 'bio_review';
  IF jsonb_typeof(v_review) = 'object' AND coalesce(v_review ->> 'status', '') <> 'accepted' THEN
    RAISE EXCEPTION 'Please approve your bio first.' USING ERRCODE = '22023';
  END IF;

  -- state is a generated column (derived from approved_at / is_current / ai_check / url): never written directly.
  -- (Live fix 13 Oct 2026: fix_broker_approve_intro_card_generated_state.) A previously approved card that stops being
  -- current reads 'superseded' by itself.
  UPDATE public.broker_media SET is_current = false
   WHERE broker_id = m.broker_id AND kind = 'card' AND language = m.language AND id <> m.id AND is_current;
  UPDATE public.broker_media
     SET approved_at = now(), approved_by = v_uid, is_current = true
   WHERE id = m.id
  RETURNING * INTO m;

  UPDATE public.brokers
     SET intro_card_url = m.url,
         onboarding_progress = jsonb_set(coalesce(onboarding_progress, '{}'::jsonb), '{card}', jsonb_build_object(
           'status', 'done', 'done_at', now(), 'approved_at', m.approved_at, 'by', 'broker', 'media_id', m.id, 'version', m.version)),
         onboarding_last_progress_at = now()
   WHERE id = b.id
  RETURNING * INTO b;

  INSERT INTO public.broker_compliance_checks (broker_id, check_type, result, summary, details, source, checked_by, checked_at)
  VALUES (b.id, 'other', 'pass',
          format('Broker approved his intro card (version %s) and the client disclosure wording in the portal.', m.version),
          jsonb_build_object('event', 'intro_card_approved', 'media_id', m.id, 'version', m.version, 'url', m.url,
                             'bio_short', b.bio_short, 'firm_name', b.firm_name, 'fsp_number', b.fsp_number),
          'Broker portal (broker_approve_intro_card)', 'Broker (portal approval)', m.approved_at);

  RETURN jsonb_build_object('intro_card_url', b.intro_card_url, 'onboarding_progress', b.onboarding_progress,
                            'media_id', m.id, 'approved_at', m.approved_at);
END $function$;

COMMENT ON FUNCTION public.broker_approve_intro_card(uuid) IS
  'Broker portal: approve the intro card Lead Velocity prepared (broker_media kind card). Own card only; needs an accepted bio review if one exists; idempotent; logs to broker_compliance_checks.';

REVOKE ALL ON FUNCTION public.broker_approve_intro_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_approve_intro_card(uuid) TO authenticated;

-- ------------------------------------------------------------------------------------------------------------------
-- 3. FIX: broker_compliance_checks "bcc_broker_read_own" (created live, 13 Oct) compares b.id = b.broker_id, because
--    brokers ALSO has a broker_id column (= its own id on every row) and the unqualified name bound to it. Live effect:
--    every signed-in broker can read EVERY broker's compliance checks. Re-created with the table-qualified column.
-- ------------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.broker_compliance_checks') IS NOT NULL THEN
    DROP POLICY IF EXISTS bcc_broker_read_own ON public.broker_compliance_checks;
    CREATE POLICY bcc_broker_read_own ON public.broker_compliance_checks FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.brokers b
                      WHERE b.id = broker_compliance_checks.broker_id AND b.user_id = auth.uid()));
  END IF;
END $$;

COMMIT;
