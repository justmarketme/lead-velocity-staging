-- 20261007190000_smc_19_capture_v2.sql  -  WhatsApp capture Flow v2 (Jonathan, 2026-10-07). ADDITIVE ONLY. NOT APPLIED.
-- Owner: automation-engineer. Logic: automation/ctwa/capture-v2.js (leadColumns, makeOffer, decideOffer, email verification).
-- Every column is nullable or defaulted, every constraint NULL-tolerant, so legacy rows and current workflows keep passing.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_name                  text,
  ADD COLUMN IF NOT EXISTS reasons                    text[],        -- life_cover | funeral_cover | retirement_planning | investments | disability | paying_too_much | other
  ADD COLUMN IF NOT EXISTS spend_band                 text,          -- current premium spend bracket (optional)
  ADD COLUMN IF NOT EXISTS lead_tier                  text,          -- A = R1,500+ (auto-deliver) · B = R750-R1,499 (offer first)
  ADD COLUMN IF NOT EXISTS income_band                text,          -- optional; NEVER sent to Meta
  ADD COLUMN IF NOT EXISTS smoker                     text,          -- optional; NEVER sent to Meta / CAPI / Pixel
  ADD COLUMN IF NOT EXISTS smoker_question_text       text,          -- exact wording shown (consent evidence)
  ADD COLUMN IF NOT EXISTS smoker_answered_at         timestamptz,
  ADD COLUMN IF NOT EXISTS wa_id                      text,          -- WhatsApp id (digits); the inbound message proves it
  ADD COLUMN IF NOT EXISTS wa_verified                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS call_number_verified       boolean,       -- true = same as WhatsApp; false = Lookup-validated only
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
  ADD COLUMN IF NOT EXISTS licence_flag               text,          -- outside_licence | licence_check_needed
  ADD COLUMN IF NOT EXISTS capture_state              jsonb,         -- Flow answers so far (abandonment-safe)
  ADD COLUMN IF NOT EXISTS delivered                  boolean,       -- false = never handed to a broker (out of band / declined)
  ADD COLUMN IF NOT EXISTS counts_toward_cycle        boolean,       -- false = excluded from the committed number
  ADD COLUMN IF NOT EXISTS offer_status               text,
  ADD COLUMN IF NOT EXISTS offer_broker_id            uuid,
  ADD COLUMN IF NOT EXISTS offered_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS offer_expires_at           timestamptz,
  ADD COLUMN IF NOT EXISTS offer_decided_at           timestamptz,
  ADD COLUMN IF NOT EXISTS declined_broker_ids        uuid[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_capture_v2_checks' AND conrelid = 'public.leads'::regclass) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_capture_v2_checks CHECK (
          (lead_tier IS NULL    OR lead_tier IN ('A','B'))
      AND (spend_band IS NULL   OR spend_band IN ('lt500','500_1000','1000_1500','1500_2500','2500plus','prefer_not'))
      AND (income_band IS NULL  OR income_band IN ('lt20k','20k_40k','40k_60k','60k_100k','100kplus','prefer_not'))
      AND (smoker IS NULL       OR smoker IN ('yes','no','prefer_not'))
      AND (smoker IS NULL       OR (smoker_question_text IS NOT NULL AND smoker_answered_at IS NOT NULL))  -- answer only with its evidence
      AND (email_verified_via IS NULL OR email_verified_via IN ('link','code'))
      AND (licence_flag IS NULL OR licence_flag IN ('outside_licence','licence_check_needed'))
      AND (offer_status IS NULL OR offer_status IN ('offered','accepted','declined','expired','held'))
      AND (reasons IS NULL      OR reasons <@ ARRAY['life_cover','funeral_cover','retirement_planning','investments','disability','paying_too_much','other']::text[])
    ) NOT VALID;
  END IF;
END $$;

-- Broker licence categories (internal codes: lt_risk, lt_funeral, retirement, investments). NULL = unknown -> flag.
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS licence_categories text[];

-- Tier B offers: one row per (lead, broker) offer. Accept/decline/expiry timestamps are the evidence.
CREATE TABLE IF NOT EXISTS public.lead_offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id    uuid NOT NULL,
  status       text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','declined','expired')),
  offered_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  decided_at   timestamptz,
  decided_via  text CHECK (decided_via IS NULL OR decided_via IN ('whatsapp','portal','expiry')),
  wamid        text,
  UNIQUE (lead_id, broker_id)                     -- never re-offered to the same broker
);
CREATE INDEX IF NOT EXISTS lead_offers_open_idx ON public.lead_offers (expires_at) WHERE status = 'offered';
ALTER TABLE public.lead_offers ENABLE ROW LEVEL SECURITY;
-- SAFETY REWRITE (2026-10-10 review): the original left RLS on with NO policy and NO grant for n8n_app (workflows would get
-- "permission denied"), and kept Supabase's default ALL grants for anon/authenticated (incl. TRUNCATE, which RLS does not
-- govern). Access model: anon nothing; authenticated read-only through the admin policy; n8n_app read/insert/update; broker_id FK.
REVOKE ALL ON public.lead_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_offers TO authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN   -- role is created by smc_05
    GRANT SELECT, INSERT, UPDATE ON public.lead_offers TO n8n_app;
    DROP POLICY IF EXISTS "smc n8n_app rw" ON public.lead_offers;
    CREATE POLICY "smc n8n_app rw" ON public.lead_offers FOR ALL TO n8n_app USING (true) WITH CHECK (true);
  END IF;
END $$;
DROP POLICY IF EXISTS "smc admin all" ON public.lead_offers;
CREATE POLICY "smc admin all" ON public.lead_offers FOR SELECT TO authenticated USING (public.smc_is_admin());
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_offers_broker_id_fkey' AND conrelid = 'public.lead_offers'::regclass) THEN
    ALTER TABLE public.lead_offers ADD CONSTRAINT lead_offers_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES public.brokers(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS lead_offers_broker_idx ON public.lead_offers (broker_id, status);

COMMENT ON COLUMN public.leads.smoker IS 'Capture v2: optional, adviser brief only. Never sent to Meta (CAPI/Pixel/custom_data) - capture-v2.js NEVER_TO_META.';
COMMENT ON TABLE public.lead_offers IS 'Capture v2 tier B (R750-R1,499): offered to the routed broker first; 2 working hours to accept, expiry = declined.';
-- needs_human: v_cycle_progress must also exclude leads WHERE counts_toward_cycle = false OR offer_status IN ('offered','declined','expired','held').
