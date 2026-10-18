/* First-party visit beacon to n8n (site.n8n_base + site.api_prefix). Since 17 Oct 2026 the site has no booking form: every
   booking goes through WhatsApp (Lindi, W07), so the beacon is the only call the site makes to n8n. */
import { API_BASE } from "./site";

/* First-party visit beacon (I-32b): page views and quiz steps reached, per angle. No cookie, no IP, no fingerprint: an anonymous
   random id in sessionStorage only. Off with DNT / Global Privacy Control / the opt-out cookie. Never sends answers, name, phone or email. */
const sent: Record<string, 1> = {};
export function beacon(angle: string, ev: "view" | "step" | "wa" | "start", step?: number, off: () => boolean = () => false) {
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
    if (ev === "view") {
      // spec G.5: the referrer HOST only (no path, no query) and the utm_source VALUE only, cut to 40 characters, so n8n can bucket AI-assistant referrals
      try { const h = document.referrer ? new URL(document.referrer).hostname : ""; if (h) body.ref_host = h.slice(0, 80); } catch { /* ignore */ }
      try { const u = new URLSearchParams(location.search).get("utm_source"); if (u) body.utm_source = u.slice(0, 40); } catch { /* ignore */ }
    }
    navigator.sendBeacon(API_BASE + "/beacon", new Blob([JSON.stringify(body)], { type: "text/plain;charset=UTF-8" }));
  } catch { /* never break the page */ }
}
