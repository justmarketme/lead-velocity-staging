-- =============================================================================
-- 20261002090000_smc_09_storage.sql  —  SortMyCover build, migration 9: private `broker-media` bucket (I-30g)
-- Owner: devops-security. Drafted 2026-10-02. NOT applied anywhere (NH-11: the chain is applied by a human
-- after review; never by an agent, never to the live project from a session).
-- Additive and idempotent: re-running converges (bucket upsert keeps it private; policies are dropped and
-- recreated by name inside one transaction). Touches only bucket `broker-media` and policies named "smc broker-media …".
--
-- Model (same as 05/07, Supabase RLS patterns: enforced in the database, not the UI):
--   broker (authenticated)  read / write / delete objects under his own prefix  `<brokers.id>/…`
--                           (portal Profile.tsx uploads `${broker.id}/headshot-<ts>.<ext>`)
--   admin (authenticated + smc_is_admin())  read all objects in the bucket (no write: least privilege)
--   n8n_app                 read all objects in the bucket (W20 / visual-producer render the intro card)
--   anon                    nothing; the bucket is private, so every read is a signed URL or an authenticated GET
--
-- Notes
-- * RLS on storage.objects is already enabled by Supabase and the table belongs to supabase_storage_admin,
--   so this file never ALTERs it. It only creates policies (allowed for the postgres role on Supabase).
-- * Plain-Postgres fallback (0.1 "even if we stay on plain Postgres"): when the `storage` schema does not
--   exist the whole file is a NOTICE and a no-op; the media then lives on the VPS disk behind n8n.
-- * The env var `VITE_SMC_MEDIA_BUCKET` must equal the bucket id below (default `broker-media` in src/lib/smc.ts).
-- * Size/MIME limits: headshots (jpeg/png/webp) plus intro-media takes (mp4/webm video, m4a/webm/mpeg audio).
--   50 MB per object is the Supabase free-tier global ceiling; a larger value would be silently capped.
-- =============================================================================

BEGIN;

DO $mig$
DECLARE
  b constant text := 'broker-media';
  own constant text := $p$bucket_id = 'broker-media' AND (storage.foldername(name))[1] = public.smc_current_broker_id()::text$p$;
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'smc_09: no storage schema here (plain Postgres) - skipped';
    RETURN;
  END IF;

  -- 1. The bucket: private, size- and type-limited. Upsert keeps it private if someone flipped it public.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (b, b, false, 52428800,
          ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mp4','audio/mpeg','audio/webm'])
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- 2. Policies (drop + create by name = idempotent and converging)
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker read own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker insert own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker update own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker delete own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media admin read all" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media n8n_app read" ON storage.objects';

  EXECUTE format('CREATE POLICY "smc broker-media broker read own" ON storage.objects FOR SELECT TO authenticated USING (%s)', own);
  EXECUTE format('CREATE POLICY "smc broker-media broker insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (%s)', own);
  EXECUTE format('CREATE POLICY "smc broker-media broker update own" ON storage.objects FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', own, own);
  EXECUTE format('CREATE POLICY "smc broker-media broker delete own" ON storage.objects FOR DELETE TO authenticated USING (%s)', own);
  EXECUTE $q$CREATE POLICY "smc broker-media admin read all" ON storage.objects FOR SELECT TO authenticated
            USING (bucket_id = 'broker-media' AND public.smc_is_admin())$q$;

  -- 3. n8n_app (the workflows' DB role, migration 01): read-only, this bucket only.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA storage TO n8n_app';
    EXECUTE 'GRANT SELECT ON storage.objects, storage.buckets TO n8n_app';
    EXECUTE $q$CREATE POLICY "smc broker-media n8n_app read" ON storage.objects FOR SELECT TO n8n_app
              USING (bucket_id = 'broker-media')$q$;
  ELSE
    RAISE NOTICE 'smc_09: role n8n_app missing (apply 01 first) - n8n_app policy skipped';
  END IF;

  -- 4. anon: no policy = no access to this bucket.
  RAISE NOTICE 'smc_09: bucket % private, 6 policies in place', b;
END
$mig$;

COMMIT;
