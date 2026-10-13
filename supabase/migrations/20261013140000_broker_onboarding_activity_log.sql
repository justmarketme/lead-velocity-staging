-- Log broker onboarding progress on the broker's CRM timeline (broker_activities), so admins see it without checking fields.
-- Applied to cmsylaupctrbsvzrgzwy on 13 Oct 2026 via MCP (backfill for Mark Weston done in the same apply, not repeated here).
-- The live body used `msgs || 'literal'` (22P02 malformed array literal); this file now has the array_append fix, which
-- reaches live through 20261013170000_fix_broker_onboarding_log_array.sql.
create or replace function public.log_broker_onboarding_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  msgs text[] := '{}';
  m text;
begin
  if new.fsp_number is not null and new.fsp_number is distinct from old.fsp_number then
    msgs := array_append(msgs, format('Broker saved FSP number %s (%s)', new.fsp_number, coalesce(new.firm_name, '')));
  end if;
  if new.headshot_url is not null and new.headshot_url is distinct from old.headshot_url then
    msgs := array_append(msgs, 'Broker added a headshot photo');
  end if;
  if length(coalesce(new.bio_short,'')) >= 40 and new.bio_short is distinct from old.bio_short then
    msgs := array_append(msgs, 'Broker saved a short bio');
  end if;
  if new.whatsapp_confirmed_at is not null and new.whatsapp_confirmed_at is distinct from old.whatsapp_confirmed_at then
    msgs := array_append(msgs, format('Broker confirmed business WhatsApp %s', coalesce(new.whatsapp_number, '')));
  end if;
  if new.calendar_status is distinct from old.calendar_status and new.calendar_status is not null then
    msgs := array_append(msgs, format('Outlook calendar status: %s', new.calendar_status));
  end if;
  if new.intro_card_url is not null and new.intro_card_url is distinct from old.intro_card_url then
    msgs := array_append(msgs, 'Intro card ready');
  end if;
  if new.routing_on is distinct from old.routing_on then
    msgs := array_append(msgs, case when new.routing_on then 'Lead routing switched ON' else 'Lead routing switched OFF' end);
  end if;
  foreach m in array msgs loop
    insert into public.broker_activities (broker_id, activity_type, outcome, body) values (new.id, 'onboarding', 'n/a', m);
  end loop;
  return null;
end $$;

drop trigger if exists trg_broker_onboarding_log on public.brokers;
create trigger trg_broker_onboarding_log after update on public.brokers
  for each row execute function public.log_broker_onboarding_change();

-- First portal sign-in: stamp brokers.first_login_at / last_seen_at and log it once.
create or replace function public.log_broker_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    for b in select id, first_login_at from public.brokers where user_id = new.id loop
      update public.brokers set last_seen_at = new.last_sign_in_at,
        first_login_at = coalesce(first_login_at, new.last_sign_in_at) where id = b.id;
      if b.first_login_at is null then
        insert into public.broker_activities (broker_id, activity_type, outcome, body, created_by)
        values (b.id, 'onboarding', 'n/a', 'Broker signed in to the portal for the first time', new.id);
      end if;
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists trg_broker_sign_in_log on auth.users;
create trigger trg_broker_sign_in_log after update of last_sign_in_at on auth.users
  for each row execute function public.log_broker_sign_in();
