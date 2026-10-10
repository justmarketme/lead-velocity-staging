-- LOCAL ONLY: needs the _snap.cols / _snap.fns baseline tables created by snapshot-baseline.sql (it separates "new smc objects" from the 46 live tables). On the live project use supabase/migrations/20261010240000_smc_24_security_sweep.sql (it asserts the same things) and the Supabase advisors.
-- LOCAL rehearsal (and, read-only, usable on the live project after apply): security posture of everything the smc chain added.
-- Each section prints rows ONLY when something is wrong, so an empty result = pass.
\echo '--- 1. tables in public/ops/facts/smc_private without RLS (excluding facts views)'
SELECT n.nspname||'.'||c.relname AS table_without_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ops','smc_private') AND c.relkind IN ('r','p') AND NOT c.relrowsecurity ORDER BY 1;
\echo '--- 2. tables/views where anon holds ANY privilege (new smc objects only: not in the baseline list)'
SELECT DISTINCT g.table_schema||'.'||g.table_name||' anon:'||string_agg(g.privilege_type, ',') AS anon_grant
 FROM information_schema.role_table_grants g
 WHERE g.grantee='anon' AND g.table_schema IN ('public','ops','facts','smc_private')
   AND g.table_name NOT IN (SELECT t FROM _snap.cols)
 GROUP BY g.table_schema, g.table_name ORDER BY 1;
\echo '--- 3. anon privileges still held on PRE-EXISTING tables (compare with live baseline: ALL on everything)'
SELECT g.table_name, string_agg(g.privilege_type, ',' ORDER BY g.privilege_type) AS anon_privs
 FROM information_schema.role_table_grants g WHERE g.grantee='anon' AND g.table_schema='public' AND g.table_name IN (SELECT t FROM _snap.cols)
 GROUP BY g.table_name ORDER BY 1;
\echo '--- 4. SECURITY DEFINER functions (public/ops/facts/smc_private) without a pinned search_path'
SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS definer_without_search_path
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','ops','facts','smc_private') AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%') ORDER BY 1;
\echo '--- 5. SECURITY DEFINER functions executable by anon or PUBLIC (smc_* / new only; pre-existing live ones listed in section 5b)'
SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS anon_callable_definer
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','ops','facts','smc_private') AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
   AND p.proname NOT IN (SELECT proname FROM _snap.fns) ORDER BY 1;
\echo '--- 5b. pre-existing live SECURITY DEFINER functions anon can execute AFTER the chain (baseline had 19)'
SELECT count(*) AS preexisting_anon_callable_definers FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE') AND p.proname IN (SELECT proname FROM _snap.fns);
\echo '--- 6. views in public/ops/facts that are not security_invoker (run with owner rights)'
SELECT n.nspname||'.'||c.relname AS view_not_security_invoker FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ops','facts','smc_private') AND c.relkind='v'
   AND NOT coalesce((SELECT bool_or(o = 'security_invoker=true' OR o = 'security_invoker=on') FROM unnest(coalesce(c.reloptions,'{}')) o), false) ORDER BY 1;
\echo '--- 7. RLS-enabled new tables with NO policy (only service_role/BYPASSRLS roles can read them)'
SELECT n.nspname||'.'||c.relname AS rls_no_policy FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','ops','smc_private') AND c.relkind='r' AND c.relrowsecurity AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname=n.nspname AND p.tablename=c.relname) ORDER BY 1;
\echo '--- 8. policies that are USING (true) / WITH CHECK (true) for anon or public (new, after chain)'
SELECT schemaname||'.'||tablename||' | '||policyname||' | '||cmd||' | '||array_to_string(roles,',') AS open_policy FROM pg_policies
 WHERE (qual='true' OR with_check='true') AND ('anon'=ANY(roles) OR 'public'=ANY(roles)) ORDER BY 1;
\echo '--- 9. storage buckets and policies'
SELECT id, public FROM storage.buckets ORDER BY 1;
SELECT policyname, cmd, array_to_string(roles,',') AS roles FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY 1;
\echo '--- 10. roles created by the chain'
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolconfig FROM pg_roles WHERE rolname IN ('n8n_app','facts_reader');
\echo '--- 11. secret-looking literals in function bodies (sk_, EAA, Bearer, eyJ, password)'
SELECT n.nspname||'.'||p.proname AS suspicious FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','ops','facts','smc_private') AND p.prosrc ~* '(sk_live|sk_test|EAA[A-Za-z0-9]{10}|Bearer [A-Za-z0-9]{20}|eyJ[A-Za-z0-9]{20}|password\s*=\s*''[^'']+'')' ORDER BY 1;
