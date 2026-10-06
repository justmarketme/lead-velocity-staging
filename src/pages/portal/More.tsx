/**
 * "More" tab on phones (ux-sprint-1 R6): every page that is not one of the three main tabs, plus Log out.
 * Also SmcHome: where a SortMyCover broker lands (login, /broker/dashboard, the broker_onb_live button /leads).
 */
import { Link, Navigate, useNavigate } from "react-router-dom";
import PortalShell, { PAGES, isOnboarding, logOut } from "./PortalShell";
import { useCurrentBroker } from "@/lib/smc";

const MAIN = new Set(["/broker/today", "/broker/leads", "/broker/reports"]);

export default function More() {
  const nav = useNavigate();
  return (
    <PortalShell title="More">
      <nav className="card more-list" aria-label="More pages">
        {PAGES.filter((p) => !MAIN.has(p.to)).map((p) => <Link key={p.to} to={p.to}>{p.label}<span aria-hidden="true">›</span></Link>)}
      </nav>
      <button className="btn ghost" type="button" onClick={() => void logOut(nav)}>Log out</button>
    </PortalShell>
  );
}

/** Live brokers land on Today; brokers still setting up land on Start here. */
export function SmcHome() {
  const { broker, userId, loading } = useCurrentBroker();
  if (loading) return <div className="min-h-screen" />;
  if (!userId) return <Navigate to="/broker" replace />;
  return <Navigate to={broker && isOnboarding(broker) ? "/broker/start" : "/broker/today"} replace />;
}
