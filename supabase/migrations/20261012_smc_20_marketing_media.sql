-- =============================================================================
-- 20261012_smc_20_marketing_media.sql  --  public bucket for non-sensitive marketing media
--   marketing-media  PUBLIC read (anyone with the URL), admin write. Holds films, posters and other material
--                    that is safe on the open web, e.g. broker-onboarding/what-happens-next-720p.mp4.
-- Kept apart from broker-media on purpose: that bucket is private (headshots, voice takes, no-show proof) and
-- must never be made public. The service role bypasses RLS, so scripted uploads need no policy.
-- Idempotent: safe to re-run.
-- =============================================================================
DO $mig$
DECLARE
  b constant text := 'marketing-media';
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'smc_20: no storage schema here (plain Postgres) - skipped';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (b, b, true, 52428800, ARRAY['video/mp4','video/webm','image/jpeg','image/png','image/webp','text/vtt'])
  ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  EXECUTE 'DROP POLICY IF EXISTS "smc marketing-media admin insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc marketing-media admin update" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc marketing-media admin delete" ON storage.objects';
  EXECUTE $q$CREATE POLICY "smc marketing-media admin insert" ON storage.objects FOR INSERT TO authenticated
            WITH CHECK (bucket_id = 'marketing-media' AND public.smc_is_admin())$q$;
  EXECUTE $q$CREATE POLICY "smc marketing-media admin update" ON storage.objects FOR UPDATE TO authenticated
            USING (bucket_id = 'marketing-media' AND public.smc_is_admin())
            WITH CHECK (bucket_id = 'marketing-media' AND public.smc_is_admin())$q$;
  EXECUTE $q$CREATE POLICY "smc marketing-media admin delete" ON storage.objects FOR DELETE TO authenticated
            USING (bucket_id = 'marketing-media' AND public.smc_is_admin())$q$;
  RAISE NOTICE 'smc_20: bucket % public read, admin write', b;
END
$mig$;
