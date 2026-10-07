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
  return `Hi, I'd like to connect my Outlook calendar to SortMyCover (Lead Velocity (Pty) Ltd) so clients can book meetings with me. `
    + `The app only checks when I'm free and creates meetings in my own calendar, with a Teams link. It cannot read my email or anyone else's calendar. `
    + `Microsoft is asking for administrator approval because user consent is switched off for our organisation. `
    + `Please open this link, sign in as an administrator and choose Accept: ${opts.consentUrl} . It takes about two minutes. Thanks${who ? `, ${who}` : ""}.`;
}
