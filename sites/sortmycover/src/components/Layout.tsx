import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import ChatWidget, { WhatsAppCta } from "./ChatWidget";
import { contextFor } from "@/lib/whatsapp";
import { Wordmark } from "./Brand";
import { Footer } from "./Footer";

/** Desktop nav shows from xl (1280px): seven items do not fit next to the wordmark and the button below that; the menu takes over. */
const NAV: [string, string][] = [["Cover types", "/cover/"], ["Wills & estate", "/wills/"], ["How it works", "/how-it-works/"], ["How we make money", "/how-we-make-money/"], ["Learn", "/learn/"], ["About", "/about/"], ["Contact", "/contact/"]];
/** Static legal pages load no Motion at all. */
const NO_MOTION = /^\/(privacy|terms|paia)\//;

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

export function Header() {
  const ctx = contextFor(useLocation().pathname);
  return (
    <header className="site-header">
      <div className="wrap bar relative">
        <Wordmark />
        <nav aria-label="Main" className="hidden xl:flex items-center gap-0.5">
          {NAV.map(([t, p]) => <NavLink key={p} to={p} className="nav-link">{t}</NavLink>)}
        </nav>
        <div className="flex items-center gap-2">
          <WhatsAppCta ctx={ctx} className="btn btn-sm"><span className="hidden sm:inline">Chat on&nbsp;</span>WhatsApp</WhatsAppCta>
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
  const ctx = contextFor(useLocation().pathname);
  return (
    <div className="site">
      <ScrollToTop />
      <Enhance />
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
      <ChatWidget base={ctx} />
    </div>
  );
}
