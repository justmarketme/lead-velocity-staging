/**
 * Cycle goal card (ux-sprint-1 R7 + R14 entry; Linear cycle graph target line, Pipedrive/HubSpot goals).
 * One component on Today, My leads and Reports, from one query (useCycle). "Delivered" = clause 5.2: the consumer
 * consented, self-declared the criteria and confirmed a booked appointment. Replacement leads never move the bar (7.4).
 * Prices and plan numbers come only from src/lib/pricing.ts.
 */
import { useState } from "react";
import { usePortal } from "./PortalShell";
import { Sheet } from "./MeetingParts";
import { addDays, errText, fmtDay, portalEvent } from "@/lib/smc";
import { TERMS, TOPUP, VAT_NOTE, zar } from "@/lib/pricing";
import { clampTopup, cyclePace, topupEarliestStart } from "@/lib/smcRules";
import { useCycle } from "@/lib/smcPortal";

export function TopUpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [qty, setQty] = useState(TOPUP.min_leads);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = new Date(topupEarliestStart(Date.now(), TOPUP.notice_days)).toISOString();
  async function send() {
    setBusy(true);
    // Written notice of a Top-Up (clause 9.2) through the support channel; Lead Velocity sends the invoice (9.3).
    const { error } = await portalEvent("support.message", "topup", { topic: "topup", note: `Top-up request: ${qty} leads (${zar(qty * TOPUP.price_per_lead_zar)} excl. VAT)`, qty, amount_excl_vat_zar: qty * TOPUP.price_per_lead_zar, earliest_start: start });
    setBusy(false);
    setSent(error ? `Not sent: ${errText(error)}. Please WhatsApp us instead.` : "Request sent. We'll send your invoice on WhatsApp and email. Delivery starts once it's paid and the notice period has passed.");
  }
  return (
    <Sheet open={open} onClose={onClose} title="Top up this cycle">
      <p className="muted" style={{ marginTop: 0 }}>Extra Qualified Leads at {zar(TOPUP.price_per_lead_zar)} each, minimum {TOPUP.min_leads}. Paid in advance.</p>
      <div className="stepper" role="group" aria-label="How many leads">
        <button type="button" aria-label="Fewer" disabled={qty <= TOPUP.min_leads} onClick={() => setQty(clampTopup(qty - 5, TOPUP.min_leads))}>−</button>
        <output aria-live="polite"><b>{qty}</b> leads</output>
        <button type="button" aria-label="More" onClick={() => setQty(clampTopup(qty + 5, TOPUP.min_leads))}>+</button>
      </div>
      <p className="total"><b>{zar(qty * TOPUP.price_per_lead_zar)}</b> <span className="small">{VAT_NOTE}</span></p>
      <p className="small">Starts {fmtDay(start)} at the earliest: we need {TOPUP.notice_days} days' notice to scale your campaigns, or later if payment clears after that. Same rules as your plan: rollover and goodwill replacements apply.</p>
      {sent ? <p className="next-slot" role="status"><span>✓</span><span>{sent}</span></p>
        : <button className="btn" type="button" disabled={busy} onClick={send}>{busy ? "Sending…" : `Request ${qty} more leads`}</button>}
    </Sheet>
  );
}

export default function CycleCard({ showRequests = true }: { showRequests?: boolean }) {
  const { broker } = usePortal();
  const { data, isLoading, error } = useCycle(broker.id);
  const [topup, setTopup] = useState(false);
  if (isLoading) return <section className="card cycle" aria-busy="true"><h3>Your cycle</h3><div className="sk" style={{ height: 40, width: "60%" }} /><div className="sk" style={{ height: 12, marginTop: 10 }} /></section>;
  if (error) return <section className="card cycle"><h3>Your cycle</h3><p className="muted">Couldn't load your cycle. Refresh the page to try again.</p></section>;
  const prog = data?.prog;
  if (!prog) return <section className="card cycle"><h3>Your cycle</h3><p className="muted">Your first lead will land here. We'll WhatsApp you the moment someone books.</p></section>;
  const ends = prog.extended_until || prog.ends_at;
  const pace = cyclePace({ delivered: data.delivered, committed: data.committed, startsAtMs: prog.starts_at ? Date.parse(prog.starts_at) : null, endsAtMs: prog.ends_at ? Date.parse(prog.ends_at) : null, nowMs: Date.now(), cycleDays: TERMS.cycle_days });
  const rolloverEnd = prog.ends_at ? addDays(prog.ends_at.slice(0, 10), TERMS.shortfall_rollover_days) + "T12:00:00Z" : null;
  const left = Math.max(0, data.committed - data.delivered);
  const line = {
    complete: "Committed leads delivered.",
    on_pace: `On pace. By today we aim for ${pace.expected}.`,
    behind: `Behind pace: ${pace.expected} expected by today. We're putting more behind your campaigns.`,
    ending_short: `Cycle ends ${fmtDay(ends)}. Any shortfall: we keep delivering for ${TERMS.shortfall_rollover_days} days at no extra cost, then it carries into your next paid cycle or is refunded.`,
    rollover: `Cycle ended. We're delivering the last ${left} at no extra cost${rolloverEnd ? ` until ${fmtDay(rolloverEnd)}` : ""}. Anything still owed carries into your next paid cycle or is refunded.`,
  }[pace.status];
  return (
    <section className={`card cycle${pace.status === "complete" ? " done" : ""}`} aria-labelledby="cyc-h">
      <h3 id="cyc-h">Your cycle</h3>
      <p className="big"><b>{data.delivered}</b> of {data.committed} <span>delivered</span></p>
      <div className="prog pace" role="img" aria-label={`${data.delivered} of ${data.committed} delivered. Pace for today: ${pace.expected}.`}>
        <i style={{ width: `${pace.deliveredPct}%` }} />
        {pace.status !== "complete" && pace.status !== "rollover" && <span className="tick" style={{ left: `${pace.pacePct}%` }} title={`Pace for today: ${pace.expected}`} />}
      </div>
      <p className={`status s-${pace.status}`}>{line}</p>
      <p className="small">Day {pace.day} of {pace.daysTotal}{ends ? ` · ${prog.status === "extended" ? "extended to" : "renews"} ${fmtDay(ends)}` : ""} · {prog.booked} booked · {prog.attended} met</p>
      {showRequests && <p className="small">No-show replacement requests this week: <b>{data.requestsThisWeek} of {data.weeklyMax}</b> (goodwill, resets Monday)</p>}
      {pace.status === "complete" && (
        <>
          <p className="small" style={{ marginBottom: 8 }}>Want more this cycle? Top up with {TOPUP.min_leads} or more.</p>
          <button className="btn" type="button" onClick={() => setTopup(true)}>Top up</button>
          <TopUpSheet open={topup} onClose={() => setTopup(false)} />
        </>
      )}
    </section>
  );
}
