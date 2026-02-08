import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2, Eye, MessageSquare, Users, Calendar, Edit2, Phone, Bot } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import LeadConversation from "@/components/leads/LeadConversation";
import { UnifiedCommunicationHub } from "@/components/communications/UnifiedCommunicationHub";
import { AICallDialog } from "@/components/calls/AICallDialog";
import { useLeadsWithUnread } from "@/hooks/use-leads-with-unread";
import { format, setHours, setMinutes } from "date-fns";
import { cn } from "@/lib/utils";
interface Broker {
  id: string;
  firm_name: string;
  contact_person: string;
}

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string;
  source: string | null;
  current_status: string | null;
  broker_id: string | null;
  created_at: string;
  notes: string | null;
  brokers?: Broker | null;
}

interface Referral {
  id: string;
  first_name: string;
  phone_number: string;
  will_status: string | null;
  appointment_date: string | null;
  broker_appointment_scheduled: boolean;
  created_at: string;
  parent_lead_id: string;
}

const timeSlots = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

const willStatusOptions = ["Pending", "In Progress", "Completed"];

const LeadsTable = () => {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiCallDialogOpen, setAiCallDialogOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [editingReferral, setEditingReferral] = useState<string | null>(null);
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(undefined);
  const [appointmentTime, setAppointmentTime] = useState("09:00");
  const { toast } = useToast();
  const { leadsWithUnread } = useLeadsWithUnread('admin');

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
        },
        () => {
          fetchLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let filtered = leads;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (lead) =>
          `${lead.first_name} ${lead.last_name}`.toLowerCase().includes(searchLower) ||
          lead.email.toLowerCase().includes(searchLower) ||
          lead.phone.includes(searchTerm) ||
          lead.brokers?.firm_name?.toLowerCase().includes(searchLower) ||
          lead.source?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredLeads(filtered);
  }, [searchTerm, leads]);

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*, brokers(id, firm_name, contact_person)")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch leads",
        variant: "destructive",
      });
    } else {
      setLeads(data || []);
    }
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

  const deleteLead = async (id: string) => {
    const { error } = await supabase.from("leads").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete lead",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Lead deleted successfully",
      });
    }
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

  const getReferralStatusColor = (status: string | null) => {
    if (status === "Completed") return "bg-green-500";
    if (status === "In Progress") return "bg-yellow-500";
    return "bg-gray-500";
  };

  const updateReferralWillStatus = async (referralId: string, newStatus: string) => {
    const { error } = await supabase
      .from("referrals")
      .update({ will_status: newStatus })
      .eq("id", referralId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update will status",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Will status updated",
      });
      if (selectedLead) {
        fetchReferrals(selectedLead.id);
      }
    }
  };

  const scheduleReferralAppointment = async (referralId: string) => {
    if (!appointmentDate) {
      toast({
        title: "Error",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }

    const [hours, minutes] = appointmentTime.split(":").map(Number);
    const appointmentDateTime = setMinutes(setHours(appointmentDate, hours), minutes);

    const { error } = await supabase
      .from("referrals")
      .update({
        appointment_date: appointmentDateTime.toISOString(),
        broker_appointment_scheduled: true,
      })
      .eq("id", referralId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to schedule appointment",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Appointment scheduled for ${format(appointmentDateTime, "MMM d, yyyy 'at' h:mm a")}`,
      });
      setEditingReferral(null);
      setAppointmentDate(undefined);
      setAppointmentTime("09:00");
      if (selectedLead) {
        fetchReferrals(selectedLead.id);
      }
    }
  };

  const cancelReferralAppointment = async (referralId: string) => {
    const { error } = await supabase
      .from("referrals")
      .update({
        appointment_date: null,
        broker_appointment_scheduled: false,
      })
      .eq("id", referralId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to cancel appointment",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Appointment cancelled",
      });
      if (selectedLead) {
        fetchReferrals(selectedLead.id);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold gradient-text">Lead Database</h1>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search leads by name, email, phone, or broker..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email/Phone</TableHead>
              <TableHead>Broker</TableHead>
              <TableHead>Campaign / Batch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.map((lead) => (
              <TableRow
                key={lead.id}
                className={leadsWithUnread.has(lead.id) ? "bg-primary/10 border-l-4 border-l-primary" : ""}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {leadsWithUnread.has(lead.id) && (
                      <MessageSquare className="h-4 w-4 text-primary animate-pulse" />
                    )}
                    {lead.first_name} {lead.last_name}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs space-y-1">
                    <p>{lead.email}</p>
                    <p className="text-muted-foreground">{lead.phone}</p>
                  </div>
                </TableCell>
                <TableCell>
                  {lead.brokers ? (
                    <div className="text-sm">
                      <p className="font-medium">{lead.brokers.firm_name}</p>
                      <p className="text-muted-foreground text-xs">{lead.brokers.contact_person}</p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  {lead.source?.includes('|') ? (
                    <div className="text-xs space-y-1">
                      <Badge variant="outline" className="text-[10px] uppercase bg-primary/5">{lead.source.split('|')[0].replace('_', ' ')}</Badge>
                      <p className="text-muted-foreground italic font-mono opacity-70">{lead.source.split('|')[1]}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{lead.source || "Organic"}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(lead.current_status)}>
                    {lead.current_status || "New"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {new Date(lead.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewLead(lead)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteLead(lead.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details & Conversation</DialogTitle>
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

              {/* AI Call Button - Only for AI agent calls */}
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAiCallDialogOpen(true)}
                >
                  <Bot className="h-4 w-4" />
                  AI Agent Call
                </Button>
                <span className="text-xs text-muted-foreground">
                  Use the Communication Hub below for all other communications
                </span>
              </div>

              {selectedLead.brokers && (
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="text-sm text-muted-foreground mb-1">Assigned Broker</p>
                  <p className="font-medium">{selectedLead.brokers.firm_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedLead.brokers.contact_person}</p>
                </div>
              )}

              {selectedLead.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notes</p>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm">{selectedLead.notes}</p>
                  </div>
                </div>
              )}

              <UnifiedCommunicationHub
                recipientType="lead"
                recipientId={selectedLead.id}
                recipientContact={{
                  email: selectedLead.email,
                  phone: selectedLead.phone,
                  name: `${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim(),
                }}
              />

              <LeadConversation leadId={selectedLead.id} userRole="admin" />
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Client Referrals</h3>
                  <Badge variant="secondary">{referrals.length}</Badge>
                </div>

                {referrals.length === 0 ? (
                  <p className="text-muted-foreground text-sm p-4 bg-muted/30 rounded-lg">
                    No referrals from this client yet
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Will Status</TableHead>
                          <TableHead>Appointment</TableHead>
                          <TableHead>Added</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {referrals.map((referral) => (
                          <TableRow key={referral.id}>
                            <TableCell className="font-medium">{referral.first_name}</TableCell>
                            <TableCell>{referral.phone_number}</TableCell>
                            <TableCell>
                              <Select
                                value={referral.will_status || "Pending"}
                                onValueChange={(value) => updateReferralWillStatus(referral.id, value)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {willStatusOptions.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {status}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {referral.broker_appointment_scheduled && referral.appointment_date ? (
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-purple-500">
                                    {format(new Date(referral.appointment_date), "MMM d, h:mm a")}
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => cancelReferralAppointment(referral.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">Not scheduled</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(referral.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Popover
                                open={editingReferral === referral.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    setEditingReferral(referral.id);
                                    if (referral.appointment_date) {
                                      setAppointmentDate(new Date(referral.appointment_date));
                                      setAppointmentTime(format(new Date(referral.appointment_date), "HH:mm"));
                                    }
                                  } else {
                                    setEditingReferral(null);
                                    setAppointmentDate(undefined);
                                    setAppointmentTime("09:00");
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Calendar className="h-4 w-4 mr-1" />
                                    {referral.broker_appointment_scheduled ? "Reschedule" : "Schedule"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-4" align="end">
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label>Date</Label>
                                      <CalendarComponent
                                        mode="single"
                                        selected={appointmentDate}
                                        onSelect={setAppointmentDate}
                                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                        initialFocus
                                        className="pointer-events-auto"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Time</Label>
                                      <Select value={appointmentTime} onValueChange={setAppointmentTime}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {timeSlots.map((time) => (
                                            <SelectItem key={time} value={time}>
                                              {format(setMinutes(setHours(new Date(), parseInt(time.split(":")[0])), parseInt(time.split(":")[1])), "h:mm a")}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => scheduleReferralAppointment(referral.id)}
                                        disabled={!appointmentDate}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingReferral(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {selectedLead.brokers && referrals.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    These referrals are linked to broker: {selectedLead.brokers.firm_name} ({selectedLead.brokers.contact_person})
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Call Dialog */}
      {selectedLead && (
        <AICallDialog
          open={aiCallDialogOpen}
          onOpenChange={setAiCallDialogOpen}
          recipientType="lead"
          recipientId={selectedLead.id}
          recipientName={`${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim() || 'Unknown'}
          recipientPhone={selectedLead.phone}
          brokerName={selectedLead.brokers?.contact_person}
          brokerPhone={undefined}
        />
      )}
    </div>
  );
};

export default LeadsTable;