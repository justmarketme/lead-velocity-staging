import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.png";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

    useEffect(() => {
        const verifyToken = async () => {
            if (!token) return;

            const { data, error } = await supabase
                .from("broker_invites")
                .select("*")
                .eq("token", token)
                .is("used_at", null)
                .gt("expires_at", new Date().toISOString())
                .single();

            if (error || !data) {
                toast({
                    title: "Invalid or Expired Link",
                    description: "This invitation link is no longer valid. Please contact your administrator.",
                    variant: "destructive",
                });
                navigate("/broker");
            } else {
                setInvite(data);
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
            // 1. Create the user in Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: invite.email,
                password: password,
                options: {
                    data: {
                        full_name: invite.broker_name,
                        firm_name: invite.firm_name,
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Failed to create user");

            // 2. Sign in (SignUp might auto-sign in depending on config, but let's be safe)
            // Note: If email confirmation is ON, we might need a different flow. 
            // Assuming auto-confirm for now as per "genenerate login details for them" requirement.

            // 3. Store Security Questions
            const { error: sqError } = await supabase
                .from("broker_security_questions")
                .insert({
                    user_id: authData.user.id,
                    question_1: q1,
                    answer_1: a1.toLowerCase().trim(),
                    question_2: q2,
                    answer_2: a2.toLowerCase().trim(),
                    question_3: q3,
                    answer_3: a3.toLowerCase().trim(),
                });

            if (sqError) throw sqError;

            // 4. Create Broker Record & Role
            await supabase.from("user_roles").insert({
                user_id: authData.user.id,
                role: "broker"
            });

            await supabase.from("brokers").insert({
                user_id: authData.user.id,
                firm_name: invite.firm_name || "Independent",
                contact_person: invite.broker_name || invite.email,
                email: invite.email,
                status: "Active"
            });

            // 5. Mark invite as used
            await supabase
                .from("broker_invites")
                .update({ used_at: new Date().toISOString() })
                .eq("token", token);

            toast({
                title: "Setup Complete!",
                description: "Your broker account has been created successfully.",
            });

            navigate("/broker");
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
                        {step === 1
                            ? `Hello ${invite?.broker_name || 'there'}, let's secure your account with a password.`
                            : "Finally, choose security questions to help you recover your account if you forget your password."}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <div className="flex justify-center mb-8">
                        <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 1 ? 'bg-primary border-primary text-white' : 'border-muted'}`}>1</div>
                            <div className={`w-12 h-1 ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 2 ? 'bg-primary border-primary text-white' : 'border-muted'}`}>2</div>
                        </div>
                    </div>

                    {step === 1 ? (
                        <form onSubmit={handleSetPassword} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
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
                    ) : (
                        <form onSubmit={handleCompleteSetup} className="space-y-6 animate-in slide-in-from-right-4 duration-300">
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
                                <Button type="submit" className="flex-[2] h-12 text-lg" disabled={submitting}>
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
