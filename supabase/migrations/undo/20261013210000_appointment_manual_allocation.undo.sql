-- Undo 20261013210000_appointment_manual_allocation. Run only when no 'requested' rows remain (they have no appointment_date).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'smc-appointment-request-sweep';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.appointment_cancel(uuid, text);
DROP FUNCTION IF EXISTS public.appointment_allocate(uuid, uuid, timestamptz, integer, text, text);
DROP FUNCTION IF EXISTS public.appointment_request_sweep();
DROP FUNCTION IF EXISTS public.appointment_request_upsert(uuid, jsonb, text, text, text, text);
REVOKE EXECUTE ON FUNCTION public.smc_vault_ms_refresh(uuid) FROM service_role;
DROP POLICY IF EXISTS "smc broker sees verified bookings only" ON public.appointments;
CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin() OR (status <> 'pending_verification' AND public.smc_lead_email_verified(client_id)));
DROP INDEX IF EXISTS public.appointments_one_open_request;
DELETE FROM public.appointments WHERE appointment_date IS NULL;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_smc_checks;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_smc_checks CHECK (((brand_id IS NULL) OR ((status = ANY (ARRAY['pending_verification'::text, 'booked'::text, 'confirmed'::text, 'rescheduled'::text, 'cancelled'::text, 'attended'::text, 'no_show'::text])) AND ((status <> 'pending_verification'::text) OR (verify_by IS NOT NULL)) AND (method = ANY (ARRAY['teams'::text, 'zoom'::text, 'meet'::text, 'whatsapp_call'::text, 'phone'::text])) AND (ends_at IS NOT NULL) AND (ends_at > appointment_date) AND (broker_id IS NOT NULL) AND (client_id IS NOT NULL) AND ((booked_via IS NULL) OR (booked_via = ANY (ARRAY['page'::text, 'flow'::text, 'list'::text, 'chat'::text, 'console'::text]))) AND ((calendar_provider IS NULL) OR (calendar_provider = ANY (ARRAY['outlook'::text, 'google'::text, 'shared_lv'::text]))) AND ((invite_email_status IS NULL) OR (invite_email_status = ANY (ARRAY['not_needed'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'corrected'::text]))))));
ALTER TABLE public.appointments ALTER COLUMN appointment_date SET NOT NULL;
ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS requested_windows, DROP COLUMN IF EXISTS request_source, DROP COLUMN IF EXISTS consent_ref,
  DROP COLUMN IF EXISTS requested_at, DROP COLUMN IF EXISTS allocated_by, DROP COLUMN IF EXISTS allocated_at,
  DROP COLUMN IF EXISTS calendar_email, DROP COLUMN IF EXISTS invite_sequence;
