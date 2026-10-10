-- Run after automation/tests/fixtures/pg-stub.sql and BEFORE real-public-schema-*.sql. Local rehearsal only.
-- Mirrors live default privileges: objects created by the migration role in public get ALL for anon/authenticated/service_role
-- (this is what makes "REVOKE ... FROM PUBLIC" alone insufficient on Supabase: anon holds a DIRECT grant).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
-- live roles that the stub lacks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
END $$;
-- live: uuid-ossp and pgcrypto live in schema "extensions"; roles search_path = "$user", public, extensions
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS pgcrypto;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
ALTER DATABASE postgres SET search_path = "$user", public, extensions;
