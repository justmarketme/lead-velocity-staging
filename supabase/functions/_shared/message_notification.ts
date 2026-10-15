// Tests inject synthetic records and a stub sender; no network or Deno APIs here.
export interface NotificationLead {
  id: string; broker_id: string | null; first_name: string | null; last_name: string | null; is_synthetic: boolean | null;
}
export interface NotificationBroker { email: string | null; contact_person: string | null; firm_name: string | null }
export interface StoredNotificationMessage { message: string; sender_role: string; user_id: string }
export interface NotificationDependencies {
  verifyUser(token: string): Promise<string | null>;
  isAdmin(token: string): Promise<boolean>;
  lead(token: string, id: string): Promise<NotificationLead | null>;
  broker(token: string, id: string): Promise<NotificationBroker | null>;
  message(token: string, leadId: string, userId: string, text: string): Promise<StoredNotificationMessage | null>;
  send(to: string, values: { leadName: string; message: string; senderRole: 'admin'; recipientName: string }): Promise<unknown>;
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
export function messageNotificationHandler(deps: NotificationDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ success: false, error: 'POST only' }, 405);
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    if (!token) return json({ success: false, error: 'Sign in first' }, 401);
    try {
      const userId = await deps.verifyUser(token);
      if (!userId) return json({ success: false, error: 'Invalid session' }, 401);
      // Existing UI invokes this endpoint only for admin -> broker notifications.
      if (!(await deps.isAdmin(token))) return json({ success: false, error: 'Admins only' }, 403);
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return json({ success: false, error: 'Invalid JSON' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ success: false, error: 'Invalid payload' }, 400);
      if (typeof body.leadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.leadId)
        || typeof body.message !== 'string' || !body.message.trim() || body.senderRole !== 'admin') {
        return json({ success: false, error: 'Invalid notification' }, 400);
      }
      const lead = await deps.lead(token, body.leadId);
      if (!lead) return json({ success: false, error: 'Lead not found' }, 404);
      const stored = await deps.message(token, lead.id, userId, body.message);
      if (!stored || stored.sender_role !== 'admin' || stored.user_id !== userId) {
        return json({ success: false, error: 'Save the message before notifying' }, 403);
      }
      if (!lead.broker_id) return json({ success: true, skipped: 'No assigned broker' });
      const broker = await deps.broker(token, lead.broker_id);
      if (!broker?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(broker.email)) {
        return json({ success: true, skipped: 'No broker email' });
      }
      if (lead.is_synthetic === true) return json({ success: true, dry_run: true });
      const data = await deps.send(broker.email, {
        leadName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown Lead',
        message: stored.message, senderRole: 'admin', recipientName: broker.contact_person || broker.firm_name || 'Broker',
      });
      return json({ success: true, data });
    } catch {
      return json({ success: false, error: 'Notification could not be sent' }, 500);
    }
  };
}
