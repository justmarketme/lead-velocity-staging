/**
 * Dashboard "Getting started": the first thing a new broker sees. Explainer video, a checklist driven by his real
 * records (ticked when done), what to expect, and how to reach us. Collapsible; collapsed by default once everything is
 * done (the choice is remembered per broker in this browser). Plain, FAIS-safe copy: no promises about results.
 * The broker finishes items in place: FSP number + practice and WhatsApp number save through broker_update_profile().
 */
import { ReactNode, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Check, ChevronDown, Eye, Mail, PlayCircle } from "lucide-react";
import { m, stagger, item, EASE } from "./motion";
import { FspForm, ProfilePatch, WhatsAppForm } from "./ProfileForms";
import type { BrokerPlanState } from "@/lib/brokerPlan";
import { loadBrokerDocuments, openAdminDocument } from "@/lib/adminDocs";
import { fmtZa, toZaE164 } from "@/lib/brokerProfile";
import { TERMS, zar } from "@/lib/pricing";
import { SUPPORT_EMAIL } from "@/lib/smc";
import CalendarHowToVideo from "./smc/CalendarHowToVideo";
import {
  BROKER_ONBOARDING_CAPTIONS_URL, BROKER_ONBOARDING_POSTER_URL, BROKER_ONBOARDING_VIDEO_TITLE, BROKER_ONBOARDING_VIDEO_URL,
} from "@/lib/brokerMedia";

type Tab = "dashboard" | "leads" | "calendar" | "intro" | "documents" | "settings";

interface Step {
  key: string; label: string; done: boolean; detail: string;
  /** A button on the right: go to a tab, open a link, run something, or open the inline panel. */
  action?: { label: string; tab?: Tab; href?: string; run?: () => void; expand?: boolean };
  /** Inline panel (form or explainer), opened by the action with expand: true. */
  panel?: ReactNode;
}

const store = {
  get(k: string) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const actionCls = "shrink-0 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white hover:bg-white/10";

export default function GettingStarted({ broker, planState, onGo, onBrokerPatch }: {
  broker: any; planState: BrokerPlanState | null; onGo: (t: Tab) => void; onBrokerPatch: (p: ProfilePatch) => void;
}) {
  const [hasInvoice, setHasInvoice] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  useEffect(() => {
    if (!broker?.id) return;
    let alive = true;
    void loadBrokerDocuments(broker.id).then((r) => { if (alive) setHasInvoice(r.docs.some((d) => d.kind === "invoice")); });
    return () => { alive = false; };
  }, [broker?.id]);

  const plan = planState?.plan || null;
  const saved = (key: string) => (p: ProfilePatch) => { onBrokerPatch(p); setOpenPanel((k) => (k === key ? null : k)); };

  const steps: Step[] = useMemo(() => {
    const calConnected = broker?.calendar_status === "ok" || broker?.calendar_mode === "shared_fallback";
    const introDone = !!broker?.headshot_url && String(broker?.bio_short || "").trim().length >= 40;
    const paid = !!planState?.paid;
    const proof = planState?.proof || null;
    const waDone = !!broker?.whatsapp_number && !!broker?.whatsapp_confirmed_at;
    // No WhatsApp on record yet: offer his phone number on record to confirm.
    const waSuggest = broker?.whatsapp_number || toZaE164(broker?.phone_number || "");
    return [
      {
        key: "agreement", label: "Review your signed agreement", done: !!planState?.hasSignedAgreement,
        detail: planState?.hasSignedAgreement ? "Signed and saved in Documents." : "We'll add it here once it's signed.",
        action: planState?.hasSignedAgreement ? { label: "Open", tab: "documents" } : undefined,
      },
      {
        key: "pay", label: "Pay your first invoice", done: paid,
        detail: paid
          ? `Paid on ${fmtDay(planState!.paidOn!)}${proof?.amount_zar ? ` · ${zar(proof.amount_zar)}` : ""}${proof?.reference ? ` · ref ${proof.reference}` : ""}.`
          : hasInvoice ? "Your invoice is in Documents."
          : plan ? `Your ${plan.name} invoice (${zar(plan.price_zar)} excl. VAT) will be emailed to you.` : "Your invoice will be emailed to you.",
        action: proof ? { label: "View proof", run: () => { void openAdminDocument(proof.file_path); } }
          : !paid && hasInvoice ? { label: "Open", tab: "documents" } : undefined,
      },
      {
        key: "fsp", label: "Confirm your FSP number", done: !!broker?.fsp_number,
        detail: broker?.fsp_number ? `FSP ${broker.fsp_number} · ${broker.firm_name || ""}`.replace(/ · $/, "")
          : planState?.agreementFsp ? `Your agreement lists FSP ${planState.agreementFsp}. Check it and save it to your profile.`
          : "Clients see it with your practice name.",
        action: { label: broker?.fsp_number ? "Edit" : "Enter it", expand: true },
        panel: <FspForm broker={broker} suggestedFsp={planState?.agreementFsp} onSaved={saved("fsp")} onCancel={() => setOpenPanel(null)} />,
      },
      {
        key: "intro", label: "Add your photo and a short bio", done: introDone,
        detail: introDone ? "Your intro card is ready." : "Clients see these when they book a call with you.",
        action: { label: introDone ? "Edit" : "Add them", tab: "intro" },
      },
      {
        key: "whatsapp", label: "Confirm your business WhatsApp number", done: waDone,
        detail: waDone ? `New leads and bookings reach you on ${fmtZa(broker.whatsapp_number)}.`
          : waSuggest ? `Is ${fmtZa(waSuggest)} your business WhatsApp? New leads and bookings are sent to it.` : "New leads and bookings are sent to this number.",
        action: { label: waDone ? "Change" : waSuggest ? "Confirm" : "Add it", expand: true },
        panel: <WhatsAppForm broker={broker} onSaved={saved("whatsapp")} />,
      },
      {
        key: "calendar", label: "Connect your Outlook calendar", done: calConnected,
        detail: calConnected ? "Clients can book into your free time." : broker?.brand_id ? "So clients can book a Teams call in your real free time." : "Opens once your campaign is set up after payment.",
        action: calConnected ? undefined : { label: "What you'll be asked", expand: true },
        panel: (
          <div className="space-y-2 text-sm text-slate-300">
            <CalendarHowToVideo mutedClass="text-slate-400" />
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>You sign in with your work Microsoft account.</li>
              <li>Microsoft shows a permission screen listing calendar access: seeing when you're free and adding the booked calls (with their Teams links) to your calendar. Choose Accept.</li>
              <li>If your company's IT has to approve new apps, we'll send them a one-click approval link. It takes them about two minutes.</li>
            </ol>
            <p className="text-slate-400">We never read your email or what your own meetings are about.</p>
            {broker?.brand_id && <button type="button" className={actionCls} onClick={() => onGo("calendar")}>Go to Appointments</button>}
          </div>
        ),
      },
    ];
  }, [broker, planState, hasInvoice, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = steps.filter((s) => s.done).length;
  const allDone = done === steps.length;
  const key = `lv.gettingStarted.collapsed.${broker?.id}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const saved = store.get(key);
    setOpen(saved === null ? !allDone : saved !== "1");
  }, [key, allDone]);
  const toggle = () => { setOpen((o) => { store.set(key, o ? "1" : "0"); return !o; }); };

  const runAction = (s: Step) => {
    const a = s.action!;
    if (a.expand) setOpenPanel((k) => (k === s.key ? null : s.key));
    else if (a.run) a.run();
    else if (a.tab) onGo(a.tab);
  };

  return (
    <m.section layout className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden" aria-labelledby="gs-title">
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls="gs-body"
        className="w-full flex items-center justify-between gap-4 p-5 sm:p-7 text-left min-h-[44px]">
        <div className="min-w-0">
          <h2 id="gs-title" className="text-xl sm:text-2xl font-bold text-white">Getting started</h2>
          <p className="text-sm text-slate-400 mt-1">{allDone ? "All done. You're set up." : `${done} of ${steps.length} done`}</p>
          <div className="mt-3 h-1.5 w-48 max-w-full rounded-full bg-white/10 overflow-hidden">
            <m.div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-pink-500 to-rose-400"
              initial={{ scaleX: 0 }} animate={{ scaleX: done / steps.length }} transition={{ duration: 0.8, ease: EASE }} />
          </div>
        </div>
        <m.span animate={{ rotate: open ? 180 : 0 }} className="shrink-0 rounded-full border border-white/10 p-2 text-slate-300">
          <ChevronDown className="h-5 w-5" />
        </m.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div id="gs-body" key="body" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="px-5 pb-6 sm:px-7 sm:pb-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6">
            <div className="space-y-6 min-w-0">
              {/* Explainer */}
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                {BROKER_ONBOARDING_VIDEO_URL ? (
                  <video className="w-full aspect-video bg-black" controls playsInline preload="metadata"
                    poster={BROKER_ONBOARDING_POSTER_URL || undefined} aria-label={BROKER_ONBOARDING_VIDEO_TITLE}>
                    <source src={BROKER_ONBOARDING_VIDEO_URL} type="video/mp4" />
                    {BROKER_ONBOARDING_CAPTIONS_URL && <track kind="captions" src={BROKER_ONBOARDING_CAPTIONS_URL} srcLang="en" label="English" default />}
                  </video>
                ) : (
                  <div className="aspect-video flex flex-col items-center justify-center gap-3 p-6 text-center bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.12),transparent_70%)]">
                    <PlayCircle className="h-12 w-12 text-pink-400/70" aria-hidden="true" />
                    <p className="font-semibold text-white">{BROKER_ONBOARDING_VIDEO_TITLE}</p>
                    <p className="text-sm text-slate-400 max-w-sm">A 3-minute video that walks you through the first weeks. It will appear here shortly.</p>
                  </div>
                )}
              </div>

              {/* What to expect */}
              <div>
                <h3 className="text-base font-semibold text-white mb-3">What to expect</h3>
                <ul className="space-y-2.5 text-sm text-slate-300">
                  {[
                    plan ? `Your plan: ${plan.name}, ${plan.committed_leads} Qualified Leads per ${TERMS.cycle_days}-day cycle.` : null,
                    "Your campaigns go live within 3 business days of payment and onboarding.",
                    "Leads come to you through SortMyCover on WhatsApp and are booked straight into your calendar.",
                    "A booking only appears once the client has verified their email address.",
                    "A lead counts once you've met the client and marked them Attended.",
                    `Up to ${TERMS.goodwill_replacements_per_week} replacement requests a week, for no-shows and clients you couldn't reach, with proof.`,
                    "Clients get reminders up to 10 minutes before the meeting.",
                  ].filter(Boolean).map((t) => (
                    <li key={t as string} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400" aria-hidden="true" /><span>{t}</span></li>
                  ))}
                </ul>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-pink-300 hover:text-pink-200">
                  <Mail className="h-4 w-4" /> Questions? {SUPPORT_EMAIL}
                </a>
              </div>
            </div>

            {/* Checklist: first on phones (it is what needs doing), right column on wide screens */}
            <div className="min-w-0 order-first xl:order-none">
              <h3 className="text-base font-semibold text-white mb-3">What you need to do</h3>
              <m.ol className="space-y-2.5" variants={stagger} initial="hidden" animate="show">
                {steps.map((s) => (
                  <m.li key={s.key} variants={item} layout
                    className={`rounded-2xl border p-4 ${s.done ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.02]"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${s.done ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/25"}`}
                        aria-hidden="true">
                        {s.done && <m.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="h-4 w-4" strokeWidth={3} /></m.span>}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${s.done ? "text-slate-300" : "text-white"}`}>
                          {s.label}<span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                        </p>
                        <p className="text-sm text-slate-400 mt-0.5">{s.detail}</p>
                      </div>
                      {s.action && (s.action.href ? (
                        <m.a whileTap={{ scale: 0.96 }} href={s.action.href} className={actionCls}>{s.action.label}</m.a>
                      ) : (
                        <m.button whileTap={{ scale: 0.96 }} type="button" onClick={() => runAction(s)} className={actionCls}
                          aria-expanded={s.action.expand ? openPanel === s.key : undefined}>
                          {s.action.run && <Eye className="h-4 w-4" aria-hidden="true" />}{s.action.label}
                        </m.button>
                      ))}
                    </div>
                    <AnimatePresence initial={false}>
                      {s.panel && openPanel === s.key && (
                        <m.div key="panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4 pl-9">
                          {s.panel}
                        </m.div>
                      )}
                    </AnimatePresence>
                  </m.li>
                ))}
              </m.ol>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.section>
  );
}
