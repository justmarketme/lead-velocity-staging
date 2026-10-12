-- UNDO of 20261012180000_broker_self_service.sql. Fails if a proof_of_payment row exists (delete or re-kind it first).
-- Dropping whatsapp_confirmed_at loses the confirmation timestamps (the numbers themselves stay). Run in one transaction.
BEGIN;
ALTER TABLE public.admin_documents DROP CONSTRAINT IF EXISTS admin_documents_kind_check;
ALTER TABLE public.admin_documents ADD CONSTRAINT admin_documents_kind_check
  CHECK (kind IS NULL OR kind IN ('agreement', 'signed_agreement', 'authorisation_letter', 'invoice', 'other'));
DROP FUNCTION IF EXISTS public.broker_update_profile(text, text, text);
ALTER TABLE public.brokers DROP COLUMN IF EXISTS whatsapp_confirmed_at;
COMMIT;
