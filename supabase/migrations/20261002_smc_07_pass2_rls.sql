-- =============================================================================
-- 20261002_smc_07_pass2_rls.sql  —  SortMyCover build, migration 7: access control for pass 2
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied.
-- Same model as 05: admin all · broker own rows · n8n_app rw without DELETE · facts_reader facts only · anon nothing.
-- I-13: the console reads ops.* through the API once `ops` is an exposed schema (runbook §E);
-- every ops table is admin-only by RLS, so exposing the schema exposes nothing to brokers or anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Generic policy set for every new table (05 §1 pattern)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.support_events','public.ad_objects','public.creative_queue','public.comment_ad_sentiment',
    'public.dm_queue','public.dm_threads',
    'ops.billing_reports','ops.billing_actions_log','ops.secret_inventory','ops.backup_runs',
    'ops.infra_day','ops.page_day','ops.page_audits','ops.settings','ops.judge_runs','ops.build_state'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %s FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO n8n_app', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = t AND policyname = 'smc admin all') THEN
      EXECUTE format('CREATE POLICY "smc admin all" ON %s FOR ALL TO authenticated USING (public.smc_is_admin()) WITH CHECK (public.smc_is_admin())', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = t AND policyname = 'smc n8n_app rw') THEN
      EXECUTE format('CREATE POLICY "smc n8n_app rw" ON %s FOR ALL TO n8n_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
GRANT USAGE ON SEQUENCE public.dm_queue_id_seq TO n8n_app;
GRANT USAGE, SELECT ON SEQUENCE public.brokers_billing_ref_seq, public.invoices_smc_no_seq TO n8n_app;

-- Secrets inventory is metadata only, still nobody but admins and n8n reads it; the backup role inserts runs.
-- ops.settings: n8n reads (and the advisor writes its own caps); admins edit in the console.

-- updated_at + audit on the new tables that hold decisions (cache/queue tables are not audited: they churn hourly)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.support_events','public.creative_queue','public.ad_objects','public.dm_threads'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_touch_updated_at ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.support_events','public.creative_queue'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.smc_audit()', t);
  END LOOP;
  -- money tables written by billing: audited like the rest of the money path
  FOREACH t IN ARRAY ARRAY['ops.billing_actions_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.smc_audit()', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Broker policies (own rows only)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_events' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.support_events FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
  -- inserts go through smc_portal_event('support.message') so topic/source are server-set; no direct broker insert policy.
END $$;

-- -----------------------------------------------------------------------------
-- 3. Views
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.ads TO authenticated, n8n_app;
REVOKE ALL ON public.ads FROM anon;
-- bookings / reports were re-created with appended columns; grants survive CREATE OR REPLACE, repeated for clarity
GRANT SELECT ON public.bookings, public.reports TO authenticated, n8n_app;
REVOKE ALL ON public.bookings, public.reports FROM anon;

-- ops views: build line for the console (admin via RLS on ops.build_state), recipients + W22 metrics for n8n only
GRANT SELECT ON ops.build_state_latest TO authenticated, n8n_app;
REVOKE ALL ON ops.alert_recipients, ops.w22_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ops.alert_recipients, ops.w22_metrics TO n8n_app;

-- -----------------------------------------------------------------------------
-- 4. facts: new views readable by facts_reader + n8n_app, EXCEPT fact_broker_roi (FAIS 3.7: outside Ask-the-data)
-- -----------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA facts TO facts_reader, n8n_app;
REVOKE ALL ON ALL TABLES IN SCHEMA facts FROM anon, authenticated;
REVOKE ALL ON facts.fact_broker_roi FROM facts_reader, PUBLIC;
GRANT SELECT ON facts.fact_broker_roi TO n8n_app;      -- W14 broker report only (shown to that adviser alone)

-- -----------------------------------------------------------------------------
-- 5. Functions
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION ops.judge_samples(date), ops.proposal_actuals(date), ops.notifications_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ops.judge_samples(date), ops.proposal_actuals(date), ops.notifications_due() TO n8n_app;
GRANT EXECUTE ON FUNCTION ops.redact(text) TO n8n_app;
REVOKE ALL ON FUNCTION public.smc_portal_touch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_portal_touch() TO authenticated;
REVOKE ALL ON FUNCTION public.smc_portal_event(text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_portal_event(text, text, jsonb, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_report_ask_done(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_report_ask_done(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_watchlist_tiles(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_watchlist_tiles(boolean) TO authenticated;   -- admin check inside
-- trigger functions are not callable as RPCs
REVOKE ALL ON FUNCTION public.smc_brokers_billing_ref(), public.smc_pricing_notify(), public.smc_cycles_fill(),
                       public.smc_invoices_fill(), ops.notifications_sync_to() FROM PUBLIC, anon, authenticated;
