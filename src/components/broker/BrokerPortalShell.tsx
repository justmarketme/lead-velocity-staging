/**
 * Broker portal frame (/broker-elite and the admin "Preview as broker").
 * Desktop: a calm left rail. Phones: thumb-reachable bottom bar (4 main tabs + More), and More opens a bottom sheet
 * that drags down to close. The header gains its background as you scroll (opacity only, fixed height: no layout shift).
 * Tabs cross-fade (AnimatePresence); the active-tab marker glides between items (shared layoutId).
 */
import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, useScroll, useTransform } from "motion/react";
import {
  Calendar as CalendarIcon, Database, Eye, FolderOpen, LayoutDashboard, LogOut, MoreHorizontal, Settings, UserCircle, X,
} from "lucide-react";
import logo from "@/assets/lead-velocity-logo.webp";
import { BrokerMotion, m } from "./motion";
import type { BrokerPlanState } from "@/lib/brokerPlan";
import { FspForm, ProfilePatch, WhatsAppForm } from "./ProfileForms";
import { BioReviewCard, FspVerifiedBadge } from "./smc/LvReview";
import { focusWhenReady } from "@/lib/brokerReview";

export type PortalTab = "dashboard" | "leads" | "calendar" | "intro" | "documents" | "settings";

const NAV: { id: PortalTab; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { id: "leads", label: "Leads", short: "Leads", icon: Database },
  { id: "calendar", label: "Appointments", short: "Appointments", icon: CalendarIcon },
  { id: "documents", label: "Documents", short: "Documents", icon: FolderOpen },
  { id: "intro", label: "Your intro card", short: "Intro card", icon: UserCircle },
  { id: "settings", label: "Your details", short: "Details", icon: Settings },
];
const BAR = NAV.slice(0, 4);
const MORE = NAV.slice(4);

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

interface ShellProps {
  broker: any;
  planState: BrokerPlanState | null;
  tab: PortalTab;
  onTab: (t: PortalTab) => void;
  onLogout: () => void;
  /** Name shown in the admin preview banner; null outside the preview. */
  previewName: string | null;
  onExitPreview: () => void;
  children: ReactNode;
}

export default function BrokerPortalShell(props: ShellProps) {
  return <BrokerMotion><Shell {...props} /></BrokerMotion>;
}

function Shell({ broker, planState, tab, onTab, onLogout, previewName, onExitPreview, children }: ShellProps) {
  const [sheet, setSheet] = useState(false);
  const { scrollY } = useScroll();
  const headerBg = useTransform(scrollY, [0, 48], [0, 1]);
  const titleScale = useTransform(scrollY, [0, 48], [1, 0.94]);
  const planLabel = planState?.plan ? `${planState.plan.name} plan${planState.paid ? "" : " · awaiting payment"}` : "";
  const exitLabel = previewName ? "Exit preview" : "Log out";
  const exit = previewName ? onExitPreview : onLogout;

  const go = (t: PortalTab) => { setSheet(false); onTab(t); };
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => {
    if (!sheet) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [sheet]);

  return (
    <div className="min-h-[100dvh] bg-[#050816] text-slate-200 antialiased">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(236,72,153,0.10),transparent_70%)]" aria-hidden="true" />

      {/* Desktop rail */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-72 flex-col border-r border-white/[0.06] bg-[#050816]/95 p-6">
        <div className="flex items-center gap-3 px-2 mb-10">
          <img src={logo} alt="" className="h-9 w-9 object-contain" />
          <span className="text-lg font-bold text-white">Lead Velocity</span>
        </div>
        <nav aria-label="Portal" className="flex-1 space-y-1">
          {NAV.map((n) => {
            const active = tab === n.id;
            return (
              <m.button key={n.id} type="button" onClick={() => go(n.id)} whileTap={{ scale: 0.98 }} aria-current={active ? "page" : undefined}
                className={`relative w-full flex items-center gap-3 rounded-xl px-4 min-h-[44px] text-sm font-medium transition-colors ${active ? "text-white" : "text-slate-400 hover:text-white"}`}>
                {active && <m.span layoutId="rail-pill" className="absolute inset-0 rounded-xl bg-white/[0.07] border border-white/10" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <n.icon className={`relative h-5 w-5 ${active ? "text-pink-400" : ""}`} aria-hidden="true" />
                <span className="relative">{n.label}</span>
              </m.button>
            );
          })}
        </nav>
        <m.button type="button" onClick={exit} whileTap={{ scale: 0.98 }} className="flex items-center gap-3 rounded-xl px-4 min-h-[44px] text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04]">
          <LogOut className="h-5 w-5" aria-hidden="true" />{exitLabel}
        </m.button>
      </aside>

      <div className="lg:pl-72">
        {/* Header: preview banner + bar */}
        <header className="sticky top-0 z-30">
          {previewName && (
            <div role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950">
              <span className="inline-flex items-center gap-2"><Eye className="h-4 w-4 shrink-0" aria-hidden="true" />Preview — this is what {previewName} sees. Read-only.</span>
              <button type="button" onClick={onExitPreview} className="rounded-lg bg-slate-950/85 px-3 min-h-[32px] text-xs font-bold uppercase tracking-wide text-amber-300 hover:bg-slate-950">Exit preview</button>
            </div>
          )}
          <div className="relative h-16 sm:h-[72px] flex items-center justify-between gap-4 px-4 sm:px-8">
            <m.div className="absolute inset-0 border-b border-white/[0.06] bg-[#050816]/85 backdrop-blur-md" style={{ opacity: headerBg }} aria-hidden="true" />
            <m.div className="relative flex items-center gap-3 min-w-0 origin-left" style={{ scale: titleScale }}>
              <img src={logo} alt="Lead Velocity" className="h-8 w-8 object-contain lg:hidden" />
              <div className="min-w-0">
                <p className="text-sm sm:text-base font-semibold text-white truncate">{broker?.firm_name || "Your portal"}</p>
                {planLabel && <p className="text-xs text-slate-400 truncate">{planLabel}</p>}
              </div>
            </m.div>
            <div className="relative h-10 w-10 shrink-0 rounded-full border border-white/10 bg-white/[0.05] flex items-center justify-center text-sm font-semibold text-white" aria-hidden="true">
              {initials(String(broker?.contact_person || broker?.firm_name || ""))}
            </div>
          </div>
        </header>

        <main className="relative px-4 sm:px-8 pt-2 pb-40 lg:pb-28 max-w-6xl mx-auto">
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}>
              {children}
            </m.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Phone bottom bar */}
      <nav aria-label="Portal" className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#070b1a]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {[...BAR, { id: "more" as const, label: "More", short: "More", icon: MoreHorizontal }].map((n) => {
            const active = n.id === "more" ? MORE.some((x) => x.id === tab) || sheet : tab === n.id;
            return (
              <li key={n.id}>
                <m.button type="button" whileTap={{ scale: 0.92 }} aria-current={active && n.id !== "more" ? "page" : undefined}
                  aria-haspopup={n.id === "more" ? "dialog" : undefined} aria-expanded={n.id === "more" ? sheet : undefined}
                  onClick={() => (n.id === "more" ? setSheet(true) : go(n.id))}
                  className={`relative w-full min-h-[60px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-white" : "text-slate-400"}`}>
                  {active && <m.span layoutId="bar-pill" className="absolute top-0 h-0.5 w-10 rounded-full bg-pink-400" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <n.icon className={`h-5 w-5 ${active ? "text-pink-400" : ""}`} aria-hidden="true" />
                  <span>{n.short}</span>
                </m.button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* More: bottom sheet, drag down to close */}
      <AnimatePresence>
        {sheet && (
          <div className="lg:hidden fixed inset-0 z-[110]" role="dialog" aria-modal="true" aria-label="More">
            <m.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
            <m.div
              className="absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-white/10 bg-[#0b1020] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)]"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 420, damping: 40 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) setSheet(false); }}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
              <div className="flex items-center justify-between px-2 mb-2">
                <p className="text-sm font-semibold text-white">More</p>
                <button type="button" onClick={() => setSheet(false)} className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
              </div>
              <ul className="space-y-1">
                {MORE.map((n) => (
                  <li key={n.id}>
                    <m.button type="button" whileTap={{ scale: 0.98 }} onClick={() => go(n.id)} aria-current={tab === n.id ? "page" : undefined}
                      className={`w-full flex items-center gap-3 rounded-xl px-4 min-h-[52px] text-base ${tab === n.id ? "bg-white/[0.07] text-white" : "text-slate-300"}`}>
                      <n.icon className="h-5 w-5 text-pink-400" aria-hidden="true" />{n.label}
                    </m.button>
                  </li>
                ))}
                <li>
                  <m.button type="button" whileTap={{ scale: 0.98 }} onClick={() => { setSheet(false); exit(); }} className="w-full flex items-center gap-3 rounded-xl px-4 min-h-[52px] text-base text-slate-300">
                    <LogOut className="h-5 w-5" aria-hidden="true" />{exitLabel}
                  </m.button>
                </li>
              </ul>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Your details" tab. */
export function BrokerDetails({ broker, planState, onBrokerPatch, onGo }: { broker: any; planState: BrokerPlanState | null; onBrokerPatch: (p: ProfilePatch) => void; onGo?: (t: PortalTab) => void }) {
  const rows = (pairs: [string, string | null | undefined][]) => pairs.map(([label, value]) => (
    <div key={label} className="py-3 border-b border-white/[0.06] last:border-0">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-base text-white break-words mt-0.5">{value || <span className="text-slate-500">Not on record yet</span>}</p>
    </div>
  ));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white">Your details</h2>
        <p className="text-slate-400 mt-1">What we have on record for you. You can update your FSP number, practice name and WhatsApp number here; for anything else, email howzit@leadvelocity.co.za.</p>
      </div>
      <BioReviewCard broker={broker} onDecided={(d) => onBrokerPatch(d)} onRewrite={() => { onGo?.("intro"); focusWhenReady("ic-bio"); }} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.02] p-5 sm:p-7">
          <h3 className="text-base font-semibold text-white mb-1">You and your practice</h3>
          {rows([
            ["Name", broker?.contact_person],
            ["Plan", planState?.plan ? `${planState.plan.name}: ${planState.plan.committed_leads} Qualified Leads per 30-day cycle${planState.paid ? "" : " (awaiting payment)"}` : null],
          ])}
          <FspVerifiedBadge check={broker?.fsp_check} verifiedAt={broker?.fsp_verified_at} className="mt-4" />
          <div className="pt-4"><FspForm key={`${broker?.fsp_number}-${broker?.firm_name}`} broker={broker} suggestedFsp={planState?.agreementFsp} onSaved={onBrokerPatch} /></div>
        </section>
        <section className="rounded-[28px] border border-white/10 bg-white/[0.02] p-5 sm:p-7">
          <h3 className="text-base font-semibold text-white mb-1">Where we reach you</h3>
          <p className="text-sm text-slate-400">New leads and bookings are sent here.</p>
          <div className="pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">Business WhatsApp{broker?.whatsapp_confirmed_at ? " · confirmed" : ""}</p>
            <WhatsAppForm key={broker?.whatsapp_number || "none"} broker={broker} onSaved={onBrokerPatch} />
          </div>
          {rows([
            ["Phone", broker?.phone_number],
            ["Email", broker?.email],
          ])}
        </section>
      </div>
    </div>
  );
}
