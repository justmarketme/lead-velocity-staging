/**
 * Top-up panel (agreement clause 9) on Agreement and billing. Shown once this cycle's committed leads are delivered.
 * Quantity >= TOPUP.min_leads, total from the seed price, then requestTopup() (src/lib/topup.ts -> W16 /billing/topup):
 * manual EFT invoice with a unique reference (default), or Paystack when VITE_PAYSTACK_ENABLED.
 */
import { useEffect, useState } from "react";
import { PAYSTACK_ENABLED, fmtDay, smcDb } from "@/lib/smc";
import { TOPUP, VAT_NOTE, zar } from "@/lib/pricing";
import { clampTopupQty, requestTopup, topupEarliestStart, topupOpen, topupTotalZar, type TopupResult } from "@/lib/topup";

interface Progress { cycle_id: string; status: string; committed: number; verified: number }

export default function TopUpPanel({ brokerId }: { brokerId: string }) {
  const [prog, setProg] = useState<Progress | null>(null);
  const [qty, setQty] = useState<number>(TOPUP.min_leads);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TopupResult | null>(null);

  useEffect(() => {
    void smcDb.from("v_cycle_progress").select("cycle_id,status,committed,verified").eq("broker_id", brokerId).in("status", ["active", "extended"])
      .order("cycle_no", { ascending: false }).limit(1).then(({ data }) => setProg(((data as Progress[]) || [])[0] || null));
  }, [brokerId]);

  if (!prog) return null;
  const open = topupOpen(prog);

  async function buy(method: "manual_eft" | "instant_eft") {
    setBusy(true); setRes(null);
    const r = await requestTopup(qty, method);
    setBusy(false); setRes(r);
    if (r.ok && r.authorization_url) window.location.assign(r.authorization_url);
  }

  return (
    <section className="card" id="topup">
      <h2>Top up this cycle</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Extra Qualified Leads at {zar(TOPUP.price_per_lead_zar)} each, minimum {TOPUP.min_leads}, with {TOPUP.notice_days} days' notice. Paid in advance.
      </p>
      {!open ? (
        <p className="small">Top-ups open once this cycle's {prog.committed} leads are delivered ({prog.verified} so far).</p>
      ) : res?.ok ? (
        <p role="status">
          Invoice issued. Pay <b>{zar(res.total_zar ?? topupTotalZar(qty))}</b> by EFT using reference <b>{res.reference}</b>. Delivery starts{" "}
          {res.earliest_start ? fmtDay(res.earliest_start) : "after the notice period"} at the earliest, or once payment clears if later.
        </p>
      ) : (
        <>
          <label className="row" style={{ alignItems: "center", gap: 8 }}>
            <span>How many leads</span>
            <input type="number" inputMode="numeric" min={TOPUP.min_leads} step={1} value={qty} aria-label="How many leads"
              onChange={(e) => setQty(Number(e.target.value))} onBlur={() => setQty(clampTopupQty(qty))} style={{ width: 90 }} />
          </label>
          <p className="total"><b>{zar(topupTotalZar(qty))}</b> <span className="small">{VAT_NOTE}</span></p>
          <p className="small">Starts {fmtDay(topupEarliestStart().toISOString())} at the earliest. Same rules as your plan.</p>
          {PAYSTACK_ENABLED && <button className="btn" type="button" disabled={busy || qty < TOPUP.min_leads} onClick={() => void buy("instant_eft")}>Pay by Instant EFT</button>}
          <button className={PAYSTACK_ENABLED ? "btn ghost" : "btn"} type="button" disabled={busy || qty < TOPUP.min_leads} onClick={() => void buy("manual_eft")}>
            {busy ? "Issuing…" : `Get EFT invoice for ${clampTopupQty(qty)} leads`}
          </button>
          {res && !res.ok && <p className="err" role="alert">{res.message}</p>}
        </>
      )}
    </section>
  );
}
