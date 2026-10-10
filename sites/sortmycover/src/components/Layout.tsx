import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Wordmark } from "./Brand";
import { Footer } from "./Footer";
import { BOOK_LABEL } from "@/lib/site";

const NAV: [string, string][] = [["How it works", "/how-it-works/"], ["How we make money", "/how-we-make-money/"], ["Learn", "/learn/"], ["About", "/about/"], ["Contact", "/contact/"]];

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) { document.getElementById(hash.slice(1))?.scrollIntoView(); return; }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
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
    <>
      <ScrollToTop />
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
    </>
  );
}
