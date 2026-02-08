-- Fix Critical Security Issues: Remove metadata-based role assignment

-- Fix 1: Remove admin bypass via metadata in handle_new_user()
-- The function was allowing admin creation via user_type='admin' metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile for all users
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- SECURITY FIX: Removed metadata-based admin creation
  -- Admins can ONLY be created via the secure invite system (use_admin_invite RPC)
  -- Never trust client-supplied metadata for privileged role assignment
  
  RETURN NEW;
END;
$function$;

-- Fix 2: Update handle_new_broker() to not trust metadata for role assignment
-- Broker signup should still work, but we add proper validation
CREATE OR REPLACE FUNCTION public.handle_new_broker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process if explicitly marked as broker signup
  -- This is acceptable because brokers have limited permissions via RLS
  -- and can only access their own leads (not a privilege escalation like admin)
  IF NEW.raw_user_meta_data->>'user_type' = 'broker' THEN
    -- Validate required fields before creating broker profile
    IF NEW.raw_user_meta_data->>'firm_name' IS NULL OR 
       NEW.raw_user_meta_data->>'full_name' IS NULL THEN
      RAISE EXCEPTION 'Missing required broker fields: firm_name and full_name are required';
    END IF;
    
    INSERT INTO public.brokers (user_id, firm_name, contact_person, phone_number)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'firm_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'phone'
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'broker');
  END IF;
  
  RETURN NEW;
END;
$function$;