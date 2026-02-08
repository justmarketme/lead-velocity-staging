import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UnreadMessage {
  lead_id: string;
  lead_name: string;
  message_count: number;
}

export const useUnreadMessages = (userRole: 'admin' | 'broker') => {
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUnreadMessages = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // For admins: get messages from brokers that admin hasn't read
      // For brokers: get messages from admins that broker hasn't read
      const targetSenderRole = userRole === 'admin' ? 'broker' : 'admin';

      const { data: conversations, error } = await supabase
        .from('lead_conversations')
        .select(`
          id,
          lead_id,
          sender_role,
          read_at,
          leads!lead_conversations_lead_id_fkey (
            first_name,
            last_name
          )
        `)
        .eq('sender_role', targetSenderRole)
        .is('read_at', null);

      if (error) {
        console.error('Error fetching unread messages:', error);
        return;
      }

      // Group by lead_id
      const grouped = (conversations || []).reduce((acc, conv) => {
        const leadId = conv.lead_id;
        if (!acc[leadId]) {
          const lead = conv.leads as { first_name: string | null; last_name: string | null } | null;
          acc[leadId] = {
            lead_id: leadId,
            lead_name: lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
            message_count: 0
          };
        }
        acc[leadId].message_count++;
        return acc;
      }, {} as Record<string, UnreadMessage>);

      const unreadList = Object.values(grouped);
      setUnreadMessages(unreadList);
      setTotalUnread(unreadList.reduce((sum, item) => sum + item.message_count, 0));
    } catch (error) {
      console.error('Error in fetchUnreadMessages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadMessages();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('unread-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_conversations'
        },
        () => {
          fetchUnreadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole]);

  return { unreadMessages, totalUnread, loading, refetch: fetchUnreadMessages };
};
