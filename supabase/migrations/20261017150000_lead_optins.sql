-- Opt-in provenance: one permanent row per consent, linked to the lead.
--
-- Jono, 17 Oct 2026: the CRM must show, for every opt-in, exactly where it came
-- from (Facebook ad, Instagram ad or post, which website page, or WhatsApp
-- direct), at any time later. The leads.consent_* / utm_* / ctwa_clid columns
-- hold one value each and are overwritten by the next opt-in, so they are not
-- evidence. This table is append-only: rows can be inserted, never edited, and
-- are removed only when their lead is deleted (POPIA erasure).
--
-- Writer: n8n W07 (Lindi) on the inbound WhatsApp message that carries consent.
-- Field contract: sites/sortmycover/docs/WHATSAPP-OPENERS.md and the shared
-- notes file OPTIN-PROVENANCE-CONTRACT-2026-10-17.md.
--
-- Undo: supabase/migrations/undo/20261017150000_lead_optins.undo.sql

CREATE TABLE IF NOT EXISTS public.lead_optins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id),
  -- Derived by lead_optins_derive_channel() when the writer leaves it null.
  channel text NOT NULL CHECK (channel IN (
    'facebook_ad', 'instagram_ad', 'facebook_post', 'instagram_post', 'website', 'whatsapp_direct'
  )),
  -- Opener: "Ref <ref_code> via <via_source>/<via_campaign>/<via_content>"
  ref_code text,
  via_source text,
  via_campaign text,
  via_content text,
  -- Twilio click-to-WhatsApp referral fields (ReferralSourceType etc.)
  referral_source_type text CHECK (referral_source_type IN ('ad', 'post')),
  referral_source_id text,
  referral_source_url text,
  referral_headline text,
  ctwa_clid text,
  consent_version text NOT NULL,
  consent_text text,
  opener_text text,
  message_sid text UNIQUE,
  received_at timestamptz NOT NULL,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_optins_lead_idx ON public.lead_optins (lead_id, received_at);
CREATE INDEX IF NOT EXISTS lead_optins_channel_idx ON public.lead_optins (channel);

-- One rule for the channel, so every writer classifies the same way.
CREATE OR REPLACE FUNCTION public.lead_optins_derive_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ig boolean;
BEGIN
  IF NEW.channel IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.referral_source_type IS NOT NULL THEN
    ig := coalesce(NEW.referral_source_url, '') ~* '(instagram\.com|instagr\.am)';
    NEW.channel := CASE WHEN ig THEN 'instagram_' ELSE 'facebook_' END || NEW.referral_source_type;
  ELSIF lower(coalesce(NEW.via_source, '')) IN ('ig', 'instagram') THEN
    NEW.channel := CASE WHEN NEW.via_campaign IS NOT NULL THEN 'instagram_ad' ELSE 'instagram_post' END;
  ELSIF lower(coalesce(NEW.via_source, '')) IN ('fb', 'facebook') THEN
    NEW.channel := CASE WHEN NEW.via_campaign IS NOT NULL THEN 'facebook_ad' ELSE 'facebook_post' END;
  ELSIF NEW.ref_code IS NOT NULL THEN
    NEW.channel := 'website';
  ELSE
    NEW.channel := 'whatsapp_direct';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lead_optins_derive_channel ON public.lead_optins;
CREATE TRIGGER lead_optins_derive_channel
  BEFORE INSERT ON public.lead_optins
  FOR EACH ROW EXECUTE FUNCTION public.lead_optins_derive_channel();

-- Append-only, for every role. A delete is allowed only as the cascade of its
-- lead being deleted (the lead row is already gone when the cascade runs).
CREATE OR REPLACE FUNCTION public.lead_optins_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id = OLD.lead_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'lead_optins is append-only (% refused)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS lead_optins_append_only ON public.lead_optins;
CREATE TRIGGER lead_optins_append_only
  BEFORE UPDATE OR DELETE ON public.lead_optins
  FOR EACH ROW EXECUTE FUNCTION public.lead_optins_append_only();

ALTER TABLE public.lead_optins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read opt-ins" ON public.lead_optins;
CREATE POLICY "Admins read opt-ins" ON public.lead_optins
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.lead_optins TO n8n_app';
    EXECUTE 'DROP POLICY IF EXISTS "smc n8n_app insert opt-ins" ON public.lead_optins';
    EXECUTE 'CREATE POLICY "smc n8n_app insert opt-ins" ON public.lead_optins FOR INSERT TO n8n_app WITH CHECK (brand_id IS NOT NULL)';
    EXECUTE 'DROP POLICY IF EXISTS "smc n8n_app read opt-ins" ON public.lead_optins';
    EXECUTE 'CREATE POLICY "smc n8n_app read opt-ins" ON public.lead_optins FOR SELECT TO n8n_app USING (brand_id IS NOT NULL)';
  END IF;
END $$;

COMMENT ON TABLE public.lead_optins IS 'Append-only opt-in provenance: one row per consent, with where it came from. Written by n8n W07.';
