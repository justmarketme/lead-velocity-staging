DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN
    EXECUTE 'REVOKE SELECT ON public.user_roles FROM n8n_app';
  END IF;
END $$;
