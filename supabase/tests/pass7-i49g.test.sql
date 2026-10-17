-- supabase/tests/pass7-i49g.test.sql — migration 13 §6 (I-49g, I-43b, I-43c, I-48i, I-49i).
-- Local stub / scratch database ONLY (never production). Needs migrations 01–13 + supabase/seed/smc_synthetic.sql,
-- and must run BEFORE analytics/W14-*.sql are re-loaded (those CREATE OR REPLACE the functions as SECURITY INVOKER).
-- One transaction, rolls back. Any failed check raises -> psql -v ON_ERROR_STOP=1 exits non-zero.
-- Usage: psql -h 127.0.0.1 -p 54329 -U postgres -d <scratch> -v ON_ERROR_STOP=1 -f supabase/tests/pass7-i49g.test.sql
\set QUIET on
BEGIN;
SELECT set_config('smc.source', 'test', true), set_config('smc.reason', 'pass7 I-49g test', true);
DO $$
DECLARE
  v_brand uuid := (SELECT id FROM public.brands WHERE code = 'SMC');
  v_broker uuid := '00000000-0000-4000-8000-0000000b0001';
  v_ok boolean;
BEGIN
  -- 6a. proposals.source: ads_budget allowed (smc-ads-budget), manual stays for smc-w26 to-dos, an unknown word fails
  INSERT INTO ops.proposals (source, faculty, title, status) VALUES ('ads_budget', 'media', 'pass7 test raise', 'proposed');
  INSERT INTO ops.proposals (source, faculty, title, status) VALUES ('manual', 'build', 'pass7 test go-live to-do', 'proposed');
  BEGIN
    INSERT INTO ops.proposals (source, faculty, title) VALUES ('bogus_source', 'build', 'x');
    RAISE EXCEPTION 'FAIL 6a: unknown proposals.source accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 6b. notification kinds: smc-w26 go_live rows (exact column list of SUB-w26-runner) + signal keys as direct kinds
  INSERT INTO ops.notifications (kind, recipient, channel, source, status, signal_key, ref_table, ref_id, dedupe_key, what, payload)
  VALUES ('go_live', 'jonathan', 'whatsapp', 'W26', 'queued', 'go_live_vps_gate', 'brokers', v_broker::text,
          'pass7:go_live:go_live_vps_gate', 'pass7 test', '{}'::jsonb);
  INSERT INTO ops.notifications (kind, recipient, channel, status, signal_key)
  SELECT k, 'jonathan', 'console', 'queued', k
    FROM unnest(ARRAY['go_live_ready','go_live_vps_gate','go_live_pending','w03_no_brand','ms_client_secret_invalid',
                      'workflow_failed','alert','approval','w34_monthly_report','lead_routed_out']) k;
  BEGIN
    INSERT INTO ops.notifications (kind, recipient, channel) VALUES ('bogus_kind', 'jonathan', 'console');
    RAISE EXCEPTION 'FAIL 6b: unknown notification kind accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 6c. smc-whatsapp-send claim: a second row with the same correlation is refused; other workflows are not affected
  INSERT INTO public.communications (channel, direction, sender_type, recipient_type, recipient_contact, broker_id, brand_id,
                                     content, status, template_name, workflow, metadata)
  VALUES ('whatsapp', 'outbound', 'system', 'broker', 'n/a', v_broker, v_brand, 'template:test', 'pending', 'test',
          'smc-whatsapp-send', '{"correlation":"pass7:corr:1","kind":"template"}'::jsonb);
  BEGIN
    INSERT INTO public.communications (channel, direction, sender_type, recipient_type, recipient_contact, broker_id, brand_id,
                                       content, status, workflow, metadata)
    VALUES ('whatsapp', 'outbound', 'system', 'broker', 'n/a', v_broker, v_brand, '[text]', 'pending',
            'smc-whatsapp-send', '{"correlation":"pass7:corr:1"}'::jsonb);
    RAISE EXCEPTION 'FAIL 6c: duplicate smc-whatsapp-send correlation accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO public.communications (channel, direction, sender_type, recipient_type, recipient_contact, broker_id, brand_id,
                                     content, status, workflow, metadata)
  VALUES ('whatsapp', 'outbound', 'system', 'broker', 'n/a', v_broker, v_brand, '[text]', 'pending', 'W19',
          '{"correlation":"pass7:corr:1"}'::jsonb);
  -- the sub-workflow's own INSERT passes recipient_contact NULL; the legacy column is NOT NULL (reported, not changed here)
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'communications' AND column_name = 'recipient_contact') = 'NO' THEN
    RAISE NOTICE 'KNOWN pass7: communications.recipient_contact is NOT NULL; SUB-whatsapp-send "Record communications row" inserts NULL (needs_human)';
  END IF;

  -- 6d. verified_credentials: objects accepted (W20 shape), non-array refused
  UPDATE public.brokers SET verified_credentials =
    '[{"type":"fsp","number":"00000","register_name":"Synthetic Broker","verified_at":"2026-10-01T00:00:00Z"}]'::jsonb
   WHERE id = v_broker;
  BEGIN
    UPDATE public.brokers SET verified_credentials = '{"type":"fsp"}'::jsonb WHERE id = v_broker;
    RAISE EXCEPTION 'FAIL 6d: non-array verified_credentials accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF col_description('public.brokers'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.brokers'::regclass AND attname = 'verified_credentials'))
     NOT LIKE '%register_name%' THEN
    RAISE EXCEPTION 'FAIL 6d: verified_credentials comment not updated (I-43b)';
  END IF;

  -- 6e. broker_pulse: only the 4-arg form; both functions SECURITY DEFINER, pinned search_path, n8n_app only
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'facts' AND p.proname = 'broker_pulse') <> 1
     OR to_regprocedure('facts.broker_pulse(uuid, date, int, int)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 6e: facts.broker_pulse is not exactly the 4-arg function';
  END IF;
  SELECT bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=public, facts, pg_temp']) INTO v_ok
    FROM pg_proc p WHERE p.oid IN ('facts.broker_pulse(uuid, date, int, int)'::regprocedure,
                                   'facts.w14_broker_report(uuid, date, text)'::regprocedure);
  IF NOT v_ok THEN RAISE EXCEPTION 'FAIL 6e: broker_pulse / w14_broker_report not SECURITY DEFINER with pinned search_path'; END IF;
  IF has_function_privilege('authenticated', 'facts.broker_pulse(uuid, date, int, int)', 'EXECUTE')
     OR has_function_privilege('anon', 'facts.w14_broker_report(uuid, date, text)', 'EXECUTE')
     OR NOT has_function_privilege('n8n_app', 'facts.broker_pulse(uuid, date, int, int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 6e: broker_pulse / w14_broker_report grants';
  END IF;
  -- the payload needs the analytics layer (facts.v_params etc., analytics/*.sql, no migration deploy path yet — 10 §3);
  -- when it is absent the body is covered by analytics/tests/pulse-hold.test.sql (run-all.sh) instead.
  IF to_regclass('facts.v_params') IS NULL THEN
    RAISE NOTICE 'SKIP pass7 6e payload: analytics layer not loaded (covered by analytics/tests/pulse-hold.test.sql)';
  ELSIF (facts.w14_broker_report(v_broker) #> '{s4_quality,lead_pulse}') IS NULL THEN
    RAISE EXCEPTION 'FAIL 6e: w14_broker_report has no s4_quality.lead_pulse';
  ELSIF (facts.w14_broker_report(v_broker) #> '{s4_quality,lead_pulse}') ?| ARRAY['last','target'] THEN
    RAISE EXCEPTION 'FAIL 6e: lead_pulse carries a week-on-week key';
  END IF;
  RAISE NOTICE 'PASS pass7-i49g: proposals.source ads_budget, notification kinds, smc-whatsapp-send correlation unique, verified_credentials objects, broker_pulse 4-arg + w14 lead_pulse (definer, n8n_app only)';
END $$;
ROLLBACK;
