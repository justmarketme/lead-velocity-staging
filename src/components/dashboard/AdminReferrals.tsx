import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Users, Search, Calendar as CalendarIcon, Phone, User, Loader2, Trash2, Building2, Filter, ChevronDown, Keyboard, MessageSquare, Bot, Mail } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, setHours, setMinutes } from "date-fns";
import { CommunicationPanel } from "@/components/communications/CommunicationPanel";
import { AICallDialog } from "@/components/calls/AICallDialog";
import { ReferralPipeline } from "./ReferralPipeline";
import { LayoutGrid, List } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Referral {
  id: string;
  first_name: string;
  phone_number: string;
  email?: string | null;
  will_status: string | null;
  broker_appointment_scheduled: boolean | null;
  appointment_date: string | null;
  created_at: string | null;
  parent_lead_id: string;
  lead?: {
    first_name: string | null;
    last_name: string | null;
    broker_id: string | null;
    brokers?: {
      firm_name: string;
      contact_person: string;
      email: string | null;
    } | null;
  } | null;
}

const timeSlots = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

const willStatusOptions = ["Pending", "In Progress", "Completed"];

const AdminReferrals = () => {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [appointmentFilter, setAppointmentFilter] = useState<string>("all");
  const [editingReferral, setEditingReferral] = useState<string | null>(null);
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(undefined);
  const [appointmentTime, setAppointmentTime] = useState("09:00");
  const [dialerOpen, setDialerOpen] = useState(false);
  const [dialerNumber, setDialerNumber] = useState("");
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
  const [commPanelOpen, setCommPanelOpen] = useState(false);
  const [aiCallDialogOpen, setAiCallDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "pipeline">("pipeline");

  useEffect(() => {
    fetchReferrals();
  }, []);

  const fetchReferrals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("referrals")
        .select(`
          *,
          lead:leads!parent_lead_id(
            first_name,
            last_name,
            broker_id,
            brokers(firm_name, contact_person, email)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setReferrals(data || []);
    } catch (error: any) {
      console.error("Error fetching referrals:", error);
      toast({
        title: "Error",
        description: "Failed to load referrals",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case "Completed":
        return "default";
      case "In Progress":
        return "secondary";
      case "Pending":
        return "outline";
      default:
        return "outline";
    }
  };

  const updateWillStatus = async (referralId: string, newStatus: string) => {
    const referral = referrals.find(r => r.id === referralId);
    if (!referral) return;

    const currentReason = referral.will_status?.includes('|')
      ? referral.will_status.split('|')[0]
      : 'estate_planning';

    const fullStatus = `${currentReason}|${newStatus}`;

    const { error } = await supabase
      .from("referrals")
      .update({ will_status: fullStatus })
      .eq("id", referralId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Status updated",
      });

      // Special handling for completion notification
      if (newStatus === "Completed") {
        const referral = referrals.find(r => r.id === referralId);
        if (referral) {
          console.log("Triggering completion notification for:", referral.first_name);
          supabase.functions.invoke('send-referral-success', {
            body: {
              referralName: referral.first_name,
              brokerEmail: referral.lead?.brokers?.email,
              brokerName: referral.lead?.brokers?.contact_person || 'Assigned Broker',
              brokerFirm: referral.lead?.brokers?.firm_name || 'Partner Firm',
              leadName: `${referral.lead?.first_name || ''} ${referral.lead?.last_name || ''}`.trim() || 'Origin Client',
            }
          }).then(async ({ error: funcError }) => {
            if (funcError) console.error("Notification trigger failed:", funcError);
            else {
              console.log("Success notification sent to broker and admin.");
              // Log the communication
              await supabase.from('communications').insert({
                referral_id: referralId,
                channel: 'email',
                direction: 'outbound',
                sender_type: 'system',
                recipient_type: 'broker',
                recipient_contact: referral.lead?.brokers?.email || 'admin@leadvelocity.co.za',
                subject: `Referral Converted: ${referral.first_name}`,
                content: `Automated success notification sent to ${referral.lead?.brokers?.contact_person} and admin.`,
                status: 'sent'
              });
            }
          });
        }
      }

      // Special handling for Welcome notification
      if (newStatus === "In Progress") {
        if (referral && referral.email) {
          console.log("Triggering welcome notification for:", referral.first_name);
          supabase.functions.invoke('send-referral-welcome', {
            body: {
              referralName: referral.first_name,
              referralEmail: referral.email,
              referralReason: currentReason,
              originClientName: `${referral.lead?.first_name || ''} ${referral.lead?.last_name || ''}`.trim() || 'Origin Client',
              brokerName: referral.lead?.brokers?.contact_person || 'Assigned Broker',
              brokerFirm: referral.lead?.brokers?.firm_name || 'Partner Firm',
            }
          }).then(async ({ error: funcError }) => {
            if (funcError) console.error("Welcome email failed:", funcError);
            else {
              console.log("Welcome email sent to referral.");
              // Log the communication
              await supabase.from('communications').insert({
                referral_id: referralId,
                channel: 'email',
                direction: 'outbound',
                sender_type: 'system',
                recipient_type: 'referral',
                recipient_contact: referral.email,
                subject: "Welcome to Lead Velocity",
                content: "Automated welcome email sent following client referral.",
                status: 'sent'
              });
            }
          });
        }
      }

      fetchReferrals();
    }
  };

  const scheduleAppointment = async (referralId: string) => {
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
      fetchReferrals();
    }
  };

  const cancelAppointment = async (referralId: string) => {
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
      fetchReferrals();
    }
  };

  const filteredReferrals = referrals.filter((referral) => {
    const searchLower = searchQuery.toLowerCase();
    const leadName = `${referral.lead?.first_name || ""} ${referral.lead?.last_name || ""}`.toLowerCase();
    const brokerName = referral.lead?.brokers?.firm_name?.toLowerCase() || "";

    const matchesSearch =
      referral.first_name.toLowerCase().includes(searchLower) ||
      referral.phone_number.includes(searchQuery) ||
      (referral.email && referral.email.toLowerCase().includes(searchLower)) ||
      leadName.includes(searchLower) ||
      brokerName.includes(searchLower);

    const matchesStatus = statusFilter === "all" || referral.will_status === statusFilter;

    const matchesAppointment =
      appointmentFilter === "all" ||
      (appointmentFilter === "scheduled" && referral.broker_appointment_scheduled) ||
      (appointmentFilter === "not_scheduled" && !referral.broker_appointment_scheduled);

    return matchesSearch && matchesStatus && matchesAppointment;
  });

  const stats = {
    total: referrals.length,
    pending: referrals.filter((r) => r.will_status === "Pending" || !r.will_status).length,
    inProgress: referrals.filter((r) => r.will_status === "In Progress").length,
    completed: referrals.filter((r) => r.will_status === "Completed").length,
    scheduled: referrals.filter((r) => r.broker_appointment_scheduled).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Referral Pipeline</h1>
          <p className="text-muted-foreground">Track and convert referrals from your AI campaigns</p>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="hidden sm:block">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="pipeline" className="gap-2">
              <LayoutGrid className="h-4 w-4" /> Pipeline
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-2">
              <List className="h-4 w-4" /> Table
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <div className="h-2 w-2 rounded-full bg-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <div className="h-2 w-2 rounded-full bg-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <div className="h-2 w-2 rounded-full bg-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduled}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, lead, or broker..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Will Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={appointmentFilter} onValueChange={setAppointmentFilter}>
            <SelectTrigger className="w-44">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Appointment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Appointments</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="not_scheduled">Not Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pipeline or Table View */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredReferrals.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed border-border/50">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-20" />
          <h3 className="text-lg font-semibold mb-2">No referrals found</h3>
          <p className="text-muted-foreground">
            {searchQuery || statusFilter !== "all" || appointmentFilter !== "all"
              ? "Try adjusting your filters"
              : "Referrals from AI campaigns will appear here"}
          </p>
        </div>
      ) : viewMode === "pipeline" ? (
        <ReferralPipeline
          referrals={filteredReferrals}
          onUpdateStatus={updateWillStatus}
          onViewDetails={(ref) => {
            setSelectedReferral(ref);
            setCommPanelOpen(true);
          }}
          onAICall={(ref) => {
            setSelectedReferral(ref);
            setAiCallDialogOpen(true);
          }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referral</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Parent Lead</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Will Status</TableHead>
                  <TableHead>Appointment</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReferrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {referral.first_name}
                        </div>
                        {referral.email && (
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-6">
                            <Mail className="h-3 w-3" />
                            {referral.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {referral.phone_number}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {referral.lead
                        ? `${referral.lead.first_name || ""} ${referral.lead.last_name || ""}`.trim() || "N/A"
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {referral.lead?.brokers ? (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-xs">{referral.lead.brokers.firm_name}</p>
                            <p className="text-[10px] text-muted-foreground">{referral.lead.brokers.contact_person}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={(referral.will_status?.includes('|') ? referral.will_status.split('|')[1] : referral.will_status) || "Pending"}
                        onValueChange={(value) => updateWillStatus(referral.id, value)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
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
                          <Badge className="bg-purple-500 text-[9px] py-0 h-4">
                            {format(new Date(referral.appointment_date), "MMM d, h:mm a")}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => cancelAppointment(referral.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">Not scheduled</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[10px]">
                      {referral.created_at
                        ? format(new Date(referral.created_at), "MMM d, yyyy")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Message Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setSelectedReferral(referral);
                            setCommPanelOpen(true);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 text-blue-500" />
                        </Button>

                        {/* Call Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Phone className="h-4 w-4 text-green-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => window.open(`tel:${referral.phone_number}`, '_self')}>
                              <User className="h-4 w-4 mr-2" />
                              Call Referral ({referral.phone_number})
                            </DropdownMenuItem>
                            {referral.lead?.brokers && (
                              <DropdownMenuItem onClick={() => {
                                toast({
                                  title: "Broker Contact",
                                  description: `Contact ${referral.lead?.brokers?.firm_name} - ${referral.lead?.brokers?.contact_person}`,
                                });
                              }}>
                                <Building2 className="h-4 w-4 mr-2" />
                                Call Broker ({referral.lead.brokers.contact_person})
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => {
                              setSelectedReferral(referral);
                              setAiCallDialogOpen(true);
                            }}>
                              <Bot className="h-4 w-4 mr-2" />
                              AI Agent Call
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDialerOpen(true)}>
                              <Keyboard className="h-4 w-4 mr-2" />
                              Manual Dialer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

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
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <CalendarIcon className="h-4 w-4 text-amber-500" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-4" align="end">
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>Date</Label>
                                <Calendar
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
                                  onClick={() => scheduleAppointment(referral.id)}
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {/* Manual Dialer Dialog */}
      <Dialog open={dialerOpen} onOpenChange={setDialerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manual Dialer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone-number-referral">Enter Phone Number</Label>
              <Input
                id="phone-number-referral"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={dialerNumber}
                onChange={(e) => setDialerNumber(e.target.value)}
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <Button
                  key={digit}
                  variant="outline"
                  size="lg"
                  className="h-12 text-lg font-semibold"
                  onClick={() => setDialerNumber(prev => prev + digit)}
                >
                  {digit}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDialerNumber(prev => prev.slice(0, -1))}
              >
                ← Delete
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => {
                  if (dialerNumber) {
                    window.open(`tel:${dialerNumber}`, '_self');
                    setDialerOpen(false);
                    setDialerNumber("");
                  }
                }}
                disabled={!dialerNumber}
              >
                <Phone className="h-4 w-4" />
                Call
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Communication Panel Dialog */}
      <Dialog open={commPanelOpen} onOpenChange={setCommPanelOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Contact {selectedReferral?.first_name}
            </DialogTitle>
          </DialogHeader>
          {selectedReferral && (
            <div className="flex-1 overflow-hidden">
              <CommunicationPanel
                recipientType="referral"
                recipientId={selectedReferral.id}
                recipientContact={{
                  phone: selectedReferral.phone_number,
                  name: selectedReferral.first_name
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Call Dialog */}
      {selectedReferral && (
        <AICallDialog
          open={aiCallDialogOpen}
          onOpenChange={setAiCallDialogOpen}
          recipientType="referral"
          recipientId={selectedReferral.id}
          recipientName={selectedReferral.first_name}
          recipientPhone={selectedReferral.phone_number}
          brokerName={selectedReferral.lead?.brokers?.contact_person}
          brokerPhone={undefined}
        />
      )}
    </div>
  );
};

export default AdminReferrals;
