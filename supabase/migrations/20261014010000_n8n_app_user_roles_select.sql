-- n8n_app can run the WhatsApp sender (14 Oct 2026).
--
-- Found on the first live dry-run of the quiz v2 band question: smc-whatsapp-send's first SQL step ("Load context") fails with
-- "permission denied for table user_roles". Cause: three legacy policies on public.communications are TO public and evaluate
--     EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
--   "Admins can view all communications", "Admins can insert communications", "Admins can update communications".
-- A policy subquery runs with the CALLER's privileges and n8n_app has no SELECT on user_roles, so every read, insert or update of
-- communications by n8n fails before the n8n_app brand-rows policy is even considered. That is every WhatsApp send (dry-run or live),
-- W03's "Store outbound", W06/W09/W15's communications rows, and the email-verify log.
--
-- The grant exposes nothing: user_roles has row level security on, and its three policies are TO authenticated only, so n8n_app (no
-- BYPASSRLS, auth.uid() null) reads zero rows and the admin branch of those policies is simply false for it.
-- Undo: supabase/migrations/undo/20261014010000_n8n_app_user_roles_select.undo.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN
    EXECUTE 'GRANT SELECT ON public.user_roles TO n8n_app';
  END IF;
END $$;
