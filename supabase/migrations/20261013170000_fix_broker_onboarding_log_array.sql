-- FIX for the LIVE trigger function log_broker_onboarding_change() (20261013140000, applied 13 Oct 2026).
-- It did `msgs := msgs || 'Broker saved a short bio'` on a text[]: an untyped literal next to an array is read as an ARRAY
-- literal, so Postgres raises 22P02 "malformed array literal" and the whole UPDATE on brokers rolls back. Verified live
-- 13 Oct 2026 (DO block, no writes). Effect while unfixed, for every UPDATE that:
--   - saves a bio of 40+ characters or a new headshot (portal Profile / intro card editor),
--   - sets brokers.intro_card_url (broker_approve_intro_card: Mark cannot approve his card),
--   - flips routing_on (go-live / pause).
-- The format(...) branches (FSP, WhatsApp, calendar) worked because format() returns text. Same messages, array_append.
-- Re-runnable. Undo: none needed (restoring the old body would restore the bug).
BEGIN;
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

COMMIT;
