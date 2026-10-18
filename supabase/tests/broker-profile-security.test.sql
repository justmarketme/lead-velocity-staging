-- Scratch database only. Fabricated brokers/admin; no production data or credentials.
\set ON_ERROR_STOP on
INSERT INTO public.user_roles VALUES ('00000000-0000-4000-8000-000000000003','admin');
INSERT INTO public.brokers(id,user_id,firm_name,contact_person,email,brand_id,routing_on,fsp_number,bio_short,onboarding_progress,mgmt_stage,is_lead_loading)
VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Synthetic Practice A','Synthetic A','a@example.invalid',NULL,false,'12345','Synthetic bio before review, for security tests only.','{"bio_review":{"status":"changes_suggested","suggested":"Synthetic approved bio for a fictional practice used only in security tests."}}','new',false),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','Synthetic Practice B','Synthetic B','b@example.invalid','00000000-0000-4000-8000-000000000099',false,'12345','Synthetic second broker bio, for isolation testing.','{}','new',false);
CREATE FUNCTION public.expect_denied(statement text, expected text DEFAULT '42501') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=expected THEN RETURN; END IF;
    RAISE EXCEPTION 'Wrong failure: expected %, got %: %',expected,SQLSTATE,SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: statement was allowed: %',statement;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
-- A broker cannot directly edit management/delivery fields, including on a legacy row.
DO $$
DECLARE field text; fields text[]:=ARRAY['mgmt_stage','tier','portal_type','portal_style','status','calendar_email'];
BEGIN
  FOREACH field IN ARRAY fields LOOP
    PERFORM public.expect_denied(format('UPDATE public.brokers SET %I = %L WHERE id = %L',field,'forged','00000000-0000-4000-8000-000000000011'));
  END LOOP;
END $$;
SELECT public.expect_denied('UPDATE public.brokers SET is_lead_loading=true');
SELECT public.expect_denied('UPDATE public.brokers SET active=true','428C9');
SELECT public.expect_denied('UPDATE public.brokers SET practice_name=''forged''','428C9');
SELECT public.expect_denied('UPDATE public.brokers SET routing_on=true');
SELECT public.expect_denied('UPDATE public.brokers SET approved_live_at=now()');
SELECT public.expect_denied('UPDATE public.brokers SET whatsapp_confirmed_at=now()');
SELECT public.expect_denied('UPDATE public.brokers SET user_id=''00000000-0000-4000-8000-000000000002''');
SELECT public.expect_denied('UPDATE public.brokers SET id=''00000000-0000-4000-8000-000000000015''');
SELECT public.expect_denied('UPDATE public.brokers SET onboarding_progress=''{}''');
SELECT public.expect_denied('UPDATE public.brokers SET firm_name=''x''','22023');
SELECT public.expect_denied('UPDATE public.brokers SET email=''not-an-email''','22023');
DO $$ DECLARE n integer; BEGIN
  UPDATE public.brokers SET bio_short='Attempt at changing someone else' WHERE id='00000000-0000-4000-8000-000000000012';
  GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL: another broker updated'; END IF;
END $$;
-- Legitimate profile and availability forms remain writable.
UPDATE public.brokers SET email='updated@example.invalid', languages=ARRAY['en','af'],years_advising=10,
  meeting_hours='{"mon":[["09:00","17:00"]]}',methods_supported=ARRAY['teams','phone'],slot_minutes=30,buffer_minutes=15,
  min_notice_hours=4,horizon_days=14,max_meetings_per_day=3,max_meetings_per_week=15,bookings_paused=false,
  bio_short='Synthetic updated bio before approval, for tests only.',headshot_url='broker-media/synthetic/photo.jpg';
SELECT public.broker_update_profile('Synthetic RPC Practice','12345','0821234567');
DO $$ BEGIN
  IF (SELECT firm_name FROM public.brokers) <> 'Synthetic RPC Practice' THEN RAISE EXCEPTION 'FAIL: profile RPC'; END IF;
  IF (SELECT whatsapp_number FROM public.brokers) <> '+27821234567' THEN RAISE EXCEPTION 'FAIL: WhatsApp normalization'; END IF;
END $$;
-- Existing approval RPC runs as its owner and still passes the guards.
SELECT public.broker_decide_bio_suggestion(true);
SELECT public.expect_denied('UPDATE public.brokers SET bio_short=''Attempt to overwrite approved bio''');
RESET ROLE;
UPDATE public.brokers SET routing_on=true WHERE id='00000000-0000-4000-8000-000000000011';
SET ROLE authenticated;
DO $$ DECLARE field text; BEGIN
  FOREACH field IN ARRAY ARRAY['firm_name','contact_person','email','whatsapp_number'] LOOP
    PERFORM public.expect_denied(format('UPDATE public.brokers SET %I=%L',field,'forged'));
  END LOOP;
END $$;
SELECT public.expect_denied('SELECT public.broker_update_profile(''New Practice'',NULL,NULL)');
-- A no-change update (form resubmission) still succeeds while routing is on.
UPDATE public.brokers SET firm_name=firm_name,email=email,updated_at=now();
-- Admin can manage every broker, including locked/approved profile fields.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
UPDATE public.brokers SET mgmt_stage='active',is_lead_loading=true,firm_name='Synthetic Admin Practice',email='admin-set@example.invalid',bio_short='Admin approved correction to the synthetic broker bio.';
DO $$ BEGIN IF (SELECT count(*) FROM public.brokers WHERE mgmt_stage='active')<>2 THEN RAISE EXCEPTION 'FAIL: admin flow'; END IF; END $$;
RESET ROLE;
SET ROLE n8n_app;
UPDATE public.brokers SET mgmt_stage='workflow' WHERE brand_id IS NOT NULL;
RESET ROLE;
SET ROLE service_role;
UPDATE public.brokers SET calendar_status='ok',calendar_email='calendar@example.invalid';
RESET ROLE;
-- Missing-session callers and anonymous users remain blocked.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ DECLARE n integer; BEGIN
  UPDATE public.brokers SET email='anonymous@example.invalid'; GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'FAIL: no-session update'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
SELECT public.expect_denied('UPDATE public.brokers SET email=''anonymous@example.invalid''');
RESET ROLE;
SELECT 'PASS: management/identity tampering blocked; legacy routing lock; owner isolation; valid profile/calendar edits; self-service and bio-approval RPCs; approved bio lock; admin/workflow/service paths; anonymous denial' AS result;
