import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, MessageCircle, MessageSquare, Send, Loader2, Users, Eye, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  content: string;
}

interface BulkCommunicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLeads: Lead[];
  onSuccess?: () => void;
}

type Channel = "email" | "sms" | "whatsapp";

export const BulkCommunicationDialog = ({
  open,
  onOpenChange,
  selectedLeads,
  onSuccess
}: BulkCommunicationDialogProps) => {
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");
  const { toast } = useToast();

  // Fetch message templates
  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase
        .from("message_templates")
        .select("*")
        .order("name");
      
      if (data) {
        setTemplates(data);
      }
    };

    if (open) {
      fetchTemplates();
      if (selectedLeads.length > 0) {
        setPreviewLead(selectedLeads[0]);
      }
    }
  }, [open, selectedLeads]);

  // Filter templates by channel
  const filteredTemplates = templates.filter(t => t.channel === channel);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setMessage(template.content);
      if (template.subject) {
        setSubject(template.subject);
      }
    }
  };

  const personalizeMessage = (text: string, lead: Lead): string => {
    const firstName = lead.first_name || '';
    const lastName = lead.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Valued Customer';
    
    return text
      .replace(/\{first_name\}/gi, firstName)
      .replace(/\{last_name\}/gi, lastName)
      .replace(/\{name\}/gi, fullName)
      .replace(/\{email\}/gi, lead.email)
      .replace(/\{phone\}/gi, lead.phone);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive"
      });
      return;
    }

    if (channel === "email" && !subject.trim()) {
      toast({
        title: "Error",
        description: "Please enter a subject for the email",
        variant: "destructive"
      });
      return;
    }

    if (message.length > 5000) {
      toast({
        title: "Error",
        description: "Message is too long (max 5000 characters)",
        variant: "destructive"
      });
      return;
    }

    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-communication", {
        body: {
          channel,
          recipients: selectedLeads.map(lead => ({
            id: lead.id,
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email,
            phone: lead.phone
          })),
          message_template: message,
          subject: channel === "email" ? subject : undefined,
          recipient_type: "lead"
        }
      });

      if (error) throw error;

      if (data.sent > 0) {
        toast({
          title: "Messages Sent",
          description: `Successfully sent ${data.sent} message${data.sent > 1 ? 's' : ''}${data.failed > 0 ? `. ${data.failed} failed.` : ''}`,
        });
        onSuccess?.();
        onOpenChange(false);
        resetForm();
      } else {
        toast({
          title: "Failed",
          description: "Failed to send messages. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Bulk send error:", error);
      toast({
        title: "Error",
        description: "An error occurred while sending messages",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setSubject("");
    setMessage("");
    setSelectedTemplate("");
    setActiveTab("compose");
  };

  const insertPlaceholder = (placeholder: string) => {
    setMessage(prev => prev + placeholder);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Message
          </DialogTitle>
          <DialogDescription>
            Send a customized message to {selectedLeads.length} selected lead{selectedLeads.length > 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "compose" | "preview")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose">
              <FileText className="mr-2 h-4 w-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4 mt-4">
            {/* Selected leads preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Recipients</Label>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {selectedLeads.slice(0, 8).map(lead => (
                  <Badge key={lead.id} variant="secondary" className="text-xs">
                    {lead.first_name} {lead.last_name}
                  </Badge>
                ))}
                {selectedLeads.length > 8 && (
                  <Badge variant="outline" className="text-xs">
                    +{selectedLeads.length - 8} more
                  </Badge>
                )}
              </div>
            </div>

            {/* Channel selection */}
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => {
                setChannel(v as Channel);
                setSelectedTemplate("");
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-500" />
                      Email
                    </div>
                  </SelectItem>
                  <SelectItem value="sms">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-purple-500" />
                      SMS
                    </div>
                  </SelectItem>
                  <SelectItem value="whatsapp">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-emerald-500" />
                      WhatsApp
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Template selection */}
            {filteredTemplates.length > 0 && (
              <div className="space-y-2">
                <Label>Use Template (Optional)</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTemplates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Subject (email only) */}
            {channel === "email" && (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  placeholder="Enter email subject..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
              </div>
            )}

            {/* Personalization placeholders */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Insert Placeholder</Label>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => insertPlaceholder("{first_name}")}
                >
                  First Name
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => insertPlaceholder("{last_name}")}
                >
                  Last Name
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => insertPlaceholder("{name}")}
                >
                  Full Name
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => insertPlaceholder("{email}")}
                >
                  Email
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => insertPlaceholder("{phone}")}
                >
                  Phone
                </Button>
              </div>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Enter your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length}/5000 characters
              </p>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4 mt-4">
            {/* Preview recipient selector */}
            <div className="space-y-2">
              <Label>Preview for</Label>
              <Select 
                value={previewLead?.id || ""} 
                onValueChange={(id) => {
                  const lead = selectedLeads.find(l => l.id === id);
                  if (lead) setPreviewLead(lead);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead to preview..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedLeads.map(lead => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.first_name} {lead.last_name} ({lead.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview content */}
            {previewLead && (
              <div className="space-y-4">
                {channel === "email" && subject && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Subject</Label>
                    <div className="p-3 bg-muted rounded-md text-sm font-medium">
                      {personalizeMessage(subject, previewLead)}
                    </div>
                  </div>
                )}
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Message</Label>
                  <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                    <div className="text-sm whitespace-pre-wrap">
                      {message ? personalizeMessage(message, previewLead) : (
                        <span className="text-muted-foreground italic">No message content yet...</span>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground">
                    <strong>Sending to:</strong> {channel === "email" ? previewLead.email : previewLead.phone}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send to {selectedLeads.length} Lead{selectedLeads.length > 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
