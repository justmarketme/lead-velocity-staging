import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    CheckCircle2, AlertCircle, Clock, Zap, Target, TrendingUp,
    BarChart3, Users, ChevronRight, ChevronDown,
    XCircle, Info, MessageSquare, Briefcase, Phone, Mail, Globe, MapPin, Building,
    Filter, MoreHorizontal, Calendar, Star, Sparkles, Layout, Settings2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

interface BrokerAnalysis {
    id: string;
    operational_score: number;
    budget_score: number;
    growth_score: number;
    intent_score: number;
    success_probability: number;
    success_band: string;
    risk_flags: string[];
    primary_sales_angle: string;
    ai_explanation: string | null;
    status: string;
    admin_notes: string | null;
    created_at: string;
    responses: {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        phone_number: string | null;
        firm_name: string | null;
        company_name: string | null;
        preferred_call_time: string | null;
        whatsapp_number: string | null;
        whatsapp_consent: boolean;
        product_focus_clarity: string;
        geographic_focus_clarity: string;
        timeline_to_start: string;
        crm_usage: string;
        monthly_lead_spend: string;
        desired_leads_weekly: number;
        max_capacity_weekly: number;
        team_size: string;
        speed_to_contact: string;
        follow_up_process: string;
        pricing_comfort: string;
        growth_goal_clarity: string;
        cpl_awareness: string;
    } | null;
}

const BrokerAnalysisDashboard = () => {
    const { toast } = useToast();
    const [analyses, setAnalyses] = useState<BrokerAnalysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedTier, setSelectedTier] = useState<string>("Pilot");
    const [portalStyle, setPortalStyle] = useState<"Standard" | "Elite">("Standard");
    const [isLeadLoading, setIsLeadLoading] = useState(true);

    useEffect(() => {
        fetchAnalyses();
    }, []);

    const fetchAnalyses = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('broker_analysis')
                .select(`
                    *,
                    responses:broker_onboarding_responses(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            // @ts-ignore
            setAnalyses((data || []) as BrokerAnalysis[]);
        } catch (error: any) {
            toast({
                title: "Error fetching analyses",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePremiumPortal = async (analysis: BrokerAnalysis) => {
        try {
            const { responses } = analysis;
            if (!responses?.email) {
                toast({ title: "Email Missing", description: "Cannot provision portal without email.", variant: "destructive" });
                return;
            }

            // Unify names
            const phone = responses.phone || responses.phone_number;
            const firmName = responses.firm_name || responses.company_name || 'Individual';

            // 1. Create / Update Broker Record
            const { data: broker, error: brokerError } = await supabase
                .from("brokers")
                .upsert({
                    email: responses.email,
                    firm_name: firmName,
                    contact_person: responses.full_name || 'Anonymous',
                    phone_number: phone,
                    tier: selectedTier,
                    is_lead_loading: isLeadLoading,
                    portal_style: portalStyle,
                    status: 'Active'
                } as any, { onConflict: 'email' })
                .select()
                .single();

            if (brokerError) throw brokerError;

            toast({
                title: "Portal Provisioned",
                description: `${portalStyle} portal created for ${responses.full_name}. Tier: ${selectedTier}.`,
            });

            handleAction(analysis.id, 'proceed');
        } catch (e: any) {
            toast({ title: "Provisioning Failed", description: e.message, variant: "destructive" });
        }
    };

    const handleAction = async (id: string, status: string) => {
        try {
            const { error } = await supabase
                .from('broker_analysis')
                .update({ status })
                .eq('id', id);

            if (error) throw error;

            toast({
                title: "Status Updated",
                description: `Broker marked as ${status}.`,
            });

            setAnalyses(prev => prev.map(a => a.id === id ? { ...a, status } : a));
        } catch (error: any) {
            toast({
                title: "Update Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    const getProbabilityColor = (band: string) => {
        switch (band) {
            case 'High Probability': return "text-emerald-400";
            case 'Medium Probability': return "text-amber-400";
            case 'Low Probability': return "text-rose-400";
            default: return "text-slate-400";
        }
    };

    const stats = [
        { label: "Total", value: analyses.length, icon: Users, color: "text-purple-500" },
        { label: "New", value: analyses.filter(a => a.status === 'pending').length, icon: Clock, color: "text-blue-500" },
        { label: "Scheduled", value: 0, icon: Calendar, color: "text-orange-500" },
        { label: "Converted", value: analyses.filter(a => a.status === 'proceed').length, icon: CheckCircle2, color: "text-green-500" },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Broker Onboarding Submissions</h1>
                    <p className="text-slate-500 text-sm">Review and manage incoming broker applications</p>
                </div>
                <Button variant="outline" className="bg-slate-900/50 border-white/10 text-xs h-9">
                    All Submissions <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <Card key={i} className="bg-slate-900/40 border-white/5">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className={cn("p-2 rounded-lg bg-white/5", stat.color)}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-white leading-none">{stat.value}</p>
                                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mt-1">{stat.label}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Submissions List */}
            <div className="space-y-4">
                {analyses.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/20 rounded-3xl border-2 border-dashed border-white/5">
                        <Users className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-500 font-medium">No onboarding submissions found</p>
                    </div>
                ) : (
                    analyses.map((submission) => (
                        <Card
                            key={submission.id}
                            className={cn(
                                "bg-[#020617] border-white/5 overflow-hidden transition-all duration-300 rounded-2xl",
                                expandedId === submission.id ? "ring-1 ring-primary/20" : "hover:bg-slate-900/40"
                            )}
                        >
                            <div
                                className="p-6 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
                            >
                                <div className="flex flex-col lg:flex-row gap-6">
                                    {/* Left Side: Avatar & Basic Info */}
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                                            <Users className="h-5 w-5 text-purple-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white leading-none mb-1">
                                                {submission.responses?.full_name || "N/A"}
                                            </h3>
                                            <p className="text-xs text-slate-500 font-medium">
                                                {submission.responses?.firm_name || submission.responses?.company_name || "Independent"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Middle: Contact Details (Icon Based) */}
                                    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 flex-[2]">
                                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                                            <Mail className="h-3.5 w-3.5 text-purple-500" />
                                            {submission.responses?.email || "N/A"}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                                            <Phone className="h-3.5 w-3.5 text-pink-500" />
                                            {submission.responses?.phone || submission.responses?.phone_number || "N/A"}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                                            <div className="h-3.5 w-3.5 border border-purple-500/50 rounded flex items-center justify-center">
                                                <div className="h-2 w-2 bg-purple-500 rounded-sm" />
                                            </div>
                                            {submission.responses?.whatsapp_number || submission.responses?.phone || submission.responses?.phone_number || "N/A"}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                                            <Clock className="h-3.5 w-3.5 text-yellow-500" />
                                            {submission.responses?.preferred_call_time || "Not set"}
                                        </div>
                                    </div>

                                    {/* Right: Badges & Time */}
                                    <div className="flex items-center justify-between lg:justify-end gap-4 min-w-[200px]">
                                        <div className="flex gap-2">
                                            {submission.status === 'pending' && (
                                                <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/20 text-[9px] uppercase font-bold py-0.5 px-2">New</Badge>
                                            )}
                                            {submission.status === 'proceed' && (
                                                <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-500/20 text-[9px] uppercase font-bold py-0.5 px-2">Converted</Badge>
                                            )}
                                            {submission.responses?.whatsapp_consent && (
                                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-[9px] uppercase font-bold py-0.5 px-2">WhatsApp OK</Badge>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-slate-600 font-bold whitespace-nowrap uppercase">
                                            {format(new Date(submission.created_at), "MMM d, yyyy 'at' h:mm a")}
                                        </div>
                                    </div>
                                </div>

                                {/* Accordion Trigger */}
                                <div className="flex justify-center mt-4">
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 uppercase tracking-widest group">
                                        <ChevronDown className={cn("h-3 w-3 transition-transform", expandedId === submission.id && "rotate-180")} />
                                        View Full Details
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {expandedId === submission.id && (
                                <div className="border-t border-white/[0.03] p-6 bg-white/[0.01] animate-in slide-in-from-top-2 duration-300">
                                    <div className="w-full space-y-10 px-2 py-4">
                                        {/* Budget & Capacity */}
                                        <div className="space-y-6">
                                            <h4 className="flex items-center gap-2 text-sm font-black text-pink-500">
                                                <span className="text-lg leading-none">$</span> Budget & Capacity
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Monthly Budget</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.monthly_lead_spend || "N/A"}</p>
                                                </div>
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Comfort Per Lead</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.cpl_awareness || "N/A"}</p>
                                                </div>
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Ideal Leads/Week</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.desired_leads_weekly || 0}</p>
                                                </div>
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Max Capacity</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.max_capacity_weekly || 0}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Target Market */}
                                        <div className="space-y-6">
                                            <h4 className="flex items-center gap-2 text-sm font-black text-amber-500">
                                                <Target className="w-5 h-5 text-amber-500" /> Target Market
                                            </h4>
                                            <div className="flex gap-2 flex-wrap">
                                                <Badge className="bg-transparent border-white/10 text-white font-medium px-4 py-1 hover:bg-white/5">Short-term Insurance</Badge>
                                                <Badge className="bg-transparent border-white/10 text-white font-medium px-4 py-1 hover:bg-white/5">Funeral Cover</Badge>
                                                <Badge className="bg-transparent border-white/10 text-white font-medium px-4 py-1 hover:bg-white/5">Business Insurance</Badge>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Geographic Focus</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.geographic_focus_clarity || "N/A"}</p>
                                                </div>
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Team Size</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.team_size || "Solo"}</p>
                                                </div>
                                            </div>
                                            <div className="mt-4 border-b border-white/5 pb-2">
                                                <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Ideal Client Profile</p>
                                                <p className="text-sm font-medium text-white">{submission.responses?.product_focus_clarity || "N/A"}</p>
                                            </div>
                                        </div>

                                        {/* Systems & Process */}
                                        <div className="space-y-6">
                                            <h4 className="flex items-center gap-2 text-sm font-black text-purple-400">
                                                <Settings2 className="w-5 h-5 text-purple-400" /> Systems & Process
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">CRM Used</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.crm_usage || "N/A"}</p>
                                                </div>
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Speed to Contact</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.speed_to_contact || "N/A"}</p>
                                                </div>
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Monthly Target</p>
                                                    <p className="text-sm font-bold text-white">{submission.responses?.growth_goal_clarity || "N/A"}</p>
                                                </div>
                                            </div>
                                            <div className="mt-4 border-b border-white/5 pb-2">
                                                <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Follow-up Process</p>
                                                <p className="text-sm font-medium text-white">{submission.responses?.follow_up_process || "N/A"}</p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Growth Goals</p>
                                                    <p className="text-sm font-medium text-white">{submission.responses?.growth_goal_clarity || "N/A"}</p>
                                                </div>
                                                <div className="border-b border-white/5 pb-2">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Status Probability Analysis</p>
                                                    <p className={cn("text-sm font-black", getProbabilityColor(submission.success_band))}>
                                                        {submission.success_probability}% - {submission.success_band}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Admin Actions */}
                                        <div className="space-y-6 pt-6 border-t border-white/5">
                                            <h4 className="flex items-center gap-2 text-sm font-black text-emerald-400">
                                                <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Admin Actions
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] uppercase text-slate-500 font-bold mb-1">Status</Label>
                                                        <select
                                                            className="w-full bg-[#020617] border border-white/10 rounded-lg h-10 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                                                            value={submission.status}
                                                            onChange={(e) => handleAction(submission.id, e.target.value)}
                                                        >
                                                            <option value="pending">New</option>
                                                            <option value="reviewing">Reviewing</option>
                                                            <option value="hold">On Hold</option>
                                                            <option value="proceed">Converted</option>
                                                            <option value="decline">Declined</option>
                                                        </select>
                                                    </div>

                                                    {submission.status !== 'proceed' && (
                                                        <div className="pt-2">
                                                            <Button
                                                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 rounded-xl"
                                                                onClick={() => handleCreatePremiumPortal(submission)}
                                                            >
                                                                Provision Portal
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase text-slate-500 font-bold mb-1">Admin Notes</Label>
                                                    <Textarea
                                                        placeholder="Add internal notes..."
                                                        className="bg-[#020617] border-white/10 min-h-[100px] text-sm focus-visible:ring-primary/50 resize-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

export default BrokerAnalysisDashboard;
