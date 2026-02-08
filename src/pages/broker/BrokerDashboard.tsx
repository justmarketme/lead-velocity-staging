import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileText, Users, Calendar } from "lucide-react";

const BrokerDashboard = () => {
  const [stats, setStats] = useState({
    totalLeads: 0,
    willsCompleted: 0,
    referralsGenerated: 0,
    appointmentsScheduled: 0,
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      // Verify broker role
      const { data: hasRole } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'broker'
      });

      if (!hasRole) {
        navigate("/login");
        return;
      }

      fetchStats(session.user.id);
    };
    checkAuth();
  }, [navigate]);

  const fetchStats = async (userId: string) => {
    try {
      // Get broker ID
      const { data: broker } = await supabase
        .from("brokers")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (!broker) {
        setLoading(false);
        return;
      }

      // Fetch leads count
      const { count: leadsCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("broker_id", broker.id);

      // Fetch wills completed
      const { count: willsCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("broker_id", broker.id)
        .eq("current_status", "Will Done");

      // Fetch referrals count
      const { data: leads } = await supabase
        .from("leads")
        .select("id")
        .eq("broker_id", broker.id);

      const leadIds = leads?.map(l => l.id) || [];
      
      let referralsCount = 0;
      let appointmentsCount = 0;
      
      if (leadIds.length > 0) {
        const { count: refCount } = await supabase
          .from("referrals")
          .select("*", { count: "exact", head: true })
          .in("parent_lead_id", leadIds);

        const { count: apptCount } = await supabase
          .from("referrals")
          .select("*", { count: "exact", head: true })
          .in("parent_lead_id", leadIds)
          .eq("broker_appointment_scheduled", true);

        referralsCount = refCount || 0;
        appointmentsCount = apptCount || 0;
      }

      setStats({
        totalLeads: leadsCount || 0,
        willsCompleted: willsCount || 0,
        referralsGenerated: referralsCount,
        appointmentsScheduled: appointmentsCount,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Total Leads Uploaded",
      value: stats.totalLeads,
      icon: Database,
      color: "text-blue-500",
    },
    {
      title: "Wills Completed",
      value: stats.willsCompleted,
      icon: FileText,
      color: "text-green-500",
    },
    {
      title: "Referrals Generated",
      value: stats.referralsGenerated,
      icon: Users,
      color: "text-purple-500",
    },
    {
      title: "Appointments Scheduled",
      value: stats.appointmentsScheduled,
      icon: Calendar,
      color: "text-orange-500",
    },
  ];

  if (loading) {
    return (
      <BrokerLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </BrokerLayout>
    );
  }

  return (
    <BrokerLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-2">
            Track your lead performance and conversion metrics
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="border-border/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </BrokerLayout>
  );
};

export default BrokerDashboard;
