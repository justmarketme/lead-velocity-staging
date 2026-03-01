import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, UserPlus, Clock, CheckCircle, XCircle, Link2, Mail, Send, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

interface BrokerInviteData {
    id: string;
    token: string;
    email: string;
    broker_name: string | null;
    firm_name: string | null;
    created_at: string;
    expires_at: string;
    used_at: string | null;
}

interface ResetRequestData {
    id: string;
    email: string;
    status: string;
    created_at: string;
}

const BrokerInvite = () => {
    const [invites, setInvites] = useState<BrokerInviteData[]>([]);
    const [resetRequests, setResetRequests] = useState<ResetRequestData[]>([]);
    const [brokerEmail, setBrokerEmail] = useState("");
    const [brokerName, setBrokerName] = useState("");
    const [firmName, setFirmName] = useState("");
    const [loading, setLoading] = useState(false);
    const [generatedLink, setGeneratedLink] = useState("");
    const { toast } = useToast();

    useEffect(() => {
        fetchInvites();
        fetchResetRequests();
    }, []);

    const fetchInvites = async () => {
        const { data, error } = await supabase
            .from("broker_invites")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching invites:", error);
        } else {
            setInvites(data || []);
        }
    };

    const fetchResetRequests = async () => {
        const { data, error } = await supabase
            .from("broker_reset_requests")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching reset requests:", error);
        } else {
            setResetRequests(data || []);
        }
    };

    const generateToken = () => {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    };

    const createInvite = async (email: string, name: string, firm: string) => {
        const token = generateToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const { error } = await supabase
            .from("broker_invites")
            .insert({
                token,
                email,
                broker_name: name,
                firm_name: firm,
                expires_at: expiresAt.toISOString(),
            });

        if (error) throw error;

        return { token, expiresAt: expiresAt.toISOString() };
    };

    const getInviteBaseUrl = () => {
        if (window.location.hostname === 'www.leadvelocity.co.za' ||
            window.location.hostname === 'leadvelocity.co.za') {
            return 'https://www.leadvelocity.co.za';
        }
        return window.location.origin;
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!brokerEmail) return;

        setLoading(true);
        try {
            const { token, expiresAt } = await createInvite(brokerEmail, brokerName, firmName);
            const inviteLink = `${getInviteBaseUrl()}/broker-setup/${token}`;

            // Optionally send email via Edge Function
            const { error: funcError } = await supabase.functions.invoke("send-broker-invite", {
                body: {
                    email: brokerEmail,
                    brokerName: brokerName,
                    inviteLink,
                    expiresAt,
                },
            });

            if (funcError) {
                console.warn("Failed to send automated email:", funcError);
                setGeneratedLink(inviteLink);
                toast({
                    title: "Invite Created (Email failed)",
                    description: "Link generated but failed to send email. You can copy it manually.",
                    variant: "destructive",
                });
            } else {
                setGeneratedLink("");
                toast({
                    title: "Invite Sent",
                    description: `Invitation email sent to ${brokerEmail}.`,
                });
            }

            setBrokerEmail("");
            setBrokerName("");
            setFirmName("");
            fetchInvites();
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

    const handleResolveRequest = async (id: string, email: string, name: string) => {
        setLoading(true);
        try {
            // 1. Mark request as resolved
            await supabase
                .from("broker_reset_requests")
                .update({ status: 'resolved', resolved_at: new Date().toISOString() })
                .eq("id", id);

            // 2. Create and send new invite
            const { token, expiresAt } = await createInvite(email, name, "");
            const inviteLink = `${getInviteBaseUrl()}/broker-setup/${token}`;

            await supabase.functions.invoke("send-broker-invite", {
                body: {
                    email,
                    brokerName: name,
                    inviteLink,
                    expiresAt,
                },
            });

            toast({
                title: "Reset Link Sent",
                description: `A new setup link has been sent to ${email}.`,
            });
            fetchResetRequests();
            fetchInvites();
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: "Copied!",
            description: "Link copied to clipboard.",
        });
    };

    const getInviteStatus = (invite: BrokerInviteData) => {
        if (invite.used_at) {
            return { label: "Used", variant: "secondary" as const, icon: CheckCircle };
        }
        if (new Date(invite.expires_at) < new Date()) {
            return { label: "Expired", variant: "destructive" as const, icon: XCircle };
        }
        return { label: "Active", variant: "default" as const, icon: Clock };
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Broker Onboarding</h2>
                    <p className="text-muted-foreground">
                        Invite new brokers and manage password reset requests
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { fetchInvites(); fetchResetRequests(); }}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Invite Form */}
                <Card className="border-primary/20 h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            Invite New Broker
                        </CardTitle>
                        <CardDescription>
                            Brokers will receive an email to set their password and security questions.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="broker-name">Broker Full Name</Label>
                                    <Input
                                        id="broker-name"
                                        placeholder="John Doe"
                                        value={brokerName}
                                        onChange={(e) => setBrokerName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="firm-name">Firm Name</Label>
                                    <Input
                                        id="firm-name"
                                        placeholder="ABC Brokerage"
                                        value={firmName}
                                        onChange={(e) => setFirmName(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="broker-email">Email Address</Label>
                                <div className="flex gap-3">
                                    <Input
                                        id="broker-email"
                                        type="email"
                                        placeholder="broker@example.com"
                                        value={brokerEmail}
                                        onChange={(e) => setBrokerEmail(e.target.value)}
                                        className="flex-1"
                                        required
                                    />
                                    <Button type="submit" disabled={loading}>
                                        {loading ? "Sending..." : "Send Invite"}
                                    </Button>
                                </div>
                            </div>

                            {generatedLink && (
                                <div className="p-4 bg-accent/50 rounded-lg border border-primary/30 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Link2 className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-medium text-foreground">Manual Link (Use if email fails)</span>
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
                                </div>
                            )}
                        </form>
                    </CardContent>
                </Card>

                {/* Reset Requests Queue */}
                <Card className="border-orange-500/20 h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-orange-500">
                            <RefreshCw className="h-5 w-5" />
                            Reset Requests
                        </CardTitle>
                        <CardDescription>
                            Brokers requesting manual password resets because they forgot their security questions.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {resetRequests.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                                No pending reset requests
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {resetRequests.map((request) => (
                                    <div key={request.id} className="flex items-center justify-between p-3 bg-orange-500/5 rounded-lg border border-orange-500/20">
                                        <div>
                                            <p className="font-medium text-sm">{request.email}</p>
                                            <p className="text-xs text-muted-foreground">Requested: {new Date(request.created_at).toLocaleString()}</p>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={() => handleResolveRequest(request.id, request.email, request.email.split('@')[0])}
                                            disabled={loading}
                                        >
                                            Resend Setup Link
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Invite History */}
            <Card>
                <CardHeader>
                    <CardTitle>Invitation History</CardTitle>
                    <CardDescription>
                        Recent broker invitations and their current usage status
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {invites.length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">No invitations found</p>
                        ) : (
                            invites.slice(0, 5).map((invite) => {
                                const status = getInviteStatus(invite);
                                const Icon = status.icon;
                                return (
                                    <div key={invite.id} className="flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border rounded-lg">
                                        <div className="flex gap-4 items-center">
                                            <Badge variant={status.variant}>
                                                <Icon className="h-3 w-3 mr-1" />
                                                {status.label}
                                            </Badge>
                                            <div>
                                                <p className="font-medium text-sm">{invite.broker_name || invite.email}</p>
                                                <p className="text-xs text-muted-foreground">{invite.email} • {invite.firm_name || 'No Firm'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-muted-foreground">
                                                {invite.used_at ? `Used: ${new Date(invite.used_at).toLocaleDateString()}` : `Expires: ${new Date(invite.expires_at).toLocaleDateString()}`}
                                            </p>
                                            {!invite.used_at && (
                                                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${getInviteBaseUrl()}/broker-setup/${invite.token}`)}>
                                                    <Copy className="h-3 w-3 mr-1" />
                                                    Copy Link
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default BrokerInvite;
