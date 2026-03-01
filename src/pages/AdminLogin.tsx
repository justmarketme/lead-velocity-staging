import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, Eye, EyeOff } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { z } from "zod";
import SEO from "@/components/SEO";

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) {
          // Verify admin role before redirecting
          setTimeout(() => {
            verifyAdminAndRedirect(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        verifyAdminAndRedirect(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const verifyAdminAndRedirect = async (userId: string) => {
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: userId,
      _role: 'admin'
    });

    if (isAdmin) {
      navigate("/dashboard");
    } else {
      // Not an admin - sign out and show error
      await supabase.auth.signOut();
      toast({
        title: "Access Denied",
        description: "This portal is for administrators only.",
        variant: "destructive",
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validatedData = loginSchema.parse({ email, password });

      const { error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });

      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "An unexpected error occurred",
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <SEO title="Admin Login" description="Lead Velocity administrator portal." noIndex />
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl" />

      <Card className="w-full max-w-md border-primary/30 bg-card/95 backdrop-blur-xl relative z-10 shadow-2xl">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
            <Shield className="w-10 h-10 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold gradient-text">Admin Portal</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Lead Velocity Administration
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetEmail" className="text-foreground">Email Address</Label>
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="howzit@leadvelocity.co.za"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="bg-muted/50 border-border focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  We'll send you a link to reset your password.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                disabled={resetLoading}
              >
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => setShowForgotPassword(false)}
              >
                Back to Login
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@leadvelocity.co.za"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-muted/50 border-border focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative group/pass">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-muted/50 border-border focus:border-primary pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                disabled={loading}
              >
                <Lock className="w-4 h-4 mr-2" />
                {loading ? "Authenticating..." : "Secure Login"}
              </Button>

              <div className="pt-4 border-t border-border">
                <p className="text-xs text-center text-muted-foreground">
                  This is a restricted area for authorized administrators only.
                  <br />
                  Unauthorized access attempts are logged.
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
