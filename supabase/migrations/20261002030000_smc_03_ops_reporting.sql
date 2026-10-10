-- =============================================================================
-- 20261002030000_smc_03_ops_reporting.sql  —  SortMyCover build, migration 3 of 5
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 pending).
-- Implements crm-gap §A2 (broker_media), §A3, §A4, §A5 (ops schema, NH-16) — build order §D steps 6–7.
--   public, new:    ad_metrics, comments, escalations, insights, lead_pulse, capi_log,
--                   suppression, dsr_requests, retention_log, incidents, obligations, broker_media
--   public, extend: report_history (INV-T21) + view reports, message_templates (INV-T15),
--                   sla_thresholds (INV-T18), profiles (INV-T01)
--   ops, new:       pulses, proposals (= 6A2 decision journal), signals, notifications,
--                   optimisation_memos, costs, quality_grades
--   function:       smc_erase_lead() — W34 erase/pseudonymise in one audited call
-- Schema `ops` holds the 6.8b/4.15 tables so `proposals` / `notifications` can never
-- collide with legacy or live-only tables (NH-11, NH-16).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS ops;
COMMENT ON SCHEMA ops IS 'SMC 6.8b / 4.15 / 6A2: pulse, proposals (decision journal), signals, notifications, memos, costs, judge grades. Admin + n8n_app only.';

-- -----------------------------------------------------------------------------
-- 1. ad_metrics (W21 hourly, W29 quality) — new
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_metrics (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date               date NOT NULL,
  brand_id           uuid NOT NULL REFERENCES public.brands(id),
  campaign_id        text,
  campaign_name      text,
  adset_id           text,
  adset_name         text,
  ad_id              text NOT NULL,
  ad_name            text,               -- C{concept}_{angle}_{format}_{date} (6.2)
  concept            text,
  angle              text,
  format             text,
  placement          text NOT NULL DEFAULT 'all',
  spend_zar          numeric(12,2) NOT NULL DEFAULT 0,
  impressions        bigint NOT NULL DEFAULT 0,
  reach              bigint,
  clicks             bigint NOT NULL DEFAULT 0,
  link_clicks        bigint,
  frequency          numeric(6,2),
  hook_rate          numeric(6,4),       -- 3-s views / impressions
  hold_rate          numeric(6,4),
  leads_raw          integer NOT NULL DEFAULT 0,
  qualified          integer NOT NULL DEFAULT 0,
  verified           integer NOT NULL DEFAULT 0,
  booked             integer NOT NULL DEFAULT 0,
  attended           integer NOT NULL DEFAULT 0,
  good_fit           integer NOT NULL DEFAULT 0,
  quality_index      numeric(3,2),       -- mean broker quality 1–5 (W29, shown when quality_n ≥ 5)
  quality_n          integer NOT NULL DEFAULT 0,
  nofit_rate         numeric(5,4),
  emq                numeric(4,1),
  cpl                numeric(12,2) GENERATED ALWAYS AS (CASE WHEN leads_raw > 0 THEN round(spend_zar / leads_raw, 2) END) STORED,
  cost_per_qualified numeric(12,2) GENERATED ALWAYS AS (CASE WHEN qualified > 0 THEN round(spend_zar / qualified, 2) END) STORED,
  cost_per_attended  numeric(12,2) GENERATED ALWAYS AS (CASE WHEN attended  > 0 THEN round(spend_zar / attended, 2)  END) STORED,
  cost_per_good_fit  numeric(12,2) GENERATED ALWAYS AS (CASE WHEN good_fit  > 0 THEN round(spend_zar / good_fit, 2)  END) STORED,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, ad_id, placement),
  CHECK (quality_index IS NULL OR quality_index BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS ad_metrics_brand_date_idx ON public.ad_metrics (brand_id, date);
CREATE INDEX IF NOT EXISTS ad_metrics_angle_idx ON public.ad_metrics (angle, date);

-- -----------------------------------------------------------------------------
-- 2. comments (W30, 4.14) — new. Author stored as a hash only.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              uuid NOT NULL REFERENCES public.brands(id),
  platform              text NOT NULL CHECK (platform IN ('fb','ig')),
  comment_id            text NOT NULL,
  parent_post_id        text,
  ad_id                 text,
  author_hash           text,
  text_redacted         text,
  received_at           timestamptz NOT NULL DEFAULT now(),
  class                 text CHECK (class IN ('question','interest','objection','complaint','praise','spam','abuse',
                                              'competitor','off_topic','sensitive','own_data_posted')),
  needs_human           boolean NOT NULL DEFAULT false,
  fais_risk             boolean NOT NULL DEFAULT false,
  public_reply_id       text,
  replied_at            timestamptz,
  private_reply_sent_at timestamptz,
  hidden                boolean NOT NULL DEFAULT false,
  sla_seconds           integer,
  origin_lead_id        uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, comment_id)
);
CREATE INDEX IF NOT EXISTS comments_ad_idx ON public.comments (ad_id, received_at);

-- -----------------------------------------------------------------------------
-- 3. escalations (W07 handoff, W30, W31, W12 queue) — new; feeds the console queue
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.escalations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid REFERENCES public.brands(id),
  kind        text NOT NULL CHECK (kind IN ('human_handoff','comment','dm','guardrail_trip','outcome_unmarked',
                                            'replacement_dispute','unmatched_payment','fsca_mismatch',
                                            'complaint','dsr','other')),
  severity    text NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','urgent','red')),
  ref_table   text,
  ref_id      text,
  lead_id     uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  broker_id   uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  raised_at   timestamptz NOT NULL DEFAULT now(),
  assigned_to uuid REFERENCES auth.users(id),
  acked_at    timestamptz,
  resolved_at timestamptz,
  deep_link   text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS escalations_open_idx ON public.escalations (raised_at) WHERE resolved_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. insights (W29) — new
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.insights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   uuid REFERENCES public.brands(id),
  source     text NOT NULL CHECK (source IN ('disposition','voice_note','lead_pulse','precall_question','comment','advisor')),
  broker_id  uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  cycle_id   uuid REFERENCES public.cycles(id),
  ad_id      text,
  angle      text,
  kind       text NOT NULL,       -- e.g. budget_drift, already_covered, theme, what_mattered
  text       text NOT NULL,       -- redacted, no personal details
  n          integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. lead_pulse (W35, 6B.2) — new. Aggregates only reach brokers (no broker RLS on rows).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_pulse (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  broker_id   uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  cycle_id    uuid REFERENCES public.cycles(id),
  brand_id    uuid NOT NULL REFERENCES public.brands(id),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  thumbs      text CHECK (thumbs IN ('up','down')),
  line        text,             -- optional one line, redacted
  answered_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, booking_id)
);

-- -----------------------------------------------------------------------------
-- 6. capi_log (6.3; automation/capi/event-spec.md) — new. Rerun-safe via unique(event_id, event_name).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capi_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  brand_id        uuid REFERENCES public.brands(id),
  event_name      text NOT NULL,
  event_id        text NOT NULL,
  action_source   text NOT NULL CHECK (action_source IN ('website','system_generated','business_messaging','chat','other')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  events_received integer,
  fbtrace_id      text,
  status          text NOT NULL CHECK (status IN ('sent','failed','skipped_no_consent','test')),
  error           text,
  UNIQUE (event_id, event_name)
);

-- -----------------------------------------------------------------------------
-- 7. POPIA lifecycle (2.1.7, 2.3, W15, W24, W34) — new
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppression (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_hash text,                     -- smc_hash_contact(E.164)
  email_hash  text,
  source      text NOT NULL CHECK (source IN ('stop','objection','ncc_registry','complaint','no_consent_ctwa','dsr_erase')),
  brand_id    uuid REFERENCES public.brands(id),    -- NULL = Lead Velocity-wide (also covers the legacy product)
  lead_id     uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (mobile_hash IS NOT NULL OR email_hash IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS suppression_mobile_uidx ON public.suppression (mobile_hash, brand_id) NULLS NOT DISTINCT WHERE mobile_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS suppression_email_uidx  ON public.suppression (email_hash, brand_id)  NULLS NOT DISTINCT WHERE email_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.dsr_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          uuid REFERENCES public.brands(id),
  kind              text NOT NULL CHECK (kind IN ('access','correct','erase','object')),
  channel           text CHECK (channel IN ('portal','email','whatsapp','post','other')),
  requester         text,               -- name as given; erased with the request at closure + retention
  requester_contact text,
  subject_hash      text,               -- smc_hash_contact of the subject's number/email
  lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  verified_at       timestamptz,
  due_at            timestamptz NOT NULL DEFAULT (now() + interval '30 days'),  -- POPIA 30-day answer (2.3)
  status            text NOT NULL DEFAULT 'received' CHECK (status IN ('received','verifying','in_progress','completed','rejected')),
  export_url        text,
  completed_at      timestamptz,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.retention_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  row_id     text NOT NULL,
  action     text NOT NULL CHECK (action IN ('pseudonymise','delete','purge_ip_ua')),
  policy     text NOT NULL,            -- e.g. '12m_after_last_contact', 'unqualified_24h', 'dsr_erase'
  dsr_id     uuid REFERENCES public.dsr_requests(id) ON DELETE SET NULL,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.incidents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declared_at           timestamptz NOT NULL DEFAULT now(),
  severity              text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  summary               text NOT NULL,
  affected_count        integer,
  contained_at          timestamptz,
  regulator_notified_at timestamptz,
  subjects_notified_at  timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obligations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,      -- e.g. IO_REGISTRATION, PAIA_MANUAL, NCC_REGISTRATION, NCC_CLEANSE
  description  text NOT NULL,
  owner        text NOT NULL DEFAULT 'compliance-qa',
  due_at       timestamptz,
  last_done_at timestamptz,
  evidence_url text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','overdue','not_applicable')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 8. broker_media (4.10, 4.10b) — new. brokers.intro_* point at the current approved version.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_media (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id             uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  brand_id              uuid REFERENCES public.brands(id),
  kind                  text NOT NULL CHECK (kind IN ('voice','video','card','headshot')),
  language              text NOT NULL DEFAULT 'en',
  version               integer NOT NULL DEFAULT 1,
  url                   text NOT NULL,
  thumbnail_url         text,
  transcript            text,
  script_text           text,
  ai_check              jsonb,
  approved_at           timestamptz,
  approved_by           uuid REFERENCES auth.users(id),
  compliance_checked_by text,
  is_current            boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker_id, kind, language, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS broker_media_one_current ON public.broker_media (broker_id, kind, language) WHERE is_current;

-- -----------------------------------------------------------------------------
-- 9. reports (4.10a, W14) — extend report_history (INV-T21) + view `reports`
-- -----------------------------------------------------------------------------
ALTER TABLE public.report_history ALTER COLUMN sent_at DROP NOT NULL;      -- generated Sun 23:00, sent Mon 07:00
ALTER TABLE public.report_history ALTER COLUMN recipients DROP NOT NULL;
ALTER TABLE public.report_history DROP CONSTRAINT IF EXISTS report_history_status_check;
ALTER TABLE public.report_history ADD CONSTRAINT report_history_status_check
  CHECK (status IN ('sent','failed','partial','generated','held','queued'));
ALTER TABLE public.report_history
  ADD COLUMN IF NOT EXISTS brand_id         uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS broker_id        uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle_id         uuid REFERENCES public.cycles(id),
  ADD COLUMN IF NOT EXISTS week             date,          -- Monday of the reported week
  ADD COLUMN IF NOT EXISTS report_kind      text,
  ADD COLUMN IF NOT EXISTS pdf_url          text,
  ADD COLUMN IF NOT EXISTS sent_wa_at       timestamptz,
  ADD COLUMN IF NOT EXISTS sent_email_at    timestamptz,
  ADD COLUMN IF NOT EXISTS opened_portal_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_wa_at     timestamptz,
  ADD COLUMN IF NOT EXISTS ask              text,
  ADD COLUMN IF NOT EXISTS ask_done_at      timestamptz,
  ADD COLUMN IF NOT EXISTS judge_passed     boolean,       -- W33 rubric: numbers reconcile, no banned words, one ask
  ADD COLUMN IF NOT EXISTS created_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_history_smc_checks' AND conrelid = 'public.report_history'::regclass) THEN
    ALTER TABLE public.report_history ADD CONSTRAINT report_history_smc_checks CHECK (
      report_kind IS NULL OR report_kind IN ('broker_weekly','midcycle','cycle_end','lv_weekly')
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS report_history_smc_week_uidx
  ON public.report_history (broker_id, week, report_kind) WHERE brand_id IS NOT NULL;

-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'edition') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW public.reports WITH (security_invoker = true) AS
SELECT r.id, r.brand_id, r.broker_id, r.cycle_id, r.week, r.report_kind,
       r.report_data AS payload_json, r.pdf_url, r.sent_wa_at, r.sent_email_at,
       r.opened_portal_at, r.opened_wa_at, r.ask, r.ask_done_at, r.judge_passed,
       r.status, r.created_at
FROM public.report_history r
WHERE r.brand_id IS NOT NULL
    $smc_q$;
  END IF;
END $smc_v$;
COMMENT ON VIEW public.reports IS 'SMC 4.10a: prompt name for SortMyCover rows in report_history (INV-T21). One row feeds WhatsApp, portal and email.';

-- -----------------------------------------------------------------------------
-- 10. message_templates (4.6 template list, W27) — extend INV-T15
-- -----------------------------------------------------------------------------
ALTER TABLE public.message_templates DROP CONSTRAINT IF EXISTS message_templates_channel_check;
ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_channel_check
  CHECK (channel IN ('email','sms','whatsapp','all','whatsapp_cloud'));
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS brand_id         uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS wa_name          text,
  ADD COLUMN IF NOT EXISTS language         text,
  ADD COLUMN IF NOT EXISTS meta_category    text,      -- as assigned by Meta (pre-mortem #1: accepted)
  ADD COLUMN IF NOT EXISTS meta_status      text,
  ADD COLUMN IF NOT EXISTS meta_template_id text,
  ADD COLUMN IF NOT EXISTS header_type      text,
  ADD COLUMN IF NOT EXISTS has_flow_button  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version          integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS submitted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_wa_uidx
  ON public.message_templates (brand_id, wa_name, language) WHERE wa_name IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 11. sla_thresholds (6.3 first message < 60 s) — extend INV-T18. channel stays unique,
--     so the SMC row uses its own channel key instead of changing the legacy constraint.
-- -----------------------------------------------------------------------------
ALTER TABLE public.sla_thresholds
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS metric   text;
INSERT INTO public.sla_thresholds (channel, warning_seconds, critical_seconds, enabled, brand_id, metric)
SELECT 'smc_first_message', 45, 60, true, b.id, 'first_message_seconds'
FROM public.brands b WHERE b.code = 'SMC'
ON CONFLICT (channel) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 12. profiles — Jonathan/KG alert numbers for 6.8b notifications (extend INV-T01)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS notify_dnd      jsonb NOT NULL DEFAULT '{"start":"22:00","end":"07:00"}'::jsonb;

-- -----------------------------------------------------------------------------
-- 13. ops.* (6.8b, 4.15, 6A2 #7)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.pulses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date           date NOT NULL UNIQUE,
  status         text NOT NULL CHECK (status IN ('green','amber','red')),
  working        text,
  not_working    text,
  business_line  text,                     -- "What this means for the business" (6A2 #5)
  actions        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ≤ 3 proposal ids + titles
  compliance     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- consent %, disclosure %, STOP %, last cleanse, advice count
  build          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(actions) = 'array' AND jsonb_array_length(actions) <= 3)
);

CREATE TABLE IF NOT EXISTS ops.proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source             text NOT NULL DEFAULT 'advisor' CHECK (source IN ('advisor','manual','kill_rule','pricing','routing','judge')),
  faculty            text NOT NULL CHECK (faculty IN ('media','page_flow','conversation','nurture_show','comments_dms',
                                                      'broker','billing','compliance','infra_cost','brand_search','build')),
  title              text NOT NULL,
  metric             text,                 -- must resolve to /knowledge/metrics.md
  number_at_decision numeric,
  forecast           text,
  cost_zar           numeric(12,2),
  grade              text,                 -- evidence grade A/B/C
  test               text,
  owner_agent        text,
  pulse_id           uuid REFERENCES ops.pulses(id) ON DELETE SET NULL,
  task_id            text,                 -- build/tasks.json id created on Approve
  status             text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','snoozed','declined','done','checked')),
  decided_by         uuid REFERENCES auth.users(id),
  decided_at         timestamptz,
  decline_reason     text,
  snooze_until       date,
  check_date         date,
  actual             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'declined' OR decline_reason IS NOT NULL)
);
COMMENT ON TABLE ops.proposals IS 'SMC 6.8b proposals + 6A2 #7 decision journal (Approve/Decline, kill/scale, pricing, routing). One journal, no second table.';

CREATE TABLE IF NOT EXISTS ops.signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty     text,
  metric      text NOT NULL,
  value       numeric,
  limit_value numeric,                -- prompt field `limit` (reserved word)
  run         text,                   -- e.g. '7-point run above centre line'
  cause       text,
  owner       text,
  broker_id   uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('daily_pulse','approval','red','weekly_memo','monthly_retro','build_gate','escalation_call')),
  recipient    text NOT NULL,          -- prompt field `to` (reserved word): 'jonathan' | 'kg' | profile user id
  channel      text NOT NULL CHECK (channel IN ('whatsapp','email','console','voice')),
  ref_table    text,
  ref_id       text,
  dedupe_key   text,                   -- same signal never notifies twice in 24 h (6.8b)
  sent_at      timestamptz,
  acked_at     timestamptz,
  escalated_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_notifications_dedupe_idx ON ops.notifications (dedupe_key, sent_at);

CREATE TABLE IF NOT EXISTS ops.optimisation_memos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('weekly_memo','monthly_retro')),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  body_md      text NOT NULL,
  actions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_url      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, period_start)
);

CREATE TABLE IF NOT EXISTS ops.costs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('media','whatsapp','llm','infra','fees','other')),
  brand_id   uuid REFERENCES public.brands(id),
  broker_id  uuid REFERENCES public.brokers(id) ON DELETE SET NULL,  -- NULL = shared (allocated in facts.fact_cost)
  cycle_id   uuid REFERENCES public.cycles(id),
  amount_zar numeric(12,2) NOT NULL,
  source_ref text,                      -- e.g. 'meta_insights', 'wa_pricing_analytics', 'paystack:ref'
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_costs_idem_uidx ON ops.costs (date, kind, brand_id, broker_id, source_ref) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS ops.quality_grades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graded_at   timestamptz NOT NULL DEFAULT now(),
  sample_ref  text NOT NULL,           -- table:id of the graded message/reply/brief/creative/page
  faculty     text,
  rule        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('info','minor','major','critical')),
  passed      boolean NOT NULL,
  note        text,                    -- redacted
  judge_model text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_quality_grades_day_idx ON ops.quality_grades (graded_at);

-- -----------------------------------------------------------------------------
-- 14. smc_erase_lead() — W34: erase or pseudonymise one lead in one audited call.
--     Consent record (text, version, timestamps, source, URL) is kept 5 years as
--     evidence (2.1.7); identifying values are removed. Granted to n8n_app in smc_05.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_erase_lead(p_lead_id uuid, p_action text, p_policy text, p_dsr_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
  v_hash  text;
BEGIN
  IF p_action NOT IN ('pseudonymise','delete','purge_ip_ua') THEN
    RAISE EXCEPTION 'smc_erase_lead: unknown action %', p_action;
  END IF;
  SELECT brand_id, public.smc_hash_contact(phone) INTO v_brand, v_hash FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'smc_erase_lead: lead % is not a SortMyCover lead (legacy rows are out of scope)', p_lead_id;
  END IF;
  PERFORM set_config('smc.source', 'n8n', true);
  PERFORM set_config('smc.reason', 'W34 ' || p_action || ' / ' || p_policy, true);

  IF p_action = 'purge_ip_ua' THEN
    UPDATE public.leads SET client_ip = NULL, client_user_agent = NULL WHERE id = p_lead_id;
  ELSE
    UPDATE public.communications
       SET content = NULL, subject = NULL, recipient_contact = 'erased', redacted = true,
           metadata = '{}'::jsonb, call_recording_url = NULL
     WHERE lead_id = p_lead_id;
    UPDATE public.outcomes SET transcript = NULL, summary = NULL, voice_note_url = NULL WHERE lead_id = p_lead_id;
    UPDATE public.lead_pulse SET line = NULL WHERE lead_id = p_lead_id;
    UPDATE public.appointments SET call_number = NULL, join_url = NULL, ics_url = NULL WHERE client_id = p_lead_id;
    IF p_action = 'pseudonymise' THEN
      UPDATE public.leads
         SET first_name = NULL, last_name = NULL, email = NULL,
             phone = 'erased:' || coalesce(v_hash, p_lead_id::text),
             call_number = NULL, alt_number = NULL, address = NULL, notes = NULL,
             client_ip = NULL, client_user_agent = NULL, conv_state = NULL,
             fbclid = NULL, fbp = NULL, fbc = NULL, ctwa_clid = NULL
       WHERE id = p_lead_id;
    ELSE
      DELETE FROM public.communications WHERE lead_id = p_lead_id;
      DELETE FROM public.leads WHERE id = p_lead_id;   -- cascades: lead_activities, appointments, outcomes, replacements, lead_pulse
    END IF;
  END IF;

  INSERT INTO public.retention_log (table_name, row_id, action, policy, dsr_id)
  VALUES ('public.leads', p_lead_id::text, p_action, p_policy, p_dsr_id);
END $$;
COMMENT ON FUNCTION public.smc_erase_lead(uuid, text, text, uuid) IS 'SMC W34: pseudonymise | delete | purge_ip_ua for one SortMyCover lead; logs retention_log; audited via triggers.';
-- Supabase grants EXECUTE on new public functions to anon/authenticated by default: close it here, not later.
REVOKE ALL ON FUNCTION public.smc_erase_lead(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 15. updated_at + audit triggers (append-only logs capi_log, retention_log excluded)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.ad_metrics','public.comments','public.escalations','public.insights','public.lead_pulse',
    'public.suppression','public.dsr_requests','public.incidents','public.obligations','public.broker_media',
    'ops.pulses','ops.proposals','ops.signals','ops.notifications','ops.optimisation_memos','ops.costs','ops.quality_grades'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_touch_updated_at ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.smc_audit()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.report_history','public.message_templates','public.sla_thresholds'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.smc_audit(%L)', t, 'brand_scoped');
  END LOOP;
END $$;
