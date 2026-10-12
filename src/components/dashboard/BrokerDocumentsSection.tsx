/**
 * Admin broker drawer: this broker's documents (admin_documents.broker_id), signed contracts first, with View / Download
 * through short-lived signed URLs and an upload for further signed documents. The broker sees the same rows in his portal.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Eye, FileSignature, FileText, Loader2, Upload } from "lucide-react";
import { format } from "date-fns";
import { ALL_PLANS, zar } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { BrokerDocument, DOC_KINDS, docKindLabel, downloadAdminDocument, loadBrokerDocuments, openAdminDocument, uploadBrokerDocument } from "@/lib/adminDocs";

interface OpenOrder { id: string; title: string | null; amount_zar: number | null; status: string }

export default function BrokerDocumentsSection({ brokerId, brokerLabel, onPaid }: { brokerId: string; brokerLabel: string; onPaid?: () => void }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<BrokerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("signed_agreement");
  const [name, setName] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [plan, setPlan] = useState("");
  // proof of payment
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [orderId, setOrderId] = useState("none");
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await loadBrokerDocuments(brokerId);
    setDocs(r.docs); setLoadError(r.error || null); setLoading(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = await (supabase as any).from("lead_orders").select("id, title, amount_zar, status").eq("broker_id", brokerId).neq("status", "paid").order("created_at", { ascending: false });
    setOpenOrders((o.data || []) as OpenOrder[]);
  }, [brokerId]);
  useEffect(() => { void load(); setOpen(false); }, [load]);

  const signed = kind === "signed_agreement";
  const pop = kind === "proof_of_payment";
  async function upload() {
    // Messages show inline: a toast renders behind this drawer and was invisible.
    setFormError(null);
    if (!file) return setFormError("Choose the file first.");
    if (!name.trim()) return setFormError("Give the document a name.");
    if (signed && (!signedBy.trim() || !signedAt || !plan)) return setFormError("A signed agreement needs the plan, who signed it and the signed date.");
    const amountZar = Math.round(Number(amount.replace(/[^\d.]/g, "")));
    if (pop && !signedAt) return setFormError("Add the date it was paid.");
    if (pop && !(amountZar > 0)) return setFormError("Add the amount paid (in rand).");
    setBusy(true);
    const r = await uploadBrokerDocument({
      brokerId, file, name: name.trim(), kind, plan: signed ? plan : null,
      signedBy: pop ? null : signedBy.trim() || null,
      signedAt: !pop && signedAt ? new Date(`${signedAt}T12:00:00`).toISOString() : null,
      contentData: pop ? { amount_zar: amountZar, paid_on: signedAt, reference: reference.trim() || null, order_id: orderId !== "none" ? orderId : null } : null,
    });
    if (!r.ok) { setBusy(false); return setFormError(`Upload failed: ${r.error || "unknown error"}`); }
    // An order exists: mark it paid through the existing flow (admin_mark_order_paid). Otherwise the proof itself is the payment record.
    if (pop && orderId !== "none") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = await (supabase as any).rpc("admin_mark_order_paid", { p_order_id: orderId });
      if (m.error) setFormError(`Proof saved, but the order wasn't marked paid: ${m.error.message}`);
    }
    setBusy(false);
    toast({ title: pop ? "Payment recorded" : "Document added", description: pop ? `${brokerLabel}'s portal now shows the payment as received.` : `${brokerLabel} now sees it in his portal.` });
    setFile(null); setName(""); setSignedBy(""); setSignedAt(""); setPlan(""); setAmount(""); setReference(""); setOrderId("none"); setOpen(false);
    void load();
    if (pop) onPaid?.();
  }

  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) toast({ title: "Could not open the document", description: r.error, variant: "destructive" }); };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileSignature className="h-4 w-4 text-primary" /> Documents</h3>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}><Upload className="mr-1 h-3.5 w-3.5" /> {open ? "Cancel" : "Upload"}</Button>
      </div>

      {open && (
        <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 space-y-3 mb-3">
          <div className="space-y-1">
            <Label htmlFor="bd-file" className="text-xs">File (PDF)</Label>
            <Input id="bd-file" type="file" accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !name) setName(f.name.replace(/\.[^.]+$/, "")); }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[130]">{DOC_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bd-date" className="text-xs">{pop ? "Date paid" : `Signed on${signed ? "" : " (optional)"}`}</Label>
              <Input id="bd-date" type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
            </div>
          </div>
          {signed && (
            <div className="space-y-1">
              <Label className="text-xs">Plan in this agreement (drives the plan the broker sees)</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger><SelectValue placeholder="Choose the plan" /></SelectTrigger>
                <SelectContent className="z-[130]">{ALL_PLANS.map((p) => <SelectItem key={p.tier_code} value={p.name}>{p.name}: {p.committed_leads} leads / cycle</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {pop && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="bd-amt" className="text-xs">Amount (R)</Label>
                  <Input id="bd-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="16500" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bd-ref" className="text-xs">Payment reference (optional)</Label>
                  <Input id="bd-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="EFT / Paystack reference" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Order this pays</Label>
                <Select value={orderId} onValueChange={setOrderId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[130]">
                    <SelectItem value="none">No order: record the payment on this document</SelectItem>
                    {openOrders.map((o) => <SelectItem key={o.id} value={o.id}>{o.title || "Lead order"}{o.amount_zar ? ` · ${zar(o.amount_zar)}` : ""} ({o.status})</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Choosing an order marks it paid (same as Orders & Activity). The broker's checklist shows "Paid on" with this proof either way.</p>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="bd-name" className="text-xs">Name the broker sees</Label>
            <Input id="bd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead Generation Services Agreement — signed" />
          </div>
          {!pop && (
            <div className="space-y-1">
              <Label htmlFor="bd-by" className="text-xs">Signed by{signed ? "" : " (optional)"}</Label>
              <Input id="bd-by" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Client name (Client); Kgomotso Pule, Director (Lead Velocity)" />
            </div>
          )}
          {formError && <p role="alert" className="text-xs text-red-400">{formError}</p>}
          <Button size="sm" onClick={upload} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}{busy ? "Uploading…" : "Upload document"}</Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : loadError ? (
        <p className="text-sm text-muted-foreground">Documents unavailable: {loadError}</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents for this broker yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3 flex items-start justify-between gap-2">
              <div className="min-w-0 flex gap-2">
                {d.kind === "signed_agreement" ? <FileSignature className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" /> : <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.kind === "proof_of_payment"
                      ? [d.content_data?.paid_on ? `Paid ${format(new Date(String(d.content_data.paid_on)), "d MMM yyyy")}` : null,
                         typeof d.content_data?.amount_zar === "number" ? zar(d.content_data.amount_zar as number) : null,
                         d.content_data?.reference ? `ref ${d.content_data.reference}` : null].filter(Boolean).join(" · ")
                      : <>{d.signed_at ? `Signed ${format(new Date(d.signed_at), "d MMM yyyy")}` : `Added ${format(new Date(d.created_at), "d MMM yyyy")}`}{d.signed_by ? ` · ${d.signed_by}` : ""}</>}
                  </p>
                  <Badge variant="outline" className="mt-1 text-[10px]">{docKindLabel(d.kind)}</Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-8 px-2" title="View" onClick={async () => fail(await openAdminDocument(d.file_path))}><Eye className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" title="Download" onClick={async () => fail(await downloadAdminDocument(d.file_path, d.file_path.split("/").pop() || "document.pdf"))}><Download className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
