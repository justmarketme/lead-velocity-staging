DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Find the user ID for howzit@leadvelocity.co.za
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'howzit@leadvelocity.co.za';

  IF v_user_id IS NOT NULL THEN
    -- Grant them the 'admin' role if they don't have it
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
