/**
 * Console · Payments (NH-61). Cycle 1 is paid by EFT, in advance, per 30-day cycle. Jonathan sees the money in his own
 * bank, finds the open invoice here and taps "Payment received". The tap POSTs { invoice_reference } with his JWT to
 * W16 /billing/payment-received, which fires the same payment.received event every other rail fires (6.5 item 2).
 * No bank account details are shown or stored here; they are on Jonathan's own invoice.
 */
import { useCallback, useEffect, useState } from "react";
import ConsoleLayout from "./ConsoleLayout";
import { Button } from "@/components/ui/button";
import { N8N_BASE, errText, fmtDay, fmtZar, postWebhook, smcDb } from "@/lib/smc";

interface OpenInvoice { id: string; reference: string; tier_code: string; total_zar: number; issued_at: string; due_at: string | null }

export default function Payments() {
  const [rows, setRows] = useState<OpenInvoice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await smcDb.from("invoices_smc").select("id,reference,tier_code,total_zar,issued_at,due_at").eq("status", "issued").order("issued_at", { ascending: true });
    if (error) { setErr(errText(error)); return; }
    setErr(null);
    setRows((data ?? []) as OpenInvoice[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function received(r: OpenInvoice) {
    if (!window.confirm(`Mark ${r.reference} (${fmtZar(r.total_zar)}) as paid? This starts the broker's onboarding.`)) return;
    setBusy(r.reference); setMsg(null); setErr(null);
    const res = await postWebhook<{ ok?: boolean; message?: string }>("billing/payment-received", { invoice_reference: r.reference });
    setBusy(null);
    if (!res.ok) { setErr(res.error || "Could not mark it paid."); return; }
    setMsg(`${r.reference}: ${res.data?.message || "Marked paid."}`);
    void load();
  }

  return (
    <ConsoleLayout>
      <h1 className="mb-1 text-xl font-bold">Payments</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Open invoices. Payment is by EFT, in advance, per 30-day cycle. When you see it in your bank, tap Payment received.{!N8N_BASE && " Not connected yet (VITE_N8N_WEBHOOK_BASE)."}
      </p>
      {msg && <p className="mb-3 rounded-md border border-border bg-card p-3 text-sm" role="status">{msg}</p>}
      {err && <p className="mb-3 rounded-md border border-destructive p-3 text-sm text-destructive" role="alert">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open invoices.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="font-mono font-bold">{r.reference}</span>
              <span className="text-sm text-muted-foreground">{r.tier_code.replace("SMC_", "")} · {fmtZar(r.total_zar)} · issued {fmtDay(r.issued_at)}{r.due_at ? ` · due ${fmtDay(r.due_at)}` : ""}</span>
              <Button className="ml-auto" disabled={busy === r.reference} onClick={() => void received(r)}>{busy === r.reference ? "Marking…" : "Payment received"}</Button>
            </li>
          ))}
        </ul>
      )}
    </ConsoleLayout>
  );
}
