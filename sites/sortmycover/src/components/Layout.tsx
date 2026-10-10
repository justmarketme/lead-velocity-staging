import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Wordmark } from "./Brand";
import { Footer } from "./Footer";
import { BOOK_LABEL, COST_LINE } from "@/lib/site";

const NAV: [string, string][] = [["How it works", "/how-it-works/"], ["How we make money", "/how-we-make-money/"], ["Learn", "/learn/"], ["About", "/about/"], ["Contact", "/contact/"]];
/** Static legal pages load no Motion at all. */
const NO_MOTION = /^\/(privacy|terms|paia)\//;
/** Pages that already are the booking form, or confirm one: no sticky bar. */
const NO_STICKY = /^\/(book|privacy|terms|paia)\//;

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
    if (!enabled || !sentinel.current) return;
    let off = () => {};
    let dead = false;
    import("@/lib/motion").then((m) => {
      if (dead || !sentinel.current) return;
      const a = m.watchPastSentinel(sentinel.current, setPast);
      const f = document.querySelector("[data-footer]");
      const b = f ? m.watchInView(f, setAtFooter) : () => {};
      off = () => { a(); b(); };
    });
    return () => { dead = true; off(); setPast(false); setAtFooter(false); };
  }, [pathname, enabled]);
  const show = enabled && past && !atFooter;
  useEffect(() => {
    if (show && bar.current) import("@/lib/motion").then((m) => bar.current && m.slideIn(bar.current));
  }, [show]);
  if (!enabled) return null;
  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="absolute left-0 top-[560px] h-px w-px pointer-events-none" />
      {show && (
        <div ref={bar} className="sticky-bar" role="region" aria-label="Book a call">
          <div className="wrap flex items-center justify-between gap-3">
            <small className="hidden sm:block">{COST_LINE} 30 minutes, at a time you pick.</small>
            <Link to="/book/" className="btn btn-sm">{BOOK_LABEL}</Link>
          </div>
        </div>
      )}
    </>
  );
}

export function Header() {
  return (
    <header className="site-header">
      <div className="wrap bar relative">
        <Wordmark />
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
          {NAV.map(([t, p]) => <NavLink key={p} to={p} className="nav-link">{t}</NavLink>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/book/" className="btn btn-sm">{BOOK_LABEL}</Link>
          {/* Mobile menu: native <details>, works without JavaScript */}
          <details className="menu lg:hidden">
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
