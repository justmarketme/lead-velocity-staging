-- LOCAL rehearsal helper: freezes the baseline column list of every public base table, then _snap.take() returns
-- (table, row count, md5 of the baseline columns only) so "unchanged after" is provable even when smc adds columns.
CREATE SCHEMA IF NOT EXISTS _snap;
DROP TABLE IF EXISTS _snap.cols;
CREATE TABLE _snap.cols AS
  SELECT c.table_name::text AS t, string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) AS cols
  FROM information_schema.columns c JOIN information_schema.tables tb USING (table_schema, table_name)
  WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE' GROUP BY c.table_name;
CREATE OR REPLACE FUNCTION _snap.take() RETURNS TABLE(t text, n bigint, h text) LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM _snap.cols ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*), coalesce(md5(string_agg(x::text, ''|'' ORDER BY x::text)), ''-'') FROM (SELECT %s FROM public.%I) x', r.cols, r.t) INTO n, h;
    t := r.t; RETURN NEXT;
  END LOOP;
END $$;
-- baseline list of public function names (so the audit can tell "new" from "pre-existing")
DROP TABLE IF EXISTS _snap.fns;
CREATE TABLE _snap.fns AS SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
