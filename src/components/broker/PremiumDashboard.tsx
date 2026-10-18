/**
 * Broker portal home (/broker-elite, tab "dashboard"). Real data only: the broker's plan and cycle (src/lib/brokerPlan.ts),
 * his own leads, appointments and paid orders. No sample charts, no performance claims (FAIS): numbers are counts of
 * what actually happened for this broker, and empty states say so plainly.
 */
import type { PortalBroker } from "@/types/groupB-broker";
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Calendar as CalendarIcon, Clock, Package, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SalesCoachInsight from "./SalesCoachInsight";
import AdApprovals from "./smc/AdApprovals";
import { MessageUsCard } from "./smc/MessageUs";
import GettingStarted from "./GettingStarted";
import type { ProfilePatch } from "./ProfileForms";
import { SignedAgreementCard } from "./PremiumDocuments";
import { CountUp, EASE, FadeIn, Skeleton, Stagger, StaggerItem, m } from "./motion";
import { BrokerPlanState, loadLeadsPerWeek } from "@/lib/brokerPlan";
import { TERMS, zar } from "@/lib/pricing";

type Tab = "dashboard" | "leads" | "calendar" | "intro" | "documents" | "settings";

interface PremiumDashboardProps {
    brokerData: PortalBroker | null;
    stats: { totalLeads: number; appointmentsScheduled: number };
    planState: BrokerPlanState | null;
    onGo: (tab: Tab) => void;
    onBrokerPatch: (p: ProfilePatch) => void;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const card = "rounded-[28px] border border-white/10 bg-white/[0.02]";

const PremiumDashboard = ({ brokerData, stats, planState, onGo, onBrokerPatch }: PremiumDashboardProps) => {
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
        <Stagger className="space-y-6 sm:space-y-8">
            <StaggerItem>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{firstName ? `Hi ${firstName}` : "Welcome"}</h1>
                {brokerData?.firm_name && <p className="text-slate-400 mt-1">{brokerData.firm_name}</p>}
            </StaggerItem>

            <StaggerItem><GettingStarted broker={brokerData} planState={planState} onGo={onGo} onBrokerPatch={onBrokerPatch} /></StaggerItem>

            {/* Ads featuring him that wait for his approval (renders nothing when there are none) */}
            <StaggerItem><AdApprovals broker={brokerData} onChanged={onBrokerPatch} /></StaggerItem>

            <StaggerItem><MessageUsCard brokerId={brokerData?.id} /></StaggerItem>

            {/* Plan and cycle */}
            <StaggerItem>
                <section className={`${card} p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6`} aria-labelledby="plan-title">
                    <div className="min-w-0">
                        <p id="plan-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-400">Your plan</p>
                        <AnimatePresence mode="wait">
                            {planState === null ? (
                                <m.div key="sk" className="mt-3 space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-72 max-w-full" /></m.div>
                            ) : (
                                <FadeIn key="plan" className="mt-2">
                                    <p className="text-2xl font-bold text-white">{plan ? `${plan.name}` : "Not set up yet"}</p>
                                    <p className="text-slate-400 mt-1">
                                        {plan
                                            ? `${plan.committed_leads} Qualified Leads per ${TERMS.cycle_days}-day cycle · ${zar(plan.price_zar)} excl. VAT, paid in advance`
                                            : "Lead Velocity will confirm your plan with you."}
                                    </p>
                                </FadeIn>
                            )}
                        </AnimatePresence>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                        {cycle ? (
                            <>
                                <div className="flex items-end justify-between">
                                    <span className="text-sm text-slate-400">This cycle</span>
                                    <span className="text-2xl font-bold text-white"><CountUp value={cycle.delivered} /> / {cycle.committed}</span>
                                </div>
                                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                                    <m.div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-pink-500 to-rose-400"
                                        initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, cycle.committed ? cycle.delivered / cycle.committed : 0) }} transition={{ duration: 0.9, ease: EASE }} />
                                </div>
                                <p className="text-xs text-slate-400 mt-3">Leads delivered · day {cycle.day} of {TERMS.cycle_days} · ends {fmtDate(cycle.end)}</p>
                            </>
                        ) : planState?.paid ? (
                            <div>
                                <p className="font-semibold text-white">Payment received</p>
                                <p className="text-sm text-slate-400 mt-1">Paid on {fmtDate(new Date(planState.paidOn!))}. Your next cycle starts with your next payment.</p>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <Clock className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
                                <div>
                                    <p className="font-semibold text-white">Awaiting payment</p>
                                    <p className="text-sm text-slate-400 mt-1">
                                        {plan ? `Your ${plan.name} plan (${plan.committed_leads} leads / ${TERMS.cycle_days} days) starts when payment clears.` : "Your first cycle starts when payment clears."}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </StaggerItem>

            <StaggerItem><SignedAgreementCard brokerId={brokerData?.id} hideWhenEmpty /></StaggerItem>

            {/* Real counts */}
            <StaggerItem>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
                    {[
                        { title: "Leads delivered", icon: Users, color: "text-violet-300", value: stats.totalLeads, label: "All time", tab: "leads" as Tab },
                        { title: "Appointments", icon: CalendarIcon, color: "text-sky-300", value: stats.appointmentsScheduled, label: "Booked with you", tab: "calendar" as Tab },
                        { title: "Paid orders", icon: Package, color: "text-emerald-300", value: planState?.paidOrdersCount ?? 0, label: planState?.paidOn ? `Last paid ${fmtDate(new Date(planState.paidOn))}` : "None yet", tab: "documents" as Tab },
                    ].map((s) => (
                        <m.button key={s.title} type="button" onClick={() => onGo(s.tab)} whileTap={{ scale: 0.98 }} whileHover={{ y: -2 }}
                            className={`${card} p-5 flex items-center gap-4 text-left min-h-[44px] hover:border-white/20 transition-colors`}>
                            <span className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><s.icon className={`h-5 w-5 ${s.color}`} aria-hidden="true" /></span>
                            <span className="min-w-0">
                                <span className="block text-3xl font-bold text-white"><CountUp value={s.value} /></span>
                                <span className="block text-sm font-medium text-slate-300">{s.title}</span>
                                <span className="block text-xs text-slate-500">{s.label}</span>
                            </span>
                        </m.button>
                    ))}
                </div>
            </StaggerItem>

            {/* Leads per week, from his own leads */}
            <StaggerItem>
                <section className={`${card} p-5 sm:p-7`} aria-labelledby="lpw-title">
                    <h2 id="lpw-title" className="text-lg font-semibold text-white">Leads per week</h2>
                    <p className="text-sm text-slate-400">Leads delivered to you over the last 8 weeks.</p>
                    <div className="mt-4">
                        <AnimatePresence mode="wait">
                            {weeks === null ? (
                                <m.div key="sk"><Skeleton className="h-[200px] w-full" /></m.div>
                            ) : !anyLeadsRecently ? (
                                <FadeIn key="empty"><p className="text-sm text-slate-400">No leads delivered in the last 8 weeks. They'll show here week by week once delivery starts.</p></FadeIn>
                            ) : (
                                <FadeIn key="chart" className="h-[240px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={weeks}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                                            <XAxis dataKey="week" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                            <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={28} />
                                            <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #ffffff1a", borderRadius: 12 }} labelStyle={{ color: "#fff" }} itemStyle={{ color: "#f472b6" }} formatter={(v: number) => [v, "Leads"]} labelFormatter={(l) => `Week of ${l}`} />
                                            <Bar dataKey="leads" fill="#ec4899" radius={[6, 6, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </FadeIn>
                            )}
                        </AnimatePresence>
                    </div>
                </section>
            </StaggerItem>

            {brokerData?.id && <SalesCoachInsight brokerId={brokerData.id} />}
        </Stagger>
    );
};

export default PremiumDashboard;
