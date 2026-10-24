-- Undo 20261021150300: back to the email-gated broker visibility (policies as live on 21 Oct 2026).
DROP POLICY IF EXISTS "smc broker sees verified bookings only" ON public.appointments;
CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin()
         OR (status <> 'pending_verification' AND (allocated_at IS NOT NULL OR public.smc_lead_email_verified(client_id))));

DROP POLICY IF EXISTS "smc broker sees verified leads only" ON public.leads;
CREATE POLICY "smc broker sees verified leads only" ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR email_verified IS TRUE);

DROP POLICY IF EXISTS "smc broker sees leads with a live booking" ON public.leads;

DROP POLICY IF EXISTS "smc broker sees verified outcomes only" ON public.outcomes;
CREATE POLICY "smc broker sees verified outcomes only" ON public.outcomes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.smc_is_admin() OR public.smc_lead_email_verified(lead_id));

DROP FUNCTION IF EXISTS public.smc_broker_has_live_booking(uuid);
