import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, UserPlus, Clock, CheckCircle, XCircle, Link2, Mail, Send, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { BrokerSelector } from "./BrokerSelector";
import { Switch } from "@/components/ui/switch";

interface BrokerInviteData {
    id: string;
    token: string;
    email: string;
    broker_name: string | null;
    firm_name: string | null;
    created_at: string;
    expires_at: string;
    used_at: string | null;
    portal_type: 'referral' | 'marketing';
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
    const [portalType, setPortalType] = useState<'referral' | 'marketing'>('referral');
    const [loading, setLoading] = useState(false);
    const [generatedLink, setGeneratedLink] = useState("");
    const { toast } = useToast();

    const handleBrokerSelect = (broker: any) => {
        setBrokerName(broker.full_name || "");
        setFirmName(broker.firm_name || broker.company_name || "");
        setBrokerEmail(broker.email || "");
    };

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

    const createInvite = async (email: string, name: string, firm: string, type: 'referral' | 'marketing' = 'referral') => {
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
                portal_type: type,
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
        if (!brokerEmail?.trim()) return;
        await doInvite(true);
    };

    const handleGenerateLinkOnly = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!brokerEmail?.trim()) {
            toast({ title: "Email required", description: "Enter the broker's email to generate a link.", variant: "destructive" });
            return;
        }
        await doInvite(false);
    };

    const doInvite = async (sendEmail: boolean) => {
        setLoading(true);
        const recipientEmail = brokerEmail.trim();
        try {
            const { token, expiresAt } = await createInvite(recipientEmail, brokerName, firmName, portalType);
            const inviteLink = `${getInviteBaseUrl()}/broker-setup/${token}`;
            setGeneratedLink(inviteLink);

            if (sendEmail) {
                const { error: funcError } = await supabase.functions.invoke("send-broker-invite", {
                    body: {
                        email: recipientEmail,
                        brokerName: brokerName,
                        inviteLink,
                        expiresAt,
                        portalType: portalType
                    },
                });

                if (funcError) {
                    console.warn("Failed to send automated email:", funcError);
                    toast({
                        title: "Record Created (Email Pending)",
                        description: "The invite is in the system, but the email couldn't be sent automatically. Please copy the link below.",
                        variant: "destructive",
                    });
                } else {
                    toast({
                        title: "Success! Email Sent",
                        description: `Broker invitation has been sent to ${recipientEmail}.`,
                    });
                    // Clear form only on full success
                    setBrokerEmail("");
                    setBrokerName("");
                    setFirmName("");
                }
            } else {
                toast({
                    title: "Link Ready",
                    description: "The unique setup link has been generated. Copy it below.",
                });
            }
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
            await supabase
                .from("broker_reset_requests")
                .update({ status: 'resolved', resolved_at: new Date().toISOString() })
                .eq("id", id);

            const { token, expiresAt } = await createInvite(email, name, "");
            const inviteLink = `${getInviteBaseUrl()}/broker-setup/${token}`;

            const { error: funcError } = await supabase.functions.invoke("send-broker-invite", {
                body: {
                    email,
                    brokerName: name,
                    inviteLink,
                    expiresAt,
                },
            });

            if (funcError) {
                setGeneratedLink(inviteLink);
                toast({
                    title: "Status Link Updated",
                    description: "Failed to send email, but setup link is ready to copy.",
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Reset Link Sent",
                    description: `A new setup link has been sent to ${email}.`,
                });
            }
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

    const handleResendEmail = async (invite: BrokerInviteData) => {
        setLoading(true);
        try {
            const inviteLink = `${getInviteBaseUrl()}/broker-setup/${invite.token}`;

            const { error: funcError } = await supabase.functions.invoke("send-broker-invite", {
                body: {
                    email: invite.email,
                    brokerName: invite.broker_name,
                    inviteLink,
                    expiresAt: invite.expires_at,
                    portalType: invite.portal_type
                },
            });

            if (funcError) throw funcError;

            toast({
                title: "Email Sent",
                description: `Invitation email resent to ${invite.email}.`,
            });
        } catch (error: any) {
            console.error("Error resending email:", error);
            toast({
                title: "Send Failed",
                description: "Could not deliver the email. You might need to copy the link manually.",
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
                            Step 1: Invite New Broker
                        </CardTitle>
                        <CardDescription>
                            Create a secure onboarding link and optionally send it via automated email.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <BrokerSelector onSelect={handleBrokerSelect} />
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

                            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/50">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Portal Type</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {portalType === 'referral'
                                                ? "Referral: They have leads; we work referrals."
                                                : "Elite: We generate leads for them."}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 bg-background p-1 rounded-md border">
                                        <span className={`text-[10px] px-2 py-1 rounded transition-colors ${portalType === 'referral' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>REFERRAL</span>
                                        <Switch
                                            checked={portalType === 'marketing'}
                                            onCheckedChange={(checked) => setPortalType(checked ? 'marketing' : 'referral')}
                                        />
                                        <span className={`text-[10px] px-2 py-1 rounded transition-colors ${portalType === 'marketing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>ELITE</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="broker-email">Email Address</Label>
                                <Input
                                    id="broker-email"
                                    type="email"
                                    placeholder="broker@example.com"
                                    value={brokerEmail}
                                    onChange={(e) => setBrokerEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                <Button type="submit" disabled={loading} className="flex-1">
                                    <Mail className="h-4 w-4 mr-2" />
                                    {loading ? "Sending..." : "Invite via Email"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={loading}
                                    onClick={handleGenerateLinkOnly}
                                    className="flex-1"
                                >
                                    <Link2 className="h-4 w-4 mr-2" />
                                    Generate Link Only
                                </Button>
                            </div>

                            {/* Generated link section */}
                            {generatedLink && (
                                <div className="p-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Link2 className="h-4 w-4 text-primary" />
                                            <span className="text-sm font-semibold">Ready to share</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyToClipboard(generatedLink)}
                                            className="h-8 px-2 text-primary"
                                        >
                                            <Copy className="h-4 w-4 mr-1" />
                                            Copy
                                        </Button>
                                    </div>
                                    <Input
                                        value={generatedLink}
                                        readOnly
                                        className="text-xs bg-background font-mono h-8"
                                    />
                                    <p className="text-[10px] text-muted-foreground italic">
                                        You can share this link directly via WhatsApp or SMS if the email doesn't arrive.
                                    </p>
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
                            Step 2: Reset Requests
                        </CardTitle>
                        <CardDescription>
                            Brokers who forgot their access can be resent a new link here.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {resetRequests.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-orange-500/[0.02]">
                                <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p>No pending reset requests</p>
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
                                            Resend Setup
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
                        Track the status of the last 5 invitations.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {invites.length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground italic">No invitation history yet.</p>
                        ) : (
                            invites.slice(0, 5).map((invite) => {
                                const status = getInviteStatus(invite);
                                const Icon = status.icon;
                                return (
                                    <div key={invite.id} className="grid grid-cols-1 md:grid-cols-3 items-center p-4 bg-card hover:bg-accent/30 transition-colors border rounded-xl gap-4">
                                        <div className="flex gap-4 items-center">
                                            <Badge variant={status.variant} className="w-20 justify-center">
                                                {status.label}
                                            </Badge>
                                            <div>
                                                <p className="font-semibold text-sm">{invite.broker_name || invite.email}</p>
                                                <p className="text-[10px] text-muted-foreground font-mono">{invite.firm_name || 'Individual Broker'}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center md:justify-center gap-2">
                                            <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-bold tracking-wider">
                                                {invite.portal_type.toUpperCase()}
                                            </Badge>
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                                Ref: {invite.token.substring(0, 6)}...
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-end gap-2">
                                            {!invite.used_at && (
                                                <>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleResendEmail(invite)}
                                                        disabled={loading}
                                                        className="h-8 text-[11px] border-primary/20 text-primary hover:bg-primary/5"
                                                    >
                                                        <Mail className="h-3 w-3 mr-1.5" />
                                                        Resend Email
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => copyToClipboard(`${getInviteBaseUrl()}/broker-setup/${invite.token}`)}
                                                        className="h-8 text-[11px]"
                                                    >
                                                        <Copy className="h-3 w-3 mr-1.5" />
                                                        Link
                                                    </Button>
                                                </>
                                            )}
                                            {invite.used_at && (
                                                <span className="text-[10px] text-green-600 font-medium flex items-center bg-green-50 px-2 py-1 rounded">
                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                    Setup Complete
                                                </span>
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
