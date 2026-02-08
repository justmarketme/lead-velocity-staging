import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Conversation {
  id: string;
  lead_id: string;
  user_id: string;
  message: string;
  sender_role: "broker" | "admin";
  created_at: string;
  read_at: string | null;
  sender_name?: string;
}

interface LeadConversationProps {
  leadId: string;
  userRole: "broker" | "admin";
}

const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Converted",
  "Lost",
];

const LeadConversation = ({ leadId, userRole }: LeadConversationProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [brokerName, setBrokerName] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    fetchConversations();
    fetchLeadStatus();
    if (userRole === "admin") {
      fetchBrokerName();
    }
    markMessagesAsRead();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`lead-conversations-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_conversations",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          fetchConversations();
          markMessagesAsRead();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const fetchBrokerName = async () => {
    // Get the broker associated with this lead
    const { data: leadData } = await supabase
      .from("leads")
      .select("broker_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadData?.broker_id) {
      const { data: brokerData } = await supabase
        .from("brokers")
        .select("contact_person, firm_name")
        .eq("id", leadData.broker_id)
        .maybeSingle();

      if (brokerData) {
        setBrokerName(`${brokerData.contact_person} (${brokerData.firm_name})`);
      }
    }
  };

  const fetchLeadStatus = async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("current_status")
      .eq("id", leadId)
      .maybeSingle();

    if (!error && data) {
      setCurrentStatus(data.current_status || "New");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    const { error } = await supabase
      .from("leads")
      .update({ current_status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update lead status",
        variant: "destructive",
      });
    } else {
      setCurrentStatus(newStatus);
      toast({
        title: "Status Updated",
        description: `Lead status changed to ${newStatus}`,
      });
    }
    setIsUpdatingStatus(false);
  };

  const markMessagesAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Mark messages from the other role as read
    const targetSenderRole = userRole === 'admin' ? 'broker' : 'admin';
    
    await supabase
      .from('lead_conversations')
      .update({ read_at: new Date().toISOString(), read_by: user.id })
      .eq('lead_id', leadId)
      .eq('sender_role', targetSenderRole)
      .is('read_at', null);
  };

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from("lead_conversations")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching conversations:", error);
    } else {
      setConversations((data || []) as Conversation[]);
    }
  };

  const sendEmailNotification = async (message: string, leadName: string) => {
    try {
      // Get recipient info based on sender role
      if (userRole === 'broker') {
        // Broker sent message, notify admins
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (admins && admins.length > 0) {
          // For now, we'll skip admin emails as we don't have their emails stored
          // In production, you'd join with auth.users or a profiles table
          console.log('Admin notification would be sent here');
        }
      } else {
        // Admin sent message, notify the broker
        const { data: leadData } = await supabase
          .from('leads')
          .select('broker_id')
          .eq('id', leadId)
          .maybeSingle();

        if (leadData?.broker_id) {
          const { data: brokerData } = await supabase
            .from('brokers')
            .select('user_id, contact_person, firm_name, email')
            .eq('id', leadData.broker_id)
            .maybeSingle();

          if (brokerData?.email) {
            // Call the edge function
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              await supabase.functions.invoke('send-message-notification', {
                body: {
                  leadId,
                  leadName,
                  message,
                  senderRole: userRole,
                  recipientEmail: brokerData.email,
                  recipientName: brokerData.contact_person,
                },
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send email notification:', error);
      // Don't show error to user - notification is secondary
    }
  };

  const handleSubmit = async () => {
    if (!newMessage.trim()) return;

    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to send a message",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const messageText = newMessage.trim();
    const { error } = await supabase.from("lead_conversations").insert({
      lead_id: leadId,
      user_id: user.id,
      message: messageText,
      sender_role: userRole,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } else {
      setNewMessage("");
      toast({
        title: "Success",
        description: "Message sent",
      });
      
      // Fetch lead name for notification
      const { data: leadData } = await supabase
        .from('leads')
        .select('first_name, last_name')
        .eq('id', leadId)
        .maybeSingle();
      
      const leadName = leadData 
        ? `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() || 'Unknown Lead'
        : 'Unknown Lead';
      
      // Send email notification (non-blocking)
      sendEmailNotification(messageText, leadName);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Conversation</h3>
        </div>
        
        {userRole === "admin" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select
              value={currentStatus}
              onValueChange={handleStatusChange}
              disabled={isUpdatingStatus}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <ScrollArea className="h-[200px] w-full rounded-lg border bg-muted/30 p-4">
        {conversations.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No messages yet. Start the conversation!
          </p>
        ) : (
          <div className="space-y-3">
            {conversations.map((convo) => (
              <div
                key={convo.id}
                className={`flex flex-col ${
                  convo.sender_role === userRole ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    convo.sender_role === userRole
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  <p className="text-sm">{convo.message}</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground capitalize">
                    {convo.sender_role === "broker" && userRole === "admin" && brokerName
                      ? brokerName
                      : convo.sender_role}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(convo.created_at), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="flex gap-2">
        <Textarea
          placeholder="Type your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="min-h-[60px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !newMessage.trim()}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default LeadConversation;
