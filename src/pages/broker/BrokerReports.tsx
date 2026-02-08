import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { TrendingUp, TrendingDown, Users, CheckCircle } from "lucide-react";

const BrokerReports = () => {
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    completedWills: 0,
    conversionRate: 0,
    activeLeads: 0,
  });
  const navigate = useNavigate();

  const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

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

      fetchReportData(session.user.id);
    };
    checkAuth();
  }, [navigate]);

  const fetchReportData = async (userId: string) => {
    try {
      const { data: broker } = await supabase
        .from("brokers")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (!broker) {
        setLoading(false);
        return;
      }

      // Fetch all leads for this broker
      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .eq("broker_id", broker.id)
        .order("created_at", { ascending: true });

      if (leads) {
        // Calculate status distribution
        const statusCounts: Record<string, number> = {};
        leads.forEach(lead => {
          const status = lead.current_status || "New";
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({
          name,
          value,
        }));
        setStatusData(statusChartData);

        // Calculate timeline data (leads created per month)
        const monthlyData: Record<string, number> = {};
        leads.forEach(lead => {
          const date = new Date(lead.created_at);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
        });

        const timelineChartData = Object.entries(monthlyData)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, count]) => ({
            month: new Date(month + "-01").toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            leads: count,
          }));
        setTimelineData(timelineChartData);

        // Calculate metrics
        const totalLeads = leads.length;
        const completedWills = leads.filter(l => l.current_status === "Will Done").length;
        const activeLeads = leads.filter(l => l.current_status !== "Will Done" && l.current_status !== "Lost").length;
        const conversionRate = totalLeads > 0 ? (completedWills / totalLeads) * 100 : 0;

        setMetrics({
          totalLeads,
          completedWills,
          conversionRate: Math.round(conversionRate),
          activeLeads,
        });
      }
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  const chartConfig = {
    leads: {
      label: "Leads",
      color: "hsl(var(--primary))",
    },
  };

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
          <h1 className="text-3xl font-bold gradient-text">Performance Reports</h1>
          <p className="text-muted-foreground mt-2">
            Track your lead performance and conversion analytics
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalLeads}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Wills</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.completedWills}</div>
              <p className="text-xs text-muted-foreground">Successfully closed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.conversionRate}%</div>
              <p className="text-xs text-muted-foreground">Will completion rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeLeads}</div>
              <p className="text-xs text-muted-foreground">In progress</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Lead Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Lead Status Distribution</CardTitle>
              <CardDescription>Breakdown of leads by current status</CardDescription>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leads Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Leads Over Time</CardTitle>
              <CardDescription>Monthly lead acquisition trend</CardDescription>
            </CardHeader>
            <CardContent>
              {timelineData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line 
                        type="monotone" 
                        dataKey="leads" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lead Progress Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Progress Funnel</CardTitle>
            <CardDescription>Visual representation of your lead pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="hsl(var(--primary))">
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BrokerLayout>
  );
};

export default BrokerReports;
