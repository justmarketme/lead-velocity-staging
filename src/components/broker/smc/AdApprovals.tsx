/**
 * "Ads featuring you": every SortMyCover ad Lead Velocity prepared with the broker's face or name (broker_media kind 'ad',
 * migration 20261013190000). Nothing runs until he approves that specific ad here: Approve -> broker_decide_ad(id, true);
 * Decline (in-page confirm, optional reason) -> (id, false). Approved ads stay listed so he can pull one later.
 * Approval needs his standing consent (AdConsentCard). An approved ad is locked: "Request a change" asks us for a new
 * version (broker_request_change, item 'ad'); "Stop this ad" stays available (POPIA). Shows nothing when there are no ads.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { adConsentGranted, fmtDayTimeSast, splitAds, type AdRow } from "@/lib/adConsent";
import { viewUrl } from "./PreparedIntroCard";
import { adErrText } from "./AdConsentCard";
import type { ReviewSkin } from "./LvReview";
import ApprovalBand from "./ApprovalBand";
import RequestChange from "./RequestChange";
import ApprovalSwitch from "./ApprovalSwitch";

type Changed = (r: { onboarding_progress: Record<string, unknown> }) => void;

const isVideo = (u: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);

function AdPreview({ row, skin, pending }: { row: AdRow; skin: ReviewSkin; pending: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([viewUrl(row.url), viewUrl(row.thumbnail_url)]).then(([u, p]) => { if (alive) { setSrc(u); setPoster(p); } });
    return () => { alive = false; };
  }, [row.url, row.thumbnail_url]);
  const style = { display: "block", width: "100%", maxHeight: 420, objectFit: "contain" as const, background: "#0b0b10" };
  if (!src) return <div style={{ ...style, height: 180, borderRadius: skin === "portal" ? 10 : 14 }} aria-hidden="true" />;
  const video = isVideo(row.url || "");
  // Waiting ads show greyed with the diagonal band; hover, focus or tap shows the full colour (as the intro card does).
  // A video stays playable (band only, no greying, so he can judge it).
  const peek = pending && !video;
  const dim = peek ? "grayscale opacity-60 group-hover/card:grayscale-0 group-hover/card:opacity-100 group-focus/card:grayscale-0 group-focus/card:opacity-100" : "";
  return (
    <div className="group/card relative overflow-hidden" style={{ borderRadius: skin === "portal" ? 10 : 14 }}
      tabIndex={peek ? 0 : undefined}
      aria-label={peek ? "Preview this ad in colour. Approval is still required." : undefined}>
      {video
        ? <video src={src} poster={poster || undefined} controls playsInline preload="metadata" style={style} aria-label={`Ad version ${row.version}`} />
        : <img src={src} alt={`SortMyCover ad featuring you, version ${row.version}`} style={style} loading="lazy" className={`transition-[filter,opacity] duration-200 motion-reduce:transition-none ${dim}`} />}
      {!video && <ApprovalBand show={pending} />}
    </div>
  );
}

function AdItem({ row, approved, consentOk, skin, onDone, broker, onChanged }: {
  row: AdRow; approved: boolean; consentOk: boolean; skin: ReviewSkin; onDone: () => void;
  broker: { onboarding_progress?: unknown } | null | undefined; onChanged: Changed;
}) {
  const preview = !!useBrokerPreview();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setErr(null);
    if (preview) { setErr("Preview only: nothing is saved."); return; }
    setBusy(approve ? "approve" : "decline");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("broker_decide_ad", { p_media_id: row.id, p_approve: approve, p_note: note.trim() || null });
    setBusy(null);
    if (error) { setErr(adErrText(error)); return; }
    setDeclining(false); setNote("");
    onDone();
  }

  const declineLabel = approved ? "Stop this ad" : "Decline";
  const confirmText = approved ? "Stop this ad? It won't run again unless you approve it again." : "Decline this ad? It won't run. Tell us what to change, if you like.";

  if (skin === "portal") {
    return (
      <li style={{ listStyle: "none", borderTop: "1px solid var(--sm-border)", paddingTop: 12, marginTop: 12 }}>
        <AdPreview row={row} skin={skin} pending={!approved} />
        {row.script_text && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{row.script_text}</p>}
        <div style={{ marginTop: 8 }}>
          <ApprovalSwitch skin="portal" label="Approve this ad" approved={approved} approvedAt={row.approved_at} blocked={!consentOk || preview}
            blockedNote={preview ? "Preview only: nothing is saved." : "Give your consent above first, then you can approve this ad."}
            busy={busy === "approve"} error={err} onConfirm={() => decide(true)}>
            {!declining && <RequestChange broker={broker} item="ad" skin="portal" prefix={`Ad v${row.version}: `} onRequested={onChanged} />}
          </ApprovalSwitch>
        </div>
        {!declining ? (
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn ghost" disabled={!!busy} onClick={() => setDeclining(true)}>{declineLabel}</button>
          </div>
        ) : (
          <div className="alert" role="alert" style={{ marginTop: 8 }}>
            {confirmText}
            <textarea aria-label="What should we change? (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 8 }} />
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="tap" disabled={!!busy} onClick={() => decide(false)}>{busy === "decline" ? "Saving…" : `Yes, ${declineLabel.toLowerCase()}`}</button>
              <button type="button" className="tap g" disabled={!!busy} onClick={() => setDeclining(false)}>Cancel</button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4 space-y-3">
      <AdPreview row={row} skin={skin} pending={!approved} />
      {row.script_text && <p className="text-sm text-slate-200 whitespace-pre-wrap">{row.script_text}</p>}
      <ApprovalSwitch label="Approve this ad" approved={approved} approvedAt={row.approved_at} blocked={!consentOk || preview}
        blockedNote={preview ? "Preview only: nothing is saved." : "Give your consent above first, then you can approve this ad."}
        busy={busy === "approve"} error={err} onConfirm={() => decide(true)}>
        {!declining && <RequestChange broker={broker} item="ad" prefix={`Ad v${row.version}: `} onRequested={onChanged} />}
      </ApprovalSwitch>
      {!declining ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => setDeclining(true)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60">
            {declineLabel}
          </button>
        </div>
      ) : (
        <div role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 space-y-2">
          <p className="text-sm text-slate-200">{confirmText}</p>
          <textarea aria-label="What should we change? (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="w-full rounded-xl border border-white/15 bg-white/[0.04] p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-400/60"
            placeholder="What should we change? (optional)" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => decide(false)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-rose-400/40 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-60">
              {busy === "decline" && <Loader2 className="h-4 w-4 animate-spin" />}Yes, {declineLabel.toLowerCase()}
            </button>
            <button type="button" disabled={!!busy} onClick={() => setDeclining(false)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60">
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function AdApprovals({ broker, onChanged, skin = "elite", className = "" }: {
  broker: { id?: string | null; onboarding_progress?: unknown } | null | undefined;
  /** Gets the updated onboarding_progress after a change request (patch the page or reload). */
  onChanged: Changed;
  skin?: ReviewSkin; className?: string;
}) {
  const [rows, setRows] = useState<AdRow[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const brokerId = broker?.id || null;
  const consentOk = adConsentGranted(broker?.onboarding_progress);

  useEffect(() => {
    if (!brokerId) return;
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from("broker_media")
      .select("id, version, url, thumbnail_url, script_text, state, is_current, approved_at, created_at, ai_check")
      .eq("broker_id", brokerId).eq("kind", "ad").order("created_at", { ascending: false }).limit(50)
      .then(({ data, error }: { data: AdRow[] | null; error: unknown }) => { if (alive) setRows(error ? [] : data || []); });
    return () => { alive = false; };
  }, [brokerId, nonce, consentOk]); // consentOk: withdrawing consent pulls approved ads on the server

  const { waiting, approved } = splitAds(rows);
  if (waiting.length === 0 && approved.length === 0) return null;
  const refresh = () => setNonce((n) => n + 1);
  const list = (items: AdRow[], isApproved: boolean) => items.map((r) => (
    <AdItem key={r.id} row={r} approved={isApproved} consentOk={consentOk} skin={skin} onDone={refresh} broker={broker} onChanged={onChanged} />
  ));

  if (skin === "portal") {
    return (
      <section className={`card ${className}`} aria-labelledby="ads-h">
        <h2 id="ads-h">{waiting.length ? "Ads featuring you: waiting for your approval" : "Ads featuring you"}</h2>
        <p className="muted">We only run an ad with your face or name once you've approved it here.</p>
        <ul style={{ padding: 0, margin: 0 }}>{list(waiting, false)}</ul>
        {approved.length > 0 && <><h3 style={{ marginTop: 16 }}>Approved</h3><ul style={{ padding: 0, margin: 0 }}>{list(approved, true)}</ul></>}
      </section>
    );
  }
  return (
    <section aria-labelledby="ads-h" className={`rounded-[28px] border border-white/10 bg-white/[0.02] p-5 sm:p-7 space-y-4 ${className}`}>
      <div>
        <h3 id="ads-h" className="text-base sm:text-lg font-bold text-white">{waiting.length ? "Ads featuring you: waiting for your approval" : "Ads featuring you"}</h3>
        <p className="text-sm text-slate-400 mt-1">We only run an ad with your face or name once you've approved it here.</p>
      </div>
      {waiting.length > 0 && <ul className="space-y-3">{list(waiting, false)}</ul>}
      {approved.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-300">Approved</h4>
          <ul className="space-y-3">{list(approved, true)}</ul>
        </div>
      )}
    </section>
  );
}
