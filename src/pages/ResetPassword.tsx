import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/lead-velocity-logo.png";
import { z } from "zod";
import { Shield, HelpCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const passwordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [questions, setQuestions] = useState<{ q1: string; q2: string } | null>(null);
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [correctAnswers, setCorrectAnswers] = useState<{ a1: string; a2: string } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if we have a valid recovery session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsValidSession(true);
        }
        setCheckingSession(false);
      }
    );

    // Also check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true);
        fetchSecurityQuestions(session.user.id);
      }
      setCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchSecurityQuestions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("security_question_1, security_answer_1, security_question_2, security_answer_2")
        .eq("user_id", userId)
        .single();

      if (error) throw error;

      if (data) {
        setQuestions({
          q1: data.security_question_1,
          q2: data.security_question_2,
        });
        setCorrectAnswers({
          a1: data.security_answer_1,
          a2: data.security_answer_2,
        });
        // If no questions are set (legacy user), just allow reset
        if (!data.security_question_1 && !data.security_question_2) {
          setIsVerified(true);
        }
      } else {
        // No profile found, allow reset (shouldn't happen for admins)
        setIsVerified(true);
      }
    } catch (error) {
      console.error("Error fetching security questions:", error);
      // Fallback: allow reset if error fetching (don't lock out users)
      setIsVerified(true);
    }
  };

  const handleVerifyQuestions = (e: React.FormEvent) => {
    e.preventDefault();

    if (!questions || !correctAnswers) {
      setIsVerified(true);
      return;
    }

    const isA1Correct = answer1.trim().toLowerCase() === correctAnswers.a1.toLowerCase();
    const isA2Correct = answer2.trim().toLowerCase() === correctAnswers.a2.toLowerCase();

    if (isA1Correct && isA2Correct) {
      setIsVerified(true);
      toast({
        title: "Identity Verified",
        description: "Please enter your new password below.",
      });
    } else {
      toast({
        title: "Incorrect Answers",
        description: "The answers provided do not match our records. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validatedData = passwordSchema.parse({ password, confirmPassword });

      const { error } = await supabase.auth.updateUser({
        password: validatedData.password,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password Updated",
          description: "Your password has been reset successfully. Please log in with your new password.",
        });

        // Sign out and redirect to login
        await supabase.auth.signOut();
        navigate("/login");
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
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md border-border/50 bg-background/95 backdrop-blur">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Verifying reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md border-border/50 bg-background/95 backdrop-blur">
          <CardHeader className="space-y-4 text-center">
            <img src={logo} alt="Lead Velocity" className="h-20 w-auto mx-auto" />
            <CardTitle className="text-2xl text-destructive">Invalid or Expired Link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md border-border/50 bg-background/95 backdrop-blur">
        <CardHeader className="space-y-4 text-center">
          <img src={logo} alt="Lead Velocity" className="h-20 w-auto mx-auto" />
          <CardTitle className="text-2xl gradient-text">Reset Your Password</CardTitle>
          <CardDescription>
            {isVerified ? "Enter your new password below" : "Please answer your security questions to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isVerified ? (
            <form onSubmit={handleVerifyQuestions} className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-medium border-b border-border pb-2">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">Identity Verification</span>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground flex items-center gap-2">
                    <HelpCircle className="h-3 w-3" />
                    {questions?.q1 || "Security Question 1"}
                  </Label>
                  <Input
                    placeholder="Your answer"
                    value={answer1}
                    onChange={(e) => setAnswer1(e.target.value)}
                    required
                    className="bg-muted/30"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground flex items-center gap-2">
                    <HelpCircle className="h-3 w-3" />
                    {questions?.q2 || "Security Question 2"}
                  </Label>
                  <Input
                    placeholder="Your answer"
                    value={answer2}
                    onChange={(e) => setAnswer2(e.target.value)}
                    required
                    className="bg-muted/30"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full">
                Verify Identity
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="flex items-center gap-2 text-green-500 font-medium border-b border-border pb-2 mb-4">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">Identity Verified</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
