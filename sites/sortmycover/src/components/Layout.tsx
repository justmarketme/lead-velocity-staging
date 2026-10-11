import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Wordmark } from "./Brand";
import { Footer } from "./Footer";
import { BOOK_COVER, BOOK_LABEL, BOOK_WILLS, COST_LINE, WILLS_BOOK_LABEL } from "@/lib/site";

/** Header and sticky-bar booking button: the will call inside the wills section, the cover adviser call in the cover section. */
function useBookTarget(): [string, string] {
  const { pathname } = useLocation();
  if (pathname.startsWith("/wills/")) return [BOOK_WILLS, WILLS_BOOK_LABEL];
  if (pathname.startsWith("/cover/")) return [BOOK_COVER, BOOK_LABEL];
  return ["/book/", BOOK_LABEL];
}

/** Desktop nav shows from xl (1280px): seven items do not fit next to the wordmark and the button below that; the menu takes over. */
const NAV: [string, string][] = [["Cover types", "/cover/"], ["Wills & estate", "/wills/"], ["How it works", "/how-it-works/"], ["How we make money", "/how-we-make-money/"], ["Learn", "/learn/"], ["About", "/about/"], ["Contact", "/contact/"]];
/** Static legal pages load no Motion at all. */
const NO_MOTION = /^\/(privacy|terms|paia)\//;
/** Home (spec D.1: no sticky bar), the booking form, and the legal pages: no sticky bar. */
const NO_STICKY = /^\/$|^\/(book|privacy|terms|paia)\//;

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) { document.getElementById(hash.slice(1))?.scrollIntoView(); return; }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

/** Loads Motion on demand (separate chunk) and attaches spring hover/press feedback to buttons and cards. */
function Enhance() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (NO_MOTION.test(pathname)) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // reduced motion: the Motion chunk is not even requested by the layout
    let off = () => {};
    let dead = false;
    import("@/lib/motion").then((m) => { if (!dead) off = m.springGestures(document, ".btn, .card-link"); });
    return () => { dead = true; off(); };
  }, [pathname]);
  return null;
}

/** (f) Sticky "Book my adviser call" bar. Appears via an inView sentinel once the visitor is past the hero; hides again at the footer. */
function StickyCta() {
  const { pathname } = useLocation();
  const [past, setPast] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const enabled = !NO_STICKY.test(pathname);
  useEffect(() => {
    if (!enabled || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    // native IntersectionObserver: no Motion needed to decide when the bar shows
    const watch = (el: Element, cb: (visible: boolean) => void) => { const io = new IntersectionObserver((es) => cb(es[es.length - 1].isIntersecting)); io.observe(el); return () => io.disconnect(); };
    const a = watch(sentinel.current, (visible) => setPast(!visible && window.scrollY > 0));
    const f = document.querySelector("[data-footer]");
    const b = f ? watch(f, setAtFooter) : () => {};
    return () => { a(); b(); setPast(false); setAtFooter(false); };
  }, [pathname, enabled]);
  const show = enabled && past && !atFooter;
  const [bookTo, bookLabel] = useBookTarget();
  useEffect(() => {
    if (!show || !bar.current) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // shown at once, no animation
    import("@/lib/motion").then((m) => bar.current && m.slideIn(bar.current));
  }, [show]);
  if (!enabled) return null;
  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="absolute left-0 top-[560px] h-px w-px pointer-events-none" />
      {show && (
        <div ref={bar} className="sticky-bar" role="region" aria-label="Book a call">
          <div className="wrap flex items-center justify-between gap-3">
            <small className="hidden sm:block">{COST_LINE} 30 minutes, at a time you pick.</small>
            <Link to={bookTo} className="btn btn-sm">{bookLabel}</Link>
          </div>
        </div>
      )}
    </>
  );
}

export function Header() {
  const [bookTo, bookLabel] = useBookTarget();
  return (
    <header className="site-header">
      <div className="wrap bar relative">
        <Wordmark />
        <nav aria-label="Main" className="hidden xl:flex items-center gap-0.5">
          {NAV.map(([t, p]) => <NavLink key={p} to={p} className="nav-link">{t}</NavLink>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link to={bookTo} className="btn btn-sm">{bookLabel}</Link>
          {/* Mobile menu: native <details>, works without JavaScript */}
          <details className="menu xl:hidden">
            <summary aria-label="Menu">Menu</summary>
            <nav aria-label="Main (mobile)" className="menu-panel">
              {NAV.map(([t, p]) => <Link key={p} to={p} className="nav-link">{t}</Link>)}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <ScrollToTop />
      <Enhance />
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
      <StickyCta />
    </div>
  );
}
