import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, Search, Eye, MessageSquare, CalendarIcon, X, Phone, Mail, MessageCircle, Send, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LeadConversation from "@/components/leads/LeadConversation";
import AddReferralDialog from "@/components/leads/AddReferralDialog";
import ScheduleAppointmentDialog from "@/components/leads/ScheduleAppointmentDialog";
import { useLeadsWithUnread } from "@/hooks/use-leads-with-unread";
import { format, formatDistanceToNow, isWithinInterval, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { UnifiedCommunicationHub } from "@/components/communications/UnifiedCommunicationHub";
import { AICallDialog } from "@/components/calls/AICallDialog";
import { BulkCommunicationDialog } from "@/components/leads/BulkCommunicationDialog";
import { Checkbox } from "@/components/ui/checkbox";

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string;
  source: string | null;
  current_status: string | null;
  date_uploaded: string | null;
  notes: string | null;
}

interface Referral {
  id: string;
  first_name: string;
  phone_number: string;
  email?: string | null;
  will_status: string | null;
  appointment_date: string | null;
  broker_appointment_scheduled: boolean;
  created_at: string;
}

interface CommunicationCounts {
  [leadId: string]: {
    calls: number;
    emails: number;
    sms: number;
    whatsapp: number;
    lastContact: string | null;
    lastChannel: string | null;
  };
}

type StatusFilter = 'all' | 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Converted' | 'Lost';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Leads' },
  { value: 'New', label: 'New' },
  { value: 'Contacted', label: 'Contacted' },
  { value: 'Qualified', label: 'Qualified' },
  { value: 'Proposal', label: 'Proposal' },
  { value: 'Negotiation', label: 'Negotiation' },
  { value: 'Converted', label: 'Converted' },
  { value: 'Lost', label: 'Lost' },
];

const BrokerLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiCallDialogOpen, setAiCallDialogOpen] = useState(false);
  const [selectedReferralForCall, setSelectedReferralForCall] = useState<Referral | null>(null);
  const [quickCallLead, setQuickCallLead] = useState<Lead | null>(null);
  const [communicationCounts, setCommunicationCounts] = useState<CommunicationCounts>({});
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { leadsWithUnread } = useLeadsWithUnread('broker');

  // Memoized filtered leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Status filter
      if (statusFilter !== 'all' && lead.current_status !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
          `${lead.first_name} ${lead.last_name}`.toLowerCase().includes(searchLower) ||
          lead.email.toLowerCase().includes(searchLower) ||
          lead.phone.includes(searchTerm);
        if (!matchesSearch) return false;
      }

      // Date range filter
      if (startDate || endDate) {
        if (!lead.date_uploaded) return false;
        const leadDate = new Date(lead.date_uploaded);

        if (startDate && endDate) {
          if (!isWithinInterval(leadDate, {
            start: startOfDay(startDate),
            end: endOfDay(endDate)
          })) {
            return false;
          }
        } else if (startDate) {
          if (leadDate < startOfDay(startDate)) return false;
        } else if (endDate) {
          if (leadDate > endOfDay(endDate)) return false;
        }
      }

      return true;
    });
  }, [leads, statusFilter, searchTerm, startDate, endDate]);

  // Count leads per status for badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length };
    leads.forEach((lead) => {
      const status = lead.current_status || 'New';
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [leads]);

  const clearDateFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const setDatePreset = (preset: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'last30') => {
    const today = new Date();
    switch (preset) {
      case 'today':
        setStartDate(startOfDay(today));
        setEndDate(endOfDay(today));
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        setStartDate(startOfDay(yesterday));
        setEndDate(endOfDay(yesterday));
        break;
      case 'thisWeek':
        setStartDate(startOfWeek(today, { weekStartsOn: 1 }));
        setEndDate(endOfWeek(today, { weekStartsOn: 1 }));
        break;
      case 'lastWeek':
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        const lastWeekEnd = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        setStartDate(lastWeekStart);
        setEndDate(lastWeekEnd);
        break;
      case 'thisMonth':
        setStartDate(startOfMonth(today));
        setEndDate(endOfMonth(today));
        break;
      case 'last30':
        setStartDate(subDays(today, 30));
        setEndDate(today);
        break;
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      // Verify broker role
      const { data: hasRole } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'broker'
      });

      if (!hasRole) {
        navigate("/login");
        return;
      }

      const { data: broker } = await supabase
        .from("brokers")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (broker) {
        setBrokerId(broker.id);
        fetchLeads(broker.id);
      }
    };
    checkAuth();
  }, [navigate]);

  const fetchLeads = async (brokerId: string) => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("broker_id", brokerId)
      .order("date_uploaded", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch leads",
        variant: "destructive",
      });
    } else {
      setLeads(data || []);
      // Fetch communication counts for all leads
      if (data && data.length > 0) {
        fetchCommunicationCounts(data.map(l => l.id));
      }
    }
  };

  const fetchCommunicationCounts = async (leadIds: string[]) => {
    const { data, error } = await supabase
      .from("communications")
      .select("lead_id, channel, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch communication counts:", error);
      return;
    }

    const counts: CommunicationCounts = {};
    leadIds.forEach(id => {
      counts[id] = { calls: 0, emails: 0, sms: 0, whatsapp: 0, lastContact: null, lastChannel: null };
    });

    data?.forEach(comm => {
      if (comm.lead_id && counts[comm.lead_id]) {
        // Track last contact (first entry since sorted desc)
        if (!counts[comm.lead_id].lastContact) {
          counts[comm.lead_id].lastContact = comm.created_at;
          counts[comm.lead_id].lastChannel = comm.channel;
        }

        switch (comm.channel) {
          case 'call':
            counts[comm.lead_id].calls++;
            break;
          case 'email':
            counts[comm.lead_id].emails++;
            break;
          case 'sms':
            counts[comm.lead_id].sms++;
            break;
          case 'whatsapp':
            counts[comm.lead_id].whatsapp++;
            break;
        }
      }
    });

    setCommunicationCounts(counts);
  };

  const fetchReferrals = async (leadId: string) => {
    const { data, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("parent_lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch referrals",
        variant: "destructive",
      });
    } else {
      setReferrals(data || []);
    }
  };

  const handleViewLead = async (lead: Lead) => {
    setSelectedLead(lead);
    await fetchReferrals(lead.id);
    setDialogOpen(true);
  };

  const getStatusColor = (status: string | null) => {
    const colors: Record<string, string> = {
      "New": "bg-blue-500",
      "Contacted": "bg-yellow-500",
      "Qualified": "bg-cyan-500",
      "Proposal": "bg-orange-500",
      "Negotiation": "bg-purple-500",
      "Converted": "bg-green-500",
      "Lost": "bg-red-500",
    };
    return colors[status || ""] || "bg-gray-500";
  };

  const handleCallReferral = (referral: Referral) => {
    setSelectedReferralForCall(referral);
    setAiCallDialogOpen(true);
  };

  const handleQuickCall = (lead: Lead) => {
    setQuickCallLead(lead);
    setAiCallDialogOpen(true);
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const selectedLeadsData = filteredLeads.filter(l => selectedLeadIds.has(l.id));

  const handleBulkSuccess = () => {
    setSelectedLeadIds(new Set());
    if (brokerId) {
      fetchCommunicationCounts(leads.map(l => l.id));
    }
  };

  return (
    <BrokerLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold gradient-text">My Leads</h1>
            <p className="text-muted-foreground mt-2">
              Manage and track your lead portfolio
            </p>
          </div>
          <Button onClick={() => navigate("/broker/upload")}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Leads
          </Button>
        </div>

        {/* Status Filter Tabs */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            {STATUS_OPTIONS.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="flex-1 min-w-[80px] text-xs sm:text-sm"
              >
                {option.label}
                {statusCounts[option.value] !== undefined && (
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                    {statusCounts[option.value] || 0}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card className="border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex items-center space-x-2 flex-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
              </div>

              {/* Date Range Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearDateFilters}
                    className="h-9 w-9"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Quick Date Presets */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground self-center mr-1">Quick:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('today')}
                className="h-7 text-xs"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('yesterday')}
                className="h-7 text-xs"
              >
                Yesterday
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('thisWeek')}
                className="h-7 text-xs"
              >
                This Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('lastWeek')}
                className="h-7 text-xs"
              >
                Last Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('thisMonth')}
                className="h-7 text-xs"
              >
                This Month
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset('last30')}
                className="h-7 text-xs"
              >
                Last 30 Days
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''} found
              {(startDate || endDate) && (
                <span className="ml-2">
                  • Filtered by date
                  {startDate && ` from ${format(startDate, "MMM d")}`}
                  {endDate && ` to ${format(endDate, "MMM d")}`}
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent>
            {/* Bulk Actions Bar */}
            {selectedLeadIds.size > 0 && (
              <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {selectedLeadIds.size} lead{selectedLeadIds.size > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setBulkDialogOpen(true)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Send Message
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedLeadIds(new Set())}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filteredLeads.length > 0 && selectedLeadIds.size === filteredLeads.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Communication</TableHead>
                  <TableHead>Last Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={cn(
                      leadsWithUnread.has(lead.id) ? "bg-primary/10 border-l-4 border-l-primary" : "",
                      selectedLeadIds.has(lead.id) ? "bg-muted/50" : ""
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedLeadIds.has(lead.id)}
                        onCheckedChange={() => toggleLeadSelection(lead.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {leadsWithUnread.has(lead.id) && (
                          <MessageSquare className="h-4 w-4 text-primary animate-pulse" />
                        )}
                        {lead.first_name} {lead.last_name}
                      </div>
                    </TableCell>
                    <TableCell>{lead.email}</TableCell>
                    <TableCell>{lead.phone}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 text-xs" title="Calls">
                          <Phone className="h-3 w-3 text-green-500" />
                          <span className="text-muted-foreground">{communicationCounts[lead.id]?.calls || 0}</span>
                        </div>
                        <div className="flex items-center gap-0.5 text-xs" title="Emails">
                          <Mail className="h-3 w-3 text-blue-500" />
                          <span className="text-muted-foreground">{communicationCounts[lead.id]?.emails || 0}</span>
                        </div>
                        <div className="flex items-center gap-0.5 text-xs" title="SMS">
                          <MessageCircle className="h-3 w-3 text-purple-500" />
                          <span className="text-muted-foreground">{communicationCounts[lead.id]?.sms || 0}</span>
                        </div>
                        <div className="flex items-center gap-0.5 text-xs" title="WhatsApp">
                          <MessageSquare className="h-3 w-3 text-emerald-500" />
                          <span className="text-muted-foreground">{communicationCounts[lead.id]?.whatsapp || 0}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const lastContact = communicationCounts[lead.id]?.lastContact;
                        const lastChannel = communicationCounts[lead.id]?.lastChannel;
                        if (!lastContact) {
                          return <Badge variant="outline" className="text-muted-foreground">No contact</Badge>;
                        }
                        const daysSince = differenceInDays(new Date(), new Date(lastContact));
                        const badgeColor = daysSince <= 3
                          ? "bg-green-500/10 text-green-600 border-green-500/30"
                          : daysSince <= 7
                            ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                            : "bg-red-500/10 text-red-600 border-red-500/30";
                        const channelIcon = lastChannel === 'call' ? '📞' : lastChannel === 'email' ? '📧' : lastChannel === 'sms' ? '💬' : '📱';
                        return (
                          <Badge variant="outline" className={cn("text-xs", badgeColor)}>
                            {channelIcon} {formatDistanceToNow(new Date(lastContact), { addSuffix: true })}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>{lead.source || "N/A"}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(lead.current_status)}>
                        {lead.current_status || "New"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.date_uploaded
                        ? new Date(lead.date_uploaded).toLocaleDateString()
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleQuickCall(lead)}
                          title="Quick Call"
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewLead(lead)}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Lead Details</DialogTitle>
            </DialogHeader>
            {selectedLead && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{selectedLead.first_name} {selectedLead.last_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedLead.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedLead.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={getStatusColor(selectedLead.current_status)}>
                      {selectedLead.current_status || "New"}
                    </Badge>
                  </div>
                </div>

                {selectedLead.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Notes</p>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm">{selectedLead.notes}</p>
                    </div>
                  </div>
                )}

                {/* Communication Hub */}
                <UnifiedCommunicationHub
                  recipientType="lead"
                  recipientId={selectedLead.id}
                  recipientContact={{
                    email: selectedLead.email,
                    phone: selectedLead.phone,
                    name: `${selectedLead.first_name || ""} ${selectedLead.last_name || ""}`.trim(),
                  }}
                />

                <LeadConversation leadId={selectedLead.id} userRole="broker" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Referrals Generated</h3>
                    <AddReferralDialog
                      leadId={selectedLead.id}
                      leadName={`${selectedLead.first_name || ""} ${selectedLead.last_name || ""}`.trim()}
                      onReferralAdded={() => fetchReferrals(selectedLead.id)}
                    />
                  </div>
                  {referrals.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No referrals yet. Add a client referral above.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone / Email</TableHead>
                          <TableHead>Will Status</TableHead>
                          <TableHead>Appointment</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {referrals.map((referral) => (
                          <TableRow key={referral.id}>
                            <TableCell className="font-medium">{referral.first_name}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-mono">{referral.phone_number}</span>
                                {referral.email && <span className="text-[10px] text-muted-foreground">{referral.email}</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={(referral.will_status?.includes('|') ? referral.will_status.split('|')[1] : referral.will_status) === "Done" ? "bg-green-500" : "bg-yellow-500"}>
                                {(referral.will_status?.includes('|') ? referral.will_status.split('|')[1] : referral.will_status) || "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {referral.broker_appointment_scheduled && referral.appointment_date ? (
                                <div className="space-y-1">
                                  <Badge className="bg-purple-500">Scheduled</Badge>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(referral.appointment_date), "MMM d, yyyy 'at' h:mm a")}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">Not scheduled</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCallReferral(referral)}
                                >
                                  <Phone className="h-4 w-4" />
                                </Button>
                                <ScheduleAppointmentDialog
                                  referralId={referral.id}
                                  referralName={referral.first_name}
                                  currentAppointment={referral.appointment_date}
                                  onAppointmentScheduled={() => fetchReferrals(selectedLead.id)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* AI Call Dialog for Lead (from detail view) */}
        {selectedLead && !quickCallLead && (
          <AICallDialog
            open={aiCallDialogOpen && !selectedReferralForCall && !quickCallLead}
            onOpenChange={(open) => {
              setAiCallDialogOpen(open);
              if (!open) setSelectedReferralForCall(null);
            }}
            recipientType="lead"
            recipientId={selectedLead.id}
            recipientName={`${selectedLead.first_name || ""} ${selectedLead.last_name || ""}`.trim()}
            recipientPhone={selectedLead.phone}
          />
        )}

        {/* AI Call Dialog for Quick Call from table */}
        {quickCallLead && (
          <AICallDialog
            open={aiCallDialogOpen && !!quickCallLead}
            onOpenChange={(open) => {
              setAiCallDialogOpen(open);
              if (!open) setQuickCallLead(null);
            }}
            recipientType="lead"
            recipientId={quickCallLead.id}
            recipientName={`${quickCallLead.first_name || ""} ${quickCallLead.last_name || ""}`.trim()}
            recipientPhone={quickCallLead.phone}
          />
        )}

        {/* AI Call Dialog for Referral */}
        {selectedReferralForCall && (
          <AICallDialog
            open={aiCallDialogOpen && !!selectedReferralForCall}
            onOpenChange={(open) => {
              setAiCallDialogOpen(open);
              if (!open) setSelectedReferralForCall(null);
            }}
            recipientType="referral"
            recipientId={selectedReferralForCall.id}
            recipientName={selectedReferralForCall.first_name}
            recipientPhone={selectedReferralForCall.phone_number}
          />
        )}

        {/* Bulk Communication Dialog */}
        <BulkCommunicationDialog
          open={bulkDialogOpen}
          onOpenChange={setBulkDialogOpen}
          selectedLeads={selectedLeadsData}
          onSuccess={handleBulkSuccess}
        />
      </div>
    </BrokerLayout>
  );
};

export default BrokerLeads;
