/* n8n API client. Contracts: landing/README.md "API contract expected from n8n" + automation/CONTRACTS.md.
 * The site has no backend of its own: every call goes to the n8n webhooks under site.n8n_base + site.api_prefix. */
import { API_BASE } from "./site";

export interface ApiResult { status: number; ok: boolean; json: Record<string, any> }

export function api(path: string, opt: RequestInit = {}): Promise<ApiResult> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), 15000);
  if (ctl) opt.signal = ctl.signal;
  return fetch(API_BASE + path, opt).then(
    (r) => { clearTimeout(t); return r.json().catch(() => ({})).then((j) => ({ status: r.status, ok: r.ok, json: (j || {}) as Record<string, any> })); },
    (err) => { clearTimeout(t); throw err; },
  );
}

export interface LeadBody {
  first_name: string; mobile: string; consent: true; consent_text: string; consent_version: string; consent_mode: string;
  consent_ads: boolean; consent_ads_text: string; consent_ads_version: string;
  age_band: string; budget_band: string;
  angle: string; lang: string; started_at: string; request_id: string; page_url: string;
  company_website: string; turnstile_token: string; context: unknown;
}

export const postLead = (body: LeadBody) => api("/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const getSlots = (token: string) => api("/slots?days=5", { method: "GET", headers: { Accept: "application/json", "X-Lead-Token": token } });
export const postBook = (token: string, body: Record<string, unknown>) => api("/book", { method: "POST", headers: { "Content-Type": "application/json", "X-Lead-Token": token }, body: JSON.stringify(body) });
export const postSkip = (token: string, leadId: string) => api("/lead/skip", { method: "POST", headers: { "Content-Type": "application/json", "X-Lead-Token": token }, body: JSON.stringify({ lead_id: leadId }) });

/* First-party visit beacon (I-32b): page views and quiz steps reached, per angle. No cookie, no IP, no fingerprint: an anonymous
   random id in sessionStorage only. Off with DNT / Global Privacy Control / the opt-out cookie. Never sends answers, name, phone or email. */
const sent: Record<string, 1> = {};
export function beacon(angle: string, ev: "view" | "step", step?: number, off: () => boolean = () => false) {
  try {
    const key = ev + (step ?? "");
    if (!angle || sent[key] || off() || !navigator.sendBeacon) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
    if (nav.doNotTrack === "1" || (window as any).doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl === true) return;
    sent[key] = 1;
    let sid: string | null = null;
    try { sid = sessionStorage.getItem("smc_sid"); if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem("smc_sid", sid); } } catch { /* ignore */ }
    const body: Record<string, unknown> = { v: 1, sid: sid || crypto.randomUUID(), a: angle, e: ev };
    if (ev === "step") body.s = step;
    navigator.sendBeacon(API_BASE + "/beacon", new Blob([JSON.stringify(body)], { type: "text/plain;charset=UTF-8" }));
  } catch { /* never break the page */ }
}
