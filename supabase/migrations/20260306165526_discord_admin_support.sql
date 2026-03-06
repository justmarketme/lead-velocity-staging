-- Transition from Telegram to Discord for Admin management
-- We keep the structure but rename or add Discord specific columns

-- Add Discord support to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS discord_user_id TEXT,
ADD COLUMN IF NOT EXISTS discord_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS discord_pairing_code TEXT;

-- Migration: If telegram columns exist, we can keep them for now but index the discord ones
CREATE INDEX IF NOT EXISTS idx_profiles_discord_user_id ON public.profiles(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_discord_pairing_code ON public.profiles(discord_pairing_code);

COMMENT ON COLUMN public.profiles.discord_user_id IS 'Stored Discord User ID linked to the admin for notifications and interactive commands.';
