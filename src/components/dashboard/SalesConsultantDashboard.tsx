import { useState, useEffect, useCallback } from "react";
import {
    PhoneCall, Users, Target, TrendingUp,
    Play, Mic,
    Brain, Zap, Eye,
    RefreshCw, Loader2, SlidersHorizontal,
    Phone, Bot, Sparkles, UserCheck, PhoneOff
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Types
interface ScrapedLead {
    id: string;
    name: string;
    role: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    vibe_score: number | null;
    industry: string | null;
    source: string | null;
    status: string;
    created_at: string;
}

interface VoiceCampaign {
    id: string;
    name: string;
    status: string;
    total_leads: number;
    contacted: number;
    appointments_set: number;
    objective: string;
    created_at: string;
    launched_at: string | null;
}

interface ElevenLabsVoice {
    voice_id: string;
    name: string;
    category: string;
    labels: Record<string, string>;
    preview_url: string | null;
    is_sa_voice: boolean;
}

interface VoiceConfig {
    voice_id: string;
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
    ai_engine: 'ultravox' | 'elevenlabs';
}

const CALL_PURPOSES = [
    { value: "cold_call", label: "Cold Call" },
    { value: "appointment_scheduling", label: "Book Appointment" },
    { value: "follow_up", label: "Follow-Up" },
    { value: "product_pitch", label: "Product Pitch" },
];

const OBJECTIVES = [
    { value: "cold_call", label: "Cold Call" },
    { value: "appointment_scheduling", label: "Appointment Scheduling" },
    { value: "follow_up", label: "Follow-Up" },
    { value: "product_pitch", label: "Product Pitch" },
];

const STATUS_COLORS: Record<string, string> = {
    draft: "bg-zinc-700 text-zinc-200",
    running: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    completed: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    paused: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    new: "bg-zinc-600 text-zinc-300",
    contacted: "bg-blue-500/20 text-blue-400",
    converted: "bg-emerald-500/20 text-emerald-400",
};

export default function SalesConsultantDashboard() {
    const { toast } = useToast();

    // Call mode toggle
    const [callMode, setCallMode] = useState<'ai' | 'human'>('ai');

    // Human call modal state
    const [callDialogLead, setCallDialogLead] = useState<ScrapedLead | null>(null);
    const [callDialogOpen, setCallDialogOpen] = useState(false);
    const [manualCallType, setManualCallType] = useState<'direct' | 'bridge' | 'ai'>('direct');
    const [manualCallPurpose, setManualCallPurpose] = useState('cold_call');
    const [manualCallPhone, setManualCallPhone] = useState('');
    const [manualCallLoading, setManualCallLoading] = useState(false);

    // Lead batch state
    const [leads, setLeads] = useState<ScrapedLead[]>([]);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [leadsLoading, setLeadsLoading] = useState(true);

    // Campaign state
    const [campaigns, setCampaigns] = useState<VoiceCampaign[]>([]);
    const [campaignsLoading, setCampaignsLoading] = useState(true);

    // KPI metrics
    const [kpis, setKpis] = useState({
        callsToday: 0,
        totalContacted: 0,
        appointmentsSet: 0,
        activeCampaigns: 0,
    });

    // Campaign configurator sheet
    const [configSheetOpen, setConfigSheetOpen] = useState(false);
    const [campaignName, setCampaignName] = useState("");
    const [objective, setObjective] = useState("cold_call");
    const [knowledgeBase, setKnowledgeBase] = useState("");
    const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
        voice_id: "",
        stability: 0.6,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
        ai_engine: 'ultravox',
    });
    const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
    const [voicesLoading, setVoicesLoading] = useState(false);
    const [launching, setLaunching] = useState(false);

    // Campaign detail dialog
    const [selectedCampaign, setSelectedCampaign] = useState<VoiceCampaign | null>(null);
    const [campaignCalls, setCampaignCalls] = useState<any[]>([]);
    const [campaignDetailOpen, setCampaignDetailOpen] = useState(false);

    // ------------------------------------------------------------------
    // Data fetching
    // ------------------------------------------------------------------
    const fetchLeads = useCallback(async () => {
        setLeadsLoading(true);
        const { data, error } = await supabase
            .from("scraped_leads")
            .select("*")
            .eq("status", "new")
            .order("created_at", { ascending: false });
        if (!error) setLeads(data || []);
        setLeadsLoading(false);
    }, []);

    const fetchCampaigns = useCallback(async () => {
        setCampaignsLoading(true);
        const { data, error } = await supabase
            .from("voice_campaigns")
            .select("*")
            .order("created_at", { ascending: false });
        if (!error) setCampaigns(data || []);
        setCampaignsLoading(false);
    }, []);

    const fetchKPIs = useCallback(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [todayCalls, allContacted, appointments, activeCamps] = await Promise.all([
            supabase
                .from("voice_campaign_calls")
                .select("id", { count: "exact" })
                .gte("created_at", today.toISOString()),
            supabase
                .from("scraped_leads")
                .select("id", { count: "exact" })
                .eq("status", "contacted"),
            supabase
                .from("voice_campaign_calls")
                .select("id", { count: "exact" })
                .eq("outcome", "appointment"),
            supabase
                .from("voice_campaigns")
                .select("id", { count: "exact" })
                .eq("status", "running"),
        ]);

        setKpis({
            callsToday: todayCalls.count || 0,
            totalContacted: allContacted.count || 0,
            appointmentsSet: appointments.count || 0,
            activeCampaigns: activeCamps.count || 0,
        });
    }, []);

    useEffect(() => {
        fetchLeads();
        fetchCampaigns();
        fetchKPIs();
    }, [fetchLeads, fetchCampaigns, fetchKPIs]);

    // ------------------------------------------------------------------
    // Human call handlers
    // ------------------------------------------------------------------
    const openCallDialog = (lead: ScrapedLead) => {
        setCallDialogLead(lead);
        setManualCallPhone(lead.phone || '');
        setManualCallType('direct');
        setManualCallPurpose('cold_call');
        setCallDialogOpen(true);
    };

    const executeCall = async () => {
        if (!callDialogLead) return;
        const phone = manualCallPhone.trim();

        if (manualCallType === 'direct') {
            if (!phone) {
                toast({ title: "No phone number", description: "Add a phone number for this lead first.", variant: "destructive" });
                return;
            }
            window.open(`tel:${phone}`, '_self');
            setCallDialogOpen(false);
            return;
        }

        // Ayanda Bridge or Ayanda AI — route through initiate-ai-call
        setManualCallLoading(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            const { error } = await supabase.functions.invoke('initiate-ai-call', {
                body: {
                    recipient_type: 'scraped_lead',
                    recipient_id: callDialogLead.id,
                    recipient_name: callDialogLead.name,
                    recipient_phone: phone,
                    call_type: manualCallType === 'bridge' ? 'bridge' : 'ai',
                    call_purpose: manualCallPurpose,
                    initiated_by: userData.user?.id,
                },
            });
            if (error) throw error;
            toast({ title: manualCallType === 'bridge' ? "Ayanda Bridge Initiated" : "Ayanda AI Call Started", description: `Calling ${callDialogLead.name}…` });
            setCallDialogOpen(false);
        } catch (err: any) {
            toast({ title: "Call Failed", description: err.message, variant: "destructive" });
        } finally {
            setManualCallLoading(false);
        }
    };

    // ------------------------------------------------------------------
    // Lead selection
    // ------------------------------------------------------------------
    const toggleLead = (id: string) => {
        setSelectedLeadIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedLeadIds.size === leads.length) {
            setSelectedLeadIds(new Set());
        } else {
            setSelectedLeadIds(new Set(leads.map(l => l.id)));
        }
    };

    // ------------------------------------------------------------------
    // ElevenLabs voices
    // ------------------------------------------------------------------
    const loadVoices = async () => {
        setVoicesLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke("elevenlabs-campaign", {
                body: { action: "get-voices" },
            });
            if (error) throw error;
            setVoices(data.voices || []);
            // Default to first SA voice if available
            const saVoice = (data.voices || []).find((v: ElevenLabsVoice) => v.is_sa_voice);
            if (saVoice) {
                setVoiceConfig(prev => ({ ...prev, voice_id: saVoice.voice_id }));
            }
        } catch (err: any) {
            toast({
                title: "Could not load ElevenLabs voices",
                description: err.message || "Check that ELEVENLABS_API_KEY is set in Supabase secrets.",
                variant: "destructive",
            });
        } finally {
            setVoicesLoading(false);
        }
    };

    const openConfigSheet = () => {
        if (selectedLeadIds.size === 0) {
            toast({ title: "Select leads first", description: "Check at least one lead to assign to a campaign.", variant: "destructive" });
            return;
        }
        setConfigSheetOpen(true);
        if (voices.length === 0) loadVoices();
    };

    // ------------------------------------------------------------------
    // Launch campaign
    // ------------------------------------------------------------------
    const launchCampaign = async () => {
        if (!campaignName.trim()) {
            toast({ title: "Campaign name required", variant: "destructive" });
            return;
        }
        if (!voiceConfig.voice_id) {
            toast({ title: "Select a voice first", variant: "destructive" });
            return;
        }

        setLaunching(true);
        try {
            const selectedLeads = leads.filter(l => selectedLeadIds.has(l.id));

            // Create campaign record
            const { data: campaign, error: campErr } = await supabase
                .from("voice_campaigns")
                .insert({
                    name: campaignName,
                    status: "draft",
                    lead_ids: selectedLeads.map(l => l.id),
                    voice_config: voiceConfig,
                    knowledge_base: knowledgeBase,
                    objective,
                    total_leads: selectedLeads.length,
                })
                .select()
                .single();

            if (campErr) throw campErr;

            // Route through n8n webhook if configured (preferred — n8n handles rate limiting & batching)
            // Otherwise fall back to direct edge function invocation
            const n8nWebhook = import.meta.env.VITE_N8N_CAMPAIGN_WEBHOOK as string | undefined;

            if (n8nWebhook) {
                const res = await fetch(n8nWebhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        campaign_id: campaign.id,
                        leads: selectedLeads.map(l => ({ id: l.id, name: l.name, phone: l.phone, email: l.email })),
                        voice_config: voiceConfig,
                        knowledge_base: knowledgeBase,
                        objective,
                    }),
                });
                if (!res.ok) throw new Error(`n8n webhook returned ${res.status}`);
                toast({ title: "Campaign Queued", description: `${selectedLeads.length} leads handed to n8n for dialling.` });
            } else {
                const { data: launchData, error: launchErr } = await supabase.functions.invoke("elevenlabs-campaign", {
                    body: {
                        action: "launch-campaign",
                        payload: {
                            campaign_id: campaign.id,
                            leads: selectedLeads.map(l => ({ id: l.id, name: l.name, phone: l.phone, email: l.email })),
                            voice_config: voiceConfig,
                            knowledge_base: knowledgeBase,
                            objective,
                        },
                    },
                });
                if (launchErr) throw launchErr;
                toast({ title: "Campaign Launched", description: `${launchData.initiated} of ${launchData.total} calls initiated.` });
            }

            setConfigSheetOpen(false);
            setCampaignName("");
            setKnowledgeBase("");
            setSelectedLeadIds(new Set());
            fetchLeads();
            fetchCampaigns();
            fetchKPIs();
        } catch (err: any) {
            toast({
                title: "Launch Failed",
                description: err.message || "Could not launch campaign. Check Twilio and ElevenLabs credentials.",
                variant: "destructive",
            });
        } finally {
            setLaunching(false);
        }
    };

    // ------------------------------------------------------------------
    // Campaign detail
    // ------------------------------------------------------------------
    const viewCampaign = async (campaign: VoiceCampaign) => {
        setSelectedCampaign(campaign);
        setCampaignDetailOpen(true);
        const { data } = await supabase
            .from("voice_campaign_calls")
            .select("*, scraped_leads(name, company, email, phone)")
            .eq("campaign_id", campaign.id)
            .order("created_at", { ascending: false });
        setCampaignCalls(data || []);
    };

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    return (
        <div className="space-y-6 p-1">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Sales Console</h1>
                    <p className="text-sm text-muted-foreground">AI-powered outbound calling with ElevenLabs + Twilio</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { fetchLeads(); fetchCampaigns(); fetchKPIs(); }}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* KPI Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Calls Today", value: kpis.callsToday, icon: PhoneCall, color: "text-blue-400" },
                    { label: "Total Contacted", value: kpis.totalContacted, icon: Users, color: "text-violet-400" },
                    { label: "Appointments Set", value: kpis.appointmentsSet, icon: Target, color: "text-emerald-400" },
                    { label: "Active Campaigns", value: kpis.activeCampaigns, icon: TrendingUp, color: "text-amber-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                    <Card key={label} className="bg-card border-border">
                        <CardContent className="pt-5 pb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                                    <p className="text-3xl font-bold text-foreground">{value}</p>
                                </div>
                                <Icon className={`h-8 w-8 ${color} opacity-80`} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Lead Batch Selector */}
            <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <CardTitle className="text-base">Leads Pool</CardTitle>
                            <CardDescription>
                                {leads.length} new leads — {callMode === 'ai' ? 'select a batch to launch an AI campaign' : 'call each lead yourself'}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* AI / Human mode toggle */}
                            <div className="flex items-center rounded-md border border-border overflow-hidden">
                                <button
                                    onClick={() => setCallMode('ai')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${callMode === 'ai' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <Bot className="h-3.5 w-3.5" />
                                    Ayanda AI
                                </button>
                                <button
                                    onClick={() => { setCallMode('human'); setSelectedLeadIds(new Set()); }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${callMode === 'human' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <UserCheck className="h-3.5 w-3.5" />
                                    Manual
                                </button>
                            </div>
                            {callMode === 'ai' && selectedLeadIds.size > 0 && (
                                <Button onClick={openConfigSheet} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
                                    <Zap className="h-4 w-4 mr-2" />
                                    Campaign ({selectedLeadIds.size})
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {leadsLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : leads.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No new leads yet.</p>
                            <p className="text-xs mt-1">Run a scrape in the Marketing Hub to populate this pool.</p>
                        </div>
                    ) : (
                        <div className="rounded-md border border-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border">
                                        {callMode === 'ai' ? (
                                            <th className="w-10 px-3 py-2 text-left">
                                                <Checkbox
                                                    checked={selectedLeadIds.size === leads.length && leads.length > 0}
                                                    onCheckedChange={toggleSelectAll}
                                                />
                                            </th>
                                        ) : (
                                            <th className="w-16 px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Call</th>
                                        )}
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Company</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                                            {callMode === 'human' ? 'Phone' : 'Email'}
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Industry</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Vibe</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Source</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.map((lead, idx) => (
                                        <tr
                                            key={lead.id}
                                            className={`border-b border-border last:border-0 transition-colors ${
                                                callMode === 'ai'
                                                    ? `cursor-pointer ${selectedLeadIds.has(lead.id) ? "bg-blue-500/10" : idx % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-muted/40`
                                                    : idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                                            }`}
                                            onClick={() => callMode === 'ai' && toggleLead(lead.id)}
                                        >
                                            {callMode === 'ai' ? (
                                                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                                    <Checkbox
                                                        checked={selectedLeadIds.has(lead.id)}
                                                        onCheckedChange={() => toggleLead(lead.id)}
                                                    />
                                                </td>
                                            ) : (
                                                <td className="px-3 py-2.5">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                                        onClick={() => openCallDialog(lead)}
                                                        title="Call this lead"
                                                    >
                                                        <Phone className="h-3.5 w-3.5" />
                                                    </Button>
                                                </td>
                                            )}
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-foreground">{lead.name}</div>
                                                {lead.role && <div className="text-xs text-muted-foreground">{lead.role}</div>}
                                            </td>
                                            <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{lead.company || "—"}</td>
                                            <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground text-xs">
                                                {callMode === 'human' ? (
                                                    lead.phone
                                                        ? <span className="text-emerald-400 font-mono">{lead.phone}</span>
                                                        : <span className="text-zinc-500 italic">no phone</span>
                                                ) : (lead.email || "—")}
                                            </td>
                                            <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground text-xs">{lead.industry || "—"}</td>
                                            <td className="px-3 py-2.5">
                                                {lead.vibe_score != null ? (
                                                    <span className={`text-xs font-semibold ${lead.vibe_score >= 90 ? "text-emerald-400" : lead.vibe_score >= 80 ? "text-amber-400" : "text-zinc-400"}`}>
                                                        {lead.vibe_score}%
                                                    </span>
                                                ) : "—"}
                                            </td>
                                            <td className="px-3 py-2.5 hidden md:table-cell">
                                                <Badge variant="outline" className="text-xs capitalize">{lead.source || "unknown"}</Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Campaign History */}
            <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Campaign History</CardTitle>
                    <CardDescription>All voice campaigns and their outcomes</CardDescription>
                </CardHeader>
                <CardContent>
                    {campaignsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <PhoneCall className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No campaigns launched yet.</p>
                        </div>
                    ) : (
                        <div className="rounded-md border border-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border">
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Campaign</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Leads</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Contacted</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Appts</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Launched</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaigns.map((camp, idx) => (
                                        <tr key={camp.id} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-foreground">{camp.name}</div>
                                                <div className="text-xs text-muted-foreground capitalize">{camp.objective?.replace("_", " ")}</div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[camp.status] || "bg-zinc-700 text-zinc-200"}`}>
                                                    {camp.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-muted-foreground">{camp.total_leads}</td>
                                            <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{camp.contacted}</td>
                                            <td className="px-3 py-2.5 text-emerald-400 font-medium hidden lg:table-cell">{camp.appointments_set}</td>
                                            <td className="px-3 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                                                {camp.launched_at ? new Date(camp.launched_at).toLocaleDateString("en-ZA") : "Not launched"}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <Button size="sm" variant="ghost" onClick={() => viewCampaign(camp)}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Human Call Dialog */}
            <Dialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-emerald-400" />
                            Call {callDialogLead?.name}
                        </DialogTitle>
                        <DialogDescription>
                            {callDialogLead?.role}{callDialogLead?.role && callDialogLead?.company ? ' · ' : ''}{callDialogLead?.company}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Phone number */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Phone Number</Label>
                            <Input
                                placeholder="+27 XX XXX XXXX"
                                value={manualCallPhone}
                                onChange={e => setManualCallPhone(e.target.value)}
                                className="font-mono"
                            />
                        </div>

                        {/* Call type selector */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">How do you want to call?</Label>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    {
                                        type: 'direct' as const,
                                        icon: Phone,
                                        label: 'Direct Dial',
                                        description: 'Opens your phone app to call manually',
                                        color: 'text-emerald-400',
                                    },
                                    {
                                        type: 'bridge' as const,
                                        icon: UserCheck,
                                        label: 'Ayanda Bridge',
                                        description: 'Calls your phone first, then bridges to lead',
                                        color: 'text-blue-400',
                                    },
                                    {
                                        type: 'ai' as const,
                                        icon: Sparkles,
                                        label: 'Ayanda AI',
                                        description: 'AI agent makes the call on your behalf',
                                        color: 'text-violet-400',
                                    },
                                ].map(({ type, icon: Icon, label, description, color }) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setManualCallType(type)}
                                        className={`text-left rounded-md border px-3 py-2 transition-colors ${manualCallType === type ? 'border-blue-500/50 bg-blue-500/10' : 'border-border bg-muted/20 hover:bg-muted/40'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Icon className={`h-3.5 w-3.5 ${color}`} />
                                            <span className="text-sm font-medium">{label}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 pl-5">{description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Purpose (only for Ayanda modes) */}
                        {manualCallType !== 'direct' && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">Call Purpose</Label>
                                <Select value={manualCallPurpose} onValueChange={setManualCallPurpose}>
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CALL_PURPOSES.map(p => (
                                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCallDialogOpen(false)} disabled={manualCallLoading}>
                            Cancel
                        </Button>
                        <Button
                            onClick={executeCall}
                            disabled={manualCallLoading}
                            className={manualCallType === 'direct' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}
                        >
                            {manualCallLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : manualCallType === 'direct' ? (
                                <><Phone className="h-4 w-4 mr-2" />Dial</>
                            ) : manualCallType === 'bridge' ? (
                                <><UserCheck className="h-4 w-4 mr-2" />Bridge</>
                            ) : (
                                <><Sparkles className="h-4 w-4 mr-2" />Launch AI</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Campaign Configurator Sheet */}
            <Sheet open={configSheetOpen} onOpenChange={setConfigSheetOpen}>
                <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-blue-400" />
                            Configure Campaign
                        </SheetTitle>
                        <SheetDescription>
                            {selectedLeadIds.size} leads selected — set up your AI voice agent and launch
                        </SheetDescription>
                    </SheetHeader>

                    <div className="space-y-6 mt-6">
                        {/* Campaign Name */}
                        <div className="space-y-1.5">
                            <Label>Campaign Name</Label>
                            <Input
                                placeholder="e.g. March Life Insurance Outreach"
                                value={campaignName}
                                onChange={e => setCampaignName(e.target.value)}
                            />
                        </div>

                        {/* Voice Provider */}
                        <div className="space-y-1.5">
                            <Label>Voice Provider</Label>
                            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                                <Mic className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-medium">Twilio + ElevenLabs</span>
                                <Badge variant="outline" className="ml-auto text-xs text-emerald-400 border-emerald-500/30">Active</Badge>
                            </div>
                        </div>

                        {/* AI Engine */}
                        <div className="space-y-2">
                            <Label>AI Engine</Label>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    {
                                        value: 'ultravox' as const,
                                        label: 'Ultravox + ElevenLabs',
                                        description: 'Ultravox LLM brain + ElevenLabs voice — ~400ms latency, most natural',
                                        recommended: true,
                                    },
                                    {
                                        value: 'elevenlabs' as const,
                                        label: 'ElevenLabs Only',
                                        description: 'ElevenLabs Conversational AI agent — ~600ms latency',
                                        recommended: false,
                                    },
                                ].map(engine => (
                                    <button
                                        key={engine.value}
                                        type="button"
                                        onClick={() => setVoiceConfig(prev => ({ ...prev, ai_engine: engine.value }))}
                                        className={`text-left rounded-md border px-3 py-2.5 transition-colors ${voiceConfig.ai_engine === engine.value
                                            ? 'border-blue-500/50 bg-blue-500/10'
                                            : 'border-border bg-muted/20 hover:bg-muted/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">{engine.label}</span>
                                            {engine.recommended && (
                                                <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">Recommended</Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">{engine.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ElevenLabs Voice Selection */}
                        <div className="space-y-1.5">
                            <Label>ElevenLabs Voice</Label>
                            {voicesLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading voices...
                                </div>
                            ) : voices.length === 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">No voices loaded. Make sure ELEVENLABS_API_KEY is set.</p>
                                    <Button size="sm" variant="outline" onClick={loadVoices}>Retry</Button>
                                </div>
                            ) : (
                                <Select value={voiceConfig.voice_id} onValueChange={v => setVoiceConfig(prev => ({ ...prev, voice_id: v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a voice..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {voices.filter(v => v.is_sa_voice).length > 0 && (
                                            <>
                                                <div className="px-2 py-1 text-xs text-muted-foreground font-semibold">South African Voices</div>
                                                {voices.filter(v => v.is_sa_voice).map(v => (
                                                    <SelectItem key={v.voice_id} value={v.voice_id}>
                                                        <span className="flex items-center gap-2">
                                                            🇿🇦 {v.name}
                                                            <span className="text-xs text-muted-foreground capitalize">{v.category}</span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                                <div className="border-t border-border my-1" />
                                                <div className="px-2 py-1 text-xs text-muted-foreground font-semibold">All Voices</div>
                                            </>
                                        )}
                                        {voices.filter(v => !v.is_sa_voice).map(v => (
                                            <SelectItem key={v.voice_id} value={v.voice_id}>
                                                <span className="flex items-center gap-2">
                                                    {v.name}
                                                    <span className="text-xs text-muted-foreground capitalize">{v.category}</span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Voice Texture */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                                <Label>Voice Texture</Label>
                            </div>

                            <div className="space-y-3">
                                {[
                                    { key: "stability", label: "Stability", description: "Higher = more consistent, lower = more expressive" },
                                    { key: "similarity_boost", label: "Similarity Boost", description: "How closely to match the original voice" },
                                    { key: "style", label: "Style", description: "Exaggeration of speaking style (0 = neutral)" },
                                ].map(({ key, label, description }) => (
                                    <div key={key} className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs">{label}</Label>
                                            <span className="text-xs text-muted-foreground">
                                                {(voiceConfig[key as keyof VoiceConfig] as number).toFixed(2)}
                                            </span>
                                        </div>
                                        <Slider
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={[voiceConfig[key as keyof VoiceConfig] as number]}
                                            onValueChange={([val]) => setVoiceConfig(prev => ({ ...prev, [key]: val }))}
                                            className="w-full"
                                        />
                                        <p className="text-xs text-muted-foreground">{description}</p>
                                    </div>
                                ))}

                                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                                    <div>
                                        <Label className="text-xs">Use Speaker Boost</Label>
                                        <p className="text-xs text-muted-foreground">Enhances voice clarity (recommended)</p>
                                    </div>
                                    <Switch
                                        checked={voiceConfig.use_speaker_boost}
                                        onCheckedChange={v => setVoiceConfig(prev => ({ ...prev, use_speaker_boost: v }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Call Objective */}
                        <div className="space-y-1.5">
                            <Label>Call Objective</Label>
                            <Select value={objective} onValueChange={setObjective}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OBJECTIVES.map(o => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Knowledge Base */}
                        <div className="space-y-1.5">
                            <Label>Knowledge Base</Label>
                            <Textarea
                                placeholder="Describe your product or service, key benefits, pricing, and what the agent should communicate. The agent will use this to have informed conversations with prospects."
                                value={knowledgeBase}
                                onChange={e => setKnowledgeBase(e.target.value)}
                                className="min-h-[120px] resize-none"
                            />
                            <p className="text-xs text-muted-foreground">
                                Include product details, objection responses, and FSCA-compliant talking points.
                            </p>
                        </div>
                    </div>

                    <SheetFooter className="mt-6">
                        <Button variant="outline" onClick={() => setConfigSheetOpen(false)} disabled={launching}>
                            Cancel
                        </Button>
                        <Button
                            onClick={launchCampaign}
                            disabled={launching || !campaignName.trim() || !voiceConfig.voice_id}
                            className="bg-blue-600 hover:bg-blue-500 text-white"
                        >
                            {launching ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Launching...
                                </>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Launch Campaign
                                </>
                            )}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Campaign Detail Dialog */}
            <Dialog open={campaignDetailOpen} onOpenChange={setCampaignDetailOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{selectedCampaign?.name}</DialogTitle>
                        <DialogDescription>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[selectedCampaign?.status || ""] || ""}`}>
                                {selectedCampaign?.status}
                            </span>
                            {" · "}
                            {selectedCampaign?.total_leads} leads · {selectedCampaign?.contacted} contacted · {selectedCampaign?.appointments_set} appointments
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-96">
                        {campaignCalls.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No call records yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {campaignCalls.map(call => (
                                    <div key={call.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                                        <div>
                                            <p className="font-medium">{call.scraped_leads?.name || "Unknown"}</p>
                                            <p className="text-xs text-muted-foreground">{call.scraped_leads?.company || call.scraped_leads?.email || ""}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[call.call_status] || "bg-zinc-700 text-zinc-200"}`}>
                                                {call.call_status}
                                            </span>
                                            {call.outcome && (
                                                <p className="text-xs text-muted-foreground capitalize mt-1">{call.outcome.replace("_", " ")}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    );
}
