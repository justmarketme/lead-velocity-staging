// Local proof of the broker ad-likeness consent, per-ad approval and change-request migrations
// (20261013190000_broker_ad_consent_and_approval.sql, 20261013200000_broker_change_requests.sql) on the live-schema mirror
// + smc chain + the 12/13 Oct broker migrations, in a throwaway Postgres (never the live project). Skipped when no local
// Postgres backend exists (automation/tests/_localpg.mjs). Run: node --test automation/tests/broker-consent-change.local.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPgBackend, startLocalPg, applyRepoMigrations } from './_localpg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const PG = localPgBackend();

const ADMIN = '00000000-0000-4000-8000-000000000001';
const U1 = '00000000-0000-4000-8000-000000000002'; // Broker One
const U2 = '00000000-0000-4000-8000-000000000003'; // Broker Two
const B1 = '10000000-0000-4000-8000-000000000001';
const B2 = '10000000-0000-4000-8000-000000000002';

// broker_compliance_checks and pg_net exist live (13 Oct 2026) but not in the 10 Oct mirror: recreate them as live has them.
const LIVE_EXTRAS = `
CREATE TABLE IF NOT EXISTS public.broker_compliance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), broker_id uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  check_type text NOT NULL CHECK (check_type = ANY (ARRAY['fsp_register','representative','product_categories','compliance_officer','content_review','consent','other'])),
  result text NOT NULL CHECK (result = ANY (ARRAY['pass','fail','warning','info'])),
  summary text, details jsonb, source text, evidence_path text, checked_by text, checked_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.broker_compliance_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY bcc_admin_insert ON public.broker_compliance_checks FOR INSERT TO authenticated WITH CHECK (public.smc_is_admin());
CREATE POLICY bcc_admin_read ON public.broker_compliance_checks FOR SELECT TO authenticated USING (public.smc_is_admin());
GRANT SELECT, INSERT ON public.broker_compliance_checks TO authenticated;
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE IF NOT EXISTS net.calls (id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb);
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds int DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.calls (url, headers, body) VALUES (url, headers, body) RETURNING id $$;
`;

test('ad consent, per-ad approval, change requests (local Postgres)', { skip: !PG && 'no local Postgres backend' }, () => {
  const pg = startLocalPg(PG);
  try {
    applyRepoMigrations(pg);
    pg.sql(LIVE_EXTRAS);
    // The 12/13 Oct broker migrations in order (the ones these build on), then ours. Each in one transaction.
    for (const f of readdirSync(MIG).filter((x) => /^2026101[23]\d{6}_.*\.sql$/.test(x)).sort()) pg.file(join(MIG, f), ['-1']);
    // Re-runnable
    pg.file(join(MIG, '20261013190000_broker_ad_consent_and_approval.sql'), ['-1']);
    pg.file(join(MIG, '20261013200000_broker_change_requests.sql'), ['-1']);

    const as = (uid, sql) => pg.sql(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);\n${sql}`, ['-At']).trim();
    const su = (sql) => pg.sql(sql, ['-At']).trim();
    const fails = (fn, re) => assert.throws(fn, (e) => re.test(String(e.stderr || e.message)), `expected ${re}`);
    const checks = (b, ev) => Number(su(`SELECT count(*) FROM public.broker_compliance_checks WHERE broker_id = '${b}' AND details->>'event' = '${ev}'`));
    const adState = (id) => su(`SELECT state FROM public.broker_media WHERE id = '${id}'`);

    // Lead Velocity prepares two ads for Broker One (service role / admin path).
    const ad1 = su(`INSERT INTO public.broker_media (broker_id, kind, language, version, url, script_text) VALUES ('${B1}', 'ad', 'en', 1, 'https://x.test/ad1.jpg', 'Ad one') RETURNING id`);
    const ad2 = su(`INSERT INTO public.broker_media (broker_id, kind, language, version, url) VALUES ('${B1}', 'ad', 'en', 2, 'https://x.test/ad2.mp4') RETURNING id`);
    assert.equal(adState(ad1), 'ready');

    // Approval needs consent first.
    fails(() => as(U1, `SELECT public.broker_decide_ad('${ad1}', true)`), /consent to be featured in ads first/);
    // Withdrawing a consent never given: no-op, nothing logged.
    as(U1, `SELECT public.broker_set_ad_likeness_consent(false)`);
    assert.equal(checks(B1, 'ad_likeness_consent'), 0);

    // Grant: state + one audit row with the v2 wording; repeat is a no-op.
    as(U1, `SELECT public.broker_set_ad_likeness_consent(true)`);
    as(U1, `SELECT public.broker_set_ad_likeness_consent(true)`);
    assert.equal(su(`SELECT onboarding_progress->'ad_consent'->>'status' || '|' || (onboarding_progress->'ad_consent'->>'wording_version') FROM public.brokers WHERE id = '${B1}'`), 'granted|ADS-LIKENESS-v2');
    assert.equal(checks(B1, 'ad_likeness_consent'), 1);
    assert.equal(su(`SELECT check_type || '|' || result || '|' || source || '|' || checked_by || '|' || (details->>'wording_text' LIKE '%subject to my approval of each such advert in the portal.') FROM public.broker_compliance_checks WHERE broker_id = '${B1}' AND details->>'event' = 'ad_likeness_consent'`),
      'consent|pass|Broker portal|Broker (portal)|true');
    // A broker cannot write onboarding_progress (consent) directly.
    fails(() => as(U1, `UPDATE public.brokers SET onboarding_progress = '{"ad_consent":{"status":"granted"}}' WHERE id = '${B1}'`), /smc|onboarding_progress|permission|denied|42501/i);

    // Approve both ads (several approved ads may run at once: the one-current exclusion skips kind 'ad').
    as(U1, `SELECT public.broker_decide_ad('${ad1}', true)`);
    as(U1, `SELECT public.broker_decide_ad('${ad2}', true, 'looks good')`);
    as(U1, `SELECT public.broker_decide_ad('${ad1}', true)`); // idempotent
    assert.equal(adState(ad1), 'approved');
    assert.equal(adState(ad2), 'approved');
    assert.equal(checks(B1, 'ad_approved'), 2);
    // Another broker cannot touch it.
    fails(() => as(U2, `SELECT public.broker_decide_ad('${ad1}', false)`), /ad was not found/);
    // A broker cannot create an "ad" himself (RLS), but can still add e.g. a video take.
    fails(() => as(U1, `INSERT INTO public.broker_media (broker_id, kind, language, version, url) VALUES ('${B1}', 'ad', 'en', 9, 'https://x.test/mine.jpg')`), /row-level security/);
    // The one-current rule still holds for cards.
    su(`INSERT INTO public.broker_media (broker_id, kind, language, version, url, is_current) VALUES ('${B2}', 'card', 'en', 1, 'https://x.test/c1.png', true)`);
    fails(() => su(`INSERT INTO public.broker_media (broker_id, kind, language, version, url, is_current) VALUES ('${B2}', 'card', 'en', 2, 'https://x.test/c2.png', true)`), /broker_media_one_current_x/);

    // Decline an approved ad: pulled, logged.
    as(U1, `SELECT public.broker_decide_ad('${ad2}', false, 'wrong photo')`);
    assert.equal(adState(ad2), 'rejected');
    assert.equal(checks(B1, 'ad_declined'), 1);

    // Withdraw consent: logged as info, approved ads pulled.
    as(U1, `SELECT public.broker_set_ad_likeness_consent(false)`);
    assert.equal(su(`SELECT result || '|' || jsonb_array_length(details->'ads_pulled') FROM public.broker_compliance_checks WHERE broker_id = '${B1}' AND details->>'event' = 'ad_likeness_consent' ORDER BY checked_at DESC LIMIT 1`), 'info|1');
    assert.equal(adState(ad1), 'rejected');
    assert.equal(su(`SELECT ai_check->>'broker_decision' FROM public.broker_media WHERE id = '${ad1}'`), 'consent_withdrawn');
    fails(() => as(U1, `SELECT public.broker_decide_ad('${ad1}', true)`), /consent to be featured in ads first/);

    // ---- Change requests + locks
    su(`UPDATE public.brokers SET bio_short = 'With 20 years of experience I help families protect the people they love.',
          onboarding_progress = coalesce(onboarding_progress, '{}'::jsonb) || '{"bio_review":{"status":"accepted"}}' WHERE id = '${B1}'`);
    fails(() => as(U1, `UPDATE public.brokers SET bio_short = 'Something new that is longer than forty characters for sure.' WHERE id = '${B1}'`), /Your bio is approved/);
    as(U1, `UPDATE public.brokers SET languages = ARRAY['en','af'] WHERE id = '${B1}'`); // other fields still editable
    fails(() => as(U1, `SELECT public.broker_request_change('card', 'nope')`), /p_item must be/);
    as(U1, `SELECT public.broker_request_change('bio', 'Please add that I also speak Afrikaans.')`);
    assert.equal(su(`SELECT jsonb_array_length(onboarding_progress->'change_requests') || '|' || (onboarding_progress->'change_requests'->0->>'status') FROM public.brokers WHERE id = '${B1}'`), '1|open');
    assert.equal(checks(B1, 'change_requested'), 1);
    assert.equal(Number(su(`SELECT count(*) FROM public.broker_activities WHERE broker_id = '${B1}' AND body LIKE 'Broker requested a change to their bio%'`)), 1);
    assert.equal(su(`SELECT details->>'notified_emma' FROM public.broker_compliance_checks WHERE broker_id = '${B1}' AND details->>'event' = 'change_requested'`), 'false');
    assert.equal(Number(su(`SELECT count(*) FROM net.calls`)), 0); // no Vault secret, no ping
    su(`SELECT vault.create_secret('test-secret', 'emma_notify_secret', 'test')`);
    as(U1, `SELECT public.broker_request_change('ad', 'Ad v1: use the other photo')`);
    assert.equal(su(`SELECT url || '|' || (headers->>'x-emma-secret') || '|' || (body->>'source') FROM net.calls`), 'https://emmadoesit.cloud/api/notify|test-secret|lv_broker_change_request');

    const reqId = su(`SELECT e->>'id' FROM public.brokers, jsonb_array_elements(onboarding_progress->'change_requests') e WHERE id = '${B1}' AND e->>'item' = 'bio'`);
    fails(() => as(U1, `SELECT public.admin_resolve_change_request('${B1}', '${reqId}', true)`), /Admins only/);
    as(ADMIN, `SELECT public.admin_resolve_change_request('${B1}', '${reqId}', true, 'Unlocked for you')`);
    as(ADMIN, `SELECT public.admin_resolve_change_request('${B1}', '${reqId}', true)`); // idempotent
    assert.equal(checks(B1, 'change_request_resolved'), 1);
    assert.equal(su(`SELECT (onboarding_progress->'bio_review'->>'unlocked_at') IS NOT NULL FROM public.brokers WHERE id = '${B1}'`), 't');
    as(U1, `UPDATE public.brokers SET bio_short = 'Now unlocked: I help families protect the people they love, in English and Afrikaans.' WHERE id = '${B1}'`);

    // Approved card locks the headshot (and bio) until unlocked.
    su(`UPDATE public.brokers SET onboarding_progress = onboarding_progress || jsonb_build_object('card', jsonb_build_object('status','done','approved_at', now())) WHERE id = '${B1}'`);
    fails(() => as(U1, `UPDATE public.brokers SET headshot_url = 'broker-media/x/new.jpg' WHERE id = '${B1}'`), /intro card is approved/);
    fails(() => as(U1, `UPDATE public.brokers SET bio_short = 'Changing it again after the card was approved, which is locked.' WHERE id = '${B1}'`), /Your bio is approved/);

    // Intro card approval end to end (sets intro_card_url: needs the 20261013170000 trigger fix; state is generated).
    const card3 = su(`INSERT INTO public.broker_media (broker_id, kind, language, version, url) VALUES ('${B2}', 'card', 'en', 3, 'https://x.test/c3.png') RETURNING id`);
    as(U2, `SELECT public.broker_approve_intro_card('${card3}')`);
    assert.equal(adState(card3), 'approved');
    assert.equal(su(`SELECT intro_card_url FROM public.brokers WHERE id = '${B2}'`), 'https://x.test/c3.png');
    assert.equal(Number(su(`SELECT count(*) FROM public.broker_activities WHERE broker_id = '${B2}' AND body = 'Intro card ready'`)), 1);

    // Undo files: 200000 cleanly; 190000 refuses while ad rows exist, then works.
    pg.file(join(MIG, 'undo', '20261013200000_broker_change_requests.undo.sql'));
    fails(() => pg.file(join(MIG, 'undo', '20261013190000_broker_ad_consent_and_approval.undo.sql')), /still has kind 'ad' rows/);
    su(`DELETE FROM public.broker_media WHERE kind = 'ad'`);
    pg.file(join(MIG, 'undo', '20261013190000_broker_ad_consent_and_approval.undo.sql'));
    assert.equal(su(`SELECT count(*) FROM pg_proc WHERE proname IN ('broker_set_ad_likeness_consent','broker_decide_ad','broker_request_change','admin_resolve_change_request','lv_notify_emma')`), '0');
    assert.ok(Number(su(`SELECT count(*) FROM public.broker_compliance_checks WHERE broker_id = '${B1}'`)) >= 7, 'audit rows stay');
  } finally {
    pg.stop();
  }
});
