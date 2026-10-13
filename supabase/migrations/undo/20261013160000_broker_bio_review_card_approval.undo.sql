-- UNDO of 20261013160000_broker_bio_review_card_approval.sql. Drops the two broker RPCs.
-- Data stays: onboarding_progress.bio_review / .card, broker_media approvals, brokers.intro_card_url and the audit rows in
-- broker_compliance_checks (append-only) are left as they are. The bcc_broker_read_own policy fix is NOT reverted (the
-- previous definition let every broker read every broker's checks).
-- Remove review data if needed:
--   UPDATE public.brokers SET onboarding_progress = onboarding_progress - 'bio_review' WHERE onboarding_progress ? 'bio_review';
BEGIN;
DROP FUNCTION IF EXISTS public.broker_decide_bio_suggestion(boolean);
DROP FUNCTION IF EXISTS public.broker_approve_intro_card(uuid);
COMMIT;
