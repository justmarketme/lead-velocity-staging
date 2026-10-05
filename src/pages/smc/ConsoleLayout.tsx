/**
 * SMC console shell (admin role). Extends the existing admin console (INV-S01…S17) with three operator screens;
 * uses the CRM theme from src/index.css (no brand colours here — Close: operator tool, fewest clicks).
 */
import type { CSSProperties, ReactNode } from "react";
import { Link, NavLink, Navigate } from "react-router-dom";
import { useIsAdmin } from "@/lib/smc";
import SEO from "@/components/SEO";

const NAV = [
  { to: "/console", label: "Today", end: true },
  { to: "/console/ads", label: "Ads", end: false },
  { to: "/console/ask", label: "Ask", end: false },
  { to: "/console/payments", label: "Payments", end: false },
  { to: "/console/settings/brands", label: "Settings · Brands", end: false },
];

/** WCAG AA: the CRM --primary (280 90% 60%) gives 4.17:1 with white; scoped darker value for the console only (axe 2026-10-03). */
const A11Y_PRIMARY = { "--primary": "280 90% 45%" } as CSSProperties;

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { loading, isAdmin, userId } = useIsAdmin();
  if (loading) return <div className="min-h-screen bg-background text-muted-foreground p-8">Loading…</div>;
  if (!userId) return <Navigate to="/admin" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8">
        <p>This screen is for Lead Velocity admins only.</p>
        <Link className="underline" to="/broker">Go to the broker portal</Link>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background text-foreground" style={A11Y_PRIMARY}>
      <SEO title="Console" description="SortMyCover operator console." noIndex />
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-bold">Lead Velocity · Console</span>
          <nav className="flex gap-1" aria-label="Console">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/dashboard" className="ml-auto text-sm text-muted-foreground hover:text-foreground">CRM dashboard →</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
