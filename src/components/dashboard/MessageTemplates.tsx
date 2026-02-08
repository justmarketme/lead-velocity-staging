import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Plus, Pencil, Trash2, Loader2, Mail, MessageSquare, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  content: string;
  category: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

type TemplateFormData = {
  name: string;
  channel: string;
  subject: string;
  content: string;
  category: string;
};

const CATEGORIES = [
  { value: "appointment", label: "Appointment" },
  { value: "follow-up", label: "Follow-up" },
  { value: "greeting", label: "Greeting" },
  { value: "thank-you", label: "Thank You" },
  { value: "reminder", label: "Reminder" },
  { value: "general", label: "General" },
];

const CHANNELS = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "all", label: "All Channels", icon: FileText },
];

const MessageTemplates = () => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChannel, setFilterChannel] = useState<string>("all-filter");
  const [filterCategory, setFilterCategory] = useState<string>("all-filter");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<MessageTemplate | null>(null);
  
  const [formData, setFormData] = useState<TemplateFormData>({
    name: "",
    channel: "sms",
    subject: "",
    content: "",
    category: "general",
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (template?: MessageTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        channel: template.channel,
        subject: template.subject || "",
        content: template.content,
        category: template.category,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: "",
        channel: "sms",
        subject: "",
        content: "",
        category: "general",
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    setFormData({
      name: "",
      channel: "sms",
      subject: "",
      content: "",
      category: "general",
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.content.trim()) {
      toast.error("Name and content are required");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      const templateData = {
        name: formData.name.trim(),
        channel: formData.channel,
        subject: formData.channel === "email" ? formData.subject.trim() || null : null,
        content: formData.content.trim(),
        category: formData.category,
        created_by: user.id,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from("message_templates")
          .update(templateData)
          .eq("id", editingTemplate.id);

        if (error) throw error;
        toast.success("Template updated successfully");
      } else {
        const { error } = await supabase
          .from("message_templates")
          .insert(templateData);

        if (error) throw error;
        toast.success("Template created successfully");
      }

      handleCloseDialog();
      fetchTemplates();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;

    try {
      const { error } = await supabase
        .from("message_templates")
        .delete()
        .eq("id", templateToDelete.id);

      if (error) throw error;
      toast.success("Template deleted successfully");
      fetchTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "sms":
      case "whatsapp":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case "email":
        return "default";
      case "sms":
        return "secondary";
      case "whatsapp":
        return "outline";
      default:
        return "default";
    }
  };

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesChannel = filterChannel === "all-filter" || template.channel === filterChannel;
    const matchesCategory = filterCategory === "all-filter" || template.category === filterCategory;
    return matchesSearch && matchesChannel && matchesCategory;
  });

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
          <h1 className="text-2xl font-bold text-foreground">Message Templates</h1>
          <p className="text-muted-foreground">
            Create and manage reusable message templates for communications
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-filter">All Channels</SelectItem>
                {CHANNELS.map((channel) => (
                  <SelectItem key={channel.value} value={channel.value}>
                    {channel.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-filter">All Categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Templates ({filteredTemplates.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates found</p>
              <Button variant="link" onClick={() => handleOpenDialog()}>
                Create your first template
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="hidden md:table-cell">Preview</TableHead>
                    <TableHead className="hidden lg:table-cell">Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>
                        <Badge variant={getChannelColor(template.channel)} className="flex items-center gap-1 w-fit">
                          {getChannelIcon(template.channel)}
                          <span className="capitalize">{template.channel}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {template.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-xs">
                        <p className="text-sm text-muted-foreground truncate">
                          {template.content.replace(/<[^>]*>/g, "").substring(0, 50)}...
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {format(new Date(template.updated_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(template)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setTemplateToDelete(template);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Appointment Reminder"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="channel">Channel *</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(value) => setFormData({ ...formData, channel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((channel) => (
                      <SelectItem key={channel.value} value={channel.value}>
                        {channel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.channel === "email" && (
              <div className="space-y-2">
                <Label htmlFor="subject">Email Subject</Label>
                <Input
                  id="subject"
                  placeholder="e.g., Appointment Reminder - {{date}}"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="content">Message Content *</Label>
              <Textarea
                id="content"
                placeholder="Type your message template here..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{name}}"} for recipient name and {"{{date}}"} for current date
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MessageTemplates;