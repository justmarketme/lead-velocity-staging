/**
 * Lead Velocity's review of what the broker entered, shown wherever the portal shows FSP status or the bio:
 *  - FspVerifiedBadge: green "Verified by Lead Velocity on the FSCA register · 13 Oct 2026" + register name and status,
 *    only when brokers.fsp_check.status = 'verified' (other statuses keep their existing UI).
 *  - BioReviewCard: "Your bio needs a small change" when onboarding_progress.bio_review says so; Approve goes through
 *    broker_decide_bio_suggestion(true), "I'll rewrite it myself" through (false) and then opens the bio editor.
 * Two skins: "elite" (/broker-elite dark portal, Tailwind) and "portal" (/broker/* SortMyCover pages, portal.css classes).
 */
import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { profileErrorText } from "@/lib/brokerProfile";
import { bioReviewView, fspVerifiedBadge, readBioReview, type FspCheckLike } from "@/lib/brokerReview";

export type ReviewSkin = "elite" | "portal";

export function FspVerifiedBadge({ check, verifiedAt, skin = "elite", className = "" }: {
  check: FspCheckLike | null | undefined; verifiedAt?: string | null; skin?: ReviewSkin; className?: string;
}) {
  const b = fspVerifiedBadge(check, verifiedAt);
  if (!b) return null;
  if (skin === "portal") {
    return (
      <div className={`next-slot ${className}`} role="status" style={{ borderColor: "#16a34a" }}>
        <span style={{ color: "#16a34a" }}>✓</span>
        <div><b>{b.title}</b>{b.detail}{b.products && <><br /><span className="small">{b.products}</span></>}</div>
      </div>
    );
  }
  return (
    <div role="status" className={`flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 ${className}`}>
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-300">{b.title}</p>
        {b.detail && <p className="text-xs text-emerald-200/80 mt-0.5 break-words">{b.detail}</p>}
        {b.products && <p className="text-xs text-emerald-200/70 mt-1 break-words">{b.products}</p>}
      </div>
    </div>
  );
}

export interface BioDecision { bio_short: string | null; onboarding_progress: Record<string, unknown> }

const errText = (e: unknown) => {
  const msg = (e as { message?: string; code?: string } | null)?.message || "";
  if ((e as { code?: string } | null)?.code === "PGRST202" || /could not find the function/i.test(msg)) return "This isn't switched on yet. Please email howzit@leadvelocity.co.za.";
  return profileErrorText(e);
};

/**
 * Shows nothing unless there is something to decide or confirm. `onDecided` gets the updated bio_short +
 * onboarding_progress (patch the page or reload); `onRewrite` opens the bio editor.
 */
export function BioReviewCard({ broker, onDecided, onRewrite, skin = "elite", className = "" }: {
  broker: { bio_short?: string | null; onboarding_progress?: unknown } | null | undefined;
  onDecided: (d: BioDecision) => void; onRewrite: () => void; skin?: ReviewSkin; className?: string;
}) {
  const preview = !!useBrokerPreview();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const review = readBioReview(broker?.onboarding_progress);
  const view = bioReviewView(review, broker?.bio_short);
  if (!review || !view) return null;

  async function decide(accept: boolean) {
    setErr(null);
    if (preview) { setErr("Preview only: nothing is saved."); return; }
    setBusy(accept ? "accept" : "decline");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("broker_decide_bio_suggestion", { p_accept: accept });
    setBusy(null);
    if (error) { setErr(errText(error)); return; }
    onDecided(data as BioDecision);
    if (!accept) onRewrite();
  }

  const approvedText = "Approved. Your intro card will be prepared with this bio.";
  const reason = review.reason || "We can't include promises such as 'saving money' in anything we send to clients.";

  if (skin === "portal") {
    if (view === "approved") return <div className={`next-slot ${className}`} role="status"><span>✓</span><div>{approvedText}</div></div>;
    return (
      <section className={`card ${className}`} aria-labelledby="bio-review-h">
        <h2 id="bio-review-h">Your bio needs a small change</h2>
        <p className="small" style={{ marginTop: 8 }}><span className="pill" style={{ background: "#fee2e2", color: "#b91c1c" }}>Not approved</span></p>
        <p style={{ textDecoration: "line-through", opacity: 0.75, margin: "6px 0 8px" }}>{review.original}</p>
        <p className="muted">{reason}</p>
        {review.suggested && (
          <>
            <p className="small" style={{ marginTop: 10 }}><span className="pill" style={{ background: "#dcfce7", color: "#15803d" }}>Suggested by Lead Velocity</span></p>
            <p style={{ margin: "6px 0 10px", fontWeight: 700 }}>{review.suggested}</p>
          </>
        )}
        {view === "rewrite" && <p className="hint">You chose to rewrite it. Your intro card waits until you save a new bio.</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {review.suggested && <button type="button" className="btn" disabled={!!busy || preview} onClick={() => decide(true)}>{busy === "accept" ? "Saving…" : "Approve suggested bio"}</button>}
        <div style={{ height: 8 }} />
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => (view === "rewrite" ? onRewrite() : decide(false))}>{busy === "decline" ? "Saving…" : "I'll rewrite it myself"}</button>
      </section>
    );
  }

  if (view === "approved") {
    return (
      <div role="status" className={`flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 ${className}`}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
        <p className="text-sm text-emerald-200">{approvedText}</p>
      </div>
    );
  }
  return (
    <section aria-labelledby="bio-review-h" className={`rounded-2xl border border-amber-400/25 bg-slate-900/60 p-4 sm:p-5 space-y-3 ${className}`}>
      <h3 id="bio-review-h" className="text-base sm:text-lg font-bold text-white">Your bio needs a small change</h3>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <span className="inline-flex rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-300">Not approved</span>
        <p className="mt-2 text-sm text-slate-400 line-through decoration-rose-400/60">{review.original}</p>
      </div>
      <p className="text-sm text-slate-300">{reason}</p>
      {review.suggested && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
          <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">Suggested by Lead Velocity</span>
          <p className="mt-2 text-sm font-medium text-white">{review.suggested}</p>
        </div>
      )}
      {view === "rewrite" && <p className="text-xs text-slate-400">You chose to rewrite it. Your intro card waits until you save a new bio.</p>}
      {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {review.suggested && (
          <button type="button" disabled={!!busy || preview} onClick={() => decide(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {busy === "accept" && <Loader2 className="h-4 w-4 animate-spin" />}Approve suggested bio
          </button>
        )}
        <button type="button" disabled={!!busy} onClick={() => (view === "rewrite" ? onRewrite() : decide(false))}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60">
          {busy === "decline" && <Loader2 className="h-4 w-4 animate-spin" />}I'll rewrite it myself
        </button>
      </div>
    </section>
  );
}
