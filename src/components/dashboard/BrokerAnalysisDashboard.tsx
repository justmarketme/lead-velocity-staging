import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    CheckCircle2, AlertCircle, Clock, Zap, Target, TrendingUp,
    BarChart3, Users, ChevronRight, ChevronDown,
    XCircle, Info, MessageSquare, Briefcase, Phone, Mail, Globe, MapPin, Building
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
        full_name: string | null;
        email: string | null;
        phone_number: string | null;
        firm_name: string | null;
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
    const [selectedTier, setSelectedTier] = useState<string>("Bronze");
    const [isLeadLoading, setIsLeadLoading] = useState(true);
    const [adminMsg, setAdminMsg] = useState("");
    const [brokerMessages, setBrokerMessages] = useState<any[]>([]);

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

    const fetchBrokerThread = async (analysisId: string) => {
        // Logic to fetch notes for this broker
        // Assuming we join via the responses.email or similar
        const email = analyses.find(a => a.id === analysisId)?.responses?.email;
        if (!email) return;

        const { data: broker } = await supabase.from("brokers").select("id").eq("email", email).single();
        if (!broker) return;

        const { data: notes } = await supabase
            .from("broker_notes")
            .select("*")
            .eq("lead_id", broker.id) // Mocking lead_id as broker_id for thread purposes or using a different join
            .order("created_at", { ascending: true });

        setBrokerMessages(notes || []);
    };

    const handleCreatePremiumPortal = async (analysis: BrokerAnalysis) => {
        try {
            const { responses } = analysis;
            if (!responses?.email) return;

            // 1. Create / Update Broker Record
            const { data: broker, error: brokerError } = await supabase
                .from("brokers")
                .upsert({
                    email: responses.email,
                    firm_name: responses.firm_name,
                    contact_person: responses.full_name,
                    phone: responses.phone_number,
                    tier: selectedTier,
                    is_lead_loading: isLeadLoading,
                    status: 'active'
                }, { onConflict: 'email' })
                .select()
                .single();

            if (brokerError) throw brokerError;

            // 2. Generate Temp Credentials (Mocking Supabase Admin logic)
            // In a real app, you'd call a Supabase Edge Function to invite the user
            toast({
                title: "Premium Portal Provisioning",
                description: `Created ${selectedTier} portal for ${responses.full_name}. Temp password sent to ${responses.email}.`,
            });

            handleAction(analysis.id, 'proceed');
        } catch (e: any) {
            toast({ title: "Provisioning Failed", description: e.message, variant: "destructive" });
        }
    };

    const handleSendAdminNote = async (analysisId: string) => {
        // Logic to send note back to broker
        toast({ title: "Message Dispatched", description: "Your response has been sent to the broker portal." });
        setAdminMsg("");
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

    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-emerald-400";
        if (score >= 60) return "text-amber-400";
        return "text-rose-400";
    };

    const getProbabilityColor = (band: string) => {
        switch (band) {
            case 'High Probability': return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
            case 'Medium Probability': return "bg-amber-500/10 text-amber-400 border-amber-500/20";
            case 'Low Probability': return "bg-rose-500/10 text-rose-400 border-rose-500/20";
            default: return "bg-slate-500/10 text-slate-400 border-slate-500/20";
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black tracking-tighter text-white italic uppercase">Broker Intelligence Center</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Filtering high-velocity partners for elite growth</p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge className="bg-pink-600/10 text-pink-500 border-pink-500/20 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest">
                        Total Submissions: {analyses.length}
                    </Badge>
                </div>
            </div>

            <div className="grid gap-8">
                {analyses.length === 0 ? (
                    <Card className="bg-slate-900/20 border-2 border-dashed border-white/5 py-24 text-center rounded-[40px]">
                        <CardContent className="space-y-6">
                            <Users className="h-16 w-16 text-slate-800 mx-auto" />
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs italic">Awaiting new broker intake signals...</p>
                        </CardContent>
                    </Card>
                ) : (
                    analyses.map((analysis) => (
                        <Card
                            key={analysis.id}
                            className={cn(
                                "bg-[#020617] border-white/5 overflow-hidden transition-all duration-500 rounded-[40px] shadow-2xl",
                                expandedId === analysis.id ? "ring-2 ring-pink-500/20 scale-[1.01]" : "hover:bg-slate-900/50"
                            )}
                        >
                            <div
                                className="p-8 cursor-pointer flex flex-col xl:flex-row items-start xl:items-center justify-between gap-8 h-full"
                                onClick={() => setExpandedId(expandedId === analysis.id ? null : analysis.id)}
                            >
                                <div className="flex items-center gap-8 flex-1">
                                    <div className="h-16 w-16 rounded-[24px] bg-gradient-to-br from-pink-500 to-rose-700 flex items-center justify-center shrink-0 shadow-2xl shadow-pink-500/20">
                                        <Briefcase className="h-8 w-8 text-white" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                                                {analysis.responses?.full_name || "Anonymous Intake"}
                                            </h3>
                                            {analysis.status !== 'pending' && (
                                                <Badge className={cn(
                                                    "text-[9px] uppercase font-black px-4 py-1.5 rounded-full border shadow-xl",
                                                    analysis.status === 'proceed' ? "bg-emerald-500/20 text-emerald-400 border-emerald-400/20" :
                                                        analysis.status === 'hold' ? "bg-amber-500/20 text-amber-400 border-amber-400/20" :
                                                            "bg-rose-500/20 text-rose-400 border-rose-400/20"
                                                )}>
                                                    {analysis.status}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-6 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                            <span className="flex items-center gap-2">
                                                <Building className="h-3.5 w-3.5 text-pink-500" />
                                                {analysis.responses?.firm_name || 'Independent HQ'}
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <Target className="h-3.5 w-3.5 text-blue-500" />
                                                {analysis.responses?.product_focus_clarity || 'Universal'} Focus
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <Clock className="h-3.5 w-3.5 text-emerald-500" />
                                                {analysis.responses?.timeline_to_start || 'Immediate'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-12 w-full xl:w-auto">
                                    <div className="text-center xl:text-right">
                                        <p className="text-[9px] uppercase font-black text-slate-600 mb-2 tracking-widest italic leading-none">Velo Probability</p>
                                        <Badge className={cn("px-6 py-2 rounded-full border border-white/5 text-xs font-black italic shadow-2xl", getProbabilityColor(analysis.success_band))}>
                                            <Zap className="h-3.5 w-3.5 mr-2 animate-pulse" />
                                            {analysis.success_probability}% {analysis.success_band.split(' ')[0]}
                                        </Badge>
                                    </div>

                                    <div className="flex gap-10">
                                        {[
                                            { label: 'Ops', val: analysis.operational_score, icon: Users, color: 'text-blue-400' },
                                            { label: 'Budget', val: analysis.budget_score, icon: BarChart3, color: 'text-amber-400' },
                                            { label: 'Growth', val: analysis.growth_score, icon: TrendingUp, color: 'text-emerald-400' },
                                        ].map((score, i) => (
                                            <div key={i} className="text-center">
                                                <p className="text-[9px] uppercase font-black text-slate-600 mb-2 tracking-widest italic leading-none">{score.label}</p>
                                                <div className={cn("font-black text-2xl italic tracking-tighter", score.color)}>
                                                    {score.val}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="hidden sm:block">
                                        {expandedId === analysis.id ? (
                                            <ChevronDown className="h-6 w-6 text-slate-700" />
                                        ) : (
                                            <ChevronRight className="h-6 w-6 text-slate-700" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {expandedId === analysis.id && (
                                <div className="border-t border-white/[0.03] bg-white/[0.01] p-10 animate-in slide-in-from-top-4 duration-500">
                                    <div className="grid lg:grid-cols-4 gap-12">
                                        <div className="lg:col-span-3 space-y-12">
                                            {/* Submission Details Section */}
                                            <div className="space-y-10">
                                                {/* Contact Details Row */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-8 bg-white/[0.02] rounded-[32px] border border-white/5 shadow-2xl">
                                                    <div className="space-y-1 group">
                                                        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-2 flex items-center gap-2">
                                                            <Mail className="h-3 w-3 text-pink-500" /> Elite Email
                                                        </p>
                                                        <span className="text-sm font-bold text-white italic truncate block group-hover:text-pink-400 transition-colors">{analysis.responses?.email || 'OFF-GRID'}</span>
                                                    </div>
                                                    <div className="space-y-1 group">
                                                        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-2 flex items-center gap-2">
                                                            <Phone className="h-3 w-3 text-blue-500" /> Private Line
                                                        </p>
                                                        <span className="text-sm font-bold text-white italic block group-hover:text-blue-400 transition-colors">{analysis.responses?.phone_number || 'ENC-LOST'}</span>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-2 flex items-center gap-2">
                                                            <MapPin className="h-3 w-3 text-emerald-500" /> Operational Geo
                                                        </p>
                                                        <span className="text-sm font-bold text-white italic block">{analysis.responses?.geographic_focus_clarity || 'Global'}</span>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-2 flex items-center gap-2">
                                                            <Clock className="h-3 w-3 text-amber-500" /> Target Inception
                                                        </p>
                                                        <span className="text-sm font-bold text-white italic block">{analysis.responses?.timeline_to_start || 'ASAP'}</span>
                                                    </div>
                                                </div>

                                                <div className="grid md:grid-cols-2 gap-10">
                                                    {/* Budget & Capacity */}
                                                    <div className="space-y-6">
                                                        <h4 className="text-xs font-black uppercase tracking-[0.3em] text-pink-500 italic flex items-center gap-3">
                                                            <BarChart3 className="h-4 w-4" /> Capital & Throughput
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 shadow-xl group hover:bg-white/[0.04] transition-all">
                                                                <p className="text-[9px] uppercase text-slate-600 font-black tracking-widest mb-2 italic">Monthly Deployment</p>
                                                                <p className="text-lg font-black text-white italic tracking-tighter">{analysis.responses?.monthly_lead_spend || '-'}</p>
                                                            </div>
                                                            <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 shadow-xl group hover:bg-white/[0.04] transition-all">
                                                                <p className="text-[9px] uppercase text-slate-600 font-black tracking-widest mb-2 italic">CPL Tolerance</p>
                                                                <p className="text-lg font-black text-white italic tracking-tighter">{analysis.responses?.pricing_comfort || '-'}</p>
                                                            </div>
                                                            <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 shadow-xl group hover:bg-white/[0.04] transition-all">
                                                                <p className="text-[9px] uppercase text-slate-600 font-black tracking-widest mb-2 italic">Desired Inlet</p>
                                                                <p className="text-lg font-black text-white italic tracking-tighter">{analysis.responses?.desired_leads_weekly || '-'}/WK</p>
                                                            </div>
                                                            <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 shadow-xl group hover:bg-white/[0.04] transition-all">
                                                                <p className="text-[9px] uppercase text-slate-600 font-black tracking-widest mb-2 italic">Absorption Cap</p>
                                                                <p className="text-lg font-black text-white italic tracking-tighter">{analysis.responses?.max_capacity_weekly || '-'}/WK</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Systems & Process */}
                                                    <div className="space-y-6">
                                                        <h4 className="text-xs font-black uppercase tracking-[0.3em] text-blue-500 italic flex items-center gap-3">
                                                            <Zap className="h-4 w-4" /> Operational Stack
                                                        </h4>
                                                        <div className="space-y-4">
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 shadow-xl">
                                                                    <p className="text-[9px] uppercase text-slate-600 font-black tracking-widest mb-2 italic">CRM Protocol</p>
                                                                    <p className="text-lg font-black text-white italic tracking-tighter truncate">{analysis.responses?.crm_usage || 'MANUAL'}</p>
                                                                </div>
                                                                <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 shadow-xl">
                                                                    <p className="text-[9px] uppercase text-slate-600 font-black tracking-widest mb-2 italic">Response Velocity</p>
                                                                    <p className="text-lg font-black text-white italic tracking-tighter">{analysis.responses?.speed_to_contact || '-'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 shadow-xl">
                                                                <p className="text-[9px] uppercase text-slate-600 font-black tracking-widest mb-2 italic">Engagement Strategy</p>
                                                                <p className="text-sm text-slate-400 italic font-medium leading-relaxed">"{analysis.responses?.follow_up_process}"</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-8 pt-6 border-t border-white/[0.03]">
                                                <h4 className="text-xs font-black uppercase tracking-[0.4em] text-white flex items-center gap-4 italic mb-8">
                                                    <Sparkles className="h-5 w-5 text-yellow-500" /> ELITE ARCHITECT SUMMARY (GEN-AI)
                                                </h4>
                                                <div className="p-10 rounded-[40px] bg-gradient-to-br from-indigo-500/5 to-transparent border border-indigo-500/10 text-slate-300 leading-relaxed italic text-lg shadow-[0_32px_64px_-24px_rgba(0,0,0,0.5)]">
                                                    {analysis.ai_explanation || (
                                                        <div className="flex items-center gap-4 text-slate-600">
                                                            <Zap className="h-6 w-6 animate-pulse text-indigo-500" />
                                                            Synthesizing multi-vector analysis...
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid md:grid-cols-2 gap-10">
                                                <div className="space-y-6">
                                                    <h4 className="text-xs font-black uppercase tracking-[0.3em] text-rose-500 flex items-center gap-3 italic">
                                                        <AlertCircle className="h-4 w-4" /> Operational Fragility
                                                    </h4>
                                                    <div className="flex flex-wrap gap-3">
                                                        {analysis.risk_flags.length > 0 ? (
                                                            analysis.risk_flags.map((flag, i) => (
                                                                <Badge key={i} className="bg-rose-500/10 text-rose-400 border-rose-500/20 py-3 px-6 rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-xl">
                                                                    {flag}
                                                                </Badge>
                                                            ))
                                                        ) : (
                                                            <span className="text-xs text-slate-600 font-black uppercase tracking-widest italic">Zero volatility detected in primary vectors.</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    <h4 className="text-xs font-black uppercase tracking-[0.3em] text-emerald-500 flex items-center gap-3 italic">
                                                        <Target className="h-4 w-4" /> Strategic Leverage Point
                                                    </h4>
                                                    <div className="p-8 rounded-[32px] bg-emerald-500/5 border border-emerald-500/10 shadow-2xl relative overflow-hidden group">
                                                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        <p className="font-black text-2xl text-emerald-400 italic tracking-tighter mb-2 relative z-10">{analysis.primary_sales_angle}</p>
                                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic relative z-10">Primary anchor for conversion cycle.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Administration Control Panel */}
                                        <div className="space-y-8 flex flex-col h-full">
                                            <div className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 space-y-8 shadow-2xl sticky top-32">
                                                <h4 className="text-xs font-black uppercase tracking-[0.3em] text-white italic text-center mb-4">Command Actions</h4>

                                                <div className="space-y-6">
                                                    <div className="space-y-4 bg-white/[0.03] p-6 rounded-3xl border border-white/5">
                                                        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest italic mb-2">Assign Tier & Configuration</p>
                                                        <select
                                                            className="w-full bg-[#020617] border-white/10 rounded-xl h-12 px-4 text-xs font-black uppercase tracking-widest text-white focus:ring-pink-500/20 focus:border-pink-500/50 outline-none transition-all"
                                                            value={selectedTier}
                                                            onChange={(e) => setSelectedTier(e.target.value)}
                                                        >
                                                            <option value="Pilot">Pilot System</option>
                                                            <option value="Bronze">Bronze Membership</option>
                                                            <option value="Silver">Silver Elite</option>
                                                            <option value="Gold">Gold Supremacy</option>
                                                        </select>

                                                        <div className="flex items-center justify-between pt-4">
                                                            <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest italic">Lead Loading Status</span>
                                                            <button
                                                                onClick={() => setIsLeadLoading(!isLeadLoading)}
                                                                className={cn(
                                                                    "h-6 w-12 rounded-full transition-all duration-500 p-1 flex items-center shadow-xl",
                                                                    isLeadLoading ? "bg-emerald-500" : "bg-slate-800"
                                                                )}
                                                            >
                                                                <div className={cn("h-4 w-4 bg-white rounded-full transition-all transform", isLeadLoading ? "translate-x-6" : "translate-x-0")} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <Button
                                                        size="lg"
                                                        className="w-full bg-white text-black hover:bg-slate-200 rounded-[24px] h-16 font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-white/5 group"
                                                        onClick={() => handleCreatePremiumPortal(analysis)}
                                                        disabled={analysis.status === 'proceed'}
                                                    >
                                                        <Sparkles className="mr-3 h-5 w-5 group-hover:rotate-12 transition-transform" />
                                                        Provision Portal
                                                    </Button>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <Button
                                                            variant="outline"
                                                            className="border-white/5 bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl h-14 font-black uppercase tracking-widest text-[9px] transition-all"
                                                            onClick={() => handleAction(analysis.id, 'hold')}
                                                            disabled={analysis.status === 'hold'}
                                                        >
                                                            <Clock className="mr-2 h-4 w-4" />
                                                            Hold
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            className="border-white/5 bg-white/[0.02] text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 rounded-2xl h-14 font-black uppercase tracking-widest text-[9px] transition-all"
                                                            onClick={() => handleAction(analysis.id, 'decline')}
                                                            disabled={analysis.status === 'decline'}
                                                        >
                                                            <XCircle className="mr-2 h-4 w-4" />
                                                            Purge
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="space-y-4 pt-8 border-t border-white/[0.03]">
                                                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-3 italic">
                                                        <MessageSquare className="h-4 w-4 text-pink-500" /> Dispatch Response
                                                    </h4>
                                                    <div className="relative group">
                                                        <Textarea
                                                            placeholder="Enter message for broker dashboard..."
                                                            className="bg-[#020617] border-white/10 min-h-[100px] text-xs font-bold rounded-2xl p-4 focus:ring-pink-500/20 focus:border-pink-500/50 transition-all placeholder:text-slate-700"
                                                            value={adminMsg}
                                                            onChange={(e) => setAdminMsg(e.target.value)}
                                                        />
                                                        <Button
                                                            size="icon"
                                                            className="absolute right-3 bottom-3 bg-pink-600 hover:bg-pink-700 h-8 w-8 rounded-xl shadow-xl shadow-pink-500/20"
                                                            onClick={() => handleSendAdminNote(analysis.id)}
                                                        >
                                                            <ChevronRight className="h-4 w-4" />
                                                        </Button>
                                                    </div>
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
