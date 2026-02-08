-- Add restrictive policy to require authentication for admin_invites access
CREATE POLICY "Require authentication for admin_invites access"
ON public.admin_invites
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Update handle_new_user() to NEVER auto-create admin roles from signup metadata
-- Admins should ONLY be created via the invite token system
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile for all users (never set admin role from metadata)
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  RETURN NEW;
END;
$$;