import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { RATE_LIMITED_MESSAGE, RESET_SENT_MESSAGE, cooldownRemaining, isPlausibleEmail, normalizeEmail, requestPasswordReset } from "@/lib/passwordReset";
import logo from "@/assets/lead-velocity-logo.webp";

/**
 * Email in → Supabase recovery email out → /reset-password. The response is the same whether or not
 * the address has an account, so the page can't be used to find out who is a broker.
 */
const BrokerForgotPassword = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [done, setDone] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setNotice(null);
        if (!isPlausibleEmail(email)) { setNotice("Please enter a valid email address."); return; }
        setLoading(true);
        try {
            const outcome = await requestPasswordReset(supabase, email, window.location.origin);
            if (outcome === "rate_limited") {
                const wait = cooldownRemaining(email);
                setNotice(wait > 0 ? `A link was just sent. You can ask for another in ${wait}s.` : RATE_LIMITED_MESSAGE);
                return;
            }
            // Audit trail for admins. RLS lets anon INSERT but not SELECT, so no `.select()` here.
            const { error: logError } = await supabase.from("broker_reset_requests").insert({ email: normalizeEmail(email) });
            if (logError) console.warn("broker_reset_requests:", logError.code ?? "error");
            setDone(true);
        } catch {
            setDone(true);
        } finally {
            setLoading(false);
        }
    };

    // Visual system = the public /onboarding page (src/pages/BrokerOnboarding.tsx): same base, orbs, form card, inputs and buttons.
    return (
        <div className="min-h-screen bg-[#030712] text-white relative overflow-hidden flex flex-col items-center justify-center p-4">
            <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none bg-slate-900/30">
                <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/10 rounded-full blur-3xl hero-orb hero-orb-1"></div>
                <div className="absolute bottom-1/4 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-secondary/10 rounded-full blur-3xl hero-orb hero-orb-2"></div>
            </div>
            <img src={logo} alt="Lead Velocity" className="relative h-16 w-auto object-contain mb-8 animate-fade-in" />

            <Card className="relative w-full max-w-md bg-slate-900/40 backdrop-blur-xl rounded-2xl sm:rounded-3xl overflow-hidden border border-primary/20 shadow-[0_20px_80px_-20px_hsl(var(--primary)/0.3)]">
                <div aria-hidden className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                <CardHeader className="relative z-10 text-center space-y-2 px-6 sm:px-8 pt-8">
                    <div className="mx-auto w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mb-2">
                        {done ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <Mail className="w-6 h-6 text-pink-400" />}
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-white font-inter">
                        {done ? <>Check your <span className="gradient-text-epiphany">inbox</span></> : <>Forgot your <span className="gradient-text-epiphany">password?</span></>}
                    </CardTitle>
                    <CardDescription className="text-slate-400 leading-relaxed">
                        {done
                            ? RESET_SENT_MESSAGE
                            : "Enter the email you sign in with and we'll email you a link to create a new password."}
                    </CardDescription>
                </CardHeader>

                <CardContent className="relative z-10 px-6 sm:px-8 pb-8">
                    {done ? (
                        <div className="space-y-4 text-center">
                            <p className="text-sm text-slate-400 leading-relaxed">
                                The link works once and expires after a short while. Nothing arrived after a few minutes? Check spam,
                                or email <a className="text-pink-400 font-medium hover:underline" href="mailto:howzit@leadvelocity.co.za">howzit@leadvelocity.co.za</a>.
                            </p>
                            <Button size="lg" className="w-full bg-primary hover:bg-primary/80 text-white transition-all duration-300 hover:scale-105 active:scale-95 px-6 py-6 text-base rounded-xl shadow-lg shadow-primary/20" onClick={() => navigate("/broker")}>Back to sign in</Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-sm font-medium text-slate-200">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="broker@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                />
                            </div>
                            {notice && <p role="alert" className="text-sm text-rose-400">{notice}</p>}
                            <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/80 text-white transition-all duration-300 hover:scale-105 active:scale-95 px-6 py-6 text-base rounded-xl shadow-lg shadow-primary/20" disabled={loading}>
                                {loading ? "Sending..." : "Email me a link"}
                            </Button>
                            <Link to="/broker" className="flex items-center justify-center text-sm text-slate-400 hover:text-primary transition-colors">
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
