-- =============================================================================
-- 20261010240000_smc_24_security_sweep.sql  --  final sweep + self-check for the whole smc chain (added 2026-10-10)
-- Runs LAST. It (1) strips the privileges Row Level Security does not govern (TRUNCATE / REFERENCES / TRIGGER) from every
-- table and view the chain created, (2) hardens the read-only reporting role, and (3) ASSERTS the security posture: if any chain
-- table lacks RLS, anon holds a privilege on anything the chain created, or a chain SECURITY DEFINER function has no pinned
-- search_path or can be executed by anon/PUBLIC, the whole file fails and rolls back with a message naming the object.
-- Touches no pre-existing (live) table. Idempotent.
-- =============================================================================

-- 1. Non-RLS privileges on chain-created relations (names derived: everything in these schemas that is not one of the 46 live tables)
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
            WHERE c.relkind IN ('r','p','v','m')
              AND ((n.nspname = 'public' AND c.relname <> ALL (live_tables)) OR n.nspname IN ('ops','smc_private'))
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON %I.%I FROM PUBLIC, anon, authenticated', r.nspname, r.relname);
    EXECUTE format('REVOKE ALL ON %I.%I FROM PUBLIC, anon', r.nspname, r.relname);
  END LOOP;
END $$;

-- 2. facts_reader ("Ask the data" runs LLM-written SQL): read-only by default, bounded, no stray connections.
--    A session can still override session-level settings, so ALSO enforce read-only and the timeout on the connection string / pooler.
ALTER ROLE facts_reader CONNECTION LIMIT 3;
ALTER ROLE facts_reader SET default_transaction_read_only = on;
ALTER ROLE facts_reader SET idle_in_transaction_session_timeout = '10s';

-- 3. Self-check. Any failure aborts the file (and rolls it back) so the project is never left half-secured silently.
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
  -- 3a. every chain table has RLS on
  SELECT string_agg(n.nspname || '.' || c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p') AND NOT c.relrowsecurity
     AND ((n.nspname = 'public' AND c.relname <> ALL (live_tables)) OR n.nspname IN ('ops','smc_private'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_24 self-check: RLS is OFF on: %', bad; END IF;

  -- 3b. anon holds nothing on anything the chain created (tables, views, sequences)
  SELECT string_agg(DISTINCT g.table_schema || '.' || g.table_name, ', ') INTO bad
    FROM information_schema.role_table_grants g
   WHERE g.grantee = 'anon'
     AND ((g.table_schema = 'public' AND g.table_name <> ALL (live_tables)) OR g.table_schema IN ('ops','facts','smc_private'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_24 self-check: anon holds privileges on: %', bad; END IF;

  -- 3c. chain SECURITY DEFINER functions: pinned search_path
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef
     AND ((n.nspname = 'public' AND p.proname LIKE 'smc\_%') OR n.nspname IN ('ops','facts','smc_private'))
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_24 self-check: SECURITY DEFINER without pinned search_path: %', bad; END IF;

  -- 3d. chain SECURITY DEFINER functions: not executable by anon / PUBLIC (the 19 pre-existing live RPCs are not in scope here)
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef
     AND ((n.nspname = 'public' AND p.proname LIKE 'smc\_%') OR n.nspname IN ('ops','facts','smc_private'))
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_24 self-check: SECURITY DEFINER callable by anon/PUBLIC: %', bad; END IF;

  -- 3e. the live roles' posture was not widened: anon still has no SELECT/UPDATE/DELETE on the tables smc_01 locked
  SELECT string_agg(g.table_name, ', ') INTO bad
    FROM information_schema.role_table_grants g
   WHERE g.grantee = 'anon' AND g.table_schema = 'public'
     AND g.table_name IN ('leads','brokers','appointments','communications','lead_activities','profiles','user_roles','audit_log','lead_orders','lead_order_items');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_24 self-check: anon regained privileges on: %', bad; END IF;

  RAISE NOTICE 'smc_24: security self-check passed';
END $$;
