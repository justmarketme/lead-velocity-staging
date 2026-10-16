// Password-reset logic shared by the broker and admin sign-in pages and the /reset-password landing page.
// Pure functions (no React, no supabase import) so they can be unit tested:
//   node --test src/lib/passwordReset.test.mjs   (Node 22.18+/25 imports the .ts directly)

/** Origins a reset link may point at. The Supabase redirect allow-list is `https://leadvelocity.co.za/**`. */
export const RESET_ALLOWED_ORIGINS = ["https://leadvelocity.co.za", "https://www.leadvelocity.co.za"] as const;
export const PRODUCTION_ORIGIN = RESET_ALLOWED_ORIGINS[0];

/** Never build the link from localhost / preview hosts: Supabase would reject it and fall back to the Site URL. */
export function resetRedirectUrl(currentOrigin?: string | null): string {
  const origin = (currentOrigin ?? "").replace(/\/+$/, "");
  const base = (RESET_ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : PRODUCTION_ORIGIN;
  return `${base}/reset-password`;
}

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
export const isPlausibleEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(raw)) && raw.trim().length <= 254;

/** The one confirmation shown for every address, registered or not. */
export const RESET_SENT_MESSAGE = "If an account exists for that email, we've emailed a link to create a new password.";
export const RESET_COOLDOWN_MS = 60_000;

export type ResetOutcome = "sent" | "rate_limited" | "invalid_email";

const sentAt = new Map<string, number>();
/** Seconds left before this address may be requested again from this tab (0 = free). */
export function cooldownRemaining(email: string, now = Date.now()): number {
  const t = sentAt.get(normalizeEmail(email));
  return t ? Math.max(0, Math.ceil((t + RESET_COOLDOWN_MS - now) / 1000)) : 0;
}
export function resetCooldownForTests() { sentAt.clear(); }

type ResetClient = {
  auth: { resetPasswordForEmail(email: string, opts: { redirectTo: string }): Promise<{ error: { message?: string; status?: number; code?: string } | null }> };
};

/**
 * Ask Supabase to email a recovery link. The outcome never depends on whether the account exists:
 * "unknown user", provider and network failures all read as "sent" (and are only logged without the
 * address). Only a rate limit (429 / over_email_send_rate_limit) is surfaced, because it is about the
 * caller, not the account.
 */
export async function requestPasswordReset(client: ResetClient, rawEmail: string, currentOrigin?: string | null, now = Date.now()): Promise<ResetOutcome> {
  if (!isPlausibleEmail(rawEmail)) return "invalid_email";
  const email = normalizeEmail(rawEmail);
  if (cooldownRemaining(email, now) > 0) return "rate_limited";
  sentAt.set(email, now);
  try {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: resetRedirectUrl(currentOrigin) });
    if (error) {
      if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return "rate_limited";
      console.warn("resetPasswordForEmail failed:", error.code ?? error.status ?? "error");
    }
  } catch {
    console.warn("resetPasswordForEmail failed: network");
  }
  return "sent";
}

export const RATE_LIMITED_MESSAGE = "Too many requests. Please wait a minute and try again.";

// ---- New password ----------------------------------------------------------------------------

export const MIN_PASSWORD_LENGTH = 8;

/** 0-4: length, then variety. The only hard rules are the minimum length and a matching confirmation. */
export function passwordStrength(pw: string): number {
  if (pw.length < MIN_PASSWORD_LENGTH) return pw.length ? 1 : 0;
  let score = 2;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 72) return "Password must be 72 characters or fewer"; // bcrypt silently truncates beyond 72 bytes
  if (password !== confirm) return "Passwords do not match";
  return null;
}

// ---- Recovery landing --------------------------------------------------------------------------

export type RecoveryParams =
  | { kind: "error"; code: string }
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "code"; code: string }
  | { kind: "none" };

/** Read what the email link delivered: an error (expired/used), a token_hash, a PKCE code, or (implicit flow) nothing here. */
export function parseRecoveryParams(search: string, hash: string): RecoveryParams {
  const q = new URLSearchParams(search);
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const err = h.get("error_code") || q.get("error_code") || h.get("error") || q.get("error");
  if (err) return { kind: "error", code: err };
  const th = q.get("token_hash");
  const type = q.get("type") || "recovery";
  if (th && type === "recovery") return { kind: "token_hash", tokenHash: th };
  const code = q.get("code");
  if (code) return { kind: "code", code };
  return { kind: "none" };
}

/** A rejected token is dead; a dropped connection or rate limit leaves it valid so the user can retry. */
export function verifyFailureIsFinal(error: { code?: string; status?: number }): boolean {
  if (error.code === "otp_expired") return true;
  const status = error.status ?? 0;
  return status >= 400 && status < 500 && status !== 429;
}

/** Where to send someone once their new password is saved. */
export function postResetDestination(isAdmin: boolean, portalType?: string | null): string {
  if (isAdmin) return "/dashboard";
  return portalType === "marketing" || portalType === "premium" ? "/broker-elite" : "/broker";
}
