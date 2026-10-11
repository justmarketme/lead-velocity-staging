-- =============================================================================
-- 20261011070000_smc_07_security_sweep.sql  --  CRM nurture chain, file 7 of 8 (the last): final sweep + self-check
-- Same job as the reviewed smc_24: (1) strip the privileges RLS does not govern (TRUNCATE / REFERENCES / TRIGGER) and every
-- anon / PUBLIC privilege from the objects THIS chain created (named explicitly, so a table another app adds later is never
-- touched), then (2) ASSERT the posture: RLS on every chain table, nothing for anon / PUBLIC on chain tables, views and
-- sequences, both views security_invoker, every chain SECURITY DEFINER function with a pinned search_path and not executable
-- by anon / PUBLIC, the Vault read wrapper n8n_app-only, anon still locked out of every CRM table file 01 locked, and no object
-- of the dropped design present. Any failure aborts the file and rolls it back with a message naming the object. Idempotent.
-- =============================================================================

-- 1. Non-RLS privileges and anon / PUBLIC privileges on the chain's own relations and their sequences
DO $$
DECLARE
  chain_rel constant text[] := ARRAY['brands','webhook_events','outcomes','replacements','wa_threads','lead_offers','suppression',
                                     'escalations','broker_media','incidents','capi_log','bookings','smc_order_capacity'];
  r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m') AND c.relname = ANY (chain_rel)
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated', r.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', r.relname);
  END LOOP;
  -- identity / serial sequences owned by chain tables (Supabase default privileges give anon USAGE on new sequences)
  FOR r IN SELECT s.relname FROM pg_class s JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a','i')
             JOIN pg_class t ON t.oid = d.refobjid JOIN pg_namespace n ON n.oid = s.relnamespace
            WHERE s.relkind = 'S' AND n.nspname = 'public' AND t.relname = ANY (chain_rel)
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated', r.relname);
  END LOOP;
END $$;

-- 2. Self-check. Any failure aborts the file (and rolls it back) so the project is never left half-secured silently.
DO $$
DECLARE
  chain_tab constant text[] := ARRAY['brands','webhook_events','outcomes','replacements','wa_threads','lead_offers','suppression',
                                     'escalations','broker_media','incidents','capi_log'];
  chain_view constant text[] := ARRAY['bookings','smc_order_capacity'];
  locked constant text[] := ARRAY[   -- the CRM tables file 01 revokes from anon (those that exist)
    'leads','lead_activities','lead_conversations','communications','referrals','appointments','broker_notes','brokers','profiles',
    'user_roles','admin_documents','document_shares','admin_invites','broker_invites','broker_security_questions','ai_call_requests',
    'notification_preferences','scheduled_reports','report_history','sla_thresholds','sla_alerts','message_templates',
    'client_engagement_notes','call_coaching','system_logs','audit_log','lead_orders','lead_order_items','broker_feedback',
    'broker_followups','broker_activities'];
  bad text;
BEGIN
  -- 2a. every chain table exists and has RLS on
  SELECT string_agg(t, ', ') INTO bad FROM unnest(chain_tab) t
   WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind IN ('r','p') AND c.relrowsecurity);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: missing or RLS OFF: %', bad; END IF;

  -- 2b. anon / PUBLIC hold nothing on chain tables and views (table or column level) or on their sequences
  SELECT string_agg(DISTINCT x, ', ') INTO bad FROM (
    SELECT g.table_name || ' (' || g.grantee || ')' AS x FROM information_schema.role_table_grants g
     WHERE g.table_schema = 'public' AND g.grantee IN ('anon','PUBLIC') AND g.table_name = ANY (chain_tab || chain_view)
    UNION ALL
    SELECT g.table_name || '.' || g.column_name || ' (' || g.grantee || ')' FROM information_schema.column_privileges g
     WHERE g.table_schema = 'public' AND g.grantee IN ('anon','PUBLIC') AND g.table_name = ANY (chain_tab || chain_view)
    UNION ALL
    SELECT s.relname || ' (sequence)' FROM pg_class s JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a','i')
      JOIN pg_class t ON t.oid = d.refobjid JOIN pg_namespace n ON n.oid = s.relnamespace
     WHERE s.relkind = 'S' AND n.nspname = 'public' AND t.relname = ANY (chain_tab)
       AND (has_sequence_privilege('anon', s.oid, 'USAGE') OR has_sequence_privilege('anon', s.oid, 'SELECT') OR has_sequence_privilege('anon', s.oid, 'UPDATE'))
  ) q;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: anon / PUBLIC hold privileges on: %', bad; END IF;

  -- 2c. both chain views run with the caller's rights (base-table RLS applies)
  SELECT string_agg(v, ', ') INTO bad FROM unnest(chain_view) v
   WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
                        AND coalesce(c.reloptions, '{}') && ARRAY['security_invoker=true','security_invoker=on']);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: view not security_invoker: %', bad; END IF;

  -- 2d. chain SECURITY DEFINER functions: pinned search_path
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname = 'public' AND p.proname LIKE 'smc\_%'
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: SECURITY DEFINER without pinned search_path: %', bad; END IF;

  -- 2e. chain SECURITY DEFINER functions: not executable by anon / PUBLIC (the 19 pre-existing live RPCs are out of scope)
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname = 'public' AND p.proname LIKE 'smc\_%'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: SECURITY DEFINER callable by anon/PUBLIC: %', bad; END IF;

  -- 2f. the Vault read wrapper is n8n_app-only (service_role, authenticated, anon cannot read a calendar token)
  IF has_function_privilege('authenticated', 'public.smc_vault_ms_refresh(uuid)', 'EXECUTE')
     OR (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AND has_function_privilege('service_role', 'public.smc_vault_ms_refresh(uuid)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'smc_07 self-check: smc_vault_ms_refresh is executable by an API role';
  END IF;

  -- 2g. the live roles' posture was not widened: anon still has no SELECT / UPDATE / DELETE on any CRM table file 01 locked
  --     (broker_onboarding_responses / broker_reset_requests keep their deliberate anon INSERT and are not in this list)
  SELECT string_agg(DISTINCT g.table_name, ', ') INTO bad
    FROM information_schema.role_table_grants g
   WHERE g.grantee = 'anon' AND g.table_schema = 'public' AND g.table_name = ANY (locked);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: anon regained privileges on: %', bad; END IF;

  -- 2h. nothing of the dropped design exists (a stale file from the old chain was not applied by mistake)
  SELECT string_agg(x, ', ') INTO bad FROM (
    SELECT 'schema ' || nspname AS x FROM pg_namespace WHERE nspname IN ('ops','facts','smc_private')
    UNION ALL SELECT 'table ' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('cycles','pricing','invoices_smc','bank_credits','v_cycle_progress','smc_reports','ad_metrics','ads_launch_plan','ads_write_log')
  ) d;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'smc_07 self-check: objects of the dropped billing/reporting design exist: % (apply only the crm-nurture chain)', bad; END IF;

  RAISE NOTICE 'smc_07: security self-check passed';
END $$;
