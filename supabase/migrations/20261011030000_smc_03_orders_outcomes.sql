-- =============================================================================
-- 20261011030000_smc_03_orders_outcomes.sql  --  CRM nurture chain, file 3 of 8: capacity from the CRM's lead_orders,
-- meeting outcomes and goodwill replacements. Replaces the cycles / pricing / per-cycle-cap design of the original chain.
--
-- Capacity rule (Jonathan, 2026-10-11): a broker is eligible for SortMyCover leads only while he has a lead_orders row for
-- SortMyCover (lead_orders.brand_id = SMC) that is PAID and not yet fully delivered, counted through lead_order_items.
-- Routing attaches every delivered lead to that order (one lead_order_items row), so the order, the broker's existing
-- order pipeline (broker_get_pipeline / get_order_leads) and admin_list_orders_activity show the SortMyCover leads with no
-- new UI. The attach is enforced HERE, in the database (triggers on leads), so W01, capture v2 (tier-B accept) and a manual
-- admin routing all behave the same, and two concurrent leads can never overfill an order.
--   capacity  = lead_orders.lead_count + approved goodwill replacements on that order
--   delivered = lead_order_items rows of that order
--   open      = status 'paid' AND delivered < capacity
-- The existing order RPCs, contracts, Paystack reference, admin_mark_order_paid and invoicing are untouched.
--
-- Replacements (agreed rule, agreement clause 7 / Schedule 3): goodwill only, for a NO-SHOW or a lead the broker could not
-- reach (UNREACHABLE); at most 3 requests per broker per Calendar Week (Mon 00:00 - Sun 23:59 SAST, by the date of the missed
-- appointment); every request row counts, decided or not; never "didn't buy", never per order or per cycle. An approved
-- replacement adds one to the capacity of the order the missed lead was delivered on, so the broker receives one more lead.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. lead_orders: which orders are SortMyCover orders. NULL = every existing CRM order (the two Discovery orders stay NULL).
--    Set by an admin when the SortMyCover order is created (the CRM order form has no brand field yet: CRM-NURTURE-SCHEMA.md).
-- -----------------------------------------------------------------------------
ALTER TABLE public.lead_orders ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
CREATE INDEX IF NOT EXISTS lead_orders_smc_open_idx ON public.lead_orders (broker_id, paid_at) WHERE brand_id IS NOT NULL;
COMMENT ON COLUMN public.lead_orders.brand_id IS 'SMC: brands.id for a SortMyCover lead order (consumer leads routed by the WhatsApp nurture flow). NULL = a CRM order as before.';

-- -----------------------------------------------------------------------------
-- 2. outcomes: one per booking (attended / no-show / unreachable / rescheduled / broker no-show). W12 owns it.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'smc_disposition_code') THEN
    CREATE TYPE public.smc_disposition_code AS ENUM
      ('fit_proceeding','fit_followup','nofit_budget','nofit_covered','nofit_criteria','unreachable');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.outcomes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  lead_id              uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id            uuid NOT NULL REFERENCES public.brokers(id),
  brand_id             uuid NOT NULL REFERENCES public.brands(id),
  outcome              text NOT NULL CONSTRAINT outcomes_outcome_kind_check
                         CHECK (outcome IN ('attended','no_show','unreachable','rescheduled','broker_no_show')),
  disposition_code     public.smc_disposition_code,   -- retired by agreement clause 8.4; W12 still reads it, nothing new writes it
  quality_score        smallint CHECK (quality_score BETWEEN 1 AND 5),
  voice_note_url       text,
  transcript           text,
  summary              text,
  lead_reach_check     text CHECK (lead_reach_check IN ('yes','no','none')),
  marked_by            uuid REFERENCES auth.users(id),
  marked_via           text CHECK (marked_via IN ('whatsapp','portal','console','auto')),
  marked_at            timestamptz NOT NULL DEFAULT now(),
  auto_marked          boolean NOT NULL DEFAULT false,
  unconfirmed          boolean NOT NULL DEFAULT false,
  dispute_status       text NOT NULL DEFAULT 'none' CHECK (dispute_status IN ('none','open','upheld','rejected')),
  -- the agreed replacement triggers only: a no-show or a lead the broker could not reach
  replacement_eligible boolean GENERATED ALWAYS AS (
                         outcome IN ('no_show','unreachable')
                         OR disposition_code = 'unreachable'::public.smc_disposition_code) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT auto_marked OR (outcome = 'attended' AND unconfirmed))
);
CREATE INDEX IF NOT EXISTS outcomes_broker_idx ON public.outcomes (broker_id, marked_at);
CREATE INDEX IF NOT EXISTS outcomes_lead_idx ON public.outcomes (lead_id);
COMMENT ON TABLE public.outcomes IS 'SMC: one outcome per booking (W12, portal). replacement_eligible = no_show or unreachable (agreed rule).';

-- -----------------------------------------------------------------------------
-- 3. replacements: goodwill requests (W13 is the one workflow writer; the portal writes through smc_request_replacement)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.replacements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,          -- the missed lead
  lead_order_id          uuid REFERENCES public.lead_orders(id) ON DELETE SET NULL,            -- the order it was delivered on
  outcome_id             uuid REFERENCES public.outcomes(id) ON DELETE SET NULL,
  booking_id             uuid REFERENCES public.appointments(id) ON DELETE SET NULL,           -- the missed appointment
  broker_id              uuid NOT NULL REFERENCES public.brokers(id),
  brand_id               uuid NOT NULL REFERENCES public.brands(id),
  reason                 text NOT NULL CHECK (reason IN ('no_show','uncontactable')),          -- never "didn't buy"
  reason_code            text,
  missed_start_at        timestamptz,                -- start of the missed appointment: the Calendar Week it counts in
  proof_path             text,                       -- broker-media/<broker_id>/noshow-proof/... (portal requests)
  proof_sent_at          timestamptz,
  claimed_at             timestamptz NOT NULL DEFAULT now(),
  dispute_window_ends_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  status                 text NOT NULL DEFAULT 'due' CHECK (status IN ('due','disputed','approved','rejected','fulfilled')),
  cap_position           integer,                    -- nth request of this broker in the Calendar Week (trigger)
  over_cap               boolean NOT NULL DEFAULT false,
  decided_by             uuid REFERENCES auth.users(id),
  decided_at             timestamptz,
  note                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS replacements_one_per_lead ON public.replacements (lead_id) WHERE status <> 'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS replacements_one_per_booking ON public.replacements (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS replacements_broker_week_idx ON public.replacements (broker_id, missed_start_at);
CREATE INDEX IF NOT EXISTS replacements_order_idx ON public.replacements (lead_order_id, status);
COMMENT ON TABLE public.replacements IS 'SMC: goodwill replacement requests. Max 3 per broker per Calendar Week (SAST), no-shows and unreachable together. An approved row adds 1 to its lead_order capacity.';

-- SAST Calendar Week start (Monday 00:00 Africa/Johannesburg) for a timestamp.
CREATE OR REPLACE FUNCTION public.smc_week_start(p_ts timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT (date_trunc('week', p_ts AT TIME ZONE 'Africa/Johannesburg')) AT TIME ZONE 'Africa/Johannesburg' $$;

-- Stamps the request's position in its Calendar Week. over_cap rows are kept (never silently lost); both writers refuse a
-- 4th request before inserting, so over_cap only shows a manual/console insert past the limit.
CREATE OR REPLACE FUNCTION public.smc_replacements_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
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
DROP TRIGGER IF EXISTS smc_replacements_cap ON public.replacements;
CREATE TRIGGER smc_replacements_cap
  BEFORE INSERT ON public.replacements
  FOR EACH ROW EXECUTE FUNCTION public.smc_replacements_cap();

-- -----------------------------------------------------------------------------
-- 4. Capacity: which open SortMyCover order a lead attaches to (locks the order row; one lead at a time per order)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_open_order_for(p_broker_id uuid, p_brand_id uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c      record;
  v_used integer;
  v_cap  integer;
BEGIN
  IF p_broker_id IS NULL OR p_brand_id IS NULL THEN RETURN NULL; END IF;
  -- lock-then-count is only exact in READ COMMITTED (each statement takes a fresh snapshot). Under REPEATABLE READ /
  -- SERIALIZABLE the count would use the transaction snapshot and could overfill an order: refuse instead.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'smc: route SortMyCover leads in READ COMMITTED (this session is %)', current_setting('transaction_isolation') USING ERRCODE = '25001';
  END IF;
  FOR c IN SELECT o.id FROM public.lead_orders o
            WHERE o.broker_id = p_broker_id AND o.brand_id = p_brand_id AND o.status = 'paid'
            ORDER BY o.paid_at NULLS LAST, o.created_at, o.id
  LOOP
    -- lock first, count after the lock (each statement sees rows committed by the transaction that held the lock before us)
    PERFORM 1 FROM public.lead_orders o WHERE o.id = c.id AND o.status = 'paid' FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT count(*) INTO v_used FROM public.lead_order_items i WHERE i.order_id = c.id;
    SELECT coalesce(o.lead_count, 0)
           + (SELECT count(*) FROM public.replacements r WHERE r.lead_order_id = o.id AND r.status IN ('approved','fulfilled'))
      INTO v_cap FROM public.lead_orders o WHERE o.id = c.id;
    IF v_used < v_cap THEN
      RETURN c.id;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
COMMENT ON FUNCTION public.smc_open_order_for(uuid, uuid) IS
  'SMC: the oldest paid SortMyCover lead_orders row of this broker that still has room (lead_count + approved replacements > lead_order_items), locked FOR UPDATE; NULL = none. READ COMMITTED only. Used by the routing triggers.';

-- "Routed for SortMyCover" changes when broker_id changes, or when an admin turns a lead with a broker into a SortMyCover lead.
-- BEFORE: a SortMyCover lead may only be routed to a broker with an open order. First routing without one is HELD
-- (broker cleared, routing_reason held_no_open_order: the lead is stored, not handed over, not messaged). A re-route of an
-- already-routed lead (or turning a routed legacy lead into a SortMyCover lead) to a broker without room is refused with an
-- error (an explicit admin action).
CREATE OR REPLACE FUNCTION public.smc_leads_route_check()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.brand_id IS NULL OR NEW.broker_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.broker_id IS NOT DISTINCT FROM OLD.broker_id AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.lead_order_items i JOIN public.lead_orders o ON o.id = i.order_id
                                   WHERE i.lead_id = NEW.id AND o.brand_id IS NOT NULL AND o.broker_id = NEW.broker_id) THEN
    RETURN NEW;   -- already delivered on one of this broker's orders
  END IF;
  IF public.smc_open_order_for(NEW.broker_id, NEW.brand_id) IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.broker_id IS NOT NULL THEN
    RAISE EXCEPTION 'smc: broker % has no open paid SortMyCover lead order; routing refused', NEW.broker_id USING ERRCODE = '23514';
  END IF;
  NEW.broker_id      := NULL;
  NEW.routed_at      := NULL;
  NEW.routing_reason := 'held_no_open_order';
  IF NEW.delivered IS TRUE THEN NEW.delivered := false; END IF;
  RETURN NEW;
END $$;

-- AFTER: keep lead_order_items in step with leads.broker_id for SortMyCover leads.
--   * broker changed (to another broker or to none): the lead leaves the previous broker's SortMyCover order first (no
--     double delivery, the capacity goes back, the previous broker loses the contact details through the order RPCs);
--   * routed: attach to the open order (one lead_order_items row; the CRM pipeline stage starts at 'New'), stamp the timeline;
--   * held: a routing_held timeline row.
CREATE OR REPLACE FUNCTION public.smc_leads_attach_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order uuid;
BEGIN
  IF NEW.brand_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.broker_id IS NOT NULL AND NEW.broker_id IS DISTINCT FROM OLD.broker_id THEN
    DELETE FROM public.lead_order_items i USING public.lead_orders o
     WHERE i.order_id = o.id AND i.lead_id = NEW.id AND o.brand_id IS NOT NULL AND o.broker_id = OLD.broker_id;
  END IF;
  IF NEW.broker_id IS NULL THEN
    IF NEW.routing_reason = 'held_no_open_order' AND (TG_OP = 'INSERT' OR OLD.routing_reason IS DISTINCT FROM NEW.routing_reason) THEN
      INSERT INTO public.lead_activities (lead_id, brand_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
      VALUES (NEW.id, NEW.brand_id, 'system', 'routing_held', jsonb_build_object('reason', 'held_no_open_order'), now(),
              'order:held:' || NEW.id::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_order_items i JOIN public.lead_orders o ON o.id = i.order_id
              WHERE i.lead_id = NEW.id AND o.brand_id IS NOT NULL AND o.broker_id = NEW.broker_id) THEN
    RETURN NULL;   -- already on one of this broker's SortMyCover orders
  END IF;
  v_order := public.smc_open_order_for(NEW.broker_id, NEW.brand_id);
  IF v_order IS NULL THEN
    -- only reachable when several SortMyCover leads are routed in ONE statement past the order's room: refuse, never overfill
    RAISE EXCEPTION 'smc: lead order of broker % filled within this statement; route leads one at a time', NEW.broker_id USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.lead_order_items (order_id, lead_id) VALUES (v_order, NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (NEW.id, NEW.brand_id, NEW.broker_id, 'system', 'order_attached', jsonb_build_object('lead_order_id', v_order), now(),
          'order:attach:' || NEW.id::text || ':' || v_order::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS smc_leads_route_check ON public.leads;
CREATE TRIGGER smc_leads_route_check
  BEFORE INSERT OR UPDATE OF broker_id, brand_id ON public.leads
  FOR EACH ROW WHEN (NEW.brand_id IS NOT NULL) EXECUTE FUNCTION public.smc_leads_route_check();
DROP TRIGGER IF EXISTS smc_leads_attach_order ON public.leads;
CREATE TRIGGER smc_leads_attach_order
  AFTER INSERT OR UPDATE OF broker_id, brand_id ON public.leads
  FOR EACH ROW WHEN (NEW.brand_id IS NOT NULL) EXECUTE FUNCTION public.smc_leads_attach_order();

-- -----------------------------------------------------------------------------
-- 5. smc_order_capacity: one row per SortMyCover order (routing context, portal, console). RLS of the base tables applies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.smc_order_capacity WITH (security_invoker = true) AS
SELECT o.id AS lead_order_id, o.broker_id, o.brand_id, o.title, o.status, coalesce(o.lead_count, 0) AS lead_count,
       o.paid_at, o.created_at,
       x.attached,
       x.replacements_approved,
       coalesce(o.lead_count, 0) + x.replacements_approved                                    AS capacity,
       greatest(0, coalesce(o.lead_count, 0) + x.replacements_approved - x.attached)          AS remaining,
       greatest(0, x.attached - x.replacements_approved)                                      AS counted_toward_order,
       (o.status = 'paid' AND coalesce(o.lead_count, 0) + x.replacements_approved > x.attached) AS open,
       x.replacement_requests_this_week,
       3                                                                                       AS replacement_weekly_max
FROM public.lead_orders o
CROSS JOIN LATERAL (
  SELECT (SELECT count(*) FROM public.lead_order_items i WHERE i.order_id = o.id)::int AS attached,
         (SELECT count(*) FROM public.replacements r WHERE r.lead_order_id = o.id AND r.status IN ('approved','fulfilled'))::int AS replacements_approved,
         (SELECT count(*) FROM public.replacements r
           WHERE r.broker_id = o.broker_id
             AND public.smc_week_start(coalesce(r.missed_start_at, r.claimed_at)) = public.smc_week_start(now()))::int AS replacement_requests_this_week
) x
WHERE o.brand_id IS NOT NULL;
COMMENT ON VIEW public.smc_order_capacity IS
  'SMC: SortMyCover lead orders: attached (lead_order_items), capacity (lead_count + approved replacements), remaining, open, and the broker''s replacement requests this Calendar Week (max 3).';

-- -----------------------------------------------------------------------------
-- 6. The broker's replacement request from the portal (one call = outcome + proof + request, as the signed-in broker).
--    W13 (WhatsApp path, n8n_app) reproduces the same checks and the same advisory-lock key.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_request_replacement(p_booking_id uuid, p_proof_path text, p_kind text DEFAULT 'no_show')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_broker   uuid := public.smc_current_broker_id();
  a          public.appointments%rowtype;
  v_order    uuid;
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
  IF a.status NOT IN ('booked','confirmed','no_show') THEN   -- a cancelled / moved / attended meeting is never a missed one
    RETURN jsonb_build_object('ok', false, 'reason', 'booking_not_live', 'kind', p_kind);
  END IF;
  IF EXISTS (SELECT 1 FROM public.outcomes o WHERE o.booking_id = a.id AND o.dispute_status <> 'none') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outcome_disputed', 'kind', p_kind);
  END IF;
  IF p_proof_path IS NULL OR p_proof_path NOT LIKE v_broker::text || '/noshow-proof/%'
     OR p_proof_path ~ '(\.\./|//|\\)' THEN   -- no path traversal
    RAISE EXCEPTION 'proof missing' USING ERRCODE = '22023';
  END IF;
  -- the proof file must really be in the private bucket (uploaded by the broker under his own folder)
  IF to_regclass('storage.objects') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'broker-media' AND so.name = p_proof_path) THEN
    RAISE EXCEPTION 'proof missing' USING ERRCODE = '22023';
  END IF;
  IF now() < a.appointment_date + interval '10 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_early', 'kind', p_kind);
  END IF;
  IF now() > a.appointment_date + interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_late', 'kind', p_kind);   -- Schedule 3.4: the lead stands as delivered
  END IF;

  -- Serialise this broker's requests for the Calendar Week. Key = SAST week start rendered in UTC, identical in every session
  -- (W13 uses the same expression: automation/lib/w13.mjs weekLockKey).
  PERFORM pg_advisory_xact_lock(hashtextextended('w13:week:' || v_broker::text || ':' || to_char(public.smc_week_start(a.appointment_date) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'), 0));

  IF EXISTS (SELECT 1 FROM public.replacements r WHERE r.booking_id = a.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_requested', 'kind', p_kind);
  END IF;
  SELECT count(*) INTO v_used FROM public.replacements r
   WHERE r.broker_id = v_broker
     AND public.smc_week_start(coalesce(r.missed_start_at, r.claimed_at)) = public.smc_week_start(a.appointment_date);
  IF v_used >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'weekly_max', 'used', v_used, 'max', 3, 'kind', p_kind);
  END IF;
  SELECT i.order_id INTO v_order FROM public.lead_order_items i JOIN public.lead_orders o ON o.id = i.order_id
   WHERE i.lead_id = a.client_id AND o.brand_id IS NOT NULL AND o.broker_id = v_broker LIMIT 1;
  IF v_order IS NULL THEN   -- the missed lead was never delivered on one of his SortMyCover orders: nothing to replace
    RETURN jsonb_build_object('ok', false, 'reason', 'not_on_a_lead_order', 'kind', p_kind);
  END IF;

  INSERT INTO public.outcomes (booking_id, lead_id, broker_id, brand_id, outcome, marked_by, marked_via, marked_at)
  VALUES (a.id, a.client_id, a.broker_id, a.brand_id, p_kind, auth.uid(), 'portal', now())
  ON CONFLICT (booking_id) DO UPDATE SET outcome = p_kind, marked_via = 'portal', marked_at = now(),
                                         unconfirmed = false, auto_marked = false, updated_at = now()
    WHERE public.outcomes.dispute_status = 'none'
  RETURNING id INTO v_outcome;
  IF v_outcome IS NULL THEN SELECT id INTO v_outcome FROM public.outcomes WHERE booking_id = a.id; END IF;

  INSERT INTO public.replacements (lead_id, lead_order_id, outcome_id, booking_id, broker_id, brand_id, reason, reason_code,
                                   missed_start_at, proof_path, proof_sent_at, status)
  VALUES (a.client_id, v_order, v_outcome, a.id, a.broker_id, a.brand_id, v_reason, v_code,
          a.appointment_date, p_proof_path, now(), 'due')
  RETURNING id INTO v_id;

  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (a.client_id, a.brand_id, a.broker_id, 'portal', 'broker', v_activity,
          jsonb_build_object('booking_id', a.id, 'replacement_id', v_id, 'kind', p_kind, 'lead_order_id', v_order), now(),
          'portal:' || CASE p_kind WHEN 'unreachable' THEN 'unreachable_proof' ELSE 'noshow_proof' END || ':' || a.id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'replacement_id', v_id, 'used', v_used + 1, 'max', 3, 'kind', p_kind);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'already_requested', 'kind', p_kind);
END $$;
COMMENT ON FUNCTION public.smc_request_replacement(uuid, text, text) IS
  'SMC: a broker asks for a goodwill replacement after a no-show (no_show) or a lead he could not reach (unreachable). Window start+10..30 min, max 3 per Calendar Week. Returns jsonb {ok, reason?, used?, max?, replacement_id?, kind}.';

-- Older portal builds call the no-show-only name.
CREATE OR REPLACE FUNCTION public.smc_request_noshow_replacement(p_booking_id uuid, p_proof_path text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public.smc_request_replacement(p_booking_id, p_proof_path, 'no_show');
END $$;

-- -----------------------------------------------------------------------------
-- 7. updated_at + audit, and fail closed until file 05
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.outcomes','public.replacements'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_touch_updated_at ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.smc_audit()', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', t);
  END LOOP;
  EXECUTE 'REVOKE ALL ON public.smc_order_capacity FROM PUBLIC, anon, authenticated';
  -- SortMyCover order changes are audited like the other brand rows (legacy orders keep today's behaviour: brand_id NULL)
  EXECUTE 'DROP TRIGGER IF EXISTS smc_audit ON public.lead_orders';
  EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON public.lead_orders FOR EACH ROW EXECUTE FUNCTION public.smc_audit(%L)', 'brand_scoped');
END $$;
REVOKE ALL ON FUNCTION public.smc_open_order_for(uuid, uuid), public.smc_leads_route_check(), public.smc_leads_attach_order(),
                       public.smc_replacements_cap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smc_request_replacement(uuid, text, text), public.smc_request_noshow_replacement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_request_replacement(uuid, text, text), public.smc_request_noshow_replacement(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_week_start(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_week_start(timestamptz) TO authenticated;
