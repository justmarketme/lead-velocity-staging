-- Approved items are locked; the broker asks Lead Velocity for a change instead of editing silently.
-- Items: 'bio' (accepted bio review), 'intro_card' (approved card), 'ad' (an approved ad, migration 20261013190000).
--
-- 1. broker_request_change(p_item, p_message): SECURITY DEFINER, own row only. Appends
--      {id, item, message, status: 'open', at} to brokers.onboarding_progress -> 'change_requests' (array),
--    writes the CRM timeline (broker_activities), logs broker_compliance_checks (check_type 'other', result 'info',
--    event 'change_requested') and notifies Lead Velocity through EMMA's POST /api/notify (the existing owner-notification
--    path: Teams bot -> Telegram -> WhatsApp, see EMMA src/notify/deliver.ts), sent with pg_net (already enabled live).
--    The URL and the x-emma-secret come from Supabase Vault: 'emma_notify_url' (optional, default
--    https://emmadoesit.cloud/api/notify) and 'emma_notify_secret' (= EMMA_SHARED_SECRET on the VPS). No secret in Vault
--    = no ping (the request is still stored, logged and shown in the admin drawer). A failed ping never blocks the request.
-- 2. admin_resolve_change_request(p_broker_id, p_request_id, p_unlock, p_note): admins only (smc_is_admin()). Sets the
--    request to 'resolved' and logs it. p_unlock = true lets the broker edit again: 'bio' sets bio_review.unlocked_at
--    and card.unlocked_at (the approved card also locks the bio), 'intro_card' sets card.unlocked_at. Approving a new
--    card (broker_approve_intro_card writes a fresh onboarding_progress.card) locks it again. 'ad': nothing to unlock
--    (Lead Velocity sends a new ad version for approval).
-- 3. Trigger broker_approved_items_guard (BEFORE UPDATE OF bio_short, headshot_url ON brokers): a broker's own UPDATE
--    cannot change a locked bio or headshot (the portal locks the fields too). Admin, service, n8n_app and SECURITY
--    DEFINER paths (e.g. broker_decide_bio_suggestion) are not affected.
--
-- Portal: src/lib/changeRequests.ts, src/components/broker/smc/RequestChange.tsx; admin: BrokerAdminStatus.tsx.
-- Additive and re-runnable. Undo: supabase/migrations/undo/20261013200000_broker_change_requests.undo.sql
--
-- User-gated, once (SQL editor, as postgres), to switch the EMMA ping on:
--   SELECT vault.create_secret('<EMMA_SHARED_SECRET from the VPS .env>', 'emma_notify_secret', 'x-emma-secret for EMMA POST /api/notify');
--   -- optional: SELECT vault.create_secret('https://emmadoesit.cloud/api/notify', 'emma_notify_url', 'EMMA notify endpoint');
BEGIN;

-- ------------------------------------------------------------------------------------------------------------------
-- 0. Internal: ping Lead Velocity through EMMA. Never raises.
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lv_notify_emma(p_title text, p_message text, p_source text DEFAULT 'lv_crm')
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_url    text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'emma_notify_secret' LIMIT 1;
    IF coalesce(v_secret, '') = '' THEN
      RETURN false;
    END IF;
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'emma_notify_url' LIMIT 1;
    PERFORM net.http_post(
      url     := coalesce(nullif(v_url, ''), 'https://emmadoesit.cloud/api/notify'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-emma-secret', v_secret),
      body    := jsonb_build_object('title', left(p_title, 120), 'message', left(p_message, 4000), 'source', left(p_source, 60)));
    RETURN true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lv_notify_emma: %', SQLERRM;
    RETURN false;
  END;
END $function$;

COMMENT ON FUNCTION public.lv_notify_emma(text, text, text) IS
  'Internal: POST to EMMA /api/notify (owner notification) via pg_net with the Vault secret emma_notify_secret. Returns false (never raises) when not configured or on error.';
REVOKE ALL ON FUNCTION public.lv_notify_emma(text, text, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------------
-- 1. Broker: request a change
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_request_change(p_item text, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_now    timestamptz := now();
  v_msg    text := btrim(coalesce(p_message, ''));
  v_n      int;
  v_open   int;
  v_req    jsonb;
  v_label  text;
  v_notified boolean;
  b        public.brokers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  IF p_item IS NULL OR p_item NOT IN ('bio', 'intro_card', 'ad') THEN
    RAISE EXCEPTION 'p_item must be bio, intro_card or ad' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_msg) < 3 OR char_length(v_msg) > 1000 THEN
    RAISE EXCEPTION 'Tell us what to change (3 to 1000 characters).' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_n FROM public.brokers WHERE user_id = v_uid;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No broker profile is linked to this login.' USING ERRCODE = 'P0002';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'More than one broker profile is linked to this login; ask Lead Velocity.' USING ERRCODE = '21000';
  END IF;
  SELECT * INTO b FROM public.brokers WHERE user_id = v_uid FOR UPDATE;

  SELECT count(*) INTO v_open
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.onboarding_progress -> 'change_requests') = 'array'
                                   THEN b.onboarding_progress -> 'change_requests' ELSE '[]'::jsonb END) e
   WHERE e ->> 'status' = 'open';
  IF v_open >= 10 THEN
    RAISE EXCEPTION 'You have 10 open requests. We''ll be in touch about those first.' USING ERRCODE = '22023';
  END IF;

  v_req := jsonb_build_object('id', gen_random_uuid(), 'item', p_item, 'message', v_msg, 'status', 'open', 'at', v_now);
  UPDATE public.brokers
     SET onboarding_progress = jsonb_set(coalesce(onboarding_progress, '{}'::jsonb), '{change_requests}',
           CASE WHEN jsonb_typeof(onboarding_progress -> 'change_requests') = 'array'
                THEN onboarding_progress -> 'change_requests' ELSE '[]'::jsonb END || jsonb_build_array(v_req))
   WHERE id = b.id
  RETURNING * INTO b;

  v_label := CASE p_item WHEN 'bio' THEN 'bio' WHEN 'intro_card' THEN 'intro card' ELSE 'an ad featuring them' END;

  INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body)
  VALUES (b.id, 'onboarding', 'n/a', format('Broker requested a change to their %s: %s', v_label, left(v_msg, 300)));

  v_notified := public.lv_notify_emma(
    'Broker change request',
    format('%s (%s) asked for a change to their %s in the broker portal: "%s". Open the broker in the CRM to resolve it.',
           coalesce(b.contact_person, 'A broker'), coalesce(b.firm_name, 'no practice name'), v_label, left(v_msg, 600)),
    'lv_broker_change_request');

  INSERT INTO public.broker_compliance_checks (broker_id, check_type, result, summary, details, source, checked_by, checked_at)
  VALUES (b.id, 'other', 'info', format('Broker requested a change to their approved %s.', v_label),
          jsonb_build_object('event', 'change_requested', 'request_id', v_req ->> 'id', 'item', p_item, 'message', v_msg,
                             'notified_emma', v_notified, 'auth_user_id', v_uid),
          'Broker portal', 'Broker (portal)', v_now);

  RETURN jsonb_build_object('onboarding_progress', b.onboarding_progress, 'request', v_req);
END $function$;

COMMENT ON FUNCTION public.broker_request_change(text, text) IS
  'Broker portal: ask Lead Velocity to change an approved item (bio | intro_card | ad). Own row only; appends to onboarding_progress.change_requests; timeline + broker_compliance_checks (change_requested) + EMMA ping.';
REVOKE ALL ON FUNCTION public.broker_request_change(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_request_change(text, text) TO authenticated;

-- ------------------------------------------------------------------------------------------------------------------
-- 2. Admin: resolve (optionally unlock)
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_change_request(p_broker_id uuid, p_request_id uuid, p_unlock boolean DEFAULT false, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_now    timestamptz := now();
  v_note   text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_unlock boolean := coalesce(p_unlock, false);
  v_arr    jsonb;
  v_req    jsonb;
  v_prog   jsonb;
  b        public.brokers%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.smc_is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM public.brokers WHERE id = p_broker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker not found.' USING ERRCODE = 'P0002';
  END IF;
  v_arr := CASE WHEN jsonb_typeof(b.onboarding_progress -> 'change_requests') = 'array' THEN b.onboarding_progress -> 'change_requests' ELSE '[]'::jsonb END;
  SELECT e INTO v_req FROM jsonb_array_elements(v_arr) e WHERE e ->> 'id' = p_request_id::text LIMIT 1;
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Change request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req ->> 'status' = 'resolved' THEN
    RETURN jsonb_build_object('onboarding_progress', b.onboarding_progress, 'request', v_req, 'changed', false);
  END IF;
  IF v_req ->> 'item' = 'ad' THEN
    v_unlock := false;   -- nothing to unlock: a changed ad is a new version for him to approve
  END IF;

  v_req := v_req || jsonb_build_object('status', 'resolved', 'resolved_at', v_now, 'resolved_by', v_uid, 'unlock', v_unlock, 'note', v_note);
  SELECT coalesce(jsonb_agg(CASE WHEN e ->> 'id' = p_request_id::text THEN v_req ELSE e END ORDER BY ord), '[]'::jsonb)
    INTO v_arr FROM jsonb_array_elements(v_arr) WITH ORDINALITY AS t(e, ord);

  v_prog := jsonb_set(coalesce(b.onboarding_progress, '{}'::jsonb), '{change_requests}', v_arr);
  IF v_unlock THEN
    IF jsonb_typeof(v_prog -> 'card') = 'object' THEN
      v_prog := jsonb_set(v_prog, '{card,unlocked_at}', to_jsonb(v_now));
    END IF;
    IF v_req ->> 'item' = 'bio' AND jsonb_typeof(v_prog -> 'bio_review') = 'object' THEN
      v_prog := jsonb_set(v_prog, '{bio_review,unlocked_at}', to_jsonb(v_now));
    END IF;
  END IF;

  UPDATE public.brokers SET onboarding_progress = v_prog WHERE id = b.id RETURNING * INTO b;

  INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body, created_by)
  VALUES (b.id, 'onboarding', 'n/a', format('Change request (%s) resolved%s%s', v_req ->> 'item',
          CASE WHEN v_unlock THEN '; broker can edit again' ELSE '' END, CASE WHEN v_note IS NOT NULL THEN ': ' || v_note ELSE '' END), v_uid);

  INSERT INTO public.broker_compliance_checks (broker_id, check_type, result, summary, details, source, checked_by, checked_at)
  VALUES (b.id, 'other', 'info',
          format('Lead Velocity resolved the broker''s change request (%s)%s.', v_req ->> 'item', CASE WHEN v_unlock THEN ' and unlocked it for editing' ELSE '' END),
          jsonb_build_object('event', 'change_request_resolved', 'request_id', p_request_id, 'item', v_req ->> 'item',
                             'unlock', v_unlock, 'note', v_note, 'resolved_by', v_uid),
          'Admin CRM', 'Lead Velocity (admin)', v_now);

  RETURN jsonb_build_object('onboarding_progress', b.onboarding_progress, 'request', v_req, 'changed', true);
END $function$;

COMMENT ON FUNCTION public.admin_resolve_change_request(uuid, uuid, boolean, text) IS
  'Admin CRM: resolve a broker change request; p_unlock lets the broker edit the bio / headshot again (until a new card is approved). Logged.';
REVOKE ALL ON FUNCTION public.admin_resolve_change_request(uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_change_request(uuid, uuid, boolean, text) TO authenticated;

-- ------------------------------------------------------------------------------------------------------------------
-- 3. Server-side lock on the broker's own edits
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_approved_items_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  p           jsonb := coalesce(OLD.onboarding_progress, '{}'::jsonb);
  card_locked boolean;
  bio_locked  boolean;
BEGIN
  -- Same rule as smc_brokers_guard: only the broker's own API session is checked.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.smc_is_admin() THEN
    RETURN NEW;
  END IF;
  card_locked := coalesce(p -> 'card' ->> 'approved_at', '') <> '' AND coalesce(p -> 'card' ->> 'unlocked_at', '') = '';
  bio_locked  := card_locked OR (p -> 'bio_review' ->> 'status' = 'accepted' AND coalesce(p -> 'bio_review' ->> 'unlocked_at', '') = '');
  IF NEW.bio_short IS DISTINCT FROM OLD.bio_short AND bio_locked THEN
    RAISE EXCEPTION 'Your bio is approved. To change it, use "Request a change".' USING ERRCODE = '42501';
  END IF;
  IF NEW.headshot_url IS DISTINCT FROM OLD.headshot_url AND card_locked THEN
    RAISE EXCEPTION 'Your intro card is approved. To change your photo, use "Request a change".' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS broker_approved_items_guard ON public.brokers;
CREATE TRIGGER broker_approved_items_guard BEFORE UPDATE OF bio_short, headshot_url ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.broker_approved_items_guard();

COMMIT;
