-- Add content_data column to admin_documents table to support re-editing
ALTER TABLE public.admin_documents ADD COLUMN IF NOT EXISTS content_data JSONB;
