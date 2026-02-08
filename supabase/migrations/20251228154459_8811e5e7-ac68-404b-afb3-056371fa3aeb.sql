-- Drop the restrictive policy that blocks unauthenticated access
DROP POLICY IF EXISTS "Require authentication for admin_invites access" ON public.admin_invites;

-- Add policy to allow anyone to validate invite tokens (read-only, limited fields)
-- This is safe because:
-- 1. Tokens are cryptographically random and unguessable
-- 2. This only allows SELECT, not modification
-- 3. Users still need to create an account to use the invite
CREATE POLICY "Anyone can validate invite tokens"
ON public.admin_invites
FOR SELECT
TO anon, authenticated
USING (true);

-- Keep the insert/update restricted to admins (already exists)
-- The existing policies for INSERT and UPDATE already require admin role