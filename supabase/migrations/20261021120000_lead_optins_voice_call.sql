-- lead_optins: add the 'voice_call' channel (smoke test 21 Oct 2026, issue #45).
--
-- A caller who says yes to WhatsApp on a call with Lindi (smc-voice send_whatsapp_followup) gave consent on the
-- phone, not in a WhatsApp opener, so none of the six channels fits and no lead_optins row was written: the CRM
-- showed "No opt-in recorded" for every voice lead. smc-voice now inserts one row per voice WhatsApp consent with
-- channel 'voice_call' (consent_version CONSENT-VOICE-WHATSAPP-v1, consent_text = the question Lindi asks). Until
-- this migration is applied that insert is refused by the CHECK and only logged; nothing else changes.
--
-- The channel is always set by the writer, so lead_optins_derive_channel() (which only fills a null channel) is
-- unchanged. Append-only rules, RLS and grants are unchanged.
--
-- Undo: supabase/migrations/undo/20261021120000_lead_optins_voice_call.undo.sql

ALTER TABLE public.lead_optins DROP CONSTRAINT IF EXISTS lead_optins_channel_check;
ALTER TABLE public.lead_optins ADD CONSTRAINT lead_optins_channel_check CHECK (channel IN (
  'facebook_ad', 'instagram_ad', 'facebook_post', 'instagram_post', 'website', 'whatsapp_direct', 'voice_call'
));

COMMENT ON TABLE public.lead_optins IS 'Append-only opt-in provenance: one row per consent, with where it came from. Written by n8n W03/W07 and smc-voice (voice_call).';
