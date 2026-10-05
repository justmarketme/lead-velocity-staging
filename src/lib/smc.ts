/**
 * SortMyCover helpers: feature flag, webhook base, untyped DB accessors, formatting, shared constants.
 * Everything SMC in the CRM is behind VITE_SMC_ENABLED (default off). With the flag off no SMC route is mounted.
 * Reuse (0.2): the existing Supabase client (src/integrations/supabase/client.ts, INV-04/INV-05) and has_role (INV-F02).
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { SmcBroker, SmcDispositionCode, SmcMethod, SmcStepKey, SmcOnboardingProgress, OpsFaculty } from "@/integrations/supabase/smc-types";

const env = import.meta.env;

export const SMC_ENABLED: boolean = env.VITE_SMC_ENABLED === "true";
/** NH-61: Instant EFT and card (Paystack) are built but off. Default off; the portal then offers payment by EFT, in advance, per 30-day cycle only. */
export const PAYSTACK_ENABLED: boolean = env.VITE_PAYSTACK_ENABLED === "true";
/** n8n webhook base, e.g. https://n8n.example/webhook (no trailing slash). Empty = actions show "not connected yet". */
export const N8N_BASE: string = String(env.VITE_N8N_WEBHOOK_BASE || "").replace(/\/+$/, "");
/** Deprecated (I-41a): the portal now calls W20 {N8N_BASE}/ms/connect with the broker JWT; kept only so old .env files still parse. */
export const MS_OAUTH_URL: string = String(env.VITE_MS_OAUTH_URL || "");
export const MS_ADMIN_CONSENT_URL: string = String(env.VITE_MS_ADMIN_CONSENT_URL || "");
/** billing/checkout/ page (billing-automation). Same hosting serves it; override per environment. */
export const CHECKOUT_URL: string = String(env.VITE_SMC_CHECKOUT_URL || "/checkout/");
/** portal/intro-media/ static app (intro-media-producer). */
export const INTRO_MEDIA_URL: string = String(env.VITE_SMC_INTRO_MEDIA_URL || "/portal/intro-media/index.html");
export const EXPLAINER_URL: string = String(env.VITE_SMC_EXPLAINER_URL || "/media/explainer/en/explainer.mp4");
export const EXPLAINER_VTT: string = String(env.VITE_SMC_EXPLAINER_VTT || "/media/explainer/en/explainer.vtt");
export const CLIPS_BASE: string = String(env.VITE_SMC_CLIPS_BASE || "/media/clips/en").replace(/\/+$/, "");
export const SUPPORT_WA: string = String(env.VITE_SMC_SUPPORT_WA || ""); // digits only, e.g. 27…; empty hides the button
export const MEDIA_BUCKET: string = String(env.VITE_SMC_MEDIA_BUCKET || "broker-media");
export const SUPPORT_EMAIL = "howzit@leadvelocity.co.za";

/**
 * Untyped accessors. The SMC tables are not in the generated types.ts (migrations not applied, NH-11),
 * so rows are cast to the hand-written types in smc-types.ts at the call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const smcDb = supabase as unknown as SupabaseClient<any, "public", any>;
// `ops` is never exposed to the API (NH-22 default): the console reads/writes ops.* only via admin-only RPCs (smc_08).

export function errText(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  const m = (e as { message?: string }).message;
  return m || JSON.stringify(e);
}

// ---------------------------------------------------------------- webhooks (n8n)
export interface WebhookResult<T> { ok: boolean; status: number; data: T | null; error?: string }

/** POST JSON to `${VITE_N8N_WEBHOOK_BASE}/${path}` with the caller's Supabase JWT (n8n verifies it; the browser holds no secret). */
export async function postWebhook<T = unknown>(path: string, body: unknown, method: "POST" | "GET" = "POST"): Promise<WebhookResult<T>> {
  if (!N8N_BASE) return { ok: false, status: 0, data: null, error: "Not connected yet (VITE_N8N_WEBHOOK_BASE is not set)." };
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  try {
    const res = await fetch(`${N8N_BASE}/${path.replace(/^\/+/, "")}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });
    const text = await res.text();
    let data: T | null = null;
    try { data = text ? (JSON.parse(text) as T) : null; } catch { data = null; }
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : (data as { message?: string } | null)?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: errText(e) };
  }
}

// ---------------------------------------------------------------- formatting (Africa/Johannesburg, en-ZA)
const TZ = "Africa/Johannesburg";
export function fmtZar(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "n/a";
  // en-US grouping on purpose: the brand writes thousands with a comma (en-ZA would use a space and a decimal comma).
  return "R" + Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtPct(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "n/a";
  return (Number(v) * 100).toFixed(dp) + "%";
}
export function fmtNum(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "n/a";
  return Number(v).toLocaleString("en-US", { maximumFractionDigits: dp });
}
export function fmtDay(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
}
export function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}
export function fmtDayTime(ts: string | null | undefined): string {
  return ts ? `${fmtDay(ts)}, ${fmtTime(ts)}` : "";
}
/** YYYY-MM-DD in Africa/Johannesburg. */
export function saDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- vocab (4.12a, NH-19 labels — same words as WhatsApp + Schedule C)
export const DISPOSITIONS: { code: SmcDispositionCode; label: string; replacementEligible: boolean }[] = [
  { code: "fit_proceeding", label: "Good fit – proceeding", replacementEligible: false },
  { code: "fit_followup", label: "Good fit – follow-up", replacementEligible: false },
  { code: "nofit_budget", label: "Not a fit – budget", replacementEligible: false },
  { code: "nofit_covered", label: "Not a fit – well covered", replacementEligible: false },
  { code: "nofit_criteria", label: "Not a fit – criteria", replacementEligible: true },
  { code: "unreachable", label: "Unreachable/wrong number", replacementEligible: true },
];
export const dispositionLabel = (c: string | null | undefined) => DISPOSITIONS.find((d) => d.code === c)?.label || "";

export const METHOD_LABEL: Record<SmcMethod, string> = {
  teams: "Teams", zoom: "Zoom", meet: "Google Meet", whatsapp_call: "WhatsApp call", phone: "Phone",
};
export const methodLabel = (m: string | null | undefined) => (m && METHOD_LABEL[m as SmcMethod]) || m || "";
export const AGE_LABEL: Record<string, string> = { lt35: "under 35", "35_44": "35-44", "45_50": "45-50", "51plus": "51+" };
export const BUDGET_LABEL: Record<string, string> = { lt750: "under R750", "750_1250": "R750-R1,250", "1250plus": "R1,250+ (before split)", "1250_1499": "R1,250-R1,499", "1500_plus": "R1,500+" };
export const isPremium1500 = (b: string | null | undefined) => b === "1500_plus";

// ---------------------------------------------------------------- onboarding steps (portal/spec/README.md, single source)
export interface StepDef { key: SmcStepKey; title: string; reason: string; minutes: number; blocking: boolean; path: string }
export const STEPS: StepDef[] = [
  { key: "video", title: "Watch the 3-minute video", reason: "Done. Watch again any time.", minutes: 3, blocking: false, path: "/broker/start#explainer" },
  { key: "profile", title: "Your details and FSP number", reason: "We check your FSP on the public FSCA register.", minutes: 3, blocking: true, path: "/broker/profile" },
  { key: "calendar", title: "Connect your Outlook calendar", reason: "One tap.", minutes: 1, blocking: true, path: "/broker/calendar" },
  { key: "availability", title: "Your hours and how you meet", reason: "We filled in a sensible start. Check it.", minutes: 1, blocking: true, path: "/broker/calendar#hours" },
  { key: "agreement", title: "Sign your agreement", reason: "Plain words.", minutes: 3, blocking: true, path: "/broker/agreement" },
  { key: "card", title: "Approve your intro card", reason: "What leads see before they meet you.", minutes: 1, blocking: true, path: "/broker/intro-card" },
  { key: "media", title: "Record your 25-second intro", reason: "Not needed to go live. We're testing whether it helps people turn up.", minutes: 10, blocking: false, path: "/broker/intro-media" },
];
const DONEISH = new Set(["done", "skipped", "defaulted"]);
export function stepDone(p: SmcOnboardingProgress | null | undefined, k: SmcStepKey): boolean {
  return DONEISH.has(String(p?.[k]?.status || ""));
}
export function progressSummary(p: SmcOnboardingProgress | null | undefined) {
  const done = STEPS.filter((s) => stepDone(p, s.key)).length;
  const minutesToLive = STEPS.filter((s) => s.blocking && !stepDone(p, s.key)).reduce((a, s) => a + s.minutes, 0);
  const current = STEPS.find((s) => !stepDone(p, s.key)) || null;
  return { done, total: STEPS.length, pct: Math.round((done / STEPS.length) * 100), minutesToLive, current };
}

// ---------------------------------------------------------------- 11 faculties (optimisation/slos.json; ids, names, headline metric + SLO)
export const FACULTIES: { id: OpsFaculty; name: string; headline: string; metric: string; slo: string }[] = [
  { id: "media", metric: "qualified_cpl", name: "Media", headline: "Cost per qualified lead", slo: "≤ R250" },
  { id: "page_flow", metric: "page_conversion", name: "Page & Flow", headline: "Page conversion", slo: "≥ 18%" },
  { id: "conversation", metric: "first_message_under_60s", name: "Conversation", headline: "First message < 60 s", slo: "100%" },
  { id: "nurture_show", metric: "show_rate", name: "Nurture & show", headline: "Show rate", slo: "≥ 65%" },
  { id: "comments_dms", metric: "public_sla_share", name: "Comments & DMs", headline: "Public reply SLA", slo: "≥ 95%" },
  { id: "broker", metric: "disposition_rate", name: "Broker", headline: "Disposition rate", slo: "≥ 90%" },
  { id: "billing", metric: "renewal_rate_cycle1", name: "Billing", headline: "Cycle-1 renewal", slo: "see slos.json" },
  { id: "compliance", metric: "consent_stored_pct", name: "Compliance", headline: "Consent stored", slo: "100%" },
  { id: "infra_cost", metric: "uptime_pct", name: "Infra & cost", headline: "Uptime", slo: "≥ 99.5%" },
  { id: "brand_search", metric: "branded_search_wow", name: "Brand & search", headline: "Branded search w/w", slo: "rising" },
  { id: "build", metric: "tasks_blocked", name: "Build", headline: "Tasks blocked", slo: "0" },
];

// ---------------------------------------------------------------- auth hooks
/** Admin check via has_role (INV-F02). */
export function useIsAdmin() {
  const [state, setState] = useState<{ loading: boolean; isAdmin: boolean; userId: string | null }>({ loading: true, isAdmin: false, userId: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id || null;
      if (!uid) { if (alive) setState({ loading: false, isAdmin: false, userId: null }); return; }
      const { data } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (alive) setState({ loading: false, isAdmin: !!data, userId: uid });
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

/**
 * The signed-in broker's own row (brokers.user_id = auth.uid(); RLS enforces it server-side, INV-A06).
 * Also stamps first_login_at / last_seen_at through smc_portal_touch() on load and every 60 s while visible.
 */
export function useCurrentBroker(opts: { heartbeat?: boolean } = {}) {
  const [broker, setBroker] = useState<SmcBroker | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id || null;
    setUserId(uid);
    if (!uid) { setBroker(null); setLoading(false); return null; }
    const { data, error: e } = await smcDb.from("brokers").select("*").eq("user_id", uid).maybeSingle();
    if (e) setError(errText(e));
    setBroker((data as SmcBroker) || null);
    setLoading(false);
    return (data as SmcBroker) || null;
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!opts.heartbeat || !broker?.brand_id) return;
    const touch = () => { if (document.visibilityState === "visible") void smcDb.rpc("smc_portal_touch"); };
    touch();
    const t = window.setInterval(touch, 60_000);
    return () => window.clearInterval(t);
  }, [opts.heartbeat, broker?.brand_id]);

  return { broker, userId, loading, error, reload, setBroker };
}

/** Portal events -> lead_activities (workflow 'portal') -> W20 via DB webhook. Types are whitelisted by the RPC. */
export type PortalEventType =
  | "step.completed" | "step.skipped" | "fsp.submitted" | "calendar.fallback_chosen" | "card.approved"
  | "report.ask" | "support.message" | "profile.saved" | "availability.saved" | "outcome.marked";
export async function portalEvent(type: PortalEventType, step: string | null = null, payload: Record<string, unknown> = {}) {
  return smcDb.rpc("smc_portal_event", { p_type: type, p_step: step, p_payload: payload });
}

/** Banned words for the light client-side no-advice pre-check (the server gate in W20 is authoritative). */
const BANNED = [/\bbest\b/i, /\bcheapest\b/i, /#\s?1\b/, /\bguarantee(d|s)?\b/i, /\bpremiums?\b/i, /\bR\s?\d/, /\breturns?\b/i,
  /\bdiscovery\b/i, /\bsanlam\b/i, /\bold mutual\b/i, /\bliberty\b/i, /\bmomentum\b/i, /\bhollard\b/i, /\bbrightrock\b/i];
export function noAdviceTrip(text: string): string | null {
  for (const r of BANNED) { const m = text.match(r); if (m) return m[0]; }
  return null;
}
