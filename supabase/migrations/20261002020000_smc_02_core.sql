-- =============================================================================
-- 20261002020000_smc_02_core.sql  —  SortMyCover build, migration 2 of 5: core objects
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 dump + NH-15 pending).
-- Implements crm-gap §A1 (+ A2 agreement fields) in the §D build order, steps 2–5:
--   new:    brands, pricing (+ SMC seed), cycles, outcomes, replacements,
--           invoices_smc, bank_credits, webhook_events, audit_log
--   extend: brokers (INV-T03), leads (INV-T04), lead_activities (INV-T05),
--           communications (INV-T14) + view conversations,
--           appointments (INV-T24) + view bookings, admin_documents (INV-T12)
--   views:  v_cycle_progress (Mark's line: committed · verified · booked · attended · replacements N/cap)
--
-- Rules followed (0.2, crm-gap header, pre-mortem #8):
--   * additive only: CREATE … IF NOT EXISTS, ADD COLUMN IF NOT EXISTS; CHECKs on
--     legacy tables are only ever widened (superset) or scoped to brand rows;
--     NOT NULL is only ever relaxed. Nothing the legacy product reads is renamed/dropped.
--   * SortMyCover rows = brand_id IS NOT NULL; legacy rows keep brand_id NULL (NH-14).
--   * names chosen to avoid NH-11 collisions: no public.invoices / proposals / notifications.
--   * 4.6 field names that already exist under another name are mapped, not duplicated:
--       brokers.id ≙ broker_id · firm_name ≙ practice_name · contact_person ≙ adviser_name
--       whatsapp_number ≙ adviser_whatsapp · calendar_email ≙ calendar_id
--       leads.phone ≙ mobile (E.164) · appointments.client_id ≙ bookings.lead_id
--       appointments.appointment_date ≙ bookings.starts_at · brands.id ≙ brand_id
--   * HubSpot: every workflow appends a stamped lead_activities row; Pipedrive:
--     leads.stage + stage_entered_at; Salesforce: audit_log trigger on every write.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;  -- overlap guard on bookings

-- -----------------------------------------------------------------------------
-- 0. Role helpers (reuse INV-F02 has_role; SECURITY DEFINER avoids RLS recursion)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin'::public.app_role) $$;

CREATE OR REPLACE FUNCTION public.smc_current_broker_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT b.id FROM public.brokers b WHERE b.user_id = auth.uid() LIMIT 1 $$;

COMMENT ON FUNCTION public.smc_is_admin() IS 'SMC: true when the caller holds app_role admin (wraps has_role, INV-F02).';
COMMENT ON FUNCTION public.smc_current_broker_id() IS 'SMC: brokers.id of the signed-in broker (brokers.user_id = auth.uid(), INV-A06 pattern).';

-- Contact hash used by suppression, dedupe and facts (unsalted on purpose so the
-- NCC registry / STOP list can be matched without a key; never used as a lead key).
CREATE OR REPLACE FUNCTION public.smc_hash_contact(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE WHEN p IS NULL OR btrim(p) = '' THEN NULL
                  ELSE encode(sha256(convert_to(lower(btrim(p)), 'UTF8')), 'hex') END $$;

-- -----------------------------------------------------------------------------
-- 1. brands (4.6, W27, W28) — new. One row per consumer brand.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brands (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- ≙ brand_id
  code                    text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]{2,12}$'),
  name                    text NOT NULL,
  language                text NOT NULL DEFAULT 'en',
  domain                  text,
  staging_url             text,
  business_id             text,
  page_id                 text,
  ig_user_id              text,
  waba_id                 text,
  phone_number_id         text,
  standby_phone_number_id text,
  ad_account_id           text,
  standby_ad_account_id   text,
  pixel_id                text,
  dataset_id              text,
  app_id                  text,
  system_user_token_ref   text,   -- secret NAME in .env / Vault, never the value
  booking_flow_id         text,
  flow_public_key_ref     text,   -- secret NAME
  handles                 jsonb NOT NULL DEFAULT '{}'::jsonb,  -- fb/ig/tiktok/yt/li/x
  verification_status     text,
  disclosure_text         text,
  brand_kit_url           text,
  booking_ui              text NOT NULL DEFAULT 'list' CHECK (booking_ui IN ('list','flow')),  -- W28 flag
  -- W27 health fields
  page_status             text,
  ig_status               text,
  bv_status               text,
  ad_account_status       text,
  waba_quality            text,
  template_status         jsonb NOT NULL DEFAULT '{}'::jsonb,
  emq                     numeric(4,1),
  health_checked_at       timestamptz,
  is_active               boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_no_secret_values CHECK (
    coalesce(system_user_token_ref,'') !~ '^EAA' AND coalesce(flow_public_key_ref,'') !~ 'BEGIN'
  )
);
COMMENT ON TABLE public.brands IS 'SMC 4.6: one row per consumer brand (SortMyCover, CoverKlaar). Ads, pages, templates and routing key off brand_id. *_ref columns hold secret names only.';

INSERT INTO public.brands (code, name, language, domain, staging_url, is_active, disclosure_text)
VALUES
  ('SMC', 'SortMyCover', 'en', 'sortmycover.co.za', 'sortmycover.leadvelocity.co.za', true, NULL),
  ('CK',  'CoverKlaar',  'af', NULL, NULL, false, NULL)   -- held Afrikaans variant (0.1); domain recorded when confirmed
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. pricing (3.6) — new. THE single price source; every consumer reads it (W25).
--    Price history: cycles snapshot price/committed/cap at payment; edits are in audit_log.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing (
  tier_code             text PRIMARY KEY CHECK (tier_code ~ '^[A-Z0-9_]{3,20}$'),
  brand_id              uuid REFERENCES public.brands(id),
  name                  text NOT NULL,
  price_zar             numeric(12,2) NOT NULL CHECK (price_zar > 0),          -- excl. VAT (0.1)
  committed_leads       integer NOT NULL CHECK (committed_leads > 0),
  replacement_cap_cycle integer NOT NULL CHECK (replacement_cap_cycle >= 0),    -- per cycle (0.1)
  media_share_zar       numeric(12,2) NOT NULL CHECK (media_share_zar >= 0),    -- 3.5 media column (incl. VAT on media)
  paystack_page_code    text,
  paystack_plan_code    text,
  vat_rate              numeric(5,4),                                           -- NULL until VAT-registered
  sort_order            integer NOT NULL DEFAULT 0,
  active_from           date NOT NULL DEFAULT current_date,
  active_to             date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (active_to IS NULL OR active_to >= active_from)
);
COMMENT ON TABLE public.pricing IS 'SMC 3.6: one row per tier. Excl. VAT. Nothing else may hard-code a price (W25 diff check). SMC_* codes never collide with legacy brokers.tier (NH-14).';

INSERT INTO public.pricing (tier_code, brand_id, name, price_zar, committed_leads, replacement_cap_cycle, media_share_zar, sort_order, active_from)
SELECT v.tier_code, b.id, v.name, v.price, v.committed, v.cap, v.media, v.sort_order, DATE '2026-10-01'
FROM (VALUES
  ('SMC_BRONZE', 'Bronze', 16500.00, 20, 4,  8492.00, 1),
  ('SMC_SILVER', 'Silver', 24500.00, 30, 6, 12738.00, 2),
  ('SMC_GOLD',   'Gold',   35500.00, 45, 9, 19108.00, 3)
) AS v(tier_code, name, price, committed, cap, media, sort_order)
CROSS JOIN public.brands b
WHERE b.code = 'SMC'
ON CONFLICT (tier_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. brokers (4.6, 6.1, 3.6) — extend INV-T03
-- -----------------------------------------------------------------------------
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS brand_id               uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS tier_code              text REFERENCES public.pricing(tier_code),
  ADD COLUMN IF NOT EXISTS ref_code               text,         -- short code for bank references LV-{ref_code}-{tier}-{YYYYMM}
  ADD COLUMN IF NOT EXISTS fsp_number             text,
  ADD COLUMN IF NOT EXISTS fsp_verified_at        timestamptz,
  ADD COLUMN IF NOT EXISTS fsp_check              jsonb,
  ADD COLUMN IF NOT EXISTS calendar_provider      text NOT NULL DEFAULT 'outlook',
  ADD COLUMN IF NOT EXISTS ms_tenant_id           text,
  ADD COLUMN IF NOT EXISTS calendar_token_ref     text,         -- Vault secret NAME; google_calendar_token is not used for new data
  ADD COLUMN IF NOT EXISTS methods_supported      text[] NOT NULL DEFAULT ARRAY['teams','phone']::text[],  -- pre-mortem #12 default
  ADD COLUMN IF NOT EXISTS meeting_hours          jsonb NOT NULL DEFAULT '{"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]]}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone               text NOT NULL DEFAULT 'Africa/Johannesburg',
  ADD COLUMN IF NOT EXISTS slot_minutes           integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS buffer_minutes         integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS min_notice_hours       integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS horizon_days           integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS max_meetings_per_day   integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_meetings_per_week  integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS bookings_paused        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS add_client_as_attendee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS routing_rules          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- exclusivity, provinces, languages (1.3)
  ADD COLUMN IF NOT EXISTS routing_on             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS headshot_url           text,
  ADD COLUMN IF NOT EXISTS bio_short              text,
  ADD COLUMN IF NOT EXISTS languages              text[] NOT NULL DEFAULT ARRAY['en']::text[],
  ADD COLUMN IF NOT EXISTS years_advising         integer,
  ADD COLUMN IF NOT EXISTS intro_card_url         text,
  ADD COLUMN IF NOT EXISTS intro_voice_url        jsonb,        -- {"en": url, "af": url}
  ADD COLUMN IF NOT EXISTS intro_video_url        jsonb,        -- per language
  ADD COLUMN IF NOT EXISTS intro_media_pref       text,
  ADD COLUMN IF NOT EXISTS positioning_answers    jsonb,
  ADD COLUMN IF NOT EXISTS consent_mode           text NOT NULL DEFAULT 'named',  -- 0.1: named while one broker
  ADD COLUMN IF NOT EXISTS onboarding_step        text,
  ADD COLUMN IF NOT EXISTS onboarding_progress    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {step: done_at}
  ADD COLUMN IF NOT EXISTS explainer_watched_at   timestamptz,
  ADD COLUMN IF NOT EXISTS approved_live_by       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_live_at       timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS card_autorenew         boolean NOT NULL DEFAULT false,  -- opt-in only (0.1)
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS close_rate             numeric(5,2),  -- broker-entered, ROI view only, never in any fee (3.7, FAIS)
  ADD COLUMN IF NOT EXISTS avg_commission_zar     numeric(12,2), -- broker-entered, ROI view only
  ADD COLUMN IF NOT EXISTS active                 boolean GENERATED ALWAYS AS (status = 'active') STORED;  -- 4.6 `active`

-- current_cycle_id is added after cycles exists (section 4).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_smc_checks' AND conrelid = 'public.brokers'::regclass) THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_smc_checks CHECK (
          calendar_provider IN ('outlook','google')
      AND consent_mode IN ('named','generic')
      AND (intro_media_pref IS NULL OR intro_media_pref IN ('voice','video','both'))
      AND methods_supported <@ ARRAY['teams','zoom','meet','whatsapp_call','phone']::text[]
      AND slot_minutes BETWEEN 10 AND 240 AND buffer_minutes BETWEEN 0 AND 120
      AND min_notice_hours BETWEEN 0 AND 168 AND horizon_days BETWEEN 1 AND 60
      AND max_meetings_per_day BETWEEN 0 AND 24 AND max_meetings_per_week BETWEEN 0 AND 100
      AND (close_rate IS NULL OR close_rate BETWEEN 0 AND 100)
      AND (ref_code IS NULL OR ref_code ~ '^[A-Z0-9]{3,8}$')
    );
  END IF;
END $$;

-- Widen the status CHECK (superset; legacy 'Active'/'Inactive' still valid).
-- NH-11: if the live constraint has another name, the old one must be dropped by hand (runbook).
-- SAFETY REWRITE (2026-10-10 drift review): the LIVE constraint is ('Active','Inactive','Prospect'). The original list
-- here omitted 'Prospect', which (a) aborts this migration on any live broker row with status 'Prospect' (the
-- onboarding trigger fn_onboarding_to_pipeline creates exactly those), and (b) would silently break that trigger
-- afterwards (it swallows the CHECK error, so new onboarding submissions would stop creating pipeline brokers).
-- 'Prospect' is now kept: the new list is a strict superset of the live one.
ALTER TABLE public.brokers DROP CONSTRAINT IF EXISTS brokers_status_check;
ALTER TABLE public.brokers ADD CONSTRAINT brokers_status_check CHECK (
  status IS NULL OR status IN ('Active','Inactive','Prospect',
                               'onboarding','onboarded','ready_for_go_live','active','paused','ended'));

CREATE UNIQUE INDEX IF NOT EXISTS brokers_ref_code_uidx ON public.brokers (ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS brokers_brand_status_idx ON public.brokers (brand_id, status) WHERE brand_id IS NOT NULL;

COMMENT ON COLUMN public.brokers.consent_mode IS 'SMC 2.1.2 / 0.1: named (default while one broker) | generic (only after practitioner opinion).';
COMMENT ON COLUMN public.brokers.active IS 'SMC 4.6 active flag = status ''active''. Legacy ''Active'' rows are not routed (brand_id NULL).';

-- -----------------------------------------------------------------------------
-- 4. cycles (0.2 linkage, 6.1 step 7, 0.1 shortfall) — new
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cycles (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- ≙ cycle_id
  broker_id                 uuid NOT NULL REFERENCES public.brokers(id) ON DELETE RESTRICT,
  brand_id                  uuid NOT NULL REFERENCES public.brands(id),
  tier_code                 text NOT NULL REFERENCES public.pricing(tier_code),
  cycle_no                  integer NOT NULL CHECK (cycle_no > 0),
  previous_cycle_id         uuid REFERENCES public.cycles(id),
  -- snapshot of pricing at payment (price history lives here)
  price_zar                 numeric(12,2) NOT NULL,
  committed_leads           integer NOT NULL,
  replacement_cap           integer NOT NULL,
  media_share_zar           numeric(12,2) NOT NULL,
  starts_at                 timestamptz NOT NULL,
  ends_at                   timestamptz NOT NULL,
  extended_until            timestamptz,                -- ≤ ends_at + 14 d (0.1 shortfall)
  status                    text NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled','active','extended','closed','not_renewed')),
  renewal_offer_sent_at     timestamptz,
  renewal_decision          text CHECK (renewal_decision IN ('renewed','upgraded','downgraded','not_renewed')),
  shortfall_leads           integer CHECK (shortfall_leads >= 0),
  shortfall_credit_zar      numeric(12,2) CHECK (shortfall_credit_zar >= 0),
  policies_written_reported integer CHECK (policies_written_reported >= 0),  -- voluntary, ROI view only (3.7, FAIS)
  closed_at                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker_id, cycle_no),
  CHECK (ends_at > starts_at),
  CHECK (extended_until IS NULL OR (extended_until > ends_at AND extended_until <= ends_at + interval '14 days')),
  CHECK (shortfall_credit_zar IS NULL OR shortfall_credit_zar <= price_zar)   -- liability capped at cycle price (0.1)
);
CREATE UNIQUE INDEX IF NOT EXISTS cycles_one_active_per_broker ON public.cycles (broker_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS cycles_broker_dates_idx ON public.cycles (broker_id, starts_at);
COMMENT ON TABLE public.cycles IS 'SMC: one paid 30-day cycle. New row on payment (W16). Every lead carries cycle_id from creation (0.2).';

ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS current_cycle_id uuid REFERENCES public.cycles(id);

-- -----------------------------------------------------------------------------
-- 5. leads (0.2, 3.3, 4.6, 6.3, event-spec) — extend INV-T04
-- -----------------------------------------------------------------------------
ALTER TABLE public.leads ALTER COLUMN email DROP NOT NULL;   -- 0.1 Email: only collected for Teams/Zoom/Meet

ALTER TABLE public.leads
  -- linkage (0.2: written before the first WhatsApp)
  ADD COLUMN IF NOT EXISTS brand_id                uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS tier_code               text REFERENCES public.pricing(tier_code),
  ADD COLUMN IF NOT EXISTS cycle_id                uuid REFERENCES public.cycles(id),
  ADD COLUMN IF NOT EXISTS routed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS routing_reason          text,
  -- attribution / join keys (6.3, automation/capi/event-spec.md)
  ADD COLUMN IF NOT EXISTS origin                  text,
  ADD COLUMN IF NOT EXISTS campaign_id             text,
  ADD COLUMN IF NOT EXISTS adset_id                text,
  ADD COLUMN IF NOT EXISTS ad_id                   text,
  ADD COLUMN IF NOT EXISTS concept                 text,
  ADD COLUMN IF NOT EXISTS angle                   text,
  ADD COLUMN IF NOT EXISTS placement               text,
  ADD COLUMN IF NOT EXISTS utm_source              text,
  ADD COLUMN IF NOT EXISTS utm_medium              text,
  ADD COLUMN IF NOT EXISTS utm_campaign            text,
  ADD COLUMN IF NOT EXISTS utm_content             text,
  ADD COLUMN IF NOT EXISTS utm_term                text,
  ADD COLUMN IF NOT EXISTS fbclid                  text,
  ADD COLUMN IF NOT EXISTS fbp                     text,
  ADD COLUMN IF NOT EXISTS fbc                     text,
  ADD COLUMN IF NOT EXISTS lead_event_id           text,   -- browser event_id (event-spec name)
  ADD COLUMN IF NOT EXISTS leadgen_id              text,   -- Lead Ads (W02)
  ADD COLUMN IF NOT EXISTS ctwa_clid               text,   -- Click-to-WhatsApp (W03)
  ADD COLUMN IF NOT EXISTS ref                     text,
  ADD COLUMN IF NOT EXISTS page_url                text,
  ADD COLUMN IF NOT EXISTS client_ip               text,   -- purged after CAPI send
  ADD COLUMN IF NOT EXISTS client_user_agent       text,   -- purged after CAPI send
  -- consent record (2.1.2; kept 5 years as evidence, 2.1.7)
  ADD COLUMN IF NOT EXISTS consent_text            text,
  ADD COLUMN IF NOT EXISTS consent_text_version    text,
  ADD COLUMN IF NOT EXISTS consent_mode            text,   -- mode in force at capture
  ADD COLUMN IF NOT EXISTS consent_at              timestamptz,
  ADD COLUMN IF NOT EXISTS consent_ads_at          timestamptz,  -- advertising-improvement sentence; gates CAPI (event-spec)
  ADD COLUMN IF NOT EXISTS consent_page_url        text,
  ADD COLUMN IF NOT EXISTS consent_source          text,
  -- verification (3.3) + disclosure evidence (4.6)
  ADD COLUMN IF NOT EXISTS line_type               text,
  ADD COLUMN IF NOT EXISTS first_message_at        timestamptz,  -- SLA < 60 s (6.3); 72 h window starts here
  ADD COLUMN IF NOT EXISTS wa_delivered_at         timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at             timestamptz,
  ADD COLUMN IF NOT EXISTS disclosure_msg_id       text,         -- wamid
  ADD COLUMN IF NOT EXISTS disclosure_delivered_at timestamptz,
  -- qualification (3.3, 4.5 quiz)
  ADD COLUMN IF NOT EXISTS qualified_at            timestamptz,
  ADD COLUMN IF NOT EXISTS disqualified_reason     text,
  ADD COLUMN IF NOT EXISTS age_band                text,
  ADD COLUMN IF NOT EXISTS budget_band             text,
  ADD COLUMN IF NOT EXISTS bond                    boolean,
  ADD COLUMN IF NOT EXISTS dependants              boolean,
  ADD COLUMN IF NOT EXISTS work_cover              boolean,
  ADD COLUMN IF NOT EXISTS method_pref             text,
  ADD COLUMN IF NOT EXISTS dedupe_hash             text,          -- smc_hash_contact(phone); 90-day rule
  ADD COLUMN IF NOT EXISTS duplicate_of            uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  -- contact data (4.6 table)
  ADD COLUMN IF NOT EXISTS call_number             text,
  ADD COLUMN IF NOT EXISTS call_number_line_type   text,
  ADD COLUMN IF NOT EXISTS alt_number              text,
  ADD COLUMN IF NOT EXISTS alt_purpose             text,
  ADD COLUMN IF NOT EXISTS best_time               text,
  ADD COLUMN IF NOT EXISTS language                text,
  ADD COLUMN IF NOT EXISTS email_status            text,
  ADD COLUMN IF NOT EXISTS email_purpose           text,
  -- state (Pipedrive stage bar) and lifecycle
  ADD COLUMN IF NOT EXISTS stage                   text,
  ADD COLUMN IF NOT EXISTS stage_entered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS conv_state              jsonb,         -- W07 memory
  ADD COLUMN IF NOT EXISTS opted_out_at            timestamptz,
  ADD COLUMN IF NOT EXISTS health_flag             boolean NOT NULL DEFAULT false,  -- boolean only, never the detail (2.1.7)
  ADD COLUMN IF NOT EXISTS last_contact_at         timestamptz,
  ADD COLUMN IF NOT EXISTS retention_delete_after  timestamptz,   -- 12 months after last contact (2.1.7)
  ADD COLUMN IF NOT EXISTS is_synthetic            boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_smc_checks' AND conrelid = 'public.leads'::regclass) THEN
    -- Every condition is either NULL-tolerant or scoped to brand rows, so legacy rows always pass.
    ALTER TABLE public.leads ADD CONSTRAINT leads_smc_checks CHECK (
          (origin IS NULL        OR origin IN ('page','lead_ad','ctwa','comment','dm','manual'))
      AND (consent_mode IS NULL  OR consent_mode IN ('named','generic'))
      AND (line_type IS NULL     OR line_type IN ('mobile','landline','voip','unknown'))
      AND (call_number_line_type IS NULL OR call_number_line_type IN ('mobile','landline','voip','unknown'))
      AND (age_band IS NULL      OR age_band IN ('lt35','35_44','45_50','51plus'))          -- 0.1 bands
      AND (budget_band IS NULL   OR budget_band IN ('lt750','750_1250','1250plus'))         -- 0.1: both upper bands qualify
      AND (method_pref IS NULL   OR method_pref IN ('teams','zoom','meet','whatsapp_call','phone'))
      AND (alt_purpose IS NULL   OR alt_purpose IN ('reach_fallback'))
      AND (best_time IS NULL     OR best_time IN ('mornings','lunchtime','afternoons','evenings','any'))
      AND (email_status IS NULL  OR email_status IN ('unchecked','mx_ok','delivered','bounced','corrected'))
      AND (email_purpose IS NULL OR email_purpose IN ('meeting_invite'))
      AND (stage IS NULL OR stage IN ('new','disclosed','verified','qualified','booked','confirmed',
                                      'attended','no_show','dispositioned','unbooked_closed',
                                      'opted_out','replacement_due','disqualified'))
      -- 0.2 / 1.3: routing writes broker_id before the first WhatsApp goes out
      AND (brand_id IS NULL OR first_message_at IS NULL OR broker_id IS NOT NULL)
      -- 2.1.2: no SortMyCover lead without a consent record
      AND (brand_id IS NULL OR (consent_at IS NOT NULL AND consent_text IS NOT NULL AND consent_source IS NOT NULL))
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS leads_leadgen_id_uidx    ON public.leads (leadgen_id)    WHERE leadgen_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS leads_lead_event_id_uidx ON public.leads (brand_id, lead_event_id) WHERE lead_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_broker_cycle_idx ON public.leads (broker_id, cycle_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_dedupe_idx       ON public.leads (dedupe_hash, created_at) WHERE dedupe_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_ad_idx           ON public.leads (ad_id) WHERE ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_stage_idx        ON public.leads (brand_id, stage) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_retention_idx    ON public.leads (retention_delete_after) WHERE retention_delete_after IS NOT NULL;

-- Stage bookkeeping (Pipedrive age-in-stage) for SMC rows only.
CREATE OR REPLACE FUNCTION public.smc_leads_stage_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.stage IS NULL THEN
    NEW.stage := 'new';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_entered_at := now();
  END IF;
  IF NEW.dedupe_hash IS NULL AND NEW.phone IS NOT NULL THEN
    NEW.dedupe_hash := public.smc_hash_contact(NEW.phone);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS smc_leads_stage_stamp ON public.leads;
CREATE TRIGGER smc_leads_stage_stamp
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.smc_leads_stage_stamp();

-- -----------------------------------------------------------------------------
-- 6. lead_activities = the one stamped timeline (HubSpot) — extend INV-T05
-- -----------------------------------------------------------------------------
ALTER TABLE public.lead_activities ALTER COLUMN agent_id DROP NOT NULL;  -- system events have no agent
ALTER TABLE public.lead_activities ALTER COLUMN lead_id  DROP NOT NULL;  -- broker-level events (W20 nudges)
ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS brand_id        uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS broker_id       uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle_id        uuid REFERENCES public.cycles(id),
  ADD COLUMN IF NOT EXISTS workflow        text,
  ADD COLUMN IF NOT EXISTS actor_type      text,
  ADD COLUMN IF NOT EXISTS payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurred_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_activities_smc_checks' AND conrelid = 'public.lead_activities'::regclass) THEN
    ALTER TABLE public.lead_activities ADD CONSTRAINT lead_activities_smc_checks CHECK (
          (workflow IS NULL   OR workflow ~ '^(W(0[1-9]|[12][0-9]|3[0-5])|console|portal)$')
      AND (actor_type IS NULL OR actor_type IN ('system','admin','broker','lead'))
      AND (lead_id IS NOT NULL OR broker_id IS NOT NULL)
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS lead_activities_idem_uidx ON public.lead_activities (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_activities_lead_time_idx ON public.lead_activities (lead_id, occurred_at);
CREATE INDEX IF NOT EXISTS lead_activities_broker_time_idx ON public.lead_activities (broker_id, occurred_at) WHERE broker_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 7. communications → conversations (W03, W06–W10, W31) — extend INV-T14
-- -----------------------------------------------------------------------------
ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_channel_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_channel_check
  CHECK (channel IN ('email','sms','whatsapp','call','messenger','instagram'));
ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_status_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_status_check
  CHECK (status IS NULL OR status IN ('pending','sent','delivered','failed','received','read'));
ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_sender_type_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_sender_type_check
  CHECK (sender_type IN ('admin','broker','client','system'));
ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_recipient_type_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_recipient_type_check
  CHECK (recipient_type IN ('admin','broker','client','system'));

ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS brand_id          uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS author            text,
  ADD COLUMN IF NOT EXISTS template_name     text,
  ADD COLUMN IF NOT EXISTS template_category text,
  ADD COLUMN IF NOT EXISTS intent            text,
  ADD COLUMN IF NOT EXISTS llm_model         text,
  ADD COLUMN IF NOT EXISTS latency_ms        integer,
  ADD COLUMN IF NOT EXISTS guardrail_trip    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardrail_rule    text,
  ADD COLUMN IF NOT EXISTS handoff           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz,
  ADD COLUMN IF NOT EXISTS read_at           timestamptz,
  ADD COLUMN IF NOT EXISTS failed_reason     text,
  ADD COLUMN IF NOT EXISTS cost_zar          numeric(10,4),
  ADD COLUMN IF NOT EXISTS redacted          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workflow          text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communications_smc_checks' AND conrelid = 'public.communications'::regclass) THEN
    ALTER TABLE public.communications ADD CONSTRAINT communications_smc_checks CHECK (
          (author IS NULL OR author IN ('lead','bot','human','broker','system'))
      AND (template_category IS NULL OR template_category IN ('utility','marketing','authentication','service'))
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS communications_smc_external_uidx
  ON public.communications (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL;  -- wamid idempotency
CREATE INDEX IF NOT EXISTS communications_smc_lead_time_idx ON public.communications (lead_id, created_at) WHERE brand_id IS NOT NULL;

-- Prompt name (W03/W07/W31 "conversations"): read-only view over SMC rows. RLS of the base table applies.
-- SAFETY REWRITE (2026-10-10 drift review): renamed public.conversations -> public.smc_conversations. The LIVE project has a TABLE
-- public.conversations (EMMA assistant: Teams thread refs); CREATE OR REPLACE VIEW over a table fails, and no EMMA object may be touched.
CREATE OR REPLACE VIEW public.smc_conversations WITH (security_invoker = true) AS
SELECT c.id, c.brand_id, c.lead_id, c.broker_id, c.channel, c.direction, c.author,
       c.status, c.external_id AS wamid, c.template_name, c.template_category, c.intent,
       c.llm_model, c.latency_ms, c.guardrail_trip, c.guardrail_rule, c.handoff,
       c.content, c.redacted, c.delivered_at, c.read_at, c.failed_reason, c.cost_zar,
       c.workflow, c.created_at
FROM public.communications c
WHERE c.brand_id IS NOT NULL;
COMMENT ON VIEW public.smc_conversations IS 'SMC: prompt name for SortMyCover message rows in communications (INV-T14). Conversation state lives on leads.conv_state.';

-- -----------------------------------------------------------------------------
-- 8. appointments → bookings (W04/W05/W10, Section 7 Graph event.id) — extend INV-T24
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS brand_id            uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS cycle_id            uuid REFERENCES public.cycles(id),
  ADD COLUMN IF NOT EXISTS ends_at             timestamptz,
  ADD COLUMN IF NOT EXISTS method              text,
  ADD COLUMN IF NOT EXISTS calendar_provider   text,
  ADD COLUMN IF NOT EXISTS graph_event_id      text,      -- Outlook event.id shown on Mark's lead row (0.2)
  ADD COLUMN IF NOT EXISTS graph_calendar_id   text,
  ADD COLUMN IF NOT EXISTS ical_uid            text,
  ADD COLUMN IF NOT EXISTS join_url            text,
  ADD COLUMN IF NOT EXISTS ics_url             text,
  ADD COLUMN IF NOT EXISTS call_number         text,      -- number the broker calls (whatsapp_call/phone)
  ADD COLUMN IF NOT EXISTS invite_email_status text,
  ADD COLUMN IF NOT EXISTS booked_via          text,      -- event-spec `source`
  ADD COLUMN IF NOT EXISTS booked_at           timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_event_id   text,      -- CAPI Schedule event_id
  ADD COLUMN IF NOT EXISTS confirmed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_booking_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key     text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_smc_checks' AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_smc_checks CHECK (
      brand_id IS NULL OR (
            status IN ('booked','confirmed','rescheduled','cancelled','attended','no_show')
        AND method IN ('teams','zoom','meet','whatsapp_call','phone')
        AND ends_at IS NOT NULL AND ends_at > appointment_date
        AND broker_id IS NOT NULL AND client_id IS NOT NULL
        AND (booked_via IS NULL OR booked_via IN ('page','flow','list','chat','console'))
        AND (calendar_provider IS NULL OR calendar_provider IN ('outlook','google','shared_lv'))
        AND (invite_email_status IS NULL OR invite_email_status IN ('not_needed','sent','delivered','bounced','corrected'))
      )
    );
  END IF;
END $$;

-- Zero double-bookings (automation-engineer true north), SMC rows only so legacy data cannot block the index:
-- (a) the same start twice for one broker is impossible;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_smc_no_double_booking
  ON public.appointments (broker_id, appointment_date)
  WHERE brand_id IS NOT NULL AND status IN ('booked','confirmed');
-- (b) overlapping slots for one broker are impossible (W05 re-checks free/busy as well).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_smc_no_overlap' AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_smc_no_overlap
      EXCLUDE USING gist (broker_id WITH =, tstzrange(appointment_date, ends_at, '[)') WITH &&)
      WHERE (brand_id IS NOT NULL AND status IN ('booked','confirmed'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_smc_idem_uidx ON public.appointments (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_smc_graph_event_uidx ON public.appointments (graph_event_id) WHERE graph_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_smc_lead_idx ON public.appointments (client_id) WHERE brand_id IS NOT NULL;

-- Guarded: migration 06 (pass 2) re-creates this view with appended columns; re-running this file must not shrink it.
DO $smc_v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'intro_arm') THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW public.bookings WITH (security_invoker = true) AS
SELECT a.id, a.brand_id, a.broker_id, a.client_id AS lead_id, a.cycle_id,
       a.appointment_date AS starts_at, a.ends_at, a.method, a.status,
       a.calendar_provider, a.graph_event_id, a.graph_calendar_id, a.ical_uid,
       a.join_url, a.ics_url, a.call_number, a.invite_email_status,
       a.booked_via AS source, a.booked_at, a.schedule_event_id, a.confirmed_at,
       a.cancelled_at, a.reschedule_count, a.previous_booking_id, a.created_at, a.updated_at
FROM public.appointments a
WHERE a.brand_id IS NOT NULL
    $smc_q$;
  END IF;
END $smc_v$;
COMMENT ON VIEW public.bookings IS 'SMC: prompt name for SortMyCover rows of appointments (INV-T24). Writes go to appointments.';

-- -----------------------------------------------------------------------------
-- 9. outcomes (4.12a, W12) — new. Disposition taxonomy fixed by 4.12a (same words in contract + portal).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'smc_disposition_code') THEN
    CREATE TYPE public.smc_disposition_code AS ENUM
      ('fit_proceeding','fit_followup','nofit_budget','nofit_covered','nofit_criteria','unreachable');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.outcomes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  lead_id              uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id            uuid NOT NULL REFERENCES public.brokers(id),
  cycle_id             uuid REFERENCES public.cycles(id),
  brand_id             uuid NOT NULL REFERENCES public.brands(id),
  outcome              text NOT NULL CHECK (outcome IN ('attended','no_show','rescheduled','broker_no_show')),
  disposition_code     public.smc_disposition_code,
  quality_score        smallint CHECK (quality_score BETWEEN 1 AND 5),
  voice_note_url       text,
  transcript           text,          -- redacted (2.1.7) before insert
  summary              text,          -- 2-line summary, redacted
  lead_reach_check     text CHECK (lead_reach_check IN ('yes','no','none')),  -- W12 T+30 lead question
  marked_by            uuid REFERENCES auth.users(id),
  marked_via           text CHECK (marked_via IN ('whatsapp','portal','console','auto')),
  marked_at            timestamptz NOT NULL DEFAULT now(),
  auto_marked          boolean NOT NULL DEFAULT false,      -- unmarked at 24 h → attended
  unconfirmed          boolean NOT NULL DEFAULT false,
  dispute_status       text NOT NULL DEFAULT 'none' CHECK (dispute_status IN ('none','open','upheld','rejected')),
  replacement_eligible boolean GENERATED ALWAYS AS (
                         outcome = 'no_show'
                         OR disposition_code IN ('nofit_criteria'::public.smc_disposition_code,
                                                 'unreachable'::public.smc_disposition_code)) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT auto_marked OR (outcome = 'attended' AND unconfirmed))
);
CREATE INDEX IF NOT EXISTS outcomes_broker_cycle_idx ON public.outcomes (broker_id, cycle_id);
CREATE INDEX IF NOT EXISTS outcomes_lead_idx ON public.outcomes (lead_id);
COMMENT ON TABLE public.outcomes IS 'SMC 4.12a: one outcome per booking (outcome → disposition → quality → note). Corrections update the row (audited).';

-- -----------------------------------------------------------------------------
-- 10. replacements (W13, 0.1 per-cycle cap) — new
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.replacements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,   -- the lead being replaced
  outcome_id             uuid REFERENCES public.outcomes(id) ON DELETE SET NULL,
  cycle_id               uuid NOT NULL REFERENCES public.cycles(id),
  broker_id              uuid NOT NULL REFERENCES public.brokers(id),
  brand_id               uuid NOT NULL REFERENCES public.brands(id),
  reason                 text NOT NULL CHECK (reason IN ('no_show','uncontactable','disqualified')),  -- never "didn't buy" (2.1.1)
  reason_code            text,                       -- disposition code / Schedule C ref
  claimed_at             timestamptz NOT NULL DEFAULT now(),
  dispute_window_ends_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  status                 text NOT NULL DEFAULT 'due' CHECK (status IN ('due','disputed','approved','rejected','fulfilled')),
  cap_position           integer,                    -- nth claim in the cycle (set by trigger)
  over_cap               boolean NOT NULL DEFAULT false,
  override_reason        text,                       -- only way past the cap (an add-on sale, 3.5)
  replacement_lead_id    uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  decided_by             uuid REFERENCES auth.users(id),
  decided_at             timestamptz,
  note                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT over_cap OR status IN ('due','disputed','rejected') OR override_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS replacements_one_per_lead ON public.replacements (lead_id) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS replacements_cycle_idx ON public.replacements (cycle_id, status);

CREATE OR REPLACE FUNCTION public.smc_replacements_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cap  integer;
  v_used integer;
BEGIN
  SELECT c.replacement_cap INTO v_cap FROM public.cycles c WHERE c.id = NEW.cycle_id;
  SELECT count(*) INTO v_used
    FROM public.replacements r
   WHERE r.cycle_id = NEW.cycle_id
     AND r.status <> 'rejected'
     AND r.id <> NEW.id;
  NEW.cap_position := v_used + 1;
  NEW.over_cap := (v_cap IS NOT NULL AND v_used + 1 > v_cap);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_replacements_cap ON public.replacements;
CREATE TRIGGER smc_replacements_cap
  BEFORE INSERT ON public.replacements
  FOR EACH ROW EXECUTE FUNCTION public.smc_replacements_cap();

-- -----------------------------------------------------------------------------
-- 11. Money: bank_credits + invoices_smc (3.6 #5/#6, W16–W19). Name invoices_smc
--     avoids a possible live public.invoices (NH-11). PDF stays in admin_documents (INV-G02).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_credits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at         timestamptz NOT NULL,
  amount_zar          numeric(12,2) NOT NULL CHECK (amount_zar > 0),
  reference_raw       text,
  parsed_reference    text,
  source              text NOT NULL CHECK (source IN ('incontact','statement','paystack_settlement','manual')),
  graph_message_id    text,
  statement_line_hash text,
  matched_invoice_id  uuid,      -- FK added below (circular with invoices_smc)
  match_status        text NOT NULL DEFAULT 'unmatched'
                      CHECK (match_status IN ('auto','manual','unmatched','duplicate','settlement')),
  assigned_by         uuid REFERENCES auth.users(id),
  assigned_at         timestamptz,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_credits_graph_msg_uidx ON public.bank_credits (graph_message_id) WHERE graph_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_credits_stmt_line_uidx ON public.bank_credits (statement_line_hash) WHERE statement_line_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_credits_unmatched_idx ON public.bank_credits (received_at) WHERE match_status = 'unmatched';

CREATE TABLE IF NOT EXISTS public.invoices_smc (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no         text NOT NULL UNIQUE,
  kind               text NOT NULL DEFAULT 'cycle' CHECK (kind IN ('cycle','upgrade_prorata','credit_note','add_on')),
  broker_id          uuid NOT NULL REFERENCES public.brokers(id),
  brand_id           uuid NOT NULL REFERENCES public.brands(id),
  cycle_id           uuid REFERENCES public.cycles(id),
  tier_code          text REFERENCES public.pricing(tier_code),
  period_start       date,
  period_end         date,
  amount_excl_vat    numeric(12,2) NOT NULL,                 -- negative only for credit notes
  vat_zar            numeric(12,2),                          -- NULL until VAT-registered (0.1)
  total_zar          numeric(12,2) GENERATED ALWAYS AS (amount_excl_vat + coalesce(vat_zar, 0)) STORED,
  credit_applied_zar numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_applied_zar >= 0),  -- shortfall credit (0.1)
  reference          text NOT NULL UNIQUE,                   -- LV-{ref_code}-{tier}-{YYYYMM} (3.6)
  method             text CHECK (method IN ('instant_eft','manual_eft','card')),
  status             text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','void','credited')),
  issued_at          timestamptz,
  due_at             timestamptz,
  paid_at            timestamptz,
  paystack_reference text,
  bank_credit_id     uuid REFERENCES public.bank_credits(id),
  document_id        uuid REFERENCES public.admin_documents(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND method IS NOT NULL)),
  CHECK (kind = 'credit_note' OR amount_excl_vat > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_smc_paystack_uidx ON public.invoices_smc (paystack_reference) WHERE paystack_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_smc_broker_idx ON public.invoices_smc (broker_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_credits_matched_invoice_fkey') THEN
    ALTER TABLE public.bank_credits ADD CONSTRAINT bank_credits_matched_invoice_fkey
      FOREIGN KEY (matched_invoice_id) REFERENCES public.invoices_smc(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 12. admin_documents: agreement e-sign fields (6.1 step 2, crm-gap A2) — extend INV-T12
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_documents
  ADD COLUMN IF NOT EXISTS brand_id          uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS broker_id         uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind              text,
  ADD COLUMN IF NOT EXISTS version           text,
  ADD COLUMN IF NOT EXISTS doc_sha256        text,
  ADD COLUMN IF NOT EXISTS signed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by_name    text,
  ADD COLUMN IF NOT EXISTS signer_ip         text,
  ADD COLUMN IF NOT EXISTS signed_user_agent text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_documents_smc_checks' AND conrelid = 'public.admin_documents'::regclass) THEN
    ALTER TABLE public.admin_documents ADD CONSTRAINT admin_documents_smc_checks CHECK (
          (kind IS NULL OR kind IN ('agreement','authorisation_letter','addendum','invoice','proposal','report'))
      AND (signed_at IS NULL OR (signed_by_name IS NOT NULL AND doc_sha256 IS NOT NULL))
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 13. webhook_events — one idempotency table for Meta, WhatsApp, Paystack, Graph, Flow (new)
--     Stores a payload HASH only (no PII).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source       text NOT NULL CHECK (source IN ('meta_leadgen','whatsapp','meta_feed','meta_messages','paystack','graph','flow','other')),
  external_id  text NOT NULL,
  brand_id     uuid REFERENCES public.brands(id),
  received_at  timestamptz NOT NULL DEFAULT now(),
  signature_ok boolean NOT NULL,
  payload_hash text,
  attempts     integer NOT NULL DEFAULT 1,
  processed_at timestamptz,
  error        text,
  UNIQUE (source, external_id)
);

-- -----------------------------------------------------------------------------
-- 14. audit_log (Salesforce: audit on every write; POPIA accountability) — new
--     Append-only: no UPDATE/DELETE grants or policies for anyone; PII values redacted.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_uid   uuid,
  actor_role  text,          -- admin | broker | n8n_app | service_role | postgres …
  source      text,          -- console | portal | n8n | edge | migration (SET smc.source)
  table_name  text NOT NULL,
  row_id      text,
  action      text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  diff        jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason      text           -- SET smc.reason (e.g. "Approve & go live")
);
-- SAFETY REWRITE (2026-10-10 drift review): the LIVE project already has public.audit_log (uuid id, record_id,
-- old_data/new_data, changed_by, changed_at ...; 41 rows; written by fn_audit triggers and read by the CRM admin UI).
-- CREATE TABLE IF NOT EXISTS above is therefore a silent no-op there, and the statements below (index on row_id,
-- smc_audit() inserting actor_uid/source/diff/...) would fail. Converge instead: ADD the SMC columns to the live
-- table (all nullable or constant-default, no rewrite) so BOTH writers share one table and nothing live changes.
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS at         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS actor_uid  uuid,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS source     text,
  ADD COLUMN IF NOT EXISTS row_id     text,
  ADD COLUMN IF NOT EXISTS diff       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason     text;
CREATE INDEX IF NOT EXISTS audit_log_table_row_idx ON public.audit_log (table_name, row_id);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON public.audit_log (at);

CREATE OR REPLACE FUNCTION public.smc_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- column names whose VALUES never enter the audit log (2.1.7, pre-mortem #10)
  pii constant text[] := ARRAY[
    'first_name','last_name','phone','phone_number','email','mobile','call_number','alt_number',
    'whatsapp_number','contact_person','address','firm_address','client_ip','client_user_agent',
    'content','recipient_contact','subject','transcript','summary','voice_note_url','text_redacted',
    'line','notes','conv_state','reference_raw','signer_ip','signed_user_agent','requester',
    'requester_contact','google_calendar_token','calendar_email','author_hash','note'];
  o jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  n jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  r jsonb := coalesce(n, o);
  d jsonb := '{}'::jsonb;
  k text;
  v_role text;
BEGIN
  -- brand-scoped mode for shared legacy tables: only SortMyCover rows are audited
  IF TG_NARGS > 0 AND TG_ARGV[0] = 'brand_scoped'
     AND coalesce(n->>'brand_id', o->>'brand_id') IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k NOT IN ('updated_at') AND (n->k) IS DISTINCT FROM (o->k) THEN
        d := d || jsonb_build_object(k, CASE WHEN k = ANY (pii)
                                             THEN jsonb_build_object('changed', true)
                                             ELSE jsonb_build_object('old', o->k, 'new', n->k) END);
      END IF;
    END LOOP;
    IF d = '{}'::jsonb THEN
      RETURN NULL;   -- no-op update
    END IF;
  ELSE
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF (r->k) IS NOT NULL AND (r->k) <> 'null'::jsonb THEN
        d := d || jsonb_build_object(k, CASE WHEN k = ANY (pii) THEN to_jsonb('[redacted]'::text) ELSE r->k END);
      END IF;
    END LOOP;
  END IF;

  v_role := CASE
              WHEN auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role)  THEN 'admin'
              WHEN auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'broker'::public.app_role) THEN 'broker'
              WHEN coalesce(current_setting('role', true), 'none') NOT IN ('none', '') THEN current_setting('role', true)
              ELSE session_user::text
            END;

  INSERT INTO public.audit_log (actor_uid, actor_role, source, table_name, row_id, action, diff, reason)
  VALUES (auth.uid(), v_role,
          nullif(current_setting('smc.source', true), ''),
          TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          coalesce(r->>'id', r->>'tier_code', r->>'code'),
          TG_OP, d,
          nullif(current_setting('smc.reason', true), ''));
  RETURN NULL;
END $$;
COMMENT ON FUNCTION public.smc_audit() IS 'SMC Salesforce-style audit: AFTER trigger; arg ''brand_scoped'' skips legacy rows (brand_id NULL). PII column values are never written.';

-- updated_at triggers (reuse INV-F08 update_updated_at_column) + audit triggers.
-- Append-only logs (audit_log, webhook_events, lead_activities) are not audited themselves.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brands','pricing','cycles','outcomes','replacements','bank_credits','invoices_smc'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_touch_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.smc_audit()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['brokers','leads','appointments','communications','admin_documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.smc_audit(%L)', t, 'brand_scoped');
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 15. v_cycle_progress — Mark's line (0.2): committed · verified · booked · attended · replacements N/cap
--     security_invoker: a broker sees only his own cycles through base-table RLS.
-- -----------------------------------------------------------------------------
-- Guarded (SAFETY REWRITE 2026-10-10): smc_20 re-creates this view with appended columns; re-running this file afterwards must not
-- try to shrink it ("cannot drop columns from view"), so it is only created when absent.
DO $smc_v$
BEGIN
  IF to_regclass('public.v_cycle_progress') IS NULL THEN
    EXECUTE $smc_q$
CREATE OR REPLACE VIEW public.v_cycle_progress WITH (security_invoker = true) AS
SELECT
  c.id                AS cycle_id,
  c.broker_id,
  c.brand_id,
  c.tier_code,
  c.cycle_no,
  c.status,
  c.starts_at,
  c.ends_at,
  c.extended_until,
  c.committed_leads   AS committed,
  (SELECT count(*) FROM public.leads l
    WHERE l.cycle_id = c.id AND l.verified_at IS NOT NULL AND l.qualified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.replacements rp
                       WHERE rp.replacement_lead_id = l.id AND rp.status <> 'rejected'))      AS verified,
  (SELECT count(DISTINCT a.client_id) FROM public.appointments a
    WHERE a.cycle_id = c.id AND a.brand_id IS NOT NULL
      AND a.status IN ('booked','confirmed','attended','no_show'))                            AS booked,
  (SELECT count(*) FROM public.outcomes o WHERE o.cycle_id = c.id AND o.outcome = 'attended') AS attended,
  (SELECT count(*) FROM public.outcomes o
    WHERE o.cycle_id = c.id AND o.disposition_code IN ('fit_proceeding','fit_followup'))       AS good_fit,
  (SELECT count(*) FROM public.replacements r WHERE r.cycle_id = c.id AND r.status <> 'rejected') AS replacements_used,
  c.replacement_cap,
  greatest(0, ceil(extract(epoch FROM (coalesce(c.extended_until, c.ends_at) - now())) / 86400))::int AS days_left
FROM public.cycles c
    $smc_q$;
  END IF;
END $smc_v$;
COMMENT ON VIEW public.v_cycle_progress IS 'SMC 0.2: this cycle — committed, verified (counts toward commitment; replacement leads excluded), booked, attended, good-fit, replacements N/cap.';

-- -----------------------------------------------------------------------------
-- 16. SAFETY REWRITE (2026-10-10 review): close the window until smc_05.
--     Supabase's default privileges give anon / authenticated ALL on every new public table and view, and RLS only arrives in
--     smc_05 (a separate transaction that also needs roles the project does not have yet). If the chain stopped after this file,
--     bank_credits / invoices_smc would be readable and writable with the public anon key. Fail closed instead: RLS on, no grants;
--     service_role (BYPASSRLS) keeps working, smc_05 re-grants and adds the policies. Idempotent.
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.brands','public.pricing','public.cycles','public.outcomes','public.replacements',
                           'public.bank_credits','public.invoices_smc','public.webhook_events'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.smc_conversations','public.bookings','public.v_cycle_progress'] LOOP
    IF to_regclass(t) IS NOT NULL THEN EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', t); END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.smc_audit() FROM PUBLIC, anon, authenticated;   -- trigger function; never an RPC
REVOKE ALL ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id() FROM PUBLIC, anon;   -- authenticated keeps EXECUTE (RLS helpers); smc_05 re-grants n8n_app
GRANT EXECUTE ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id() TO authenticated;
-- one-off: legacy audit rows carry changed_at; give the new "at" column the same instant instead of the migration time
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'changed_at') THEN   -- only the live (legacy-shaped) table has it; a fresh database does not
    UPDATE public.audit_log SET at = changed_at WHERE changed_at IS NOT NULL AND source IS NULL AND actor_uid IS NULL AND row_id IS NULL;
  END IF;
END $$;
