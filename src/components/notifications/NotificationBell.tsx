import { Bell, Clock, AlertTriangle, Bot, MessageSquare, Settings, History } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { useAICallNotifications } from "@/hooks/use-ai-call-notifications";
import { ScrollArea } from "@/components/ui/scroll-area";
import LeadConversation from "@/components/leads/LeadConversation";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationPreferencesDialog } from "@/components/settings/NotificationPreferencesDialog";

interface NotificationBellProps {
  userRole: 'admin' | 'broker';
  onNavigateToAICalls?: () => void;
}

type NotificationTab = 'messages' | 'ai-calls';
type FilterType = 'all' | 'recent' | 'priority';

const NotificationBell = ({ userRole, onNavigateToAICalls }: NotificationBellProps) => {
  const navigate = useNavigate();
  const { unreadMessages, totalUnread, loading: messagesLoading, refetch: refetchMessages } = useUnreadMessages(userRole);
  const { notifications: aiCallNotifications, pendingCount, loading: aiLoading, refetchPreferences } = useAICallNotifications();
  
  const [selectedLead, setSelectedLead] = useState<{ id: string; name: string } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationTab>('messages');
  const [filter, setFilter] = useState<FilterType>('all');

  const totalNotifications = totalUnread + pendingCount;

  const filteredMessages = useMemo(() => {
    if (filter === 'all') {
      return unreadMessages;
    }
    if (filter === 'priority') {
      return unreadMessages.filter(msg => msg.message_count >= 3);
    }
    if (filter === 'recent') {
      return unreadMessages.slice(0, 5);
    }
    return unreadMessages;
  }, [unreadMessages, filter]);

  const handleLeadClick = (leadId: string, leadName: string) => {
    setSelectedLead({ id: leadId, name: leadName });
    setPopoverOpen(false);
    setDialogOpen(true);
  };

  const handleAICallClick = () => {
    setPopoverOpen(false);
    if (onNavigateToAICalls) {
      onNavigateToAICalls();
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedLead(null);
      refetchMessages();
    }
  };

  const getMessageFilterLabel = () => {
    if (filter === 'priority') {
      const count = filteredMessages.reduce((sum, m) => sum + m.message_count, 0);
      return count > 0 ? `${count} high-priority` : 'No high-priority';
    }
    if (filter === 'recent') {
      return `${filteredMessages.length} recent`;
    }
    return totalUnread > 0 ? `${totalUnread} unread` : 'No new messages';
  };

  const getPurposeLabel = (purpose: string) => {
    const labels: Record<string, string> = {
      appointment_scheduling: 'Schedule',
      appointment_rescheduling: 'Reschedule',
      follow_up: 'Follow-up',
      voice_note: 'Voice Note',
      reminder: 'Reminder',
      general_inquiry: 'Inquiry',
    };
    return labels[purpose] || purpose;
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {totalNotifications > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
                {totalNotifications > 99 ? '99+' : totalNotifications}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Notifications</h4>
              <NotificationPreferencesDialog 
                trigger={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Notification settings</TooltipContent>
                  </Tooltip>
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {totalNotifications} notification{totalNotifications !== 1 ? 's' : ''} requiring attention
            </p>
          </div>
          
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NotificationTab)}>
            <div className="p-2 border-b border-border">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="messages" className="text-xs gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Messages
                  {totalUnread > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {totalUnread}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="ai-calls" className="text-xs gap-1">
                  <Bot className="h-3 w-3" />
                  AI Calls
                  {pendingCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 px-1.5 animate-pulse">
                      {pendingCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="messages" className="m-0">
              <div className="p-2 border-b border-border">
                <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
                  <TabsList className="w-full grid grid-cols-3 h-8">
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                    <TabsTrigger value="recent" className="text-xs gap-1">
                      <Clock className="h-3 w-3" />
                      Recent
                    </TabsTrigger>
                    <TabsTrigger value="priority" className="text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Priority
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <ScrollArea className="max-h-64">
                {messagesLoading ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : filteredMessages.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {filter === 'priority' 
                      ? 'No high-priority messages'
                      : filter === 'recent'
                      ? 'No recent messages'
                      : 'No unread messages'}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredMessages.map((item) => (
                      <button
                        key={item.lead_id}
                        onClick={() => handleLeadClick(item.lead_id, item.lead_name)}
                        className="w-full p-4 text-left hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{item.lead_name}</span>
                          <span className={`text-xs rounded-full px-2 py-0.5 ${
                            item.message_count >= 3 
                              ? 'bg-destructive text-destructive-foreground' 
                              : 'bg-primary text-primary-foreground'
                          }`}>
                            {item.message_count}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.message_count} new message{item.message_count > 1 ? 's' : ''}
                          {item.message_count >= 3 && (
                            <span className="ml-2 text-destructive font-medium">• High priority</span>
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="ai-calls" className="m-0">
              <ScrollArea className="max-h-72">
                {aiLoading ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : aiCallNotifications.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No pending AI call approvals</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {aiCallNotifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={handleAICallClick}
                        className="w-full p-4 text-left hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-primary" />
                            <span className="font-medium">{notification.recipient_name}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {getPurposeLabel(notification.call_purpose)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Needs Approval
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              
              <div className="p-3 border-t border-border space-y-2">
                {aiCallNotifications.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleAICallClick}
                  >
                    View Pending Approvals
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-muted-foreground"
                  onClick={() => {
                    setPopoverOpen(false);
                    navigate('/notifications');
                  }}
                >
                  <History className="h-4 w-4 mr-2" />
                  View All History
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Conversation with {selectedLead?.name}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="flex-1 overflow-hidden">
              <LeadConversation 
                leadId={selectedLead.id} 
                userRole={userRole} 
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NotificationBell;
