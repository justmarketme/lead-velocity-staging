-- Run this in Supabase Dashboard → SQL Editor to fix:
-- 1) "new row violates row-level security policy for table broker_invites"
-- 2) Broker invite link validation (get_broker_invite_by_token)

-- ============ 1. RLS: Allow admins to INSERT into broker_invites ============
DROP POLICY IF EXISTS "Admins can manage broker invites" ON public.broker_invites;
DROP POLICY IF EXISTS "Admins can insert broker invites" ON public.broker_invites;

CREATE POLICY "Admins can manage broker invites"
ON public.broker_invites
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ 2. RPC: Allow unauthenticated users to validate invite token ============
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

GRANT EXECUTE ON FUNCTION public.get_broker_invite_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_broker_invite_by_token(text) TO authenticated;
