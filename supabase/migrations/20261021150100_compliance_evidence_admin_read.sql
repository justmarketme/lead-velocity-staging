-- =============================================================================
-- 20261021150100_compliance_evidence_admin_read.sql  --  smoke test 21 Oct 2026 #20
-- NEEDS JONO'S GO. The private bucket compliance-evidence (FSCA register screenshots behind the admin "Evidence" links in
-- src/components/dashboard/BrokerComplianceChecks.tsx) has no SELECT policy on storage.objects, so createSignedUrl fails
-- for admins (live 21 Oct: 3 objects, admin sees 0). Adds one admin-only read policy. Brokers, anon and everyone else
-- still read nothing; writes stay service-role only (no insert/update/delete policy is added). Same pattern as
-- "smc broker-media admin read all" (20261011060000).
-- Apply by hand with the CRM release (no db push), then:
--   npx supabase migration repair --status applied --linked --project-ref cmsylaupctrbsvzrgzwy 20261021150100
-- Undo: DROP POLICY IF EXISTS "smc compliance-evidence admin read" ON storage.objects;
-- =============================================================================
DO $mig$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'compliance-evidence: no storage schema here (plain Postgres) - skipped';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "smc compliance-evidence admin read" ON storage.objects';
  EXECUTE $q$CREATE POLICY "smc compliance-evidence admin read" ON storage.objects FOR SELECT TO authenticated
            USING (bucket_id = 'compliance-evidence' AND public.smc_is_admin())$q$;
END
$mig$;
