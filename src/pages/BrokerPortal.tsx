import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Database, BarChart3, Users, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/lead-velocity-logo.png";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const BrokerPortal = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: broker } = await supabase
          .from("brokers")
          .select("id")
          .eq("user_id", session.user.id)
          .single();

        if (broker) {
          navigate("/broker/dashboard");
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
        // Check if user is a broker
        const { data: broker } = await supabase
          .from("brokers")
          .select("id")
          .eq("user_id", data.session.user.id)
          .single();

        if (broker) {
          navigate("/broker/dashboard");
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
        setShowForgotPassword(false);
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
      icon: Users,
      title: "Referral Tracking",
      description: "Monitor referrals generated from each lead with real-time updates",
    },
    {
      icon: BarChart3,
      title: "Performance Analytics",
      description: "Visualize your conversion funnel and optimize your process",
    },
    {
      icon: CheckCircle,
      title: "Will Completion",
      description: "Track will status and appointment scheduling seamlessly",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:50px_50px]" />
        <div className="relative">
          <nav className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <img src={logo} alt="Lead Velocity" className="h-12 w-auto" />
              <Link to="/">
                <Button variant="ghost">Home</Button>
              </Link>
            </div>
          </nav>

          <div className="container mx-auto px-4 py-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left side - Info */}
              <div className="space-y-8">
                <h1 className="text-5xl md:text-6xl font-bold gradient-text animate-fade-in">
                  Broker Portal
                </h1>
                <p className="text-xl text-muted-foreground">
                  Your complete lead management solution. Track leads, monitor referrals,
                  and grow your business with powerful analytics.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {features.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.title} className="flex items-start space-x-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{feature.title}</h3>
                          <p className="text-xs text-muted-foreground">{feature.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right side - Login Form */}
              <Card className="w-full max-w-md mx-auto border-border/50 bg-background/95 backdrop-blur">
                <CardHeader className="space-y-2 text-center">
                  <CardTitle className="text-2xl">Broker Sign In</CardTitle>
                  <CardDescription>Access your broker dashboard</CardDescription>
                </CardHeader>
                <CardContent>
                  {showForgotPassword ? (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="resetEmail">Email Address</Label>
                        <Input
                          id="resetEmail"
                          type="email"
                          placeholder="Enter your email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          We'll send you a link to reset your password.
                        </p>
                      </div>
                      <Button type="submit" className="w-full" disabled={resetLoading}>
                        {resetLoading ? "Sending..." : "Send Reset Link"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setShowForgotPassword(false)}
                      >
                        Back to Login
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="broker@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Password</Label>
                          <Link
                            to="/broker/forgot-password"
                            className="text-xs text-primary hover:underline"
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Signing in..." : "Sign In"}
                      </Button>



                      <div className="pt-4 border-t border-border/50">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full border-primary/20 hover:bg-primary/10"
                          onClick={() => navigate('/broker/dashboard')}
                        >
                          Dev Mode: Bypass Login
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>© 2025 Lead Velocity. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default BrokerPortal;
