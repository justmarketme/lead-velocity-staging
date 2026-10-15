import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { messageNotificationEmail } from "../_shared/lv_emails.ts";
import { messageNotificationHandler } from "../_shared/message_notification.ts";

const caller = (token: string) => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
});
serve(messageNotificationHandler({
  async verifyUser(token) {
    const { data, error } = await caller(token).auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  async isAdmin(token) {
    const { data, error } = await caller(token).rpc('smc_is_admin');
    return !error && data === true;
  },
  async lead(token, id) {
    const { data, error } = await caller(token).from('leads')
      .select('id, broker_id, first_name, last_name, is_synthetic').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async broker(token, id) {
    const { data, error } = await caller(token).from('brokers')
      .select('email, contact_person, firm_name').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async message(token, leadId, userId, text) {
    const { data, error } = await caller(token).from('lead_conversations')
      .select('message, sender_role, user_id').eq('lead_id', leadId).eq('user_id', userId)
      .eq('sender_role', 'admin').eq('message', text).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },
  async send(to, values) {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) throw new Error('Email unavailable');
    const mail = messageNotificationEmail(values);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: 'Lead Velocity <howzit@leadvelocity.co.za>', to: [to],
        subject: mail.subject, html: mail.html, text: mail.text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error('Email provider rejected notification');
    return { id: data.id };
  },
}));
