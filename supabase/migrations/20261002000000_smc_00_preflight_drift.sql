-- =============================================================================
-- 20261002000000_smc_00_preflight_drift.sql  --  SortMyCover: reconcile the LIVE project with what smc_01..23 assume
-- Written 2026-10-10 from a read-only capture of project cmsylaupctrbsvzrgzwy (see supabase/migrations/DRIFT-REPORT.md).
-- Runs FIRST. Everything here is additive and idempotent; it never alters or removes live data.
--
-- Why it exists: production drifted from this repo (26 migrations applied there are not in the repo, and 5 columns that
-- repo migration 20260402120000_advanced_ayanda_integrations.sql says exist on public.brokers are absent live). The
-- smc chain was only ever rehearsed against the repo-replayed schema, so it assumed those columns and a few free names.
-- =============================================================================

-- 1. Columns the smc chain reads (smc_06 builds the generated column adviser_whatsapp from whatsapp_number; the audit
--    PII list names calendar_email / google_calendar_token / firm_address). Repo migration 20260402120000 is recorded as
--    applied live but these did not survive (drift). NULL-able, no default except preferred_language (as in the repo).
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS calendar_email        text,
  ADD COLUMN IF NOT EXISTS google_calendar_token jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_number       text,
  ADD COLUMN IF NOT EXISTS firm_address          text,
  ADD COLUMN IF NOT EXISTS preferred_language    text DEFAULT 'English';

-- 2. Name-collision guard. The smc views are named smc_conversations / smc_reports because live public.conversations
--    (EMMA assistant) and public.reports (agency CRM) are TABLES. If anyone created a TABLE with an smc_ name since,
--    stop here with a clear message instead of failing half way through smc_02/03.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname IN ('smc_conversations','smc_reports','bookings','v_cycle_progress')
              AND c.relkind NOT IN ('v')
  LOOP
    RAISE EXCEPTION 'smc_00 preflight: public.% exists as relkind % (expected: absent or a view). Resolve the name clash before applying the smc chain.', r.relname, r.relkind;
  END LOOP;
END $$;
