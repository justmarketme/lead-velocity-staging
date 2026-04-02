import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Lock, CheckCircle2, ChevronDown, Search, Bot, Activity, Zap, LayoutGrid, List } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.webp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const SECURITY_QUESTIONS = [
    "What was the name of your first pet?",
    "What is your mother's maiden name?",
    "What was the name of your first school?",
    "In what city were you born?",
    "What was your first car?",
    "What is your favorite book?",
];

const BrokerSetup = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [invite, setInvite] = useState<any>(null);
    const [step, setStep] = useState(1);

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [q1, setQ1] = useState("");
    const [a1, setA1] = useState("");
    const [q2, setQ2] = useState("");
    const [a2, setA2] = useState("");
    const [q3, setQ3] = useState("");
    const [a3, setA3] = useState("");
    const [editableEmail, setEditableEmail] = useState("");
    const [calendarEmail, setCalendarEmail] = useState("");
    const [whatsappNumber, setWhatsappNumber] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) {
                setLoading(false);
                toast({
                    title: "Invalid Link",
                    description: "This invite link is missing the setup token. Please use the full link from your invitation email.",
                    variant: "destructive",
                });
                navigate("/broker");
                return;
            }

            // Prefer Edge Function (works without DB migration); fallback to RPC
            let data: any = null;
            let err: { message?: string; code?: string } | null = null;

            const { data: fnData, error: fnError } = await supabase.functions.invoke("get-broker-invite-by-token", {
                body: { token },
            });
            if (fnError) {
                err = fnError;
                const { data: rpcData, error: rpcError } = await supabase.rpc("get_broker_invite_by_token", {
                    invite_token: token,
                });
                if (!rpcError && rpcData) {
                    data = rpcData;
                    err = null;
                }
            } else if (fnData && !fnData.error) {
                data = fnData;
            } else if (fnData?.error) {
                err = { message: fnData.error };
            }

            if (err) {
                console.error("Broker invite validation error:", err);
                toast({
                    title: "Setup Link Error",
                    description: err.message?.includes("function") || (err as any).code === "42883"
                        ? "Invite system may need a database update. Please contact your administrator."
                        : "This invitation link could not be validated. Please contact your administrator.",
                    variant: "destructive",
                });
                navigate("/broker");
            } else if (!data) {
                toast({
                    title: "Invalid or Expired Link",
                    description: "This invitation link is no longer valid or has expired. Ask your administrator to send a new invite.",
                    variant: "destructive",
                });
                navigate("/broker");
            } else {
                setInvite(data);
                setEditableEmail(data.email ?? "");
            }
            setLoading(false);
        };

        verifyToken();
    }, [token, navigate, toast]);


    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast({ title: "Passwords match", description: "Please ensure passwords match.", variant: "destructive" });
            return;
        }
        if (password.length < 8) {
            toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
            return;
        }
        setStep(2);
    };

    const handleCompleteSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!q1 || !a1 || !q2 || !a2 || !q3 || !a3) {
            toast({ title: "Missing fields", description: "Please answer all security questions.", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        try {
            console.log("Starting broker sign up with email:", editableEmail || invite.email);

            // 1. Create the user in Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: editableEmail || invite.email,
                password: password,
                options: {
                    data: {
                        user_type: 'broker',
                        full_name: invite.broker_name,
                        firm_name: invite.firm_name,
                        portal_type: invite.portal_type || 'referral',
                        token: token,
                        q1: q1,
                        a1: a1.toLowerCase().trim(),
                        q2: q2,
                        a2: a2.toLowerCase().trim(),
                        q3: q3,
                        a3: a3.toLowerCase().trim(),
                        calendar_email: calendarEmail || editableEmail || invite.email,
                        whatsapp_number: whatsappNumber,
                    }
                }
            });

            console.log("Sign up response -> data:", authData, "error:", authError);

            // Handle errors gracefully
            if (authError) {
                const isRateLimit = authError.message.includes("Error sending confirmation email") || authError.message.includes("rate limit");
                const isAlreadyRegistered = authError.message.includes("User already registered") || authError.message.includes("already registered");

                if (isAlreadyRegistered) {
                    console.log("User already exists. Redirecting to login/portal...");
                    toast({
                        title: "Account Already Exists",
                        description: "This email is registered. Let's get you to your portal...",
                    });
                    // Fall through to success
                } else if (isRateLimit) {
                    console.warn("Email sending failed due to rate limits. Bypassing...");
                    // Fall through to success, since the user was actually created in the DB
                } else {
                    console.error("Critical Auth Error:", authError);
                    throw authError; // Throw actual critical errors
                }
            } else if (!authData?.user) {
                // VERY rare edge case, but we need a unique error message so we know if it hits here
                console.error("No user returned, but no error thrown by Supabase either!");
                throw new Error("API Issue: Supabase returned empty user data. Please try again.");
            }

            toast({
                title: "Setup Complete!",
                description: "Your broker account has been created successfully. You can now log in.",
            });

            setIsSuccess(true);

            // After setup, send brokers to the broker login page with their email pre-filled
            const loginEmail = editableEmail || invite?.email || "";
            const timer = setTimeout(() => {
                navigate("/broker", { state: { email: loginEmail } });
            }, 3000);
            return () => clearTimeout(timer);
        } catch (error: any) {
            console.error("Setup error:", error);
            toast({
                title: "Setup Failed",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-4">
            <img src={logo} alt="Lead Velocity" className="h-16 w-auto mb-8 animate-fade-in" />

            <Card className="w-full max-w-xl border-border/50 bg-background/95 backdrop-blur shadow-xl">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                        {step === 1 ? <Lock className="text-primary" /> : <ShieldCheck className="text-primary" />}
                    </div>
                    <CardTitle className="text-2xl font-bold">Broker Account Setup</CardTitle>
                    <CardDescription>
                        {isSuccess
                            ? "Your account is now ready. You can log in to access your portal."
                            : step === 1
                                ? `Hello ${invite?.broker_name || 'there'}, let's secure your account with a password.`
                                : step === 2
                                    ? "Choose security questions to help you recover your account."
                                    : "Connect your calendar and WhatsApp to receive appointment notifications."}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {!isSuccess && (
                        <div className="flex justify-center mb-8">
                            <div className="flex items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 1 ? 'bg-primary border-primary text-white' : 'border-muted'}`}>1</div>
                                <div className={`w-10 h-1 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 2 ? 'bg-primary border-primary text-white' : 'border-muted'}`}>2</div>
                                <div className={`w-10 h-1 ${step >= 3 ? 'bg-primary' : 'bg-muted'}`} />
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 3 ? 'bg-primary border-primary text-white' : 'border-muted'}`}>3</div>
                            </div>
                        </div>
                    )}

                    {isSuccess ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-6 animate-in zoom-in-95 duration-500">
                            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="h-12 w-12 text-green-500" />
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-semibold">Registration Successful!</h3>
                                <p className="text-muted-foreground">
                                    Your profile has been created and secured. Redirecting you to the broker login page in 3 seconds...
                                </p>
                            </div>
                            <Button
                                className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90"
                                onClick={() => {
                                    const loginEmail = editableEmail || invite?.email || "";
                                    navigate("/broker", { state: { email: loginEmail } });
                                }}
                            >
                                Go to Broker Login
                            </Button>
                        </div>
                    ) : step === 1 ? (
                        <form onSubmit={handleSetPassword} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={editableEmail}
                                    onChange={(e) => setEditableEmail(e.target.value)}
                                    className="bg-background"
                                />
                                <p className="text-[10px] text-muted-foreground">You can update your email if it has changed.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Create Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Minimum 8 characters"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm-password">Confirm Password</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    placeholder="Repeat your password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full h-12 text-lg">
                                Continue to Security
                            </Button>
                        </form>
                    ) : step === 2 ? (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            {[1, 2, 3].map((num) => (
                                <div key={num} className="space-y-3 p-4 bg-accent/30 rounded-lg border border-border">
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Security Question {num}</Label>
                                        <Select
                                            onValueChange={(val) => num === 1 ? setQ1(val) : num === 2 ? setQ2(val) : setQ3(val)}
                                            required
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a question" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SECURITY_QUESTIONS.map(q => (
                                                    <SelectItem key={q} value={q} disabled={q === q1 || q === q2 || q === q3}>{q}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your Answer</Label>
                                        <Input
                                            placeholder="Answer (not case sensitive)"
                                            value={num === 1 ? a1 : num === 2 ? a2 : a3}
                                            onChange={(e) => num === 1 ? setA1(e.target.value) : num === 2 ? setA2(e.target.value) : setA3(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                            ))}

                            <div className="flex gap-4">
                                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                                    Back
                                </Button>
                                <Button type="button" className="flex-[2] h-12 text-lg" onClick={() => {
                                    if (q1 && a1 && q2 && a2 && q3 && a3) setStep(3);
                                    else toast({ title: "Fields missing", description: "Answer all security questions.", variant: "destructive" });
                                }}>
                                    Continue to Integrations
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleCompleteSetup} className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="calendarEmail">Google Calendar Email</Label>
                                    <Input
                                        id="calendarEmail"
                                        placeholder="your-google-calendar@gmail.com"
                                        value={calendarEmail}
                                        onChange={(e) => setCalendarEmail(e.target.value)}
                                        className="bg-background"
                                    />
                                    <p className="text-[10px] text-muted-foreground italic">Ayanda will check this calendar's availability before booking.</p>
                                </div>
                                <Separator className="opacity-30" />
                                <div className="space-y-2">
                                    <Label htmlFor="whatsapp">WhatsApp Number</Label>
                                    <Input
                                        id="whatsapp"
                                        placeholder="+27..."
                                        value={whatsappNumber}
                                        onChange={(e) => setWhatsappNumber(e.target.value)}
                                        className="bg-background"
                                    />
                                    <p className="text-[10px] text-muted-foreground italic">Required for automated WhatsApp appointment confirmations.</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                                    Back
                                </Button>
                                <Button type="submit" className="flex-[2] h-12 text-lg bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-bold" disabled={submitting}>
                                    {submitting ? "Finalizing..." : "Complete Setup"}
                                </Button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>

            <p className="mt-8 text-xs text-muted-foreground">
                © 2025 Lead Velocity. Secure Broker Onboarding.
            </p>
        </div>
    );
};

export default BrokerSetup;
