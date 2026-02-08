import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageSquare, Phone, Send, Loader2, FileText, Bot, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

const COUNTRY_CODES = [
  { code: '+27', name: 'South Africa' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+1', name: 'USA/Canada' },
  { code: '+61', name: 'Australia' },
  { code: '+353', name: 'Ireland' },
  { code: '+264', name: 'Namibia' },
  { code: '+267', name: 'Botswana' },
  { code: '+260', name: 'Zambia' },
  { code: '+263', name: 'Zimbabwe' },
];

interface Communication {
  id: string;
  channel: string;
  direction: string;
  content: string | null;
  subject: string | null;
  status: string | null;
  created_at: string;
  recipient_contact: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  content: string;
  category: string;
}

interface CommunicationPanelProps {
  recipientType: 'lead' | 'referral' | 'broker';
  recipientId: string;
  recipientContact: {
    email?: string;
    phone?: string;
    name?: string;
  };
}

export function CommunicationPanel({ recipientType, recipientId, recipientContact }: CommunicationPanelProps) {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'email' | 'sms' | 'whatsapp' | 'call'>('email');
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [editedPhone, setEditedPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+27');

  useEffect(() => {
    if (recipientContact.phone) {
      // Basic check for existing country code
      const foundMatch = COUNTRY_CODES.find(c => recipientContact.phone?.startsWith(c.code));
      if (foundMatch) {
        setCountryCode(foundMatch.code);
        setEditedPhone(recipientContact.phone.slice(foundMatch.code.length));
      } else {
        setEditedPhone(recipientContact.phone);
      }
    }
  }, [recipientContact.phone]);

  useEffect(() => {
    fetchCommunications();
    fetchTemplates();
  }, [recipientId]);

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
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    // Replace placeholders with actual values
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
    return templates.filter(t => t.channel === activeTab || t.channel === 'all');
  };

  const sendCommunication = async () => {
    if (!content.trim()) {
      toast.error('Please enter a message');
      return;
    }

    const contact = activeTab === 'email'
      ? recipientContact.email
      : `${countryCode}${editedPhone}`.replace(/\s/g, '');

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
        subject: activeTab === 'email' ? (subject || `Message for ${recipientContact.name || 'you'}`) : undefined,
      };

      const response = await supabase.functions.invoke('send-communication', {
        body: payload,
      });

      if (response.error) throw response.error;

      toast.success(`${activeTab.toUpperCase()} sent successfully`);
      setContent('');
      setSubject('');
      fetchCommunications();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error sending communication:', error);
      toast.error(`Failed to send: ${errorMessage}`);
    } finally {
      setSending(false);
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4 text-green-500" />;
      case 'call': return <Phone className="h-4 w-4" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'sent': return 'default';
      case 'delivered': return 'default';
      case 'failed': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Communications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'email' | 'sms' | 'whatsapp' | 'call')}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="email" className="flex items-center gap-1">
              <Mail className="h-4 w-4" /> Email
            </TabsTrigger>
            <TabsTrigger value="sms" className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> SMS
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> WhatsApp
            </TabsTrigger>
            <TabsTrigger value="call" className="flex items-center gap-1">
              <Phone className="h-4 w-4" /> Call
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-3 mt-3">
            {/* Template Selector */}
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
                        <Badge variant="outline" className="text-xs">{template.category}</Badge>
                        {template.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              placeholder="Type your email message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                To: {recipientContact.email || 'No email'}
              </span>
              <Button onClick={sendCommunication} disabled={sending || !recipientContact.email}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="sms" className="space-y-3 mt-3">
            {/* Template Selector */}
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
                        <Badge variant="outline" className="text-xs">{template.category}</Badge>
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

          <TabsContent value="whatsapp" className="space-y-3 mt-3">
            {/* Template Selector */}
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
                        <Badge variant="outline" className="text-xs">{template.category}</Badge>
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
              <span className="text-sm text-muted-foreground">
                To: {recipientContact.phone || 'No phone'}
              </span>
              <Button onClick={sendCommunication} disabled={sending || !recipientContact.phone} className="bg-green-600 hover:bg-green-700">
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send WhatsApp
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="call" className="space-y-4 mt-3">
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground mb-4">
                Choose how you'd like to call {recipientContact.name || 'this contact'}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone-number">Phone Number</Label>
                <div className="flex gap-2">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="phone-number"
                    value={editedPhone}
                    onChange={(e) => setEditedPhone(e.target.value)}
                    placeholder="72 000 0000"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Manual Call */}
                <Button
                  variant="outline"
                  className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-green-500/10 hover:border-green-500"
                  onClick={() => {
                    const fullNumber = `${countryCode}${editedPhone}`.replace(/\s/g, '');
                    if (fullNumber) {
                      window.open(`tel:${fullNumber}`, '_self');
                    } else {
                      toast.error('No phone number available');
                    }
                  }}
                  disabled={!editedPhone}
                >
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-green-500" />
                  </div>
                  <span className="font-medium">Manual Call</span>
                  <span className="text-xs text-muted-foreground">Call yourself</span>
                </Button>

                {/* AI Agent Call */}
                <Button
                  variant="outline"
                  className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-violet-500/10 hover:border-violet-500"
                  onClick={async () => {
                    if (!editedPhone) {
                      toast.error('Please enter a phone number');
                      return;
                    }
                    const fullNumber = `${countryCode}${editedPhone}`.replace(/\s/g, '');
                    try {
                      const { data, error } = await supabase.functions.invoke('initiate-ai-call', {
                        body: {
                          recipient_type: recipientType,
                          recipient_id: recipientId,
                          recipient_name: recipientContact.name || 'Contact',
                          recipient_phone: fullNumber,
                          call_purpose: 'general_inquiry',
                        },
                      });
                      if (error) throw error;
                      toast.success('AI call initiated! You will be notified when complete.');
                    } catch (error) {
                      console.error('Error initiating AI call:', error);
                      toast.error('Failed to initiate AI call');
                    }
                  }}
                  disabled={!editedPhone}
                >
                  <div className="h-10 w-10 rounded-full bg-violet-500/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-violet-500" />
                  </div>
                  <span className="font-medium">AI Agent Call</span>
                  <span className="text-xs text-muted-foreground">Automated call</span>
                </Button>
              </div>

              <div className="text-center">
                <span className="text-sm text-muted-foreground">
                  Calling: {countryCode} {editedPhone}
                </span>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">Communication History</h4>
          <ScrollArea className="h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : communications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No communications yet
              </p>
            ) : (
              <div className="space-y-3">
                {communications.map((comm) => (
                  <div key={comm.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getChannelIcon(comm.channel)}
                        <span className="text-sm font-medium capitalize">{comm.channel}</span>
                        <Badge variant={comm.direction === 'outbound' ? 'default' : 'secondary'}>
                          {comm.direction}
                        </Badge>
                        <Badge variant={getStatusColor(comm.status)}>
                          {comm.status || 'pending'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comm.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    {comm.subject && (
                      <p className="text-sm font-medium">{comm.subject}</p>
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {comm.content || 'No content'}
                    </p>
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
