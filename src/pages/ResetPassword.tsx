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
  { label: "", color: "bg-white/10" },
  { label: "Too short", color: "bg-[#e0457b]" },
  { label: "Okay", color: "bg-[#f07a5c]" },
  { label: "Good", color: "bg-[#f3a64b]" },
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
  const field =
    "w-full h-12 rounded-xl bg-white/[0.04] border border-white/10 px-4 text-white placeholder:text-white/30 outline-none transition focus:border-[#e0457b]/70 focus:ring-2 focus:ring-[#e0457b]/25";
  const pill =
    "w-full h-12 rounded-full bg-gradient-to-r from-[#e0457b] to-[#f3a64b] text-white font-semibold shadow-[0_10px_30px_-10px_rgba(224,69,123,0.7)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60";

  let body: React.ReactNode;
  if (checkingSession) {
    body = (
      <m.p key="checking" className="text-center text-white/60 py-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        Checking your link...
      </m.p>
    );
  } else if (done) {
    body = (
      <m.div key="done" className="text-center py-6" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
        <m.div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#e0457b] to-[#f3a64b]"
          initial={{ scale: 0.4, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <Check className="h-8 w-8 text-white" strokeWidth={3} />
        </m.div>
        <h1 className="text-3xl font-bold text-white">You&apos;re in</h1>
        <p className="mt-2 text-white/60">Password saved. Taking you to your portal...</p>
      </m.div>
    );
  } else if (!isValidSession) {
    body = (
      <m.div key="expired" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <h1 className="text-3xl font-bold text-white">This link has expired</h1>
        <p className="mt-3 text-white/60 leading-relaxed">
          Password links work once and expire after a short while. Get a fresh one below, or reply to the email you received and we&apos;ll send one.
        </p>
        <div className="mt-8 space-y-3">
          <button className={pill} onClick={() => navigate("/broker/forgot-password")}>Send me a new link</button>
          <button
            className="w-full h-12 rounded-full border border-white/15 text-white/80 hover:bg-white/5 transition"
            onClick={async () => {
              // A failed link leaves any other account's session in place; drop it so /broker shows sign-in, not their portal.
              await supabase.auth.signOut({ scope: "local" });
              navigate("/broker");
            }}
          >
            Go to sign in
          </button>
        </div>
      </m.div>
    );
  } else {
    body = (
      <m.div key="form" exit={{ opacity: 0, scale: 0.97 }}>
        <Stagger>
          <StaggerItem>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{isSetup ? "Create your password" : "Choose a new password"}</h1>
            <p className="mt-3 text-white/60 leading-relaxed">
              {isSetup
                ? "Welcome to Lead Velocity. Choose a password for your broker portal and you'll go straight in."
                : "Choose a new password for your Lead Velocity account."}
            </p>
          </StaggerItem>
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <StaggerItem>
              <label htmlFor="password" className="block font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 mb-2">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${field} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg text-white/50 hover:text-white"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3" aria-live="polite">
                <div className="flex flex-1 gap-1.5">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <m.div
                        className={`h-full w-full origin-left rounded-full ${STRENGTH[score].color}`}
                        initial={false}
                        animate={{ scaleX: score >= n ? 1 : 0 }}
                        transition={{ duration: 0.3, ease: EASE, delay: score >= n ? (n - 1) * 0.04 : 0 }}
                      />
                    </div>
                  ))}
                </div>
                <span className="w-16 text-right font-mono text-[11px] uppercase tracking-wider text-white/50">{STRENGTH[score].label}</span>
              </div>
            </StaggerItem>
            <StaggerItem>
              <label htmlFor="confirmPassword" className="block font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 mb-2">Confirm password</label>
              <input
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
                <p className="mt-2 text-xs text-[#f3a64b]">Passwords don&apos;t match yet</p>
              )}
            </StaggerItem>
            <StaggerItem>
              <button type="submit" className={pill} disabled={loading}>
                {loading ? "Saving..." : "Save password and continue"}
              </button>
            </StaggerItem>
          </form>
        </Stagger>
      </m.div>
    );
  }

  return (
    <BrokerMotion>
      <div className="relative min-h-[100dvh] overflow-hidden bg-[#1a1035] text-white flex items-center justify-center px-4 py-10">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-[#e0457b]/20 blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-[#7c3aed]/20 blur-[120px]" />
        <m.div
          className="relative w-full max-w-md"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="mb-6 flex items-center gap-3">
            <img src={logo} alt="Lead Velocity" className="h-10 w-10 object-contain" />
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/50">{eyebrow}</span>
          </div>
          <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 backdrop-blur-xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
            <div aria-hidden className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#e0457b]/70 to-transparent" />
            <AnimatePresence mode="wait">{body}</AnimatePresence>
          </div>
          <p className="mt-6 text-center text-xs text-white/40">
            Need help? <a href="mailto:howzit@leadvelocity.co.za" className="text-[#f3a64b] hover:underline">howzit@leadvelocity.co.za</a>
          </p>
        </m.div>
      </div>
    </BrokerMotion>
  );
};

export default ResetPassword;
