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
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">Broker Onboarding Submissions</h1>
                <p className="text-slate-400">Review and manage incoming broker applications</p>
            </div>

            <div className="grid gap-6">
                {analyses.length === 0 ? (
                    <Card className="bg-slate-900/40 border-white/5 py-12 text-center">
                        <CardContent className="space-y-4">
                            <Users className="h-12 w-12 text-slate-500 mx-auto" />
                            <p className="text-slate-400">No broker responses found yet.</p>
                        </CardContent>
                    </Card>
                ) : (
                    analyses.map((analysis) => (
                        <Card
                            key={analysis.id}
                            className={cn(
                                "bg-slate-900/40 border-white/5 overflow-hidden transition-all duration-300",
                                expandedId === analysis.id ? "ring-1 ring-primary/30" : "hover:bg-slate-800/40"
                            )}
                        >
                            <div
                                className="p-6 cursor-pointer flex items-center justify-between gap-6"
                                onClick={() => setExpandedId(expandedId === analysis.id ? null : analysis.id)}
                            >
                                <div className="flex items-center gap-6 flex-1">
                                    <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                        <Briefcase className="h-6 w-6 text-primary" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            {analysis.responses?.full_name || "New Broker Intake"}
                                            {analysis.status !== 'pending' && (
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px] uppercase font-black px-2 py-0",
                                                    analysis.status === 'proceed' ? "bg-emerald-500/10 text-emerald-400 border-emerald-400/20" :
                                                        analysis.status === 'hold' ? "bg-amber-500/10 text-amber-400 border-amber-400/20" :
                                                            "bg-rose-500/10 text-rose-400 border-rose-400/20"
                                                )}>
                                                    {analysis.status}
                                                </Badge>
                                            )}
                                        </h3>
                                        <div className="flex items-center gap-4 text-xs text-slate-400">
                                            <span className="flex items-center gap-1">
                                                <Building className="h-3 w-3" />
                                                {analysis.responses?.firm_name || 'Independent'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Target className="h-3 w-3" />
                                                {analysis.responses?.product_focus_clarity || 'Undefined'} Focus
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {analysis.responses?.timeline_to_start || 'Immediate'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-12">
                                    <div className="text-center">
                                        <p className="text-[10px] uppercase font-black text-slate-500 mb-1">Success Probability</p>
                                        <Badge className={cn("px-4 py-1.5 rounded-full border border-white/5", getProbabilityColor(analysis.success_band))}>
                                            <Zap className="h-3 w-3 mr-2" />
                                            {analysis.success_probability}% - {analysis.success_band}
                                        </Badge>
                                    </div>

                                    <div className="flex gap-8">
                                        {[
                                            { label: 'Ops', val: analysis.operational_score, icon: Users },
                                            { label: 'Budget', val: analysis.budget_score, icon: BarChart3 },
                                            { label: 'Growth', val: analysis.growth_score, icon: TrendingUp },
                                        ].map((score, i) => (
                                            <div key={i} className="text-center">
                                                <p className="text-[10px] uppercase font-black text-slate-500 mb-1">{score.label}</p>
                                                <div className={cn("font-bold text-lg", getScoreColor(score.val))}>
                                                    {score.val}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {expandedId === analysis.id ? (
                                        <ChevronDown className="h-5 w-5 text-slate-500" />
                                    ) : (
                                        <ChevronRight className="h-5 w-5 text-slate-500" />
                                    )}
                                </div>
                            </div>

                            {expandedId === analysis.id && (
                                <div className="border-t border-white/5 bg-slate-900/60 p-8 animate-in slide-in-from-top-2 duration-300">
                                    <div className="grid lg:grid-cols-3 gap-8">
                                        <div className="lg:col-span-2 space-y-8">
                                            {/* Submission Details Section */}
                                            <div className="space-y-6">
                                                {/* Contact Details Row */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-900/50 rounded-xl border border-white/5">
                                                    <div className="flex items-center gap-3 text-slate-300">
                                                        <Mail className="h-4 w-4 text-primary" />
                                                        <span className="text-xs truncate">{analysis.responses?.email || 'No email'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-slate-300">
                                                        <Phone className="h-4 w-4 text-primary" />
                                                        <span className="text-xs">{analysis.responses?.phone_number || 'No phone'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-slate-300">
                                                        <Target className="h-4 w-4 text-primary" />
                                                        <span className="text-xs">{analysis.responses?.geographic_focus_clarity || 'National'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-slate-300">
                                                        <Clock className="h-4 w-4 text-primary" />
                                                        <span className="text-xs">{analysis.responses?.timeline_to_start || 'ASAP'}</span>
                                                    </div>
                                                </div>

                                                {/* Budget & Capacity */}
                                                <div className="space-y-4">
                                                    <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                                                        <BarChart3 className="h-4 w-4" /> Budget & Capacity
                                                    </h4>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                        <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Monthly Budget</p>
                                                            <p className="text-sm font-medium text-white">{analysis.responses?.monthly_lead_spend || '-'}</p>
                                                        </div>
                                                        <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Comfort Per Lead</p>
                                                            <p className="text-sm font-medium text-white">{analysis.responses?.pricing_comfort || '-'}</p>
                                                        </div>
                                                        <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Ideal Leads/Week</p>
                                                            <p className="text-sm font-medium text-white">{analysis.responses?.desired_leads_weekly || '-'}</p>
                                                        </div>
                                                        <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Max Capacity</p>
                                                            <p className="text-sm font-medium text-white">{analysis.responses?.max_capacity_weekly || '-'}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Target Market */}
                                                <div className="space-y-4">
                                                    <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                                                        <Target className="h-4 w-4" /> Target Market & Growth
                                                    </h4>
                                                    <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5 space-y-3">
                                                        <div>
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Product Focus</p>
                                                            <p className="text-sm text-slate-300">{analysis.responses?.product_focus_clarity}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Growth Goals</p>
                                                            <p className="text-sm text-slate-300">{analysis.responses?.growth_goal_clarity}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Systems & Process */}
                                                <div className="space-y-4">
                                                    <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                                                        <Zap className="h-4 w-4" /> Systems & Process
                                                    </h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">CRM Used</p>
                                                            <p className="text-sm font-medium text-white">{analysis.responses?.crm_usage || 'None'}</p>
                                                        </div>
                                                        <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Speed to Contact</p>
                                                            <p className="text-sm font-medium text-white">{analysis.responses?.speed_to_contact || '-'}</p>
                                                        </div>
                                                        <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                            <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Team Size</p>
                                                            <p className="text-sm font-medium text-white">{analysis.responses?.team_size || 'Solo'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-slate-800/30 rounded-lg border border-white/5">
                                                        <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Follow-up Process</p>
                                                        <p className="text-sm text-slate-300 italic">"{analysis.responses?.follow_up_process}"</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border-t border-white/10 pt-6">
                                                <h4 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4">
                                                    <Info className="h-4 w-4" /> AI Analysis & Strategy
                                                </h4>
                                                <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/5 text-slate-300 leading-relaxed whitespace-pre-line">
                                                    {analysis.ai_explanation || (
                                                        <div className="flex items-center gap-3 text-slate-500 italic">
                                                            <Zap className="h-4 w-4 animate-pulse" />
                                                            AI Analysis pending... Gemini is generating explanations.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid md:grid-cols-2 gap-6">
                                                <div className="space-y-4">
                                                    <h4 className="text-sm font-black uppercase tracking-widest text-rose-400 flex items-center gap-2">
                                                        <AlertCircle className="h-4 w-4" /> Risk Flags
                                                    </h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {analysis.risk_flags.length > 0 ? (
                                                            analysis.risk_flags.map((flag, i) => (
                                                                <Badge key={i} variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 py-2 px-4 rounded-xl">
                                                                    {flag}
                                                                </Badge>
                                                            ))
                                                        ) : (
                                                            <span className="text-xs text-slate-500 italic">No major risks identified.</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <h4 className="text-sm font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                                                        <Target className="h-4 w-4" /> Recommended Sales Angle
                                                    </h4>
                                                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                                                        <p className="font-bold text-emerald-400">{analysis.primary_sales_angle}</p>
                                                        <p className="text-xs text-slate-400 mt-1 italic">Use this as the primary anchor for the strategy session.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions & Internal Notes */}
                                        <div className="space-y-6">
                                            <div className="p-6 rounded-3xl bg-slate-800/50 border border-white/5 space-y-6">
                                                <h4 className="text-sm font-black uppercase tracking-widest text-white">Admin Actions</h4>

                                                <div className="flex flex-col gap-3">
                                                    <Button
                                                        size="lg"
                                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl h-14 font-bold"
                                                        onClick={() => handleAction(analysis.id, 'proceed')}
                                                        disabled={analysis.status === 'proceed'}
                                                    >
                                                        <CheckCircle2 className="mr-2 h-5 w-5" />
                                                        Proceed to Meeting
                                                    </Button>
                                                    <Button
                                                        size="lg"
                                                        variant="outline"
                                                        className="w-full border-amber-600/30 text-amber-400 hover:bg-amber-600/10 rounded-xl h-14 font-bold"
                                                        onClick={() => handleAction(analysis.id, 'hold')}
                                                        disabled={analysis.status === 'hold'}
                                                    >
                                                        <Clock className="mr-2 h-5 w-5" />
                                                        Place on Hold
                                                    </Button>
                                                    <Button
                                                        size="lg"
                                                        variant="outline"
                                                        className="w-full border-rose-600/30 text-rose-400 hover:bg-rose-600/10 rounded-xl h-14 font-bold"
                                                        onClick={() => handleAction(analysis.id, 'decline')}
                                                        disabled={analysis.status === 'decline'}
                                                    >
                                                        <XCircle className="mr-2 h-5 w-5" />
                                                        Decline / Low Fit
                                                    </Button>
                                                </div>

                                                <div className="space-y-3 pt-4 border-t border-white/5">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                        <MessageSquare className="h-3 w-3" /> Admin Notes
                                                    </h4>
                                                    <ScrollArea className="h-32 rounded-xl bg-white/5 p-4 text-xs text-slate-300 border border-white/5">
                                                        {analysis.admin_notes || "Add internal notes here..."}
                                                    </ScrollArea>
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
