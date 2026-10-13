import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileText, BarChart3, Lock, Eye, EyeOff, Sparkles, Crown, ShieldCheck } from "lucide-react";
import Navigation from "@/components/Navigation";
import ParticleBackground from "@/components/ParticleBackground";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/lead-velocity-logo.webp";
import { z } from "zod";
import SEO from "@/components/SEO";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const BrokerPortal = () => {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Pre-fill email when coming from broker setup (same email as in admin's Broker Invites form)
  useEffect(() => {
    const stateEmail = (location.state as { email?: string })?.email;
    if (stateEmail && typeof stateEmail === "string") {
      setEmail(stateEmail.trim());
    }
  }, [location.state]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (session) {
        const { data: broker } = await supabase
          .from("brokers")
          .select("id, portal_type")
          .eq("user_id", session.user.id)
          .single();

        if (broker) {
          if (broker.portal_type === 'marketing' || broker.portal_type === 'premium') {
            navigate("/broker-elite");
          } else {
            navigate("/broker/orders");
          }
        }
      }
    };
    checkAuth();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validatedData = loginSchema.parse({ email, password });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });

      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (data.session) {
        // Check if user is a broker and send to correct portal
        const { data: broker } = await supabase
          .from("brokers")
          .select("id, portal_type")
          .eq("user_id", data.session.user.id)
          .single();

        if (broker) {
          if (broker.portal_type === "marketing" || broker.portal_type === "premium") {
            navigate("/broker-elite");
          } else {
            navigate("/broker/orders");
          }
        } else {
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "This portal is for brokers only. Please contact support if you need assistance.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);

    try {
      const emailValidation = z.string().trim().email("Please enter a valid email address");
      emailValidation.parse(resetEmail);

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password Reset Email Sent",
          description: "Check your email for a link to reset your password.",
        });
        setResetEmail("");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    } finally {
      setResetLoading(false);
    }
  };

  const features = [
    {
      icon: Database,
      title: "Your Purchased Leads",
      description: "View, search and work every lead you've purchased in one place",
    },
    {
      icon: BarChart3,
      title: "Sales Pipeline",
      description: "Drag leads through your stages — New, Contacted, Interested, Meeting Set, Won",
    },
    {
      icon: FileText,
      title: "Notes & Feedback",
      description: "Keep private notes on each lead and message the Lead Velocity team",
    },
    {
      icon: Lock,
      title: "Secure Delivery",
      description: "Contact details unlock on payment — then export your leads to CSV anytime",
    },
  ];

  // Visual system = the public /onboarding page (src/pages/BrokerOnboarding.tsx): same base, orbs, cards, type and buttons.
  return (
    <div className="min-h-screen bg-[#030712] text-white relative overflow-hidden">
      <SEO title="Broker Portal" description="Lead Velocity broker portal login." noIndex />
      <ParticleBackground />
      <div className="relative z-10">
        <Navigation />
        <section className="relative pt-32 pb-16 lg:pt-40 lg:pb-24 overflow-hidden bg-slate-900/30">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/10 rounded-full blur-3xl hero-orb hero-orb-1"></div>
            <div className="absolute bottom-1/4 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-secondary/10 rounded-full blur-3xl hero-orb hero-orb-2"></div>
          </div>
          <div className="container mx-auto px-6 relative z-10">
            {/* Phones: intro, sign-in, features. Desktop: intro + features left, sign-in right. */}
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-y-8 items-center max-w-6xl mx-auto">
              {/* Intro */}
              <div className="space-y-6 lg:col-start-1 lg:row-start-1 animate-in fade-in slide-in-from-left duration-700">
                <h1 className="text-4xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white font-inter">
                  Velo <span className="gradient-text-epiphany">Pro</span>
                </h1>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <p className="text-sm font-medium tracking-[0.25em] uppercase text-pink-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> VIP Invite Only
                  </p>
                  <p className="text-sm font-medium tracking-[0.25em] uppercase text-emerald-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Encrypted Access
                  </p>
                </div>
                <p className="text-lg text-slate-400 leading-relaxed max-w-lg">
                  The high-velocity intelligence hub for elite brokers. Track leads,
                  monitor referrals, and scale your firm with institutional-grade tools.
                </p>
              </div>

              {/* Sign-in card */}
              <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 animate-in fade-in slide-in-from-right duration-700 [animation-delay:200ms]">
                <Card className="relative bg-slate-900/40 backdrop-blur-xl rounded-2xl sm:rounded-3xl overflow-hidden border border-primary/20 shadow-[0_20px_80px_-20px_hsl(var(--primary)/0.3)]">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                  <CardHeader className="relative z-10 px-6 sm:px-8 pt-10 pb-6 text-center">
                    <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mx-auto mb-4">
                      <Crown className="w-6 h-6 text-pink-400" />
                    </div>
                    <div>
                      <CardTitle className="text-3xl font-bold tracking-tight text-white font-inter">Broker <span className="gradient-text-epiphany">Sign In</span></CardTitle>
                      <CardDescription className="text-slate-400 text-sm mt-2">Access your elite intelligence dashboard</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="relative z-10 px-6 sm:px-8 pb-10">
                    <form onSubmit={handleLogin} className="space-y-6">
                      <div className="space-y-2">
                        <label htmlFor="email" className="text-sm font-medium text-slate-200">Email</label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Use the email from your invite"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="password" className="text-sm font-medium text-slate-200">Password</label>
                          <Dialog>
                            <DialogTrigger asChild>
                              <button type="button" className="text-sm text-pink-400 font-medium hover:underline">Forgot password?</button>
                            </DialogTrigger>
                            <DialogContent className="bg-slate-900 border-white/10 sm:max-w-[425px]">
                              <DialogHeader>
                                <DialogTitle className="text-2xl font-bold tracking-tight text-white font-inter">Reset <span className="gradient-text-epiphany">Password</span></DialogTitle>
                                <CardDescription className="text-slate-400">Enter your email to receive a password reset link.</CardDescription>
                              </DialogHeader>
                              <form onSubmit={handleForgotPassword} className="space-y-4 pt-4">
                                <Input
                                  placeholder="name@company.com"
                                  value={resetEmail}
                                  onChange={(e) => setResetEmail(e.target.value)}
                                  className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                />
                                <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/80 text-white transition-all duration-300 hover:scale-105 active:scale-95 px-6 py-6 text-base rounded-xl shadow-lg shadow-primary/20" disabled={resetLoading}>
                                  {resetLoading ? "Sending..." : "Send Reset Link"}
                                </Button>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/80 text-white transition-all duration-300 hover:scale-105 active:scale-95 px-6 py-6 text-base rounded-xl shadow-lg shadow-primary/20" disabled={loading}>
                        {loading ? "Decrypting..." : "Initiate Access"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* Features */}
              <div className="grid sm:grid-cols-2 gap-6 lg:col-start-1 lg:row-start-2 animate-in fade-in slide-in-from-left duration-700">
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div key={index} className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 cursor-default hover:border-pink-500/30 hover:bg-slate-800/60 transition-all duration-300 group">
                      <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mb-4 group-hover:bg-pink-500/20 transition-colors">
                        <Icon className="w-6 h-6 text-pink-400" />
                      </div>
                      <h3 className="font-bold text-lg mb-2 text-white">{feature.title}</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 relative z-10">
        <div className="container mx-auto px-4 text-center text-slate-400 text-sm">
          <p>© 2025 Lead Velocity. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default BrokerPortal;
