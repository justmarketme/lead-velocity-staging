ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_start_page_check;
ALTER TABLE public.brands DROP COLUMN IF EXISTS start_page;
