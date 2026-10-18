-- Broker documents: signed contracts (and other per-broker files) housed in admin_documents, visible in that broker's portal.
-- Additive only: four nullable columns, one index, one table policy, one storage policy. Existing rows and policies untouched.
-- Undo: supabase/migrations/undo/20261012120000_broker_documents.undo.sql
BEGIN;

ALTER TABLE public.admin_documents
  ADD COLUMN IF NOT EXISTS broker_id uuid NULL REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text NULL,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS signed_by text NULL;

DO $$ BEGIN
  ALTER TABLE public.admin_documents
    ADD CONSTRAINT admin_documents_kind_check
    CHECK (kind IS NULL OR kind IN ('agreement', 'signed_agreement', 'authorisation_letter', 'invoice', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS admin_documents_broker_id_idx ON public.admin_documents (broker_id);

COMMENT ON COLUMN public.admin_documents.broker_id IS 'Broker this document belongs to (shown in that broker''s portal). NULL = library document.';
COMMENT ON COLUMN public.admin_documents.kind IS 'agreement | signed_agreement | authorisation_letter | invoice | other';
COMMENT ON COLUMN public.admin_documents.signed_by IS 'Who signed, e.g. "Mark Weston (Client); Kgomotso Pule, Director (Lead Velocity)"';

-- Admins keep "Admins can manage all documents" (ALL). A broker may additionally read rows that belong to him.
DROP POLICY IF EXISTS "Brokers can view their own documents" ON public.admin_documents;
CREATE POLICY "Brokers can view their own documents" ON public.admin_documents
  FOR SELECT TO authenticated
  USING (broker_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.brokers b WHERE b.id = admin_documents.broker_id AND b.user_id = auth.uid()));

-- Private bucket: a broker may read (and so sign a short-lived URL for) only files referenced by his own rows.
DROP POLICY IF EXISTS "Brokers can read their own documents" ON storage.objects;
CREATE POLICY "Brokers can read their own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'admin-documents' AND EXISTS (
    SELECT 1 FROM public.admin_documents ad JOIN public.brokers b ON b.id = ad.broker_id
    WHERE ad.file_path = objects.name AND b.user_id = auth.uid()));

COMMIT;
