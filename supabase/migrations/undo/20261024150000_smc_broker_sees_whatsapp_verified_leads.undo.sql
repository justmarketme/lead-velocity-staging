-- Undo 20261024150000_smc_broker_sees_whatsapp_verified_leads.sql: back to the live 24 Oct 2026 predicates
-- (email-verified or live booking / manual allocation). Brokers lose sight of WhatsApp-verified leads that have no
-- verified email and no live booking, and of their pre-routing timeline rows.
BEGIN;

DROP POLICY IF EXISTS "smc broker read timeline of own lead" ON public.lead_activities;

DROP POLICY IF EXISTS "smc broker sees verified leads only" ON public.leads;
CREATE POLICY "smc broker sees verified leads only" ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR email_verified IS TRUE OR public.smc_broker_has_live_booking(id));

DROP POLICY IF EXISTS "smc broker sees verified bookings only" ON public.appointments;
CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin()
         OR (status <> 'pending_verification' AND (allocated_at IS NOT NULL OR public.smc_lead_email_verified(client_id)))
         OR (status IN ('booked', 'confirmed', 'rescheduled', 'attended', 'no_show')
             AND broker_id IS NOT NULL AND broker_id = public.smc_current_broker_id()));

DROP POLICY IF EXISTS "smc broker sees verified timelines only" ON public.lead_activities;
CREATE POLICY "smc broker sees verified timelines only" ON public.lead_activities AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR lead_id IS NULL OR public.smc_lead_email_verified(lead_id));

DROP POLICY IF EXISTS "smc broker sees verified messages only" ON public.communications;
CREATE POLICY "smc broker sees verified messages only" ON public.communications AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR lead_id IS NULL OR public.smc_lead_email_verified(lead_id));

DROP POLICY IF EXISTS "smc broker sees verified outcomes only" ON public.outcomes;
CREATE POLICY "smc broker sees verified outcomes only" ON public.outcomes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.smc_is_admin() OR public.smc_lead_email_verified(lead_id) OR public.smc_broker_has_live_booking(lead_id));

DROP FUNCTION IF EXISTS public.smc_lead_routed_to_me(uuid);
DROP FUNCTION IF EXISTS public.smc_lead_verified(uuid);

COMMIT;
