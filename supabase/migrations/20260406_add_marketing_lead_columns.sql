
-- Relax source constraint and add missing lead columns
ALTER TABLE public.leads 
  DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE public.leads 
  ADD CONSTRAINT leads_source_check 
  CHECK (source IS NULL OR source = '' OR TRUE); -- Effectively relax it completely or allow any string

-- Add missing columns for marketing leads
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS vibe INTEGER;

-- Update types.ts manually if needed (Antigravity will handle the frontend code)
