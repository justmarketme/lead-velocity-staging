-- relay_tokens: SHA-256 hashes of internal relay tokens (17 Oct 2026).
-- First use: smc-lindi-chat (n8n W07 -> ElevenLabs "Lindi SortMyCover on WhatsApp"). The token itself lives only in the
-- n8n server's .env (LINDI_RELAY_TOKEN); this table holds its hash so the edge function can check it without a new
-- Supabase secret. RLS on with no policies: only the service role (edge functions) can read it.
CREATE TABLE IF NOT EXISTS public.relay_tokens (
  name       text PRIMARY KEY,
  sha256     text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.relay_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.relay_tokens FROM anon, authenticated;
