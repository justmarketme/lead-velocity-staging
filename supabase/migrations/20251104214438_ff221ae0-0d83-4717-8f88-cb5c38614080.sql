-- Fix Critical Security Issues

-- 1. Remove app_role from profiles table (dual role storage vulnerability)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS app_role;

-- 2. Add UPDATE and DELETE policies for lead_activities (admin maintenance)
CREATE POLICY "Admins can update activities"
  ON public.lead_activities
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete activities"
  ON public.lead_activities
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Add DELETE policies for profiles (GDPR compliance)
CREATE POLICY "Users can delete own profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));