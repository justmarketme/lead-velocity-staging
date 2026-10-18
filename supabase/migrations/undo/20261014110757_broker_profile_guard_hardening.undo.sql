BEGIN;
DROP TRIGGER IF EXISTS broker_profile_permissions_guard ON public.brokers;
DROP FUNCTION IF EXISTS public.broker_profile_permissions_guard();
-- Explicit WITH CHECK has the same ownership requirement as the original implicit check; retain it.
COMMIT;
