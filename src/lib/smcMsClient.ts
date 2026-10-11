/**
 * Browser side of "Connect my Outlook calendar": calls the ms-oauth edge function (supabase/functions/ms-oauth) with the
 * broker's JWT, and remembers which portal page started the sign-in. The function's callback always redirects to
 * {PORTAL_URL}/broker/calendar; MsReturnGate on that route sends the broker back to the page he started from
 * (e.g. the elite portal's Appointment Center) with the ?calendar= / ?error= result attached.
 * Pure helpers (view state, permissions, admin note) live in smcMsConnect.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { errText } from "@/lib/smc";
import { isPortalReturnPath } from "@/lib/smcMsConnect";

export { withCallbackParams } from "@/lib/smcMsConnect";

export interface MsResp { ok?: boolean; authorize_url?: string; admin_consent_url?: string; calendar_status?: string; error?: string }

/** start returns the Microsoft sign-in URL (PKCE); disconnect forgets the Vault token. Never returns a token. */
export async function msCall(action: "start" | "disconnect"): Promise<{ ok: boolean; status: number; data: MsResp | null }> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session?.access_token) return { ok: false, status: 401, data: { error: "Please sign in again." } };
  try {
    const { data, error } = await supabase.functions.invoke<MsResp>("ms-oauth", { body: { action } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const status = ctx?.status ?? 0;
      let body: MsResp | null = null;
      try { body = (await ctx?.json()) as MsResp; } catch { body = null; }
      return { ok: false, status, data: body ?? { error: errText(error) } };
    }
    return { ok: !!data?.ok, status: 200, data: data ?? null };
  } catch (e) {
    return { ok: false, status: 0, data: { error: errText(e) } };
  }
}

/** One sentence for a failed start, by HTTP status / error code. */
export function msStartError(r: { status: number; data: MsResp | null }): string {
  if (r.status === 401) return "Your sign-in has expired. Sign in to the portal again, then tap Connect.";
  if (r.status === 403 || r.data?.error === "not_a_broker") return "Calendar connection opens once your SortMyCover order is set up. Ask Lead Velocity to set it up.";
  if (r.status === 503 || r.status === 0 || r.data?.error === "not_configured") return "Microsoft sign-in isn't switched on yet. We'll let you know on WhatsApp.";
  return `We couldn't start Microsoft sign-in (${r.data?.error || `HTTP ${r.status}`}). Try again.`;
}

const RETURN_KEY = "lv.msReturn";
const RETURN_TTL_MS = 30 * 60 * 1000;
const okReturn = isPortalReturnPath;

export function rememberMsReturn(path: string): void {
  if (!okReturn(path)) return;
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* private mode: land on /broker/calendar */ }
}

/** Reads and clears the remembered page (null when absent, stale or not a portal path). */
export function takeMsReturn(nowMs = Date.now()): string | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (!okReturn(v.path) || typeof v.at !== "number" || nowMs - v.at > RETURN_TTL_MS || v.at > nowMs) return null;
    return v.path;
  } catch { return null; }
}
