-- =============================================================================
-- supabase/seed/smc_synthetic.sql — SYNTHETIC DATA ONLY (pre-mortem #10, #15)
-- One fictional broker, one paid cycle, 10 fictional leads that cover every branch of
-- the synthetic suite: booked / unbooked / no-show / replacement / STOP / CTWA /
-- instant form / page; methods Teams, phone, WhatsApp call; a reschedule; a dispute;
-- an auto-marked (unconfirmed) outcome. Numbers are +27 60 000 00xx, names say "Synthetic",
-- emails are @example.com (reserved), every lead has is_synthetic = true.
--
-- NEVER run against production. Local / staging only, after migrations smc_01…05.
-- Guard: the session must opt in, or the whole transaction aborts:
--     psql "$STAGING_DB_URL" -c "SET smc.allow_synthetic = 'on'" -f supabase/seed/smc_synthetic.sql   (one session)
--   or, inside psql:  SET smc.allow_synthetic = 'on';  \i supabase/seed/smc_synthetic.sql
-- Re-runnable: fixed ids + ON CONFLICT DO NOTHING. Times are relative to now() so the
-- watchlist (facts.v_watchlist with smc.include_synthetic = 'on') shows live values.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF coalesce(current_setting('smc.allow_synthetic', true), '') <> 'on' THEN
    RAISE EXCEPTION 'smc_synthetic.sql: refusing to run. SET smc.allow_synthetic = ''on'' in this session first (never on production).';
  END IF;
END $$;

SELECT set_config('smc.source', 'seed', true), set_config('smc.reason', 'synthetic seed', true);

-- -----------------------------------------------------------------------------
-- Fictional broker: auth user + broker role + brokers row (status active, Bronze)
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-00000000b001', 'authenticated', 'authenticated',
        'synthetic.broker@example.com', '{"provider":"email"}', '{"synthetic":true}', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-4000-8000-00000000b001', 'broker')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.brokers (
  id, user_id, firm_name, contact_person, email, whatsapp_number, phone_number, status, tier,
  brand_id, tier_code, ref_code, fsp_number, fsp_verified_at, fsp_check, calendar_provider, calendar_email,
  methods_supported, max_meetings_per_day, max_meetings_per_week, routing_on, consent_mode,
  bio_short, languages, onboarding_step, onboarding_progress, approved_live_at, status_changed_at)
SELECT
  '00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-00000000b001',
  'Synthetic Test Advisory (TEST ONLY)', 'Synthetic Adviser', 'synthetic.broker@example.com',
  '+27600000099', '+27600000099', 'active', NULL,
  b.id, 'SMC_BRONZE', 'TST01', 'TEST-00000', now() - interval '20 days',
  '{"result":"synthetic","source":"none"}'::jsonb, 'outlook', 'synthetic.calendar@example.com',
  ARRAY['teams','phone','whatsapp_call'], 3, 12, true, 'named',
  'Fictional adviser used only by the synthetic suite.', ARRAY['en'], 'done',
  '{"profile":"synthetic","calendar":"synthetic","agreement":"synthetic"}'::jsonb,
  now() - interval '15 days', now() - interval '15 days'
FROM public.brands b WHERE b.code = 'SMC'
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Money: manual-EFT credit matched to the cycle-1 invoice, then the cycle
-- -----------------------------------------------------------------------------
INSERT INTO public.cycles (id, broker_id, brand_id, tier_code, cycle_no, price_zar, committed_leads, replacement_cap,
                           media_share_zar, starts_at, ends_at, status)
SELECT '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000b0001', b.id, p.tier_code, 1,
       p.price_zar, p.committed_leads, p.replacement_cap_cycle, p.media_share_zar,
       date_trunc('day', now()) - interval '14 days', date_trunc('day', now()) + interval '16 days', 'active'
FROM public.brands b JOIN public.pricing p ON p.tier_code = 'SMC_BRONZE'
WHERE b.code = 'SMC'
ON CONFLICT (id) DO NOTHING;

UPDATE public.brokers SET current_cycle_id = '00000000-0000-4000-8000-0000000c0001'
 WHERE id = '00000000-0000-4000-8000-0000000b0001' AND current_cycle_id IS NULL;

INSERT INTO public.bank_credits (id, received_at, amount_zar, reference_raw, parsed_reference, source, graph_message_id, match_status)
VALUES ('00000000-0000-4000-8000-0000000bc001', now() - interval '15 days', 16500.00,
        'LV-TST01-SMC_BRONZE-SYNTH', 'LV-TST01-SMC_BRONZE-SYNTH', 'incontact', 'synthetic-graph-msg-001', 'auto')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoices_smc (id, invoice_no, kind, broker_id, brand_id, cycle_id, tier_code, period_start, period_end,
                                 amount_excl_vat, reference, method, status, issued_at, due_at, paid_at, bank_credit_id)
SELECT '00000000-0000-4000-8000-0000000f0001', 'SYN-0001', 'cycle', '00000000-0000-4000-8000-0000000b0001', b.id,
       '00000000-0000-4000-8000-0000000c0001', 'SMC_BRONZE',
       (now() - interval '14 days')::date, (now() + interval '16 days')::date,
       16500.00, 'LV-TST01-SMC_BRONZE-SYNTH', 'manual_eft', 'paid',
       now() - interval '16 days', now() - interval '14 days', now() - interval '15 days',
       '00000000-0000-4000-8000-0000000bc001'
FROM public.brands b WHERE b.code = 'SMC'
ON CONFLICT (id) DO NOTHING;

UPDATE public.bank_credits SET matched_invoice_id = '00000000-0000-4000-8000-0000000f0001'
 WHERE id = '00000000-0000-4000-8000-0000000bc001' AND matched_invoice_id IS NULL;

-- -----------------------------------------------------------------------------
-- 10 synthetic leads
--   L01 page        → Teams, attended, fit_proceeding (5)
--   L02 page        → phone, no-show → replacement approved/fulfilled by L10
--   L03 instant form→ WhatsApp call, attended, nofit_criteria (2) → replacement disputed
--   L04 CTWA        → phone, attended, fit_followup (4)
--   L05 CTWA        → verified + qualified, never booked → unbooked_closed
--   L06 page        → STOP → opted_out + suppression
--   L07 instant form→ disclosed, never replied in 72 h → not verified
--   L08 page        → age <35 → disqualified
--   L09 page        → Teams, rescheduled once, new slot confirmed (future)
--   L10 page        → replacement for L02, phone, attended, auto-marked unconfirmed at 24 h
-- -----------------------------------------------------------------------------
INSERT INTO public.leads (
  id, brand_id, broker_id, tier_code, cycle_id, routed_at, routing_reason,
  first_name, last_name, phone, email, origin, campaign_id, adset_id, ad_id, concept, angle, placement,
  utm_source, utm_medium, utm_campaign, fbclid, fbp, fbc, lead_event_id, leadgen_id, ctwa_clid, page_url,
  consent_text, consent_text_version, consent_mode, consent_at, consent_ads_at, consent_page_url, consent_source,
  line_type, first_message_at, wa_delivered_at, verified_at, disclosure_msg_id, disclosure_delivered_at,
  qualified_at, disqualified_reason, age_band, budget_band, bond, dependants, work_cover, method_pref,
  call_number, best_time, language, email_status, email_purpose, stage, opted_out_at, last_contact_at,
  retention_delete_after, is_synthetic, created_at)
SELECT
  v.id::uuid, b.id, '00000000-0000-4000-8000-0000000b0001', 'SMC_BRONZE', '00000000-0000-4000-8000-0000000c0001',
  now() - (v.age_h || ' hours')::interval, 'single_broker',
  'Synthetic', v.last_name, v.phone, v.email, v.origin, 'SYN_CAMPAIGN_A', 'SYN_ADSET_1', v.ad_id, 'C01', v.angle, 'feed',
  CASE WHEN v.origin = 'page' THEN 'facebook' END, CASE WHEN v.origin = 'page' THEN 'paid' END,
  CASE WHEN v.origin = 'page' THEN 'smc_synthetic' END,
  CASE WHEN v.origin = 'page' THEN 'SYNTHETIC_FBCLID_' || v.n END,
  CASE WHEN v.origin = 'page' THEN 'fb.1.1700000000000.' || v.n END,
  CASE WHEN v.origin = 'page' THEN 'fb.1.1700000000000.SYNTHETIC_FBCLID_' || v.n END,
  CASE WHEN v.origin = 'page' THEN 'synthetic-event-' || v.n END,
  CASE WHEN v.origin = 'lead_ad' THEN 'SYNTHETIC_LEADGEN_' || v.n END,
  CASE WHEN v.origin = 'ctwa' THEN 'SYNTHETIC_CTWA_' || v.n END,
  CASE WHEN v.origin = 'page' THEN 'https://sortmycover.leadvelocity.co.za/check' END,
  'I agree that Lead Velocity may share my details with Synthetic Test Advisory (TEST ONLY) (FSP TEST-00000), an authorised financial services provider, who may contact me by WhatsApp or phone about life cover. [SYNTHETIC]',
  'named-v0-synthetic', 'named',
  now() - (v.age_h || ' hours')::interval,
  CASE WHEN v.ads_consent THEN now() - (v.age_h || ' hours')::interval END,
  CASE WHEN v.origin = 'page' THEN 'https://sortmycover.leadvelocity.co.za/check' END,
  CASE v.origin WHEN 'page' THEN 'page_checkbox' WHEN 'lead_ad' THEN 'instant_form' ELSE 'whatsapp_buttons' END,
  'mobile',
  now() - (v.age_h || ' hours')::interval + interval '40 seconds',
  now() - (v.age_h || ' hours')::interval + interval '45 seconds',
  CASE WHEN v.verified THEN now() - (v.age_h || ' hours')::interval + interval '20 minutes' END,
  'wamid.SYNTHETIC.' || v.n,
  now() - (v.age_h || ' hours')::interval + interval '45 seconds',
  CASE WHEN v.qualified THEN now() - (v.age_h || ' hours')::interval + interval '25 minutes' END,
  v.disq, v.age_band, v.budget_band, true, true, v.work_cover, v.method,
  CASE WHEN v.method IN ('phone','whatsapp_call') THEN v.phone END,
  'any', 'en',
  CASE WHEN v.email IS NOT NULL THEN 'delivered' END,
  CASE WHEN v.email IS NOT NULL THEN 'meeting_invite' END,
  v.stage,
  CASE WHEN v.stage = 'opted_out' THEN now() - (v.age_h || ' hours')::interval + interval '1 hour' END,
  now() - interval '1 day',
  now() + interval '365 days',
  true,
  now() - (v.age_h || ' hours')::interval
FROM (VALUES
  ('00000000-0000-4000-8000-0000000a0001','01','Lead-01','+27600000001','synthetic.lead01@example.com','page',   'SYN_AD_1','work_cover', true,  true,  true,  NULL,          '45_50','1250plus', true, 'teams',        'dispositioned',   312),
  ('00000000-0000-4000-8000-0000000a0002','02','Lead-02','+27600000002',NULL,                          'page',   'SYN_AD_1','work_cover', true,  true,  true,  NULL,          '35_44','750_1250', true, 'phone',        'replacement_due', 300),
  ('00000000-0000-4000-8000-0000000a0003','03','Lead-03','+27600000003',NULL,                          'lead_ad','SYN_AD_2','bond_gap',   false, true,  true,  NULL,          '35_44','750_1250', false,'whatsapp_call','dispositioned',   288),
  ('00000000-0000-4000-8000-0000000a0004','04','Lead-04','+27600000004',NULL,                          'ctwa',   'SYN_AD_2','bond_gap',   true,  true,  true,  NULL,          '45_50','750_1250', true, 'phone',        'dispositioned',   250),
  ('00000000-0000-4000-8000-0000000a0005','05','Lead-05','+27600000005',NULL,                          'ctwa',   'SYN_AD_2','bond_gap',   true,  true,  true,  NULL,          '35_44','1250plus', true, 'phone',        'unbooked_closed', 200),
  ('00000000-0000-4000-8000-0000000a0006','06','Lead-06','+27600000006',NULL,                          'page',   'SYN_AD_1','work_cover', true,  true,  false, NULL,          '35_44','750_1250', true, NULL,           'opted_out',       180),
  ('00000000-0000-4000-8000-0000000a0007','07','Lead-07','+27600000007',NULL,                          'lead_ad','SYN_AD_2','bond_gap',   false, false, false, NULL,          '45_50','750_1250', false,NULL,           'disclosed',       150),
  ('00000000-0000-4000-8000-0000000a0008','08','Lead-08','+27600000008',NULL,                          'page',   'SYN_AD_1','work_cover', true,  true,  false, 'age_out_of_band','lt35','750_1250', true, NULL,           'disqualified',    120),
  ('00000000-0000-4000-8000-0000000a0009','09','Lead-09','+27600000009','synthetic.lead09@example.com','page',   'SYN_AD_1','work_cover', true,  true,  true,  NULL,          '45_50','1250plus', true, 'teams',        'confirmed',        96),
  ('00000000-0000-4000-8000-0000000a0010','10','Lead-10','+27600000010',NULL,                          'page',   'SYN_AD_1','work_cover', true,  true,  true,  NULL,          '35_44','750_1250', true, 'phone',        'attended',         72)
) AS v(id, n, last_name, phone, email, origin, ad_id, angle, ads_consent, verified, qualified, disq, age_band, budget_band, work_cover, method, stage, age_h)
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Bookings (appointments, SMC rows). One slot per day; no overlaps.
-- -----------------------------------------------------------------------------
INSERT INTO public.appointments (id, brand_id, broker_id, client_id, cycle_id, appointment_date, ends_at, status, method,
                                 calendar_provider, graph_event_id, join_url, call_number, invite_email_status,
                                 booked_via, booked_at, schedule_event_id, confirmed_at, reschedule_count, previous_booking_id)
SELECT v.id::uuid, b.id, '00000000-0000-4000-8000-0000000b0001', v.lead::uuid, '00000000-0000-4000-8000-0000000c0001',
       date_trunc('day', now()) + (v.day_offset || ' days')::interval + interval '8 hours',
       date_trunc('day', now()) + (v.day_offset || ' days')::interval + interval '8 hours 30 minutes',
       v.status, v.method, 'outlook', 'SYNTHETIC-GRAPH-EVENT-' || v.n,
       CASE WHEN v.method = 'teams' THEN 'https://teams.example.com/l/meetup-join/synthetic-' || v.n END,
       CASE WHEN v.method IN ('phone','whatsapp_call') THEN v.phone END,
       CASE WHEN v.method = 'teams' THEN 'delivered' ELSE 'not_needed' END,
       v.via, now() - (v.booked_h || ' hours')::interval, 'evt_synthetic_' || v.n || '_schedule',
       CASE WHEN v.status IN ('confirmed','attended','no_show') THEN now() - ((v.booked_h - 12) || ' hours')::interval END,
       v.resched, v.prev::uuid
FROM (VALUES
  ('00000000-0000-4000-8000-0000000d0001','01','00000000-0000-4000-8000-0000000a0001','+27600000001',-11,'attended',   'teams',        'page', 311, 0, NULL),
  ('00000000-0000-4000-8000-0000000d0002','02','00000000-0000-4000-8000-0000000a0002','+27600000002',-10,'no_show',    'phone',        'list', 299, 0, NULL),
  ('00000000-0000-4000-8000-0000000d0003','03','00000000-0000-4000-8000-0000000a0003','+27600000003', -9,'attended',   'whatsapp_call','list', 287, 0, NULL),
  ('00000000-0000-4000-8000-0000000d0004','04','00000000-0000-4000-8000-0000000a0004','+27600000004', -8,'attended',   'phone',        'chat', 249, 0, NULL),
  ('00000000-0000-4000-8000-0000000d0091','91','00000000-0000-4000-8000-0000000a0009','+27600000009', -1,'rescheduled','teams',        'page',  95, 0, NULL),
  ('00000000-0000-4000-8000-0000000d0009','09','00000000-0000-4000-8000-0000000a0009','+27600000009',  2,'confirmed',  'teams',        'list',  30, 1, '00000000-0000-4000-8000-0000000d0091'),
  ('00000000-0000-4000-8000-0000000d0010','10','00000000-0000-4000-8000-0000000a0010','+27600000010', -2,'attended',   'phone',        'list',  71, 0, NULL)
) AS v(id, n, lead, phone, day_offset, status, method, via, booked_h, resched, prev)
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Outcomes (4.12a)
-- -----------------------------------------------------------------------------
INSERT INTO public.outcomes (id, booking_id, lead_id, broker_id, cycle_id, brand_id, outcome, disposition_code, quality_score,
                             summary, lead_reach_check, marked_via, marked_at, auto_marked, unconfirmed, dispute_status)
SELECT v.id::uuid, v.booking::uuid, v.lead::uuid, '00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000c0001',
       b.id, v.outcome, v.disp::public.smc_disposition_code, v.q, v.summary, v.reach, v.via,
       date_trunc('day', now()) + (v.day_offset || ' days')::interval + interval '9 hours',
       v.auto, v.auto, v.dispute
FROM (VALUES
  ('00000000-0000-4000-8000-0000000e0001','00000000-0000-4000-8000-0000000d0001','00000000-0000-4000-8000-0000000a0001','attended','fit_proceeding', 5, 'Synthetic: wants a needs analysis next week.', 'yes', 'whatsapp', -11, false, 'none'),
  ('00000000-0000-4000-8000-0000000e0002','00000000-0000-4000-8000-0000000d0002','00000000-0000-4000-8000-0000000a0002','no_show', NULL,             NULL, NULL,                                            'none','whatsapp', -10, false, 'none'),
  ('00000000-0000-4000-8000-0000000e0003','00000000-0000-4000-8000-0000000d0003','00000000-0000-4000-8000-0000000a0003','attended','nofit_criteria', 2, 'Synthetic: age band misdeclared.',              'yes', 'portal',    -9, false, 'open'),
  ('00000000-0000-4000-8000-0000000e0004','00000000-0000-4000-8000-0000000d0004','00000000-0000-4000-8000-0000000a0004','attended','fit_followup',   4, 'Synthetic: call back after payday.',            'yes', 'whatsapp',  -8, false, 'none'),
  ('00000000-0000-4000-8000-0000000e0010','00000000-0000-4000-8000-0000000d0010','00000000-0000-4000-8000-0000000a0010','attended', NULL,            NULL, NULL,                                            'none','auto',      -1, true,  'none')
) AS v(id, booking, lead, outcome, disp, q, summary, reach, via, day_offset, auto, dispute)
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Replacements (W13; per-cycle cap 4 on Bronze)
-- -----------------------------------------------------------------------------
INSERT INTO public.replacements (id, lead_id, outcome_id, cycle_id, broker_id, brand_id, reason, reason_code,
                                 claimed_at, dispute_window_ends_at, status, replacement_lead_id, decided_at)
SELECT v.id::uuid, v.lead::uuid, v.outcome::uuid, '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000b0001',
       b.id, v.reason, v.code, now() - (v.claimed_h || ' hours')::interval,
       now() - (v.claimed_h || ' hours')::interval + interval '48 hours', v.status, v.repl::uuid,
       CASE WHEN v.status IN ('approved','fulfilled') THEN now() - ((v.claimed_h - 48) || ' hours')::interval END
FROM (VALUES
  ('00000000-0000-4000-8000-000000020002','00000000-0000-4000-8000-0000000a0002','00000000-0000-4000-8000-0000000e0002','no_show',     'no_show',       230, 'fulfilled','00000000-0000-4000-8000-0000000a0010'),
  ('00000000-0000-4000-8000-000000020003','00000000-0000-4000-8000-0000000a0003','00000000-0000-4000-8000-0000000e0003','disqualified','nofit_criteria', 200, 'disputed',  NULL)
) AS v(id, lead, outcome, reason, code, claimed_h, status, repl)
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT DO NOTHING;

-- STOP → suppression (W15)
INSERT INTO public.suppression (id, mobile_hash, source, brand_id, lead_id, note)
VALUES ('00000000-0000-4000-8000-000000050006', public.smc_hash_contact('+27600000006'), 'stop', NULL,
        '00000000-0000-4000-8000-0000000a0006', 'synthetic STOP')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Messages (communications = conversations) — disclosure out, reply in, STOP
-- -----------------------------------------------------------------------------
INSERT INTO public.communications (id, brand_id, lead_id, broker_id, channel, direction, sender_type, recipient_type,
                                   recipient_contact, content, status, external_id, author, template_name,
                                   template_category, workflow, delivered_at, cost_zar, created_at)
SELECT ('00000000-0000-4000-8000-0000001' || lpad(v.n, 2, '0') || lpad(v.k, 3, '0'))::uuid,
       b.id, l.id, l.broker_id, 'whatsapp', v.dir,
       CASE v.dir WHEN 'outbound' THEN 'system' ELSE 'client' END,
       CASE v.dir WHEN 'outbound' THEN 'client' ELSE 'system' END,
       l.phone, v.body, v.status, 'wamid.SYNTHETIC.' || v.n || '.' || v.k,
       CASE v.dir WHEN 'outbound' THEN 'bot' ELSE 'lead' END,
       v.tpl, CASE WHEN v.tpl IS NOT NULL THEN 'utility' END, v.wf,
       CASE WHEN v.dir = 'outbound' THEN l.first_message_at + interval '5 seconds' END,
       CASE WHEN v.dir = 'outbound' THEN 0.12 END,
       l.created_at + (v.after_s || ' seconds')::interval
FROM (VALUES
  ('01','1','outbound','broker_intro_booked','[SYNTHETIC] intro card + disclosure','delivered','W06',  40),
  ('01','2','inbound',  NULL,                '[SYNTHETIC] Thanks, see you then',   'received', 'W07',1200),
  ('02','1','outbound','broker_intro_slots', '[SYNTHETIC] intro card + slots',     'delivered','W06',  40),
  ('02','2','inbound',  NULL,                '[SYNTHETIC] Tuesday works',          'received', 'W07',1200),
  ('05','1','outbound','broker_intro_slots', '[SYNTHETIC] intro card + slots',     'delivered','W06',  40),
  ('05','2','inbound',  NULL,                '[SYNTHETIC] Maybe later',            'received', 'W07',1200),
  ('06','1','outbound','broker_intro_slots', '[SYNTHETIC] intro card + slots',     'delivered','W06',  40),
  ('06','2','inbound',  NULL,                'STOP',                               'received', 'W15',3600),
  ('07','1','outbound','broker_intro_slots', '[SYNTHETIC] intro card + slots',     'delivered','W06',  40)
) AS v(n, k, dir, tpl, body, status, wf, after_s)
JOIN public.leads l ON l.id = ('00000000-0000-4000-8000-0000000a00' || v.n)::uuid
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Timeline events (HubSpot), CAPI log, lead pulse, weekly report
-- -----------------------------------------------------------------------------
INSERT INTO public.lead_activities (lead_id, brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
SELECT l.id, l.brand_id, l.broker_id, l.cycle_id, 'W01', 'system', 'lead_created',
       jsonb_build_object('origin', l.origin, 'synthetic', true), l.created_at, 'synthetic:W01:' || l.id
FROM public.leads l WHERE l.is_synthetic AND l.brand_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.capi_log (lead_id, brand_id, event_name, event_id, action_source, events_received, status)
SELECT l.id, l.brand_id, 'Lead', coalesce(l.lead_event_id, 'evt_' || l.id || '_lead'),
       CASE l.origin WHEN 'ctwa' THEN 'business_messaging' WHEN 'lead_ad' THEN 'system_generated' ELSE 'website' END,
       1, 'test'
FROM public.leads l WHERE l.is_synthetic AND l.consent_ads_at IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_pulse (lead_id, booking_id, broker_id, cycle_id, brand_id, sent_at, thumbs, line, answered_at)
SELECT o.lead_id, o.booking_id, o.broker_id, o.cycle_id, o.brand_id, o.marked_at, 'up', '[SYNTHETIC] Helpful call', o.marked_at + interval '10 minutes'
FROM public.outcomes o
WHERE o.id IN ('00000000-0000-4000-8000-0000000e0001','00000000-0000-4000-8000-0000000e0004')
ON CONFLICT DO NOTHING;

INSERT INTO public.report_history (id, brand_id, broker_id, cycle_id, week, report_kind, status, report_data, sent_at, sent_wa_at, opened_portal_at, ask)
SELECT '00000000-0000-4000-8000-000000070001', b.id, '00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000c0001',
       (date_trunc('week', now()) - interval '7 days')::date, 'broker_weekly', 'sent',
       '{"one_line":"[SYNTHETIC] Week 1: 4 delivered, 4 booked, 3 attended."}'::jsonb,
       date_trunc('week', now()) + interval '5 hours', date_trunc('week', now()) + interval '5 hours',
       date_trunc('week', now()) + interval '6 hours', 'Mark 1 outcome'
FROM public.brands b WHERE b.code = 'SMC'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Ad spend + running costs (so cost-per-good-fit and margin have values)
-- -----------------------------------------------------------------------------
INSERT INTO public.ad_metrics (date, brand_id, campaign_id, adset_id, ad_id, ad_name, concept, angle, format,
                               spend_zar, impressions, clicks, leads_raw, frequency, hook_rate)
SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date - d, b.id, 'SYN_CAMPAIGN_A', 'SYN_ADSET_1', ad.ad_id,
       'C01_' || ad.angle || '_reel_SYNTH', 'C01', ad.angle, 'reel',
       350.00, 9000, 120, 1, 1.4, 0.31
FROM generate_series(1, 13) AS d
CROSS JOIN (VALUES ('SYN_AD_1','work_cover'), ('SYN_AD_2','bond_gap')) AS ad(ad_id, angle)
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT (date, ad_id, placement) DO NOTHING;

INSERT INTO ops.costs (date, kind, brand_id, broker_id, cycle_id, amount_zar, source_ref, note)
SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date - 7, v.kind, b.id,
       '00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000c0001', v.amount, 'synthetic', '[SYNTHETIC]'
FROM (VALUES ('whatsapp', 48.00), ('llm', 22.00), ('infra', 450.00), ('fees', 0.00)) AS v(kind, amount)
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT DO NOTHING;

COMMIT;
