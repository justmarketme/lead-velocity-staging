DROP FUNCTION IF EXISTS public.broker_send_message(text, text, text, uuid);
DROP FUNCTION IF EXISTS public.admin_mark_message_seen(uuid);
DROP FUNCTION IF EXISTS public.admin_reply_message(uuid, text);
DROP TABLE IF EXISTS public.broker_messages;
