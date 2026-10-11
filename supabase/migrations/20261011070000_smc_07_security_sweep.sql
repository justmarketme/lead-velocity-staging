-- =============================================================================
-- 20261011070000_smc_07_security_sweep.sql  --  CRM nurture chain, file 7 of 8 (the last): final sweep + self-check
-- Same job as the reviewed smc_24: (1) strip the privileges RLS does not govern (TRUNCATE / REFERENCES / TRIGGER) from every
-- table and view the chain created, then (2) ASSERT the security posture: if any chain table lacks RLS, anon holds a privilege on
-- anything the chain created, a chain SECURITY DEFINER function has no pinned search_path or is executable by anon/PUBLIC, or anon
-- regained access to a CRM table file 01 locked, the whole file fails and rolls back naming the object. Touches no live table.
-- Idempotent. (File numbering: 00..07 = 8 files.)
-- =============================================================================

-- 1. Non-RLS privileges on chain-created relations (everything in public that is not one of the 46 live tables)
DO $$
DECLARE
  live_tables constant text[] := ARRAY['admin_documents','admin_invites','ai_call_requests','appointments','audit_log','broker_activities','broker_analysis',
    'broker_feedback','broker_followups','broker_invites','broker_notes','broker_onboarding_responses','broker_reset_requests','broker_security_questions',
    'brokers','call_coaching','call_transcripts','clients','communications','contact_submissions','conversation_messages','conversations','crm_activity',
    'deals','document_shares','events','lead_activities','lead_conversations','lead_order_items','lead_orders','leads','message_templates',
    'notification_preferences','profiles','referrals','report_history','reports','research_notes','scheduled_reports','sla_alerts','sla_thresholds',
    'system_logs','tasks','tunnel_config','upsells','user_roles'];
  r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r','p','v','m') AND n.nspname = 'public' AND c.relname <> ALL (live_tables)
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON %I.%I FROM PUBLIC, anon, authenticated', r.nspname, r.relname);
    EXECUTE format('REVOKE ALL ON %I.%I FROM PUBLIC, anon', r.nspname, r.relname);
  END LOOP;
END $$;

-- 2. Self-check. Any failure aborts the file (and rolls it back) so the project is never left half-secured silently.
DO $$
DECLARE
  live_tables constant text[] := ARRAY['admin_documents','admin_invites','ai_call_requests','appointments','audit_log','broker_activities','broker_analysis',
    'broker_feedback','broker_followups','broker_invites','broker_notes','broker_onboarding_responses','broker_reset_requests','broker_security_questions',
    'brokers','call_coaching','call_transcripts','clients','communications','contact_submissions','conversation_messages','conversations','crm_activity',
    'deals','document_shares','events','lead_activities','lead_conversations','lead_order_items','lead_orders','leads','message_templates',
    'notification_preferences','profiles','referrals','report_history','reports','research_notes','scheduled_reports','sla_alerts','sla_thresholds',
    'system_logs','tasks','tunnel_config','upsells','user_roles'];
  bad text;
BEGIN
  -- 2a. every chain table has RLS on
  SELECT string_agg(n.nspname || '.' || c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p') AND NOT c.relrowsecurity AND n.nspname = 'public' AND c.relname <> ALL (live_tables);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: RLS is OFF on: %', bad; END IF;

  -- 2b. anon holds nothing on anything the chain created (tables, views)
  SELECT string_agg(DISTINCT g.table_schema || '.' || g.table_name, ', ') INTO bad
    FROM information_schema.role_table_grants g
   WHERE g.grantee = 'anon' AND g.table_schema = 'public' AND g.table_name <> ALL (live_tables);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: anon holds privileges on: %', bad; END IF;

  -- 2c. chain SECURITY DEFINER functions: pinned search_path
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname = 'public' AND p.proname LIKE 'smc\_%'
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: SECURITY DEFINER without pinned search_path: %', bad; END IF;

  -- 2d. chain SECURITY DEFINER functions: not executable by anon / PUBLIC (the 19 pre-existing live RPCs are out of scope)
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname = 'public' AND p.proname LIKE 'smc\_%'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: SECURITY DEFINER callable by anon/PUBLIC: %', bad; END IF;

  -- 2e. the Vault read wrapper is n8n_app-only (service_role, authenticated, anon cannot read a calendar token)
  IF has_function_privilege('authenticated', 'public.smc_vault_ms_refresh(uuid)', 'EXECUTE')
     OR (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AND has_function_privilege('service_role', 'public.smc_vault_ms_refresh(uuid)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'smc_07 self-check: smc_vault_ms_refresh is executable by an API role';
  END IF;

  -- 2f. the live roles' posture was not widened: anon still has nothing on the CRM tables file 01 locked
  SELECT string_agg(g.table_name, ', ') INTO bad
    FROM information_schema.role_table_grants g
   WHERE g.grantee = 'anon' AND g.table_schema = 'public'
     AND g.table_name IN ('leads','brokers','appointments','communications','lead_activities','profiles','user_roles','audit_log','lead_orders','lead_order_items');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: anon regained privileges on: %', bad; END IF;

  -- 2g. nothing of the dropped design exists (a stale file from the old chain was not applied by mistake)
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT 'schema ' || nspname AS x FROM pg_namespace WHERE nspname IN ('ops','facts','smc_private')
    UNION ALL SELECT 'table ' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('cycles','pricing','invoices_smc','bank_credits','v_cycle_progress','smc_reports','ad_metrics','ads_launch_plan','ads_write_log')
  ) d;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: objects of the dropped billing/reporting design exist: % (apply only the crm-nurture chain)', bad; END IF;

  RAISE NOTICE 'smc_07: security self-check passed';
END $$;
