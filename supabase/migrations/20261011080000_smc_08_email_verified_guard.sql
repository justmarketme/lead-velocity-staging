-- =============================================================================
-- 20261011080000_smc_08_email_verified_guard.sql  --  CRM nurture chain, file 9: narrow smc_lead_email_verified(uuid)
-- The function is SECURITY DEFINER and EXECUTE-granted to authenticated because the RESTRICTIVE broker visibility policies
-- of file 05 call it (definer: no policy recursion through leads). Granted as-is, any signed-in user could probe any lead's
-- verification flag by id. From here it answers truthfully only to:
--   * admins (smc_is_admin()),
--   * non-API roles (n8n_app, service_role, postgres). current_user is the definer inside this function, so the caller is read
--     from the role GUC (PostgREST's SET ROLE authenticated / anon / service_role), falling back to session_user for a direct login,
--   * the broker the lead is routed to (leads.broker_id = smc_current_broker_id()).
-- Everyone else gets false. Inside the policies this can only hide rows (RESTRICTIVE), never reveal one, so the portal sees
-- exactly what it saw before for its own leads. Signature, grants and policies are unchanged.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.smc_lead_email_verified(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT l.email_verified
      FROM public.leads l
     WHERE l.id = p_lead_id
       AND (   coalesce(nullif(current_setting('role', true), 'none'), session_user::text) NOT IN ('authenticated', 'anon')
            OR public.smc_is_admin()
            OR (l.broker_id IS NOT NULL AND l.broker_id = public.smc_current_broker_id()))
  ), false)
$$;
COMMENT ON FUNCTION public.smc_lead_email_verified(uuid) IS 'SMC: true once the lead''s email is verified; answers only admins, non-API roles (n8n_app / service role) and the lead''s own broker (false for everyone else). Used by the RESTRICTIVE broker visibility policies (definer: no policy recursion through leads).';
REVOKE ALL ON FUNCTION public.smc_lead_email_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_lead_email_verified(uuid) TO authenticated, n8n_app;
