import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, differenceInHours, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  Users,
  Phone,
  FileCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Building,
  Calendar as CalendarIcon,
  MessageSquare,
  ArrowRight,
  Loader2,
  RefreshCw,
  GripVertical,
  Filter,
  X,
  Sparkles,
  TrendingUp,
  Mail,
  ChevronDown,
  Search,
  Bot,
  Activity,
  Zap,
  LayoutGrid,
  List,
} from "lucide-react";
import CallCommandCenter from "./CallCommandCenter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { formatPhoneNumber } from "@/lib/format-phone";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Broker {
  id: string;
  firm_name: string;
  contact_person: string;
}

// Broker-focused pipeline stages with refined colors using design tokens
const PIPELINE_STAGES = [
  {
    id: "New",
    label: "New Leads",
    shortLabel: "New",
    description: "Awaiting initial contact",
    icon: Sparkles,
    gradient: "from-blue-500 to-cyan-400",
    bgGlow: "shadow-blue-500/20",
    badgeBg: "bg-blue-500/10",
    badgeText: "text-blue-400",
    badgeBorder: "border-blue-500/30",
    dropBg: "bg-blue-500/5",
  },
  {
    id: "Contacted",
    label: "Contacted",
    shortLabel: "Contacted",
    description: "Awaiting response",
    icon: Phone,
    gradient: "from-violet-500 to-purple-400",
    bgGlow: "shadow-violet-500/20",
    badgeBg: "bg-violet-500/10",
    badgeText: "text-violet-400",
    badgeBorder: "border-violet-500/30",
    dropBg: "bg-violet-500/5",
  },
  {
    id: "Appointment Booked",
    label: "Appointment Booked",
    shortLabel: "Booked",
    description: "Consultation scheduled",
    icon: CalendarIcon,
    gradient: "from-amber-500 to-orange-400",
    bgGlow: "shadow-amber-500/20",
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-400",
    badgeBorder: "border-amber-500/30",
    dropBg: "bg-amber-500/5",
  },
  {
    id: "Will Done",
    label: "Will Completed",
    shortLabel: "Complete",
    description: "Documentation done",
    icon: FileCheck,
    gradient: "from-emerald-500 to-green-400",
    bgGlow: "shadow-emerald-500/20",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-400",
    badgeBorder: "border-emerald-500/30",
    dropBg: "bg-emerald-500/5",
  },
  {
    id: "Follow-up",
    label: "Follow-up Required",
    shortLabel: "Follow-up",
    description: "After-sales care",
    icon: MessageSquare,
    gradient: "from-cyan-500 to-teal-400",
    bgGlow: "shadow-cyan-500/20",
    badgeBg: "bg-cyan-500/10",
    badgeText: "text-cyan-400",
    badgeBorder: "border-cyan-500/30",
    dropBg: "bg-cyan-500/5",
  },
  {
    id: "Rejected",
    label: "Closed/Rejected",
    shortLabel: "Closed",
    description: "Lead closed",
    icon: CheckCircle2,
    gradient: "from-slate-500 to-gray-400",
    bgGlow: "shadow-slate-500/20",
    badgeBg: "bg-slate-500/10",
    badgeText: "text-slate-400",
    badgeBorder: "border-slate-500/30",
    dropBg: "bg-slate-500/5",
  },
];

// Bottleneck thresholds
const BOTTLENECK_HOURS = {
  "New": 48,
  "Contacted": 72,
  "Appointment Booked": 168,
  "Will Done": 336,
  "Follow-up": 168,
};

const COUNT_WARNING_THRESHOLD = 10;

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string;
  current_status: string | null;
  broker_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  notes: string | null;
  source: string | null;
  broker?: {
    firm_name: string;
    contact_person: string;
  } | null;
  active_ai_call?: {
    id: string;
    call_status: string;
    call_summary?: string;
  };
}

interface LeadActivity {
  id: string;
  activity_type: string;
  notes: string | null;
  created_at: string | null;
}

const WorkflowManagement = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [actionNotes, setActionNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
  const [activeAiCalls, setActiveAiCalls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Initial fetch of active AI calls
    const fetchActiveAiCalls = async () => {
      const { data } = await supabase
        .from("ai_call_requests")
        .select("recipient_phone")
        .eq("call_status", "in_progress");
      
      const callMap: Record<string, boolean> = {};
      data?.forEach(call => {
        callMap[call.recipient_phone] = true;
      });
      setActiveAiCalls(callMap);
    };

    fetchActiveAiCalls();

    // Listen for AI call updates
    const channel = supabase
      .channel("ai-call-pulse")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_call_requests" }, (payload) => {
        const phone = (payload.new as any)?.recipient_phone || (payload.old as any)?.recipient_phone;
        const status = (payload.new as any)?.call_status;
        
        if (phone) {
          setActiveAiCalls(prev => ({
            ...prev,
            [phone]: status === "in_progress"
          }));
        }
      })
      .subscribe();

    // Listen for lead updates to sync broker mapping
    const leadUpdateChannel = supabase
      .channel("workflow-leads-update")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(leadUpdateChannel);
    };
  }, []);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Filter states
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

  useEffect(() => {
    fetchLeads();
    fetchBrokers();
  }, []);

  const fetchBrokers = async () => {
    try {
      const { data, error } = await supabase
        .from("brokers")
        .select("id, firm_name, contact_person")
        .order("firm_name");

      if (error) throw error;
      setBrokers(data || []);
    } catch (error) {
      console.error("Error fetching brokers:", error);
    }
  };

  // --- Resizable Columns & Boards State ---
  const [boardWidths, setBoardWidths] = useState<Record<string, number>>({
    "New": 360,
    "Contacted": 340,
    "Appointment Booked": 340,
    "Will Done": 340,
    "Follow-up": 340,
    "Rejected": 340,
  });

  const [tableColWidths, setTableColWidths] = useState<Record<string, number>>({
    "lead": 250,
    "status": 180,
    "contact": 220,
    "broker": 180,
    "campaign": 160,
    "age": 100,
    "actions": 80,
  });

  const resizingRef = useRef<{ id: string; type: "board" | "table"; startX: number; startWidth: number } | null>(null);

  const startResizing = (id: string, type: "board" | "table", e: React.MouseEvent) => {
    e.preventDefault();
    const startWidth = type === "board" ? boardWidths[id] : tableColWidths[id];
    resizingRef.current = { id, type, startX: e.clientX, startWidth };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
    document.body.style.cursor = "col-resize";
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { id, type, startX, startWidth } = resizingRef.current;
    const delta = e.clientX - startX;
    const newWidth = Math.max(type === "board" ? 150 : 60, startWidth + delta);

    if (type === "board") {
      setBoardWidths(prev => ({ ...prev, [id]: newWidth }));
    } else {
      setTableColWidths(prev => ({ ...prev, [id]: newWidth }));
    }
  };

  const stopResizing = () => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", stopResizing);
    document.body.style.cursor = "";
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      // Fetch leads with broker info
      const { data: leadsData, error: leadsError } = await supabase
        .from("leads")
        .select(`
          *,
          broker:brokers(firm_name, contact_person)
        `)
        .order("updated_at", { ascending: false });

      if (leadsError) throw leadsError;

      // Fetch most recent AI call for each lead
      const { data: callsData, error: callsError } = await supabase
        .from("ai_call_requests")
        .select("id, recipient_id, call_status, call_summary")
        .order("created_at", { ascending: false });

      if (callsError) throw callsError;

      // Map calls to leads (only take most recent call for each lead)
      const callMap: Record<string, any> = {};
      callsData?.forEach(call => {
        if (!callMap[call.recipient_id]) {
          callMap[call.recipient_id] = call;
        }
      });

      const leadsWithCalls = leadsData.map(lead => ({
        ...lead,
        active_ai_call: callMap[lead.id] || null
      }));

      // Inject Demo Roleplay Lead for Admin/Testing
      const demoLead: Lead = {
        id: "demo-roleplay-lead-id",
        first_name: "Demo",
        last_name: "Roleplay (Test)",
        email: "demo@leadvelocity.ai",
        phone: "072 5548057",
        current_status: "New",
        broker_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: "This is a persistent demo lead for AI roleplay testing.",
        source: "Demo/Roleplay",
      };

      setLeads([demoLead, ...leadsWithCalls]);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Lead changes subscription
    const leadChannel = supabase
      .channel("workflow-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();

    // Call updates subscription
    const callChannel = supabase
      .channel("workflow-calls")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_call_requests" }, () => fetchLeads())
      .subscribe();

    return () => {
      supabase.removeChannel(leadChannel);
      supabase.removeChannel(callChannel);
    };
  }, []);

  const fetchLeadActivities = async (leadId: string) => {
    setLoadingActivities(true);
    try {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setLoadingActivities(false);
    }
  };

  // Filter leads based on selected filters
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const fullName = `${lead.first_name || ""} ${lead.last_name || ""}`.toLowerCase();
        const email = lead.email.toLowerCase();
        const phone = lead.phone.toLowerCase().replace(/\D/g, '');
        const queryDigits = query.replace(/\D/g, '');

        const matchesName = fullName.includes(query);
        const matchesEmail = email.includes(query);
        const matchesPhone = queryDigits && phone.includes(queryDigits);

        if (!matchesName && !matchesEmail && !matchesPhone) {
          return false;
        }
      }

      if (selectedBrokerId !== "all" && lead.broker_id !== selectedBrokerId) {
        return false;
      }

      if (selectedCampaign !== "all" && lead.source !== selectedCampaign) {
        return false;
      }

      // Status filter
      if (selectedStatus !== "all") {
        const leadStatus = lead.current_status || "New";
        if (leadStatus !== selectedStatus) {
          return false;
        }
      }

      const leadDate = lead.created_at ? new Date(lead.created_at) : null;

      if (dateFrom && leadDate) {
        if (isBefore(leadDate, startOfDay(dateFrom))) {
          return false;
        }
      }

      if (dateTo && leadDate) {
        if (isAfter(leadDate, endOfDay(dateTo))) {
          return false;
        }
      }

      return true;
    });
  }, [leads, searchQuery, selectedBrokerId, selectedStatus, dateFrom, dateTo]);

  const hasActiveFilters = searchQuery.trim() || selectedBrokerId !== "all" || selectedStatus !== "all" || dateFrom || dateTo;
  const activeFilterCount = [
    searchQuery.trim(),
    selectedBrokerId !== "all",
    selectedStatus !== "all",
    dateFrom,
    dateTo
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedBrokerId("all");
    setSelectedStatus("all");
    setSelectedCampaign("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // Group leads by status
  const leadsByStage = useMemo(() => {
    const grouped: Record<string, Lead[]> = {};
    PIPELINE_STAGES.forEach((stage) => {
      grouped[stage.id] = [];
    });

    filteredLeads.forEach((lead) => {
      const status = lead.current_status || "New";
      if (grouped[status]) {
        grouped[status].push(lead);
      } else {
        grouped["New"].push(lead);
      }
    });

    return grouped;
  }, [filteredLeads]);

  // Calculate bottlenecks
  const bottlenecks = useMemo(() => {
    const issues: { stageId: string; type: "time" | "count"; count: number; message: string }[] = [];

    PIPELINE_STAGES.forEach((stage) => {
      const stageLeads = leadsByStage[stage.id] || [];

      if (stageLeads.length > COUNT_WARNING_THRESHOLD) {
        issues.push({
          stageId: stage.id,
          type: "count",
          count: stageLeads.length,
          message: `${stageLeads.length} leads piling up`,
        });
      }

      const threshold = BOTTLENECK_HOURS[stage.id as keyof typeof BOTTLENECK_HOURS];
      if (threshold) {
        const stuckLeads = stageLeads.filter((lead) => {
          const lastUpdate = lead.updated_at ? new Date(lead.updated_at) : new Date(lead.created_at || "");
          const hoursSinceUpdate = differenceInHours(new Date(), lastUpdate);
          return hoursSinceUpdate > threshold;
        });

        if (stuckLeads.length > 0) {
          issues.push({
            stageId: stage.id,
            type: "time",
            count: stuckLeads.length,
            message: `${stuckLeads.length} stuck`,
          });
        }
      }
    });

    return issues;
  }, [leadsByStage]);

  const getLeadAge = (lead: Lead) => {
    const createdDate = lead.updated_at ? new Date(lead.updated_at) : new Date(lead.created_at || "");
    const days = differenceInDays(new Date(), createdDate);
    if (days === 0) return "Today";
    if (days === 1) return "1d ago";
    return `${days}d ago`;
  };

  const isLeadStuck = (lead: Lead, stageId: string) => {
    const threshold = BOTTLENECK_HOURS[stageId as keyof typeof BOTTLENECK_HOURS];
    if (!threshold) return false;

    const lastUpdate = lead.updated_at ? new Date(lead.updated_at) : new Date(lead.created_at || "");
    const hoursSinceUpdate = differenceInHours(new Date(), lastUpdate);
    return hoursSinceUpdate > threshold;
  };

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setNewStatus(lead.current_status || "New");
    setActionNotes("");
    setActionDialogOpen(true);
    fetchLeadActivities(lead.id);
  };

  const getNextStages = (currentStatus: string) => {
    const currentIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStatus);
    return PIPELINE_STAGES.filter((_, index) => index !== currentIndex);
  };

  const updateLeadStatus = async (lead: Lead, newStatusValue: string, notes?: string) => {
    try {
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          current_status: newStatusValue,
          updated_at: new Date().toISOString(),
          notes: notes ? `${lead.notes || ""}\n\n[${format(new Date(), "MMM d, yyyy h:mm a")}] Status changed to ${newStatusValue}: ${notes}` : lead.notes,
        })
        .eq("id", lead.id);

      if (updateError) throw updateError;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("lead_activities").insert({
          lead_id: lead.id,
          agent_id: user.id,
          activity_type: `Status changed to ${newStatusValue}`,
          notes: notes || null,
        });
      }

      return true;
    } catch (error) {
      console.error("Error updating lead:", error);
      return false;
    }
  };

  const handleMoveToStage = async () => {
    if (!selectedLead || !newStatus) return;

    setSaving(true);
    const success = await updateLeadStatus(selectedLead, newStatus, actionNotes);

    if (success) {
      toast.success(`Lead moved to "${PIPELINE_STAGES.find((s) => s.id === newStatus)?.label}"`);
      setActionDialogOpen(false);
      fetchLeads();
    } else {
      toast.error("Failed to update lead");
    }
    setSaving(false);
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newStageId = destination.droppableId;
    const oldStageId = source.droppableId;

    const draggedLead = leads.find((lead) => lead.id === draggableId);
    if (!draggedLead) return;

    if (newStageId === oldStageId) return;

    setLeads((prevLeads) =>
      prevLeads.map((lead) =>
        lead.id === draggableId
          ? { ...lead, current_status: newStageId, updated_at: new Date().toISOString() }
          : lead
      )
    );

    const success = await updateLeadStatus(draggedLead, newStageId);

    if (success) {
      const stageName = PIPELINE_STAGES.find((s) => s.id === newStageId)?.label;
      toast.success(`Lead moved to "${stageName}"`);
    } else {
      setLeads((prevLeads) =>
        prevLeads.map((lead) =>
          lead.id === draggableId
            ? { ...lead, current_status: oldStageId }
            : lead
        )
      );
      toast.error("Failed to move lead");
    }
  };

  const getStageBottleneck = (stageId: string) => {
    return bottlenecks.filter((b) => b.stageId === stageId);
  };

  const totalBottlenecks = bottlenecks.length;

  // Stats
  const totalLeads = filteredLeads.length;
  const completedLeads = leadsByStage["Will Done"]?.length || 0;
  const activeLeads = totalLeads - (leadsByStage["Rejected"]?.length || 0);

  const getLeadInitials = (lead: Lead) => {
    if (lead.first_name && lead.last_name) {
      return `${lead.first_name[0]}${lead.last_name[0]}`.toUpperCase();
    }
    if (lead.first_name) return lead.first_name[0].toUpperCase();
    if (lead.email) return lead.email[0].toUpperCase();
    return "?";
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 p-1">
        {/* Header Section */}
        <div className="relative">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-transparent rounded-2xl -z-10" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 lg:p-6">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/25">
                  <Activity className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                    Workflow Management
                  </h1>
                  <p className="text-muted-foreground text-sm lg:text-base">
                    Track and manage your lead pipeline
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="flex items-center gap-6 px-4 py-2.5 rounded-xl bg-card/50 border border-border/50 backdrop-blur-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-default">
                      <div className="p-1.5 rounded-lg bg-blue-500/10">
                        <Users className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-semibold">{totalLeads}</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Total leads in pipeline</TooltipContent>
                </Tooltip>

                <Separator orientation="vertical" className="h-8" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-default">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Active</p>
                        <p className="text-lg font-semibold">{activeLeads}</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Active leads (not closed)</TooltipContent>
                </Tooltip>

                <Separator orientation="vertical" className="h-8" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-default">
                      <div className="p-1.5 rounded-lg bg-amber-500/10">
                        <Zap className="h-4 w-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Done</p>
                        <p className="text-lg font-semibold">{completedLeads}</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Wills completed</TooltipContent>
                </Tooltip>
              </div>

              {/* Active Campaign Controls */}
              {selectedCampaign !== "all" && filteredLeads.some(l => l.current_status === "New") && (
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 animate-pulse-subtle">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-primary tracking-wider">Ready to Process</span>
                    <span className="text-xs text-muted-foreground">{filteredLeads.filter(l => l.current_status === "New").length} Clients in Queue</span>
                  </div>
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={async () => {
                      const newLeads = filteredLeads.filter(l => l.current_status === "New" && l.broker_id);
                      if (newLeads.length === 0) {
                        toast.error("No 'New' leads with assigned brokers found in this campaign.");
                        return;
                      }

                      toast.promise(
                        Promise.all(newLeads.map(async (lead) => {
                          // Trigger AI Call via create-ayanda-call (Conversational)
                          return supabase.functions.invoke('create-ayanda-call', {
                            body: {
                              leadId: lead.id,
                              brokerId: lead.broker_id,
                              isRoleplay: lead.id === "demo-roleplay-lead-id"
                            }
                          });
                        })),
                        {
                          loading: `Initiating ${newLeads.length} Conversational AI calls...`,
                          success: 'Campaign launched! Ayanda is now calling leads.',
                          error: 'Failed to launch full batch. Check credentials.',
                        }
                      );
                    }}
                  >
                    <Bot className="h-4 w-4 mr-2" /> Launch Ayanda Agent
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                {/* View Toggle */}
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "table")} className="hidden sm:block">
                  <TabsList className="h-9 p-1">
                    <TabsTrigger value="grid" className="h-7 px-2.5 gap-1.5">
                      <LayoutGrid className="h-4 w-4" />
                      <span className="hidden lg:inline">Pipeline</span>
                    </TabsTrigger>
                    <TabsTrigger value="table" className="h-7 px-2.5 gap-1.5">
                      <List className="h-4 w-4" />
                      <span className="hidden lg:inline">Table</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-lg shadow-primary/10 h-8 text-[11px] font-bold"
                    onClick={() => setIsCommandCenterOpen(true)}
                  >
                    <Bot className="h-3.5 w-3.5 mr-1.5" />
                    Command Center
                  </Button>
                  <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading} className="h-8 w-8 p-0">
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/50 border-border/50"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="flex-shrink-0">
            <div className="flex items-center gap-3">
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-2 transition-all",
                    hasActiveFilters && "border-primary/50 bg-primary/5"
                  )}
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-primary text-primary-foreground">
                      {activeFilterCount}
                    </Badge>
                  )}
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform",
                    filtersOpen && "rotate-180"
                  )} />
                </Button>
              </CollapsibleTrigger>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-muted-foreground hover:text-foreground h-8 px-2"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}

              {hasActiveFilters && (
                <span className="text-sm text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{filteredLeads.length}</span> of {leads.length} leads
                </span>
              )}
            </div>

            <CollapsibleContent className="mt-3">
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="flex flex-wrap gap-4">
                    {/* Broker Filter */}
                    <div className="space-y-1.5 min-w-[200px]">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Broker</Label>
                      <Select value={selectedBrokerId} onValueChange={setSelectedBrokerId}>
                        <SelectTrigger className="bg-background/50">
                          <SelectValue placeholder="All Brokers" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Brokers</SelectItem>
                          {brokers.map((broker) => (
                            <SelectItem key={broker.id} value={broker.id}>
                              {broker.firm_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-1.5 min-w-[180px]">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Status</Label>
                      <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger className="bg-background/50">
                          <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          {PIPELINE_STAGES.map((stage) => {
                            const StageIcon = stage.icon;
                            return (
                              <SelectItem key={stage.id} value={stage.id}>
                                <div className="flex items-center gap-2">
                                  <div className={cn("p-1 rounded", stage.badgeBg)}>
                                    <StageIcon className={cn("h-3 w-3", stage.badgeText)} />
                                  </div>
                                  {stage.shortLabel}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Campaign Filter */}
                    <div className="space-y-1.5 min-w-[200px]">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Campaign / Batch</Label>
                      <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                        <SelectTrigger className="bg-background/50">
                          <SelectValue placeholder="All Campaigns" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Campaigns</SelectItem>
                          {Array.from(new Set(leads.map(l => l.source).filter(Boolean))).map((source) => (
                            <SelectItem key={source} value={source!}>
                              {source?.includes('|') ? source.split('|')[0].replace('_', ' ') : source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date From */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">From</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-[160px] justify-start text-left font-normal bg-background/50",
                              !dateFrom && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateFrom}
                            onSelect={setDateFrom}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Date To */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">To</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-[160px] justify-start text-left font-normal bg-background/50",
                              !dateTo && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateTo}
                            onSelect={setDateTo}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Bottleneck Alert */}
        {totalBottlenecks > 0 && (
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/20 to-transparent rounded-full blur-2xl" />
            <CardContent className="p-4 relative">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-200 mb-2">
                    {totalBottlenecks} bottleneck{totalBottlenecks > 1 ? "s" : ""} detected
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {bottlenecks.map((bottleneck, index) => {
                      const stage = PIPELINE_STAGES.find((s) => s.id === bottleneck.stageId);
                      return (
                        <Badge
                          key={index}
                          variant="outline"
                          className="bg-background/50 border-amber-500/30 text-amber-300"
                        >
                          {bottleneck.type === "time" ? <Clock className="h-3 w-3 mr-1" /> : <Users className="h-3 w-3 mr-1" />}
                          {stage?.shortLabel}: {bottleneck.message}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pipeline Grid View */}
        {viewMode === "grid" && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex flex-row overflow-x-auto gap-4 pb-4 min-h-[calc(100vh-280px)] items-start scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
              {PIPELINE_STAGES.map((stage, idx) => {
                const stageLeads = leadsByStage[stage.id] || [];
                const stageBottlenecks = getStageBottleneck(stage.id);
                const hasBottleneck = stageBottlenecks.length > 0;
                const Icon = stage.icon;
                const width = boardWidths[stage.id] || 300;

                return (
                  <div key={stage.id} className="flex shrink-0 relative group/board">
                    <div
                      style={{ width: `${width}px` }}
                      className={cn(
                        "flex flex-col rounded-xl border border-border/50 bg-card/20 backdrop-blur-md overflow-hidden transition-all duration-300",
                        hasBottleneck && "ring-1 ring-amber-500/50 border-amber-500/30"
                      )}
                    >
                      {/* Column Header - Premium */}
                      <div className="p-4 border-b border-border/50 bg-card/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg shrink-0",
                              stage.gradient,
                              stage.bgGlow
                            )}>
                              <Icon className="h-5 w-5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-sm tracking-tight whitespace-normal break-words">{stage.label}</h3>
                              <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block opacity-80">{stage.description}</p>
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "font-black tabular-nums text-xs px-2 h-6 shrink-0",
                              stage.badgeBg,
                              stage.badgeText,
                              stage.badgeBorder,
                              "border shadow-sm"
                            )}
                          >
                            {stageLeads.length}
                          </Badge>
                        </div>

                        {hasBottleneck && (
                          <Badge
                            variant="outline"
                            className="mt-3 text-xs bg-amber-500/10 text-amber-400 border-amber-500/20 w-full justify-center py-1.5 font-medium"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                            {stageBottlenecks[0]?.message}
                          </Badge>
                        )}
                      </div>

                      {/* Column Content */}
                      <Droppable droppableId={stage.id}>
                        {(provided, snapshot) => (
                          <ScrollArea className="flex-1 h-[calc(100vh-320px)] min-h-[500px]">
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={cn(
                                "min-h-[300px] xl:min-h-[400px] p-2.5 transition-colors",
                                snapshot.isDraggingOver && stage.dropBg
                              )}
                            >
                              {loading ? (
                                <div className="space-y-2">
                                  {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                                  ))}
                                </div>
                              ) : stageLeads.length === 0 ? (
                                <div className={cn(
                                  "h-full flex flex-col items-center justify-center text-muted-foreground text-sm p-6 min-h-[150px] rounded-xl border-2 border-dashed border-border/30",
                                  snapshot.isDraggingOver && "border-primary/50 bg-primary/5"
                                )}>
                                  {snapshot.isDraggingOver ? (
                                    <>
                                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                        <ArrowRight className="h-5 w-5 text-primary" />
                                      </div>
                                      <span className="text-primary text-xs font-bold uppercase tracking-widest">Drop here</span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="h-10 w-10 rounded-full bg-muted/20 flex items-center justify-center mb-3">
                                        <Icon className="h-5 w-5 opacity-50" />
                                      </div>
                                      <span className="text-xs font-medium uppercase tracking-widest opacity-40">No leads</span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {stageLeads.map((lead, index) => {
                                    const stuck = isLeadStuck(lead, stage.id);
                                    return (
                                      <Draggable
                                        key={lead.id}
                                        draggableId={lead.id}
                                        index={index}
                                      >
                                        {(provided, snapshot) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className={cn(
                                              "group p-3 rounded-xl border transition-all duration-200 cursor-pointer relative",
                                              snapshot.isDragging
                                                ? "shadow-2xl ring-2 ring-primary bg-card border-primary/50 scale-[1.02]"
                                                : "border-border/40 bg-card/60 hover:bg-card hover:border-border hover:shadow-xl",
                                              stuck && "border-amber-500/40 bg-amber-500/[0.03]"
                                            )}
                                            onClick={() => handleLeadClick(lead)}
                                          >
                                            <div className="flex items-start gap-3">
                                              <div
                                                {...provided.dragHandleProps}
                                                className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <GripVertical className="h-4 w-4" />
                                              </div>

                                              <Avatar className="h-10 w-10 shrink-0 border border-border/50">
                                                <AvatarFallback className={cn(
                                                  "text-xs font-bold bg-gradient-to-br text-white",
                                                  stage.gradient
                                                )}>
                                                  {getLeadInitials(lead)}
                                                </AvatarFallback>
                                              </Avatar>

                                              <div className="flex-1 min-w-0 space-y-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <p className="font-bold text-sm leading-tight whitespace-normal break-words">
                                                        {lead.first_name || lead.last_name
                                                          ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                                                          : lead.email.split("@")[0]}
                                                      </p>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-[200px]">
                                                      <p className="font-bold text-sm">
                                                        {lead.first_name || lead.last_name
                                                          ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                                                          : lead.email}
                                                      </p>
                                                    </TooltipContent>
                                                  </Tooltip>

                                                  {/* AI Call Indicator */}
                                                  {(lead.active_ai_call || activeAiCalls[lead.phone]) && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <div className={cn(
                                                          "p-1.5 rounded-lg",
                                                          (activeAiCalls[lead.phone] || lead.active_ai_call?.call_status === 'in_progress') ? "bg-blue-500/10 animate-pulse border border-blue-500/20" :
                                                            lead.active_ai_call?.call_status === 'completed' ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
                                                        )}>
                                                          <Bot className={cn(
                                                            "h-3.5 w-3.5",
                                                            (activeAiCalls[lead.phone] || lead.active_ai_call?.call_status === 'in_progress') ? "text-blue-500" :
                                                              lead.active_ai_call?.call_status === 'completed' ? "text-green-500" : "text-red-500"
                                                          )} />
                                                        </div>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="right">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider">
                                                          AI AGENT: {(activeAiCalls[lead.phone] || lead.active_ai_call?.call_status === 'in_progress') ? "In Progress" : lead.active_ai_call?.call_status}
                                                        </p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                </div>

                                                <div className="space-y-0.5">
                                                  <p className="text-xs text-muted-foreground whitespace-normal break-all opacity-80 leading-relaxed truncate">{lead.email}</p>
                                                  <p className="text-xs font-mono text-muted-foreground/70">{formatPhoneNumber(lead.phone)}</p>
                                                </div>

                                                {lead.broker && (
                                                  <div className="flex items-center gap-2 pt-0.5">
                                                    <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                                      <Building className="h-3 w-3 text-primary" />
                                                    </div>
                                                    <span className="text-[11px] font-semibold text-primary/90 truncate">{lead.broker.firm_name}</span>
                                                  </div>
                                                )}

                                                {lead.source && (
                                                  <div className="pt-1">
                                                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-auto bg-muted/40 border-border/50 text-muted-foreground/80 font-medium">
                                                      {lead.source.includes('|') ? lead.source.split('|')[0] : lead.source}
                                                    </Badge>
                                                  </div>
                                                )}

                                                <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-border/30">
                                                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                                                    <Clock className="h-4 w-4" />
                                                    {getLeadAge(lead)}
                                                  </div>

                                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-green-500/10 text-green-500/70 hover:text-green-500">
                                                      <Phone className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-blue-500/10 text-blue-500/70 hover:text-blue-500">
                                                      <Mail className="h-4 w-4" />
                                                    </Button>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </Draggable>
                                    );
                                  })}
                                </div>
                              )}
                              {provided.placeholder}
                            </div>
                          </ScrollArea>
                        )}
                      </Droppable>
                    </div>

                    {/* Resize Handle - More Visible & Professional */}
                    {idx < PIPELINE_STAGES.length - 1 && (
                      <div
                        onMouseDown={(e) => startResizing(stage.id, "board", e)}
                        className="absolute -right-3 top-0 bottom-0 w-2.5 cursor-col-resize z-20 group/handle flex items-center justify-center"
                      >
                        <div className="h-full w-[1px] bg-border/40 group-hover/handle:bg-primary/40 transition-colors" />
                        <div className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-1 px-1 py-3 rounded-full bg-background border border-border shadow-xl group-hover/handle:border-primary group-hover/handle:bg-primary transition-all scale-75 opacity-20 group-hover/handle:opacity-100 group-hover/handle:scale-100">
                          <div className="w-1 h-0.5 rounded-full bg-muted-foreground group-hover/handle:bg-white" />
                          <div className="w-1 h-0.5 rounded-full bg-muted-foreground group-hover/handle:bg-white" />
                          <div className="w-1 h-0.5 rounded-full bg-muted-foreground group-hover/handle:bg-white" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}

        {/* Table View */}
        {viewMode === "table" && (
          <Card className="border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">No leads found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead style={{ width: `${tableColWidths.lead}px` }} className="relative group/th">
                          Lead
                          <div onMouseDown={(e) => startResizing("lead", "table", e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-20 group-hover/th:opacity-100 bg-primary/30 hover:bg-primary transition-all" />
                        </TableHead>
                        <TableHead style={{ width: `${tableColWidths.status}px` }} className="relative group/th">
                          Status
                          <div onMouseDown={(e) => startResizing("status", "table", e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 bg-primary/30" />
                        </TableHead>
                        <TableHead style={{ width: `${tableColWidths.contact}px` }} className="relative group/th">
                          Email/Phone
                          <div onMouseDown={(e) => startResizing("contact", "table", e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 bg-primary/30" />
                        </TableHead>
                        <TableHead style={{ width: `${tableColWidths.broker}px` }} className="hidden xl:table-cell relative group/th">
                          Broker
                          <div onMouseDown={(e) => startResizing("broker", "table", e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 bg-primary/30" />
                        </TableHead>
                        <TableHead style={{ width: `${tableColWidths.campaign}px` }} className="relative group/th">
                          Campaign / Batch
                          <div onMouseDown={(e) => startResizing("campaign", "table", e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 bg-primary/30" />
                        </TableHead>
                        <TableHead style={{ width: `${tableColWidths.age}px` }} className="relative group/th">
                          Lead Age
                          <div onMouseDown={(e) => startResizing("age", "table", e)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 bg-primary/30" />
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map((lead) => {
                        const stage = PIPELINE_STAGES.find(s => s.id === (lead.current_status || "New"));
                        const stuck = isLeadStuck(lead, lead.current_status || "New");
                        const StageIcon = stage?.icon || Sparkles;

                        return (
                          <TableRow
                            key={lead.id}
                            className={cn(
                              "border-border/50 cursor-pointer transition-colors",
                              stuck && "bg-amber-500/5"
                            )}
                            onClick={() => handleLeadClick(lead)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className={cn(
                                    "text-xs font-semibold bg-gradient-to-br text-white",
                                    stage?.gradient || "from-blue-500 to-cyan-400"
                                  )}>
                                    {getLeadInitials(lead)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm whitespace-normal break-words">
                                    {lead.first_name || lead.last_name
                                      ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
                                      : lead.email.split("@")[0]}
                                  </p>
                                  {stuck && (
                                    <div className="flex items-center gap-1 text-amber-400 text-xs">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span>Needs attention</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-medium gap-1.5",
                                  stage?.badgeBg,
                                  stage?.badgeText,
                                  stage?.badgeBorder
                                )}
                              >
                                <StageIcon className="h-3 w-3" />
                                {stage?.shortLabel || "New"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="text-xs space-y-0.5">
                                  <p className="font-medium truncate max-w-[180px]">{lead.email}</p>
                                  <p className="text-muted-foreground">{formatPhoneNumber(lead.phone)}</p>
                                </div>
                                {lead.active_ai_call && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className={cn(
                                        "p-1.5 rounded-lg border",
                                        lead.active_ai_call.call_status === 'in_progress' ? "bg-blue-500/10 border-blue-500/30 animate-pulse" :
                                          lead.active_ai_call.call_status === 'completed' ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                                      )}>
                                        <Bot className={cn(
                                          "h-3.5 w-3.5",
                                          lead.active_ai_call.call_status === 'in_progress' ? "text-blue-500" :
                                            lead.active_ai_call.call_status === 'completed' ? "text-green-500" : "text-red-500"
                                        )} />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs font-bold capitalize">AI agent {lead.active_ai_call.call_status.replace('_', ' ')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                              {lead.broker ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground max-w-[150px]">
                                  <Building className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{lead.broker.firm_name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50 text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {lead.source?.includes('|') ? (
                                <div className="text-[10px] space-y-0.5">
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 uppercase bg-primary/5 text-primary border-primary/20">{lead.source.split('|')[0].replace('_', ' ')}</Badge>
                                  <p className="text-muted-foreground italic truncate opacity-70">{lead.source.split('|')[1]}</p>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">{lead.source || "Organic"}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs bg-background/50 text-muted-foreground">
                                {getLeadAge(lead)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 hover:bg-green-500/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`tel:${lead.phone}`, '_self');
                                      }}
                                    >
                                      <Phone className="h-4 w-4 text-green-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Call</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 hover:bg-blue-500/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`mailto:${lead.email}`, '_blank');
                                      }}
                                    >
                                      <Mail className="h-4 w-4 text-blue-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Email</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 hover:bg-amber-500/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleLeadClick(lead);
                                      }}
                                    >
                                      <CalendarIcon className="h-4 w-4 text-amber-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Schedule</TooltipContent>
                                </Tooltip>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLeadClick(lead);
                                  }}
                                >
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action Dialog - Redesigned */}
        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
            {selectedLead && (
              <>
                {/* Dialog Header with gradient */}
                <div className="relative p-6 pb-4 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl" />
                  <DialogHeader className="relative">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14">
                        <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-primary to-secondary text-white">
                          {getLeadInitials(selectedLead)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <DialogTitle className="text-xl truncate">
                          {selectedLead.first_name || selectedLead.last_name
                            ? `${selectedLead.first_name || ""} ${selectedLead.last_name || ""}`.trim()
                            : selectedLead.email}
                        </DialogTitle>
                        <DialogDescription className="mt-1">
                          <span className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-medium",
                                PIPELINE_STAGES.find(s => s.id === selectedLead.current_status)?.badgeBg,
                                PIPELINE_STAGES.find(s => s.id === selectedLead.current_status)?.badgeText,
                                PIPELINE_STAGES.find(s => s.id === selectedLead.current_status)?.badgeBorder
                              )}
                            >
                              {selectedLead.current_status || "New"}
                            </Badge>
                          </span>
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                <div className="p-6 pt-4 space-y-5">
                  {/* Contact Info */}
                  <div className="flex gap-4">
                    <div className="flex-1 p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="text-xs uppercase tracking-wider">Phone</span>
                      </div>
                      <p className="text-sm font-medium truncate">{selectedLead.phone}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="text-xs uppercase tracking-wider">Email</span>
                      </div>
                      <p className="text-sm font-medium truncate">{selectedLead.email}</p>
                    </div>
                  </div>

                  {selectedLead.broker && (
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Building className="h-3.5 w-3.5" />
                        <span className="text-xs uppercase tracking-wider">Broker</span>
                      </div>
                      <p className="text-sm font-medium">
                        {selectedLead.broker.firm_name}
                        <span className="text-muted-foreground opacity-60"> · {selectedLead.broker.contact_person}</span>
                      </p>
                    </div>
                  )}

                  {selectedLead.source && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2 text-primary/70 mb-1">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="text-xs uppercase tracking-wider font-semibold">Campaign / Batch</span>
                      </div>
                      {selectedLead.source.includes('|') ? (
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-primary">{selectedLead.source.split('|')[0].replace('_', ' ')}</p>
                          <p className="text-xs font-mono text-muted-foreground opacity-70">{selectedLead.source.split('|')[1]}</p>
                        </div>
                      ) : (
                        <p className="text-sm font-medium">{selectedLead.source}</p>
                      )}
                    </div>
                  )}

                  {/* Recent Activities */}
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                      Recent Activity
                    </Label>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {loadingActivities ? (
                        <Skeleton className="h-8 w-full" />
                      ) : activities.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No recent activities</p>
                      ) : (
                        activities.slice(0, 3).map((activity) => (
                          <div key={activity.id} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded bg-muted/20">
                            <Activity className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{activity.activity_type}</span>
                              {activity.notes && <span className="text-muted-foreground"> — {activity.notes}</span>}
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {activity.created_at && format(new Date(activity.created_at), "MMM d")}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Move to Stage */}
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Move to Stage
                    </Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Select new stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {getNextStages(selectedLead.current_status || "New").map((stage) => {
                          const StageIcon = stage.icon;
                          return (
                            <SelectItem key={stage.id} value={stage.id}>
                              <div className="flex items-center gap-2">
                                <div className={cn("p-1 rounded", stage.badgeBg)}>
                                  <StageIcon className={cn("h-3 w-3", stage.badgeText)} />
                                </div>
                                {stage.label}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    <div className="space-y-1.5">
                      <Label htmlFor="notes" className="text-xs text-muted-foreground uppercase tracking-wider">
                        Notes (optional)
                      </Label>
                      <Textarea
                        id="notes"
                        placeholder="Add notes about this action..."
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        rows={2}
                        className="resize-none bg-background/50"
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter className="p-4 pt-0 sm:justify-between items-center w-full gap-3">
                  <Button variant="outline" onClick={() => setActionDialogOpen(false)} className="w-full sm:w-auto shrink-0 order-3 sm:order-1">
                    Cancel
                  </Button>
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto order-1 sm:order-2">
                    <Button
                      variant="default"
                      className="flex-1 sm:flex-none bg-indigo-500 hover:bg-indigo-600 text-white truncate"
                      onClick={async () => {
                        if (!selectedLead) return;
                      const callPromise = supabase.functions.invoke('create-ayanda-call', {
                        body: {
                          leadId: selectedLead.id,
                          brokerId: selectedLead.broker_id,
                          isRoleplay: selectedLead.id === "demo-roleplay-lead-id"
                        }
                      }).then(async (res) => {
                        if (res.error) {
                          let finalError = res.error.message;
                          if (res.error.context && typeof res.error.context.text === 'function') {
                            const errBody = await res.error.context.text();
                            try {
                              const parsed = JSON.parse(errBody);
                              finalError = parsed.error || errBody;
                            } catch (e) {
                              finalError = errBody;
                            }
                          }
                          throw new Error(finalError);
                        }
                        return res.data;
                      });

                      toast.promise(callPromise, {
                        loading: 'Dispatching Ayanda AI agent...',
                        success: 'AI call initiated! Connecting to lead...',
                        error: (err) => `Failed to dispatch: ${err.message}`,
                      });
                      
                      callPromise.finally(() => {
                        setActionDialogOpen(false);
                        setTimeout(() => fetchLeads(), 1000);
                      });
                      }}
                    >
                      <Bot className="h-4 w-4 mr-1.5 shrink-0" />
                      <span className="truncate">Ai Call</span>
                    </Button>

                    <Button
                      onClick={handleMoveToStage}
                      disabled={saving || newStatus === selectedLead?.current_status}
                      className="flex-1 sm:flex-none bg-gradient-to-r from-primary to-secondary hover:opacity-90 truncate"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-1.5 shrink-0 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4 mr-1.5 shrink-0" />
                      )}
                      <span className="truncate">Move Lead</span>
                    </Button>
                  </div>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <CallCommandCenter 
          isOpen={isCommandCenterOpen} 
          onClose={() => setIsCommandCenterOpen(false)} 
        />
      </div>
    </TooltipProvider>
  );
};

export default WorkflowManagement;
