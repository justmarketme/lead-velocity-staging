/**
 * "Request a change" for an approved item (bio, intro card, an approved ad). Approved items are locked, so instead of an
 * edit the broker tells Lead Velocity what to change: broker_request_change(p_item, p_message) (migration
 * 20261013200000) stores it, logs it and pings us. While a request for this item is open it shows
 * "Change requested · we'll be in touch". Two skins like LvReview.
 */
import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { changeMessage, openRequests, type ChangeItem } from "@/lib/changeRequests";
import { fmtDayTimeSast } from "@/lib/adConsent";
import { adErrText } from "./AdConsentCard";
import type { ReviewSkin } from "./LvReview";

export default function RequestChange({ broker, item, onRequested, skin = "elite", prefix = "", label = "Request a change", className = "" }: {
  broker: { onboarding_progress?: unknown } | null | undefined;
  item: ChangeItem;
  /** Gets the updated onboarding_progress (patch the page or reload). */
  onRequested: (r: { onboarding_progress: Record<string, unknown> }) => void;
  skin?: ReviewSkin;
  /** Prepended to the message, e.g. "Ad v2: " so we know which ad. */
  prefix?: string;
  label?: string;
  className?: string;
}) {
  const preview = !!useBrokerPreview();
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = openRequests(broker?.onboarding_progress, item).filter((r) => !prefix || r.message.startsWith(prefix));
  const id = `rc-${item}-${prefix.replace(/\W+/g, "")}`;

  async function send() {
    setErr(null);
    if (what.trim().length < 3) { setErr("Tell us what to change."); return; }
    if (preview) { setErr("Preview only: nothing is saved."); return; }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("broker_request_change", { p_item: item, p_message: changeMessage(prefix + what, note) });
    setBusy(false);
    if (error) { setErr(adErrText(error)); return; }
    setOpen(false); setWhat(""); setNote("");
    onRequested({ onboarding_progress: (data as { onboarding_progress: Record<string, unknown> }).onboarding_progress });
  }

  if (pending.length) {
    const when = fmtDayTimeSast(pending[0].at);
    return skin === "portal"
      ? <p className={`pill info ${className}`} role="status">Change requested{when ? ` ${when}` : ""} · we'll be in touch</p>
      : (
        <p role="status" className={`inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200 ${className}`}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />Change requested{when ? ` ${when}` : ""} · we'll be in touch
        </p>
      );
  }

  if (skin === "portal") {
    if (!open) return <button type="button" className={`btn ghost ${className}`} onClick={() => setOpen(true)} aria-expanded={false}>{label}</button>;
    return (
      <div className={`card ${className}`} style={{ marginTop: 8 }}>
        <label htmlFor={`${id}-what`}>What should we change?</label>
        <textarea id={`${id}-what`} maxLength={600} value={what} onChange={(e) => setWhat(e.target.value)} />
        <label htmlFor={`${id}-note`}>Anything else? (optional)</label>
        <textarea id={`${id}-note`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="hint">Approved items are locked so nothing changes without a check. We'll make the change and send it back for your approval.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="tap" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send request"}</button>
          <button type="button" className="tap g" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false}
        className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 ${className}`}>
        {label}
      </button>
    );
  }
  const field = "w-full rounded-xl border border-white/15 bg-white/[0.04] p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-400/60";
  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2 ${className}`}>
      <label htmlFor={`${id}-what`} className="block text-sm font-semibold text-white">What should we change?</label>
      <textarea id={`${id}-what`} maxLength={600} rows={2} value={what} onChange={(e) => setWhat(e.target.value)} className={field} />
      <label htmlFor={`${id}-note`} className="block text-xs font-medium text-slate-400">Anything else? (optional)</label>
      <textarea id={`${id}-note`} maxLength={300} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
      <p className="text-xs text-slate-400">Approved items are locked so nothing changes without a check. We'll make the change and send it back for your approval.</p>
      {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={send}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send request
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60">
          Cancel
        </button>
      </div>
    </div>
  );
}
