/* WhatsApp chat widget (Jono, 17 Oct 2026). The launcher sits bottom right on every page; any WhatsApp CTA opens it with that
   CTA's context. Deliberately plain (Jono: "a typical thing where they click to accept", nothing to read): one required consent
   checkbox with a one-line summary and the full approved wording one click away (CONSENT-GENERIC-v5web), one optional unticked
   ad-measurement checkbox (CONSENT-ADS-v2web, the Pixel loads only when ticked), and the button. Rendered closed on the server;
   nothing here hides content or a disclosure. */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CHAT_EVENT, CONSENT_TEXT, WA_LABEL, openChat, sourceTag, startHref, waHref, type ChatContext } from "@/lib/whatsapp";
import { APEX, consentCfg, provider } from "@/lib/site";
import { attribution, grantAds, hasConsent, track } from "@/lib/pixel";

/** WhatsApp glyph (Simple Icons, CC0). */
export function WaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** A WhatsApp call to action. With JavaScript it opens the widget (consent first); without, it links straight to WhatsApp
    (the prefilled opener carries the consent statement in the person's own words). */
export function WhatsAppCta({ ctx, className = "btn", children }: { ctx: ChatContext; className?: string; children?: ReactNode }) {
  return (
    <a href={waHref(ctx)} className={`${className} btn-wa`} onClick={(e) => { e.preventDefault(); openChat(ctx); }}>
      <WaIcon size={18} />{children ?? WA_LABEL}
    </a>
  );
}

/** Desktop only (hidden on touch screens and narrow windows): pick a time on SortMyCover's own /start/ page. Phones stay
    WhatsApp-first. `via` (where the visitor came from) is added at click time, so server and client render the same HTML.
    Not on will CTAs: /start/ has no times for a will, it only hands over to WhatsApp, so the button promised what it did not do. */
export function StartCta({ ctx, className = "btn btn-secondary", children }: { ctx: ChatContext; className?: string; children?: ReactNode }) {
  if (ctx.wills) return null;
  return (
    <a href={startHref(ctx)} className={`${className} desk-only`} onClick={(e) => { try { e.currentTarget.href = startHref(ctx, sourceTag(attribution(), document.referrer)); } catch { /* keep the plain link */ } }}>
      {children ?? "Pick a time"}
    </a>
  );
}

/** What can have opened the panel (and take focus back when it closes). */
const OPENER = "a[href], button, summary, [role=tab]";

export default function ChatWidget({ base }: { base: ChatContext }) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  /* the consent names who gets the details (an adviser or a will consultant): a tick counts only for the recipient it was given
     for, so the panel reopened by the other kind of CTA shows the box unticked */
  const [agreedFor, setAgreedFor] = useState<"adviser" | "wills" | null>(null);
  const [ads, setAds] = useState(false);
  const [adsBefore, setAdsBefore] = useState(false);
  const [nudge, setNudge] = useState(false);
  /* Phones: the launcher waits until the visitor has scrolled half a screen (the header's WhatsApp button is in view at the top),
     so on the first screen it does not sit over text such as a guide's short answer. Once the panel has been opened it stays. */
  const [atTop, setAtTop] = useState(true);
  const [used, setUsed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const inerted = useRef<Element[]>([]);
  const hid = useId();
  const c = ctx ?? base;
  const recipient = c.wills ? "wills" : "adviser";
  const agreed = agreedFor === recipient;
  const { pathname } = useLocation();

  const release = useCallback(() => { for (const el of inerted.current) el.removeAttribute("inert"); inerted.current = []; }, []);
  const show = useCallback((next: ChatContext | null) => {
    // what opened the panel gets focus back on close; a CTA tapped while focus is inside the panel keeps the first opener.
    // Only a control counts: Safari and iOS do not focus a tapped link or button, so focus is still wherever the page put it
    // (<body>, <main> after a page change, a heading after an "On this page" tap), and that is not what opened the panel.
    const a = document.activeElement as HTMLElement | null;
    if (!panel.current?.contains(a)) opener.current = a?.matches(OPENER) ? a : null;
    setCtx(next); setNudge(false); setOpen(true); setUsed(true);
  }, []);
  const hide = useCallback(() => {
    release(); // first: an opener inside an inert page cannot take focus
    setOpen(false);
    // no opener (see show) or one that has gone or is hidden (it refuses focus): the launcher. preventScroll: closing does not
    // pull the page back to the CTA.
    const o = opener.current;
    opener.current = null;
    if (o) o.focus({ preventScroll: true });
    if (!o || document.activeElement !== o) launcher.current?.focus();
  }, [release]);

  useEffect(() => {
    const on = () => setAtTop(window.scrollY < window.innerHeight / 2);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    const on = (e: Event) => show((e as CustomEvent<ChatContext>).detail ?? null);
    window.addEventListener(CHAT_EVENT, on);
    return () => window.removeEventListener(CHAT_EVENT, on);
  }, [show]);
  // a new page: back to that page's context, closed (keyed on the path: two pages can share a context; a #hash jump is no new page)
  // Back on a phone with the panel open: Layout has already tried to focus <main> while it was still inert (refused), so release
  // the page here and finish that move
  useEffect(() => {
    if (inerted.current.length) { release(); document.getElementById("main")?.focus({ preventScroll: true }); }
    setCtx(null); setOpen(false);
  }, [pathname, release]);
  /* Phones: the open panel and its scrim cover the page, so the skip link, header, main and footer are inert while it is open (a screen reader
     or keyboard cannot leave the consent panel into the dimmed page). Wider screens: the panel is not modal, the page stays live. */
  useEffect(() => {
    if (!open || !window.matchMedia) return;
    const phone = window.matchMedia("(max-width: 640px)");
    const apply = () => {
      release();
      if (!phone.matches) return;
      inerted.current = [...document.querySelectorAll(".skip, .site-header, #main, .site-footer")].filter((el) => !el.hasAttribute("inert"));
      for (const el of inerted.current) el.setAttribute("inert", "");
    };
    apply();
    phone.addEventListener?.("change", apply);
    return () => { phone.removeEventListener?.("change", apply); release(); };
  }, [open, release]);
  useEffect(() => {
    if (!open) return;
    setAdsBefore(hasConsent());
    close.current?.focus();
    if (panel.current && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      const el = panel.current;
      import("@/lib/motion").then((m) => m.popIn(el));
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, hide]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!agreed) { e.preventDefault(); setNudge(true); return; }
    // the opener names where the visitor came from (ad, post, search); set at tap time so server and client render the same HTML
    try { e.currentTarget.href = waHref(c, sourceTag(attribution(), document.referrer)); } catch { /* keep the plain opener */ }
    if (ads) grantAds(); // loads the Pixel (only when site.pixel_id is set) and sends PageView
    track("Contact", { content_name: c.ref }); // no-op unless the Pixel is loaded, i.e. only with the optional consent
  };

  const who = c.wills ? "a will consultant" : "one authorised adviser";
  return (
    <div className="chat" data-chat data-rest={atTop && !used ? "" : undefined}>
      {/* phones: dims the page behind the panel; a tap on it closes the panel like the close button (hidden on wider screens) */}
      {open && <div className="chat-backdrop" aria-hidden="true" onClick={hide} />}
      {open && (
        <div ref={panel} id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby={hid}>
          <div className="chat-top">
            <p id={hid} className="chat-title">Continue on WhatsApp</p>
            <button ref={close} type="button" className="chat-x" aria-label="Close" onClick={hide}>×</button>
          </div>
          <label className={"chat-check" + (nudge && !agreed ? " is-missing" : "")}>
            <input type="checkbox" checked={agreed} onChange={(e) => { setAgreedFor(e.target.checked ? recipient : null); setNudge(false); }} />
            <span>I agree that SortMyCover may message me on WhatsApp about my call and share my details with {who}. I am 18 or older.</span>
          </label>
          <details className="chat-more"><summary>Full wording</summary><p>{CONSENT_TEXT} <a href={APEX + "/privacy/"} target="_blank" rel="noopener">Privacy notice</a></p></details>
          {!adsBefore && (
            <>
              <label className="chat-check chat-check-opt">
                <input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} />
                <span>Optional: let SortMyCover measure its Facebook and Instagram ads with my details in coded form.</span>
              </label>
              <details className="chat-more"><summary>Full wording</summary><p>{consentCfg.ads.text}</p></details>
            </>
          )}
          {nudge && !agreed && <p className="chat-err" role="alert">Tick the first box to continue.</p>}
          <a className="btn btn-wa chat-go" href={waHref(c)} target="_blank" rel="noopener noreferrer" aria-disabled={!agreed} onClick={go}>
            <WaIcon size={18} />Open WhatsApp
          </a>
          <p className="chat-fine">Lindi, our automated assistant, replies. Ask for a person any time, or reply STOP to stop.</p>
        </div>
      )}
      <button ref={launcher} type="button" className="chat-launch" aria-expanded={open} aria-controls="chat-panel" onClick={() => (open ? hide() : show(null))}>
        <WaIcon size={26} /><span className="chat-launch-label">Chat on WhatsApp</span>
      </button>
    </div>
  );
}
