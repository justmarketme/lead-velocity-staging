import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
    Zap,
    Target,
    TrendingUp,
    Users,
    Calendar as CalendarIcon,
    FileText,
    Crown,
    ChevronRight,
    ArrowUpRight,
    Bell,
    Sparkles
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from "recharts";

interface PremiumDashboardProps {
    brokerData: any;
    stats: any;
    leadsData: any[];
}

const PremiumDashboard = ({ brokerData, stats, leadsData }: PremiumDashboardProps) => {
    const [view, setView] = useState<"week" | "month" | "year">("month");

    // Mock data for charts - scaling based on view
    const getChartData = () => {
        if (view === 'week') {
            return [
                { name: "Mon", leads: 4, conversions: 1 },
                { name: "Tue", leads: 7, conversions: 2 },
                { name: "Wed", leads: 5, conversions: 3 },
                { name: "Thu", leads: 8, conversions: 2 },
                { name: "Fri", leads: 12, conversions: 5 },
                { name: "Sat", leads: 3, conversions: 1 },
                { name: "Sun", leads: 2, conversions: 0 },
            ];
        } else if (view === 'month') {
            return [
                { name: "Week 1", leads: 25, conversions: 8 },
                { name: "Week 2", leads: 32, conversions: 12 },
                { name: "Week 3", leads: 28, conversions: 9 },
                { name: "Week 4", leads: 45, conversions: 18 },
            ];
        } else {
            return [
                { name: "Jan", leads: 120, conversions: 40 },
                { name: "Feb", leads: 150, conversions: 55 },
                { name: "Mar", leads: 180, conversions: 70 },
                { name: "Apr", leads: 140, conversions: 45 },
                { name: "May", leads: 160, conversions: 60 },
                { name: "Jun", leads: 200, conversions: 85 },
            ];
        }
    };

    const quotaPercentage = (brokerData?.leads_used / (brokerData?.lead_quota || 100)) * 100;

    const getTierColor = (tier: string) => {
        switch (tier?.toLowerCase()) {
            case 'pilot': return 'from-slate-400 to-slate-900';
            case 'bronze': return 'from-orange-600 to-amber-900';
            case 'silver': return 'from-slate-300 to-slate-600';
            case 'gold': return 'from-amber-400 to-yellow-700';
            default: return 'from-pink-600 to-rose-900';
        }
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-1000">
            {/* Hero / Tier Banner */}
            <div className={`relative overflow-hidden rounded-[40px] bg-gradient-to-br ${getTierColor(brokerData?.tier)} p-12 text-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/10`}>
                <div className="absolute top-0 right-0 -mt-24 -mr-24 h-96 w-96 rounded-full bg-white/10 blur-[100px] animate-pulse" />
                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <Badge className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-xl px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">
                                <Crown className="w-3.5 h-3.5 mr-2 text-yellow-400" /> {brokerData?.tier} STATUS
                            </Badge>
                            {brokerData?.is_lead_loading && (
                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 backdrop-blur-xl px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                                    <Zap className="w-3.5 h-3.5 mr-2" /> Lead Loading Online
                                </Badge>
                            )}
                        </div>
                        <h1 className="text-6xl font-black tracking-tighter italic uppercase leading-none">Welcome back, <br />{brokerData?.contact_person}</h1>
                        <p className="text-white/70 max-w-lg font-medium text-lg leading-relaxed">
                            Scaling operations at <span className="text-white font-bold">{brokerData?.firm_name}</span>.
                            {quotaPercentage > 85 ? " Critical lead quota remaining—upgrade recommended." : " Optimal velocity maintained across all sectors."}
                        </p>
                    </div>

                    <div className="bg-black/30 backdrop-blur-3xl p-8 rounded-[32px] border border-white/5 w-full xl:w-auto min-w-[360px] shadow-2xl">
                        <div className="flex justify-between items-end mb-4">
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-white/50 italic">Monthly Lead Quota</span>
                            <span className="text-4xl font-black italic tracking-tighter">{brokerData?.leads_used} / {brokerData?.lead_quota}</span>
                        </div>
                        <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                            <Progress value={quotaPercentage} className="h-full bg-transparent" indicatorClassName="bg-gradient-to-r from-white/40 to-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]" />
                        </div>
                        <div className="flex justify-between mt-4">
                            <p className="text-[10px] opacity-40 font-black uppercase tracking-widest italic">Inventory Refill: 12D</p>
                            <p className="text-[10px] text-white font-black uppercase tracking-widest italic animate-pulse">Tier: {brokerData?.tier}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <Card className="lg:col-span-2 bg-[#020617] border-white/5 backdrop-blur-3xl overflow-hidden group rounded-[40px] shadow-2xl">
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/[0.03] p-8 gap-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-pink-500/10 p-3 rounded-2xl">
                                <TrendingUp className="w-6 h-6 text-pink-500" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-black text-white italic tracking-tighter uppercase">Market Velocity</CardTitle>
                                <CardDescription className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Real-time performance tracking</CardDescription>
                            </div>
                        </div>
                        <div className="flex bg-white/[0.03] border border-white/5 rounded-2xl p-1.5 backdrop-blur-md">
                            {['week', 'month', 'year'].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setView(t as any)}
                                    className={`px-5 py-2 text-[10px] font-black uppercase rounded-xl transition-all duration-500 tracking-widest ${view === t
                                        ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-xl shadow-pink-600/30'
                                        : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-10">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={getChartData()}>
                                    <defs>
                                        <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                                    <XAxis dataKey="name" stroke="#475569" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} tickFormatter={(v) => v.toUpperCase()} />
                                    <YAxis stroke="#475569" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', padding: '16px' }}
                                        itemStyle={{ color: '#ec4899', fontWeight: '900', fontSize: '12px' }}
                                        labelStyle={{ color: '#ffffff', fontWeight: '900', marginBottom: '8px', fontSize: '14px', fontStyle: 'italic' }}
                                    />
                                    <Area type="monotone" dataKey="leads" stroke="#ec4899" strokeWidth={4} fillOpacity={1} fill="url(#colorLeads)" animationDuration={2000} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* AI Insight / Tips Card */}
                <Card className="bg-[#020617] border-white/5 backdrop-blur-3xl relative overflow-hidden flex flex-col rounded-[40px] shadow-2xl">
                    <div className="absolute top-0 right-0 p-8">
                        <Sparkles className="w-10 h-10 text-yellow-500/20" />
                    </div>
                    <CardHeader className="p-8">
                        <CardTitle className="text-2xl font-black text-white italic tracking-tighter uppercase">Elite Intel</CardTitle>
                        <CardDescription className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">AI-driven strategy</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 space-y-8 flex-1 flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="bg-white/[0.02] p-6 rounded-[32px] border border-white/5 space-y-4 hover:bg-white/[0.04] transition-all cursor-default group border-l-4 border-l-pink-500">
                                <div className="flex items-center gap-2 text-pink-400 font-black text-[10px] uppercase tracking-[0.2em] italic">
                                    <Target className="w-3.5 h-3.5" /> High-Value Pivot
                                </div>
                                <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                    Your <span className="text-white font-black">Life Insurance</span> sector is outperforming the benchmark by <span className="text-pink-500 font-black">32%</span>. Recommend aggressive focus on these leads.
                                </p>
                            </div>

                            <div className="bg-white/[0.02] p-6 rounded-[32px] border border-white/5 space-y-4 hover:bg-white/[0.04] transition-all cursor-default border-l-4 border-l-yellow-500">
                                <div className="flex items-center gap-2 text-yellow-500 font-black text-[10px] uppercase tracking-[0.2em] italic">
                                    <Bell className="w-3.5 h-3.5" /> Latency Warning
                                </div>
                                <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                    Lead response time is averaging <span className="text-white font-black">4.2 hours</span>. Reducing this by 50% could increase conversion by <span className="text-emerald-500 font-black">€14k MRR</span>.
                                </p>
                            </div>
                        </div>

                        <Button className="w-full bg-white text-black hover:bg-slate-200 font-black h-14 rounded-2xl text-[10px] uppercase tracking-[0.2em] group">
                            Full Strategy Module <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Access Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10">
                {[
                    { title: "Meetings", icon: CalendarIcon, color: "text-blue-400", bg: "bg-blue-400/5", value: stats.appointmentsScheduled, label: "Active Agenda" },
                    { title: "Prospects", icon: Users, color: "text-purple-400", bg: "bg-purple-400/5", value: stats.totalLeads, label: "Filtered Intel" },
                    { title: "Closures", icon: FileText, color: "text-emerald-400", bg: "bg-emerald-400/5", value: stats.willsCompleted, label: "Success Archive" },
                    { title: "Settlements", icon: CreditCard, color: "text-orange-400", bg: "bg-orange-400/5", value: "3", label: "Pending Ledger" },
                ].map((item) => (
                    <Card key={item.title} className="bg-[#020617] border-white/5 hover:border-pink-500/20 transition-all cursor-pointer group rounded-[32px] shadow-xl overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-8 relative z-10">
                            <div className="flex items-start justify-between mb-8">
                                <div className={`p-4 rounded-2xl ${item.bg} border border-white/5`}>
                                    <item.icon className={`w-8 h-8 ${item.color} group-hover:scale-110 transition-transform duration-500`} />
                                </div>
                                <ArrowUpRight className="w-5 h-5 text-slate-700 group-hover:text-white transition-all transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                            </div>
                            <div>
                                <p className="text-5xl font-black text-white italic tracking-tighter mb-2">{item.value}</p>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">{item.title}</p>
                                <p className="text-[10px] text-slate-700 font-bold uppercase tracking-widest">{item.label}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};


export default PremiumDashboard;
