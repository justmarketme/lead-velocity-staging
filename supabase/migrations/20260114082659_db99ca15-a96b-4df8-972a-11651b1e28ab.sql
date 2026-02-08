-- Update the handle_new_broker function to also store the email
CREATE OR REPLACE FUNCTION public.handle_new_broker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process if explicitly marked as broker signup
  IF NEW.raw_user_meta_data->>'user_type' = 'broker' THEN
    -- Validate required fields before creating broker profile
    IF NEW.raw_user_meta_data->>'firm_name' IS NULL OR 
       NEW.raw_user_meta_data->>'full_name' IS NULL THEN
      RAISE EXCEPTION 'Missing required broker fields: firm_name and full_name are required';
    END IF;
    
    INSERT INTO public.brokers (user_id, firm_name, contact_person, phone_number, email)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'firm_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'phone',
      COALESCE(NEW.raw_user_meta_data->>'broker_email', NEW.email)
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'broker');
  END IF;
  
  RETURN NEW;
END;
$function$;