-- =============================================================================
-- 20261024150000_smc_broker_sees_whatsapp_verified_leads.sql
--
-- LIVE PASTE VERSION (24 Oct 2026): same as the repo migration minus step 0 (smc_broker_has_live_booking already exists live; left untouched).
-- project). Apply on staging first, then live, with the undo file at hand. Predicates below start from the LIVE
-- policies as read on 24 Oct 2026 (files 05, 08 and 20261013210000_appointment_manual_allocation applied), so the
-- manual-allocation and live-booking paths are kept exactly; only the "verified" test widens.
--
-- Why (24 Oct 2026, Mark's first real lead): the RESTRICTIVE broker-visibility policies gate a brand lead, its
-- bookings, timeline, messages and outcomes on leads.email_verified (or a live booking). The platform collects an
-- email only when the chosen method needs an invite (Teams / Zoom / Meet); a WhatsApp-call or phone lead never has
-- one. A Qualified Lead is "verified" once the person replied or tapped on WhatsApp within 72 h (MASTER-PROMPT 3.3),
-- which W03 records as leads.verified_at + stage = 'verified'. So a click-to-WhatsApp lead routed to his adviser
-- (06:12 UTC, no booking yet) was invisible to that adviser's portal login, and the 2-h nudge, the routing row and
-- the booking-page visits with it.
--
-- Change: "verified" for visibility = email verified OR WhatsApp verified (verified_at set). Same caller guard as
-- file 08 (admins, non-API roles, the lead's own broker; false for everyone else). Also let the broker read the
-- timeline rows written BEFORE routing (ctwa_consent, start_page_*: broker_id NULL) for a lead that is now his.
-- Nothing here widens who a lead can belong to: every path still requires leads.broker_id = the caller's broker.
-- =============================================================================
BEGIN;

-- 1. verified for visibility: email OR WhatsApp (verified_at), same guard as smc_lead_email_verified (file 08)
CREATE OR REPLACE FUNCTION public.smc_lead_verified(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT (l.email_verified IS TRUE OR l.verified_at IS NOT NULL)
      FROM public.leads l
     WHERE l.id = p_lead_id
       AND (   coalesce(nullif(current_setting('role', true), 'none'), session_user::text) NOT IN ('authenticated', 'anon')
            OR public.smc_is_admin()
            OR (l.broker_id IS NOT NULL AND l.broker_id = public.smc_current_broker_id()))
  ), false)
$$;
COMMENT ON FUNCTION public.smc_lead_verified(uuid) IS 'SMC: true once the lead is verified by email (email_verified) OR by WhatsApp (verified_at, MASTER-PROMPT 3.3); answers only admins, non-API roles and the lead''s own broker. Used by the RESTRICTIVE broker visibility policies (definer: no policy recursion through leads).';
REVOKE ALL ON FUNCTION public.smc_lead_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_lead_verified(uuid) TO authenticated, n8n_app;

-- 2. "this lead is routed to me" (for timeline rows written before routing, which carry broker_id NULL)
CREATE OR REPLACE FUNCTION public.smc_lead_routed_to_me(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT l.broker_id IS NOT NULL AND l.broker_id = public.smc_current_broker_id()
      FROM public.leads l
     WHERE l.id = p_lead_id
       AND coalesce(nullif(current_setting('role', true), 'none'), session_user::text) = 'authenticated'
  ), false)
$$;
COMMENT ON FUNCTION public.smc_lead_routed_to_me(uuid) IS 'SMC: true when the lead''s broker is the signed-in broker (portal callers only). Lets a broker read the timeline rows of his lead that were written before routing (broker_id NULL).';
REVOKE ALL ON FUNCTION public.smc_lead_routed_to_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_lead_routed_to_me(uuid) TO authenticated;

-- 3. the five RESTRICTIVE policies: live predicate, with email-only verification widened to email-or-WhatsApp
DROP POLICY IF EXISTS "smc broker sees verified leads only" ON public.leads;
CREATE POLICY "smc broker sees verified leads only" ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR email_verified IS TRUE OR verified_at IS NOT NULL
         OR public.smc_broker_has_live_booking(id));

DROP POLICY IF EXISTS "smc broker sees verified bookings only" ON public.appointments;
CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin()
         OR (status <> 'pending_verification' AND (allocated_at IS NOT NULL OR public.smc_lead_verified(client_id)))
         OR (status IN ('booked', 'confirmed', 'rescheduled', 'attended', 'no_show')
             AND broker_id IS NOT NULL AND broker_id = public.smc_current_broker_id()));

DROP POLICY IF EXISTS "smc broker sees verified timelines only" ON public.lead_activities;
CREATE POLICY "smc broker sees verified timelines only" ON public.lead_activities AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR lead_id IS NULL OR public.smc_lead_verified(lead_id));

DROP POLICY IF EXISTS "smc broker sees verified messages only" ON public.communications;
CREATE POLICY "smc broker sees verified messages only" ON public.communications AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR lead_id IS NULL OR public.smc_lead_verified(lead_id));

DROP POLICY IF EXISTS "smc broker sees verified outcomes only" ON public.outcomes;
CREATE POLICY "smc broker sees verified outcomes only" ON public.outcomes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.smc_is_admin() OR public.smc_lead_verified(lead_id) OR public.smc_broker_has_live_booking(lead_id));

-- 4. the broker may read his lead's whole timeline, including rows written before routing (PERMISSIVE; the
--    RESTRICTIVE policy above still hides it until the lead is verified)
DROP POLICY IF EXISTS "smc broker read timeline of own lead" ON public.lead_activities;
CREATE POLICY "smc broker read timeline of own lead" ON public.lead_activities FOR SELECT TO authenticated
  USING (brand_id IS NOT NULL AND lead_id IS NOT NULL AND public.smc_lead_routed_to_me(lead_id));

COMMIT;

-- Check (as the adviser's portal login, after apply): his routed, unbooked, WhatsApp-verified lead is readable and
-- its timeline shows ctwa_consent → start_page_adviser → adviser_disclosed → routed → order_attached → nurture_sent.
--   select id, first_name, verified_at from public.leads where broker_id = public.smc_current_broker_id();
--   select activity_type, occurred_at from public.lead_activities where lead_id = '<that id>' order by occurred_at;
-- Check (as another broker's login): the same two queries return nothing.
