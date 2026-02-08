import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Phone, Mail, MessageSquare, Clock, TrendingUp, Activity, Loader2, Download, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ChannelStats {
  channel: string;
  total: number;
  avgDuration: number;
  avgResponseTime: number;
  successful: number;
  failed: number;
}

interface DailyVolume {
  date: string;
  call: number;
  email: number;
  sms: number;
  whatsapp: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  call: "hsl(var(--chart-1))",
  email: "hsl(var(--chart-2))",
  sms: "hsl(var(--chart-3))",
  whatsapp: "hsl(var(--chart-4))",
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4" />,
};

export function CommunicationAnalytics() {
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");
  const [channelStats, setChannelStats] = useState<ChannelStats[]>([]);
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([]);
  const [totals, setTotals] = useState({
    totalCommunications: 0,
    avgResponseTime: 0,
    avgCallDuration: 0,
    successRate: 0,
  });

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const getDateRange = () => {
    const now = new Date();
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    return { startDate: startDate.toISOString(), endDate: now.toISOString() };
  };

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      const { data: communications, error } = await supabase
        .from("communications")
        .select("*")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (!communications || communications.length === 0) {
        setChannelStats([]);
        setDailyVolume([]);
        setTotals({
          totalCommunications: 0,
          avgResponseTime: 0,
          avgCallDuration: 0,
          successRate: 0,
        });
        setIsLoading(false);
        return;
      }

      // Calculate channel stats
      const channelMap = new Map<string, {
        total: number;
        durations: number[];
        responseTimes: number[];
        successful: number;
        failed: number;
      }>();

      communications.forEach((comm) => {
        const channel = comm.channel || "unknown";
        if (!channelMap.has(channel)) {
          channelMap.set(channel, {
            total: 0,
            durations: [],
            responseTimes: [],
            successful: 0,
            failed: 0,
          });
        }

        const stats = channelMap.get(channel)!;
        stats.total++;

        if (comm.call_duration) {
          stats.durations.push(comm.call_duration);
        }

        // Get response time from the new column or metadata fallback
        const responseTime = (comm as Record<string, unknown>).response_time_seconds as number | null;
        if (responseTime && responseTime > 0) {
          stats.responseTimes.push(responseTime);
        } else {
          // Fallback to metadata for older records
          const metadata = comm.metadata as Record<string, unknown> | null;
          if (metadata?.response_time) {
            stats.responseTimes.push(metadata.response_time as number);
          }
        }

        if (comm.status === "completed" || comm.status === "sent" || comm.status === "delivered") {
          stats.successful++;
        } else if (comm.status === "failed" || comm.status === "error") {
          stats.failed++;
        }
      });

      const channelStatsArray: ChannelStats[] = Array.from(channelMap.entries()).map(
        ([channel, stats]) => ({
          channel,
          total: stats.total,
          avgDuration: stats.durations.length > 0
            ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
            : 0,
          avgResponseTime: stats.responseTimes.length > 0
            ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
            : 0,
          successful: stats.successful,
          failed: stats.failed,
        })
      );

      // Calculate daily volume
      const dailyMap = new Map<string, DailyVolume>();
      communications.forEach((comm) => {
        const date = new Date(comm.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date, call: 0, email: 0, sms: 0, whatsapp: 0 });
        }

        const day = dailyMap.get(date)!;
        const channel = comm.channel as keyof Omit<DailyVolume, "date">;
        if (channel in day) {
          day[channel]++;
        }
      });

      const dailyVolumeArray = Array.from(dailyMap.values());

      // Calculate totals
      const allDurations = communications
        .filter((c) => c.call_duration)
        .map((c) => c.call_duration!);
      
      const successfulCount = communications.filter(
        (c) => c.status === "completed" || c.status === "sent" || c.status === "delivered"
      ).length;

      // Calculate overall average response time
      const allResponseTimes = communications
        .filter((c) => {
          const rt = (c as Record<string, unknown>).response_time_seconds as number | null;
          return rt && rt > 0;
        })
        .map((c) => (c as Record<string, unknown>).response_time_seconds as number);

      const avgResponseTime = allResponseTimes.length > 0
        ? Math.round(allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length)
        : 0;

      setChannelStats(channelStatsArray);
      setDailyVolume(dailyVolumeArray);
      setTotals({
        totalCommunications: communications.length,
        avgResponseTime,
        avgCallDuration: allDurations.length > 0
          ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
          : 0,
        successRate: communications.length > 0
          ? Math.round((successfulCount / communications.length) * 100)
          : 0,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getTimeRangeLabel = () => {
    return timeRange === "7d" ? "Last 7 Days" : timeRange === "30d" ? "Last 30 Days" : "Last 90 Days";
  };

  const exportToCSV = () => {
    try {
      // Create CSV content
      let csvContent = "Communication Analytics Report\n";
      csvContent += `Generated: ${new Date().toLocaleString()}\n`;
      csvContent += `Time Range: ${getTimeRangeLabel()}\n\n`;

      // Summary section
      csvContent += "SUMMARY\n";
      csvContent += "Metric,Value\n";
      csvContent += `Total Communications,${totals.totalCommunications}\n`;
      csvContent += `Average Call Duration,${formatDuration(totals.avgCallDuration)}\n`;
      csvContent += `Success Rate,${totals.successRate}%\n`;
      csvContent += `Active Channels,${channelStats.length}\n\n`;

      // Channel stats section
      csvContent += "CHANNEL BREAKDOWN\n";
      csvContent += "Channel,Total,Successful,Failed,Success Rate,Avg Duration\n";
      channelStats.forEach((stat) => {
        const successRate = stat.total > 0 ? Math.round((stat.successful / stat.total) * 100) : 0;
        csvContent += `${stat.channel},${stat.total},${stat.successful},${stat.failed},${successRate}%,${formatDuration(stat.avgDuration)}\n`;
      });
      csvContent += "\n";

      // Daily volume section
      csvContent += "DAILY VOLUME\n";
      csvContent += "Date,Calls,Emails,SMS,WhatsApp\n";
      dailyVolume.forEach((day) => {
        csvContent += `${day.date},${day.call},${day.email},${day.sms},${day.whatsapp}\n`;
      });

      // Download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `communication-analytics-${timeRange}-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("CSV report downloaded successfully");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      toast.error("Failed to export CSV");
    }
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Title
      doc.setFontSize(20);
      doc.setTextColor(40, 40, 40);
      doc.text("Communication Analytics Report", pageWidth / 2, 20, { align: "center" });
      
      // Metadata
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 28, { align: "center" });
      doc.text(`Time Range: ${getTimeRangeLabel()}`, pageWidth / 2, 34, { align: "center" });

      // Summary section
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text("Summary", 14, 48);

      autoTable(doc, {
        startY: 52,
        head: [["Metric", "Value"]],
        body: [
          ["Total Communications", totals.totalCommunications.toLocaleString()],
          ["Average Call Duration", formatDuration(totals.avgCallDuration)],
          ["Success Rate", `${totals.successRate}%`],
          ["Active Channels", channelStats.length.toString()],
        ],
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
      });

      // Channel breakdown
      const finalY1 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 90;
      doc.setFontSize(14);
      doc.text("Channel Breakdown", 14, finalY1 + 12);

      autoTable(doc, {
        startY: finalY1 + 16,
        head: [["Channel", "Total", "Successful", "Failed", "Success Rate", "Avg Duration"]],
        body: channelStats.map((stat) => [
          stat.channel.charAt(0).toUpperCase() + stat.channel.slice(1),
          stat.total.toString(),
          stat.successful.toString(),
          stat.failed.toString(),
          `${stat.total > 0 ? Math.round((stat.successful / stat.total) * 100) : 0}%`,
          formatDuration(stat.avgDuration),
        ]),
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 14, right: 14 },
      });

      // Daily volume (if fits on page, otherwise new page)
      const finalY2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 150;
      
      if (finalY2 > 220) {
        doc.addPage();
        doc.setFontSize(14);
        doc.text("Daily Volume", 14, 20);
        
        autoTable(doc, {
          startY: 24,
          head: [["Date", "Calls", "Emails", "SMS", "WhatsApp"]],
          body: dailyVolume.map((day) => [
            day.date,
            day.call.toString(),
            day.email.toString(),
            day.sms.toString(),
            day.whatsapp.toString(),
          ]),
          theme: "striped",
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
        });
      } else {
        doc.setFontSize(14);
        doc.text("Daily Volume", 14, finalY2 + 12);

        autoTable(doc, {
          startY: finalY2 + 16,
          head: [["Date", "Calls", "Emails", "SMS", "WhatsApp"]],
          body: dailyVolume.map((day) => [
            day.date,
            day.call.toString(),
            day.email.toString(),
            day.sms.toString(),
            day.whatsapp.toString(),
          ]),
          theme: "striped",
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: 14, right: 14 },
        });
      }

      // Save
      doc.save(`communication-analytics-${timeRange}-${Date.now()}.pdf`);
      toast.success("PDF report downloaded successfully");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Failed to export PDF");
    }
  };

  const pieData = channelStats.map((stat) => ({
    name: stat.channel.charAt(0).toUpperCase() + stat.channel.slice(1),
    value: stat.total,
    color: CHANNEL_COLORS[stat.channel] || "hsl(var(--muted))",
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Communication Analytics</h2>
          <p className="text-muted-foreground">Track performance across all channels</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToCSV} className="gap-2 cursor-pointer">
                <FileSpreadsheet className="h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPDF} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Communications</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.totalCommunications.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across all channels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(totals.avgResponseTime)}</div>
            <p className="text-xs text-muted-foreground">
              Time to first response
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(totals.avgCallDuration)}</div>
            <p className="text-xs text-muted-foreground">
              Per completed call
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              Completed/delivered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Channels</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{channelStats.length}</div>
            <p className="text-xs text-muted-foreground">
              Communication types used
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="volume" className="space-y-4">
        <TabsList>
          <TabsTrigger value="volume">Volume Trends</TabsTrigger>
          <TabsTrigger value="channels">Channel Breakdown</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="volume" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Communication Volume</CardTitle>
              <CardDescription>Number of communications per day by channel</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyVolume.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={dailyVolume}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="call" name="Calls" stroke={CHANNEL_COLORS.call} strokeWidth={2} />
                    <Line type="monotone" dataKey="email" name="Emails" stroke={CHANNEL_COLORS.email} strokeWidth={2} />
                    <Line type="monotone" dataKey="sms" name="SMS" stroke={CHANNEL_COLORS.sms} strokeWidth={2} />
                    <Line type="monotone" dataKey="whatsapp" name="WhatsApp" stroke={CHANNEL_COLORS.whatsapp} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  No communication data available for this period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Channel Distribution</CardTitle>
                <CardDescription>Volume share by communication channel</CardDescription>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Channel Volume</CardTitle>
                <CardDescription>Total communications per channel</CardDescription>
              </CardHeader>
              <CardContent>
                {channelStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={channelStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis
                        type="category"
                        dataKey="channel"
                        className="text-xs"
                        tickFormatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                        {channelStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHANNEL_COLORS[entry.channel] || "hsl(var(--muted))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {channelStats.map((stat) => (
              <Card key={stat.channel}>
                <CardHeader className="flex flex-row items-center gap-2 pb-2">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${CHANNEL_COLORS[stat.channel]}20` }}
                  >
                    {CHANNEL_ICONS[stat.channel]}
                  </div>
                  <CardTitle className="text-sm font-medium capitalize">
                    {stat.channel}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">{stat.total}</span>
                  </div>
                  {stat.avgResponseTime > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avg Response</span>
                      <span className="font-medium">{formatDuration(stat.avgResponseTime)}</span>
                    </div>
                  )}
                  {stat.channel === "call" && stat.avgDuration > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avg Duration</span>
                      <span className="font-medium">{formatDuration(stat.avgDuration)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Successful</span>
                    <span className="font-medium text-green-600">{stat.successful}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Failed</span>
                    <span className="font-medium text-red-600">{stat.failed}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Success Rate</span>
                    <span className="font-medium">
                      {stat.total > 0 ? Math.round((stat.successful / stat.total) * 100) : 0}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {channelStats.length === 0 && (
            <Card>
              <CardContent className="flex items-center justify-center h-32 text-muted-foreground">
                No performance data available for this period
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
