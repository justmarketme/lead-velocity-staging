-- =============================================================================
-- 20261011020000_smc_02_core.sql  --  CRM nurture chain, file 2 of 8: the SortMyCover rows inside the CRM's own tables
-- Trimmed from the reviewed smc_02 / 06 / 12 / 13 / 15 / 19 / 23 (migrations-merge). Every object here is used by the WhatsApp
-- nurture flow (W01 W03-W10 W12 W13 W23 W28, ms-oauth, capture v2). See supabase/migrations/CRM-NURTURE-SCHEMA.md.
--   helpers: smc_is_admin(), smc_current_broker_id(), smc_hash_contact()  (single hash rule, digits only for phones)
--   new:     brands (+ SMC seed), webhook_events (idempotency claims, rate counters)
--   extend:  brokers (calendar, availability, intro media, routing switch), leads (consent, qualifying, capture v2, offer,
--            email verification, stage), lead_activities (the stamped timeline), communications (WhatsApp evidence),
--            appointments (+ view bookings), audit_log (shared with the live fn_audit triggers)
-- Rules: additive only (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS); CHECKs on live tables only ever widened (superset)
-- or scoped to SortMyCover rows; NOT NULL only ever relaxed. SortMyCover rows = brand_id IS NOT NULL; every legacy CRM row keeps
-- brand_id NULL and is untouched. NO cycles, pricing, invoices or credits: capacity is the CRM's lead_orders (file 03).
-- No generated column is added to public.leads (no rewrite of its 4,209 rows; no whole-row writer can break).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;  -- appointments overlap guard

-- -----------------------------------------------------------------------------
-- 0. Helpers (SECURITY DEFINER avoids RLS recursion; has_role is the live CRM function)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin'::public.app_role) $$;

CREATE OR REPLACE FUNCTION public.smc_current_broker_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT b.id FROM public.brokers b WHERE b.user_id = auth.uid() LIMIT 1 $$;

COMMENT ON FUNCTION public.smc_is_admin() IS 'SMC: true when the caller holds app_role admin (wraps has_role).';
COMMENT ON FUNCTION public.smc_current_broker_id() IS 'SMC: brokers.id of the signed-in broker (brokers.user_id = auth.uid()).';

-- One hash rule (reviewed smc_12): phone -> SHA-256 hex of the digits only (no "+"), as W01/W03/W15 hash in code;
-- anything else (email) -> SHA-256 of lower(trim). Unsalted on purpose so the STOP list can be matched without a key.
CREATE OR REPLACE FUNCTION public.smc_hash_contact(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS
$$ SELECT CASE
            WHEN p IS NULL OR btrim(p) = '' THEN NULL
            WHEN btrim(p) ~ '^[+0-9 ()./-]+$' AND regexp_replace(p, '\D', '', 'g') <> ''
              THEN encode(sha256(convert_to(regexp_replace(p, '\D', '', 'g'), 'UTF8')), 'hex')
            ELSE encode(sha256(convert_to(lower(btrim(p)), 'UTF8')), 'hex')
          END $$;
COMMENT ON FUNCTION public.smc_hash_contact(text) IS
  'SMC single hash rule: phone -> SHA-256 hex of the E.164 digits only (no "+"); email -> SHA-256 of lower(trim). Suppression + dedupe.';

-- -----------------------------------------------------------------------------
-- 1. brands: one row per consumer brand. The WhatsApp sender (Twilio: the sender number digits in phone_number_id,
--    CONTRACTS.md "WhatsApp provider switch") and the booking UI switch (W28) key off it. Ads/page health fields of the
--    original design are not carried over (ads console dropped).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brands (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]{2,12}$'),
  name             text NOT NULL,
  language         text NOT NULL DEFAULT 'en',
  domain           text,
  waba_id          text,
  phone_number_id  text,          -- Meta phone number id, or (WHATSAPP_PROVIDER=twilio) the sender number digits
  booking_flow_id  text,          -- WhatsApp Flow id (Meta only; under Twilio booking_ui stays 'list')
  booking_ui       text NOT NULL DEFAULT 'list' CHECK (booking_ui IN ('list','flow')),   -- W28 auto-reverts to list
  pixel_id         text,          -- CAPI (SUB-capi-send)
  dataset_id       text,          -- CAPI (SUB-capi-send)
  template_status  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- SUB-whatsapp-send reads it (template approved?)
  is_active        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS brand_id uuid GENERATED ALWAYS AS (id) STORED;   -- read-only alias the workflow SQL reads
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS status text GENERATED ALWAYS AS (CASE WHEN is_active THEN 'active' ELSE 'held' END) STORED;
COMMENT ON TABLE public.brands IS 'SMC: one row per consumer brand (SortMyCover). Brand rows of leads/brokers/appointments/communications/lead_orders carry brand_id.';

INSERT INTO public.brands (code, name, language, domain, is_active)
VALUES ('SMC', 'SortMyCover', 'en', 'sortmycover.co.za', true)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. brokers: calendar, availability, intro media, routing switch. Billing / tier / cycle / onboarding-funnel columns of the
--    original design are NOT added (the CRM's lead_orders + contracts already carry the commercial side).
-- -----------------------------------------------------------------------------
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS brand_id               uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS fsp_number             text,          -- disclosure + intro card ("{practice} (FSP {n})")
  ADD COLUMN IF NOT EXISTS consent_mode           text NOT NULL DEFAULT 'named',
  ADD COLUMN IF NOT EXISTS routing_on             boolean NOT NULL DEFAULT false,   -- admin switch: route SortMyCover leads to this broker
  ADD COLUMN IF NOT EXISTS accepts_low_budget     boolean NOT NULL DEFAULT false,   -- admin switch: standing yes to tier-C leads (budget under R750)
  ADD COLUMN IF NOT EXISTS calendar_provider      text NOT NULL DEFAULT 'outlook',
  ADD COLUMN IF NOT EXISTS ms_tenant_id           text,
  ADD COLUMN IF NOT EXISTS calendar_token_ref     text,          -- Vault secret NAME only (file 06)
  ADD COLUMN IF NOT EXISTS calendar_mode          text,
  ADD COLUMN IF NOT EXISTS calendar_status        text,
  ADD COLUMN IF NOT EXISTS calendar_connected_at  timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_scopes        text,
  ADD COLUMN IF NOT EXISTS calendar_status_at     timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_status_detail jsonb,
  ADD COLUMN IF NOT EXISTS next_free_slot_at      timestamptz,   -- cache; W04 is the truth
  ADD COLUMN IF NOT EXISTS methods_supported      text[] NOT NULL DEFAULT ARRAY['teams','phone']::text[],
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
  ADD COLUMN IF NOT EXISTS headshot_url           text,          -- intro card photo (portal Profile upload, broker-media bucket)
  ADD COLUMN IF NOT EXISTS bio_short              text,
  ADD COLUMN IF NOT EXISTS languages              text[] NOT NULL DEFAULT ARRAY['en']::text[],   -- intro card + portal Profile
  ADD COLUMN IF NOT EXISTS years_advising         integer,                                        -- intro card + portal Profile
  ADD COLUMN IF NOT EXISTS intro_card_url         text,
  ADD COLUMN IF NOT EXISTS intro_voice_url        jsonb,         -- {"en": url}
  ADD COLUMN IF NOT EXISTS intro_video_url        jsonb,         -- {"en": url}; the later broker intro video (W23)
  ADD COLUMN IF NOT EXISTS intro_media_pref       text,
  ADD COLUMN IF NOT EXISTS positioning_answers    jsonb,         -- W23 intro script inputs
  ADD COLUMN IF NOT EXISTS verified_credentials   jsonb,         -- the only identity claims an intro script may use (admin-set)
  ADD COLUMN IF NOT EXISTS licence_categories     text[],        -- capture v2 licence check
  ADD COLUMN IF NOT EXISTS onboarding_progress    jsonb NOT NULL DEFAULT '{}'::jsonb;   -- W23 writes {"intro_media":"done"}

-- Read-only aliases the workflow SQL reads (brokers is 18 rows: the stored-generated rewrite is milliseconds).
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS broker_id        uuid GENERATED ALWAYS AS (id) STORED;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS adviser_name     text GENERATED ALWAYS AS (contact_person) STORED;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS practice_name    text GENERATED ALWAYS AS (firm_name) STORED;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS adviser_whatsapp text GENERATED ALWAYS AS (whatsapp_number) STORED;
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS active           boolean GENERATED ALWAYS AS (status = 'active') STORED;
COMMENT ON COLUMN public.brokers.active IS 'SMC alias: status = ''active'' (lower case, SortMyCover lifecycle). Legacy ''Active'' rows are never routed (brand_id NULL).';
COMMENT ON COLUMN public.brokers.routing_on IS 'SMC: admin switch. A broker gets SortMyCover leads only when routing_on AND status active AND he has an open paid SortMyCover lead_orders row (file 03).';
COMMENT ON COLUMN public.brokers.accepts_low_budget IS 'SMC (Jonathan, 2026-10-11): standing yes to tier-C leads (budget_band lt750, agreement 5.7 offer auto-accepted). Off: a tier-C lead is never routed to him (file 03 holds it, routing_reason held_low_budget) unless an admin assigns it (routing_reason manual_low_budget). Set by Lead Velocity only (file 05 guard).';

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
      AND (calendar_mode   IS NULL OR calendar_mode   IN ('oauth','shared_fallback'))
      AND (calendar_status IS NULL OR calendar_status IN ('ok','needs_reconnect','blocked_admin_consent'))
      -- Vault NAME, never a token, and only this broker's own name (a row can never point at another broker's token)
      AND (calendar_token_ref IS NULL OR (calendar_token_ref ~ '^ms_refresh_[0-9a-f-]{36}_[0-9]+$'
                                          AND left(calendar_token_ref, 48) = 'ms_refresh_' || id::text || '_'))
      AND (years_advising IS NULL OR years_advising BETWEEN 0 AND 70)
      AND (calendar_status_detail IS NULL OR jsonb_typeof(calendar_status_detail) = 'object')
      AND (verified_credentials IS NULL OR jsonb_typeof(verified_credentials) = 'array')
    );
  END IF;
  -- 2026-10-11 (FAIS disclosure): routing can only be switched on for a broker whose intro card can be shown in full:
  -- the FSP number, the practice name and the adviser name (broker_intro_booked {{2}}/{{3}}/{{4}} and the disclosure
  -- line) and the approved intro card image (the template's IMAGE header). Every live row has routing_on = false, so the
  -- constraint validates instantly. The routing trigger (file 03, smc_broker_ready) checks the same before any lead attaches.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_smc_routing_ready' AND conrelid = 'public.brokers'::regclass) THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_smc_routing_ready CHECK (
      routing_on IS NOT TRUE OR (
            btrim(coalesce(fsp_number, '')) ~ '^[A-Za-z0-9 /-]{1,20}$' AND fsp_number ~ '[0-9]'   -- an FSP number, not a blank
        AND btrim(coalesce(firm_name, '')) <> ''
        AND btrim(coalesce(contact_person, '')) <> ''
        AND btrim(coalesce(intro_card_url, '')) ~ '^https://'
      )
    );
  END IF;
END $$;

-- Widen the status CHECK (strict superset of the LIVE ('Active','Inactive','Prospect'); 'Prospect' is written by the live
-- fn_onboarding_to_pipeline trigger, which swallows errors, so it must stay valid). Lower-case values = SortMyCover lifecycle.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_status_check' AND conrelid = 'public.brokers'::regclass
                  AND pg_get_constraintdef(oid) LIKE '%ready_for_go_live%' AND pg_get_constraintdef(oid) LIKE '%Prospect%') THEN
    ALTER TABLE public.brokers DROP CONSTRAINT IF EXISTS brokers_status_check;
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_status_check CHECK (
      status IS NULL OR status IN ('Active','Inactive','Prospect',
                                   'invited','onboarding','onboarded','ready_for_go_live','active','paused','ended'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS brokers_brand_status_idx ON public.brokers (brand_id, status) WHERE brand_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. leads: consent record, qualifying answers, capture v2, offer (tier B), email verification, stage, attribution keys.
--    All nullable or constant-default (catalog-only, no table rewrite).
-- -----------------------------------------------------------------------------
ALTER TABLE public.leads ALTER COLUMN email DROP NOT NULL;   -- email is only collected for Teams/Zoom/Meet invites

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS brand_id                uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS routed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS routing_reason          text,
  -- source / attribution (the CRM records where a lead came from; CTWA click id, page, Lead Ads)
  ADD COLUMN IF NOT EXISTS origin                  text,
  ADD COLUMN IF NOT EXISTS campaign_id             text,
  ADD COLUMN IF NOT EXISTS adset_id                text,
  ADD COLUMN IF NOT EXISTS ad_id                   text,
  ADD COLUMN IF NOT EXISTS angle                   text,
  ADD COLUMN IF NOT EXISTS utm_source              text,
  ADD COLUMN IF NOT EXISTS utm_medium              text,
  ADD COLUMN IF NOT EXISTS utm_campaign            text,
  ADD COLUMN IF NOT EXISTS utm_content             text,
  ADD COLUMN IF NOT EXISTS utm_term                text,
  ADD COLUMN IF NOT EXISTS fbclid                  text,
  ADD COLUMN IF NOT EXISTS fbp                     text,
  ADD COLUMN IF NOT EXISTS fbc                     text,
  ADD COLUMN IF NOT EXISTS lead_event_id           text,
  ADD COLUMN IF NOT EXISTS leadgen_id              text,
  ADD COLUMN IF NOT EXISTS ctwa_clid               text,          -- click-to-WhatsApp click id
  ADD COLUMN IF NOT EXISTS ref                     text,
  ADD COLUMN IF NOT EXISTS page_url                text,
  ADD COLUMN IF NOT EXISTS client_ip               text,
  ADD COLUMN IF NOT EXISTS client_user_agent       text,
  -- consent record (POPIA evidence, kept with the lead)
  ADD COLUMN IF NOT EXISTS consent_text            text,
  ADD COLUMN IF NOT EXISTS consent_text_version    text,
  ADD COLUMN IF NOT EXISTS consent_mode            text,
  ADD COLUMN IF NOT EXISTS consent_at              timestamptz,
  ADD COLUMN IF NOT EXISTS consent_ads_at          timestamptz,
  ADD COLUMN IF NOT EXISTS consent_page_url        text,
  ADD COLUMN IF NOT EXISTS consent_source          text,
  -- WhatsApp evidence + verification
  ADD COLUMN IF NOT EXISTS line_type               text,
  ADD COLUMN IF NOT EXISTS first_message_at        timestamptz,
  ADD COLUMN IF NOT EXISTS wa_delivered_at         timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at             timestamptz,
  ADD COLUMN IF NOT EXISTS disclosure_msg_id       text,
  ADD COLUMN IF NOT EXISTS disclosure_delivered_at timestamptz,
  -- qualifying (WhatsApp questions / Flow pop-up)
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
  -- contact details (email for the Teams invite)
  ADD COLUMN IF NOT EXISTS call_number             text,
  ADD COLUMN IF NOT EXISTS call_number_line_type   text,
  ADD COLUMN IF NOT EXISTS alt_number              text,
  ADD COLUMN IF NOT EXISTS alt_purpose             text,
  ADD COLUMN IF NOT EXISTS best_time               text,
  ADD COLUMN IF NOT EXISTS language                text,
  ADD COLUMN IF NOT EXISTS email_status            text,
  ADD COLUMN IF NOT EXISTS email_purpose           text,
  -- state + lifecycle
  ADD COLUMN IF NOT EXISTS stage                   text,
  ADD COLUMN IF NOT EXISTS stage_entered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS conv_state              jsonb,
  ADD COLUMN IF NOT EXISTS opted_out_at            timestamptz,   -- STOP / opt-out
  ADD COLUMN IF NOT EXISTS health_flag             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_contact_at         timestamptz,
  ADD COLUMN IF NOT EXISTS retention_delete_after  timestamptz,
  ADD COLUMN IF NOT EXISTS is_synthetic            boolean NOT NULL DEFAULT false,
  -- capture Flow v2 (automation/ctwa/capture-v2.js)
  ADD COLUMN IF NOT EXISTS last_name                  text,
  ADD COLUMN IF NOT EXISTS reasons                    text[],
  ADD COLUMN IF NOT EXISTS spend_band                 text,
  ADD COLUMN IF NOT EXISTS lead_tier                  text,          -- A = R1,500+ (auto-deliver) / B = R750-R1,499 (offer first) / C = under R750 (offer, standing yes only)
  ADD COLUMN IF NOT EXISTS income_band                text,          -- never sent to Meta
  ADD COLUMN IF NOT EXISTS smoker                     text,          -- never sent to Meta
  ADD COLUMN IF NOT EXISTS smoker_question_text       text,
  ADD COLUMN IF NOT EXISTS smoker_answered_at         timestamptz,
  ADD COLUMN IF NOT EXISTS wa_id                      text,
  ADD COLUMN IF NOT EXISTS wa_verified                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS call_number_verified       boolean,
  ADD COLUMN IF NOT EXISTS alt_email                  text,
  ADD COLUMN IF NOT EXISTS alt_email_same             boolean,
  ADD COLUMN IF NOT EXISTS email_verified             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at          timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified_via         text,
  ADD COLUMN IF NOT EXISTS email_verify_code_hash     text,          -- sha256(lead_id|code); the code itself is never stored
  ADD COLUMN IF NOT EXISTS email_verify_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS email_verify_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS email_verify_attempts      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_unverified_flag      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_unverified_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS licence_flag               text,
  ADD COLUMN IF NOT EXISTS capture_state              jsonb,
  ADD COLUMN IF NOT EXISTS delivered                  boolean,       -- false = never handed to a broker (out of band / declined)
  ADD COLUMN IF NOT EXISTS offer_status               text,
  ADD COLUMN IF NOT EXISTS offer_broker_id            uuid,
  ADD COLUMN IF NOT EXISTS offered_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS offer_expires_at           timestamptz,
  ADD COLUMN IF NOT EXISTS offer_decided_at           timestamptz,
  ADD COLUMN IF NOT EXISTS declined_broker_ids        uuid[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_smc_checks' AND conrelid = 'public.leads'::regclass) THEN
    -- Every condition is NULL-tolerant or scoped to brand rows, so the 4,209 legacy rows always pass.
    ALTER TABLE public.leads ADD CONSTRAINT leads_smc_checks CHECK (
          (origin IS NULL        OR origin IN ('page','lead_ad','ctwa','comment','dm','manual'))
      AND (consent_mode IS NULL  OR consent_mode IN ('named','generic'))
      AND (line_type IS NULL     OR line_type IN ('mobile','landline','voip','unknown'))
      AND (call_number_line_type IS NULL OR call_number_line_type IN ('mobile','landline','voip','unknown'))
      AND (age_band IS NULL      OR age_band IN ('lt35','35_44','45_50','51plus'))
      AND (budget_band IS NULL   OR budget_band IN ('lt750','750_1499','1500_plus','750_1250','1250plus','1250_1499'))
      AND (method_pref IS NULL   OR method_pref IN ('teams','zoom','meet','whatsapp_call','phone'))
      AND (alt_purpose IS NULL   OR alt_purpose IN ('reach_fallback'))
      AND (best_time IS NULL     OR best_time IN ('mornings','lunchtime','afternoons','evenings','any'))
      AND (email_status IS NULL  OR email_status IN ('unchecked','mx_ok','delivered','bounced','corrected'))
      AND (email_purpose IS NULL OR email_purpose IN ('meeting_invite'))
      AND (stage IS NULL OR stage IN ('new','disclosed','verified','qualified','booked','confirmed',
                                      'attended','no_show','dispositioned','unbooked_closed',
                                      'opted_out','replacement_due','disqualified'))
      -- routing writes broker_id before the first WhatsApp goes out
      AND (brand_id IS NULL OR first_message_at IS NULL OR broker_id IS NOT NULL)
      -- no SortMyCover lead without a consent record
      AND (brand_id IS NULL OR (consent_at IS NOT NULL AND consent_text IS NOT NULL AND consent_source IS NOT NULL))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_capture_v2_checks' AND conrelid = 'public.leads'::regclass) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_capture_v2_checks CHECK (
          (lead_tier IS NULL    OR lead_tier IN ('A','B','C'))
      AND (spend_band IS NULL   OR spend_band IN ('lt500','500_1000','1000_1500','1500_2500','2500plus','prefer_not'))
      AND (income_band IS NULL  OR income_band IN ('lt20k','20k_40k','40k_60k','60k_100k','100kplus','prefer_not'))
      AND (smoker IS NULL       OR smoker IN ('yes','no','prefer_not'))
      AND (smoker IS NULL       OR (smoker_question_text IS NOT NULL AND smoker_answered_at IS NOT NULL))
      AND (email_verified_via IS NULL OR email_verified_via IN ('link','code'))
      AND (licence_flag IS NULL OR licence_flag IN ('outside_licence','licence_check_needed'))
      AND (offer_status IS NULL OR offer_status IN ('offered','accepted','declined','expired','held'))
      AND (reasons IS NULL      OR reasons <@ ARRAY['life_cover','funeral_cover','retirement_planning','investments','disability','paying_too_much','other']::text[])
    ) NOT VALID;   -- new columns only; NOT VALID skips the scan of the legacy rows (all NULL anyway)
  END IF;
END $$;

-- Idempotency targets used by the workflows (W01 ON CONFLICT (leadgen_id); page event id per brand)
CREATE UNIQUE INDEX IF NOT EXISTS leads_leadgen_full_uidx  ON public.leads (leadgen_id);
CREATE UNIQUE INDEX IF NOT EXISTS leads_lead_event_id_uidx ON public.leads (brand_id, lead_event_id) WHERE lead_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_dedupe_idx    ON public.leads (dedupe_hash, created_at) WHERE dedupe_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_stage_idx     ON public.leads (brand_id, stage) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_broker_idx    ON public.leads (broker_id, routed_at) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_smc_retention_idx ON public.leads (retention_delete_after) WHERE retention_delete_after IS NOT NULL;

COMMENT ON COLUMN public.leads.smoker IS 'Capture v2: optional, adviser brief only. Never sent to Meta (CAPI/Pixel/custom_data).';

-- Stage bookkeeping for SMC rows only (returns at once for legacy rows).
CREATE OR REPLACE FUNCTION public.smc_leads_stage_stamp()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
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
-- 4. lead_activities = the one stamped timeline (every workflow step, reminder job, consent tap, booking, outcome)
-- -----------------------------------------------------------------------------
ALTER TABLE public.lead_activities ALTER COLUMN agent_id DROP NOT NULL;  -- system events have no agent
ALTER TABLE public.lead_activities ALTER COLUMN lead_id  DROP NOT NULL;  -- broker-level events
ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS brand_id        uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS broker_id       uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
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
-- Full (non-partial) unique index: the workflows use a bare ON CONFLICT (idempotency_key). NULL keys never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS lead_activities_idem_full_uidx ON public.lead_activities (idempotency_key);
CREATE INDEX IF NOT EXISTS lead_activities_lead_time_idx   ON public.lead_activities (lead_id, occurred_at);
CREATE INDEX IF NOT EXISTS lead_activities_broker_time_idx ON public.lead_activities (broker_id, occurred_at) WHERE broker_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. communications: every WhatsApp / SMS / email the flow sends or receives (disclosure evidence, delivery receipts)
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
  ON public.communications (channel, external_id) WHERE brand_id IS NOT NULL AND external_id IS NOT NULL;   -- wamid / MessageSid idempotency
CREATE INDEX IF NOT EXISTS communications_smc_lead_time_idx ON public.communications (lead_id, created_at) WHERE brand_id IS NOT NULL;
-- SUB-whatsapp-send claim: one send per correlation key
CREATE UNIQUE INDEX IF NOT EXISTS communications_smc_send_correlation_uidx
  ON public.communications ((metadata->>'correlation'))
  WHERE workflow = 'smc-whatsapp-send' AND (metadata->>'correlation') IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. appointments (the broker's Outlook booking, Teams link) + view bookings (portal Leads page reads it)
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS brand_id            uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS ends_at             timestamptz,
  ADD COLUMN IF NOT EXISTS method              text,
  ADD COLUMN IF NOT EXISTS calendar_provider   text,
  ADD COLUMN IF NOT EXISTS graph_event_id      text,      -- Outlook event.id
  ADD COLUMN IF NOT EXISTS ical_uid            text,
  ADD COLUMN IF NOT EXISTS join_url            text,      -- Teams link (reminders carry it)
  ADD COLUMN IF NOT EXISTS ics_url             text,
  ADD COLUMN IF NOT EXISTS call_number         text,
  ADD COLUMN IF NOT EXISTS invite_email_status text,
  ADD COLUMN IF NOT EXISTS booked_via          text,
  ADD COLUMN IF NOT EXISTS booked_at           timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_event_id   text,      -- CAPI Schedule event id
  ADD COLUMN IF NOT EXISTS confirmed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_booking_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key     text,
  ADD COLUMN IF NOT EXISTS intro_played_at     timestamptz,   -- W09 voice-note play
  ADD COLUMN IF NOT EXISTS late_booking        boolean NOT NULL DEFAULT false,
  -- 2026-10-11 (Jonathan): a booking of a lead whose email is not verified is a HELD slot (status pending_verification):
  -- reserved here so nobody else can take it, NOT written to the broker's calendar, invisible to the broker; it becomes
  -- 'booked' (Outlook event, Teams link, broker notice) when the email is verified, or is released at verify_by.
  ADD COLUMN IF NOT EXISTS verify_by           timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_smc_checks' AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_smc_checks CHECK (
      brand_id IS NULL OR (
            status IN ('pending_verification','booked','confirmed','rescheduled','cancelled','attended','no_show')
        AND (status <> 'pending_verification' OR verify_by IS NOT NULL)
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

-- Zero double-bookings, SMC rows only so legacy data can never block the index. A held slot (pending_verification) counts:
CREATE UNIQUE INDEX IF NOT EXISTS appointments_smc_no_double_booking
  ON public.appointments (broker_id, appointment_date)
  WHERE brand_id IS NOT NULL AND status IN ('pending_verification','booked','confirmed');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_smc_no_overlap' AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_smc_no_overlap
      EXCLUDE USING gist (broker_id WITH =, tstzrange(appointment_date, ends_at, '[)') WITH &&)
      WHERE (brand_id IS NOT NULL AND status IN ('pending_verification','booked','confirmed'));
  END IF;
END $$;
-- Full unique indexes: W05/W06 use a bare ON CONFLICT on these (NULLs never conflict, so legacy rows are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS appointments_idem_full_uidx        ON public.appointments (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_graph_event_full_uidx ON public.appointments (graph_event_id);
CREATE INDEX IF NOT EXISTS appointments_smc_lead_idx ON public.appointments (client_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_smc_hold_idx ON public.appointments (verify_by) WHERE brand_id IS NOT NULL AND status = 'pending_verification';

CREATE OR REPLACE VIEW public.bookings WITH (security_invoker = true) AS
SELECT a.id, a.brand_id, a.broker_id, a.client_id AS lead_id,
       a.appointment_date AS starts_at, a.ends_at, a.method, a.status,
       a.calendar_provider, a.graph_event_id, a.ical_uid,
       a.join_url, a.ics_url, a.call_number, a.invite_email_status,
       a.booked_via AS source, a.booked_at, a.schedule_event_id, a.confirmed_at,
       a.cancelled_at, a.reschedule_count, a.previous_booking_id, a.created_at, a.updated_at,
       a.intro_played_at, a.late_booking, a.verify_by
FROM public.appointments a
WHERE a.brand_id IS NOT NULL;
COMMENT ON VIEW public.bookings IS 'SMC: SortMyCover rows of appointments (portal Leads page). Writes go to appointments. RLS of appointments applies (security_invoker).';

-- -----------------------------------------------------------------------------
-- 7. webhook_events: one idempotency table (inbound wamid claims, one-reply-per-message claims, W01/W05 rate counters,
--    Graph notification dedupe). Stores a payload HASH only (no PII).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source       text NOT NULL,
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
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_events'::regclass AND conname = 'webhook_events_source_check'
                  AND pg_get_constraintdef(oid) LIKE '%w01_num%' AND pg_get_constraintdef(oid) NOT LIKE '%paystack%') THEN
    ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_source_check;
    ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_source_check CHECK (source IN
      ('meta_leadgen','whatsapp','meta_feed','meta_messages','graph','flow','other',
       'w01_ip','w01_num',        -- W01 rate counters (HMAC of IP / digits hash)
       'w20'));                   -- Graph change-notification dedupe
  END IF;
END $$;
COMMENT ON CONSTRAINT webhook_events_source_check ON public.webhook_events IS
  'SMC: every source the nurture workflows write. Guarded by automation/tests/webhook-sources.test.mjs.';

-- -----------------------------------------------------------------------------
-- 8. audit_log: the LIVE table (uuid id, record_id, old_data/new_data, changed_at; 41 rows; fn_audit triggers; admin UI reads it)
--    is extended, not replaced, so both writers share one table and nothing live changes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (   -- fresh databases only; a no-op on the live project
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  text NOT NULL,
  action      text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE'))
);
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
  -- column names whose VALUES never enter the append-only audit log (POPIA erasure cannot reach it)
  pii constant text[] := ARRAY[
    'first_name','last_name','phone','phone_number','email','mobile','call_number','alt_number','alt_email',
    'whatsapp_number','contact_person','adviser_name','adviser_whatsapp','address','firm_address','client_ip','client_user_agent',
    'content','recipient_contact','subject','transcript','summary','voice_note_url','line','notes','conv_state',
    'google_calendar_token','calendar_email','note','external_id','mobile_hash','dedupe_hash',
    'fbclid','fbp','fbc','ctwa_clid','consent_text','join_url','ics_url','wa_id',
    'smoker','smoker_question_text','income_band','spend_band','email_verify_code_hash','capture_state','reasons',
    'declined_broker_ids','proof_path','script_text','positioning_answers'];
  o jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  n jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  r jsonb := coalesce(n, o);
  d jsonb := '{}'::jsonb;
  k text;
  v_role text;
BEGIN
  -- brand-scoped mode for shared CRM tables: only SortMyCover rows are audited (legacy rows keep fn_audit as today)
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
          coalesce(r->>'id', r->>'code', r->>'lead_id'),
          TG_OP, d,
          nullif(current_setting('smc.reason', true), ''));
  RETURN NULL;
END $$;
COMMENT ON FUNCTION public.smc_audit() IS 'SMC audit: AFTER trigger; arg ''brand_scoped'' skips legacy rows (brand_id NULL). PII column values are never written.';

DO $$
DECLARE
  t text;
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS smc_touch_updated_at ON public.brands';
  EXECUTE 'CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  EXECUTE 'DROP TRIGGER IF EXISTS smc_audit ON public.brands';
  EXECUTE 'CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.smc_audit()';
  FOREACH t IN ARRAY ARRAY['brokers','leads','appointments','communications'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.smc_audit(%L)', t, 'brand_scoped');
  END LOOP;
END $$;

-- one-off: legacy audit rows carry changed_at; give the new "at" column the same instant instead of the migration time
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'changed_at') THEN
    UPDATE public.audit_log SET at = changed_at WHERE changed_at IS NOT NULL AND source IS NULL AND actor_uid IS NULL AND row_id IS NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 9. Fail closed until file 05 (Supabase default privileges give anon/authenticated ALL on every new public table and view).
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.brands','public.webhook_events'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', t);
  END LOOP;
  EXECUTE 'REVOKE ALL ON public.bookings FROM PUBLIC, anon, authenticated';
END $$;
REVOKE ALL ON FUNCTION public.smc_audit() FROM PUBLIC, anon, authenticated;   -- trigger function; never an RPC
REVOKE ALL ON FUNCTION public.smc_leads_stage_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id(), public.smc_hash_contact(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id(), public.smc_hash_contact(text) TO authenticated;
