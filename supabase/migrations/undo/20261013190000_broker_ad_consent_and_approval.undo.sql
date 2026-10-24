-- UNDO of 20261013190000_broker_ad_consent_and_approval.sql. Drops the two broker RPCs and restores the broker_media
-- constraints / insert policy to their previous definitions.
-- Data stays: onboarding_progress.ad_consent and the consent rows in broker_compliance_checks (append-only, the permanent
-- compliance record) and broker_activities. Do NOT delete the audit rows.
-- The kind check cannot go back while kind 'ad' rows exist: the DO block stops with a message instead of deleting them.
-- Decide what to do with them first, e.g. archive them, then:
--   DELETE FROM public.broker_media WHERE kind = 'ad';
-- Clear the current-state key only if Lead Velocity decides to (the audit trail keeps the history):
--   UPDATE public.brokers SET onboarding_progress = onboarding_progress - 'ad_consent' WHERE onboarding_progress ? 'ad_consent';
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.broker_media WHERE kind = 'ad') THEN
    RAISE EXCEPTION 'broker_media still has kind ''ad'' rows; deal with them first (see the header of this file).';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.broker_set_ad_likeness_consent(boolean);
DROP FUNCTION IF EXISTS public.broker_decide_ad(uuid, boolean, text);

ALTER TABLE public.broker_media DROP CONSTRAINT IF EXISTS broker_media_kind_check;
ALTER TABLE public.broker_media ADD CONSTRAINT broker_media_kind_check
  CHECK (kind = ANY (ARRAY['voice'::text, 'video'::text, 'card'::text, 'headshot'::text]));

ALTER TABLE public.broker_media DROP CONSTRAINT IF EXISTS broker_media_one_current_x;
ALTER TABLE public.broker_media ADD CONSTRAINT broker_media_one_current_x
  EXCLUDE USING btree (broker_id WITH =, kind WITH =, language WITH =) WHERE (is_current)
  DEFERRABLE INITIALLY DEFERRED;

DROP POLICY IF EXISTS "smc broker add own" ON public.broker_media;
CREATE POLICY "smc broker add own" ON public.broker_media FOR INSERT TO authenticated
  WITH CHECK (broker_id = public.smc_current_broker_id() AND approved_at IS NULL AND is_current = false);

COMMENT ON COLUMN public.broker_media.kind IS NULL;
COMMIT;
