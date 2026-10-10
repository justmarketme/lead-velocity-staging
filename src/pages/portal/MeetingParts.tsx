/**
 * Meeting building blocks shared by Today, My leads and the lead record (ux-sprint-1: R1, R4, R8, R10).
 * Feedback firewall (agreement clause 8.4): four answers only, nothing about what was said or decided.
 * Replacement proof (Schedule 3): wait 10 minutes, then send a photo or screenshot by start + 30 minutes. This is the same
 * for a no-show and for a lead you couldn't reach, and both share one counter of 3 requests a week (clause 7.2).
 * Replacements are goodwill, never promised (clause 7).
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePortal } from "./PortalShell";
import { AGE_LABEL, BUDGET_LABEL, fmtTime, methodLabel } from "@/lib/smc";
import { MARKS, markLabel, markPlan, proofWindow, type MarkKind, type ReplacementKind } from "@/lib/smcRules";
import { CALL_METHODS, callHref, markMeeting, sendReplacementProof, shortName, useCycle, UNDO_MS, type MarkStatus } from "@/lib/smcPortal";
import type { SmcBooking, SmcLead, SmcOutcome } from "@/integrations/supabase/smc-types";

/** Re-render every `ms` (countdowns). */
// eslint-disable-next-line react-refresh/only-export-components
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(t); }, [ms]);
  return now;
}

/** The one primary action for a meeting: Call (phone / WhatsApp call) or Join (Teams / Zoom / Meet). */
export function JoinCall({ b, l, ghost }: { b: SmcBooking; l?: SmcLead; ghost?: boolean }) {
  const cls = ghost ? "btn ghost" : "btn";
  if (CALL_METHODS.has(b.method)) {
    const href = callHref(b.method, b.call_number || l?.call_number);
    return href ? <a className={cls} href={href} target={b.method === "whatsapp_call" ? "_blank" : undefined} rel="noreferrer">{b.method === "whatsapp_call" ? "WhatsApp call" : "Call"} {l?.first_name || ""}</a> : null;
  }
  return b.join_url ? <a className={cls} href={b.join_url} target="_blank" rel="noreferrer">Join on {methodLabel(b.method)}</a> : null;
}

export function Brief({ b, l }: { b: SmcBooking; l?: SmcLead }) {
  return (
    <div className="brief">
      <b>Pre-call brief: {shortName(l)}, {fmtTime(b.starts_at)} on {methodLabel(b.method)}</b>
      <ul>
        {(l?.age_band || l?.budget_band) && <li>Told us: {l?.age_band ? `age ${AGE_LABEL[l.age_band]}` : ""}{l?.age_band && l?.budget_band ? ", " : ""}{l?.budget_band ? `budget ${BUDGET_LABEL[l.budget_band]}` : ""} (self-declared).</li>}
        {l?.bond !== null && l?.bond !== undefined && <li>{l.bond ? "Has a bond." : "No bond."}{l?.dependants ? " Has people who depend on them." : ""} (their answers on the quiz)</li>}
        <li>Prefers: {methodLabel(l?.method_pref || b.method)}{l?.best_time ? `. Best time: ${l.best_time}` : ""}{l?.language ? `. Language: ${l.language}` : ""}.</li>
        {CALL_METHODS.has(b.method) && (b.call_number || l?.call_number) && <li>Call them on the number they confirmed: {b.call_number || l?.call_number}</li>}
        {l?.health_flag && <li>Has a health question for you. (We never show the detail.)</li>}
      </ul>
    </div>
  );
}

/** Bottom sheet (native <dialog>: focus trap, Esc to close, backdrop). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-label={title} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="sheet-in">
        <div className="sheet-h"><h2>{title}</h2><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        {children}
      </div>
    </dialog>
  );
}

/** What the broker must send, per kind (Schedule 3). Plain words; the time must be visible. */
function proofRule(kind: ReplacementKind, method: string) {
  if (kind === "unreachable") return "A screenshot of your call log or WhatsApp chat with them showing at least 2 attempts since the start time and no reply, or showing the number is wrong or invalid. Time visible.";
  if (CALL_METHODS.has(method)) return "A screenshot of your call log showing the time you called and that it wasn't answered. Time visible. No people, no address.";
  return "A screenshot of the call showing the time and that only you were there. Time visible. No people, no address.";
}
const KIND_LABEL: Record<ReplacementKind, string> = { no_show: "No-show", unreachable: "Couldn't reach them" };

export function ProofSheet({ b, l, kind, used, max, open, onClose, onSent, onPlain }: { b: SmcBooking; l?: SmcLead; kind: ReplacementKind; used: number; max: number; open: boolean; onClose: () => void; onSent: (msg: string) => void; onPlain: () => void }) {
  const { broker, userId } = usePortal();
  const qc = useQueryClient();
  const now = useNow(15_000);
  const w = proofWindow(Date.parse(b.starts_at), now);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (!open) { setFile(null); setPreview(null); setErr(null); } }, [open]); // never send the last proof for a different answer
  const pick = (f?: File | null) => { if (!f) return; setErr(null); setFile(f); setPreview(URL.createObjectURL(f)); };
  async function send() {
    if (!file) return;
    setBusy(true); setErr(null);
    const r = await sendReplacementProof(qc, broker.id, userId, b, file, kind);
    setBusy(false);
    if (r.ok) { onSent("Request sent. We'll tell you on WhatsApp what we decide."); onClose(); }
    else setErr("msg" in r ? r.msg : "Not sent.");
  }
  // A call-log or chat screenshot is the proof for a lead you couldn't reach, so that picker leads; a photo leads for a no-show.
  const shot = <label key="shot" className={kind === "unreachable" ? "btn" : "btn ghost"}>Choose a screenshot<input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} /></label>;
  const photo = <label key="photo" className="btn ghost">Take a photo<input type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0])} /></label>;
  return (
    <Sheet open={open} onClose={onClose} title={`Ask for a replacement: ${shortName(l)}`}>
      <p className="muted" style={{ marginTop: 0 }}><b>{KIND_LABEL[kind]}.</b> {proofRule(kind, b.method)}</p>
      <p className="small">Replacements are goodwill, not a right: up to {max} requests a week (no-shows and leads you couldn't reach, together), proof within 30 minutes of the start time. You've used {used} of {max} this week. {w.state === "open" ? <b>Send within {w.minsLeft} min.</b> : null}</p>
      {w.state === "closed" && <p className="alert">Too late for a replacement request. It still counts as delivered.</p>}
      {preview && <img className="proof-prev" src={preview} alt="Your proof" />}
      <div className="proof-pick">{kind === "unreachable" ? [shot, photo] : [photo, shot]}</div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="button" disabled={!file || busy || w.state !== "open"} onClick={send}>{busy ? "Sending…" : "Ask for a replacement"}</button>
      <button className="btn ghost" type="button" onClick={() => { onPlain(); onClose(); }}>{`Just mark "${KIND_LABEL[kind]}" (no request)`}</button>
    </Sheet>
  );
}

/**
 * The four answers, one tap each (Pipedrive outcome-on-done + Linear optimistic UI). Commit after a 6-second Undo.
 * No-show and Couldn't reach them behave the same (markPlan): disabled until start + 10 min; from 10 to 30 min, with
 * requests left this week, they open the proof sheet ("Ask for a replacement"); after 30 min, or with 3 of 3 used, they
 * just record the answer ("too late for a replacement request", still counted as delivered).
 */
export function MarkButtons({ b, l, existing, autoProof, onLogged }: { b: SmcBooking; l?: SmcLead; existing?: SmcOutcome; autoProof?: boolean; onLogged?: (msg: string) => void }) {
  const { broker, userId } = usePortal();
  const qc = useQueryClient();
  const now = useNow(15_000);
  const { data: cyc } = useCycle(broker.id);
  const [status, setStatus] = useState<MarkStatus | null>(null);
  const [proof, setProof] = useState(false);
  const [proofKind, setProofKind] = useState<ReplacementKind>("no_show");
  const [left, setLeft] = useState(0);
  const undoRef = useRef<(() => boolean) | null>(null);
  const w = proofWindow(Date.parse(b.starts_at), now);
  const used = cyc?.requestsThisWeek ?? 0, max = cyc?.weeklyMax ?? 3;
  const canRequest = w.state === "open" && used < max;
  // ?do=proof deep link (WhatsApp): opens the proof sheet for the answer already on the meeting (couldn't reach them), else no-show.
  useEffect(() => { if (autoProof && canRequest) { setProofKind(existing?.outcome === "unreachable" ? "unreachable" : "no_show"); setProof(true); } }, [autoProof, canRequest, existing?.outcome]);
  useEffect(() => {
    if (status?.state !== "undo") return;
    const end = Date.now() + UNDO_MS; setLeft(Math.ceil(UNDO_MS / 1000));
    const t = window.setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
    return () => window.clearInterval(t);
  }, [status?.state, status?.kind]);

  const mark = (kind: MarkKind) => {
    const m = markMeeting(qc, broker.id, userId, b, kind, (s) => { setStatus(s); if (s?.state === "saved") onLogged?.(`${markLabel(kind)}: logged.`); });
    undoRef.current = m.undo;
  };
  const tap = (kind: MarkKind) => {
    if (markPlan(kind, w, used, max).mode === "ask") { setProofKind(kind as ReplacementKind); setProof(true); return; }
    mark(kind);
  };

  if (w.state === "not_started") return <p className="small">You can mark this once it has started.</p>;
  const cur = status && status.state !== "failed" ? status.kind : existing?.outcome;
  return (
    <div className="marks">
      {status?.state === "undo" ? (
        <div className="logged" role="status"><span>Logged: <b>{markLabel(status.kind)}</b></span><button type="button" className="tap g" onClick={() => undoRef.current?.()}>Undo{left ? ` (${left})` : ""}</button></div>
      ) : (
        <>
          {status?.state === "failed" && <div className="alert" role="alert" style={{ marginBottom: 8 }}>{status.msg || "Not saved."} <button type="button" className="tap" onClick={() => mark(status.kind)}>Tap to try again</button></div>}
          <div className="mark4" role="group" aria-label={`What happened with ${shortName(l)}?`}>
            {MARKS.map((m) => {
              const plan = markPlan(m.kind, w, used, max);
              return (
                <button key={m.kind} type="button" className={cur === m.kind ? "on" : ""} aria-pressed={cur === m.kind} disabled={plan.mode === "wait" || status?.state === "saving"} onClick={() => tap(m.kind)}>
                  {m.label}{plan.mode === "wait" ? <small>wait {plan.minsToOpen} min</small> : plan.mode === "ask" ? <small>ask for a replacement</small> : null}
                </button>
              );
            })}
          </div>
          {status?.state === "saved" && <p className="small ok-line" role="status">Logged: {markLabel(status.kind)} ✓</p>}
          {existing?.marked_via === "whatsapp" && !status && <p className="small">Marked on WhatsApp {fmtTime(existing.marked_at)}</p>}
          {w.state === "waiting" && <p className="small">No-show and Couldn't reach them open 10 minutes after the start time ({w.minsToOpen} min to go). For a no-show, wait in the meeting. If you couldn't reach them, try at least twice.</p>}
          {w.state === "open" && used >= max && <p className="small">{used} of {max} replacement requests used this week (no-shows and leads you couldn't reach, together), so no new request. A no-show or a lead you couldn't reach still counts as delivered.</p>}
          {w.state === "closed" && <p className="small">No-show or Couldn't reach them now: too late for a replacement request. It still counts as delivered.</p>}
        </>
      )}
      <ProofSheet b={b} l={l} kind={proofKind} used={used} max={max} open={proof} onClose={() => setProof(false)} onSent={(msg) => { setStatus({ kind: proofKind, state: "saved" }); onLogged?.(msg); }} onPlain={() => mark(proofKind)} />
    </div>
  );
}
