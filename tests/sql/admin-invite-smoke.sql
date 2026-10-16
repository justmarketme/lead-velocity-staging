-- Production smoke test for admin invites + the admin_portal email flag. Always rolls back:
-- the block ends by raising its results, so nothing it creates survives.
-- Run: npx supabase db query --linked --project-ref cmsylaupctrbsvzrgzwy -f tests/sql/admin-invite-smoke.sql
DO $$
DECLARE
  r text := '';
  ok boolean;
  v record;
  tok_a text := encode(gen_random_bytes(32), 'hex');
  tok_b text := encode(gen_random_bytes(32), 'hex');
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  creator uuid := (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1);
BEGIN
  INSERT INTO public.admin_invites (token, email, created_by, expires_at) VALUES
    (tok_a, 'E2E-Invitee@Example.test', creator, now() + interval '7 days'),
    (tok_b, 'someone-else@example.test', creator, now() + interval '7 days');

  SELECT * INTO v FROM public.get_admin_invite_by_token(tok_a);
  r := r || 'token_lookup=' || coalesce(v.valid::text, 'null') || '/' || coalesce(v.email, 'null');
  SELECT * INTO v FROM public.get_admin_invite_by_token('not-a-real-token');
  r := r || ' | bogus_token_found=' || (v.valid IS NOT NULL);

  -- Sign-ups as GoTrue would create them (the auth trigger runs too).
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  VALUES (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e2e-invitee@example.test',
          '{"full_name":"E2E Invitee","user_type":"admin"}', '{}', now(), now(), now()),
         (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'intruder@example.test',
          '{"full_name":"Intruder","user_type":"admin"}', '{}', now(), now(), now());
  r := r || ' | metadata_user_type_admin_grants_role=' || public.has_role(user_a, 'admin');

  -- Intruder with the right token but a different email.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  ok := public.use_admin_invite(tok_a, user_b);
  r := r || ' | wrong_email=' || ok;
  -- Intruder trying to grant admin to someone else's id.
  ok := public.use_admin_invite(tok_a, user_a);
  r := r || ' | other_users_id=' || ok;
  -- No session at all.
  PERFORM set_config('request.jwt.claims', '', true);
  ok := public.use_admin_invite(tok_a, user_a);
  r := r || ' | no_session=' || ok;

  -- The real invitee, signed in as themself (email matches case-insensitively).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  ok := public.use_admin_invite(tok_a, user_a);
  r := r || ' | invitee=' || ok || ' admin=' || public.has_role(user_a, 'admin')
         || ' email_flag=' || coalesce((SELECT raw_user_meta_data->>'admin_portal' FROM auth.users WHERE id = user_a), 'none');
  ok := public.use_admin_invite(tok_a, user_a);
  r := r || ' | replay=' || ok;
  r := r || ' | intruder_admin=' || public.has_role(user_b, 'admin')
         || ' intruder_flag=' || coalesce((SELECT raw_user_meta_data->>'admin_portal' FROM auth.users WHERE id = user_b), 'none');

  -- Removing the admin role clears the email flag.
  DELETE FROM public.user_roles WHERE user_id = user_a AND role = 'admin';
  r := r || ' | flag_after_role_removed=' || coalesce((SELECT raw_user_meta_data->>'admin_portal' FROM auth.users WHERE id = user_a), 'none');

  RAISE EXCEPTION 'SMOKE_RESULT %', r;
END $$;
