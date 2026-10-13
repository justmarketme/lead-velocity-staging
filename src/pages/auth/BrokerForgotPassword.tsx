import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.webp";

const RESET_REDIRECT = "https://leadvelocity.co.za/reset-password";

/**
 * Email in → Supabase recovery email out → /reset-password. The response is the same whether or not
 * the address has an account, so the page can't be used to find out who is a broker.
 */
const BrokerForgotPassword = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [done, setDone] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const address = email.trim().toLowerCase();
        if (!address) return;
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: RESET_REDIRECT });
            if (error) console.warn("resetPasswordForEmail:", error.message);

            // Audit trail for admins. RLS lets anon INSERT but not SELECT, so no `.select()` here.
            // (The old Discord alert called `trigger-discord-alert`, which isn't deployed, so it's dropped.)
            const { error: logError } = await supabase.from("broker_reset_requests").insert({ email: address });
            if (logError) console.warn("broker_reset_requests:", logError.message);
        } catch (err) {
            console.warn("forgot-password:", err);
        } finally {
            setLoading(false);
            setDone(true);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-4">
            <img src={logo} alt="Lead Velocity" className="h-16 w-auto mb-8 animate-fade-in" />

            <Card className="w-full max-w-md border-border/50 bg-background/95 backdrop-blur shadow-xl">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                        {done ? <CheckCircle2 className="text-green-500" /> : <Mail className="text-primary" />}
                    </div>
                    <CardTitle className="text-2xl font-bold">{done ? "Check your inbox" : "Forgot your password?"}</CardTitle>
                    <CardDescription>
                        {done
                            ? "If an account exists for that email, we've emailed a link to create a new password."
                            : "Enter the email you sign in with and we'll email you a link to create a new password."}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {done ? (
                        <div className="space-y-4 text-center">
                            <p className="text-sm text-muted-foreground">
                                The link works once and expires after a short while. Nothing arrived after a few minutes? Check spam,
                                or email <a className="underline" href="mailto:howzit@leadvelocity.co.za">howzit@leadvelocity.co.za</a>.
                            </p>
                            <Button className="w-full" onClick={() => navigate("/broker")}>Back to sign in</Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="broker@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Sending..." : "Email me a link"}
                            </Button>
                            <Link to="/broker" className="flex items-center justify-center text-sm text-muted-foreground hover:text-primary transition-colors">
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                Back to sign in
                            </Link>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default BrokerForgotPassword;
