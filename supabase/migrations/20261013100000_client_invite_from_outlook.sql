-- Client meeting invites come FROM the broker's own Outlook (Jono, 2026-10-13). W05 adds the client as a required attendee
-- when the event goes into the broker's connected calendar (automation/lib/w05.mjs invitedByOutlook), so Exchange sends the
-- meeting request with the Teams link from his mailbox; howzit@ stays the fallback (shared calendar / not connected).
-- add_client_as_attendee becomes default-on; false is the per-broker opt-out, set in the admin broker drawer.
-- No UI or workflow ever wrote this column before (it was false only by default), so every row is moved to the new default.
-- Undo: supabase/migrations/undo/20261013100000_client_invite_from_outlook.undo.sql
BEGIN;
ALTER TABLE public.brokers ALTER COLUMN add_client_as_attendee SET DEFAULT true;
UPDATE public.brokers SET add_client_as_attendee = true WHERE add_client_as_attendee IS DISTINCT FROM true;
COMMENT ON COLUMN public.brokers.add_client_as_attendee IS
  'true (default): W05 invites the client as attendee on the broker''s own Outlook event (invite sent from his mailbox). false: opt-out, the howzit@ email is the invite.';
COMMIT;
