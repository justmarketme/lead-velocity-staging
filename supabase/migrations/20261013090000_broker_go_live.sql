-- Broker go-live from the admin CRM: campaign link + paid plan order, a go-live checklist built from the real routing rules,
-- Go live / Pause through SECURITY DEFINER RPCs, and the columns W20 and the portal already write/read but that were never
-- created on this database (approved_live_*, fsp_check, fsp_verified_at and W20's onboarding clocks).
-- Additive: nullable columns, new functions, smc_brokers_guard re-created with the new columns added to its locked list.
-- Undo: supabase/migrations/undo/20261013090000_broker_go_live.undo.sql
BEGIN;

-- 1. Columns W20 (automation/W20.json) and src/pages/portal/Start.tsx use. All nullable, no default, no backfill.
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS approved_live_by            uuid        NULL,
  ADD COLUMN IF NOT EXISTS approved_live_at            timestamptz NULL,
  ADD COLUMN IF NOT EXISTS fsp_check                   jsonb       NULL,
  ADD COLUMN IF NOT EXISTS fsp_verified_at             timestamptz NULL,
  ADD COLUMN IF NOT EXISTS first_login_at              timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at                timestamptz NULL,
  ADD COLUMN IF NOT EXISTS onboarding_last_progress_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS onboarding_nudges           jsonb       NULL,
  ADD COLUMN IF NOT EXISTS preflight_run_id            text        NULL,
  ADD COLUMN IF NOT EXISTS preflight_card              jsonb       NULL;
COMMENT ON COLUMN public.brokers.approved_live_by IS 'auth uid of the admin who switched the broker live (admin_broker_go_live / W20 go_live.approved).';
COMMENT ON COLUMN public.brokers.approved_live_at IS 'When the broker was last switched live.';
COMMENT ON COLUMN public.brokers.fsp_check IS 'Last FSCA register check (W20 "Save fsp_check"): {status, reason, checked_at, register_name, ...}.';
COMMENT ON COLUMN public.brokers.fsp_verified_at IS 'Set by W20 only when the FSCA check verified the FSP number.';
ALTER TABLE public.brokers DROP CONSTRAINT IF EXISTS brokers_go_live_shapes;
ALTER TABLE public.brokers ADD CONSTRAINT brokers_go_live_shapes CHECK (
      (fsp_check IS NULL OR jsonb_typeof(fsp_check) = 'object')
  AND (onboarding_nudges IS NULL OR jsonb_typeof(onboarding_nudges) = 'object')
  AND (preflight_card IS NULL OR jsonb_typeof(preflight_card) = 'object'));

-- 2. smc_brokers_guard: the same function, plus the go-live / verification / pre-flight columns in the list a broker can never
-- set on his own row (otherwise "Brokers can update their own profile" would let him stamp fsp_verified_at or approved_live_at).
CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- decide on current_user FIRST (n8n_app / service / SECURITY DEFINER paths never call auth.uid())
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'smc: no session' USING ERRCODE = '42501';   -- an API role without a user never edits a broker row
  END IF;
  IF public.smc_is_admin() THEN
    RETURN NEW;
  END IF;
  -- Fields only Lead Velocity (admin / workflows) sets, on EVERY row (a legacy broker cannot pre-load them before an admin
  -- enrols him: once routing is switched on they would reach consumers).
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
  OR NEW.onboarding_progress    IS DISTINCT FROM OLD.onboarding_progress
  OR NEW.approved_live_by       IS DISTINCT FROM OLD.approved_live_by
  OR NEW.approved_live_at       IS DISTINCT FROM OLD.approved_live_at
  OR NEW.fsp_check              IS DISTINCT FROM OLD.fsp_check
  OR NEW.fsp_verified_at        IS DISTINCT FROM OLD.fsp_verified_at
  OR NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at
  OR NEW.onboarding_nudges      IS DISTINCT FROM OLD.onboarding_nudges
  OR NEW.preflight_run_id       IS DISTINCT FROM OLD.preflight_run_id
  OR NEW.preflight_card         IS DISTINCT FROM OLD.preflight_card THEN
    RAISE EXCEPTION 'smc: brokers cannot change routing (incl. the low-budget switch), consent, licence, verification, calendar connection, go-live or approved media fields'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.brand_id IS NULL THEN
    IF NEW.fsp_number IS DISTINCT FROM OLD.fsp_number THEN
      RAISE EXCEPTION 'smc: the FSP number is set during SortMyCover onboarding' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;   -- every legacy column stays writable exactly as today
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'smc: brokers cannot change their SortMyCover status' USING ERRCODE = '42501';
  END IF;
  -- The names the consent text and the WhatsApp disclosure carry ("{practice} (FSP n)", the adviser) and the number lead
  -- notifications go to: editable during onboarding (portal Profile), frozen once Lead Velocity switches routing on.
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

-- 3. The go-live checklist: one row per requirement, from the same rules routing enforces
--    (brokers_smc_routing_ready / smc_broker_ready, smc_open_order_for via smc_order_capacity, W01 isRoutable).
--    hard = Go live is refused while it fails; soft rows are warnings shown to the admin.
CREATE OR REPLACE FUNCTION public.admin_broker_go_live_check(p_broker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b       public.brokers%ROWTYPE;
  v_brand text;
  v_open  record;
  v_any   record;
  v_fsp_ok boolean;
  v_rows  jsonb := '[]'::jsonb;
  v_hard_ok boolean;
BEGIN
  IF NOT public.smc_is_admin() THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM public.brokers WHERE id = p_broker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'broker not found' USING ERRCODE = '22023'; END IF;
  SELECT name INTO v_brand FROM public.brands WHERE id = b.brand_id;

  v_rows := v_rows || jsonb_build_object('key', 'brand', 'label', 'Linked to a campaign', 'hard', true,
    'ok', b.brand_id IS NOT NULL,
    'reason', CASE WHEN b.brand_id IS NULL THEN 'Not linked to any campaign yet (Campaigns, above).' ELSE 'Linked to ' || coalesce(v_brand, 'a campaign') || '.' END);

  v_fsp_ok := btrim(coalesce(b.fsp_number, '')) ~ '^[A-Za-z0-9 /-]{1,20}$' AND b.fsp_number ~ '[0-9]';
  v_rows := v_rows || jsonb_build_object('key', 'fsp', 'label', 'FSP number', 'hard', true, 'ok', v_fsp_ok,
    'reason', CASE WHEN b.fsp_number IS NULL OR btrim(b.fsp_number) = '' THEN 'No FSP number yet. The broker enters it on his portal Profile.'
                   WHEN NOT v_fsp_ok THEN 'FSP number "' || b.fsp_number || '" is not valid (digits, up to 20 characters).'
                   ELSE 'FSP ' || btrim(b.fsp_number) || CASE WHEN b.fsp_verified_at IS NOT NULL THEN ', verified on the FSCA register.' ELSE '. Not yet checked on the FSCA register.' END END);

  v_rows := v_rows || jsonb_build_object('key', 'names', 'label', 'Practice and contact name', 'hard', true,
    'ok', btrim(coalesce(b.firm_name, '')) <> '' AND btrim(coalesce(b.contact_person, '')) <> '',
    'reason', CASE WHEN btrim(coalesce(b.firm_name, '')) = '' THEN 'No practice name.'
                   WHEN btrim(coalesce(b.contact_person, '')) = '' THEN 'No contact (adviser) name.'
                   ELSE 'Consent will name "' || btrim(b.firm_name) || ' (FSP ' || coalesce(btrim(b.fsp_number), '?') || ')", adviser ' || btrim(b.contact_person) || '.' END);

  v_rows := v_rows || jsonb_build_object('key', 'intro_card', 'label', 'Intro card (https link)', 'hard', true,
    'ok', btrim(coalesce(b.intro_card_url, '')) ~ '^https://',
    'reason', CASE WHEN b.intro_card_url IS NULL OR btrim(b.intro_card_url) = '' THEN 'No intro card yet. The broker builds it in his portal.'
                   WHEN NOT (btrim(b.intro_card_url) ~ '^https://') THEN 'The intro card link is not an https:// address.'
                   ELSE 'Intro card is set.' END);

  SELECT c.lead_order_id, c.remaining, c.capacity INTO v_open FROM public.smc_order_capacity c
   WHERE c.broker_id = b.id AND c.brand_id = b.brand_id AND c.open
   ORDER BY c.paid_at NULLS LAST, c.created_at LIMIT 1;
  SELECT count(*) FILTER (WHERE c.status = 'paid') AS paid, count(*) FILTER (WHERE c.status IN ('pending','contract_signed')) AS unpaid, count(*) AS total
    INTO v_any FROM public.smc_order_capacity c WHERE c.broker_id = b.id AND c.brand_id IS NOT DISTINCT FROM b.brand_id;
  v_rows := v_rows || jsonb_build_object('key', 'order', 'label', 'Paid order with room', 'hard', true,
    'ok', v_open.lead_order_id IS NOT NULL,
    'reason', CASE WHEN b.brand_id IS NULL THEN 'Link a campaign first, then create the plan order.'
                   WHEN v_open.lead_order_id IS NOT NULL THEN v_open.remaining || ' of ' || v_open.capacity || ' leads still to deliver on a paid order.'
                   WHEN coalesce(v_any.total, 0) = 0 THEN 'No order for this campaign yet.'
                   WHEN v_any.unpaid > 0 THEN 'The order is not marked paid yet.'
                   ELSE 'Every paid order is full. Create the next cycle''s order.' END);

  v_rows := v_rows || jsonb_build_object('key', 'whatsapp', 'label', 'Business WhatsApp number confirmed', 'hard', true,
    'ok', b.whatsapp_number IS NOT NULL AND b.whatsapp_confirmed_at IS NOT NULL,
    'reason', CASE WHEN b.whatsapp_number IS NULL THEN 'No business WhatsApp number. The broker confirms it on his portal Profile.'
                   WHEN b.whatsapp_confirmed_at IS NULL THEN 'Number entered but not confirmed by the broker.'
                   ELSE 'Confirmed ' || to_char(b.whatsapp_confirmed_at AT TIME ZONE 'Africa/Johannesburg', 'DD Mon YYYY') || '.' END);

  v_rows := v_rows || jsonb_build_object('key', 'not_archived', 'label', 'Not archived or ended', 'hard', true,
    'ok', coalesce(b.status, '') NOT IN ('Inactive', 'ended'),
    'reason', CASE WHEN coalesce(b.status, '') IN ('Inactive', 'ended') THEN 'The broker is ' || CASE b.status WHEN 'Inactive' THEN 'archived' ELSE 'ended' END || '. Restore him first.' ELSE 'Status: ' || coalesce(b.status, 'none') || '.' END);

  v_rows := v_rows || jsonb_build_object('key', 'calendar', 'label', 'Calendar connected', 'hard', false,
    'ok', coalesce(b.calendar_status = 'ok', false),
    'reason', CASE b.calendar_status
                WHEN 'ok' THEN 'Outlook connected' || coalesce(' as ' || b.calendar_email, '') || '.'
                WHEN 'needs_reconnect' THEN 'Needs reconnect. Without it leads cannot book themselves into his calendar.'
                WHEN 'blocked_admin_consent' THEN 'Waiting for his IT admin to approve. Without it leads cannot book themselves into his calendar.'
                ELSE 'Not connected. Without it leads cannot book themselves into his calendar.' END);

  v_rows := v_rows || jsonb_build_object('key', 'bookings', 'label', 'Bookings not paused by the broker', 'hard', false,
    'ok', NOT coalesce(b.bookings_paused, false),
    'reason', CASE WHEN coalesce(b.bookings_paused, false) THEN 'He paused bookings in his portal: routing skips him until he resumes.' ELSE 'Bookings open.' END);

  SELECT bool_and((r->>'ok')::boolean) INTO v_hard_ok FROM jsonb_array_elements(v_rows) r WHERE (r->>'hard')::boolean;
  RETURN jsonb_build_object(
    'broker_id', b.id, 'ready', coalesce(v_hard_ok, false),
    'live', coalesce(b.status = 'active' AND b.routing_on, false),
    'status', b.status, 'routing_on', b.routing_on, 'bookings_paused', b.bookings_paused,
    'approved_live_at', b.approved_live_at, 'approved_live_by', b.approved_live_by,
    'checks', v_rows);
END $function$;

-- 4. Go live: re-checks everything server-side, then status 'active' + routing_on, who + when, and an activity row.
CREATE OR REPLACE FUNCTION public.admin_broker_go_live(p_broker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check jsonb;
  v_fail  text;
BEGIN
  IF NOT public.smc_is_admin() THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.brokers WHERE id = p_broker_id FOR UPDATE;
  v_check := public.admin_broker_go_live_check(p_broker_id);
  IF NOT (v_check->>'ready')::boolean THEN
    SELECT string_agg(r->>'label' || ': ' || (r->>'reason'), '; ') INTO v_fail
      FROM jsonb_array_elements(v_check->'checks') r WHERE (r->>'hard')::boolean AND NOT (r->>'ok')::boolean;
    RAISE EXCEPTION 'Not ready to go live. %', v_fail USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('smc.source', 'admin', true);
  PERFORM set_config('smc.reason', 'go live (admin_broker_go_live)', true);
  UPDATE public.brokers
     SET status = 'active', routing_on = true, approved_live_by = auth.uid(), approved_live_at = now()
   WHERE id = p_broker_id;
  INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body, created_by)
  VALUES (p_broker_id, 'other', NULL, 'Went live: routing switched on (all go-live checks passed).', auth.uid());
  RETURN public.admin_broker_go_live_check(p_broker_id);
END $function$;

-- 5. Pause: Lead Velocity's switch is routing_on (the broker cannot override it); bookings_paused stays the broker's own.
CREATE OR REPLACE FUNCTION public.admin_broker_pause(p_broker_id uuid, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.smc_is_admin() THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('smc.source', 'admin', true);
  PERFORM set_config('smc.reason', left('pause (admin_broker_pause)' || coalesce(': ' || v_reason, ''), 200), true);
  UPDATE public.brokers
     SET routing_on = false, status = CASE WHEN status = 'active' THEN 'paused' ELSE status END
   WHERE id = p_broker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'broker not found' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body, created_by)
  VALUES (p_broker_id, 'other', NULL, 'Paused: routing switched off.' || coalesce(' Reason: ' || left(v_reason, 300), ''), auth.uid());
  RETURN public.admin_broker_go_live_check(p_broker_id);
END $function$;

-- 6. Attach a proof of payment to an order and mark the order paid, in one transaction (admin_mark_order_paid is reused).
--    paid_at = the date on the proof (start of that day, SAST) when it has one, otherwise now().
CREATE OR REPLACE FUNCTION public.admin_attach_payment_and_mark_paid(p_order_id uuid, p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.lead_orders%ROWTYPE;
  d public.admin_documents%ROWTYPE;
  v_paid_on date;
BEGIN
  IF NOT public.smc_is_admin() THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.lead_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM public.admin_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND OR d.kind IS DISTINCT FROM 'proof_of_payment' THEN RAISE EXCEPTION 'proof of payment not found' USING ERRCODE = '22023'; END IF;
  IF d.broker_id IS DISTINCT FROM o.broker_id THEN RAISE EXCEPTION 'this proof of payment belongs to another broker' USING ERRCODE = '22023'; END IF;
  IF nullif(d.content_data->>'order_id', '') IS NOT NULL AND d.content_data->>'order_id' <> o.id::text THEN
    RAISE EXCEPTION 'this proof of payment is already linked to another order' USING ERRCODE = '22023';
  END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'the order is cancelled' USING ERRCODE = '22023'; END IF;
  UPDATE public.admin_documents
     SET content_data = coalesce(content_data, '{}'::jsonb) || jsonb_build_object('order_id', o.id), updated_at = now()
   WHERE id = d.id;
  IF o.status <> 'paid' THEN
    PERFORM public.admin_mark_order_paid(o.id);
  END IF;
  BEGIN v_paid_on := (d.content_data->>'paid_on')::date; EXCEPTION WHEN others THEN v_paid_on := NULL; END;
  IF v_paid_on IS NOT NULL THEN
    UPDATE public.lead_orders SET paid_at = (v_paid_on::timestamp AT TIME ZONE 'Africa/Johannesburg'), updated_at = now() WHERE id = o.id;
  END IF;
  INSERT INTO public.broker_activities (broker_id, activity_type, outcome, body, created_by)
  VALUES (o.broker_id, 'other', NULL,
          'Order "' || coalesce(o.title, 'lead order') || '" marked paid with proof of payment "' || coalesce(d.name, d.id::text) || '".', auth.uid());
  RETURN (SELECT jsonb_build_object('order_id', l.id, 'status', l.status, 'paid_at', l.paid_at, 'document_id', d.id) FROM public.lead_orders l WHERE l.id = o.id);
END $function$;

-- 7. The mailbox the broker actually signed in with (ms-oauth reads Graph /me after the token exchange). W04/W05 use it.
CREATE OR REPLACE FUNCTION public.smc_set_calendar_mailbox(p_broker_id uuid, p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v) > 254 THEN
    RAISE EXCEPTION 'smc_set_calendar_mailbox: not an email address' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('smc.source', 'edge', true);
  PERFORM set_config('smc.reason', 'calendar mailbox from Graph /me', true);
  UPDATE public.brokers SET calendar_email = v WHERE id = p_broker_id AND brand_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'smc_set_calendar_mailbox: unknown SMC broker' USING ERRCODE = '22023'; END IF;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.admin_broker_go_live_check(uuid), public.admin_broker_go_live(uuid), public.admin_broker_pause(uuid, text),
  public.admin_attach_payment_and_mark_paid(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broker_go_live_check(uuid), public.admin_broker_go_live(uuid), public.admin_broker_pause(uuid, text),
  public.admin_attach_payment_and_mark_paid(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_set_calendar_mailbox(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_set_calendar_mailbox(uuid, text) TO service_role;

COMMIT;
