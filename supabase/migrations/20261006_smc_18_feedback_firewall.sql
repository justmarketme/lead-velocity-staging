-- 20261006_smc_18_feedback_firewall.sql  —  SortMyCover broker portal, UX sprint 1 (crm-ux-synthesis.md §0, S1/S3/S4).
-- NOT APPLIED. DDL on this project is user-gated: Jonathan applies it (npm run / SQL editor) after review.
-- The portal is written to work before AND after this file is applied (see deliverables/product/ux-sprint-1-notes.md).
--
-- Why (Lead Generation Services Agreement, deliverables/contracts-drafter/lead-generation-agreement/):
--   * clause 8.4 feedback firewall: broker feedback = attended / could be contacted ONLY. New outcome kind
--     'unreachable' ("Couldn't reach them"). No column is dropped: disposition_code, quality_score, voice_note_url,
--     transcript, summary, brokers.close_rate, cycles.policies_written_reported stay in the schema but nothing
--     writes them any more (v_cycle_progress.good_fit is left as is until the W14 report is reworked; see below).
--   * clause 5.2 / Schedule 2: a Qualified Lead is Delivered when the consumer consented, self-declared the criteria
--     and confirmed a booked appointment (WhatsApp log). New column v_cycle_progress.delivered. `verified` (the old
--     "replied within 72 h" rule) is kept unchanged for the W14 consistency checks that still read it.
--   * clause 7 + Schedule 3: replacements are goodwill, no-shows only, at most 3 requests per Calendar Week
--     (Mon 00:00 – Sun 23:59 SAST, counted by the date of the missed appointment), proof sent between start + 10 min
--     and start + 30 min. New RPC smc_request_noshow_replacement(); the cap trigger counts per week, not per cycle.
--
-- Additive and idempotent. Re-running converges.

BEGIN;

-- 1. outcomes.outcome: + 'unreachable' (clause 8.4 "could be contacted")
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.outcomes'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%broker_no_show%' AND pg_get_constraintdef(oid) NOT LIKE '%unreachable%'
  LOOP
    EXECUTE format('ALTER TABLE public.outcomes DROP CONSTRAINT %I', c);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outcomes'::regclass AND conname = 'outcomes_outcome_kind_check') THEN
    ALTER TABLE public.outcomes ADD CONSTRAINT outcomes_outcome_kind_check
      CHECK (outcome IN ('attended','no_show','unreachable','rescheduled','broker_no_show'));
  END IF;
END $$;
COMMENT ON COLUMN public.outcomes.disposition_code IS 'RETIRED 2026-10-06 (agreement clause 8.4). Not written by the portal or WhatsApp. Kept for history only.';
COMMENT ON COLUMN public.outcomes.quality_score    IS 'RETIRED 2026-10-06 (agreement clause 8.4). Not written by the portal or WhatsApp. Kept for history only.';
COMMENT ON COLUMN public.brokers.close_rate        IS 'RETIRED 2026-10-06 (agreement clause 8.4). Not collected. Kept for history only.';
COMMENT ON COLUMN public.cycles.policies_written_reported IS 'RETIRED 2026-10-06 (agreement clause 8.4). Not collected. Kept for history only.';

-- 2. replacements: proof (Schedule 3) + the missed appointment the request is about (weekly count, clause 7.2)
ALTER TABLE public.replacements
  ADD COLUMN IF NOT EXISTS booking_id      uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS missed_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_path      text,          -- broker-media/<broker_id>/noshow-proof/<booking_id>-<ts>.<ext>
  ADD COLUMN IF NOT EXISTS proof_sent_at   timestamptz;
CREATE INDEX IF NOT EXISTS replacements_broker_week_idx ON public.replacements (broker_id, missed_start_at);

-- SAST Calendar Week start (Monday 00:00 Africa/Johannesburg) for a timestamp.
CREATE OR REPLACE FUNCTION public.smc_week_start(p_ts timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE
AS $$ SELECT (date_trunc('week', p_ts AT TIME ZONE 'Africa/Johannesburg')) AT TIME ZONE 'Africa/Johannesburg' $$;

-- Cap = 3 requests per Calendar Week per broker (clause 7.2), replacing the per-cycle cap. over_cap rows are kept
-- (status stays 'due' for KG to reject) so nothing is silently lost; the RPC below refuses a 4th before it is written.
CREATE OR REPLACE FUNCTION public.smc_replacements_cap()
RETURNS trigger LANGUAGE plpgsql
AS $$
DECLARE
  v_week timestamptz := public.smc_week_start(coalesce(NEW.missed_start_at, NEW.claimed_at, now()));
  v_used integer;
BEGIN
  SELECT count(*) INTO v_used
    FROM public.replacements r
   WHERE r.broker_id = NEW.broker_id
     AND public.smc_week_start(coalesce(r.missed_start_at, r.claimed_at)) = v_week
     AND r.id <> NEW.id;
  NEW.cap_position := v_used + 1;
  NEW.over_cap := v_used + 1 > 3;
  RETURN NEW;
END $$;

-- 3. The broker's no-show request (portal; WhatsApp should call the same function). One call = proof + request.
CREATE OR REPLACE FUNCTION public.smc_request_noshow_replacement(p_booking_id uuid, p_proof_path text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  IF p_proof_path IS NULL OR p_proof_path NOT LIKE v_broker::text || '/noshow-proof/%' THEN
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
END $$;
REVOKE ALL ON FUNCTION public.smc_request_noshow_replacement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_request_noshow_replacement(uuid, text) TO authenticated;

-- 4. Retire the ROI write path (clause 8.4). Kept as a no-op that refuses, so an old client gets a clear error.
DO $$
BEGIN
  IF to_regprocedure('public.smc_report_policies_written(integer, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.smc_report_policies_written(integer, uuid) FROM authenticated;
  END IF;
END $$;

-- 5. v_cycle_progress: existing columns unchanged in name/order/type (CREATE OR REPLACE rule); new columns appended: delivered (clause 5.2), replacement_requests_this_week, replacement_weekly_max.
CREATE OR REPLACE VIEW public.v_cycle_progress WITH (security_invoker = true) AS
SELECT
  c.id                AS cycle_id,
  c.broker_id,
  c.brand_id,
  c.tier_code,
  c.cycle_no,
  c.status,
  c.starts_at,
  c.ends_at,
  c.extended_until,
  c.committed_leads   AS committed,
  (SELECT count(*) FROM public.leads l
    WHERE l.cycle_id = c.id AND l.verified_at IS NOT NULL AND l.qualified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.replacements rp
                       WHERE rp.replacement_lead_id = l.id AND rp.status <> 'rejected'))      AS verified,
  (SELECT count(DISTINCT a.client_id) FROM public.appointments a
    WHERE a.cycle_id = c.id AND a.brand_id IS NOT NULL
      AND a.status IN ('booked','confirmed','attended','no_show'))                            AS booked,
  (SELECT count(*) FROM public.outcomes o WHERE o.cycle_id = c.id AND o.outcome = 'attended') AS attended,
  -- good_fit: unchanged on purpose. Nothing writes disposition_code any more (clause 8.4), so it only reflects old
  -- rows; it stays because facts.w14_reconcile still checks the W14 one-liner against it. Retire both together in
  -- the W14 rework (ux-sprint-1 notes, follow-up F2). The portal does not read it.
  (SELECT count(*) FROM public.outcomes o
    WHERE o.cycle_id = c.id AND o.disposition_code IN ('fit_proceeding','fit_followup'))       AS good_fit,
  (SELECT count(*) FROM public.replacements r WHERE r.cycle_id = c.id AND r.status <> 'rejected') AS replacements_used,
  c.replacement_cap,
  greatest(0, ceil(extract(epoch FROM (coalesce(c.extended_until, c.ends_at) - now())) / 86400))::int AS days_left,
  -- clause 5.1/5.2 + Schedule 2: consented, self-declared criteria met, booked AND confirmed attendance
  -- (appointments.confirmed_at, or the W09 'booking_confirmed' WhatsApp log row, which survives a reschedule).
  -- Replacement leads never count (clause 7.4).
  (SELECT count(*) FROM public.leads l
    WHERE l.cycle_id = c.id AND l.brand_id IS NOT NULL
      AND l.consent_at IS NOT NULL AND l.qualified_at IS NOT NULL
      AND (EXISTS (SELECT 1 FROM public.appointments a WHERE a.client_id = l.id AND a.brand_id IS NOT NULL AND a.confirmed_at IS NOT NULL)
           OR EXISTS (SELECT 1 FROM public.lead_activities la WHERE la.lead_id = l.id AND la.activity_type = 'booking_confirmed'))
      AND NOT EXISTS (SELECT 1 FROM public.replacements rp
                       WHERE rp.replacement_lead_id = l.id AND rp.status <> 'rejected'))      AS delivered,
  (SELECT count(*) FROM public.replacements r
    WHERE r.broker_id = c.broker_id
      AND public.smc_week_start(coalesce(r.missed_start_at, r.claimed_at)) = public.smc_week_start(now())) AS replacement_requests_this_week,
  3                                                                                           AS replacement_weekly_max
FROM public.cycles c;
COMMENT ON VIEW public.v_cycle_progress IS 'SMC: this cycle. delivered = clause 5.2 (consent + self-declared criteria + confirmed booked appointment; replacement leads excluded). verified = legacy 72-h rule (W14 checks). good_fit: history only, nothing writes dispositions (clause 8.4). Replacement requests per Calendar Week (clause 7.2).';

COMMIT;
