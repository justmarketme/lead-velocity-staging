-- 20261010210000_smc_21_unreachable_replacements.sql  —  SortMyCover broker portal, UX sprint 1 follow-up (Jonathan, 10 Oct 2026). Renumbered from ux-sprint-1 "smc_20".
-- NOT APPLIED. DDL on this project is user-gated: Jonathan applies it (SQL editor / npm run) after review.
-- Apply AFTER 20261008200000_smc_20_feedback_firewall.sql (it needs outcomes.outcome = 'unreachable', replacements.booking_id /
-- missed_start_at / proof_path / proof_sent_at, smc_week_start() and the weekly cap trigger, all from smc_20).
-- The portal works before AND after this file is applied: src/lib/smcPortal.ts tries smc_request_replacement first, then
-- (for a no-show) smc_request_noshow_replacement, then records the request as a portal event.
--
-- Why (Lead Generation Services Agreement clauses 7, 8.4 and Schedule 3):
--   * A lead the broker "couldn't reach" (outcome kind 'unreachable', clause 8.4 "could be contacted") can now earn a goodwill
--     replacement REQUEST, exactly like a no-show: discretionary, never a right, never because the consumer didn't buy.
--   * ONE weekly counter: at most 3 requests per Calendar Week (Mon 00:00 to Sun 23:59 SAST, counted by the date of the
--     missed appointment), no-shows and unreachable together; every request row counts, decided or not. There is no
--     per-cycle cap in any wording. The old per-cycle data columns stay as history and drive nothing (see COMMENTs below).
--   * Proof window is the same for both kinds: it opens 10 minutes after the booked start and closes 30 minutes after.
--     For 'unreachable' the proof is a call-log or WhatsApp screenshot showing at least 2 attempts and no reply, or that the
--     number is wrong or invalid (the portal tells the broker; the console reads the file).
--   * Clause 8.4 is unchanged: the broker still gives only attended / could be contacted (four answers). A replacement lead
--     is free and never counts toward the committed number; the missed lead still counts as Delivered.
--
-- Storage conventions (shared with the WhatsApp / W13 automation):
--     replacements.reason       'no_show'        | 'uncontactable'                (the existing CHECK already allows both)
--     replacements.reason_code  'schedule3_proof' | 'schedule3_proof_unreachable'
--     outcomes.outcome          'no_show'        | 'unreachable'
--     lead_activities.activity_type 'noshow_proof_sent' | 'unreachable_proof_sent'   (no CHECK on activity_type exists in the
--                                                       migration chain, so nothing to widen)
--     proof file                broker-media/<broker_id>/noshow-proof/<booking_id>-<noshow|unreachable>-<ts>.<ext>
--                               (the folder is the same for both kinds: the storage policy and this function check it)
--
-- Additive and idempotent. Re-running converges. Nothing is dropped.

BEGIN;

-- 1. The request: one call = outcome + proof + request, as the signed-in broker. Same checks, same order as
--    smc_request_noshow_replacement (smc_20): ownership, proof path, too_early, too_late, then the shared weekly maximum.
CREATE OR REPLACE FUNCTION public.smc_request_replacement(p_booking_id uuid, p_proof_path text, p_kind text DEFAULT 'no_show')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_broker   uuid := public.smc_current_broker_id();
  a          public.appointments%rowtype;
  v_outcome  uuid;
  v_used     integer;
  v_id       uuid;
  v_reason   text;
  v_code     text;
  v_activity text;
BEGIN
  IF v_broker IS NULL THEN RAISE EXCEPTION 'not a SortMyCover broker' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('no_show', 'unreachable') THEN
    RAISE EXCEPTION 'unknown request kind' USING ERRCODE = '22023';
  END IF;
  v_reason   := CASE p_kind WHEN 'unreachable' THEN 'uncontactable' ELSE 'no_show' END;
  v_code     := CASE p_kind WHEN 'unreachable' THEN 'schedule3_proof_unreachable' ELSE 'schedule3_proof' END;
  v_activity := CASE p_kind WHEN 'unreachable' THEN 'unreachable_proof_sent' ELSE 'noshow_proof_sent' END;

  SELECT * INTO a FROM public.appointments WHERE id = p_booking_id AND broker_id = v_broker AND brand_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0002'; END IF;
  IF p_proof_path IS NULL OR p_proof_path NOT LIKE v_broker::text || '/noshow-proof/%' THEN
    RAISE EXCEPTION 'proof missing' USING ERRCODE = '22023';
  END IF;
  IF now() < a.appointment_date + interval '10 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_early', 'kind', p_kind);
  END IF;
  IF now() > a.appointment_date + interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_late', 'kind', p_kind);   -- Schedule 3.4: the lead stands as Delivered
  END IF;

  -- Serialise this broker's requests for the Calendar Week (same lock key as the W13 WhatsApp path), so the count is exact.
  PERFORM pg_advisory_xact_lock(hashtext('w13:week:' || v_broker::text || ':' || public.smc_week_start(a.appointment_date)::text));

  -- One request per missed appointment, whatever its kind or outcome.
  IF EXISTS (SELECT 1 FROM public.replacements r WHERE r.booking_id = a.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_requested', 'kind', p_kind);
  END IF;

  -- ONE counter for both kinds: every replacements row of this broker in this Calendar Week, whatever its reason or status.
  SELECT count(*) INTO v_used FROM public.replacements r
   WHERE r.broker_id = v_broker
     AND public.smc_week_start(coalesce(r.missed_start_at, r.claimed_at)) = public.smc_week_start(a.appointment_date);
  IF v_used >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'weekly_max', 'used', v_used, 'max', 3, 'kind', p_kind);
  END IF;

  INSERT INTO public.outcomes (booking_id, lead_id, broker_id, cycle_id, brand_id, outcome, marked_by, marked_via, marked_at)
  VALUES (a.id, a.client_id, a.broker_id, a.cycle_id, a.brand_id, p_kind, auth.uid(), 'portal', now())
  ON CONFLICT (booking_id) DO UPDATE SET outcome = p_kind, marked_via = 'portal', marked_at = now(),
                                         unconfirmed = false, auto_marked = false, updated_at = now()
    WHERE public.outcomes.dispute_status = 'none'
  RETURNING id INTO v_outcome;
  IF v_outcome IS NULL THEN SELECT id INTO v_outcome FROM public.outcomes WHERE booking_id = a.id; END IF;

  INSERT INTO public.replacements (lead_id, outcome_id, cycle_id, broker_id, brand_id, reason, reason_code,
                                   booking_id, missed_start_at, proof_path, proof_sent_at, status)
  VALUES (a.client_id, v_outcome, a.cycle_id, a.broker_id, a.brand_id, v_reason, v_code,
          a.id, a.appointment_date, p_proof_path, now(), 'due')
  RETURNING id INTO v_id;

  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (a.client_id, a.brand_id, a.broker_id, a.cycle_id, 'portal', 'broker', v_activity,
          jsonb_build_object('booking_id', a.id, 'replacement_id', v_id, 'kind', p_kind), now(),
          'portal:' || CASE p_kind WHEN 'unreachable' THEN 'unreachable_proof' ELSE 'noshow_proof' END || ':' || a.id::text)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'replacement_id', v_id, 'used', v_used + 1, 'max', 3, 'kind', p_kind);
EXCEPTION WHEN unique_violation THEN
  -- replacements_one_per_lead (smc_02): the lead already has a live replacement request.
  RETURN jsonb_build_object('ok', false, 'reason', 'already_requested', 'kind', p_kind);
END $$;
REVOKE ALL ON FUNCTION public.smc_request_replacement(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_request_replacement(uuid, text, text) TO authenticated;
COMMENT ON FUNCTION public.smc_request_replacement(uuid, text, text) IS 'SMC clause 7 + Schedule 3: a broker asks for a goodwill replacement after a no-show (p_kind no_show) or a lead they could not reach (unreachable). Same window (start + 10 .. 30 min) and ONE weekly counter (max 3 per Calendar Week, every request row counts). Records the answer, the proof path and the request. Returns jsonb {ok, reason?, used?, max?, replacement_id?, kind}.';

-- 2. The smc_20 function stays callable (older portal builds, the WhatsApp path): now a thin wrapper for the no-show kind.
CREATE OR REPLACE FUNCTION public.smc_request_noshow_replacement(p_booking_id uuid, p_proof_path text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public.smc_request_replacement(p_booking_id, p_proof_path, 'no_show');
END $$;
REVOKE ALL ON FUNCTION public.smc_request_noshow_replacement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_request_noshow_replacement(uuid, text) TO authenticated;

-- 3. The old per-cycle cap is history. Nothing reads these columns to limit anything any more.
COMMENT ON COLUMN public.pricing.replacement_cap_cycle IS 'LEGACY (0.1 per-cycle cap, Bronze 4 / Silver 6 / Gold 9): kept for history, drives nothing. Goodwill replacements are max 3 requests per Calendar Week on every plan, no-shows and unreachable leads together (agreement clause 7.2).';
COMMENT ON COLUMN public.cycles.replacement_cap IS 'LEGACY (0.1 per-cycle cap): kept for history, drives nothing. Goodwill replacements are max 3 requests per Calendar Week on every plan, no-shows and unreachable leads together (agreement clause 7.2).';
COMMENT ON COLUMN public.v_cycle_progress.replacement_cap IS 'LEGACY per-cycle cap (history only, drives nothing). Use replacement_requests_this_week / replacement_weekly_max (clause 7.2).';
COMMENT ON COLUMN public.v_cycle_progress.replacements_used IS 'LEGACY per-cycle count (history only). The limit is per Calendar Week: replacement_requests_this_week of replacement_weekly_max.';
COMMENT ON COLUMN public.replacements.reason IS 'no_show = the consumer did not attend (Schedule 3). uncontactable = the broker could not reach the consumer (outcome kind unreachable, Schedule 3 proof of at least 2 attempts, or a wrong or invalid number). disqualified is not used by the portal. Never "did not buy". Both requestable reasons share ONE weekly counter of 3 (clause 7.2).';
COMMENT ON COLUMN public.replacements.reason_code IS 'schedule3_proof (no-show request with proof) | schedule3_proof_unreachable (could-not-reach request with proof); older rows may hold a disposition or Schedule C reference.';

COMMIT;
