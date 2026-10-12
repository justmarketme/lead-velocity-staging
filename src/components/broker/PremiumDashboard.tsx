/**
 * Broker portal home (/broker-elite, tab "dashboard"). Real data only: the broker's plan and cycle (src/lib/brokerPlan.ts),
 * his own leads, appointments and paid orders. No sample charts, no performance claims (FAIS): numbers are counts of
 * what actually happened for this broker, and empty states say so plainly.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, Clock, Package, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SalesCoachInsight from "./SalesCoachInsight";
import { BrokerPlanState, loadLeadsPerWeek } from "@/lib/brokerPlan";
import { TERMS, zar } from "@/lib/pricing";

interface PremiumDashboardProps {
    brokerData: any;
    stats: { totalLeads: number; appointmentsScheduled: number };
    planState: BrokerPlanState | null;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

const PremiumDashboard = ({ brokerData, stats, planState }: PremiumDashboardProps) => {
    const [weeks, setWeeks] = useState<{ week: string; leads: number }[] | null>(null);
    useEffect(() => {
        if (!brokerData?.id) return;
        let alive = true;
        void loadLeadsPerWeek(brokerData.id).then((w) => { if (alive) setWeeks(w); });
        return () => { alive = false; };
    }, [brokerData?.id]);

    const plan = planState?.plan || null;
    const cycle = planState?.cycle || null;
    const anyLeadsRecently = !!weeks?.some((w) => w.leads > 0);
    const firstName = String(brokerData?.contact_person || "").split(" ")[0];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Plan and cycle */}
            <Card className="bg-[#020617] border-white/5 rounded-[32px] shadow-2xl overflow-hidden">
                <CardContent className="p-6 sm:p-10 flex flex-col xl:flex-row justify-between gap-8">
                    <div className="space-y-3 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-500">Your plan</p>
                        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                            {firstName ? `Hi ${firstName}` : "Welcome"}
                        </h1>
                        <p className="text-slate-400 max-w-xl">
                            {brokerData?.firm_name ? <><span className="text-white font-semibold">{brokerData.firm_name}</span> · </> : null}
                            {plan
                                ? <>{plan.name} plan: {plan.committed_leads} Qualified Leads per {TERMS.cycle_days}-day cycle, {zar(plan.price_zar)} excl. VAT, paid in advance.</>
                                : <>Your plan hasn't been set up yet. Lead Velocity will confirm it with you.</>}
                        </p>
                    </div>

                    <div className="bg-white/[0.03] p-6 rounded-[24px] border border-white/5 w-full xl:w-[380px] shrink-0">
                        {cycle ? (
                            <>
                                <div className="flex justify-between items-end mb-3">
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">This cycle</span>
                                    <span className="text-3xl font-black text-white">{cycle.delivered} / {cycle.committed}</span>
                                </div>
                                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-pink-600 to-rose-500 rounded-full" style={{ width: `${Math.min(100, cycle.committed ? (cycle.delivered / cycle.committed) * 100 : 0)}%` }} />
                                </div>
                                <p className="text-xs text-slate-400 mt-3">
                                    Leads delivered · day {cycle.day} of {TERMS.cycle_days} · cycle ends {fmtDate(cycle.end)}
                                </p>
                            </>
                        ) : (
                            <div className="flex gap-3">
                                <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-white">Awaiting payment</p>
                                    <p className="text-sm text-slate-400 mt-1">
                                        {plan
                                            ? `Your ${plan.name} plan (${plan.committed_leads} leads / ${TERMS.cycle_days} days) starts when payment clears.`
                                            : "Your first cycle starts when payment clears."}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Real counts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                    { title: "Leads delivered", icon: Users, color: "text-purple-400", value: stats.totalLeads, label: "All time" },
                    { title: "Appointments", icon: CalendarIcon, color: "text-blue-400", value: stats.appointmentsScheduled, label: "Booked with you" },
                    { title: "Paid orders", icon: Package, color: "text-emerald-400", value: planState?.paidOrdersCount ?? 0, label: planState?.paidOrder ? `Last paid ${fmtDate(new Date(planState.paidOrder.paid_at))}` : "None yet" },
                ].map((item) => (
                    <Card key={item.title} className="bg-[#020617] border-white/5 rounded-[24px] shadow-xl">
                        <CardContent className="p-6 flex items-center gap-5">
                            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5"><item.icon className={`w-6 h-6 ${item.color}`} /></div>
                            <div>
                                <p className="text-3xl font-black text-white">{item.value}</p>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.title}</p>
                                <p className="text-xs text-slate-500">{item.label}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Leads per week, from his own leads */}
            <Card className="bg-[#020617] border-white/5 rounded-[32px] shadow-2xl overflow-hidden">
                <CardHeader className="p-6 sm:p-8 pb-2">
                    <CardTitle className="text-xl font-black text-white">Leads per week</CardTitle>
                    <CardDescription className="text-slate-500">Leads delivered to you over the last 8 weeks.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 sm:p-8 pt-4">
                    {weeks === null ? (
                        <p className="text-sm text-slate-500">Loading…</p>
                    ) : !anyLeadsRecently ? (
                        <p className="text-sm text-slate-500">No leads delivered in the last 8 weeks. Your leads will show here week by week once delivery starts.</p>
                    ) : (
                        <div className="h-[260px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weeks}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                                    <XAxis dataKey="week" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #ffffff1a", borderRadius: 12 }} labelStyle={{ color: "#fff" }} itemStyle={{ color: "#ec4899" }} formatter={(v: number) => [v, "Leads"]} labelFormatter={(l) => `Week of ${l}`} />
                                    <Bar dataKey="leads" fill="#ec4899" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Call coaching: shown only when a real coached call exists for this broker */}
            {brokerData?.id && <SalesCoachInsight brokerId={brokerData.id} />}
        </div>
    );
};

export default PremiumDashboard;
