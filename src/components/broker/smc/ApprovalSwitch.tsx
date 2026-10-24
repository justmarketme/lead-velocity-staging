/**
 * The approve control for a prepared item (intro card, ad): a switch, not a buried button.
 * OFF -> flipping it opens the plain-language note + "Yes, switch on" / "Not yet"; nothing is saved until he confirms.
 * ON  -> locked (disabled). A change goes through "Request a change" (passed as children), which pings Lead Velocity.
 * Same text for both portal skins; `onConfirm` runs the RPC (audit row + versioned wording stay server-side).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Lock } from "lucide-react";
import { fmtDayTimeSast } from "@/lib/adConsent";

export const APPROVE_NOTE =
  "When you switch this on, it comes through to Lead Velocity and we may use it. If you ever want it changed or taken down, send us a change request here and we'll sort it.";

export default function ApprovalSwitch({ label, approved, approvedAt, blocked, blockedNote, busy, error, onConfirm, children, skin = "elite" }: {
  label: string; approved: boolean; approvedAt?: string | null;
  /** Cannot be switched on yet (e.g. consent / bio not done). */
  blocked?: boolean; blockedNote?: ReactNode;
  busy?: boolean; error?: string | null; onConfirm: () => void | Promise<void>;
  /** Shown beside the locked switch: the "Request a change" control. */
  children?: ReactNode; skin?: "elite" | "portal";
}) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  // The confirm step sits under the switch; on a phone it can be below the fold, so bring it into view (Mark, 19 Oct).
  useEffect(() => { if (asking) confirmRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [asking]);
  const light = skin === "portal";
  const txt = light ? "" : "text-slate-200";
  const sub = light ? "hint" : "text-xs text-slate-400";
  const on = approved || (busy && asking);
  // Half-on and amber while waiting for "Yes, switch on", so it never looks like it went back to off.
  const pending = !approved && asking && !busy;
  return (
    <div className={`space-y-2 ${txt}`}>
      <div className="flex items-center gap-3">
        <button type="button" role="switch" aria-checked={on ? true : pending ? "mixed" : false} aria-label={label}
          disabled={approved || !!blocked || !!busy}
          onClick={() => setAsking((a) => !a)}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 disabled:cursor-not-allowed ${on ? "border-emerald-500 bg-emerald-500" : pending ? "border-amber-400 bg-amber-400" : "border-slate-400 bg-slate-500/40"} ${blocked && !approved ? "opacity-50" : ""}`}>
          <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${on ? "translate-x-7" : pending ? "translate-x-4" : "translate-x-1"}`} />
        </button>
        <span className="text-sm font-semibold flex items-center gap-1.5">
          {approved && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
          {approved ? `${label}: approved${approvedAt ? ` · ${fmtDayTimeSast(approvedAt)}` : ""}` : label}
        </span>
      </div>
      {!approved && blocked && blockedNote && <p className={sub}>{blockedNote}</p>}
      {!approved && !blocked && !asking && <p className={sub}>Switch on to approve.</p>}
      {!approved && asking && (
        <div ref={confirmRef} role="alertdialog" aria-label="Before you switch this on" className={light ? "alert" : "rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 space-y-2"}>
          <p className="text-sm"><strong>One more step:</strong> tap &quot;Yes, switch on&quot; to approve.</p>
          <p className="text-sm">{APPROVE_NOTE}</p>
          <div className="flex flex-wrap gap-2" style={light ? { marginTop: 8 } : undefined}>
            <button type="button" disabled={!!busy} onClick={async () => { await onConfirm(); }}
              className={light ? "tap" : "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Saving…" : "Yes, switch on"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => setAsking(false)}
              className={light ? "tap g" : "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"}>
              Not yet
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className={light ? "err" : "text-sm text-rose-300"}>{error}</p>}
      {approved && (
        <div className="space-y-2">
          <p className={sub}>This is locked. To change it or take it down, send us a change request and we'll sort it.</p>
          {children}
        </div>
      )}
    </div>
  );
}
