-- Undo 20261017150000_lead_optins.sql. Drops every recorded opt-in: export first.
DROP TABLE IF EXISTS public.lead_optins;
DROP FUNCTION IF EXISTS public.lead_optins_derive_channel();
DROP FUNCTION IF EXISTS public.lead_optins_append_only();
