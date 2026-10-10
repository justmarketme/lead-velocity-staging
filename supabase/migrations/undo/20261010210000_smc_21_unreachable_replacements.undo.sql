-- UNDO of 20261010210000_smc_21_unreachable_replacements.sql
-- Generated 2026-10-10 from a local catalog diff (supabase/drift/gen-undo.mjs). Run ONLY after every later migration's undo has run (reverse order).
-- Safe while no SortMyCover data exists. Dropping tables/columns here deletes whatever was written into them since the apply: take the backup first.
-- Review before running. Run in one transaction.
BEGIN;
SET LOCAL check_function_bodies = off;   -- restored function bodies may reference objects an earlier undo already dropped
CREATE OR REPLACE FUNCTION public.smc_request_noshow_replacement(p_booking_id uuid, p_proof_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_broker uuid := public.smc_current_broker_id();
  a public.appointments%rowtype;
  v_outcome uuid;
  v_used integer;
  v_id uuid;
BEGIN
  IF v_broker IS NULL THEN RAISE EXCEPTION 'not a SortMyCover broker' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.appointments WHERE id = p_booking_id AND broker_id = v_broker AND brand_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0002'; END IF;
  IF p_proof_path IS NULL OR p_proof_path NOT LIKE v_broker::text || '/noshow-proof/%'
     OR p_proof_path ~ '(\.\./|//|\\)' THEN   -- SAFETY REWRITE 2026-10-10: no path traversal ("<me>/noshow-proof/../<other>/x" matched the LIKE)
    RAISE EXCEPTION 'proof missing' USING ERRCODE = '22023';
  END IF;
  IF now() < a.appointment_date + interval '10 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_early');
  END IF;
  IF now() > a.appointment_date + interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_late');   -- Schedule 3.4: the lead stands as Delivered
  END IF;
  SELECT count(*) INTO v_used FROM public.replacements r
   WHERE r.broker_id = v_broker
     AND public.smc_week_start(coalesce(r.missed_start_at, r.claimed_at)) = public.smc_week_start(a.appointment_date);
  IF v_used >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'weekly_max', 'used', v_used, 'max', 3);
  END IF;

  INSERT INTO public.outcomes (booking_id, lead_id, broker_id, cycle_id, brand_id, outcome, marked_by, marked_via, marked_at)
  VALUES (a.id, a.client_id, a.broker_id, a.cycle_id, a.brand_id, 'no_show', auth.uid(), 'portal', now())
  ON CONFLICT (booking_id) DO UPDATE SET outcome = 'no_show', marked_via = 'portal', marked_at = now(),
                                         unconfirmed = false, auto_marked = false, updated_at = now()
    WHERE public.outcomes.dispute_status = 'none'
  RETURNING id INTO v_outcome;
  IF v_outcome IS NULL THEN SELECT id INTO v_outcome FROM public.outcomes WHERE booking_id = a.id; END IF;

  INSERT INTO public.replacements (lead_id, outcome_id, cycle_id, broker_id, brand_id, reason, reason_code,
                                   booking_id, missed_start_at, proof_path, proof_sent_at, status)
  VALUES (a.client_id, v_outcome, a.cycle_id, a.broker_id, a.brand_id, 'no_show', 'schedule3_proof',
          a.id, a.appointment_date, p_proof_path, now(), 'due')
  RETURNING id INTO v_id;

  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (a.client_id, a.brand_id, a.broker_id, a.cycle_id, 'portal', 'broker', 'noshow_proof_sent',
          jsonb_build_object('booking_id', a.id, 'replacement_id', v_id), now(), 'portal:noshow_proof:' || a.id::text)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'replacement_id', v_id, 'used', v_used + 1, 'max', 3);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'already_requested');
END $function$;  -- restore previous definition (function was replaced here)
DROP FUNCTION IF EXISTS public.smc_request_replacement(p_booking_id uuid, p_proof_path text, p_kind text) CASCADE;
COMMIT;
