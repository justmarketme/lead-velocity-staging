-- Approved release verification: synthetic database fixtures only, all rolled back.
-- No signup API, password, session, email, WhatsApp or calendar provider is used.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000101','guard-a@example.invalid','{"user_type":"broker","full_name":"Synthetic A","firm_name":"Synthetic Practice A"}'),
 ('00000000-0000-4000-8000-000000000102','guard-b@example.invalid','{"user_type":"broker","full_name":"Synthetic B","firm_name":"Synthetic Practice B"}'),
 ('00000000-0000-4000-8000-000000000103','guard-admin@example.invalid','{"full_name":"Synthetic Admin"}');
INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-4000-8000-000000000103','admin');
UPDATE public.brokers SET is_lead_loading=false,onboarding_progress='{"bio_review":{"status":"changes_suggested","suggested":"Synthetic approved bio for a fictional practice used only in security tests."}}'
 WHERE user_id IN ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
DO $$ DECLARE n integer; BEGIN
 IF public.smc_is_admin() THEN RAISE EXCEPTION 'FAIL: broker is admin'; END IF;
 UPDATE public.brokers SET languages=ARRAY['en','af'],bookings_paused=true,firm_name='Synthetic Updated Practice'
 WHERE user_id=auth.uid(); GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'FAIL: profile update row count %',n; END IF;
 BEGIN UPDATE public.brokers SET is_lead_loading=true WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: management edit allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.brokers SET user_id='00000000-0000-4000-8000-000000000102' WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: owner edit allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.brokers SET firm_name='Synthetic Attempt Other Owner' WHERE user_id='00000000-0000-4000-8000-000000000102'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'FAIL: other broker update allowed'; END IF;
 PERFORM public.broker_update_profile('Synthetic RPC Practice','12345',NULL);
 PERFORM public.broker_decide_bio_suggestion(true);
 BEGIN UPDATE public.brokers SET bio_short='Synthetic forbidden approved bio replacement' WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: approved bio edit allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
DO $$ DECLARE n integer; BEGIN
 IF NOT public.smc_is_admin() THEN RAISE EXCEPTION 'FAIL: synthetic admin not admin'; END IF;
 UPDATE public.brokers SET is_lead_loading=true WHERE user_id IN ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102'); GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'FAIL: admin update row count %',n; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: hosted public broker profile edit, RLS isolation, restricted updates, profile RPC, bio approval RPC, approved-bio lock and admin updates. All synthetic users/profiles/brokers/roles/audits rolled back; no messages sent.' AS result;
