-- UNDO of 20261012120000_broker_documents.sql
-- Dropping the columns deletes broker_id / kind / signed_at / signed_by values written since the apply (the rows and files stay;
-- they become plain library documents again). Run in one transaction.
BEGIN;
DROP POLICY IF EXISTS "Brokers can read their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Brokers can view their own documents" ON public.admin_documents;
DROP INDEX IF EXISTS public.admin_documents_broker_id_idx;
ALTER TABLE public.admin_documents DROP CONSTRAINT IF EXISTS admin_documents_kind_check;
ALTER TABLE public.admin_documents
  DROP COLUMN IF EXISTS signed_by,
  DROP COLUMN IF EXISTS signed_at,
  DROP COLUMN IF EXISTS kind,
  DROP COLUMN IF EXISTS broker_id;
COMMIT;
