-- Create admin invite tokens table
CREATE TABLE public.admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  email text,
  used_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;

-- Only admins can view/create invites
CREATE POLICY "Admins can view all invites"
ON public.admin_invites
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create invites"
ON public.admin_invites
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invites"
ON public.admin_invites
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for token lookups
CREATE INDEX idx_admin_invites_token ON public.admin_invites(token);

-- Function to validate and use invite token (called during signup)
CREATE OR REPLACE FUNCTION public.validate_admin_invite(invite_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record admin_invites%ROWTYPE;
BEGIN
  SELECT * INTO invite_record
  FROM admin_invites
  WHERE token = invite_token
    AND used_at IS NULL
    AND expires_at > now();
  
  RETURN FOUND;
END;
$$;

-- Function to use invite token (mark as used and create admin role)
CREATE OR REPLACE FUNCTION public.use_admin_invite(invite_token text, new_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record admin_invites%ROWTYPE;
BEGIN
  -- Find valid invite
  SELECT * INTO invite_record
  FROM admin_invites
  WHERE token = invite_token
    AND used_at IS NULL
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Mark invite as used
  UPDATE admin_invites
  SET used_at = now()
  WHERE id = invite_record.id;
  
  -- Add admin role to user
  INSERT INTO user_roles (user_id, role)
  VALUES (new_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN TRUE;
END;
$$;