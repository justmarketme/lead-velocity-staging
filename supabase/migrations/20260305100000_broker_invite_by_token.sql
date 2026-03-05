-- Allow unauthenticated users to validate broker invite links via token.
-- broker_invites has RLS that only allows admins to SELECT, so the broker-setup
-- page (used by unauthenticated invitees) could never load the invite. This
-- SECURITY DEFINER function bypasses RLS and returns the invite row when the
-- token is valid (not used, not expired).
CREATE OR REPLACE FUNCTION public.get_broker_invite_by_token(invite_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT to_json(b) INTO result
  FROM public.broker_invites b
  WHERE b.token = invite_token
    AND b.used_at IS NULL
    AND b.expires_at > now();
  RETURN result;
END;
$$;

-- Allow unauthenticated (anon) and authenticated users to call this RPC
GRANT EXECUTE ON FUNCTION public.get_broker_invite_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_broker_invite_by_token(text) TO authenticated;
