-- Undo 20261021120000_lead_optins_voice_call.sql. lead_optins is append-only, so voice_call rows can't be
-- deleted or edited: if any exist, the ADD CONSTRAINT below fails and nothing changes. Export them first and
-- remove them only by deleting their leads (POPIA erasure path), or leave this migration in place.
ALTER TABLE public.lead_optins DROP CONSTRAINT IF EXISTS lead_optins_channel_check;
ALTER TABLE public.lead_optins ADD CONSTRAINT lead_optins_channel_check CHECK (channel IN (
  'facebook_ad', 'instagram_ad', 'facebook_post', 'instagram_post', 'website', 'whatsapp_direct'
));
