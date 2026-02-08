import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { 
  Bot, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ArrowLeft,
  Phone,
  Calendar,
  User,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface AICallRecord {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_type: string;
  call_purpose: string;
  call_purpose_details: string | null;
  call_status: string;
  call_summary: string | null;
  call_duration: number | null;
  proposed_changes: unknown;
  changes_approved: boolean | null;
  changes_approved_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter = 'all' | 'pending' | 'completed' | 'approved' | 'rejected';

const NotificationHistory = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<AICallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedRecord, setSelectedRecord] = useState<AICallRecord | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.ceil(totalCount / pageSize);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/admin');
        return;
      }
      fetchRecords();
    };
    checkAuth();
  }, [navigate]);

  // Reset to page 1 when filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, pageSize]);

  // Fetch records when page, filter, or page size changes
  useEffect(() => {
    fetchRecords();
  }, [currentPage, statusFilter, pageSize]);

  const buildFilterQuery = useCallback((query: any) => {
    switch (statusFilter) {
      case 'pending':
        return query.in('call_status', ['pending', 'in_progress']);
      case 'completed':
        return query.eq('call_status', 'completed').is('changes_approved', null);
      case 'approved':
        return query.eq('changes_approved', true);
      case 'rejected':
        return query.eq('changes_approved', false);
      default:
        return query;
    }
  }, [statusFilter]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      // Get total count for pagination
      let countQuery = supabase
        .from('ai_call_requests')
        .select('*', { count: 'exact', head: true });
      
      countQuery = buildFilterQuery(countQuery);
      const { count, error: countError } = await countQuery;
      
      if (countError) throw countError;
      setTotalCount(count || 0);

      // Get paginated data
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let dataQuery = supabase
        .from('ai_call_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      dataQuery = buildFilterQuery(dataQuery);
      const { data, error } = await dataQuery;

      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error('Error fetching notification history:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getStatusBadge = (record: AICallRecord) => {
    if (record.changes_approved === true) {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      );
    }
    if (record.changes_approved === false) {
      return (
        <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
          <XCircle className="h-3 w-3 mr-1" />
          Rejected
        </Badge>
      );
    }
    if (record.call_status === 'completed' && record.proposed_changes) {
      return (
        <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 animate-pulse">
          <Clock className="h-3 w-3 mr-1" />
          Needs Approval
        </Badge>
      );
    }
    if (record.call_status === 'completed') {
      return (
        <Badge variant="secondary">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }
    if (record.call_status === 'in_progress') {
      return (
        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
          <Phone className="h-3 w-3 mr-1" />
          In Progress
        </Badge>
      );
    }
    if (record.call_status === 'failed') {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  };

  const getPurposeLabel = (purpose: string) => {
    const labels: Record<string, string> = {
      appointment_scheduling: 'Schedule Appointment',
      appointment_rescheduling: 'Reschedule Appointment',
      follow_up: 'Follow-up Call',
      voice_note: 'Voice Note',
      reminder: 'Reminder',
      general_inquiry: 'General Inquiry',
    };
    return labels[purpose] || purpose.replace(/_/g, ' ');
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleViewDetails = (record: AICallRecord) => {
    setSelectedRecord(record);
    setDetailsOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Notification History</h1>
            <p className="text-muted-foreground">View all AI call notifications and their statuses</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Show:</span>
                  <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Notifications</SelectItem>
                    <SelectItem value="pending">Pending Calls</SelectItem>
                    <SelectItem value="completed">Needs Approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  AI Call History
                </CardTitle>
                <CardDescription>
                  {totalCount} notification{totalCount !== 1 ? 's' : ''} found
                  {totalCount > 0 && ` • Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalCount)}`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              ) : records.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No notifications found</p>
                  <p className="text-sm">Try adjusting your filter or check back later</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {records.map((record) => (
                    <button
                      key={record.id}
                      onClick={() => handleViewDetails(record)}
                      className="w-full p-4 text-left hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{record.recipient_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {getPurposeLabel(record.call_purpose)}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(record.created_at), 'MMM d, yyyy h:mm a')}
                              </span>
                              {record.call_duration && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {formatDuration(record.call_duration)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(record)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {/* Page numbers */}
                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => goToPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Call Details
            </DialogTitle>
            <DialogDescription>
              Full details for this AI call notification
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{selectedRecord.recipient_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedRecord.recipient_phone}</p>
                  </div>
                </div>
                {getStatusBadge(selectedRecord)}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Purpose</p>
                  <p className="font-medium">{getPurposeLabel(selectedRecord.call_purpose)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">{selectedRecord.recipient_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{format(new Date(selectedRecord.created_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">{formatDuration(selectedRecord.call_duration)}</p>
                </div>
              </div>

              {selectedRecord.call_purpose_details && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Purpose Details</p>
                    <p className="text-sm">{selectedRecord.call_purpose_details}</p>
                  </div>
                </>
              )}

              {selectedRecord.call_summary && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Call Summary
                    </p>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                      {selectedRecord.call_summary}
                    </p>
                  </div>
                </>
              )}

              {selectedRecord.proposed_changes && typeof selectedRecord.proposed_changes === 'object' && !Array.isArray(selectedRecord.proposed_changes) && Object.keys(selectedRecord.proposed_changes as Record<string, unknown>).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Proposed Changes</p>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-1">
                      {Object.entries(selectedRecord.proposed_changes as Record<string, unknown>).map(([key, value]) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium">{key.replace(/_/g, ' ')}:</span>{' '}
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {selectedRecord.admin_notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Admin Notes</p>
                    <p className="text-sm">{selectedRecord.admin_notes}</p>
                  </div>
                </>
              )}

              {selectedRecord.changes_approved_at && (
                <div className="text-xs text-muted-foreground text-center">
                  {selectedRecord.changes_approved ? 'Approved' : 'Rejected'} on{' '}
                  {format(new Date(selectedRecord.changes_approved_at), 'MMM d, yyyy h:mm a')}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotificationHistory;
