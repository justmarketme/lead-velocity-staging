/* First-party RUM beacon (spec J.4, task B-10): LCP, CLS, INP, tap-to-submit time and an in-app-browser flag, posted once when the page is
   hidden, as a text/plain sendBeacon to n8n (no preflight, no cookie, no identifier). CrUX and Search Console do not see Meta in-app
   browsers, which is where the paid traffic lives. Off with Do Not Track, Global Privacy Control or the ad-measurement opt-out.
   NOTE: the n8n beacon sub-workflow currently accepts e = "view" | "step"; it must be extended to accept e = "rum". */
import { API_BASE } from "./site";
import { beaconOff } from "./pixel";

export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(ua);
}

export interface RumPayload { v: 1; e: "rum"; a: string; p: string; lcp?: number; cls?: number; inp?: number; tts?: number; inapp: boolean }

export function buildRum(i: { angle: string; path: string; lcp?: number; cls?: number; inp?: number; tts?: number; ua: string }): RumPayload {
  const r = (n?: number) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);
  return { v: 1, e: "rum", a: i.angle, p: i.path, lcp: r(i.lcp), cls: r(i.cls), inp: r(i.inp), tts: r(i.tts), inapp: isInAppBrowser(i.ua) };
}

export function startRum(angle: string) {
  try {
    if (typeof PerformanceObserver === "undefined" || !navigator.sendBeacon || beaconOff()) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    let lcp: number | undefined, cls = 0, inp: number | undefined, sent = false;
    const obs = (type: string, cb: (list: PerformanceEntryList) => void, extra: object = {}) => { try { new PerformanceObserver((l) => cb(l.getEntries())).observe({ type, buffered: true, ...extra } as PerformanceObserverInit); } catch { /* unsupported */ } };
    obs("largest-contentful-paint", (es) => { const e = es[es.length - 1] as PerformanceEntry & { startTime: number }; if (e) lcp = e.startTime; });
    obs("layout-shift", (es) => es.forEach((e) => { const l = e as PerformanceEntry & { value: number; hadRecentInput: boolean }; if (!l.hadRecentInput) cls += l.value; }));
    obs("event", (es) => es.forEach((e) => { if (e.duration > (inp ?? 0)) inp = e.duration; }), { durationThreshold: 40 });
    const t0 = performance.now();
    let tts: number | undefined;
    document.addEventListener("submit", () => { tts = (performance.now() - t0) / 1000; }, { capture: true });
    const send = () => {
      if (sent || document.visibilityState !== "hidden") return;
      sent = true;
      const body = buildRum({ angle, path: location.pathname, lcp, cls, inp, tts, ua: navigator.userAgent });
      navigator.sendBeacon(API_BASE + "/beacon", new Blob([JSON.stringify(body)], { type: "text/plain;charset=UTF-8" }));
    };
    document.addEventListener("visibilitychange", send);
    addEventListener("pagehide", () => { sent = false; send(); });
  } catch { /* never break the page */ }
}
