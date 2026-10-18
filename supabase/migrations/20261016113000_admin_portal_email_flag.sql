-- Supabase has ONE reset-password email for every login. So it can tell an owner/admin from a broker,
-- every account holding the admin role carries user_metadata.admin_portal = true, kept in sync from user_roles.
-- The flag only changes email wording and links; admin access itself is still checked with has_role().
CREATE OR REPLACE FUNCTION public.sync_admin_portal_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  v_uid uuid := coalesce(NEW.user_id, OLD.user_id);
BEGIN
  IF public.has_role(v_uid, 'admin') THEN
    UPDATE auth.users SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"admin_portal": true}'::jsonb
      WHERE id = v_uid AND (raw_user_meta_data->>'admin_portal') IS DISTINCT FROM 'true';
  ELSE
    UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data - 'admin_portal'
      WHERE id = v_uid AND raw_user_meta_data ? 'admin_portal';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_admin_portal_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_admin_portal_flag ON public.user_roles;
CREATE TRIGGER trg_sync_admin_portal_flag
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_portal_flag();

-- Backfill: flag current admins, clear the flag from anyone else.
UPDATE auth.users u SET raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || '{"admin_portal": true}'::jsonb
  WHERE public.has_role(u.id, 'admin');
UPDATE auth.users u SET raw_user_meta_data = u.raw_user_meta_data - 'admin_portal'
  WHERE u.raw_user_meta_data ? 'admin_portal' AND NOT public.has_role(u.id, 'admin');
