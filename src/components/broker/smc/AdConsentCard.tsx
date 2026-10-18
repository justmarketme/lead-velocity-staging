/**
 * "Your photo and name in our ads": the broker's standing consent that Lead Velocity MAY feature him in SortMyCover ads,
 * each ad subject to his approval (AdApprovals). Give consent: tick + "Give consent" -> broker_set_ad_likeness_consent(true).
 * After: green "Consent given · 13 Oct 2026, 18:42" + "Withdraw consent" (in-page confirm) -> (false). Optional, never
 * blocks go-live. The server stores the exact wording (ADS-LIKENESS-v3; v2 before 18 Oct) and a timestamped audit row for every change.
 * Two skins like LvReview: "elite" (/broker-elite, Tailwind) and "portal" (/broker/*, portal.css classes).
 */
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { profileErrorText } from "@/lib/brokerProfile";
import { AD_CONSENT_BODY, AD_CONSENT_CHECKBOX, AD_CONSENT_HEADING, fmtDayTimeSast, readAdConsent } from "@/lib/adConsent";
import type { ReviewSkin } from "./LvReview";

export interface AdConsentResult { onboarding_progress: Record<string, unknown> }

export const adErrText = (e: unknown) => {
  const msg = (e as { message?: string } | null)?.message || "";
  if ((e as { code?: string } | null)?.code === "PGRST202" || /could not find the function/i.test(msg)) return "This isn't switched on yet. Please email howzit@leadvelocity.co.za.";
  return profileErrorText(e);
};

export default function AdConsentCard({ broker, onChanged, skin = "elite", compact = false, className = "" }: {
  broker: { onboarding_progress?: unknown } | null | undefined;
  /** Gets the updated onboarding_progress (patch the page or reload). */
  onChanged: (r: AdConsentResult) => void;
  skin?: ReviewSkin;
  /** Inside the Getting started checklist: no heading (the step label is the heading). */
  compact?: boolean;
  className?: string;
}) {
  const preview = !!useBrokerPreview();
  const [ticked, setTicked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const consent = readAdConsent(broker?.onboarding_progress);
  const granted = consent?.status === "granted";

  async function set(value: boolean) {
    setErr(null);
    if (preview) { setErr("Preview only: nothing is saved."); return; }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("broker_set_ad_likeness_consent", { p_consent: value });
    setBusy(false);
    if (error) { setErr(adErrText(error)); return; }
    setConfirming(false); setTicked(false);
    onChanged({ onboarding_progress: (data as AdConsentResult).onboarding_progress });
  }

  const givenText = `Consent given · ${fmtDayTimeSast(consent?.at)}`;
  const withdrawnNote = consent?.status === "withdrawn" && consent.at ? `You withdrew consent on ${fmtDayTimeSast(consent.at)}.` : null;

  if (skin === "portal") {
    return (
      <section className={`card ${className}`} aria-labelledby="ad-consent-h">
        <h2 id="ad-consent-h">{AD_CONSENT_HEADING}</h2>
        <p className="muted">{AD_CONSENT_BODY}</p>
        {granted ? (
          <>
            <div className="next-slot" role="status" style={{ borderColor: "#16a34a" }}>
              <span style={{ color: "#16a34a" }}>✓</span><div><b style={{ color: "#15803d" }}>{givenText}</b></div>
            </div>
            {!confirming ? (
              <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={() => setConfirming(true)}>Withdraw consent</button>
            ) : (
              <div className="alert" role="alert" style={{ marginTop: 8 }}>
                Withdraw your consent? We'll stop using your name and photo in ads, and any ads you approved stop running.
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="tap" disabled={busy} onClick={() => set(false)}>{busy ? "Saving…" : "Yes, withdraw"}</button>
                  <button type="button" className="tap g" disabled={busy} onClick={() => setConfirming(false)}>Keep my consent</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {withdrawnNote && <p className="hint">{withdrawnNote}</p>}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "10px 0", fontWeight: 600, cursor: "pointer",
              border: "1.5px solid var(--sm-border)", borderRadius: "var(--sm-radius-md)", padding: 12, background: "var(--sm-surface)" }}>
              <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)}
                style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: "var(--sm-amber-dark)" }} />
              <span>{AD_CONSENT_CHECKBOX}</span>
            </label>
            <button type="button" className="btn" disabled={!ticked || busy || preview} onClick={() => set(true)}>{busy ? "Saving…" : "Give consent"}</button>
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
      </section>
    );
  }

  return (
    <section aria-labelledby={compact ? undefined : "ad-consent-h"} aria-label={compact ? AD_CONSENT_HEADING : undefined}
      className={compact ? `space-y-3 ${className}` : `rounded-[28px] border border-white/10 bg-white/[0.02] p-5 sm:p-7 space-y-3 ${className}`}>
      {!compact && <h3 id="ad-consent-h" className="text-base sm:text-lg font-bold text-white">{AD_CONSENT_HEADING}</h3>}
      <p className="text-sm text-slate-300">{AD_CONSENT_BODY}</p>
      {granted ? (
        <div className="space-y-2">
          <div role="status" className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-emerald-300">{givenText}</p>
          </div>
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)} className="text-xs font-semibold text-slate-400 underline underline-offset-2 hover:text-white min-h-[32px]">
              Withdraw consent
            </button>
          ) : (
            <div role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 space-y-2">
              <p className="text-sm text-slate-200">Withdraw your consent? We'll stop using your name and photo in ads, and any ads you approved stop running.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => set(false)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-rose-400/40 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}Yes, withdraw
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60">
                  Keep my consent
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {withdrawnNote && <p className="text-xs text-slate-400">{withdrawnNote}</p>}
          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 cursor-pointer">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-pink-500" />
            <span className="text-sm text-slate-200">{AD_CONSENT_CHECKBOX}</span>
          </label>
          <button type="button" disabled={!ticked || busy || preview} onClick={() => set(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Give consent
          </button>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
    </section>
  );
}
