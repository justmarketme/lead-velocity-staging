-- companion of catalog-dump.sql: full function and view definitions (used by gen-undo.mjs to restore replaced objects).
-- record separator is \x1e between objects; first line of each record is the key.
SELECT string_agg(k || E'\n' || d, E'\x1e' ORDER BY k) FROM (
  SELECT 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS k, pg_get_functiondef(p.oid) AS d
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('public','ops','facts','smc_private') AND p.prokind IN ('f','p') AND NOT EXISTS (SELECT 1 FROM pg_depend x WHERE x.objid=p.oid AND x.deptype='e')
  UNION ALL
  SELECT 'view|'||n.nspname||'.'||c.relname, 'CREATE VIEW '||n.nspname||'.'||c.relname||coalesce(' WITH ('||array_to_string(c.reloptions,',')||')','')||' AS '||pg_get_viewdef(c.oid, true)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','ops','facts','smc_private') AND c.relkind='v'
) q;
