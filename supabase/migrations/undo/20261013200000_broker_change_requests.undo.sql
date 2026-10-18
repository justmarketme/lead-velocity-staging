-- UNDO of 20261013200000_broker_change_requests.sql. Drops the lock trigger and the three functions.
-- Data stays: onboarding_progress.change_requests / *.unlocked_at, broker_activities and the broker_compliance_checks rows
-- (append-only audit). The Vault secrets (emma_notify_secret / emma_notify_url), if created, are left in place.
BEGIN;
DROP TRIGGER IF EXISTS broker_approved_items_guard ON public.brokers;
DROP FUNCTION IF EXISTS public.broker_approved_items_guard();
DROP FUNCTION IF EXISTS public.broker_request_change(text, text);
DROP FUNCTION IF EXISTS public.admin_resolve_change_request(uuid, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.lv_notify_emma(text, text, text);
COMMIT;
