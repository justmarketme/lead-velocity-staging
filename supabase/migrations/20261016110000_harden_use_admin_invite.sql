-- Admin invites: the token alone used to grant admin to ANY user id, callable anonymously.
-- Now the caller must be the signed-in new account (sign-up auto-confirms, so it has a session),
-- and when the invite names an email, that account's email must match it. Single use, unexpired.
CREATE OR REPLACE FUNCTION public.use_admin_invite(invite_token text, new_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  invite_record admin_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR new_user_id IS DISTINCT FROM v_uid THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO invite_record FROM admin_invites
    WHERE token = invite_token AND used_at IS NULL AND expires_at > now()
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF invite_record.email IS NOT NULL AND lower(btrim(invite_record.email)) IS DISTINCT FROM lower(btrim(v_email)) THEN
    RETURN FALSE;
  END IF;

  UPDATE admin_invites SET used_at = now() WHERE id = invite_record.id;
  INSERT INTO user_roles (user_id, role) VALUES (v_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.use_admin_invite(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_admin_invite(text, uuid) TO authenticated;
