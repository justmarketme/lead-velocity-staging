-- =============================================================================
-- 20261011030000_smc_03_orders_outcomes.sql  --  CRM nurture chain, file 3 of 8: capacity from the CRM's lead_orders,
-- meeting outcomes and goodwill replacements. Replaces the cycles / pricing / per-cycle-cap design of the original chain.
--
-- Capacity rule (Jonathan, 2026-10-11): a broker is eligible for SortMyCover leads only while he has a lead_orders row for
-- SortMyCover (lead_orders.brand_id = SMC) that is PAID and not yet full.
-- WHEN A LEAD COUNTS (Jonathan, 2026-10-11; agreement LGSA v0.3 clause 5.1(e) / 5.2 and Schedule 2 criterion 6 / S2.4): a
-- lead is Delivered and counts toward the broker's order at the moment it has a booked appointment with him AND has
-- confirmed it will attend (appointments.confirmed_at: the Confirm tap / reply, W09), never at hand-over. Three states on
-- the lead (leads.order_state), all enforced HERE in triggers so every path (W01, capture v2 tier-B accept, an admin) is
-- the same:
--   held     : routed with no room / broker not ready -> broker_id cleared, routing_reason held_*, nothing sent
--              (tier C = budget under R750: routed only to a broker with accepts_low_budget, or by an admin; else held_low_budget)
--   attached : routed to the broker; one place on his oldest open order is RESERVED (leads.lead_order_id), not counted;
--              the CRM pipeline does not show the lead yet (no lead_order_items row, no contact details unlocked)
--   counted  : booked + attendance confirmed -> one lead_order_items row (pipeline stage 'New'), the broker's existing order
--              pipeline (broker_get_pipeline / get_order_leads) and admin_list_orders_activity show it, contact details
--              unlocked (S2.4: the lead data goes to the Client at Delivery)
--   released : an attached lead that will not be delivered (opted out, disqualified, closed unbooked, re-routed, or its
--              meeting passed unconfirmed): the reservation goes back; a later booking + confirmation re-attaches if room
--   capacity  = lead_orders.lead_count + approved goodwill replacements on that order
--   in use    = counted (lead_order_items) + attached reservations
--   open      = status 'paid' AND in use < capacity
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

-- The lead's place on an order (2026-10-11, count at confirmed attendance). Nullable, no default: catalog-only on leads.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_order_id        uuid REFERENCES public.lead_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_state          text,
  ADD COLUMN IF NOT EXISTS order_attached_at    timestamptz,
  ADD COLUMN IF NOT EXISTS order_counted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS order_released_at    timestamptz,
  ADD COLUMN IF NOT EXISTS order_release_reason text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_smc_order_state_check' AND conrelid = 'public.leads'::regclass) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_smc_order_state_check CHECK (
          (order_state IS NULL OR order_state IN ('attached','counted','released'))
      AND (order_state IS DISTINCT FROM 'attached' OR lead_order_id IS NOT NULL)
      AND (order_state IS DISTINCT FROM 'counted'  OR (lead_order_id IS NOT NULL AND order_counted_at IS NOT NULL))
    ) NOT VALID;   -- new columns only (all NULL on the legacy rows)
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS leads_smc_order_reserved_idx ON public.leads (lead_order_id) WHERE order_state = 'attached';
COMMENT ON COLUMN public.leads.order_state IS 'SMC: attached (place reserved on lead_order_id) | counted (booked + attendance confirmed: Delivered, agreement 5.2; one lead_order_items row) | released. NULL = not routed / held / legacy.';

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
-- A broker can only be handed a SortMyCover lead when his intro card can be shown in full (FAIS disclosure): the same rule
-- as the brokers_smc_routing_ready CHECK (file 02), applied here too so an admin routing to a broker whose routing switch
-- is off still cannot introduce a lead to a broker without an FSP number.
CREATE OR REPLACE FUNCTION public.smc_broker_ready(p_broker_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.brokers b
                  WHERE b.id = p_broker_id
                    AND btrim(coalesce(b.fsp_number, '')) ~ '^[A-Za-z0-9 /-]{1,20}$' AND b.fsp_number ~ '[0-9]'
                    AND btrim(coalesce(b.firm_name, '')) <> ''
                    AND btrim(coalesce(b.contact_person, '')) <> ''
                    AND btrim(coalesce(b.intro_card_url, '')) ~ '^https://')
$$;
COMMENT ON FUNCTION public.smc_broker_ready(uuid) IS 'SMC: the broker''s FSP number, practice name, adviser name and intro card are present (broker_intro_booked can be sent in full). Same rule as brokers_smc_routing_ready.';

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
    -- in use = counted (lead_order_items) + places reserved by attached, not yet counted leads
    SELECT (SELECT count(*) FROM public.lead_order_items i WHERE i.order_id = c.id)
         + (SELECT count(*) FROM public.leads l WHERE l.lead_order_id = c.id AND l.order_state = 'attached')
      INTO v_used;
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
  'SMC: the oldest paid SortMyCover lead_orders row of this broker that still has room (lead_count + approved replacements > counted items + attached reservations), locked FOR UPDATE; NULL = none. READ COMMITTED only. Used by the routing and counting triggers.';

-- "Routed for SortMyCover" changes when broker_id changes, or when an admin turns a lead with a broker into a SortMyCover lead.
-- BEFORE: a SortMyCover lead may only be routed to a READY broker (smc_broker_ready: FSP number, practice, adviser, intro
-- card) with room on an open order. Then one place is RESERVED on his oldest open order (order_state attached): the lead is
-- not counted yet. First routing without a ready broker / room is HELD (broker cleared, routing_reason held_broker_not_ready
-- / held_no_open_order: stored, not handed over, not messaged). A re-route of an already-routed lead to a broker without
-- room or not ready is refused with an error (an explicit admin action). Leaving a broker releases a reservation.
-- The order row lock is taken before counting, and a row-level BEFORE trigger sees the rows earlier rows of the same
-- statement wrote, so neither concurrent routings nor one multi-row statement can reserve past the order's room.
-- TIER C (Jonathan, 2026-10-11): a lead whose budget is under R750 (budget_band lt750) is a lead like any other (stored,
-- counted in stats, the conversation goes on), but it is routed only to a broker with the standing yes
-- (brokers.accepts_low_budget: the agreement 5.7 offer is accepted at once) or by an admin (routing_reason
-- manual_low_budget: the admin records the broker's yes). Anything else holds it: broker cleared, routing_reason
-- held_low_budget, stage unchanged (not disqualified). An admin assignment that cannot go through (broker not ready, no room,
-- named consent for another practice) is refused with an error, so the lead stays held. A routed lead that is not introduced
-- yet (no first message) and not counted, whose budget moves under R750, is held the same way. The accept is recorded in
-- lead_offers by the AFTER trigger; the lead COUNTS only at booked + attendance confirmed (smc_count_on_confirm), exactly
-- like tiers A and B.
CREATE OR REPLACE FUNCTION public.smc_leads_route_check()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order  uuid;
  v_why    text;
  v_low    boolean := NEW.budget_band IS NOT DISTINCT FROM 'lt750';
  v_manual boolean := NEW.budget_band IS NOT DISTINCT FROM 'lt750' AND NEW.routing_reason IS NOT DISTINCT FROM 'manual_low_budget';
  v_b      record;
BEGIN
  IF NEW.brand_id IS NULL THEN RETURN NEW; END IF;
  -- the tier tag follows the band for tier C on every path (A / B are tagged by capture v2)
  IF v_low THEN NEW.lead_tier := 'C'; ELSIF NEW.lead_tier = 'C' THEN NEW.lead_tier := NULL; END IF;
  -- tier C: the budget moved under R750 on a routed lead that is not counted. His broker has the standing yes: the offer is
  -- accepted (recorded by the AFTER trigger). He has not and the lead is not introduced yet (no first message): hold it (the
  -- reservation goes back) instead of handing it over. Already introduced: it stays with him (leads_smc_checks).
  IF TG_OP = 'UPDATE' AND v_low AND NOT v_manual AND OLD.budget_band IS DISTINCT FROM 'lt750'
     AND NEW.broker_id IS NOT NULL AND NEW.broker_id IS NOT DISTINCT FROM OLD.broker_id AND NEW.order_state IS DISTINCT FROM 'counted'
     AND EXISTS (SELECT 1 FROM public.brokers b WHERE b.id = NEW.broker_id AND b.accepts_low_budget) THEN
    NEW.offer_status := 'accepted'; NEW.offer_broker_id := NEW.broker_id;
    NEW.offered_at := coalesce(NEW.offered_at, now()); NEW.offer_decided_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND v_low AND NOT v_manual AND OLD.budget_band IS DISTINCT FROM 'lt750'
     AND NEW.broker_id IS NOT NULL AND NEW.broker_id IS NOT DISTINCT FROM OLD.broker_id
     AND NEW.first_message_at IS NULL AND NEW.order_state IS DISTINCT FROM 'counted' THEN
    IF NEW.order_state = 'attached' THEN
      NEW.order_state := 'released'; NEW.order_released_at := now(); NEW.order_release_reason := 'low_budget';
    END IF;
    NEW.broker_id := NULL; NEW.routed_at := NULL; NEW.routing_reason := 'held_low_budget';
    IF NEW.delivered IS TRUE THEN NEW.delivered := false; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.broker_id IS NOT DISTINCT FROM OLD.broker_id AND NEW.brand_id IS NOT DISTINCT FROM OLD.brand_id THEN
    RETURN NEW;
  END IF;
  -- leaving a broker (un-route or re-route): a reservation goes back; a counted lead is detached by the AFTER trigger
  IF TG_OP = 'UPDATE' AND OLD.broker_id IS NOT NULL AND NEW.broker_id IS DISTINCT FROM OLD.broker_id AND NEW.order_state IN ('attached','counted') THEN
    NEW.order_state := 'released'; NEW.order_released_at := now(); NEW.order_release_reason := 'rerouted';
  END IF;
  IF NEW.broker_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (
       EXISTS (SELECT 1 FROM public.lead_order_items i JOIN public.lead_orders o ON o.id = i.order_id
                WHERE i.lead_id = NEW.id AND o.brand_id IS NOT NULL AND o.broker_id = NEW.broker_id)
    OR (NEW.order_state IN ('attached','counted') AND EXISTS (SELECT 1 FROM public.lead_orders o WHERE o.id = NEW.lead_order_id AND o.broker_id = NEW.broker_id))) THEN
    RETURN NEW;   -- already reserved / delivered on one of this broker's orders
  END IF;
  SELECT b.accepts_low_budget, b.firm_name, b.fsp_number INTO v_b FROM public.brokers b WHERE b.id = NEW.broker_id;
  IF NOT public.smc_broker_ready(NEW.broker_id) THEN
    v_why := 'held_broker_not_ready';
  ELSIF v_low AND NOT v_manual AND v_b.accepts_low_budget IS NOT TRUE THEN
    v_why := 'held_low_budget';
  ELSIF v_manual AND NEW.consent_mode IS NOT DISTINCT FROM 'named'
        AND position(coalesce(v_b.firm_name, '') || ' (FSP ' || coalesce(v_b.fsp_number, '') || ')' IN coalesce(NEW.consent_text, '')) = 0 THEN
    v_why := 'held_consent_names_other_practice';
  ELSE
    v_order := public.smc_open_order_for(NEW.broker_id, NEW.brand_id);
    IF v_order IS NULL THEN v_why := CASE WHEN v_low AND NOT v_manual THEN 'held_low_budget' ELSE 'held_no_open_order' END; END IF;
  END IF;
  IF v_order IS NOT NULL THEN
    NEW.lead_order_id := v_order; NEW.order_state := 'attached'; NEW.order_attached_at := now();
    NEW.order_counted_at := NULL; NEW.order_released_at := NULL; NEW.order_release_reason := NULL;
    IF v_low THEN   -- agreement 5.7: the tier-C offer is accepted (standing yes, or the admin's record of the broker's yes)
      NEW.offer_status := 'accepted'; NEW.offer_broker_id := NEW.broker_id;
      NEW.offered_at := coalesce(NEW.offered_at, now()); NEW.offer_decided_at := now();
      NEW.routed_at := coalesce(NEW.routed_at, now());   -- an admin assignment may write broker_id + routing_reason only
    END IF;
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.broker_id IS NOT NULL) OR v_manual THEN
    RAISE EXCEPTION 'smc: broker % %; routing refused', NEW.broker_id,
      CASE v_why WHEN 'held_broker_not_ready' THEN 'is not ready (FSP number, practice, adviser name and intro card are required)'
                 WHEN 'held_consent_names_other_practice' THEN 'is not the practice the lead consented to (named consent); the lead must consent again first'
                 WHEN 'held_low_budget' THEN 'does not take leads under R750 (brokers.accepts_low_budget is off)'
                 ELSE 'has no open paid SortMyCover lead order' END
      USING ERRCODE = '23514';
  END IF;
  NEW.broker_id      := NULL;
  NEW.routed_at      := NULL;
  NEW.routing_reason := v_why;
  IF NEW.delivered IS TRUE THEN NEW.delivered := false; END IF;
  RETURN NEW;
END $$;

-- AFTER: keep lead_order_items and the timeline in step for SortMyCover leads.
--   * broker changed (to another broker or to none): the lead leaves the previous broker's SortMyCover order (no double
--     delivery, the capacity goes back, the previous broker loses the contact details through the order RPCs);
--   * routed: an order_attached timeline row (reserved, NOT counted: no lead_order_items row until attendance is confirmed);
--   * held: a routing_held timeline row.
CREATE OR REPLACE FUNCTION public.smc_leads_attach_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.broker_id IS NOT NULL AND NEW.broker_id IS DISTINCT FROM OLD.broker_id THEN
    DELETE FROM public.lead_order_items i USING public.lead_orders o
     WHERE i.order_id = o.id AND i.lead_id = NEW.id AND o.brand_id IS NOT NULL AND o.broker_id = OLD.broker_id;
  END IF;
  IF NEW.broker_id IS NULL THEN
    IF NEW.routing_reason LIKE 'held_%' AND (TG_OP = 'INSERT' OR OLD.routing_reason IS DISTINCT FROM NEW.routing_reason) THEN
      INSERT INTO public.lead_activities (lead_id, brand_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
      VALUES (NEW.id, NEW.brand_id, 'system', 'routing_held', jsonb_build_object('reason', NEW.routing_reason), now(),
              'order:held:' || NEW.id::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NULL;
  END IF;
  -- tier C routed (standing yes or admin): the agreement 5.7 accept, recorded once per broker, and the hand-off signal the
  -- W01 low-budget sweep turns into the normal booking flow (W06 first touch: slots / Flow, email verify, Teams link).
  IF NEW.budget_band = 'lt750' AND NEW.order_state = 'attached'
     AND (TG_OP = 'INSERT' OR OLD.broker_id IS DISTINCT FROM NEW.broker_id OR OLD.budget_band IS DISTINCT FROM NEW.budget_band) THEN
    INSERT INTO public.lead_offers AS o (lead_id, broker_id, status, offered_at, expires_at, decided_at, decided_via)
    VALUES (NEW.id, NEW.broker_id, 'accepted', now(), now(), now(), CASE WHEN NEW.routing_reason = 'manual_low_budget' THEN 'admin' ELSE 'standing' END)
    ON CONFLICT (lead_id, broker_id) DO UPDATE SET status = 'accepted', decided_at = now(), decided_via = EXCLUDED.decided_via
      WHERE o.status <> 'accepted';
    INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
    VALUES (NEW.id, NEW.brand_id, NEW.broker_id, 'system', 'low_budget_accepted',
            jsonb_build_object('lead_tier', 'C', 'via', CASE WHEN NEW.routing_reason = 'manual_low_budget' THEN 'admin' ELSE 'standing' END,
                               'lead_order_id', NEW.lead_order_id, 'counted', false, 'counts_when', 'booked + attendance confirmed (agreement 5.2)'), now(),
            'lowbudget:accepted:' || NEW.id::text || ':' || NEW.broker_id::text)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  IF NEW.order_state = 'attached' AND (TG_OP = 'INSERT' OR OLD.lead_order_id IS DISTINCT FROM NEW.lead_order_id OR OLD.order_state IS DISTINCT FROM NEW.order_state) THEN
    INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
    VALUES (NEW.id, NEW.brand_id, NEW.broker_id, 'system', 'order_attached',
            jsonb_build_object('lead_order_id', NEW.lead_order_id, 'counted', false, 'counts_when', 'booked + attendance confirmed (agreement 5.2)'), now(),
            'order:attach:' || NEW.id::text || ':' || NEW.lead_order_id::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS smc_leads_route_check ON public.leads;
CREATE TRIGGER smc_leads_route_check
  BEFORE INSERT OR UPDATE OF broker_id, brand_id, budget_band ON public.leads
  FOR EACH ROW WHEN (NEW.brand_id IS NOT NULL) EXECUTE FUNCTION public.smc_leads_route_check();
DROP TRIGGER IF EXISTS smc_leads_attach_order ON public.leads;
CREATE TRIGGER smc_leads_attach_order
  AFTER INSERT OR UPDATE OF broker_id, brand_id, budget_band ON public.leads
  FOR EACH ROW WHEN (NEW.brand_id IS NOT NULL) EXECUTE FUNCTION public.smc_leads_attach_order();

-- A reservation that will not become a delivery is released: opt-out (STOP), disqualified, closed unbooked. (Re-routing is
-- handled above; a meeting that passed unconfirmed is released by the outcomes trigger below.) A counted lead stays counted.
CREATE OR REPLACE FUNCTION public.smc_leads_release_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_why text;
BEGIN
  IF NEW.order_state IS DISTINCT FROM 'attached' THEN RETURN NEW; END IF;
  IF NEW.opted_out_at IS NOT NULL AND OLD.opted_out_at IS NULL THEN v_why := 'opted_out';
  ELSIF NEW.stage IN ('disqualified','unbooked_closed','opted_out') AND NEW.stage IS DISTINCT FROM OLD.stage THEN v_why := NEW.stage;
  END IF;
  IF v_why IS NULL THEN RETURN NEW; END IF;
  NEW.order_state := 'released'; NEW.order_released_at := now(); NEW.order_release_reason := v_why;
  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (NEW.id, NEW.brand_id, NEW.broker_id, 'system', 'order_released', jsonb_build_object('lead_order_id', NEW.lead_order_id, 'reason', v_why), now(),
          'order:released:' || NEW.id::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_leads_release_reservation ON public.leads;
CREATE TRIGGER smc_leads_release_reservation
  BEFORE UPDATE OF opted_out_at, stage ON public.leads
  FOR EACH ROW WHEN (NEW.brand_id IS NOT NULL) EXECUTE FUNCTION public.smc_leads_release_reservation();

-- THE DELIVERY POINT (agreement 5.1(e) / 5.2 / S2.4): a live SortMyCover booking whose attendance the lead confirmed
-- (appointments.confirmed_at set: W09's Confirm tap or reply) counts the lead toward the broker's order, once: one
-- lead_order_items row (the CRM pipeline and contact details), leads.order_state counted + delivered, timeline order_counted.
-- The reserved place is used; a released lead re-attaches only if the broker still has room (else count_held_no_room).
-- A B-tier lead is only booked after the broker's Accept (capture v2), so it counts "because the Client accepted it".
CREATE OR REPLACE FUNCTION public.smc_count_on_confirm()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  l       public.leads%rowtype;
  v_order uuid;
BEGIN
  IF NEW.brand_id IS NULL OR NEW.confirmed_at IS NULL OR NEW.status NOT IN ('booked','confirmed') THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.confirmed_at IS NOT NULL AND OLD.status IN ('booked','confirmed') THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.leads WHERE id = NEW.client_id FOR UPDATE;
  IF NOT FOUND OR l.brand_id IS NULL OR l.opted_out_at IS NOT NULL OR l.order_state = 'counted' THEN RETURN NULL; END IF;
  IF l.broker_id IS DISTINCT FROM NEW.broker_id THEN RETURN NULL; END IF;   -- a booking with someone he is no longer routed to
  IF l.order_state = 'attached' AND l.lead_order_id IS NOT NULL THEN
    PERFORM 1 FROM public.lead_orders o WHERE o.id = l.lead_order_id FOR UPDATE;
    v_order := l.lead_order_id;
  ELSE
    v_order := public.smc_open_order_for(l.broker_id, l.brand_id);
  END IF;
  IF v_order IS NULL THEN
    INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
    VALUES (l.id, l.brand_id, l.broker_id, 'system', 'count_held_no_room', jsonb_build_object('booking_id', NEW.id), now(), 'order:count_held:' || NEW.id::text)
    ON CONFLICT (idempotency_key) DO NOTHING;
    RETURN NULL;
  END IF;
  INSERT INTO public.lead_order_items (order_id, lead_id) VALUES (v_order, l.id) ON CONFLICT DO NOTHING;
  UPDATE public.leads SET lead_order_id = v_order, order_state = 'counted', order_counted_at = now(), delivered = true,
                          order_released_at = NULL, order_release_reason = NULL, updated_at = now()
   WHERE id = l.id;
  INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (l.id, l.brand_id, l.broker_id, 'system', 'order_counted',
          jsonb_build_object('lead_order_id', v_order, 'booking_id', NEW.id, 'confirmed_at', NEW.confirmed_at, 'rule', 'agreement 5.2: booked + attendance confirmed'), now(),
          'order:counted:' || l.id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS smc_count_on_confirm ON public.appointments;
CREATE TRIGGER smc_count_on_confirm
  AFTER INSERT OR UPDATE OF status, confirmed_at ON public.appointments
  FOR EACH ROW WHEN (NEW.brand_id IS NOT NULL AND NEW.confirmed_at IS NOT NULL) EXECUTE FUNCTION public.smc_count_on_confirm();

-- An outcome for a meeting the lead never confirmed: the lead was never Delivered (criterion 6 unmet), so the reserved
-- place goes back to the order (a rebooking that is confirmed later re-attaches through smc_count_on_confirm).
CREATE OR REPLACE FUNCTION public.smc_outcome_release_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.leads l
     SET order_state = 'released', order_released_at = now(), order_release_reason = 'meeting_passed_unconfirmed', updated_at = now()
   WHERE l.id = NEW.lead_id AND l.order_state = 'attached'
     AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = NEW.booking_id AND a.confirmed_at IS NOT NULL);
  IF FOUND THEN
    INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, actor_type, activity_type, payload, occurred_at, idempotency_key)
    VALUES (NEW.lead_id, NEW.brand_id, NEW.broker_id, 'system', 'order_released',
            jsonb_build_object('reason', 'meeting_passed_unconfirmed', 'booking_id', NEW.booking_id), now(), 'order:released:outcome:' || NEW.booking_id::text)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS smc_outcome_release_reservation ON public.outcomes;
CREATE TRIGGER smc_outcome_release_reservation
  AFTER INSERT ON public.outcomes
  FOR EACH ROW EXECUTE FUNCTION public.smc_outcome_release_reservation();

-- -----------------------------------------------------------------------------
-- 5. smc_order_capacity: one row per SortMyCover order (routing context, portal, console). RLS of the base tables applies.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.smc_order_capacity WITH (security_invoker = true) AS
SELECT o.id AS lead_order_id, o.broker_id, o.brand_id, o.title, o.status, coalesce(o.lead_count, 0) AS lead_count,
       o.paid_at, o.created_at,
       x.counted + x.reserved                                                                  AS attached,   -- places in use
       x.replacements_approved,
       coalesce(o.lead_count, 0) + x.replacements_approved                                    AS capacity,
       greatest(0, coalesce(o.lead_count, 0) + x.replacements_approved - x.counted - x.reserved) AS remaining,
       greatest(0, x.counted - x.replacements_approved)                                       AS counted_toward_order,
       (o.status = 'paid' AND coalesce(o.lead_count, 0) + x.replacements_approved > x.counted + x.reserved) AS open,
       x.replacement_requests_this_week,
       3                                                                                       AS replacement_weekly_max,
       x.counted,    -- Delivered (booked + attendance confirmed, agreement 5.2): lead_order_items rows
       x.reserved    -- routed, place held, not yet counted (leads.order_state = attached)
FROM public.lead_orders o
CROSS JOIN LATERAL (
  SELECT (SELECT count(*) FROM public.lead_order_items i WHERE i.order_id = o.id)::int AS counted,
         (SELECT count(*) FROM public.leads l WHERE l.lead_order_id = o.id AND l.order_state = 'attached')::int AS reserved,
         (SELECT count(*) FROM public.replacements r WHERE r.lead_order_id = o.id AND r.status IN ('approved','fulfilled'))::int AS replacements_approved,
         (SELECT count(*) FROM public.replacements r
           WHERE r.broker_id = o.broker_id
             AND public.smc_week_start(coalesce(r.missed_start_at, r.claimed_at)) = public.smc_week_start(now()))::int AS replacement_requests_this_week
) x
WHERE o.brand_id IS NOT NULL;
COMMENT ON VIEW public.smc_order_capacity IS
  'SMC: SortMyCover lead orders: counted (Delivered = booked + attendance confirmed, lead_order_items), reserved (routed, not yet counted), attached = counted + reserved, capacity (lead_count + approved replacements), remaining, open, counted_toward_order, and the broker''s replacement requests this Calendar Week (max 3).';

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
                       public.smc_replacements_cap(), public.smc_broker_ready(uuid), public.smc_leads_release_reservation(),
                       public.smc_count_on_confirm(), public.smc_outcome_release_reservation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smc_request_replacement(uuid, text, text), public.smc_request_noshow_replacement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_request_replacement(uuid, text, text), public.smc_request_noshow_replacement(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_week_start(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_week_start(timestamptz) TO authenticated;
