/**
 * SortMyCover broker portal shell (ux-sprint-1, crm-ux-synthesis R6). One SortMyCover header, no Lead Velocity chrome:
 *   phone (< 1024 px): sticky header that shrinks on scroll + 4 bottom tabs (Today · Leads · Reports · More), 48 px targets;
 *   desktop: the same header + a left sidebar with every page.
 * The legacy BrokerLayout (INV-P11) is only used for the "not a SortMyCover adviser" fallback.
 * Data isolation: brokers.user_id = auth.uid(), enforced by RLS server-side (INV-A06, smc_05/07).
 */
import { createContext, type CSSProperties, ReactNode, useContext, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import BrokerLayout from "@/components/broker/BrokerLayout";
import "../../../brand/tokens.css";
import "./portal.css";
import wordmark from "../../../brand/logo/wordmark-offwhite.svg";
import { supabase } from "@/integrations/supabase/client";
import { progressSummary, useCurrentBroker } from "@/lib/smc";
import { groupMeetings, useFlushMarksOnLeave, useMeetings } from "@/lib/smcPortal";
import type { SmcBroker } from "@/integrations/supabase/smc-types";

const ONBOARDING = ["onboarding", "onboarded", "ready_for_go_live", "invited", "prospect"];
// eslint-disable-next-line react-refresh/only-export-components
export const isOnboarding = (b: SmcBroker) => ONBOARDING.includes(String(b.status));

/** Every page, for the desktop sidebar and the phone "More" tab. */
// eslint-disable-next-line react-refresh/only-export-components
export const PAGES = [
  { to: "/broker/today", label: "Today" },
  { to: "/broker/leads", label: "My leads" },
  { to: "/broker/reports", label: "Reports" },
  { to: "/broker/calendar", label: "Calendar and hours" },
  { to: "/broker/profile", label: "Profile" },
  { to: "/broker/intro-card", label: "Intro card" },
  { to: "/broker/intro-media", label: "Voice note and video" },
  { to: "/broker/agreement", label: "Agreement and billing" },
  { to: "/broker/help", label: "Help" },
  { to: "/broker/start", label: "Start here" },
];
const MORE = ["/broker/more", "/broker/calendar", "/broker/profile", "/broker/intro-card", "/broker/intro-media", "/broker/agreement", "/broker/billing", "/broker/help"];

/** WCAG AA: the CRM --primary (280 90% 60%) gives 4.17:1 with white; scoped darker value for SMC surfaces only (axe 2026-10-03). */
const A11Y_PRIMARY = { "--primary": "280 90% 45%" } as CSSProperties;

interface Ctx { broker: SmcBroker; userId: string; reload: () => Promise<SmcBroker | null> }
const PortalCtx = createContext<Ctx | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export function usePortal(): Ctx {
  const c = useContext(PortalCtx);
  if (!c) throw new Error("usePortal outside PortalShell");
  return c;
}

// eslint-disable-next-line react-refresh/only-export-components
export async function logOut(nav: (to: string) => void) {
  await supabase.auth.signOut();
  nav("/broker");
}

interface Props { title: string | ((b: SmcBroker) => string); children: ReactNode; wide?: boolean; progress?: boolean; back?: { to: string; label: string } }

function Skeleton() {
  return (
    <div className="smc-portal smc-shell" style={A11Y_PRIMARY} aria-busy="true">
      <div className="app"><header className="top"><img className="wm" src={wordmark} alt="SortMyCover" /><div className="sk" style={{ width: 160, height: 22, marginTop: 6 }} /></header>
        <main className="main" aria-label="Loading">{[120, 180, 90].map((h, i) => <div key={i} className="card sk-card" style={{ height: h }} />)}</main></div>
    </div>
  );
}

function NeedsYou({ brokerId }: { brokerId: string }) {
  const { data } = useMeetings(brokerId);
  const g = groupMeetings(data);
  const n = g.needsCount + g.notReached.length;
  if (!n) return null;
  return <Link className="needs" to="/broker/today#needs">{n} need{n === 1 ? "s" : ""} you</Link>;
}

export default function PortalShell({ title, children, wide, progress, back }: Props) {
  const { broker, userId, loading, error, reload } = useCurrentBroker({ heartbeat: true });
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [small, setSmall] = useState(false);
  useFlushMarksOnLeave();
  useEffect(() => {
    const on = () => setSmall(window.scrollY > 24);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  if (loading) return <Skeleton />;
  if (!userId) return <Navigate to="/broker" replace />;
  if (!broker || !broker.brand_id) {
    return (
      <BrokerLayout>
        <div className="smc-portal"><div className="app"><main className="main">
          <section className="card"><h2>This page is for SortMyCover advisers</h2>
            <p className="muted">{error ? `We could not load your profile: ${error}` : "Your account is not set up for SortMyCover yet."}</p>
            <Link className="btn ghost" to="/broker/dashboard">Go to my dashboard</Link></section>
        </main></div></div>
      </BrokerLayout>
    );
  }
  const p = progressSummary(broker.onboarding_progress);
  const onboarding = isOnboarding(broker);
  const showBar = progress ?? onboarding;
  const practice = broker.firm_name || broker.practice_name || "";
  const home = onboarding ? { to: "/broker/start", label: "Start" } : { to: "/broker/today", label: "Today" };
  const tabs = [home, { to: "/broker/leads", label: "Leads" }, { to: "/broker/reports", label: "Reports" }, { to: "/broker/more", label: "More" }];
  const cur = (to: string) => (to === "/broker/more" ? MORE.some((m) => pathname.startsWith(m)) : pathname.startsWith(to));
  const side = onboarding ? [PAGES[9], ...PAGES.slice(0, 9)] : PAGES;
  return (
    <div className="smc-portal smc-shell" style={A11Y_PRIMARY}>
      <PortalCtx.Provider value={{ broker, userId, reload }}>
        <aside className="side" aria-label="Portal pages">
          <img className="wm" src={wordmark} alt="SortMyCover" />
          <div className="side-who">{practice}</div>
          <nav>{side.map((t) => <Link key={t.to} to={t.to} className={pathname.startsWith(t.to) ? "cur" : ""} aria-current={pathname.startsWith(t.to) ? "page" : undefined}>{t.label}</Link>)}</nav>
          <button type="button" className="side-out" onClick={() => void logOut(nav)}>Log out</button>
        </aside>
        <div className={wide ? "app wide" : "app"}>
          <header className={small ? "top shrunk" : "top"}>
            <div className="top-row">
              <img className="wm" src={wordmark} alt="SortMyCover" />
              <NeedsYou brokerId={broker.id} />
            </div>
            <div className="who">{practice}{broker.fsp_number ? ` · FSP ${broker.fsp_number}` : ""}</div>
            {back && <Link className="back" to={back.to}>‹ {back.label}</Link>}
            <h1>{typeof title === "function" ? title(broker) : title}</h1>
            {showBar && (
              <Link to="/broker/start" className="bar-link" aria-label="Open your setup steps">
                <div className="bar" role="progressbar" aria-label="Onboarding progress" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p.pct}%` }} /></div>
                <div className="bar-l"><span>{p.done} of {p.total} done</span><span>{p.minutesToLive ? `about ${p.minutesToLive} minutes to go live` : "ready for final checks"}</span></div>
              </Link>
            )}
          </header>
          <main className="main">{children}</main>
        </div>
        <nav className="tabs" aria-label="Portal"><div>
          {tabs.map((t) => <Link key={t.to} to={t.to} className={cur(t.to) ? "cur" : ""} aria-current={cur(t.to) ? "page" : undefined}>{t.label}</Link>)}
        </div></nav>
      </PortalCtx.Provider>
    </div>
  );
}

/** "Watch: …" step clip row (Loom/Wistia: help lives on the step). Clips are rendered by Playwright (broker-success). */
export function StepClip({ title, length, file }: { title: string; length: string; file: string }) {
  return (
    <a className="step-clip" href={file} target="_blank" rel="noreferrer">
      <span className="play" /><span>Watch: {title}<small>{length} · captions on</small></span>
    </a>
  );
}
