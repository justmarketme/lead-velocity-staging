import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, AlertCircle, CheckCircle } from "lucide-react";
import { z } from "zod";
import logo from "@/assets/lead-velocity-logo.png";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const signupSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  fullName: z.string().trim().min(2, "Full name is required"),
  securityQuestion1: z.string().min(1, "Please select a security question"),
  securityAnswer1: z.string().trim().min(2, "Security answer is required"),
  securityQuestion2: z.string().min(1, "Please select a 2nd security question"),
  securityAnswer2: z.string().trim().min(2, "2nd security answer is required"),
});

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "In what city were you born?",
  "What was the name of your first school?",
  "What is your mother's maiden name?",
  "What was your first car?",
  "What is your favorite movie?",
  "What was the name of the street you grew up on?",
];

const InviteSignup = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [securityQuestion1, setSecurityQuestion1] = useState("");
  const [securityAnswer1, setSecurityAnswer1] = useState("");
  const [securityQuestion2, setSecurityQuestion2] = useState("");
  const [securityAnswer2, setSecurityAnswer2] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setIsValid(false);
      setValidating(false);
      return;
    }

    try {
      // Check if token is valid (not used and not expired)
      const { data, error } = await supabase
        .from("admin_invites")
        .select("email, expires_at, used_at")
        .eq("token", token)
        .single();

      if (error || !data) {
        setIsValid(false);
      } else if (data.used_at) {
        setIsValid(false);
      } else if (new Date(data.expires_at) < new Date()) {
        setIsValid(false);
      } else {
        setIsValid(true);
        if (data.email) {
          setInviteEmail(data.email);
          setEmail(data.email);
        }
      }
    } catch (error) {
      console.error("Error validating token:", error);
      setIsValid(false);
    } finally {
      setValidating(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate input
      signupSchema.parse({
        email,
        password,
        fullName,
        securityQuestion1,
        securityAnswer1,
        securityQuestion2,
        securityAnswer2
      });

      // Create user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            full_name: fullName,
            user_type: "admin",
            security_question_1: securityQuestion1,
            security_answer_1: securityAnswer1.toLowerCase(),
            security_question_2: securityQuestion2,
            security_answer_2: securityAnswer2.toLowerCase(),
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("Failed to create account");
      }

      // Use the invite token to grant admin role
      const { data: useResult, error: useError } = await supabase
        .rpc("use_admin_invite", {
          invite_token: token,
          new_user_id: authData.user.id,
        });

      if (useError) {
        console.error("Error using invite:", useError);
        // Still proceed - the trigger might have already added the role
      }

      // Sign out so user can login fresh after email verification
      await supabase.auth.signOut();

      toast({
        title: "Account Created Successfully!",
        description: "Please check your email to verify your account, then log in to access the admin dashboard.",
      });

      // Redirect to login page after a delay
      setTimeout(() => {
        navigate("/login", { state: { message: "Please verify your email before logging in." } });
      }, 2000);
    } catch (error: any) {
      console.error("Signup error:", error);

      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else if (error.message?.toLowerCase().includes("user already registered")) {
        setUserExists(true);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to create account",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-destructive/10 rounded-full w-fit">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Invalid or Expired Invite</CardTitle>
            <CardDescription>
              This invite link is either invalid, has already been used, or has expired.
              Please contact an administrator for a new invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {userExists && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mx-6 mt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-amber-500 font-medium">Account Already Exists</p>
                <p className="text-sm text-muted-foreground">
                  An account with this email already exists. Please log in instead.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/login")}
                  className="mt-2"
                >
                  Go to Login
                </Button>
              </div>
            </div>
          </div>
        )}
        <CardHeader className="text-center">
          <img src={logo} alt="Lead Velocity" className="h-12 mx-auto mb-4" />
          <div className="mx-auto mb-2 p-3 bg-primary/10 rounded-full w-fit">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Admin Invite</CardTitle>
          <CardDescription>
            You've been invited to join as an administrator.
            Create your account below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!inviteEmail}
              />
              {inviteEmail && (
                <p className="text-xs text-muted-foreground">
                  Email is pre-filled from the invite
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                8+ characters, 1 uppercase, 1 number
              </p>
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-2 text-primary font-medium">
                <Shield className="h-4 w-4" />
                <span className="text-sm">Security Questions</span>
              </div>

              <div className="space-y-2">
                <Label>Security Question 1</Label>
                <Select
                  value={securityQuestion1}
                  onValueChange={setSecurityQuestion1}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a question" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECURITY_QUESTIONS.map((q) => (
                      <SelectItem key={q} value={q} disabled={q === securityQuestion2}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Your answer"
                  value={securityAnswer1}
                  onChange={(e) => setSecurityAnswer1(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div className="space-y-2">
                <Label>Security Question 2</Label>
                <Select
                  value={securityQuestion2}
                  onValueChange={setSecurityQuestion2}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a question" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECURITY_QUESTIONS.map((q) => (
                      <SelectItem key={q} value={q} disabled={q === securityQuestion1}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Your answer"
                  value={securityAnswer2}
                  onChange={(e) => setSecurityAnswer2(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Note: Answers are case-insensitive. You'll need these to reset your password.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading || userExists}>
              {loading ? "Creating Account..." : "Create Admin Account"}
            </Button>

            <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-lg text-xs text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
              <span>This invite grants administrator privileges</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteSignup;
