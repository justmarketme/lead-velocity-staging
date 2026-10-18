-- Voice handoff -> appointment request (manual allocation, 13 Oct 2026).
-- Lindi (smc-voice, WhatsApp-first) records a 'voice_callback_requested' activity when a caller declines WhatsApp and asks for
-- the adviser's office to call back and set up the appointment. That is an appointment request: put it in the CRM allocation
-- queue (appointments.status 'requested', method phone, the caller's preferred time as the window). A DB trigger keeps this
-- independent of the smc-voice code. Undo: undo/20261013211000_appointment_request_from_voice.undo.sql
CREATE OR REPLACE FUNCTION public.appointment_request_from_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_pref text := nullif(trim(coalesce(NEW.payload->>'preferred_time', '')), '');
  v_part text;
BEGIN
  IF NEW.lead_id IS NULL OR coalesce((NEW.payload->>'dry_run')::boolean, false) THEN RETURN NULL; END IF;
  v_part := CASE
    WHEN v_pref ~* 'morning|\mam\M|before (12|noon)' THEN 'morning'
    WHEN v_pref ~* 'lunch' THEN 'lunchtime'
    WHEN v_pref ~* 'afternoon|\mpm\M|after (12|noon|lunch)' THEN 'afternoon'
    WHEN v_pref ~* 'evening|after (5|6|work)' THEN 'evening'
    ELSE 'any' END;
  BEGIN
    PERFORM public.appointment_request_upsert(
      NEW.lead_id,
      jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('part', v_part, 'label', left(v_pref, 60)))),
      'phone', 'voice', NULL,
      'Caller asked for a call-back to set up the appointment' || CASE WHEN v_pref IS NOT NULL THEN ' (prefers ' || left(v_pref, 120) || ')' ELSE '' END || '.');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'appointment_request_from_activity: % (lead %)', SQLERRM, NEW.lead_id;  -- never block the timeline write
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.appointment_request_from_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS appointment_request_from_voice ON public.lead_activities;
CREATE TRIGGER appointment_request_from_voice
  AFTER INSERT ON public.lead_activities
  FOR EACH ROW WHEN (NEW.activity_type = 'voice_callback_requested')
  EXECUTE FUNCTION public.appointment_request_from_activity();
