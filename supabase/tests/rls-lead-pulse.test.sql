-- supabase/tests/rls-lead-pulse.test.sql — I-41d / R5-02: a broker can never read a lead pulse row by name.
-- Local stub / scratch database ONLY (never production). Needs migrations 01–13 + supabase/seed/smc_synthetic.sql.
-- Runs in one transaction and rolls back. Any failed check raises -> psql -v ON_ERROR_STOP=1 exits non-zero.
-- Usage: psql -h 127.0.0.1 -p 54329 -U postgres -d smc -v ON_ERROR_STOP=1 -f supabase/tests/rls-lead-pulse.test.sql
\set QUIET on
BEGIN;
-- fixture (as owner): one SMC lead of the synthetic broker gets a pulse tap + line on the timeline and in communications,
-- plus one ordinary timeline row and one ordinary message the broker must still see.
CREATE TEMP TABLE t_fx ON COMMIT DROP AS
SELECT l.id AS lead_id, l.brand_id, l.broker_id, l.cycle_id
  FROM public.leads l
 WHERE l.broker_id = '00000000-0000-4000-8000-0000000b0001' AND l.brand_id IS NOT NULL
 ORDER BY l.created_at LIMIT 1;
GRANT SELECT ON t_fx TO authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM t_fx) <> 1 THEN RAISE EXCEPTION 'fixture: synthetic broker lead missing (load supabase/seed/smc_synthetic.sql)'; END IF; END $$;

INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT lead_id, brand_id, broker_id, cycle_id, w, 'lead', a, '{"synthetic":true}'::jsonb, now(), 'rlstest:' || a || ':' || lead_id
  FROM t_fx, (VALUES ('W35','lead_pulse'), ('W35','lead_pulse_line'), ('W07','rlstest_visible')) v(w, a);

INSERT INTO public.communications (brand_id, lead_id, broker_id, channel, direction, sender_type, recipient_type, recipient_contact,
                                   content, status, external_id, author, workflow, template_name, metadata)
SELECT brand_id, lead_id, broker_id, 'whatsapp', d, s, r, '+27600000000', c, 'sent', 'wamid.RLSTEST.' || k || '.' || lead_id, au, w, tn, md::jsonb
  FROM t_fx, (VALUES
    ('outbound','system','client','pulse ask (template)','1','system','W35','lead_pulse','{}'),
    ('outbound','system','client','pulse reply (session)','2','system','W35',NULL,'{}'),
    ('inbound','client','system','Not really','3','lead','W07',NULL,'{"route":"W35","payload":"pulse_no"}'),
    ('inbound','client','system','rlstest visible','4','lead','W07',NULL,'{"route":"W04"}')) v(d, s, r, c, k, au, w, tn, md);

-- as the broker (PostgREST shape: role authenticated + JWT sub)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000b001', true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b001","role":"authenticated"}', true) \g /dev/null

DO $$
DECLARE n int; v int;
BEGIN
  IF public.smc_current_broker_id() IS DISTINCT FROM '00000000-0000-4000-8000-0000000b0001'::uuid THEN
    RAISE EXCEPTION 'setup: JWT does not resolve to the synthetic broker';
  END IF;
  SELECT count(*) INTO n FROM public.lead_activities a JOIN t_fx f ON f.lead_id = a.lead_id
   WHERE a.activity_type IN ('lead_pulse','lead_pulse_line') OR a.workflow = 'W35';
  SELECT count(*) INTO v FROM public.lead_activities a JOIN t_fx f ON f.lead_id = a.lead_id WHERE a.activity_type = 'rlstest_visible';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL I-41d: broker reads % lead pulse timeline row(s)', n; END IF;
  IF v <> 1 THEN RAISE EXCEPTION 'FAIL I-41d: broker lost his own ordinary timeline row (saw %)', v; END IF;

  SELECT count(*) INTO n FROM public.communications c JOIN t_fx f ON f.lead_id = c.lead_id
   WHERE c.external_id LIKE 'wamid.RLSTEST.%' AND c.content <> 'rlstest visible';
  SELECT count(*) INTO v FROM public.communications c JOIN t_fx f ON f.lead_id = c.lead_id WHERE c.content = 'rlstest visible';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL I-41d: broker reads % lead pulse message(s)', n; END IF;
  IF v <> 1 THEN RAISE EXCEPTION 'FAIL I-41d: broker lost his own ordinary message (saw %)', v; END IF;

  BEGIN
    SELECT count(*) INTO n FROM public.lead_pulse;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL I-41d: broker reads % public.lead_pulse row(s)', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;   -- no grant at all is also a pass
  END;

  BEGIN
    UPDATE public.brokers SET verified_credentials = '["CFP"]'::jsonb WHERE id = '00000000-0000-4000-8000-0000000b0001';
    RAISE EXCEPTION 'FAIL I-41k: broker self-declared verified_credentials';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS rls-lead-pulse: broker sees 0 pulse rows (timeline, communications, lead_pulse), keeps ordinary rows; verified_credentials guarded';
END $$;

-- the admin still sees everything (console timeline / judge samples)
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lead_activities a JOIN t_fx f ON f.lead_id = a.lead_id WHERE a.workflow = 'W35';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: owner/n8n view lost pulse timeline rows (saw %)', n; END IF;
END $$;
ROLLBACK;
