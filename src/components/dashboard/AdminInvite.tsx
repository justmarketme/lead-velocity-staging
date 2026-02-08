import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, UserPlus, Clock, CheckCircle, XCircle, Link2, Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

interface AdminInviteData {
  id: string;
  token: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

const AdminInvite = () => {
  const [invites, setInvites] = useState<AdminInviteData[]>([]);
  const [linkEmail, setLinkEmail] = useState("");
  const [emailToSend, setEmailToSend] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchInvites();
  }, []);

  const fetchInvites = async () => {
    const { data, error } = await supabase
      .from("admin_invites")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invites:", error);
    } else {
      setInvites(data || []);
    }
  };

  const generateToken = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const createInvite = async (email: string | null = null) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw new Error("Not authenticated");
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabase
      .from("admin_invites")
      .insert({
        token,
        email: email || null,
        created_by: userData.user.id,
        expires_at: expiresAt.toISOString(),
      });

    if (error) throw error;

    return { token, expiresAt: expiresAt.toISOString() };
  };

  // Use production domain for invite links
  const getInviteBaseUrl = () => {
    // In production, always use the production domain
    if (window.location.hostname === 'www.leadvelocity.co.za' || 
        window.location.hostname === 'leadvelocity.co.za') {
      return 'https://www.leadvelocity.co.za';
    }
    // For development/preview, use current origin
    return window.location.origin;
  };

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const { token } = await createInvite(linkEmail || null);
      const inviteLink = `${getInviteBaseUrl()}/invite/${token}`;
      setGeneratedLink(inviteLink);
      setLinkEmail("");
      fetchInvites();

      toast({
        title: "Invite Created",
        description: "Admin invite link has been generated successfully.",
      });
    } catch (error: any) {
      console.error("Error creating invite:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create invite",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailToSend) {
      toast({
        title: "Email Required",
        description: "Please enter an email address to send the invite.",
        variant: "destructive",
      });
      return;
    }

    setSendingEmail(true);
    try {
      const { token, expiresAt } = await createInvite(emailToSend);
      const inviteLink = `${getInviteBaseUrl()}/invite/${token}`;

      const { data, error } = await supabase.functions.invoke("send-admin-invite", {
        body: {
          email: emailToSend,
          inviteLink,
          expiresAt,
        },
      });

      if (error) throw error;

      setEmailToSend("");
      fetchInvites();

      toast({
        title: "Invite Sent!",
        description: `An invitation email has been sent to ${emailToSend}`,
      });
    } catch (error: any) {
      console.error("Error sending invite email:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send invite email",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Invite link copied to clipboard.",
    });
  };

  const getInviteStatus = (invite: AdminInviteData) => {
    if (invite.used_at) {
      return { label: "Used", variant: "secondary" as const, icon: CheckCircle };
    }
    if (new Date(invite.expires_at) < new Date()) {
      return { label: "Expired", variant: "destructive" as const, icon: XCircle };
    }
    return { label: "Active", variant: "default" as const, icon: Clock };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Admin Invites</h2>
        <p className="text-muted-foreground">
          Generate secure invite links or send email invitations to add new administrators
        </p>
      </div>

      {/* Create Invite Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Invite New Admin
          </CardTitle>
          <CardDescription>
            Generate a shareable link or send an email invitation. Links expire after 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="link" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="link" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Generate Link
              </TabsTrigger>
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Send Email
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link-email">Email (optional - for tracking)</Label>
                <div className="flex gap-3">
                  <Input
                    id="link-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={linkEmail}
                    onChange={(e) => setLinkEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleGenerateLink} disabled={loading}>
                    {loading ? "Generating..." : "Generate Link"}
                  </Button>
                </div>
              </div>

              {generatedLink && (
                <div className="p-4 bg-accent/50 rounded-lg border border-primary/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Invite Link Generated!</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={generatedLink}
                      readOnly
                      className="flex-1 text-xs bg-background"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(generatedLink)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Share this link with the person you want to invite as an admin.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="email" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-to-send">Admin Email Address *</Label>
                <div className="flex gap-3">
                  <Input
                    id="email-to-send"
                    type="email"
                    placeholder="newadmin@example.com"
                    value={emailToSend}
                    onChange={(e) => setEmailToSend(e.target.value)}
                    className="flex-1"
                    required
                  />
                  <Button onClick={handleSendEmail} disabled={sendingEmail || !emailToSend}>
                    {sendingEmail ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Invite
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  We'll send an email with instructions on how to create their admin account.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Invite History */}
      <Card>
        <CardHeader>
          <CardTitle>Invite History</CardTitle>
          <CardDescription>
            Track all admin invites and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No invites created yet
            </p>
          ) : (
            <div className="space-y-3">
              {invites.map((invite) => {
                const status = getInviteStatus(invite);
                const StatusIcon = status.icon;
                return (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-4 bg-accent/30 rounded-lg border border-border"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={status.variant}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                        {invite.email && (
                          <span className="text-sm text-foreground">{invite.email}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {formatDate(invite.created_at)} • 
                        Expires: {formatDate(invite.expires_at)}
                        {invite.used_at && ` • Used: ${formatDate(invite.used_at)}`}
                      </div>
                    </div>
                    {!invite.used_at && new Date(invite.expires_at) > new Date() && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(`${getInviteBaseUrl()}/invite/${invite.token}`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminInvite;
