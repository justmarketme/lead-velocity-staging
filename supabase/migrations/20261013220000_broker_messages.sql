-- Broker -> Lead Velocity message box (plain form, no chat/AI). A broker sends a Question / Note / Change request /
-- Something's wrong, optionally about his intro card or an ad; admins reply. Status: sent -> seen -> answered.
-- Brokers can SELECT only their own rows; every write goes through the RPCs below (no INSERT/UPDATE policies).
CREATE TABLE IF NOT EXISTS public.broker_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id   uuid NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  topic       text NOT NULL CHECK (topic IN ('question','note','change_request','problem')),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 2000),
  item_kind   text CHECK (item_kind IN ('intro_card','ad')),
  item_id     uuid,
  status      text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','seen','answered')),
  seen_at     timestamptz,
  reply       text CHECK (reply IS NULL OR char_length(reply) BETWEEN 1 AND 4000),
  replied_at  timestamptz,
  replied_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broker_messages_broker_idx ON public.broker_messages (broker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS broker_messages_open_idx ON public.broker_messages (status) WHERE status <> 'answered';
ALTER TABLE public.broker_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_messages_own_select ON public.broker_messages;
CREATE POLICY broker_messages_own_select ON public.broker_messages FOR SELECT TO authenticated
  USING (broker_messages.broker_id IN (SELECT br.id FROM public.brokers br WHERE br.user_id = auth.uid()));
DROP POLICY IF EXISTS broker_messages_admin_select ON public.broker_messages;
CREATE POLICY broker_messages_admin_select ON public.broker_messages FOR SELECT TO authenticated
  USING (public.smc_is_admin());
REVOKE ALL ON public.broker_messages FROM anon, authenticated;
GRANT SELECT ON public.broker_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.broker_send_message(p_topic text, p_message text, p_item_kind text DEFAULT NULL, p_item_id uuid DEFAULT NULL)
RETURNS public.broker_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_msg text := btrim(coalesce(p_message, '')); v_n int; v_recent int;
  b public.brokers%ROWTYPE; m public.broker_messages%ROWTYPE; v_t text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501'; END IF;
  IF p_topic IS NULL OR p_topic NOT IN ('question','note','change_request','problem') THEN RAISE EXCEPTION 'Pick a topic.' USING ERRCODE = '22023'; END IF;
  IF char_length(v_msg) < 3 OR char_length(v_msg) > 2000 THEN RAISE EXCEPTION 'Write your message (3 to 2000 characters).' USING ERRCODE = '22023'; END IF;
  IF p_item_kind IS NOT NULL AND p_item_kind NOT IN ('intro_card','ad') THEN RAISE EXCEPTION 'Unknown item.' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_n FROM public.brokers br WHERE br.user_id = v_uid;
  IF v_n = 0 THEN RAISE EXCEPTION 'No broker profile is linked to this login.' USING ERRCODE = 'P0002';
  ELSIF v_n > 1 THEN RAISE EXCEPTION 'More than one broker profile is linked to this login; ask Lead Velocity.' USING ERRCODE = '21000'; END IF;
  SELECT * INTO b FROM public.brokers br WHERE br.user_id = v_uid;
  -- the item, if given, must be his own
  IF p_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.broker_media bm WHERE bm.id = p_item_id AND bm.broker_id = b.id) THEN
    RAISE EXCEPTION 'That item is not yours.' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO v_recent FROM public.broker_messages x WHERE x.broker_id = b.id AND x.created_at > now() - interval '1 hour';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'That is a lot of messages in an hour. We''ll get back to you on the ones already sent.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.broker_messages (broker_id, topic, body, item_kind, item_id)
  VALUES (b.id, p_topic, v_msg, p_item_kind, CASE WHEN p_item_kind IS NULL THEN NULL ELSE p_item_id END) RETURNING * INTO m;
  v_t := CASE p_topic WHEN 'question' THEN 'Question' WHEN 'note' THEN 'Note' WHEN 'change_request' THEN 'Change request' ELSE 'Something''s wrong' END;
  PERFORM public.lv_notify_emma('Broker message: ' || v_t,
    format('%s (%s) wrote to Lead Velocity in the broker portal [%s%s]: "%s". Reply from the admin dashboard, Broker messages.',
           coalesce(b.contact_person, 'A broker'), coalesce(b.firm_name, 'no practice name'), v_t,
           CASE WHEN p_item_kind IS NULL THEN '' ELSE ', about ' || replace(p_item_kind, '_', ' ') END, left(v_msg, 600)),
    'lv_broker_message');
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_message_seen(p_message_id uuid)
RETURNS public.broker_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.broker_messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.smc_is_admin() THEN RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501'; END IF;
  UPDATE public.broker_messages x SET status = 'seen', seen_at = now() WHERE x.id = p_message_id AND x.status = 'sent' RETURNING * INTO m;
  IF NOT FOUND THEN SELECT * INTO m FROM public.broker_messages x WHERE x.id = p_message_id; END IF;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Message not found.' USING ERRCODE = 'P0002'; END IF;
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reply_message(p_message_id uuid, p_reply text)
RETURNS public.broker_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r text := btrim(coalesce(p_reply, '')); m public.broker_messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.smc_is_admin() THEN RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501'; END IF;
  IF char_length(v_r) < 1 OR char_length(v_r) > 4000 THEN RAISE EXCEPTION 'Write a reply (up to 4000 characters).' USING ERRCODE = '22023'; END IF;
  UPDATE public.broker_messages x SET reply = v_r, status = 'answered', replied_at = now(), replied_by = auth.uid(), seen_at = coalesce(x.seen_at, now())
   WHERE x.id = p_message_id RETURNING * INTO m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found.' USING ERRCODE = 'P0002'; END IF;
  RETURN m;
END $$;

REVOKE ALL ON FUNCTION public.broker_send_message(text, text, text, uuid), public.admin_mark_message_seen(uuid), public.admin_reply_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_send_message(text, text, text, uuid), public.admin_mark_message_seen(uuid), public.admin_reply_message(uuid, text) TO authenticated;
