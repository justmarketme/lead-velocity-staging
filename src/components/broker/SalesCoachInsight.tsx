import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Brain,
    CheckCircle2,
    AlertCircle,
    Zap,
    MessageSquare,
    TrendingUp,
    ShieldCheck,
    Clock,
    User
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface SalesCoachInsightProps {
    brokerId: string;
}

const SalesCoachInsight = ({ brokerId }: SalesCoachInsightProps) => {
    const [latestCoaching, setLatestCoaching] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCoaching = async () => {
            const { data, error } = await supabase
                .from('call_coaching')
                .select('*, ai_call_requests(*)')
                .eq('broker_id', brokerId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data) setLatestCoaching(data);
            setLoading(false);
        };

        fetchCoaching();

        // Subscription for real-time coaching updates
        const channel = supabase
            .channel('coaching-updates')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'call_coaching',
                filter: `broker_id=eq.${brokerId}`
            }, (payload) => {
                setLatestCoaching(payload.new);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [brokerId]);

    if (loading) return <div className="h-48 flex items-center justify-center"><Brain className="animate-pulse text-pink-500" /></div>;
    if (!latestCoaching) return null;

    const scorecard = latestCoaching.scorecard || {};
    const feedback = latestCoaching.coach_feedback?.detailed || [];
    const compliance = latestCoaching.fsca_compliance || {};

    return (
        <Card className="bg-[#020617] border-white/5 backdrop-blur-3xl overflow-hidden rounded-[40px] shadow-2xl border-l-4 border-l-pink-500">
            <CardHeader className="p-8 border-b border-white/[0.03]">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className="bg-pink-500/10 p-3 rounded-2xl">
                            <Brain className="w-6 h-6 text-pink-500" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-black text-white italic tracking-tighter uppercase">AI Sales Coach</CardTitle>
                            <CardDescription className="text-slate-500 font-bold text-[10px] uppercase tracking-widest text-pink-500/80">
                                Einstein Intelligence • Latest Analysis
                            </CardDescription>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-black text-white italic tracking-tighter">{latestCoaching.total_score || 0}<span className="text-lg text-slate-500">/100</span></div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Performance Score</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                {/* Summary Bullets */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] italic flex items-center gap-2">
                            <User className="w-3 h-3" /> Call Intelligence: {latestCoaching.client_name}
                        </h4>
                        <div className="space-y-2">
                            {latestCoaching.summary_bullets?.map((bullet: string, i: number) => (
                                <div key={i} className="flex gap-3 text-sm text-slate-300">
                                    <span className="text-pink-500 font-black">•</span>
                                    <span>{bullet}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stats Matrix */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] italic">Metric Breakdown</h4>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: "Rapport", val: scorecard.rapport },
                                { label: "Listening", val: scorecard.listening },
                                { label: "Objections", val: scorecard.objection_handling },
                                { label: "Closing", val: scorecard.close }
                            ].map(m => (
                                <div key={m.label} className="bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                    <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                                        <span className="text-slate-500">{m.label}</span>
                                        <span className="text-white">{m.val}/25</span>
                                    </div>
                                    <Progress value={(m.val / 25) * 100} className="h-1" indicatorClassName="bg-pink-500" />
                                </div>
                            ))}
                        </div>
                        {scorecard.compliance_bonus > 0 && (
                            <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                <ShieldCheck className="w-3 h-3" /> +10 Compliance Bonus Applied
                            </div>
                        )}
                    </div>
                </div>

                {/* Feedback & Techniques */}
                <div className="space-y-4 pt-4 border-t border-white/[0.03]">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] italic flex items-center gap-2">
                        <Zap className="w-3 h-3" /> Technique Analysis
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {feedback.map((f: any, i: number) => (
                            <div key={i} className="flex gap-4 p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                                <div className="text-xs font-black text-pink-500 w-12">{f.timestamp}</div>
                                <div>
                                    <div className="text-[10px] font-black text-white uppercase tracking-tight mb-1">{f.technique}</div>
                                    <p className="text-xs text-slate-400 italic line-clamp-2">{f.comment}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Bar: WhatsApp & Compliance */}
                <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-4 border-t border-white/[0.03]">
                    <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                            <MessageSquare className="w-3 h-3" /> WhatsApp Sent:
                        </div>
                        <div className="bg-emerald-500/5 text-emerald-300 text-xs p-3 rounded-xl border border-emerald-500/10 italic w-full">
                            "{latestCoaching.whatsapp_sent || "Fetching message content..."}"
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${compliance.is_compliant ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-500'}`}>
                            {compliance.is_compliant ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {compliance.status_text || "FSCA SCAN"}
                        </div>
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-tight">
                            {format(new Date(latestCoaching.created_at), 'MMM d, h:mm a')}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default SalesCoachInsight;
