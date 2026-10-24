/**
 * Broker self-service fields (portal): FSP number and business WhatsApp number. Pure helpers (no imports) so they can be
 * unit-tested with `node --test src/lib/brokerProfile.test.mjs`. The server repeats every rule in broker_update_profile()
 * (migration 20261012180000), which is the authority; these only give instant feedback.
 */

/** "FSP 28418", " 28 418 " → "28418". */
export const normFsp = (v: string): string => String(v || "").replace(/\s+/g, "").replace(/^fsp/i, "");
/** FSP numbers are 3 to 6 digits (same rule as the server and the intro card). */
export const fspValid = (v: string): boolean => /^\d{3,6}$/.test(normFsp(v));

/** Any common way of writing a South African number → E.164 "+27XXXXXXXXX", or null when it isn't one. */
export function toZaE164(v: string): string | null {
  let s = String(v || "").replace(/[\s()-]+/g, "");
  if (/^0\d{9}$/.test(s)) s = "+27" + s.slice(1);
  else if (/^27\d{9}$/.test(s)) s = "+" + s;
  else if (/^0027\d{9}$/.test(s)) s = "+" + s.slice(2);
  return /^\+27[1-9]\d{8}$/.test(s) ? s : null;
}

/** "+27833278413" → "+27 83 327 8413" for display. */
export function fmtZa(e164: string | null | undefined): string {
  const s = String(e164 || "");
  const m = /^\+27(\d{2})(\d{3})(\d{4})$/.exec(s);
  return m ? `+27 ${m[1]} ${m[2]} ${m[3]}` : s;
}

/** Postgres/PostgREST error → short sentence for the broker (the RPC raises plain-English messages). */
export function profileErrorText(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message || String(e || "");
  if (/permission denied|42501|No broker profile/i.test(msg)) return "We couldn't save this for your login. Please email howzit@leadvelocity.co.za.";
  if (/Preview is read-only/i.test(msg)) return "Preview only: nothing is saved.";
  return msg || "Something went wrong. Please try again.";
}
