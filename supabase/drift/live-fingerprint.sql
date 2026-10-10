-- READ-ONLY. Fingerprint of the live public schema's structure (columns, constraints, indexes, policies, triggers, function signatures, RLS flags)
-- plus exact row counts of the business tables. Run it on the project right before applying and compare with the values recorded in
-- supabase/migrations/APPLY-RUNBOOK.md (captured 2026-10-10). Any difference = the project drifted since the review: STOP and re-run the drift check.
WITH cols AS (
  SELECT c.relname||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'') AS l
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r'),
cons AS (SELECT c.conrelid::regclass::text||'|'||c.conname||'|'||regexp_replace(pg_get_constraintdef(c.oid),'\s+',' ','g') AS l FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conparentid=0),
idxs AS (SELECT indexname||'|'||regexp_replace(indexdef,'\s+',' ','g') AS l FROM pg_indexes WHERE schemaname='public'),
pols AS (SELECT tablename||'|'||policyname||'|'||cmd||'|'||array_to_string(roles,',')||'|'||regexp_replace(coalesce(qual,''),'\s+',' ','g')||'|'||regexp_replace(coalesce(with_check,''),'\s+',' ','g') AS l FROM pg_policies WHERE schemaname='public'),
trgs AS (SELECT c.relname||'|'||t.tgname AS l FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
fns AS (SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||p.prosecdef AS l FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
rls AS (SELECT c.relname||'|'||c.relrowsecurity AS l FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r')
SELECT 'columns' AS part, count(*)::text AS n, md5(string_agg(l,E'\n' ORDER BY l)) AS md5 FROM cols
UNION ALL SELECT 'constraints', count(*)::text, md5(string_agg(l,E'\n' ORDER BY l)) FROM cons
UNION ALL SELECT 'indexes', count(*)::text, md5(string_agg(l,E'\n' ORDER BY l)) FROM idxs
UNION ALL SELECT 'policies', count(*)::text, md5(string_agg(l,E'\n' ORDER BY l)) FROM pols
UNION ALL SELECT 'triggers', count(*)::text, md5(string_agg(l,E'\n' ORDER BY l)) FROM trgs
UNION ALL SELECT 'functions', count(*)::text, md5(string_agg(l,E'\n' ORDER BY l)) FROM fns
UNION ALL SELECT 'rls_flags', count(*)::text, md5(string_agg(l,E'\n' ORDER BY l)) FROM rls
UNION ALL SELECT 'schemas_roles', (SELECT count(*) FROM pg_namespace WHERE nspname IN ('ops','facts','smc_private'))::text||'/'||(SELECT count(*) FROM pg_roles WHERE rolname IN ('n8n_app','facts_reader'))::text, 'expect 0/0 before the chain'
UNION ALL SELECT 'rows:brokers,leads,lead_order_items,audit_log,broker_onboarding_responses', (SELECT count(*) FROM brokers)||','||(SELECT count(*) FROM leads)||','||(SELECT count(*) FROM lead_order_items)||','||(SELECT count(*) FROM audit_log)||','||(SELECT count(*) FROM broker_onboarding_responses), '(2026-10-10: 18,4209,4200,41,14)';
