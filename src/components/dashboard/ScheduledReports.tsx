import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Calendar, 
  Clock, 
  Mail, 
  Plus, 
  Trash2, 
  Edit, 
  Play, 
  Loader2,
  Users,
  Building,
  CheckCircle,
  XCircle,
  History
} from "lucide-react";

interface ScheduledReport {
  id: string;
  name: string;
  report_type: string;
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  enabled: boolean;
  recipient_type: string;
  recipient_ids: string[];
  broker_id: string | null;
  include_sections: string[];
  last_sent_at: string | null;
  next_scheduled_at: string | null;
}

interface Broker {
  id: string;
  firm_name: string;
  contact_person: string;
  email: string | null;
}

interface ReportHistory {
  id: string;
  scheduled_report_id: string;
  sent_at: string;
  recipients: string[];
  status: string;
  error_message: string | null;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SECTIONS = [
  { id: 'summary', label: 'Summary Statistics' },
  { id: 'channel_breakdown', label: 'Channel Breakdown' },
  { id: 'response_times', label: 'Response Times' },
];

export function ScheduledReports() {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [history, setHistory] = useState<ReportHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
  const [isSending, setIsSending] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    report_type: 'admin_summary',
    frequency: 'weekly',
    day_of_week: 1,
    day_of_month: 1,
    time_of_day: '09:00',
    recipient_type: 'all_admins',
    broker_id: '',
    include_sections: ['summary', 'channel_breakdown', 'response_times'],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [reportsRes, brokersRes, historyRes] = await Promise.all([
        supabase.from('scheduled_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('brokers').select('id, firm_name, contact_person, email').eq('status', 'Active'),
        supabase.from('report_history').select('*').order('sent_at', { ascending: false }).limit(20),
      ]);

      if (reportsRes.data) setReports(reportsRes.data);
      if (brokersRes.data) setBrokers(brokersRes.data);
      if (historyRes.data) setHistory(historyRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load scheduled reports');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      report_type: 'admin_summary',
      frequency: 'weekly',
      day_of_week: 1,
      day_of_month: 1,
      time_of_day: '09:00',
      recipient_type: 'all_admins',
      broker_id: '',
      include_sections: ['summary', 'channel_breakdown', 'response_times'],
    });
    setEditingReport(null);
  };

  const openEditDialog = (report: ScheduledReport) => {
    setEditingReport(report);
    setFormData({
      name: report.name,
      report_type: report.report_type,
      frequency: report.frequency,
      day_of_week: report.day_of_week ?? 1,
      day_of_month: report.day_of_month ?? 1,
      time_of_day: report.time_of_day?.slice(0, 5) || '09:00',
      recipient_type: report.recipient_type,
      broker_id: report.broker_id || '',
      include_sections: report.include_sections,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        name: formData.name,
        report_type: formData.report_type,
        frequency: formData.frequency,
        day_of_week: formData.frequency === 'weekly' ? formData.day_of_week : null,
        day_of_month: formData.frequency === 'monthly' ? formData.day_of_month : null,
        time_of_day: formData.time_of_day + ':00',
        recipient_type: formData.recipient_type,
        broker_id: formData.report_type === 'broker_client_report' && formData.broker_id ? formData.broker_id : null,
        include_sections: formData.include_sections,
        created_by: user?.id,
      };

      if (editingReport) {
        const { error } = await supabase
          .from('scheduled_reports')
          .update(payload)
          .eq('id', editingReport.id);

        if (error) throw error;
        toast.success('Report schedule updated');
      } else {
        const { error } = await supabase
          .from('scheduled_reports')
          .insert(payload);

        if (error) throw error;
        toast.success('Report schedule created');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving report:', error);
      toast.error('Failed to save report schedule');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled report?')) return;

    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Report schedule deleted');
      fetchData();
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Failed to delete report schedule');
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ enabled })
        .eq('id', id);

      if (error) throw error;
      
      setReports(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
      toast.success(enabled ? 'Report enabled' : 'Report disabled');
    } catch (error) {
      console.error('Error toggling report:', error);
      toast.error('Failed to update report');
    }
  };

  const handleSendNow = async (id: string) => {
    setIsSending(id);
    try {
      const { data, error } = await supabase.functions.invoke('send-scheduled-report', {
        body: { report_id: id, manual: true }
      });

      if (error) throw error;
      toast.success('Report sent successfully');
      fetchData();
    } catch (error) {
      console.error('Error sending report:', error);
      toast.error('Failed to send report');
    } finally {
      setIsSending(null);
    }
  };

  const getRecipientLabel = (report: ScheduledReport) => {
    switch (report.recipient_type) {
      case 'all_admins': return 'All Admins';
      case 'all_brokers': return 'All Brokers';
      case 'broker': {
        const broker = brokers.find(b => b.id === report.broker_id);
        return broker ? broker.firm_name : 'Specific Broker';
      }
      default: return report.recipient_type;
    }
  };

  const getFrequencyLabel = (report: ScheduledReport) => {
    switch (report.frequency) {
      case 'daily': return `Daily at ${report.time_of_day?.slice(0, 5)}`;
      case 'weekly': return `${DAYS_OF_WEEK[report.day_of_week || 0]}s at ${report.time_of_day?.slice(0, 5)}`;
      case 'monthly': return `${report.day_of_month}${getOrdinalSuffix(report.day_of_month || 1)} of month at ${report.time_of_day?.slice(0, 5)}`;
      default: return report.frequency;
    }
  };

  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

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
          <h2 className="text-2xl font-bold">Scheduled Reports</h2>
          <p className="text-muted-foreground">Automate analytics reports for admins and brokers</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Report Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingReport ? 'Edit Report Schedule' : 'Create Report Schedule'}</DialogTitle>
              <DialogDescription>
                Configure automated report delivery
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Report Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Weekly Admin Summary"
                />
              </div>

              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select
                  value={formData.report_type}
                  onValueChange={(value) => setFormData({ 
                    ...formData, 
                    report_type: value,
                    recipient_type: value === 'broker_client_report' ? 'broker' : 'all_admins'
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin_summary">Admin Summary</SelectItem>
                    <SelectItem value="broker_client_report">Broker Client Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value) => setFormData({ ...formData, frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select
                    value={formData.day_of_week.toString()}
                    onValueChange={(value) => setFormData({ ...formData, day_of_week: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day, index) => (
                        <SelectItem key={index} value={index.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Select
                    value={formData.day_of_month.toString()}
                    onValueChange={(value) => setFormData({ ...formData, day_of_month: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={formData.time_of_day}
                  onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Recipients</Label>
                <Select
                  value={formData.recipient_type}
                  onValueChange={(value) => setFormData({ ...formData, recipient_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.report_type === 'admin_summary' ? (
                      <>
                        <SelectItem value="all_admins">All Admins</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="broker">Specific Broker</SelectItem>
                        <SelectItem value="all_brokers">All Brokers</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {formData.report_type === 'broker_client_report' && formData.recipient_type === 'broker' && (
                <div className="space-y-2">
                  <Label>Select Broker</Label>
                  <Select
                    value={formData.broker_id}
                    onValueChange={(value) => setFormData({ ...formData, broker_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a broker" />
                    </SelectTrigger>
                    <SelectContent>
                      {brokers.map((broker) => (
                        <SelectItem key={broker.id} value={broker.id}>
                          {broker.firm_name} ({broker.contact_person})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Include Sections</Label>
                <div className="space-y-2">
                  {SECTIONS.map((section) => (
                    <div key={section.id} className="flex items-center gap-2">
                      <Checkbox
                        id={section.id}
                        checked={formData.include_sections.includes(section.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              include_sections: [...formData.include_sections, section.id]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              include_sections: formData.include_sections.filter(s => s !== section.id)
                            });
                          }
                        }}
                      />
                      <Label htmlFor={section.id} className="text-sm font-normal cursor-pointer">
                        {section.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!formData.name}>
                {editingReport ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {reports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">No scheduled reports</p>
              <p className="text-sm">Create your first automated report schedule</p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => (
            <Card key={report.id} className={!report.enabled ? 'opacity-60' : ''}>
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${
                    report.report_type === 'broker_client_report' 
                      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' 
                      : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30'
                  }`}>
                    {report.report_type === 'broker_client_report' ? (
                      <Building className="h-5 w-5" />
                    ) : (
                      <Users className="h-5 w-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{report.name}</h3>
                      <Badge variant={report.enabled ? 'default' : 'secondary'}>
                        {report.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getFrequencyLabel(report)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {getRecipientLabel(report)}
                      </span>
                    </div>
                    {report.next_scheduled_at && report.enabled && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Next: {new Date(report.next_scheduled_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={report.enabled}
                    onCheckedChange={(enabled) => handleToggleEnabled(report.id, enabled)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleSendNow(report.id)}
                    disabled={isSending === report.id}
                    title="Send now"
                  >
                    {isSending === report.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openEditDialog(report)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDelete(report.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Recent Report History
            </CardTitle>
            <CardDescription>Last 20 sent reports</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {history.map((item) => {
                  const report = reports.find(r => r.id === item.scheduled_report_id);
                  return (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {item.status === 'sent' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{report?.name || 'Unknown Report'}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.sent_at).toLocaleString()} • {item.recipients.length} recipient(s)
                          </p>
                        </div>
                      </div>
                      <Badge variant={item.status === 'sent' ? 'default' : 'destructive'}>
                        {item.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
