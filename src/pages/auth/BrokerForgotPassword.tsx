import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ShieldQuestion, AlertCircle, Mail, Send, ArrowLeft, CheckCircle2 } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.png";

const BrokerForgotPassword = () => {
    const navigate = useNavigate();
    const { toast } = useToast();

    const [step, setStep] = useState(1); // 1: Email, 2: Questions, 3: Success
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [questions, setQuestions] = useState<any>(null);

    const [ans1, setAns1] = useState("");
    const [ans2, setAns2] = useState("");
    const [ans3, setAns3] = useState("");

    const handleVerifyEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Find user by email (we need their ID)
            // Since it's public schema questions, we can query if we know the email.
            // But we don't want to leak who has an account. 
            // However, security questions are linked to user_id. 
            // We'll use a RPC or a query that joins profiles/brokers if needed.
            // For now, let's assume we can fetch questions if the email exists in brokers.

            const { data: broker, error: bError } = await supabase
                .from("brokers")
                .select("user_id")
                .eq("email", email)
                .single();

            if (bError || !broker) {
                // Generic error to avoid email enumeration
                throw new Error("If an account exists with this email, you will be prompted for security questions.");
            }

            // 2. Fetch questions
            const { data: qData, error: qError } = await supabase
                .from("broker_security_questions")
                .select("question_1, question_2, question_3")
                .eq("user_id", broker.user_id)
                .single();

            if (qError || !qData) {
                throw new Error("No security questions found for this account. Please contact an administrator.");
            }

            setQuestions(qData);
            setStep(2);
        } catch (error: any) {
            toast({
                title: "Information",
                description: error.message,
                variant: error.message.includes("administrator") ? "destructive" : "default",
            });
            // Move to step 2 anyway if it's the generic message? No, only if we have data.
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyQuestions = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data: broker } = await supabase
                .from("brokers")
                .select("user_id")
                .eq("email", email)
                .single();

            if (!broker) throw new Error("Session expired. Please try again.");

            // Verify answers (this should ideally be an RPC for better security)
            const { data: verify, error: vError } = await supabase
                .from("broker_security_questions")
                .select("*")
                .eq("user_id", broker.user_id)
                .eq("answer_1", ans1.toLowerCase().trim())
                .eq("answer_2", ans2.toLowerCase().trim())
                .eq("answer_3", ans3.toLowerCase().trim())
                .single();

            if (vError || !verify) {
                throw new Error("Incorrect answers to security questions.");
            }

            // If correct, trigger Supabase password reset
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (resetError) throw resetError;

            setStep(3);
        } catch (error: any) {
            toast({
                title: "Verification Failed",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRequestAdminReset = async () => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from("broker_reset_requests")
                .insert({ email });

            if (error) throw error;

            toast({
                title: "Request Sent",
                description: "An administrator has been notified. They will review your request and send a new setup link if approved.",
            });
            navigate("/broker");
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to send request. Please try again later.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-4">
            <img src={logo} alt="Lead Velocity" className="h-16 w-auto mb-8 animate-fade-in" />

            <Card className="w-full max-w-md border-border/50 bg-background/95 backdrop-blur shadow-xl">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                        {step === 3 ? <CheckCircle2 className="text-green-500" /> : <ShieldQuestion className="text-primary" />}
                    </div>
                    <CardTitle className="text-2xl font-bold">
                        {step === 1 ? "Forgot Password" : step === 2 ? "Security Challenge" : "Reset Email Sent"}
                    </CardTitle>
                    <CardDescription>
                        {step === 1
                            ? "Enter your email to verify your identity."
                            : step === 2
                                ? "Answer your security questions to receive a reset link."
                                : "Check your inbox for instructions to reset your password."}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {step === 1 && (
                        <form onSubmit={handleVerifyEmail} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="broker@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Verifying..." : "Continue"}
                            </Button>
                            <Link to="/broker" className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary transition-colors">
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                Back to Login
                            </Link>
                        </form>
                    )}

                    {step === 2 && questions && (
                        <form onSubmit={handleVerifyQuestions} className="space-y-4">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">{questions.question_1}</Label>
                                    <Input value={ans1} onChange={(e) => setAns1(e.target.value)} required placeholder="Your answer" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">{questions.question_2}</Label>
                                    <Input value={ans2} onChange={(e) => setAns2(e.target.value)} required placeholder="Your answer" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">{questions.question_3}</Label>
                                    <Input value={ans3} onChange={(e) => setAns3(e.target.value)} required placeholder="Your answer" />
                                </div>
                            </div>

                            <Button type="submit" className="w-full mt-4" disabled={loading}>
                                {loading ? "Verifying..." : "Verify & Send Reset Link"}
                            </Button>

                            <div className="pt-4 border-t text-center space-y-3">
                                <p className="text-xs text-muted-foreground">Can't remember your answers?</p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-orange-500 border-orange-500/50 hover:bg-orange-500/10"
                                    onClick={handleRequestAdminReset}
                                    disabled={loading}
                                >
                                    Request Manual Admin Reset
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="text-xs">
                                    Change Email
                                </Button>
                            </div>
                        </form>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 text-center">
                            <p className="text-sm text-muted-foreground">
                                We've sent a password reset link to <strong>{email}</strong>.
                                Please click the link in the email to set a new password.
                            </p>
                            <Button className="w-full" onClick={() => navigate("/broker")}>
                                Return to Login
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {step < 3 && (
                <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground bg-background/50 backdrop-blur px-4 py-2 rounded-full border">
                    <AlertCircle className="h-3 w-3 text-primary" />
                    <span>Security questions are case-insensitive.</span>
                </div>
            )}
        </div>
    );
};

export default BrokerForgotPassword;
