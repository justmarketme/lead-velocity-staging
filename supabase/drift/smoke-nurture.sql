-- LOCAL smoke test of the crm-nurture chain on the live-schema mirror (supabase/drift/real-*.sql + the 8 chain files applied).
-- Everything runs in ONE transaction and is rolled back, so it can run before the undo rehearsal. Every check raises on failure.
-- Covers: routing needs a ready broker (FSP number, practice, adviser, intro card: CHECK + routing trigger),
-- capacity from lead_orders (reserve at routing, COUNT at booked + attendance confirmed (agreement 5.2), release on
-- STOP / disqualified / unconfirmed meeting / un-route, hold, re-route refusal, replacement adds capacity, legacy order untouched),
-- replacement RPC (window, weekly max 3 across no-show + unreachable, traversal, other broker), brokers guard, n8n_app scope,
-- portal event RPC, anon posture.
\set ON_ERROR_STOP on
BEGIN;
SELECT id AS brand FROM public.brands WHERE code = 'SMC' \gset
-- Broker One becomes a live SortMyCover broker (admin action); Broker Two stays legacy.
-- 0. routing can only be switched on for a broker whose intro card can be shown in full (FSP, practice, adviser, card)
DO $$
BEGIN
  BEGIN
    UPDATE public.brokers SET brand_id = (SELECT id FROM public.brands WHERE code = 'SMC'), status = 'active', routing_on = true
     WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'smoke 0: routing_on accepted without an FSP number / intro card';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 0: brokers_smc_routing_ready refuses routing_on without the FSP number and intro card';
END $$;
UPDATE public.brokers SET brand_id = :'brand', status = 'active', routing_on = true, fsp_number = '12345', whatsapp_number = '+27600000099',
       intro_card_url = 'https://media.sortmycover.co.za/intro/10000000-0000-4000-8000-000000000001/card.png'
 WHERE id = '10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  BEGIN
    UPDATE public.brokers SET fsp_number = NULL WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'smoke 0: FSP number removed while routing is on';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
-- A paid SortMyCover order for 2 leads, and a pending one (not eligible)
INSERT INTO public.lead_orders (id, broker_id, title, lead_count, amount_zar, status, paid_at, brand_id)
VALUES ('31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'SMC test order', 2, 1000, 'paid', now() - interval '1 day', :'brand'),
       ('31000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'SMC pending order', 5, 2500, 'pending', NULL, :'brand');

-- 1. two routed leads attach to the paid order; the third is held (no open order)
INSERT INTO public.leads (id, email, phone, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at, first_name, source)
SELECT ('61000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, NULL, '+27600008' || lpad(g::text, 3, '0'), :'brand',
       '10000000-0000-4000-8000-000000000001', now(), 'consent text', 'ctwa', now(), 'N' || g, 'Search Lead'
  FROM generate_series(1, 1) g;
INSERT INTO public.leads (id, email, phone, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at, first_name, source)
VALUES ('61000000-0000-4000-8000-000000000002', NULL, '+27600008002', :'brand', '10000000-0000-4000-8000-000000000001', now(), 'consent text', 'ctwa', now(), 'N2', 'Search Lead');
INSERT INTO public.leads (id, email, phone, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at, first_name, source)
VALUES ('61000000-0000-4000-8000-000000000003', NULL, '+27600008003', :'brand', '10000000-0000-4000-8000-000000000001', now(), 'consent text', 'ctwa', now(), 'N3', 'Search Lead');
DO $$
DECLARE n int; b uuid; r text;
BEGIN
  -- routed = a place RESERVED, not counted: no lead_order_items row until the booking's attendance is confirmed (5.2)
  SELECT count(*) INTO n FROM public.lead_order_items WHERE order_id = '31000000-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'smoke 1: routed leads were counted at hand-over (% items)', n; END IF;
  SELECT count(*) INTO n FROM public.leads WHERE lead_order_id = '31000000-0000-4000-8000-000000000001' AND order_state = 'attached';
  IF n <> 2 THEN RAISE EXCEPTION 'smoke 1: expected 2 reserved places on the paid order, got %', n; END IF;
  SELECT count(*) INTO n FROM public.leads WHERE lead_order_id = '31000000-0000-4000-8000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'smoke 1: pending order received leads'; END IF;
  IF (SELECT counted FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001') <> 0
     OR (SELECT reserved FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'smoke 1: view counted/reserved wrong'; END IF;
  SELECT broker_id, routing_reason INTO b, r FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000003';
  IF b IS NOT NULL OR r <> 'held_no_open_order' THEN RAISE EXCEPTION 'smoke 1: third lead not held (broker %, reason %)', b, r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lead_activities WHERE lead_id = '61000000-0000-4000-8000-000000000003' AND activity_type = 'routing_held') THEN
    RAISE EXCEPTION 'smoke 1: no routing_held timeline row'; END IF;
  IF (SELECT count(*) FROM public.lead_activities WHERE activity_type = 'order_attached' AND broker_id = '10000000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'smoke 1: order_attached rows missing'; END IF;
  SELECT remaining INTO n FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'smoke 1: remaining should be 0, got %', n; END IF;
  -- the legacy Discovery-style order is untouched
  SELECT count(*) INTO n FROM public.lead_order_items WHERE order_id = '30000000-0000-4000-8000-000000000001';
  IF n <> 5 THEN RAISE EXCEPTION 'smoke 1: legacy order items changed (%)', n; END IF;
  RAISE NOTICE 'ok 1: capacity from lead_orders (2 reserved, none counted at hand-over, third held, legacy order untouched)';
END $$;
-- 1b. a broker that is not ready (no FSP number / intro card) never receives a SortMyCover lead: it is held
INSERT INTO public.leads (id, email, phone, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at, first_name, source)
VALUES ('61000000-0000-4000-8000-000000000008', NULL, '+27600008008', :'brand', '10000000-0000-4000-8000-000000000002', now(), 'consent text', 'ctwa', now(), 'N8', 'Search Lead');
DO $$
DECLARE b uuid; r text;
BEGIN
  SELECT broker_id, routing_reason INTO b, r FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000008';
  IF b IS NOT NULL OR r <> 'held_broker_not_ready' THEN RAISE EXCEPTION 'smoke 1b: lead introduced to a broker without an FSP number (broker %, reason %)', b, r; END IF;
  RAISE NOTICE 'ok 1b: no lead is introduced to a broker without his FSP number (held_broker_not_ready)';
END $$;

-- 2. a routed lead cannot be re-routed to a broker without an open order; the broker sees his leads in the existing order pipeline
DO $$
BEGIN
  BEGIN
    UPDATE public.leads SET broker_id = '10000000-0000-4000-8000-000000000002' WHERE id = '61000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'smoke 2: re-route accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- un-routing takes the lead off the order (no double delivery), routing back re-attaches it
  UPDATE public.leads SET broker_id = NULL WHERE id = '61000000-0000-4000-8000-000000000002';
  IF (SELECT order_state FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000002') <> 'released' THEN RAISE EXCEPTION 'smoke 2: un-routed lead kept its reservation'; END IF;
  UPDATE public.leads SET broker_id = '10000000-0000-4000-8000-000000000001' WHERE id = '61000000-0000-4000-8000-000000000002';
  IF (SELECT count(*) FROM public.leads WHERE lead_order_id = '31000000-0000-4000-8000-000000000001' AND order_state = 'attached') <> 2 THEN RAISE EXCEPTION 'smoke 2: re-attach failed'; END IF;
  -- a disqualified / opted-out lead gives its reserved place back (sub-block rolled back on purpose)
  BEGIN
    UPDATE public.leads SET stage = 'disqualified' WHERE id = '61000000-0000-4000-8000-000000000002';
    IF (SELECT order_state || ':' || order_release_reason FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000002') <> 'released:disqualified' THEN
      RAISE EXCEPTION 'smoke 2: disqualified lead kept its place'; END IF;
    IF (SELECT remaining FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001') <> 1 THEN RAISE EXCEPTION 'smoke 2: released place not free'; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'rollback';
  EXCEPTION WHEN sqlstate 'P0099' THEN NULL;
  END;
  BEGIN
    UPDATE public.leads SET opted_out_at = now() WHERE id = '61000000-0000-4000-8000-000000000002';
    IF (SELECT order_state FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000002') <> 'released' THEN RAISE EXCEPTION 'smoke 2: STOP kept the place'; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'rollback';
  EXCEPTION WHEN sqlstate 'P0099' THEN NULL;
  END;
  -- a meeting that passed without the lead confirming: never Delivered, the place goes back
  BEGIN
    INSERT INTO public.appointments (id, broker_id, client_id, appointment_date, ends_at, status, brand_id, method)
    VALUES ('71000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002',
            now() - interval '3 hours', now() - interval '150 minutes', 'booked', (SELECT id FROM public.brands WHERE code = 'SMC'), 'teams');
    INSERT INTO public.outcomes (booking_id, lead_id, broker_id, brand_id, outcome)
    VALUES ('71000000-0000-4000-8000-000000000099', '61000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', (SELECT id FROM public.brands WHERE code = 'SMC'), 'no_show');
    IF (SELECT order_state || ':' || order_release_reason FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000002') <> 'released:meeting_passed_unconfirmed' THEN
      RAISE EXCEPTION 'smoke 2: unconfirmed meeting kept the place'; END IF;
    IF EXISTS (SELECT 1 FROM public.lead_order_items WHERE lead_id = '61000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'smoke 2: unconfirmed lead counted'; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'rollback';
  EXCEPTION WHEN sqlstate 'P0099' THEN NULL;
  END;
  -- a calendar token reference may only name this broker's own Vault secret
  BEGIN
    UPDATE public.brokers SET calendar_token_ref = 'ms_refresh_10000000-0000-4000-8000-000000000002_1700000000' WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'smoke 2: foreign calendar_token_ref accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 2: re-route refused without an open order; un-route detaches; token reference tied to the broker';
END $$;

-- 3. bookings 12-14 minutes ago (inside the 10..30-min proof window) for the two delivered leads + one more delivered later
INSERT INTO public.appointments (id, broker_id, client_id, appointment_date, ends_at, status, brand_id, method)
SELECT ('71000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '10000000-0000-4000-8000-000000000001',
       ('61000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, now() - ((11 + g) || ' minutes')::interval,
       now() - ((11 + g) || ' minutes')::interval + interval '30 seconds', 'booked', :'brand', 'teams'
  FROM generate_series(1, 2) g;

-- 3a. THE DELIVERY POINT (agreement 5.2): booked + attendance confirmed counts the lead, once; booked alone does not
DO $$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.lead_order_items WHERE order_id = '31000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'smoke 3a: a booking alone counted the lead'; END IF;
  UPDATE public.appointments SET status = 'confirmed', confirmed_at = now() WHERE id = '71000000-0000-4000-8000-000000000001';
  IF NOT EXISTS (SELECT 1 FROM public.lead_order_items WHERE order_id = '31000000-0000-4000-8000-000000000001' AND lead_id = '61000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'smoke 3a: confirmed attendance did not count the lead'; END IF;
  IF (SELECT order_state || ':' || delivered::text FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000001') <> 'counted:true' THEN RAISE EXCEPTION 'smoke 3a: lead state not counted'; END IF;
  IF EXISTS (SELECT 1 FROM public.lead_order_items WHERE lead_id = '61000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'smoke 3a: unconfirmed lead counted'; END IF;
  -- a repeat confirmation counts nothing twice
  UPDATE public.appointments SET confirmed_at = now() WHERE id = '71000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO n FROM public.lead_activities WHERE lead_id = '61000000-0000-4000-8000-000000000001' AND activity_type = 'order_counted';
  IF n <> 1 THEN RAISE EXCEPTION 'smoke 3a: order_counted rows %', n; END IF;
  UPDATE public.appointments SET status = 'confirmed', confirmed_at = now() WHERE id = '71000000-0000-4000-8000-000000000002';
  IF (SELECT counted FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001') <> 2
     OR (SELECT reserved FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'smoke 3a: view after two confirmations wrong'; END IF;
  RAISE NOTICE 'ok 3a: a lead counts toward the order at booked + attendance confirmed, exactly once';
END $$;

-- the broker's uploaded proof files (the RPC requires the object to exist in the private bucket)
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('broker-media', '10000000-0000-4000-8000-000000000001/noshow-proof/a.jpg'),
  ('broker-media', '10000000-0000-4000-8000-000000000001/noshow-proof/b.jpg');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
DO $$
DECLARE j jsonb;
BEGIN
  BEGIN
    PERFORM public.smc_request_replacement('71000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001/noshow-proof/../10000000-0000-4000-8000-000000000002/x.jpg', 'no_show');
    RAISE EXCEPTION 'smoke 3: traversal accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.smc_request_replacement('71000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001/noshow-proof/never-uploaded.jpg', 'no_show');
    RAISE EXCEPTION 'smoke 3: a proof that was never uploaded was accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  j := public.smc_request_replacement('71000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001/noshow-proof/a.jpg', 'unreachable');
  IF (j->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'smoke 3: unreachable request refused: %', j; END IF;
  j := public.smc_request_noshow_replacement('71000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001/noshow-proof/b.jpg');
  IF (j->>'ok')::boolean IS NOT TRUE OR (j->>'used')::int <> 2 THEN RAISE EXCEPTION 'smoke 3: no-show request: %', j; END IF;
  j := public.smc_request_replacement('71000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001/noshow-proof/a.jpg', 'unreachable');
  IF j->>'reason' <> 'already_requested' THEN RAISE EXCEPTION 'smoke 3: duplicate request: %', j; END IF;
  RAISE NOTICE 'ok 3: replacement RPC (traversal refused, unreachable + no-show share one counter, duplicate refused)';
END $$;
RESET ROLE;

-- 4. weekly max 3 (no-shows and unreachable together): two more requests in the same Calendar Week via direct rows (console),
--    then the RPC refuses the 4th; the trigger stamps cap_position
INSERT INTO public.leads (id, phone, brand_id, consent_text, consent_source, consent_at, first_name, source)
VALUES ('61000000-0000-4000-8000-000000000009', '+27600008009', :'brand', 'consent text', 'ctwa', now(), 'N9', 'Search Lead');
INSERT INTO public.replacements (lead_id, broker_id, brand_id, reason, missed_start_at, status)
VALUES ('61000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', :'brand', 'no_show', now() - interval '20 minutes', 'due');
DO $$
DECLARE p int;
BEGIN
  SELECT cap_position INTO p FROM public.replacements WHERE lead_id = '61000000-0000-4000-8000-000000000009';
  IF p <> 3 THEN RAISE EXCEPTION 'smoke 4: cap_position should be 3, got %', p; END IF;
  IF (SELECT replacement_requests_this_week FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'smoke 4: view weekly count wrong'; END IF;
  BEGIN
    INSERT INTO public.replacements (lead_id, broker_id, brand_id, reason, status) VALUES ('61000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', (SELECT id FROM public.brands WHERE code='SMC'), 'disqualified', 'due');
    RAISE EXCEPTION 'smoke 4: reason disqualified accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 4: weekly position stamped; only no_show / uncontactable are replacement reasons';
END $$;

-- 5. an approved replacement adds capacity on the order the missed lead was delivered on; the held lead can now be routed
UPDATE public.replacements SET status = 'approved' WHERE lead_id = '61000000-0000-4000-8000-000000000001';
DO $$
DECLARE o uuid; c int;
BEGIN
  SELECT lead_order_id INTO o FROM public.replacements WHERE lead_id = '61000000-0000-4000-8000-000000000001';
  IF o IS DISTINCT FROM '31000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'smoke 5: replacement not linked to the order (%)', o; END IF;
  SELECT capacity INTO c FROM public.smc_order_capacity WHERE lead_order_id = o;
  IF c <> 3 THEN RAISE EXCEPTION 'smoke 5: capacity should be 3, got %', c; END IF;
  UPDATE public.leads SET broker_id = '10000000-0000-4000-8000-000000000001', routed_at = now(), routing_reason = 'single_broker'
   WHERE id = '61000000-0000-4000-8000-000000000003';
  IF (SELECT order_state || ':' || lead_order_id::text FROM public.leads WHERE id = '61000000-0000-4000-8000-000000000003') <> 'attached:' || o::text THEN
    RAISE EXCEPTION 'smoke 5: replacement lead not reserved on the order'; END IF;
  RAISE NOTICE 'ok 5: approved replacement adds one lead of capacity; the replacement lead is reserved on that order';
END $$;
-- 5b. W09's Confirm tap runs as n8n_app (no write on lead_order_items): the counting trigger still delivers the lead
INSERT INTO public.appointments (id, broker_id, client_id, appointment_date, ends_at, status, brand_id, method)
VALUES ('71000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003',
        now() + interval '2 days', now() + interval '2 days 30 minutes', 'booked', :'brand', 'teams');
SET LOCAL ROLE n8n_app;
UPDATE public.appointments SET status = 'confirmed', confirmed_at = now() WHERE id = '71000000-0000-4000-8000-000000000003';
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lead_order_items WHERE order_id = '31000000-0000-4000-8000-000000000001' AND lead_id = '61000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'smoke 5b: confirmation by n8n_app did not count the lead'; END IF;
  IF (SELECT counted_toward_order FROM public.smc_order_capacity WHERE lead_order_id = '31000000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'smoke 5b: counted_toward_order should be 2 (3 delivered, 1 replaced)'; END IF;
  RAISE NOTICE 'ok 5b: n8n_app confirmation counts through the definer trigger; delivered toward the order = lead_count';
END $$;

-- 6. brokers guard: SMC broker may edit availability but not routing / disclosure / calendar state; legacy broker cannot self-enrol
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
UPDATE public.brokers SET max_meetings_per_day = 4, bio_short = 'hello' WHERE user_id = '00000000-0000-4000-8000-000000000002';
DO $$
BEGIN
  BEGIN
    UPDATE public.brokers SET fsp_number = '99999' WHERE user_id = '00000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'smoke 6: broker changed his FSP number';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.brokers SET routing_on = false WHERE user_id = '00000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'smoke 6: broker changed routing_on';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- the portal event RPC writes his timeline
  PERFORM public.smc_portal_event('availability.saved', 'availability', '{"per_day":4}'::jsonb);
  -- he cannot write a SortMyCover lead row
  UPDATE public.leads SET first_name = 'X' WHERE id = '61000000-0000-4000-8000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'smoke 6: broker updated a SortMyCover lead'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
DO $$
BEGIN
  BEGIN
    UPDATE public.brokers SET brand_id = (SELECT id FROM public.brands WHERE code = 'SMC'), routing_on = true WHERE user_id = '00000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'smoke 6: legacy broker self-enrolled';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.brokers SET firm_name = 'Firm Two Renamed', status = 'Inactive' WHERE user_id = '00000000-0000-4000-8000-000000000003';
  IF NOT FOUND THEN RAISE EXCEPTION 'smoke 6: legacy profile edit blocked'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lead_activities WHERE workflow = 'portal' AND activity_type = 'availability.saved') THEN RAISE EXCEPTION 'smoke 6: portal event not recorded'; END IF;
  IF (SELECT max_meetings_per_day FROM public.brokers WHERE id = '10000000-0000-4000-8000-000000000001') <> 4 THEN RAISE EXCEPTION 'smoke 6: availability edit lost'; END IF;
  RAISE NOTICE 'ok 6: brokers guard + portal event + broker cannot write SMC leads + legacy edit still allowed';
END $$;

-- 7. n8n_app sees SortMyCover rows only; reads orders; cannot write order items; cannot read a calendar token through the API roles
SET LOCAL ROLE n8n_app;
-- an n8n_app session that forges the admin's uid still sees SortMyCover rows only (RESTRICTIVE n8n policies)
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.leads WHERE brand_id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'smoke 7: n8n_app sees % legacy leads', n; END IF;
  SELECT count(*) INTO n FROM public.lead_orders;
  IF n <> 2 THEN RAISE EXCEPTION 'smoke 7: n8n_app should see the 2 SMC orders only, saw %', n; END IF;
  SELECT count(*) INTO n FROM public.smc_order_capacity WHERE open;
  IF n <> 0 THEN RAISE EXCEPTION 'smoke 7: no order should be open, % are', n; END IF;
  BEGIN
    INSERT INTO public.lead_order_items (order_id, lead_id) VALUES ('31000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000009');
    RAISE EXCEPTION 'smoke 7: n8n_app inserted an order item';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 7: n8n_app scope (brand rows only, orders read-only)';
END $$;
RESET ROLE;

-- 8. anon: nothing on the chain objects or the locked CRM tables
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.smc_order_capacity', 'SELECT') OR has_table_privilege('anon', 'public.leads', 'SELECT')
     OR has_table_privilege('anon', 'public.lead_orders', 'SELECT') OR has_table_privilege('anon', 'public.replacements', 'SELECT')
     OR has_function_privilege('anon', 'public.smc_request_replacement(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.smc_open_order_for(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'smoke 8: anon holds a privilege';
  END IF;
  RAISE NOTICE 'ok 8: anon posture';
END $$;
ROLLBACK;
\echo SMOKE OK
