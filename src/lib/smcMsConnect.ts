/**
 * Pure helpers for the "Connect my Outlook calendar" onboarding step (no React, no Supabase, so they are unit-tested
 * in automation/tests/ms-oauth.test.mjs). The page is src/pages/portal/Calendar.tsx; the server side is the
 * ms-oauth edge function (supabase/functions/ms-oauth).
 */
import type { SmcBroker } from "@/integrations/supabase/smc-types";

type CalBroker = Pick<SmcBroker, "calendar_status" | "calendar_mode" | "calendar_status_detail" | "onboarding_progress">;

const DONE = new Set(["done", "skipped", "defaulted"]);

/** Only Microsoft sign-in hosts are ever followed (authorize_url, admin_consent_url). */
export const msUrl = (u: unknown): string =>
  typeof u === "string" && /^https:\/\/login\.microsoftonline\.com\//.test(u) ? u : "";

/**
 * What the Lead Velocity Entra app may do in the broker's Microsoft 365, in the broker's words. The scope strings are
 * the ones ms-oauth requests (supabase/functions/ms-oauth/lib.mjs SCOPES); Calendars.ReadWrite covers both free/busy
 * and adding/removing events, OnlineMeetings.ReadWrite the Teams link.
 */
export const CALENDAR_PERMISSIONS: { key: string; scope: string; label: string }[] = [
  { key: "freebusy", scope: "Calendars.ReadWrite", label: "See when you are free or busy (not what your meetings are about)" },
  { key: "events", scope: "Calendars.ReadWrite", label: "Add and remove the meetings Lead Velocity books for you" },
  { key: "teams", scope: "OnlineMeetings.ReadWrite", label: "Create a Teams link for each of those meetings" },
];

/** Scopes Microsoft actually granted: brokers.calendar_scopes (space separated) or the callback's detail.scopes. */
export function grantedScopes(b: { calendar_scopes?: string | null; calendar_status_detail?: Record<string, unknown> | null }): string[] {
  const fromCol = typeof b.calendar_scopes === "string" ? b.calendar_scopes.split(/\s+/) : [];
  const d = b.calendar_status_detail?.scopes;
  const fromDetail = Array.isArray(d) ? d.map(String) : typeof d === "string" ? d.split(/\s+/) : [];
  return [...new Set([...fromCol, ...fromDetail].map((s) => s.trim()).filter(Boolean))];
}

/** Each permission with whether it is granted now (only meaningful while connected). */
export function permissionRows(scopes: string[]): { key: string; label: string; granted: boolean }[] {
  const have = new Set(scopes.map((s) => s.toLowerCase()));
  return CALENDAR_PERMISSIONS.map((p) => ({ key: p.key, label: p.label, granted: have.has(p.scope.toLowerCase()) }));
}

export type OutlookCardView =
  | { state: "no_smc" }               // brokers.brand_id IS NULL: ms-oauth refuses (403 not_a_broker) until a SortMyCover order is set up
  | { state: "not_connected" }
  | { state: "admin_blocked" }
  | { state: "needs_reconnect" }
  | { state: "shared" }               // shared_fallback calendar instead of OAuth
  | { state: "connected"; account: string | null };

/** The portal card's state from the broker row (same vocabulary as calendarStepView, plus the brand gate). */
export function outlookCardView(b: Pick<CalBroker, "calendar_status" | "calendar_mode" | "calendar_status_detail"> & { brand_id?: string | null }): OutlookCardView {
  if (!b.brand_id) return { state: "no_smc" };
  if (b.calendar_mode === "shared_fallback") return { state: "shared" };
  switch (b.calendar_status) {
    case "ok": return { state: "connected", account: connectedAs(b) };
    case "blocked_admin_consent": return { state: "admin_blocked" };
    case "needs_reconnect": return { state: "needs_reconnect" };
    default: return { state: "not_connected" };
  }
}

/** Only http(s) links are rendered as a meeting link (a stored javascript: URL must never become an <a href>). */
export const safeJoinUrl = (u: unknown): string =>
  typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : "";

/** Where the portal may send a broker back after Microsoft: same-origin /broker… paths only, never /broker/calendar (loop). */
export const isPortalReturnPath = (p: unknown): p is string =>
  typeof p === "string" && /^\/broker[-/a-z0-9]*(\?[\w=&%-]*)?$/i.test(p) && !/^\/broker\/calendar(\?|$)/i.test(p);

/** path (may carry its own ?query) + the callback's ?calendar= / ?error= / ?reason= params, nothing else. */
export function withCallbackParams(path: string, search: string): string {
  const [base, own = ""] = path.split("?");
  const q = new URLSearchParams(own);
  const cb = new URLSearchParams(search);
  for (const k of ["calendar", "error", "reason"]) { const v = cb.get(k); if (v) q.set(k, v); }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** "name@domain" the broker signed in with, as stored by the callback (never a token). */
export function connectedAs(b: Pick<CalBroker, "calendar_status" | "calendar_status_detail">): string | null {
  if (b.calendar_status !== "ok") return null;
  const a = (b.calendar_status_detail as { account?: unknown } | null | undefined)?.account;
  return typeof a === "string" && a.includes("@") ? a : null;
}

export type CalendarStepView =
  | { state: "not_connected" }
  | { state: "admin_blocked" }
  | { state: "needs_reconnect" }
  | { state: "verifying"; account: string | null }   // token stored, W20 has not yet confirmed a free slot
  | { state: "done"; account: string | null; shared: boolean };

/** One answer to "where is the calendar step?" from the broker row. */
export function calendarStepView(b: CalBroker): CalendarStepView {
  const stepDone = DONE.has(String(b.onboarding_progress?.calendar?.status || ""));
  if (b.calendar_mode === "shared_fallback") return stepDone ? { state: "done", account: null, shared: true } : { state: "verifying", account: null };
  switch (b.calendar_status) {
    case "ok": return stepDone ? { state: "done", account: connectedAs(b), shared: false } : { state: "verifying", account: connectedAs(b) };
    case "blocked_admin_consent": return { state: "admin_blocked" };
    case "needs_reconnect": return { state: "needs_reconnect" };
    default: return { state: "not_connected" };
  }
}

/** Banner for the ?calendar= / ?error= params the edge function redirects back with. */
export function callbackNotice(search: string): { tone: "ok" | "info" | "error"; text: string } | null {
  const p = new URLSearchParams(search);
  if (p.get("calendar") === "connected") return { tone: "ok", text: "Microsoft says yes. We're checking your calendar now." };
  if (p.get("calendar") === "cancelled") return { tone: "info", text: "No problem. You can connect any time. Nothing was changed." };
  const e = p.get("error");
  if (!e) return null;
  if (e === "admin_consent") return null; // the admin-approval panel opens instead
  const reason = p.get("reason");
  if (reason === "link_expired") return { tone: "error", text: "That sign-in link expired. Tap Sign in with Microsoft again." };
  if (reason === "scope_missing") return { tone: "error", text: "Microsoft connected but didn't give us calendar access. Tap Sign in with Microsoft again and keep every box ticked." };
  return { tone: "error", text: "We couldn't finish connecting. Try once more, or message us and we'll sort it." };
}

/** The one paragraph a broker forwards to his IT admin (also the body of the "Email my IT admin" button). */
export function adminConsentNote(opts: { brokerName?: string | null; consentUrl: string }): string {
  const who = (opts.brokerName || "").trim();
  return `Hi, I'd like to connect my Outlook calendar to the Lead Velocity app (Lead Velocity (Pty) Ltd) so clients can book meetings with me. `
    + `The app only checks when I'm free and creates meetings in my own calendar, with a Teams link. It cannot read my email or anyone else's calendar. `
    + `Microsoft is asking for administrator approval because user consent is switched off for our organisation. `
    + `Please open this link, sign in as an administrator and choose Accept: ${opts.consentUrl} . It takes about two minutes. Thanks${who ? `, ${who}` : ""}.`;
}
