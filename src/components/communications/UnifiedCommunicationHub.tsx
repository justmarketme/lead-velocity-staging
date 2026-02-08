import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MessageSquare,
  Phone,
  Send,
  Loader2,
  FileText,
  PhoneCall,
  PhoneMissed,
  PhoneIncoming,
  Clock,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { CallRecordingPlayer } from "./CallRecordingPlayer";

interface Communication {
  id: string;
  channel: string;
  direction: string;
  content: string | null;
  subject: string | null;
  status: string | null;
  created_at: string;
  recipient_contact: string;
  call_duration: number | null;
  call_recording_url: string | null;
  metadata: unknown;
}

interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  content: string;
  category: string;
}

interface UnifiedCommunicationHubProps {
  recipientType: 'lead' | 'referral' | 'broker';
  recipientId: string;
  recipientContact: {
    email?: string;
    phone?: string;
    name?: string;
  };
}

export function UnifiedCommunicationHub({
  recipientType,
  recipientId,
  recipientContact,
}: UnifiedCommunicationHubProps) {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'call' | 'email' | 'sms' | 'whatsapp'>('call');
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Call-specific state
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callNotes, setCallNotes] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState(recipientContact.phone || '');
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);
  const [manualCallDuration, setManualCallDuration] = useState('');

  useEffect(() => {
    fetchCommunications();
    fetchTemplates();

    // Set up realtime subscription
    const channel = supabase
      .channel(`communications-${recipientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'communications',
        },
        () => {
          fetchCommunications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [recipientId]);

  // Call timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCallActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isCallActive]);

  const fetchCommunications = async () => {
    try {
      let query = supabase
        .from('communications')
        .select('*')
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
      setCommunications(data || []);
    } catch (error) {
      console.error('Error fetching communications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    let processedContent = template.content
      .replace(/\{\{name\}\}/g, recipientContact.name || 'there')
      .replace(/\{\{date\}\}/g, format(new Date(), 'MMMM d, yyyy'));

    setContent(processedContent);

    if (template.subject) {
      let processedSubject = template.subject
        .replace(/\{\{name\}\}/g, recipientContact.name || '')
        .replace(/\{\{date\}\}/g, format(new Date(), 'MMMM d, yyyy'));
      setSubject(processedSubject);
    }

    setSelectedTemplate(templateId);
    toast.success(`Template "${template.name}" applied`);
  };

  const getFilteredTemplates = () => {
    if (activeTab === 'call') return [];
    return templates.filter((t) => t.channel === activeTab || t.channel === 'all');
  };

  const sendCommunication = async () => {
    if (!content.trim()) {
      toast.error('Please enter a message');
      return;
    }

    const contact = activeTab === 'email' ? recipientContact.email : recipientContact.phone;
    if (!contact) {
      toast.error(`No ${activeTab === 'email' ? 'email' : 'phone'} available for this contact`);
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('You must be logged in');
        return;
      }

      const payload = {
        channel: activeTab,
        recipient_contact: contact,
        recipient_type: recipientType,
        content,
        lead_id: recipientType === 'lead' ? recipientId : undefined,
        referral_id: recipientType === 'referral' ? recipientId : undefined,
        broker_id: recipientType === 'broker' ? recipientId : undefined,
        subject: activeTab === 'email' ? subject || `Message for ${recipientContact.name || 'you'}` : undefined,
      };

      const response = await supabase.functions.invoke('send-communication', {
        body: payload,
      });

      if (response.error) throw response.error;

      toast.success(`${activeTab.toUpperCase()} sent successfully`);
      setContent('');
      setSubject('');
      setSelectedTemplate('');
      fetchCommunications();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error sending communication:', error);
      toast.error(`Failed to send: ${errorMessage}`);
    } finally {
      setSending(false);
    }
  };

  const initiateCall = async () => {
    if (!phoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }

    setIsInitiatingCall(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('You must be logged in');
        return;
      }

      // Create call record
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
          status: 'in-progress',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setIsCallActive(true);
      setCallDuration(0);
      toast.success('Call started - Timer running');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error initiating call:', error);
      toast.error(`Failed to start call: ${errorMessage}`);
    } finally {
      setIsInitiatingCall(false);
    }
  };

  const endCall = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Find the in-progress call and update it
      const { data: inProgressCalls } = await supabase
        .from('communications')
        .select('id')
        .eq('channel', 'call')
        .eq('status', 'in-progress')
        .eq(`${recipientType}_id`, recipientId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (inProgressCalls && inProgressCalls.length > 0) {
        await supabase
          .from('communications')
          .update({
            status: 'completed',
            call_duration: callDuration,
            content: callNotes || 'Call completed',
          })
          .eq('id', inProgressCalls[0].id);
      }

      toast.success(`Call ended (${formatDuration(callDuration)})`);
      setIsCallActive(false);
      setCallDuration(0);
      setCallNotes('');
      fetchCommunications();
    } catch (error) {
      console.error('Error ending call:', error);
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

      const duration = manualCallDuration ? parseInt(manualCallDuration) * 60 : null;

      await supabase.from('communications').insert({
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
        call_duration: duration,
        content: callNotes || 'Manual call logged',
      });

      toast.success('Call logged successfully');
      setCallNotes('');
      setManualCallDuration('');
      fetchCommunications();
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

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'sms':
        return <MessageSquare className="h-4 w-4" />;
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4 text-green-500" />;
      case 'call':
        return <Phone className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getCallStatusIcon = (status: string | null, direction: string) => {
    if (status === 'completed') return <PhoneCall className="h-4 w-4 text-green-500" />;
    if (status === 'failed' || status === 'missed') return <PhoneMissed className="h-4 w-4 text-red-500" />;
    if (direction === 'inbound') return <PhoneIncoming className="h-4 w-4 text-blue-500" />;
    return <Phone className="h-4 w-4" />;
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'sent':
      case 'completed':
        return 'default';
      case 'delivered':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'in-progress':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const filteredHistory = communications.filter((c) => {
    if (activeTab === 'call') return c.channel === 'call';
    return true; // Show all for other tabs
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Communication Hub
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="call" className="flex items-center gap-1">
              <Phone className="h-4 w-4" /> Call
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-1">
              <Mail className="h-4 w-4" /> Email
            </TabsTrigger>
            <TabsTrigger value="sms" className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> WhatsApp
            </TabsTrigger>
          </TabsList>

          {/* CALL TAB */}
          <TabsContent value="call" className="space-y-3 mt-3">
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

                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant={isMuted ? 'destructive' : 'outline'}
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
                    variant={isSpeakerOn ? 'default' : 'outline'}
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  >
                    {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </Button>
                </div>

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
                  <Button onClick={initiateCall} disabled={isInitiatingCall || !phoneNumber} className="gap-2">
                    {isInitiatingCall ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Phone className="h-4 w-4" />
                    )}
                    Start Call
                  </Button>
                </div>

                <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs font-medium text-muted-foreground">Log a manual call</p>
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex-shrink-0">
                      <Label className="text-xs">Duration (min)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        className="w-20 h-8 mt-1"
                        min={0}
                        value={manualCallDuration}
                        onChange={(e) => setManualCallDuration(e.target.value)}
                      />
                    </div>
                    <div className="flex-1 min-w-[150px]">
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
          </TabsContent>

          {/* EMAIL TAB */}
          <TabsContent value="email" className="space-y-3 mt-3">
            {getFilteredTemplates().length > 0 && (
              <Select value={selectedTemplate} onValueChange={applyTemplate}>
                <SelectTrigger className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Use a template..." />
                </SelectTrigger>
                <SelectContent>
                  {getFilteredTemplates().map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                        {template.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea
              placeholder="Type your email message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">To: {recipientContact.email || 'No email'}</span>
              <Button onClick={sendCommunication} disabled={sending || !recipientContact.email}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
            </div>
          </TabsContent>

          {/* SMS TAB */}
          <TabsContent value="sms" className="space-y-3 mt-3">
            {getFilteredTemplates().length > 0 && (
              <Select value={selectedTemplate} onValueChange={applyTemplate}>
                <SelectTrigger className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Use a template..." />
                </SelectTrigger>
                <SelectContent>
                  {getFilteredTemplates().map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                        {template.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Textarea
              placeholder="Type your SMS message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              maxLength={160}
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                To: {recipientContact.phone || 'No phone'} ({content.length}/160)
              </span>
              <Button onClick={sendCommunication} disabled={sending || !recipientContact.phone}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send SMS
              </Button>
            </div>
          </TabsContent>

          {/* WHATSAPP TAB */}
          <TabsContent value="whatsapp" className="space-y-3 mt-3">
            {getFilteredTemplates().length > 0 && (
              <Select value={selectedTemplate} onValueChange={applyTemplate}>
                <SelectTrigger className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Use a template..." />
                </SelectTrigger>
                <SelectContent>
                  {getFilteredTemplates().map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                        {template.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Textarea
              placeholder="Type your WhatsApp message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">To: {recipientContact.phone || 'No phone'}</span>
              <Button
                onClick={sendCommunication}
                disabled={sending || !recipientContact.phone}
                className="bg-green-600 hover:bg-green-700"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send WhatsApp
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Communication History */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">
            {activeTab === 'call' ? 'Call History' : 'All Communication History'}
          </h4>
          <ScrollArea className="h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No history yet</p>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map((comm) => (
                  <div key={comm.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        {comm.channel === 'call'
                          ? getCallStatusIcon(comm.status, comm.direction)
                          : getChannelIcon(comm.channel)}
                        <span className="text-sm font-medium capitalize">{comm.channel}</span>
                        <Badge variant={comm.direction === 'outbound' ? 'default' : 'secondary'}>
                          {comm.direction}
                        </Badge>
                        <Badge variant={getStatusColor(comm.status)}>{comm.status || 'pending'}</Badge>
                        {comm.call_duration && (
                          <span className="text-xs text-muted-foreground">{formatDuration(comm.call_duration)}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comm.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    {comm.subject && <p className="text-sm font-medium">{comm.subject}</p>}
                    <p className="text-sm text-muted-foreground line-clamp-2">{comm.content || 'No content'}</p>
                    
                    {/* Call Recording Playback with Transcript */}
                    {comm.channel === 'call' && comm.call_recording_url && (
                      <div className="mt-2">
                        <CallRecordingPlayer 
                          recordingUrl={comm.call_recording_url} 
                          transcript={
                            typeof comm.metadata === 'object' && comm.metadata !== null && 'transcript' in comm.metadata 
                              ? String((comm.metadata as { transcript?: string }).transcript) 
                              : comm.content
                          }
                          compact 
                        />
                      </div>
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
