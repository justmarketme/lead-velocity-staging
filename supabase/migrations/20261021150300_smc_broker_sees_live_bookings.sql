-- =============================================================================
-- 20261021150300_smc_broker_sees_live_bookings.sql  --  smoke test 21 Oct 2026 #4
-- NEEDS JONO'S GO (it changes what a broker can see). Prepared only: not applied, nothing in src/ depends on it.
--
-- Problem: the RESTRICTIVE "verified only" policies hide a live booking from the broker it is booked with whenever the
-- client's email is not verified. Phone and WhatsApp-call bookings never ask for an email (0.1 "Email"), so that is the
-- normal case (7 of 8 real SMC leads on 21 Oct). Live check, booking 8b5cc3b6 (/start/ page, status booked, no email,
-- not allocated): invisible to its broker under the live policies. Even an allocated booking shows a blank brief, because
-- the lead row stays hidden (leads.email_verified false, and leads.broker_id is often NULL, so the permissive
-- "Brokers can view their own leads" policy does not match either). The outcome insert re-reads the booking under RLS
-- (WITH CHECK EXISTS appointments) and returns the new row (SELECT on outcomes), so the broker cannot mark the outcome.
--
-- Rule added: a lead / booking / outcome is visible to a broker when a LIVE booking with that broker exists.
--   live = booked, confirmed, rescheduled, attended, no_show (not requested, pending_verification or cancelled).
-- Nothing else changes: the email gate stays for everything without a live booking; admins, n8n_app and non-SMC rows
-- are untouched; only the broker the booking is with gains sight of it; SELECT only (no new write rights).
-- Not widened here (decide separately): communications and lead_activities timelines keep the email gate.
--
-- Test: tests/smc-broker-live-booking-rls.test.mjs runs the live policies and then this file as a NON-admin broker (PGlite).
-- Undo: supabase/migrations/undo/20261021150300_smc_broker_sees_live_bookings.undo.sql
-- Apply by hand with the CRM release (no db push), then:
--   npx supabase migration repair --status applied --linked --project-ref cmsylaupctrbsvzrgzwy 20261021150300
-- =============================================================================

-- SECURITY DEFINER: reads appointments without going back through RLS (no policy recursion between leads and
-- appointments). Answers only for the calling broker (smc_current_broker_id()), so it reveals nothing about other brokers.
CREATE OR REPLACE FUNCTION public.smc_broker_has_live_booking(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_lead_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.appointments a
     WHERE a.client_id = p_lead_id
       AND a.brand_id IS NOT NULL
       AND a.broker_id IS NOT NULL
       AND a.broker_id = public.smc_current_broker_id()
       AND a.status IN ('booked', 'confirmed', 'rescheduled', 'attended', 'no_show'))
$$;
COMMENT ON FUNCTION public.smc_broker_has_live_booking(uuid) IS 'SMC: true when the calling broker has a live booking (booked/confirmed/rescheduled/attended/no_show) with this lead. Used by the broker visibility policies so a booked lead is visible without a verified email (smoke test #4).';
REVOKE ALL ON FUNCTION public.smc_broker_has_live_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_broker_has_live_booking(uuid) TO authenticated;

-- appointments: same as 20261013210000 plus "a live booking with me".
DROP POLICY IF EXISTS "smc broker sees verified bookings only" ON public.appointments;
CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin()
         OR (status <> 'pending_verification' AND (allocated_at IS NOT NULL OR public.smc_lead_email_verified(client_id)))
         OR (status IN ('booked', 'confirmed', 'rescheduled', 'attended', 'no_show')
             AND broker_id IS NOT NULL AND broker_id = public.smc_current_broker_id()));

-- leads: the email gate, or a live booking with me ...
DROP POLICY IF EXISTS "smc broker sees verified leads only" ON public.leads;
CREATE POLICY "smc broker sees verified leads only" ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR email_verified IS TRUE OR public.smc_broker_has_live_booking(id));

-- ... and a permissive grant for that case, because leads.broker_id is not set by every booking path.
DROP POLICY IF EXISTS "smc broker sees leads with a live booking" ON public.leads;
CREATE POLICY "smc broker sees leads with a live booking" ON public.leads FOR SELECT TO authenticated
  USING (brand_id IS NOT NULL AND public.smc_broker_has_live_booking(id));

-- outcomes: the broker's own outcome row on a live booking is readable (insert ... returning in the portal).
DROP POLICY IF EXISTS "smc broker sees verified outcomes only" ON public.outcomes;
CREATE POLICY "smc broker sees verified outcomes only" ON public.outcomes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.smc_is_admin() OR public.smc_lead_email_verified(lead_id) OR public.smc_broker_has_live_booking(lead_id));
