-- LOCAL smoke test of the replacement RPCs, weekly cap, proof-path guard, cross-broker refusal and the brokers guard, run on a DB that already has the smc chain applied on the real-schema mirror (user ids come from real-seed-synthetic.sql).
\set ON_ERROR_STOP on
SELECT id AS brand FROM brands WHERE code='SMC' \gset
UPDATE brokers SET brand_id=:'brand', tier_code='SMC_BRONZE', status='active' WHERE id='10000000-0000-4000-8000-000000000001';
INSERT INTO cycles (id, broker_id, brand_id, tier_code, cycle_no, price_zar, committed_leads, replacement_cap, media_share_zar, starts_at, ends_at, status)
 SELECT '50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',:'brand',p.tier_code,1,p.price_zar,p.committed_leads,p.replacement_cap_cycle,p.media_share_zar, now()-interval '5 days', now()+interval '25 days','active' FROM pricing p WHERE p.tier_code='SMC_BRONZE';
INSERT INTO leads (id,email,phone,brand_id,broker_id,cycle_id,consent_text,consent_source,consent_at,first_name,source)
 SELECT ('60000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid, 'x'||g||'@example.test','+27600009'||lpad(g::text,3,'0'), :'brand','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','consent','page', now(),'L'||g,'Search Lead' FROM generate_series(1,5) g;
INSERT INTO appointments (id,broker_id,client_id,appointment_date,status,brand_id,cycle_id,method,ends_at)
 SELECT ('70000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',('60000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid, now() - ((12+g)||' minutes')::interval, 'booked', :'brand','50000000-0000-4000-8000-000000000001','teams', now() - ((12+g)||' minutes')::interval + interval '30 seconds' FROM generate_series(1,5) g;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo -- 1 traversal rejected:
SELECT 'x' FROM (SELECT 1) s WHERE false;
DO $$ BEGIN PERFORM public.smc_request_replacement('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/noshow-proof/../10000000-0000-4000-8000-000000000002/x.jpg','no_show'); RAISE EXCEPTION 'traversal accepted'; EXCEPTION WHEN sqlstate '22023' THEN RAISE NOTICE 'ok: traversal refused'; END $$;
\echo -- 2 unreachable ok, then 3 no_show ok, weekly cap on the 4th:
SELECT public.smc_request_replacement('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/noshow-proof/a.jpg','unreachable');
SELECT public.smc_request_noshow_replacement('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001/noshow-proof/b.jpg');
SELECT public.smc_request_replacement('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001/noshow-proof/c.jpg','no_show');
SELECT public.smc_request_replacement('70000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001/noshow-proof/d.jpg','no_show');
SELECT public.smc_request_replacement('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001/noshow-proof/a.jpg','unreachable');
\echo -- 3 other broker cannot act:
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN PERFORM public.smc_request_replacement('70000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002/noshow-proof/e.jpg','no_show'); RAISE EXCEPTION 'cross-broker accepted'; EXCEPTION WHEN sqlstate 'P0002' OR sqlstate '42501' THEN RAISE NOTICE 'ok: other broker refused (%)', SQLSTATE; END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo -- 4 guard: legacy->self-promotion and normal profile edit:
UPDATE brokers SET firm_name='Firm One Renamed' WHERE user_id='00000000-0000-4000-8000-000000000002';
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN UPDATE brokers SET brand_id=(SELECT id FROM brands WHERE code='SMC'), routing_on=true WHERE user_id='00000000-0000-4000-8000-000000000003'; RAISE EXCEPTION 'self-promotion accepted'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: self-promotion refused'; END $$;
UPDATE brokers SET firm_name='Firm Two Renamed', status='Inactive' WHERE user_id='00000000-0000-4000-8000-000000000003';
\echo ok: legacy profile edit still allowed
ROLLBACK;
