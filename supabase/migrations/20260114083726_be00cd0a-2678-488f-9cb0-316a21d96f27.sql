-- Create storage bucket for admin documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('admin-documents', 'admin-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for admin documents bucket
CREATE POLICY "Admins can view all documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

-- Create a table to track document metadata
CREATE TABLE public.admin_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  category TEXT DEFAULT 'general',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_documents ENABLE ROW LEVEL SECURITY;

-- Only admins can manage documents
CREATE POLICY "Admins can manage all documents"
ON public.admin_documents FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_admin_documents_updated_at
BEFORE UPDATE ON public.admin_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();