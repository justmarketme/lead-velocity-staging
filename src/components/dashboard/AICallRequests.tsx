import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bot,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  FileText,
  Loader2,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { CallRecordingPlayer } from "@/components/communications/CallRecordingPlayer";

interface AICallRequest {
  id: string;
  recipient_type: string;
  recipient_name: string;
  recipient_phone: string;
  call_purpose: string;
  call_purpose_details: string | null;
  call_status: string;
  call_duration: number | null;
  call_recording_url: string | null;
  call_summary: string | null;
  proposed_changes: unknown;
  changes_approved: boolean | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const AICallRequests = () => {
  const [callRequests, setCallRequests] = useState<AICallRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<AICallRequest | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  useEffect(() => {
    fetchCallRequests();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('ai-call-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_call_requests',
        },
        () => {
          fetchCallRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCallRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_call_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCallRequests(data || []);
    } catch (error) {
      console.error('Error fetching call requests:', error);
      toast.error('Failed to load call requests');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (request: AICallRequest) => {
    setSelectedRequest(request);
    setAdminNotes(request.admin_notes || '');
    setDetailsOpen(true);
  };

  const handleApproveChanges = async (approved: boolean) => {
    if (!selectedRequest) return;

    setProcessingAction(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('ai_call_requests')
        .update({
          changes_approved: approved,
          changes_approved_by: user?.id,
          changes_approved_at: new Date().toISOString(),
          admin_notes: adminNotes,
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      toast.success(approved ? 'Changes approved!' : 'Changes rejected');
      setDetailsOpen(false);
      fetchCallRequests();
    } catch (error) {
      console.error('Error updating approval:', error);
      toast.error('Failed to update approval status');
    } finally {
      setProcessingAction(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'in_progress':
        return <Phone className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      in_progress: "default",
      completed: "default",
      failed: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="flex items-center gap-1 w-fit">
        {getStatusIcon(status)}
        <span className="capitalize">{status.replace('_', ' ')}</span>
      </Badge>
    );
  };

  const getPurposeLabel = (purpose: string) => {
    const labels: Record<string, string> = {
      appointment_scheduling: 'Schedule Appointment',
      appointment_rescheduling: 'Reschedule Appointment',
      follow_up: 'Follow-up',
      voice_note: 'Voice Note',
      reminder: 'Reminder',
      general_inquiry: 'General Inquiry',
      referral_generation: 'Referral Generation',
      policy_review: 'Policy Review',
    };
    return labels[purpose] || purpose;
  };

  const pendingApprovalCount = callRequests.filter(
    r => r.proposed_changes && r.changes_approved === null && r.call_status === 'completed'
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6" />
            AI Call Requests
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage AI-initiated calls
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingApprovalCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {pendingApprovalCount} Pending Approval
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchCallRequests}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call History ({callRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {callRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No AI calls have been made yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {callRequests.map((request) => (
                    <TableRow
                      key={request.id}
                      className={request.proposed_changes && request.changes_approved === null ? 'bg-yellow-500/10' : ''}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{request.recipient_name}</p>
                          <p className="text-xs text-muted-foreground">{request.recipient_phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getPurposeLabel(request.call_purpose)}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(request.call_status)}</TableCell>
                      <TableCell>
                        {request.call_duration ? `${request.call_duration}s` : '-'}
                      </TableCell>
                      <TableCell>
                        {request.proposed_changes ? (
                          request.changes_approved === null ? (
                            <Badge variant="secondary" className="animate-pulse">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Needs Review
                            </Badge>
                          ) : request.changes_approved ? (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Rejected
                            </Badge>
                          )
                        ) : (
                          <span className="text-muted-foreground text-sm">No changes</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(request.created_at), 'MMM d, h:mm a')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {request.call_recording_url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewDetails(request)}
                              title="Play recording"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewDetails(request)}
                            title="View details"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Call Details
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 py-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Recipient</p>
                    <p className="font-medium">{selectedRequest.recipient_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.recipient_phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Purpose</p>
                    <Badge variant="outline">{getPurposeLabel(selectedRequest.call_purpose)}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    {getStatusBadge(selectedRequest.call_status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-medium">{selectedRequest.call_duration ? `${selectedRequest.call_duration} seconds` : 'N/A'}</p>
                  </div>
                </div>

                {/* Call Summary */}
                {selectedRequest.call_summary && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Call Summary</p>
                    <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap text-sm">
                      {selectedRequest.call_summary}
                    </div>
                  </div>
                )}

                {/* Proposed Changes */}
                {selectedRequest.proposed_changes && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Proposed Changes (Requires Approval)
                    </p>
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <pre className="text-sm whitespace-pre-wrap">
                        {JSON.stringify(selectedRequest.proposed_changes, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Recording with Transcript */}
                {selectedRequest.call_recording_url && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Call Recording</p>
                    <CallRecordingPlayer
                      recordingUrl={selectedRequest.call_recording_url}
                      transcript={selectedRequest.call_summary}
                    />
                  </div>
                )}

                {/* Admin Notes */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Admin Notes</p>
                  <Textarea
                    placeholder="Add any notes about this call..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-shrink-0 gap-2">
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
            {selectedRequest?.proposed_changes && selectedRequest.changes_approved === null && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => handleApproveChanges(false)}
                  disabled={processingAction}
                >
                  {processingAction && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Reject Changes
                </Button>
                <Button
                  onClick={() => handleApproveChanges(true)}
                  disabled={processingAction}
                >
                  {processingAction && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Approve Changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AICallRequests;
