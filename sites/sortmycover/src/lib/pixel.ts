/* SortMyCover Meta Pixel module. Ported from landing/shared/pixel.js and rebuilt as opt-in:
 *  - nothing from Meta loads, and no _fbp/_fbc is read or built, until the visitor gives the separate optional consent
 *    (spec DEC-4, rule S22). The choice is a cookie on .sortmycover.co.za so it follows the visitor across campaign hosts.
 *  - one event_id per event (browser Pixel and server CAPI dedupe on it); the context is POSTed to /lead and /book.
 *  - name, phone and email never reach the Pixel; autoConfig is off so no form field is hashed in the browser.
 *  - Global Privacy Control / an opt-out cookie always wins over a stored consent. */
import { site } from "./site";

export const COOKIE_OK = "smc_ads_ok";
export const COOKIE_OFF = "smc_ads_off";
const ATTR_KEY = "smc_attr";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "cid", "asid", "adid"];
export const EVENTS = ["PageView", "ViewContent", "Lead", "Schedule", "Contact"] as const;
export type EventName = (typeof EVENTS)[number];
const PII = /^(fn|ln|em|ph|name|first_?name|last_?name|phone|mobile|email|msisdn)$/i;

export interface TrackContext {
  event_id: string;
  event_name?: string;
  fbp: string | null;
  fbc: string | null;
  utm: Record<string, string>;
  fbclid: string | null;
  page_url: string;
  user_agent: string;
  ts: number;
}

/* ---------- pure helpers (unit tested) ---------- */
export function cookieDomainFor(host: string, cookieDomain: string): string | null {
  const h = host.toLowerCase();
  return h === cookieDomain || h.endsWith("." + cookieDomain) ? cookieDomain : null;
}
export function cookieString(name: string, value: string, opts: { host: string; days: number; secure: boolean; cookieDomain?: string }): string {
  const dom = cookieDomainFor(opts.host, opts.cookieDomain || site.cookie_domain);
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", `Max-Age=${Math.round(opts.days * 86400)}`, "SameSite=Lax"];
  if (dom) parts.push(`Domain=${dom}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
export function expireString(name: string, opts: { host: string; secure: boolean; cookieDomain?: string }): string {
  return cookieString(name, "", { ...opts, days: 0 }) + "; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
}
export function buildFbc(fbclid: string, ts: number): string {
  return `fb.1.${ts}.${fbclid}`;
}
export function stripPii(p?: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  Object.keys(p || {}).forEach((k) => { if (!PII.test(k)) o[k] = (p as Record<string, unknown>)[k]; });
  return o;
}
/** Consent decision from raw inputs. Opt-out and GPC always win. */
export function consentDecision(i: { ok: string | null; off: string | null; gpc: boolean }): boolean {
  return i.ok === "1" && i.off !== "1" && !i.gpc;
}

/* ---------- browser side ---------- */
type PixelWindow = Window & { fbq?: any; _fbq?: any };
const w = (): PixelWindow | null => (typeof window === "undefined" ? null : (window as PixelWindow));
function readCookie(n: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  try { document.cookie = cookieString(name, value, { host: location.hostname, days, secure: location.protocol === "https:" }); } catch { /* blocked */ }
}
function dropCookie(name: string) {
  if (typeof document === "undefined") return;
  try { document.cookie = expireString(name, { host: location.hostname, secure: location.protocol === "https:" }); } catch { /* blocked */ }
}
function store(k: string, v: string) { try { localStorage.setItem(k, v); } catch { try { sessionStorage.setItem(k, v); } catch { /* none */ } } }
function fetchStored(k: string): string | null { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch { return null; } }

export function hasConsent(): boolean {
  const win = w();
  if (!win) return false;
  const gpc = (win.navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  return consentDecision({ ok: readCookie(COOKIE_OK), off: readCookie(COOKIE_OFF), gpc });
}
export function isOptedOut(): boolean { return readCookie(COOKIE_OFF) === "1"; }
/** Used by the first-party beacon: no beacon when the visitor opted out. */
export function beaconOff(): boolean { return isOptedOut(); }

export function uuid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.random() * 256;
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.prototype.map.call(b, (x: number) => (x + 256).toString(16).slice(1)).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface Attr { utm?: Record<string, string>; fbclid?: string; fbclid_ts?: number }
/** First-party attribution (utm_*, fbclid) so the lead record keeps its source. Not a Meta cookie; stored regardless of ad consent. */
export function attribution(): Attr {
  const win = w();
  if (!win) return {};
  let saved: Attr = {};
  try { saved = JSON.parse(fetchStored(ATTR_KEY) || "{}"); } catch { /* ignore */ }
  saved.utm = saved.utm || {};
  const q = new URLSearchParams(win.location.search);
  let changed = false;
  UTM_KEYS.forEach((k) => { const v = q.get(k); if (v) { saved.utm![k] = v; changed = true; } });
  const f = q.get("fbclid");
  if (f && f !== saved.fbclid) { saved.fbclid = f; saved.fbclid_ts = Date.now(); changed = true; }
  if (changed) store(ATTR_KEY, JSON.stringify(saved));
  return saved;
}

let pixelId: string | null = null;
let booted = false;
function init(): boolean {
  const win = w();
  if (!win) return false;
  if (!booted) { booted = true; pixelId = (document.querySelector('meta[name="smc-pixel-id"]') as HTMLMetaElement | null)?.content || site.pixel_id || null; }
  if (!pixelId || !hasConsent()) return false;
  if (win.fbq) return true;
  const n: any = (win.fbq = function (...a: unknown[]) { n.callMethod ? n.callMethod.apply(n, a) : n.queue.push(a); });
  if (!win._fbq) win._fbq = n;
  n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  const s = document.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  win.fbq("set", "autoConfig", false, pixelId);
  win.fbq("init", pixelId);
  return true;
}

function context(eventId?: string): TrackContext {
  const win = w()!;
  const a = attribution();
  const ok = hasConsent();
  let fbc: string | null = null;
  if (ok) {
    fbc = readCookie("_fbc");
    if (!fbc && a.fbclid) { fbc = buildFbc(a.fbclid, a.fbclid_ts || Date.now()); writeCookie("_fbc", fbc, 90); }
  }
  return {
    event_id: eventId || uuid(),
    fbp: ok ? readCookie("_fbp") : null,
    fbc,
    utm: a.utm || {},
    fbclid: a.fbclid || null,
    page_url: win.location.origin + win.location.pathname, // no query string: utm and fbclid travel in their own fields
    user_agent: win.navigator.userAgent,
    ts: Math.floor(Date.now() / 1000),
  };
}

/** Fires the browser event (only with consent) and returns the context to POST with the form. Always returns a context so server-side dedupe works. */
export function track(name: EventName, params?: Record<string, unknown>): TrackContext {
  const win = w();
  const ctx = context();
  ctx.event_name = name;
  if (win && init() && win.fbq) win.fbq("track", name, stripPii(params), { eventID: ctx.event_id });
  return ctx;
}
/** Two-step variant: ctx = prepare('Schedule'); POST ctx with the booking; fire(ctx) only when the booking succeeded. */
export function prepare(name: EventName): TrackContext { const c = context(); c.event_name = name; return c; }
export function fire(ctx: TrackContext, params?: Record<string, unknown>) {
  const win = w();
  if (win && ctx.event_name && init() && win.fbq) win.fbq("track", ctx.event_name, stripPii(params), { eventID: ctx.event_id });
}

/** The visitor gave the separate optional consent: remember it domain-wide for 180 days, load the Pixel, send PageView. */
export function grantAds() {
  dropCookie(COOKIE_OFF);
  writeCookie(COOKIE_OK, "1", 180);
  if (init()) w()!.fbq("track", "PageView", {}, { eventID: uuid() });
}
/** Opt out (privacy page) or withdraw: stop the Pixel, forget the consent, remember the opt-out for a year. */
export function adsOff() {
  writeCookie(COOKIE_OFF, "1", 365);
  dropCookie(COOKIE_OK);
  try { localStorage.removeItem("smc_ads_off"); } catch { /* ignore */ }
  const win = w();
  try { if (win && win.fbq) win.fbq("consent", "revoke"); } catch { /* ignore */ }
}
/** Undo an opt-out. It does NOT switch the Pixel on: that still needs the separate optional consent. */
export function adsOn() { dropCookie(COOKIE_OFF); }

/** Page-load hook: if the visitor gave consent on an earlier visit, load the Pixel and send PageView. Otherwise nothing from Meta loads. */
export function bootPixel() {
  attribution();
  if (init()) w()!.fbq("track", "PageView", {}, { eventID: uuid() });
}
