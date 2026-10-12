-- Broker self-service (portal): practice name, FSP number and business WhatsApp number, plus proof-of-payment documents.
-- Additive: one nullable column, one SECURITY DEFINER function, a widened check constraint. Existing rows untouched.
-- Undo: supabase/migrations/undo/20261012180000_broker_self_service.undo.sql
BEGIN;

-- When the broker confirmed (or entered) his business WhatsApp number in the portal.
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS whatsapp_confirmed_at timestamptz NULL;
COMMENT ON COLUMN public.brokers.whatsapp_confirmed_at IS 'Set by broker_update_profile() when the broker confirms or enters his business WhatsApp number.';

-- The only path a broker uses to change these three fields. RLS cannot limit columns, and smc_brokers_guard (rightly) stops a
-- broker without a SortMyCover order from touching fsp_number directly; this function edits exactly these columns on the
-- caller's own row, validates them, and keeps the guard's rule that they are frozen while routing is on.
-- NULL argument = leave unchanged. Returns the saved values.
CREATE OR REPLACE FUNCTION public.broker_update_profile(
  p_firm_name text DEFAULT NULL,
  p_fsp_number text DEFAULT NULL,
  p_whatsapp_number text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid := public.smc_current_broker_id();
  v_old public.brokers%ROWTYPE;
  v_firm text := NULLIF(btrim(p_firm_name), '');
  v_fsp text := NULLIF(regexp_replace(regexp_replace(coalesce(p_fsp_number, ''), '\s+', '', 'g'), '^fsp', '', 'i'), '');
  v_wa text := NULLIF(regexp_replace(coalesce(p_whatsapp_number, ''), '[\s()-]+', '', 'g'), '');
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No broker profile for this login' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old FROM public.brokers WHERE id = v_id FOR UPDATE;

  IF v_firm IS NOT NULL AND (length(v_firm) < 2 OR length(v_firm) > 120) THEN
    RAISE EXCEPTION 'Practice name: 2 to 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_fsp IS NOT NULL AND v_fsp !~ '^[0-9]{3,6}$' THEN
    RAISE EXCEPTION 'FSP number: digits only, 3 to 6 of them' USING ERRCODE = '22023';
  END IF;
  IF v_wa IS NOT NULL THEN
    IF v_wa ~ '^0[0-9]{9}$' THEN v_wa := '+27' || substr(v_wa, 2); END IF;
    IF v_wa ~ '^27[0-9]{9}$' THEN v_wa := '+' || v_wa; END IF;
    IF v_wa !~ '^\+27[1-9][0-9]{8}$' THEN
      RAISE EXCEPTION 'WhatsApp number: a South African number like +27 82 123 4567' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Same rule as smc_brokers_guard: these names reach consumers, so they are frozen while leads are being routed.
  IF v_old.routing_on AND (
       (v_firm IS NOT NULL AND v_firm IS DISTINCT FROM v_old.firm_name)
    OR (v_fsp  IS NOT NULL AND v_fsp  IS DISTINCT FROM v_old.fsp_number)
    OR (v_wa   IS NOT NULL AND v_wa   IS DISTINCT FROM v_old.whatsapp_number)) THEN
    RAISE EXCEPTION 'These details are locked while you receive leads; ask Lead Velocity to change them' USING ERRCODE = '42501';
  END IF;

  UPDATE public.brokers SET
    firm_name = coalesce(v_firm, firm_name),
    fsp_number = coalesce(v_fsp, fsp_number),
    whatsapp_number = coalesce(v_wa, whatsapp_number),
    whatsapp_confirmed_at = CASE WHEN v_wa IS NOT NULL THEN now() ELSE whatsapp_confirmed_at END,
    updated_at = now()
  WHERE id = v_id;

  RETURN (SELECT jsonb_build_object('firm_name', firm_name, 'fsp_number', fsp_number,
                                    'whatsapp_number', whatsapp_number, 'whatsapp_confirmed_at', whatsapp_confirmed_at)
          FROM public.brokers WHERE id = v_id);
END $$;

REVOKE ALL ON FUNCTION public.broker_update_profile(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_update_profile(text, text, text) TO authenticated;

-- Proof of payment joins the per-broker document kinds (migration 20261012120000).
ALTER TABLE public.admin_documents DROP CONSTRAINT IF EXISTS admin_documents_kind_check;
ALTER TABLE public.admin_documents ADD CONSTRAINT admin_documents_kind_check
  CHECK (kind IS NULL OR kind IN ('agreement', 'signed_agreement', 'authorisation_letter', 'invoice', 'proof_of_payment', 'other'));
COMMENT ON COLUMN public.admin_documents.kind IS 'agreement | signed_agreement | authorisation_letter | invoice | proof_of_payment | other. proof_of_payment: content_data = {amount_zar, paid_on (YYYY-MM-DD), reference, order_id?}';

COMMIT;
