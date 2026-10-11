-- =============================================================================
-- 20261011040000_smc_04_engagement.sql  --  CRM nurture chain, file 4 of 8: the side tables the nurture flow writes
--   wa_threads   WhatsApp qualifying-thread state per brand + mobile hash (W03 questions, W08 stall nudges), 72-h life
--   lead_offers  agreement 5.7 offers: tier B (accept / decline / expiry) and tier C (standing yes / admin) evidence
--   suppression  STOP / opt-out list as hashes (W03 no-consent, W08, W10, W15; every send checks it)
--   escalations  human hand-off queue for the CRM console (W07 handoff, W10, W12 disputes, W13 replacement due)
--   broker_media intro voice / video takes (W23); brokers.intro_* point at the approved one
--   incidents    POPIA breach register (W07 drafts one row per breach-report mail)
--   capi_log     Meta conversions delivery log (SUB-capi-send, called by W01 W03 W05 W12) - see CRM-NURTURE-SCHEMA.md decision D3
-- Trimmed from the reviewed smc_03 / 06 / 08 / 10 / 19. Comments, ads, insights, lead pulse, DSR, retention log, obligations,
-- report tables and the whole ops schema are not created.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. wa_threads (never a raw number: mobile_hash = smc_hash_contact). Only n8n touches it.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_threads (
  brand_id        uuid        NOT NULL REFERENCES public.brands(id),
  mobile_hash     text        NOT NULL,
  state           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  stage           text,
  last_inbound_at timestamptz,
  stall_due_at    timestamptz,
  expires_at      timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, mobile_hash),
  CHECK (jsonb_typeof(state) = 'object')
);
CREATE INDEX IF NOT EXISTS wa_threads_stall_due_idx ON public.wa_threads (stall_due_at) WHERE stall_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_threads_expires_idx   ON public.wa_threads (expires_at);
COMMENT ON TABLE public.wa_threads IS 'SMC (W03/W08): WhatsApp qualifying thread per brand + mobile hash; 72-h life. n8n_app only.';

-- -----------------------------------------------------------------------------
-- 2. lead_offers (agreement 5.7: tier B offered to the routed broker first; tier C (under R750) accepted by a standing yes or an admin;
--    accept -> leads.broker_id -> a place reserved on his order; it COUNTS only at booked + attendance confirmed, file 03)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id    uuid NOT NULL REFERENCES public.brokers(id),
  status       text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','declined','expired')),
  offered_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  decided_at   timestamptz,
  decided_via  text CHECK (decided_via IS NULL OR decided_via IN ('whatsapp','portal','expiry','standing','admin')),   -- standing = brokers.accepts_low_budget, admin = manual_low_budget (file 03)
  wamid        text,
  UNIQUE (lead_id, broker_id)                     -- never re-offered to the same broker
);
CREATE INDEX IF NOT EXISTS lead_offers_open_idx ON public.lead_offers (expires_at) WHERE status = 'offered';
CREATE INDEX IF NOT EXISTS lead_offers_broker_idx ON public.lead_offers (broker_id, status);
COMMENT ON TABLE public.lead_offers IS 'Agreement 5.7 offers: tier B (R750-R1,499) offered to the routed broker first (2 working hours to accept, expiry = declined); tier C (under R750) only to a broker with accepts_low_budget (accepted at once, decided_via standing) or assigned by an admin (decided_via admin). Written by capture v2 and by the file-03 routing trigger.';

-- -----------------------------------------------------------------------------
-- 3. suppression (opt-out). brand_id NULL = Lead Velocity-wide.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppression (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_hash text,
  email_hash  text,
  source      text NOT NULL CONSTRAINT suppression_source_check
                CHECK (source IN ('stop','objection','ncc_registry','complaint','no_consent_ctwa','dsr_erase','deletion')),
  brand_id    uuid REFERENCES public.brands(id),
  lead_id     uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (mobile_hash IS NOT NULL OR email_hash IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS suppression_mobile_uidx ON public.suppression (mobile_hash, brand_id) NULLS NOT DISTINCT WHERE mobile_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS suppression_email_uidx  ON public.suppression (email_hash, brand_id)  NULLS NOT DISTINCT WHERE email_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS suppression_mobile_source_uidx ON public.suppression (mobile_hash, source);   -- W15 ON CONFLICT target

-- -----------------------------------------------------------------------------
-- 4. escalations (the console queue)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.escalations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid REFERENCES public.brands(id),
  kind        text NOT NULL CONSTRAINT escalations_kind_check CHECK (kind IN
                ('human_handoff','guardrail_trip','outcome_unmarked','replacement_dispute','complaint','dsr','other',
                 'needs_human','classifier_invalid','webhook_signature_invalid','sensitive')),
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
-- 5. broker_media (intro voice / video / card / headshot takes; one current take per broker/kind/language, checked at COMMIT)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broker_media (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id             uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  brand_id              uuid REFERENCES public.brands(id),
  kind                  text NOT NULL CHECK (kind IN ('voice','video','card','headshot')),
  language              text NOT NULL DEFAULT 'en',
  version               integer NOT NULL DEFAULT 1,
  url                   text,                     -- NULL while the take is processing (W23)
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
ALTER TABLE public.broker_media ADD COLUMN IF NOT EXISTS state text GENERATED ALWAYS AS (
  CASE
    WHEN approved_at IS NOT NULL AND is_current THEN 'approved'
    WHEN approved_at IS NOT NULL               THEN 'superseded'
    WHEN ai_check->>'state' IN ('processing','ready','rejected') THEN ai_check->>'state'
    WHEN url IS NULL                           THEN 'processing'
    ELSE 'ready' END) STORED;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broker_media_one_current_x' AND conrelid = 'public.broker_media'::regclass) THEN
    ALTER TABLE public.broker_media ADD CONSTRAINT broker_media_one_current_x
      EXCLUDE USING btree (broker_id WITH =, kind WITH =, language WITH =) WHERE (is_current)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
COMMENT ON COLUMN public.broker_media.state IS 'SMC: processing | ready | rejected | approved | superseded (generated from ai_check.state + approval).';

-- -----------------------------------------------------------------------------
-- 6. incidents (POPIA breach register; W07 drafts, a person assesses)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 7. capi_log (rerun-safe via unique(event_id, event_name)); ids only, the callee hashes PII
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
-- 8. updated_at + audit (append-only logs and the 72-h thread cache are not audited), then fail closed until file 05
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.suppression','public.escalations','public.broker_media','public.incidents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS smc_touch_updated_at ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS smc_audit ON %s', t);
    EXECUTE format('CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.smc_audit()', t);
  END LOOP;
  EXECUTE 'DROP TRIGGER IF EXISTS smc_audit ON public.lead_offers';
  EXECUTE 'CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE OR DELETE ON public.lead_offers FOR EACH ROW EXECUTE FUNCTION public.smc_audit()';
  FOREACH t IN ARRAY ARRAY['public.wa_threads','public.lead_offers','public.suppression','public.escalations','public.broker_media',
                           'public.incidents','public.capi_log'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;
