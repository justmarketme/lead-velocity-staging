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
    X,
    CreditCard,
    User,
    Settings,
    HelpCircle,
    Sparkles,
    Crown,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PremiumDashboard from "@/components/broker/PremiumDashboard";
import PremiumCalendar from "@/components/broker/PremiumCalendar";
import PremiumDocuments from "@/components/broker/PremiumDocuments";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/lead-velocity-logo.png";

// ─── DEV PREVIEW MODE ───────────────────────────────────────────────
// Set this to false when you are ready to require real login
const DEV_PREVIEW = true;
const MOCK_BROKER = {
    id: "dev-preview",
    contact_person: "Alex Velocity",
    firm_name: "Elite Financial Partners",
    email: "alex@elitepartners.com",
    phone: "+27 82 555 0199",
    tier: "Gold",
    is_lead_loading: true,
    leads_used: 143,
    lead_quota: 200,
    status: "active",
};
const MOCK_STATS = { totalLeads: 143, willsCompleted: 38, referralsGenerated: 12, appointmentsScheduled: 7 };
const MOCK_APPOINTMENTS: any[] = [];
// ─────────────────────────────────────────────────────────────────────

const PremiumBrokerPortalPage = () => {
    const [activeTab, setActiveTab] = useState("dashboard");
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [brokerData, setBrokerData] = useState<any>(null);
    const [stats, setStats] = useState({
        totalLeads: 0,
        willsCompleted: 0,
        referralsGenerated: 0,
        appointmentsScheduled: 0,
    });
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { toast } = useToast();

    useEffect(() => {
        if (DEV_PREVIEW) {
            setBrokerData(MOCK_BROKER);
            setStats(MOCK_STATS);
            setAppointments(MOCK_APPOINTMENTS);
            setLoading(false);
            return;
        }

        const initPortal = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate("/login");
                return;
            }

            const { data: broker, error: brokerError } = await supabase
                .from("brokers")
                .select("*, broker_onboarding_responses(*)")
                .eq("user_id", session.user.id)
                .single();

            if (brokerError || !broker) {
                console.error("Broker fetch error:", brokerError);
                toast({ title: "Profile Error", description: "Broker profile not found or access denied.", variant: "destructive" });
                navigate("/login");
                return;
            }

            const enrichedBroker = {
                ...broker,
                tier: broker.tier || "Bronze",
                is_lead_loading: broker.is_lead_loading !== undefined ? broker.is_lead_loading : true,
                leads_used: broker.leads_used || 42,
                lead_quota: broker.lead_quota || (broker.tier === "Gold" ? 200 : broker.tier === "Silver" ? 100 : 50)
            };

            setBrokerData(enrichedBroker);

            const { data: { user } } = await supabase.auth.getUser();
            if (user?.user_metadata?.must_reset_password) {
                toast({
                    title: "First Login Detected",
                    description: "For security, please set a new password before accessing your elite portal."
                });
                navigate("/reset-password");
                return;
            }

            await fetchStats(broker.id);
            await fetchAppointments(broker.id);
            setLoading(false);
        };

        initPortal();
    }, [navigate]);

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

    const handleUpdateAppointment = async (id: string, status: string, notes: string) => {
        try {
            const { error } = await supabase
                .from("appointments")
                .update({ status: status, reason_notes: notes, updated_at: new Date().toISOString() })
                .eq("id", id);

            if (error) throw error;

            toast({ title: "Engagement Updated", description: "Status synced with central command." });

            if (status === 'other' || status === 'no-show') {
                toast({ title: "Admin Notified", description: "Meeting change has been flagged for audit." });
            }

            if (brokerData) await fetchAppointments(brokerData.id);
        } catch (e: any) {
            toast({ title: "Update Failed", description: e.message, variant: "destructive" });
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/login");
    };

    if (loading) {
        return (
            <div className="h-screen w-full bg-[#020617] flex flex-col items-center justify-center space-y-4">
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
        { id: "leads", label: "Premium Leads", icon: Database },
        { id: "calendar", label: "Appointment Center", icon: CalendarIcon },
        { id: "documents", label: "Vault & Ledger", icon: FolderOpen },
    ];

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-pink-500 selection:text-white">
            {/* Sidebar */}
            <aside className={`fixed left-0 top-0 h-screen bg-[#020617] border-r border-white/5 transition-all duration-500 z-50 ${sidebarOpen ? 'w-80' : 'w-24'}`}>
                <div className="flex flex-col h-full p-8">
                    <div className="flex items-center gap-4 mb-16 px-2">
                        <div className="bg-gradient-to-br from-pink-500 to-rose-700 p-2.5 rounded-2xl shadow-2xl shadow-pink-500/20 shrink-0">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        {sidebarOpen && <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic">Velo <span className="text-pink-600">Pro</span></h1>}
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
                        <button className="w-full flex items-center gap-5 px-5 py-4 text-slate-500 hover:text-white transition-all group">
                            <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-700" />
                            {sidebarOpen && <span className="text-sm font-black uppercase">Elite Setup</span>}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-5 px-5 py-4 text-rose-500/70 hover:text-rose-400 transition-all group bg-rose-500/5 rounded-2xl border border-rose-500/10"
                        >
                            <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            {sidebarOpen && <span className="text-sm font-black uppercase tracking-wider">Terminate</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={`transition-all duration-500 min-h-screen ${sidebarOpen ? 'pl-80' : 'pl-24'}`}>
                {/* Header Bar */}
                <header className="sticky top-0 z-40 bg-[#020617]/70 backdrop-blur-xl border-b border-white/5 px-10 h-24 flex items-center justify-between">
                    <div className="flex items-center gap-6 flex-1">
                        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-500 hover:text-white hover:bg-white/5 rounded-2xl">
                            <Menu size={22} />
                        </Button>
                        <div className="max-w-md w-full relative hidden lg:block">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <Input placeholder="Search records & intel..." className="bg-white/[0.02] border-white/5 pl-12 h-12 text-sm rounded-2xl focus:ring-pink-500/20 focus:border-pink-500/50 transition-all" />
                        </div>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="hidden sm:flex flex-col items-end gap-0.5">
                            <span className="text-xs font-black text-white uppercase tracking-widest leading-none mb-1">{brokerData?.firm_name}</span>
                            <div className="flex items-center gap-1.5">
                                <Crown className="w-3 h-3 text-pink-500" />
                                <span className="text-[10px] text-pink-500 font-black uppercase tracking-tighter">{brokerData?.tier} Elite</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl h-12 w-12 border border-white/5">
                                    <Bell size={20} />
                                </Button>
                                <div className="absolute top-3 right-3 w-2 h-2 bg-pink-600 rounded-full border-2 border-[#020617]" />
                            </div>

                            <Avatar className="h-12 w-12 border-2 border-white/5 ring-4 ring-pink-500/10 rounded-2xl overflow-hidden cursor-pointer hover:scale-105 transition-transform">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${brokerData?.contact_person}`} />
                                <AvatarFallback className="bg-slate-800 text-white font-black">BP</AvatarFallback>
                            </Avatar>
                        </div>
                    </div>
                </header>

                {/* Dynamic Content */}
                <div className="p-10 max-w-[1600px] mx-auto space-y-10">
                    {activeTab === 'dashboard' && <PremiumDashboard brokerData={brokerData} stats={stats} leadsData={[]} />}
                    {activeTab === 'calendar' && <PremiumCalendar appointments={appointments} onUpdateStatus={handleUpdateAppointment} />}
                    {activeTab === 'documents' && <PremiumDocuments documents={[]} />}

                    {activeTab === 'leads' && (
                        <div className="bg-slate-900/30 border border-white/5 rounded-[40px] p-24 text-center backdrop-blur-3xl relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                            <Database className="w-20 h-20 text-slate-800 mx-auto mb-8 font-thin group-hover:text-pink-500/50 group-hover:scale-110 transition-all duration-700" />
                            <h2 className="text-4xl font-black text-white mb-4 tracking-tighter italic">INTEL LIBRARY</h2>
                            <p className="text-slate-500 mb-10 max-w-xl mx-auto font-medium text-lg leading-relaxed">
                                Your specialized lead database is currently being encrypted and optimized for your <span className="text-white font-bold">{brokerData?.tier}</span> tier level.
                            </p>
                            <Button className="bg-white text-black hover:bg-slate-200 font-black px-12 h-16 rounded-2xl text-sm uppercase tracking-widest shadow-2xl shadow-white/10">
                                Access Central Database
                            </Button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default PremiumBrokerPortalPage;
