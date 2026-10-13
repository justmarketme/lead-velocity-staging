import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/lead-velocity-logo.webp";
import { z } from "zod";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Check, Eye, EyeOff } from "lucide-react";
import { BrokerMotion, EASE, Stagger, StaggerItem } from "@/components/broker/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

/** 0–4: length, then variety. Shown as a bar; the only hard rule is the 8-character minimum. */
function strength(pw: string) {
  if (pw.length < 8) return pw.length ? 1 : 0;
  let score = 2;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}
const STRENGTH = [
  { label: "", color: "bg-slate-800" },
  { label: "Too short", color: "bg-rose-500" },
  { label: "Okay", color: "bg-amber-400" },
  { label: "Good", color: "bg-primary" },
  { label: "Strong", color: "bg-emerald-400" },
];

/**
 * One page for every "set a password from an email link" case:
 *  - /broker/set-password?token_hash=…&type=recovery — the admin "create your password" email
 *    (send-password-setup). The token is only redeemed on submit, so link-scanners that pre-fetch
 *    the URL can't use it up.
 *  - /reset-password — Supabase's own recovery email (forgot password): the default template lands
 *    here with the session in the URL hash (implicit flow), or ?code=… if the client uses PKCE.
 * The email link itself proves the mailbox, so there is no security-question step here.
 */
const ResetPassword = () => {
  const location = useLocation();
  const isSetup = location.pathname.startsWith("/broker/set-password");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const reduceMotion = useReducedMotion();
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));

    // Supabase puts link errors (expired / already used) in the hash or query.
    if (hash.get("error") || query.get("error")) {
      setCheckingSession(false);
      return;
    }

    const th = query.get("token_hash");
    if (th && (query.get("type") || "recovery") === "recovery") {
      setTokenHash(th);
      setIsValidSession(true);
      setCheckingSession(false);
      return;
    }

    // Only a recovery link counts. An ordinary signed-in session must not: opening this page without
    // a token would otherwise change the password of whoever happens to be signed in on this browser.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsValidSession(true);
    });

    (async () => {
      const code = query.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) setIsValidSession(true);
      }
      // Implicit-flow links (#access_token=…&type=recovery) fire PASSWORD_RECOVERY during client init.
      // A signed-in user flagged must_reset_password (temporary password) is sent here by the portal.
      const { data: { session } } = await supabase.auth.getSession();
      // Trust the hash only if it actually signed in: a failed URL login leaves any existing session in place.
      if (hash.get("type") === "recovery" && session && session.access_token === hash.get("access_token")) setIsValidSession(true);
      if (session?.user?.user_metadata?.must_reset_password === true) setIsValidSession(true);
      setCheckingSession(false);
    })();

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      toast({ title: "Check your password", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (error) {
          // A rejected token (403 otp_expired, or any other 4xx) means the link is dead. A dropped
          // connection, a rate limit (429) or a server error leaves the token valid, so let them retry.
          const status = error.status ?? 0;
          if (error.code === "otp_expired" || (status >= 400 && status < 500 && status !== 429)) {
            setTokenHash(null);
            setIsValidSession(false);
          } else {
            toast({ title: "Couldn't check your link", description: "Please try again in a moment.", variant: "destructive" });
          }
          return;
        }
        setTokenHash(null); // redeemed: there is now a session, so a retry only needs updateUser
      }

      const { data, error } = await supabase.auth.updateUser({
        password: parsed.data.password,
        data: { must_reset_password: false },
      });
      if (error || !data.user) {
        toast({ title: "Couldn't save your password", description: error?.message, variant: "destructive" });
        return;
      }

      // Admins go to the dashboard; brokers straight to their portal (same routing as /broker's sign-in).
      const [{ data: role }, { data: broker }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle(),
        supabase.from("brokers").select("portal_type").eq("user_id", data.user.id).maybeSingle(),
      ]);
      const premium = broker?.portal_type === "marketing" || broker?.portal_type === "premium";
      setDone(true);
      setTimeout(() => navigate(role ? "/dashboard" : premium ? "/broker-elite" : "/broker", { replace: true }), reduceMotion ? 600 : 1600);
    } finally {
      setLoading(false);
    }
  };

  const score = strength(password);
  const eyebrow = isSetup ? "Lead Velocity / Broker onboarding" : "Lead Velocity / Account";
  // Visual system = the public /onboarding page (src/pages/BrokerOnboarding.tsx): its input, primary and outline button classes.
  const field = "bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md";
  const pill =
    "w-full bg-primary hover:bg-primary/80 text-white transition-all duration-300 hover:scale-105 active:scale-95 px-6 py-6 text-base rounded-xl shadow-lg shadow-primary/20";
  const outline = "w-full border-primary/30 text-white hover:bg-primary/10 hover:text-white px-6 py-6 text-base rounded-xl";
  const label = "block text-sm font-medium text-slate-200 mb-2";

  let body: React.ReactNode;
  if (checkingSession) {
    body = (
      <m.p key="checking" className="text-center text-slate-400 py-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        Checking your link...
      </m.p>
    );
  } else if (done) {
    body = (
      <m.div key="done" className="text-center py-6" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
        <m.div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
          initial={{ scale: 0.4, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <Check className="h-8 w-8 text-white" strokeWidth={3} />
        </m.div>
        <h1 className="text-3xl font-bold tracking-tight text-white font-inter">You&apos;re <span className="gradient-text-epiphany">in</span></h1>
        <p className="mt-2 text-slate-400">Password saved. Taking you to your portal...</p>
      </m.div>
    );
  } else if (!isValidSession) {
    body = (
      <m.div key="expired" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight text-white font-inter">This link has <span className="gradient-text-epiphany">expired</span></h1>
        <p className="mt-3 text-slate-400 leading-relaxed">
          Password links work once and expire after a short while. Get a fresh one below, or reply to the email you received and we&apos;ll send one.
        </p>
        <div className="mt-8 space-y-3">
          <Button size="lg" className={pill} onClick={() => navigate("/broker/forgot-password")}>Send me a new link</Button>
          <Button
            variant="outline"
            size="lg"
            className={outline}
            onClick={async () => {
              // A failed link leaves any other account's session in place; drop it so /broker shows sign-in, not their portal.
              await supabase.auth.signOut({ scope: "local" });
              navigate("/broker");
            }}
          >
            Go to sign in
          </Button>
        </div>
      </m.div>
    );
  } else {
    body = (
      <m.div key="form" exit={{ opacity: 0, scale: 0.97 }}>
        <Stagger>
          <StaggerItem>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-inter">
              {isSetup ? "Create your" : "Choose a new"} <span className="gradient-text-epiphany">password</span>
            </h1>
            <p className="mt-3 text-slate-400 leading-relaxed">
              {isSetup
                ? "Welcome to Lead Velocity. Choose a password for your broker portal and you'll go straight in."
                : "Choose a new password for your Lead Velocity account."}
            </p>
          </StaggerItem>
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <StaggerItem>
              <label htmlFor="password" className={label}>Password</label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${field} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-white transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3" aria-live="polite">
                <div className="flex flex-1 gap-1.5">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <m.div
                        className={`h-full w-full origin-left rounded-full ${STRENGTH[score].color}`}
                        initial={false}
                        animate={{ scaleX: score >= n ? 1 : 0 }}
                        transition={{ duration: 0.3, ease: EASE, delay: score >= n ? (n - 1) * 0.04 : 0 }}
                      />
                    </div>
                  ))}
                </div>
                <span className="w-16 text-right text-xs text-muted-foreground">{STRENGTH[score].label}</span>
              </div>
            </StaggerItem>
            <StaggerItem>
              <label htmlFor="confirmPassword" className={label}>Confirm password</label>
              <Input
                id="confirmPassword"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Type it again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={field}
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-2 text-xs text-destructive">Passwords don&apos;t match yet</p>
              )}
            </StaggerItem>
            <StaggerItem>
              <Button type="submit" size="lg" className={pill} disabled={loading}>
                {loading ? "Saving..." : "Save password and continue"}
              </Button>
            </StaggerItem>
          </form>
        </Stagger>
      </m.div>
    );
  }

  return (
    <BrokerMotion>
      <div className="relative min-h-[100dvh] overflow-hidden bg-[#030712] text-white flex items-center justify-center px-4 py-10">
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none bg-slate-900/30">
          <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/10 rounded-full blur-3xl hero-orb hero-orb-1"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-secondary/10 rounded-full blur-3xl hero-orb hero-orb-2"></div>
        </div>
        <m.div
          className="relative w-full max-w-md"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="mb-6 flex items-center gap-3">
            <img src={logo} alt="Lead Velocity" className="h-10 w-10 object-contain" />
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-purple-400/80">{eyebrow}</span>
          </div>
          <div className="relative overflow-hidden p-6 sm:p-8 bg-slate-900/40 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-primary/20 shadow-[0_20px_80px_-20px_hsl(var(--primary)/0.3)]">
            <div aria-hidden className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
            <div className="relative z-10">
              <AnimatePresence mode="wait">{body}</AnimatePresence>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">
            Need help? <a href="mailto:howzit@leadvelocity.co.za" className="text-pink-400 font-medium hover:underline">howzit@leadvelocity.co.za</a>
          </p>
        </m.div>
      </div>
    </BrokerMotion>
  );
};

export default ResetPassword;
