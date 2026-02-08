import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import LeadsTable from "@/components/dashboard/LeadsTable";
import LeadUploadForm from "@/components/dashboard/LeadUploadForm";
import TeamManagement from "@/components/dashboard/TeamManagement";
import Analytics from "@/components/dashboard/Analytics";
import AdminInvite from "@/components/dashboard/AdminInvite";
import AdminDocuments from "@/components/dashboard/AdminDocuments";
import AdminReferrals from "@/components/dashboard/AdminReferrals";
import AdminCalendar from "@/components/dashboard/AdminCalendar";
import MessageTemplates from "@/components/dashboard/MessageTemplates";
import AICallRequests from "@/components/dashboard/AICallRequests";
import WorkflowManagement from "@/components/dashboard/WorkflowManagement";
import MarketingHub from "@/components/dashboard/MarketingHub";
import BrokerAnalysisDashboard from "@/components/dashboard/BrokerAnalysisDashboard";
import type { Session } from "@supabase/supabase-js";

const Dashboard = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = (tab: string) => setSearchParams({ tab });
  const navigate = useNavigate();

  useEffect(() => {
    // TEMPORARY: Bypass authentication for development
    console.log("DEV MODE: Bypassing authentication");
    setSession({ user: { id: 'dev-user' } } as any);
    setLoading(false);

    /* ORIGINAL AUTH CODE - COMMENTED FOR DEVELOPMENT
    let isMounted = true;

    const checkUserRole = async (userId: string) => {
      // Check if user is a broker
      const { data: brokerData } = await supabase
        .from("brokers")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (brokerData) {
        navigate("/broker/dashboard");
        return;
      }

      // Check if user is an admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        await supabase.auth.signOut();
        navigate("/login");
      }
    };

    // Check for existing session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      
      if (!session) {
        setLoading(false);
        navigate("/login");
      } else {
        await checkUserRole(session.user.id);
        if (isMounted) setLoading(false);
      }
    });

    // Set up auth state listener for future changes only
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        // Only handle actual sign in/out events, not initial session
        if (event === 'SIGNED_OUT') {
          setSession(null);
          navigate("/login");
        } else if (event === 'SIGNED_IN') {
          setSession(session);
          // Role check already done in getSession for existing sessions
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    */
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === "overview" && <DashboardOverview />}
      {activeTab === "workflow" && <WorkflowManagement />}
      {activeTab === "leads" && <LeadsTable />}
      {activeTab === "referrals" && <AdminReferrals />}
      {activeTab === "calendar" && <AdminCalendar />}
      {activeTab === "broker-analysis" && <BrokerAnalysisDashboard />}
      {activeTab === "upload" && <LeadUploadForm />}
      {activeTab === "documents" && <AdminDocuments />}
      {activeTab === "templates" && <MessageTemplates />}
      {activeTab === "ai-calls" && <AICallRequests />}
      {activeTab === "marketing" && <MarketingHub />}
      {activeTab === "team" && <TeamManagement />}
      {activeTab === "analytics" && <Analytics />}
      {activeTab === "invites" && <AdminInvite />}
    </DashboardLayout>
  );
};

export default Dashboard;
