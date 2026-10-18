-- =============================================================================
-- 20261011000000_smc_00_preflight_drift.sql  --  CRM nurture chain, file 0 of 8: reconcile the LIVE project with what 01..06 assume
-- Trimmed chain (branch crm-nurture, 2026-10-11): the SortMyCover WhatsApp nurture flow runs INSIDE the Lead Velocity CRM
-- (project cmsylaupctrbsvzrgzwy). Capacity comes from the CRM's own lead_orders; no cycles / billing / reports / facts / ops.
-- Runs FIRST. Additive and idempotent; it never alters or removes live data. Unchanged in substance from the reviewed smc_00.
--
-- Why it exists: production drifted from this repo (26 migrations applied there are not in the repo, and 5 columns that
-- repo migration 20260402120000_advanced_ayanda_integrations.sql says exist on public.brokers are absent live). See
-- supabase/migrations/DRIFT-REPORT.md.
-- =============================================================================

-- 1. Columns the chain reads (02 builds the generated alias adviser_whatsapp from whatsapp_number; the audit PII list names
--    calendar_email / google_calendar_token / firm_address). NULL-able, no default except preferred_language (as in the repo).
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS calendar_email        text,
  ADD COLUMN IF NOT EXISTS google_calendar_token jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_number       text,
  ADD COLUMN IF NOT EXISTS firm_address          text,
  ADD COLUMN IF NOT EXISTS preferred_language    text DEFAULT 'English';

-- 2. Name-collision guard. Live public.conversations (EMMA assistant) and public.reports (agency CRM) are TABLES, so this chain
--    never uses those names. If anyone created a TABLE under one of the names this chain creates as a VIEW, stop here with a
--    clear message instead of failing half way through file 02.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname IN ('bookings','smc_order_capacity')
              AND c.relkind NOT IN ('v')
  LOOP
    RAISE EXCEPTION 'smc_00 preflight: public.% exists as relkind % (expected: absent or a view). Resolve the name clash before applying the chain.', r.relname, r.relkind;
  END LOOP;
END $$;
