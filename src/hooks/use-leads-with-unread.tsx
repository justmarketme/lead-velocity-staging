import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useLeadsWithUnread = (userRole: 'admin' | 'broker') => {
  const [leadsWithUnread, setLeadsWithUnread] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchLeadsWithUnread = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // For admins: get leads with unread broker messages
      // For brokers: get leads with unread admin messages
      const targetSenderRole = userRole === 'admin' ? 'broker' : 'admin';

      const { data: conversations, error } = await supabase
        .from('lead_conversations')
        .select('lead_id')
        .eq('sender_role', targetSenderRole)
        .is('read_at', null);

      if (error) {
        console.error('Error fetching unread leads:', error);
        return;
      }

      const leadIds = new Set((conversations || []).map(c => c.lead_id));
      setLeadsWithUnread(leadIds);
    } catch (error) {
      console.error('Error in fetchLeadsWithUnread:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeadsWithUnread();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('unread-leads')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_conversations'
        },
        () => {
          fetchLeadsWithUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole]);

  return { leadsWithUnread, loading, refetch: fetchLeadsWithUnread };
};
