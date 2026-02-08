import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Clock,
  Loader2,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface CallRecord {
  id: string;
  direction: string;
  status: string | null;
  call_duration: number | null;
  content: string | null;
  created_at: string;
  recipient_contact: string;
}

interface InAppCallPanelProps {
  recipientType: 'lead' | 'referral' | 'broker';
  recipientId: string;
  recipientContact: {
    phone?: string;
    name?: string;
  };
}

export function InAppCallPanel({ recipientType, recipientId, recipientContact }: InAppCallPanelProps) {
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [callNotes, setCallNotes] = useState('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(recipientContact.phone || '');
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    fetchCallRecords();
    
    // Set up realtime subscription for call updates
    const channel = supabase
      .channel(`calls-${recipientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'communications',
          filter: `${recipientType}_id=eq.${recipientId}`,
        },
        () => {
          fetchCallRecords();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [recipientId, recipientType]);

  const fetchCallRecords = async () => {
    try {
      let query = supabase
        .from('communications')
        .select('*')
        .eq('channel', 'call')
        .order('created_at', { ascending: false });

      if (recipientType === 'lead') {
        query = query.eq('lead_id', recipientId);
      } else if (recipientType === 'referral') {
        query = query.eq('referral_id', recipientId);
      } else if (recipientType === 'broker') {
        query = query.eq('broker_id', recipientId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCallRecords(data || []);
    } catch (error) {
      console.error('Error fetching call records:', error);
    } finally {
      setLoading(false);
    }
  };

  const startCall = async () => {
    if (!phoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }

    setIsInitiating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('You must be logged in');
        return;
      }

      // Log the outbound call initiation
      const { data: callRecord, error: insertError } = await supabase
        .from('communications')
        .insert({
          channel: 'call',
          direction: 'outbound',
          sender_id: session.user.id,
          sender_type: 'admin',
          recipient_type: recipientType,
          recipient_contact: phoneNumber,
          lead_id: recipientType === 'lead' ? recipientId : null,
          referral_id: recipientType === 'referral' ? recipientId : null,
          broker_id: recipientType === 'broker' ? recipientId : null,
          status: 'initiated',
          content: callNotes || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Start the call via Twilio
      const response = await supabase.functions.invoke('initiate-browser-call', {
        body: {
          to_number: phoneNumber,
          recipient_type: recipientType,
          recipient_id: recipientId,
          recipient_name: recipientContact.name,
          call_record_id: callRecord.id,
        },
      });

      if (response.error) {
        // Update call record to failed
        await supabase
          .from('communications')
          .update({ status: 'failed' })
          .eq('id', callRecord.id);
        throw response.error;
      }

      // Call initiated successfully
      setIsCallActive(true);
      callStartTimeRef.current = new Date();
      
      // Start call timer
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      // Update call record to in-progress
      await supabase
        .from('communications')
        .update({ status: 'in-progress' })
        .eq('id', callRecord.id);

      toast.success('Call connected');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error initiating call:', error);
      toast.error(`Failed to initiate call: ${errorMessage}`);
    } finally {
      setIsInitiating(false);
    }
  };

  const endCall = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      // End the call via edge function
      await supabase.functions.invoke('end-browser-call', {
        body: {
          recipient_id: recipientId,
          call_duration: callDuration,
          call_notes: callNotes,
        },
      });

      // Update the most recent call record
      const { data: recentCall } = await supabase
        .from('communications')
        .select('id')
        .eq('channel', 'call')
        .eq(`${recipientType}_id`, recipientId)
        .eq('status', 'in-progress')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (recentCall) {
        await supabase
          .from('communications')
          .update({
            status: 'completed',
            call_duration: callDuration,
            content: callNotes || 'Call completed',
          })
          .eq('id', recentCall.id);
      }

      toast.success(`Call ended (${formatDuration(callDuration)})`);
    } catch (error) {
      console.error('Error ending call:', error);
    } finally {
      setIsCallActive(false);
      setCallDuration(0);
      setCallNotes('');
      callStartTimeRef.current = null;
      fetchCallRecords();
    }
  };

  const logManualCall = async () => {
    if (!phoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('You must be logged in');
        return;
      }

      await supabase
        .from('communications')
        .insert({
          channel: 'call',
          direction: 'outbound',
          sender_id: session.user.id,
          sender_type: 'admin',
          recipient_type: recipientType,
          recipient_contact: phoneNumber,
          lead_id: recipientType === 'lead' ? recipientId : null,
          referral_id: recipientType === 'referral' ? recipientId : null,
          broker_id: recipientType === 'broker' ? recipientId : null,
          status: 'completed',
          call_duration: callDuration > 0 ? callDuration : null,
          content: callNotes || 'Manual call logged',
        });

      toast.success('Call logged successfully');
      setCallNotes('');
      setCallDuration(0);
      fetchCallRecords();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error logging call:', error);
      toast.error(`Failed to log call: ${errorMessage}`);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getCallStatusIcon = (status: string | null, direction: string) => {
    if (status === 'completed') return <PhoneCall className="h-4 w-4 text-green-500" />;
    if (status === 'failed' || status === 'missed') return <PhoneMissed className="h-4 w-4 text-red-500" />;
    if (direction === 'inbound') return <PhoneIncoming className="h-4 w-4 text-blue-500" />;
    return <Phone className="h-4 w-4" />;
  };

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in-progress': return 'secondary';
      case 'failed': return 'destructive';
      case 'missed': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Phone Calls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Call UI */}
        {isCallActive ? (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{recipientContact.name || 'Unknown'}</p>
                <p className="text-sm text-muted-foreground">{phoneNumber}</p>
              </div>
              <div className="flex items-center gap-2 text-lg font-mono">
                <Clock className="h-5 w-5 text-primary animate-pulse" />
                {formatDuration(callDuration)}
              </div>
            </div>

            {/* Call Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant={isMuted ? "destructive" : "outline"}
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="h-14 w-14 rounded-full"
                onClick={endCall}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                variant={isSpeakerOn ? "default" : "outline"}
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              >
                {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </Button>
            </div>

            {/* Call Notes */}
            <div>
              <Label className="text-xs">Call Notes</Label>
              <Textarea
                placeholder="Add notes during the call..."
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
        ) : (
          /* Idle State - Make Call */
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="tel"
                  placeholder="Phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
              <Button
                onClick={startCall}
                disabled={isInitiating || !phoneNumber}
                className="gap-2"
              >
                {isInitiating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                Call
              </Button>
            </div>

            {/* Manual Call Logging */}
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs font-medium text-muted-foreground">Log a manual call</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Duration (optional)</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      className="w-16 h-8"
                      min={0}
                      onChange={(e) => setCallDuration(parseInt(e.target.value || '0') * 60)}
                    />
                    <span className="text-xs">min</span>
                  </div>
                </div>
                <div className="flex-[2]">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    placeholder="Call outcome..."
                    className="h-8 mt-1"
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                  />
                </div>
                <Button size="sm" variant="secondary" onClick={logManualCall}>
                  Log Call
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Call History */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">Call History</h4>
          <ScrollArea className="h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : callRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No call history yet
              </p>
            ) : (
              <div className="space-y-3">
                {callRecords.map((record) => (
                  <div key={record.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getCallStatusIcon(record.status, record.direction)}
                        <span className="text-sm font-medium capitalize">{record.direction}</span>
                        <Badge variant={getStatusBadgeVariant(record.status)}>
                          {record.status || 'unknown'}
                        </Badge>
                        {record.call_duration && (
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(record.call_duration)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(record.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{record.recipient_contact}</p>
                    {record.content && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {record.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
