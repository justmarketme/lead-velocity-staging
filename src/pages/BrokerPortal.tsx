import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileText, BarChart3, Lock, Eye, EyeOff, Sparkles, Crown, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
            navigate("/broker/dashboard");
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
            navigate("/broker/dashboard");
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
      title: "Lead Management",
      description: "Upload and track your entire lead database in one centralized location",
    },
    {
      icon: FileText,
      title: "Referral Tracking",
      description: "Monitor referrals generated from each lead with real-time updates",
    },
    {
      icon: BarChart3,
      title: "Performance Analytics",
      description: "Visualize your conversion funnel and optimize your process",
    },
    {
      icon: Lock,
      title: "Will Completion",
      description: "Track will status and appointment scheduling seamlessly",
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      <SEO title="Broker Portal" description="Lead Velocity broker portal login." noIndex />
      <ParticleBackground />
      <div className="relative z-10">
        <Navigation />
        <div className="container mx-auto px-4 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            {/* Left Content */}
            <div className="space-y-8 animate-in fade-in slide-in-from-left duration-700">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Badge variant="outline" className="bg-pink-500/10 text-pink-500 border-pink-500/20 px-3 py-1 font-bold tracking-wider uppercase text-[10px]">
                    <Sparkles className="w-3 h-3 mr-2" /> VIP Invite Only
                  </Badge>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 font-bold tracking-wider uppercase text-[10px]">
                    <ShieldCheck className="w-3 h-3 mr-2" /> Encrypted Access
                  </Badge>
                </div>
                <h1 className="text-6xl md:text-8xl font-bold text-white tracking-tighter uppercase leading-none">
                  Velo <span className="gradient-text">Pro</span>
                </h1>
                <p className="text-xl text-muted-foreground font-medium leading-relaxed max-w-lg">
                  The high-velocity intelligence hub for elite brokers. Track leads,
                  monitor referrals, and scale your firm with institutional-grade tools.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div key={index} className="flex gap-4 p-4 rounded-xl bg-card/40 backdrop-blur-md border border-border/50 hover:border-pink-500/30 transition-all group">
                      <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Icon className="w-5 h-5 text-pink-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm uppercase tracking-tight mb-1">{feature.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Form */}
            <div className="animate-in fade-in slide-in-from-right duration-700 [animation-delay:200ms]">
              <Card className="bg-[#020617]/40 backdrop-blur-2xl border-white/5 shadow-2xl overflow-hidden rounded-3xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-pink-500 to-transparent opacity-50" />
                <CardHeader className="pt-10 pb-6 text-center">
                  <div className="w-16 h-16 bg-pink-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-pink-500/20 shadow-lg shadow-pink-500/10">
                    <Crown className="w-8 h-8 text-pink-500" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl font-bold text-white tracking-tighter uppercase">Broker Sign In</CardTitle>
                    <CardDescription className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-2">Access your elite intelligence dashboard</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="px-8 pb-10">
                  <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Email</label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Use the email from your invite"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-card/50 border-border h-12 rounded-xl focus:ring-primary/20 focus:border-primary/50 transition-all font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between ml-1">
                        <label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-slate-400">Password</label>
                        <Dialog>
                          <DialogTrigger asChild>
                            <button type="button" className="text-[10px] font-bold uppercase tracking-widest text-pink-500 hover:text-pink-400 transition-colors">Forgot password?</button>
                          </DialogTrigger>
                          <DialogContent className="bg-card border-border sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle className="text-2xl font-bold uppercase tracking-tighter">Reset Password</DialogTitle>
                              <CardDescription>Enter your email to receive a password reset link.</CardDescription>
                            </DialogHeader>
                            <form onSubmit={handleForgotPassword} className="space-y-4 pt-4">
                              <Input
                                placeholder="name@company.com"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                className="bg-muted focus:ring-primary/20"
                              />
                              <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={resetLoading}>
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
                          className="bg-card/50 border-border h-12 rounded-xl focus:ring-primary/20 focus:border-primary/50 transition-all font-medium pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 btn-glow-pulse" disabled={loading}>
                      {loading ? "Decrypting..." : "Initiate Access"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 relative z-10">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>© 2025 Lead Velocity. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default BrokerPortal;
