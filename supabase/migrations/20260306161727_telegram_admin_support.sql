-- Add Telegram support to profiles for Admin notification and management
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS telegram_pairing_code TEXT;

-- Create an index to quickly find profile by chat_id when the bot receives a message
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id ON public.profiles(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_pairing_code ON public.profiles(telegram_pairing_code);

-- Ensure RLS allows the service role (Edge Functions) to update these columns
-- (Service role usually has bypass but good to be explicit for safety)
COMMENT ON COLUMN public.profiles.telegram_chat_id IS 'Stored Telegram Chat ID linked to the admin user for notifications and remote commands.';
