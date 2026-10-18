-- brands.start_page: the /start/ page switch (Jono, 18 Oct 2026). 'on' = W03 sends ONE call-to-action with the link
-- sortmycover.co.za/start/#lt=<lead token> instead of the first qualifying tap (q_age); the page answers through W39.
-- Default 'off': nothing changes until an admin flips it (UPDATE public.brands SET start_page = 'on' WHERE code = 'SMC').
-- W03 "Load context" reads it through to_jsonb(br), so W03 works with or without this column.
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS start_page text NOT NULL DEFAULT 'off';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brands_start_page_check' AND conrelid = 'public.brands'::regclass) THEN
    ALTER TABLE public.brands ADD CONSTRAINT brands_start_page_check CHECK (start_page IN ('off', 'on'));
  END IF;
END $$;
COMMENT ON COLUMN public.brands.start_page IS 'SMC /start/ page switch (W03 call-to-action link, W39 API): off | on. Default off.';
