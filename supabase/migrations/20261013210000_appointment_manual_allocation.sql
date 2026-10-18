-- Manual appointment capture + admin allocation (Jono, 13 Oct 2026).
--
-- When no broker calendar can be booked (Mark's Outlook is not connected yet; some brokers never connect), a client can still
-- ask for a call. The request is an ordinary appointments row with status 'requested' (no broker, no time yet, the client's
-- preferred windows). An admin allocates it in the CRM (Dashboard -> Appointments): broker + time + the broker's email. The
-- row then becomes a normal 'booked' appointment, so reminders, the broker portal, feedback and order counting all see it
-- exactly like a W05 booking. Side effects (Graph event or .ics invite, client confirmation) run in the edge function
-- appointment-allocation; the state change and the audit happen here, as the admin (audit_log via the smc_audit trigger).
--
-- Undo: supabase/migrations/undo/20261013210000_appointment_manual_allocation.undo.sql

-- ------------------------------------------------------------------------------------------------ columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS requested_windows jsonb,         -- [{date?: 'YYYY-MM-DD', part: 'morning'|'lunchtime'|'afternoon'|'evening'|'any', label?}]
  ADD COLUMN IF NOT EXISTS request_source    text,          -- channel the request came through
  ADD COLUMN IF NOT EXISTS consent_ref       text,          -- '<consent version>|<consent source>|<consent at UTC>' of the lead
  ADD COLUMN IF NOT EXISTS requested_at      timestamptz,
  ADD COLUMN IF NOT EXISTS allocated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocated_at      timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_email    text,          -- where the .ics invite went (redacted in audit_log: name is in smc_audit's PII list)
  ADD COLUMN IF NOT EXISTS invite_sequence   integer NOT NULL DEFAULT 0;  -- iCalendar SEQUENCE for updates / cancels of the same UID

-- a request has no time until it is allocated
ALTER TABLE public.appointments ALTER COLUMN appointment_date DROP NOT NULL;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_smc_checks;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_smc_checks CHECK (
  (appointment_date IS NOT NULL OR (brand_id IS NOT NULL AND status IN ('requested', 'cancelled')))
  AND (brand_id IS NULL OR (
        status = ANY (ARRAY['requested','pending_verification','booked','confirmed','rescheduled','cancelled','attended','no_show'])
    AND (status <> 'pending_verification' OR verify_by IS NOT NULL)
    AND (method = ANY (ARRAY['teams','zoom','meet','whatsapp_call','phone'])
         OR (method IS NULL AND appointment_date IS NULL AND status IN ('requested','cancelled')))
    AND (appointment_date IS NULL OR (ends_at IS NOT NULL AND ends_at > appointment_date))
    AND (broker_id IS NOT NULL OR (appointment_date IS NULL AND status IN ('requested','cancelled')))
    AND client_id IS NOT NULL
    AND (booked_via IS NULL OR booked_via = ANY (ARRAY['page','flow','list','chat','console']))
    AND (calendar_provider IS NULL OR calendar_provider = ANY (ARRAY['outlook','google','shared_lv']))
    AND (invite_email_status IS NULL OR invite_email_status = ANY (ARRAY['not_needed','sent','delivered','bounced','corrected']))
    AND (request_source IS NULL OR request_source = ANY (ARRAY['page','whatsapp','voice','console','flow']))
    AND (status <> 'requested' OR requested_at IS NOT NULL)
  ))
);

-- one open request per lead (a second request from another channel updates the first)
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_open_request ON public.appointments (client_id) WHERE status = 'requested';

-- An allocated appointment is shown to its broker even if the client's email is not verified: an admin placed it there.
DROP POLICY IF EXISTS "smc broker sees verified bookings only" ON public.appointments;
CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin()
         OR (status <> 'pending_verification' AND (allocated_at IS NOT NULL OR public.smc_lead_email_verified(client_id))));

-- The allocation function puts the event into a connected broker's Outlook itself, so it must read the refresh token.
-- Reverses CRM-NURTURE-SCHEMA D9 ("revert only if an edge function must read it"); still never exposed to anon/authenticated.
GRANT EXECUTE ON FUNCTION public.smc_vault_ms_refresh(uuid) TO service_role;

-- ------------------------------------------------------------------------------------------------ capture
CREATE OR REPLACE FUNCTION public.appointment_request_upsert(
  p_lead_id uuid, p_windows jsonb DEFAULT NULL, p_method text DEFAULT NULL, p_source text DEFAULT 'whatsapp',
  p_consent_ref text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  l record;
  v_live record;
  v_id uuid;
  v_created boolean := false;
  v_windows jsonb;
  v_method text;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('page','whatsapp','voice','console','flow') THEN
    RAISE EXCEPTION 'appointment_request_upsert: bad source %', p_source USING ERRCODE = '22023';
  END IF;
  SELECT id, brand_id, broker_id, opted_out_at, consent_text_version, consent_source, consent_at, best_time, method_pref
    INTO l FROM public.leads WHERE id = p_lead_id;
  IF l.id IS NULL OR l.brand_id IS NULL THEN
    RAISE EXCEPTION 'appointment_request_upsert: unknown SortMyCover lead' USING ERRCODE = '22023';
  END IF;
  IF l.opted_out_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'opted_out');
  END IF;
  SELECT id, status INTO v_live FROM public.appointments
   WHERE client_id = p_lead_id AND brand_id IS NOT NULL AND status IN ('pending_verification','booked','confirmed')
   ORDER BY created_at DESC LIMIT 1;
  IF v_live.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_live.id, 'status', v_live.status, 'created', false, 'reason', 'already_booked');
  END IF;

  v_method := CASE WHEN p_method IN ('teams','zoom','meet','whatsapp_call','phone') THEN p_method ELSE l.method_pref END;
  v_windows := CASE
    WHEN p_windows IS NOT NULL AND jsonb_typeof(p_windows) = 'array' AND jsonb_array_length(p_windows) > 0 THEN p_windows
    WHEN l.best_time IS NOT NULL THEN jsonb_build_array(jsonb_build_object('part', l.best_time))
    ELSE NULL END;

  PERFORM set_config('smc.source', 'appointment_request', true);
  PERFORM set_config('smc.reason', 'appointment requested via ' || p_source, true);

  UPDATE public.appointments
     SET requested_windows = coalesce(v_windows, requested_windows),
         method            = coalesce(v_method, method),
         request_source    = p_source,
         updated_at        = now()
   WHERE client_id = p_lead_id AND status = 'requested'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.appointments (client_id, brand_id, broker_id, status, method, requested_windows, request_source, consent_ref,
                                     requested_at, appointment_date, ends_at)
    VALUES (p_lead_id, l.brand_id, NULL, 'requested', v_method, v_windows, p_source,
            coalesce(nullif(p_consent_ref, ''),
                     concat_ws('|', l.consent_text_version, l.consent_source,
                               to_char(l.consent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
            now(), NULL, NULL)
    ON CONFLICT (client_id) WHERE status = 'requested' DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    v_created := true;
  END IF;

  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, notes, payload, occurred_at, idempotency_key)
  VALUES (p_lead_id, l.brand_id, NULL, 'system', 'appointment_requested',
          'Appointment requested via ' || p_source || ' (no broker calendar available): waiting for allocation.'
            || CASE WHEN coalesce(p_note, '') <> '' THEN ' Note: ' || left(p_note, 300) ELSE '' END,
          jsonb_build_object('appointment_id', v_id, 'source', p_source, 'windows', v_windows, 'method', v_method, 'created', v_created),
          now(), 'appt:requested:' || v_id::text || ':' || p_source || ':' || md5(coalesce(v_windows::text, '') || coalesce(v_method, '')))
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'requested', 'created', v_created);
END $$;
COMMENT ON FUNCTION public.appointment_request_upsert(uuid, jsonb, text, text, text, text) IS
  'Manual allocation: records (or updates) the one open appointment request of a SortMyCover lead. service_role / n8n_app.';

-- Safety net for channels that cannot call the edge function themselves (WhatsApp W03/W07 slots fallback): a qualified lead
-- whose broker has no bookable calendar and who has no appointment gets a request (windows from leads.best_time).
CREATE OR REPLACE FUNCTION public.appointment_request_sweep()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT l.id FROM public.leads l
      LEFT JOIN public.brokers b ON b.id = l.broker_id
     WHERE l.brand_id IS NOT NULL AND l.stage = 'qualified' AND l.opted_out_at IS NULL AND l.is_synthetic IS NOT TRUE
       AND l.stage_entered_at < now() - interval '15 minutes'
       AND (b.id IS NULL OR b.bookings_paused IS TRUE
            OR NOT (coalesce(b.calendar_status, '') IN ('ok', 'blocked_admin_consent') OR coalesce(b.calendar_mode, '') = 'shared_fallback'))
       AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.client_id = l.id AND a.brand_id IS NOT NULL
                          AND (a.status IN ('requested','pending_verification','booked','confirmed')
                               OR (a.status = 'cancelled' AND a.requested_at IS NOT NULL)))  -- an admin closed it: don't reopen
     LIMIT 200
  LOOP
    PERFORM public.appointment_request_upsert(r.id, NULL, NULL, 'whatsapp', NULL, 'Captured automatically: qualified on WhatsApp, no bookable broker calendar.');
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ------------------------------------------------------------------------------------------------ allocation (admin)
CREATE OR REPLACE FUNCTION public.appointment_allocate(
  p_appointment_id uuid, p_broker_id uuid, p_start timestamptz, p_minutes integer DEFAULT 30,
  p_method text DEFAULT 'teams', p_calendar_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  a public.appointments%ROWTYPE;
  n public.appointments%ROWTYPE;
  b record;
  v_email text;
  v_prev jsonb;
  v_admin text;
  v_re boolean;
BEGIN
  IF NOT public.smc_is_admin() THEN
    RAISE EXCEPTION 'appointment_allocate: admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.appointments WHERE id = p_appointment_id AND brand_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_allocate: appointment not found' USING ERRCODE = 'P0002'; END IF;
  IF a.status NOT IN ('requested','booked','confirmed') THEN
    RAISE EXCEPTION 'appointment_allocate: a % appointment cannot be allocated', a.status USING ERRCODE = '22023';
  END IF;
  SELECT id, email, calendar_email, contact_person, firm_name INTO b FROM public.brokers WHERE id = p_broker_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'appointment_allocate: unknown broker' USING ERRCODE = '22023'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('teams','zoom','meet','whatsapp_call','phone') THEN
    RAISE EXCEPTION 'appointment_allocate: bad method %', p_method USING ERRCODE = '22023';
  END IF;
  IF p_minutes IS NULL OR p_minutes < 10 OR p_minutes > 240 THEN
    RAISE EXCEPTION 'appointment_allocate: duration must be 10-240 minutes' USING ERRCODE = '22023';
  END IF;
  IF p_start IS NULL OR p_start < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'appointment_allocate: the time is in the past' USING ERRCODE = '22023';
  END IF;
  v_email := lower(trim(coalesce(nullif(trim(p_calendar_email), ''), b.calendar_email, b.email)));
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'appointment_allocate: a valid broker email is required' USING ERRCODE = '22023';
  END IF;

  v_re := a.status <> 'requested';
  v_prev := jsonb_build_object('status', a.status, 'broker_id', a.broker_id, 'appointment_date', a.appointment_date, 'ends_at', a.ends_at,
                               'method', a.method, 'graph_event_id', a.graph_event_id, 'calendar_provider', a.calendar_provider,
                               'calendar_email', a.calendar_email, 'invite_email_status', a.invite_email_status,
                               'invite_sequence', a.invite_sequence, 'allocated_at', a.allocated_at);
  SELECT email INTO v_admin FROM auth.users WHERE id = auth.uid();

  PERFORM set_config('smc.source', 'crm', true);
  PERFORM set_config('smc.reason', CASE WHEN v_re THEN 'manual re-allocation' ELSE 'manual allocation' END, true);
  UPDATE public.appointments
     SET broker_id           = p_broker_id,
         appointment_date    = p_start,
         ends_at             = p_start + make_interval(mins => p_minutes),
         method              = p_method,
         status              = 'booked',
         booked_at           = coalesce(booked_at, now()),
         booked_via          = 'console',
         allocated_by        = auth.uid(),
         allocated_at        = now(),
         calendar_email      = v_email,
         invite_sequence     = invite_sequence + 1,
         graph_event_id      = NULL,
         ical_uid            = NULL,
         join_url            = NULL,
         calendar_provider   = NULL,
         invite_email_status = CASE WHEN p_method IN ('teams','zoom','meet') THEN NULL ELSE 'not_needed' END,
         confirmed_at        = NULL,
         reschedule_count    = reschedule_count + CASE WHEN v_re THEN 1 ELSE 0 END,
         call_number         = CASE WHEN p_method IN ('phone','whatsapp_call')
                                    THEN (SELECT coalesce(call_number, phone) FROM public.leads WHERE id = a.client_id) END,
         updated_at          = now()
   WHERE id = a.id
  RETURNING * INTO n;

  UPDATE public.leads SET stage = 'booked'
   WHERE id = a.client_id AND stage IN ('new','disclosed','verified','qualified','unbooked_closed');

  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, workflow, activity_type, notes, payload, occurred_at, idempotency_key)
  VALUES (a.client_id, a.brand_id, p_broker_id, 'admin', 'console',
          CASE WHEN v_re THEN 'appointment_reallocated' ELSE 'appointment_allocated' END,
          (CASE WHEN v_re THEN 'Appointment re-allocated to ' ELSE 'Appointment allocated to ' END)
            || coalesce(b.contact_person, b.firm_name, 'broker') || ' for '
            || to_char(p_start AT TIME ZONE 'Africa/Johannesburg', 'Dy DD Mon HH24:MI') || ' SAST (' || p_method || ') by '
            || coalesce(v_admin, 'an admin') || '.',
          jsonb_build_object('appointment_id', a.id, 'broker_id', p_broker_id, 'start', p_start, 'minutes', p_minutes, 'method', p_method,
                             'allocated_by', auth.uid(), 'allocated_by_email', v_admin, 'sequence', n.invite_sequence, 'previous', v_prev),
          now(), 'appt:allocated:' || a.id::text || ':' || n.invite_sequence::text)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'appointment', to_jsonb(n), 'previous', v_prev, 'reallocated', v_re, 'allocated_by_email', v_admin);
EXCEPTION
  WHEN exclusion_violation OR unique_violation THEN
    RAISE EXCEPTION 'appointment_allocate: the broker already has a booking at that time' USING ERRCODE = '23P01';
END $$;

CREATE OR REPLACE FUNCTION public.appointment_cancel(p_appointment_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  a public.appointments%ROWTYPE;
  n public.appointments%ROWTYPE;
  v_prev jsonb;
  v_admin text;
BEGIN
  IF NOT public.smc_is_admin() THEN
    RAISE EXCEPTION 'appointment_cancel: admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.appointments WHERE id = p_appointment_id AND brand_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_cancel: appointment not found' USING ERRCODE = 'P0002'; END IF;
  IF a.status NOT IN ('requested','booked','confirmed','pending_verification') THEN
    RAISE EXCEPTION 'appointment_cancel: a % appointment cannot be cancelled', a.status USING ERRCODE = '22023';
  END IF;
  v_prev := jsonb_build_object('status', a.status, 'broker_id', a.broker_id, 'appointment_date', a.appointment_date, 'ends_at', a.ends_at,
                               'method', a.method, 'graph_event_id', a.graph_event_id, 'calendar_provider', a.calendar_provider,
                               'calendar_email', a.calendar_email, 'invite_email_status', a.invite_email_status,
                               'invite_sequence', a.invite_sequence);
  SELECT email INTO v_admin FROM auth.users WHERE id = auth.uid();
  PERFORM set_config('smc.source', 'crm', true);
  PERFORM set_config('smc.reason', left('manual cancel: ' || coalesce(p_reason, ''), 200), true);
  UPDATE public.appointments
     SET status = 'cancelled', cancelled_at = now(), invite_sequence = invite_sequence + 1, updated_at = now()
   WHERE id = a.id
  RETURNING * INTO n;
  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, workflow, activity_type, notes, payload, occurred_at, idempotency_key)
  VALUES (a.client_id, a.brand_id, a.broker_id, 'admin', 'console', 'appointment_cancelled',
          'Appointment ' || CASE WHEN a.status = 'requested' THEN 'request ' ELSE '' END || 'cancelled by ' || coalesce(v_admin, 'an admin')
            || CASE WHEN coalesce(p_reason, '') <> '' THEN ': ' || left(p_reason, 300) ELSE '.' END,
          jsonb_build_object('appointment_id', a.id, 'cancelled_by', auth.uid(), 'cancelled_by_email', v_admin, 'previous', v_prev),
          now(), 'appt:cancelled:' || a.id::text || ':' || n.invite_sequence::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'appointment', to_jsonb(n), 'previous', v_prev, 'cancelled_by_email', v_admin);
END $$;

-- ------------------------------------------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.appointment_request_upsert(uuid, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.appointment_request_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.appointment_allocate(uuid, uuid, timestamptz, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.appointment_cancel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appointment_request_upsert(uuid, jsonb, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.appointment_request_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.appointment_allocate(uuid, uuid, timestamptz, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_cancel(uuid, text) TO authenticated, service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.appointment_request_upsert(uuid, jsonb, text, text, text, text) TO n8n_app';
  END IF;
END $$;

-- ------------------------------------------------------------------------------------------------ schedule
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smc-appointment-request-sweep';
    PERFORM cron.schedule('smc-appointment-request-sweep', '*/10 * * * *', 'select public.appointment_request_sweep()');
  END IF;
END $$;
