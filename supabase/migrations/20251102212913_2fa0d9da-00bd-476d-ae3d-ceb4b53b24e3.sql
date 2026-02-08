-- Fix profiles table security: Restrict visibility to own profile or admins only

-- Drop the overly permissive policy that allows all users to see all profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- Allow users to view only their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);