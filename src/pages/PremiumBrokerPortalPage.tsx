import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PremiumDashboard from "@/components/broker/PremiumDashboard";
import PremiumCalendar from "@/components/broker/PremiumCalendar";
import PremiumDocuments from "@/components/broker/PremiumDocuments";
import BrokerPortalShell, { BrokerDetails, PortalTab } from "@/components/broker/BrokerPortalShell";
import PremiumLeads from "@/components/broker/PremiumLeads";
import { BrokerPlanState, loadBrokerPlan } from "@/lib/brokerPlan";
import OwnBroker from "@/components/broker/smc/OwnBroker";
import OutlookConnectCard from "@/components/broker/smc/OutlookConnectCard";
import UpcomingSmcAppointments from "@/components/broker/smc/UpcomingSmcAppointments";
import IntroCardEditor from "@/components/broker/smc/IntroCardEditor";
import { useToast } from "@/hooks/use-toast";
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
    const setActiveTab = (t: string) => {
        setActiveTabState(t);
        try { const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(window.history.state, "", u); } catch { /* ignore */ }
    };
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
        // Calm skeleton of the portal frame instead of a spinner.
        return (
            <div className="min-h-[100dvh] bg-[#050816] lg:pl-72" aria-busy="true">
                <SEO title="Broker Portal" description="Lead Velocity broker portal." noIndex />
                <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-24 space-y-6 animate-pulse">
                    <div className="h-8 w-48 rounded-xl bg-white/[0.05]" />
                    <div className="h-40 rounded-[28px] bg-white/[0.04]" />
                    <div className="h-28 rounded-[28px] bg-white/[0.04]" />
                </div>
            </div>
        );
    }

    const tab = activeTab as PortalTab;
    return (
        <>
            <SEO title="Broker Portal" description="Lead Velocity broker portal." noIndex />
            <BrokerPortalShell
                broker={brokerData}
                planState={planState}
                tab={tab}
                onTab={(t) => setActiveTab(t)}
                onLogout={handleLogout}
                previewName={preview ? (brokerData?.contact_person || brokerData?.firm_name || "this broker") : null}
                onExitPreview={() => navigate("/dashboard")}
            >
                {tab === "dashboard" && <PremiumDashboard brokerData={brokerData} stats={stats} planState={planState} onGo={(t) => setActiveTab(t)} />}
                {tab === "leads" && <PremiumLeads brokerId={brokerData?.id} />}
                {tab === "calendar" && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-white">Appointments</h2>
                            <p className="text-slate-400 mt-1">Your calendar connection and the calls clients have booked with you.</p>
                        </div>
                        <OwnBroker>
                            {(b, reload) => (
                                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                                    <OutlookConnectCard broker={b} reload={reload} tone="elite" returnTo="/broker-elite?tab=calendar" />
                                    <UpcomingSmcAppointments brokerId={b.id} tone="elite" />
                                </div>
                            )}
                        </OwnBroker>
                        <PremiumCalendar appointments={appointments} onUpdateStatus={handleUpdateAppointment} />
                    </div>
                )}
                {tab === "intro" && <OwnBroker>{(b, reload) => <IntroCardEditor broker={b} reload={reload} tone="elite" />}</OwnBroker>}
                {tab === "documents" && <PremiumDocuments brokerId={brokerData?.id} />}
                {tab === "settings" && <BrokerDetails broker={brokerData} planState={planState} />}
            </BrokerPortalShell>
        </>
    );
};

export default PremiumBrokerPortalPage;
