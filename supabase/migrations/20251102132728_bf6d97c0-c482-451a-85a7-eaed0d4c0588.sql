-- Update handle_new_user to properly handle admin users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_app_role TEXT;
BEGIN
  -- Determine the role based on user_type metadata
  user_app_role := CASE 
    WHEN NEW.raw_user_meta_data->>'user_type' = 'admin' THEN 'admin'
    WHEN NEW.raw_user_meta_data->>'user_type' = 'broker' THEN 'agent'
    ELSE 'agent'
  END;

  -- Create profile with appropriate role
  INSERT INTO public.profiles (user_id, full_name, app_role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', user_app_role);
  
  -- If admin, add admin role to user_roles table
  IF NEW.raw_user_meta_data->>'user_type' = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  END IF;
  
  RETURN NEW;
END;
$$;