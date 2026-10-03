/**
 * SortMyCover broker portal shell: the existing BrokerLayout (INV-P11) with the SMC menu, wrapping a .smc-portal surface
 * that uses the SortMyCover kit (brand/tokens.css) exactly like the approved prototypes (portal/prototype/*.html).
 * Data isolation: brokers.user_id = auth.uid() here, enforced by RLS server-side (INV-A06, smc_05/07).
 */
import { createContext, type CSSProperties, ReactNode, useContext } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { BarChart3, Calendar, CreditCard, Database, HelpCircle, IdCard, Mic, Rocket, UserCircle } from "lucide-react";
import BrokerLayout, { type BrokerMenuItem } from "@/components/broker/BrokerLayout";
import "../../../brand/tokens.css";
import "./portal.css";
import { progressSummary, useCurrentBroker } from "@/lib/smc";
import type { SmcBroker } from "@/integrations/supabase/smc-types";

// eslint-disable-next-line react-refresh/only-export-components
export const SMC_MENU: BrokerMenuItem[] = [
  { id: "start", label: "Start here", icon: Rocket, path: "/broker/start" },
  { id: "leads", label: "My leads", icon: Database, path: "/broker/leads" },
  { id: "calendar", label: "Calendar & availability", icon: Calendar, path: "/broker/calendar" },
  { id: "reports", label: "Reports", icon: BarChart3, path: "/broker/reports" },
  { id: "profile", label: "Profile", icon: UserCircle, path: "/broker/profile" },
  { id: "card", label: "Intro card", icon: IdCard, path: "/broker/intro-card" },
  { id: "media", label: "Voice note & video", icon: Mic, path: "/broker/intro-media" },
  { id: "agreement", label: "Agreement & billing", icon: CreditCard, path: "/broker/agreement" },
  { id: "help", label: "Help", icon: HelpCircle, path: "/broker/help" },
];
const TABS = [
  { to: "/broker/start", label: "Start" }, { to: "/broker/leads", label: "My leads" }, { to: "/broker/calendar", label: "Calendar" },
  { to: "/broker/reports", label: "Reports" }, { to: "/broker/help", label: "Help" },
];

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

interface Props { title: string | ((b: SmcBroker) => string); children: ReactNode; wide?: boolean; progress?: boolean }

export default function PortalShell({ title, children, wide, progress }: Props) {
  const { broker, userId, loading, error, reload } = useCurrentBroker({ heartbeat: true });
  const { pathname } = useLocation();

  if (loading) return <BrokerLayout menuItems={SMC_MENU}><div className="smc-portal"><div className="app"><main className="main"><p className="muted">Loading…</p></main></div></div></BrokerLayout>;
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
  const showBar = progress ?? ["onboarding", "onboarded", "ready_for_go_live", "invited"].includes(String(broker.status));
  const practice = broker.firm_name || broker.practice_name || "";
  return (
    <div style={A11Y_PRIMARY}>
    <BrokerLayout menuItems={SMC_MENU}>
      <PortalCtx.Provider value={{ broker, userId, reload }}>
        <div className="smc-portal">
          <div className={wide ? "app wide" : "app"}>
            <header className="top">
              <div className="who">{practice}{broker.fsp_number ? ` · FSP ${broker.fsp_number}` : ""}</div>
              <h1>{typeof title === "function" ? title(broker) : title}</h1>
              {showBar && (
                <>
                  <div className="bar" role="progressbar" aria-label="Onboarding progress" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p.pct}%` }} /></div>
                  <div className="bar-l"><span>{p.done} of {p.total} done</span><span>{p.minutesToLive ? `about ${p.minutesToLive} minutes to go live` : "ready for final checks"}</span></div>
                </>
              )}
            </header>
            <main className="main">{children}</main>
          </div>
          <nav className="tabs" aria-label="Portal"><div>
            {TABS.map((t) => <Link key={t.to} to={t.to} className={pathname.startsWith(t.to) ? "cur" : ""}>{t.label}</Link>)}
          </div></nav>
        </div>
      </PortalCtx.Provider>
    </BrokerLayout>
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
