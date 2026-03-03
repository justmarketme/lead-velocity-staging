-- Explicitly redefine broker_invites policies
DROP POLICY IF EXISTS "Admins can manage broker invites" ON public.broker_invites;
DROP POLICY IF EXISTS "Admins can insert broker invites" ON public.broker_invites;

-- Allow admins to see/update/delete existing invites
CREATE POLICY "Admins can manage broker invites" ON public.broker_invites
    FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert new invites
CREATE POLICY "Admins can insert broker invites" ON public.broker_invites
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
