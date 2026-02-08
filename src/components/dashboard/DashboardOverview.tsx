import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, Clock, CheckCircle } from "lucide-react";

const DashboardOverview = () => {
  const [stats, setStats] = useState({
    totalLeads: 0,
    thisMonth: 0,
    thisWeek: 0,
    today: 0,
    converted: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    const { count: total } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true });

    const { count: month } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString());

    const { count: week } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfWeek.toISOString());

    const { count: day } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfDay.toISOString());

    const { count: converted } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("current_status", "Will Done");

    setStats({
      totalLeads: total || 0,
      thisMonth: month || 0,
      thisWeek: week || 0,
      today: day || 0,
      converted: converted || 0,
    });
  };

  const statCards = [
    {
      title: "Total Leads",
      value: stats.totalLeads,
      icon: Users,
      color: "text-primary",
    },
    {
      title: "This Month",
      value: stats.thisMonth,
      icon: TrendingUp,
      color: "text-secondary",
    },
    {
      title: "This Week",
      value: stats.thisWeek,
      icon: Clock,
      color: "text-accent",
    },
    {
      title: "Converted",
      value: stats.converted,
      icon: CheckCircle,
      color: "text-green-500",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold gradient-text">Dashboard Overview</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-border/50 bg-card/50 backdrop-blur animate-fade-in">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
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

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Quick Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Conversion Rate</span>
            <span className="font-bold">
              {stats.totalLeads > 0 
                ? ((stats.converted / stats.totalLeads) * 100).toFixed(1) 
                : 0}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Leads Added Today</span>
            <span className="font-bold">{stats.today}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardOverview;
