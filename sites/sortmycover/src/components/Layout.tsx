import { useEffect, useRef, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import ChatWidget, { WhatsAppCta } from "./ChatWidget";
import { contextFor } from "@/lib/whatsapp";
import { Wordmark } from "./Brand";
import { Footer } from "./Footer";
import { ReadProgress } from "./Interactive";

/** Desktop nav shows from xl (1280px): seven items do not fit next to the wordmark and the button below that; the menu takes over. */
const NAV: [string, string][] = [["Cover types", "/cover/"], ["Wills & estate", "/wills/"], ["How it works", "/how-it-works/"], ["Learn", "/learn/"], ["About", "/about/"], ["Contact", "/contact/"]];
/** Static legal pages load no Motion at all. */
const NO_MOTION = /^\/(privacy|terms|paia)\//;

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    // first load: the browser already placed the pre-rendered page; resetting here would yank a reader who started scrolling
    // before the app finished loading back to the top
    if (first.current) { first.current = false; return; }
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
    // cards and in-page buttons get tilt / magnetic / press from pageMotion; on a mouse the spring stays on header and chat buttons
    const sel = window.matchMedia("(hover: hover) and (pointer: fine)").matches ? ".site-header .btn, .chat-panel .btn" : ".btn";
    import("@/lib/motion").then((m) => { if (!dead) off = m.springGestures(document, sel); });
    return () => { dead = true; off(); };
  }, [pathname]);
  return null;
}

/** Inner-page motion (src/lib/pageMotion.ts): loaded on demand, re-run on every route change. */
function PageMotion() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (NO_MOTION.test(pathname)) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let off = () => {};
    let dead = false;
    const main = document.getElementById("main");
    if (!main) return;
    import("@/lib/pageMotion").then((m) => { if (!dead) off = m.pageMotion(main); });
    return () => { dead = true; off(); };
  }, [pathname]);
  return null;
}

/** The yellow reading-progress bar follows the scroll on every inner page. */
function Progress() {
  const { pathname } = useLocation();
  if (pathname === "/" || NO_MOTION.test(pathname)) return null;
  return <ReadProgress key={pathname} />;
}

/** Mobile menu: a native <details>, so it works without JavaScript. The header stays mounted across client-side navigation,
    so the open state would survive a route change: close it on every route change, on a tap on any of its links (the current
    page included), on Escape and on a tap outside it. */
function MobileMenu() {
  const menu = useRef<HTMLDetailsElement>(null);
  const { pathname, hash } = useLocation();
  const close = () => { if (menu.current) menu.current.open = false; };
  useEffect(close, [pathname, hash]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !menu.current?.open) return;
      close();
      menu.current.querySelector("summary")?.focus();
    };
    const onDown = (e: PointerEvent) => { if (menu.current?.open && !menu.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, []);
  return (
    <details ref={menu} className="menu xl:hidden">
      <summary aria-label="Menu">Menu</summary>
      <nav aria-label="Main (mobile)" className="menu-panel">
        {NAV.map(([t, p]) => <Link key={p} to={p} className="nav-link" onClick={close}>{t}</Link>)}
      </nav>
    </details>
  );
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
          {/* one label element: the button's flex gap would otherwise split "Chat on" from "WhatsApp" */}
          <WhatsAppCta ctx={ctx} className="btn btn-sm"><span><span className="hidden sm:inline">Chat on&nbsp;</span>WhatsApp</span></WhatsAppCta>
          <MobileMenu />
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
      <PageMotion />
      <Progress />
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
      <ChatWidget base={ctx} />
    </div>
  );
}
