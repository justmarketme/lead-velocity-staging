/**
 * Lead Velocity's review of a broker's own entries, shown in the portal:
 *  - FSP: "Verified by Lead Velocity on the FSCA register" when brokers.fsp_check.status = 'verified'.
 *  - Bio: brokers.onboarding_progress.bio_review = {status, original, suggested, reason, suggested_at, decided_at}.
 *    Lead Velocity writes 'changes_suggested'; the broker decides through broker_decide_bio_suggestion(p_accept)
 *    (migration 20261013160000). Brokers cannot write onboarding_progress directly (smc_brokers_guard).
 * Pure helpers (no imports) so they run under `node --test src/lib/brokerReview.test.mjs`.
 */

export interface FspCheckLike {
  status?: string | null; checked_at?: string | null; register_name?: string | null; register_status?: string | null;
  /** Product check (FSCA register > representative > Products); audit rows in public.broker_compliance_checks. */
  products_checked?: boolean | null; advice?: boolean | null; intermediary?: boolean | null; under_supervision?: boolean | null;
  categories_count?: number | null; covers?: string[] | null;
}

/** "a", "a and b", "a, b and c". */
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * "Authorised for advice and intermediary services · 14 product categories, including life cover, disability, severe
 * illness and income protection", or "" when the products were not checked.
 */
export function fspProductsText(check: FspCheckLike | null | undefined): string {
  if (!check?.products_checked) return "";
  const services = check.advice && check.intermediary ? "advice and intermediary services"
    : check.advice ? "advice" : check.intermediary ? "intermediary services" : "";
  const parts: string[] = [];
  if (services) parts.push(`Authorised for ${services}${check.under_supervision ? " (under supervision)" : ""}`);
  const n = Number(check.categories_count) || 0;
  const covers = (Array.isArray(check.covers) ? check.covers : []).map((c) => String(c).trim()).filter(Boolean);
  if (n > 0) parts.push(`${n} product ${n === 1 ? "category" : "categories"}${covers.length ? `, including ${andList(covers)}` : ""}`);
  else if (covers.length) parts.push(`Including ${andList(covers)}`);
  return parts.join(" · ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO timestamp → "13 Oct 2026" in South African time (UTC+2 all year, no DST). "" when unparseable. */
export function fmtDaySast(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 2 * 3600 * 1000);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The register's US spelling ("Authorized") in South African English. */
export const registerStatusText = (s: string | null | undefined): string =>
  !s ? "" : /^authori[sz]ed$/i.test(s.trim()) ? "Authorised" : s.trim();

/** Badge text for a verified FSP, or null when the check is not 'verified'. */
export function fspVerifiedBadge(check: FspCheckLike | null | undefined, verifiedAt?: string | null): { title: string; detail: string; products: string } | null {
  if (!check || check.status !== "verified") return null;
  const day = fmtDaySast(check.checked_at || verifiedAt || null);
  const title = `Verified by Lead Velocity on the FSCA register${day ? ` · ${day}` : ""}`;
  const detail = [check.register_name?.trim(), registerStatusText(check.register_status)].filter(Boolean).join(" · ");
  return { title, detail, products: fspProductsText(check) };
}

export type BioReviewStatus = "changes_suggested" | "accepted" | "declined";
export interface BioReview {
  status: BioReviewStatus; original: string; suggested: string; reason: string;
  suggested_at: string | null; decided_at: string | null;
}

/** Reads onboarding_progress.bio_review; null when absent or malformed. */
export function readBioReview(progress: unknown): BioReview | null {
  const r = (progress as { bio_review?: Record<string, unknown> } | null | undefined)?.bio_review;
  if (!r || typeof r !== "object") return null;
  const status = String(r.status || "");
  if (status !== "changes_suggested" && status !== "accepted" && status !== "declined") return null;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    status, original: s(r.original), suggested: s(r.suggested), reason: s(r.reason),
    suggested_at: s(r.suggested_at) || null, decided_at: s(r.decided_at) || null,
  };
}

const norm = (v: string | null | undefined) => String(v || "").replace(/\s+/g, " ").trim();

/**
 * The intro card waits while the bio Lead Velocity did not approve is still the live bio: a suggestion is open, or the
 * broker chose to rewrite it but has not yet saved a new one. Saving a different bio (which must pass noAdviceTrip)
 * clears it.
 */
export function bioBlocked(review: BioReview | null, bioShort: string | null | undefined): boolean {
  if (!review || review.status === "accepted") return false;
  return norm(bioShort) === norm(review.original);
}

/** What the portal shows: the review card, the "approved" note, or nothing. */
export function bioReviewView(review: BioReview | null, bioShort: string | null | undefined): "suggestion" | "rewrite" | "approved" | null {
  if (!review) return null;
  if (review.status === "accepted") return norm(bioShort) === norm(review.suggested) ? "approved" : null;
  if (!bioBlocked(review, bioShort)) return null;
  return review.status === "changes_suggested" ? "suggestion" : "rewrite";
}

/** Focus (and scroll to) an element that may mount a moment later, e.g. the bio box after a tab switch. */
export function focusWhenReady(id: string, tries = 20) {
  const el = document.getElementById(id) as HTMLElement | null;
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus({ preventScroll: true }); return; }
  if (tries > 0) window.setTimeout(() => focusWhenReady(id, tries - 1), 150);
}

/** The prepared intro card may be approved only when no Lead Velocity bio review is open: none, or accepted. */
export const cardApprovable = (review: BioReview | null): boolean => !review || review.status === "accepted";
