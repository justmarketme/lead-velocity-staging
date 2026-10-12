import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
    LayoutDashboard,
    Database,
    Calendar as CalendarIcon,
    FolderOpen,
    LogOut,
    Bell,
    Search,
    Menu,
    Settings,
    Sparkles,
    Crown,
    UserCircle,
    MessageSquare,
    ShieldCheck,
    Eye,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PremiumDashboard from "@/components/broker/PremiumDashboard";
import PremiumCalendar from "@/components/broker/PremiumCalendar";
import PremiumDocuments, { SignedAgreementCard } from "@/components/broker/PremiumDocuments";
import PremiumLeads from "@/components/broker/PremiumLeads";
import { BrokerPlanState, loadBrokerPlan } from "@/lib/brokerPlan";
import OwnBroker from "@/components/broker/smc/OwnBroker";
import OutlookConnectCard from "@/components/broker/smc/OutlookConnectCard";
import UpcomingSmcAppointments from "@/components/broker/smc/UpcomingSmcAppointments";
import IntroCardEditor from "@/components/broker/smc/IntroCardEditor";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/lead-velocity-logo.webp";
import SEO from "@/components/SEO";
import { TIERS, planByName } from "@/lib/pricing";
import { PREVIEW_READ_ONLY, useBrokerPreview } from "@/lib/brokerPreview";

const TABS = ["dashboard", "leads", "calendar", "intro", "documents", "settings"];

const PremiumBrokerPortalPage = () => {
    const [loading, setLoading] = useState(true);
    const [brokerData, setBrokerData] = useState<any>(null);
    // ?tab=calendar|intro|… opens a tab directly (Microsoft sign-in returns to ?tab=calendar via MsReturnGate).
    const [activeTab, setActiveTabState] = useState(() => {
        const t = new URLSearchParams(window.location.search).get("tab");
        return t && TABS.includes(t) ? t : "dashboard";
    });
    // Phones: the sidebar is an off-canvas drawer (closed by default); from lg up it is the open rail as before.
    const isDesktop = () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches;
    const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
    const setActiveTab = (t: string) => { setActiveTabState(t); if (!isDesktop()) setSidebarOpen(false); };
    const [appointments, setAppointments] = useState<any[]>([]);
    const [stats, setStats] = useState({
        totalLeads: 0,
        willsCompleted: 0,
        referralsGenerated: 0,
        appointmentsScheduled: 0,
    });
    const navigate = useNavigate();
    const { toast } = useToast();
    // Admin "Preview as broker" (/admin/preview/broker/:id): load that broker by id through the admin's session, read-only.
    const preview = useBrokerPreview();
    // Plan and cycle from real records (signed agreement / broker record + paid orders); never a default.
    const [planState, setPlanState] = useState<BrokerPlanState | null>(null);
    useEffect(() => {
        if (!brokerData?.id || String(brokerData.id).startsWith("dev-")) return;
        let alive = true;
        void loadBrokerPlan({ id: brokerData.id, tier: brokerData.tier }).then((p) => { if (alive) setPlanState(p); });
        return () => { alive = false; };
    }, [brokerData?.id, brokerData?.tier]);

    const fetchStats = async (brokerId: string) => {
        try {
            const { count: leadsCount } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("broker_id", brokerId);
            const { count: willsCount } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("broker_id", brokerId).eq("current_status", "Will Done");

            setStats(prev => ({
                ...prev,
                totalLeads: leadsCount || 0,
                willsCompleted: willsCount || 0,
            }));
        } catch (e) {
            console.error("Stats error:", e);
        }
    };

    const fetchAppointments = async (brokerId: string) => {
        try {
            const { data: appts } = await supabase
                .from("appointments")
                .select(`
                    *,
                    client:leads(first_name, last_name, phone, email)
                `)
                .eq("broker_id", brokerId)
                .or("status.is.null,status.neq.pending_verification") // held slots wait for the client's email check
                .order('appointment_date', { ascending: true });

            if (appts) {
                const formatted = appts.map(a => ({
                    ...a,
                    first_name: a.client?.first_name,
                    last_name: a.client?.last_name,
                    phone: a.client?.phone,
                    appointment_status: a.status
                }));
                setAppointments(formatted);
                setStats(prev => ({ ...prev, appointmentsScheduled: formatted.length }));
            }
        } catch (e) {
            console.error("Appointment fetch error:", e);
        }
    };

    useEffect(() => {
        const initPreview = async (brokerId: string) => {
            const { data: broker, error: brokerError } = await supabase
                .from("brokers")
                .select("*, broker_onboarding_responses(*)")
                .eq("id", brokerId)
                .maybeSingle();
            if (brokerError || !broker) {
                toast({ title: "Broker not found", description: brokerError?.message || "No broker with that id.", variant: "destructive" });
                navigate("/dashboard");
                return;
            }
            const { data: profileRow } = broker.user_id
                ? await supabase.from("profiles").select("*").eq("user_id", broker.user_id).maybeSingle()
                : { data: null };
            setBrokerData({
                ...broker,
                profiles: profileRow ?? null,
                tier: broker.tier || TIERS[0].name,
                is_lead_loading: broker.is_lead_loading !== undefined ? broker.is_lead_loading : true,
                leads_used: (broker as any).leads_used || 0,
                lead_quota: (broker as any).lead_quota || planByName(broker.tier || TIERS[0].name)?.committed_leads || TIERS[0].committed_leads
            });
            await fetchStats(broker.id);
            await fetchAppointments(broker.id);
            setLoading(false);
        };

        const initPortal = async () => {
            if (preview) { await initPreview(preview.brokerId); return; }
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            if (!session) {
                // ==========================================
                // DEV BYPASS: Allow viewing without login
                // ==========================================
                if (import.meta.env.DEV) {
                    console.warn("DEV MODE: Bypassing auth for Premium Broker Portal");
                    setBrokerData({
                        id: "dev-bypass-id",
                        tier: "Silver",
                        is_lead_loading: true,
                        leads_used: 12,
                        lead_quota: 50,
                        portal_type: "premium",
                        contact_person: "Dev User",
                    });
                    setStats({
                        totalLeads: 142,
                        willsCompleted: 15,
                        referralsGenerated: 8,
                        appointmentsScheduled: 3,
                    });
                    setLoading(false);
                    return;
                }

                navigate("/broker");
                return;
            }

            const { data: broker, error: brokerError } = await supabase
                .from("brokers")
                .select("*, broker_onboarding_responses(*)")
                .eq("user_id", session.user.id)
                .single();

            if (brokerError || !broker) {
                // Also allow bypass here if logged in but no broker profile linked
                if (import.meta.env.DEV) {
                    setBrokerData({
                        id: "dev-bypass-id-logged-in",
                        tier: "Silver",
                        is_lead_loading: true,
                        leads_used: 42,
                        lead_quota: 100,
                    });
                    setLoading(false);
                    return;
                }

                console.error("Broker fetch error:", brokerError);
                toast({ title: "Profile Error", description: "Broker profile not found or access denied.", variant: "destructive" });
                navigate("/broker");
                return;
            }

            // brokers and profiles have no foreign key, so PostgREST cannot embed profiles(*); load it separately.
            const { data: profileRow } = await supabase
                .from("profiles")
                .select("*")
                .eq("user_id", session.user.id)
                .maybeSingle();

            const enrichedBroker = {
                ...broker,
                profiles: profileRow ?? null,
                tier: broker.tier || TIERS[0].name,
                is_lead_loading: broker.is_lead_loading !== undefined ? broker.is_lead_loading : true,
                leads_used: (broker as any).leads_used || 0,
                lead_quota: (broker as any).lead_quota || planByName(broker.tier || TIERS[0].name)?.committed_leads || TIERS[0].committed_leads
            };

            setBrokerData(enrichedBroker);

            const { data: userData } = await supabase.auth.getUser();
            const user = userData?.user;
            if (user?.user_metadata?.must_reset_password) {
                toast({
                    title: "First Login Detected",
                    description: "For security, please set a new password before using your portal."
                });
                navigate("/reset-password");
                return;
            }

            await fetchStats(broker.id);
            await fetchAppointments(broker.id);
            setLoading(false);
        };

        initPortal();
    }, [navigate, preview?.brokerId]);

    const handleUpdateAppointment = async (id: string, status: string, notes: string) => {
        if (preview) { toast(PREVIEW_READ_ONLY); return; }
        try {
            const { error } = await supabase
                .from("appointments")
                .update({ status: status, reason_notes: notes, updated_at: new Date().toISOString() })
                .eq("id", id);

            if (error) throw error;

            toast({ title: "Outcome saved", description: "Lead Velocity can see it now." });

            if (status === 'other' || status === 'no-show') {
                toast({ title: "Lead Velocity notified", description: "We'll follow up on this appointment." });
            }

            if (brokerData) await fetchAppointments(brokerData.id);
        } catch (e: any) {
            toast({ title: "Update Failed", description: e.message, variant: "destructive" });
        }
    };

    const handleLogout = async () => {
        if (preview) { navigate("/dashboard"); return; }
        await supabase.auth.signOut();
        navigate("/login");
    };

    if (loading) {
        return (
            <div className="h-screen w-full bg-[#020617] flex flex-col items-center justify-center space-y-4">
                <SEO title="Broker Elite Portal" description="Lead Velocity broker elite portal." noIndex />
                <img src={logo} alt="Lead Velocity" className="h-24 animate-pulse brightness-200" />
                <div className="flex gap-2">
                    <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" />
                </div>
            </div>
        );
    }

    const menuItems = [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "leads", label: "Leads", icon: Database },
        { id: "calendar", label: "Appointments", icon: CalendarIcon },
        { id: "intro", label: "Your Intro Card", icon: UserCircle },
        { id: "documents", label: "Documents", icon: FolderOpen },
        { id: "settings", label: "Your details", icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-pink-500 selection:text-white relative overflow-hidden">
            <SEO title="Broker Elite Portal" description="Lead Velocity broker elite portal." noIndex />

            {preview && (
                <div role="status" className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-amber-400/40 bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-2xl">
                    <span className="inline-flex items-center gap-2"><Eye className="h-4 w-4 shrink-0" />Preview — this is what {brokerData?.contact_person || brokerData?.firm_name || "this broker"} sees. Read-only.</span>
                    <button type="button" onClick={() => navigate("/dashboard")} className="rounded-md bg-black/85 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-300 hover:bg-black">Exit preview</button>
                </div>
            )}

            {/* Cyber Grid Background */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-pink-500/10 blur-[120px] rounded-full opacity-30" />
            </div>

            {/* Sidebar */}
            {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" aria-hidden="true" onClick={() => setSidebarOpen(false)} />}
            <aside className={`fixed left-0 top-0 h-screen overflow-y-auto bg-[#020617] border-r border-white/5 transition-all duration-500 z-50 ${sidebarOpen ? 'w-80 translate-x-0' : 'w-24 -translate-x-full lg:translate-x-0'}`}>
                <div className="flex flex-col h-full p-8">
                    <div className="flex items-center gap-4 mb-16 px-2">
                        <img src={logo} alt="" className="h-10 w-10 object-contain shrink-0" />
                        {sidebarOpen && <h1 className="text-xl font-black text-white tracking-tight">Lead Velocity</h1>}
                    </div>

                    <nav className="flex-1 space-y-3">
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`w-full flex items-center gap-5 px-5 py-4 rounded-2xl transition-all duration-300 group ${activeTab === item.id
                                    ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-2xl shadow-pink-600/30'
                                    : 'text-slate-500 hover:bg-white/[0.03] hover:text-white'
                                    }`}
                            >
                                <item.icon className={`w-5 h-5 transition-transform duration-500 ${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110 group-hover:text-pink-400'}`} />
                                {sidebarOpen && <span className="text-sm font-black tracking-tight uppercase">{item.label}</span>}
                            </button>
                        ))}
                    </nav>

                    <div className="pt-8 border-t border-white/5 space-y-3">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-5 px-5 py-4 text-rose-500/70 hover:text-rose-400 transition-all group bg-rose-500/5 rounded-2xl border border-rose-500/10"
                        >
                            <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            {sidebarOpen && <span className="text-sm font-black uppercase tracking-widest">{preview ? "Exit preview" : "Log out"}</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={`relative z-10 transition-all duration-500 min-h-screen ${sidebarOpen ? 'lg:pl-80' : 'lg:pl-24'} ${preview ? 'pb-14' : ''}`}>
                {/* Header Bar */}
                <header className="sticky top-0 z-30 bg-[#020617]/70 backdrop-blur-xl border-b border-white/5 px-4 sm:px-10 h-20 sm:h-24 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-6 flex-1">
                        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-500 hover:text-white hover:bg-white/5 rounded-2xl">
                            <Menu size={22} />
                        </Button>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end gap-0.5 text-right">
                            <span className="text-sm font-bold text-white leading-none">{brokerData?.firm_name}</span>
                            <span className="text-xs text-slate-400">{planState?.plan ? `${planState.plan.name} plan${planState.cycle ? "" : " · awaiting payment"}` : ""}</span>
                        </div>
                        <div className="h-11 w-11 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center text-sm font-black text-white" aria-hidden="true">
                            {String(brokerData?.contact_person || brokerData?.firm_name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("")}
                        </div>
                    </div>
                </header>

                {/* Dynamic Content */}
                <div className="p-4 sm:p-10 max-w-[1600px] mx-auto space-y-10">
                    {activeTab === 'dashboard' && (
                        <>
                            <SignedAgreementCard brokerId={brokerData?.id} hideWhenEmpty />
                            <PremiumDashboard brokerData={brokerData} stats={stats} planState={planState} />
                        </>
                    )}
                    {activeTab === 'calendar' && (
                        <>
                            <OwnBroker>
                                {(b, reload) => (
                                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                                        <OutlookConnectCard broker={b} reload={reload} tone="elite" returnTo="/broker-elite?tab=calendar" />
                                        <UpcomingSmcAppointments brokerId={b.id} tone="elite" />
                                    </div>
                                )}
                            </OwnBroker>
                            <PremiumCalendar appointments={appointments} onUpdateStatus={handleUpdateAppointment} />
                        </>
                    )}
                    {activeTab === 'intro' && (
                        <OwnBroker>{(b, reload) => <IntroCardEditor broker={b} reload={reload} tone="elite" />}</OwnBroker>
                    )}
                    {activeTab === 'documents' && <PremiumDocuments brokerId={brokerData?.id} />}
                    {activeTab === 'settings' && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div>
                                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Your details</h2>
                                <p className="text-slate-400 mt-1">What Lead Velocity has on record for you. To change anything here, message us or email howzit@leadvelocity.co.za.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card className="bg-[#020617] border-white/5 p-6 sm:p-8 rounded-3xl">
                                    <CardHeader className="p-0 mb-5">
                                        <CardTitle className="text-xl font-black text-white flex items-center gap-3"><ShieldCheck className="w-5 h-5 text-pink-500" />You and your practice</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0 space-y-4">
                                        {[
                                            ["Name", brokerData?.contact_person],
                                            ["Practice", brokerData?.firm_name],
                                            ["FSP number", brokerData?.fsp_number],
                                            ["Plan", planState?.plan ? `${planState.plan.name}: ${planState.plan.committed_leads} Qualified Leads per 30-day cycle${planState.cycle ? "" : " (awaiting payment)"}` : null],
                                        ].map(([label, value]) => (
                                            <div key={label as string}>
                                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
                                                <p className="text-base text-white break-words">{value || <span className="text-slate-500">Not on record yet</span>}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                                <Card className="bg-[#020617] border-white/5 p-6 sm:p-8 rounded-3xl">
                                    <CardHeader className="p-0 mb-5">
                                        <CardTitle className="text-xl font-black text-white flex items-center gap-3"><MessageSquare className="w-5 h-5 text-emerald-500" />Where we reach you</CardTitle>
                                        <CardDescription className="text-slate-400">New leads and bookings are sent here.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-0 space-y-4">
                                        {[
                                            ["WhatsApp", brokerData?.whatsapp_number || brokerData?.phone_number],
                                            ["Email", brokerData?.email],
                                        ].map(([label, value]) => (
                                            <div key={label as string}>
                                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
                                                <p className="text-base text-white break-all">{value || <span className="text-slate-500">Not on record yet</span>}</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}

                    {activeTab === 'leads' && (
                        <PremiumLeads brokerId={brokerData?.id} />
                    )}
                </div>
            </main>
        </div>
    );
};

export default PremiumBrokerPortalPage;
