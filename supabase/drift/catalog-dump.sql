-- Normalised, line-per-fact dump of public + ops + facts + smc_private (+ storage policies, buckets, roles, extensions).
-- Run on two databases (or before/after a migration) and diff. usage: psql -At -f catalog-dump.sql > out.txt
-- Names are schema-qualified. Line kinds: schema col rel con idx pol trg fn tgrant bucket enum role ext seq
SELECT * FROM (
 SELECT 'schema|'||nspname AS l FROM pg_namespace WHERE nspname IN ('ops','facts','smc_private')
 UNION ALL SELECT 'ext|'||extname FROM pg_extension
 UNION ALL SELECT 'role|'||rolname||'|login='||rolcanlogin||'|cfg='||coalesce(array_to_string(rolconfig,','),'') FROM pg_roles WHERE rolname IN ('n8n_app','facts_reader')
 UNION ALL
 SELECT 'col|'||n.nspname||'.'||c.relname||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||CASE WHEN a.attnotnull THEN 'NN' ELSE 'null' END||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||'|'||CASE WHEN a.attgenerated<>'' THEN 'GEN' ELSE '' END
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname IN ('public','ops','facts','smc_private') AND c.relkind IN ('r','p','v')
 UNION ALL SELECT 'rel|'||n.nspname||'.'||c.relname||'|'||c.relkind::text||'|rls='||c.relrowsecurity||'|opts='||coalesce(array_to_string(c.reloptions,','),'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','ops','facts','smc_private') AND c.relkind IN ('r','v','m','p')
 UNION ALL SELECT 'con|'||c.conrelid::regclass::text||'|'||c.conname||'|'||regexp_replace(pg_get_constraintdef(c.oid),'\s+',' ','g') FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','ops','facts','smc_private') AND c.conparentid=0
 UNION ALL SELECT 'idx|'||schemaname||'.'||tablename||'|'||indexname||'|'||regexp_replace(indexdef,'\s+',' ','g') FROM pg_indexes WHERE schemaname IN ('public','ops','facts','smc_private') AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE contype IN ('p','u','x'))
 UNION ALL SELECT 'pol|'||schemaname||'.'||tablename||'|'||policyname||'|'||permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||regexp_replace(coalesce(qual,''),'\s+',' ','g')||'|'||regexp_replace(coalesce(with_check,''),'\s+',' ','g') FROM pg_policies WHERE schemaname IN ('public','ops','facts','smc_private','storage')
 UNION ALL SELECT 'trg|'||c.oid::regclass::text||'|'||t.tgname||'|'||regexp_replace(pg_get_triggerdef(t.oid),'\s+',' ','g') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','ops','facts','smc_private') AND NOT tgisinternal
 UNION ALL SELECT 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|secdef='||p.prosecdef||'|cfg='||coalesce(array_to_string(p.proconfig,','),'')||'|anon='||has_function_privilege('anon',p.oid,'EXECUTE')||'|auth='||has_function_privilege('authenticated',p.oid,'EXECUTE')||'|svc='||has_function_privilege('service_role',p.oid,'EXECUTE')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','ops','facts','smc_private') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
 UNION ALL SELECT 'tgrant|'||table_schema||'.'||table_name||'|'||grantee||'|'||string_agg(privilege_type,',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema IN ('public','ops','facts','smc_private') AND grantee IN ('anon','authenticated','service_role','n8n_app','facts_reader') GROUP BY table_schema, table_name, grantee
 UNION ALL SELECT 'bucket|'||id||'|public='||public||'|limit='||coalesce(file_size_limit::text,'')||'|mimes='||coalesce(array_to_string(allowed_mime_types,','),'') FROM storage.buckets
 UNION ALL SELECT 'enum|'||t.typname||'|'||string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname
) q ORDER BY l;
