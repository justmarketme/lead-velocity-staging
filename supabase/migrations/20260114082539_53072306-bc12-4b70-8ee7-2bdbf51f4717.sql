-- Add email column to brokers table for notifications
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS email text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_brokers_email ON public.brokers(email);