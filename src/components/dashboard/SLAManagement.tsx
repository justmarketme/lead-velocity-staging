import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Bell, 
  Clock, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle, 
  Settings, 
  Phone, 
  Mail, 
  MessageSquare,
  Loader2,
  Save
} from "lucide-react";

interface SLAThreshold {
  id: string;
  channel: string;
  warning_seconds: number;
  critical_seconds: number;
  enabled: boolean;
}

interface SLAAlert {
  id: string;
  communication_id: string;
  channel: string;
  severity: string;
  response_time_seconds: number;
  threshold_seconds: number;
  recipient_type: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4" />,
};

export function SLAManagement() {
  const [thresholds, setThresholds] = useState<SLAThreshold[]>([]);
  const [alerts, setAlerts] = useState<SLAAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedThresholds, setEditedThresholds] = useState<Record<string, SLAThreshold>>({});

  useEffect(() => {
    fetchData();
    
    // Set up realtime subscription for alerts
    const channel = supabase
      .channel('sla-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sla_alerts' },
        (payload) => {
          setAlerts((prev) => [payload.new as SLAAlert, ...prev]);
          toast.warning(`New SLA ${(payload.new as SLAAlert).severity} alert!`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [thresholdsRes, alertsRes] = await Promise.all([
        supabase.from('sla_thresholds').select('*').order('channel'),
        supabase.from('sla_alerts').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      if (thresholdsRes.data) {
        setThresholds(thresholdsRes.data);
        const edited: Record<string, SLAThreshold> = {};
        thresholdsRes.data.forEach((t) => {
          edited[t.id] = { ...t };
        });
        setEditedThresholds(edited);
      }

      if (alertsRes.data) {
        setAlerts(alertsRes.data);
      }
    } catch (error) {
      console.error('Error fetching SLA data:', error);
      toast.error('Failed to load SLA settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleThresholdChange = (id: string, field: keyof SLAThreshold, value: number | boolean) => {
    setEditedThresholds((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const saveThresholds = async () => {
    setIsSaving(true);
    try {
      for (const threshold of Object.values(editedThresholds)) {
        const { error } = await supabase
          .from('sla_thresholds')
          .update({
            warning_seconds: threshold.warning_seconds,
            critical_seconds: threshold.critical_seconds,
            enabled: threshold.enabled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', threshold.id);

        if (error) throw error;
      }

      setThresholds(Object.values(editedThresholds));
      toast.success('SLA thresholds saved successfully');
    } catch (error) {
      console.error('Error saving thresholds:', error);
      toast.error('Failed to save thresholds');
    } finally {
      setIsSaving(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('sla_alerts')
        .update({
          acknowledged: true,
          acknowledged_by: user?.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() }
            : a
        )
      );

      toast.success('Alert acknowledged');
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const minutesToSeconds = (minutes: number) => minutes * 60;
  const secondsToMinutes = (seconds: number) => Math.floor(seconds / 60);

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">SLA Management</h2>
          <p className="text-muted-foreground">Configure response time thresholds and view alerts</p>
        </div>
        {unacknowledgedCount > 0 && (
          <Badge variant="destructive" className="gap-1">
            <Bell className="h-3 w-3" />
            {unacknowledgedCount} unacknowledged
          </Badge>
        )}
      </div>

      <Tabs defaultValue="thresholds" className="space-y-4">
        <TabsList>
          <TabsTrigger value="thresholds" className="gap-2">
            <Settings className="h-4 w-4" />
            Thresholds
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alerts
            {unacknowledgedCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                {unacknowledgedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Response Time Thresholds</CardTitle>
              <CardDescription>
                Configure warning and critical thresholds for each communication channel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {thresholds.map((threshold) => {
                const edited = editedThresholds[threshold.id];
                if (!edited) return null;

                return (
                  <div
                    key={threshold.id}
                    className="flex items-center gap-6 p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-[100px]">
                      {CHANNEL_ICONS[threshold.channel]}
                      <span className="font-medium capitalize">{threshold.channel}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={edited.enabled}
                        onCheckedChange={(checked) =>
                          handleThresholdChange(threshold.id, 'enabled', checked)
                        }
                      />
                      <Label className="text-sm text-muted-foreground">Enabled</Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <Label className="text-sm">Warning (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={secondsToMinutes(edited.warning_seconds)}
                        onChange={(e) =>
                          handleThresholdChange(
                            threshold.id,
                            'warning_seconds',
                            minutesToSeconds(parseInt(e.target.value) || 0)
                          )
                        }
                        className="w-20"
                        disabled={!edited.enabled}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <Label className="text-sm">Critical (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={secondsToMinutes(edited.critical_seconds)}
                        onChange={(e) =>
                          handleThresholdChange(
                            threshold.id,
                            'critical_seconds',
                            minutesToSeconds(parseInt(e.target.value) || 0)
                          )
                        }
                        className="w-20"
                        disabled={!edited.enabled}
                      />
                    </div>
                  </div>
                );
              })}

              <Button onClick={saveThresholds} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Thresholds
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SLA Alerts</CardTitle>
              <CardDescription>Recent response time violations</CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mb-2" />
                  <p>No SLA alerts</p>
                  <p className="text-sm">All response times are within thresholds</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`flex items-center justify-between p-4 border rounded-lg ${
                          alert.acknowledged
                            ? 'bg-muted/50'
                            : alert.severity === 'critical'
                            ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900'
                            : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`p-2 rounded-full ${
                              alert.severity === 'critical'
                                ? 'bg-red-100 text-red-600 dark:bg-red-900/50'
                                : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50'
                            }`}
                          >
                            {alert.severity === 'critical' ? (
                              <AlertCircle className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">{alert.channel}</span>
                              <Badge
                                variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}
                              >
                                {alert.severity}
                              </Badge>
                              {alert.acknowledged && (
                                <Badge variant="outline" className="gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Acknowledged
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Response time: {formatDuration(alert.response_time_seconds)} (threshold:{' '}
                              {formatDuration(alert.threshold_seconds)})
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(alert.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {!alert.acknowledged && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
