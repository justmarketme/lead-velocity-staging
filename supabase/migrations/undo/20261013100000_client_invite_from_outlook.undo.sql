-- UNDO of 20261013100000_client_invite_from_outlook.sql: back to default false. Opt-outs set since stay false; every
-- other broker is set back to false, so the howzit@ email is the invite again (also revert automation/lib/w05.mjs).
BEGIN;
ALTER TABLE public.brokers ALTER COLUMN add_client_as_attendee SET DEFAULT false;
UPDATE public.brokers SET add_client_as_attendee = false WHERE add_client_as_attendee IS DISTINCT FROM false;
COMMENT ON COLUMN public.brokers.add_client_as_attendee IS NULL;
COMMIT;
