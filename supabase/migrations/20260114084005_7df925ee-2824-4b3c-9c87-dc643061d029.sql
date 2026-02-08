-- Create table to track document shares with brokers
CREATE TABLE public.document_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.admin_documents(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL,
  shared_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, broker_id)
);

-- Enable RLS
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

-- Admins can manage all shares
CREATE POLICY "Admins can manage document shares"
ON public.document_shares FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Brokers can view their own shares
CREATE POLICY "Brokers can view their shares"
ON public.document_shares FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.brokers 
  WHERE brokers.id = document_shares.broker_id 
  AND brokers.user_id = auth.uid()
));

-- Allow brokers to view shared documents metadata
CREATE POLICY "Brokers can view shared documents"
ON public.admin_documents FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.document_shares ds
    JOIN public.brokers b ON b.id = ds.broker_id
    WHERE ds.document_id = admin_documents.id
    AND b.user_id = auth.uid()
  )
);

-- Allow brokers to download shared files from storage
CREATE POLICY "Brokers can download shared documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'admin-documents' AND (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.admin_documents ad
      JOIN public.document_shares ds ON ds.document_id = ad.id
      JOIN public.brokers b ON b.id = ds.broker_id
      WHERE ad.file_path = name
      AND b.user_id = auth.uid()
    )
  )
);