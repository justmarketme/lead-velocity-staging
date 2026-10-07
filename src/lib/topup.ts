// Top-ups (agreement clause 9). The ONE client entry point for buying extra Qualified Leads: every surface (portal billing
// panel here, the ux-sprint-1 cycle-card Top up sheet) calls requestTopup(), which POSTs to W16 /billing/topup with the
// broker's Supabase JWT. Price, minimum and notice come only from pricing.seed.json via ./pricing (3.6).
import { TOPUP } from "./pricing";
import { postWebhook } from "./smc";

export interface TopupResult {
  ok: boolean;
  reference?: string | null;
  total_zar?: number;
  qty?: number;
  earliest_start?: string;
  method?: "manual_eft" | "instant_eft" | "card";
  authorization_url?: string | null;
  message?: string;
}

/** Whole leads, never below the minimum. */
export const clampTopupQty = (n: number): number => Math.max(TOPUP.min_leads, Math.round(Number(n) || 0));
export const topupTotalZar = (qty: number): number => clampTopupQty(qty) * TOPUP.price_per_lead_zar;
/** Earliest delivery start for a request made at `now` (notice period; later if payment clears after it). */
export const topupEarliestStart = (now: number = Date.now()): Date => new Date(now + TOPUP.notice_days * 86400e3);
/** Top-ups open only once the cycle's committed leads are delivered. */
export const topupOpen = (p: { committed: number; verified: number; status: string } | null | undefined): boolean =>
  !!p && ["active", "extended"].includes(p.status) && Number(p.verified) >= Number(p.committed);

/**
 * Issue a top-up invoice. Paystack off (default) -> manual EFT: the result carries the unique reference to pay with.
 * Paystack on and method instant_eft/card -> authorization_url to send the broker to.
 */
export async function requestTopup(qty: number, method: "manual_eft" | "instant_eft" | "card" = "manual_eft"): Promise<TopupResult> {
  if (!Number.isInteger(qty) || qty < TOPUP.min_leads) return { ok: false, message: `Choose ${TOPUP.min_leads} or more leads.` };
  const r = await postWebhook<TopupResult>("billing/topup", { qty, method });
  if (!r.ok) return { ok: false, message: r.data?.message || r.error || "Could not issue the top-up invoice.", reference: r.data?.reference ?? null };
  return { ...(r.data || {}), ok: true };
}
