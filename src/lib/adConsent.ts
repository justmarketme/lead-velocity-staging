/**
 * Ads featuring the broker (migration 20261013190000):
 *  - Standing consent in brokers.onboarding_progress.ad_consent = {status: 'granted'|'withdrawn', at, wording_version, ...},
 *    changed only through broker_set_ad_likeness_consent(p_consent). Every change is a broker_compliance_checks row.
 *  - Each ad (broker_media kind 'ad') must be approved by the broker before it runs: broker_decide_ad(id, approve, note).
 * The wording below is stored with every consent row: keep it identical to the constants in the migration, and bump
 * AD_CONSENT_VERSION (and the migration) whenever it changes.
 * Pure helpers (no imports) so they run under `node --test src/lib/adConsent.test.mjs`.
 */

export const AD_CONSENT_VERSION = "ADS-LIKENESS-v3";
export const AD_CONSENT_HEADING = "Your photo and name in our ads";
export const AD_CONSENT_BODY =
  "We may feature you in some of the SortMyCover ads that send clients to you, using your name and photo only. Your practice name and FSP number never appear on an ad; clients see them in the WhatsApp chat. We won't run any ad with your face or name until you've approved that specific ad here in your portal. You can withdraw this consent at any time.";
export const AD_CONSENT_CHECKBOX =
  "I agree that Lead Velocity may use my name and photo in SortMyCover adverts that refer clients to me, subject to my approval of each such advert in the portal.";

export interface AdConsent { status: "granted" | "withdrawn"; at: string | null; wording_version: string }

/** Reads onboarding_progress.ad_consent; null when absent or malformed. */
export function readAdConsent(progress: unknown): AdConsent | null {
  const r = (progress as { ad_consent?: Record<string, unknown> } | null | undefined)?.ad_consent;
  if (!r || typeof r !== "object") return null;
  const status = String(r.status || "");
  if (status !== "granted" && status !== "withdrawn") return null;
  return { status, at: typeof r.at === "string" ? r.at : null, wording_version: typeof r.wording_version === "string" ? r.wording_version : "" };
}

export const adConsentGranted = (progress: unknown): boolean => readAdConsent(progress)?.status === "granted";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO timestamp → "13 Oct 2026, 18:42" in South African time (UTC+2 all year, no DST). "" when unparseable. */
export function fmtDayTimeSast(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 2 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Admin drawer line: "Ad consent: granted on 13 Oct 2026, 18:42 (ADS-LIKENESS-v2)" / "withdrawn on …" / "not given". */
export function adConsentAdminText(progress: unknown): { text: string; granted: boolean } {
  const c = readAdConsent(progress);
  if (!c) return { text: "Ad consent: not given", granted: false };
  const when = fmtDayTimeSast(c.at);
  const ver = c.wording_version ? ` (${c.wording_version})` : "";
  return c.status === "granted"
    ? { text: `Ad consent: granted on ${when}${ver}`, granted: true }
    : { text: `Ad consent: withdrawn on ${when}`, granted: false };
}

export interface AdRow {
  id: string; version: number; url: string | null; thumbnail_url: string | null; script_text: string | null;
  state: string | null; is_current: boolean; approved_at: string | null; created_at: string;
  ai_check: { broker_decision?: string } | null;
}

/**
 * Splits the broker's ads for the portal list:
 *  waiting  = ready (never decided) or pulled when he withdrew consent (he may approve again once consent is back);
 *  approved = approved and current (he can still decline, which pulls it);
 *  declined ads are not listed (the audit trail keeps them).
 */
/** Ads in a fixed order (version ascending, then created) so approving one never moves it on the page (Mark, 19 Oct). */
export function stableOrder<T extends { version?: unknown; created_at?: unknown }>(rows: T[]): T[] {
  const v = (r: T) => Number(r.version) || 0;
  return [...rows].sort((a, b) => v(a) - v(b) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

export function splitAds(rows: AdRow[] | null | undefined): { waiting: AdRow[]; approved: AdRow[] } {
  const waiting: AdRow[] = [];
  const approved: AdRow[] = [];
  for (const r of rows || []) {
    if (!r.url || r.state === "processing") continue;
    if (r.state === "approved" && r.is_current && r.approved_at) approved.push(r);
    else if (r.state === "ready" || (r.state === "rejected" && r.ai_check?.broker_decision === "consent_withdrawn")) waiting.push(r);
  }
  return { waiting, approved };
}
